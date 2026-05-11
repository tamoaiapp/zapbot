import { create } from 'zustand';
import type { Conversation, Message, SystemStatus, ToastEvent } from '../../shared/types';

interface ToastWithId extends ToastEvent {
  id: number;
}

interface AppState {
  status: SystemStatus | null;
  setStatus: (s: SystemStatus) => void;

  conversations: Conversation[];
  setConversations: (cs: Conversation[]) => void;

  selectedConversationId: string | null;
  selectConversation: (id: string | null) => void;

  messagesByConversation: Record<string, Message[]>;
  setMessages: (conversationId: string, msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  updateMessageStatus: (id: string, status: Message['status']) => void;

  toasts: ToastWithId[];
  pushToast: (t: ToastEvent) => void;
  dismissToast: (id: number) => void;
}

let toastCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  status: null,
  setStatus: (status) => set({ status }),

  conversations: [],
  setConversations: (conversations) => set({ conversations }),

  selectedConversationId: null,
  selectConversation: (id) => set({ selectedConversationId: id }),

  messagesByConversation: {},
  setMessages: (conversationId, msgs) =>
    set((s) => ({
      messagesByConversation: { ...s.messagesByConversation, [conversationId]: msgs },
    })),
  appendMessage: (msg) =>
    set((s) => {
      const existing = s.messagesByConversation[msg.conversation_id] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [msg.conversation_id]: [...existing, msg],
        },
      };
    }),
  updateMessageStatus: (id, status) =>
    set((s) => {
      const next: typeof s.messagesByConversation = {};
      for (const [cid, msgs] of Object.entries(s.messagesByConversation)) {
        next[cid] = msgs.map((m) => (m.id === id ? { ...m, status } : m));
      }
      return { messagesByConversation: next };
    }),

  toasts: [],
  pushToast: (t) =>
    set((s) => ({ toasts: [...s.toasts, { ...t, id: ++toastCounter }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
