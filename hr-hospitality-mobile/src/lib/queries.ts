import { CACHE_TTL, ageLabel, freshness, readCache, writeCache, type CacheFreshness } from '@/lib/cache';
import { FALLBACK_LAUNDRY } from '@/constants/hotel';
import { addDaysIso } from '@/lib/format';
import { getSupabase, isSupabaseConfigured, TENANT_ID } from '@/lib/supabase';
import type {
  EventSpace,
  HotelRoom,
  LaundryService,
  Pool,
  PoolPrice,
  Reservation,
} from '@/types/hotel';

export interface QueryResult<T> {
  data: T;
  state: CacheFreshness;
  /** Data do cache em cache; `null` quando os dados vêm da rede. */
  cachedAt: number | null;
  /** `true` quando os dados vieram do fallback local (sem rede e sem cache). */
  usedFallback: boolean;
  error: string | null;
}

/**
 * Catálogo de quartos em cache.
 *
 * A RLS só permite a `anon` ler quartos `DISPONIVEL`, por isso o filtro de
 * estado é redundância deliberada de cliente: se a política mudar, o filtro
 * continua a não expor quartos ocupados.
 */
export async function fetchRooms(): Promise<QueryResult<HotelRoom[]>> {
  const cached = await readCache<HotelRoom[]>('rooms');

  if (!isSupabaseConfigured) {
    return { data: cached?.value ?? [], state: freshness(cached, CACHE_TTL.catalog), cachedAt: cached?.storedAt ?? null, usedFallback: true, error: 'Supabase não configurado.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('hotel_rooms')
      .select('id, room_number, room_type, status, price_per_night, floor, description')
      .eq('status', 'DISPONIVEL')
      .order('room_number');

    if (error) throw new Error(error.message);
    const rooms = (data ?? []) as HotelRoom[];
    await writeCache('rooms', rooms);
    return { data: rooms, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.catalog),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar os quartos.',
    };
  }
}

export async function fetchPools(): Promise<QueryResult<Pool[]>> {
  const cached = await readCache<Pool[]>('pools');

  if (!isSupabaseConfigured) {
    return { data: cached?.value ?? [], state: freshness(cached, CACHE_TTL.catalog), cachedAt: cached?.storedAt ?? null, usedFallback: true, error: 'Supabase não configurado.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('public_pools')
      .select('id, slug, name, description, depth_min_m, depth_max_m, opening_hours, image_url, is_active')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(error.message);

    const pools = (data ?? []) as Pool[];
    const withPrices = await Promise.all(pools.map(async pool => ({ ...pool, prices: await fetchPoolPrices(pool.id) })));
    await writeCache('pools', withPrices);
    return { data: withPrices, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.catalog),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar as piscinas.',
    };
  }
}

