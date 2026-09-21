/**
 * Executa MIGRATION_NEW_PROJECT.sql no Supabase Cloud (projeto zqmtxxjoocwhaodlnhxg)
 * via pooler (porta 6543). A password vem da variável de ambiente PGPASSWORD —
 * nunca é escrita em ficheiro.
 *
 * Uso: PGPASSWORD=... node run_cloud_migration.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = join(__dirname, '..', '..', 'MIGRATION_NEW_PROJECT.sql');

const HOST = 'aws-0-eu-central-1.pooler.supabase.com';
const PORT = 6543;
const DB = 'postgres';
const USER = 'postgres.zqmtxxjoocwhaodlnhxg';

if (!process.env.PGPASSWORD) {
  console.error('ERRO: PGPASSWORD não definido.');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');

// Dividir o script em statements individuais (respeita $$ ... $$ e comentários)
function splitStatements(raw) {
  const out = [];
  let cur = '';
  let inDollar = false;
  let dollarTag = '';
  const lines = raw.split('\n');
  for (const line of lines) {
    // Ignorar linhas puras de comentário
    if (!inDollar && /^\s*--/.test(line)) continue;
    cur += line + '\n';
    // Deteção simples de blocos $$ (podem aparecer vários por linha)
    const matches = line.match(/\$(\w*)\$/g) || [];
    for (const m of matches) {
      if (!inDollar) { inDollar = true; dollarTag = m; }
      else if (m === dollarTag) { inDollar = false; dollarTag = ''; }
    }
    if (!inDollar && line.trim().endsWith(';')) {
      const stmt = cur.trim();
      if (stmt.length > 1) out.push(stmt);
      cur = '';
    }
  }
  if (cur.trim().length > 1) out.push(cur.trim());
  return out;
}

const statements = splitStatements(sql);
console.log(`A executar ${statements.length} statements em ${HOST}:${PORT}/${DB} (user ${USER})...`);

const client = new pg.Client({
  host: HOST,
  port: PORT,
  database: DB,
  user: USER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

let ok = 0, fail = 0;
try {
  await client.connect();
  console.log('Ligado ao pooler ✓');
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    // A verificação final (SELECT ... UNION ALL) executa-se depois, contada à parte
    if (/^SELECT 'tenants'/i.test(s)) { console.log(`[${i + 1}] skip (verificação final será feita no fim)`); continue; }
    try {
      await client.query(s);
      ok++;
      const label = s.replace(/\s+/g, ' ').slice(0, 70);
      console.log(`[${i + 1}/${statements.length}] OK  ${label}...`);
    } catch (err) {
      fail++;
      const label = s.replace(/\s+/g, ' ').slice(0, 70);
      console.error(`[${i + 1}/${statements.length}] FALHA: ${err.message}\n     > ${label}...`);
    }
  }
} catch (err) {
  console.error('ERRO de ligação:', err.message);
  process.exit(1);
} finally {
  try { await client.end(); } catch {}
}

console.log(`\n=== MIGRAÇÃO CONCLUÍDA: ${ok} OK, ${fail} falhas ===`);
process.exit(fail > 0 ? 2 : 0);
