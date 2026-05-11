import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { logger } from '../logger';
import { paths } from '../paths';
import {
  bumpUnread,
  getBotConfig,
  getConversation,
  insertMessage,
  setEscalated,
  upsertConversation,
} from './db';
import { findMatch, invalidateKeywordCache } from './keyword-matcher';
import { generateReply, ensureModelAvailable } from './llm';
import type { ConnectionStatus, Message } from '../../shared/types';

// Baileys is published as an ESM-only package. Our electron main runs CommonJS
// (tsconfig: module=CommonJS), and TypeScript would otherwise rewrite
// `await import(...)` into `require(...)`, which fails with ERR_REQUIRE_ESM.
// We use `new Function` to hide the import from the TS transpiler so it survives
// as a true dynamic import at runtime.
type WASocket = any;

const dynamicImport = new Function('m', 'return import(m)') as <T = any>(m: string) => Promise<T>;

let baileysModule: any = null;

async function loadBaileys() {
  if (baileysModule) return baileysModule;
  baileysModule = await dynamicImport('@whiskeysockets/baileys');
  return baileysModule;
}

interface WhatsAppEvents {
  status: (status: ConnectionStatus) => void;
  qr: (qrDataUrl: string) => void;
  'message-new': (msg: Message) => void;
  'message-updated': (msg: Pick<Message, 'id' | 'status'>) => void;
  'conversation-updated': (conversationId: string) => void;
}

export class WhatsAppService extends EventEmitter {
  private sock: WASocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private currentQr: string | null = null;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  /**
   * Dedupe set of incoming message IDs processed by the reply pipeline.
   * Baileys can fire `messages.upsert` more than once for the same message
   * (e.g. notify followed by an append/sync chunk), which previously caused
   * the bot to answer twice. Bounded to 1000 entries — older keys drop.
   */
  private processedMessageIds = new Set<string>();

  /**
   * Per-conversation reply lock. If a reply is already being generated for a
   * jid, any further inbound message on that jid is ignored until the current
   * generation finishes. Prevents 2x/4x replies when Baileys re-delivers the
   * same message under different keys (`@lid` vs `@s.whatsapp.net`, retries,
   * multi-device sync).
   */
  private replyingFor = new Set<string>();

  on<E extends keyof WhatsAppEvents>(event: E, listener: WhatsAppEvents[E]): this {
    return super.on(event, listener as any);
  }
  emit<E extends keyof WhatsAppEvents>(event: E, ...args: Parameters<WhatsAppEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  getStatus() {
    return { status: this.status, qr: this.currentQr };
  }

  isOpen() {
    return this.status === 'open' && this.sock !== null;
  }

  async start() {
    this.isShuttingDown = false;
    await this.connect();
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    if (s !== 'qr') this.currentQr = null;
    this.emit('status', s);
  }

  private async connect() {
    const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
      await loadBaileys();

    const authDir = paths.baileysAuth();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    this.setStatus('connecting');

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // Pull historical chats so the inbox isn't empty on first login.
      // History arrives via `messaging-history.set` and does NOT trigger
      // auto-replies (the reply pipeline only fires on `messages.upsert`).
      syncFullHistory: true,
      browser: ['ZapBot', 'Desktop', '1.0.0'],
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
          this.currentQr = dataUrl;
          this.setStatus('qr');
          this.emit('qr', dataUrl);
        } catch (e) {
          logger.error('Failed to render QR', e);
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.setStatus('open');
        logger.info('WhatsApp connected');
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason?.loggedOut;
        logger.warn('WhatsApp connection closed', { code, loggedOut });

        if (loggedOut) {
          this.setStatus('logged_out');
          // Clear auth so next start triggers a fresh QR
          try {
            fs.rmSync(paths.baileysAuth(), { recursive: true, force: true });
          } catch (e) {
            logger.warn('Failed to clear auth dir', e);
          }
          return;
        }

        if (!this.isShuttingDown) {
          this.reconnectAttempts++;
          const delay = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts));
          logger.info('Reconnecting in', delay, 'ms');
          setTimeout(() => this.connect().catch((e) => logger.error('Reconnect failed', e)), delay);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async (upsert: any) => {
      // Only real-time incoming messages — 'append' is for outbound sync
      // from another device (already filtered by `msg.key.fromMe`).
      if (upsert.type !== 'notify') return;
      for (const msg of upsert.messages ?? []) {
        const id: string | undefined = msg?.key?.id;
        if (id && this.processedMessageIds.has(id)) {
          logger.debug('Skipping duplicate message.upsert', { id });
          continue;
        }
        if (id) {
          this.processedMessageIds.add(id);
          // Bound the set so it doesn't grow forever.
          if (this.processedMessageIds.size > 1000) {
            const it = this.processedMessageIds.values().next();
            if (!it.done) this.processedMessageIds.delete(it.value);
          }
        }
        try {
          await this.handleIncoming(msg);
        } catch (e) {
          logger.error('Error handling incoming message', e);
        }
      }
    });

