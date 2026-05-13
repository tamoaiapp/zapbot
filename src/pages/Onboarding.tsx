import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/ipc';
import { useAppStore } from '../store/app-store';
import { CheckCircle } from 'lucide-react';
import type { OllamaPullProgress } from '../../shared/types';
import { formatBytes } from '../lib/format';

export function Onboarding() {
  const status = useAppStore((s) => s.status);
  const navigate = useNavigate();
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const off = api.onPullProgress(setPullProgress);
    return off;
  }, []);

  // Auto-redirect disabled — user clicks "Continuar" so they can pace the demo.

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

  // Auto-start the model download as soon as the environment is ready.
  // No button: this is part of "preparing the app" from the user's perspective.
  useEffect(() => {
    if (startedRef.current) return;
    if (status?.ollama !== 'ready') return;
    if (status.model_installed) return;
    if (pulling) return;
    startedRef.current = true;
    void startPull();
    // We intentionally only watch the readiness gate; startPull is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.ollama, status?.model_installed]);

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
          title="Preparando o ambiente"
          done={ollamaStep.done}
          description={
            ollamaStep.done
              ? 'Tudo pronto.'
              : status?.ollama === 'error'
                ? 'Não consegui iniciar. Verifique se o Ollama está instalado ou reabra o app.'
                : 'Só um instante…'
          }
        >
          {status?.ollama === 'error' && (
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Baixar Ollama (atalho oficial)
            </a>
          )}
        </Step>

        {/* Step 2 — Model download (starts automatically once env is ready) */}
        <Step
          number={2}
          title="Baixar a inteligência artificial"
          done={modelStep.done}
          description={
            modelStep.done
              ? 'Pronto para responder.'
              : pulling || pullProgress
                ? renderPullStatus(pullProgress)
                : !ollamaStep.done
                  ? 'Vai começar assim que o ambiente terminar de preparar.'
                  : modelSizeHint(status?.current_model)
          }
        >
          {pulling && (
            <div className="mt-3">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-wa-green transition-all"
                  style={{
                    width: pullProgress?.percent ? `${pullProgress.percent}%` : '5%',
                  }}
                />
              </div>
              {pullProgress?.total && pullProgress.completed && (
                <p className="text-xs text-slate-500 mt-1">
                  {formatBytes(pullProgress.completed)} de{' '}
                  {formatBytes(pullProgress.total)}
                </p>
              )}
            </div>
          )}
          {pullError && (
            <div className="mt-3">
              <p className="text-sm text-red-600">
                Não foi possível baixar: {pullError}
              </p>
              <button
                onClick={() => {
                  startedRef.current = false;
                  startPull();
                }}
                className="btn-secondary mt-2 text-sm"
              >
                Tentar de novo
              </button>
            </div>
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
                ? 'Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.'
                : status?.whatsapp === 'connecting'
                  ? 'Conectando…'
                  : 'Preparando…'
          }
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

        {/* Continue button — enabled when everything's ready */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={() => navigate('/inbox', { replace: true })}
            disabled={!waStep.done || !modelStep.done}
            className="btn-primary px-8 py-3 text-base disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            Continuar para o ZapBot →
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            Tudo roda na sua máquina. Suas conversas e configurações não saem daqui.
          </p>
        </div>
      </div>
    </div>
  );
}

function renderPullStatus(p: OllamaPullProgress | null): string {
  if (!p) return 'Iniciando download…';
  if (p.percent !== undefined) return `Baixando — ${p.percent}%`;
  // Translate Ollama statuses to friendly Portuguese
  const status = p.status.toLowerCase();
  if (status.includes('pulling')) return 'Baixando…';
  if (status.includes('verifying')) return 'Verificando arquivos…';
  if (status.includes('writing')) return 'Salvando no disco…';
  if (status.includes('success')) return 'Concluído!';
  return 'Preparando…';
}

function modelSizeHint(model?: string): string {
  if (!model) return 'Aguardando…';
  if (model.includes('1.5b')) return 'Download leve (~1.2 GB). Leva 3–8 min no Wi-Fi comum.';
  if (model.includes('3b')) return 'Download médio (~2 GB). Leva 5–12 min no Wi-Fi comum.';
  if (model.includes('7b')) return 'Download maior (~4.5 GB). Leva 10–20 min no Wi-Fi comum.';
  return 'O download pode levar alguns minutos na primeira vez.';
}

function Step({
  number,
  title,
  description,
  done,
  children,
}: {
  number: number;
  title: string;
  description: string;
  done: boolean;
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
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}
