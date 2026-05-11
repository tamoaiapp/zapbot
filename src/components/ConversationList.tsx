import { useAppStore } from '../store/app-store';
import { api } from '../lib/ipc';
import { Bot, User, AlertTriangle } from 'lucide-react';
import { cn, formatRelative } from '../lib/format';

export function ConversationList() {
  const conversations = useAppStore((s) => s.conversations);
  const selectedId = useAppStore((s) => s.selectedConversationId);
  const selectConversation = useAppStore((s) => s.selectConversation);

  const select = async (id: string) => {
    selectConversation(id);
    const msgs = await api.getMessages({ conversationId: id, limit: 100 });
    useAppStore.getState().setMessages(id, msgs);
    await api.markRead(id);
    const list = await api.listConversations();
    useAppStore.getState().setConversations(list);
  };

  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        Sem conversas ainda. Quando alguém mandar mensagem no WhatsApp, aparecerá aqui.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {conversations.map((c) => {
        const isSelected = c.id === selectedId;
        return (
          <li
            key={c.id}
            onClick={() => select(c.id)}
            className={cn(
              'cursor-pointer px-4 py-3 transition-colors',
              isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center flex-shrink-0 text-slate-600 font-medium">
                {(c.contact_name ?? c.contact_phone).slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="font-medium text-slate-900 truncate">
                    {c.contact_name ?? `+${c.contact_phone}`}
                  </p>
                  <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
                    {formatRelative(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-slate-600 truncate flex-1">
                    {c.last_message_preview ?? ''}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {c.escalated === 1 && (
                      <AlertTriangle className="w-4 h-4 text-red-500" title="Escalado" />
                    )}
                    {c.bot_enabled === 1 ? (
                      <Bot className="w-4 h-4 text-wa-green" title="Bot ativo" />
                    ) : (
                      <User className="w-4 h-4 text-slate-500" title="Humano assumiu" />
                    )}
                    {c.unread_count > 0 && (
                      <span className="bg-wa-green text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
