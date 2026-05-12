import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import { useAppStore } from '../store/app-store';
import type { OllamaModelInfo } from '../../shared/types';
import { FolderOpen, LogOut, RefreshCw, Check } from 'lucide-react';
import { formatBytes } from '../lib/format';

export function Settings() {
  const status = useAppStore((s) => s.status);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshModels();
  }, []);

  const refreshModels = async () => {
    setLoading(true);
    try {
      const m = await api.listModels();
      setModels(m);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (!confirm('Desconectar do WhatsApp? Você precisará escanear o QR Code novamente.')) return;
    await api.logout();
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <header className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold">Configurações do sistema</h1>
      </header>

      <div className="p-6 max-w-2xl space-y-6">
        {/* Status */}
        <section className="card p-5">
          <h2 className="font-medium mb-3">Status</h2>
          <dl className="space-y-2 text-sm">
            <StatusRow label="Ollama" value={status?.ollama ?? '...'} />
            <StatusRow label="WhatsApp" value={status?.whatsapp ?? '...'} />
            <StatusRow label="Modelo atual" value={status?.current_model ?? '...'} />
            <StatusRow
              label="Modelo instalado"
              value={status?.model_installed ? 'Sim' : 'Não'}
            />
          </dl>
        </section>

        {/* Models */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Modelos baixados</h2>
            <button onClick={refreshModels} className="btn-ghost text-sm">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {models.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum modelo baixado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {models.map((m) => (
                <li key={m.name} className="flex items-center justify-between text-sm border border-slate-100 rounded p-2">
                  <div>
                    <p className="font-mono">{m.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(m.size)}</p>
                  </div>
                  {m.name === status?.current_model && (
                    <Check className="w-4 h-4 text-wa-green" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Actions */}
        <section className="card p-5 space-y-3">
          <h2 className="font-medium mb-1">Ações</h2>
          <button onClick={() => api.openLogs()} className="btn-secondary w-full justify-start">
            <FolderOpen className="w-4 h-4" />
            Abrir pasta de logs
          </button>
          <button onClick={logout} className="btn-danger w-full justify-start">
            <LogOut className="w-4 h-4" />
            Desconectar WhatsApp
          </button>
        </section>

        <p className="text-xs text-slate-500 text-center">
          ZapBot v0.1.2 · atualiza sozinho · dados em <code className="bg-slate-100 px-1 rounded">userData/</code> · tudo local.
        </p>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-mono text-slate-900">{value}</dd>
    </div>
  );
}
