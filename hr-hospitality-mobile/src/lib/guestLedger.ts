/**
 * Extrato transparente do hóspede (migração 011).
 *
 * A app do cliente SÓ LÊ: nunca escreve em `guest_accounts`,
 * `guest_order_items` ou `pre_bill_logs`. O `total` da conta é uma coluna
 * GERADA (`subtotal - discount`) — qualquer escrita aí seria recusada pelo
 * Postgres, e de qualquer forma o extrato nunca deve divergir da soma das
 * linhas.
 *
 * Compatibilidade: a produção ainda não tem a migração 011 aplicada, por
 * isso as tabelas podem nem existir. Qualquer erro de "tabela inexistente"
 * ou de permissões é traduzido em `unavailable`, para o ecrã mostrar um
 * estado amigável em vez de rebentar — e nunca em escritas ou em quebra da
 * navegação.
 *
 * A RLS já faz o filtro por hóspede (`guest_accounts.auth_user_id =
 * auth.uid()`); o filtro de cliente aqui é redundância deliberada.
 */

import { currentAccount } from '@/lib/guestAuth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type GuestAccountStatus = 'ABERTA' | 'FECHADA' | 'PAGA' | 'CANCELADA';

export interface GuestAccountRow {
  id: string;
  account_number: string;
  guest_name: string;
  room_number: string | null;
  source: string;
  status: GuestAccountStatus;
  currency: string;
  opened_at: string;
  closed_at: string | null;
  subtotal: number | string;
  discount: number | string;
  /** Coluna GERADA na BD — lida, nunca escrita pela app. */
  total: number | string;
  pre_billed_at: string | null;
}

export interface GuestOrderItemRow {
  id: string;
  account_id: string;
  origin: string;
  description: string;
  /** `NUMERIC(12,3)` chega como string no PostgREST. */
  quantity: number | string;
  unit_price: number | string;
  discount: number | string;
  line_total: number | string;
  consumed_at: string;
}

/** Uma linha da fotografia congelada guardada em `pre_bill_logs.payload`. */
export interface PreBillPayloadLine {
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
}

/** `payload` — o documento tal como saiu na impressora, imutável. */
export interface PreBillPayload {
  doc_number?: string;
  context?: string;
  label?: string | null;
  guest_name?: string | null;
  room_number?: string | null;
  currency?: string;
  line_count?: number;
  subtotal?: number | string;
  discount?: number | string;
  total?: number | string;
  issued_by_name?: string | null;
  issued_at?: string;
  lines?: PreBillPayloadLine[];
}

export interface PreBillLogRow {
  id: string;
  doc_number: string;
  doc_type: 'PRE_CONTA' | 'EXTRATO';
  printer: string;
  label: string | null;
  guest_name: string | null;
  room_number: string | null;
  line_count: number;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  currency: string;
  created_at: string;
  payload: PreBillPayload | null;
}

export type Tone = 'success' | 'warning' | 'muted' | 'accent' | 'danger';

export const GUEST_ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ABERTA: 'Em aberto',
  FECHADA: 'Fechada',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

export const GUEST_ACCOUNT_STATUS_TONE: Record<string, Tone> = {
  ABERTA: 'warning',
  FECHADA: 'accent',
  PAGA: 'success',
  CANCELADA: 'danger',
};

export const ACCOUNT_SOURCE_LABEL: Record<string, string> = {
  HOSPEDAGEM: 'Hospedagem',
  RESTAURANTE: 'Restaurante',
  BAR: 'Bar',
  EVENTO: 'Evento',
};

export const ORDER_ORIGIN_LABEL: Record<string, string> = {
  ALOJAMENTO: 'Alojamento',
  RESTAURANTE: 'Restaurante',
  BAR: 'Bar',
  SNACK: 'Snack',
  PISCINA: 'Piscina',
  GINASIO: 'Ginásio',
  LAVANDARIA: 'Lavandaria',
  ROOM_SERVICE: 'Room service',
  EVENTO: 'Evento',
  SERVICO: 'Serviço',
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  PRE_CONTA: 'Pré-conta',
  EXTRATO: 'Extrato',
};

export const PRINTER_LABEL: Record<string, string> = {
  ESCPOS_58: 'Impressora 58 mm',
  ESCPOS_80: 'Impressora 80 mm',
  PDF: 'PDF',
};

/**
 * `true` quando o erro significa "esta função ainda não está activa nesta
 * unidade": tabela inexistente (migração 011 por aplicar) ou sem permissão
 * de leitura. Nesses casos o ecrã mostra um estado vazio amigável, não um erro.
 */
