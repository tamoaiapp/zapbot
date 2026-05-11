import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { BotConfig, Keyword, Rule } from '../../shared/types';
import { Plus, Trash2, GripVertical, Save, Power } from 'lucide-react';
import { cn } from '../lib/format';

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

  useEffect(() => {
    api.getBotConfig().then(setCfg);
  }, []);

  if (!cfg) return <p className="text-slate-500">Carregando…</p>;

  const save = async () => {
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

  return (
    <div className="max-w-2xl space-y-6">
      <Field label="Modelo" hint="Mude apenas se souber o que está fazendo.">
        <select
          className="input"
          value={cfg.model_name}
          onChange={(e) => setCfg({ ...cfg, model_name: e.target.value })}
        >
          <option value="qwen2.5:3b-instruct-q4_K_M">Qwen 2.5 3B (padrão, ~2GB)</option>
          <option value="qwen2.5:7b-instruct-q4_K_M">Qwen 2.5 7B (melhor, ~4.5GB)</option>
          <option value="qwen2.5:1.5b-instruct-q4_K_M">Qwen 2.5 1.5B (rápido, máquinas fracas)</option>
        </select>
      </Field>

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
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
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
