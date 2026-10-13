/* eslint-disable */
'use strict';

const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { executeOperation, ensureSyncQueue, OperationError } = require('./operations');

const DEFAULT_PORT = 3002;
const DEFAULT_HOST = '127.0.0.1';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const VOICE_TIMEOUT_MS = 120_000;

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  if (columns.length > 0 && !columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
}

// O SQLite recusa defaults não constantes em ADD COLUMN ("Cannot add a column
// with non-constant default"), por isso `updated_at` é criada sem DEFAULT
// (idêntico a migrations/sqlite/005) e preenchida logo a seguir.
function ensureUpdatedAt(db, table, backfill = "datetime('now')") {
  if (ensureColumn(db, table, 'updated_at', 'TEXT')) {
    db.exec(`UPDATE ${table} SET updated_at = ${backfill} WHERE updated_at IS NULL`);
  }
}

// Registo universal de hóspede (migração Supabase 017 + 009).
// `hotel_reservations` é "local authoritative", mas o `cloudInboundSync`
// traz da nuvem tudo o que a Landing Page submeteu. Sem estas colunas no
// SQLite, a receção não via o documento, o comprovativo nem a cara do
// hóspede — o caminho era simplesmente descartado no cache.
const RESERVATION_MEDIA_COLUMNS = Object.freeze([
  ['guest_phone', 'TEXT'],
  ['document_type', 'TEXT'],
  ['document_number', 'TEXT'],
  ['document_path', 'TEXT'],
  ['receipt_path', 'TEXT'],
  ['face_path', 'TEXT']
]);

function ensureReservationMediaColumns(db) {
  let added = 0;
  for (const [column, definition] of RESERVATION_MEDIA_COLUMNS) {
    if (ensureColumn(db, 'hotel_reservations', column, definition)) added += 1;
  }
  if (added > 0) {
    console.log(`[HospitalityServer] ${added} coluna(s) de media de reserva criadas.`);
  }
}

/**
 * Ciclo de vida de quartos (0.2.1): o enum local ganha o estado RESERVADO,
 * alinhado com a migracao 011 da nuvem. Regra de negocio hotelaria:
 *   - reserva CONFIRMADA/PENDENTE com quarto  -> quarto RESERVADO (bloqueado
 *     para novas vendas, mas SEM hospede fisico — nunca OCUPADO);
 *   - check-in presencial (hotel_reservations.checkIn) -> OCUPADO;
 *   - check-out / cancelamento -> DISPONIVEL (ou LIMPEZA).
 * O SQLite nao altera CHECK constraints in-place: rebuild da tabela.
 */
function ensureRoomStatusReservado(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hotel_rooms'").get();
  if (!table || table.sql.includes("'RESERVADO'")) return;
  const indexes = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='hotel_rooms' AND sql IS NOT NULL")
    .all();
  const rebuilt = table.sql
    .replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?hotel_rooms"?/i, 'CREATE TABLE hotel_rooms_status_v2')
    .replace(
      "'DISPONIVEL','OCUPADO','LIMPEZA','MANUTENCAO'",
      "'DISPONIVEL','OCUPADO','RESERVADO','LIMPEZA','MANUTENCAO'"
    );
  if (rebuilt === table.sql) {
    console.warn('[HospitalityServer] CHECK de hotel_rooms nao reconhecido — estado RESERVADO nao aplicado automaticamente.');
    return;
  }
  db.exec('BEGIN');
  try {
    db.exec('PRAGMA defer_foreign_keys = ON');
    db.exec(rebuilt);
    db.exec('INSERT INTO hotel_rooms_status_v2 SELECT * FROM hotel_rooms');
    db.exec('DROP TABLE hotel_rooms');
    db.exec('ALTER TABLE hotel_rooms_status_v2 RENAME TO hotel_rooms');
    for (const idx of indexes) db.exec(idx.sql);
    db.exec('COMMIT');
    console.log('[HospitalityServer] hotel_rooms migrado: estado RESERVADO disponivel (reserva confirmada bloqueia sem ocupar).');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* transacao ja fechada */ }
    throw err;
  }
}

