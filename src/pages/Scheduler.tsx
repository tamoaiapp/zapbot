import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { Recurrence, ScheduledMessage } from '../../shared/types';
import { Plus, Trash2, Pause, Play, Calendar } from 'lucide-react';
import { cn, formatDateTime, maskPhoneBR } from '../lib/format';

const WEEKDAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export function Scheduler() {
  const [list, setList] = useState<ScheduledMessage[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = () => api.listScheduled().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agendamentos</h1>
          <p className="text-sm text-slate-500 mt-1">Envios programados (limite: 30 msgs/hora).</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo agendamento
        </button>
      </header>

      {showForm && <ScheduleForm onClose={() => setShowForm(false)} onSaved={refresh} />}

      <div className="flex-1 overflow-y-auto p-6">
        {list.length === 0 ? (
          <div className="text-center text-slate-400 mt-10">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <p>Nenhum agendamento.</p>
          </div>
        ) : (
          <ul className="space-y-2 max-w-3xl">
            {list.map((s) => (
              <ScheduledRow key={s.id} item={s} onChange={refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScheduledRow({ item, onChange }: { item: ScheduledMessage; onChange: () => void }) {
  const statusColor = {
    pending: 'bg-blue-100 text-blue-700',
    sent: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-200 text-slate-600',
  }[item.status];

  const remove = async () => {
    if (!confirm('Excluir esse agendamento?')) return;
    await api.deleteScheduled(item.id);
    onChange();
  };

  const togglePause = async () => {
    if (item.status === 'pending') await api.pauseScheduled(item.id);
    else if (item.status === 'cancelled') await api.resumeScheduled(item.id);
    onChange();
  };

  return (
    <li className="card p-4 flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{maskPhoneBR(item.phone)}</span>
          <span className={cn('badge', statusColor)}>{item.status}</span>
          {item.recurrence && (
            <span className="badge bg-purple-100 text-purple-700">{item.recurrence}</span>
          )}
        </div>
        <p className="text-sm text-slate-600 truncate">{item.body}</p>
        <p className="text-xs text-slate-500 mt-1">
          {item.recurrence ? 'Próximo: ' : 'Em: '}
          {formatDateTime(item.scheduled_for)}
          {item.attempts > 0 && ` · ${item.attempts} tentativa(s)`}
        </p>
        {item.last_error && <p className="text-xs text-red-600 mt-1">⚠ {item.last_error}</p>}
      </div>
      <div className="flex items-start gap-2">
        {(item.status === 'pending' || item.status === 'cancelled') && (
          <button onClick={togglePause} className="btn-ghost" title={item.status === 'pending' ? 'Pausar' : 'Retomar'}>
            {item.status === 'pending' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        )}
        <button onClick={remove} className="text-red-500 hover:text-red-700">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

function ScheduleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'once' | 'recurring'>('once');
  const [datetime, setDatetime] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const submit = async () => {
    setError(null);
    const digits = phone.replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(digits)) {
      setError('Telefone inválido. Digite com DDI+DDD+número (ex: 5511999999999).');
      return;
    }
    if (!body.trim()) {
      setError('Mensagem vazia.');
      return;
    }

    let scheduled_for: number;
    let recurrence: Recurrence = null;
    let weekdaysCsv: string | null = null;

    if (type === 'once') {
      if (!datetime) {
        setError('Escolha data e hora.');
        return;
      }
      scheduled_for = new Date(datetime).getTime();
      if (scheduled_for <= Date.now()) {
        setError('Escolha um horário futuro.');
        return;
      }
    } else {
      if (weekdays.length === 0) {
        setError('Selecione pelo menos um dia da semana.');
        return;
      }
      const [hh, mm] = time.split(':').map((s) => parseInt(s, 10));
      const today = new Date();
      today.setHours(hh, mm, 0, 0);
      // Find next applicable weekday (today included if still in future)
      let candidate = today;
      for (let i = 0; i < 8; i++) {
        if (weekdays.includes(candidate.getDay()) && candidate.getTime() > Date.now()) break;
        candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
        candidate.setHours(hh, mm, 0, 0);
      }
      scheduled_for = candidate.getTime();
      recurrence = 'weekly';
      weekdaysCsv = weekdays.join(',');
    }

    setSaving(true);
    try {
      await api.createScheduled({
        phone: digits,
        body: body.trim(),
        scheduled_for,
        recurrence,
        weekdays: weekdaysCsv,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Novo agendamento</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Telefone</label>
            <input
              className="input"
              placeholder="5511999999999 (DDI + DDD + número, só dígitos)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {phone && <p className="text-xs text-slate-500 mt-1">{maskPhoneBR(phone)}</p>}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Mensagem</label>
            <textarea
              rows={3}
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Tipo</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('once')}
                className={cn(
                  'btn',
                  type === 'once' ? 'bg-wa-green text-white' : 'bg-slate-100 text-slate-700'
                )}
              >
                Único
              </button>
              <button
                onClick={() => setType('recurring')}
                className={cn(
                  'btn',
                  type === 'recurring' ? 'bg-wa-green text-white' : 'bg-slate-100 text-slate-700'
                )}
              >
                Recorrente
              </button>
            </div>
          </div>

          {type === 'once' ? (
            <div>
              <label className="text-sm font-medium block mb-1">Data e hora</label>
              <input
                type="datetime-local"
                className="input"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium block mb-2">Dias da semana</label>
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        'px-3 py-1.5 rounded text-sm',
                        weekdays.includes(d.value)
                          ? 'bg-wa-green text-white'
                          : 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Horário</label>
                <input
                  type="time"
                  className="input"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? 'Salvando…' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  );
}
