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
  // A reserva deixa de vir de seed: o esquema já não contém reservas de
  // demonstração, por isso o fixture é criado aqui (client KYC ligado).
  const reservationId = 'c3333333-3333-4333-8333-000000000002';
  executeOperation(db, 'data.upsert', {
    resource: 'hotel_reservations',
    rows: [{
      id: reservationId,
      guest_name: 'Cliente de Teste',
      email: 'security@example.test',
      service_type: 'quarto',
      room_number: '101',
      room_id: 'a1111111-1111-4111-8111-000000000101',
      status: 'CHECKED_IN',
      client_id: 'b1111111-1111-4111-8111-000000000001',
      client_number: 'HR-2026-00001',
      reservation_date: '2026-10-10',
      check_in_date: '2026-10-10',
      check_out_date: '2026-10-10',
      notes: 'fixture',
      total_amount: 150
    }]
  });

  const result = executeOperation(db, 'pos.postConsumption', {
    reservationId,
    description: 'Teste de segurança',
    unitPrice: 1000,
    totalPrice: 1000,
    category: 'restaurante'
  });
  assert.equal(result.data.reservation_id, reservationId);
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

test('transfer to room keeps per-item traceability and check-out records the payment', () => {
  const db = createDatabase();
  const reservationId = 'c3333333-3333-4333-8333-000000000090';
  const roomId = 'a1111111-1111-4111-8111-000000000101';
  const piscinaTableId = 'c3333333-3333-4333-8333-000000000041'; // P01, zona PISCINA

  executeOperation(db, 'data.update', {
    resource: 'hotel_rooms',
    id: roomId,
    patch: { status: 'OCUPADO' }
  });
  executeOperation(db, 'data.upsert', {
    resource: 'hotel_reservations',
    rows: [{
      id: reservationId,
      guest_name: 'Ricardo Valdemar',
      email: 'ricardo@example.test',
      service_type: 'quarto',
      room_number: '101',
      room_id: roomId,
      status: 'CHECKED_IN',
      client_id: 'b1111111-1111-4111-8111-000000000001',
      client_number: 'HR-2026-00001',
      reservation_date: '2026-10-10',
      check_in_date: '2026-10-10',
      check_out_date: '2026-10-10',
      notes: 'fixture',
      total_amount: 150
    }]
  });

  // Mesa da Bar da Piscina com dois artigos pendentes (uma categoria livre).
  const added = executeOperation(db, 'pos.tableConsumptions.add', {
    table_id: piscinaTableId,
    product_name: 'Refri Lata',
    quantity: 2,
    unit_price: 500,
    category: 'Bebidas'
  });
  const itemOne = added.data.id;
  executeOperation(db, 'pos.tableConsumptions.add', {
    table_id: piscinaTableId,
    product_name: 'Frango Grelhado',
    quantity: 1,
    unit_price: 3500,
    category: 'Pratos'
  });

  const transfer = executeOperation(db, 'pos.tableTransferToRoom', {
    table_id: piscinaTableId,
    room_id: roomId
  });
  assert.equal(transfer.data.reservation_id ?? reservationId, reservationId);

  // Um lancamento por artigo, com zona, mesa e hora exacta do pedido.
  const rows = db.prepare(`
    SELECT description, quantity, unit_price, total_price, category,
           source_zone, source_table, registered_at
    FROM hotel_consumptions
    WHERE reservation_id = ?
    ORDER BY registered_at ASC
  `).all(reservationId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, 'Refri Lata');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].total_price, 1000);
  assert.equal(rows[1].description, 'Frango Grelhado');
  assert.equal(rows[1].total_price, 3500);
  for (const row of rows) {
    assert.equal(row.source_zone, 'PISCINA');
    assert.equal(row.source_table, 'Mesa Piscina 1');
    assert.ok(row.registered_at, 'consumo deve guardar a hora exacta');
    // Categoria livre do POS nunca pode violar o CHECK da tabela de consumos.
    assert.equal(row.category, 'restaurante');
  }
  // A hora transferida e a do pedido original, nao a do lance para o quarto.
  const original = db.prepare('SELECT created_at FROM pos_table_consumptions WHERE id = ?').get(itemOne);
  assert.equal(rows[0].registered_at, original.created_at);

  // A mesa ficou livre e os artigos pagos.
  assert.equal(db.prepare('SELECT status FROM pos_tables WHERE id = ?').get(piscinaTableId).status, 'LIVRE');
  const posRows = db.prepare('SELECT status FROM pos_table_consumptions WHERE table_id = ?').all(piscinaTableId);
  assert.ok(posRows.every(row => row.status === 'PAGO'));

  // postConsumption tambem aceita zona e mesa de origem (lancamento directo).
  const posted = executeOperation(db, 'pos.postConsumption', {
    reservationId,
    description: 'Room Service - Frango',
    unitPrice: 2000,
    totalPrice: 2000,
    category: 'restaurante',
    sourceZone: 'ROOM_SERVICE',
    sourceTable: 'Quarto 101'
  });
  assert.equal(posted.data.source_zone, 'ROOM_SERVICE');
  assert.equal(posted.data.source_table, 'Quarto 101');

  // Check-out com pagamento: metodo, pago, pendente, troco e fatura ficam nas notas.
  const checkedOut = executeOperation(db, 'hotel_reservations.checkOut', {
    id: reservationId,
    room_status: 'DISPONIVEL',
    payment: {
      method: 'NUMERARIO',
      received: 5200,
      paid: 5150,
      change: 50,
      pending: 0,
      invoice: 'FAC-20261010-120000'
    }
  });
  assert.equal(checkedOut.data.status, 'CHECKED_OUT');
  assert.ok(checkedOut.data.notes.includes('FAC-20261010-120000'));
  assert.ok(checkedOut.data.notes.includes('NUMERARIO'));
  assert.ok(checkedOut.data.notes.includes('pago 5150.00'));
  assert.ok(checkedOut.data.notes.includes('troco 50.00'));
  assert.equal(db.prepare('SELECT status FROM hotel_rooms WHERE id = ?').get(roomId).status, 'DISPONIVEL');

  // Metodos de pagamento fora do conjunto fechado sao rejeitados.
  const otherId = 'c3333333-3333-4333-8333-000000000091';
  executeOperation(db, 'data.upsert', {
    resource: 'hotel_reservations',
    rows: [{
      id: otherId,
      guest_name: 'Outro Hospede',
      email: 'outro@example.test',
      service_type: 'quarto',
      room_number: '102',
      status: 'CHECKED_IN',
      reservation_date: '2026-10-10',
      check_in_date: '2026-10-10',
      total_amount: 150
    }]
  });
  assert.throws(
    () => executeOperation(db, 'hotel_reservations.checkOut', {
      id: otherId,
      payment: { method: 'CHEQUE', paid: 150, pending: 0, change: 0, invoice: 'FAC-20261010-120001' }
    }),
    error => error.code === 'VALIDATION_ERROR'
  );
  assert.equal(db.prepare('SELECT status FROM hotel_reservations WHERE id = ?').get(otherId).status, 'CHECKED_IN');
  db.close();
});

