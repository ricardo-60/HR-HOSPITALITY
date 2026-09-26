/**
 * HR-HOSPITALITY — Gestor de Migrações e Snapshots (SQLite ↔ Supabase)
 *
 * Aplica migrações pendentes da pasta raiz `migrations/<target>/` e regista
 * cada versão na tabela `_schema_migrations` (criada automaticamente em
 * ambos os ambientes). Suporta snapshot/exportação do esquema antes de
 * aplicar alterações.
 *
 * USO (a partir de hr-hospitality-app/):
 *
 *   # Estado (versão aplicada e pendentes)
 *   node scripts/run_migrations.mjs --status --target=sqlite
 *   node scripts/run_migrations.mjs --status --target=supabase
 *
 *   # Aplicar migrações pendentes
 *   node scripts/run_migrations.mjs --target=sqlite [--url=http://localhost:3002]
 *   node scripts/run_migrations.mjs --target=supabase          (requer PGPASSWORD)
 *
 *   # Exportar snapshot do esquema ANTES de aplicar
 *   node scripts/run_migrations.mjs --target=sqlite --snapshot
 *   node scripts/run_migrations.mjs --target=supabase --snapshot
 *
 * Snapshots gravados em hr-hospitality-app/backups/ (fora do git).
 *
 * RESTAURAR / RECUAR — ver migrations/README.md.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BACKUPS_DIR = join(__dirname, '..', 'backups');

// ── Argumentos ──────────────────────────────────────────────
const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
        return m ? [m[1], m[2] ?? true] : [a, true];
    })
);

const target = args.target || 'sqlite';
const doSnapshot = Boolean(args.snapshot);
const onlyStatus = Boolean(args.status);
const sqlitePath = resolve(args.db || join(ROOT, 'hr-hospitality-app', 'hospitality_local.db'));

if (!['sqlite', 'supabase'].includes(target)) {
    console.error(`Alvo inválido: "${target}". Use --target=sqlite ou --target=supabase.`);
    process.exit(1);
}

const MIGRATIONS_DIR = join(ROOT, 'migrations', target);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Executor SQLite (directo, local e fora da API HTTP) ────────────────────
let sqliteDb = null;
function openSqlite(readOnly = false) {
    if (sqliteDb) return;
    sqliteDb = new DatabaseSync(sqlitePath, { readOnly });
    if (!readOnly) {
        sqliteDb.exec('PRAGMA journal_mode = WAL');
        sqliteDb.exec('PRAGMA foreign_keys = ON');
        sqliteDb.exec('PRAGMA busy_timeout = 5000');
    }
    console.log(`SQLite local${readOnly ? ' (read-only)' : ''}: ${sqlitePath}`);
}

async function sqliteExecute(sql, params = []) {
    if (!sqliteDb) openSqlite();
    if (params.length > 0) {
        const result = sqliteDb.prepare(sql).run(...params);
        return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
    }
    sqliteDb.exec(sql);
    return { changes: 0 };
}

function closeSqlite() {
    if (sqliteDb) {
        try { sqliteDb.close(); } catch { /* ignore */ }
        sqliteDb = null;
    }
}

async function sqliteQuery(sql, params = []) {
    if (!sqliteDb) openSqlite();
    return sqliteDb.prepare(sql).all(...params);
}

// ── Executor Supabase (pg via pooler, secrets apenas em env) ─────────────
let pgClient = null;
async function supabaseConnect() {
    const required = ['PGPASSWORD', 'SUPABASE_DB_HOST', 'SUPABASE_DB_USER', 'SUPABASE_DB_NAME'];
    const missing = required.filter(name => !process.env[name]);
    if (missing.length) {
        console.error(`ERRO: variáveis Supabase em falta: ${missing.join(', ')}.`);
        console.error('Configure-as no secret manager; não as coloque em scripts ou comandos versionados.');
        process.exit(1);
    }
    const pg = (await import('pg')).default;
    pgClient = new pg.Client({
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT || 6543),
        database: process.env.SUPABASE_DB_NAME,
        user: process.env.SUPABASE_DB_USER,
        password: process.env.PGPASSWORD,
        ssl: {
            rejectUnauthorized: process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== 'false'
        }
    });
    await pgClient.connect();
}

async function pgExec(sql) {
    await pgClient.query(sql);
}
async function pgQuery(sql) {
    const res = await pgClient.query(sql);
    return res.rows;
}

