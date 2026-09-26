/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Camada de Abstração de Dados Híbrida (Supabase Cloud + SQLite Local)
 * HR-HOSPITALITY - Redireciona operações de escrita e leitura de forma inteligente
 * com base na conectividade ao servidor SQLite local (porta 3002).
 */
import { supabaseClient } from './supabaseClient';
import { localOperation, localQuery, checkServerHealth } from './db/localDB';
import { startAutoSync, scheduleFlushAfterWrite } from './syncEngine';

// Estado global de conectividade
let onlineStatus: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 10000; // 10 segundos

// Verificar conectividade ao servidor local SQLite
async function checkLocalServer(): Promise<boolean> {
  const now = Date.now();
  if (onlineStatus !== null && (now - lastHealthCheck) < HEALTH_CHECK_INTERVAL) {
    return onlineStatus;
  }
  lastHealthCheck = now;
  const healthy = await checkServerHealth();
  onlineStatus = healthy;
  return healthy;
}

// Verificar se o Supabase está configurado e acessível
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  return !!(supabaseClient);
}

async function hasAuthenticatedSupabaseSession(): Promise<boolean> {
  if (!supabaseClient) return false;
  try {
    const { data } = await supabaseClient.auth.getSession();
    return Boolean(data.session?.access_token);
  } catch {
    return false;
  }
}

// Monitorizar conectividade no browser
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    onlineStatus = null; // Forçar re-check
    console.log('[HOSPITALITY/DataLayer] Conexão física restabelecida.');
  });
  window.addEventListener('offline', () => {
    onlineStatus = false;
    console.log('[HOSPITALITY/DataLayer] Sem conexão física à rede.');
  });

  // CORREÇÃO: ativa o motor de reconciliação da sync_queue -> Supabase
  startAutoSync();
}

// Circuit breaker de tabelas inexistentes no Supabase: após o primeiro 404 de
// schema cache, passa-se direto ao SQLite local sem repetir o pedido à nuvem.
// Persistido em localStorage para suprimir os 404 também em próximos loads
// (reavaliado ao fim de 1h, para detetar migrações aplicadas entretanto).
const CLOUD_MISSING_KEY = 'hr_cloud_missing_tables';
const CLOUD_MISSING_TTL_MS = 60 * 60 * 1000;
const cloudMissingTables = new Set<string>();

function loadCloudMissingTables() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CLOUD_MISSING_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === 'number' && Date.now() - parsed.ts < CLOUD_MISSING_TTL_MS && Array.isArray(parsed.tables)) {
      parsed.tables.forEach((t: string) => cloudMissingTables.add(t));
    }
  } catch { /* storage indisponível — segue sem cache */ }
}

function rememberCloudMissingTable(table: string) {
  cloudMissingTables.add(table);
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLOUD_MISSING_KEY, JSON.stringify({ ts: Date.now(), tables: [...cloudMissingTables] }));
  } catch { /* ignore */ }
}
loadCloudMissingTables();

function isCloudMissingTableError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.details || '');
  return err.code === 'PGRST205' || /Could not find the table/i.test(msg);
}

// Evita spam de avisos repetidos (mesma tabela + mesmo erro) e breaker de rede:
// 2 falhas consecutivas de ligação suspendem a nuvem por 30s.
const warnedCloudErrors = new Set<string>();
let cloudFailureStreak = 0;
let cloudDownUntil = 0;
// Sonda por tabela: na primeira visita vários componentes pedem à nuvem em
// paralelo — só o primeiro vai lá; os restantes esperam pelo desfecho antes de
// decidirem (evita a rajada de 404 quando a tabela ainda não foi migrada).
const cloudProbes = new Map<string, Promise<void>>();

function warnCloudOnce(tableName: string, message: string, error: any) {
  const key = `${tableName}:${message.slice(0, 80)}`;
  if (warnedCloudErrors.has(key)) return;
  warnedCloudErrors.add(key);
  console.warn(`[HOSPITALITY/DataLayer] Supabase retornou erro em '${tableName}', fallback local:`, message || error);
}

// Falha de rede (pedido abortado/indisponível): transitória, já coberta pelo
// breaker de streak — registo como info para não poluir o console com avisos.
function noteCloudNetworkFailure(tableName: string, error: any) {
  cloudFailureStreak++;
  if (cloudFailureStreak >= 2) {
    cloudDownUntil = Date.now() + 30_000;
    console.info('[HOSPITALITY/DataLayer] Supabase inacessível — a usar SQLite local nos próximos 30s.');
    return;
  }
  const key = `net:${tableName}`;
  if (warnedCloudErrors.has(key)) return;
  warnedCloudErrors.add(key);
  console.info(
    `[HOSPITALITY/DataLayer] Rede indisponível para '${tableName}' — a usar SQLite local:`,
    String((error && (error.message || error.details)) || error)
  );
}

