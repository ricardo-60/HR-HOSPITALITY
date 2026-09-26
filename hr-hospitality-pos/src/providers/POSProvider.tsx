import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { UserRole } from '@/providers/types';

interface StaffProfile {
  authUserId: string;
  tenantId: string;
  name: string;
  role: UserRole;
  status: 'ATIVO' | 'BLOQUEADO';
}

interface POSContextValue {
  session: 'loading' | 'anon' | 'ready' | 'blocked';
  profile: StaffProfile | null;
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  error: string | null;
  signingIn: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** `EXECUTIVO` e `ADMINISTRATOR` não operam o POS. */
  canOperate: boolean;
  tenantName: string | null;
}

const PROFILE_COLUMNS = 'auth_user_id,tenant_id,name,role,status';

const POSContext = createContext<POSContextValue>({
  session: 'anon',
  profile: null,
  email: '',
  password: '',
  setEmail: () => {},
  setPassword: () => {},
  error: null,
  signingIn: false,
  signIn: async () => false,
  signOut: async () => {},
  canOperate: false,
  tenantName: null,
});

/**
 * Sessão de staff do POS.
 *
 * O perfil vem de `app_users` — nunca de `user_metadata`, que o utilizador
 * controla. A RLS garante que a linha é do próprio tenant; se o perfil não
 * existir ou estiver bloqueado, a sessão é encerrada.
 */
export function POSProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<POSContextValue['session']>('loading');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const loadProfile = useCallback(async (authUserId: string) => {
    const client = getSupabase();
    const { data, error: profileError } = await client
      .from('app_users')
      .select(PROFILE_COLUMNS)
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!data) return null;

    const { data: tenant } = await client
      .from('tenants')
      .select('name')
      .eq('id', data.tenant_id)
      .maybeSingle();
    setTenantName(tenant?.name ?? null);

    return {
      authUserId: data.auth_user_id,
      tenantId: data.tenant_id,
      name: data.name,
      role: data.role as UserRole,
      status: data.status,
    } as StaffProfile;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) setSession('anon');
        return;
      }

      const { data } = await getSupabase().auth.getSession();
      if (cancelled) return;

      if (!data.session?.user) {
        setSession('anon');
        return;
      }

      try {
        const loaded = await loadProfile(data.session.user.id);
        if (cancelled) return;
        if (!loaded || loaded.status !== 'ATIVO') {
          await getSupabase().auth.signOut();
          setProfile(null);
          setSession('blocked');
          return;
        }
        setProfile(loaded);
        setSession('ready');
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o perfil.');
        setSession('blocked');
      }
    };

    void initialise();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      const normalised = email.trim().toLowerCase();
      if (!normalised || !password) {
        setError('Introduza o email e a palavra-passe.');
        return false;
      }
      const client = getSupabase();
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: normalised,
        password,
      });
      if (signInError || !data.user) {
        setError('Credenciais inválidas.');
        return false;
      }
      const loaded = await loadProfile(data.user.id);
      if (!loaded || loaded.status !== 'ATIVO') {
        await client.auth.signOut();
        setError('A sua conta não tem um perfil activo neste hotel.');
        setSession('blocked');
        return false;
      }
      setProfile(loaded);
      setSession('ready');
      setPassword('');
      return true;
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Não foi possível iniciar sessão.');
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [email, password, loadProfile]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await getSupabase().auth.signOut();
    setProfile(null);
    setTenantName(null);
    setSession('anon');
  }, []);

  const value = useMemo<POSContextValue>(
    () => ({
      session,
      profile,
      tenantName,
      email,
      password,
      setEmail,
      setPassword,
      error,
      signingIn,
      signIn,
      signOut,
      canOperate: profile !== null && ['ADMINISTRATOR', 'PERMISSAO', 'ACESSO', 'POS'].includes(profile.role),
    }),
    [session, profile, tenantName, email, password, error, signingIn, signIn, signOut],
  );

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}

export function usePOS(): POSContextValue {
  return useContext(POSContext);
}
