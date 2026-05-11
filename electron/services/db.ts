import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { logger } from '../logger';
import { paths } from '../paths';
import type {
  BotConfig,
  Conversation,
  CreateKeywordArgs,
  CreateRuleArgs,
  CreateScheduledArgs,
  Keyword,
  Message,
  MessageDirection,
  MessageSender,
  MessageStatus,
  Rule,
  ScheduledMessage,
  ScheduledStatus,
  UpdateBotConfigArgs,
  UpdateKeywordArgs,
  UpdateRuleArgs,
  UpdateScheduledArgs,
} from '../../shared/types';

let dbInstance: Database.Database | null = null;

function getMigrationFiles(): { name: string; path: string }[] {
  // Compiled location: dist-electron/electron/services/db.js
  // Dev: source SQL lives at <root>/electron/migrations
  // Prod: shipped via electron-builder extraResources -> process.resourcesPath/migrations
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'electron', 'migrations'),
    path.join(process.resourcesPath || '', 'migrations'),
    path.join(__dirname, '..', 'migrations'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      return files.map((f) => ({ name: f, path: path.join(dir, f) }));
    }
  }

  logger.warn('No migrations directory found. Tried:', candidates);
  return [];
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r: any) => r.name as string)
  );

  const migrations = getMigrationFiles();
  const insertApplied = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const sql = fs.readFileSync(m.path, 'utf-8');
    logger.info(`Applying migration: ${m.name}`);
    const tx = db.transaction(() => {
      db.exec(sql);
      insertApplied.run(m.name, Date.now());
    });
    tx();
  }
}

export function initDb(): Database.Database {
  if (dbInstance) return dbInstance;

  paths.logs(); // ensure logs dir exists

  const dbPath = paths.db();
  logger.info('Opening database', { dbPath });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  runMigrations(db);

  dbInstance = db;
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) return initDb();
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────────────────────────────────────

export function upsertConversation(input: {
  id: string;
  contact_name?: string | null;
  contact_phone: string;
  timestamp: number;
}): Conversation {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM conversations WHERE id = ?').get(input.id) as
    | Conversation
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE conversations
         SET last_message_at = ?,
             contact_name = COALESCE(?, contact_name)
       WHERE id = ?`
    ).run(input.timestamp, input.contact_name ?? null, input.id);
  } else {
    db.prepare(
      `INSERT INTO conversations
         (id, contact_name, contact_phone, last_message_at, unread_count, bot_enabled, escalated, created_at)
       VALUES (?, ?, ?, ?, 0, 1, 0, ?)`
    ).run(
      input.id,
      input.contact_name ?? null,
      input.contact_phone,
      input.timestamp,
      input.timestamp
    );
  }

  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(input.id) as Conversation;
}

export function listConversations(): (Conversation & { last_message_preview: string })[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*,
              (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_message_preview
         FROM conversations c
         ORDER BY c.last_message_at DESC`
    )
    .all() as (Conversation & { last_message_preview: string })[];
  return rows;
}

export function getConversation(id: string): Conversation | undefined {
  return getDb()
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as Conversation | undefined;
}

export function setBotEnabled(conversationId: string, enabled: boolean) {
  getDb()
    .prepare('UPDATE conversations SET bot_enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, conversationId);
}

export function setEscalated(conversationId: string, reason: string | null) {
  getDb()
    .prepare(
      `UPDATE conversations
          SET escalated = ?, escalated_reason = ?, bot_enabled = ?
        WHERE id = ?`
    )
    .run(reason ? 1 : 0, reason, reason ? 0 : 1, conversationId);
}

export function bumpUnread(conversationId: string) {
  getDb()
    .prepare('UPDATE conversations SET unread_count = unread_count + 1 WHERE id = ?')
    .run(conversationId);
}

export function markRead(conversationId: string) {
  getDb()
    .prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?')
    .run(conversationId);
}

// ──────────────────────────────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────────────────────────────

export function insertMessage(input: {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender: MessageSender;
  body: string;
  media_type?: Message['media_type'];
  media_path?: string | null;
  timestamp: number;
  status?: MessageStatus;
}): Message {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO messages
       (id, conversation_id, direction, sender, body, media_type, media_path, timestamp, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.conversation_id,
    input.direction,
    input.sender,
    input.body,
    input.media_type ?? null,
    input.media_path ?? null,
    input.timestamp,
    input.status ?? 'sent'
  );

  return db.prepare('SELECT * FROM messages WHERE id = ?').get(input.id) as Message;
}

export function getMessages(
  conversationId: string,
  limit = 50,
  beforeTimestamp?: number
): Message[] {
  const db = getDb();
  if (beforeTimestamp) {
    return db
      .prepare(
        `SELECT * FROM messages
          WHERE conversation_id = ? AND timestamp < ?
          ORDER BY timestamp DESC LIMIT ?`
      )
      .all(conversationId, beforeTimestamp, limit) as Message[];
  }
  return db
    .prepare(
      `SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY timestamp DESC LIMIT ?`
    )
    .all(conversationId, limit) as Message[];
}

export function getRecentMessagesAsc(conversationId: string, limit: number): Message[] {
  const rows = getMessages(conversationId, limit);
  return rows.slice().reverse();
}

export function updateMessageStatus(id: string, status: MessageStatus) {
  getDb().prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id);
}

