/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DBResult {
  changes: number;
  data?: unknown;
}

type ElectronAPI = {
  localDb?: {
    invoke: (operation: string, input?: unknown) => Promise<unknown>;
  };
  getAppConfig?: () => { mode: string; serverIp: string };
};

const FIXED_LOCAL_TOKEN = 'hr-hospitality-local-fixed-token';
const DEFAULT_SERVER_PORT = 3002;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5000;

function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') return null;
  return (window as any).electronAPI || null;
}

async function getAppMode(): Promise<'client' | 'server'> {
  const api = getElectronAPI();
  if (api?.getAppConfig) {
    try {
      const config = await api.getAppConfig();
      return config.mode === 'client' ? 'client' : 'server';
    } catch {
      // Fall through to default
    }
  }
  return 'server';
}

async function getServerIp(): Promise<string> {
  const api = getElectronAPI();
  if (api?.getAppConfig) {
    try {
      const config = await api.getAppConfig();
      return config.serverIp || '127.0.0.1';
    } catch {
      // Fall through to default
    }
  }
  return '127.0.0.1';
}

async function invokeViaIPC<T>(operation: string, input: unknown = {}): Promise<T> {
  const bridge = getElectronAPI()?.localDb;
  if (!bridge || typeof bridge.invoke !== 'function') {
    throw new Error('IPC bridge not available');
  }
  return bridge.invoke(operation, input) as Promise<T>;
}

async function invokeViaHTTP<T>(operation: string, input: unknown = {}): Promise<T> {
  const serverIp = await getServerIp();
  const url = `http://${serverIp}:${DEFAULT_SERVER_PORT}/api/v1/operations`;
  
  let lastError: Error | null = null;
  let delay = INITIAL_RETRY_DELAY_MS;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIXED_LOCAL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation, input }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'HTTP request failed' } }));
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < MAX_RETRIES) {
        console.warn(`[localDB] HTTP request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS); // Exponential backoff
      }
    }
  }
  
  throw lastError || new Error('HTTP request failed after retries');
}

async function invoke<T>(operation: string, input: unknown = {}): Promise<T> {
  const mode = await getAppMode();
  
  if (mode === 'server') {
    // Server mode: use IPC bridge
    return invokeViaIPC<T>(operation, input);
  } else {
    // Client mode: use HTTP API to Servidor app
    return invokeViaHTTP<T>(operation, input);
  }
}

/** Execute one allowlisted local operation. */
export async function localOperation<T = unknown>(operation: string, input: unknown = {}): Promise<T> {
  return invoke<T>(operation, input);
}

/** Execute a read operation from the closed registry. */
export async function localQuery<T = any>(operation: string, input: unknown = {}): Promise<T> {
  const result = await invoke<any>(operation, input);
  // Server mode (IPC) returns the operation result directly (e.g. { data: [...] }).
  // Client mode (HTTP) wraps it once more as { ok: true, data: <operation result> }.
  // Normalize so callers always receive the operation result's payload.
  const envelope =
    result && typeof result === 'object' && 'ok' in result && 'data' in result
      ? result.data
      : result;
  return (envelope?.data ?? envelope ?? []) as T;
}

/** Execute a write operation from the closed registry. */
export async function localExecute<T = any>(operation: string, input: unknown = {}): Promise<T> {
  return invoke<T>(operation, input);
}

/** Check the local database through IPC (server) or HTTP (client). */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const result = await invoke<{ status?: string }>('system.health', {});
    return result?.status === 'ok';
  } catch {
    return false;
  }
}