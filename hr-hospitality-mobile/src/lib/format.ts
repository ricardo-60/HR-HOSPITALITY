/** Formatação de moeda, datas e texto no contexto angolano (pt-AO / Kz). */

const CURRENCY = 'Kz';

/** `150000.5` → `150.000,50 Kz`. */
export function formatKz(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = safe.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped},${decPart} ${CURRENCY}`;
}

/** Versão compacta para cartões: `150.000 Kz`. */
export function formatKzShort(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  if (safe >= 1000) {
    const [intPart, decPart] = safe.toFixed(2).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decPart === '00' ? `${grouped} ${CURRENCY}` : `${grouped},${decPart} ${CURRENCY}`;
  }
  return `${safe.toFixed(0)} ${CURRENCY}`;
}

/** Aceita `YYYY-MM-DD`; devolve `12 Out` ou `12 Out 2026` se não for o ano corrente. */
export function formatDay(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${date.getDate()} ${months[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

export function parseIsoDate(iso: string): Date | null {
  // `new Date('2026-01-05')` é UTC e pode deslocar o dia em fusos negativos.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export const ROOM_STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: 'Disponível',
  OCUPADO: 'Ocupado',
  LIMPEZA: 'Em limpeza',
  MANUTENCAO: 'Manutenção',
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  PENDENTE_PAGAMENTO: 'A aguardar pagamento',
  CONFIRMADA: 'Confirmada',
  CHECKED_IN: 'Em estadia',
  CHECKED_OUT: 'Concluída',
  CANCELADA: 'Cancelada',
};