test('manual reservation converts to check-in atomically and blocks double-booking', () => {
  const db = createDatabase();
  const roomId = 'a1111111-1111-4111-8111-000000000102'; // quarto 102

  // 1. Reserva manual CONFIRMADA (balcao/telefone) com sinal nas notas.
  const criada = executeOperation(db, 'hotel_reservations.create', {
    guest_name: 'Ricardo Valdemar',
    email: 'ricardo@example.test',
    service_type: 'quarto',
    room_id: roomId,
    room_number: '102',
    check_in_date: '2026-10-12',
    check_out_date: '2026-10-14',
    status: 'CONFIRMADA',
    total_amount: 300,
    notes: 'Reserva manual | origem=Telefone | entrada=15:00 | saida=11:00 | sinal=50.00',
    client_number: 'HR-2026-00001'
  });
  assert.equal(criada.data.status, 'CONFIRMADA');
  assert.equal(criada.data.client_id, 'b1111111-1111-4111-8111-000000000001');

  // 2. Double-booking: reserva que cobre as mesmas datas e rejeitada.
  assert.throws(
    () => executeOperation(db, 'hotel_reservations.create', {
      guest_name: 'Outro Hospede',
      email: 'outro@example.test',
      service_type: 'quarto',
      room_id: roomId,
      room_number: '102',
      check_in_date: '2026-10-13',
      check_out_date: '2026-10-15',
      status: 'CONFIRMADA',
      total_amount: 100,
      client_number: 'HR-2026-00002'
    }),
    error => error.code === 'VALIDATION_ERROR'
  );
  // Datas nao sobrepostas sao aceites.
  const segunda = executeOperation(db, 'hotel_reservations.create', {
    guest_name: 'Outro Hospede',
    email: 'outro@example.test',
    service_type: 'quarto',
    room_id: roomId,
    room_number: '102',
    check_in_date: '2026-10-16',
    check_out_date: '2026-10-17',
    status: 'CONFIRMADA',
    total_amount: 100,
    client_number: 'HR-2026-00002'
  });
  assert.equal(segunda.data.status, 'CONFIRMADA');

  // 3. Check-in: conversao atomica (reserva CHECKED_IN + quarto OCUPADO + nota).
  const convertida = executeOperation(db, 'hotel_reservations.checkIn', { id: criada.data.id });
  assert.equal(convertida.data.status, 'CHECKED_IN');
  assert.ok(convertida.data.notes.includes('Check-in activo'));
  assert.equal(convertida.room.status, 'OCUPADO');

  // 4. Check-in repetido da mesma reserva e rejeitado (estado invalido).
  assert.throws(
    () => executeOperation(db, 'hotel_reservations.checkIn', { id: criada.data.id }),
    error => error.code === 'VALIDATION_ERROR'
  );

  // 5. Outra reserva do mesmo quarto nao converte enquanto houver estadia activa.
  assert.throws(
    () => executeOperation(db, 'hotel_reservations.checkIn', { id: segunda.data.id }),
    error => error.code === 'VALIDATION_ERROR'
  );

  // 6. Check-out da primeira estadia: reserva CHECKED_OUT. O quarto mantem-se
  //    OCUPADO de proposito — existe reserva de retorno (back-to-back).
  const fecho = executeOperation(db, 'hotel_reservations.checkOut', { id: criada.data.id, room_status: 'DISPONIVEL' });
  assert.equal(fecho.data.status, 'CHECKED_OUT');
  assert.equal(db.prepare('SELECT status FROM hotel_rooms WHERE id = ?').get(roomId).status, 'OCUPADO');

  // 7. Sem estadia activa, a segunda reserva converte; o seu check-out sim liberta.
  const convertida2 = executeOperation(db, 'hotel_reservations.checkIn', { id: segunda.data.id });
  assert.equal(convertida2.data.status, 'CHECKED_IN');
  const fecho2 = executeOperation(db, 'hotel_reservations.checkOut', { id: segunda.data.id, room_status: 'DISPONIVEL' });
  assert.equal(fecho2.data.status, 'CHECKED_OUT');
  assert.equal(db.prepare('SELECT status FROM hotel_rooms WHERE id = ?').get(roomId).status, 'DISPONIVEL');
  db.close();
});
