import { isoDaysAgo, localDay, localIsoDays } from '@/lib/format';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  BillingComparePoint,
  DailyFlow,
  FlowBreakdown,
  HoursVsNightsSummary,
  MovementType,
  OccupancySummary,
  PaymentMethod,
  PeriodSummary,
  PreBillBreakdown,
  PreBillsSummary,
  ReportPeriod,
  ReportsSummary,
  SalesBreakdown,
  StockAlert,
  StockMovementRow,
  StockState,
  TopMenusSummary,
  TopProduct,
  TopSeller,
} from '@/types/executive';

/**
 * Agregações do painel executivo.
 *
 * Esta app é de LEITURA. Nenhuma função escreve, e a RLS da migração 007 não
 * cria policies de escrita para o perfil `EXECUTIVO` — mesmo que este ficheiro
 * tentasse, a base de dados recusaria.
 */

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; data: null; error: string };
export type Result<T> = Ok<T> | Err;

function notConfigured(): Err {
  return { ok: false, data: null, error: 'Supabase não configurado neste dispositivo.' };
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const METHODS: PaymentMethod[] = [
  'MULTICAIXA_EXPRESS',
  'TRANSFERENCIA',
  'TPA',
  'DINHEIRO',
  'CONTA_DO_QUARTO',
];

/**
 * O PostgREST devolve uma relação many-to-one como ARRAY quando não há
 * embebimento explícito, e como OBJECT quando há. Esta função aceita as duas
 * formas, para que uma mudança de lado da API não parta a app.
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface RevenueRow {
  payment_method: PaymentMethod | null;
  total: number | string;
  closed_at: string | null;
}

/* ── 1. Fluxo de caixa ──────────────────────────────────────────────────── */

/**
 * Receita por meio de pagamento, para o dia, a semana e o mês.
 *
 * A conta do quarto entra no total, mas é separada de "receita cobrada": o
 * valor só foi realmente recebido no checkout. Distinguir as duas coisas evita
 * que o dono leia consumo como entrada de dinheiro.
 */
export async function loadRevenue(): Promise<Result<PeriodSummary>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const client = getSupabase();
    const fromMonth = isoDaysAgo(29);
    const fromWeek = isoDaysAgo(6);
    const fromDay = isoDaysAgo(0);
    const previousFrom = isoDaysAgo(59);

    const { data, error } = await client
      .from('pos_orders')
      .select('payment_method,total,closed_at')
      .in('status', ['PAGA', 'FECHADA'])
      .gte('closed_at', `${previousFrom}T00:00:00`)
      .limit(2000);
    if (error) return { ok: false, data: null, error: error.message };

    const rows = (data ?? []) as unknown as RevenueRow[];

    const within = (from: string) =>
      rows
        .filter(row => row.payment_method !== null && row.closed_at !== null && row.closed_at >= `${from}T00:00:00`)
        .reduce((sum, row) => sum + num(row.total), 0);

    const byMethod = METHODS.map(method => {
      const matching = rows.filter(row => row.payment_method === method);
      const closed = matching.filter(
        row => row.closed_at !== null && row.closed_at >= `${fromMonth}T00:00:00`,
      );
      return {
        method,
        total: closed.reduce((sum, row) => sum + num(row.total), 0),
        orders: closed.length,
      };
    });

    return {
      ok: true,
      data: {
        day: within(fromDay),
        week: within(fromWeek),
        month: within(fromMonth),
        previousMonth: within(previousFrom),
        byMethod,
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar a receita.' };
  }
}

/* ── 2. Ocupação ────────────────────────────────────────────────────────── */

export async function loadOccupancy(): Promise<Result<OccupancySummary>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const client = getSupabase();

    const [rooms, pending, arrivals, departures] = await Promise.all([
      client.from('hotel_rooms').select('id,status').limit(1000),
      client.from('hotel_reservations').select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE_PAGAMENTO'),
      client.from('hotel_reservations').select('id', { count: 'exact', head: true }).eq('reservation_date', isoDaysAgo(0)),
      client.from('hotel_reservations').select('id', { count: 'exact', head: true }).in('status', ['CONFIRMADA', 'CHECKED_IN']),
    ]);

    if (rooms.error) return { ok: false, data: null, error: rooms.error.message };

    const list = (rooms.data ?? []) as { id: string; status: string }[];
    const totalRooms = list.length;
    const occupied = list.filter(room => room.status === 'OCUPADO').length;
    const available = list.filter(room => room.status === 'DISPONIVEL').length;
    const outOfService = list.filter(room => room.status === 'LIMPEZA' || room.status === 'MANUTENCAO').length;

    return {
      ok: true,
      data: {
        totalRooms,
        occupied,
        available,
        outOfService,
        rate: totalRooms > 0 ? (occupied / totalRooms) * 100 : 0,
        pendingPayment: pending.count ?? 0,
        expectedArrivals: arrivals.count ?? 0,
        expectedDepartures: departures.count ?? 0,
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar a ocupação.' };
  }
}

/* ── 3. Resumo do bar / snack-bar ───────────────────────────────────────── */

export async function loadSalesBreakdown(): Promise<Result<SalesBreakdown>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_order_items')
      .select('quantity,line_total,pos_orders(total,closed_at,status,table_id,reservation_id,pos_tables(name),hotel_reservations(room_number))')
      .gte('pos_orders.closed_at', `${isoDaysAgo(0)}T00:00:00`)
      .limit(2000);
    if (error) return { ok: false, data: null, error: error.message };

    const rows = (data ?? []) as unknown as {
      quantity: number;
      line_total: number | string;
      pos_orders:
        | {
            status: string;
            table_id: string | null;
            reservation_id: string | null;
            pos_tables: { name: string | null } | { name: string | null }[] | null;
            hotel_reservations: { room_number: string | null } | { room_number: string | null }[] | null;
          }
        | null;
    }[];

    const tableTotals = new Map<string, number>();
    const roomTotals = new Map<string, number>();

    for (const row of rows) {
      const order = row.pos_orders;
      if (!order || order.status === 'CANCELADA') continue;
      const value = num(row.line_total);

      const tableName = one(order.pos_tables)?.name;
      if (tableName) tableTotals.set(tableName, (tableTotals.get(tableName) ?? 0) + value);

      const room = one(order.hotel_reservations)?.room_number;
      if (order.reservation_id && room) roomTotals.set(room, (roomTotals.get(room) ?? 0) + value);
    }

    return {
      ok: true,
      data: {
        byTable: [...tableTotals.entries()]
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total),
        byRoom: [...roomTotals.entries()]
          .map(([room_number, total]) => ({ room_number, total }))
          .sort((a, b) => b.total - a.total),
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar as vendas.' };
  }
}

