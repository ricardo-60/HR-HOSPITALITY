/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isSupabaseConfigured, supabaseClient } from '@/lib/supabaseClient';

/**
 * Perfis de staff.
 *
 * `POS`      opera o ponto de venda e as comandas.
 * `EXECUTIVO` é o dono/gerência: leitura integral, e a RLS nega-lhe escrita
 *             por construção (a migração 007 não cria policies de escrita
 *             para este perfil). O bloqueio é do lado do servidor, não da UI.
 */
export type UserRole = 'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO' | 'POS' | 'EXECUTIVO';
export type UserStatus = 'ATIVO' | 'BLOQUEADO';

/** Rotas que exigem perfil de administrador, para além da RLS. */
const ADMIN_ONLY_PATHS = ['/rh/usuarios', '/admin'];

/**
 * Rotas exclusivas do Utilizador Master Global (`is_master_global`).
 * Vêm antes de `ADMIN_ONLY_PATHS`: um administrador comum de instância
 * não entra aqui, mesmo que a rota comece por `/admin`.
 */
const MASTER_ONLY_PATHS = ['/master'];

/**
 * Permissões granulares por módulo (RBAC multi-funções).
 *
 * Um funcionário pode receber VÁRIAS destas chaves ao mesmo tempo — por
 * exemplo `pos_cashier` + `bar_snack` + `financial` — e passa a operar
 * exactamente esses módulos. O campo `permissions` vazio significa "sem
 * âmbito granular", que é o estado de todos os perfis já existentes.
 */
export const PERMISSION_MODULES = [
  { key: 'pos_cashier', name: 'Caixa (POS)', description: 'Comandas, mesas e liquidação do ponto de venda.', paths: ['/pos'] },
  { key: 'bar_snack', name: 'Bar / Snack-Bar', description: 'Snack-bar, esplanada e piscina.', paths: ['/snack-bar'] },
  { key: 'reception', name: 'Recepção / Quartos', description: 'Alojamento, check-in, KYC e comprovativos.', paths: ['/alojamento', '/comprovativos', '/kyc'] },
  { key: 'financial', name: 'Financeiro / Despesas', description: 'Despesas diárias, razão e IBANs.', paths: ['/financeiro'] },
  { key: 'housekeeping', name: 'Governança / Limpeza', description: 'Limpeza, manutenção e áreas comuns.', paths: ['/facilities'] },
  { key: 'reports', name: 'Relatórios', description: 'Suite de relatórios gerenciais.', paths: ['/relatorios'] },
  { key: 'company_admin', name: 'Admin da Empresa', description: 'Parâmetros da empresa, RH e utilizadores.', paths: ['/configuracoes', '/rh', '/admin'] },
] as const;

export type PermissionKey = (typeof PERMISSION_MODULES)[number]['key'];

/** Estado da licença devolvido por `hr_license_state()` (migração 010). */
export interface LicenseState {
  has_license: boolean;
  license_key: string | null;
  license_type: string | null;
  status: string;
  effective_status: string;
  starts_at?: string | null;
  expires_at?: string | null;
  grace_period_days?: number | null;
  is_paid?: boolean | null;
  days_left: number | null;
  is_expired: boolean;
}

export interface User {
  /** Employee code used by the UI. It is not the Supabase Auth UUID. */
  id: string;
  authUserId: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  commissionRate: number;
  restrictions: string[];
  allowedModules: string[];
  /** RBAC granular. Lista vazia = sem âmbito granular. */
  permissions: string[];
  /** Master Global: acesso vitalício, imune a expiração de licença. */
  isMasterGlobal: boolean;
  status: UserStatus;
  mustChangePassword: boolean;
}

export type UserInput = Omit<User, 'authUserId' | 'tenantId' | 'mustChangePassword' | 'isMasterGlobal'> & {
  mustChangePassword?: boolean;
};

