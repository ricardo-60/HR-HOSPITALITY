/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Regressão da purga de dados fantasma em bases de dados LEGADAS.
 *
 * Em BDs antigas `hotel_consumptions` foi criada como
 * `reservation_id TEXT NOT NULL` sem `ON DELETE`, pelo que apagar uma reserva
 * de demonstração directamente rebenta com "FOREIGN KEY constraint failed" e
 * impede o arranque do Servidor. Este teste reproduz exactamente esse esquema.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { purgeGhostData, applyLocalSecurityCompatibility } = require('../../electron/server');

const TENANT = '11111111-1111-1111-1111-111111111111';
const GHOST_RESERVATION = 'b2222222-2222-4222-8222-000000000002';
const REAL_RESERVATION = 'd5555555-5555-4555-8555-000000000001';
const REAL_CLIENT = 'b1111111-1111-4111-8111-000000000001';
const OCCUPIED_BY_REAL = 'a1111111-1111-4111-8111-000000000101';
const OCCUPIED_BY_GHOST = 'a1111111-1111-4111-8111-000000000202';

/** Esquema actual + hotel_consumptions no formato legado (NOT NULL, sem ON DELETE). */
function createLegacyDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, '../../electron/schema.sql'), 'utf8'));

  db.exec(`
    DROP TABLE IF EXISTS hotel_consumptions;
    CREATE TABLE hotel_consumptions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT NOT NULL DEFAULT '${TENANT}',
      reservation_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      category TEXT DEFAULT 'outro' CHECK (category IN ('minibar','restaurante','lavandaria','telefone','outro')),
      registered_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced', updated_at TEXT,
      FOREIGN KEY (reservation_id) REFERENCES hotel_reservations(id)
    );
  `);
  return db;
}

function seed(db) {
  db.prepare(`
    INSERT INTO hotel_reservations (id, tenant_id, guest_name, email, service_type, room_number, room_id, status, client_id, client_number)
    VALUES (?, ?, 'Maria da Conceicao', 'm.conceicao@email.com', 'quarto', '202', ?, 'CHECKED_IN', NULL, NULL)
  `).run(GHOST_RESERVATION, TENANT, OCCUPIED_BY_GHOST);

  db.prepare(`
    INSERT INTO hotel_consumptions (id, tenant_id, reservation_id, description, unit_price, total_price, category)
    VALUES ('e1111111-1111-4111-8111-000000000001', ?, ?, 'Minibar da reserva de demo', 500, 500, 'minibar')
  `).run(TENANT, GHOST_RESERVATION);

  db.prepare(`
    INSERT INTO client_visits (id, tenant_id, client_id, reservation_id, visit_type, check_in_date, room_number)
    VALUES ('f1111111-1111-4111-8111-000000000001', ?, ?, ?, 'HOSPEDAGEM', date('now'), '202')
  `).run(TENANT, REAL_CLIENT, GHOST_RESERVATION);

  db.prepare(`
    INSERT INTO hotel_reservations (id, tenant_id, guest_name, email, service_type, room_number, room_id, status, client_id, client_number)
    VALUES (?, ?, 'Ricardo Valdemar', 'ricardo.valdemar@email.com', 'quarto', '101', ?, 'CHECKED_IN', ?, 'HR-2026-00001')
  `).run(REAL_RESERVATION, TENANT, OCCUPIED_BY_REAL, REAL_CLIENT);

  db.prepare(`
    INSERT INTO hotel_consumptions (id, tenant_id, reservation_id, description, unit_price, total_price, category)
    VALUES ('e1111111-1111-4111-8111-000000000002', ?, ?, 'Restaurante do hóspede real', 1200, 1200, 'restaurante')
  `).run(TENANT, REAL_RESERVATION);

  db.prepare("UPDATE hotel_rooms SET status = 'OCUPADO' WHERE id = ?").run(OCCUPIED_BY_GHOST);
  db.prepare("UPDATE hotel_rooms SET status = 'OCUPADO' WHERE id = ?").run(OCCUPIED_BY_REAL);
}

test('a purga de dados fantasma corre em esquema legado sem rebentar na FK de consumos', () => {
  const db = createLegacyDatabase();
  seed(db);

  applyLocalSecurityCompatibility(db);

  // NÃO pode lançar: um throw aqui deixa o Servidor sem arrancar.
  assert.doesNotThrow(() => purgeGhostData(db));

  const reservations = db.prepare('SELECT id FROM hotel_reservations ORDER BY id').all();
  assert.deepEqual(reservations.map(r => r.id), [REAL_RESERVATION], 'só a reserva real sobrevive');

  const consumptions = db.prepare('SELECT id, reservation_id FROM hotel_consumptions').all();
  assert.equal(consumptions.length, 1, 'o consumo da reserva fantasma morre com ela');
  assert.equal(consumptions[0].reservation_id, REAL_RESERVATION, 'o consumo do hóspede real fica intacto');

  const visit = db.prepare('SELECT client_id, reservation_id FROM client_visits').all();
  assert.equal(visit.length, 1, 'a visita de cliente mantém-se');
  assert.equal(visit[0].client_id, REAL_CLIENT);
  assert.equal(visit[0].reservation_id, null, 'a FK ON DELETE SET NULL limpou o ponteiro');

  const rooms = db.prepare('SELECT id, status FROM hotel_rooms ORDER BY id').all();
  const byId = Object.fromEntries(rooms.map(r => [r.id, r.status]));
  assert.equal(byId[OCCUPIED_BY_GHOST], 'DISPONIVEL', 'quarto ocupado por fantasma libertado');
  assert.equal(byId[OCCUPIED_BY_REAL], 'OCUPADO', 'quarto ocupado por hóspede real mantido');

  db.close();
});

test('a purga é idempotente e não toca em nada quando não há fantasmas', () => {
  const db = createLegacyDatabase();
  seed(db);
  applyLocalSecurityCompatibility(db);
  purgeGhostData(db);

  const before = db.prepare('SELECT id, status FROM hotel_reservations ORDER BY id').all();
  assert.doesNotThrow(() => purgeGhostData(db));
  const after = db.prepare('SELECT id, status FROM hotel_reservations ORDER BY id').all();
  assert.deepEqual(after, before);

  db.close();
});
