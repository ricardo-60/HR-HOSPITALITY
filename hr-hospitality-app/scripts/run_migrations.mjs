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
import { dirname, join } from 'node:path';

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
const serverUrl = args.url || 'http://localhost:3002';

if (!['sqlite', 'supabase'].includes(target)) {
    console.error(`Alvo inválido: "${target}". Use --target=sqlite ou --target=supabase.`);
    process.exit(1);
}

const MIGRATIONS_DIR = join(ROOT, 'migrations', target);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Executor SQLite (via API HTTP do servidor local :3002) ──
async function sqliteExecute(sql, params = []) {
    const res = await fetch(`${serverUrl}/api/db/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
}

async function sqliteQuery(sql, params = []) {
    const res = await fetch(`${serverUrl}/api/db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body.rows;
}

// ── Executor Supabase (pg via pooler, PGPASSWORD em env) ────
let pgClient = null;
async function supabaseConnect() {
    if (!process.env.PGPASSWORD) {
        console.error('ERRO: PGPASSWORD não definida (necessária para o alvo supabase).');
        console.error('Uso: PGPASSWORD=... node scripts/run_migrations.mjs --target=supabase');
        process.exit(1);
    }
    const pg = (await import('pg')).default;
    pgClient = new pg.Client({
        host: 'aws-0-eu-central-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: 'postgres.zqmtxxjoocwhaodlnhxg',
        password: process.env.PGPASSWORD,
        ssl: { rejectUnauthorized: false },
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
    } catch {
        return [];
    }
}

// ── Snapshot ────────────────────────────────────────────────
async function sqliteSnapshot() {
    const rows = await sqliteQuery(
        `SELECT type, name, sql FROM sqlite_master
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_schema_%'
         ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
    );
    const header = `-- HR-HOSPITALITY snapshot do esquema SQLite\n-- Gerado em: ${new Date().toISOString()}\n-- Restauração: servidor local parado, aplicar via /api/db/execute (ou substituir hospitality_local.db por backup ficheiro)\n\nPRAGMA foreign_keys = OFF;\nBEGIN;\n`;
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

try {
    if (target === 'supabase') await supabaseConnect();
    else {
        // Health check do servidor local
        const health = await fetch(`${serverUrl}/api/health`).then(r => r.json()).catch(() => null);
        if (!health?.status) {
            console.error(`ERRO: servidor SQLite local não responde em ${serverUrl}.`);
            console.error('Inicie a app (npm run electron:dev) ou o servidor local (node electron/server.js).');
            process.exit(1);
        }
        console.log(`Servidor local ativo em ${serverUrl} ✓`);
    }

    // Garantir tabela de controlo
    await execStatement(TRACKING_SQL[target]);

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
        process.exit(0);
    }

    if (pending.length === 0) {
        console.log('\n✔ Nenhuma migração pendente. Esquema atualizado.');
        process.exit(0);
    }

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
                await execStatement(s);
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
            process.exit(2);
        }
    }

    const finalApplied = await getApplied(execQuery);
    const current = finalApplied[finalApplied.length - 1];
    console.log(`\n=== CONCLUÍDO · versão atual do esquema (${target}): ${current.version} — ${current.name} ===`);

    if (pgClient) { try { await pgClient.end(); } catch { /* ignore */ } }
    process.exit(0);
} catch (err) {
    console.error('ERRO fatal:', err.message);
    if (pgClient) { try { await pgClient.end(); } catch { /* ignore */ } }
    process.exit(1);
}