interface AuthContextType {
  user: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<boolean>;
  authError: string | null;
  logout: () => Promise<void>;
  registerUser: (newUser: UserInput) => Promise<void>;
  updateUser: (updatedUser: UserInput) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  checkAccess: (path: string) => boolean;
  /** `true` quando a permissão granular está atribuída (ou não há restrição). */
  hasPermission: (permission: PermissionKey | string) => boolean;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /** Licença da instância; `null` enquanto carrega ou se a 010 ainda não correu. */
  license: LicenseState | null;
  /** Recarrega o estado da licença (usado após renovação no painel master). */
  refreshLicense: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// password_hash/password_salt are physically removed by migration 005.
const PROFILE_COLUMNS_LEGACY = 'id,auth_user_id,tenant_id,email,employee_code,name,role,commission_rate,restrictions,allowed_modules,status,must_change_password,created_at,updated_at' as const;

// A 010 acrescenta `is_master_global` e `permissions`. A query tenta sempre
// esta lista primeiro e só cai para a legada se a migração ainda não tiver
// sido aplicada — assim um deploy na ordem errada não impede o login.
const PROFILE_COLUMNS = `${PROFILE_COLUMNS_LEGACY},is_master_global,permissions` as const;

type ProfileRow = {
  id: string;
  auth_user_id: string;
  tenant_id: string;
  email?: string | null;
  employee_code?: string | null;
  name: string;
  role: UserRole;
  commission_rate?: number | null;
  restrictions?: unknown;
  allowed_modules?: unknown;
  permissions?: unknown;
  is_master_global?: boolean | null;
  status: UserStatus;
  must_change_password?: boolean | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function mapProfile(row: ProfileRow, fallbackEmail = ''): User {
  const email = String(row.email || fallbackEmail).trim();
  return {
    id: String(row.employee_code || email || row.auth_user_id),
    authUserId: row.auth_user_id,
    tenantId: row.tenant_id,
    email,
    name: row.name,
    role: row.role,
    commissionRate: Number(row.commission_rate || 0),
    restrictions: stringArray(row.restrictions),
    allowedModules: stringArray(row.allowed_modules),
    permissions: stringArray(row.permissions),
    isMasterGlobal: row.is_master_global === true,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password)
  };
}

/**
 * Executa uma query de perfis com a lista de colunas nova e, se a base de
 * dados ainda não tiver a migração 010 aplicada, repete-a com a lista
 * legada. Assim um deploy na ordem errada degrada em silêncio — `permissions`
 * fica `[]` e `isMasterGlobal` fica `false` — em vez de impedir o login.
 */
async function selectWithFallback<T>(
  build: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T | null> {
  const full = await build(PROFILE_COLUMNS);
  if (!full.error) return (full.data ?? null) as T | null;
  if (!/does not exist|\bcolumn\b|42703/i.test(full.error.message)) {
    throw new Error(full.error.message);
  }
  const legacy = await build(PROFILE_COLUMNS_LEGACY);
  if (legacy.error) throw new Error(legacy.error.message);
  return (legacy.data ?? null) as T | null;
}

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase Auth não está configurado neste ambiente.');
  }
  return supabaseClient;
}

/**
 * A permissão granular só restringe rotas que pertencem a um módulo
 * declarado em `PERMISSION_MODULES`. Um segmento sem módulo associado
 * (login, alteração de palavra-passe, ajuda…) não é restringido, para que
 * atribuir `pos_cashier` a alguém não o trancar fora da própria conta.
 */