    this.sock.ev.on('messages.update', (updates: any[]) => {
      for (const u of updates) {
        if (u.update?.status !== undefined) {
          // status codes from Baileys: 1=ERROR 2=PENDING 3=SERVER_ACK 4=DELIVERY_ACK 5=READ 6=PLAYED
          const status =
            u.update.status >= 5 ? 'read' : u.update.status === 4 ? 'delivered' : 'sent';
          this.emit('message-updated', { id: u.key.id, status: status as any });
        }
      }
    });

    // Bulk history sync. Fires once (or in chunks) after `syncFullHistory: true`.
    // Imports chats and messages without triggering the auto-reply pipeline.
    this.sock.ev.on('messaging-history.set', (data: any) => {
      try {
        this.ingestHistory(data);
      } catch (e) {
        logger.error('Failed to ingest history', e);
      }
    });
  }

  /**
   * Insert historical chats and messages from `messaging-history.set` into the DB.
   * Skips group chats and broadcasts, mirrors `handleIncoming` minus the reply step.
   */
  private ingestHistory(data: {
    chats?: any[];
    messages?: any[];
    contacts?: any[];
    syncType?: number;
    isLatest?: boolean;
  }) {
    const chats = data.chats ?? [];
    const messages = data.messages ?? [];
    const contacts = data.contacts ?? [];

    // Build a quick contact-name lookup
    const nameByJid = new Map<string, string>();
    for (const c of contacts) {
      if (c.id && (c.name || c.notify || c.verifiedName)) {
        nameByJid.set(c.id, c.name ?? c.notify ?? c.verifiedName);
      }
    }

    let chatsImported = 0;
    for (const chat of chats) {
      const jid: string | undefined = chat.id;
      if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
      if (!jid.endsWith('@s.whatsapp.net')) continue;

      const phone = jid.split('@')[0];
      const ts = Number(chat.conversationTimestamp ?? 0) * 1000 || Date.now();
      upsertConversation({
        id: jid,
        contact_name: nameByJid.get(jid) ?? chat.name ?? null,
        contact_phone: phone,
        timestamp: ts,
      });
      chatsImported++;
    }

    let messagesImported = 0;
    for (const msg of messages) {
      const jid: string | undefined = msg.key?.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
      if (!jid.endsWith('@s.whatsapp.net')) continue;
      if (!msg.message) continue; // ignore protocol-only entries

      // Same filter as live messages — drop reactions, protocol, polls, etc.
      const content = this.extractContent(msg.message);
      if (!content) continue;
      const { body, mediaType } = content;

      const ts =
        typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp * 1000
          : Number(msg.messageTimestamp) * 1000;
      const isOut = !!msg.key.fromMe;

      // Make sure the conversation row exists (history may include chats not in `chats` list)
      const phone = jid.split('@')[0];
      upsertConversation({
        id: jid,
        contact_name: nameByJid.get(jid) ?? msg.pushName ?? null,
        contact_phone: phone,
        timestamp: ts,
      });

      insertMessage({
        id: msg.key.id,
        conversation_id: jid,
        direction: isOut ? 'out' : 'in',
        sender: isOut ? 'human' : 'contact',
        body,
        media_type: mediaType,
        timestamp: ts,
        status: 'sent',
      });
      messagesImported++;
    }

    logger.info('History sync chunk', {
      chats: chatsImported,
      messages: messagesImported,
      isLatest: data.isLatest,
    });

    // Tell the renderer to refresh the conversation list
    if (chatsImported > 0 || messagesImported > 0) {
      this.emit('conversation-updated', '*');
    }
  }

  /**
   * Try to extract real, user-visible content from a Baileys message envelope.
   * Returns null for events we should ignore entirely:
   *  - reactions (emoji on another msg)
   *  - protocol messages (edits, deletes, key rotations)
   *  - poll updates (someone voted on a poll)
   *  - sender-key distribution (E2E key exchange)
   *  - empty / metadata-only envelopes
   *
   * Returns the actual content for text, image, audio, video, document.
   */
  private extractContent(
    rawMessage: any
  ): { body: string; mediaType: Message['media_type'] } | null {
    if (!rawMessage) return null;

    // Unwrap ephemeral / view-once / device-sent wrappers so we can read the inner content
    let m = rawMessage;
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    if (m.deviceSentMessage?.message) m = m.deviceSentMessage.message;

    // Things we deliberately ignore (no user-visible content)
    if (m.reactionMessage) return null;
    if (m.protocolMessage) return null;
    if (m.senderKeyDistributionMessage && !m.conversation && !m.extendedTextMessage) return null;
    if (m.pollUpdateMessage) return null;
    if (m.messageContextInfo && Object.keys(m).length === 1) return null;
    if (m.stickerMessage) return null; // v1: ignore stickers — no auto-reply makes sense

    if (m.conversation) return { body: m.conversation, mediaType: null };
    if (m.extendedTextMessage?.text)
      return { body: m.extendedTextMessage.text, mediaType: null };
    if (m.imageMessage)
      return { body: m.imageMessage.caption ?? '[Imagem]', mediaType: 'image' };
    if (m.audioMessage) return { body: '[Áudio]', mediaType: 'audio' };
    if (m.videoMessage)
      return { body: m.videoMessage.caption ?? '[Vídeo]', mediaType: 'video' };
    if (m.documentMessage)
      return { body: m.documentMessage.fileName ?? '[Documento]', mediaType: 'document' };

    // Unknown — log so we can extend later, but don't surface as a phantom message.
    logger.debug('Ignored unknown message type', { keys: Object.keys(m).slice(0, 5) });
    return null;
  }

  private async handleIncoming(msg: any) {
    // Skip our own messages and broadcast lists
    if (msg.key.fromMe) return;
    if (msg.key.remoteJid?.endsWith('@broadcast')) return;
    if (msg.key.remoteJid?.endsWith('@g.us')) {
      // v1: ignore groups
      return;
    }

    // Filter out reactions, edits, key exchanges, poll votes, etc.
    const content = this.extractContent(msg.message);
    if (!content) return;

    const jid: string = msg.key.remoteJid;
    const phone = jid.split('@')[0];
    const contactName = msg.pushName ?? null;
    const timestamp =
      typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp * 1000
        : Number(msg.messageTimestamp) * 1000;

    upsertConversation({
      id: jid,
      contact_name: contactName,
      contact_phone: phone,
      timestamp,
    });

    const stored = insertMessage({
      id: msg.key.id,
      conversation_id: jid,
      direction: 'in',
      sender: 'contact',
      body: content.body,
      media_type: content.mediaType,
      media_path: null,
      timestamp,
      status: 'sent',
    });

    bumpUnread(jid);
    this.emit('message-new', stored);
    this.emit('conversation-updated', jid);

    // Pipeline
    await this.maybeReply(jid, content.body, content.mediaType);
  }

  private async maybeReply(jid: string, incomingBody: string, mediaType: Message['media_type']) {
    const cfg = getBotConfig();
    const conv = getConversation(jid);

    if (!conv) return;
    if (!conv.bot_enabled) return;
    if (!cfg.global_enabled) return;

    // V1 policy: tell user we can't process media (except images with caption)
    if (mediaType === 'audio' || mediaType === 'video' || mediaType === 'document') {
      await this.send(jid, 'Por enquanto consigo responder apenas mensagens de texto. Pode escrever?', 'bot');
      return;
    }

    // Keyword escalation
    const match = findMatch(incomingBody);
    if (match) {
      logger.info('Keyword escalation triggered', { jid, pattern: match.keyword.pattern });
      setEscalated(jid, `Palavra-chave: ${match.keyword.pattern}`);
      if (match.keyword.response_template) {
        await this.send(jid, match.keyword.response_template, 'bot');
      }
      this.emit('conversation-updated', jid);
      return;
    }

    // Per-conversation lock — if we're already generating a reply for this
    // jid, drop the new trigger. Catches duplicate upserts that survive the
    // ID dedup (e.g. same message redelivered under @lid and @s.whatsapp.net).
    if (this.replyingFor.has(jid)) {
      logger.debug('Reply already in flight, skipping duplicate trigger', { jid });
      return;
    }
    this.replyingFor.add(jid);

    try {
      // Make sure model is available before attempting
      const hasModel = await ensureModelAvailable().catch(() => false);
      if (!hasModel) {
        logger.warn('Model not available, skipping auto-reply', { jid });
        return;
      }

      // Humanized delay with jitter
      const base = cfg.response_delay_ms;
      const jitter = Math.floor(base * (Math.random() * 0.6 - 0.3));
      const delay = Math.max(500, base + jitter);
      await new Promise((r) => setTimeout(r, delay));

      // Show "typing..."
      try {
        await this.sock?.sendPresenceUpdate('composing', jid);
      } catch (e) {
        logger.warn('Failed to send presence', e);
      }

      let reply: string;
      try {
        reply = await generateReply(jid);
      } catch (e) {
        logger.error('LLM failed', e);
        try {
          await this.sock?.sendPresenceUpdate('paused', jid);
        } catch {}
        return;
      }

      try {
        await this.sock?.sendPresenceUpdate('paused', jid);
      } catch {}

      await this.send(jid, reply, 'bot');
    } finally {
      this.replyingFor.delete(jid);
    }
  }

  /**
   * Send a text message. Persists in DB and emits events.
   */
  async send(jid: string, body: string, sender: 'bot' | 'human' | 'scheduled' = 'bot'): Promise<Message> {
    if (!this.sock || !this.isOpen()) {
      throw new Error('WhatsApp not connected');
    }

    const res = await this.sock.sendMessage(jid, { text: body });
    const id = res?.key?.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = Date.now();

    const phone = jid.split('@')[0];
    upsertConversation({ id: jid, contact_phone: phone, timestamp });

    const stored = insertMessage({
      id,
      conversation_id: jid,
      direction: 'out',
      sender,
      body,
      timestamp,
      status: 'sent',
    });

    this.emit('message-new', stored);
    this.emit('conversation-updated', jid);
    return stored;
  }

  /**
   * Send to a raw phone number (E.164 without +).
   * Resolves jid via WhatsApp on-net check.
   */
  async sendToPhone(phoneE164: string, body: string, sender: 'human' | 'scheduled' = 'scheduled') {
    if (!this.sock || !this.isOpen()) throw new Error('WhatsApp not connected');
    const cleaned = phoneE164.replace(/\D/g, '');
    const jid = `${cleaned}@s.whatsapp.net`;
    return this.send(jid, body, sender);
  }

  async logout() {
    try {
      await this.sock?.logout();
    } catch (e) {
      logger.warn('Logout error', e);
    }
    this.sock = null;
    this.setStatus('disconnected');

    try {
      fs.rmSync(paths.baileysAuth(), { recursive: true, force: true });
    } catch (e) {
      logger.warn('Failed to clear auth dir', e);
    }
  }

  async stop() {
    this.isShuttingDown = true;
    try {
      await this.sock?.end?.(undefined);
    } catch (e) {
      logger.warn('Error closing socket', e);
    }
    this.sock = null;
    this.setStatus('disconnected');
  }
}

export const whatsapp = new WhatsAppService();

// Re-export for keyword reload hook
export { invalidateKeywordCache };
