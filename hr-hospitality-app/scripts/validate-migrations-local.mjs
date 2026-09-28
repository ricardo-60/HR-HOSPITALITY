#!/usr/bin/env node
/**
 * HR-HOSPITALITY - Validador funcional das migrações num Postgres local
 * =====================================================================
 * `check-migrations.mjs` valida a FORMA dos ficheiros. Este script valida o
 * FUNÇÃO: cria uma base de dados descartável, aplica um shim mínimo do
 * ambiente Supabase (roles, `auth.uid`, `storage.*`, publicação realtime),
 * corre as migrações 001..010 pela ordem e executa uma bateria de
 * asserções sobre licenciamento, RBAC granular e módulo financeiro.
 *
 * Não lê nem escreve credenciais: liga a Postgres local com as variáveis de
 * ambiente do utilizador (ou defaults de desenvolvimento) e apaga a base no
 * fim, com sucesso ou com falha.
 *
 * USO (a partir da raiz do repositório):
 *     node hr-hospitality-app/scripts/validate-migrations-local.mjs
 *     node hr-hospitality-app/scripts/validate-migrations-local.mjs --keep
 *
 * Sai com código != 0 se algum teste falhar.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations', 'supabase');

const HOST = process.env.HR_LOCAL_PG_HOST || '127.0.0.1';
const PORT = Number(process.env.HR_LOCAL_PG_PORT || 5432);
const USER = process.env.HR_LOCAL_PG_USER || 'postgres';
const DB = process.env.HR_LOCAL_PG_DATABASE || 'hr_migration_test';
const KEEP = process.argv.includes('--keep');

const MASTER_ID = '9e42e6aa-5155-4440-b368-5972fe391669';
const TENANT_LUKWEKU = '11111111-1111-1111-1111-111111111111';
const TENANT_TESTE = '33333333-3333-4333-8333-333333333333';

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail: ok ? '' : String(detail) });
}

async function expectError(name, fn, expectedCode) {
    try {
        await fn();
        check(name, false, 'deveria ter falhado e não falhou');
    } catch (error) {
        const code = String(error.code || '');
        const ok = expectedCode ? code === expectedCode || String(error.message).includes(expectedCode) : true;
        check(name, ok, `code=${code || 'n/d'} :: ${error.message}`);
    }
}

/** Shim mínimo do que as migrações esperam do runtime Supabase. */
const SHIM = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    public BOOLEAN DEFAULT false,
    file_size_limit BIGINT,
    allowed_mime_types TEXT[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT,
    name TEXT,
    owner UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.buckets TO postgres, anon, authenticated;
GRANT ALL ON storage.objects TO postgres, anon, authenticated;

DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS extensions;

-- O bundle (build_sql_bundle.mjs) e o runner criam a tabela de controlo;
-- como aqui aplicamos as migrações uma a uma, criamo-la no shim.
CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT now()
);
`;

async function main() {
    const pg = (await import('pg')).default;

    const admin = new pg.Client({ host: HOST, port: PORT, user: USER, database: 'postgres' });
    try {
        await admin.connect();
    } catch (error) {
        console.error(`Não foi possível ligar ao Postgres local em ${HOST}:${PORT} - ${error.message}`);
        console.error('Este validador exige um Postgres local a correr (ex.: serviço do Windows).');
        process.exit(1);
    }

    const version = (await admin.query('SHOW server_version_num')).rows[0].server_version_num;
    check('Postgres >= 130000 (gen_random_uuid nativo)', Number(version) >= 130000, version);

    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.end();

    const db = new pg.Client({ host: HOST, port: PORT, user: USER, database: DB });
    await db.connect();

    const setJwt = (sub) => db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub || '']);

    // A RLS não se aplica ao dono da tabela: os testes de autorização têm de
    // correr como o papel `authenticated`, nunca como o superuser.
    const rls = new pg.Client({ host: HOST, port: PORT, user: USER, database: DB });
    await rls.connect();
    await rls.query('SET ROLE authenticated');
    const setRlsJwt = (sub) => rls.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub || '']);

    try {
        // ── Shim ────────────────────────────────────────────────────────
        await db.query(SHIM);
        check('shim Supabase aplicado', true);

        // ── Migrações 001..010 ──────────────────────────────────────────
        const files = readdirSync(MIGRATIONS_DIR)
            .filter((f) => /^\d{3}_.+\.sql$/.test(f))
            .sort();
        check('lista de migrações não vazia', files.length >= 11, `${files.length} ficheiros`);

        const applied = [];
        for (const file of files) {
            const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
            try {
                await db.query(sql);
                // O runner e o bundle registam a versão aplicada; como aqui
                // corremos ficheiro a ficheiro, fazemos o mesmo por um lado.
                await db.query(
                    `INSERT INTO public._schema_migrations (version, name)
                     VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
                    [file.slice(0, 3), file]
                );
                applied.push(file.slice(0, 3));
            } catch (error) {
                check(`migração ${file} aplicada`, false, `${error.message} (linha ${error.line || '?'}: ${error.position || '?'})`);
                console.error(`[ERRO] migração ${file}: ${error.message}`);
                throw error;
            }
        }
        check('migrações 001..011 aplicadas sem erro', applied.length === files.length, applied.join(','));

        const tracked = await db.query('SELECT version FROM public._schema_migrations ORDER BY version');
        check('_schema_migrations com 11 versões', tracked.rowCount === 11, `${tracked.rowCount} registos`);

        for (const table of ['system_licenses', 'daily_expenses', 'financial_transactions']) {
            const r = await db.query(`SELECT to_regclass('public.${table}') IS NOT NULL AS ok`);
            check(`tabela ${table} existe`, r.rows[0].ok === true);
        }

        // ── Licenciamento: estado inicial ───────────────────────────────
        await setJwt('');
        let state = (await db.query('SELECT public.hr_license_state() AS s')).rows[0].s;
        check('sem sessão -> sem licença e sem bloqueio',
            state.has_license === false && state.is_expired === false, JSON.stringify(state));

        // ── Promoção do Master Global ───────────────────────────────────
        await db.query(`
            INSERT INTO auth.users (id, email) VALUES ($1, 'master@hr-hospitality.com')
            ON CONFLICT (id) DO NOTHING`, [MASTER_ID]);
        await db.query(`
            INSERT INTO public.app_users (
                id, tenant_id, auth_user_id, email, employee_code, name, role, status, must_change_password
            ) VALUES ($1, $2, $1, 'master@hr-hospitality.com', 'MASTER', 'Hermenegildo Ricardo',
                      'ADMINISTRATOR', 'ATIVO', false)
            ON CONFLICT (id) DO NOTHING`, [MASTER_ID, TENANT_LUKWEKU]);
        // O bundle do seed marca o perfil como Master Global; aqui fazemos o
        // mesmo, porque o seed da migração corre antes deste INSERT existir.
        await db.query(
            'UPDATE public.app_users SET is_master_global = TRUE WHERE id = $1', [MASTER_ID]);

        await setJwt(MASTER_ID);
        const isMaster = (await db.query('SELECT public.hr_is_master_global() AS m')).rows[0].m;
        check('utilizador master reconhecido por hr_is_master_global()', isMaster === true, String(isMaster));

        state = (await db.query('SELECT public.hr_license_state() AS s')).rows[0].s;
        check('instância existente arranca com licença anual activa',
            state.has_license === true && state.effective_status === 'ACTIVE' && state.is_expired === false,
            JSON.stringify(state));

        // ── Novo tenant + Teste 1: emissão de Formação 60 dias ──────────
        await db.query(`
            INSERT INTO public.tenants (id, name, slug, property_type, active_services)
            VALUES ($1, 'Hospedaria Teste', 'hospedaria-teste', 'HOSPEDARIA', '["ROOMS","BAR"]'::jsonb)
            ON CONFLICT (slug) DO NOTHING`, [TENANT_TESTE]);

        const issued = (await db.query(
            `SELECT public.hr_issue_license($1, 'TRAINING_GRACE', 60) AS r`, [TENANT_TESTE]
        )).rows[0].r;
        check('licença de Formação 60 dias emitida',
            typeof issued.license_key === 'string' && issued.license_key.startsWith('HR-GRACE-') &&
            issued.grace_period_days === 60 && issued.is_paid === false && issued.status === 'GRACE_PERIOD',
            JSON.stringify(issued));

        const hashRow = (await db.query(
            `SELECT encode(sha256(convert_to(license_key || ':' || tenant_id::text, 'UTF8')), 'hex') AS expected,
                    license_key_hash AS stored
             FROM public.system_licenses WHERE license_key = $1`, [issued.license_key]
        )).rows[0];
        check('hash da chave verificável (SHA-256)', hashRow.expected === hashRow.stored);

        // ── Operador comum na nova instância ────────────────────────────
        const OPERADOR = '44444444-4444-4444-8444-444444444444';
        await db.query(`
            INSERT INTO auth.users (id, email) VALUES ($1, 'operador@hospedaria.teste')
            ON CONFLICT (id) DO NOTHING`, [OPERADOR]);
        await db.query(`
            INSERT INTO public.app_users (
                id, tenant_id, auth_user_id, email, employee_code, name, role, status, must_change_password
            ) VALUES ($1, $2, $1, 'operador@hospedaria.teste', 'OPERADOR1', 'Operador Teste',
                      'ADMINISTRATOR', 'ATIVO', false)
            ON CONFLICT (id) DO NOTHING`, [OPERADOR, TENANT_TESTE]);

        await setJwt(OPERADOR);
        state = (await db.query('SELECT public.hr_license_state() AS s')).rows[0].s;
        check('operador vê a licença de carência da sua instância',
            state.effective_status === 'GRACE_PERIOD' && state.is_expired === false && state.days_left > 0,
            JSON.stringify(state));

        await expectError('operador comum NÃO emite licenças',
            () => db.query(`SELECT public.hr_issue_license($1, 'ANNUAL')`, [TENANT_TESTE]), 'P0001');

        // ── Teste 2: expiração bloqueia o comum, o master renova ────────
        await setJwt(MASTER_ID);
        await db.query(`
            UPDATE public.system_licenses
            SET starts_at = now() - make_interval(days => 62),
                expires_at = now() - make_interval(days => 2),
                grace_period_days = 0
            WHERE tenant_id = $1`, [TENANT_TESTE]);

        await setJwt(OPERADOR);
        state = (await db.query('SELECT public.hr_license_state() AS s')).rows[0].s;
        check('licença expirada -> estado EXPIRED e bloqueado',
            state.effective_status === 'EXPIRED' && state.is_expired === true, JSON.stringify(state));

        await setJwt(MASTER_ID);
        const renewed = (await db.query(
            `SELECT public.hr_issue_license($1, 'ANNUAL') AS r`, [TENANT_TESTE]
        )).rows[0].r;
        check('master renova para Anual',
            renewed.license_type === 'ANNUAL' && renewed.is_paid === true && renewed.status === 'ACTIVE',
            JSON.stringify(renewed));

        await setJwt(OPERADOR);
        state = (await db.query('SELECT public.hr_license_state() AS s')).rows[0].s;
        check('após renovação o operador volta a estar activo',
            state.effective_status === 'ACTIVE' && state.is_expired === false, JSON.stringify(state));

        // ── RBAC granular ───────────────────────────────────────────────
        const perm = async (value) => {
            await db.query(`UPDATE public.app_users SET permissions = $1::jsonb WHERE id = $2`, [value, OPERADOR]);
            const r = await db.query(`SELECT public.hr_has_permission('financial') AS p`);
            return r.rows[0].p;
        };
        check('permissions vazio = sem restrição granular', (await perm('[]')) === true);
        check('permissions com "financial" permite o módulo', (await perm('["financial"]')) === true);
        check('permissions sem "financial" nega o módulo', (await perm('["reports"]')) === false);
        await db.query(`UPDATE public.app_users SET permissions = '[]'::jsonb WHERE id = $1`, [OPERADOR]);

        // ── Módulo financeiro: RLS das despesas ─────────────────────────
        const EXPENSE_SQL = `
            INSERT INTO public.daily_expenses (tenant_id, category, description, amount, payment_method)
            VALUES ($1, 'MANUTENCAO', 'Reparação da bomba da piscina', 15000, 'NUMERARIO')`;

        await setRlsJwt(OPERADOR);
        await rls.query(EXPENSE_SQL, [TENANT_TESTE]);
        const expenseCount = (await db.query(
            'SELECT count(*)::int AS n FROM public.daily_expenses WHERE tenant_id = $1', [TENANT_TESTE]
        )).rows[0].n;
        check('administrador sem restrições cria despesa', expenseCount === 1, `${expenseCount} linhas`);

        await db.query(`UPDATE public.app_users SET permissions = '["reports"]'::jsonb WHERE id = $1`, [OPERADOR]);
        await expectError('administrador sem a permissão "financial" não cria despesa',
            () => rls.query(EXPENSE_SQL, [TENANT_TESTE]), '42501');
        await db.query(`UPDATE public.app_users SET permissions = '[]'::jsonb WHERE id = $1`, [OPERADOR]);

        // Um operador POS não escreve em financeiro, mesmo sem restrições.
        const POS_USER = '55555555-5555-4555-8555-555555555555';
        await db.query(`
            INSERT INTO auth.users (id, email) VALUES ($1, 'pos@hospedaria.teste')
            ON CONFLICT (id) DO NOTHING`, [POS_USER]);
        await db.query(`
            INSERT INTO public.app_users (
                id, tenant_id, auth_user_id, email, employee_code, name, role, status, must_change_password
            ) VALUES ($1, $2, $1, 'pos@hospedaria.teste', 'POSUSER1', 'Operador de Caixa',
                      'POS', 'ATIVO', false)
            ON CONFLICT (id) DO NOTHING`, [POS_USER, TENANT_TESTE]);
        await setRlsJwt(POS_USER);
        await expectError('perfil POS não escreve em financeiro',
            () => rls.query(EXPENSE_SQL, [TENANT_TESTE]), '42501');

        // O hóspede/visitante não escreve nada: sem JWT não há tenant.
        await setRlsJwt('');
        await expectError('sem sessão não cria despesas',
            () => rls.query(EXPENSE_SQL, [TENANT_TESTE]), '42501');

        // ── Razão financeiro consolidado ────────────────────────────────
        await db.query(`
            INSERT INTO public.daily_expenses (tenant_id, category, description, amount, payment_method)
            VALUES ($1, 'ENERGIA', 'Conta de energia do mês', 90000, 'TRANSFERENCIA')
            ON CONFLICT DO NOTHING`, [TENANT_LUKWEKU]);

        await db.query(`
            INSERT INTO public.pos_orders (
                tenant_id, order_number, status, payment_method, subtotal, total, closed_at
            ) VALUES ($1, 'CMP-010-TESTE', 'PAGA', 'TPA', 25000, 25000, now())
            ON CONFLICT (tenant_id, order_number) DO NOTHING`, [TENANT_LUKWEKU]);

        await db.query(`
            INSERT INTO public.hotel_reservations (
                tenant_id, guest_name, email, service_type, room_number,
                status, reservation_date, total_amount
            ) VALUES ($1, 'Cliente Validação', 'validacao@email.com', 'quarto', '101',
                      'CONFIRMADA', CURRENT_DATE, 180000)
            ON CONFLICT (id) DO NOTHING
            `, [TENANT_LUKWEKU]);

        await setJwt(MASTER_ID);
        const sync = (await db.query(
            `SELECT public.hr_sync_financial_entries($1) AS r`, [TENANT_LUKWEKU]
        )).rows[0].r;
        check('sincronização do razão devolve contagens',
            sync.pos >= 1 && sync.diarias >= 1 && sync.despesas >= 1, JSON.stringify(sync));

        const again = (await db.query(
            `SELECT public.hr_sync_financial_entries($1) AS r`, [TENANT_LUKWEKU]
        )).rows[0].r;
        check('sincronização idempotente (segunda execução não duplica)',
            JSON.stringify(again.pos) === JSON.stringify(sync.pos) &&
            JSON.stringify(again.diarias) === JSON.stringify(sync.diarias),
            JSON.stringify(again));

        const totals = (await db.query(`
            SELECT
                count(*) FILTER (WHERE direction = 'ENTRADA')::int AS entradas,
                count(*) FILTER (WHERE direction = 'SAIDA')::int    AS saidas,
                COALESCE(sum(amount) FILTER (WHERE direction = 'ENTRADA'), 0)::numeric AS receita,
                COALESCE(sum(amount) FILTER (WHERE direction = 'SAIDA'), 0)::numeric  AS despesa
            FROM public.financial_transactions
            WHERE tenant_id = $1`, [TENANT_LUKWEKU])).rows[0];
        check('razão tem entradas (POS + diárias) e saídas (despesas)',
            totals.entradas >= 2 && totals.saidas >= 1 && Number(totals.receita) > 0,
            JSON.stringify(totals));

        // Escritor estrangeiro não reprocessa outro tenant.
        await setJwt(OPERADOR);
        await expectError('sincronização negada a um tenant alheio',
            () => db.query(`SELECT public.hr_sync_financial_entries($1)`, [TENANT_LUKWEKU]), 'P0001');

        // ── Rastreabilidade ─────────────────────────────────────────────
        const audit = (await db.query(
            `SELECT count(*)::int AS n FROM public.tenant_audit_log
             WHERE tenant_id = $1 AND entity_table = 'daily_expenses'`, [TENANT_TESTE]
        )).rows[0].n;
        check('despesas deixam rasto de auditoria', audit >= 1, `${audit} registos`);

        // ── Personalização da empresa ───────────────────────────────────
        // Escrito pelo administrador local ATRAVÉS da RLS: valida a política
        // `tenants_update_company` instalada pela 010.
        await setRlsJwt(OPERADOR);
        await rls.query(`
            UPDATE public.tenants
            SET property_type = 'HOSPEDARIA',
                active_services = '["ROOMS","BAR","RESTAURANT"]'::jsonb,
                company_name = 'Hospedaria Teste Lda',
                tax_id = '5417890000'
            WHERE id = $1`, [TENANT_TESTE]);
        const company = (await rls.query(
            'SELECT company_name, tax_id, property_type, active_services FROM public.tenants WHERE id = $1',
            [TENANT_TESTE])).rows[0];
        check('parâmetros da empresa persistidos via RLS',
            company && company.property_type === 'HOSPEDARIA' && Array.isArray(company.active_services) &&
            company.active_services.length === 3, JSON.stringify(company));

        // Múltiplos IBANs continuam a viver em tenant_bank_accounts (007).
        await db.query(`
            INSERT INTO public.tenant_bank_accounts (tenant_id, bank_name, iban, account_holder, is_primary)
            VALUES ($1, 'BFA', 'AO06004000001234567890123', 'Hospedaria Teste Lda', true)
            ON CONFLICT DO NOTHING`, [TENANT_TESTE]);
        await db.query(`
            INSERT INTO public.tenant_bank_accounts (tenant_id, bank_name, iban, account_holder, is_primary)
            VALUES ($1, 'BAI', 'AO06004100009876543210987', 'Hospedaria Teste Lda', false)
            ON CONFLICT DO NOTHING`, [TENANT_TESTE]);
        const ibans = (await db.query(
            'SELECT count(*)::int AS n FROM public.tenant_bank_accounts WHERE tenant_id = $1',
            [TENANT_TESTE])).rows[0].n;
        check('múltiplos IBANs por instância', ibans === 2, `${ibans} contas`);

        // A 007 concedeu SELECT coluna a coluna e esqueceu `is_active`: a gestão
        // de IBANs morria com 42501. A 010 concede a tabela inteira.
        await setRlsJwt(OPERADOR);
        const bankRows = (await rls.query(
            'SELECT count(*)::int AS n FROM public.tenant_bank_accounts WHERE is_active = true'
        )).rows[0].n;
        check('leitura de tenant_bank_accounts com a coluna is_active', bankRows === 2, `${bankRows} linhas`);

        // A política de leitura voltou a mostrar IBANs inactivos (dava para
        // desactivar, nunca reactivar).
        await db.query(`
            UPDATE public.tenant_bank_accounts SET is_active = false
            WHERE tenant_id = $1 AND is_primary = false`, [TENANT_TESTE]);
        const visibleAfterDeactivate = (await rls.query(
            'SELECT count(*)::int AS n FROM public.tenant_bank_accounts'
        )).rows[0].n;
        check('IBAN inactivo continua visível para poder ser reactivado',
            visibleAfterDeactivate === 2, `${visibleAfterDeactivate} visíveis`);
        await db.query(`
            UPDATE public.tenant_bank_accounts SET is_active = true
            WHERE tenant_id = $1 AND is_primary = false`, [TENANT_TESTE]);

        // ── Master lê todas as instâncias ───────────────────────────────
        await setRlsJwt(MASTER_ID);
        const instances = (await rls.query(
            'SELECT count(*)::int AS n FROM public.tenants'
        )).rows[0].n;
        check('Master Global lista todas as instâncias (sob RLS)', instances >= 2, `${instances} tenants`);

        // Um administrador comum continua preso ao próprio tenant.
        await setRlsJwt(POS_USER);
        const otherVisible = (await rls.query(
            `SELECT count(*)::int AS n FROM public.tenants WHERE id = $1`, [TENANT_LUKWEKU]
        )).rows[0].n;
        check('admin comum NÃO vê instâncias alheias', otherVisible === 0, `${otherVisible} visíveis`);

        const ownVisible = (await rls.query(
            `SELECT count(*)::int AS n FROM public.tenants WHERE id = $1`, [TENANT_TESTE]
        )).rows[0].n;
        check('admin comum vê a própria instância', ownVisible === 1, `${ownVisible} visíveis`);

        // O Master Global continua imune à carência: o próprio quando expira.
        await setRlsJwt(MASTER_ID);
        const masterSeesAll = (await rls.query(
            'SELECT count(*)::int AS n FROM public.system_licenses'
        )).rows[0].n;
        check('Master Global lê o histórico de licenças de todas as instâncias',
            masterSeesAll >= 3, `${masterSeesAll} licenças`);

        // ✅ Módulo 011: catálogo mestre, tarifas, stock zero, extrato e
        // pré-conta anti-fraude.
        const catalog = (await db.query(`
            SELECT count(*)::int AS n,
                   count(*) FILTER (WHERE kind = 'BEBIDA')::int AS bebidas,
                   count(*) FILTER (WHERE kind = 'PRATO')::int  AS pratos,
                   count(*) FILTER (WHERE origin = 'LOCAL')::int AS locais
            FROM public.master_products_catalog`)).rows[0];
        check('catálogo mestre semeado (bebidas, pratos e origem local)',
            catalog.n >= 60 && catalog.bebidas >= 20 && catalog.pratos >= 10 && catalog.locais >= 20,
            JSON.stringify(catalog));

        const reservedState = (await db.query(`
            SELECT count(*)::int AS n
            FROM pg_catalog.pg_enum AS e
            JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid
            JOIN pg_catalog.pg_namespace AS s ON s.oid = t.typnamespace
            WHERE s.nspname = 'public'
              AND t.typname = 'hotel_room_status'
              AND e.enumlabel = 'RESERVADO'`)).rows[0].n;
        check('estado de quarto RESERVADO disponível para o quadro',
            reservedState === 1, `${reservedState} valores`);

        // Escrita no catálogo: exclusiva do Master Global.
        await setRlsJwt(OPERADOR);
        await expectError('operador comum não escreve no catálogo mestre',
            () => rls.query(`INSERT INTO public.master_products_catalog (sku, name) VALUES ('SO-OPERADOR-011', 'Tentativa')`),
            '42501');

        await setRlsJwt(MASTER_ID);
        await rls.query(`
            INSERT INTO public.master_products_catalog (sku, name, kind, category, origin)
            VALUES ('TESTE-MASTER-011', 'Produto do Master', 'PRATO', 'COMIDA', 'LOCAL')
            ON CONFLICT (sku) DO NOTHING`);
        const masterWrote = (await db.query(
            `SELECT count(*)::int AS n FROM public.master_products_catalog WHERE sku = 'TESTE-MASTER-011'`
        )).rows[0].n;
        check('Master Global escreve no catálogo mestre', masterWrote === 1, `${masterWrote}`);

        // ✅ Regra de stock zero: economato com saldo 0 esconde o produto
        // da tela de vendas, sem o remover da gestão.
        await setJwt(OPERADOR);
        await db.query(`
            INSERT INTO public.inventory_items (tenant_id, sku, name, category, unit, current_stock, average_cost)
            VALUES ($1, 'SKU-011-STOCK', 'Sumo de Teste', 'BEBIDA', 'un', 0, 500)
            ON CONFLICT (tenant_id, sku) DO NOTHING`, [TENANT_TESTE]);
        const invId = (await db.query(
            `SELECT id FROM public.inventory_items WHERE tenant_id = $1 AND sku = 'SKU-011-STOCK'`,
            [TENANT_TESTE])).rows[0].id;

        await db.query(`
            INSERT INTO public.pos_products (
                tenant_id, sku, name, category, price, inventory_item_id,
                affects_inventory, master_product_id
            ) VALUES (
                $1, 'POS-011-STOCK', 'Sumo Teste', 'BEBIDA', 700, $2, true,
                (SELECT id FROM public.master_products_catalog WHERE sku = 'REFR-COMPAL-250')
            )
            ON CONFLICT (tenant_id, sku) DO NOTHING`, [TENANT_TESTE, invId]);
        const stockedProduct = (await db.query(
            `SELECT id FROM public.pos_products WHERE tenant_id = $1 AND sku = 'POS-011-STOCK'`,
            [TENANT_TESTE])).rows[0].id;

        const zeroStock = (await db.query(
            `SELECT * FROM public.hr_pos_stock(ARRAY[$1]::uuid[])`, [stockedProduct])).rows[0];
        check('stock zero torna o produto indisponível no POS',
            zeroStock !== undefined && zeroStock.is_available === false &&
            Number(zeroStock.quantity_in_stock) === 0,
            JSON.stringify(zeroStock));

        await db.query(`UPDATE public.inventory_items SET current_stock = 5 WHERE id = $1`, [invId]);
        const restocked = (await db.query(
            `SELECT * FROM public.hr_pos_stock(ARRAY[$1]::uuid[])`, [stockedProduct])).rows[0];
        check('stock positivo volta a disponibilizar o produto',
            restocked !== undefined && restocked.is_available === true, JSON.stringify(restocked));

        // Artigos revendidos nao consomem economato: ficam sempre visiveis.
        await db.query(`
            INSERT INTO public.pos_products (tenant_id, sku, name, category, price, affects_inventory)
            VALUES ($1, 'POS-011-RESELO', 'Refil Revendido', 'BEBIDA', 900, false)
            ON CONFLICT (tenant_id, sku) DO NOTHING`, [TENANT_TESTE]);
        const resoldProduct = (await db.query(
            `SELECT id FROM public.pos_products WHERE tenant_id = $1 AND sku = 'POS-011-RESELO'`,
            [TENANT_TESTE])).rows[0].id;
        const resold = (await db.query(
            `SELECT * FROM public.hr_pos_stock(ARRAY[$1]::uuid[])`, [resoldProduct])).rows[0];
        check('artigo sem vínculo ao economato continua sempre visível',
            resold !== undefined && resold.is_available === true, JSON.stringify(resold));

        // ✅ Tarifas: diária e blocos horários editáveis pela administração.
        await db.query(`
            INSERT INTO public.hotel_rooms (tenant_id, room_number, room_type, price_per_night, floor)
            VALUES ($1, 'H01', 'Standard', 25000, 1)
            ON CONFLICT (tenant_id, room_number) DO NOTHING`, [TENANT_TESTE]);
        const roomId = (await db.query(
            `SELECT id FROM public.hotel_rooms WHERE tenant_id = $1 AND room_number = 'H01'`,
            [TENANT_TESTE])).rows[0].id;

        await db.query(`
            INSERT INTO public.room_rates (tenant_id, room_id, billing_mode, block_hours, price, label)
            VALUES ($1, $2, 'PER_DAY', 0, 45000, 'Diaria')
            ON CONFLICT DO NOTHING`, [TENANT_TESTE, roomId]);
        await db.query(`
            INSERT INTO public.room_rates (
                tenant_id, room_id, billing_mode, block_hours, price, extra_hour_price, label
            ) VALUES ($1, $2, 'PER_HOUR', 1, 15000, 12000, 'Bloco 1h'),
                    ($1, $2, 'PER_HOUR', 2, 25000, 12000, 'Bloco 2h'),
                    ($1, $2, 'PER_HOUR', 3, 33000, 12000, 'Bloco 3h')
            ON CONFLICT DO NOTHING`, [TENANT_TESTE, roomId]);

        const dayRate = (await db.query(
            `SELECT public.hr_room_rate($1, 'PER_DAY', 0) AS r`, [roomId])).rows[0].r;
        const hourRate = (await db.query(
            `SELECT public.hr_room_rate($1, 'PER_HOUR', 2) AS r`, [roomId])).rows[0].r;
        check('tarifa diária e bloco horário resolvidos',
            Number(dayRate) === 45000 && Number(hourRate) === 25000,
            `${dayRate} / ${hourRate}`);

        const started = (await db.query(
            `SELECT public.hr_start_hourly_billing($1, 2) AS r`, [roomId])).rows[0].r;
        check('sessão horária aberta com fim calculado',
            typeof started.ends_at !== 'undefined' && started.block_hours === 2 &&
            Number(started.rate) === 25000 && Number(started.extra_hour_rate) === 12000,
            JSON.stringify(started));

        await expectError('segunda sessão horária no mesmo quarto é rejeitada',
            () => db.query(`SELECT public.hr_start_hourly_billing($1, 1)`, [roomId]), '23505');

        const extended = (await db.query(
            `SELECT public.hr_extend_hourly_billing($1, 1) AS r`,
            [started.hourly_billing_id])).rows[0].r;
        check('estendimento da sessão alarga o prazo e conta a extensão',
            extended.extensions === 1 && typeof extended.ends_at !== 'undefined',
            JSON.stringify(extended));

        const closed = (await db.query(
            `SELECT public.hr_close_hourly_billing($1) AS r`,
            [started.hourly_billing_id])).rows[0].r;
        check('fecho da sessão horária liquida o valor e liberta o quarto',
            typeof closed.room_number === 'string' && Number(closed.amount_paid) > 0 &&
            closed.hours_used >= 0, JSON.stringify(closed));

        const roomAfterClose = (await db.query(
            `SELECT status::text AS s FROM public.hotel_rooms WHERE id = $1`, [roomId])).rows[0].s;
        check('quarto passa a LIMPEZA no fecho da sessão horária',
            roomAfterClose === 'LIMPEZA', roomAfterClose);

        // ✅ Extrato transparente: as linhas somam a conta e o total é
        // derivado pelo Postgres, nunca escrito pela aplicação.
        await db.query(`
            INSERT INTO public.guest_accounts (
                tenant_id, account_number, guest_name, room_number, source
            ) VALUES ($1, 'GC-011-TESTE', 'Hospede de Validacao', 'H01', 'HOSPEDAGEM')
            ON CONFLICT (tenant_id, account_number) DO NOTHING`, [TENANT_TESTE]);
        await db.query(`
            INSERT INTO public.guest_accounts (
                tenant_id, account_number, guest_name, source
            ) VALUES ($1, 'GC-011-OUTRA', 'Outro Hospede', 'HOSPEDAGEM')
            ON CONFLICT (tenant_id, account_number) DO NOTHING`, [TENANT_TESTE]);
        const accId = (await db.query(
            `SELECT id FROM public.guest_accounts WHERE tenant_id = $1 AND account_number = 'GC-011-TESTE'`,
            [TENANT_TESTE])).rows[0].id;

        await db.query(`
            INSERT INTO public.guest_order_items (
                tenant_id, account_id, origin, description, quantity, unit_price, line_total
            ) VALUES ($1, $2, 'RESTAURANTE', 'Muamba de Galinha', 1, 3500, 3500),
                    ($1, $2, 'BAR', 'Cuca 600ml', 2, 1100, 2200)
            ON CONFLICT DO NOTHING`, [TENANT_TESTE, accId]);
        const account = (await db.query(
            `SELECT subtotal, discount, total FROM public.guest_accounts WHERE id = $1`,
            [accId])).rows[0];
        check('conta do hóspede soma as linhas e deriva o total',
            Number(account.subtotal) === 5700 && Number(account.total) === 5700,
            JSON.stringify(account));

        // O hóspede autenticado vê a propria conta; a staff vê as da
        // instancia inteira.
        const GUEST = '66666666-6666-4666-8666-666666666666';
        await db.query(`
            INSERT INTO auth.users (id, email) VALUES ($1, 'hospede@validacao.teste')
            ON CONFLICT (id) DO NOTHING`, [GUEST]);
        await db.query(`
            INSERT INTO public.guest_profiles (
                id, tenant_id, auth_user_id, full_name,
                document_type, document_number, document_country
            ) VALUES ($1, $2, $1, 'Hospede Validacao', 'BI', '123456789LA041', 'ANGOLA')
            ON CONFLICT (id) DO NOTHING`, [GUEST, TENANT_TESTE]);
        await db.query(
            `UPDATE public.guest_accounts SET auth_user_id = $1 WHERE id = $2`,
            [GUEST, accId]);

        await setRlsJwt(GUEST);
        const guestVisible = (await rls.query(
            `SELECT count(*)::int AS n FROM public.guest_accounts`)).rows[0].n;
        check('hóspede vê apenas a própria conta no extrato',
            guestVisible === 1, `${guestVisible} contas visíveis`);

        const guestLines = (await rls.query(
            `SELECT count(*)::int AS n FROM public.guest_order_items`)).rows[0].n;
        check('hóspede vê as linhas do próprio extrato',
            guestLines === 2, `${guestLines} linhas visíveis`);

        await setRlsJwt(OPERADOR);
        const staffVisible = (await rls.query(
            `SELECT count(*)::int AS n FROM public.guest_accounts WHERE tenant_id = $1`,
            [TENANT_TESTE])).rows[0].n;
        check('staff vê todas as contas da instância', staffVisible === 2,
            `${staffVisible} contas`);

        // ✅ Pré-conta anti-fraude: congela a comanda, numera o documento e
        // exige justificativa auditada para retirar qualquer item.
        await db.query(`
            INSERT INTO public.pos_orders (
                tenant_id, order_number, status, payment_method,
                customer_name, subtotal, total, closed_at
            ) VALUES ($1, 'PC-011-TESTE', 'FECHADA', 'DINHEIRO',
                      'Cliente Pre-Conta', 0, 0, now())
            ON CONFLICT (tenant_id, order_number) DO NOTHING`, [TENANT_TESTE]);
        const testOrder = (await db.query(
            `SELECT id FROM public.pos_orders WHERE tenant_id = $1 AND order_number = 'PC-011-TESTE'`,
            [TENANT_TESTE])).rows[0].id;

        await db.query(`
            INSERT INTO public.pos_order_items (
                tenant_id, order_id, product_id, product_name,
                unit_price, quantity, line_total
            ) VALUES ($1, $2, $3, 'Cuca 600ml', 1100, 2, 2200)`,
            [TENANT_TESTE, testOrder, stockedProduct]);
        const lockedItem = (await db.query(
            `SELECT id FROM public.pos_order_items WHERE order_id = $1`,
            [testOrder])).rows[0].id;

        await setJwt(OPERADOR);
        const preBill = (await db.query(`
            SELECT public.hr_issue_pre_bill($1, NULL, 'MESA', 'Mesa de Teste', NULL, 'ESCPOS_58') AS r`,
            [testOrder])).rows[0].r;
        check('pré-conta emitida com número, total e itens congelados',
            typeof preBill.doc_number === 'string' && preBill.doc_number.startsWith('PC-') &&
            preBill.line_count === 1 && Number(preBill.total) === 2200 &&
            preBill.locked_items === 1 && preBill.printer === 'ESCPOS_58',
            JSON.stringify(preBill));

        const billRows = (await db.query(
            `SELECT count(*)::int AS n FROM public.pre_bill_logs
             WHERE tenant_id = $1 AND doc_number = $2`,
            [TENANT_TESTE, preBill.doc_number])).rows[0].n;
        check('registo de pré-conta persistido', billRows === 1, `${billRows}`);

        await expectError('remoção de item da pré-conta sem justificativa é bloqueada',
            () => db.query(`DELETE FROM public.pos_order_items WHERE id = $1`, [lockedItem]),
            '42501');

        await expectError('alterar a quantidade de um item da pré-conta é bloqueada',
            () => db.query(`UPDATE public.pos_order_items SET quantity = 99 WHERE id = $1`,
                [lockedItem]),
            '42501');

        await db.query(`
            UPDATE public.pos_order_items
            SET removal_justification = 'Consumo anulado pelo gerente de sala',
                removed_at = now()
            WHERE id = $1`, [lockedItem]);
        await db.query(`DELETE FROM public.pos_order_items WHERE id = $1`, [lockedItem]);

        const removalAudit = (await db.query(
            `SELECT count(*)::int AS n FROM public.tenant_audit_log
             WHERE tenant_id = $1 AND entity_table = 'pos_order_items'
               AND action = 'ITEM_PRE_CONTA_REMOVIDO'`,
            [TENANT_TESTE])).rows[0].n;
        check('remoção justificada de item da pré-conta fica auditada',
            removalAudit >= 1, `${removalAudit} registos`);

        // O log de documentos é permanente: a aplicação não o apaga.
        await setRlsJwt(OPERADOR);
        await expectError('log de pré-conta não pode ser apagado pela aplicação',
            () => rls.query(`DELETE FROM public.pre_bill_logs WHERE tenant_id = $1`, [TENANT_TESTE]),
            '42501');

        // ✅ Lacuna da 008: a policy de escrita de `pos_products` já existia,
        // mas o GRANT só concedia SELECT — a interface devolvia 42501.
        await setRlsJwt(OPERADOR);
        await rls.query(`
            UPDATE public.pos_products
            SET price = 750
            WHERE tenant_id = $1 AND sku = 'POS-011-RESELO'`, [TENANT_TESTE]);
        const resoldPrice = (await db.query(
            `SELECT price FROM public.pos_products WHERE tenant_id = $1 AND sku = 'POS-011-RESELO'`,
            [TENANT_TESTE])).rows[0].price;
        check('interface da empresa escreve em pos_products',
            Number(resoldPrice) === 750, `${resoldPrice}`);

        // O catálogo mestre continua fechado a quem não é Master Global.
        // (Uma UPDATE bloqueada pela RLS não devolve erro: afecta 0 linhas.)
        await rls.query(`UPDATE public.master_products_catalog SET suggested_price = 1 WHERE sku = 'REFR-COMPAL-250'`);
        const masterPrice = (await db.query(
            `SELECT suggested_price FROM public.master_products_catalog WHERE sku = 'REFR-COMPAL-250'`
        )).rows[0].suggested_price;
        check('produto mestre continua fechado ao operador',
            Number(masterPrice) > 1, `${masterPrice}`);

        // ✅ Extrato do hóspede: o documento emitido sobre a conta própria
        // fica visível para a app do cliente (a staff já via tudo).
        await setJwt(OPERADOR);
        const guestBill = (await db.query(`
            SELECT public.hr_issue_pre_bill(NULL, $1, 'QUARTO', 'Quarto H01', NULL, 'PDF') AS r`,
            [accId])).rows[0].r;
        check('extrato da conta do hóspede emitido com as linhas congeladas',
            guestBill.doc_type === 'EXTRATO' && guestBill.line_count === 2 &&
            Number(guestBill.total) === 5700 && guestBill.locked_items === 0,
            JSON.stringify(guestBill));

        await setRlsJwt(GUEST);
        const guestDocs = (await rls.query(
            `SELECT count(*)::int AS n FROM public.pre_bill_logs`)).rows[0].n;
        check('hóspede vê os documentos emitidos sobre a própria conta',
            guestDocs === 1, `${guestDocs} documentos`);

        await setRlsJwt(OPERADOR);
        const staffDocs = (await rls.query(
            `SELECT count(*)::int AS n FROM public.pre_bill_logs WHERE tenant_id = $1`,
            [TENANT_TESTE])).rows[0].n;
        check('staff vê todos os documentos da instância',
            staffDocs >= 2, `${staffDocs} documentos`);

    } finally {
        await db.end();
        await rls.end();
        if (!KEEP) {
            const admin2 = new pg.Client({ host: HOST, port: PORT, user: USER, database: 'postgres' });
            await admin2.connect();
            await admin2.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
            await admin2.end();
        }
    }

    // ── Relatório ──────────────────────────────────────────────────────
    const failed = results.filter((r) => !r.ok);
    console.log('\n=== HR-HOSPITALITY · Validação funcional das migrações (Postgres local) ===\n');
    for (const r of results) {
        console.log(`  [${r.ok ? 'OK  ' : 'ERRO'}] ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`);
    }
    console.log(`\n  Total: ${results.length - failed.length}/${results.length} testes OK`);
    if (failed.length) console.log(`  ${failed.length} FALHA(S) - corrija as migrações antes de as aplicar.\n`);
    else console.log('  Migrações funcionais e validadas.\n');

    process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
    console.error(`\n[ERRO FATAL] ${error.stack || error.message}`);
    process.exit(1);
});
