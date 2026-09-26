/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isSupabaseConfigured, supabaseClient } from '@/lib/supabaseClient';

export type UserRole = 'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO';
export type UserStatus = 'ATIVO' | 'BLOQUEADO';

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
  status: UserStatus;
  mustChangePassword: boolean;
}

export type UserInput = Omit<User, 'authUserId' | 'tenantId' | 'mustChangePassword'> & {
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
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// password_hash/password_salt are physically removed by migration 005.
const PROFILE_COLUMNS = 'id,auth_user_id,tenant_id,email,employee_code,name,role,commission_rate,restrictions,allowed_modules,status,must_change_password,created_at,updated_at' as const;

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
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password)
  };
}

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase Auth não está configurado neste ambiente.');
  }
  return supabaseClient;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadUsers = async (profile: User): Promise<void> => {
    if (profile.role !== 'ADMINISTRATOR') {
      setUsers([]);
      return;
    }
    const client = requireSupabase();
    const { data, error } = await client
      .from('app_users')
      .select(PROFILE_COLUMNS)
      .eq('tenant_id', profile.tenantId)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    setUsers(((data || []) as unknown as ProfileRow[])
      .filter(row => typeof row.auth_user_id === 'string' && row.auth_user_id.length > 0)
      .map(row => mapProfile(row)));
  };

  const loadProfile = async (authUserId: string, fallbackEmail = ''): Promise<User | null> => {
    const client = requireSupabase();
    const { data, error } = await client
      .from('app_users')
      .select(PROFILE_COLUMNS)
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapProfile(data as unknown as ProfileRow, fallbackEmail);
  };

  const establishSession = async (authUserId: string, email: string): Promise<User | null> => {
    const profile = await loadProfile(authUserId, email);
    if (!profile) {
      await requireSupabase().auth.signOut();
      setUser(null);
      setUsers([]);
      setAuthError('A sua conta ainda não tem um perfil autorizado. Contacte o administrador.');
      return null;
    }
    if (profile.status !== 'ATIVO') {
      await requireSupabase().auth.signOut();
      setUser(null);
      setUsers([]);
      setAuthError('A sua conta está bloqueada. Contacte o administrador.');
      return null;
    }
    setUser(profile);
    setAuthError(null);
    await loadUsers(profile);
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

  const checkAccess = (path: string): boolean => {
    if (!user) return false;
    if (user.role === 'ADMINISTRATOR') return true;

    const cleanPath = path.split('?')[0].replace(/\/$/, '') || '/';
    if (cleanPath === '/') return true;
    if (user.restrictions.some(restriction => {
      const blocked = restriction.replace(/\/$/, '');
      return cleanPath === blocked || cleanPath.startsWith(`${blocked}/`);
    })) return false;

    if (user.role === 'ACESSO') {
      const moduleName = cleanPath.split('/').filter(Boolean)[0];
      if (!moduleName || !user.allowedModules.includes(moduleName)) return false;
    }
    return true;
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
      changeOwnPassword,
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
