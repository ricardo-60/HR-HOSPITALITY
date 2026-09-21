/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Driver da Base de Dados Local (SQLite) - HR-HOSPITALITY
 * Permite interagir com a base de dados local SQLite rodando no servidor Express
 * (porta 3002) de forma transparente para o frontend Next.js.
 */
export interface DBResult {
  changes: number;
  lastInsertRowid?: number | string;
}

// Obter o base URL do servidor local (porta 3002)
function getServerUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. Verificar localStorage
    const savedIp = localStorage.getItem('server_ip');
    if (savedIp) {
      return `http://${savedIp}:3002`;
    }

    // 2. Verificar via Electron API
    const win = window as any;
    if (win.electronAPI && typeof win.electronAPI.getAppConfig === 'function') {
      try {
        const config = win.electronAPI.getAppConfig();
        if (config && config.serverIp) {
          return `http://${config.serverIp}:3002`;
        }
      } catch (e) {
        console.error('Erro ao ler config do Electron em localDB:', e);
      }
    }

    // 3. Fallback para o hostname atual (útil se acedido via browser na rede local)
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:3002`;
  }
  return 'http://localhost:3002';
}

/**
 * Executa uma consulta SQL (SELECT) que retorna linhas de dados.
 */
export async function localQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const start = Date.now();
  try {
    const response = await fetch(`${getServerUrl()}/api/db/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const duration = Date.now() - start;
    if (duration > 50) {
      console.warn(`[HOSPITALITY/LocalDB] Consulta SQLite demorou ${duration}ms:`, sql);
    }
    return data.rows || [];
  } catch (error) {
    console.error('[HOSPITALITY/LocalDB] Erro localQuery via REST:', error);
    throw error;
  }
}

/**
 * Executa uma instrução SQL (INSERT, UPDATE, DELETE) que altera o estado.
 */
export async function localExecute(sql: string, params: any[] = []): Promise<DBResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${getServerUrl()}/api/db/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    const duration = Date.now() - start;
    if (duration > 50) {
      console.warn(`[HOSPITALITY/LocalDB] Execução SQLite demorou ${duration}ms:`, sql);
    }
    return result;
  } catch (error) {
    console.error('[HOSPITALITY/LocalDB] Erro localExecute via REST:', error);
    throw error;
  }
}

/**
 * Verifica o estado do servidor local
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${getServerUrl()}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
