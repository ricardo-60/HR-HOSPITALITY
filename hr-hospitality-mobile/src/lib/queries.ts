import { CACHE_TTL, ageLabel, freshness, readCache, writeCache, type CacheFreshness } from '@/lib/cache';
import { FALLBACK_LAUNDRY } from '@/constants/hotel';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
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
 * Cria a reserva através da Edge Function `create-reservation`.
 *
 * Não é um `insert` directo: a RLS nega `INSERT` ao `anon` de propósito. Sem
 * isso, devolver a referência exigiria `SELECT`, e uma policy de `SELECT` não
 * consegue provar "esta linha é a que acabei de criar" — o `anon` leria todas
 * as reservas do hotel. Ver `supabase/functions/create-reservation/index.ts`.
 */
export async function createReservation(input: {
  guestName: string;
  email: string;
  serviceType: string;
  date: string;
  totalAmount: number;
  notes: string;
}): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };

  try {
    const { data, error } = await getSupabase().functions.invoke<{
      reference?: string;
      error?: string;
    }>('create-reservation', {
      body: {
        guestName: input.guestName.trim(),
        email: input.email.trim().toLowerCase(),
        serviceType: input.serviceType,
        date: input.date,
        totalAmount: input.totalAmount,
        notes: input.notes,
      },
    });

    if (error) return { ok: false, error: error.message };
    if (!data?.reference) {
      return { ok: false, error: data?.error ?? 'A reserva não foi aceite.' };
    }
    return { ok: true, reference: data.reference };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Não foi possível contactar o serviço de reservas.',
    };
  }
}

export { ageLabel };