export async function fetchPoolPrices(poolId: string): Promise<PoolPrice[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from('public_pool_prices')
    .select('id, pool_id, label, price, unit, sort_order')
    .eq('pool_id', poolId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as PoolPrice[];
}

export async function fetchLaundry(): Promise<QueryResult<LaundryService[]>> {
  const cached = await readCache<LaundryService[]>('laundry');

  if (!isSupabaseConfigured) {
    const fallback: LaundryService[] = FALLBACK_LAUNDRY.map((item, index) => ({
      id: `local-${item.slug}`,
      slug: item.slug,
      name: item.name,
      description: null,
      price: item.price,
      unit: item.unit,
      turnaround_hours: item.turnaround_hours,
      sort_order: index,
      is_active: true,
    }));
    return { data: cached?.value ?? fallback, state: freshness(cached, CACHE_TTL.priceList), cachedAt: cached?.storedAt ?? null, usedFallback: !cached, error: 'Supabase não configurado.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('public_laundry_services')
      .select('id, slug, name, description, price, unit, turnaround_hours, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(error.message);
    const services = (data ?? []) as LaundryService[];
    await writeCache('laundry', services);
    return { data: services, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.priceList),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar a lavandaria.',
    };
  }
}

export async function fetchEventSpaces(): Promise<QueryResult<EventSpace[]>> {
  const cached = await readCache<EventSpace[]>('events');

  if (!isSupabaseConfigured) {
    return { data: cached?.value ?? [], state: freshness(cached, CACHE_TTL.catalog), cachedAt: cached?.storedAt ?? null, usedFallback: true, error: 'Supabase não configurado.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('public_event_spaces')
      .select('id, slug, name, description, capacity, price_per_hour, price_per_day, image_url, is_active')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(error.message);
    const spaces = (data ?? []) as EventSpace[];
    await writeCache('events', spaces);
    return { data: spaces, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.catalog),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar os salões.',
    };
  }
}

/** Reservas deste dispositivo. A app não tem contas de hóspede: filtra por email. */
export async function fetchReservations(email: string): Promise<QueryResult<Reservation[]>> {
  const cacheName = `reservations:${email.trim().toLowerCase()}`;
  const cached = await readCache<Reservation[]>(cacheName);

  if (!isSupabaseConfigured) {
    return { data: cached?.value ?? [], state: freshness(cached, CACHE_TTL.catalog), cachedAt: cached?.storedAt ?? null, usedFallback: true, error: 'Supabase não configurado.' };
  }

  try {
    // `anon` não tem qualquer SELECT sobre `hotel_reservations` (ver migração
    // 006): só uma sessão autenticada lê reservas. Sem sessão devolvemos o
    // cache local, que é o máximo que a app pode mostrar com segurança.
    const { data: session } = await getSupabase().auth.getSession();
    if (!session.session) {
      return {
        data: cached?.value ?? [],
        state: freshness(cached, CACHE_TTL.catalog),
        cachedAt: cached?.storedAt ?? null,
        usedFallback: false,
        error: 'Inicie sessão para ver o histórico de reservas.',
      };
    }

    const { data, error } = await getSupabase()
      .from('hotel_reservations')
      .select('id, reference, guest_name, email, service_type, status, reservation_date, total_amount, notes, created_at')
      .eq('email', email.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const reservations = (data ?? []) as Reservation[];
    await writeCache(cacheName, reservations);
    return { data: reservations, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.catalog),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar as reservas.',
    };
  }
}

/**
 * Cria a reserva pela RPC `hr_create_public_reservation` (migração 017).
 *
 * Não é um `insert` directo (a RLS nega `INSERT` ao `anon` de propósito) nem a
 * Edge Function `create-reservation` (que não está implantada e respondia 404).
 * A RPC corre como owner, valida os dados, verifica que os três ficheiros
 * existem no Storage e devolve o `reference` gerado pelo trigger — coisa que
 * um INSERT directo não consegue devolver, porque `INSERT ... RETURNING` exige
 * `SELECT` sobre a tabela.
 */
export async function createReservation(input: {
  guestName: string;
  email: string;
  serviceType: string;
  date: string;
  totalAmount: number;
  notes: string;
  /** Registo universal (migração 017) — os três são obrigatórios. */
  documentType: 'BI' | 'PASSAPORTE';
  documentNumber: string;
  documentPath: string;
  receiptPath: string;
  facePath: string;
  /** Noites — só faz sentido para `quarto` e define a data de saída. */
  nights?: number;
  /**
   * Referência do quarto escolhido (ciclo v0.2.1): sem ela a reserva de
   * quarto nunca chega ao `hotel_rooms`, e a aprovação não pode marcar
   * RESERVADO (nem o cancelamento libertar o quarto).
   */
  roomId?: string | null;
  roomNumber?: string | null;
}): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };

  const isRoom = input.serviceType === 'quarto';
  const nights = Math.max(1, Math.floor(input.nights ?? 1));

  const payload: Record<string, unknown> = {
    tenant_id: TENANT_ID,
    guest_name: input.guestName.trim(),
    email: input.email.trim().toLowerCase(),
    service_type: input.serviceType,
    check_in_date: input.date,
    check_out_date: isRoom ? addDaysIso(input.date, nights) : null,
    notes: input.notes.trim() || null,
    total_amount: input.totalAmount,
    document_type: input.documentType,
    document_number: input.documentNumber.trim(),
    document_path: input.documentPath,
    receipt_path: input.receiptPath,
    face_path: input.facePath,
  };

  // Ciclo de vida v0.2.1: a reserva de quarto leva a referência do quarto para
  // que a aprovação o marque RESERVADO (e o cancelamento o liberte). Sem isto
  // o quarto nunca fica reservado na grelha — problema crítico da paridade.
  if (isRoom) {
    if (input.roomId) payload.room_id = input.roomId;
    if (input.roomNumber) payload.room_number = input.roomNumber;
  }

  try {
    const { data, error } = await getSupabase().rpc('hr_create_public_reservation', {
      p_payload: payload,
    });

    if (error) return { ok: false, error: error.message };
    const reference = (data as { reference?: string } | null)?.reference;
    if (!reference) return { ok: false, error: 'A reserva não foi aceite.' };
    return { ok: true, reference };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Não foi possível contactar o serviço de reservas.',
    };
  }
}

export { ageLabel };
