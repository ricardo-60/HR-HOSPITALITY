/** Formatação de moeda e datas em contexto angolano. */

const CURRENCY = 'Kz';

export function formatKz(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = safe.toFixed(2).split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart} ${CURRENCY}`;
}

/** Versão sem símbolo, para campos de preço grandes no POS. */
export function formatAmount(value: number): string {
  const [intPart, decPart] = value.toFixed(2).split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}
