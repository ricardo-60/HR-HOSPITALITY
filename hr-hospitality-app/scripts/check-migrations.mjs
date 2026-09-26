/**
 * HR-HOSPITALITY — Verificador estrutural das migrações
 * =====================================================
 * Não executa SQL: valida apenas a forma dos ficheiros em
 * `migrations/sqlite/` e `migrations/supabase/` para apanhar erros de
 * enumeração, ficheiros faltosos, caracteres corrompidos ou sequências
 * fora de ordem ANTES de os aplicar a qualquer base de dados.
 *
 * USO:
 *     node hr-hospitality-app/scripts/check-migrations.mjs
 *     node hr-hospitality-app/scripts/check-migrations.mjs --json
 *
 * Sai com código != 0 se algum teste falhar.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const EXPECTED = {
    sqlite: ['001_initial_schema.sql', '002_auth_pbkdf2_security.sql', '003_sync_queue_setup.sql', '004_hr_employees.sql', '005_secure_local_identity.sql', '006_canonical_legacy_ids.sql', '007_profile_roles.sql'],
    supabase: ['001_initial_schema.sql', '002_auth_pbkdf2_security.sql', '003_sync_queue_setup.sql', '004_hr_employees.sql', '005_secure_auth_and_rls.sql', '006_mobile_public_catalog.sql', '007_commercial_core.sql', '008_pos_inventory_cash.sql'],
};

const SEEDERS = ['sqlite_demo.sql', 'supabase_demo.sql'];

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
}

function listSql(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .filter((f) => statSync(join(dir, f)).isFile())
        .sort();
}

// ─── 1. Conjuntos esperados ──────────────────────────────────────────────────
for (const [target, expected] of Object.entries(EXPECTED)) {
    const dir = join(ROOT, 'migrations', target);
    const found = listSql(dir);

    check(`${target}: pasta migrations/${target} existe`, existsSync(dir), dir);
    check(`${target}: contagem de ficheiros`, found.length === expected.length, `esperado ${expected.length}, encontrado ${found.length} (${found.join(', ') || 'vazio'})`);
    check(`${target}: nomes e ordem exatos`, JSON.stringify(found) === JSON.stringify(expected), `esperado [${expected.join(', ')}] · encontrado [${found.join(', ')}]`);

    const versions = found.map((f) => f.slice(0, 3));
    const sorted = [...versions].sort();
    check(`${target}: versões sem repetições`, new Set(versions).size === versions.length, versions.join(', '));
    check(`${target}: versões em ordem crescente`, JSON.stringify(versions) === JSON.stringify(sorted), versions.join(', '));

    for (const file of found) {
        const full = join(dir, file);
        const text = readFileSync(full, 'utf8');
        const label = `${target}/${file}`;

        check(`${label}: não vazio`, text.trim().length > 0, `${text.length} bytes`);
        check(`${label}: sem carateres de substituição (U+FFFD)`, !text.includes('\uFFFD'));
        // CJK / Hangul / Kana / símbolos de largura completa — nunca devem
        // aparecer: indicam cópia a partir de fonte corrompida.
        check(`${label}: sem carateres CJK`, !/[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(text));
        check(`${label}: termina em quebra de linha`, /\n\s*$/.test(text));
        check(`${label}: parênteses equilibrados`, countChar(text, '(') === countChar(text, ')'), `(${countChar(text, '(')} vs ${countChar(text, ')')})`);

        if (target === 'supabase') {
            // Sintaxe exclusiva do SQLite não pode aparecer nas migrações Postgres.
            check(`${label}: sem sintaxe SQLite`, !/\bPRAGMA\b|\bdatetime\('now'\)|\bINSERT OR IGNORE\b|randomblob\(/i.test(text));
            check(`${label}: sem caminhos absolutos de máquina`, !/[A-Za-z]:\\|\/home\/[a-z]+\//.test(text));
        }
    }
}

function countChar(text, ch) {
    let n = 0;
    for (const c of text) if (c === ch) n += 1;
    return n;
}

// ─── 2. Seeders ─────────────────────────────────────────────────────────────
const seedDir = join(ROOT, 'migrations', 'seeders');
check('seeders: pasta migrations/seeders existe', existsSync(seedDir), seedDir);
if (existsSync(seedDir)) {
    const found = listSql(seedDir).sort();
    check('seeders: presentes sqlite_demo.sql e supabase_demo.sql', JSON.stringify(found) === JSON.stringify([...SEEDERS].sort()), found.join(', '));
    for (const file of found) {
        const text = readFileSync(join(seedDir, file), 'utf8');
        check(`seeders/${file}: não vazio`, text.trim().length > 0, `${text.length} bytes`);
        check(`seeders/${file}: sem U+FFFD`, !text.includes('\uFFFD'));
        check(`seeders/${file}: sem carateres CJK`, !/[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(text));
        check(`seeders/${file}: usa INSERT idempotente`, /INSERT\s+(OR\s+IGNORE|INTO)[\s\S]*?(ON CONFLICT|OR IGNORE)/i.test(text) || /WHERE NOT EXISTS/i.test(text), 'proteção contra re-execução');
        check(`seeders/${file}: não cria contas com palavra-passe em texto simples`, !/password\s*[:=]\s*['"][^'"]{4,}['"]/i.test(text));
    }
}

// ─── 3. Runner e scripts associados ─────────────────────────────────────────
for (const rel of [
    'hr-hospitality-app/scripts/run_migrations.mjs',
    'hr-hospitality-app/scripts/seed.mjs',
    'hr-hospitality-app/scripts/stage_downloads.mjs',
    'start-server.bat',
    'start-server.sh',
]) {
    check(`ficheiro presente: ${rel}`, existsSync(join(ROOT, rel)));
}

// ─── Relatório ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);

if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
} else {
    console.log('\n=== HR-HOSPITALITY · Verificador estrutural de migrações ===\n');
    const groups = new Map();
    for (const r of results) {
        const group = r.name.startsWith('sqlite') ? 'sqlite'
            : r.name.startsWith('supabase') ? 'supabase'
            : r.name.startsWith('seeders') ? 'seeders'
            : 'outros';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(r);
    }
    for (const [group, items] of groups) {
        const bad = items.filter((i) => !i.ok).length;
        console.log(`  [${bad === 0 ? 'OK' : 'ERRO'}] ${group}: ${items.length - bad}/${items.length}`);
        for (const item of items.filter((i) => !i.ok)) {
            console.log(`         - ${item.name}${item.detail ? ` :: ${item.detail}` : ''}`);
        }
    }
    console.log(`\n  Total: ${results.length - failed.length}/${results.length} testes OK`);
    if (failed.length) console.log(`  ${failed.length} FALHA(S) — corrija antes de aplicar as migrações.\n`);
    else console.log('  Estrutura das migrações válida.\n');
}

process.exit(failed.length ? 1 : 0);