// ── Fila de execução ────────────────────────────────────────
function listMigrations() {
    if (!existsSync(MIGRATIONS_DIR)) return [];
    return readdirSync(MIGRATIONS_DIR)
        .filter(f => /^\d{3}_.+\.sql$/.test(f))
        .sort()
        .map(f => ({ version: f.slice(0, 3), name: f, path: join(MIGRATIONS_DIR, f) }));
}

// Divide um script SQL em statements (respeita blocos $$ ... $$)
function splitStatements(raw) {
    const out = [];
    let cur = '';
    let inDollar = false;
    let dollarTag = '';
    for (const line of raw.split('\n')) {
        if (!inDollar && /^\s*--/.test(line)) continue;
        cur += line + '\n';
        const matches = line.match(/\$(\w*)\$/g) || [];
        for (const m of matches) {
            if (!inDollar) { inDollar = true; dollarTag = m; }
            else if (m === dollarTag) { inDollar = false; dollarTag = ''; }
        }
        if (!inDollar && line.trim().endsWith(';')) {
            const stmt = cur.trim();
            // Ignora statements "só comentário" (ex.: SELECT informativo vazio)
            if (stmt.replace(/;\s*$/, '').trim().length > 1) out.push(stmt);
            cur = '';
        }
    }
    if (cur.trim().length > 1) out.push(cur.trim());
    return out;
}

const TRACKING_SQL = {
    sqlite: `CREATE TABLE IF NOT EXISTS _schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
    )`,
    supabase: `CREATE TABLE IF NOT EXISTS public._schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT now()
    )`,
};

async function getApplied(execQuery) {
    try {
        return await execQuery('SELECT version, name, applied_at FROM _schema_migrations ORDER BY version');
    } catch (error) {
        if (/no such table|_schema_migrations.*doesn.t exist/i.test(String(error?.message || error))) return [];
        throw error;
    }
}

// ── Snapshot ────────────────────────────────────────────────
async function sqliteSnapshot() {
    const rows = await sqliteQuery(
        `SELECT type, name, sql FROM sqlite_master
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
         ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
    );
    const header = `-- HR-HOSPITALITY snapshot do esquema SQLite\n-- Gerado em: ${new Date().toISOString()}\n-- Restauração: parar a aplicação e executar este ficheiro com uma ferramenta SQLite privilegiada.\n\nPRAGMA foreign_keys = OFF;\nBEGIN;\n`;
    const body = rows.map(r => `-- ${r.type}: ${r.name}\n${r.sql};`).join('\n\n');
    const footer = `\nCOMMIT;\nPRAGMA foreign_keys = ON;\n`;
    const outDir = join(BACKUPS_DIR, 'sqlite');
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `snapshot-${stamp()}.sql`);
    writeFileSync(file, header + '\n' + body + '\n' + footer);
    return { file, objects: rows.length };
}

async function supabaseSnapshot() {
    const tables = await pgQuery(`
        SELECT c.relname AS table_name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`);
    const lines = [`-- HR-HOSPITALITY snapshot do esquema Supabase (inventário)`, `-- Gerado em: ${new Date().toISOString()}`, ``];
    for (const t of tables) {
        const cols = await pgQuery(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '${t.table_name}'
            ORDER BY ordinal_position`);
        lines.push(`-- Tabela: public.${t.table_name}`);
        for (const c of cols) {
            lines.push(`--   ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ` DEFAULT ${c.column_default}` : ''}`);
        }
        try {
            const count = await pgQuery(`SELECT COUNT(*)::int AS n FROM public."${t.table_name}"`);
            lines.push(`--   linhas: ${count[0].n}`);
        } catch { /* sem permissão */ }
        lines.push('');
    }
    const outDir = join(BACKUPS_DIR, 'supabase');
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `snapshot-${stamp()}.sql`);
    writeFileSync(file, lines.join('\n'));
    return { file, objects: tables.length };
}

// ── Main ────────────────────────────────────────────────────
const execStatement = target === 'sqlite' ? sqliteExecute : pgExec;
const execQuery = target === 'sqlite' ? sqliteQuery : pgQuery;
async function closeConnections() {
    closeSqlite();
    if (pgClient) {
        try { await pgClient.end(); } catch { /* ignore */ }
    }
}

