// Verifica o caminho de producao: bundle unico 001..013 + seed + master
// aplicado numa UNICA transacao a uma base de dados vazia.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Numero de migracoes lido do disco: o gate nunca mais fica obsoleto
// quando se acrescenta uma migracao nova ao projecto.
const EXPECTED_VERSIONS = readdirSync(join(ROOT, 'migrations', 'supabase'))
  .filter((file) => file.endsWith('.sql')).length;

const PORT = process.env.HR_LOCAL_PG_PORT || '55432';
const BUNDLE = process.argv[2];

if (!BUNDLE) {
  console.error('uso: node test-bundle.mjs <bundle.sql>');
  process.exit(2);
}

const SHIM = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN DEFAULT false,
    file_size_limit BIGINT, allowed_mime_types TEXT[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT,
    owner UUID, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.buckets TO postgres, anon, authenticated;
GRANT ALL ON storage.objects TO postgres, anon, authenticated;
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
`;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const pg = (await import('pg')).default;
const DB = 'hr_bundle_test';

const admin = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${DB}`);
await admin.end();

const db = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: DB });
await db.connect();
try {
  await db.query(SHIM);
  const sql = readFileSync(BUNDLE, 'utf8');
  await db.query(sql);
  check('bundle aplicado numa unica transacao', true, `${Buffer.byteLength(sql)} bytes`);

  const versions = await db.query('SELECT version FROM public._schema_migrations ORDER BY version');
  check(`_schema_migrations com ${EXPECTED_VERSIONS} versoes`, versions.rowCount === EXPECTED_VERSIONS,
    versions.rows.map((r) => r.version).join(','));

  const catalog = await db.query('SELECT count(*)::int AS n FROM public.master_products_catalog');
  check('catalogo mestre semeado', catalog.rows[0].n >= 60, `${catalog.rows[0].n} produtos`);

  const state = await db.query(`
    SELECT count(*)::int AS n FROM pg_catalog.pg_enum e
    JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'hotel_room_status' AND e.enumlabel = 'RESERVADO'`);
  check('enum RESERVADO criado dentro da transacao', state.rows[0].n === 1);

  for (const t of ['master_products_catalog', 'room_rates', 'hourly_billing',
    'guest_accounts', 'guest_order_items', 'pre_bill_logs']) {
    const r = await db.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS ok`);
    check(`tabela ${t} existe`, r.rows[0].ok === true);
  }

  const rls = await db.query(`
    SELECT count(*)::int AS n FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND rowsecurity
      AND tablename IN ('master_products_catalog','room_rates','hourly_billing',
                        'guest_accounts','guest_order_items','pre_bill_logs')`);
  check('RLS activo nas 6 tabelas novas', rls.rows[0].n === 6, `${rls.rows[0].n}/6`);

  const pub = await db.query(`
    SELECT count(*)::int AS n FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename IN ('guest_accounts','guest_order_items','hourly_billing','room_rates','pre_bill_logs')`);
  check('realtime activo nas tabelas novas', pub.rows[0].n === 5, `${pub.rows[0].n}/5`);
} catch (error) {
  check('bundle aplicado', false, error.message);
} finally {
  await db.end();
}

const admin2 = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' });
await admin2.connect();
if (!process.argv.includes('--keep')) {
  await admin2.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
}
await admin2.end();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  [${r.ok ? 'OK  ' : 'ERRO'}] ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`);
console.log(`\n  Total: ${results.length - failed.length}/${results.length} testes OK`);
process.exit(failed.length ? 1 : 0);
