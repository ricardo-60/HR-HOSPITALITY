/**
 * HR-HOSPITALITY — Runner de seeders de demonstração
 * ==================================================
 * Aplica `migrations/seeders/<target>_demo.sql` de forma idempotente.
 *
 * USO (a partir de qualquer pasta do repositório):
 *
 *   node hr-hospitality-app/scripts/seed.mjs --target=sqlite
 *   node hr-hospitality-app/scripts/seed.mjs --target=supabase   (requer PGPASSWORD)
 *   node hr-hospitality-app/scripts/seed.mjs --target=sqlite --status
 *
 * Os secrets (PGPASSWORD, SUPABASE_DB_*) vêm SEMPRE do ambiente / secret
 * manager — nunca de ficheiros versionados.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
        return m ? [m[1], m[2] ?? true] : [a, true];
    })
);

const target = args.target || 'sqlite';
const statusOnly = Boolean(args.status);
const sqlitePath = resolve(args.db || join(ROOT, 'hr-hospitality-app', 'hospitality_local.db'));

if (!['sqlite', 'supabase'].includes(target)) {
    console.error(`Alvo inválido: "${target}". Use --target=sqlite ou --target=supabase.`);
    process.exit(1);
}

const seedFile = join(ROOT, 'migrations', 'seeders', `${target}_demo.sql`);
if (!existsSync(seedFile)) {
    console.error(`Seeder em falta: ${seedFile}`);
    process.exit(1);
}

/** Divide um script SQL em statements (respeita blocos $$ ... $$ e comentários). */
function splitStatements(raw) {
    const out = [];
    let cur = '';
    let inDollar = false;
    let dollarTag = '';
    for (const line of raw.split('\n')) {
        if (!inDollar && /^\s*--/.test(line)) continue;
        cur += `${line}\n`;
        const matches = line.match(/\$(\w*)\$/g) || [];
        for (const m of matches) {
            if (!inDollar) { inDollar = true; dollarTag = m; } else if (m === dollarTag) { inDollar = false; dollarTag = ''; }
        }
        if (!inDollar && line.trim().endsWith(';')) {
            const stmt = cur.trim();
            if (stmt.replace(/;\s*$/, '').trim().length > 1) out.push(stmt);
            cur = '';
        }
    }
    if (cur.trim().length > 1) out.push(cur.trim());
    return out;
}

function report(lines) {
    console.log('\n=== HR-HOSPITALITY · Seeders ===');
    for (const l of lines) console.log(`  ${l}`);
}

async function seedSqlite() {
    const statements = splitStatements(readFileSync(seedFile, 'utf8'));
    if (statusOnly) {
        const db = new DatabaseSync(sqlitePath, { readOnly: true });
        const counts = {
            reservas: db.prepare('SELECT COUNT(*) AS c FROM hotel_reservations').get().c,
            consumos: db.prepare('SELECT COUNT(*) AS c FROM hotel_consumptions').get().c,
            quartos: db.prepare('SELECT COUNT(*) AS c FROM hotel_rooms').get().c,
            colaboradores: db.prepare('SELECT COUNT(*) AS c FROM hr_employees').get().c,
            tenants: db.prepare('SELECT COUNT(*) AS c FROM tenants').get().c,
        };
        db.close();
        report([
            `Alvo: sqlite (${sqlitePath})`,
            `Statements no seeder: ${statements.length}`,
            `tenants=${counts.tenants} quartos=${counts.quartos} reservas=${counts.reservas} consumos=${counts.consumos} colaboradores=${counts.colaboradores}`,
        ]);
        return;
    }

    if (!existsSync(sqlitePath)) {
        console.error(`Base local em falta: ${sqlitePath}. Corra primeiro as migrações (run_migrations.mjs --target=sqlite).`);
        process.exit(1);
    }

    const db = new DatabaseSync(sqlitePath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');

    let applied = 0;
    let skipped = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
        for (const statement of statements) {
            try {
                db.exec(statement);
                applied += 1;
            } catch (error) {
                // Idempotência: linhas já existentes (UNIQUE / OR IGNORE) não
                // devem abortar a execução; qualquer outro erro é real.
                if (/UNIQUE constraint failed|constraint failed/i.test(String(error?.message || ''))) {
                    skipped += 1;
                } else {
                    throw error;
                }
            }
        }
        db.exec('COMMIT');
    } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        db.close();
        console.error(`\nERRO no seeder sqlite: ${error.message}`);
        process.exit(1);
    }

    const counts = {
        reservas: db.prepare('SELECT COUNT(*) AS c FROM hotel_reservations').get().c,
        consumos: db.prepare('SELECT COUNT(*) AS c FROM hotel_consumptions').get().c,
        colaboradores: db.prepare('SELECT COUNT(*) AS c FROM hr_employees').get().c,
    };
    db.close();

    report([
        `Ficheiro: migrations/seeders/sqlite_demo.sql`,
        `Statements executados: ${applied} · já existentes: ${skipped}`,
        `reservas=${counts.reservas} consumos=${counts.consumos} colaboradores=${counts.colaboradores}`,
        '✔ Seeder concluído.',
    ]);
}

async function seedSupabase() {
    const required = ['PGPASSWORD', 'SUPABASE_DB_HOST', 'SUPABASE_DB_USER', 'SUPABASE_DB_NAME'];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
        console.error(`ERRO: variáveis Supabase em falta: ${missing.join(', ')}.`);
        console.error('Configure-as no secret manager; não as coloque em scripts ou comandos versionados.');
        process.exit(1);
    }
    if (statusOnly) {
        report(['Alvo: supabase (remoto)', `Ficheiro: migrations/seeders/supabase_demo.sql`, 'Corra sem --status para aplicar.']);
        return;
    }

    const statements = splitStatements(readFileSync(seedFile, 'utf8'));
    const pg = (await import('pg')).default;
    const client = new pg.Client({
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT || 6543),
        database: process.env.SUPABASE_DB_NAME,
        user: process.env.SUPABASE_DB_USER,
        password: process.env.PGPASSWORD,
        ssl: { rejectUnauthorized: process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
    });

    try {
        await client.connect();
        let applied = 0;
        for (const statement of statements) {
            await client.query(statement);
            applied += 1;
        }
        const res = await client.query('SELECT COUNT(*)::int AS c FROM public.tenants');
        report([
            'Ficheiro: migrations/seeders/supabase_demo.sql',
            `Statements executados: ${applied}`,
            `tenants=${res.rows[0].c}`,
            '✔ Seeder concluído.',
        ]);
    } catch (error) {
        console.error(`\nERRO no seeder supabase: ${error.message}`);
        process.exit(1);
    } finally {
        await client.end().catch(() => {});
    }
}

if (target === 'sqlite') await seedSqlite();
else await seedSupabase();