export async function loadTopProducts(limit = 8): Promise<Result<TopProduct[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pos_order_items')
      .select('product_name,quantity,line_total,pos_products(category),pos_orders(status,closed_at)')
      .gte('pos_orders.closed_at', `${isoDaysAgo(29)}T00:00:00`)
      .limit(2000);
    if (error) return { ok: false, data: null, error: error.message };

    const rows = (data ?? []) as unknown as {
      product_name: string;
      quantity: number;
      line_total: number | string;
      pos_products: { category: string | null } | { category: string | null }[] | null;
      pos_orders: { status: string } | { status: string }[] | null;
    }[];

    const totals = new Map<string, { category: string; quantity: number; total: number }>();
    for (const row of rows) {
      const order = one(row.pos_orders);
      if (!order || order.status === 'CANCELADA') continue;
      const key = row.product_name;
      const entry = totals.get(key) ?? {
        category: one(row.pos_products)?.category ?? 'outro',
        quantity: 0,
        total: 0,
      };
      entry.quantity += row.quantity;
      entry.total += num(row.line_total);
      totals.set(key, entry);
    }

    return {
      ok: true,
      data: [...totals.entries()]
        .map(([product_name, value]) => ({ product_name, ...value }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit),
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar os produtos.' };
  }
}

/* ── 4. Economato e stock ───────────────────────────────────────────────── */

const ITEM_COLUMNS = 'id,sku,name,unit,current_stock,min_stock';

export async function loadStockAlerts(): Promise<Result<StockAlert[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('inventory_items')
      .select(ITEM_COLUMNS)
      .eq('is_active', true)
      .order('name');
    if (error) return { ok: false, data: null, error: error.message };

    const rows = (data ?? []) as {
      id: string;
      sku: string;
      name: string;
      unit: string;
      current_stock: number | string;
      min_stock: number | string;
    }[];

    const alerts: StockAlert[] = rows
      .map(row => {
        const current = num(row.current_stock);
        const minimum = num(row.min_stock);
        const state: StockState = current <= 0 ? 'RUTURA' : current <= minimum ? 'BAIXO' : 'OK';
        return { id: row.id, sku: row.sku, name: row.name, unit: row.unit, current_stock: current, min_stock: minimum, state };
      })
      .filter(item => item.state !== 'OK')
      .sort((a, b) => a.current_stock - b.current_stock);

    return { ok: true, data: alerts };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar o stock.' };
  }
}

