import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/ipc';
import { useAppStore } from '../store/app-store';
import { Smartphone, Download, CheckCircle, AlertCircle } from 'lucide-react';
import type { OllamaPullProgress } from '../../shared/types';
import { formatBytes } from '../lib/format';

export function Onboarding() {
  const status = useAppStore((s) => s.status);
  const navigate = useNavigate();
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  useEffect(() => {
    const off = api.onPullProgress(setPullProgress);
    return off;
  }, []);

  // When everything is ready, go to inbox
  useEffect(() => {
    if (status?.whatsapp === 'open' && status.model_installed) {
      navigate('/inbox', { replace: true });
    }
  }, [status, navigate]);

  const startPull = async () => {
    if (!status) return;
    setPulling(true);
    setPullError(null);
    setPullProgress({ model: status.current_model, status: 'iniciando…' });
    try {
      await api.pullModel(status.current_model);
      // Refresh status to flip model_installed
      const fresh = await api.getStatus();
      useAppStore.getState().setStatus(fresh);
    } catch (e) {
      setPullError(e instanceof Error ? e.message : String(e));
    } finally {
      setPulling(false);
    }
  };

  const waStep = {
    done: status?.whatsapp === 'open',
    active: status && status.whatsapp !== 'open',
  };
  const ollamaStep = {
    done: status?.ollama === 'ready',
    blocked: status?.ollama !== 'ready',
  };
  const modelStep = {
    done: !!status?.model_installed,
    active: status?.ollama === 'ready' && !status?.model_installed,
  };

  return (
    <div className="h-full bg-gradient-to-br from-wa-teal to-wa-green-dark flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Bem-vindo ao ZapBot</h1>
          <p className="text-slate-600 mt-2">Vamos preparar tudo para você atender no automático.</p>
        </div>

        {/* Step 1 — Ollama */}
        <Step
          number={1}
          title="Iniciando o motor de IA local"
          done={ollamaStep.done}
          description={
            ollamaStep.done
              ? 'Ollama está rodando.'
              : status?.ollama === 'error'
                ? 'Falha ao iniciar Ollama. Verifique os logs.'
                : 'Aguarde alguns segundos…'
          }
          icon={ollamaStep.done ? CheckCircle : AlertCircle}
        />

        {/* Step 2 — Model download */}
        <Step
          number={2}
          title={`Baixar modelo: ${status?.current_model ?? '...'}`}
          done={modelStep.done}
          description={
            modelStep.done
              ? 'Modelo pronto.'
              : pulling
                ? renderPullStatus(pullProgress)
                : 'O download pode levar 5–15 minutos na primeira vez (~2GB).'
          }
          icon={Download}
        >
          {!modelStep.done && !pulling && ollamaStep.done && (
            <button onClick={startPull} className="btn-primary mt-3">
              <Download className="w-4 h-4" />
              Baixar agora
            </button>
          )}
          {pulling && pullProgress?.percent !== undefined && (
            <div className="mt-3">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-wa-green transition-all"
                  style={{ width: `${pullProgress.percent}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {pullProgress.percent}%
                {pullProgress.total && pullProgress.completed
                  ? ` (${formatBytes(pullProgress.completed)} / ${formatBytes(pullProgress.total)})`
                  : ''}
              </p>
            </div>
          )}
          {pullError && (
            <p className="mt-2 text-sm text-red-600">Erro: {pullError}</p>
          )}
        </Step>

        {/* Step 3 — WhatsApp QR */}
        <Step
          number={3}
          title="Conectar WhatsApp"
          done={waStep.done}
          description={
            waStep.done
              ? 'Conectado!'
              : status?.whatsapp === 'qr'
                ? 'Abra o WhatsApp no seu celular → Configurações → Aparelhos conectados → Conectar aparelho.'
                : status?.whatsapp === 'connecting'
                  ? 'Conectando…'
                  : 'Aguardando QR Code…'
          }
          icon={Smartphone}
        >
          {status?.qr && status.whatsapp !== 'open' && (
            <div className="mt-4 flex justify-center">
              <img
                src={status.qr}
                alt="QR Code WhatsApp"
                className="w-64 h-64 border-4 border-slate-200 rounded-lg"
              />
            </div>
          )}
        </Step>

        <p className="text-xs text-slate-500 text-center mt-6">
          Tudo roda na sua máquina. Suas conversas e configurações não saem daqui.
        </p>
      </div>
    </div>
  );
}

function renderPullStatus(p: OllamaPullProgress | null): string {
  if (!p) return 'Conectando ao Ollama…';
  if (p.percent !== undefined) return `${p.status} (${p.percent}%)`;
  return p.status;
}

function Step({
  number,
  title,
  description,
  done,
  icon: Icon,
  children,
}: {
  number: number;
  title: string;
  description: string;
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-4 border-b last:border-b-0 border-slate-100">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          done ? 'bg-wa-green text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {done ? <CheckCircle className="w-5 h-5" /> : <span className="text-sm font-bold">{number}</span>}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <Icon className={`w-4 h-4 ${done ? 'text-wa-green' : 'text-slate-400'}`} />
        </div>
        <p className="text-sm text-slate-600 mt-1">{description}</p>
        {children}
      </div>
    </div>
  );
}
