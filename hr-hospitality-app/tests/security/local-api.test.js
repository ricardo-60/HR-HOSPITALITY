/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { executeOperation } = require('../../electron/operations');
const { createApp } = require('../../electron/server');

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../../electron/schema.sql'), 'utf8'));
  return db;
}

test('local registry rejects SQL and unapproved identifiers', () => {
  const db = createDatabase();
  assert.throws(
    () => executeOperation(db, 'data.select', { resource: 'sqlite_master' }),
    error => error.code === 'UNKNOWN_RESOURCE'
  );
  assert.throws(
    () => executeOperation(db, 'data.select', {
      resource: 'hotel_rooms',
      filters: [{ column: 'status; DROP TABLE hotel_rooms', op: 'eq', value: 'x' }]
    }),
    error => error.code === 'VALIDATION_ERROR'
  );
  assert.throws(
    () => executeOperation(db, 'not-an-operation', {}),
    error => error.code === 'UNKNOWN_OPERATION'
  );
  assert.throws(
    () => executeOperation(db, 'toString', {}),
    error => error.code === 'UNKNOWN_OPERATION'
  );
  db.close();
});

test('domain write and sync enqueue are atomic and tenant-bound', () => {
  const db = createDatabase();
  const inserted = executeOperation(db, 'data.upsert', {
    resource: 'hotel_reservations',
    rows: [{
      id: 'c3333333-3333-4333-8333-000000000001',
      guest_name: 'Teste Seguro',
      email: 'security@example.test',
      service_type: 'quarto',
      room_number: '101',
      room_id: 'a1111111-1111-4111-8111-000000000101',
      status: 'CONFIRMADA',
      reservation_date: '2026-09-24',
      check_in_date: '2026-09-24',
      check_out_date: '2026-09-25',
      notes: 'fixture',
      total_amount: 150
    }]
  });
  assert.equal(inserted.data[0].tenant_id, '11111111-1111-1111-1111-111111111111');
  assert.equal(inserted.data[0].sync_status, 'pending');

  const updated = executeOperation(db, 'data.update', {
    resource: 'hotel_reservations',
    id: 'c3333333-3333-4333-8333-000000000001',
    patch: { status: 'CHECKED_IN' }
  });
  assert.equal(updated.data.status, 'CHECKED_IN');

  const cacheWrite = executeOperation(db, 'data.cache.update', {
    resource: 'hotel_reservations',
    id: 'c3333333-3333-4333-8333-000000000001',
    patch: { status: 'CANCELADA' }
  });
  assert.equal(cacheWrite.data.status, 'CHECKED_IN');

  const stats = executeOperation(db, 'sync.stats', {}).data;
  assert.ok(stats.pending >= 2);
  assert.ok(stats.byTable.hotel_reservations >= 2);
  db.close();
});

test('POS consumption validates the reservation and enqueues it', () => {
  const db = createDatabase();
  const result = executeOperation(db, 'pos.postConsumption', {
    reservationId: 'b2222222-2222-4222-8222-000000000002',
    description: 'Teste de segurança',
    unitPrice: 1000,
    totalPrice: 1000,
    category: 'restaurante'
  });
  assert.equal(result.data.reservation_id, 'b2222222-2222-4222-8222-000000000002');
  assert.equal(result.data.sync_status, 'pending');

  assert.throws(
    () => executeOperation(db, 'pos.postConsumption', {
      reservationId: 'd4444444-4444-4444-8444-000000000099',
      description: 'Hóspede inválido',
      unitPrice: 1,
      totalPrice: 1,
      category: 'outro'
    }),
    error => error.code === 'NOT_FOUND'
  );
  db.close();
});

test('HTTP operation API requires a bearer token and has no raw SQL path', async t => {
  const db = createDatabase();
  const runtime = { execute: (operation, input) => executeOperation(db, operation, input) };
  const token = 'unit-test-token-with-enough-entropy';
  const app = createApp({ runtime, apiToken: token });
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const blockedOrigin = await fetch(`${baseUrl}/api/v1/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ operation: 'system.health', input: {} })
  });
  assert.equal(blockedOrigin.status, 403);
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);

  const preflight = await fetch(`${baseUrl}/api/v1/operations`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000');

  const unauthorized = await fetch(`${baseUrl}/api/v1/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'system.health', input: {} })
  });
  assert.equal(unauthorized.status, 401);

  const health = await fetch(`${baseUrl}/api/v1/operations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ operation: 'system.health', input: {} })
  });
  assert.equal(health.status, 200);

  const rawSql = await fetch(`${baseUrl}/api/db/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sql: 'DELETE FROM hotel_rooms' })
  });
  assert.equal(rawSql.status, 410);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hotel_rooms').get().count, 12);
  db.close();
});
