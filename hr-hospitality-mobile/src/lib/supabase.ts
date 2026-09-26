import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import '@/global.css';

import { TENANT_ID } from '@/constants/hotel';

/**
 * Configuração pública do Supabase.
 *
 * A `anon key` é segura num cliente móvel: é embarcada na aplicação e a
 * segurança real vem da RLS (ver `migrations/supabase/005_secure_auth_and_rls.sql`
 * e `006_mobile_public_catalog.sql`). A `service_role` nunca entra no bundle.
 *
 * `EXPO_PUBLIC_` é o prefixo exigido pelo Expo para expor variáveis ao cliente.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase não configurado: defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    this.name = 'SupabaseNotConfiguredError';
  }
}

/**
 * O cliente é criado de forma preguiçosa para que a app arranque e mostre o
 * estado "não configurado" em vez de rebentar no arranque. Não há segredos
 * reais disponíveis aqui: sem configuração, qualquer chamada remota falha.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!url || !anonKey) throw new SupabaseNotConfiguredError();

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export { TENANT_ID, SupabaseNotConfiguredError };
