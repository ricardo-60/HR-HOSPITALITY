'use strict';
/**
 * Registo universal de hóspede (migração Supabase 017).
 *
 * A Landing Page e a app submetem documento de identidade, comprovativo de
 * pagamento e foto facial; o caminho de cada peça é gravado em
 * `hotel_reservations` (document_path / receipt_path / face_path) e o
 * `cloudInboundSync` puxa-o para o SQLite local, que é onde a receção lê.
 *
 * Estes testes cobrem a metade LOCAL dessa cadeia — a parte que corre no
 * Servidor Local e que continua a funcionar mesmo sem nuvem:
 *
 *   1. as seis colunas existem no catálogo fechado (RESOURCE_SPECS) e são
 *      graváveis, senão o ingest descartava os caminhos em silêncio;
 *   2. uma reserva guarda e devolve os três caminhos intactos;
 *   3. `document_type` obedece ao mesmo contrato da BD ('BI'|'PASSAPORTE');
 *   4. só as colunas do catálogo passam — os caminhos não são um atalho para
 *      escrever campos fora do registo.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { executeOperation } = require('../../electron/operations');

const MEDIA_COLUMNS = [
  'guest_phone',
  'document_type',
  'document_number',
  'document_path',
  'receipt_path',
  'face_path'
];

const TENTANT_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = '9f1e4b2c-5d3a-4c8e-9b7f-1a2c3d4e5f60';

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, '../../electron/schema.sql'), 'utf8'));
  return db;
}

/** Espelho de um caminho real: `<tenant>/<dono>/<ficheiro>`. */
function mediaPath(suffix) {
  return `${TENTANT_ID}/${OWNER_ID}/${suffix}`;
}

function sampleReservation(overrides = {}) {
  return {
    id: 'e7a1c9d2-4b3f-4e5a-8c6d-0f1e2a3b4c5d',
    guest_name: 'Hospede Da Landing Page',
    email: 'landing@example.test',
    guest_phone: '+244 923 000 111',
    service_type: 'quarto',
    room_number: '101',
    status: 'PENDENTE_PAGAMENTO',
    reservation_date: '2026-10-12',
    check_in_date: '2026-10-12',
    check_out_date: '2026-10-15',
    total_amount: 450,
    document_type: 'BI',
    document_number: '004512345LA042',
    document_path: mediaPath('doc-1760000000000.jpg'),
    receipt_path: mediaPath('receipt-1760000000001.pdf'),
    face_path: mediaPath('face-1760000000002.jpg'),
    ...overrides
  };
}

test('as colunas do registo universal estao no catalogo fechado e sao gravaveis', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../electron/operations.js'), 'utf8');
  const start = src.indexOf('hotel_reservations: Object.freeze({');
  assert.ok(start >= 0, 'hotel_reservations definido em RESOURCE_SPECS');

  const end = src.indexOf('hotel_consumptions:', start);
  const block = src.slice(start, end > start ? end : start + 1200);

  for (const column of MEDIA_COLUMNS) {
    assert.ok(
      block.includes(`'${column}'`),
      `coluna "${column}" tem de constar em RESOURCE_SPECS.hotel_reservations`
    );
  }

  // O catálogo separa `columns` (leitura) de `writable` (escrita): os caminhos
  // precisam de estar em AMBOS, senão o upsert do sync perde-os.
  const columnsPart = block.slice(0, block.indexOf('writable:'));
  const writablePart = block.slice(block.indexOf('writable:'));
  for (const column of MEDIA_COLUMNS) {
    assert.ok(columnsPart.includes(`'${column}'`), `"${column}" legível`);
    assert.ok(writablePart.includes(`'${column}'`), `"${column}" gravável`);
  }
});

test('uma reserva guarda e devolve os tres caminhos intactos', () => {
  const db = createDatabase();
  const row = sampleReservation();

  const created = executeOperation(db, 'data.upsert', {
    resource: 'hotel_reservations',
    rows: [row]
  });
  assert.equal(created.data.length, 1);

  const [found] = executeOperation(db, 'data.select', {
    resource: 'hotel_reservations',
    columns: ['id', 'document_type', 'document_number', 'document_path', 'receipt_path', 'face_path', 'guest_phone'],
    filters: [{ column: 'id', op: 'eq', value: row.id }],
    limit: 1
  }).data;

  assert.equal(found.document_type, 'BI');
  assert.equal(found.document_number, '004512345LA042');
  assert.equal(found.document_path, row.document_path);
  assert.equal(found.receipt_path, row.receipt_path);
  assert.equal(found.face_path, row.face_path);
  assert.equal(found.guest_phone, '+244 923 000 111');
  db.close();
});

test('document_type obedece ao contrato da base (BI ou PASSAPORTE)', () => {
  const db = createDatabase();

  assert.throws(
    () => executeOperation(db, 'data.upsert', {
      resource: 'hotel_reservations',
      rows: [sampleReservation({ id: 'f1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8', document_type: 'CARTEIRA' })]
    })
  );
  db.close();
});

test('so as colunas do catalogo passam — nada fora do registo', () => {
  const db = createDatabase();

  // Um campo fora do catálogo tem de morrer aqui, não no SQL do SQLite:
  // é isso que impede que um cliente web escolha colunas arbitrarias.
  assert.throws(
    () => executeOperation(db, 'data.upsert', {
      resource: 'hotel_reservations',
      rows: [sampleReservation({
        id: 'a1b2c3d4-e5f6-4a70-8b91-c2d3e4f5a6b7',
        face_url: 'https://exemplo.test/roubado.jpg'
      })]
    })
  );
  db.close();
});