function isCloudNetworkError(err: any): boolean {
  const msg = String((err && (err.message || err.details)) || err || '');
  return /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
}

/** Authorization failures must fail closed and must never enter the local queue. */
function isCloudAuthorizationError(err: any): boolean {
  const code = String(err?.code || '');
  const status = Number(err?.status || 0);
  return code === '42501' || code === 'PGRST301' || status === 401 || status === 403;
}

// Classe que emula o PostgrestQueryBuilder do Supabase
class HybridQueryBuilder {
  private tableName: string;
  private method: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectFields: string = '*';
  private filters: Array<{ type: string; column: string; value: any }> = [];
  private orderFields: Array<{ column: string; ascending: boolean }> = [];
  private limitCount?: number;
  private writeData: any = null;
  private isSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields: string = '*') {
    this.selectFields = fields;
    this.method = 'select';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  like(column: string, value: any) {
    this.filters.push({ type: 'like', column, value });
    return this;
  }

  ilike(column: string, value: any) {
    this.filters.push({ type: 'ilike', column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderFields.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  insert(data: any) {
    this.method = 'insert';
    this.writeData = data;
    return this;
  }

  upsert(data: any, options?: any) {
    this.method = 'upsert';
    this.writeData = data;
    return this;
  }

  update(data: any) {
    this.method = 'update';
    this.writeData = data;
    return this;
  }

  delete() {
    this.method = 'delete';
    return this;
  }

  // Permite usar "await dataLayer.from('table').select()"
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      const result = await this.execute();
      if (onfulfilled) return onfulfilled(result);
      return result;
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  private canTryCloud(): boolean {
    return (
      isOnline() &&
      !!supabaseClient &&
      Date.now() >= cloudDownUntil &&
      !cloudMissingTables.has(this.tableName)
    );
  }

  /** Tenta a nuvem uma vez. `done: true` ⇒ `value` é o resultado final (dados ou fallback local já resolvido). */
  private async runCloud(): Promise<{ done: boolean; value?: any }> {
    try {
      const result = await this.executeSupabase();
      // Se Supabase devolveu erro (DNS, rede, 404, etc.), fallback para local
      if (result && result.error) {
        if (isCloudAuthorizationError(result.error)) {
          // RLS/authentication errors are authoritative. Falling back would
          // create local writes that can never be legitimately synchronized.
          warnCloudOnce(this.tableName, result.error?.message || String(result.error), result.error);
          return { done: true, value: result };
        }
        if (isCloudMissingTableError(result.error)) {
          rememberCloudMissingTable(this.tableName);
          console.info(
            `[HOSPITALITY/DataLayer] Tabela '${this.tableName}' ainda não existe no Supabase — a usar SQLite local até a migração ser aplicada.`
          );
        } else if (isCloudNetworkError(result.error)) {
          noteCloudNetworkFailure(this.tableName, result.error);
        } else {
          warnCloudOnce(this.tableName, result.error?.message || String(result.error), result.error);
        }
        return { done: true, value: await this.executeLocal() };
      }
      cloudFailureStreak = 0;
      return { done: true, value: result };
    } catch (err: any) {
      if (isCloudAuthorizationError(err)) {
        return { done: true, value: { data: null, error: err } };
      }
      if (isCloudNetworkError(err)) {
        noteCloudNetworkFailure(this.tableName, err);
      } else {
        warnCloudOnce(this.tableName, String(err?.message || err), err);
      }
      return { done: false };
    }
  }

  private async execute() {
    // Tentar Supabase primeiro se disponível:
    //  - tabelas confirmadas como inexistentes na nuvem são evitadas (breaker)
    //  - se a nuvem está em queda (2 falhas de rede seguidas), 30s de pausa
    //  - sondas por tabela serializam a rajada inicial (1 único 404 à nuvem)
    if (this.canTryCloud() && await hasAuthenticatedSupabaseSession()) {
      const probe = cloudProbes.get(this.tableName);
      if (probe) {
        // Já existe um pedido em voo para esta tabela — esperar pelo desfecho
        await probe;
      } else {
        let settleProbe: () => void = () => {};
        cloudProbes.set(this.tableName, new Promise<void>(res => { settleProbe = res; }));
        try {
          const out = await this.runCloud();
          if (out.done) return out.value;
        } finally {
          settleProbe();
        }
        return await this.executeLocal();
      }
      // Sonda já resolvida: só repetir se a nuvem ainda estiver utilizável
      if (this.canTryCloud() && await hasAuthenticatedSupabaseSession()) {
        const out = await this.runCloud();
        if (out.done) return out.value;
      }
    }
    // Fallback para SQLite local
    return await this.executeLocal();
  }

  private async executeSupabase() {
    if (!supabaseClient) throw new Error('Supabase client not initialized');
    let query: any = supabaseClient.from(this.tableName);

    if (this.method === 'select') {
      query = query.select(this.selectFields);
    } else if (this.method === 'insert') {
      query = query.insert(this.writeData);
    } else if (this.method === 'update') {
      query = query.update(this.writeData);
    } else if (this.method === 'delete') {
      query = query.delete();
    } else if (this.method === 'upsert') {
      query = query.upsert(this.writeData);
    }

    // Aplicar filtros
    for (const f of this.filters) {
      if (f.type === 'eq') query = query.eq(f.column, f.value);
      else if (f.type === 'neq') query = query.neq(f.column, f.value);
      else if (f.type === 'gt') query = query.gt(f.column, f.value);
      else if (f.type === 'lt') query = query.lt(f.column, f.value);
      else if (f.type === 'gte') query = query.gte(f.column, f.value);
      else if (f.type === 'lte') query = query.lte(f.column, f.value);
      else if (f.type === 'like') query = query.like(f.column, f.value);
      else if (f.type === 'ilike') query = query.ilike(f.column, f.value);
      else if (f.type === 'in') query = query.in(f.column, f.value);
    }

    // Ordenação e limite
    for (const o of this.orderFields) {
      query = query.order(o.column, { ascending: o.ascending });
    }
    if (this.limitCount !== undefined) {
      query = query.limit(this.limitCount);
    }
    if (this.isSingle) {
      query = query.single();
    }

    const res = await query;

    // Replicar escrita bem-sucedida para o SQLite local
    if (!res.error && this.method !== 'select') {
      this.replicateToLocalSilently().catch(err =>
        console.error('[HOSPITALITY/DataLayer] Falha na replicação online -> local:', err)
      );
    }

    return res;
  }

  private async replicateToLocalSilently() {
    try {
      if (this.method === 'insert' || this.method === 'upsert') {
        const rows = (Array.isArray(this.writeData) ? this.writeData : [this.writeData]).map(row => {
          const safeRow = { ...row };
          delete safeRow.tenant_id;
          delete safeRow.sync_status;
          delete safeRow.updated_at;
          return safeRow;
        });
        await localOperation('data.cache.upsert', { resource: this.tableName, rows });
      } else if (this.method === 'update') {
        const idFilter = this.filters.find(filter => filter.type === 'eq' && filter.column === 'id');
        if (!idFilter) throw new Error('Local cache update requires an id filter.');
        const patch = { ...this.writeData };
        delete patch.tenant_id;
        delete patch.sync_status;
        delete patch.updated_at;
        await localOperation('data.cache.update', {
          resource: this.tableName,
          id: String(idFilter.value),
          patch
        });
      } else if (this.method === 'delete') {
        const idFilter = this.filters.find(filter => filter.type === 'eq' && filter.column === 'id');
        if (!idFilter) throw new Error('Local cache delete requires an id filter.');
        await localOperation('data.cache.delete', {
          resource: this.tableName,
          id: String(idFilter.value)
        });
      }
    } catch (error) {
      console.warn('[HOSPITALITY/DataLayer] Could not refresh the local cache:', error);
    }
  }

  private async executeLocal() {
    try {
      if (this.method === 'select') {
        return await this.executeLocalSelect();
      }
      const result = await this.executeLocalWrite();
      scheduleFlushAfterWrite();
      return result;
    } catch (err: any) {
      console.error('[HOSPITALITY/DataLayer] Local operation failed:', err);
      return { data: null, error: { message: err?.message || 'Local database operation failed.' } };
    }
  }

  private async executeLocalSelect() {
    const columns = this.selectFields.trim() === '*'
      ? undefined
      : this.selectFields.split(',').map(field => field.trim()).filter(Boolean);
    const rows = await localQuery<any[]>('data.select', {
      resource: this.tableName,
      columns,
      filters: this.filters.map(filter => ({
        column: filter.column,
        op: filter.type,
        value: filter.value
      })),
      orderBy: this.orderFields.map(field => ({
        column: field.column,
        ascending: field.ascending
      })),
      limit: this.limitCount,
      single: this.isSingle
    });
    return {
      data: this.isSingle ? (rows[0] || null) : rows,
      error: null
    };
  }

  private async executeLocalWrite() {
    if (this.method === 'insert' || this.method === 'upsert') {
      const rows = Array.isArray(this.writeData) ? this.writeData : [this.writeData];
      const safeRows = rows.map(row => {
        const safeRow = { ...row };
        if (!safeRow.id) safeRow.id = crypto.randomUUID();
        delete safeRow.tenant_id;
        delete safeRow.sync_status;
        delete safeRow.updated_at;
        return safeRow;
      });
      const result = await localOperation<{ data: any[] }>('data.upsert', {
        resource: this.tableName,
        rows: safeRows
      });
      const insertedRows = result?.data || [];
      return { data: Array.isArray(this.writeData) ? insertedRows : insertedRows[0], error: null };
    }

    if (this.method === 'update') {
      const idFilter = this.filters.find(filter => filter.type === 'eq' && filter.column === 'id');
      if (!idFilter) {
        return { data: null, error: { message: 'Local updates require an id filter.' } };
      }
      const patch = { ...this.writeData };
      delete patch.tenant_id;
      delete patch.sync_status;
      delete patch.updated_at;
      const result = await localOperation<{ data: any }>('data.update', {
        resource: this.tableName,
        id: String(idFilter.value),
        patch
      });
      return { data: result?.data || null, error: null };
    }

    if (this.method === 'delete') {
      const idFilter = this.filters.find(filter => filter.type === 'eq' && filter.column === 'id');
      if (!idFilter) {
        return { data: null, error: { message: 'Local deletes require an id filter.' } };
      }
      const result = await localOperation<{ data: any }>('data.delete', {
        resource: this.tableName,
        id: String(idFilter.value)
      });
      return { data: result?.data || null, error: null };
    }

    throw new Error('Unsupported data-layer method.');
  }
}

// API de Dados Híbrida compatível com o cliente Supabase
export const dataLayer = {
  // Substitui supabase.from('table')
  from(tableName: string) {
    return new HybridQueryBuilder(tableName);
  },

  // Substitui supabase.rpc('function', { params })
  async rpc(functionName: string, params: any = {}) {
    if (isOnline() && supabaseClient) {
      try {
        return await supabaseClient.rpc(functionName, params);
      } catch (err) {
        console.warn(`[HOSPITALITY/DataLayer] RPC ${functionName} falhou no Supabase.`, err);
      }
    }
    return { data: null, error: { message: `RPC ${functionName} não disponível offline.` } };
  },

  // Canais de Realtime (compatível offline)
  channel(name: string): any {
    if (isOnline() && supabaseClient) {
      return supabaseClient.channel(name);
    }
    // Stub offline — aceita qualquer tipo de evento (presence, broadcast, postgres_changes)
    const stub = {
      on(_event: any, _filter: any, _callback: any) { return stub; },
      subscribe(_callback?: any) { return stub; },
      unsubscribe() { return stub; },
      send(_payload: any) { return Promise.resolve('ok'); },
      track(_payload: any) { return Promise.resolve('ok'); },
      untrack() { return Promise.resolve('ok'); },
    };
    return stub;
  },

  removeChannel(channel: any) {
    if (isOnline() && supabaseClient) {
      return supabaseClient.removeChannel(channel);
    }
  },

  // Proxies para a autenticação offline/online
  auth: {
    async getUser() {
      if (isOnline() && supabaseClient) {
        return await supabaseClient.auth.getUser();
      }
      return { data: { user: null }, error: null };
    },

    async getSession() {
      if (isOnline() && supabaseClient) {
        return await supabaseClient.auth.getSession();
      }
      return { data: { session: null }, error: null };
    },

    async signInWithPassword(credentials: { email: string; password: string }) {
      if (!supabaseClient) {
        return { data: { session: null, user: null }, error: { message: 'Supabase Auth não configurado.' } };
      }
      // Authentication is never emulated locally. Offline startup fails closed;
      // an already authenticated Electron session remains available offline.
      return await supabaseClient.auth.signInWithPassword(credentials);
    },

    async signOut() {
      if (isOnline() && supabaseClient) {
        return await supabaseClient.auth.signOut();
      }
      return { error: null };
    },

    onAuthStateChange(callback: any) {
      if (supabaseClient) {
        return supabaseClient.auth.onAuthStateChange(callback);
      }
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
  },

  get storage() {
    return supabaseClient ? supabaseClient.storage : ({} as any);
  }
};
