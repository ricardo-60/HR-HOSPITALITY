import { currentActorId, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  CashSession,
  DailyExpense,
  MovementType,
  OrderStatus,
  PaymentMethod,
  PosOrder,
  PosOrderItem,
  PosProduct,
  PosTable,
  PreBillDoc,
  PreBillPrinter,
  StayCharge,
  TableZone,
} from '@/types/pos';

/**
 * Acesso a dados do POS.
 *
 * Nada aqui escolhe o `tenant_id`: a RLS (migração 008) filtra pelo tenant do
 * perfil em sessão, pelo que um pedido sem filtro explícito já regressa apenas
 * as linhas do hotel do operador. O `pos_orders` continua a ser fechado por
 * triggers na base de dados (total derivado das linhas, mesa sincronizada).
 */

/**
 * Resultado discriminante. O campo ok é o discriminante: sem ele, o
 * Promise.all de consultas com tipos diferentes degrada a união e nada é
 * estreitado, porque passa a devolver (A | B)[] em vez de uma tupla.
 */
export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; data: null; error: string; code?: string | null };
export type Result<T> = Ok<T> | Err;

function fail(error: { message: string; code?: string | null } | null, fallback: string): Err {
  return {
    ok: false,
    data: null,
    error: error?.message ? error.message : fallback,
    code: error?.code ?? null,
  };
}

/**
 * A feature (RPC ou coluna da migração 011) ainda não existe nesta instalação.
 *
 * A produção corre sem a migração aplicada: qualquer chamada nova pode
 * rebentar com "function does not exist" / "column does not exist". Quem
 * deteta isto degrada para o comportamento antigo em vez de mostrar um erro.
 */
export function isMissingFeature(result: Err): boolean {
  const code = result.code ?? '';
  if (code === '42883' || code === 'PGRST202' || code === '42703' || code === '42P01') return true;
  const message = result.error.toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('could not find the function') ||
    message.includes('could not find the column') ||
    message.includes('schema cache')
  );
}

/** Mensagem amigável para o bloqueio anti-fraude da migração 011 (42501). */
function lockedItemMessage(error: { message: string; code?: string | null }): string {
  if (error.code !== '42501') return error.message;
  const message = error.message.toLowerCase();
  if (message.includes('imutavel') || message.includes('imutável')) {
    return 'Item de pré-conta bloqueado: o valor já emitido é imutável.';
  }
  return 'Item de pré-conta bloqueado: a remoção exige justificação auditada de 8 caracteres ou mais.';
}