export async function loadStockMovements(limit = 30): Promise<Result<StockMovementRow[]>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('inventory_movements')
      .select('id,movement_type,quantity,balance_after,reason,created_at,inventory_items(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { ok: false, data: null, error: error.message };

    const rows = (data ?? []) as unknown as {
      id: string;
      movement_type: MovementType;
      quantity: number | string;
      balance_after: number | string | null;
      reason: string | null;
      created_at: string;
      inventory_items: { name: string | null } | { name: string | null }[] | null;
    }[];

    return {
      ok: true,
      data: rows.map(row => ({
        id: row.id,
        item_name: one(row.inventory_items)?.name ?? '—',
        movement_type: row.movement_type,
        quantity: num(row.quantity),
        balance_after: row.balance_after === null ? null : num(row.balance_after),
        reason: row.reason,
        created_at: row.created_at,
      })),
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar os movimentos.' };
  }
}

/* ── 5. Relatórios ──────────────────────────────────────────────────────── */

const REVENUE_SOURCE_LABEL: Record<string, string> = {
  POS: 'POS · comandas',
  DIARIA: 'Diárias',
  MANUAL: 'Lançamentos manuais',
  DESPESA: 'Despesas',
};

const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  FORNECEDOR: 'Fornecedores',
  MANUTENCAO: 'Manutenção',
  COMPRA: 'Compras',
  SANGRIA: 'Sangrias',
  SERVICOS: 'Serviços',
  SALARIOS: 'Salários',
  IMPOSTOS: 'Impostos',
  TRANSPORTE: 'Transportes',
  ENERGIA: 'Energia',
  OUTRO: 'Outros',
};

interface LedgerRow {
  direction: 'ENTRADA' | 'SAIDA';
  source: string;
  category: string;
  amount: number | string;
  transaction_date: string;
}

/**
 * Resumo dos relatórios: receitas, despesas, lucro e ocupação num período.
 *
 * Antes de ler o razão chama `hr_sync_financial_entries` — a função
 * idempotente da migração 010 que reconstrui o razão a partir das comandas,
 * reservas e despesas — para que os números venham completos. A falha da
 * sincronização não impede a leitura: o razão pode já estar em dia.
 */
