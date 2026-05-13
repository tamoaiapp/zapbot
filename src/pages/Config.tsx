import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { BotConfig, Keyword, Rule } from '../../shared/types';
import { Plus, Trash2, GripVertical, Save, Power, Check, Download, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '../lib/format';

type ModelOption = {
  id: string;
  name: string;
  size: string;
  ram: string;
  speed: string;
  recommended: 'leves' | 'medios' | 'fortes';
  badge: 'PADRÃO' | 'MÉDIO' | 'PESADO';
  badgeColor: string;
  warning?: string;
};

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'qwen2.5:1.5b-instruct-q4_K_M',
    name: 'Qwen 2.5 1.5B',
    size: '~1.2 GB',
    ram: '~3 GB de RAM',
    speed: 'resposta em 1-3s',
    recommended: 'leves',
    badge: 'PADRÃO',
    badgeColor: '#16c784',
  },
  {
    id: 'qwen2.5:3b-instruct-q4_K_M',
    name: 'Qwen 2.5 3B',
    size: '~2 GB',
    ram: '~5 GB de RAM',
    speed: 'resposta em 2-4s',
    recommended: 'medios',
    badge: 'MÉDIO',
    badgeColor: '#a855f7',
    warning: 'Precisa baixar (~2 GB). PC com menos de 8 GB de RAM pode travar.',
  },
  {
    id: 'qwen2.5:7b-instruct-q4_K_M',
    name: 'Qwen 2.5 7B',
    size: '~4.5 GB',
    ram: '~8 GB de RAM',
    speed: 'resposta em 3-6s',
    recommended: 'fortes',
    badge: 'PESADO',
    badgeColor: '#ef4444',
    warning: 'Precisa baixar (~4.5 GB). Recomendado só com 16 GB+ de RAM ou GPU dedicada.',
  },
];

const TABS = [
  { key: 'identity', label: 'Identidade' },
  { key: 'rules', label: 'Regras' },
  { key: 'keywords', label: 'Palavras-chave' },
  { key: 'model', label: 'Modelo' },
] as const;
type TabKey = typeof TABS[number]['key'];

export function Config() {
  const [tab, setTab] = useState<TabKey>('identity');

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold">Configuração do bot</h1>
        <p className="text-sm text-slate-500 mt-1">
          O bot aprende lendo estas instruções a cada resposta — não há "fine-tuning".
        </p>
      </header>

      <div className="border-b border-slate-200 px-6 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              tab === t.key
                ? 'border-wa-green text-wa-green'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'identity' && <IdentityTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'keywords' && <KeywordsTab />}
        {tab === 'model' && <ModelTab />}
      </div>
    </div>
  );
}

