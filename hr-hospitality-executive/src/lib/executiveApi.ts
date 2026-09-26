import { isoDaysAgo } from '@/lib/format';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  MovementType,
  OccupancySummary,
  PaymentMethod,
  PeriodSummary,
  SalesBreakdown,
  StockAlert,
  StockMovementRow,
  StockState,
  TopProduct,
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
