export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;

  if (diff < 60_000) return 'agora';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < oneDay) return formatTime(ts);
  if (diff < 2 * oneDay) return 'ontem';
  if (diff < oneWeek) {
    const d = new Date(ts);
    return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  }
  return new Date(ts).toLocaleDateString('pt-BR');
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function maskPhoneBR(input: string): string {
  // Returns +55 (11) 99999-9999 from a digit string
  const digits = input.replace(/\D/g, '');
  if (digits.length < 12) return input;
  const cc = digits.slice(0, 2);
  const ddd = digits.slice(2, 4);
  const first = digits.length > 12 ? digits.slice(4, 9) : digits.slice(4, 8);
  const last = digits.slice(-4);
  return `+${cc} (${ddd}) ${first}-${last}`;
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