export async function loadReportsSummary(
  period: ReportPeriod,
  tenantId: string | null,
): Promise<Result<ReportsSummary>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const client = getSupabase();

    if (tenantId) {
      await client.rpc('hr_sync_financial_entries', { p_tenant_id: tenantId });
    }

    const [ledger, occupancy] = await Promise.all([
      client
        .from('financial_transactions')
        .select('direction,source,category,amount,transaction_date')
        .gte('transaction_date', isoDaysAgo(period - 1))
        .limit(5000),
      loadOccupancy(),
    ]);
    if (ledger.error) return { ok: false, data: null, error: ledger.error.message };

    const rows = (ledger.data ?? []) as LedgerRow[];

    const days = localIsoDays(period);
    const series = new Map<string, DailyFlow>(days.map(day => [day, { date: day, receita: 0, despesa: 0 }]));

    let receitas = 0;
    let despesas = 0;
    const bySource = new Map<string, number>();
    const byCategory = new Map<string, number>();

    for (const row of rows) {
      const amount = num(row.amount);
      const bucket = series.get(row.transaction_date);
      if (row.direction === 'ENTRADA') {
        receitas += amount;
        if (bucket) bucket.receita += amount;
        bySource.set(row.source, (bySource.get(row.source) ?? 0) + amount);
      } else {
        despesas += amount;
        if (bucket) bucket.despesa += amount;
        byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + amount);
      }
    }

    const toBreakdown = (totals: Map<string, number>, labels: Record<string, string>): FlowBreakdown[] =>
      [...totals.entries()]
        .map(([key, total]) => ({ key, label: labels[key] ?? key, total }))
        .sort((a, b) => b.total - a.total);

    return {
      ok: true,
      data: {
        days: period,
        receitas,
        despesas,
        lucro: receitas - despesas,
        occupancyRate: occupancy.ok ? occupancy.data.rate : 0,
        series: days.map(day => series.get(day)!),
        receitasPorOrigem: toBreakdown(bySource, REVENUE_SOURCE_LABEL),
        despesasPorCategoria: toBreakdown(byCategory, EXPENSE_CATEGORY_LABEL),
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar os relatórios.' };
  }
}

/* ── 6. Relatórios da migração 011 ─────────────────────────────────────── */

/** Aviso compacto mostrado num cartão quando o módulo ainda não existe. */
export const MODULE_UNAVAILABLE_MESSAGE = 'Indisponível — a unidade ainda não activou este módulo';

/**
 * `true` quando o erro é de esquema: tabela ou coluna que ainda não existe
 * em produção porque a migração 011 não foi aplicada nesta unidade.
 *
 * Nessos casos o cartão do relatório degrada para o aviso compacto em vez
 * de partir o ecrã — regra de compatibilidade da app com produção.
 */
export function isModuleUnavailable(error: string): boolean {
  const message = error.toLowerCase();
  return message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find the');
}

interface HourlyBillingRow {
  status: string;
  amount_paid: number | string;
  block_hours: number | string;
  extensions: number | string;
  started_at: string;
  closed_at: string | null;
}

interface ReservationRow {
  reservation_date: string;
  total_amount: number | string | null;
  status: string;
}

/**
 * Horas vs diárias: receita das sessões horárias contra a receita das
 * estadias, na mesma janela de dias.
 *
 * As horas entram pelo `amount_paid` das sessões fechadas (`PAGO`); as que
 * estão `EM_CURSO` são contadas à parte, sem receita, porque ainda não
 * foram liquidadas. As reservas entram pelo `total_amount` de todas as
 * estados menos `CANCELADA`, agrupadas por `reservation_date`.
 *
 * Sem a migração 011 não existe `hourly_billing`: o erro de esquema segue
 * para o ecrã e o cartão mostra "Indisponível".
 */
