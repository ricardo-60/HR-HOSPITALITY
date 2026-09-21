const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Carregar o caminho de dados do utilizador definido pelo main process
const userDataPath = process.env.USER_DATA_PATH || process.cwd();
const dbPath = path.join(userDataPath, 'hospitality_local.db');

console.log(`[HospitalityServer] A iniciar base de dados SQLite (node:sqlite) em: ${dbPath}`);

let db;
try {
  db = new DatabaseSync(dbPath);
  // Executar pragma
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
} catch (err) {
  console.error('[HospitalityServer] Falha ao abrir base de dados SQLite nativa:', err);
  process.exit(1);
}

// Inicializar as tabelas se a BD for nova
function initializeDatabase() {
  try {
    // Verificar se a tabela hotel_rooms já existe para evitar re-inicializar
    let tableExists = false;
    try {
      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_rooms'");
      const res = stmt.all();
      if (res && res.length > 0) {
        tableExists = true;
      }
    } catch (e) {
      // Tabela não existe ou outro erro
    }

    if (!tableExists) {
      console.log('[HospitalityServer] Nova base de dados detetada. A carregar schema...');
      
      // Tentar localizar o ficheiro de schema SQL
      let schemaPath = path.join(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(__dirname, '../electron/schema.sql');
      }
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(process.cwd(), 'electron/schema.sql');
      }

      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql);
        console.log('[HospitalityServer] Schema SQL carregado com sucesso.');
      } else {
        console.warn('[HospitalityServer] Ficheiro schema.sql não localizado! Tabelas não inicializadas.');
      }
    }
  } catch (err) {
    console.error('[HospitalityServer] Erro na inicialização do schema local:', err);
  }
}

initializeDatabase();

const app = express();
app.use(cors());
app.use(express.json());

// Rota de Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', online: true, timestamp: Date.now() });
});

// Rota de Consulta (SELECT)
app.post('/api/db/query', (req, res) => {
  const { sql, params = [] } = req.body;
  if (!sql) {
    return res.status(400).json({ error: 'SQL query em falta' });
  }

  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    res.json({ rows });
  } catch (err) {
    console.error(`[HospitalityServer] Erro em Query: ${sql}`, err);
    res.status(500).json({ error: err.message });
  }
});

// Rota de Execução (INSERT, UPDATE, DELETE)
app.post('/api/db/execute', (req, res) => {
  const { sql, params = [] } = req.body;
  if (!sql) {
    return res.status(400).json({ error: 'SQL statement em falta' });
  }

  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    res.json({
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    });
  } catch (err) {
    console.error(`[HospitalityServer] Erro em Execute: ${sql}`, err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3002;

// SEGURANÇA: por defeito, escuta APENAS em 127.0.0.1 (localhost) — os endpoints
// /api/db/* aceitam SQL arbitrário e não devem ficar expostos à rede.
// Para o modo "Servidor" LAN (terminais secundários), opt-in explícito via
// variável de ambiente: HOSPITALITY_HOST=0.0.0.0 (usar apenas em rede confinada/VPN).
const HOST = process.env.HOSPITALITY_HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`[HospitalityServer] Servidor Express local escutando na porta ${PORT} em ${HOST}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn(`[HospitalityServer] ATENÇÃO: exposição à rede ativa (${HOST}). Os endpoints /api/db/* aceitam SQL arbitrário — use apenas em rede confinada/VPN.`);
  }
});

// Graciously handle shutdown
process.on('SIGTERM', () => {
  console.log('[HospitalityServer] Fechando servidor local...');
  server.close(() => {
    if (db && typeof db.close === 'function') {
      try { db.close(); } catch(e) {}
    }
    process.exit(0);
  });
});
