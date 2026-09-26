/**
 * Registo e sessão do hóspede.
 *
 * A app do cliente tem duas camadas de identidade:
 *   - `anon` (sem sessão) — vê o catálogo público e submete reservas.
 *   - `authenticated` (com sessão) — tem perfil KYC, vê as suas reservas e
 *     envia comprovativos.
 *
 * O hóspede NÃO recebe permissões de staff. A RLS da migração 007 liga o perfil
 * a `auth_user_id`, e nenhuma policy de `app_users` se aplica a `anon` nem a
 * hóspedes.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type GuestSessionState = 'loading' | 'anon' | 'ready' | 'error';

export interface GuestAccount {
  authUserId: string;
  email: string;
}

export interface GuestProfileRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  document_type: 'BI' | 'PASSAPORTE';
  document_number: string;
  document_country: string | null;
  birth_date: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  kyc_status: 'PENDENTE' | 'EM_ANALISE' | 'APROVADO' | 'REJEITADO';
  kyc_notes: string | null;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

function message(error: { message: string } | null, fallback: string): string {
  const raw = error?.message ?? '';
  if (/invalid login credentials/i.test(raw)) return 'Email ou palavra-passe incorrectos.';
  if (/already registered|already been registered/i.test(raw)) return 'Já existe uma conta com este email.';
  if (/password should be at least/i.test(raw)) return 'A palavra-passe precisa de pelo menos 6 caracteres.';
  if (/email.*invalid/i.test(raw)) return 'Email inválido.';
  return raw ? raw : fallback;
}

export function onGuestSession(
  client: SupabaseClient,
  handler: (account: GuestAccount | null) => void,
): { unsubscribe: () => void } {
  const { data } = client.auth.onAuthStateChange((_event, session: Session | null) => {
    handler(
      session?.user
        ? { authUserId: session.user.id, email: session.user.email ?? '' }
        : null,
    );
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

export async function currentAccount(): Promise<GuestAccount | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await getSupabase().auth.getSession();
  if (!data.session?.user) return null;
  return { authUserId: data.session.user.id, email: data.session.user.email ?? '' };
}

export async function signUpGuest(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };
  try {
    const { data, error } = await getSupabase().auth.signUp({ email: email.trim().toLowerCase(), password });
    if (error) return { ok: false, error: message(error, 'Não foi possível criar a conta.') };
    // Sem confirmação por email, a sessão já vem activa. Com confirmação
    // activa, o hóspede tem de confirmar antes de ter perfil.
    if (!data.session) {
      return { ok: false, error: 'Confirme o email no link que enviámos e depois entre.' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível criar a conta.' };
  }
}

export async function signInGuest(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };
  try {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { ok: false, error: message(error, 'Não foi possível iniciar sessão.') };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível iniciar sessão.' };
  }
}

export async function signOutGuest(): Promise<void> {
  if (isSupabaseConfigured) await getSupabase().auth.signOut();
}

/** Perfil KYC do hóspede autenticado. `null` se ainda não existir. */
export async function fetchGuestProfile(): Promise<GuestProfileRow | null> {
  if (!isSupabaseConfigured) return null;
  const account = await currentAccount();
  if (!account) return null;
  const { data, error } = await getSupabase()
    .from('guest_profiles')
    .select(
      'id,auth_user_id,full_name,document_type,document_number,document_country,birth_date,nationality,phone,email,kyc_status,kyc_notes',
    )
    .eq('auth_user_id', account.authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GuestProfileRow | null) ?? null;
}

export interface KycInput {
  fullName: string;
  documentType: 'BI' | 'PASSAPORTE';
  documentNumber: string;
  documentCountry: string | null;
  birthDate: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Envia o perfil KYC.
 *
 * Se o perfil já existir, é actualizado; a RLS só permite ao próprio hóspede
 * escrever no seu, e a migração 007 impede que um hóspede se auto-aprove
 * (`kyc_status` tem de ser `PENDENTE` ou `EM_ANALISE` num INSERT).
 */
export async function submitKyc(input: KycInput): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };
  const account = await currentAccount();
  if (!account) return { ok: false, error: 'Inicie sessão para enviar os documentos.' };

  const payload = {
    full_name: input.fullName.trim(),
    document_type: input.documentType,
    document_number: input.documentNumber.trim().toUpperCase(),
    document_country: input.documentCountry,
    birth_date: input.birthDate || null,
    nationality: input.nationality?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || account.email,
    kyc_status: 'EM_ANALISE',
  };

  try {
    const client = getSupabase();
    const existing = await fetchGuestProfile();
    if (existing) {
      const { error } = await client
        .from('guest_profiles')
        .update(payload)
        .eq('id', existing.id)
        .eq('auth_user_id', account.authUserId);
      if (error) return { ok: false, error: message(error, 'Não foi possível actualizar o perfil.') };
    } else {
      const { error } = await client
        .from('guest_profiles')
        .insert({ ...payload, auth_user_id: account.authUserId, kyc_reviewed_by: null, kyc_reviewed_at: null });
      if (error) return { ok: false, error: message(error, 'Não foi possível registar o perfil.') };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao enviar o perfil.' };
  }
}