function pathAllowedByPermissions(path: string, permissions: string[]): boolean {
  const segment = path.split('/').filter(Boolean)[0];
  if (!segment) return true;
  const covering = PERMISSION_MODULES.filter(module =>
    module.paths.some(modulePath => modulePath.split('/').filter(Boolean)[0] === segment)
  );
  if (covering.length === 0) return true;
  return covering.some(module => permissions.includes(module.key));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadUsers = async (profile: User): Promise<void> => {
    if (profile.role !== 'ADMINISTRATOR') {
      setUsers([]);
      return;
    }
    const client = requireSupabase();
    const rows = await selectWithFallback<ProfileRow[]>(async query => {
      const { data, error } = await client
        .from('app_users')
        .select(query)
        .eq('tenant_id', profile.tenantId)
        .order('name', { ascending: true });
      return { data, error };
    });
    setUsers((rows || [])
      .filter(row => typeof row.auth_user_id === 'string' && row.auth_user_id.length > 0)
      .map(row => mapProfile(row)));
  };

  const loadProfile = async (authUserId: string, fallbackEmail = ''): Promise<User | null> => {
    const client = requireSupabase();
    const row = await selectWithFallback<ProfileRow>(async query => {
      const { data, error } = await client
        .from('app_users')
        .select(query)
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      return { data, error };
    });
    if (!row) return null;
    return mapProfile(row, fallbackEmail);
  };

  /**
   * Estado da licença da instância. Nunca lança: se a migração 010 ainda não
   * tiver corrido, ou se o RPC falhar, fica `null` e ninguém é bloqueado.
   */
  const refreshLicense = async (): Promise<void> => {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.rpc('hr_license_state');
      if (error) {
        setLicense(null);
        if (!/does not exist|42883|PGRST202/i.test(error.message)) {
          console.warn('hr_license_state:', error.message);
        }
        return;
      }
      setLicense(data && typeof data === 'object' ? (data as LicenseState) : null);
    } catch {
      setLicense(null);
    }
  };

  const establishSession = async (authUserId: string, email: string): Promise<User | null> => {
    const profile = await loadProfile(authUserId, email);
    if (!profile) {
      await requireSupabase().auth.signOut();
      setUser(null);
      setUsers([]);
      setLicense(null);
      setAuthError('A sua conta ainda não tem um perfil autorizado. Contacte o administrador.');
      return null;
    }
    if (profile.status !== 'ATIVO') {
      await requireSupabase().auth.signOut();
      setUser(null);
      setUsers([]);
      setLicense(null);
      setAuthError('A sua conta está bloqueada. Contacte o administrador.');
      return null;
    }
    setUser(profile);
    setAuthError(null);
    await loadUsers(profile);
    await refreshLicense();
    return profile;
  };

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const initialise = async () => {
      // Remove the insecure legacy identity store. Password hashes are never
      // migrated into Supabase Auth and are intentionally discarded.
      try {
        localStorage.removeItem('hr_users');
        localStorage.removeItem('hr_active_user');
        localStorage.removeItem('hr_demo_accounts_disabled_v1');
      } catch { /* storage may be unavailable */ }

      if (!isSupabaseConfigured || !supabaseClient) {
        if (!cancelled) {
          setAuthError('Supabase Auth não está configurado. Contacte o administrador.');
          setMounted(true);
        }
        return;
      }

      const { data } = await supabaseClient.auth.getSession();
      if (data.session?.user) {
        try {
          await establishSession(data.session.user.id, data.session.user.email || '');
        } catch (error) {
          if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Falha ao carregar o perfil.');
        }
      }

      const authSubscription = supabaseClient.auth.onAuthStateChange((_event, session) => {
        // Supabase recommends deferring async work outside the auth callback.
        window.setTimeout(() => {
          if (cancelled) return;
          if (!session?.user) {
            setUser(null);
            setUsers([]);
            setAuthError(null);
            return;
          }
          void establishSession(session.user.id, session.user.email || '').catch(error => {
            setAuthError(error instanceof Error ? error.message : 'Falha ao atualizar a sessão.');
          });
        }, 0);
      });
      subscription = authSubscription.data.subscription;
      if (!cancelled) setMounted(true);
    };

    void initialise();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    const normalisedEmail = email.trim().toLowerCase();
    if (!normalisedEmail || !password) {
      setAuthError('Introduza o email e a palavra-passe.');
      return false;
    }

    try {
      const client = requireSupabase();
      const { data, error } = await client.auth.signInWithPassword({
        email: normalisedEmail,
        password
      });
      if (error || !data.user) {
        setAuthError('Credenciais inválidas.');
        return false;
      }
      const profile = await establishSession(data.user.id, data.user.email || normalisedEmail);
      return profile?.status === 'ATIVO';
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível iniciar sessão.');
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    setUser(null);
    setUsers([]);
    setLicense(null);
    setAuthError(null);
    if (supabaseClient) await supabaseClient.auth.signOut();
  };

  const registerUser = async (newUser: UserInput): Promise<void> => {
    if (user?.role !== 'ADMINISTRATOR') throw new Error('Apenas administradores podem convidar utilizadores.');
    const client = requireSupabase();
    const { error } = await client.functions.invoke('admin-users', {
      body: {
        action: 'invite',
        email: newUser.email,
        employeeCode: newUser.id,
        name: newUser.name,
        role: newUser.role,
        commissionRate: newUser.commissionRate,
        restrictions: newUser.restrictions,
        allowedModules: newUser.allowedModules,
        permissions: newUser.permissions,
        status: newUser.status
      }
    });
    if (error) throw new Error(error.message);
    await loadUsers(user);
  };

  const updateUser = async (updatedUser: UserInput): Promise<void> => {
    if (user?.role !== 'ADMINISTRATOR') throw new Error('Apenas administradores podem alterar utilizadores.');
    const client = requireSupabase();
    const { error } = await client.functions.invoke('admin-users', {
      body: {
        action: 'update',
        profileEmployeeCode: updatedUser.id,
        email: updatedUser.email,
        employeeCode: updatedUser.id,
        name: updatedUser.name,
        role: updatedUser.role,
        commissionRate: updatedUser.commissionRate,
        restrictions: updatedUser.restrictions,
        allowedModules: updatedUser.allowedModules,
        permissions: updatedUser.permissions,
        status: updatedUser.status
      }
    });
    if (error) throw new Error(error.message);
    await loadUsers(user);
    if (user.id === updatedUser.id) {
      const refreshed = await loadProfile(user.authUserId, user.email);
      if (refreshed) setUser(refreshed);
    }
  };

  const deleteUser = async (id: string): Promise<void> => {
    if (user?.role !== 'ADMINISTRATOR') throw new Error('Apenas administradores podem eliminar utilizadores.');
    if (user.id === id) throw new Error('Não é possível eliminar a conta em sessão.');
    const target = users.find(item => item.id === id);
    if (!target) throw new Error('Utilizador não encontrado.');
    const client = requireSupabase();
    const { error } = await client.functions.invoke('admin-users', {
      body: { action: 'delete', profileEmployeeCode: target.id }
    });
    if (error) throw new Error(error.message);
    await loadUsers(user);
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user || !supabaseClient) return false;
    if (newPassword.length < 8 || newPassword === currentPassword) return false;

    const { error } = await supabaseClient.functions.invoke('admin-users', {
      body: { action: 'change-password', currentPassword, newPassword }
    });
    if (error) {
      setAuthError(error.message);
      return false;
    }

    setUser({ ...user, mustChangePassword: false });
    return true;
  };

  /**
   * Módulos que cada perfil pode abrir, espelhando `hr_can_module` e
   * `hr_can_write_module` da migração 007. Este mapa serve a interface; a
   * autorização real continua a ser a RLS.
   */
  const MODULES_BY_ROLE: Record<UserRole, string[] | '*'> = {
    ADMINISTRATOR: '*',
    PERMISSAO: '*',
    ACESSO: user?.allowedModules ?? [],
    POS: ['pos', 'snack-bar', 'spa', 'alojamento'],
    // O executivo vê tudo e não escreve em nada. As rotas de escrita são
    // recusadas aqui e na RLS.
    EXECUTIVO: '*',
  };

  const WRITE_ROLES: UserRole[] = ['ADMINISTRATOR', 'PERMISSAO', 'ACESSO', 'POS'];

  const checkAccess = (path: string): boolean => {
    if (!user) return false;

    const cleanPath = path.split('?')[0].replace(/\/$/, '') || '/';
    if (cleanPath === '/') return true;

    // Master Global: acesso vitalício, omnipresente e imune a qualquer
    // bloqueio de licença ou de módulo. Entra em /master; os outros não.
    if (user.isMasterGlobal) return true;

    if (MASTER_ONLY_PATHS.some(root => cleanPath === root || cleanPath.startsWith(`${root}/`))) {
      return false;
    }

    if (ADMIN_ONLY_PATHS.some(blocked => cleanPath === blocked || cleanPath.startsWith(`${blocked}/`))) {
      return user.role === 'ADMINISTRATOR';
    }

    // RBAC granular: só quem tem permissões atribuídas é por elas limitado.
    // Lista vazia = sem âmbito granular, que é o estado legado de todos os
    // perfis já existentes — por isso nada muda para quem não foi editado.
    if (user.permissions.length > 0 && !pathAllowedByPermissions(cleanPath, user.permissions)) {
      return false;
    }

    // A gerência é só de leitura: nenhuma rota de mutação lhe é aberta.
    // Abre-se-lhe a suite de relatórios, que é pura leitura.
    if (!WRITE_ROLES.includes(user.role)) {
      if (user.role !== 'EXECUTIVO') return false;
      return ['/relatorios'].some(root => cleanPath === root || cleanPath.startsWith(`${root}/`));
    }

    if (user.restrictions.some(restriction => {
      const blocked = restriction.replace(/\/$/, '');
      return cleanPath === blocked || cleanPath.startsWith(`${blocked}/`);
    })) return false;

    const allowed = MODULES_BY_ROLE[user.role];
    if (allowed === '*') return true;
    if (user.role === 'ACESSO') {
      const moduleName = cleanPath.split('/').filter(Boolean)[0];
      if (!moduleName) return true;
      return allowed.includes(moduleName);
    }
    return true;
  };

  /**
   * Permissão granular do utilizador. Lista vazia = sem restrição; o Master
   * Global tem todas.
   */
  const hasPermission = (permission: PermissionKey | string): boolean => {
    if (!user) return false;
    if (user.isMasterGlobal) return true;
    if (user.permissions.length === 0) return true;
    return user.permissions.includes(permission);
  };

  if (!mounted) return null;

  return (
    <AuthContext.Provider value={{
      user,
      users,
      login,
      logout,
      registerUser,
      updateUser,
      deleteUser,
      checkAccess,
      hasPermission,
      changeOwnPassword,
      license,
      refreshLicense,
      authError
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
