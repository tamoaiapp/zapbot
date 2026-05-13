CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  contact_name TEXT,
  contact_phone TEXT NOT NULL,
  last_message_at INTEGER NOT NULL,
  unread_count INTEGER DEFAULT 0,
  bot_enabled INTEGER DEFAULT 1,
  escalated INTEGER DEFAULT 0,
  escalated_reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_conv_last_msg ON conversations(last_message_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  sender TEXT NOT NULL CHECK (sender IN ('contact','bot','human','scheduled')),
  body TEXT NOT NULL,
  media_type TEXT,
  media_path TEXT,
  timestamp INTEGER NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending','sent','delivered','read','failed')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_msg_conv_time ON messages(conversation_id, timestamp);

CREATE TABLE bot_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  system_prompt TEXT NOT NULL,
  business_context TEXT,
  model_name TEXT DEFAULT 'qwen2.5:1.5b-instruct-q4_K_M',
  temperature REAL DEFAULT 0.5,
  max_context_messages INTEGER DEFAULT 40,
  global_enabled INTEGER DEFAULT 1,
  response_delay_ms INTEGER DEFAULT 2000,
  bot_name TEXT DEFAULT 'ZapBot',
  tone TEXT DEFAULT 'casual',
  updated_at INTEGER NOT NULL
);

INSERT INTO bot_config (id, system_prompt, business_context, model_name, temperature, max_context_messages, global_enabled, response_delay_ms, bot_name, tone, updated_at)
VALUES (
  1,
  'Você é um atendente virtual. Responda apenas a última mensagem do cliente, em português brasileiro, com no máximo 3 frases curtas.',
  '',
  'qwen2.5:1.5b-instruct-q4_K_M',
  0.5,
  40,
  1,
  2000,
  'ZapBot',
  'casual',
  strftime('%s', 'now') * 1000
);

CREATE TABLE rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  is_regex INTEGER DEFAULT 0,
  action TEXT DEFAULT 'escalate' CHECK (action IN ('escalate')),
  response_template TEXT,
  enabled INTEGER DEFAULT 1
);

-- Seed a few default escalation keywords
INSERT INTO keywords (pattern, is_regex, action, response_template, enabled) VALUES
  ('atendente', 0, 'escalate', 'Tudo bem! Já estou te transferindo para um atendente humano. Aguarde um momentinho.', 1),
  ('falar com humano', 0, 'escalate', 'Claro! Já estou chamando um atendente para te ajudar.', 1),
  ('cancelar', 0, 'escalate', NULL, 1),
  ('reclamação', 0, 'escalate', NULL, 1);