function dropColumnIfPresent(db, table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  if (columns.includes(column)) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

const LEGACY_ROOM_IDS = Object.freeze({
  'room-101': 'a1111111-1111-4111-8111-000000000101',
  'room-102': 'a1111111-1111-4111-8111-000000000102',
  'room-103': 'a1111111-1111-4111-8111-000000000103',
  'room-104': 'a1111111-1111-4111-8111-000000000104',
  'room-201': 'a1111111-1111-4111-8111-000000000201',
  'room-202': 'a1111111-1111-4111-8111-000000000202',
  'room-203': 'a1111111-1111-4111-8111-000000000203',
  'room-204': 'a1111111-1111-4111-8111-000000000204',
  'room-301': 'a1111111-1111-4111-8111-000000000301',
  'room-302': 'a1111111-1111-4111-8111-000000000302',
  'room-303': 'a1111111-1111-4111-8111-000000000303',
  'room-304': 'a1111111-1111-4111-8111-000000000304'
});
const LEGACY_RESERVATION_IDS = Object.freeze({
  'res-demo-1': 'b2222222-2222-4222-8222-000000000001',
  'res-demo-2': 'b2222222-2222-4222-8222-000000000002',
  'res-demo-3': 'b2222222-2222-4222-8222-000000000003',
  'res-demo-4': 'b2222222-2222-4222-8222-000000000004'
});

function replaceQueuedId(db, table, oldId, newId) {
  db.prepare('UPDATE sync_queue SET record_id = ? WHERE table_name = ? AND record_id = ?').run(newId, table, oldId);
  db.prepare("UPDATE sync_queue SET data = replace(data, ?, ?) WHERE table_name = ? AND data LIKE ?").run(oldId, newId, table, `%"${oldId}"%`);
}

function normalizeLegacyIds(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const [oldId, newId] of Object.entries(LEGACY_ROOM_IDS)) {
      const row = db.prepare('SELECT id FROM hotel_rooms WHERE id = ?').get(oldId);
      if (!row || db.prepare('SELECT id FROM hotel_rooms WHERE id = ?').get(newId)) continue;
      db.prepare('UPDATE hotel_rooms SET id = ? WHERE id = ?').run(newId, oldId);
      db.prepare('UPDATE hotel_reservations SET room_id = ? WHERE room_id = ?').run(newId, oldId);
      replaceQueuedId(db, 'hotel_rooms', oldId, newId);
    }
    for (const [oldId, newId] of Object.entries(LEGACY_RESERVATION_IDS)) {
      const row = db.prepare('SELECT id FROM hotel_reservations WHERE id = ?').get(oldId);
      if (!row || db.prepare('SELECT id FROM hotel_reservations WHERE id = ?').get(newId)) continue;
      db.prepare('UPDATE hotel_consumptions SET reservation_id = ? WHERE reservation_id = ?').run(newId, oldId);
      db.prepare('UPDATE hotel_reservations SET id = ? WHERE id = ?').run(newId, oldId);
      replaceQueuedId(db, 'hotel_reservations', oldId, newId);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw error;
  }
}

/**
 * Apaga reservas que casam com `whereSql` e limpa, no mesmo lance, tudo o que
 * dependia delas.
 *
 * Porquê este cuidado: nas bases de dados mais antigas `hotel_consumptions` foi
 * criada como `reservation_id TEXT NOT NULL` **sem** `ON DELETE`, pelo que
 * apagar a reserva directamente rebenta com "FOREIGN KEY constraint failed" e
 * impede o arranque da aplicação. Nas BDs novas a cláusula é
 * `ON DELETE SET NULL`, e este código também funciona (nada há para limpar).
 */
function purgeReservations(db, whereSql, params) {
  const ids = db
    .prepare(`SELECT id FROM hotel_reservations WHERE ${whereSql}`)
    .all(...params)
    .map(row => row.id);
  if (!ids.length) return 0;

  const placeholders = ids.map(() => '?').join(',');
  // 1. Fila de sincronização dos extras… (antes de os extras desaparecerem)
  db.prepare(`
    DELETE FROM sync_queue
     WHERE table_name = 'hotel_consumptions'
       AND record_id IN (SELECT id FROM hotel_consumptions WHERE reservation_id IN (${placeholders}))
  `).run(...ids);
  // 2. …os próprios extras: em schema legado são NOT NULL, não há como
  //    desligá-los — são extras da reserva fantasma e morrem com ela.
  db.prepare(`DELETE FROM hotel_consumptions WHERE reservation_id IN (${placeholders})`).run(...ids);
  // 3. Visitas de cliente mantêm-se (a FK é ON DELETE SET NULL); só limpa a
  //    fila da reserva.
  db.prepare(`
    DELETE FROM sync_queue WHERE table_name = 'hotel_reservations' AND record_id IN (${placeholders})
  `).run(...ids);
  // 4. Por fim a própria reserva.
  db.prepare(`DELETE FROM hotel_reservations WHERE id IN (${placeholders})`).run(...ids);
  return ids.length;
}