function notConfigured(): Err {
  return { ok: false, data: null, error: 'Supabase não configurado neste dispositivo.' };
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ── Mesas ──────────────────────────────────────────────────────────────── */

const TABLE_COLUMNS = 'id,code,name,zone,seats,status,sort_order';

export async function listTables(zone?: TableZone): Promise<Result<PosTable[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    let query = getSupabase()
      .from('pos_tables')
      .select(TABLE_COLUMNS)
      .eq('is_active', true)
      .order('zone')
      .order('sort_order');
    if (zone) query = query.eq('zone', zone);
    const { data, error } = await query;
    if (error) return fail(error, 'Falha ao carregar as mesas.');
    return { ok: true, data: (data ?? []) as PosTable[] };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

export async function setTableStatus(id: string, status: PosTable['status']): Promise<Result<null>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { error } = await getSupabase().from('pos_tables').update({ status }).eq('id', id);
    if (error) return fail(error, 'Falha ao alterar o estado da mesa.');
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/* ── Produtos ───────────────────────────────────────────────────────────── */

const PRODUCT_COLUMNS =
  'id,sku,name,category,unit,price,affects_inventory,inventory_item_id';

export async function listProducts(): Promise<Result<PosProduct[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_products')
      .select(PRODUCT_COLUMNS)
      .eq('is_active', true)
      .order('category')
      .order('name');
    if (error) return fail(error, 'Falha ao carregar a carta.');
    const rows = (data ?? []) as PosProduct[];
    return { ok: true, data: rows.map(p => ({ ...p, price: num(p.price) })) };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/**
 * Regra de stock zero (migração 011): `hr_pos_stock` devolve a disponibilidade
 * de todo o tenant numa só chamada.
 *
 * Sem a migração aplicada a RPC não existe e a chamada falha — o ecrã trata o
 * erro como "sem informação de stock" e mantém a carta completa visível, que é
 * o comportamento antigo.
 */
export async function listStock(): Promise<Result<Record<string, boolean>>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase().rpc('hr_pos_stock', { p_product_ids: null });
    if (error) return fail(error, 'Falha ao consultar o stock.');
    const rows = (data ?? []) as { product_id: string; is_available: boolean | null }[];
    const availability: Record<string, boolean> = {};
    for (const row of rows) {
      if (row?.product_id) availability[row.product_id] = row.is_available !== false;
    }
    return { ok: true, data: availability };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/**
 * Emissão de pré-conta (migração 011): congela a comanda, atribui número e
 * devolve o documento fotográfico pronto a imprimir.
 */
export async function issuePreBill(input: {
  orderId: string;
  label: string | null;
  guestName?: string | null;
  printer: PreBillPrinter;
}): Promise<Result<PreBillDoc>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase().rpc('hr_issue_pre_bill', {
      p_order_id: input.orderId,
      p_account_id: null,
      p_context: 'MESA',
      p_label: input.label,
      p_guest_name: input.guestName ?? null,
      p_printer: input.printer,
    });
    if (error) return fail(error, 'Falha ao emitir a pré-conta.');
    if (!data || typeof data !== 'object') {
      return { ok: false, data: null, error: 'A pré-conta devolveu uma resposta vazia.', code: 'P0002' };
    }
    const doc = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        pre_bill_id: String(doc.pre_bill_id ?? ''),
        doc_number: String(doc.doc_number ?? ''),
        doc_type: doc.doc_type === 'EXTRATO' ? 'EXTRATO' : 'PRE_CONTA',
        context: (doc.context === 'QUARTO' || doc.context === 'CONTA' ? doc.context : 'MESA') as PreBillDoc['context'],
        label: (doc.label as string | null) ?? null,
        guest_name: (doc.guest_name as string | null) ?? null,
        room_number: (doc.room_number as string | null) ?? null,
        currency: String(doc.currency ?? 'AOA'),
        line_count: num(doc.line_count),
        subtotal: num(doc.subtotal),
        discount: num(doc.discount),
        total: num(doc.total),
        printer: input.printer,
        locked_items: num(doc.locked_items),
        issued_by: (doc.issued_by as string | null) ?? null,
        issued_by_name: (doc.issued_by_name as string | null) ?? null,
        issued_at: String(doc.issued_at ?? new Date().toISOString()),
        lines: Array.isArray(doc.lines)
          ? (doc.lines as Record<string, unknown>[]).map(line => ({
              id: String(line.id ?? ''),
              description: String(line.description ?? ''),
              quantity: num(line.quantity),
              unit_price: num(line.unit_price),
              line_total: num(line.line_total),
            }))
          : [],
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/* ── Comandas ───────────────────────────────────────────────────────────── */

const ORDER_COLUMNS =
  'id,order_number,table_id,reservation_id,customer_name,guest_count,status,payment_method,subtotal,discount,total,opened_at,closed_at,pos_tables(name),hotel_reservations(reference,room_number,guest_name)';

interface OrderJoinRow {
  id: string;
  order_number: string;
  table_id: string | null;
  reservation_id: string | null;
  customer_name: string | null;
  guest_count: number;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  opened_at: string;
  closed_at: string | null;
  pos_tables: { name: string | null } | null;
  hotel_reservations: { reference: string | null; room_number: string | null; guest_name: string | null } | null;
}

function mapOrder(row: OrderJoinRow): PosOrder {
  return {
    id: row.id,
    order_number: row.order_number,
    table_id: row.table_id,
    table_name: row.pos_tables?.name ?? null,
    reservation_id: row.reservation_id,
    room_number: row.hotel_reservations?.room_number ?? null,
    guest_name: row.hotel_reservations?.guest_name ?? null,
    customer_name: row.customer_name,
    guest_count: row.guest_count,
    status: row.status,
    payment_method: row.payment_method,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    total: num(row.total),
    opened_at: row.opened_at,
    closed_at: row.closed_at,
  };
}

/** Número sequencial legível por operador, para citar em voz alta. */
function nextOrderNumber(): string {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `C${stamp}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

export async function openOrder(input: {
  tableId: string | null;
  reservationId: string | null;
  customerName: string;
  guestCount: number;
}): Promise<Result<PosOrder>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_orders')
      .insert({
        order_number: nextOrderNumber(),
        table_id: input.tableId,
        reservation_id: input.reservationId,
        customer_name: input.customerName || null,
        guest_count: input.guestCount,
        status: 'ABERTA',
        opened_by: await currentActorId(),
      })
      .select(ORDER_COLUMNS)
      .single();
    if (error) return fail(error, 'Falha ao abrir a comanda.');
    return { ok: true, data: mapOrder(data as unknown as OrderJoinRow) };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

export async function listOpenOrders(): Promise<Result<PosOrder[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_orders')
      .select(ORDER_COLUMNS)
      .eq('status', 'ABERTA')
      .order('opened_at');
    if (error) return fail(error, 'Falha ao carregar as comandas abertas.');
    return { ok: true, data: ((data ?? []) as unknown as OrderJoinRow[]).map(mapOrder) };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

export async function getOrder(id: string): Promise<Result<PosOrder>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_orders')
      .select(ORDER_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) return fail(error, 'Falha ao carregar a comanda.');
    if (!data) return { ok: false, data: null, error: 'Comanda não encontrada.' };

    const order = mapOrder(data as unknown as OrderJoinRow);

    // `locked_at` só existe com a migração 011. Sem ela o PostgREST devolve
    // "column does not exist"; repete-se a consulta sem a coluna e os itens
    // tratam-se como livres, em vez de partir a comanda inteira.
    const ITEM_WITH_LOCK =
      'id,order_id,product_id,product_name,unit_price,quantity,line_total,notes,locked_at';
    const ITEM_WITHOUT_LOCK = 'id,order_id,product_id,product_name,unit_price,quantity,line_total,notes';
    const withLock = await getSupabase().from('pos_order_items').select(ITEM_WITH_LOCK).eq('order_id', id);
    // Sem a coluna, volta-se à consulta antiga — a comanda nunca parte por
    // uma migração que ainda não chegou.
    const legacy = withLock.error
      ? await getSupabase().from('pos_order_items').select(ITEM_WITHOUT_LOCK).eq('order_id', id)
      : null;
    const itemsError = withLock.error ? (legacy ? legacy.error : withLock.error) : null;
    if (itemsError) return fail(itemsError, 'Falha ao carregar os artigos da comanda.');
    const itemsData: unknown = withLock.error ? (legacy?.data ?? []) : withLock.data;

    // `line_total` é lido como possivelmente nulo porque o PostgREST devolve
    // `NUMERIC` como string e o mapeamento normaliza para número.
    const lines = ((itemsData ?? []) as (Omit<PosOrderItem, 'unit_price' | 'line_total'> & Partial<PosOrderItem>)[]).map(item => ({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      product_name: item.product_name,
      notes: item.notes,
      quantity: item.quantity,
      unit_price: num(item.unit_price),
      line_total: num(item.line_total),
      locked_at: item.locked_at ?? null,
    }));

    return { ok: true, data: { ...order, items: lines } };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/**
 * Adiciona uma linha. `line_total` é calculada aqui por conveniência, mas a
 * base de dados recalcula o total da comanda a partir das linhas — um valor
 * manipulado aqui não se traduz num total manipulado.
 */
export async function addOrderItem(input: {
  orderId: string;
  product: PosProduct;
  quantity: number;
}): Promise<Result<null>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const quantity = Math.max(1, Math.floor(input.quantity));
    const { error } = await getSupabase().from('pos_order_items').insert({
      order_id: input.orderId,
      product_id: input.product.id,
      product_name: input.product.name,
      unit_price: input.product.price,
      quantity,
      line_total: Math.round(input.product.price * quantity * 100) / 100,
    });
    if (error) return fail(error, 'Falha ao adicionar o artigo.');

    // Consumo de stock: só para artigos ligados ao economato.
    if (input.product.affects_inventory && input.product.inventory_item_id) {
      await recordMovement({
        itemId: input.product.inventory_item_id,
        type: 'SAIDA',
        quantity,
        reason: `Comanda ${input.orderId.slice(0, 8)}`,
        referenceType: 'POS',
      });
    }
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/**
 * Remove uma linha da comanda.
 *
 * Com `justification` (item bloqueado por pré-conta emitida) escreve-se primeiro
 * a justificação auditada e o instante da remoção num UPDATE — é exatamente o
 * que o trigger `protect_locked_order_items` exige antes de deixar o DELETE
 * passar. Sem justificação, o caminho é o antigo, inalterado.
 */
export async function removeOrderItem(itemId: string, justification?: string): Promise<Result<null>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const why = justification?.trim() ?? '';
    if (why) {
      const { error: updateError } = await getSupabase()
        .from('pos_order_items')
        .update({ removal_justification: why, removed_at: new Date().toISOString() })
        .eq('id', itemId);
      // Coluna inexistente = migração 011 fora: continua-se com a remoção
      // simples, que era o comportamento único até agora.
      const missingColumn = updateError?.code === '42703' || updateError?.code === '42P01';
      if (updateError && !missingColumn) {
        return { ok: false, data: null, error: lockedItemMessage(updateError), code: updateError.code ?? null };
      }
    }
    const { error } = await getSupabase().from('pos_order_items').delete().eq('id', itemId);
    if (error) return { ok: false, data: null, error: lockedItemMessage(error), code: error.code ?? null };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/**
 * Fecha a comanda. `CONTA_DO_QUARTO` só é aceite com `reservation_id`: a base
 * de dados recusa a mistura, para não deixar uma venda órfã.
 */
export async function closeOrder(input: {
  orderId: string;
  paymentMethod: PaymentMethod;
}): Promise<Result<PosOrder>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_orders')
      .update({
        status: input.paymentMethod === 'CONTA_DO_QUARTO' ? 'FECHADA' : 'PAGA',
        payment_method: input.paymentMethod,
        closed_by: await currentActorId(),
      })
      .eq('id', input.orderId)
      .eq('status', 'ABERTA')
      .select(ORDER_COLUMNS)
      .maybeSingle();
    if (error) return fail(error, 'Falha ao fechar a comanda.');
    if (!data) return { ok: false, data: null, error: 'A comanda já não está aberta.' };
    return { ok: true, data: mapOrder(data as unknown as OrderJoinRow) };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

export async function cancelOrder(orderId: string): Promise<Result<null>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { error } = await getSupabase()
      .from('pos_orders')
      .update({ status: 'CANCELADA', payment_method: null, closed_by: await currentActorId() })
      .eq('id', orderId)
      .eq('status', 'ABERTA');
    if (error) return fail(error, 'Falha ao cancelar a comanda.');
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/* ── Estadias para a conta do quarto ────────────────────────────────────── */

export async function listActiveStays(): Promise<Result<StayCharge[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('hotel_reservations')
      .select('id,reference,room_number,guest_name,status')
      .in('status', ['CONFIRMADA', 'CHECKED_IN'])
      .order('room_number');
    if (error) return fail(error, 'Falha ao carregar as estadias.');
    return {
      data: ((data ?? []) as (Omit<StayCharge, 'reservation_id'> & { id: string })[]).map(row => ({
        reservation_id: row.id,
        reference: row.reference ?? '—',
        room_number: row.room_number,
        guest_name: row.guest_name,
        status: row.status,
      })),
      ok: true,
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/* ── Caixa ──────────────────────────────────────────────────────────────── */

export async function listCashSessions(): Promise<Result<CashSession[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('cash_sessions')
      .select(
        'id,session_number,status,opened_at,closed_at,opening_cash,closing_cash,expected_cash,difference,system_multicaixa,system_tpa,system_transfer,system_room_charge',
      )
      .order('opened_at', { ascending: false })
      .limit(30);
    if (error) return fail(error, 'Falha ao carregar a caixa.');
    const rows = (data ?? []) as CashSession[];
    return {
      data: rows.map(row => ({
        ...row,
        opening_cash: num(row.opening_cash),
        closing_cash: row.closing_cash === null ? null : num(row.closing_cash),
        expected_cash: row.expected_cash === null ? null : num(row.expected_cash),
        difference: row.difference === null ? null : num(row.difference),
        system_multicaixa: num(row.system_multicaixa),
        system_tpa: num(row.system_tpa),
        system_transfer: num(row.system_transfer),
        system_room_charge: num(row.system_room_charge),
      })),
      ok: true,
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

export async function openCashSession(openingCash: number): Promise<Result<CashSession>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const now = new Date();
    const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const { data, error } = await getSupabase()
      .from('cash_sessions')
      .insert({
        session_number: `CX-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`,
        opened_by: await currentActorId(),
        opening_cash: Math.max(0, openingCash),
        status: 'ABERTA',
      })
      .select(
        'id,session_number,status,opened_at,closed_at,opening_cash,closing_cash,expected_cash,difference,system_multicaixa,system_tpa,system_transfer,system_room_charge',
      )
      .single();
    // A base de dados só permite uma caixa aberta por tenant; a mensagem
    // original do Postgres é mais útil que uma genérica.
    if (error) return fail(error, 'Já existe uma caixa aberta neste hotel.');
    return { ok: true, data: data as CashSession };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

export async function closeCashSession(
  id: string,
  closingCash: number,
  notes: string,
): Promise<Result<null>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { error } = await getSupabase()
      .from('cash_sessions')
      .update({
        status: 'FECHADA',
        closing_cash: Math.max(0, closingCash),
        closed_by: await currentActorId(),
        notes: notes || null,
      })
      .eq('id', id)
      .eq('status', 'ABERTA');
    if (error) return fail(error, 'Falha ao fechar a caixa.');
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/* ── Economato (consumo) ────────────────────────────────────────────────── */

export async function recordMovement(input: {
  itemId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  referenceType: string | null;
  unitCost?: number | null;
}): Promise<Result<null>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { error } = await getSupabase().from('inventory_movements').insert({
      item_id: input.itemId,
      movement_type: input.type,
      quantity: Math.abs(input.quantity),
      unit_cost: input.unitCost ?? null,
      reason: input.reason || null,
      reference_type: input.referenceType,
      created_by: await currentActorId(),
    });
    // Sem stock suficiente, o trigger recusa. O operador vê a mensagem real.
    if (error) return fail(error, 'Movimento de stock recusado.');
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/* ── Despesas do dia (leitura) ──────────────────────────────────────────── */

/**
 * Despesas registadas hoje, para o operador ver no início do turno.
 *
 * Só leitura: o POS não lança despesas (a migração 010 reserva a escrita a
 * quem tem o módulo financeiro). A RLS limita as linhas ao tenant do
 * operador.
 */
export async function listTodayExpenses(): Promise<Result<DailyExpense[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data, error } = await getSupabase()
      .from('daily_expenses')
      .select('id,category,description,amount,expense_date,payment_method,supplier')
      .eq('expense_date', today)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return fail(error, 'Falha ao carregar as despesas de hoje.');

    const rows = (data ?? []) as {
      id: string;
      category: string;
      description: string;
      amount: number | string;
      expense_date: string;
      payment_method: string | null;
      supplier: string | null;
    }[];

    return {
      ok: true,
      data: rows.map(row => ({
        id: row.id,
        category: row.category,
        description: row.description,
        amount: num(row.amount),
        expense_date: row.expense_date,
        payment_method: row.payment_method,
        supplier: row.supplier,
      })),
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}
