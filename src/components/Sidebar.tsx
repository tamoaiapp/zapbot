import { NavLink } from 'react-router-dom';
import { MessageSquare, Settings, Calendar, Sliders, Power } from 'lucide-react';
import { useAppStore } from '../store/app-store';
import { cn } from '../lib/format';

const items = [
  { to: '/inbox', icon: MessageSquare, label: 'Conversas' },
  { to: '/scheduler', icon: Calendar, label: 'Agendamentos' },
  { to: '/config', icon: Sliders, label: 'Configuração' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export function Sidebar() {
  const status = useAppStore((s) => s.status);

  const waState =
    status?.whatsapp === 'open'
      ? { color: 'bg-green-500', label: 'Conectado' }
      : status?.whatsapp === 'connecting' || status?.whatsapp === 'qr'
        ? { color: 'bg-amber-500 animate-pulse', label: 'Conectando' }
        : { color: 'bg-red-500', label: 'Desconectado' };

  const ollamaState =
    status?.ollama === 'ready'
      ? { color: 'bg-green-500', label: 'LLM pronto' }
      : status?.ollama === 'starting'
        ? { color: 'bg-amber-500 animate-pulse', label: 'LLM iniciando' }
        : { color: 'bg-red-500', label: 'LLM offline' };

  return (
    <aside className="w-60 bg-wa-teal text-white flex flex-col">
      <div className="p-4 border-b border-white/10">
        <h1 className="font-semibold text-lg flex items-center gap-2">
          <Power className="w-5 h-5 text-wa-green" />
          ZapBot
        </h1>
        <p className="text-xs text-white/60 mt-1">Atendente local</p>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', waState.color)} />
          <span className="text-white/80">{waState.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', ollamaState.color)} />
          <span className="text-white/80">{ollamaState.label}</span>
        </div>
        {status?.current_model && (
          <p className="text-white/40 truncate" title={status.current_model}>
            {status.current_model}
          </p>
        )}
      </div>
    </aside>
  );
}