/**
 * Purga de "dados fantasma": reservas de demonstração com hóspedes fictícios
 * (que nunca existiram em `clients`) e quartos marcados como OCUPADO sem
 * nenhuma reserva activa por trás.
 *
 * Idempotente — corre em cada arranque. Não toca em nenhuma reserva real.
 */
function purgeGhostData(db) {
  // 1. Reservas de demonstração — por id legado, id canónico e e-mail de demo.
  const demoEmails = [
    'h.ricardo@email.com',
    'm.conceicao@email.com',
    'c.mendonca@empresa.ao',
    'ana.silva@gmail.com',
  ];
  const ghostIds = [
    ...Object.keys(LEGACY_RESERVATION_IDS),
    ...Object.values(LEGACY_RESERVATION_IDS),
  ];
  const idPlaceholders = ghostIds.map(() => '?').join(',');
  const emailPlaceholders = demoEmails.map(() => '?').join(',');
  const removed = purgeReservations(
    db,
    `id IN (${idPlaceholders}) OR LOWER(email) IN (${emailPlaceholders})`,
    [...ghostIds, ...demoEmails]
  );
  if (removed > 0) {
    console.log(`[HospitalityServer] Purga: ${removed} reserva(s) de demonstração removida(s).`);
  }

  // 2. Quartos "fantasma": sem nenhuma reserva activa por trás.
  //    - OCUPADO sem hóspede real (CHECKED_IN/CONFIRMADA) → liberta;
  //    - RESERVADO sem reserva de agenda (PENDENTE_PAGAMENTO/CONFIRMADA/
  //      CHECKED_IN) → liberta o bloqueio, senão o quarto fica preso para
  //      sempre a uma reserva que já não existe (ciclo de vida 0.2.1).
  const now = new Date().toISOString();
  const freed = db.prepare(`
    UPDATE hotel_rooms
       SET status = 'DISPONIVEL', updated_at = ?, sync_status = 'synced'
     WHERE tenant_id = ?
       AND (
         (status = 'OCUPADO' AND NOT EXISTS (
            SELECT 1 FROM hotel_reservations r
             WHERE r.tenant_id = hotel_rooms.tenant_id
               AND r.status IN ('CHECKED_IN', 'CONFIRMADA')
               AND (r.room_id = hotel_rooms.id OR r.room_number = hotel_rooms.room_number)
          ))
         OR
         (status = 'RESERVADO' AND NOT EXISTS (
            SELECT 1 FROM hotel_reservations r
             WHERE r.tenant_id = hotel_rooms.tenant_id
               AND r.status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN')
               AND (r.room_id = hotel_rooms.id OR r.room_number = hotel_rooms.room_number)
          ))
       )
  `).run(now, '11111111-1111-1111-1111-111111111111');
  if (freed.changes > 0) {
    console.log(`[HospitalityServer] Purga: ${freed.changes} quarto(s) OCUPADO/RESERVADO sem reserva real libertado(s).`);
  }

  // 3. Órfãs: reservas a apontar para quartos que já não existem.
  const orphans = { changes: purgeReservations(
    db,
    `tenant_id = ? AND room_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM hotel_rooms r WHERE r.id = hotel_reservations.room_id)`,
    ['11111111-1111-1111-1111-111111111111']
  ) };
  if (orphans > 0) {
    console.log(`[HospitalityServer] Purga: ${orphans.changes} reserva(s) órfã de quarto inexistente removida(s).`);
  }
}

