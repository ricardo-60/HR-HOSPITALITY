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
const SYNC_TABLES = new Set(['hotel_rooms', 'hotel_reservations', 'hotel_consumptions']);
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
  hotel_reservations: Object.freeze({
    columns: Object.freeze([
      'id', 'guest_name', 'email', 'service_type', 'room_number', 'room_id',
      'check_in_date', 'check_out_date', 'status', 'reservation_date', 'notes',
      'total_amount', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'guest_name', 'email', 'service_type', 'room_number', 'room_id',
      'check_in_date', 'check_out_date', 'status', 'reservation_date', 'notes',
      'total_amount', 'created_at'
    ])
  }),
  hotel_consumptions: Object.freeze({
    columns: Object.freeze([
      'id', 'reservation_id', 'description', 'quantity', 'unit_price',
      'total_price', 'category', 'registered_at', 'created_at', 'updated_at'
    ]),
    writable: Object.freeze([
      'id', 'reservation_id', 'description', 'quantity', 'unit_price',
      'total_price', 'category', 'registered_at', 'created_at'
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

function postConsumption(db, input) {
  assertObject(input, 'input');
  assertExactKeys(input, ['reservationId', 'description', 'unitPrice', 'totalPrice', 'category'], [
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
        total_price, category, registered_at, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, TENANT_ID, reservationId, description, unitPrice, totalPrice, category, now, now, now);
    const stored = getOwnedRow(db, 'hotel_consumptions', id);
    enqueue(db, 'hotel_consumptions', 'INSERT', id, stored);
    return stored;
  });
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
  'pos.postConsumption': (db, input) => ({ data: postConsumption(db, input) })
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