// ──────────────────────────────────────────────────────────────────────────
// Bot config
// ──────────────────────────────────────────────────────────────────────────

export function getBotConfig(): BotConfig {
  return getDb().prepare('SELECT * FROM bot_config WHERE id = 1').get() as BotConfig;
}

export function updateBotConfig(patch: UpdateBotConfigArgs): BotConfig {
  const db = getDb();
  const current = getBotConfig();
  const merged: BotConfig = { ...current, ...patch, updated_at: Date.now(), id: 1 };

  db.prepare(
    `UPDATE bot_config SET
       system_prompt = ?,
       business_context = ?,
       model_name = ?,
       temperature = ?,
       max_context_messages = ?,
       global_enabled = ?,
       response_delay_ms = ?,
       bot_name = ?,
       tone = ?,
       updated_at = ?
     WHERE id = 1`
  ).run(
    merged.system_prompt,
    merged.business_context,
    merged.model_name,
    merged.temperature,
    merged.max_context_messages,
    merged.global_enabled,
    merged.response_delay_ms,
    merged.bot_name ?? 'ZapBot',
    merged.tone ?? 'casual',
    merged.updated_at
  );

  return getBotConfig();
}

// ──────────────────────────────────────────────────────────────────────────
// Rules
// ──────────────────────────────────────────────────────────────────────────

export function listRules(): Rule[] {
  return getDb()
    .prepare('SELECT * FROM rules ORDER BY priority DESC, id ASC')
    .all() as Rule[];
}

export function listEnabledRules(): Rule[] {
  return getDb()
    .prepare('SELECT * FROM rules WHERE enabled = 1 ORDER BY priority DESC, id ASC')
    .all() as Rule[];
}

export function createRule(input: CreateRuleArgs): Rule {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO rules (title, content, priority, enabled) VALUES (?, ?, ?, ?)')
    .run(input.title, input.content, input.priority ?? 0, input.enabled === false ? 0 : 1);
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(result.lastInsertRowid) as Rule;
}

export function updateRule(input: UpdateRuleArgs): Rule {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(input.id) as Rule;
  if (!existing) throw new Error(`Rule ${input.id} not found`);
  db.prepare(
    'UPDATE rules SET title = ?, content = ?, priority = ?, enabled = ? WHERE id = ?'
  ).run(
    input.title ?? existing.title,
    input.content ?? existing.content,
    input.priority ?? existing.priority,
    input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
    input.id
  );
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(input.id) as Rule;
}

export function deleteRule(id: number) {
  getDb().prepare('DELETE FROM rules WHERE id = ?').run(id);
}

export function reorderRules(orderedIds: number[]) {
  const db = getDb();
  const stmt = db.prepare('UPDATE rules SET priority = ? WHERE id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => {
      stmt.run(orderedIds.length - idx, id);
    });
  });
  tx();
}

// ──────────────────────────────────────────────────────────────────────────
// Keywords
// ──────────────────────────────────────────────────────────────────────────

export function listKeywords(): Keyword[] {
  return getDb().prepare('SELECT * FROM keywords ORDER BY id ASC').all() as Keyword[];
}

export function listEnabledKeywords(): Keyword[] {
  return getDb()
    .prepare('SELECT * FROM keywords WHERE enabled = 1 ORDER BY id ASC')
    .all() as Keyword[];
}