function applyLocalSecurityCompatibility(db) {
  ensureColumn(db, 'app_users', 'auth_user_id', 'TEXT');
  ensureColumn(db, 'app_users', 'email', 'TEXT');
  ensureColumn(db, 'app_users', 'employee_code', 'TEXT');
  dropColumnIfPresent(db, 'app_users', 'password_hash');
  dropColumnIfPresent(db, 'app_users', 'password_salt');
  ensureUpdatedAt(db, 'hotel_consumptions', "COALESCE(registered_at, created_at, datetime('now'))");
  ensureColumn(db, 'hotel_consumptions', 'sync_status', "TEXT DEFAULT 'synced'");
  // Rastreabilidade de consumo: zona/ponto de venda e mesa de origem (BDs antigas nao os tinham)
  ensureColumn(db, 'hotel_consumptions', 'source_zone', 'TEXT');
  ensureColumn(db, 'hotel_consumptions', 'source_table', 'TEXT');
  ensureUpdatedAt(db, 'hotel_reservations');
  ensureColumn(db, 'hotel_reservations', 'sync_status', "TEXT DEFAULT 'synced'");
  // Ligação estrita da reserva ao cliente KYC (não existia em BDs antigas)
  ensureColumn(db, 'hotel_reservations', 'client_id', 'TEXT');
  ensureColumn(db, 'hotel_reservations', 'client_number', 'TEXT');
  ensureUpdatedAt(db, 'hotel_rooms');
  ensureColumn(db, 'hotel_rooms', 'sync_status', "TEXT DEFAULT 'synced'");
  ensureUpdatedAt(db, 'pos_tables');
  ensureColumn(db, 'pos_tables', 'sync_status', "TEXT DEFAULT 'synced'");
  // Ensure pos_tables table exists (for databases created before POS tables were added)
  const posTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pos_tables'").get();
  if (!posTable) {
    db.exec(`
      CREATE TABLE pos_tables (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        zone TEXT NOT NULL,
        seats INTEGER NOT NULL DEFAULT 4,
        status TEXT DEFAULT 'LIVRE' CHECK (status IN ('LIVRE','OCUPADA','RESERVADA','MANUTENCAO')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'synced',
        UNIQUE(tenant_id, code)
      );
      CREATE INDEX IF NOT EXISTS idx_pos_tables_tenant ON pos_tables(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pos_tables_zone ON pos_tables(zone);
      CREATE INDEX IF NOT EXISTS idx_pos_tables_status ON pos_tables(status);
    `);
    console.log('[HospitalityServer] POS tables schema created.');
  }
  // === CRM/KYC Compatibility ===
  ensureUpdatedAt(db, 'clients');
  ensureColumn(db, 'clients', 'sync_status', "TEXT DEFAULT 'synced'");
  ensureColumn(db, 'clients', 'client_number', 'TEXT');
  ensureColumn(db, 'clients', 'full_name', 'TEXT');
  ensureColumn(db, 'clients', 'document_type', 'TEXT');
  ensureColumn(db, 'clients', 'document_number', 'TEXT');
  ensureColumn(db, 'clients', 'address', 'TEXT');
  ensureColumn(db, 'clients', 'email', 'TEXT');
  ensureColumn(db, 'clients', 'phone', 'TEXT');
  ensureColumn(db, 'clients', 'whatsapp', 'TEXT');
  ensureColumn(db, 'clients', 'date_of_birth', 'TEXT');
  ensureColumn(db, 'clients', 'nationality', 'TEXT');
  ensureColumn(db, 'clients', 'face_embedding', 'TEXT');
  ensureColumn(db, 'clients', 'face_image_path', 'TEXT');
  ensureColumn(db, 'clients', 'kyc_completed', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clients', 'kyc_completed_at', 'TEXT');
  ensureColumn(db, 'clients', 'loyalty_tier', "TEXT DEFAULT 'REGISTADO'");
  ensureColumn(db, 'clients', 'loyalty_points', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clients', 'total_visits', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clients', 'total_spent', 'REAL DEFAULT 0');
  ensureColumn(db, 'clients', 'total_stays', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clients', 'total_pos_spent', 'REAL DEFAULT 0');
  ensureColumn(db, 'clients', 'first_visit_date', 'TEXT');
  ensureColumn(db, 'clients', 'last_visit_date', 'TEXT');
  ensureColumn(db, 'clients', 'preferred_room_type', 'TEXT');
  ensureColumn(db, 'clients', 'notes', 'TEXT');
  ensureUpdatedAt(db, 'client_biometrics');
  ensureColumn(db, 'client_biometrics', 'sync_status', "TEXT DEFAULT 'synced'");
  ensureUpdatedAt(db, 'loyalty_tiers');
  ensureColumn(db, 'loyalty_tiers', 'sync_status', "TEXT DEFAULT 'synced'");
  ensureUpdatedAt(db, 'client_visits');
  ensureColumn(db, 'client_visits', 'sync_status', "TEXT DEFAULT 'synced'");
  // === POS Table Consumptions Compatibility ===
  ensureUpdatedAt(db, 'pos_table_consumptions');
  ensureColumn(db, 'pos_table_consumptions', 'sync_status', "TEXT DEFAULT 'synced'");
  // Ensure pos_table_consumptions table exists
  const consumptionTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pos_table_consumptions'").get();
  if (!consumptionTable) {
    db.exec(`
      CREATE TABLE pos_table_consumptions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
        table_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        category TEXT,
        status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENVIADO', 'CANCELADO', 'PAGO')),
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (table_id) REFERENCES pos_tables(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pos_consumptions_table ON pos_table_consumptions(table_id);
      CREATE INDEX IF NOT EXISTS idx_pos_consumptions_status ON pos_table_consumptions(status);
      CREATE INDEX IF NOT EXISTS idx_pos_consumptions_created ON pos_table_consumptions(created_at);
    `);
    console.log('[HospitalityServer] POS table consumptions schema created.');
  }
  // Ensure CRM tables exist (for databases created before CRM was added)
  const crmTables = [
    {
      name: 'clients',
      sql: `
        CREATE TABLE clients (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
          client_number TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          document_type TEXT NOT NULL CHECK (document_type IN ('BI','PASSAPORTE','NIF','CARTAO_CIDADAO')),
          document_number TEXT NOT NULL,
          address TEXT,
          email TEXT,
          phone TEXT,
          whatsapp TEXT,
          date_of_birth TEXT,
          nationality TEXT,
          face_embedding TEXT,
          face_image_path TEXT,
          kyc_completed INTEGER DEFAULT 0 CHECK (kyc_completed IN (0,1)),
          kyc_completed_at TEXT,
          loyalty_tier TEXT DEFAULT 'REGISTADO' CHECK (loyalty_tier IN ('REGISTADO','OCASIONAL','FREQUENTE','VIP','RESIDENTE')),
          loyalty_points INTEGER DEFAULT 0,
          total_visits INTEGER DEFAULT 0,
          total_spent REAL DEFAULT 0,
          total_stays INTEGER DEFAULT 0,
          total_pos_spent REAL DEFAULT 0,
          first_visit_date TEXT,
          last_visit_date TEXT,
          preferred_room_type TEXT,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'synced',
          UNIQUE(tenant_id, document_number)
        );
        CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_clients_number ON clients(client_number);
        CREATE INDEX IF NOT EXISTS idx_clients_document ON clients(document_number);
        CREATE INDEX IF NOT EXISTS idx_clients_tier ON clients(loyalty_tier);
        CREATE INDEX IF NOT EXISTS idx_clients_kyc ON clients(kyc_completed);`
    },
    {
      name: 'client_biometrics',
      sql: `
        CREATE TABLE client_biometrics (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
          client_id TEXT NOT NULL,
          embedding TEXT NOT NULL,
          image_path TEXT,
          confidence REAL,
          device_info TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'synced',
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_biometrics_client ON client_biometrics(client_id);
        CREATE INDEX IF NOT EXISTS idx_biometrics_tenant ON client_biometrics(tenant_id);`
    },
    {
      name: 'loyalty_tiers',
      sql: `
        CREATE TABLE loyalty_tiers (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
          name TEXT NOT NULL,
          min_visits INTEGER DEFAULT 0,
          min_spent REAL DEFAULT 0,
          discount_percent REAL DEFAULT 0,
          bonus_points_multiplier REAL DEFAULT 1.0,
          color TEXT,
          icon TEXT,
          benefits TEXT,
          is_active INTEGER DEFAULT 1 CHECK (is_active IN (0,1)),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'synced',
          UNIQUE(tenant_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_tenant ON loyalty_tiers(tenant_id);`
    },
    {
      name: 'client_visits',
      sql: `
        CREATE TABLE client_visits (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
          client_id TEXT NOT NULL,
          reservation_id TEXT,
          visit_type TEXT NOT NULL CHECK (visit_type IN ('HOSPEDAGEM','POS','EVENTO','SPA','OUTRO')),
          check_in_date TEXT,
          check_out_date TEXT,
          room_number TEXT,
          room_type TEXT,
          amount_spent REAL DEFAULT 0,
          loyalty_points_earned INTEGER DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'synced',
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (reservation_id) REFERENCES hotel_reservations(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_client_visits_client ON client_visits(client_id);
        CREATE INDEX IF NOT EXISTS idx_client_visits_type ON client_visits(visit_type);
        CREATE INDEX IF NOT EXISTS idx_client_visits_date ON client_visits(check_in_date);
        CREATE INDEX IF NOT EXISTS idx_client_visits_tenant ON client_visits(tenant_id);`
    }
  ];
  for (const table of crmTables) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table.name);
    if (!exists) {
      db.exec(table.sql);
      console.log(`[HospitalityServer] ${table.name} schema created.`);
    }
  }
  // Seed loyalty tiers if empty
  const tierCount = db.prepare("SELECT COUNT(*) as count FROM loyalty_tiers WHERE tenant_id = ?").get('11111111-1111-1111-1111-111111111111');
  if (tierCount && tierCount.count === 0) {
    db.exec(`
      INSERT OR IGNORE INTO loyalty_tiers (id, tenant_id, name, min_visits, min_spent, discount_percent, bonus_points_multiplier, color, icon, benefits, is_active) VALUES
      ('tier-registado', '11111111-1111-1111-1111-111111111111', 'REGISTADO', 0, 0, 0, 1.0, '#6B7280', 'User', '["Acesso ao app", "Registo de preferências"]', 1),
      ('tier-ocasional', '11111111-1111-1111-1111-111111111111', 'OCASIONAL', 1, 5000, 5, 1.2, '#10B981', 'Star', '["5% desconto", "Pontos 1.2x", "Oferta de boas-vindas"]', 1),
      ('tier-frequente', '11111111-1111-1111-1111-111111111111', 'FREQUENTE', 5, 25000, 10, 1.5, '#F59E0B', 'Award', '["10% desconto", "Pontos 1.5x", "Upgrade quando disponível", "Late check-out"]', 1),
      ('tier-vip', '11111111-1111-1111-1111-111111111111', 'VIP', 10, 100000, 15, 2.0, '#8B5CF6', 'Crown', '["15% desconto", "Pontos 2x", "Upgrade garantido", "Late check-out", "Welcome drink", "Concierge dedicado"]', 1),
      ('tier-residente', '11111111-1111-1111-1111-111111111111', 'RESIDENTE', 20, 250000, 20, 2.5, '#EF4444', 'Building2', '["20% desconto", "Pontos 2.5x", "Suite preferencial", "Early check-in", "Late check-out", "Serviço de quarto 24h", "Gestor de conta dedicado"]', 1);
    `);
    console.log('[HospitalityServer] Loyalty tiers seed data inserted.');
  }
  // Migração: BDs antigos usavam ids não-UUID ('client-seed-N') que falham
  // assertBusinessId. Reparar para os UUIDs canónicos (e referências FK).
  const legacyIdMap = [
    ['client-seed-1', 'b1111111-1111-4111-8111-000000000001'],
    ['client-seed-2', 'b1111111-1111-4111-8111-000000000002'],
    ['client-seed-3', 'b1111111-1111-4111-8111-000000000003'],
  ];
  for (const [legacyId, uuid] of legacyIdMap) {
    const legacy = db.prepare('SELECT id FROM clients WHERE id = ?').get(legacyId);
    if (!legacy) continue;
    const clash = db.prepare('SELECT id FROM clients WHERE id = ?').get(uuid);
    if (!clash) {
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare('UPDATE client_visits SET client_id = ? WHERE client_id = ?').run(uuid, legacyId);
      db.prepare('UPDATE client_biometrics SET client_id = ? WHERE client_id = ?').run(uuid, legacyId);
      db.prepare('UPDATE clients SET id = ? WHERE id = ?').run(uuid, legacyId);
      db.exec('PRAGMA foreign_keys = ON');
      console.log(`[HospitalityServer] Client seed id migrado: ${legacyId} → ${uuid}`);
    }
  }

  // Seed the 3 demo KYC clients when any seed row is missing (idempotente).
  // O `INSERT OR IGNORE` protege contra duplicados por id/client_number.
  const seededCount = db.prepare(
    "SELECT COUNT(*) as count FROM clients WHERE id IN ('b1111111-1111-4111-8111-000000000001','b1111111-1111-4111-8111-000000000002','b1111111-1111-4111-8111-000000000003')"
  ).get();
  if (!seededCount || seededCount.count < 3) {
    db.exec(`
      INSERT OR IGNORE INTO clients (id, tenant_id, client_number, full_name, document_type, document_number, address, email, phone, whatsapp, kyc_completed, kyc_completed_at, loyalty_tier, loyalty_points, total_visits, total_spent, total_stays, total_pos_spent, created_at, updated_at, sync_status) VALUES
      ('b1111111-1111-4111-8111-000000000001', '11111111-1111-1111-1111-111111111111', 'HR-2026-00001', 'Ricardo Valdemar', 'BI', '004812345LA042', 'Luanda, Ingombota', 'ricardo.valdemar@email.com', '+244 923 000 001', '+244 923 000 001', 1, datetime('now'), 'REGISTADO', 0, 0, 0, 0, 0, datetime('now'), datetime('now'), 'synced'),
      ('b1111111-1111-4111-8111-000000000002', '11111111-1111-1111-1111-111111111111', 'HR-2026-00002', 'Júlia Casseca', 'BI', '004854321LA043', 'Luanda, Maianga', 'julia.casseca@email.com', '+244 923 000 002', '+244 923 000 002', 1, datetime('now'), 'REGISTADO', 0, 0, 0, 0, 0, datetime('now'), datetime('now'), 'synced'),
      ('b1111111-1111-4111-8111-000000000003', '11111111-1111-1111-1111-111111111111', 'HR-2026-00003', 'Wisley Ricardo', 'BI', '004898765LA044', 'Luanda, Viana', 'wisley.ricardo@email.com', '+244 923 000 003', '+244 923 000 003', 1, datetime('now'), 'REGISTADO', 0, 0, 0, 0, 0, datetime('now'), datetime('now'), 'synced');
    `);
    console.log('[HospitalityServer] Test clients seed data inserted.');
  }
}

