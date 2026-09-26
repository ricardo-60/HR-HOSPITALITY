/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Secure Electron SQLite transport.
 *
 * Raw SQL is intentionally absent from this module. Calls are forwarded over
 * a context-isolated IPC bridge to the closed operation registry in
 * `electron/operations.js`. Browser sessions fail closed and use Supabase;
 * they cannot access a machine-local database through an unauthenticated URL.
 */

export interface DBResult {
  changes: number;
  data?: unknown;
}

type ElectronAPI = {
  localDb?: {
    invoke: (operation: string, input?: unknown) => Promise<unknown>;
  };
};

function getElectronAPI(): ElectronAPI['localDb'] | null {
  if (typeof window === 'undefined') return null;
  return (window as any).electronAPI?.localDb || null;
}

async function invoke<T>(operation: string, input: unknown = {}): Promise<T> {
  const bridge = getElectronAPI();
  if (!bridge || typeof bridge.invoke !== 'function') {
    throw new Error('Acesso SQLite local indisponível neste ambiente. Use a sessão Supabase válida.');
  }
  return bridge.invoke(operation, input) as Promise<T>;
}

/** Execute one allowlisted local operation. */
export async function localOperation<T = unknown>(operation: string, input: unknown = {}): Promise<T> {
  return invoke<T>(operation, input);
}

/** Execute a read operation from the closed registry. */
export async function localQuery<T = any>(operation: string, input: unknown = {}): Promise<T> {
  const result = await invoke<{ data?: T }>(operation, input);
  return (result?.data ?? []) as T;
}

/** Execute a write operation from the closed registry. */
export async function localExecute<T = any>(operation: string, input: unknown = {}): Promise<T> {
  return invoke<T>(operation, input);
}

/** Check the local database through IPC; no HTTP health endpoint is trusted. */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const result = await invoke<{ status?: string }>('system.health', {});
    return result?.status === 'ok';
  } catch {
    return false;
  }
}