export function createKeyword(input: CreateKeywordArgs): Keyword {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO keywords (pattern, is_regex, action, response_template, enabled)
       VALUES (?, ?, 'escalate', ?, ?)`
    )
    .run(
      input.pattern,
      input.is_regex ? 1 : 0,
      input.response_template ?? null,
      input.enabled === false ? 0 : 1
    );
  return db.prepare('SELECT * FROM keywords WHERE id = ?').get(result.lastInsertRowid) as Keyword;
}

export function updateKeyword(input: UpdateKeywordArgs): Keyword {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM keywords WHERE id = ?').get(input.id) as Keyword;
  if (!existing) throw new Error(`Keyword ${input.id} not found`);
  db.prepare(
    `UPDATE keywords SET pattern = ?, is_regex = ?, response_template = ?, enabled = ? WHERE id = ?`
  ).run(
    input.pattern ?? existing.pattern,
    input.is_regex === undefined ? existing.is_regex : input.is_regex ? 1 : 0,
    input.response_template === undefined ? existing.response_template : input.response_template,
    input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
    input.id
  );
  return db.prepare('SELECT * FROM keywords WHERE id = ?').get(input.id) as Keyword;
}

export function deleteKeyword(id: number) {
  getDb().prepare('DELETE FROM keywords WHERE id = ?').run(id);
}

// ──────────────────────────────────────────────────────────────────────────
// Scheduled messages
// ──────────────────────────────────────────────────────────────────────────

export function listScheduled(): ScheduledMessage[] {
  return getDb()
    .prepare('SELECT * FROM scheduled_messages ORDER BY scheduled_for ASC')
    .all() as ScheduledMessage[];
}

export function getDueScheduled(now: number): ScheduledMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM scheduled_messages
        WHERE status = 'pending' AND scheduled_for <= ?
        ORDER BY scheduled_for ASC
        LIMIT 50`
    )
    .all(now) as ScheduledMessage[];
}

export function createScheduled(input: CreateScheduledArgs): ScheduledMessage {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO scheduled_messages
         (phone, body, scheduled_for, recurrence, weekdays, status, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`
    )
    .run(
      input.phone,
      input.body,
      input.scheduled_for,
      input.recurrence ?? null,
      input.weekdays ?? null,
      Date.now()
    );
  return db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(result.lastInsertRowid) as ScheduledMessage;
}

export function updateScheduled(input: UpdateScheduledArgs): ScheduledMessage {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(input.id) as ScheduledMessage;
  if (!existing) throw new Error(`Scheduled ${input.id} not found`);
  db.prepare(
    `UPDATE scheduled_messages
        SET phone = ?, body = ?, scheduled_for = ?, recurrence = ?, weekdays = ?, status = ?
      WHERE id = ?`
  ).run(
    input.phone ?? existing.phone,
    input.body ?? existing.body,
    input.scheduled_for ?? existing.scheduled_for,
    input.recurrence === undefined ? existing.recurrence : input.recurrence,
    input.weekdays === undefined ? existing.weekdays : input.weekdays,
    input.status ?? existing.status,
    input.id
  );
  return db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(input.id) as ScheduledMessage;
}

export function setScheduledStatus(
  id: number,
  status: ScheduledStatus,
  lastError?: string | null,
  bumpAttempt = false
) {
  const db = getDb();
  if (bumpAttempt) {
    db.prepare(
      `UPDATE scheduled_messages
          SET status = ?, last_error = ?, attempts = attempts + 1
        WHERE id = ?`
    ).run(status, lastError ?? null, id);
  } else {
    db.prepare(
      `UPDATE scheduled_messages SET status = ?, last_error = ? WHERE id = ?`
    ).run(status, lastError ?? null, id);
  }
}

export function rescheduleNext(id: number, nextTimestamp: number) {
  getDb()
    .prepare(
      `UPDATE scheduled_messages
          SET scheduled_for = ?, status = 'pending', attempts = 0, last_error = NULL
        WHERE id = ?`
    )
    .run(nextTimestamp, id);
}

export function deleteScheduled(id: number) {
  getDb().prepare('DELETE FROM scheduled_messages WHERE id = ?').run(id);
}

// Quit hook
if (typeof app !== 'undefined') {
  app.on('will-quit', () => closeDb());
}