function createRuntime({ userDataPath = process.env.USER_DATA_PATH || process.cwd() } = {}) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, 'hospitality_local.db');
  console.log(`[HospitalityServer] SQLite: ${dbPath}`);

  let db;
  try {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
  } catch (error) {
    console.error('[HospitalityServer] Falha ao abrir SQLite:', error.message);
    throw error;
  }

  try {
    const roomTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hotel_rooms'").get();
    if (!roomTable) {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) throw new Error('electron/schema.sql não encontrado.');
      db.exec(fs.readFileSync(schemaPath, 'utf8'));
      console.log('[HospitalityServer] Schema local inicial criado.');
    }
    applyLocalSecurityCompatibility(db);
    ensureSyncQueue(db);
    ensureReservationMediaColumns(db);
    ensureRoomStatusReservado(db);
    normalizeLegacyIds(db);
    purgeGhostData(db);
  } catch (error) {
    try { db.close(); } catch { /* ignore */ }
    throw error;
  }

  const transcribe = createVoiceTranscriber();
  return {
    db,
    dbPath,
    execute: (operation, input) => executeOperation(db, operation, input),
    transcribe,
    close: () => {
      if (db && typeof db.close === 'function') db.close();
    }
  };
}

function parseOrigins(value) {
  return new Set(
    (value || 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );
}

function parseHosts(value) {
  return new Set(
    (value || 'localhost,127.0.0.1,[::1]')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function safeTokenEquals(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireApiToken(apiToken) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!safeTokenEquals(provided, apiToken)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized local API request.' } });
      return;
    }
    next();
  };
}

function serialiseError(error) {
  if (error instanceof OperationError) {
    return { status: error.status || 400, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Local operation failed.' } } };
}

function createVoiceTranscriber() {
  return function transcribe(audioBuffer, language = 'pt') {
    return new Promise((resolve, reject) => {
      if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) {
        reject(new OperationError('EMPTY_AUDIO', 'No audio was provided.'));
        return;
      }
      if (audioBuffer.length > MAX_AUDIO_BYTES) {
        reject(new OperationError('AUDIO_TOO_LARGE', 'Audio exceeds the 25 MB limit.'));
        return;
      }

      const ext = audioBuffer.subarray(0, 16).toString('hex').startsWith('52494646') ? 'wav' : 'webm';
      const tmpFile = path.join(os.tmpdir(), `hrh-voice-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`);
      fs.writeFileSync(tmpFile, audioBuffer, { mode: 0o600 });

      const worker = path.join(__dirname, 'voice_worker.py');
      const pythonBin = process.env.PYTHON_BIN || 'python';
      const child = spawn(pythonBin, [worker, tmpFile, String(language).slice(0, 10)], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const cleanup = () => {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new OperationError('VOICE_TIMEOUT', 'Voice transcription timed out.', 504));
      }, VOICE_TIMEOUT_MS);

      child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });
      child.on('error', () => finish(new OperationError('VOICE_UNAVAILABLE', 'Voice engine is unavailable.', 503)));
      child.on('close', code => {
        if (code !== 0) {
          console.error(`[HospitalityServer] Voice worker exited with code ${code}.`);
          finish(new OperationError('VOICE_FAILED', 'Voice transcription failed.', 500));
          return;
        }
        try {
          const lines = stdout.trim().split('\n').filter(Boolean);
          finish(null, JSON.parse(lines[lines.length - 1]));
        } catch {
          finish(new OperationError('VOICE_INVALID_RESPONSE', 'Voice engine returned an invalid response.', 500));
        }
      });
    });
  };
}

