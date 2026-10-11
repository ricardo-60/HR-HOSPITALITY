/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

/**
 * Registry closed of SQLite operations.
 *
 * The renderer never sends SQL. It sends an operation name and a strictly
 * validated payload; table and column identifiers are selected exclusively
 * from the constants below and all values are bound parameters.
 */

const { randomUUID } = require('node:crypto');

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNC_TABLES = new Set(['hotel_rooms', 'hotel_reservations', 'hotel_consumptions', 'pos_tables', 'pos_table_consumptions', 'clients', 'client_biometrics', 'loyalty_tiers', 'client_visits']);
const RESOURCE_SPECS = Object.freeze({
  hotel_rooms: Object.freeze({
    columns: Object.freeze([
      'id', 'room_number', 'room_type', 'status', 'price_per_night', 'floor',
      'description', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'room_number', 'room_type', 'status', 'price_per_night', 'floor',
      'description', 'created_at'
    ])
  }),
  pos_table_consumptions: Object.freeze({
    columns: Object.freeze([
      'id', 'table_id', 'product_name', 'quantity', 'unit_price', 'subtotal',
      'category', 'status', 'notes', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'table_id', 'product_name', 'quantity', 'unit_price', 'subtotal',
      'category', 'status', 'notes', 'created_at'
    ])
  }),
  hotel_reservations: Object.freeze({
    columns: Object.freeze([
      'id', 'guest_name', 'email', 'service_type', 'room_number', 'room_id',
      'check_in_date', 'check_out_date', 'status', 'reservation_date', 'notes',
      'total_amount', 'client_id', 'client_number', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'guest_name', 'email', 'service_type', 'room_number', 'room_id',
      'check_in_date', 'check_out_date', 'status', 'reservation_date', 'notes',
      'total_amount', 'client_id', 'client_number', 'created_at'
    ])
  }),
  hotel_consumptions: Object.freeze({
    columns: Object.freeze([
      'id', 'reservation_id', 'description', 'quantity', 'unit_price',
      'total_price', 'category', 'source_zone', 'source_table', 'registered_at',
      'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'reservation_id', 'description', 'quantity', 'unit_price',
      'total_price', 'category', 'source_zone', 'source_table', 'registered_at',
      'created_at'
    ])
  }),
  pos_tables: Object.freeze({
    columns: Object.freeze([
      'id', 'code', 'name', 'zone', 'seats', 'status', 'sort_order', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'code', 'name', 'zone', 'seats', 'status', 'sort_order', 'created_at'
    ])
  }),
  clients: Object.freeze({
    columns: Object.freeze([
      'id', 'client_number', 'full_name', 'document_type', 'document_number',
      'address', 'email', 'phone', 'whatsapp', 'date_of_birth', 'nationality',
      'face_embedding', 'face_image_path', 'kyc_completed', 'kyc_completed_at',
      'loyalty_tier', 'loyalty_points', 'total_visits', 'total_spent', 'total_stays',
      'total_pos_spent', 'first_visit_date', 'last_visit_date',
      'preferred_room_type', 'notes', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'client_number', 'full_name', 'document_type', 'document_number',
      'address', 'email', 'phone', 'whatsapp', 'date_of_birth', 'nationality',
      'face_embedding', 'face_image_path', 'kyc_completed', 'kyc_completed_at',
      'loyalty_tier', 'loyalty_points', 'total_visits', 'total_spent', 'total_stays',
      'total_pos_spent', 'first_visit_date', 'last_visit_date',
      'preferred_room_type', 'notes', 'created_at'
    ])
  }),
  client_biometrics: Object.freeze({
    columns: Object.freeze([
      'id', 'client_id', 'embedding', 'image_path', 'confidence', 'device_info', 'created_at'
    ]),
    writable: Object.freeze([
      'id', 'client_id', 'embedding', 'image_path', 'confidence', 'device_info', 'created_at'
    ])
  }),
  loyalty_tiers: Object.freeze({
    columns: Object.freeze([
      'id', 'name', 'min_visits', 'min_spent', 'discount_percent',
      'bonus_points_multiplier', 'color', 'icon', 'benefits', 'is_active',
      'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'name', 'min_visits', 'min_spent', 'discount_percent',
      'bonus_points_multiplier', 'color', 'icon', 'benefits', 'is_active',
      'created_at'
    ])
  }),
  client_visits: Object.freeze({
    columns: Object.freeze([
      'id', 'client_id', 'reservation_id', 'visit_type', 'check_in_date',
      'check_out_date', 'room_number', 'room_type', 'amount_spent',
      'loyalty_points_earned', 'notes', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'client_id', 'reservation_id', 'visit_type', 'check_in_date',
      'check_out_date', 'room_number', 'room_type', 'amount_spent',
      'loyalty_points_earned', 'notes', 'created_at'
    ])
  })
});

const FILTER_OPERATORS = Object.freeze({
  eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'LIKE', ilike: 'LIKE'
});

class OperationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'OperationError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status = 400) {
  throw new OperationError(code, message, status);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail('VALIDATION_ERROR', `${label} must be an object.`);
  return value;
}

function assertExactKeys(input, allowedKeys, requiredKeys = []) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) {
    fail('VALIDATION_ERROR', `Unsupported field(s): ${unknown.join(', ')}.`);
  }
  for (const key of requiredKeys) {
    if (!(key in input)) fail('VALIDATION_ERROR', `Missing field: ${key}.`);
  }
}

function assertResource(resource) {
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_SPECS, resource)) {
    fail('UNKNOWN_RESOURCE', 'Unknown data resource.', 404);
  }
  return RESOURCE_SPECS[resource];
}

function assertString(value, label, { max = 10000, min = 0, pattern = null } = {}) {
  if (typeof value !== 'string') fail('VALIDATION_ERROR', `${label} must be a string.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    fail('VALIDATION_ERROR', `${label} has an invalid length.`);
  }
  if (pattern && !pattern.test(normalized)) {
    fail('VALIDATION_ERROR', `${label} has an invalid format.`);
  }
  return normalized;
}

function assertNumber(value, label, { min = -1e12, max = 1e12 } = {}) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    fail('VALIDATION_ERROR', `${label} must be a finite number.`);
  }
  return number;
}

function assertId(value, label = 'id') {
  return assertString(value, label, { min: 1, max: 128 });
}

function assertBusinessId(value, label = 'id') {
  const id = assertId(value, label);
  if (!UUID_PATTERN.test(id)) fail('VALIDATION_ERROR', `${label} must be a canonical UUID.`);
  return id.toLowerCase();
}

function normalizePrimitive(value, label) {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return assertNumber(value, label);
  if (typeof value === 'string') return assertString(value, label, { max: 10000 });
  fail('VALIDATION_ERROR', `${label} contains an unsupported value.`);
}

function validateColumns(resource, columns) {
  const spec = assertResource(resource);
  if (columns === undefined) return [...spec.columns];
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > spec.columns.length) {
    fail('VALIDATION_ERROR', 'columns must be a non-empty list.');
  }
  const unique = [...new Set(columns)];
  for (const column of unique) {
    if (!spec.columns.includes(column)) fail('VALIDATION_ERROR', `Unknown column: ${column}.`);
  }
  return unique;
}

function validateFilters(resource, filters) {
  const spec = assertResource(resource);
  if (filters === undefined) return [];
  if (!Array.isArray(filters) || filters.length > 12) {
    fail('VALIDATION_ERROR', 'filters must contain at most 12 conditions.');
  }
  return filters.map((filter, index) => {
    assertObject(filter, `filters[${index}]`);
    assertExactKeys(filter, ['column', 'op', 'value'], ['column', 'op', 'value']);
    if (!spec.columns.includes(filter.column)) fail('VALIDATION_ERROR', `Unknown filter column: ${filter.column}.`);
    const op = String(filter.op);
    if (op === 'in') {
      if (!Array.isArray(filter.value) || filter.value.length === 0 || filter.value.length > 100) {
        fail('VALIDATION_ERROR', 'The in filter must contain 1 to 100 values.');
      }
      return { column: filter.column, op, value: filter.value.map((v, i) => normalizePrimitive(v, `filters[${index}].value[${i}]`)) };
    }
    if (!Object.prototype.hasOwnProperty.call(FILTER_OPERATORS, op)) {
      fail('VALIDATION_ERROR', `Unsupported filter operator: ${op}.`);
    }
    if ((op === 'like' || op === 'ilike') && typeof filter.value !== 'string') {
      fail('VALIDATION_ERROR', `${op} requires a string value.`);
    }
    return { column: filter.column, op, value: normalizePrimitive(filter.value, `filters[${index}].value`) };
  });
}

function validateOrderBy(resource, orderBy) {
  const spec = assertResource(resource);
  if (orderBy === undefined) return [];
  if (!Array.isArray(orderBy) || orderBy.length > 5) fail('VALIDATION_ERROR', 'orderBy must contain at most 5 fields.');
  return orderBy.map((entry, index) => {
    assertObject(entry, `orderBy[${index}]`);
    assertExactKeys(entry, ['column', 'ascending'], ['column']);
    if (!spec.columns.includes(entry.column)) fail('VALIDATION_ERROR', `Unknown order column: ${entry.column}.`);
    if (entry.ascending !== undefined && typeof entry.ascending !== 'boolean') {
      fail('VALIDATION_ERROR', 'orderBy.ascending must be boolean.');
    }
    return { column: entry.column, ascending: entry.ascending !== false };
  });
}

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw error;
  }
}

function ensureSyncQueue(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL CHECK (table_name IN ('hotel_rooms','hotel_reservations','hotel_consumptions')),
      action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
      record_id TEXT NOT NULL,
      data TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
}

function enqueue(db, table, action, recordId, row) {
  ensureSyncQueue(db);
  db.prepare(`
    INSERT INTO sync_queue (id, table_name, action, record_id, data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), table, action, recordId, row ? JSON.stringify(row) : null, Date.now());
}