export async function loadHoursVsNights(period: ReportPeriod): Promise<Result<HoursVsNightsSummary>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const client = getSupabase();
    const from = `${isoDaysAgo(period - 1)}T00:00:00`;

    const [hourly, activas, reservations] = await Promise.all([
      client
        .from('hourly_billing')
        .select('status,amount_paid,block_hours,extensions,started_at,closed_at')
        .or(`started_at.gte.${from},closed_at.gte.${from}`)
        .limit(2000),
      client
        .from('hourly_billing')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'EM_CURSO'),
      client
        .from('hotel_reservations')
        .select('reservation_date,total_amount,status')
        .neq('status', 'CANCELADA')
        .gte('reservation_date', isoDaysAgo(period - 1))
        .limit(2000),
    ]);

    if (hourly.error) return { ok: false, data: null, error: hourly.error.message };
    if (activas.error) return { ok: false, data: null, error: activas.error.message };
    if (reservations.error) return { ok: false, data: null, error: reservations.error.message };

    const days = localIsoDays(period);
    const series = new Map<string, BillingComparePoint>(
      days.map(day => [day, { date: day, horas: 0, diarias: 0 }]),
    );

    let totalHoras = 0;
    let horasFacturadas = 0;

    for (const row of (hourly.data ?? []) as HourlyBillingRow[]) {
      // Só o que foi recebido conta: EM_CURSO não pagou, CANCELADA não conta.
      if (row.status !== 'PAGO') continue;
      const paid = num(row.amount_paid);
      totalHoras += paid;
      horasFacturadas += num(row.block_hours) + num(row.extensions);
      const bucket = series.get(localDay(row.closed_at ?? row.started_at));
      if (bucket) bucket.horas += paid;
    }

    let totalDiarias = 0;
    for (const row of (reservations.data ?? []) as ReservationRow[]) {
      const amount = num(row.total_amount);
      totalDiarias += amount;
      const bucket = series.get(row.reservation_date);
      if (bucket) bucket.diarias += amount;
    }

    return {
      ok: true,
      data: {
        days: period,
        totalHoras,
        totalDiarias,
        sessoesActivas: activas.count ?? 0,
        horasFacturadas,
        ticketMedioHora: horasFacturadas > 0 ? totalHoras / horasFacturadas : 0,
        series: days.map(day => series.get(day)!),
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao comparar horas e diárias.' };
  }
}

interface MenuEmbedded {
  category: string | null;
  master_product_id?: string | null;
  master_products_catalog?: { kind: string | null } | { kind: string | null }[] | null;
}

interface MenuItemRow {
  product_name: string;
  quantity: number | string;
  line_total: number | string;
  pos_products: MenuEmbedded | MenuEmbedded[] | null;
  pos_orders: { status: string } | { status: string }[] | null;
}

/**
 * Classificação de uma venda para o ranking de pratos e bebidas.
 *
 * O `kind` do catálogo mestre manda (PRATO/LANCHE → comida, BEBIDA →
 * bebida); quando o produto não está vinculado (`master_product_id IS
 * NULL`) ou a migração 011 nem existe, cai para a categoria local do POS:
 * COMIDA/SNACK/CAFETERIA → prato, BEBIDA → bebida, resto → outros.
 */
function classifySale(kind: string | null, category: string | null): 'prato' | 'bebida' | 'outro' {
  if (kind === 'PRATO' || kind === 'LANCHE') return 'prato';
  if (kind === 'BEBIDA') return 'bebida';
  if (kind) return 'outro'; // SERVICO/OUTRO do catálogo mestre.

  const local = (category ?? '').toUpperCase();
  if (local === 'COMIDA' || local === 'SNACK' || local === 'CAFETERIA') return 'prato';
  if (local === 'BEBIDA') return 'bebida';
  return 'outro';
}

/**
 * Top pratos e top bebidas do período, ordenados por receita e com as
 * unidades vendidas ao lado.
 *
 * A primeira tentativa embute `master_products_catalog(kind)`. Sem a
 * migração 011 a coluna `pos_products.master_product_id` não existe e o
 * PostgREST recusa o pedido: repetimos sem o catálogo e classificamos só
 * com a categoria do POS, para o relatório continuar a funcionar. Se
 * também falhar, o cartão degrada para "Indisponível".
 */