function createApp({ runtime, apiToken }) {
  const app = express();
  const allowedOrigins = parseOrigins(process.env.HOSPITALITY_ALLOWED_ORIGINS);
  const allowedHosts = parseHosts(process.env.HOSPITALITY_ALLOWED_HOSTS);
  const auth = requireApiToken(apiToken);

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const hostname = String(req.hostname || '').toLowerCase();
    // Allow empty hostname (direct IP access) for loopback
    if (hostname && !allowedHosts.has(hostname)) {
      console.log(`[HospitalityServer] Host rejected: ${hostname}`);
      res.status(403).json({ error: { code: 'INVALID_HOST', message: 'Host is not allowed.' } });
      return;
    }
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed.'), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600
  }));

  app.get('/api/health', (_req, res) => {
    console.log('[HospitalityServer] Health check requested');
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.post('/api/db/query', auth, (_req, res) => {
    res.status(410).json({ error: { code: 'RAW_SQL_REMOVED', message: 'Raw SQL API was removed. Use /api/v1/operations.' } });
  });
  app.post('/api/db/execute', auth, (_req, res) => {
    res.status(410).json({ error: { code: 'RAW_SQL_REMOVED', message: 'Raw SQL API was removed. Use /api/v1/operations.' } });
  });

  app.post('/api/v1/operations', auth, express.json({ limit: '64kb', strict: true }), (req, res) => {
    const { operation, input = {} } = req.body || {};
    if (typeof operation !== 'string' || operation.length > 100) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid operation name is required.' } });
      return;
    }
    try {
      res.json({ ok: true, data: runtime.execute(operation, input) });
    } catch (error) {
      const serialised = serialiseError(error);
      if (serialised.status >= 500) console.error(`[HospitalityServer] Operation ${operation} failed.`);
      res.status(serialised.status).json(serialised.body);
    }
  });

  const transcribe = createVoiceTranscriber();
  app.post('/api/voice/transcribe', auth, express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }), async (req, res) => {
    try {
      const result = await transcribe(req.body, req.query.lang || 'pt');
      res.json(result);
    } catch (error) {
      const serialised = serialiseError(error);
      if (serialised.status >= 500) console.error('[HospitalityServer] Voice transcription failed.');
      res.status(serialised.status).json(serialised.body);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body.' } });
      return;
    }
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Request rejected.' } });
  });

  return app;
}

