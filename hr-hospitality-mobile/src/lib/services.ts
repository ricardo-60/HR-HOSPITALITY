/** IBANs do hotel, passes de ginásio e comprovativos. */

import { CACHE_TTL, ageLabel, freshness, readCache, writeCache, type CacheFreshness } from '@/lib/cache';
import { currentAccount } from '@/lib/guestAuth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type QueryResult<T> = {
  data: T;
  state: CacheFreshness;
  cachedAt: number | null;
  usedFallback: boolean;
  error: string | null;
};

/* ── IBANs ──────────────────────────────────────────────────────────────── */

export interface BankAccount {
  id: string;
  bank_name: string;
  iban: string;
  account_holder: string;
  currency: string;
  supports_multicaixa_express: boolean;
  is_primary: boolean;
  instructions: string | null;
}

/**
 * IBANs activos do hotel.
 *
 * A RLS da migração 007 só concede `SELECT` a linhas activas do próprio tenant,
 * e apenas por colunas de pagamento — o hóspede vê IBAN, banco, titular e a
 * instrução, e nada mais. Este cache é deliberado: sem rede, o hóspede ainda
 * consegue pagar, que é o momento em que mais falta faz.
 */
export async function fetchBankAccounts(): Promise<QueryResult<BankAccount[]>> {
  const cached = await readCache<BankAccount[]>('bank-accounts');

  if (!isSupabaseConfigured) {
    return { data: cached?.value ?? [], state: freshness(cached, CACHE_TTL.priceList), cachedAt: cached?.storedAt ?? null, usedFallback: !cached, error: 'Supabase não configurado.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('tenant_bank_accounts')
      .select('id,bank_name,iban,account_holder,currency,supports_multicaixa_express,is_primary,instructions')
      .eq('is_active', true)
      .order('is_primary', { ascending: false });
    if (error) throw new Error(error.message);
    const accounts = (data ?? []) as BankAccount[];
    await writeCache('bank-accounts', accounts);
    return { data: accounts, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.priceList),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar os IBANs.',
    };
  }
}

export { ageLabel };

/* ── Ginásio ────────────────────────────────────────────────────────────── */

export interface GymPlan {
  id: string;
  name: string;
  plan_type: 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';
  price: number;
  duration_days: number;
  guest_discount_pct: number;
  guest_included: boolean;
  description: string | null;
}

export interface GymPass {
  id: string;
  plan_id: string;
  holder_name: string;
  is_guest_included: boolean;
  price_paid: number;
  status: 'ATIVO' | 'USADO' | 'EXPIRADO' | 'CANCELADO';
  issued_at: string;
  valid_until: string;
}

const GYM_PLAN_COLUMNS =
  'id,name,plan_type,price,duration_days,guest_discount_pct,guest_included,description';

/**
 * Catálogo de modalidades.
 *
 * `gym_plans` é público por decisão de schema: o preço de umginásio é
 * informação de mercado, e escondê-lo só empurraria o hóspede a perguntar à
 * recepção. A regra de desconto também vem junto, para o cliente saber quanto
 * paga como hóspede.
 */
