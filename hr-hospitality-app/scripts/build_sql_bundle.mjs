#!/usr/bin/env node
/**
 * HR-HOSPITALITY — Gera o bundle unico de SQL para o SQL Editor do Supabase.
 *
 * Concatena, por ordem de aplicacao:
 *   1. cabecalho transaccional + tabela _schema_migrations
 *   2. migrations/supabase/001..011  (+ INSERT da versao aplicada)
 *   3. migrations/seeders/supabase_demo.sql
 *   4. perfil do utilizador master (ADMINISTRATOR)
 *   5. verificacao final + COMMIT
 *
 * Uso:
 *   node scripts/build_sql_bundle.mjs [destino]
 *
 * Sem destino escreve em ~/Desktop/HR-SUPABASE_001-010_SEED_MASTER.sql.
 * O ficheiro nao contem credenciais: apenas objectos e dados de demonstracao.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const OUT =
  process.argv[2] ||
  join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'HR-SUPABASE_001-011_SEED_MASTER.sql');

const MIGRATIONS = [
  ['migrations/supabase/001_initial_schema.sql', '001'],
  ['migrations/supabase/002_auth_pbkdf2_security.sql', '002'],
  ['migrations/supabase/003_sync_queue_setup.sql', '003'],
  ['migrations/supabase/004_hr_employees.sql', '004'],
  ['migrations/supabase/005_secure_auth_and_rls.sql', '005'],
  ['migrations/supabase/006_mobile_public_catalog.sql', '006'],
  ['migrations/supabase/007_commercial_core.sql', '007'],
  ['migrations/supabase/008_pos_inventory_cash.sql', '008'],
  ['migrations/supabase/009_public_site_access.sql', '009'],
  ['migrations/supabase/010_master_global_licensing.sql', '010'],
  ['migrations/supabase/011_guest_ledger_rates_prebill.sql', '011'],
];

const SEEDER = 'migrations/seeders/supabase_demo.sql';

const MASTER = `
-- =====================================================================
-- PERFIL DO UTILIZADOR MASTER
-- =====================================================================
-- O perfil so pode apontar para uma conta Supabase Auth que exista: numa
-- instalacao nova ainda nao ha sessao nenhuma e a chave estrangeira
-- abortaria o bundle inteiro. Liga-se portanto ao uid existente - ou ao
-- que usar o mesmo email - e nunca se apaga uma ligacao ja feita.
INSERT INTO public.app_users (
    id, tenant_id, auth_user_id, email, employee_code, name, role,
    commission_rate, restrictions, allowed_modules, status,
    must_change_password, is_master_global, permissions, created_at, updated_at
)
SELECT
    '9e42e6aa-5155-4440-b368-5972fe391669',
    '11111111-1111-1111-1111-111111111111',
    (
        SELECT u.id
        FROM auth.users AS u
        WHERE u.id = '9e42e6aa-5155-4440-b368-5972fe391669'
           OR lower(u.email) = lower('hermenegildo.ricardo@gmail.com')
        ORDER BY (u.id = '9e42e6aa-5155-4440-b368-5972fe391669') DESC
        LIMIT 1
    ),
    'hermenegildo.ricardo@gmail.com',
    'MASTER',
    'Hermenegildo Ricardo',
    'ADMINISTRATOR',
    0.0200,
    '[]'::jsonb,
    '["*"]'::jsonb,
    'ATIVO',
    false,
    -- O Master Global tem de ser marcado AQUI: nas migracoes novas, o seed
    -- de is_master_global corre antes deste perfil existir.
    true,
    '[]'::jsonb,
    NOW(), NOW()
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    auth_user_id = COALESCE(EXCLUDED.auth_user_id, app_users.auth_user_id),
    email = EXCLUDED.email,
    employee_code = EXCLUDED.employee_code,
    name = EXCLUDED.name,
    role = 'ADMINISTRATOR',
    allowed_modules = '["*"]'::jsonb,
    status = 'ATIVO',
    is_master_global = TRUE,
    permissions = '[]'::jsonb,
    updated_at = NOW();

-- =====================================================================
-- VERIFICACAO FINAL (contagens esperadas depois do seed)
-- =====================================================================
SELECT 'migracoes aplicadas' AS item, COUNT(*)::text AS valor FROM public._schema_migrations
UNION ALL SELECT 'tenants', COUNT(*)::text FROM public.tenants
UNION ALL SELECT 'quartos', COUNT(*)::text FROM public.hotel_rooms
UNION ALL SELECT 'reservas', COUNT(*)::text FROM public.hotel_reservations
UNION ALL SELECT 'perfis (app_users)', COUNT(*)::text FROM public.app_users
UNION ALL SELECT 'master ADMINISTRATOR', COUNT(*)::text FROM public.app_users WHERE role = 'ADMINISTRATOR'
UNION ALL SELECT 'produtos POS', COUNT(*)::text FROM public.pos_products
UNION ALL SELECT 'precos piscinas', COUNT(*)::text FROM public.public_pool_prices
UNION ALL SELECT 'planos ginasio', COUNT(*)::text FROM public.gym_plans
ORDER BY 1;
`;

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8').replace(/\s*$/, '\n');
}

const banner = [
  '-- ============================================================',
  '--   HR-HOSPITALITY - BUNDLE UNICO (migracoes 001..011 + seed + master)',
  '--   Gerado por hr-hospitality-app/scripts/build_sql_bundle.mjs',
  '--   Idempotente: seguro para re-execucao sobre uma base vazia',
  '--   ou sobre um projecto legado (a migracao 001 tolera um tenants',
  '--   pre-existente com outro conjunto de colunas).',
  '-- ============================================================',
  '',
  'BEGIN;',
  '',
  'CREATE TABLE IF NOT EXISTS public._schema_migrations (',
  '    version TEXT PRIMARY KEY,',
  '    name TEXT NOT NULL,',
  '    applied_at TIMESTAMPTZ DEFAULT now()',
  ');',
  'SET search_path = public, extensions;',
  '',
].join('\n');

const chunks = [banner];

for (const [rel, version] of MIGRATIONS) {
  const file = rel.split('/').pop();
  chunks.push(
    [
      `-- ================ ${rel} ================`,
      read(rel),
      `INSERT INTO public._schema_migrations (version, name)`,
      `VALUES ('${version}', '${file}') ON CONFLICT (version) DO NOTHING;`,
      '',
    ].join('\n'),
  );
}

chunks.push(
  [
    `-- ================ ${SEEDER} ================`,
    read(SEEDER),
    MASTER,
    'COMMIT;',
    '',
  ].join('\n'),
);

const sql = chunks.join('\n');
writeFileSync(OUT, sql, 'utf8');

const checks = [
  ['tenants legado compativel', sql.includes('tenants_slug_key')],
  ['CHECK via EXECUTE', sql.includes('EXECUTE format(')],
  ['migracoes enumeradas', MIGRATIONS.every(([, v]) => sql.includes(`'${v}', '${v}_`))],
  ['perfil master', sql.includes('9e42e6aa-5155-4440-b368-5972fe391669')],
  ['COMMIT final', /\nCOMMIT;\n$/.test(sql)],
];

let ok = true;
console.log(`Bundle: ${OUT}`);
console.log(`  tamanho: ${Buffer.byteLength(sql, 'utf8')} bytes (${sql.length} caracteres)`);
for (const [name, pass] of checks) {
  console.log(`  [${pass ? 'OK  ' : 'FAIL'}] ${name}`);
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