try {
    if (target === 'supabase') await supabaseConnect();
    else openSqlite(onlyStatus);

    // --status remains read-only. The tracking table is created only when a
    // migration will actually be applied.
    if (!onlyStatus) await execStatement(TRACKING_SQL[target]);

    const applied = await getApplied(execQuery);
    const all = listMigrations();
    const appliedVersions = new Set(applied.map(a => a.version));
    const pending = all.filter(m => !appliedVersions.has(m.version));

    console.log(`\n=== HR-HOSPITALITY · Migrações (${target}) ===`);
    console.log(`Aplicadas: ${applied.length} · Pendentes: ${pending.length}`);
    for (const m of all) {
        const done = appliedVersions.has(m.version);
        console.log(`  [${done ? 'x' : ' '}] ${m.name}${done ? ' (aplicada)' : ''}`);
    }

    if (onlyStatus) {
        const current = applied.length ? applied[applied.length - 1] : null;
        console.log(`\nVersão atual do esquema: ${current ? `${current.version} (${current.name}, aplicada em ${current.applied_at})` : 'NENHUMA'}`);
        await closeConnections();
        // Saida natural: deixa os sockets keep-alive do fetch fecharem sem
        // provocar "Assertion failed: UV_HANDLE_CLOSING" (exit 0xC0000409) no Windows.
        process.exitCode = 0;
    } else if (pending.length === 0) {
        console.log('\n✔ Nenhuma migração pendente. Esquema atualizado.');
        await closeConnections();
        process.exitCode = 0;
    } else {

        // Snapshot antes de aplicar alterações
        if (doSnapshot) {
            console.log('\nA exportar snapshot do esquema...');
            const snap = target === 'sqlite' ? await sqliteSnapshot() : await supabaseSnapshot();
            console.log(`✔ Snapshot gravado: ${snap.file} (${snap.objects} objectos)`);
        }

        // Aplicar pendentes, em ordem, com transação (SQLite) e registo de versão
        for (const m of pending) {
            console.log(`\n→ A aplicar ${m.name} ...`);
            const statements = splitStatements(readFileSync(m.path, 'utf8'));
            try {
                if (target === 'sqlite') await sqliteExecute('BEGIN');
                for (const s of statements) {
                    try {
                        await execStatement(s);
                    } catch (stmtErr) {
                        // A única reconciliação tolerada é a coluna legada
                        // explícita de `tenants` na migração 001. Qualquer
                        // outro erro faz a migração falhar e ser revertida.
                        const msg = String(stmtErr?.message || stmtErr);
                        const isLegacyTenantColumn = /^\s*ALTER\s+TABLE\s+tenants\s+ADD\s+COLUMN\s+(name|slug|currency|company_name)/i.test(s);
                        if (isLegacyTenantColumn && /duplicate column name/i.test(msg)) {
                            console.log(`  · coluna legada já existe (ignorado): ${msg.split('\n')[0]}`);
                            continue;
                        }
                        throw stmtErr;
                    }
                }
                await execStatement(
                    target === 'sqlite'
                        ? `INSERT INTO _schema_migrations (version, name) VALUES (?, ?)`
                        : `INSERT INTO public._schema_migrations (version, name) VALUES ('${m.version}', '${m.name}')`,
                    target === 'sqlite' ? [m.version, m.name] : []
                );
                if (target === 'sqlite') await sqliteExecute('COMMIT');
                console.log(`  ✔ ${statements.length} statements aplicados — versão ${m.version} registada.`);
            } catch (err) {
                if (target === 'sqlite') {
                    try { await sqliteExecute('ROLLBACK'); } catch { /* pode já não haver transação */ }
                }
                console.error(`  ✖ FALHA em ${m.name}: ${err.message}`);
                console.error('  Execução interrompida — nenhuma migração posterior foi aplicada.');
                // Saida via throw (nao process.exit): evita a Assertion
                // UV_HANDLE_CLOSING no Windows com sockets keep-alive e
                // preserva o exit code 2 no fim do script.
                throw Object.assign(new Error(`migração ${m.name} falhou`), { migExit: 2 });
            }
        }

        const finalApplied = await getApplied(execQuery);
        const current = finalApplied[finalApplied.length - 1];
        console.log(`\n=== CONCLUÍDO · versão atual do esquema (${target}): ${current.version} — ${current.name} ===`);

        await closeConnections();
        // Saida natural (ver comentario acima): sem process.exit aqui.
        process.exitCode = 0;
    }
} catch (err) {
    if (err && typeof err.migExit === 'number') {
        // Mensagens de contexto já impressas pelo bloco que falhou.
        process.exitCode = err.migExit;
    } else {
        console.error('ERRO fatal:', err.message);
        process.exitCode = 1;
    }
    await closeConnections();
    // Saida natural (sem process.exit): os sockets keep-alive do fetch
    // fecham limposamente, sem "Assertion UV_HANDLE_CLOSING" (0xC0000409).
}
