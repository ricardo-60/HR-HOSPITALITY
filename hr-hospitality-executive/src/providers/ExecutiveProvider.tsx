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
import type { UserRole } from '@/types/executive';

interface ExecutiveProfile {
  authUserId: string;
  tenantId: string;
  name: string;
  role: UserRole;
  status: 'ATIVO' | 'BLOQUEADO';
}

/**
 * Perfis com acesso à app de gestão.
 *
 * `EXECUTIVO` é o perfil do dono/gerência. `ADMINISTRATOR` também entra,
 * porque o dono é muitas vezes a mesma pessoa que administra — mas a app é de
 * leitura para toda a gente: a RLS não tem policies de escrita para o perfil
 * executivo, e esta app nem sequer expõe ações de escrita.
 */
const ALLOWED_ROLES: UserRole[] = ['EXECUTIVO', 'ADMINISTRATOR'];

interface ExecutiveContextValue {
  session: 'loading' | 'anon' | 'ready' | 'forbidden';
  profile: ExecutiveProfile | null;
  tenantName: string | null;
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  error: string | null;
  signingIn: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const PROFILE_COLUMNS = 'auth_user_id,tenant_id,name,role,status';
const noop = () => {};

const ExecutiveContext = createContext<ExecutiveContextValue>({
  session: 'anon',
  profile: null,
  tenantName: null,
  email: '',
  password: '',
  setEmail: noop,
  setPassword: noop,
  error: null,
  signingIn: false,
  signIn: async () => false,
  signOut: async () => {},
});

export function ExecutiveProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ExecutiveContextValue['session']>('loading');
  const [profile, setProfile] = useState<ExecutiveProfile | null>(null);
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

    const { data: tenant } = await client.from('tenants').select('name').eq('id', data.tenant_id).maybeSingle();
    setTenantName(tenant?.name ?? null);

    return {
      authUserId: data.auth_user_id,
      tenantId: data.tenant_id,
      name: data.name,
      role: data.role as UserRole,
      status: data.status,
    } as ExecutiveProfile;
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
        if (!loaded || loaded.status !== 'ATIVO' || !ALLOWED_ROLES.includes(loaded.role)) {
          await getSupabase().auth.signOut();
          setProfile(null);
          setSession('forbidden');
          return;
        }
        setProfile(loaded);
        setSession('ready');
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o perfil.');
        setSession('forbidden');
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
      if (!loaded || loaded.status !== 'ATIVO' || !ALLOWED_ROLES.includes(loaded.role)) {
        await client.auth.signOut();
        setError('Esta app é exclusiva de proprietários e gerência.');
        setSession('forbidden');
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

  const value = useMemo<ExecutiveContextValue>(
    () => ({ session, profile, tenantName, email, password, setEmail, setPassword, error, signingIn, signIn, signOut }),
    [session, profile, tenantName, email, password, error, signingIn, signIn, signOut],
  );

  return <ExecutiveContext.Provider value={value}>{children}</ExecutiveContext.Provider>;
}

export function useExecutive(): ExecutiveContextValue {
  return useContext(ExecutiveContext);
}