function startServer({ runtime, apiToken, host = process.env.HOSPITALITY_HOST || DEFAULT_HOST, port = Number(process.env.HOSPITALITY_PORT || DEFAULT_PORT) }) {
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback && !process.env.HOSPITALITY_API_TOKEN) {
    throw new Error('LAN exposure requires an explicit HOSPITALITY_API_TOKEN and HOSPITALITY_ALLOWED_HOSTS.');
  }
  // Use a fixed token for local loopback communication between Cliente and Servidor apps
  const effectiveToken = isLoopback && !process.env.HOSPITALITY_API_TOKEN 
    ? 'hr-hospitality-local-fixed-token' 
    : apiToken;
  const app = createApp({ runtime, apiToken: effectiveToken });
  const server = app.listen(port, host, () => {
    const address = server.address();
    console.log(`[HospitalityServer] Secure local API listening on ${host}:${address.port}`);
  });
  return server;
}

if (require.main === module) {
  const runtime = createRuntime();
  const apiToken = process.env.HOSPITALITY_API_TOKEN || randomBytes(32).toString('base64url');
  const server = startServer({ runtime, apiToken });
  const shutdown = () => server.close(() => { runtime.close(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createRuntime, createApp, startServer, purgeGhostData, purgeReservations, applyLocalSecurityCompatibility, DEFAULT_HOST, DEFAULT_PORT };
