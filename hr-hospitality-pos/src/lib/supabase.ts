import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import '@/global.css';

/**
 * Cliente Supabase do app POS.
 *
 * Ao contrário do app do cliente, o POS autentica sempre: é uma aplicação de
 * staff. A `anon key` é a única que entra no pacote — a autorização real é a
 * RLS combinada com o perfil em `app_users`.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!url || !anonKey) {
    throw new Error('Supabase não configurado: defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/** Identificador do operador, para `opened_by` / `closed_by`. */
export async function currentActorId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}
