// Types shared between Electron main process and React renderer.
// Keep this file dependency-free (no node, no electron, no react imports).

export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'open' | 'logged_out';

export type MessageDirection = 'in' | 'out';
export type MessageSender = 'contact' | 'bot' | 'human' | 'scheduled';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MediaType = 'image' | 'audio' | 'video' | 'document' | null;

export interface Conversation {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  last_message_at: number;
  unread_count: number;
  bot_enabled: 0 | 1;
  escalated: 0 | 1;
  escalated_reason: string | null;
  created_at: number;
  last_message_preview?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender: MessageSender;
  body: string;
  media_type: MediaType;
  media_path: string | null;
  timestamp: number;
  status: MessageStatus;
}

export interface BotConfig {
  id: 1;
  system_prompt: string;
  business_context: string;
  model_name: string;
  temperature: number;
  max_context_messages: number;
  global_enabled: 0 | 1;
  response_delay_ms: number;
  updated_at: number;
  bot_name?: string;
  tone?: 'formal' | 'casual' | 'divertido';
}

export interface Rule {
  id: number;
  title: string;
  content: string;
  priority: number;
  enabled: 0 | 1;
}

export interface Keyword {
  id: number;
  pattern: string;
  is_regex: 0 | 1;
  action: 'escalate';
  response_template: string | null;
  enabled: 0 | 1;
}

export type Recurrence = null | 'daily' | 'weekly' | `cron:${string}`;
export type ScheduledStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface ScheduledMessage {
  id: number;
  phone: string;
  body: string;
  scheduled_for: number;
  recurrence: Recurrence;
  weekdays: string | null;
  status: ScheduledStatus;
  attempts: number;
  last_error: string | null;
  created_at: number;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
  installed: boolean;
}

export interface OllamaPullProgress {
  model: string;
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
}

export interface SystemStatus {
  ollama: 'starting' | 'ready' | 'error';
  whatsapp: ConnectionStatus;
  qr: string | null;
  current_model: string;
  model_installed: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// IPC channel names + payload shapes
// ──────────────────────────────────────────────────────────────────────────

export const IpcChannels = {
  // System
  SYSTEM_STATUS: 'system:status',
  SYSTEM_LOGOUT: 'system:logout',
  SYSTEM_OPEN_LOGS: 'system:open-logs',

  // Ollama
  OLLAMA_LIST_MODELS: 'ollama:list-models',
  OLLAMA_PULL_MODEL: 'ollama:pull-model',
  OLLAMA_PULL_PROGRESS: 'ollama:pull-progress', // push: main -> renderer

  // Inbox
  INBOX_LIST_CONVERSATIONS: 'inbox:list-conversations',
  INBOX_GET_MESSAGES: 'inbox:get-messages',
  INBOX_SEND_MANUAL: 'inbox:send-manual',
  INBOX_TOGGLE_BOT: 'inbox:toggle-bot',
  INBOX_RESET_ESCALATION: 'inbox:reset-escalation',
  INBOX_MARK_READ: 'inbox:mark-read',

  // Config
  CONFIG_GET_BOT: 'config:get-bot',
  CONFIG_UPDATE_BOT: 'config:update-bot',
  CONFIG_LIST_RULES: 'config:list-rules',
  CONFIG_CREATE_RULE: 'config:create-rule',
  CONFIG_UPDATE_RULE: 'config:update-rule',
  CONFIG_DELETE_RULE: 'config:delete-rule',
  CONFIG_REORDER_RULES: 'config:reorder-rules',
  CONFIG_LIST_KEYWORDS: 'config:list-keywords',
  CONFIG_CREATE_KEYWORD: 'config:create-keyword',
  CONFIG_UPDATE_KEYWORD: 'config:update-keyword',
  CONFIG_DELETE_KEYWORD: 'config:delete-keyword',

  // Scheduler
  SCHED_LIST: 'scheduler:list',
  SCHED_CREATE: 'scheduler:create',
  SCHED_UPDATE: 'scheduler:update',
  SCHED_DELETE: 'scheduler:delete',
  SCHED_PAUSE: 'scheduler:pause',
  SCHED_RESUME: 'scheduler:resume',

  // Push events (main -> renderer)
  EVT_STATUS_CHANGED: 'evt:status-changed',
  EVT_CONVERSATION_UPDATED: 'evt:conversation-updated',
  EVT_MESSAGE_NEW: 'evt:message-new',
  EVT_MESSAGE_UPDATED: 'evt:message-updated',
  EVT_SCHEDULED_FIRED: 'evt:scheduled-fired',
  EVT_TOAST: 'evt:toast',
} as const;

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels];

// Request/response types
export interface ListMessagesArgs {
  conversationId: string;
  limit?: number;
  beforeTimestamp?: number;
}

export interface SendManualArgs {
  conversationId: string;
  body: string;
}

export interface ToggleBotArgs {
  conversationId: string;
  enabled: boolean;
}

export interface CreateRuleArgs {
  title: string;
  content: string;
  priority?: number;
  enabled?: boolean;
}

export interface UpdateRuleArgs extends Partial<CreateRuleArgs> {
  id: number;
}

export interface CreateKeywordArgs {
  pattern: string;
  is_regex: boolean;
  response_template?: string;
  enabled?: boolean;
}

export interface UpdateKeywordArgs extends Partial<CreateKeywordArgs> {
  id: number;
}

export interface CreateScheduledArgs {
  phone: string;
  body: string;
  scheduled_for: number;
  recurrence?: Recurrence;
  weekdays?: string | null;
}

export interface UpdateScheduledArgs extends Partial<CreateScheduledArgs> {
  id: number;
  status?: ScheduledStatus;
}

export interface UpdateBotConfigArgs extends Partial<Omit<BotConfig, 'id' | 'updated_at'>> {}

export interface ToastEvent {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
}
