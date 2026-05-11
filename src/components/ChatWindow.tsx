import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';
import { api } from '../lib/ipc';
import { Bot, User, Send, AlertTriangle, RefreshCw, MessageSquare } from 'lucide-react';
import { cn, formatTime } from '../lib/format';

export function ChatWindow() {
  const selectedId = useAppStore((s) => s.selectedConversationId);
  const conversations = useAppStore((s) => s.conversations);
  const messagesByConversation = useAppStore((s) => s.messagesByConversation);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conv = conversations.find((c) => c.id === selectedId);
  const messages = selectedId ? messagesByConversation[selectedId] ?? [] : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, selectedId]);

  if (!selectedId || !conv) {
    return (
      <div className="h-full flex items-center justify-center bg-wa-chat text-slate-400">
        <div className="text-center">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p>Selecione uma conversa</p>
        </div>
      </div>
    );
  }

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.sendManual({ conversationId: selectedId, body: text.trim() });
      appendMessage(msg);
      setText('');
      // Refresh conversation list (bot_enabled flipped to 0)
      const list = await api.listConversations();
      useAppStore.getState().setConversations(list);
    } catch (e) {
      console.error('Send failed', e);
    } finally {
      setSending(false);
    }
  };

  const toggleBot = async () => {
    await api.toggleBot({ conversationId: selectedId, enabled: !conv.bot_enabled });
    const list = await api.listConversations();
    useAppStore.getState().setConversations(list);
  };

  const resetEscalation = async () => {
    await api.resetEscalation(selectedId);
    const list = await api.listConversations();
    useAppStore.getState().setConversations(list);
  };

  return (
    <div className="h-full flex flex-col bg-wa-chat">
      {/* Header */}
      <header className="bg-wa-panel border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 font-medium">
            {(conv.contact_name ?? conv.contact_phone).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{conv.contact_name ?? `+${conv.contact_phone}`}</p>
            <p className="text-xs text-slate-500">+{conv.contact_phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conv.escalated === 1 && (
            <button
              onClick={resetEscalation}
              className="btn-ghost text-amber-700 hover:bg-amber-50"
              title={conv.escalated_reason ?? 'Reset escalação'}
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">Resolvido</span>
            </button>
          )}
          <button
            onClick={toggleBot}
            className={cn(
              'btn-ghost flex items-center gap-2 text-xs',
              conv.bot_enabled ? 'text-wa-green' : 'text-slate-500'
            )}
            title={conv.bot_enabled ? 'Pausar bot' : 'Reativar bot'}
          >
            {conv.bot_enabled ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            {conv.bot_enabled ? 'Bot ativo' : 'Humano'}
          </button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {messages.map((m) => {
            const isOut = m.direction === 'out';
            return (
              <div key={m.id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
                    isOut ? 'bg-wa-bubble-sent' : 'bg-wa-bubble-received'
                  )}
                >
                  {isOut && (
                    <p
                      className={cn(
                        'text-xs font-medium mb-1',
                        m.sender === 'bot'
                          ? 'text-wa-green-dark'
                          : m.sender === 'human'
                            ? 'text-blue-600'
                            : 'text-purple-600'
                      )}
                    >
                      {m.sender === 'bot' ? '🤖 Bot' : m.sender === 'human' ? '👤 Você' : '⏰ Agendado'}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words text-slate-800">{m.body}</p>
                  <p className="text-[10px] text-slate-500 mt-1 text-right">
                    {formatTime(m.timestamp)}
                    {isOut && ` · ${m.status}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-wa-panel p-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Mensagem manual (pausa o bot nesta conversa)…"
            rows={1}
            className="input resize-none"
          />
          <button onClick={send} disabled={!text.trim() || sending} className="btn-primary">
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {!conv.bot_enabled && (
          <p className="text-xs text-amber-600 mt-2 max-w-3xl mx-auto">
            ⚠️ Bot pausado nesta conversa. Use "Reativar" para voltar a responder automaticamente.
          </p>
        )}
      </div>
    </div>
  );
}