function normalizeWritableRow(resource, rawRow) {
  assertObject(rawRow, 'row');
  const spec = assertResource(resource);
  const allowed = new Set(spec.writable);
  const unknown = Object.keys(rawRow).filter(key => !allowed.has(key));
  if (unknown.length) fail('VALIDATION_ERROR', `Unsupported field(s) for ${resource}: ${unknown.join(', ')}.`);
  if (!Object.keys(rawRow).length) fail('VALIDATION_ERROR', 'row cannot be empty.');

  const row = {};
  for (const [key, value] of Object.entries(rawRow)) {
    row[key] = normalizePrimitive(value, `row.${key}`);
  }
  if (row.id !== undefined) row.id = assertBusinessId(row.id);
  return row;
}

function getOwnedRow(db, resource, id) {
  const row = db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(id, TENANT_ID);
  if (!row) fail('NOT_FOUND', `${resource} record not found.`, 404);
  return row;
}

function selectRows(db, input) {
  assertObject(input, 'input');
  assertExactKeys(input, ['resource', 'columns', 'filters', 'orderBy', 'limit', 'single'], ['resource']);
  const resource = assertString(input.resource, 'resource', { min: 1, max: 64 });
  const columns = validateColumns(resource, input.columns);
  const filters = validateFilters(resource, input.filters);
  const orderBy = validateOrderBy(resource, input.orderBy);
  const limit = input.limit === undefined ? 500 : assertNumber(input.limit, 'limit', { min: 1, max: 1000 });
  if (input.single !== undefined && typeof input.single !== 'boolean') fail('VALIDATION_ERROR', 'single must be boolean.');

  const params = [TENANT_ID];
  const where = ['tenant_id = ?'];
  for (const filter of filters) {
    if (filter.op === 'in') {
      where.push(`${filter.column} IN (${filter.value.map(() => '?').join(',')})`);
      params.push(...filter.value);
    } else if (filter.op === 'ilike') {
      where.push(`LOWER(${filter.column}) LIKE LOWER(?)`);
      params.push(filter.value);
    } else {
      where.push(`${filter.column} ${FILTER_OPERATORS[filter.op]} ?`);
      params.push(filter.value);
    }
  }

  const orderSql = orderBy.length
    ? ` ORDER BY ${orderBy.map(entry => `${entry.column} ${entry.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    : '';
  const rows = db.prepare(
    `SELECT ${columns.join(', ')} FROM ${resource} WHERE ${where.join(' AND ')}${orderSql} LIMIT ?`
  ).all(...params, limit);

  if (input.single && rows.length > 1) fail('CARDINALITY_ERROR', 'Expected at most one row.', 409);
  return rows;
}

function upsertRows(db, input, { queue, status }) {
  assertObject(input, 'input');
  assertExactKeys(input, ['resource', 'rows'], ['resource', 'rows']);
  const resource = assertString(input.resource, 'resource', { min: 1, max: 64 });
  assertResource(resource);
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > 100) {
    fail('VALIDATION_ERROR', 'rows must contain 1 to 100 records.');
  }
  const normalizedRows = input.rows.map(row => normalizeWritableRow(resource, row));

  return transaction(db, () => {
    const result = [];
    for (const rawRow of normalizedRows) {
      const id = rawRow.id || randomUUID();
      const existing = db.prepare(`SELECT id FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(id, TENANT_ID);
      if (existing && !queue) {
        const pending = db.prepare('SELECT id FROM sync_queue WHERE table_name = ? AND record_id = ? LIMIT 1').get(resource, id);
        if (pending) {
          result.push(getOwnedRow(db, resource, id));
          continue;
        }
      }
      const now = new Date().toISOString();
      const row = {
        ...rawRow,
        id,
        tenant_id: TENANT_ID,
        sync_status: status,
        updated_at: now,
        created_at: rawRow.created_at || now
      };
      const keys = Object.keys(row);
      db.prepare(`
        INSERT INTO ${resource} (${keys.join(', ')})
        VALUES (${keys.map(() => '?').join(', ')})
        ON CONFLICT(id) DO UPDATE SET ${keys.filter(key => key !== 'id').map(key => `${key} = excluded.${key}`).join(', ')}
      `).run(...keys.map(key => row[key]));

      const stored = getOwnedRow(db, resource, id);
      if (queue) enqueue(db, resource, existing ? 'UPDATE' : 'INSERT', id, stored);
      result.push(stored);
    }
    return result;
  });
}

function updateOwnedRow(db, input, { queue, status }) {
  assertObject(input, 'input');
  assertExactKeys(input, ['resource', 'id', 'patch'], ['resource', 'id', 'patch']);
  const resource = assertString(input.resource, 'resource', { min: 1, max: 64 });
  assertResource(resource);
  const id = assertBusinessId(input.id);
  const rawPatch = assertObject(input.patch, 'patch');
  if (Object.prototype.hasOwnProperty.call(rawPatch, 'id')) fail('VALIDATION_ERROR', 'patch cannot change id.');
  const patch = normalizeWritableRow(resource, rawPatch);
  if (!Object.keys(patch).length) fail('VALIDATION_ERROR', 'patch cannot be empty.');

  return transaction(db, () => {
    const existing = getOwnedRow(db, resource, id);
    if (!queue) {
      const pending = db.prepare('SELECT id FROM sync_queue WHERE table_name = ? AND record_id = ? LIMIT 1').get(resource, id);
      if (pending) return existing;
    }
    const now = new Date().toISOString();
    const set = { ...patch, sync_status: status, updated_at: now };
    const keys = Object.keys(set);
    const result = db.prepare(`
      UPDATE ${resource}
      SET ${keys.map(key => `${key} = ?`).join(', ')}
      WHERE id = ? AND tenant_id = ?
    `).run(...keys.map(key => set[key]), id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', `${resource} record changed concurrently.`, 409);
    const stored = getOwnedRow(db, resource, id);
    if (queue) enqueue(db, resource, 'UPDATE', id, stored);
    return stored;
  });
}

function deleteOwnedRow(db, input, { queue }) {
  assertObject(input, 'input');
  assertExactKeys(input, ['resource', 'id'], ['resource', 'id']);
  const resource = assertString(input.resource, 'resource', { min: 1, max: 64 });
  assertResource(resource);
  const id = assertBusinessId(input.id);

  return transaction(db, () => {
    const existing = getOwnedRow(db, resource, id);
    const result = db.prepare(`DELETE FROM ${resource} WHERE id = ? AND tenant_id = ?`).run(id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', `${resource} record changed concurrently.`, 409);
    if (queue) enqueue(db, resource, 'DELETE', id, null);
    return existing;
  });
}

function syncStats(db) {
  ensureSyncQueue(db);
  const rows = db.prepare(`
    SELECT table_name, COUNT(*) AS count, MIN(timestamp) AS oldest
    FROM sync_queue GROUP BY table_name
  `).all();
  const byTable = {};
  let pending = 0;
  let oldestEvent = null;
  for (const row of rows) {
    byTable[row.table_name] = Number(row.count);
    pending += Number(row.count);
    if (oldestEvent === null || Number(row.oldest) < oldestEvent) oldestEvent = Number(row.oldest);
  }

  let failed = 0;
  for (const resource of SYNC_TABLES) {
    const queueRows = db.prepare('SELECT record_id FROM sync_queue WHERE table_name = ?').all(resource);
    const ids = queueRows.map(row => row.record_id);
    const sql = ids.length
      ? `SELECT COUNT(*) AS count FROM ${resource} WHERE tenant_id = ? AND sync_status = 'pending' AND id NOT IN (${ids.map(() => '?').join(',')})`
      : `SELECT COUNT(*) AS count FROM ${resource} WHERE tenant_id = ? AND sync_status = 'pending'`;
    failed += Number((db.prepare(sql).get(TENANT_ID, ...ids) || { count: 0 }).count);
  }
  return { pending, failed, byTable, oldestEvent };
}

/**
 * `hotel_consumptions` so aceita categorias fechadas (CHECK), mas o POS grava
 * categorias livres ("Bebidas", "Pratos", ...). Mapeia para a categoria fechada
 * mais proxima para nunca violar o constraint no lance para o quarto.
 */
function consumptionCategoryFor(category) {
  const allowed = ['minibar', 'restaurante', 'lavandaria', 'telefone', 'outro'];
  const value = typeof category === 'string' ? category.trim().toLowerCase() : '';
  return allowed.includes(value) ? value : 'restaurante';
}

function postConsumption(db, input) {
  assertObject(input, 'input');
  assertExactKeys(input, ['reservationId', 'description', 'unitPrice', 'totalPrice', 'category', 'sourceZone', 'sourceTable'], [
    'reservationId', 'description', 'unitPrice', 'totalPrice', 'category'
  ]);
  const reservationId = assertBusinessId(input.reservationId, 'reservationId');
  const description = assertString(input.description, 'description', { min: 2, max: 500 });
  const unitPrice = assertNumber(input.unitPrice, 'unitPrice', { min: 0, max: 1e10 });
  const totalPrice = assertNumber(input.totalPrice, 'totalPrice', { min: 0, max: 1e10 });
  const category = assertString(input.category, 'category', { min: 2, max: 50 });
  if (!['minibar', 'restaurante', 'lavandaria', 'telefone', 'outro'].includes(category)) {
    fail('VALIDATION_ERROR', 'Unsupported consumption category.');
  }
  // Rastreabilidade: onde foi lancado (zona/ponto de venda) e em que mesa/dispositivo.
  const sourceZone = input.sourceZone == null ? null : assertString(input.sourceZone, 'sourceZone', { min: 2, max: 64 });
  const sourceTable = input.sourceTable == null ? null : assertString(input.sourceTable, 'sourceTable', { min: 1, max: 64 });

  return transaction(db, () => {
    const reservation = getOwnedRow(db, 'hotel_reservations', reservationId);
    if (!['CHECKED_IN', 'CONFIRMADA'].includes(reservation.status)) {
      fail('CONFLICT', 'The reservation is not active.', 409);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO hotel_consumptions (
        id, tenant_id, reservation_id, description, quantity, unit_price,
        total_price, category, source_zone, source_table, registered_at,
        created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, reservationId, description, unitPrice, totalPrice, category, sourceZone, sourceTable, now, now, now);
    const stored = getOwnedRow(db, 'hotel_consumptions', id);
    enqueue(db, 'hotel_consumptions', 'INSERT', id, stored);
    return stored;
  });
}

/* ── Reservas: transições de estado com libertação atómica do quarto ─────── */

/**
 * Devolve a reserva activa (CHECKED_IN/CONFIRMADA) de um quarto, ignorando
 * `excludeId` — usado para saber se ainda há alguém dentro depois de uma
 * cancelação.
 */
function findActiveReservation(db, reservation, excludeId) {
  const match = [];
  if (reservation.room_id) match.push('room_id = ?');
  if (reservation.room_number) match.push('room_number = ?');
  if (!match.length) return null;

  const params = [TENANT_ID];
  const clauses = ["tenant_id = ?", "status IN ('CHECKED_IN','CONFIRMADA')"];
  if (excludeId) {
    clauses.push('id <> ?');
    params.push(excludeId);
  }
  const matchParams = [];
  if (reservation.room_id) matchParams.push(reservation.room_id);
  if (reservation.room_number) matchParams.push(reservation.room_number);
  clauses.push(`(${match.join(' OR ')})`);
  params.push(...matchParams);

  return db.prepare(
    `SELECT * FROM hotel_reservations WHERE ${clauses.join(' AND ')} LIMIT 1`
  ).get(...params) || null;
}

function resolveRoomOf(db, reservation) {
  if (reservation.room_id) {
    const byId = db.prepare('SELECT * FROM hotel_rooms WHERE id = ? AND tenant_id = ?')
      .get(reservation.room_id, TENANT_ID);
    if (byId) return byId;
  }
  if (reservation.room_number) {
    const byNumber = db.prepare('SELECT * FROM hotel_rooms WHERE room_number = ? AND tenant_id = ?')
      .get(reservation.room_number, TENANT_ID);
    if (byNumber) return byNumber;
  }
  return null;
}

function writeRoomStatus(db, roomId, status) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE hotel_rooms
       SET status = ?, updated_at = ?, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?
  `).run(status, now, roomId, TENANT_ID);
  if (result.changes !== 1) fail('CONFLICT', 'Room changed concurrently.', 409);
  const stored = getOwnedRow(db, 'hotel_rooms', roomId);
  enqueue(db, 'hotel_rooms', 'UPDATE', roomId, stored);
  return stored;
}

function writeReservation(db, id, patch) {
  const now = new Date().toISOString();
  const set = { ...patch, updated_at: now, sync_status: 'pending' };
  const keys = Object.keys(set);
  const result = db.prepare(`
    UPDATE hotel_reservations
       SET ${keys.map(key => `${key} = ?`).join(', ')}
     WHERE id = ? AND tenant_id = ?
  `).run(...keys.map(key => set[key]), id, TENANT_ID);
  if (result.changes !== 1) fail('CONFLICT', 'Reservation changed concurrently.', 409);
  const stored = getOwnedRow(db, 'hotel_reservations', id);
  enqueue(db, 'hotel_reservations', 'UPDATE', id, stored);
  return stored;
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Regista o pagamento do check-out nas notas da reserva (auditoria do fecho):
 * metodo, valor pago, saldo pendente, troco devolvido e numero da fatura.
 */
function appendCheckoutNote(existing, payment) {
  const linha = `Fatura ${payment.invoice} | ${payment.method} | pago ${payment.paid.toFixed(2)} | pendente ${payment.pending.toFixed(2)} | troco ${payment.change.toFixed(2)}`;
  return appendReservationNote(existing, linha);
}

/**
 * Acrescenta uma linha de auditoria ao fim das notas da reserva (max. 800 chars,
 * guarda so o ultimo registo para o historico nao crescer sem limite).
 */
function appendReservationNote(existing, linha) {
  const base = typeof existing === 'string' && existing.trim() ? existing.trim() : '';
  const texto = base ? `${base}\n${linha}` : linha;
  return texto.length > 800 ? texto.slice(-800) : texto;
}

const OPERATIONS = Object.freeze({
  'system.health': () => ({ status: 'ok' }),
  'data.select': (db, input) => ({ data: selectRows(db, input) }),
  'data.upsert': (db, input) => ({ data: upsertRows(db, input, { queue: true, status: 'pending' }) }),
  'data.update': (db, input) => ({ data: updateOwnedRow(db, input, { queue: true, status: 'pending' }) }),
  'data.delete': (db, input) => ({ data: deleteOwnedRow(db, input, { queue: true }) }),
  'data.cache.upsert': (db, input) => ({ data: upsertRows(db, input, { queue: false, status: 'synced' }) }),
  'data.cache.update': (db, input) => ({ data: updateOwnedRow(db, input, { queue: false, status: 'synced' }) }),
  'data.cache.delete': (db, input) => ({ data: deleteOwnedRow(db, input, { queue: false }) }),
  'sync.stats': (db) => ({ data: syncStats(db) }),
  'sync.listEvents': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['limit']);
    const limit = input.limit === undefined ? 50 : assertNumber(input.limit, 'limit', { min: 1, max: 200 });
    ensureSyncQueue(db);
    return { data: db.prepare(`
      SELECT id, table_name, action, record_id, data, timestamp
      FROM sync_queue ORDER BY timestamp ASC LIMIT ?
    `).all(limit) };
  },
  'sync.pendingCount': (db) => {
    ensureSyncQueue(db);
    return { data: { count: Number(db.prepare('SELECT COUNT(*) AS count FROM sync_queue').get().count) } };
  },
  'sync.discardEvents': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['ids'], ['ids']);
    if (!Array.isArray(input.ids) || input.ids.length === 0 || input.ids.length > 200) {
      fail('VALIDATION_ERROR', 'ids must contain 1 to 200 event identifiers.');
    }
    const ids = input.ids.map(id => assertBusinessId(id, 'event id'));
    return transaction(db, () => {
      const result = db.prepare(`DELETE FROM sync_queue WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      return { changes: Number(result.changes) };
    });
  },
  'sync.completeEvent': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id, 'event id');
    return transaction(db, () => {
      const event = db.prepare('SELECT table_name, action, record_id FROM sync_queue WHERE id = ?').get(id);
      if (!event) fail('NOT_FOUND', 'Sync event not found.', 404);
      if (!SYNC_TABLES.has(event.table_name)) fail('VALIDATION_ERROR', 'Sync event contains an unsupported table.');
      db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id);
      if (event.action !== 'DELETE') {
        db.prepare(`UPDATE ${event.table_name} SET sync_status = 'synced' WHERE id = ? AND tenant_id = ?`)
          .run(event.record_id, TENANT_ID);
      }
      return { changes: 1 };
    });
  },
  'reservations.activeGuests': (db) => ({
    data: db.prepare(`
      SELECT id, guest_name AS fullName, room_number AS roomId, email
      FROM hotel_reservations
      WHERE tenant_id = ? AND status IN ('CHECKED_IN', 'CONFIRMADA')
      ORDER BY created_at DESC
    `).all(TENANT_ID)
  }),
  'hotel_rooms.list': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['status', 'limit', 'offset'], []);
    const status = input.status ? assertString(input.status, 'status', { min: 1, max: 32 }) : undefined;
    const limit = input.limit === undefined ? 100 : assertNumber(input.limit, 'limit', { min: 1, max: 500 });
    const offset = input.offset === undefined ? 0 : assertNumber(input.offset, 'offset', { min: 0 });

    const params = [TENANT_ID];
    const where = ['tenant_id = ?'];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const rows = db.prepare(
      `SELECT id, room_number, room_type, status, price_per_night, floor, description, created_at, updated_at
       FROM hotel_rooms
       WHERE ${where.join(' AND ')}
       ORDER BY room_number
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM hotel_rooms WHERE ${where.join(' AND ')}`
    ).get(...params);

    return { data: rows, total: total?.count || 0 };
  },
  'hotel_rooms.update': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id', 'status', 'room_type', 'price_per_night', 'floor', 'description'], ['id']);
    const id = assertBusinessId(input.id);
    const existing = getOwnedRow(db, 'hotel_rooms', id);
    const patch = {};
    if (input.status !== undefined) {
      const status = assertString(input.status, 'status', { min: 1, max: 32 });
      if (!['DISPONIVEL', 'OCUPADO', 'LIMPEZA', 'MANUTENCAO'].includes(status)) {
        fail('VALIDATION_ERROR', 'Invalid room status.');
      }
      patch.status = status;
    }
    if (input.room_type !== undefined) patch.room_type = assertString(input.room_type, 'room_type', { min: 1, max: 64 });
    if (input.price_per_night !== undefined) patch.price_per_night = assertNumber(input.price_per_night, 'price_per_night', { min: 0, max: 1e6 });
    if (input.floor !== undefined) patch.floor = assertNumber(input.floor, 'floor', { min: 0, max: 100 });
    if (input.description !== undefined) patch.description = input.description ? assertString(input.description, 'description', { max: 500 }) : null;

    if (Object.keys(patch).length === 0) fail('VALIDATION_ERROR', 'No fields to update.');
    const now = new Date().toISOString();
    patch.sync_status = 'pending';
    patch.updated_at = now;
    const keys = Object.keys(patch);
    const result = db.prepare(`
      UPDATE hotel_rooms
      SET ${keys.map(key => `${key} = ?`).join(', ')}
      WHERE id = ? AND tenant_id = ?
    `).run(...keys.map(key => patch[key]), id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Room changed concurrently.', 409);
    const stored = getOwnedRow(db, 'hotel_rooms', id);
    enqueue(db, 'hotel_rooms', 'UPDATE', id, stored);
    return { data: stored };
  },
  'hotel_reservations.create': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['guest_name', 'email', 'service_type', 'room_id', 'room_number', 'check_in_date', 'check_out_date', 'status', 'total_amount', 'notes', 'client_id', 'client_number'], ['guest_name', 'email', 'service_type', 'room_id', 'check_in_date', 'check_out_date', 'status']);
    const guestName = assertString(input.guest_name, 'guest_name', { min: 1, max: 255 });
    const email = assertString(input.email, 'email', { min: 1, max: 255 });
    const serviceType = assertString(input.service_type, 'service_type', { min: 1, max: 32 });
    if (!['quarto', 'conferencia', 'restaurante', 'transfer'].includes(serviceType)) {
      fail('VALIDATION_ERROR', 'Invalid service type.');
    }
    const roomId = assertBusinessId(input.room_id);
    getOwnedRow(db, 'hotel_rooms', roomId);
    const roomNumber = assertString(input.room_number, 'room_number', { min: 1, max: 32 });
    const checkInDate = assertString(input.check_in_date, 'check_in_date', { min: 10, max: 10 });
    const checkOutDate = assertString(input.check_out_date, 'check_out_date', { min: 10, max: 10 });
    const status = assertString(input.status, 'status', { min: 1, max: 32 });
    if (!['PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELADA'].includes(status)) {
      fail('VALIDATION_ERROR', 'Invalid reservation status.');
    }
    const totalAmount = input.total_amount !== undefined ? assertNumber(input.total_amount, 'total_amount', { min: 0, max: 1e6 }) : 0;
    const notes = input.notes ? assertString(input.notes, 'notes', { max: 1000 }) : null;

    // Ligação estrita ao cliente KYC: toda a estadia de quarto tem de pertencer
    // a um cliente cadastrado em `clients` (seed KYC ou onboarding).
    let clientId = input.client_id !== undefined && input.client_id !== null
      ? assertBusinessId(input.client_id, 'client_id')
      : null;
    let clientNumber = input.client_number !== undefined && input.client_number !== null
      ? assertString(input.client_number, 'client_number', { min: 1, max: 32 })
      : null;
    if (!clientId && !clientNumber && serviceType === 'quarto') {
      fail('VALIDATION_ERROR', 'client_id or client_number is required for room stays.');
    }
    if (clientId) {
      const client = getOwnedRow(db, 'clients', clientId);
      if (clientNumber && client.client_number !== clientNumber) {
        fail('VALIDATION_ERROR', 'client_number does not match client_id.');
      }
      clientNumber = client.client_number;
    } else if (clientNumber) {
      const client = db.prepare('SELECT id, client_number FROM clients WHERE client_number = ? AND tenant_id = ?')
        .get(clientNumber, TENANT_ID);
      if (!client) fail('NOT_FOUND', 'Client not found.', 404);
      clientId = client.id;
      clientNumber = client.client_number;
    }

    // Anti double-booking: uma reserva futura (balcao/telefone/portal) nao pode
    // cobrir datas ja ocupadas por outra reserva activa do mesmo quarto. O
    // check-in directo (CHECKED_IN) ignora a regra — e a conversao da propria
    // reserva agendada, ja validada pela UI com a disponibilidade do quarto.
    if (['PENDENTE_PAGAMENTO', 'CONFIRMADA'].includes(status)) {
      const conflito = db.prepare(`
        SELECT id, guest_name FROM hotel_reservations
         WHERE tenant_id = ? AND room_id = ?
           AND status IN ('PENDENTE_PAGAMENTO','CONFIRMADA','CHECKED_IN')
           AND date(check_in_date) < date(?)
           AND date(check_out_date) > date(?)
         LIMIT 1
      `).get(TENANT_ID, roomId, checkOutDate, checkInDate);
      if (conflito) {
        fail('VALIDATION_ERROR', `O quarto ja tem uma reserva que cobre estas datas (${conflito.guest_name}).`);
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO hotel_reservations (id, tenant_id, guest_name, email, service_type, room_id, room_number, check_in_date, check_out_date, status, total_amount, notes, client_id, client_number, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, guestName, email, serviceType, roomId, roomNumber, checkInDate, checkOutDate, status, totalAmount, notes, clientId, clientNumber, now, now);
    const stored = getOwnedRow(db, 'hotel_reservations', id);
    enqueue(db, 'hotel_reservations', 'INSERT', id, stored);
    return { data: stored };
  },
  'hotel_reservations.list': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['status', 'limit', 'offset'], []);
    const status = input.status ? assertString(input.status, 'status', { min: 1, max: 32 }) : undefined;
    const limit = input.limit === undefined ? 100 : assertNumber(input.limit, 'limit', { min: 1, max: 500 });
    const offset = input.offset === undefined ? 0 : assertNumber(input.offset, 'offset', { min: 0 });

    const params = [TENANT_ID];
    const where = ['tenant_id = ?'];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const rows = db.prepare(
      `SELECT id, guest_name, email, service_type, room_number, room_id, check_in_date, check_out_date, status, reservation_date, client_id, client_number, total_amount, notes, created_at, updated_at
       FROM hotel_reservations
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM hotel_reservations WHERE ${where.join(' AND ')}`
    ).get(...params);

    return { data: rows, total: total?.count || 0 };
  },
  // Cancelar / desmarcar: marca a reserva como CANCELADA e, se deixou de haver
  // qualquer hóspede activo no quarto, liberta-o imediatamente para DISPONIVEL.
  'hotel_reservations.cancel': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    return transaction(db, () => {
      const reservation = getOwnedRow(db, 'hotel_reservations', id);
      if (reservation.status === 'CANCELADA') return { data: reservation, room: null };

      const updated = writeReservation(db, id, { status: 'CANCELADA' });
      const room = resolveRoomOf(db, reservation);
      let freedRoom = null;
      if (room && room.status === 'OCUPADO') {
        const other = findActiveReservation(db, reservation, id);
        if (!other) freedRoom = writeRoomStatus(db, room.id, 'DISPONIVEL');
      }
      return { data: updated, room: freedRoom };
    });
  },
  // Reativar uma reserva cancelada volta a marcá-la como CONFIRMADA (o mapa de
  // quartos deriva automaticamente o estado RESERVADO).
  'hotel_reservations.restore': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    return transaction(db, () => {
      const reservation = getOwnedRow(db, 'hotel_reservations', id);
      if (reservation.status === 'CANCELADA') {
        const room = resolveRoomOf(db, reservation);
        if (room) {
          const conflict = findActiveReservation(db, reservation, id);
          if (conflict) fail('CONFLICT', `O quarto ${room.room_number} já tem uma reserva activa.`, 409);
        }
      }
      const updated = writeReservation(db, id, { status: 'CONFIRMADA' });
      return { data: updated, room: resolveRoomOf(db, updated) };
    });
  },
  // Check-out: transita a reserva para CHECKED_OUT e o quarto para
  // DISPONIVEL (livre) ou LIMPEZA (sujo), num único lance atómico.
  'hotel_reservations.checkOut': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id', 'room_status', 'payment'], ['id']);
    const id = assertBusinessId(input.id);
    const roomStatus = input.room_status === undefined ? 'DISPONIVEL' : assertString(input.room_status, 'room_status', { min: 1, max: 32 });
    if (!['DISPONIVEL', 'LIMPEZA'].includes(roomStatus)) {
      fail('VALIDATION_ERROR', 'room_status must be DISPONIVEL or LIMPEZA.');
    }
    // Pagamento opcional do fecho: fica registado nas notas da reserva para
    // auditoria (metodo, pago, pendente, troco e numero da fatura).
    let payment = null;
    if (input.payment !== undefined && input.payment !== null) {
      payment = assertObject(input.payment, 'payment');
      assertExactKeys(payment, ['method', 'paid', 'pending', 'change', 'invoice', 'received'], ['method', 'paid', 'pending', 'change', 'invoice']);
      payment = {
        method: assertString(payment.method, 'payment.method', { min: 3, max: 32 }),
        paid: assertNumber(payment.paid, 'payment.paid', { min: 0, max: 1e12 }),
        pending: assertNumber(payment.pending, 'payment.pending', { min: 0, max: 1e12 }),
        change: assertNumber(payment.change, 'payment.change', { min: 0, max: 1e12 }),
        invoice: assertString(payment.invoice, 'payment.invoice', { min: 4, max: 40 })
      };
      if (!['NUMERARIO', 'TPA', 'TRANSFERENCIA'].includes(payment.method)) {
        fail('VALIDATION_ERROR', 'payment.method must be NUMERARIO, TPA or TRANSFERENCIA.');
      }
    }
    return transaction(db, () => {
      const reservation = getOwnedRow(db, 'hotel_reservations', id);
      if (!['CHECKED_IN', 'CONFIRMADA'].includes(reservation.status)) {
        fail('VALIDATION_ERROR', `Cannot check out a reservation in status ${reservation.status}.`);
      }
      const updated = writeReservation(db, id, {
        status: 'CHECKED_OUT',
        check_out_date: todayIso(),
        ...(payment ? { notes: appendCheckoutNote(reservation.notes, payment) } : {})
      });
      const room = resolveRoomOf(db, reservation);
      let updatedRoom = null;
      if (room && room.status === 'OCUPADO') {
        const other = findActiveReservation(db, reservation, id);
        if (!other) updatedRoom = writeRoomStatus(db, room.id, roomStatus);
      }
      return { data: updated, room: updatedRoom };
    });
  },
  // Conversao de reserva agendada (telefone/balcao/portal) em estadia activa:
  // atómica, como o check-out — reserva → CHECKED_IN e quarto → OCUPADO.
  'hotel_reservations.checkIn': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    return transaction(db, () => {
      const reservation = getOwnedRow(db, 'hotel_reservations', id);
      if (!['PENDENTE_PAGAMENTO', 'CONFIRMADA'].includes(reservation.status)) {
        fail('VALIDATION_ERROR', `Cannot check in a reservation in status ${reservation.status}.`);
      }
      const room = resolveRoomOf(db, reservation);
      if (!room) fail('VALIDATION_ERROR', 'A reserva nao tem quarto associado.');
      // Outra estadia ja activa no mesmo quarto: conversao bloqueada (double-booking).
      const other = findActiveReservation(db, reservation, id);
      if (other && other.status === 'CHECKED_IN') {
        fail('VALIDATION_ERROR', `O quarto ${room.room_number} ja tem uma estadia activa.`);
      }
      const agora = new Date();
      const updated = writeReservation(db, id, {
        status: 'CHECKED_IN',
        check_in_date: todayIso(),
        notes: appendReservationNote(reservation.notes, `Check-in activo ${agora.toISOString()} (reserva convertida)`)
      });
      const updatedRoom = writeRoomStatus(db, room.id, 'OCUPADO');
      return { data: updated, room: updatedRoom };
    });
  },
  'pos.postConsumption': (db, input) => ({ data: postConsumption(db, input) }),
  'pos.listTables': (db) => ({
    data: db.prepare(`
      SELECT id, code, name, zone, seats, status, sort_order, created_at, updated_at
      FROM pos_tables
      WHERE tenant_id = ?
      ORDER BY zone ASC, sort_order ASC, name ASC
    `).all(TENANT_ID)
  }),
  'pos.createTable': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['code', 'name', 'zone', 'seats', 'status', 'sort_order'], ['code', 'name', 'zone', 'seats', 'status', 'sort_order']);
    const code = assertString(input.code, 'code', { min: 1, max: 32 });
    const name = assertString(input.name, 'name', { min: 1, max: 128 });
    const zone = assertString(input.zone, 'zone', { min: 1, max: 32 });
    const seats = assertNumber(input.seats, 'seats', { min: 1, max: 50 });
    const status = assertString(input.status, 'status', { min: 1, max: 32 });
    if (!['LIVRE', 'OCUPADA', 'RESERVADA', 'MANUTENCAO'].includes(status)) {
      fail('VALIDATION_ERROR', 'Invalid table status.');
    }
    const sortOrder = assertNumber(input.sort_order, 'sort_order', { min: 0, max: 10000 });
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO pos_tables (id, tenant_id, code, name, zone, seats, status, sort_order, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, code, name, zone, seats, status, sortOrder, now, now);
    const stored = getOwnedRow(db, 'pos_tables', id);
    enqueue(db, 'pos_tables', 'INSERT', id, stored);
    return { data: stored };
  },
  'pos.updateTable': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id', 'code', 'name', 'zone', 'seats', 'status', 'sort_order'], ['id']);
    const id = assertBusinessId(input.id);
    const patch = {};
    if (input.code !== undefined) patch.code = assertString(input.code, 'code', { min: 1, max: 32 });
    if (input.name !== undefined) patch.name = assertString(input.name, 'name', { min: 1, max: 128 });
    if (input.zone !== undefined) patch.zone = assertString(input.zone, 'zone', { min: 1, max: 32 });
    if (input.seats !== undefined) patch.seats = assertNumber(input.seats, 'seats', { min: 1, max: 50 });
    if (input.status !== undefined) {
      const status = assertString(input.status, 'status', { min: 1, max: 32 });
      if (!['LIVRE', 'OCUPADA', 'RESERVADA', 'MANUTENCAO'].includes(status)) {
        fail('VALIDATION_ERROR', 'Invalid table status.');
      }
      patch.status = status;
    }
    if (input.sort_order !== undefined) patch.sort_order = assertNumber(input.sort_order, 'sort_order', { min: 0, max: 10000 });
    if (Object.keys(patch).length === 0) fail('VALIDATION_ERROR', 'No fields to update.');
    const now = new Date().toISOString();
    patch.sync_status = 'pending';
    patch.updated_at = now;
    const keys = Object.keys(patch);
    const result = db.prepare(`
      UPDATE pos_tables
      SET ${keys.map(key => `${key} = ?`).join(', ')}
      WHERE id = ? AND tenant_id = ?
    `).run(...keys.map(key => patch[key]), id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Table changed concurrently.', 409);
    const stored = getOwnedRow(db, 'pos_tables', id);
    enqueue(db, 'pos_tables', 'UPDATE', id, stored);
    return { data: stored };
  },
  'pos.deleteTable': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    const existing = getOwnedRow(db, 'pos_tables', id);
    const result = db.prepare(`DELETE FROM pos_tables WHERE id = ? AND tenant_id = ?`).run(id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Table changed concurrently.', 409);
    enqueue(db, 'pos_tables', 'DELETE', id, null);
    return { data: existing };
  },
  // === POS Table Consumptions Operations ===
  'pos.tableConsumptions.list': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['table_id', 'status', 'limit', 'offset'], ['table_id']);
    const tableId = assertBusinessId(input.table_id);
    const status = input.status ? assertString(input.status, 'status', { min: 1, max: 32 }) : undefined;
    const limit = input.limit === undefined ? 100 : assertNumber(input.limit, 'limit', { min: 1, max: 500 });
    const offset = input.offset === undefined ? 0 : assertNumber(input.offset, 'offset', { min: 0 });

    const params = [TENANT_ID, tableId];
    const where = ['tenant_id = ?', 'table_id = ?'];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const rows = db.prepare(
      `SELECT id, table_id, product_name, quantity, unit_price, subtotal, category, status, notes, created_at
       FROM pos_table_consumptions
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM pos_table_consumptions WHERE ${where.join(' AND ')}`
    ).get(...params);

    return { data: rows, total: total?.count || 0 };
  },
  'pos.tableConsumptions.add': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['table_id', 'product_name', 'quantity', 'unit_price', 'category', 'notes'], ['table_id', 'product_name', 'quantity', 'unit_price']);
    const tableId = assertBusinessId(input.table_id);
    getOwnedRow(db, 'pos_tables', tableId); // verify table exists
    const productName = assertString(input.product_name, 'product_name', { min: 1, max: 255 });
    const quantity = assertNumber(input.quantity, 'quantity', { min: 1, max: 100 });
    const unitPrice = assertNumber(input.unit_price, 'unit_price', { min: 0, max: 1e6 });
    const subtotal = quantity * unitPrice;
    const category = input.category ? assertString(input.category, 'category', { max: 64 }) : null;
    const notes = input.notes ? assertString(input.notes, 'notes', { max: 500 }) : null;

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO pos_table_consumptions (id, tenant_id, table_id, product_name, quantity, unit_price, subtotal, category, status, notes, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, tableId, productName, quantity, unitPrice, subtotal, category, notes, now, now);
    const stored = getOwnedRow(db, 'pos_table_consumptions', id);
    enqueue(db, 'pos_table_consumptions', 'INSERT', id, stored);
    return { data: stored };
  },
  'pos.tableConsumptions.update': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id', 'quantity', 'unit_price', 'status', 'notes'], ['id']);
    const id = assertBusinessId(input.id);
    const existing = getOwnedRow(db, 'pos_table_consumptions', id);
    const patch = {};
    if (input.quantity !== undefined) patch.quantity = assertNumber(input.quantity, 'quantity', { min: 1, max: 100 });
    if (input.unit_price !== undefined) patch.unit_price = assertNumber(input.unit_price, 'unit_price', { min: 0, max: 1e6 });
    if (input.status !== undefined) {
      const status = assertString(input.status, 'status', { min: 1, max: 32 });
      if (!['PENDENTE', 'ENVIADO', 'CANCELADO', 'PAGO'].includes(status)) {
        fail('VALIDATION_ERROR', 'Invalid consumption status.');
      }
      patch.status = status;
    }
    if (input.notes !== undefined) patch.notes = input.notes ? assertString(input.notes, 'notes', { max: 500 }) : null;

    if (Object.keys(patch).length === 0) fail('VALIDATION_ERROR', 'No fields to update.');
    
    // Recalculate subtotal if quantity or unit_price changed
    if (patch.quantity !== undefined || patch.unit_price !== undefined) {
      const qty = patch.quantity !== undefined ? patch.quantity : existing.quantity;
      const price = patch.unit_price !== undefined ? patch.unit_price : existing.unit_price;
      patch.subtotal = qty * price;
    }

    const now = new Date().toISOString();
    patch.sync_status = 'pending';
    patch.updated_at = now;
    const keys = Object.keys(patch);
    const result = db.prepare(`
      UPDATE pos_table_consumptions
      SET ${keys.map(key => `${key} = ?`).join(', ')}
      WHERE id = ? AND tenant_id = ?
    `).run(...keys.map(key => patch[key]), id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Consumption changed concurrently.', 409);
    const stored = getOwnedRow(db, 'pos_table_consumptions', id);
    enqueue(db, 'pos_table_consumptions', 'UPDATE', id, stored);
    return { data: stored };
  },
  'pos.tableConsumptions.delete': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    const existing = getOwnedRow(db, 'pos_table_consumptions', id);
    const result = db.prepare(`DELETE FROM pos_table_consumptions WHERE id = ? AND tenant_id = ?`).run(id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Consumption changed concurrently.', 409);
    enqueue(db, 'pos_table_consumptions', 'DELETE', id, null);
    return { data: existing };
  },
  'pos.tableConsumptions.getTotal': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['table_id', 'status'], ['table_id']);
    const tableId = assertBusinessId(input.table_id);
    const status = input.status ? assertString(input.status, 'status', { min: 1, max: 32 }) : undefined;

    const params = [TENANT_ID, tableId];
    const where = ['tenant_id = ?', 'table_id = ?'];
    if (status) {
      where.push('status = ?');
      params.push(status);
    } else {
      where.push("status IN ('PENDENTE', 'ENVIADO')");
    }

    const result = db.prepare(
      `SELECT COALESCE(SUM(subtotal), 0) as total, COUNT(*) as count
       FROM pos_table_consumptions
       WHERE ${where.join(' AND ')}`
    ).get(...params);

    return { data: { total: result?.total || 0, count: result?.count || 0 } };
  },
  'pos.tableConsumptions.clear': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['table_id'], ['table_id']);
    const tableId = assertBusinessId(input.table_id);
    
    // Mark all non-PAGO consumptions as CANCELADO when closing table
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE pos_table_consumptions
      SET status = 'PAGO', updated_at = ?, sync_status = 'pending'
      WHERE table_id = ? AND tenant_id = ? AND status != 'PAGO'
    `).run(now, tableId, TENANT_ID);
    
    // Also update table status to LIVRE
    db.prepare(`
      UPDATE pos_tables
      SET status = 'LIVRE', updated_at = ?, sync_status = 'pending'
      WHERE id = ? AND tenant_id = ?
    `).run(now, tableId, TENANT_ID);
    
    // Enqueue sync for updated consumptions
    const updated = db.prepare(`SELECT id FROM pos_table_consumptions WHERE table_id = ? AND tenant_id = ?`).all(tableId, TENANT_ID);
    for (const row of updated) {
      enqueue(db, 'pos_table_consumptions', 'UPDATE', row.id, { id: row.id, status: 'PAGO' });
    }
    enqueue(db, 'pos_tables', 'UPDATE', tableId, { id: tableId, status: 'LIVRE' });
    
    return { data: { updated: result.changes } };
  },
  'pos.tableTransferToRoom': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['table_id', 'room_id', 'client_id'], ['table_id', 'room_id']);
    const tableId = assertBusinessId(input.table_id);
    const roomId = assertBusinessId(input.room_id);
    const clientId = input.client_id ? assertBusinessId(input.client_id) : null;
    
    const table = getOwnedRow(db, 'pos_tables', tableId);

    // Artigos pendentes da mesa: cada um vira um lancamento de quarto proprio,
    // preservando descricao, quantidade, preco unitario e a hora exacta do pedido.
    const items = db.prepare(`
      SELECT id, product_name, quantity, unit_price, subtotal, category, created_at
      FROM pos_table_consumptions
      WHERE table_id = ? AND tenant_id = ? AND status IN ('PENDENTE', 'ENVIADO')
      ORDER BY created_at ASC
    `).all(tableId, TENANT_ID);
    const total = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    if (total <= 0) {
      fail('VALIDATION_ERROR', 'No pending consumptions to transfer.');
    }
    
    // Verify room exists and get reservation
    const room = db.prepare(`SELECT * FROM hotel_rooms WHERE id = ? AND tenant_id = ?`).get(roomId, TENANT_ID);
    if (!room) fail('NOT_FOUND', 'Room not found.', 404);
    
    // Find active reservation for this room
    const reservation = db.prepare(`
      SELECT * FROM hotel_reservations
      WHERE room_id = ? AND tenant_id = ? AND status IN ('CHECKED_IN', 'CONFIRMADA')
      ORDER BY created_at DESC LIMIT 1
    `).get(roomId, TENANT_ID);
    
    if (!reservation) {
      fail('VALIDATION_ERROR', 'No active reservation for this room.');
    }
    
    // Get client info if provided
    let client = null;
    if (clientId) {
      client = db.prepare(`SELECT * FROM clients WHERE id = ? AND tenant_id = ?`).get(clientId, TENANT_ID);
    } else if (reservation.guest_name) {
      // Try to find client by name
      client = db.prepare(`SELECT * FROM clients WHERE full_name = ? AND tenant_id = ?`).get(reservation.guest_name, TENANT_ID);
    }
    
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    // Zona de consumo e mesa/dispositivo de origem — rastreio no extrato do quarto.
    const sourceZone = table.zone || null;
    const sourceTable = table.name || table.code || null;

    // Um lancamento por artigo: a conta do quarto discrimina o que foi pedido,
    // com quantidade, preco unitario, total, zona, mesa e hora exacta do pedido.
    for (const item of items) {
      const consumptionId = randomUUID();
      db.prepare(`
        INSERT INTO hotel_consumptions (
          id, tenant_id, reservation_id, description, quantity, unit_price,
          total_price, category, source_zone, source_table, registered_at,
          created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        consumptionId, TENANT_ID, reservation.id,
        item.product_name, item.quantity, item.unit_price, item.subtotal,
        consumptionCategoryFor(item.category),
        sourceZone, sourceTable,
        item.created_at || now, now, now
      );
      enqueue(db, 'hotel_consumptions', 'INSERT', consumptionId, getOwnedRow(db, 'hotel_consumptions', consumptionId));
    }

    // Mark table consumptions as PAGO
    db.prepare(`
      UPDATE pos_table_consumptions
      SET status = 'PAGO', updated_at = ?, sync_status = 'pending'
      WHERE table_id = ? AND tenant_id = ? AND status IN ('PENDENTE', 'ENVIADO')
    `).run(now, tableId, TENANT_ID);
    
    // Update table to LIVRE
    db.prepare(`
      UPDATE pos_tables
      SET status = 'LIVRE', updated_at = ?, sync_status = 'pending'
      WHERE id = ? AND tenant_id = ?
    `).run(now, tableId, TENANT_ID);
    
    // Enqueue sync
    for (const item of items) {
      enqueue(db, 'pos_table_consumptions', 'UPDATE', item.id, { id: item.id, status: 'PAGO' });
    }
    enqueue(db, 'pos_tables', 'UPDATE', tableId, { id: tableId, status: 'LIVRE' });
    
    // If client provided, record a POS visit for loyalty
    if (client) {
      const visitId = randomUUID();
      const pointsEarned = Math.floor(total / 100); // 1 point per 100 AOA
      db.prepare(`
        INSERT INTO client_visits (id, tenant_id, client_id, reservation_id, visit_type, check_in_date, room_number, room_type, amount_spent, loyalty_points_earned, notes, created_at, updated_at, sync_status)
        VALUES (?, ?, ?, ?, 'POS', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(visitId, TENANT_ID, client.id, reservation.id, today, room.room_number, room.room_type, total, pointsEarned, `Transferência da mesa para quarto ${room.room_number}`, now, now);
      enqueue(db, 'client_visits', 'INSERT', visitId, { id: visitId, client_id: client.id, amount_spent: total });
      
      // Update client stats
      db.prepare(`
        UPDATE clients
        SET total_visits = total_visits + 1, total_spent = total_spent + ?, total_pos_spent = total_pos_spent + ?, loyalty_points = loyalty_points + ?, last_visit_date = ?, updated_at = ?, sync_status = 'pending'
        WHERE id = ? AND tenant_id = ?
      `).run(total, total, pointsEarned, today, now, client.id, TENANT_ID);
      enqueue(db, 'clients', 'UPDATE', client.id, { id: client.id, total_spent: total, loyalty_points: pointsEarned });
    }
    
    return { data: { total, room_number: room.room_number, guest_name: reservation.guest_name } };
  },
  'pos.searchChargeTargets': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['query'], ['query']);
    const query = assertString(input.query, 'query', { min: 1, max: 200 });
    const like = `%${query}%`;

    const rooms = db.prepare(`
      SELECT r.id, r.room_number, hres.guest_name, r.status
      FROM hotel_rooms r
      INNER JOIN hotel_reservations hres ON hres.room_id = r.id AND hres.tenant_id = r.tenant_id AND hres.status IN ('CHECKED_IN','CONFIRMADA')
      WHERE r.tenant_id = ? AND (r.room_number LIKE ? OR hres.guest_name LIKE ?)
      ORDER BY r.room_number
      LIMIT 10
    `).all(TENANT_ID, like, like);

    const clients = db.prepare(`
      SELECT id, client_number, full_name, document_number
      FROM clients
      WHERE tenant_id = ? AND (client_number LIKE ? OR full_name LIKE ? OR document_number LIKE ?)
      ORDER BY full_name
      LIMIT 10
    `).all(TENANT_ID, like, like, like);

    return { data: { rooms, clients } };
  },
  // === CRM/KYC Operations ===
  'clients.list': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['limit', 'offset', 'tier', 'kyc_completed', 'search'], ['limit', 'offset']);
    const limit = input.limit === undefined ? 50 : assertNumber(input.limit, 'limit', { min: 1, max: 200 });
    const offset = input.offset === undefined ? 0 : assertNumber(input.offset, 'offset', { min: 0 });
    const tier = input.tier ? assertString(input.tier, 'tier', { min: 1, max: 32 }) : undefined;
    const kycCompleted = input.kyc_completed !== undefined ? (input.kyc_completed === 'true' || input.kyc_completed === true ? 1 : 0) : undefined;
    const search = input.search ? assertString(input.search, 'search', { min: 1, max: 128 }) : undefined;

    const params = [TENANT_ID];
    const where = ['tenant_id = ?'];

    if (tier) {
      where.push('loyalty_tier = ?');
      params.push(tier);
    }
    if (kycCompleted !== undefined) {
      where.push('kyc_completed = ?');
      params.push(kycCompleted);
    }
    if (search) {
      // Pesquisa por nome, documento, nº cliente, e-mail OU telefone (balcao/telefone).
      where.push('(full_name LIKE ? OR document_number LIKE ? OR client_number LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const rows = db.prepare(
      `SELECT id, client_number, full_name, document_type, document_number, email, phone, 
              kyc_completed, loyalty_tier, loyalty_points, total_visits, total_spent, 
              total_stays, first_visit_date, last_visit_date, created_at
       FROM clients 
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM clients WHERE ${where.join(' AND ')}`
    ).get(...params);

    return { data: rows, total: total?.count || 0 };
  },
  'clients.search': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['query', 'limit'], ['query']);
    const query = assertString(input.query, 'query', { min: 1, max: 128 });
    const limit = input.limit === undefined ? 20 : assertNumber(input.limit, 'limit', { min: 1, max: 100 });
    const like = `%${query}%`;

    // Use inline subquery to avoid parameter binding issues with CASE statement
    const rows = db.prepare(
      `SELECT id, client_number, full_name, document_type, document_number, email, phone, 
              kyc_completed, loyalty_tier, loyalty_points,
              total_visits, total_spent, total_stays, total_pos_spent,
              first_visit_date, last_visit_date
       FROM (
         SELECT id, client_number, full_name, document_type, document_number, email, phone, 
                kyc_completed, loyalty_tier, loyalty_points,
                total_visits, total_spent, total_stays, total_pos_spent,
                first_visit_date, last_visit_date,
                CASE 
                  WHEN client_number LIKE ? THEN 1
                  WHEN full_name LIKE ? THEN 2
                  ELSE 3
                END as sort_priority
         FROM clients
         WHERE tenant_id = ? AND (full_name LIKE ? OR document_number LIKE ? OR client_number LIKE ? OR email LIKE ?)
       )
       ORDER BY sort_priority, full_name
       LIMIT ?`
    ).all(like, like, TENANT_ID, like, like, like, like, limit);

    return { data: rows };
  },
  'clients.get': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND tenant_id = ?').get(id, TENANT_ID);
    if (!client) fail('NOT_FOUND', 'Client not found.', 404);
    return { data: client };
  },
  'clients.create': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['full_name', 'document_type', 'document_number', 'address', 'email', 'phone', 'whatsapp', 'date_of_birth', 'nationality'], ['full_name', 'document_type', 'document_number']);
    const fullName = assertString(input.full_name, 'full_name', { min: 2, max: 255 });
    const documentType = assertString(input.document_type, 'document_type', { min: 1, max: 32 });
    if (!['BI', 'PASSAPORTE', 'NIF', 'CARTAO_CIDADAO'].includes(documentType)) {
      fail('VALIDATION_ERROR', 'Invalid document type.');
    }
    const documentNumber = assertString(input.document_number, 'document_number', { min: 1, max: 64 });
    const address = input.address ? assertString(input.address, 'address', { max: 500 }) : null;
    const email = input.email ? assertString(input.email, 'email', { max: 255 }) : null;
    const phone = input.phone ? assertString(input.phone, 'phone', { max: 32 }) : null;
    const whatsapp = input.whatsapp ? assertString(input.whatsapp, 'whatsapp', { max: 32 }) : null;
    const dateOfBirth = input.date_of_birth ? assertString(input.date_of_birth, 'date_of_birth', { max: 32 }) : null;
    const nationality = input.nationality ? assertString(input.nationality, 'nationality', { max: 64 }) : null;

    const existing = db.prepare('SELECT id FROM clients WHERE tenant_id = ? AND document_number = ?').get(TENANT_ID, documentNumber);
    if (existing) fail('VALIDATION_ERROR', 'Client with this document already exists.');

    const id = randomUUID();
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const count = db.prepare('SELECT COUNT(*) as count FROM clients WHERE tenant_id = ?').get(TENANT_ID)?.count || 0;
    const clientNumber = `HR-${year}-${String(count + 1).padStart(5, '0')}`;

    db.prepare(`
      INSERT INTO clients (id, tenant_id, client_number, full_name, document_type, document_number, address, email, phone, whatsapp, date_of_birth, nationality, kyc_completed, loyalty_tier, loyalty_points, total_visits, total_spent, total_stays, total_pos_spent, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'REGISTADO', 0, 0, 0, 0, 0, ?, ?, 'pending')
    `).run(id, TENANT_ID, clientNumber, fullName, documentType, documentNumber, address, email, phone, whatsapp, input.date_of_birth || null, nationality, now, now);

    const stored = getOwnedRow(db, 'clients', id);
    enqueue(db, 'clients', 'INSERT', id, stored);
    return { data: stored };
  },
  'clients.update': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id', 'full_name', 'document_type', 'document_number', 'address', 'email', 'phone', 'whatsapp', 'date_of_birth', 'nationality', 'face_embedding', 'face_image_path', 'kyc_completed', 'kyc_completed_at', 'loyalty_tier', 'loyalty_points', 'total_visits', 'total_spent', 'total_stays', 'total_pos_spent', 'first_visit_date', 'last_visit_date', 'preferred_room_type', 'notes'], ['id']);
    const id = assertBusinessId(input.id);
    const patch = {};
    if (input.full_name !== undefined) patch.full_name = assertString(input.full_name, 'full_name', { min: 2, max: 255 });
    if (input.document_type !== undefined) {
      const dt = assertString(input.document_type, 'document_type', { min: 1, max: 32 });
      if (!['BI', 'PASSAPORTE', 'NIF', 'CARTAO_CIDADAO'].includes(dt)) fail('VALIDATION_ERROR', 'Invalid document type.');
      patch.document_type = dt;
    }
    if (input.document_number !== undefined) patch.document_number = assertString(input.document_number, 'document_number', { min: 1, max: 64 });
    if (input.address !== undefined) patch.address = input.address ? assertString(input.address, 'address', { max: 500 }) : null;
    if (input.email !== undefined) patch.email = input.email ? assertString(input.email, 'email', { max: 255 }) : null;
    if (input.phone !== undefined) patch.phone = input.phone ? assertString(input.phone, 'phone', { max: 32 }) : null;
    if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp ? assertString(input.whatsapp, 'whatsapp', { max: 32 }) : null;
    if (input.date_of_birth !== undefined) patch.date_of_birth = input.date_of_birth ? assertString(input.date_of_birth, 'date_of_birth', { max: 32 }) : null;
    if (input.nationality !== undefined) patch.nationality = input.nationality ? assertString(input.nationality, 'nationality', { max: 64 }) : null;
    if (input.face_embedding !== undefined) patch.face_embedding = input.face_embedding ? assertString(input.face_embedding, 'face_embedding', { max: 1000000 }) : null;
    if (input.face_image_path !== undefined) patch.face_image_path = input.face_image_path ? assertString(input.face_image_path, 'face_image_path', { max: 512 }) : null;
    if (input.kyc_completed !== undefined) patch.kyc_completed = input.kyc_completed ? 1 : 0;
    if (input.kyc_completed_at !== undefined) patch.kyc_completed_at = input.kyc_completed_at ? assertString(input.kyc_completed_at, 'kyc_completed_at', { max: 32 }) : null;
    if (input.loyalty_tier !== undefined) patch.loyalty_tier = assertString(input.loyalty_tier, 'loyalty_tier', { min: 1, max: 32 });
    if (input.loyalty_points !== undefined) patch.loyalty_points = assertNumber(input.loyalty_points, 'loyalty_points', { min: 0 });
    if (input.total_visits !== undefined) patch.total_visits = assertNumber(input.total_visits, 'total_visits', { min: 0 });
    if (input.total_spent !== undefined) patch.total_spent = assertNumber(input.total_spent, 'total_spent', { min: 0 });
    if (input.total_stays !== undefined) patch.total_stays = assertNumber(input.total_stays, 'total_stays', { min: 0 });
    if (input.total_pos_spent !== undefined) patch.total_pos_spent = assertNumber(input.total_pos_spent, 'total_pos_spent', { min: 0 });
    if (input.first_visit_date !== undefined) patch.first_visit_date = input.first_visit_date ? assertString(input.first_visit_date, 'first_visit_date', { max: 32 }) : null;
    if (input.last_visit_date !== undefined) patch.last_visit_date = input.last_visit_date ? assertString(input.last_visit_date, 'last_visit_date', { max: 32 }) : null;
    if (input.preferred_room_type !== undefined) patch.preferred_room_type = input.preferred_room_type ? assertString(input.preferred_room_type, 'preferred_room_type', { max: 64 }) : null;
    if (input.notes !== undefined) patch.notes = input.notes ? assertString(input.notes, 'notes', { max: 2000 }) : null;

    if (Object.keys(patch).length === 0) fail('VALIDATION_ERROR', 'No fields to update.');

    const now = new Date().toISOString();
    patch.sync_status = 'pending';
    patch.updated_at = now;

    const keys = Object.keys(patch);
    const result = db.prepare(`
      UPDATE clients
      SET ${keys.map(key => `${key} = ?`).join(', ')}
      WHERE id = ? AND tenant_id = ?
    `).run(...keys.map(key => patch[key]), id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Client changed concurrently.', 409);
    const stored = getOwnedRow(db, 'clients', id);
    enqueue(db, 'clients', 'UPDATE', id, stored);
    return { data: stored };
  },
  'clients.delete': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    const existing = getOwnedRow(db, 'clients', id);
    const result = db.prepare(`DELETE FROM clients WHERE id = ? AND tenant_id = ?`).run(id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Client changed concurrently.', 409);
    enqueue(db, 'clients', 'DELETE', id, null);
    return { data: existing };
  },
  'clients.completeKyc': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id', 'face_embedding', 'face_image_path'], ['id', 'face_embedding']);
    const id = assertBusinessId(input.id);
    const faceEmbedding = assertString(input.face_embedding, 'face_embedding', { min: 10, max: 1000000 });
    const faceImagePath = input.face_image_path ? assertString(input.face_image_path, 'face_image_path', { max: 512 }) : null;
    const now = new Date().toISOString();

    const patch = {
      kyc_completed: 1,
      kyc_completed_at: now,
      face_embedding: faceEmbedding,
      face_image_path: faceImagePath,
      loyalty_tier: 'OCASIONAL',
      loyalty_points: 100,
      first_visit_date: now.split('T')[0],
      last_visit_date: now.split('T')[0],
      sync_status: 'pending',
      updated_at: now
    };

    const keys = Object.keys(patch);
    const result = db.prepare(`
      UPDATE clients
      SET ${keys.map(key => `${key} = ?`).join(', ')}
      WHERE id = ? AND tenant_id = ?
    `).run(...keys.map(key => patch[key]), id, TENANT_ID);
    if (result.changes !== 1) fail('CONFLICT', 'Client changed concurrently.', 409);
    const stored = getOwnedRow(db, 'clients', id);
    enqueue(db, 'clients', 'UPDATE', id, stored);

    // Add initial biometric record
    const bioId = randomUUID();
    const bioNow = new Date().toISOString();
    db.prepare(`
      INSERT INTO client_biometrics (id, tenant_id, client_id, embedding, image_path, confidence, device_info, created_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(bioId, TENANT_ID, id, input.face_embedding, input.face_image_path || null, 1.0, 'mobile-app', bioNow);
    enqueue(db, 'client_biometrics', 'INSERT', bioId, { id: bioId, client_id: id, embedding: input.face_embedding });

    return { data: stored };
  },
  'biometrics.add': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['client_id', 'embedding', 'image_path', 'confidence', 'device_info'], ['client_id', 'embedding']);
    const clientId = assertBusinessId(input.client_id);
    getOwnedRow(db, 'clients', clientId); // verify client exists
    const embedding = assertString(input.embedding, 'embedding', { min: 10, max: 1000000 });
    const imagePath = input.image_path ? assertString(input.image_path, 'image_path', { max: 512 }) : null;
    const confidence = input.confidence !== undefined ? assertNumber(input.confidence, 'confidence', { min: 0, max: 1 }) : 1.0;
    const deviceInfo = input.device_info ? assertString(input.device_info, 'device_info', { max: 255 }) : null;

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO client_biometrics (id, tenant_id, client_id, embedding, image_path, confidence, device_info, created_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, clientId, embedding, imagePath, confidence, deviceInfo, now);
    const stored = getOwnedRow(db, 'client_biometrics', id);
    enqueue(db, 'client_biometrics', 'INSERT', id, stored);
    return { data: stored };
  },
  'biometrics.list': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['client_id', 'limit'], ['client_id']);
    const clientId = assertBusinessId(input.client_id);
    const limit = input.limit === undefined ? 20 : assertNumber(input.limit, 'limit', { min: 1, max: 100 });
    const rows = db.prepare(`
      SELECT id, client_id, embedding, image_path, confidence, device_info, created_at
      FROM client_biometrics
      WHERE client_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(clientId, TENANT_ID, limit);
    return { data: rows };
  },
  'loyalty_tiers.list': (db) => {
    const rows = db.prepare(`
      SELECT id, name, min_visits, min_spent, discount_percent, bonus_points_multiplier, color, icon, benefits, is_active
      FROM loyalty_tiers
      WHERE tenant_id = ? AND is_active = 1
      ORDER BY min_visits ASC
    `).all(TENANT_ID);
    return { data: rows };
  },
  'loyalty_tiers.get': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['id'], ['id']);
    const id = assertBusinessId(input.id);
    const tier = db.prepare('SELECT * FROM loyalty_tiers WHERE id = ? AND tenant_id = ?').get(id, TENANT_ID);
    if (!tier) fail('NOT_FOUND', 'Loyalty tier not found.', 404);
    return { data: tier };
  },
  'client_visits.list': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['client_id', 'limit', 'offset', 'type'], ['client_id']);
    const clientId = assertBusinessId(input.client_id);
    const limit = input.limit === undefined ? 50 : assertNumber(input.limit, 'limit', { min: 1, max: 200 });
    const offset = input.offset === undefined ? 0 : assertNumber(input.offset, 'offset', { min: 0 });
    const type = input.type ? assertString(input.type, 'type', { min: 1, max: 32 }) : undefined;

    const params = [TENANT_ID, clientId];
    const where = ['tenant_id = ?', 'client_id = ?'];
    if (type) {
      where.push('visit_type = ?');
      params.push(type);
    }

    const rows = db.prepare(
      `SELECT id, client_id, reservation_id, visit_type, check_in_date, check_out_date, room_number, room_type, amount_spent, loyalty_points_earned, notes, created_at
       FROM client_visits
       WHERE ${where.join(' AND ')}
       ORDER BY check_in_date DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM client_visits WHERE ${where.join(' AND ')}`
    ).get(...params);

    return { data: rows, total: total?.count || 0 };
  },
  'client_visits.create': (db, input) => {
    assertObject(input, 'input');
    assertExactKeys(input, ['client_id', 'visit_type', 'check_in_date', 'check_out_date', 'room_number', 'room_type', 'amount_spent', 'loyalty_points_earned', 'notes', 'reservation_id'], ['client_id', 'visit_type', 'check_in_date']);
    const clientId = assertBusinessId(input.client_id);
    const visitType = assertString(input.visit_type, 'visit_type', { min: 1, max: 32 });
    if (!['HOSPEDAGEM', 'POS', 'EVENTO', 'SPA', 'OUTRO'].includes(visitType)) fail('VALIDATION_ERROR', 'Invalid visit type.');
    const checkInDate = assertString(input.check_in_date, 'check_in_date', { min: 1, max: 32 });
    const checkOutDate = input.check_out_date ? assertString(input.check_out_date, 'check_out_date', { max: 32 }) : null;
    const roomNumber = input.room_number ? assertString(input.room_number, 'room_number', { max: 32 }) : null;
    const roomType = input.room_type ? assertString(input.room_type, 'room_type', { max: 64 }) : null;
    const amountSpent = input.amount_spent !== undefined ? assertNumber(input.amount_spent, 'amount_spent', { min: 0 }) : 0;
    const loyaltyPointsEarned = input.loyalty_points_earned !== undefined ? assertNumber(input.loyalty_points_earned, 'loyalty_points_earned', { min: 0 }) : 0;
    const notes = input.notes ? assertString(input.notes, 'notes', { max: 2000 }) : null;
    const reservationId = input.reservation_id ? assertBusinessId(input.reservation_id) : null;

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO client_visits (id, tenant_id, client_id, reservation_id, visit_type, check_in_date, check_out_date, room_number, room_type, amount_spent, loyalty_points_earned, notes, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, clientId, reservationId, visitType, checkInDate, checkOutDate, roomNumber, roomType, amountSpent, loyaltyPointsEarned, notes, now, now);
    const stored = getOwnedRow(db, 'client_visits', id);
    enqueue(db, 'client_visits', 'INSERT', id, stored);

    // Update client stats
    const client = getOwnedRow(db, 'clients', clientId);
    const newTotalVisits = (client.total_visits || 0) + 1;
    const newTotalSpent = (client.total_spent || 0) + amountSpent;
    const newTotalStays = visitType === 'HOSPEDAGEM' ? (client.total_stays || 0) + 1 : client.total_stays;
    const newTotalPosSpent = visitType === 'POS' ? (client.total_pos_spent || 0) + amountSpent : client.total_pos_spent;
    const newLoyaltyPoints = (client.loyalty_points || 0) + loyaltyPointsEarned;
    const today = now.split('T')[0];

    // Check for tier upgrade
    const tiers = db.prepare('SELECT * FROM loyalty_tiers WHERE tenant_id = ? AND is_active = 1 ORDER BY min_visits DESC').all(TENANT_ID);
    let newTier = client.loyalty_tier;
    for (const tier of tiers) {
      if (newTotalVisits >= tier.min_visits && newTotalSpent >= tier.min_spent) {
        newTier = tier.name;
        break;
      }
    }

    db.prepare(`
      UPDATE clients
      SET total_visits = ?, total_spent = ?, total_stays = ?, total_pos_spent = ?, loyalty_points = ?, last_visit_date = ?, loyalty_tier = ?, updated_at = ?, sync_status = 'pending'
      WHERE id = ? AND tenant_id = ?
    `).run(newTotalVisits, newTotalSpent, newTotalStays, newTotalPosSpent, newLoyaltyPoints, today, newTier, now, clientId, TENANT_ID);
    enqueue(db, 'clients', 'UPDATE', clientId, { ...client, total_visits: newTotalVisits, total_spent: newTotalSpent, total_stays: newTotalStays, total_pos_spent: newTotalPosSpent, loyalty_points: newLoyaltyPoints, last_visit_date: today, loyalty_tier: newTier });

    return { data: stored };
  }
});

function executeOperation(db, operation, input = {}) {
  if (typeof operation !== 'string' || !Object.prototype.hasOwnProperty.call(OPERATIONS, operation)) {
    throw new OperationError('UNKNOWN_OPERATION', 'Unknown local operation.', 404);
  }
  const handler = OPERATIONS[operation];
  return handler(db, input);
}

module.exports = {
  TENANT_ID,
  RESOURCE_SPECS,
  OperationError,
  executeOperation,
  ensureSyncQueue
};