export async function loadTopMenus(period: ReportPeriod, limit = 5): Promise<Result<TopMenusSummary>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const client = getSupabase();
    const since = `${isoDaysAgo(period - 1)}T00:00:00`;

    const primary = await client
      .from('pos_order_items')
      .select(
        'product_name,quantity,line_total,pos_products(category,master_product_id,master_products_catalog(kind)),pos_orders(status,closed_at)',
      )
      .gte('pos_orders.closed_at', since)
      .limit(2000);

    let rows: MenuItemRow[];
    if (primary.error) {
      const fallback = await client
        .from('pos_order_items')
        .select('product_name,quantity,line_total,pos_products(category),pos_orders(status,closed_at)')
        .gte('pos_orders.closed_at', since)
        .limit(2000);
      if (fallback.error) return { ok: false, data: null, error: fallback.error.message };
      rows = (fallback.data ?? []) as unknown as MenuItemRow[];
    } else {
      rows = (primary.data ?? []) as unknown as MenuItemRow[];
    }

    const totals = new Map<string, { kind: string | null; category: string | null; units: number; revenue: number }>();

    for (const row of rows) {
      const order = one(row.pos_orders);
      if (!order || order.status === 'CANCELADA') continue;
      const product = one(row.pos_products);
      const entry = totals.get(row.product_name) ?? {
        kind: one(product?.master_products_catalog)?.kind ?? null,
        category: product?.category ?? null,
        units: 0,
        revenue: 0,
      };
      entry.units += num(row.quantity);
      entry.revenue += num(row.line_total);
      totals.set(row.product_name, entry);
    }

    const pratos: TopSeller[] = [];
    const bebidas: TopSeller[] = [];
    const outros = { units: 0, revenue: 0 };

    for (const [name, entry] of totals) {
      const seller: TopSeller = { name, units: entry.units, revenue: entry.revenue };
      const bucket = classifySale(entry.kind, entry.category);
      if (bucket === 'prato') pratos.push(seller);
      else if (bucket === 'bebida') bebidas.push(seller);
      else {
        outros.units += seller.units;
        outros.revenue += seller.revenue;
      }
    }

    const byRevenue = (a: TopSeller, b: TopSeller) => b.revenue - a.revenue;

    return {
      ok: true,
      data: {
        pratos: pratos.sort(byRevenue).slice(0, limit),
        bebidas: bebidas.sort(byRevenue).slice(0, limit),
        outros,
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar os tops de venda.' };
  }
}

interface PreBillRow {
  doc_type: string;
  context: string;
  line_count: number | string;
  total: number | string;
  created_at: string;
}

const PRE_BILL_TYPE_LABEL: Record<string, string> = {
  PRE_CONTA: 'Pré-contas',
  EXTRATO: 'Extratos',
};

const PRE_BILL_CONTEXT_LABEL: Record<string, string> = {
  MESA: 'Mesa',
  QUARTO: 'Quarto',
  CONTA: 'Conta',
};

/**
 * Pré-contas emitidas no período — a leitura anti-fraude: quantos
 * documentos saíram, pelo que valor, de que tipo, em que contexto e
 * quantos itens em média cada um levou.
 *
 * `pre_bill_logs` só existe com a migração 011; sem ela o cartão mostra
 * "Indisponível" em vez de quebrar o ecrã.
 */
export async function loadPreBills(period: ReportPeriod): Promise<Result<PreBillsSummary>> {
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const { data, error } = await getSupabase()
      .from('pre_bill_logs')
      .select('doc_type,context,line_count,total,created_at')
      .gte('created_at', `${isoDaysAgo(period - 1)}T00:00:00`)
      .limit(2000);
    if (error) return { ok: false, data: null, error: error.message };

    const rows = (data ?? []) as unknown as PreBillRow[];
    const byType = new Map<string, { count: number; total: number }>();
    const byContext = new Map<string, { count: number; total: number }>();

    let documents = 0;
    let total = 0;
    let lines = 0;

    const bump = (map: Map<string, { count: number; total: number }>, key: string, value: number) => {
      const entry = map.get(key) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += value;
      map.set(key, entry);
    };

    for (const row of rows) {
      const value = num(row.total);
      documents += 1;
      total += value;
      lines += num(row.line_count);
      bump(byType, row.doc_type, value);
      bump(byContext, row.context, value);
    }

    const toBreakdown = (
      source: Map<string, { count: number; total: number }>,
      labels: Record<string, string>,
    ): PreBillBreakdown[] =>
      [...source.entries()]
        .map(([key, value]) => ({ key, label: labels[key] ?? key, count: value.count, total: value.total }))
        .sort((a, b) => b.count - a.count);

    return {
      ok: true,
      data: {
        days: period,
        documents,
        total,
        avgLines: documents > 0 ? lines / documents : 0,
        porTipo: toBreakdown(byType, PRE_BILL_TYPE_LABEL),
        porContexto: toBreakdown(byContext, PRE_BILL_CONTEXT_LABEL),
      },
    };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Falha ao carregar as pré-contas.' };
  }
}