export function isLedgerUnavailable(message: string): boolean {
  return /does not exist|could not find the table|permission denied|insufficient privilege|row-level security|42P01|PGRST205|42501/i.test(
    message,
  );
}

function reason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export interface GuestStatement {
  /** Conta em aberto (ou, na falta dela, a mais recente). `null` = sem conta. */
  account: GuestAccountRow | null;
  items: GuestOrderItemRow[];
  docs: PreBillLogRow[];
}

export type GuestStatementResult =
  | { kind: 'signed-out' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; reason: string }
  | { kind: 'ready'; statement: GuestStatement; docsUnavailable: boolean };

function classify(message: string): GuestStatementResult {
  return isLedgerUnavailable(message)
    ? { kind: 'unavailable', reason: message }
    : { kind: 'error', reason: message };
}

/**
 * Carrega o extrato do hóspede autenticado. Só faz SELECT — nunca escreve.
 *
 * Nunca lança: todos os caminhos devolvem um resultado que a UI sabe tratar.
 */
export async function fetchGuestStatement(): Promise<GuestStatementResult> {
  if (!isSupabaseConfigured) {
    return { kind: 'unavailable', reason: 'Supabase não configurado.' };
  }

  let session: { authUserId: string } | null;
  try {
    session = await currentAccount();
  } catch (err) {
    return { kind: 'error', reason: reason(err, 'Falha ao verificar a sessão.') };
  }
  if (!session) return { kind: 'signed-out' };

  try {
    const client = getSupabase();

    const { data: accounts, error: accountsError } = await client
      .from('guest_accounts')
      .select(
        'id, account_number, guest_name, room_number, source, status, currency, opened_at, closed_at, subtotal, discount, total, pre_billed_at',
      )
      .eq('auth_user_id', session.authUserId)
      .order('opened_at', { ascending: false })
      .limit(20);

    if (accountsError) return classify(accountsError.message);

    const rows = (accounts ?? []) as GuestAccountRow[];
    // A conta corrente é a que está em aberto; sem nenhuma, a mais recente.
    const account = rows.find(row => row.status === 'ABERTA') ?? rows[0] ?? null;

    if (!account) {
      return {
        kind: 'ready',
        statement: { account: null, items: [], docs: [] },
        docsUnavailable: false,
      };
    }

    const [itemsResult, docsResult] = await Promise.all([
      client
        .from('guest_order_items')
        .select(
          'id, account_id, origin, description, quantity, unit_price, discount, line_total, consumed_at',
        )
        .eq('account_id', account.id)
        .order('consumed_at', { ascending: true })
        .limit(1000),
      client
        .from('pre_bill_logs')
        .select(
          'id, doc_number, doc_type, printer, label, guest_name, room_number, line_count, subtotal, discount, total, currency, created_at, payload',
        )
        .eq('guest_account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (itemsResult.error) return classify(itemsResult.error.message);

    // Os comprovativos dependem de `pre_bill_logs`: se essa tabela não
    // responder, só o bloco de documentos fica indisponível — o resto do
    // extrato continua a ser útil.
    const docsUnavailable = Boolean(docsResult.error);

    return {
      kind: 'ready',
      statement: {
        account,
        items: (itemsResult.data ?? []) as GuestOrderItemRow[],
        docs: docsResult.error ? [] : ((docsResult.data ?? []) as PreBillLogRow[]),
      },
      docsUnavailable,
    };
  } catch (err) {
    return classify(reason(err, 'Falha ao carregar o extrato.'));
  }
}

/**
 * Subscreve a conta em tempo real: um novo consumo (ou o recálculo do total
 * pela própria BD) chega sem recarregar o ecrã.
 *
 * Devolve a função de cancelamento. Nunca lança: sem Realtime — ou sem a
 * migração 011 — a app fica apenas sem actualização instantânea e continua
 * a funcionar com o carregamento normal.
 */
export function watchStatement(accountId: string, onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => {};

  let client;
  try {
    client = getSupabase();
  } catch {
    return () => {};
  }

  // Coalesce: a inserção da linha e o recálculo do total na conta chegam
  // como eventos separados — esperamos um instante e recarregamos uma vez.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, 400);
  };

  let channel;
  try {
    channel = client
      .channel(`guest-statement:${accountId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guest_order_items', filter: `account_id=eq.${accountId}` },
        schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guest_accounts', filter: `id=eq.${accountId}` },
        schedule,
      )
      .subscribe();
  } catch {
    return () => {};
  }

  return () => {
    if (timer !== null) clearTimeout(timer);
    void client.removeChannel(channel);
  };
}
