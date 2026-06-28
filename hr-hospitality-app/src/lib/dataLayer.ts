/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Camada de Abstração de Dados Híbrida (Supabase Cloud + SQLite Local)
 * HR-HOSPITALITY - Redireciona operações de escrita e leitura de forma inteligente
 * com base na conectividade ao servidor SQLite local (porta 3002).
 */
import { supabaseClient } from './supabaseClient';
import { localQuery, localExecute, checkServerHealth } from './db/localDB';

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
}

// Garantir a existência da tabela sync_queue no SQLite local
let isQueueChecked = false;
async function ensureSyncQueueTable() {
  if (isQueueChecked) return;
  try {
    await localExecute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        record_id TEXT NOT NULL,
        data TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    isQueueChecked = true;
  } catch (error) {
    console.error('[HOSPITALITY/DataLayer] Falha ao criar tabela sync_queue:', error);
  }
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
    ensureSyncQueueTable();
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

  private async execute() {
    // Tentar Supabase primeiro se disponível
    if (isOnline() && supabaseClient) {
      try {
        return await this.executeSupabase();
      } catch (err) {
        console.warn(`[HOSPITALITY/DataLayer] Supabase falhou, tentando fallback local:`, err);
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
      if (this.method === 'insert' || this.method === 'update' || this.method === 'upsert') {
        const rows = Array.isArray(this.writeData) ? this.writeData : [this.writeData];
        for (const row of rows) {
          const keys = Object.keys(row).filter(k => typeof row[k] !== 'object' || row[k] === null);
          const values = keys.map(k => row[k]);

          if (this.method === 'insert' || this.method === 'upsert') {
            const placeholders = keys.map(() => '?').join(',');
            const sql = `INSERT OR REPLACE INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
            await localExecute(sql, values);
          } else {
            const idCol = row.id ? 'id' : keys[0];
            const idVal = row[idCol];
            const setClause = keys.map(k => `${k} = ?`).join(',');
            const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${idCol} = ?`;
            await localExecute(sql, [...values, idVal]);
          }
        }
      } else if (this.method === 'delete') {
        const eqFilter = this.filters.find(f => f.type === 'eq');
        if (eqFilter) {
          const sql = `DELETE FROM ${this.tableName} WHERE ${eqFilter.column} = ?`;
          await localExecute(sql, [eqFilter.value]);
        }
      }
    } catch (e) {
      console.warn(`[HOSPITALITY/DataLayer] Erro ao replicar para SQLite:`, e);
    }
  }

  private async executeLocal() {
    await ensureSyncQueueTable();
    try {
      if (this.method === 'select') {
        return await this.executeLocalSelect();
      } else {
        return await this.executeLocalWrite();
      }
    } catch (err: any) {
      console.error(`[HOSPITALITY/DataLayer] Erro de execução local:`, err);
      return { data: null, error: { message: err.message, details: err } };
    }
  }

  private async executeLocalSelect() {
    let cleanedSelectFields = this.selectFields;
    const relationsToFetch: Array<{ relationName: string; fields: string[] }> = [];

    const relationRegex = /(\w+)\(([^)]+)\)/g;
    let match;
    while ((match = relationRegex.exec(this.selectFields)) !== null) {
      const relationName = match[1];
      const fields = match[2].split(',').map(f => f.trim());
      relationsToFetch.push({ relationName, fields });
      cleanedSelectFields = cleanedSelectFields.replace(match[0], '');
    }

    cleanedSelectFields = cleanedSelectFields
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0)
      .join(', ');

    if (!cleanedSelectFields) {
      cleanedSelectFields = '*';
    }

    let sql = `SELECT ${cleanedSelectFields} FROM ${this.tableName}`;
    const params: any[] = [];

    if (this.filters.length > 0) {
      const whereClauses = this.filters.map(f => {
        if (f.type === 'eq') { params.push(f.value); return `${f.column} = ?`; }
        else if (f.type === 'neq') { params.push(f.value); return `${f.column} != ?`; }
        else if (f.type === 'gt') { params.push(f.value); return `${f.column} > ?`; }
        else if (f.type === 'lt') { params.push(f.value); return `${f.column} < ?`; }
        else if (f.type === 'gte') { params.push(f.value); return `${f.column} >= ?`; }
        else if (f.type === 'lte') { params.push(f.value); return `${f.column} <= ?`; }
        else if (f.type === 'like') { params.push(f.value); return `${f.column} LIKE ?`; }
        else if (f.type === 'ilike') { params.push(f.value); return `LOWER(${f.column}) LIKE LOWER(?)`; }
        else if (f.type === 'in') {
          const placeholders = f.value.map(() => '?').join(',');
          f.value.forEach((v: any) => params.push(v));
          return `${f.column} IN (${placeholders})`;
        }
        return '1=1';
      });
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (this.orderFields.length > 0) {
      const orderBy = this.orderFields.map(o => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ');
      sql += ` ORDER BY ${orderBy}`;
    }

    if (this.limitCount !== undefined) {
      sql += ` LIMIT ${this.limitCount}`;
    }

    const rows = await localQuery(sql, params);

    // Buscar dados das relações
    if (rows && rows.length > 0 && relationsToFetch.length > 0) {
      for (const row of rows) {
        for (const rel of relationsToFetch) {
          const singularRelation = rel.relationName.endsWith('s') ? rel.relationName.slice(0, -1) : rel.relationName;
          let fkName = '';
          if (row[`${singularRelation}_id`] !== undefined) fkName = `${singularRelation}_id`;
          else if (row[`${rel.relationName}_id`] !== undefined) fkName = `${rel.relationName}_id`;

          if (fkName && row[fkName]) {
            const relSql = `SELECT ${rel.fields.join(', ')} FROM ${rel.relationName} WHERE id = ?`;
            try {
              const relRows = await localQuery(relSql, [row[fkName]]);
              row[rel.relationName] = relRows[0] || null;
            } catch (err) {
              row[rel.relationName] = null;
            }
          } else {
            row[rel.relationName] = null;
          }
        }
      }
    }

    if (this.isSingle) {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }

  private async executeLocalWrite() {
    const timestamp = Date.now();

    if (this.method === 'insert' || this.method === 'upsert') {
      const rows = Array.isArray(this.writeData) ? this.writeData : [this.writeData];
      const insertedRows: any[] = [];

      for (const row of rows) {
        if (!row.id) {
          row.id = crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        row.sync_status = 'pending';
        row.updated_at = new Date().toISOString();

        const keys = Object.keys(row);
        const values = keys.map(k => row[k]);
        const placeholders = keys.map(() => '?').join(',');

        const sql = `INSERT OR REPLACE INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
        await localExecute(sql, values);

        await localExecute(
          `INSERT INTO sync_queue (id, table_name, action, record_id, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), this.tableName, 'INSERT', row.id, JSON.stringify(row), timestamp]
        );

        insertedRows.push(row);
      }

      return { data: Array.isArray(this.writeData) ? insertedRows : insertedRows[0], error: null };

    } else if (this.method === 'update') {
      const selectBuilder = new HybridQueryBuilder(this.tableName);
      selectBuilder.filters = this.filters;
      const { data: targetRows } = await selectBuilder.executeLocalSelect();

      if (!targetRows || targetRows.length === 0) {
        return { data: [], error: null };
      }

      const updatedRows: any[] = [];
      const keys = Object.keys(this.writeData);
      const values = keys.map(k => this.writeData[k]);
      const setClause = keys.map(k => `${k} = ?`).join(',');

      for (const target of targetRows) {
        const id = target.id;
        if (!id) continue;

        const updatedTime = new Date().toISOString();
        const updateSql = `UPDATE ${this.tableName} SET ${setClause}, sync_status = 'pending', updated_at = ? WHERE id = ?`;
        await localExecute(updateSql, [...values, updatedTime, id]);

        const fullRow = { ...target, ...this.writeData, sync_status: 'pending', updated_at: updatedTime };
        updatedRows.push(fullRow);

        await localExecute(
          `INSERT INTO sync_queue (id, table_name, action, record_id, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), this.tableName, 'UPDATE', id, JSON.stringify(fullRow), timestamp]
        );
      }

      return { data: this.isSingle ? updatedRows[0] : updatedRows, error: null };

    } else if (this.method === 'delete') {
      const selectBuilder = new HybridQueryBuilder(this.tableName);
      selectBuilder.filters = this.filters;
      const { data: targetRows } = await selectBuilder.executeLocalSelect();

      if (!targetRows || targetRows.length === 0) {
        return { data: [], error: null };
      }

      for (const target of targetRows) {
        const id = target.id;
        if (!id) continue;

        await localExecute(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);

        await localExecute(
          `INSERT INTO sync_queue (id, table_name, action, record_id, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), this.tableName, 'DELETE', id, null, timestamp]
        );
      }

      return { data: targetRows, error: null };
    }

    throw new Error('Método inválido no HybridQueryBuilder');
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

    async signInWithPassword(credentials: any) {
      if (isOnline() && supabaseClient) {
        return await supabaseClient.auth.signInWithPassword(credentials);
      }
      // Autenticação offline básica
      try {
        const profiles = await localQuery('SELECT * FROM user_profiles WHERE email = ?', [credentials.email]);
        if (profiles && profiles.length > 0) {
          const fakeUser = {
            id: profiles[0].id,
            email: profiles[0].email,
            user_metadata: { full_name: profiles[0].full_name },
          };
          const fakeSession = {
            access_token: 'offline_token_' + Date.now(),
            user: fakeUser,
            expires_at: Math.floor(Date.now() / 1000) + 86400,
          };
          return { data: { session: fakeSession, user: fakeUser }, error: null };
        }
      } catch (e) {}
      return { data: { session: null, user: null }, error: { message: 'Não foi possível autenticar offline.' } };
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