function IdentityTab() {
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getBotConfig().then(setCfg);
  }, []);

  if (!cfg) return <p className="text-slate-500">Carregando…</p>;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateBotConfig({
        bot_name: cfg.bot_name,
        business_context: cfg.business_context,
        tone: cfg.tone,
        global_enabled: cfg.global_enabled,
      });
      setCfg(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Bot habilitado globalmente</h3>
            <p className="text-sm text-slate-500">Quando desligado, nenhuma resposta automática é enviada.</p>
          </div>
          <button
            onClick={() => setCfg({ ...cfg, global_enabled: cfg.global_enabled ? 0 : 1 })}
            className={cn(
              'btn flex items-center gap-2',
              cfg.global_enabled ? 'bg-wa-green text-white' : 'bg-slate-200 text-slate-700'
            )}
          >
            <Power className="w-4 h-4" />
            {cfg.global_enabled ? 'Ativo' : 'Desligado'}
          </button>
        </div>
      </div>

      <Field label="Nome do bot">
        <input
          className="input"
          value={cfg.bot_name ?? ''}
          onChange={(e) => setCfg({ ...cfg, bot_name: e.target.value })}
        />
      </Field>

      <Field
        label="Contexto do negócio"
        hint="Descreva produtos, horários, política de atendimento. Quanto mais específico, melhor as respostas."
      >
        <textarea
          rows={10}
          className="input"
          placeholder="Ex: Sou uma loja de eletrônicos no centro de São Paulo. Horário: seg-sex 9h-18h. Aceito Pix, cartão e boleto. Frete grátis acima de R$ 200…"
          value={cfg.business_context ?? ''}
          onChange={(e) => setCfg({ ...cfg, business_context: e.target.value })}
        />
      </Field>

      <Field label="Tom de voz">
        <div className="flex gap-2">
          {(['formal', 'casual', 'divertido'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setCfg({ ...cfg, tone: t })}
              className={cn(
                'btn capitalize',
                cfg.tone === t ? 'bg-wa-green text-white' : 'bg-slate-100 text-slate-700'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function RulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const refresh = () => api.listRules().then(setRules);
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    await api.createRule({ title: newTitle.trim(), content: newContent.trim() });
    setNewTitle('');
    setNewContent('');
    refresh();
  };

  const toggle = async (r: Rule) => {
    await api.updateRule({ id: r.id, enabled: !r.enabled });
    refresh();
  };

  const remove = async (id: number) => {
    if (!confirm('Excluir essa regra?')) return;
    await api.deleteRule(id);
    refresh();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card p-5">
        <h3 className="font-medium mb-3">Nova regra</h3>
        <input
          className="input mb-2"
          placeholder="Título curto (ex: Pedir CEP antes de preço)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <textarea
          className="input"
          rows={3}
          placeholder="Instrução em linguagem natural. Ex: Quando o cliente perguntar preço, peça o CEP antes de responder para calcular o frete."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button onClick={create} className="btn-primary">
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {rules.length === 0 && (
          <p className="text-slate-500 text-sm">Nenhuma regra ainda. Adicione acima.</p>
        )}
        {rules.map((r) => (
          <li key={r.id} className="card p-4 flex gap-3">
            <GripVertical className="w-4 h-4 text-slate-300 mt-1 cursor-grab" />
            <div className="flex-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.content}</p>
            </div>
            <div className="flex items-start gap-2">
              <button
                onClick={() => toggle(r)}
                className={cn(
                  'badge cursor-pointer',
                  r.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                )}
              >
                {r.enabled ? 'Ativa' : 'Pausada'}
              </button>
              <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeywordsTab() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [pattern, setPattern] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [template, setTemplate] = useState('');

  const refresh = () => api.listKeywords().then(setKeywords);
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!pattern.trim()) return;
    await api.createKeyword({
      pattern: pattern.trim(),
      is_regex: isRegex,
      response_template: template.trim() || undefined,
    });
    setPattern('');
    setTemplate('');
    setIsRegex(false);
    refresh();
  };

  const toggle = async (k: Keyword) => {
    await api.updateKeyword({ id: k.id, enabled: !k.enabled });
    refresh();
  };

  const remove = async (id: number) => {
    if (!confirm('Excluir essa palavra-chave?')) return;
    await api.deleteKeyword(id);
    refresh();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card p-5">
        <h3 className="font-medium mb-1">Nova palavra-chave de escalação</h3>
        <p className="text-sm text-slate-500 mb-3">
          Quando o cliente escreve algo que dá match, o bot pausa e (opcionalmente) envia uma resposta automática.
        </p>
        <input
          className="input mb-2"
          placeholder={isRegex ? '^(quero falar|atendente).*$' : 'atendente, humano, falar com pessoa…'}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} />
          É uma expressão regular (regex)
        </label>
        <textarea
          rows={2}
          className="input"
          placeholder="Resposta automática opcional (ex: Já estou chamando um atendente…)"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button onClick={create} className="btn-primary">
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {keywords.map((k) => (
          <li key={k.id} className="card p-4 flex gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <code className="text-sm bg-slate-100 px-2 py-0.5 rounded">{k.pattern}</code>
                {k.is_regex === 1 && <span className="badge bg-purple-100 text-purple-700">regex</span>}
              </div>
              {k.response_template && (
                <p className="text-sm text-slate-600 mt-2">{k.response_template}</p>
              )}
            </div>
            <div className="flex items-start gap-2">
              <button
                onClick={() => toggle(k)}
                className={cn(
                  'badge cursor-pointer',
                  k.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                )}
              >
                {k.enabled ? 'Ativa' : 'Pausada'}
              </button>
              <button onClick={() => remove(k.id)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelTab() {
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [installedModels, setInstalledModels] = useState<Set<string>>(new Set());
  const [pulling, setPulling] = useState<string | null>(null);

  useEffect(() => {
    api.getBotConfig().then(setCfg);
    api.listModels().then((models) => {
      setInstalledModels(new Set(models.map((m) => m.name)));
    });
  }, []);

  if (!cfg) return <p className="text-slate-500">Carregando…</p>;

  const selectedOption = MODEL_OPTIONS.find((m) => m.id === cfg.model_name);
  const needsDownload = selectedOption && !modelInstalled(installedModels, selectedOption.id);

  const handleSelect = async (modelId: string) => {
    setCfg({ ...cfg, model_name: modelId });
  };

  const downloadAndSave = async () => {
    if (!selectedOption) return;
    if (needsDownload) {
      setPulling(selectedOption.id);
      try {
        await api.pullModel(selectedOption.id);
        const fresh = await api.listModels();
        setInstalledModels(new Set(fresh.map((m) => m.name)));
      } catch (e) {
        alert(`Erro ao baixar modelo: ${e instanceof Error ? e.message : String(e)}`);
        setPulling(null);
        return;
      }
      setPulling(null);
    }
    setSaving(true);
    try {
      const updated = await api.updateBotConfig({
        model_name: cfg.model_name,
        temperature: cfg.temperature,
        max_context_messages: cfg.max_context_messages,
        response_delay_ms: cfg.response_delay_ms,
      });
      setCfg(updated);
    } finally {
      setSaving(false);
    }
  };

  const save = downloadAndSave;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h3 className="font-semibold text-slate-900 mb-1">Modelo de IA</h3>
        <p className="text-sm text-slate-500 mb-4">
          O 1.5B já é mais que suficiente pra atendimento padrão (preço, frete, FAQs).
          Modelos maiores entendem melhor frases complexas, mas consomem mais RAM.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODEL_OPTIONS.map((m) => {
            const isSelected = cfg.model_name === m.id;
            const isInstalled = modelInstalled(installedModels, m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelect(m.id)}
                className={cn(
                  'text-left p-4 rounded-xl border-2 transition relative',
                  isSelected
                    ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full text-white"
                    style={{ background: m.badgeColor }}
                  >
                    {m.badge}
                  </span>
                  {isInstalled ? (
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> instalado
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Download className="w-3 h-3" /> baixar
                    </span>
                  )}
                </div>
                <div className="font-bold text-slate-900">{m.name}</div>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5">
                    <Download className="w-3 h-3 text-slate-400" />
                    {m.size} no disco
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-3 h-3 inline-flex items-center justify-center text-slate-400 text-[10px] font-bold">M</span>
                    {m.ram} em uso
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-slate-400" />
                    {m.speed}
                  </li>
                </ul>
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-wa-green text-white flex items-center justify-center shadow-md">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {selectedOption?.warning && needsDownload && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-900">{selectedOption.warning}</p>
          </div>
        )}

        {pulling && (
          <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-900 flex items-center gap-2">
              <Download className="w-4 h-4 animate-pulse" />
              Baixando {pulling}… acompanhe o progresso no painel de Status.
            </p>
          </div>
        )}
      </div>

      <Field label={`Criatividade (temperatura): ${cfg.temperature.toFixed(2)}`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={cfg.temperature}
          onChange={(e) => setCfg({ ...cfg, temperature: parseFloat(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>Preciso</span>
          <span>Criativo</span>
        </div>
      </Field>

      <Field label={`Profundidade de contexto: ${cfg.max_context_messages} mensagens`}>
        <input
          type="range"
          min={10}
          max={80}
          step={5}
          value={cfg.max_context_messages}
          onChange={(e) => setCfg({ ...cfg, max_context_messages: parseInt(e.target.value, 10) })}
          className="w-full"
        />
      </Field>

      <Field label={`Delay humanizado: ${(cfg.response_delay_ms / 1000).toFixed(1)}s`}>
        <input
          type="range"
          min={0}
          max={10000}
          step={500}
          value={cfg.response_delay_ms}
          onChange={(e) => setCfg({ ...cfg, response_delay_ms: parseInt(e.target.value, 10) })}
          className="w-full"
        />
      </Field>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !!pulling} className="btn-primary">
          {needsDownload ? <Download className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {pulling
            ? 'Baixando…'
            : saving
              ? 'Salvando…'
              : needsDownload
                ? `Baixar e salvar (${selectedOption?.size})`
                : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function modelInstalled(installed: Set<string>, id: string): boolean {
  // Ollama list_models retorna nomes como "qwen2.5:1.5b-instruct-q4_K_M" exato
  // mas às vezes lista variantes (com/sem tag). Aceita match exato ou prefixo do base.
  if (installed.has(id)) return true;
  const base = id.split(':')[0];
  for (const m of installed) {
    if (m.startsWith(`${base}:`) && m === id) return true;
  }
  return false;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
