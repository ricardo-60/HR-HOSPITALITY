/**
 * Queries dos relatórios que assentam em tabelas da migração 011.
 *
 * `hourly_billing` e `pre_bill_logs` ainda podem não existir em produção —
 * as funções daqui nunca lançam: devolvem `unavailable: true` com
 * `error: null` quando a tabela em falta é exactamente a da migração 011,
 * para que a interface mostre um estado informativo em vez de um erro.
 */

import { isMissingRelation, toNumber } from '@/lib/productCatalog';
import { isSupabaseConfigured, supabaseClient } from '@/lib/supabaseClient';

/* ── Sessões horárias ──────────────────────────────────────────────────── */

export interface HourlyBillingRow {
  id: string;
  room_id: string;
  room_number: string | null;
  block_hours: number;
  rate: number;
  started_at: string;
  ends_at: string;
  extensions: number;
  status: string;
  amount_paid: number;
  closed_at: string | null;
}

export interface HourlyFetchResult {
  rows: HourlyBillingRow[];
  /** `true` quando `hourly_billing` ainda não existe (011 em falta). */
  unavailable: boolean;
  error: string | null;
}

const HOURLY_COLUMNS =
  'id,room_id,block_hours,rate,started_at,ends_at,extensions,status,amount_paid,closed_at';

function mapHourly(raw: Record<string, unknown>, rooms: Map<string, string>): HourlyBillingRow {
  return {
    id: String(raw.id),
    room_id: String(raw.room_id),
    room_number: rooms.get(String(raw.room_id)) ?? null,
    block_hours: Math.round(toNumber(raw.block_hours)),
    rate: toNumber(raw.rate),
    started_at: String(raw.started_at ?? ''),
    ends_at: String(raw.ends_at ?? ''),
    extensions: Math.round(toNumber(raw.extensions)),
    status: String(raw.status ?? ''),
    amount_paid: toNumber(raw.amount_paid),
    closed_at: raw.closed_at ? String(raw.closed_at) : null,
  };
}

/**
 * Sessões do período (pelas iniciadas) mais todas as que continuam em curso
 * agora — assim o KPI de "sessões activas" não depende da data de arranque.
 * Os números de quarto vêm de `hotel_rooms` (tabela que existe desde sempre).
 */
export async function fetchHourlyBilling(from: string, to: string): Promise<HourlyFetchResult> {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { rows: [], unavailable: false, error: 'Supabase não configurado neste ambiente.' };
  }
  try {
    const start = `${from}T00:00:00.000Z`;
    const end = `${to}T23:59:59.999Z`;

    const [periodo, activas] = await Promise.all([
      supabaseClient
        .from('hourly_billing')
        .select(HOURLY_COLUMNS)
        .gte('started_at', start)
        .lte('started_at', end)
        .limit(500),
      supabaseClient
        .from('hourly_billing')
        .select(HOURLY_COLUMNS)
        .eq('status', 'EM_CURSO')
        .limit(200),
    ]);

    const erro = periodo.error ?? activas.error;
    if (erro) {
      if (isMissingRelation(erro.message)) return { rows: [], unavailable: true, error: null };
      return { rows: [], unavailable: false, error: erro.message };
    }

    // Números de quarto: melhor esforço, nunca bloqueia o relatório.
    const rooms = new Map<string, string>();
    const quartos = await supabaseClient.from('hotel_rooms').select('id,room_number');
    if (!quartos.error) {
      for (const quarto of (quartos.data ?? []) as { id: string; room_number: string }[]) {
        rooms.set(String(quarto.id), String(quarto.room_number));
      }
    }

    const byId = new Map<string, HourlyBillingRow>();
    for (const raw of [...(periodo.data ?? []), ...(activas.data ?? [])] as Record<string, unknown>[]) {
      const row = mapHourly(raw, rooms);
      byId.set(row.id, row);
    }
    return { rows: [...byId.values()], unavailable: false, error: null };
  } catch (error) {
    return {
      rows: [],
      unavailable: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar as sessões horárias.',
    };
  }
}

/* ── Pré-contas emitidas ───────────────────────────────────────────────── */

export interface PreBillRow {
  id: string;
  doc_number: string;
  doc_type: string;
  context: string;
  label: string | null;
  guest_name: string | null;
  room_number: string | null;
  line_count: number;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  printer: string;
  issued_by_name: string | null;
  created_at: string;
}

export interface PreBillFetchResult {
  rows: PreBillRow[];
  /** Contagem real no período (pode exceder `rows` quando há limite). */
  totalDocs: number;
  /** `true` quando `pre_bill_logs` ainda não existe (011 em falta). */
  unavailable: boolean;
  /** `true` quando o período tem mais documentos do que o limite lido. */
  truncated: boolean;
  error: string | null;
}

const PRE_BILL_COLUMNS =
  'id,doc_number,doc_type,context,label,guest_name,room_number,line_count,subtotal,discount,total,currency,printer,issued_by_name,created_at';

const PRE_BILL_ROW_LIMIT = 1000;

function mapPreBill(raw: Record<string, unknown>): PreBillRow {
  return {
    id: String(raw.id),
    doc_number: String(raw.doc_number ?? ''),
    doc_type: String(raw.doc_type ?? ''),
    context: String(raw.context ?? ''),
    label: raw.label ? String(raw.label) : null,
    guest_name: raw.guest_name ? String(raw.guest_name) : null,
    room_number: raw.room_number ? String(raw.room_number) : null,
    line_count: Math.round(toNumber(raw.line_count)),
    subtotal: toNumber(raw.subtotal),
    discount: toNumber(raw.discount),
    total: toNumber(raw.total),
    currency: String(raw.currency ?? 'AOA'),
    printer: String(raw.printer ?? ''),
    issued_by_name: raw.issued_by_name ? String(raw.issued_by_name) : null,
    created_at: String(raw.created_at ?? ''),
  };
}

/** Documentos de pré-conta emitidos no período, com contagem exacta. */
export async function fetchPreBills(from: string, to: string): Promise<PreBillFetchResult> {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { rows: [], totalDocs: 0, unavailable: false, truncated: false, error: 'Supabase não configurado neste ambiente.' };
  }
  try {
    const start = `${from}T00:00:00.000Z`;
    const end = `${to}T23:59:59.999Z`;

    const [lista, contagem] = await Promise.all([
      supabaseClient
        .from('pre_bill_logs')
        .select(PRE_BILL_COLUMNS)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(PRE_BILL_ROW_LIMIT),
      supabaseClient
        .from('pre_bill_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start)
        .lte('created_at', end),
    ]);

    const erro = lista.error ?? contagem.error;
    if (erro) {
      if (isMissingRelation(erro.message)) {
        return { rows: [], totalDocs: 0, unavailable: true, truncated: false, error: null };
      }
      return { rows: [], totalDocs: 0, unavailable: false, truncated: false, error: erro.message };
    }

    const rows = ((lista.data ?? []) as Record<string, unknown>[]).map(mapPreBill);
    const totalDocs = contagem.count ?? rows.length;
    return {
      rows,
      totalDocs,
      unavailable: false,
      truncated: totalDocs > rows.length,
      error: null,
    };
  } catch (error) {
    return {
      rows: [],
      totalDocs: 0,
      unavailable: false,
      truncated: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar as pré-contas.',
    };
  }
}
