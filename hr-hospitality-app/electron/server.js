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

function applyLocalSecurityCompatibility(db) {
  ensureColumn(db, 'app_users', 'auth_user_id', 'TEXT');
  ensureColumn(db, 'app_users', 'email', 'TEXT');
  ensureColumn(db, 'app_users', 'employee_code', 'TEXT');
  dropColumnIfPresent(db, 'app_users', 'password_hash');
  dropColumnIfPresent(db, 'app_users', 'password_salt');
  ensureColumn(db, 'hotel_consumptions', 'updated_at', "TEXT DEFAULT (datetime('now'))");
  ensureColumn(db, 'hotel_consumptions', 'sync_status', "TEXT DEFAULT 'synced'");
  ensureColumn(db, 'hotel_reservations', 'updated_at', "TEXT DEFAULT (datetime('now'))");
  ensureColumn(db, 'hotel_reservations', 'sync_status', "TEXT DEFAULT 'synced'");
  ensureColumn(db, 'hotel_rooms', 'updated_at', "TEXT DEFAULT (datetime('now'))");
  ensureColumn(db, 'hotel_rooms', 'sync_status', "TEXT DEFAULT 'synced'");
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
    normalizeLegacyIds(db);
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
    if (!allowedHosts.has(hostname)) {
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
  const app = createApp({ runtime, apiToken });
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

module.exports = { createRuntime, createApp, startServer, DEFAULT_HOST, DEFAULT_PORT };
