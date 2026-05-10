export function formatMoney(n: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const { decimals = 2, sign = false } = opts;
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const prefix = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : (n < 0 ? '−' : '');
  return `${prefix}${abs}`;
}

export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return n.toFixed(0);
}

export function formatPct(p: number, decimals = 2): string {
  if (!Number.isFinite(p)) return '—';
  const sign = p > 0 ? '+' : p < 0 ? '−' : '';
  return `${sign}${Math.abs(p).toFixed(decimals)}%`;
}

export function formatDate(d: string | number | Date): string {
  const date = new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayStr(): string {
  return formatDate(new Date());
}

export function monthLabel(d: string | Date): string {
  const date = new Date(d);
  return `${date.getMonth() + 1}月`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function maskMoney(s: string): string {
  return s.replace(/[\d.,]/g, '•');
}
