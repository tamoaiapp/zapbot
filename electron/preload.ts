import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/types';
import type {
  BotConfig,
  Conversation,
  CreateKeywordArgs,
  CreateRuleArgs,
  CreateScheduledArgs,
  Keyword,
  Message,
  OllamaModelInfo,
  OllamaPullProgress,
  Rule,
  ScheduledMessage,
  SystemStatus,
  UpdateBotConfigArgs,
  UpdateKeywordArgs,
  UpdateRuleArgs,
  UpdateScheduledArgs,
  ToastEvent,
} from '../shared/types';

type Unsubscribe = () => void;

const api = {
  // System
  getStatus: (): Promise<SystemStatus> => ipcRenderer.invoke(IpcChannels.SYSTEM_STATUS),
  logout: (): Promise<{ ok: true }> => ipcRenderer.invoke(IpcChannels.SYSTEM_LOGOUT),
  openLogs: (): Promise<{ ok: true }> => ipcRenderer.invoke(IpcChannels.SYSTEM_OPEN_LOGS),

  // Ollama
  listModels: (): Promise<OllamaModelInfo[]> => ipcRenderer.invoke(IpcChannels.OLLAMA_LIST_MODELS),
  pullModel: (model: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.OLLAMA_PULL_MODEL, { model }),
  onPullProgress: (cb: (p: OllamaPullProgress) => void): Unsubscribe => {
    const listener = (_: unknown, payload: OllamaPullProgress) => cb(payload);
    ipcRenderer.on(IpcChannels.OLLAMA_PULL_PROGRESS, listener);
    return () => ipcRenderer.off(IpcChannels.OLLAMA_PULL_PROGRESS, listener);
  },

  // Inbox
  listConversations: (): Promise<Conversation[]> =>
    ipcRenderer.invoke(IpcChannels.INBOX_LIST_CONVERSATIONS),
  getMessages: (args: { conversationId: string; limit?: number; beforeTimestamp?: number }): Promise<Message[]> =>
    ipcRenderer.invoke(IpcChannels.INBOX_GET_MESSAGES, args),
  sendManual: (args: { conversationId: string; body: string }): Promise<Message> =>
    ipcRenderer.invoke(IpcChannels.INBOX_SEND_MANUAL, args),
  toggleBot: (args: { conversationId: string; enabled: boolean }): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.INBOX_TOGGLE_BOT, args),
  resetEscalation: (conversationId: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.INBOX_RESET_ESCALATION, { conversationId }),
  markRead: (conversationId: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.INBOX_MARK_READ, { conversationId }),

  // Config
  getBotConfig: (): Promise<BotConfig> => ipcRenderer.invoke(IpcChannels.CONFIG_GET_BOT),
  updateBotConfig: (patch: UpdateBotConfigArgs): Promise<BotConfig> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_UPDATE_BOT, patch),
  listRules: (): Promise<Rule[]> => ipcRenderer.invoke(IpcChannels.CONFIG_LIST_RULES),
  createRule: (args: CreateRuleArgs): Promise<Rule> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_CREATE_RULE, args),
  updateRule: (args: UpdateRuleArgs): Promise<Rule> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_UPDATE_RULE, args),
  deleteRule: (id: number): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_DELETE_RULE, { id }),
  reorderRules: (orderedIds: number[]): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_REORDER_RULES, { orderedIds }),
  listKeywords: (): Promise<Keyword[]> => ipcRenderer.invoke(IpcChannels.CONFIG_LIST_KEYWORDS),
  createKeyword: (args: CreateKeywordArgs): Promise<Keyword> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_CREATE_KEYWORD, args),
  updateKeyword: (args: UpdateKeywordArgs): Promise<Keyword> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_UPDATE_KEYWORD, args),
  deleteKeyword: (id: number): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.CONFIG_DELETE_KEYWORD, { id }),

  // Scheduler
  listScheduled: (): Promise<ScheduledMessage[]> => ipcRenderer.invoke(IpcChannels.SCHED_LIST),
  createScheduled: (args: CreateScheduledArgs): Promise<ScheduledMessage> =>
    ipcRenderer.invoke(IpcChannels.SCHED_CREATE, args),
  updateScheduled: (args: UpdateScheduledArgs): Promise<ScheduledMessage> =>
    ipcRenderer.invoke(IpcChannels.SCHED_UPDATE, args),
  deleteScheduled: (id: number): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.SCHED_DELETE, { id }),
  pauseScheduled: (id: number): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.SCHED_PAUSE, { id }),
  resumeScheduled: (id: number): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IpcChannels.SCHED_RESUME, { id }),

  // Push events (main -> renderer)
  onStatusChanged: (cb: (s: SystemStatus) => void): Unsubscribe => {
    const l = (_: unknown, p: SystemStatus) => cb(p);
    ipcRenderer.on(IpcChannels.EVT_STATUS_CHANGED, l);
    return () => ipcRenderer.off(IpcChannels.EVT_STATUS_CHANGED, l);
  },
  onConversationUpdated: (cb: (conversationId: string) => void): Unsubscribe => {
    const l = (_: unknown, p: string) => cb(p);
    ipcRenderer.on(IpcChannels.EVT_CONVERSATION_UPDATED, l);
    return () => ipcRenderer.off(IpcChannels.EVT_CONVERSATION_UPDATED, l);
  },
  onMessageNew: (cb: (msg: Message) => void): Unsubscribe => {
    const l = (_: unknown, p: Message) => cb(p);
    ipcRenderer.on(IpcChannels.EVT_MESSAGE_NEW, l);
    return () => ipcRenderer.off(IpcChannels.EVT_MESSAGE_NEW, l);
  },
  onMessageUpdated: (cb: (update: Pick<Message, 'id' | 'status'>) => void): Unsubscribe => {
    const l = (_: unknown, p: Pick<Message, 'id' | 'status'>) => cb(p);
    ipcRenderer.on(IpcChannels.EVT_MESSAGE_UPDATED, l);
    return () => ipcRenderer.off(IpcChannels.EVT_MESSAGE_UPDATED, l);
  },
  onScheduledFired: (cb: (sched: ScheduledMessage) => void): Unsubscribe => {
    const l = (_: unknown, p: ScheduledMessage) => cb(p);
    ipcRenderer.on(IpcChannels.EVT_SCHEDULED_FIRED, l);
    return () => ipcRenderer.off(IpcChannels.EVT_SCHEDULED_FIRED, l);
  },
  onToast: (cb: (t: ToastEvent) => void): Unsubscribe => {
    const l = (_: unknown, p: ToastEvent) => cb(p);
    ipcRenderer.on(IpcChannels.EVT_TOAST, l);
    return () => ipcRenderer.off(IpcChannels.EVT_TOAST, l);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ZapBotApi = typeof api;