export async function fetchGymPlans(): Promise<QueryResult<GymPlan[]>> {
  const cached = await readCache<GymPlan[]>('gym-plans');

  if (!isSupabaseConfigured) {
    return { data: cached?.value ?? [], state: freshness(cached, CACHE_TTL.priceList), cachedAt: cached?.storedAt ?? null, usedFallback: !cached, error: 'Supabase não configurado.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('gym_plans')
      .select(GYM_PLAN_COLUMNS)
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(error.message);
    const plans = ((data ?? []) as GymPlan[]).map(plan => ({
      ...plan,
      price: typeof plan.price === 'string' ? Number.parseFloat(plan.price) : Number(plan.price),
      guest_discount_pct:
        typeof plan.guest_discount_pct === 'string' ? Number.parseFloat(plan.guest_discount_pct) : Number(plan.guest_discount_pct),
    }));
    await writeCache('gym-plans', plans);
    return { data: plans, state: 'fresh', cachedAt: Date.now(), usedFallback: false, error: null };
  } catch (err) {
    return {
      data: cached?.value ?? [],
      state: freshness(cached, CACHE_TTL.priceList),
      cachedAt: cached?.storedAt ?? null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar o ginásio.',
    };
  }
}

/**
 * Preço que um hóspede paga num plano.
 *
 * `guest_included` significa acesso incluído na diária do quarto: nesse caso o
 * hóspede não paga. É a regra que o checkout usa e que a RLS confirma na
 * emissão do passe.
 */
export function guestPriceFor(plan: GymPlan): number {
  if (plan.guest_included) return 0;
  const discounted = plan.price * (1 - plan.guest_discount_pct / 100);
  return Math.round(discounted * 100) / 100;
}

/** Passes do hóspede autenticado. Requer sessão: é um documento pessoal. */
export async function fetchGuestPasses(): Promise<QueryResult<GymPass[]>> {
  if (!isSupabaseConfigured) {
    return { data: [], state: 'missing', cachedAt: null, usedFallback: false, error: 'Supabase não configurado.' };
  }
  const account = await currentAccount();
  if (!account) {
    return { data: [], state: 'missing', cachedAt: null, usedFallback: false, error: 'Inicie sessão para ver os seus passes.' };
  }

  try {
    const { data: profile } = await getSupabase()
      .from('guest_profiles')
      .select('id')
      .eq('auth_user_id', account.authUserId)
      .maybeSingle();
    if (!profile) {
      return { data: [], state: 'fresh', cachedAt: null, usedFallback: false, error: null };
    }

    const { data, error } = await getSupabase()
      .from('gym_access_passes')
      .select('id,plan_id,holder_name,is_guest_included,price_paid,status,issued_at,valid_until')
      .eq('guest_profile_id', profile.id)
      .order('issued_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    const passes = ((data ?? []) as GymPass[]).map(pass => ({
      ...pass,
      price_paid: typeof pass.price_paid === 'string' ? Number.parseFloat(pass.price_paid) : Number(pass.price_paid),
    }));
    return { data: passes, state: 'fresh', cachedAt: null, usedFallback: false, error: null };
  } catch (err) {
    return {
      data: [],
      state: 'missing',
      cachedAt: null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar os passes.',
    };
  }
}

type IssueResult = { ok: true; passId: string } | { ok: false; error: string };

/**
 * Emite um passe de ginásio.
 *
 * O `valid_until` é calculado por trigger na base de dados a partir da duração
 * do plano, e a RLS exige que `price_paid` bata certo com o preço do plano
 * para o hóspede. Não há, portanto, caminho para emitir um passe de cortesia
 * pago por um hóspede.
 */
export async function issueGymPass(plan: GymPlan): Promise<IssueResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };
  const account = await currentAccount();
  if (!account) return { ok: false, error: 'Inicie sessão para emitir o passe.' };

  try {
    const { data: profile } = await getSupabase()
      .from('guest_profiles')
      .select('id,full_name,tenant_id')
      .eq('auth_user_id', account.authUserId)
      .maybeSingle();
    if (!profile) return { ok: false, error: 'Complete primeiro o registo do hóspede.' };

    const { data, error } = await getSupabase()
      .from('gym_access_passes')
      .insert({
        plan_id: plan.id,
        guest_profile_id: profile.id,
        holder_name: profile.full_name,
        is_guest_included: plan.guest_included,
        price_paid: guestPriceFor(plan),
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, passId: data.id as string };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao emitir o passe.' };
  }
}

/* ── Comprovativos ──────────────────────────────────────────────────────── */

export interface PaymentProofRow {
  id: string;
  reservation_id: string | null;
  amount: number;
  method: string;
  status: 'EM_ANALISE' | 'APROVADO' | 'REJEITADO';
  review_notes: string | null;
  created_at: string;
}

/** Comprovativos enviados pelo hóspede autenticado. */
export async function fetchMyProofs(): Promise<QueryResult<PaymentProofRow[]>> {
  if (!isSupabaseConfigured) {
    return { data: [], state: 'missing', cachedAt: null, usedFallback: false, error: 'Supabase não configurado.' };
  }
  const account = await currentAccount();
  if (!account) {
    return { data: [], state: 'missing', cachedAt: null, usedFallback: false, error: 'Inicie sessão para ver os comprovativos.' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('payment_proofs')
      .select('id,reservation_id,amount,method,status,review_notes,created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as PaymentProofRow[]).map(row => ({
      ...row,
      amount: typeof row.amount === 'string' ? Number.parseFloat(row.amount) : Number(row.amount),
    }));
    return { data: rows, state: 'fresh', cachedAt: null, usedFallback: false, error: null };
  } catch (err) {
    return {
      data: [],
      state: 'missing',
      cachedAt: null,
      usedFallback: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar os comprovativos.',
    };
  }
}
