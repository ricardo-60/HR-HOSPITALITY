const CURRENCY = 'Kz';

export function formatKz(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = safe.toFixed(2).split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart} ${CURRENCY}`;
}

/** Versão compacta para cartões: `1,2 M Kz`. */
export function formatKzCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M ${CURRENCY}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.', ',')} k ${CURRENCY}`;
  return formatKz(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

/** ISO local de há `days` dias, inclusive o dia corrente quando `days = 0`. */
export function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
