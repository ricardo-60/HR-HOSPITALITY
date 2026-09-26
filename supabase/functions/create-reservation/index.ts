import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * HR-HOSPITALITY · Edge Function `create-reservation`
 * =================================================
 * Cria pedidos de reserva para hóspedes NÃO autenticados (app móvel / site).
 *
 * Porquê uma Edge Function em vez de `anon` com `INSERT` directo?
 *   Para devolver a referência ao cliente é preciso `SELECT`. E uma policy de
 *   `SELECT` ao nível da tabela não consegue provar "esta linha é a que acabei
 *   de criar" — o `anon` acabaria a ler TODAS as reservas do hotel, incluindo
 *   nome e email de outros hóspedes. Aqui o `service_role` fica confinado ao
 *   servidor e a resposta devolve apenas a referência da reserva nova.
 *
 * A referência é gerada por trigger na base de dados (ver migração 006), pelo
 * que o cliente nunca a escolhe.
 *
 * Rate limit deliberadamente simples: um pedido por IP a cada 30 s, em memória.
 * Não substitui um rate limit por infraestrutura, mas trava o abuso trivial.
 * Se a função escalar horizontalmente, mover este estado para o Redis/Upstash.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RATE_WINDOW_MS = 30_000;

const allowedOrigins = new Set(
  (Deno.env.get('APP_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

// Aplicações móveis enviam `Origin: null` (conteúdo de file:// no iOS/Android).
const ALLOW_NULL_ORIGIN = Deno.env.get('APP_ALLOW_NULL_ORIGIN') === 'true';

const SERVICE_CLIENT = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Existe para validar a forma do pedido antes de tocar na base de dados.
const ANON_CLIENT = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const serviceTypes = new Set([
  'quarto', 'piscina', 'evento', 'lavandaria',
  'conferencia', 'restaurante', 'transfer',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Limite por IP. Memória do processo: perde-se a cada cold start. */
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Poda simples para não crescer sem limite.
  if (hits.size > 5000) {
    for (const [key, stamps] of hits) {
      if (stamps.every(t => now - t >= RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > 3;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin === 'null' ? ALLOW_NULL_ORIGIN : allowedOrigins.has(origin ?? '');
  return {
    'Access-Control-Allow-Origin': allowed ? (origin ?? '') : '',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`Campo inválido: ${field}`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`Campo inválido: ${field}`);
  return trimmed;
}

/** Valida uma data ISO `YYYY-MM-DD` e rejeita dias no passado. */
function requiredFutureDate(value: unknown): string {
  const text = requiredString(value, 'date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Data inválida.');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Data inválida.');

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (parsed.getTime() < todayUtc) throw new Error('A data não pode ser no passado.');

  // Rejeita 2026-02-31 e similares.
  if (parsed.toISOString().slice(0, 10) !== text) throw new Error('Data inválida.');
  return text;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (origin && origin !== 'null' && !allowedOrigins.has(origin)) {
    return respond({ error: 'Origem não permitida.' }, 403);
  }
  if (origin === 'null' && !ALLOW_NULL_ORIGIN) {
    return respond({ error: 'Origem não permitida.' }, 403);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  try {
    if (rateLimited(ip)) {
      return respond({ error: 'Demasiados pedidos. Aguarde um momento.' }, 429);
    }

    const input = await request.json() as Record<string, unknown>;

    const guestName = requiredString(input.guestName, 'guestName', 160);
    const email = requiredString(input.email, 'email', 320).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error('Email inválido.');

    const serviceType = requiredString(input.serviceType, 'serviceType', 32);
    if (!serviceTypes.has(serviceType)) throw new Error('Serviço inválido.');

    const date = requiredFutureDate(input.date);
    const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : '';

    const totalAmount = Number(input.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 10_000_000) {
      throw new Error('Valor inválido.');
    }

    // Sessão opcional. Um hóspede com conta fica ligado ao seu perfil KYC, o
    // que permite à recepção ver documento e reserva no mesmo ecrã; um
    // hóspede sem conta também pode reservar, e a reserva fica só pelo email.
    const { data: sessionData } = await ANON_CLIENT.auth.getUser();
    const authUserId = sessionData?.user?.id ?? null;

    let guestProfileId: string | null = null;
    if (authUserId) {
      const { data: profile } = await SERVICE_CLIENT
        .from('guest_profiles')
        .select('id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      guestProfileId = profile?.id ?? null;
    }

    const { data, error } = await SERVICE_CLIENT
      .from('hotel_reservations')
      .insert({
        tenant_id: TENANT_ID,
        guest_profile_id: guestProfileId,
        guest_name: guestName,
        email,
        service_type: serviceType,
        status: 'PENDENTE_PAGAMENTO',
        reservation_date: date,
        total_amount: Math.round(totalAmount * 100) / 100,
        notes: notes || null,
      })
      .select('id, reference, status, total_amount, reservation_date')
      .single();

    if (error || !data) throw new Error('Não foi possível registar a reserva.');

    return respond(
      {
        reference: data.reference,
        status: data.status,
        totalAmount: data.total_amount,
        reservationDate: data.reservation_date,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar a reserva.';
    const status = /origem/i.test(message) ? 403 : /demasiados pedidos/i.test(message) ? 429 : 400;
    return respond({ error: message }, status);
  }
});
