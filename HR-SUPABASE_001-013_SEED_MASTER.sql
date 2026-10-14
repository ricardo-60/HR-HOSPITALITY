-- ============================================================
--   HR-HOSPITALITY - BUNDLE UNICO (migracoes 001..011 + seed + master)
--   Gerado por hr-hospitality-app/scripts/build_sql_bundle.mjs
--   Idempotente: seguro para re-execucao sobre uma base vazia
--   ou sobre um projecto legado (a migracao 001 tolera um tenants
--   pre-existente com outro conjunto de colunas).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT now()
);
SET search_path = public, extensions;

-- ================ migrations/supabase/001_initial_schema.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 001 · SCHEMA INICIAL (Supabase)
--   Consolidado de: MIGRATION_FULL.sql + MIGRATION_NEW_PROJECT.sql
--   Idempotente: seguro para re-execução.
-- ============================================================

-- ── Tabela base de tenants ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    currency TEXT DEFAULT 'Kz',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Colunas obrigatorias do schema novo (no-ops quando ja existem).
-- Em projectos ja provisionados (ex.: schema legado HR-GESTPRO) a tabela
-- tenants existe com outro conjunto de colunas, por isso sao IF NOT EXISTS.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'Kz';

-- ── Tenant de demonstracao: Hotel Lukweku ───────────────────
-- O bloco tolera dois cenarios: um tenants recem-criado (schema novo) e um
-- tenants legado onde colunas NOT NULL sem default (company_name, tax_id)
-- impediriam o INSERT directo.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'tenants'
                 AND column_name = 'company_name') THEN
        EXECUTE 'ALTER TABLE public.tenants ALTER COLUMN company_name SET DEFAULT ' || quote_literal('Hotel Lukweku');
        UPDATE public.tenants SET name = company_name WHERE name IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'tenants'
                 AND column_name = 'tax_id') THEN
        EXECUTE 'ALTER TABLE public.tenants ALTER COLUMN tax_id SET DEFAULT ' || quote_literal('N/A');
    END IF;

    UPDATE public.tenants SET currency = 'Kz' WHERE currency IS NULL;

    -- ON CONFLICT (slug) exige um indice unico sobre slug.
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON public.tenants (slug)';

    BEGIN
        INSERT INTO public.tenants (id, name, slug, currency)
        VALUES ('11111111-1111-1111-1111-111111111111', 'Hotel Lukweku', 'hotel-lukweku', 'Kz')
        ON CONFLICT (slug) DO NOTHING;
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    ALTER TABLE public.tenants ALTER COLUMN name SET NOT NULL;
END $$;

-- ── Enum de status do quarto ────────────────────────────────
DO $$ BEGIN
    CREATE TYPE hotel_room_status AS ENUM ('DISPONIVEL', 'OCUPADO', 'LIMPEZA', 'MANUTENCAO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── Quartos do hotel ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hotel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    room_number VARCHAR(20) NOT NULL,
    room_type VARCHAR(50) NOT NULL,
    status hotel_room_status DEFAULT 'DISPONIVEL',
    price_per_night DECIMAL(10, 2) NOT NULL DEFAULT 0,
    floor INT DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sync_status TEXT DEFAULT 'synced',
    CONSTRAINT unique_room_per_tenant UNIQUE (tenant_id, room_number)
);

ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_all_tenant" ON public.hotel_rooms;
-- RLS remains deny-by-default here. Migration 005 installs the RBAC policies.

-- ── Quartos de demonstração — Hotel Lukweku ─────────────────
INSERT INTO public.hotel_rooms (id, tenant_id, room_number, room_type, status, price_per_night, floor, description) VALUES
('a1111111-1111-4111-8111-000000000101', '11111111-1111-1111-1111-111111111111', '101', 'Standard', 'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('a1111111-1111-4111-8111-000000000102', '11111111-1111-1111-1111-111111111111', '102', 'Standard', 'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('a1111111-1111-4111-8111-000000000103', '11111111-1111-1111-1111-111111111111', '103', 'Standard', 'LIMPEZA',    150.00, 1, 'Quarto standard — em limpeza'),
('a1111111-1111-4111-8111-000000000104', '11111111-1111-1111-1111-111111111111', '104', 'Standard', 'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para a piscina'),
('a1111111-1111-4111-8111-000000000201', '11111111-1111-1111-1111-111111111111', '201', 'Double',   'DISPONIVEL', 220.00, 2, 'Quarto duplo com cama king-size'),
('a1111111-1111-4111-8111-000000000202', '11111111-1111-1111-1111-111111111111', '202', 'Double',   'OCUPADO',    220.00, 2, 'Quarto duplo — hóspede activo'),
('a1111111-1111-4111-8111-000000000203', '11111111-1111-1111-1111-111111111111', '203', 'Double',   'DISPONIVEL', 220.00, 2, 'Quarto duplo com varanda'),
('a1111111-1111-4111-8111-000000000204', '11111111-1111-1111-1111-111111111111', '204', 'Double',   'DISPONIVEL', 220.00, 2, 'Quarto duplo com banheira'),
('a1111111-1111-4111-8111-000000000301', '11111111-1111-1111-1111-111111111111', '301', 'Suite',    'DISPONIVEL', 450.00, 3, 'Suite com sala de estar e jacuzzi'),
('a1111111-1111-4111-8111-000000000302', '11111111-1111-1111-1111-111111111111', '302', 'Suite',    'OCUPADO',    450.00, 3, 'Suite VIP — hóspede activo'),
('a1111111-1111-4111-8111-000000000303', '11111111-1111-1111-1111-111111111111', '303', 'Suite Premium', 'DISPONIVEL', 750.00, 3, 'Suite Presidencial com terraço privativo'),
('a1111111-1111-4111-8111-000000000304', '11111111-1111-1111-1111-111111111111', '304', 'Suite',    'MANUTENCAO', 450.00, 3, 'Suite — em manutenção')
ON CONFLICT (tenant_id, room_number) DO NOTHING;

-- ── Reservas do hotel ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hotel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    guest_name TEXT NOT NULL,
    email TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('quarto', 'conferencia', 'restaurante', 'transfer')),
    room_number TEXT,
    room_id TEXT,
    status TEXT DEFAULT 'PENDENTE_PAGAMENTO' CHECK (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELADA')),
    reservation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    total_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_all_open" ON public.hotel_reservations;
-- RLS remains deny-by-default here. Migration 005 installs the RBAC policies.

CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON public.hotel_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON public.hotel_reservations(created_at DESC);

-- ── Consumos/extras por estadia ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.hotel_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    reservation_id UUID NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) DEFAULT 0,
    category TEXT DEFAULT 'outro' CHECK (category IN ('minibar','restaurante','lavandaria','telefone','outro')),
    registered_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hotel_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consumptions_all_open" ON public.hotel_consumptions;
-- RLS remains deny-by-default here. Migration 005 installs the RBAC policies.

CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON public.hotel_consumptions(reservation_id);

-- ── Reservas de demonstração ────────────────────────────────
INSERT INTO public.hotel_reservations (id, tenant_id, guest_name, email, service_type, room_number, room_id, status, reservation_date) VALUES
('b2222222-2222-4222-8222-000000000001', '11111111-1111-1111-1111-111111111111', 'Hermenegildo Ricardo', 'h.ricardo@email.com', 'quarto', '101', 'a1111111-1111-4111-8111-000000000101', 'PENDENTE_PAGAMENTO', CURRENT_DATE + 2),
('b2222222-2222-4222-8222-000000000002', '11111111-1111-1111-1111-111111111111', 'Maria da Conceição', 'm.conceicao@email.com', 'quarto', '202', 'a1111111-1111-4111-8111-000000000202', 'CHECKED_IN', CURRENT_DATE),
('b2222222-2222-4222-8222-000000000003', '11111111-1111-1111-1111-111111111111', 'Carlos Mendonça', 'c.mendonca@empresa.ao', 'conferencia', NULL, NULL, 'PENDENTE_PAGAMENTO', CURRENT_DATE + 5),
('b2222222-2222-4222-8222-000000000004', '11111111-1111-1111-1111-111111111111', 'Ana Paula Silva', 'ana.silva@gmail.com', 'quarto', '104', 'a1111111-1111-4111-8111-000000000104', 'CHECKED_IN', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- ── Realtime — publicar alterações das tabelas ──────────────
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_rooms;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_reservations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public._schema_migrations (version, name)
VALUES ('001', '001_initial_schema.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/002_auth_pbkdf2_security.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 002 · SEGURANÇA AUTH PBKDF2 (Supabase)
--   Tabela de utilizadores com credenciais com hash — alinhada
--   com o AuthContext (PBKDF2-SHA256, 150k iterações, salt 16B).
--
--   ⚠️ NUNCA inserir palavras-passe em texto simples nesta tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMINISTRATOR','PERMISSAO','ACESSO')),
    -- Hash PBKDF2-SHA256 (Base64) — nunca texto simples
    password_hash TEXT,
    -- Salt aleatório de 16 bytes (Base64)
    password_salt TEXT,
    -- true = credencial padrão/conhecida; o login exige substituição
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    restrictions JSONB NOT NULL DEFAULT '[]',
    allowed_modules JSONB NOT NULL DEFAULT '["*"]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','BLOQUEADO')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_user_per_tenant UNIQUE (tenant_id, name)
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_all_tenant" ON public.app_users;
-- RLS remains deny-by-default here. Migration 005 installs the protected profile policies.

CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON public.app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON public.app_users(status);

INSERT INTO public._schema_migrations (version, name)
VALUES ('002', '002_auth_pbkdf2_security.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/003_sync_queue_setup.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 003 · FILA DE SINCRONIZAÇÃO (Supabase)
--
--   NO-OP INTENCIONAL: a tabela `sync_queue` é exclusiva do
--   SQLite local (hospitality_local.db) — é a fila de eventos
--   offline que o src/lib/syncEngine.ts consome e reconcilia
--   com o Supabase. Não faz sentido existir na nuvem.
--
--   Esta migração existe para manter o número de versão alinhado
--   entre os dois ambientes (sqlite ↔ supabase).
-- ============================================================
SELECT 'sync_queue é local-only — nenhuma alteração no Supabase' AS info;

INSERT INTO public._schema_migrations (version, name)
VALUES ('003', '003_sync_queue_setup.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/004_hr_employees.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 004 · RECURSOS HUMANOS (Supabase)
--   Tabela de empregados para os módulos /rh/*.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hr_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    employee_code TEXT,
    name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    hire_date DATE,
    base_salary DECIMAL(12,2) DEFAULT 0,
    contacts JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','FERIAS','SUSPENSO','DESLIGADO')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_employee_per_tenant UNIQUE (tenant_id, name)
);

ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_employees_all_tenant" ON public.hr_employees;
-- RLS remains deny-by-default here. Migration 005 installs the RBAC policies.

CREATE INDEX IF NOT EXISTS idx_hr_employees_tenant ON public.hr_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON public.hr_employees(status);
CREATE INDEX IF NOT EXISTS idx_hr_employees_department ON public.hr_employees(department);

INSERT INTO public._schema_migrations (version, name)
VALUES ('004', '004_hr_employees.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/005_secure_auth_and_rls.sql ================
-- ============================================================
-- HR-HOSPITALITY — MIGRAÇÃO 005 · SUPABASE AUTH + RLS
--
-- Security cutover:
--   * app_users is linked to auth.users;
--   * legacy PBKDF2 password columns are removed;
--   * roles/tenant come from the protected profile, never user_metadata;
--   * all permissive USING(true) policies are removed;
--   * public/anon access to operational tables is denied.
--
-- Run with a full Supabase backup and a staging test first.
-- ============================================================

BEGIN;

-- ── Identity columns and compatibility columns ─────────────────────────────
ALTER TABLE public.app_users
    ADD COLUMN IF NOT EXISTS auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS employee_code TEXT;

ALTER TABLE public.hotel_reservations
    ADD COLUMN IF NOT EXISTS check_in_date DATE,
    ADD COLUMN IF NOT EXISTS check_out_date DATE,
    ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

ALTER TABLE public.hotel_consumptions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

UPDATE public.hotel_reservations
SET sync_status = 'synced'
WHERE sync_status IS NULL;

UPDATE public.hotel_consumptions
SET sync_status = 'synced'
WHERE sync_status IS NULL;

ALTER TABLE public.hotel_reservations
    ALTER COLUMN sync_status SET DEFAULT 'synced';

ALTER TABLE public.hotel_consumptions
    ALTER COLUMN sync_status SET DEFAULT 'synced';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.app_users'::regclass
          AND conname = 'app_users_auth_user_id_fkey'
    ) THEN
        ALTER TABLE public.app_users
            ADD CONSTRAINT app_users_auth_user_id_fkey
            FOREIGN KEY (auth_user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE
            NOT VALID;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_uq
    ON public.app_users (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservations_id_tenant_uq
    ON public.hotel_reservations (id, tenant_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hotel_consumptions'::regclass
          AND conname = 'hotel_consumptions_reservation_tenant_fkey'
    ) THEN
        ALTER TABLE public.hotel_consumptions
            ADD CONSTRAINT hotel_consumptions_reservation_tenant_fkey
            FOREIGN KEY (reservation_id, tenant_id)
            REFERENCES public.hotel_reservations(id, tenant_id)
            ON DELETE CASCADE
            NOT VALID;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_uq
    ON public.app_users (lower(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_employee_code_uq
    ON public.app_users (tenant_id, lower(employee_code))
    WHERE employee_code IS NOT NULL;

-- Password hashes cannot be imported into Supabase Auth. Remove them from the
-- public schema instead of moving them to another client-accessible location.
ALTER TABLE public.app_users
    DROP COLUMN IF EXISTS password_hash,
    DROP COLUMN IF EXISTS password_salt;

-- Legacy browser identities have no Supabase Auth UUID and cannot be used.
-- Keep the rows for audit, but force them into an explicitly blocked state.
UPDATE public.app_users
SET status = 'BLOQUEADO'
WHERE auth_user_id IS NULL;

-- ── Protected authorization helpers ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_current_profile()
RETURNS TABLE (
    profile_id UUID,
    tenant_id UUID,
    role TEXT,
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT au.id, au.tenant_id, au.role, au.status
    FROM public.app_users AS au
    WHERE au.auth_user_id = (SELECT auth.uid())
      AND au.status = 'ATIVO'
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.hr_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT p.role = 'ADMINISTRATOR'
            FROM public.hr_current_profile() AS p
        ),
        FALSE
    )
$$;

CREATE OR REPLACE FUNCTION public.hr_can_module(requested_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT CASE p.role
                WHEN 'ADMINISTRATOR' THEN TRUE
                WHEN 'PERMISSAO' THEN NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(p_profile.restrictions) = 'array'
                            THEN p_profile.restrictions
                            ELSE '[]'::jsonb
                        END
                    ) AS restricted(value)
                    WHERE restricted.value = requested_module
                       OR restricted.value = '/' || requested_module
                       OR restricted.value LIKE '/' || requested_module || '/%'
                )
                WHEN 'ACESSO' THEN EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(p_profile.allowed_modules) = 'array'
                            THEN p_profile.allowed_modules
                            ELSE '[]'::jsonb
                        END
                    ) AS allowed(value)
                    WHERE allowed.value = '*'
                       OR allowed.value = requested_module
                )
                ELSE FALSE
            END
            FROM public.hr_current_profile() AS p
            JOIN public.app_users AS p_profile ON p_profile.id = p.profile_id
        ),
        FALSE
    )
$$;

CREATE OR REPLACE FUNCTION public.set_app_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS app_users_set_updated_at ON public.app_users;
CREATE TRIGGER app_users_set_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.set_app_users_updated_at();

REVOKE ALL ON FUNCTION public.hr_current_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_can_module(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_can_module(TEXT) TO authenticated;

-- ── Remove every policy from the protected business tables ────────────────
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'tenants',
              'app_users',
              'hotel_rooms',
              'hotel_reservations',
              'hotel_consumptions',
              'hr_employees'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            policy_row.policyname,
            policy_row.schemaname,
            policy_row.tablename
        );
    END LOOP;
END
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regclass('public._schema_migrations') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public._schema_migrations ENABLE ROW LEVEL SECURITY';
    END IF;
END
$$;

REVOKE ALL ON TABLE public.tenants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.app_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hotel_rooms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hotel_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hotel_consumptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hr_employees FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.tenants TO service_role;
GRANT ALL ON TABLE public.app_users TO service_role;
GRANT ALL ON TABLE public.hotel_rooms TO service_role;
GRANT ALL ON TABLE public.hotel_reservations TO service_role;
GRANT ALL ON TABLE public.hotel_consumptions TO service_role;
GRANT ALL ON TABLE public.hr_employees TO service_role;

DO $$
BEGIN
    IF to_regclass('public._schema_migrations') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON TABLE public._schema_migrations FROM PUBLIC, anon, authenticated';
        EXECUTE 'GRANT ALL ON TABLE public._schema_migrations TO service_role';
    END IF;
END
$$;

-- ── Tenant and safe profile access ─────────────────────────────────────────
GRANT SELECT ON TABLE public.tenants TO authenticated;

CREATE POLICY tenants_select_current_tenant
ON public.tenants
FOR SELECT
TO authenticated
USING (id = (SELECT tenant_id FROM public.hr_current_profile()));

GRANT SELECT (
    id,
    auth_user_id,
    tenant_id,
    email,
    employee_code,
    name,
    role,
    commission_rate,
    restrictions,
    allowed_modules,
    status,
    must_change_password,
    created_at,
    updated_at
) ON TABLE public.app_users TO authenticated;

CREATE POLICY app_users_select_self_or_admin
ON public.app_users
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (
        auth_user_id = (SELECT auth.uid())
        OR (SELECT public.hr_is_admin())
    )
);

-- ── Operational tables ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.hotel_rooms, public.hotel_reservations, public.hotel_consumptions
TO authenticated;

CREATE POLICY rooms_select_lodging
ON public.hotel_rooms
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY rooms_insert_lodging
ON public.hotel_rooms
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY rooms_update_lodging
ON public.hotel_rooms
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY rooms_delete_admin
ON public.hotel_rooms
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_is_admin())
);

CREATE POLICY reservations_select_lodging
ON public.hotel_reservations
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY reservations_insert_lodging
ON public.hotel_reservations
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY reservations_update_lodging
ON public.hotel_reservations
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY reservations_delete_admin
ON public.hotel_reservations
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_is_admin())
);

CREATE POLICY consumptions_select_lodging_or_pos
ON public.hotel_consumptions
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
);

CREATE POLICY consumptions_insert_lodging_or_pos
ON public.hotel_consumptions
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
);

CREATE POLICY consumptions_update_lodging_or_pos
ON public.hotel_consumptions
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
);

CREATE POLICY consumptions_delete_admin
ON public.hotel_consumptions
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (SELECT public.hr_is_admin())
);

-- ── HR employees ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.hr_employees
TO authenticated;

CREATE POLICY employees_select_rh
ON public.hr_employees
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
);

CREATE POLICY employees_insert_rh
ON public.hr_employees
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
);

CREATE POLICY employees_update_rh
ON public.hr_employees
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
);

CREATE POLICY employees_delete_admin
ON public.hr_employees
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_is_admin())
);

-- Fail the migration if a protected table still has a literal-true policy.
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'tenants', 'app_users', 'hotel_rooms',
              'hotel_reservations', 'hotel_consumptions', 'hr_employees'
          )
    LOOP
        IF (
            policy_row.qual IS NOT NULL
            AND policy_row.qual ~* '(^|[^[:alnum:]_])true([^[:alnum:]_]|$)'
        ) OR (
            policy_row.with_check IS NOT NULL
            AND policy_row.with_check ~* '(^|[^[:alnum:]_])true([^[:alnum:]_]|$)'
        ) THEN
            RAISE EXCEPTION 'Permissive policy remains: %.%', policy_row.tablename, policy_row.policyname;
        END IF;
    END LOOP;
END
$$;

COMMIT;

INSERT INTO public._schema_migrations (version, name)
VALUES ('005', '005_secure_auth_and_rls.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/006_mobile_public_catalog.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 006 · CATÁLOGO PÚBLICO MOBILE
--   Alvo: aplicação Hotel Lukweku (Expo / React Native) para
--         Google Play e Apple App Store.
--   Idempotente: seguro para re-execução.
-- ============================================================
--
-- CONTEXTO
--   A migração 005 fechou a RLS a `authenticated`, deixando passar apenas
--   perfis de staff. A app móvel é usada por hóspedes NÃO autenticados, pelo
--   que sem esta migração nenhuma tabela é legível e nenhuma reserva pode ser
--   criada.
--
--   Esta migração abre o mínimo indispensável:
--     1. Catálogos públicos de LEITURA: quartos disponíveis, piscinas, salões
--        e lavandaria.
--     2. Tabelas novas para preçários e espaços, com RLS activa.
--     3. Coluna `reference` gerada por trigger, para a recepção citar a
--        reserva ao hóspede.
--
-- PRINCÍPIOS
--   - `anon` NUNCA recebe `GRANT ALL`: só `SELECT`, e apenas em tabelas de
--     catálogo cujas linhas são públicas por definição.
--   - As políticas `authenticated` da migração 005 não são tocadas.
--   - `anon` NÃO insere reservas. A criação passa pela Edge Function
--     `create-reservation`, que usa `service_role`, valida a entrada e devolve
--     a referência. Conceder `INSERT` a `anon` exigiria conceder também
--     `SELECT` para devolver a referência, e essa `SELECT` vazaria TODAS as
--     reservas do hotel para qualquer hóspede. É por isso que a criação de
--     reservas não é feita pelo cliente.
-- ============================================================

-- ── 1. Referência legível para a reserva ──────────────────────────────────
-- Gerada no servidor por trigger: o cliente não a escolhe, logo não há
-- collisions provocadas nem referências falsificadas.
ALTER TABLE public.hotel_reservations
    ADD COLUMN IF NOT EXISTS reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_reference
    ON public.hotel_reservations (reference)
    WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_email
    ON public.hotel_reservations (lower(email));

CREATE OR REPLACE FUNCTION public.hr_reservation_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    candidate TEXT;
BEGIN
    IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN
        RETURN NEW;
    END IF;

    LOOP
        -- `gen_random_uuid()` é o único gerador aleatório de que a migração
        -- 001 já depende, ao contrário de `gen_random_bytes` (pgcrypto).
        candidate := 'LKW-' || to_char(now(), 'YYYY') || '-' ||
                     upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.hotel_reservations r WHERE r.reference = candidate
        );
    END LOOP;

    NEW.reference := candidate;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_reference ON public.hotel_reservations;
CREATE TRIGGER trg_reservations_reference
    BEFORE INSERT ON public.hotel_reservations
    FOR EACH ROW EXECUTE FUNCTION public.hr_reservation_reference();

-- ── 2. Alargar os serviços e as categorias de consumo ────────────────────
-- O CHECK existente só admite 'quarto','conferencia','restaurante','transfer'.
-- Piscina, evento e lavandaria são serviços reais e precisam de valor próprio
-- para o histórico e para a faturação.
DO $$
DECLARE
    allowed TEXT[] := ARRAY[
        'quarto', 'piscina', 'evento', 'lavandaria',
        'conferencia', 'restaurante', 'transfer'
    ];
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hotel_reservations'::regclass
          AND contype = 'c'
          AND conname = 'hotel_reservations_service_type_check'
    ) THEN
        ALTER TABLE public.hotel_reservations
            DROP CONSTRAINT hotel_reservations_service_type_check;
    END IF;

    -- PL/pgSQL nao substitui variaveis dentro de expressoes CHECK em DDL:
    -- a analise do ALTER TABLE so ocorre depois da substituicao, pelo que
    -- 'allowed' seria resolvido como coluna (42703). Construimos via EXECUTE.
    EXECUTE format(
        'ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_service_type_check CHECK (service_type = ANY (%L::text[]))',
        allowed
    );
END $$;

DO $$
DECLARE
    allowed TEXT[] := ARRAY[
        'minibar', 'restaurante', 'lavandaria', 'piscina',
        'evento', 'telefone', 'outro'
    ];
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hotel_consumptions'::regclass
          AND contype = 'c'
          AND conname = 'hotel_consumptions_category_check'
    ) THEN
        ALTER TABLE public.hotel_consumptions
            DROP CONSTRAINT hotel_consumptions_category_check;
    END IF;

    -- Ver nota no bloco anterior: variavel em CHECK de DDL exige EXECUTE.
    EXECUTE format(
        'ALTER TABLE public.hotel_consumptions ADD CONSTRAINT hotel_consumptions_category_check CHECK (category = ANY (%L::text[]))',
        allowed
    );
END $$;

-- ── 3. Catálogo público: piscinas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    depth_min_m NUMERIC(3, 1),
    depth_max_m NUMERIC(3, 1),
    opening_hours TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.public_pool_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES public.public_pools (id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    unit TEXT NOT NULL DEFAULT 'Kz/pessoa',
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pool_prices_pool ON public.public_pool_prices (pool_id);

-- ── 4. Catálogo público: lavandaria ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_laundry_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    unit TEXT NOT NULL DEFAULT 'Kz/kg',
    turnaround_hours INT NOT NULL DEFAULT 24 CHECK (turnaround_hours > 0),
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Catálogo público: salões de eventos ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_event_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    capacity INT CHECK (capacity IS NULL OR capacity > 0),
    price_per_hour NUMERIC(12, 2) NOT NULL CHECK (price_per_hour >= 0),
    price_per_day NUMERIC(12, 2) CHECK (price_per_day IS NULL OR price_per_day >= 0),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. RLS nas tabelas novas: negada por omissão ─────────────────────────
ALTER TABLE public.public_pools            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_pool_prices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_laundry_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_event_spaces     ENABLE ROW LEVEL SECURITY;

-- ── 7. Permissões ────────────────────────────────────────────────────────
-- `REVOKE ALL` explícito para sobreviver a re-execuções sobre um banco onde
-- alguém já tenha concedido algo por engano. Depois concede-se só o mínimo.
REVOKE ALL ON TABLE public.public_pools            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_pool_prices      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_laundry_services FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_event_spaces     FROM PUBLIC, anon, authenticated;

-- Gestão pelo backend (Edge Functions), nunca pelo cliente móvel.
GRANT ALL ON TABLE public.public_pools            TO service_role;
GRANT ALL ON TABLE public.public_pool_prices      TO service_role;
GRANT ALL ON TABLE public.public_laundry_services TO service_role;
GRANT ALL ON TABLE public.public_event_spaces     TO service_role;

-- Leitura pública, apenas de linhas activas.
GRANT SELECT ON TABLE public.public_pools            TO anon, authenticated;
GRANT SELECT ON TABLE public.public_pool_prices      TO anon, authenticated;
GRANT SELECT ON TABLE public.public_laundry_services TO anon, authenticated;
GRANT SELECT ON TABLE public.public_event_spaces     TO anon, authenticated;

DROP POLICY IF EXISTS public_pools_select_active ON public.public_pools;
CREATE POLICY public_pools_select_active
    ON public.public_pools FOR SELECT TO anon, authenticated
    USING (is_active);

DROP POLICY IF EXISTS public_pool_prices_select ON public.public_pool_prices;
CREATE POLICY public_pool_prices_select
    ON public.public_pool_prices FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM public.public_pools p
        WHERE p.id = public_pool_prices.pool_id AND p.is_active
    ));

DROP POLICY IF EXISTS public_laundry_select_active ON public.public_laundry_services;
CREATE POLICY public_laundry_select_active
    ON public.public_laundry_services FOR SELECT TO anon, authenticated
    USING (is_active);

DROP POLICY IF EXISTS public_event_spaces_select_active ON public.public_event_spaces;
CREATE POLICY public_event_spaces_select_active
    ON public.public_event_spaces FOR SELECT TO anon, authenticated
    USING (is_active);

-- ── 8. Quartos: catálogo público ──────────────────────────────────────────
-- A app mostra o que está DISPONIVEL. Nunca ocupado, em limpeza ou em
-- manutenção. A concessão é por COLUNAS: `tenant_id` e `sync_status` não são
-- expostos ao público.
GRANT SELECT (
    id, room_number, room_type, status, price_per_night, floor, description
) ON TABLE public.hotel_rooms TO anon;

DROP POLICY IF EXISTS rooms_select_public_catalog ON public.hotel_rooms;
CREATE POLICY rooms_select_public_catalog
    ON public.hotel_rooms FOR SELECT TO anon
    USING (status = 'DISPONIVEL');

-- ── 9. Reservas: sem qualquer acesso directo ao `anon` ────────────────────
-- A migração 005 já revogou tudo ao `anon` e as políticas são apenas
-- `authenticated`. Repetido aqui de forma explícita para que a intenção fique
-- registada: criação via Edge Function `create-reservation`, leitura das
-- reservas de um hóspede autenticado ou pela recepção.
REVOKE ALL ON TABLE public.hotel_reservations FROM anon;
DROP POLICY IF EXISTS reservations_insert_public ON public.hotel_reservations;
DROP POLICY IF EXISTS reservations_select_own_reference ON public.hotel_reservations;
DROP POLICY IF EXISTS reservations_select_public_anon ON public.hotel_reservations;

-- ── 10. Catálogo de demonstração ──────────────────────────────────────────
INSERT INTO public.public_pools (slug, name, description, depth_min_m, depth_max_m, opening_hours, sort_order)
VALUES
    ('piscina-inferior', 'Piscina Inferior',
     'Piscina principal com zona de natação lenta e área infantil.',
     1.2, 2.0, '07:00 – 21:00', 1),
    ('piscina-superior', 'Piscina Superior',
     'Piscina com vista panorâmica e bar de apoio.',
     1.4, 2.4, '08:00 – 22:00', 2)
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        description   = EXCLUDED.description,
        depth_min_m   = EXCLUDED.depth_min_m,
        depth_max_m   = EXCLUDED.depth_max_m,
        opening_hours = EXCLUDED.opening_hours,
        sort_order    = EXCLUDED.sort_order;

-- Preçários alinhados com FALLBACK_POOL_PRICES no cliente, para que o cache
-- offline e o servidor mostrem os mesmos números na primeira sincronização.
INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT p.id, v.label, v.price, v.unit, v.sort_order
FROM public.public_pools p
JOIN (VALUES
    ('piscina-inferior', 'Adulto — acesso diário',                8000.00, 'Kz/pessoa', 1),
    ('piscina-inferior', 'Criança (até 12 anos) — acesso diário',  4000.00, 'Kz/pessoa', 2),
    ('piscina-superior', 'Adulto — acesso diário',               12000.00, 'Kz/pessoa', 1),
    ('piscina-superior', 'Criança (até 12 anos) — acesso diário',  6000.00, 'Kz/pessoa', 2)
) AS v(slug, label, price, unit, sort_order) ON v.slug = p.slug
WHERE NOT EXISTS (
    SELECT 1 FROM public.public_pool_prices pp
    WHERE pp.pool_id = p.id AND pp.label = v.label
);

INSERT INTO public.public_laundry_services (slug, name, description, price, unit, turnaround_hours, sort_order)
VALUES
    ('lavagem-regular', 'Lavagem regular', 'Lavagem diária de roupa de cama e toalhas.', 3000.00, 'Kz/kg', 24, 1),
    ('lavagem-expressa', 'Lavagem expressa', 'Prioridade: pronta no mesmo dia.',           6000.00, 'Kz/kg', 6,  2),
    ('limpeza-a-seco',   'Limpeza a seco',   'Roupa formal, sem água.',                   12000.00, 'Kz/peça', 48, 3),
    ('passadeira',       'Passadeira',       'Apenas ferro, sem lavagem.',                    500.00, 'Kz/peça', 12, 4)
ON CONFLICT (slug) DO UPDATE
    SET name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        price            = EXCLUDED.price,
        unit             = EXCLUDED.unit,
        turnaround_hours = EXCLUDED.turnaround_hours,
        sort_order       = EXCLUDED.sort_order;

INSERT INTO public.public_event_spaces (slug, name, description, capacity, price_per_hour, price_per_day, sort_order)
VALUES
    ('salao-principal', 'Salão Principal', 'Sala polivalente para casamentos, conferências e jantares de gala.', 250, 75000.00, 400000.00, 1),
    ('salao-encontros', 'Sala de Encontros', 'Sala pequena para reuniões e entrevistas.',                    30,  25000.00, 120000.00, 2)
ON CONFLICT (slug) DO UPDATE
    SET name           = EXCLUDED.name,
        description    = EXCLUDED.description,
        capacity       = EXCLUDED.capacity,
        price_per_hour = EXCLUDED.price_per_hour,
        price_per_day  = EXCLUDED.price_per_day,
        sort_order     = EXCLUDED.sort_order;

-- ── 11. Referências das reservas de demonstração ──────────────────────────
-- As linhas legadas de demonstração não passam pelo trigger; preenchem-se aqui.
UPDATE public.hotel_reservations
SET reference = 'LKW-DEMO-' || right(id::text, 6)
WHERE reference IS NULL
  AND id IN (
      'b2222222-2222-4222-8222-000000000001',
      'b2222222-2222-4222-8222-000000000002',
      'b2222222-2222-4222-8222-000000000003',
      'b2222222-2222-4222-8222-000000000004'
  );

INSERT INTO public._schema_migrations (version, name)
VALUES ('006', '006_mobile_public_catalog.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/007_commercial_core.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 007 · NÚCLEO COMERCIAL MULTI-TENANT
--   Fase 1 · multi-hotel / multi-tenant SaaS comercial
--   Idempotente: seguro para re-execução.
-- ============================================================
--
-- ÂMBITO
--   1. Perfis de staff alargados a `POS` (venda) e `EXECUTIVO` (leitura).
--   2. `tenant_bank_accounts` — vários IBANs por hotel, para o Multicaixa
--      Express e transferências.
--   3. `guest_profiles` + `guest_documents` — KYC do hóspede com BI ou
--      Passaporte, foto do documento e selfie.
--   4. `gym_plans` + `gym_access_passes` — modalidades do ginásio e passes
--      com regra de inclusão/isenção para hóspedes.
--   5. `payment_proofs` — receção e validação de comprovativos.
--   6. Buckets privados de armazenamento para os ficheiros de KYC e de
--      comprovativos, com RLS no `storage.objects`.
--
-- MODELO DE IDENTIDADE
--   Guest  → `auth.users` + `guest_profiles.auth_user_id`
--   Staff  → `auth.users` + `app_users.auth_user_id` (migração 005)
--
--   Um hóspede autenticado NUNCA vê outro hóspede. Um staff nunca vê outro
--   tenant. O `anon` só vê catálogo ativo. Nada mais é público.
-- ============================================================

BEGIN;

-- ── 1. Perfis e authorization helpers ─────────────────────────────────────
-- `POS`            opera o ponto de venda.
-- `EXECUTIVO`      proprietário/gerência: leitura integral, ESCRITA NEGADA.
--
-- O papel executivo é intencionalmente só-leitura: não recebe policies de
-- INSERT/UPDATE/DELETE em nenhuma tabela operacional, logo a restrição não
-- depende de o cliente se esquecer de as verificar.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.app_users'::regclass
          AND conname = 'app_users_role_check'
    ) THEN
        ALTER TABLE public.app_users
            DROP CONSTRAINT IF EXISTS app_users_role_check;
        ALTER TABLE public.app_users
            ADD CONSTRAINT app_users_role_check
            CHECK (role IN (
                'ADMINISTRATOR', 'PERMISSAO', 'ACESSO', 'POS', 'EXECUTIVO'
            ));
    END IF;
END
$$;

-- Tenant do utilizador autenticado, seja staff OU hóspede. Definido mais abaixo,
-- depois de `guest_profiles` existir: o corpo de uma função SQL é verificado
-- no momento da criação, portanto referenciar a tabela antes de a criar falha.

-- Verdadeiro para administrador e gerência: leitura transversal ao tenant.
CREATE OR REPLACE FUNCTION public.hr_can_read_tenant()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT p.role IN ('ADMINISTRATOR', 'EXECUTIVO')
            FROM public.hr_current_profile() AS p
        ),
        FALSE
    )
$$;

-- Verdadeiro para quem pode ESCREVER no módulo pedido. O executivo fica de
-- fora de propósito.
CREATE OR REPLACE FUNCTION public.hr_can_write_module(requested_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT CASE p.role
                WHEN 'ADMINISTRATOR' THEN TRUE
                WHEN 'PERMISSAO' THEN NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(pr.restrictions) = 'array'
                             THEN pr.restrictions ELSE '[]'::jsonb END
                    ) AS restricted(value)
                    WHERE restricted.value = requested_module
                       OR restricted.value = '/' || requested_module
                       OR restricted.value LIKE '/' || requested_module || '/%'
                )
                WHEN 'ACESSO' THEN EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(pr.allowed_modules) = 'array'
                             THEN pr.allowed_modules ELSE '[]'::jsonb END
                    ) AS allowed(value)
                    WHERE allowed.value = '*'
                       OR allowed.value = requested_module
                )
                WHEN 'POS' THEN requested_module IN ('pos', 'snack-bar', 'spa')
                -- Sem qualquer escrita para a gerência.
                WHEN 'EXECUTIVO' THEN FALSE
                ELSE FALSE
            END
            FROM public.hr_current_profile() AS p
            JOIN public.app_users AS pr ON pr.id = p.profile_id
        ),
        FALSE
    )
$$;

-- `hr_can_module` passa a significar ACESSO (leitura). Mantém-se o nome para
-- não partir as policies já instaladas pela migração 005.
CREATE OR REPLACE FUNCTION public.hr_can_module(requested_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN (SELECT public.hr_can_read_tenant()) THEN TRUE
        ELSE COALESCE(
            (
                SELECT CASE p.role
                    WHEN 'PERMISSAO' THEN NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements_text(
                            CASE WHEN jsonb_typeof(pr.restrictions) = 'array'
                                 THEN pr.restrictions ELSE '[]'::jsonb END
                        ) AS restricted(value)
                        WHERE restricted.value = requested_module
                           OR restricted.value = '/' || requested_module
                           OR restricted.value LIKE '/' || requested_module || '/%'
                    )
                    WHEN 'ACESSO' THEN EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements_text(
                            CASE WHEN jsonb_typeof(pr.allowed_modules) = 'array'
                                 THEN pr.allowed_modules ELSE '[]'::jsonb END
                        ) AS allowed(value)
                        WHERE allowed.value = '*'
                           OR allowed.value = requested_module
                    )
                    WHEN 'POS' THEN requested_module IN ('pos', 'snack-bar', 'spa')
                    ELSE FALSE
                END
                FROM public.hr_current_profile() AS p
                JOIN public.app_users AS pr ON pr.id = p.profile_id
            ),
            FALSE
        )
    END
$$;

-- ── 2. tenant_bank_accounts ────────────────────────────────────────────────
-- Vários IBANs por hotel: cada banco é uma linha, e uma é `is_primary`.
-- Nenhum valor deste hotel é visível para outro tenant, nem para hóspedes.
CREATE TABLE IF NOT EXISTS public.tenant_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    iban TEXT NOT NULL,
    account_holder TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'CORRENTE'
        CHECK (account_type IN ('CORRENTE', 'POUPANCA')),
    currency TEXT NOT NULL DEFAULT 'Kz',
    supports_multicaixa_express BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tenant_bank_accounts_iban_format_chk
        CHECK (length(replace(replace(upper(iban), ' ', ''), '-', '')) BETWEEN 20 AND 34)
);

-- Só um IBAN primário activo por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_bank_accounts_primary_uq
    ON public.tenant_bank_accounts (tenant_id)
    WHERE is_primary AND is_active;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_bank_accounts_iban_uq
    ON public.tenant_bank_accounts (tenant_id, replace(replace(upper(iban), ' ', ''), '-', ''));

CREATE INDEX IF NOT EXISTS tenant_bank_accounts_tenant_idx
    ON public.tenant_bank_accounts (tenant_id, is_active);

-- Garante que apenas um primário por tenant, mesmo em concorrência.
CREATE OR REPLACE FUNCTION public.enforce_single_primary_bank_account()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_primary AND NEW.is_active THEN
        UPDATE public.tenant_bank_accounts
        SET is_primary = false, updated_at = now()
        WHERE tenant_id = NEW.tenant_id
          AND id IS DISTINCT FROM NEW.id
          AND is_primary;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_bank_accounts_primary_guard
    ON public.tenant_bank_accounts;
CREATE TRIGGER tenant_bank_accounts_primary_guard
    BEFORE INSERT OR UPDATE ON public.tenant_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_primary_bank_account();

-- ── 3. guest_profiles · KYC ───────────────────────────────────────────────
-- Dados do hóspede para o check-in. `auth_user_id` liga à conta do cliente no
-- Supabase Auth; pode ser nulo para hóspedes de walk-in registados pela
-- recepção, que continuam a ficar com um perfil completo e auditável.
CREATE TABLE IF NOT EXISTS public.guest_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,

    full_name TEXT NOT NULL,
    document_type TEXT NOT NULL
        CHECK (document_type IN ('BI', 'PASSAPORTE')),
    document_number TEXT NOT NULL,
    document_country TEXT,
    birth_date DATE,
    nationality TEXT,
    phone TEXT,
    email TEXT,

    -- Liberação de entrada no hotel: sem KYC aprovado não há check-in.
    kyc_status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (kyc_status IN ('PENDENTE', 'EM_ANALISE', 'APROVADO', 'REJEITADO')),
    kyc_notes TEXT,
    kyc_reviewed_by UUID,
    kyc_reviewed_at TIMESTAMPTZ,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT guest_profiles_document_number_chk
        CHECK (length(trim(document_number)) BETWEEN 3 AND 32),
    CONSTRAINT guest_profiles_email_chk
        CHECK (email IS NULL OR email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

-- Um BI por tenant; um passaporte por tenant. A mesma pessoa pode ter o mesmo
-- número de passaporte em outro hotel, por isso a unicidade é por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS guest_profiles_bi_uq
    ON public.guest_profiles (tenant_id, upper(document_number))
    WHERE document_type = 'BI';

CREATE UNIQUE INDEX IF NOT EXISTS guest_profiles_passport_uq
    ON public.guest_profiles (tenant_id, upper(document_number))
    WHERE document_type = 'PASSAPORTE';

CREATE UNIQUE INDEX IF NOT EXISTS guest_profiles_auth_user_uq
    ON public.guest_profiles (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_profiles_tenant_idx
    ON public.guest_profiles (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_profiles_phone_idx
    ON public.guest_profiles (tenant_id, phone);

CREATE INDEX IF NOT EXISTS guest_profiles_document_idx
    ON public.guest_profiles (tenant_id, document_type, upper(document_number));

-- Ficheiros de KYC. Paths no bucket privado `kyc-documents`; nunca URLs
-- públicas.
CREATE TABLE IF NOT EXISTS public.guest_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    guest_profile_id UUID NOT NULL
        REFERENCES public.guest_profiles (id) ON DELETE CASCADE,
    kind TEXT NOT NULL
        CHECK (kind IN ('BI_FRENTE', 'BI_VERSO', 'PASSAPORTE', 'SELFIE')),
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes > 0),
    uploaded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Uma peça por tipo: reenviar substitui.
    CONSTRAINT guest_documents_kind_uq UNIQUE (guest_profile_id, kind)
);

CREATE INDEX IF NOT EXISTS guest_documents_guest_idx
    ON public.guest_documents (guest_profile_id);

-- Regra: KYC só pode ser APROVADO com BI/Passaporte e pelo menos a peça
-- principal. A SELFIE é exigida para estrangeiros. Isto é aplicado na base,
-- não no ecrã: um bug na app não contorna a regra.
CREATE OR REPLACE FUNCTION public.enforce_kyc_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    required_kind TEXT;
BEGIN
    IF NEW.kyc_status = 'APROVADO' THEN
        required_kind := CASE WHEN NEW.document_type = 'BI'
                              THEN 'BI_FRENTE' ELSE 'PASSAPORTE' END;

        IF NOT EXISTS (
            SELECT 1 FROM public.guest_documents d
            WHERE d.guest_profile_id = NEW.id AND d.kind = required_kind
        ) THEN
            RAISE EXCEPTION
                'KYC % exige a peça % para concluir', NEW.document_type, required_kind
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.document_type = 'PASSAPORTE' AND NOT EXISTS (
            SELECT 1 FROM public.guest_documents d
            WHERE d.guest_profile_id = NEW.id AND d.kind = 'SELFIE'
        ) THEN
            RAISE EXCEPTION
                'KYC de estrangeiro exige SELFIE para concluir'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.kyc_reviewed_at IS NULL THEN
            NEW.kyc_reviewed_at := now();
        END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guest_profiles_kyc_guard ON public.guest_profiles;
CREATE TRIGGER guest_profiles_kyc_guard
    BEFORE INSERT OR UPDATE ON public.guest_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_kyc_documents();

-- A reserva passa a referenciar o perfil KYC do hóspede, para que a validação
-- possa ser feita a partir do comprovativo e do registo do hóspede.
ALTER TABLE public.hotel_reservations
    ADD COLUMN IF NOT EXISTS guest_profile_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hotel_reservations'::regclass
          AND conname = 'hotel_reservations_guest_profile_fkey'
    ) THEN
        ALTER TABLE public.hotel_reservations
            ADD CONSTRAINT hotel_reservations_guest_profile_fkey
            FOREIGN KEY (guest_profile_id)
            REFERENCES public.guest_profiles (id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS hotel_reservations_guest_idx
    ON public.hotel_reservations (guest_profile_id)
    WHERE guest_profile_id IS NOT NULL;

-- ── 4. gym_plans e gym_access_passes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gym_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    plan_type TEXT NOT NULL
        CHECK (plan_type IN ('DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'ANUAL')),
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    duration_days INT NOT NULL CHECK (duration_days > 0),
    -- Desconto aplicado a hóspedes comestadia activa. 0 = sem desconto.
    guest_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (guest_discount_pct >= 0 AND guest_discount_pct <= 100),
    -- 100 = o acesso vem incluído na diária do quarto.
    guest_included BOOLEAN NOT NULL DEFAULT false,
    includes_pool BOOLEAN NOT NULL DEFAULT false,
    includes_gym BOOLEAN NOT NULL DEFAULT true,
    max_guests INT NOT NULL DEFAULT 1 CHECK (max_guests > 0),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT gym_plans_name_tenant_uq UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS gym_plans_tenant_idx
    ON public.gym_plans (tenant_id, is_active, sort_order);

-- Passes emitidos. `is_guest_included` distingue o passe cortesia do hóspede
-- do passadiço pago por cliente externo.
CREATE TABLE IF NOT EXISTS public.gym_access_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.gym_plans (id) ON DELETE RESTRICT,
    guest_profile_id UUID REFERENCES public.guest_profiles (id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE CASCADE,
    holder_name TEXT NOT NULL,
    is_guest_included BOOLEAN NOT NULL DEFAULT false,
    price_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_paid >= 0),
    status TEXT NOT NULL DEFAULT 'ATIVO'
        CHECK (status IN ('ATIVO', 'USADO', 'EXPIRADO', 'CANCELADO')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT gym_access_passes_validity_chk CHECK (valid_until > issued_at)
);

CREATE INDEX IF NOT EXISTS gym_access_passes_guest_idx
    ON public.gym_access_passes (guest_profile_id, status);

CREATE INDEX IF NOT EXISTS gym_access_passes_reservation_idx
    ON public.gym_access_passes (reservation_id)
    WHERE reservation_id IS NOT NULL;

-- A data de validade é sempre calculada pelo servidor a partir da duração do
-- plano: o cliente não pode escolher `valid_until`.
CREATE OR REPLACE FUNCTION public.set_gym_pass_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    plan_duration INT;
BEGIN
    SELECT duration_days INTO plan_duration
    FROM public.gym_plans WHERE id = NEW.plan_id;

    IF plan_duration IS NULL THEN
        RAISE EXCEPTION 'Plano de ginásio inexistente: %', NEW.plan_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.valid_until := NEW.issued_at + make_interval(days => plan_duration);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS gym_access_passes_expiry ON public.gym_access_passes;
CREATE TRIGGER gym_access_passes_expiry
    BEFORE INSERT ON public.gym_access_passes
    FOR EACH ROW EXECUTE FUNCTION public.set_gym_pass_expiry();

-- ── 5. payment_proofs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE CASCADE,
    guest_profile_id UUID REFERENCES public.guest_profiles (id) ON DELETE SET NULL,
    bank_account_id UUID REFERENCES public.tenant_bank_accounts (id) ON DELETE SET NULL,

    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL
        CHECK (method IN ('MULTICAIXA_EXPRESS', 'TRANSFERENCIA', 'TPA', 'DINHEIRO')),
    -- Referência visível no comprovativo, escrita por quem paga.
    payment_reference TEXT,
    transaction_code TEXT,

    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes > 0),

    status TEXT NOT NULL DEFAULT 'EM_ANALISE'
        CHECK (status IN ('EM_ANALISE', 'APROVADO', 'REJEITADO')),
    review_notes TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,

    -- Só o valor declarado pelo hóspede entra aqui. O total oficial continua a
    -- vir de `hotel_reservations.total_amount`; o comprovativo nunca escreve
    -- no valor cobrado, o que evita que um comprovativo falso altere o preço.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_proofs_tenant_idx
    ON public.payment_proofs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_proofs_reservation_idx
    ON public.payment_proofs (reservation_id)
    WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_proofs_guest_idx
    ON public.payment_proofs (guest_profile_id)
    WHERE guest_profile_id IS NOT NULL;

-- Um comprovativo só é decidido por quem tem permissão no módulo, e fica
-- registado quem e quando.
CREATE OR REPLACE FUNCTION public.audit_payment_proof_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'EM_ANALISE' THEN
            RAISE EXCEPTION 'Um comprovativo não volta ao estado EM_ANALISE'
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.reviewed_at := now();
        NEW.reviewed_by := COALESCE(
            NEW.reviewed_by,
            (SELECT p.profile_id FROM public.hr_current_profile() AS p)
        );

        IF NEW.reviewed_by IS NULL THEN
            RAISE EXCEPTION 'Só um utilizador autenticado do hotel pode validar comprovativos'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payment_proofs_review_audit ON public.payment_proofs;
CREATE TRIGGER payment_proofs_review_audit
    BEFORE UPDATE ON public.payment_proofs
    FOR EACH ROW EXECUTE FUNCTION public.audit_payment_proof_review();

-- Uma reserva só passa a CONFIRMADA com um comprovativo aprovado. Aplicado na
-- base para que nenhum caminho (app, site, SQL manual) confirme sem pagamento.
CREATE OR REPLACE FUNCTION public.require_approved_proof_for_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'CONFIRMADA' AND OLD.status IS DISTINCT FROM 'CONFIRMADA' THEN
        IF NEW.total_amount > 0 AND NOT EXISTS (
            SELECT 1 FROM public.payment_proofs pp
            WHERE pp.reservation_id = NEW.id
              AND pp.tenant_id = NEW.tenant_id
              AND pp.status = 'APROVADO'
        ) THEN
            RAISE EXCEPTION
                'A reserva % não tem comprovativo aprovado e não pode ser confirmada', NEW.reference
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hotel_reservations_require_proof
    ON public.hotel_reservations;
CREATE TRIGGER hotel_reservations_require_proof
    BEFORE UPDATE OF status ON public.hotel_reservations
    FOR EACH ROW EXECUTE FUNCTION public.require_approved_proof_for_confirmation();

-- ── 6. Tenant do utilizador (staff ou hóspede) ─────────────────────────────
-- Definido aqui, e não no topo, porque o corpo referencia `guest_profiles`:
-- uma função SQL tem o corpo verificado no momento da criação, e a tabela
-- ainda não existia mais acima.
CREATE OR REPLACE FUNCTION public.hr_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT p.tenant_id FROM public.hr_current_profile() AS p),
        (SELECT gp.tenant_id
           FROM public.guest_profiles AS gp
          WHERE gp.auth_user_id = (SELECT auth.uid())
          LIMIT 1)
    )
$$;

-- ── 7. Buckets privados de armazenamento ──────────────────────────────────
-- KYC e comprovativos são documentos pessoais e financeiros: bucket privado,
-- sem policies públicas. O acesso passa por paths assinados emitidos apenas a
-- quem tem policy `SELECT` na tabela dona do ficheiro.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('kyc-documents', 'kyc-documents', false, 10485760,
     ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    ('payment-proofs', 'payment-proofs', false, 10485760,
     ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O path de qualquer objecto segue `<tenant_id>/<dono_id>/<ficheiro>`, o que
-- permite validar o primeiro segmento contra o tenant do utilizador.
CREATE OR REPLACE FUNCTION public.hr_storage_path_tenant(storage_path TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(split_part(storage_path, '/', 1), '')::UUID
$$;

DROP POLICY IF EXISTS kyc_documents_read ON storage.objects;
CREATE POLICY kyc_documents_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'kyc-documents'
        AND public.hr_storage_path_tenant(name)
            = (SELECT public.hr_tenant_id())
    );

DROP POLICY IF EXISTS kyc_documents_write ON storage.objects;
CREATE POLICY kyc_documents_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'kyc-documents'
        AND public.hr_storage_path_tenant(name)
            = (SELECT public.hr_tenant_id())
    );

-- O hóspede carrega o próprio documento, e apaga enquanto o KYC está por
-- decidir. Depois de decidido, é a recepção que gere o ficheiro.
DROP POLICY IF EXISTS kyc_documents_guest_upload ON storage.objects;
CREATE POLICY kyc_documents_guest_upload ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'kyc-documents'
        AND public.hr_storage_path_tenant(name)
            = (SELECT public.hr_tenant_id())
        AND NOT EXISTS (
            SELECT 1
            FROM public.guest_profiles gp
            JOIN public.guest_documents gd ON gd.guest_profile_id = gp.id
            WHERE gd.storage_path = name
              AND gp.auth_user_id = (SELECT auth.uid())
              AND gp.kyc_status IN ('APROVADO', 'REJEITADO')
        )
    );

DROP POLICY IF EXISTS kyc_documents_guest_delete ON storage.objects;
CREATE POLICY kyc_documents_guest_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'kyc-documents'
        AND public.hr_storage_path_tenant(name)
            = (SELECT public.hr_tenant_id())
        AND NOT EXISTS (
            SELECT 1
            FROM public.guest_profiles gp
            JOIN public.guest_documents gd ON gd.guest_profile_id = gp.id
            WHERE gd.storage_path = name
              AND gp.auth_user_id = (SELECT auth.uid())
              AND gp.kyc_status IN ('APROVADO', 'REJEITADO')
        )
    );

-- Leitura de comprovativos: o hóspede vê os seus, o staff vê os do tenant.
DROP POLICY IF EXISTS payment_proofs_read ON storage.objects;
CREATE POLICY payment_proofs_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'payment-proofs'
        AND public.hr_storage_path_tenant(name)
            = (SELECT public.hr_tenant_id())
    );

DROP POLICY IF EXISTS payment_proofs_guest_upload ON storage.objects;
CREATE POLICY payment_proofs_guest_upload ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'payment-proofs'
        AND public.hr_storage_path_tenant(name)
            = (SELECT public.hr_tenant_id())
    );

-- ── 8. RLS e privilégios das tabelas novas ────────────────────────────────
ALTER TABLE public.tenant_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_access_passes     ENABLE ROW LEVEL SECURITY;

-- Limpeza defensiva: nenhuma policy anterior sobrevive a esta migração.
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'tenant_bank_accounts', 'guest_profiles', 'guest_documents',
              'gym_plans', 'gym_access_passes'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            policy_row.policyname, policy_row.schemaname, policy_row.tablename
        );
    END LOOP;
END
$$;

-- nobody sem privilégios. `anon` NÃO recebe nada disto: catálogos públicos
-- vivem em `public_*` e os IBANs são dados de pagamento do tenant.
REVOKE ALL ON TABLE public.tenant_bank_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_profiles        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_documents       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gym_plans             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gym_access_passes     FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.tenant_bank_accounts TO service_role;
GRANT ALL ON TABLE public.guest_profiles        TO service_role;
GRANT ALL ON TABLE public.guest_documents       TO service_role;
GRANT ALL ON TABLE public.gym_plans             TO service_role;
GRANT ALL ON TABLE public.gym_access_passes     TO service_role;

-- ── tenant_bank_accounts ──────────────────────────────────────────────────
GRANT SELECT (
    id, bank_name, iban, account_holder, account_type, currency,
    supports_multicaixa_express, is_primary, instructions
) ON TABLE public.tenant_bank_accounts TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_bank_accounts TO authenticated;

CREATE POLICY bank_accounts_read_tenant
    ON public.tenant_bank_accounts
    FOR SELECT TO authenticated
    USING (
        is_active
        AND tenant_id = (SELECT public.hr_tenant_id())
    );

CREATE POLICY bank_accounts_write_admin
    ON public.tenant_bank_accounts
    FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('financeiro'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('financeiro'))
    );

-- ── guest_profiles ────────────────────────────────────────────────────────
-- Leitura: o próprio hóspede, ou o staff do hotel.
GRANT SELECT ON TABLE public.guest_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.guest_profiles TO authenticated;

CREATE POLICY guest_profiles_read_own_or_staff
    ON public.guest_profiles
    FOR SELECT TO authenticated
    USING (
        auth_user_id = (SELECT auth.uid())
        OR (
            (SELECT public.hr_can_read_tenant())
            AND (SELECT public.hr_can_module('alojamento'))
        )
    );

-- O hóspede cria o próprio perfil, sempre a si próprio e sem KYC aprovado:
-- não pode auto-aprovar o check-in.
CREATE POLICY guest_profiles_insert_own
    ON public.guest_profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        auth_user_id = (SELECT auth.uid())
        AND kyc_status IN ('PENDENTE', 'EM_ANALISE')
        AND kyc_reviewed_by IS NULL
        AND kyc_reviewed_at IS NULL
    );

CREATE POLICY guest_profiles_update_own
    ON public.guest_profiles
    FOR UPDATE TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- A recepção gere o KYC: não pode editar um perfil de outro tenant e a
-- gerência (EXECUTIVO) fica sem escrita por construção.
CREATE POLICY guest_profiles_write_staff
    ON public.guest_profiles
    FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

-- ── guest_documents ───────────────────────────────────────────────────────
GRANT SELECT ON TABLE public.guest_documents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.guest_documents TO authenticated;

CREATE POLICY guest_documents_read
    ON public.guest_documents
    FOR SELECT TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            EXISTS (
                SELECT 1 FROM public.guest_profiles gp
                WHERE gp.id = guest_documents.guest_profile_id
                  AND gp.auth_user_id = (SELECT auth.uid())
            )
            OR (SELECT public.hr_can_read_tenant())
        )
    );

CREATE POLICY guest_documents_insert
    ON public.guest_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            EXISTS (
                SELECT 1 FROM public.guest_profiles gp
                WHERE gp.id = guest_documents.guest_profile_id
                  AND gp.auth_user_id = (SELECT auth.uid())
            )
            OR (SELECT public.hr_can_write_module('alojamento'))
        )
    );

CREATE POLICY guest_documents_write_staff
    ON public.guest_documents
    FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

-- ── gym_plans ─────────────────────────────────────────────────────────────
-- Catálogo público: qualquer pessoa vê as modalidades e os preços do hotel.
-- A regra de desconto vai na mesma, para o cliente saber quanto paga.
GRANT SELECT ON TABLE public.gym_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.gym_plans TO authenticated;

CREATE POLICY gym_plans_read_public
    ON public.gym_plans
    FOR SELECT TO anon, authenticated
    USING (is_active);

CREATE POLICY gym_plans_write_staff
    ON public.gym_plans
    FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('spa'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('spa'))
    );

-- ── gym_access_passes ─────────────────────────────────────────────────────
-- Sem concessão ao `anon`: um passe é um documento pessoal de acesso.
GRANT SELECT, INSERT ON TABLE public.gym_access_passes TO authenticated;
GRANT UPDATE, DELETE ON TABLE public.gym_access_passes TO authenticated;

CREATE POLICY gym_passes_read_own_or_staff
    ON public.gym_access_passes
    FOR SELECT TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            EXISTS (
                SELECT 1 FROM public.guest_profiles gp
                WHERE gp.id = gym_access_passes.guest_profile_id
                  AND gp.auth_user_id = (SELECT auth.uid())
            )
            OR (SELECT public.hr_can_read_tenant())
        )
    );

-- O hóspede só emite passes para si. O valor é decidido pelo servidor:
-- `price_paid` tem de bater certo com o plano, senão um hóspede emite um passe
-- pago a zero e ganha acesso sem pagar.
CREATE POLICY gym_passes_insert_own
    ON public.gym_access_passes
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND EXISTS (
            SELECT 1 FROM public.guest_profiles gp
            WHERE gp.id = gym_access_passes.guest_profile_id
              AND gp.auth_user_id = (SELECT auth.uid())
        )
        AND (is_guest_included = false OR (SELECT public.hr_can_write_module('spa')))
        AND price_paid = (
            SELECT CASE
                WHEN gym_access_passes.is_guest_included THEN 0
                ELSE g.price * (1 - g.guest_discount_pct / 100)
            END
            FROM public.gym_plans g
            WHERE g.id = gym_access_passes.plan_id
              AND g.tenant_id = gym_access_passes.tenant_id
              AND g.is_active
        )
    );

CREATE POLICY gym_passes_write_staff
    ON public.gym_access_passes
    FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('spa'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('spa'))
    );

-- ── 9. Permissões das funções novas ───────────────────────────────────────
REVOKE ALL ON FUNCTION public.hr_tenant_id()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_can_read_tenant()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_can_write_module(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_storage_path_tenant(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_reservation_reference() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hr_tenant_id()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_can_read_tenant()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_can_write_module(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_storage_path_tenant(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_reservation_reference() TO authenticated;

COMMIT;

INSERT INTO public._schema_migrations (version, name)
VALUES ('007', '007_commercial_core.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/008_pos_inventory_cash.sql ================
-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 008 · POS, ECONOMATO E CAIXA
--   Fase 1 · módulo comercial de operação
--   Idempotente: seguro para re-execução.
-- ============================================================
--
-- ÂMBITO
--   1. `pos_tables` / `pos_products` / `pos_orders` / `pos_order_items`
--      → comandas de snack-bar, bar, esplanada e piscina, com liquidação na
--        conta do quarto ou venda avulsa.
--   2. `inventory_items` / `inventory_movements` → economato, com saldo
--      calculado por trigger e alertas de stock mínimo.
--   3. `cash_sessions` → aberturas e fechos de caixa por meio de pagamento,
--        base do painel executivo de fluxo de caixa.
--   4. `tenant_audit_log` → rasto de auditoria por tenant, obrigatório num
--      produto comercializável.
--
-- DECISÃO DE MODELAGEM
--   O saldo de stock NÃO é uma coluna que o cliente escreva: é calculado por
--   trigger a partir de `inventory_movements`. Um `UPDATE` directo de
--   `current_stock` sem movimento deixaria o inventário sem justificação.
-- ============================================================

BEGIN;

-- ── 1. Catálogo POS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    zone TEXT NOT NULL
        CHECK (zone IN ('SNACK_BAR', 'BALCAO', 'ESPLANADA', 'PISCINA', 'RESTAURANTE')),
    seats INT NOT NULL DEFAULT 4 CHECK (seats > 0),
    status TEXT NOT NULL DEFAULT 'LIVRE'
        CHECK (status IN ('LIVRE', 'OCUPADA', 'RESERVADA', 'MANUTENCAO')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pos_tables_code_tenant_uq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS pos_tables_tenant_idx
    ON public.pos_tables (tenant_id, zone, is_active);

-- Produtos vendáveis no POS. Aponta para o economato quando o artigo é
-- consumível com stock físico.
CREATE TABLE IF NOT EXISTS public.pos_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'outro'
        CHECK (category IN (
            'BEBIDA', 'COMIDA', 'CAFETERIA', 'SNACK', 'PISCINA',
            'GINASIO', 'LAVANDARIA', 'HOSPEDAGEM', 'outro'
        )),
    unit TEXT NOT NULL DEFAULT 'un',
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    -- NULL = artigo revendido (bebidas engarrafadas compradas a pronto), que
    -- não consome stock do economato. Preenchido = artigo de stock.
    inventory_item_id UUID,
    affects_inventory BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pos_products_sku_tenant_uq UNIQUE (tenant_id, sku),
    CONSTRAINT pos_products_stock_link_chk
        CHECK (affects_inventory = false OR inventory_item_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS pos_products_tenant_idx
    ON public.pos_products (tenant_id, is_active, category);

-- ── 2. Comandas ───────────────────────────────────────────────────────────
-- `reservation_id` preenchido = lançamento na conta do quarto (o valor é
-- liquidado no checkout geral). NULL = venda avulsa a cliente externo.
CREATE TABLE IF NOT EXISTS public.pos_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    table_id UUID REFERENCES public.pos_tables (id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,

    customer_name TEXT,
    guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count > 0),

    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA', 'PAGA', 'CANCELADA')),
    payment_method TEXT
        CHECK (payment_method IS NULL OR payment_method IN (
            'MULTICAIXA_EXPRESS', 'TRANSFERENCIA', 'TPA', 'DINHEIRO', 'CONTA_DO_QUARTO'
        )),

    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,

    opened_by UUID,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by UUID,
    closed_at TIMESTAMPTZ,

    CONSTRAINT pos_orders_number_tenant_uq UNIQUE (tenant_id, order_number),
    CONSTRAINT pos_orders_closure_chk
        CHECK ((status = 'ABERTA') = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS pos_orders_open_idx
    ON public.pos_orders (tenant_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS pos_orders_reservation_idx
    ON public.pos_orders (reservation_id)
    WHERE reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pos_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_id UUID NOT NULL
        REFERENCES public.pos_orders (id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.pos_products (id) ON DELETE SET NULL,
    -- Cópia do nome e do preço no momento da venda: o histórico não pode mudar
    -- quando o hotel reajustar a carta.
    product_name TEXT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_order_items_order_idx
    ON public.pos_order_items (order_id);

-- O total da comanda é sempre derivado das linhas. Nunca é escrito pelo
-- cliente, o que impede que uma comanda mostre um total diferente da soma.
CREATE OR REPLACE FUNCTION public.recalc_pos_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_order UUID := COALESCE(NEW.order_id, OLD.order_id);
    new_subtotal NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(line_total), 0) INTO new_subtotal
    FROM public.pos_order_items
    WHERE order_id = target_order;

    UPDATE public.pos_orders
    SET subtotal = new_subtotal,
        total = GREATEST(new_subtotal - discount, 0)
    WHERE id = target_order;

    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS pos_order_items_recalc ON public.pos_order_items;
CREATE TRIGGER pos_order_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON public.pos_order_items
    FOR EACH ROW EXECUTE FUNCTION public.recalc_pos_order_total();

-- Uma comanda sobre conta do quarto tem de apontar para uma reserva; avulsa
-- tem de ser liquidada na hora. Misturar os dois deixaria valores órfãos.
CREATE OR REPLACE FUNCTION public.validate_pos_order_liquidation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IN ('FECHADA', 'PAGA') THEN
        IF NEW.reservation_id IS NOT NULL AND NEW.payment_method IS DISTINCT FROM 'CONTA_DO_QUARTO' THEN
            RAISE EXCEPTION
                'Uma comanda lançada na conta do quarto liquida como CONTA_DO_QUARTO'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.reservation_id IS NULL AND NEW.payment_method IS NULL THEN
            RAISE EXCEPTION
                'Uma venda avulsa precisa de um meio de pagamento'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.closed_at IS NULL THEN
            NEW.closed_at := now();
        END IF;
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pos_orders_liquidation_guard ON public.pos_orders;
CREATE TRIGGER pos_orders_liquidation_guard
    BEFORE INSERT OR UPDATE ON public.pos_orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_pos_order_liquidation();

-- A mesa passa a OCUPADA quando abre comanda e volta a LIVRE quando fecha.
CREATE OR REPLACE FUNCTION public.sync_pos_table_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.table_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF NEW.status = 'ABERTA' THEN
        UPDATE public.pos_tables
        SET status = 'OCUPADA', updated_at = now()
        WHERE id = NEW.table_id AND status IN ('LIVRE', 'RESERVADA');
    ELSIF NEW.status IN ('FECHADA', 'PAGA', 'CANCELADA') THEN
        -- Só volta a LIVRE se não houver outra comanda aberta na mesma mesa.
        IF NOT EXISTS (
            SELECT 1 FROM public.pos_orders o
            WHERE o.table_id = NEW.table_id
              AND o.status = 'ABERTA'
              AND o.id <> NEW.id
        ) THEN
            UPDATE public.pos_tables
            SET status = 'LIVRE', updated_at = now()
            WHERE id = NEW.table_id AND status = 'OCUPADA';
        END IF;
    END IF;

    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS pos_orders_table_status ON public.pos_orders;
CREATE TRIGGER pos_orders_table_status
    AFTER INSERT OR UPDATE OF status ON public.pos_orders
    FOR EACH ROW EXECUTE FUNCTION public.sync_pos_table_status();

-- ── 3. Economato e stock ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'outro'
        CHECK (category IN (
            'BEBIDA', 'COMIDA', 'LIMPEZA', 'HIGIENE',
            'ROUPARIA', 'MANUTENCAO', 'ESCRITORIO', 'outro'
        )),
    unit TEXT NOT NULL DEFAULT 'un',
    -- Saldo derivado de `inventory_movements` (ver trigger abaixo).
    current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
    min_stock NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    -- Preço médio ponderado, mantido pelo trigger de movimento.
    average_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
    supplier TEXT,
    last_restock_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT inventory_items_sku_tenant_uq UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS inventory_items_tenant_idx
    ON public.inventory_items (tenant_id, is_active, category);

-- Liga o catálogo POS ao economato.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.pos_products'::regclass
          AND conname = 'pos_products_inventory_item_fkey'
    ) THEN
        ALTER TABLE public.pos_products
            DROP CONSTRAINT IF EXISTS pos_products_inventory_item_fkey;
        ALTER TABLE public.pos_products
            ADD CONSTRAINT pos_products_inventory_item_fkey
            FOREIGN KEY (inventory_item_id)
            REFERENCES public.inventory_items (id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.inventory_items (id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL
        CHECK (movement_type IN ('ENTRADA', 'SAIDA', 'QUEBRA', 'INVENTARIO', 'AJUSTE')),

    -- Sempre positivo na quantia; o sinal vem de `movement_type`. Assim o
    -- histórico nunca tem quantidades negativas ambíguas.
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),

    reason TEXT,
    reference_type TEXT
        CHECK (reference_type IS NULL OR reference_type IN (
            'COMPRA', 'POS', 'MANUTENCAO', 'LAVANDARIA', 'INVENTARIO', 'PERDA'
        )),
    reference_id UUID,
    balance_after NUMERIC(14, 3),

    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_item_idx
    ON public.inventory_movements (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_tenant_idx
    ON public.inventory_movements (tenant_id, created_at DESC);

-- O saldo e o preço médio são SEMPRE derivados dos movimentos. Um cliente que
-- escreva `current_stock` diretamente não tem como: a coluna é recalculada em
-- cada movimento e o rasto fica completo.
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    item_row RECORD;
    delta NUMERIC(14, 3);
    new_stock NUMERIC(14, 3);
    new_average NUMERIC(14, 4);
BEGIN
    SELECT * INTO item_row
    FROM public.inventory_items
    WHERE id = NEW.item_id
    FOR UPDATE;

    IF item_row IS NULL THEN
        RAISE EXCEPTION 'Artigo de stock inexistente: %', NEW.item_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF item_row.tenant_id <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Movimento de stock entre tenants é proibido'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Entrada e inventário aumentam; os restantes Diminuem.
    IF NEW.movement_type IN ('ENTRADA', 'INVENTARIO') THEN
        delta := NEW.quantity;
    ELSE
        delta := -NEW.quantity;
    END IF;

    new_stock := item_row.current_stock + delta;

    IF new_stock < 0 THEN
        RAISE EXCEPTION
            'Stock insuficiente em %: disponível %, pedido %',
            item_row.name, item_row.current_stock, NEW.quantity
            USING ERRCODE = 'check_violation';
    END IF;

    -- Preço médio ponderado, só recalculado em entradas.
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND NEW.movement_type = 'ENTRADA' THEN
        IF item_row.current_stock > 0 AND item_row.average_cost > 0 THEN
            new_average := (
                (item_row.current_stock * item_row.average_cost) + (NEW.quantity * NEW.unit_cost)
            ) / new_stock;
        ELSE
            new_average := NEW.unit_cost;
        END IF;
    ELSE
        new_average := item_row.average_cost;
    END IF;

    UPDATE public.inventory_items
    SET current_stock = new_stock,
        average_cost = ROUND(new_average, 2),
        last_restock_at = CASE
            WHEN NEW.movement_type = 'ENTRADA' THEN now()
            ELSE last_restock_at
        END,
        updated_at = now()
    WHERE id = NEW.item_id;

    NEW.balance_after := new_stock;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS inventory_movements_apply ON public.inventory_movements;
CREATE TRIGGER inventory_movements_apply
    BEFORE INSERT ON public.inventory_movements
    FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ── 4. Caixa ──────────────────────────────────────────────────────────────
-- Abertura e fecho por turno, com o dinheiro declarado por meio de pagamento.
-- É a fonte primária do painel executivo de fluxo de caixa.
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    session_number TEXT NOT NULL,
    opened_by UUID,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by UUID,
    closed_at TIMESTAMPTZ,

    -- Fundos com que a caixa abriu, por método.
    opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),

    -- Contagens declaradas no fecho.
    closing_cash NUMERIC(12, 2) CHECK (closing_cash IS NULL OR closing_cash >= 0),
    expected_cash NUMERIC(12, 2),
    difference NUMERIC(12, 2),

    -- Totais apurados pelo sistema a partir de `pos_orders`, para comparação.
    system_multicaixa NUMERIC(12, 2) NOT NULL DEFAULT 0,
    system_tpa NUMERIC(12, 2) NOT NULL DEFAULT 0,
    system_transfer NUMERIC(12, 2) NOT NULL DEFAULT 0,
    system_room_charge NUMERIC(12, 2) NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA', 'ANULADA')),
    notes TEXT,

    CONSTRAINT cash_sessions_number_tenant_uq UNIQUE (tenant_id, session_number),
    CONSTRAINT cash_sessions_closure_chk CHECK ((status = 'ABERTA') = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS cash_sessions_tenant_idx
    ON public.cash_sessions (tenant_id, opened_at DESC);

-- Uma caixa aberta por tenant impede uma segunda aberta. Índices únicos
-- parciais resolvem sem trigger.
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_uq
    ON public.cash_sessions (tenant_id)
    WHERE status = 'ABERTA';

-- Ao fechar, calcula a diferença entre o declarado e o esperado.
CREATE OR REPLACE FUNCTION public.close_cash_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'ABERTA' AND NEW.status = 'FECHADA' THEN
        IF NEW.closing_cash IS NULL THEN
            RAISE EXCEPTION 'O fecho de caixa exige a contagem de dinheiro'
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_multicaixa
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'MULTICAIXA_EXPRESS'
          AND o.status = 'PAGA'
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_tpa
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'TPA'
          AND o.status = 'PAGA'
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_transfer
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'TRANSFERENCIA'
          AND o.status = 'PAGA'
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_room_charge
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'CONTA_DO_QUARTO'
          AND o.status IN ('FECHADA', 'PAGA')
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        -- Para vendas em dinheiro o esperado é a abertura mais o que entrou em
        -- numerário. Multicaixa, TPA e transferências entram por terminal, não
        -- na gaveta, e ficam registados em separado.
        NEW.expected_cash := NEW.opening_cash + (
            SELECT COALESCE(SUM(o.total), 0)
            FROM public.pos_orders o
            WHERE o.tenant_id = NEW.tenant_id
              AND o.payment_method = 'DINHEIRO'
              AND o.status = 'PAGA'
              AND o.closed_at >= NEW.opened_at
              AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at)
        );

        NEW.difference := NEW.closing_cash - NEW.expected_cash;

        IF NEW.closed_at IS NULL THEN
            NEW.closed_at := now();
        END IF;
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cash_sessions_close ON public.cash_sessions;
CREATE TRIGGER cash_sessions_close
    BEFORE UPDATE OF status ON public.cash_sessions
    FOR EACH ROW EXECUTE FUNCTION public.close_cash_session();

-- ── 5. Rastro de auditoria ────────────────────────────────────────────────
-- Num produto comercializável é preciso responder "quem mudou o quê, quando e
-- em que hotel". Escrito por trigger, não pela aplicação, para que nenhuma
-- rota de código o contorne.
CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    actor_id UUID,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_table TEXT NOT NULL,
    entity_id TEXT,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_audit_log_tenant_idx
    ON public.tenant_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_audit_log_entity_idx
    ON public.tenant_audit_log (tenant_id, entity_table, entity_id);

CREATE OR REPLACE FUNCTION public.write_tenant_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    row_id TEXT;
BEGIN
    row_id := COALESCE(
        (NEW.id::text),
        (OLD.id::text)
    );

    INSERT INTO public.tenant_audit_log (
        tenant_id, actor_id, actor_role, action, entity_table,
        entity_id, before_data, after_data
    )
    VALUES (
        COALESCE(
            (SELECT p.tenant_id FROM public.hr_current_profile() AS p),
            (NEW.tenant_id),
            (OLD.tenant_id)
        ),
        (SELECT auth.uid()),
        (SELECT p.role FROM public.hr_current_profile() AS p),
        TG_OP,
        TG_TABLE_NAME,
        row_id,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    RETURN COALESCE(NEW, OLD);
END
$$;

-- Auditoria nas operações sensíveis. `tenant_bank_accounts` fica de fora de
-- propósito: guardar o IBAN e o resto da linha em texto simples duplicaria um
-- dado de pagamento sem necessidade.
DO $$
DECLARE
    audit_table TEXT;
BEGIN
    FOREACH audit_table IN ARRAY ARRAY[
        'guest_profiles', 'payment_proofs',
        'pos_orders', 'pos_order_items',
        'inventory_movements', 'cash_sessions'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', audit_table || '_audit', audit_table);
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.write_tenant_audit()',
            audit_table || '_audit', audit_table
        );
    END LOOP;
END
$$;

-- ── 6. RLS e privilégios ──────────────────────────────────────────────────
ALTER TABLE public.pos_tables           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_log     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'pos_tables', 'pos_products', 'pos_orders', 'pos_order_items',
              'inventory_items', 'inventory_movements', 'cash_sessions',
              'tenant_audit_log'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            policy_row.policyname, policy_row.schemaname, policy_row.tablename
        );
    END LOOP;
END
$$;

REVOKE ALL ON TABLE public.pos_tables          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_products        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_orders          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_order_items     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_items     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cash_sessions       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_audit_log    FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.pos_tables          TO service_role;
GRANT ALL ON TABLE public.pos_products        TO service_role;
GRANT ALL ON TABLE public.pos_orders          TO service_role;
GRANT ALL ON TABLE public.pos_order_items     TO service_role;
GRANT ALL ON TABLE public.inventory_items     TO service_role;
GRANT ALL ON TABLE public.inventory_movements TO service_role;
GRANT ALL ON TABLE public.cash_sessions       TO service_role;
GRANT ALL ON TABLE public.tenant_audit_log    TO service_role;

-- O módulo POS não dá dinheiro ao `anon`. O `anon` fica sem qualquer acesso.
GRANT SELECT ON TABLE public.pos_tables   TO authenticated;
GRANT SELECT ON TABLE public.pos_products TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.pos_orders, public.pos_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.inventory_items, public.inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.cash_sessions TO authenticated;
GRANT SELECT ON TABLE public.tenant_audit_log TO authenticated;

-- Mesas e produtos: leitura em todo o tenant, escrita por quem opera o POS.
CREATE POLICY pos_tables_read
    ON public.pos_tables FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY pos_tables_write
    ON public.pos_tables FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

CREATE POLICY pos_products_read
    ON public.pos_products FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY pos_products_write
    ON public.pos_products FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

-- O `EXECUTIVO` lê, e é tudo o que faz: não há policy de escrita para ele.
CREATE POLICY pos_orders_read
    ON public.pos_orders FOR SELECT TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_module('pos'))
    );

CREATE POLICY pos_orders_write
    ON public.pos_orders FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

CREATE POLICY pos_order_items_read
    ON public.pos_order_items FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY pos_order_items_write
    ON public.pos_order_items FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

CREATE POLICY inventory_items_read
    ON public.inventory_items FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY inventory_items_write
    ON public.inventory_items FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    );

-- O POS consome stock, por isso precisa de inserir movimentos. Não precisa de
-- mexer no artigo: o saldo é do trigger.
CREATE POLICY inventory_movements_read
    ON public.inventory_movements FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY inventory_movements_insert_pos
    ON public.inventory_movements FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            (SELECT public.hr_can_write_module('economato'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

CREATE POLICY inventory_movements_write_economato
    ON public.inventory_movements FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    );

CREATE POLICY cash_sessions_read
    ON public.cash_sessions FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY cash_sessions_write
    ON public.cash_sessions FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

-- Auditoria: leitura para quem lê o tenant, escrita apenas por trigger
-- SECURITY DEFINER. Consequentemente nenhuma policy de INSERT/UPDATE/DELETE.
CREATE POLICY tenant_audit_log_read
    ON public.tenant_audit_log FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

COMMIT;

INSERT INTO public._schema_migrations (version, name)
VALUES ('008', '008_pos_inventory_cash.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/009_public_site_access.sql ================
-- =====================================================================
-- 009 — Acesso público do site Hotel Lukweku (Vercel)
-- =====================================================================
-- O site vitrine corre no browser de visitantes NÃO autenticados, por isso
-- precisa de duas coisas que a 005/006 deliberadamente não davam a `anon`:
--
--   1. LER o mapa de quartos (só os DISPONIVEL, só do Lukweku);
--   2. CRIAR reservas em `hotel_reservations`.
--
-- Nada disto abre a área de gestão: `anon` continua sem SELECT em
-- `hotel_reservations` (dados de hóspedes), sem UPDATE/DELETE em nenhuma
-- tabela e sem acesso a `app_users`, `tenants`, POS ou financeiro.
--
-- Idempotente — seguro de re-executar.
-- =====================================================================

-- ── 1. Mapa de quartos em anon ───────────────────────────────────────
-- A política `rooms_select_public_catalog` (status = 'DISPONIVEL') já existe
-- desde a 005, mas a 006 revogou o GRANT da tabela — política sem privilégio
-- devolve 42501. Reinstalamos o privilégio e apertamos a política para o
-- tenant do hotel: o projecto B guarda quartos de um segundo tenant
-- (22222222-…) que nunca pode aparecer no site público.
GRANT SELECT ON TABLE public.hotel_rooms TO anon;

DROP POLICY IF EXISTS rooms_select_public_catalog ON public.hotel_rooms;
CREATE POLICY rooms_select_public_catalog ON public.hotel_rooms
    FOR SELECT
    TO anon
    USING (
        status = 'DISPONIVEL'::hotel_room_status
        AND tenant_id = '11111111-1111-1111-1111-111111111111'
    );

-- ── 2. Contacto telefónico do hóspede ────────────────────────────────
-- O formulário público recolhe `guest_phone`. A tabela não tinha a coluna
-- (`email` é o contacto escrito que a 001 definiu); nullable para não
-- tocar em nenhuma linha existente e para não obrigar as apps.
ALTER TABLE public.hotel_reservations
    ADD COLUMN IF NOT EXISTS guest_phone TEXT;

-- ── 3. Referência da reserva tem de correr como owner ────────────────
-- `hr_reservation_reference()` faz um SELECT sobre a própria tabela para
-- garantir que o candidato 'LKW-2026-A1B2C3' é único. Como trigger comum
-- ele herda as permissões de quem dispara o INSERT, e `anon` não tem
-- SELECT em `hotel_reservations` — o INSERT público morreria com 42501.
-- SECURITY DEFINER resolve-o sem conceder SELECT a ninguém.
CREATE OR REPLACE FUNCTION public.hr_reservation_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    candidate TEXT;
BEGIN
    IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN
        RETURN NEW;
    END IF;

    LOOP
        candidate := 'LKW-' || to_char(now(), 'YYYY') || '-' ||
                     upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.hotel_reservations r WHERE r.reference = candidate
        );
    END LOOP;

    NEW.reference := candidate;
    RETURN NEW;
END;
$$;

-- ── 4. Reserva pública vinda do site ─────────────────────────────────
-- O visitante só INSERT: não lê, não altera, não apaga. A política obriga
-- ao tenant do hotel, ao estado inicial e a dados plausíveis; os CHECKs da
-- tabela continuam a validar `service_type` e `status` por cima disto.
GRANT INSERT ON TABLE public.hotel_reservations TO anon;

DROP POLICY IF EXISTS reservations_insert_public_site ON public.hotel_reservations;
CREATE POLICY reservations_insert_public_site ON public.hotel_reservations
    FOR INSERT
    TO anon
    WITH CHECK (
        tenant_id = '11111111-1111-1111-1111-111111111111'
        AND status = 'PENDENTE_PAGAMENTO'
        AND service_type IN (
            'quarto', 'piscina', 'evento', 'lavandaria',
            'conferencia', 'restaurante', 'transfer'
        )
        AND length(btrim(guest_name)) BETWEEN 2 AND 200
        AND email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]{2,}$'
        AND (guest_phone IS NULL
             OR guest_phone ~ '^[+0-9()][0-9 ()+-]{4,19}$')
        AND (check_in_date IS NULL
             OR check_out_date IS NULL
             OR check_out_date >= check_in_date)
        AND COALESCE(total_amount, 0) >= 0
        AND guest_profile_id IS NULL
    );

-- Sem UPDATE e sem DELETE para `anon`: uma reserva pública só entra.

-- ── 5. Registo da versão ──────────────────────────────────────────────
-- Idempotente: o bundle da 001..008 grava o mesmo par e ignora o conflito.
INSERT INTO public._schema_migrations (version, name)
VALUES ('009', '009_public_site_access.sql')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public._schema_migrations (version, name)
VALUES ('009', '009_public_site_access.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/010_master_global_licensing.sql ================
-- =====================================================================
-- 010 — Módulo Master Global: licenças, tipologia da empresa,
--       permissões granulares (RBAC) e módulo financeiro
-- =====================================================================
-- ÂMBITO
--   1. `tenants` ganha a identidade comercial da propriedade: razão social,
--      NIF, morada, contactos, logótipo, TIPologia (HOTEL/HOSPEDARIA/
--      RESORT/COMPLEXO) e catálogo de SERVIÇOS activos (JSONB).
--   2. `app_users` ganha `is_master_global` (Master Global, acesso
--      vitalício) e `permissions` (RBAC granular multi-funções).
--   3. `system_licenses` — histórico de licenças por instância, com chave
--      emitida, hash de verificação, tipo, janela de validade e carência.
--   4. `daily_expenses` + `financial_transactions` — entradas (POS e
--      diárias) e saídas (despesas) consolidadas num razão único.
--   5. RLS, privilégios, realtime e seeds.
--
-- DECISÕES DE MODELAGEM
--   * O MÚLTIPLO IBAN NÃO é uma coluna JSONB nova: `tenant_bank_accounts`
--     (migração 007) já modela N contas por hotel com `is_primary` e já é
--     consumida pela app de hóspedes. Duplicar o dado num `ibans JSONB`
--     criaria duas fontes de verdade para o mesmo pagamento.
--   * O razão financeiro é RECONSTRUÍDO por `hr_sync_financial_entries()`
--     em vez de triggers sobre `pos_orders`/`hotel_reservations`: uma
--     função idempotente não arrisca partir o fluxo de pagamento do POS e
--     corrige sozinha quaisquer divergências.
--   * Uma instância SEM nenhuma licença registada NÃO é bloqueada
--     (`effective_status = 'SEM_LICENCA'`, `is_expired = false`). O
--     bloqueio só começa a existir quando há uma licença registada e ela
--     caduca — evita fechar em produção todas as instâncias no momento em
--     que a migração corre.
--
-- Idempotente — seguro de re-executar.
-- =====================================================================

-- ── 1. Identidade e tipologia da propriedade (tenants) ───────────────
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS company_name TEXT;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS tax_id TEXT;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS property_type TEXT
        CONSTRAINT tenants_property_type_chk
        CHECK (property_type IS NULL OR property_type IN
               ('HOTEL', 'HOSPEDARIA', 'RESORT', 'COMPLEXO'));

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS active_services JSONB
        CONSTRAINT tenants_active_services_chk
        CHECK (active_services IS NULL OR jsonb_typeof(active_services) = 'array');

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Master Global e permissões granulares (app_users) ─────────────
-- `is_master_global` só é escrito pela migração/seed: nunca pelo painel,
-- para que nenhum administrador de instância possa promover-se.
ALTER TABLE public.app_users
    ADD COLUMN IF NOT EXISTS is_master_global BOOLEAN NOT NULL DEFAULT FALSE
        CONSTRAINT app_users_master_global_chk
        CHECK (is_master_global = FALSE OR role = 'ADMINISTRATOR');

-- RBAC multi-funções: o MESMO funcionário pode ser, simultaneamente,
-- Caixa, Bar e lançador de Despesas. Lista vazia = sem âmbito granular
-- (comportamento herdado, que é o estado de todos os perfis existentes).
ALTER TABLE public.app_users
    ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'
        CONSTRAINT app_users_permissions_chk
        CHECK (jsonb_typeof(permissions) = 'array');

-- REPARO da 007: ela só cria `app_users_role_check` quando ele NÃO existe,
-- por isso numa instância nova o constraint de 3 papéis da 002 sobrevivia e
-- impedia a criação de perfis `POS` e `EXECUTIVO` (falhava com 23514). Em
-- produção o projecto legado não tinha o constraint, e por isso nunca se
-- viu. Reinstalamos a lista completa de forma idempotente.
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users
    ADD CONSTRAINT app_users_role_check
    CHECK (role IN ('ADMINISTRATOR', 'PERMISSAO', 'ACESSO', 'POS', 'EXECUTIVO'));

CREATE INDEX IF NOT EXISTS idx_app_users_master_global
    ON public.app_users (tenant_id)
    WHERE is_master_global;

-- ── 3. Licenças das instâncias ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

    -- Chave humana/QR (ex.: HR-ANNUAL-8F3A2C91B47E) e o respectivo
    -- SHA-256 com o tenant embutido, para verificação offline sem
    -- confiar no texto apresentado.
    license_key TEXT NOT NULL,
    license_key_hash TEXT NOT NULL,

    license_type TEXT NOT NULL DEFAULT 'TRAINING_GRACE'
        CHECK (license_type IN
               ('TRAINING_GRACE', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')),
    status TEXT NOT NULL DEFAULT 'GRACE_PERIOD'
        CHECK (status IN ('ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED')),

    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Carência posterior à validade. A coluna defaulta a 60 dias (formação),
    -- mas a emissão de licenças pagas atribui 0, salvo indicação em contrário.
    grace_period_days INT NOT NULL DEFAULT 60 CHECK (grace_period_days >= 0),
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,

    issued_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT system_licenses_key_uq UNIQUE (license_key),
    CONSTRAINT system_licenses_window_chk CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS system_licenses_tenant_idx
    ON public.system_licenses (tenant_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS system_licenses_type_idx
    ON public.system_licenses (license_type, status);

CREATE OR REPLACE FUNCTION public.set_system_licenses_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_licenses_set_updated_at ON public.system_licenses;
CREATE TRIGGER system_licenses_set_updated_at
    BEFORE UPDATE ON public.system_licenses
    FOR EACH ROW EXECUTE FUNCTION public.set_system_licenses_updated_at();

-- ── 4. Helpers de autorização ────────────────────────────────────────
-- Verdadeiro para o utilizador Master Global. SECURITY DEFINER + search_path
-- vazio: não pode ser contornado por RLS e não recursa em `app_users`.
CREATE OR REPLACE FUNCTION public.hr_is_master_global()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT au.is_master_global
            FROM public.app_users AS au
            WHERE au.auth_user_id = (SELECT auth.uid())
              AND au.status = 'ATIVO'
            LIMIT 1
        ),
        FALSE
    )
$$;

-- Permissão granular por módulo. Lista vazia = sem restrição granular,
-- para que os perfis já existentes continuem a comportar-se como antes.
CREATE OR REPLACE FUNCTION public.hr_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT NOT EXISTS (
                SELECT 1
                FROM public.app_users AS au
                JOIN public.hr_current_profile() AS p ON p.profile_id = au.id
                WHERE jsonb_array_length(
                        CASE WHEN jsonb_typeof(au.permissions) = 'array'
                             THEN au.permissions ELSE '[]'::jsonb END
                      ) > 0
                  AND NOT EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements_text(
                          CASE WHEN jsonb_typeof(au.permissions) = 'array'
                               THEN au.permissions ELSE '[]'::jsonb END
                      ) AS granted(value)
                      WHERE granted.value = p_permission
                  )
            )
        ),
        TRUE
    )
$$;

-- ── 5. Estado da licença da instância ────────────────────────────────
-- Devolve tudo o que a app precisa para decidir se bloqueia o acesso.
CREATE OR REPLACE FUNCTION public.hr_license_state()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH latest AS (
        SELECT sl.*
        FROM public.system_licenses AS sl
        WHERE sl.tenant_id = (SELECT public.hr_tenant_id())
        ORDER BY sl.expires_at DESC, sl.created_at DESC
        LIMIT 1
    )
    SELECT COALESCE(
        (
            SELECT jsonb_build_object(
                'has_license', TRUE,
                'license_key', l.license_key,
                'license_type', l.license_type,
                'status', l.status,
                'starts_at', l.starts_at,
                'expires_at', l.expires_at,
                'grace_period_days', l.grace_period_days,
                'is_paid', l.is_paid,
                'days_left', floor(extract(epoch FROM (l.expires_at - now())) / 86400)::int,
                'effective_status', CASE
                    WHEN l.status = 'SUSPENDED' THEN 'SUSPENDED'
                    WHEN now() > l.expires_at + make_interval(days => l.grace_period_days)
                        THEN 'EXPIRED'
                    WHEN now() > l.expires_at THEN 'GRACE_PERIOD'
                    WHEN l.license_type = 'TRAINING_GRACE' THEN 'GRACE_PERIOD'
                    ELSE 'ACTIVE'
                END,
                'is_expired', CASE
                    WHEN l.status = 'SUSPENDED' THEN TRUE
                    WHEN now() > l.expires_at + make_interval(days => l.grace_period_days)
                        THEN TRUE
                    ELSE FALSE
                END
            )
            FROM latest AS l
        ),
        jsonb_build_object(
            'has_license', FALSE,
            'license_key', NULL,
            'license_type', NULL,
            'status', 'SEM_LICENCA',
            'effective_status', 'SEM_LICENCA',
            'is_expired', FALSE,
            'days_left', NULL
        )
    )
$$;

-- ── 6. Emissão de licenças (só o Master Global) ──────────────────────
CREATE OR REPLACE FUNCTION public.hr_issue_license(
    p_tenant_id UUID,
    p_license_type TEXT DEFAULT 'TRAINING_GRACE',
    p_days INT DEFAULT NULL,
    p_grace_days INT DEFAULT NULL,
    p_is_paid BOOLEAN DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_type TEXT;
    v_short TEXT;
    v_days INT;
    v_grace INT;
    v_paid BOOLEAN;
    v_key TEXT;
    v_hash TEXT;
    v_row_id UUID;
    v_expires TIMESTAMPTZ;
    v_status TEXT;
    v_attempt INT;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Instância (tenant) não indicada.';
    END IF;

    IF NOT (SELECT public.hr_is_master_global()) THEN
        RAISE EXCEPTION 'Apenas o Utilizador Master Global pode emitir licenças.';
    END IF;

    v_type := upper(btrim(COALESCE(p_license_type, 'TRAINING_GRACE')));
    IF v_type NOT IN ('TRAINING_GRACE', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL') THEN
        RAISE EXCEPTION 'Tipo de licença inválido: %', v_type;
    END IF;

    -- Duração por tipo quando o operador não impõe um prazo próprio.
    v_days := COALESCE(p_days, CASE v_type
        WHEN 'TRAINING_GRACE' THEN 60
        WHEN 'MONTHLY'        THEN 30
        WHEN 'QUARTERLY'      THEN 90
        WHEN 'SEMI_ANNUAL'    THEN 180
        WHEN 'ANNUAL'         THEN 365
        ELSE 30
    END);

    IF v_days < 1 OR v_days > 3650 THEN
        RAISE EXCEPTION 'Prazo de licença inválido: % dias.', v_days;
    END IF;

    -- Carência: 60 dias na formação, 0 nas licenças pagas.
    v_grace := COALESCE(p_grace_days, CASE WHEN v_type = 'TRAINING_GRACE' THEN 60 ELSE 0 END);
    IF v_grace < 0 OR v_grace > 365 THEN
        RAISE EXCEPTION 'Carência inválida: % dias.', v_grace;
    END IF;

    v_paid := COALESCE(p_is_paid, v_type <> 'TRAINING_GRACE');
    v_short := CASE v_type
        WHEN 'TRAINING_GRACE' THEN 'GRACE'
        WHEN 'MONTHLY'        THEN 'M'
        WHEN 'QUARTERLY'      THEN 'Q'
        WHEN 'SEMI_ANNUAL'    THEN 'SA'
        WHEN 'ANNUAL'         THEN 'A'
        ELSE 'M'
    END;

    v_key := '';
    FOR v_attempt IN 1..8 LOOP
        v_key := 'HR-' || v_short || '-' ||
                 upper(substr(md5(random()::text || clock_timestamp()::text ||
                                  p_tenant_id::text || v_attempt::text), 1, 12));
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.system_licenses AS sl WHERE sl.license_key = v_key
        );
    END LOOP;

    v_hash := encode(sha256(convert_to(v_key || ':' || p_tenant_id::text, 'UTF8')), 'hex');
    v_status := CASE WHEN v_paid THEN 'ACTIVE' ELSE 'GRACE_PERIOD' END;
    v_expires := now() + make_interval(days => v_days);

    INSERT INTO public.system_licenses (
        tenant_id, license_key, license_key_hash, license_type, status,
        starts_at, expires_at, grace_period_days, is_paid, issued_by, notes
    ) VALUES (
        p_tenant_id, v_key, v_hash, v_type, v_status,
        now(), v_expires, v_grace, v_paid, (SELECT auth.uid()), p_notes
    )
    RETURNING id INTO v_row_id;

    RETURN jsonb_build_object(
        'id', v_row_id,
        'tenant_id', p_tenant_id,
        'license_key', v_key,
        'license_key_hash', v_hash,
        'license_type', v_type,
        'status', v_status,
        'starts_at', now(),
        'expires_at', v_expires,
        'grace_period_days', v_grace,
        'is_paid', v_paid,
        'days', v_days
    );
END;
$$;

-- ── 7. Módulo financeiro: despesas diárias ───────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'OUTRO'
        CHECK (category IN (
            'FORNECEDOR', 'MANUTENCAO', 'COMPRA', 'SANGRIA', 'SERVICOS',
            'SALARIOS', 'IMPOSTOS', 'TRANSPORTE', 'ENERGIA', 'OUTRO'
        )),
    description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 300),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL DEFAULT 'NUMERARIO'
        CHECK (payment_method IN (
            'NUMERARIO', 'TPA', 'MULTICAIXA_EXPRESS', 'TRANSFERENCIA', 'IBAN'
        )),
    supplier TEXT,
    receipt_url TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_expenses_tenant_idx
    ON public.daily_expenses (tenant_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS daily_expenses_category_idx
    ON public.daily_expenses (tenant_id, category, expense_date DESC);

CREATE OR REPLACE FUNCTION public.set_daily_expenses_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_expenses_set_updated_at ON public.daily_expenses;
CREATE TRIGGER daily_expenses_set_updated_at
    BEFORE UPDATE ON public.daily_expenses
    FOR EACH ROW EXECUTE FUNCTION public.set_daily_expenses_updated_at();

-- ── 8. Módulo financeiro: razão consolidado ──────────────────────────
-- Uma linha por movimento. `source` diz de onde veio o dinheiro:
--   POS      vendas liquidadas (comandas com status PAGA)
--   DIARIA   reservas confirmadas/pagas
--   DESPESA  espelho de uma linha de `daily_expenses`
--   MANUAL   ajustes introduzidos pelo utilizador
CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('ENTRADA', 'SAIDA')),
    source TEXT NOT NULL CHECK (source IN ('POS', 'DIARIA', 'DESPESA', 'MANUAL')),
    source_id UUID NOT NULL,
    category TEXT NOT NULL DEFAULT 'OUTRO',
    description TEXT NOT NULL DEFAULT '',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    payment_method TEXT,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT financial_transactions_source_uq UNIQUE (tenant_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS financial_transactions_tenant_idx
    ON public.financial_transactions (tenant_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS financial_transactions_date_idx
    ON public.financial_transactions (tenant_id, direction, transaction_date);

-- Lançamentos MANUAIS não trazem `source_id` de origem: a própria linha
-- serve de chave. O default do `id` já está aplicado antes dos BEFORE.
CREATE OR REPLACE FUNCTION public.financial_transactions_fill_source_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.source_id IS NULL THEN
        NEW.source_id := NEW.id;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_transactions_fill_source_id
    ON public.financial_transactions;
CREATE TRIGGER financial_transactions_fill_source_id
    BEFORE INSERT OR UPDATE ON public.financial_transactions
    FOR EACH ROW EXECUTE FUNCTION public.financial_transactions_fill_source_id();

-- ── 9. Consolidação idempotente ──────────────────────────────────────
-- Reconstrói as três fontes sincronizadas do razão para um tenant.
-- Apagar-e-repor torna a função à prova de divergências (uma comanda que
-- deixou de estar PAGA, uma despesa editada, uma reserva cancelada) e
-- de re-execução. Os lançamentos MANUAL nunca são tocados.
CREATE OR REPLACE FUNCTION public.hr_sync_financial_entries(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant UUID;
    v_pos INT := 0;
    v_diarias INT := 0;
    v_despesas INT := 0;
BEGIN
    v_tenant := COALESCE(p_tenant_id, (SELECT public.hr_tenant_id()));

    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Instância (tenant) não determinada.';
    END IF;

    IF NOT (
        (SELECT public.hr_is_master_global())
        OR v_tenant = (SELECT public.hr_tenant_id())
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta instância.';
    END IF;

    DELETE FROM public.financial_transactions
    WHERE tenant_id = v_tenant
      AND source IN ('POS', 'DIARIA', 'DESPESA');

    -- Entradas: comandas pagas.
    INSERT INTO public.financial_transactions (
        tenant_id, direction, source, source_id, category, description,
        amount, payment_method, transaction_date, recorded_by
    )
    SELECT
        o.tenant_id, 'ENTRADA', 'POS', o.id, 'POS',
        'Comanda ' || o.order_number ||
            CASE WHEN o.customer_name IS NOT NULL THEN ' — ' || o.customer_name ELSE '' END,
        o.total,
        COALESCE(o.payment_method, 'NUMERARIO'),
        COALESCE(o.closed_at, o.opened_at)::date,
        o.closed_by
    FROM public.pos_orders AS o
    WHERE o.tenant_id = v_tenant
      AND o.status = 'PAGA'
      AND o.total > 0;
    GET DIAGNOSTICS v_pos = ROW_COUNT;

    -- Entradas: reservas confirmadas com valor.
    INSERT INTO public.financial_transactions (
        tenant_id, direction, source, source_id, category, description,
        amount, payment_method, transaction_date, recorded_by
    )
    SELECT
        r.tenant_id, 'ENTRADA', 'DIARIA', r.id, 'DIARIA',
        'Diária ' || COALESCE(r.reference, r.guest_name) ||
            CASE WHEN r.room_number IS NOT NULL THEN ' — quarto ' || r.room_number ELSE '' END,
        r.total_amount,
        'TRANSFERENCIA',
        COALESCE(r.reservation_date, r.created_at::date),
        NULL
    FROM public.hotel_reservations AS r
    WHERE r.tenant_id = v_tenant
      AND r.status IN ('CONFIRMADA', 'CHECKED_IN', 'CHECKED_OUT')
      AND COALESCE(r.total_amount, 0) > 0;
    GET DIAGNOSTICS v_diarias = ROW_COUNT;

    -- Saídas: despesas registadas.
    INSERT INTO public.financial_transactions (
        tenant_id, direction, source, source_id, category, description,
        amount, payment_method, transaction_date, recorded_by
    )
    SELECT
        d.tenant_id, 'SAIDA', 'DESPESA', d.id, d.category,
        d.description ||
            CASE WHEN d.supplier IS NOT NULL THEN ' — ' || d.supplier ELSE '' END,
        d.amount,
        d.payment_method,
        d.expense_date,
        d.created_by
    FROM public.daily_expenses AS d
    WHERE d.tenant_id = v_tenant;
    GET DIAGNOSTICS v_despesas = ROW_COUNT;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant,
        'pos', v_pos,
        'diarias', v_diarias,
        'despesas', v_despesas,
        'synced_at', now()
    );
END;
$$;

-- ── 10. Rastreabilidade ──────────────────────────────────────────────
-- Despesas e licenças são exactamente o tipo de alteração que um relatório
-- de auditoria tem de conseguir explicar. Escrito por trigger, como na 008.
DO $$
DECLARE
    audit_table TEXT;
BEGIN
    FOREACH audit_table IN ARRAY ARRAY['daily_expenses', 'system_licenses']
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS audit_%I ON public.%I',
            audit_table, audit_table
        );
        EXECUTE format(
            'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I ' ||
            'FOR EACH ROW EXECUTE FUNCTION public.write_tenant_audit()',
            audit_table, audit_table
        );
    END LOOP;
END
$$;

-- ── 11. RLS e privilégios ────────────────────────────────────────────
ALTER TABLE public.system_licenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_licenses        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_expenses         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.financial_transactions FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.system_licenses        TO service_role;
GRANT ALL ON TABLE public.daily_expenses         TO service_role;
GRANT ALL ON TABLE public.financial_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_licenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_expenses  TO authenticated;
-- O razão só se lê: é reconstruído por função SECURITY DEFINER.
GRANT SELECT ON TABLE public.financial_transactions TO authenticated;

-- Licenças: lê o próprio tenant; escreve apenas o Master Global.
DROP POLICY IF EXISTS system_licenses_select ON public.system_licenses;
CREATE POLICY system_licenses_select
    ON public.system_licenses
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        OR (SELECT public.hr_is_master_global())
    );

DROP POLICY IF EXISTS system_licenses_write_master ON public.system_licenses;
CREATE POLICY system_licenses_write_master
    ON public.system_licenses
    FOR ALL
    TO authenticated
    USING ((SELECT public.hr_is_master_global()))
    WITH CHECK ((SELECT public.hr_is_master_global()));

-- Despesas: leitura de todo o tenant (o dono precisa de ver os relatórios),
-- escrita por quem opera o módulo financeiro E tem a permissão granular.
DROP POLICY IF EXISTS daily_expenses_select ON public.daily_expenses;
CREATE POLICY daily_expenses_select
    ON public.daily_expenses
    FOR SELECT
    TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

DROP POLICY IF EXISTS daily_expenses_write ON public.daily_expenses;
CREATE POLICY daily_expenses_write
    ON public.daily_expenses
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('financeiro'))
        AND (SELECT public.hr_has_permission('financial'))
    );

DROP POLICY IF EXISTS daily_expenses_update ON public.daily_expenses;
CREATE POLICY daily_expenses_update
    ON public.daily_expenses
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('financeiro'))
        AND (SELECT public.hr_has_permission('financial'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('financeiro'))
        AND (SELECT public.hr_has_permission('financial'))
    );

DROP POLICY IF EXISTS daily_expenses_delete ON public.daily_expenses;
CREATE POLICY daily_expenses_delete
    ON public.daily_expenses
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_admin())
        AND (SELECT public.hr_has_permission('financial'))
    );

DROP POLICY IF EXISTS financial_transactions_select ON public.financial_transactions;
CREATE POLICY financial_transactions_select
    ON public.financial_transactions
    FOR SELECT
    TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

-- O Master Global lê todas as instâncias (a lista de licenças) e pode
-- criar/actualizar a identidade de uma nova instância. Os administradores
-- locais continuam presos ao próprio tenant pela política de SELECT da 005.
GRANT INSERT, UPDATE ON TABLE public.tenants TO authenticated;

DROP POLICY IF EXISTS tenants_select_master ON public.tenants;
CREATE POLICY tenants_select_master
    ON public.tenants
    FOR SELECT
    TO authenticated
    USING ((SELECT public.hr_is_master_global()));

DROP POLICY IF EXISTS tenants_insert_master ON public.tenants;
CREATE POLICY tenants_insert_master
    ON public.tenants
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.hr_is_master_global()));

DROP POLICY IF EXISTS tenants_update_company ON public.tenants;
CREATE POLICY tenants_update_company
    ON public.tenants
    FOR UPDATE
    TO authenticated
    USING (
        (id = (SELECT public.hr_tenant_id()) AND (SELECT public.hr_is_admin()))
        OR (SELECT public.hr_is_master_global())
    )
    WITH CHECK (
        (id = (SELECT public.hr_tenant_id()) AND (SELECT public.hr_is_admin()))
        OR (SELECT public.hr_is_master_global())
    );

-- As colunas novas de `app_users` têm de ser concedidas à parte: a migração
-- 005 revogou a tabela toda e voltou a conceder coluna a coluna.
GRANT SELECT (is_master_global, permissions) ON TABLE public.app_users TO authenticated;

-- A 007 concedeu SELECT em `tenant_bank_accounts` coluna a coluna e esqueceu
-- `is_active` (e `tenant_id`/`created_at`/`updated_at`): qualquer query com
-- essas colunas morria com 42501 e a gestão de IBANs estava partida em
-- produção. Concedemos a tabela inteira; a política RLS continua a limitar
-- as linhas ao tenant.
GRANT SELECT ON TABLE public.tenant_bank_accounts TO authenticated;

-- ...e a política de leitura tinha o mesmo defeito: filtrava `is_active`, por
-- isso um IBAN desactivado desaparecia da lista — dava para desactivar, nunca
-- reactivar. A política de escrita nunca teve esse filtro, logo a assimetria
-- era um bug. Passa a ler todo o tenant.
DROP POLICY IF EXISTS bank_accounts_read_tenant ON public.tenant_bank_accounts;
CREATE POLICY bank_accounts_read_tenant
    ON public.tenant_bank_accounts
    FOR SELECT
    TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

REVOKE ALL ON FUNCTION public.hr_is_master_global() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_has_permission(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_license_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_issue_license(UUID, TEXT, INT, INT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_sync_financial_entries(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hr_is_master_global() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_has_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_license_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_issue_license(UUID, TEXT, INT, INT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_sync_financial_entries(UUID) TO authenticated;

-- ── 12. Realtime ─────────────────────────────────────────────────────
-- O App Executivo assina `daily_expenses` e `financial_transactions` para
-- reflectir uma despesa registada no painel sem recarregar.
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_expenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_transactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 13. Seeds e backfill ─────────────────────────────────────────────
-- Promove o utilizador Master Global (perfil criado pelo bundle do seed).
UPDATE public.app_users
SET is_master_global = TRUE,
    updated_at = now()
WHERE id = '9e42e6aa-5155-4440-b368-5972fe391669'
   OR auth_user_id = '9e42e6aa-5155-4440-b368-5972fe391669';

-- Identidade comercial mínima para todas as instâncias existentes.
UPDATE public.tenants
SET company_name    = COALESCE(company_name, name, slug),
    tax_id          = COALESCE(tax_id, 'N/A'),
    property_type   = COALESCE(property_type, 'HOTEL'),
    active_services = CASE
        WHEN active_services IS NULL OR active_services = '[]'::jsonb
        THEN '["ROOMS","BAR","RESTAURANT","POOL","GYM","LAUNDRY","EVENTS"]'::jsonb
        ELSE active_services
    END,
    is_active       = COALESCE(is_active, TRUE)
WHERE company_name IS NULL
   OR tax_id IS NULL
   OR property_type IS NULL
   OR active_services IS NULL
   OR active_services = '[]'::jsonb;

-- Toda a instância instalada tem de arrancar com uma licença válida: sem
-- isto, correr a migração bloqueava imediatamente qualquer instância que
-- já estivesse em produção.
DO $$
DECLARE
    tenant_row RECORD;
    v_key TEXT;
    v_hash TEXT;
BEGIN
    FOR tenant_row IN
        SELECT t.id
        FROM public.tenants AS t
        WHERE NOT EXISTS (
            SELECT 1 FROM public.system_licenses AS sl WHERE sl.tenant_id = t.id
        )
    LOOP
        v_key := 'HR-A-' || upper(substr(md5(tenant_row.id::text || clock_timestamp()::text), 1, 12));
        v_hash := encode(sha256(convert_to(v_key || ':' || tenant_row.id::text, 'UTF8')), 'hex');

        INSERT INTO public.system_licenses (
            tenant_id, license_key, license_key_hash, license_type, status,
            starts_at, expires_at, grace_period_days, is_paid, notes
        ) VALUES (
            tenant_row.id, v_key, v_hash, 'ANNUAL', 'ACTIVE',
            now() - make_interval(days => 1),
            now() + make_interval(days => 365),
            0, TRUE,
            'Licença anual inicial atribuída pela migração 010.'
        );
    END LOOP;
END
$$;

-- ── 14. Registo da versão ────────────────────────────────────────────
-- Idempotente: o bundle da 001..009 grava o mesmo par e ignora o conflito.
INSERT INTO public._schema_migrations (version, name)
VALUES ('010', '010_master_global_licensing.sql')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public._schema_migrations (version, name)
VALUES ('010', '010_master_global_licensing.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/011_guest_ledger_rates_prebill.sql ================
-- ============================================================
-- HR-HOSPITALITY - Migracao 011
-- Catalogo mestre, conta do hospede, tarifas por hora e
-- pre-conta anti-fraude
-- ============================================================
-- Sumario:
--   1. Estado de quarto RESERVADO
--   2. master_products_catalog (global) e vinculos locais
--   3. Regra de stock zero no POS (chave estrangeira + RPC)
--   4. room_rates - tarifa diaria ou por bloco horario
--   5. hourly_billing - sessoes horarias com contagem decrescente
--   6. guest_accounts / guest_order_items - extrato transparente
--   7. pre_bill_logs - pre-conta auditada
--   8. Bloqueio auditado dos itens da comanda
--   9. Funcoes de negocio
--  10. RLS e privilegios
--  11. Realtime
--  12. Seed do catalogo (produtos angolanos e internacionais)
--  13. Registo da versao
--
-- Regra de compatibilidade: nenhum valor novo do enum
-- `hotel_room_status` e consumido dentro desta migracao - o Postgres
-- so liberta o valor depois do commit. Quem atribui RESERVADO e o
-- painel, ja com a migracao aplicada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Estado de quarto RESERVADO
-- ------------------------------------------------------------
-- Livre, Ocupado, Reservado, Limpeza e Manutencao sao os cinco
-- estados do quadro de quartos. O quarto reservado para hoje mas
-- ainda sem check-in fica visivel de amarelo.
DO $$
BEGIN
    IF to_regtype('public.hotel_room_status') IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_enum AS e
        JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'hotel_room_status'
          AND e.enumlabel = 'RESERVADO'
    ) THEN
        ALTER TYPE public.hotel_room_status ADD VALUE 'RESERVADO';
    END IF;
END
$$;


-- ------------------------------------------------------------
-- 2. Catalogo mestre de produtos
-- ------------------------------------------------------------
-- Tabela GLOBAL (sem tenant): e o dicionario partilhado de todas as
-- instancias. Cada propriedade copia o que quiser para os seus
-- `pos_products` / `inventory_items` e ajusta o preco local.
CREATE TABLE IF NOT EXISTS public.master_products_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    -- `kind` alimenta os relatorios (Top Pratos vs Top Bebidas);
    -- `category` usa o mesmo vocabulario do POS para copia 1:1.
    kind TEXT NOT NULL DEFAULT 'OUTRO'
        CHECK (kind IN ('BEBIDA', 'PRATO', 'LANCHE', 'SERVICO', 'OUTRO')),
    category TEXT NOT NULL DEFAULT 'outro'
        CHECK (category IN (
            'BEBIDA', 'COMIDA', 'CAFETERIA', 'SNACK', 'PISCINA',
            'GINASIO', 'LAVANDARIA', 'HOSPEDAGEM', 'outro'
        )),
    unit TEXT NOT NULL DEFAULT 'un',
    suggested_price NUMERIC(12, 2) NOT NULL DEFAULT 0
        CHECK (suggested_price >= 0),
    -- LOCAL = marca ou prato angolano; GLOBAL = marca internacional.
    origin TEXT NOT NULL DEFAULT 'LOCAL'
        CHECK (origin IN ('LOCAL', 'GLOBAL')),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT master_products_catalog_sku_uq UNIQUE (sku),
    CONSTRAINT master_products_catalog_name_ck
        CHECK (length(trim(name)) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS master_products_catalog_kind_idx
    ON public.master_products_catalog (kind, is_active);

CREATE INDEX IF NOT EXISTS master_products_catalog_category_idx
    ON public.master_products_catalog (category, is_active);

CREATE INDEX IF NOT EXISTS master_products_catalog_name_idx
    ON public.master_products_catalog (upper(name));

CREATE OR REPLACE FUNCTION public.set_master_products_catalog_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS master_products_catalog_updated_at
    ON public.master_products_catalog;
CREATE TRIGGER master_products_catalog_updated_at
    BEFORE UPDATE ON public.master_products_catalog
    FOR EACH ROW EXECUTE FUNCTION public.set_master_products_catalog_updated_at();


-- ------------------------------------------------------------
-- 3. Vinculos locais + regra de stock zero
-- ------------------------------------------------------------
-- Cadeia: pos_products -> inventory_items -> master_products_catalog.
-- E o que permite ao POS esconder automaticamente o artigo cujo saldo
-- chegou a zero, mantendo-o visivel na gestao do painel.
ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS master_product_id UUID
        REFERENCES public.master_products_catalog (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_items_master_product_idx
    ON public.inventory_items (master_product_id)
    WHERE master_product_id IS NOT NULL;

ALTER TABLE public.pos_products
    ADD COLUMN IF NOT EXISTS master_product_id UUID
        REFERENCES public.master_products_catalog (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pos_products_master_product_idx
    ON public.pos_products (master_product_id)
    WHERE master_product_id IS NOT NULL;

-- `inventory_item_id` nunca teve chave estrangeira - so um CHECK. Um
-- artigo apagado do economato deixava o produto do POS a apontar para o
-- nada e impedia o embed `inventory_items(current_stock)` no PostgREST.
-- Limpa as referencias pendentes e instala a FK.
UPDATE public.pos_products AS p
SET inventory_item_id = NULL,
    affects_inventory = FALSE,
    updated_at = now()
WHERE p.inventory_item_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.inventory_items AS i WHERE i.id = p.inventory_item_id
  );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'pos_products_inventory_item_fkey'
          AND conrelid = 'public.pos_products'::regclass
    ) THEN
        ALTER TABLE public.pos_products
            ADD CONSTRAINT pos_products_inventory_item_fkey
            FOREIGN KEY (inventory_item_id)
            REFERENCES public.inventory_items (id)
            ON DELETE SET NULL;
    END IF;
END
$$;


-- ------------------------------------------------------------
-- 4. Tarifas de quarto - diaria ou por bloco horario
-- ------------------------------------------------------------
-- Escopo de aplicacao, por ordem de especificidade:
--   1. `room_id`       -> tarifa daquele quarto
--   2. `room_type`     -> tarifa do tipo de quarto
--   3. ambos nulos     -> tarifa geral da propriedade
-- `block_hours = 0` significa "nao se aplica" (tarifa diaria); 1, 2 e 3
-- sao os blocos horarios vendidos.
CREATE TABLE IF NOT EXISTS public.room_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.hotel_rooms (id) ON DELETE CASCADE,
    room_type TEXT,
    label TEXT NOT NULL DEFAULT 'Tarifa padrao',
    billing_mode TEXT NOT NULL DEFAULT 'PER_DAY'
        CHECK (billing_mode IN ('PER_DAY', 'PER_HOUR')),
    block_hours INT NOT NULL DEFAULT 0
        CHECK (block_hours IN (0, 1, 2, 3)),
    price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    -- Hora extra apos o bloco contratado. NULL = calculada como
    -- preco do bloco dividido pelo numero de horas.
    extra_hour_price NUMERIC(12, 2)
        CHECK (extra_hour_price IS NULL OR extra_hour_price >= 0),
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE,
    valid_to DATE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Tarifa diaria nao tem bloco; tarifa horaria tem de ter 1, 2 ou 3.
    CONSTRAINT room_rates_block_ck
        CHECK (
            (billing_mode = 'PER_DAY'  AND block_hours = 0)
         OR (billing_mode = 'PER_HOUR' AND block_hours IN (1, 2, 3))
        ),
    CONSTRAINT room_rates_period_ck
        CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)
);

-- Uma tarifa por ambito e por bloco. Os indices sao parciais porque o
-- Postgres trata NULLs como distintos numa chave unica.
CREATE UNIQUE INDEX IF NOT EXISTS room_rates_room_uq
    ON public.room_rates (tenant_id, room_id, billing_mode, block_hours)
    WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_rates_type_uq
    ON public.room_rates (tenant_id, room_type, billing_mode, block_hours)
    WHERE room_id IS NULL AND room_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_rates_global_uq
    ON public.room_rates (tenant_id, billing_mode, block_hours)
    WHERE room_id IS NULL AND room_type IS NULL;

CREATE INDEX IF NOT EXISTS room_rates_tenant_idx
    ON public.room_rates (tenant_id, is_active, billing_mode);

CREATE OR REPLACE FUNCTION public.set_room_rates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS room_rates_updated_at ON public.room_rates;
CREATE TRIGGER room_rates_updated_at
    BEFORE UPDATE ON public.room_rates
    FOR EACH ROW EXECUTE FUNCTION public.set_room_rates_updated_at();


-- ------------------------------------------------------------
-- 5. Sessoes de facturacao horaria
-- ------------------------------------------------------------
-- O quadro de quartos desenha a contagem decrescente a partir de
-- `ends_at`; a aplicacao so faz a diferenca para a hora local.
CREATE TABLE IF NOT EXISTS public.hourly_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.hotel_rooms (id) ON DELETE CASCADE,
    room_rate_id UUID REFERENCES public.room_rates (id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,
    block_hours INT NOT NULL DEFAULT 1 CHECK (block_hours IN (1, 2, 3)),
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
    extra_hour_rate NUMERIC(12, 2)
        CHECK (extra_hour_rate IS NULL OR extra_hour_rate >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    extensions INT NOT NULL DEFAULT 0 CHECK (extensions >= 0),
    grace_minutes INT NOT NULL DEFAULT 15 CHECK (grace_minutes >= 0),
    status TEXT NOT NULL DEFAULT 'EM_CURSO'
        CHECK (status IN ('EM_CURSO', 'PAGO', 'CANCELADA')),
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hourly_billing_ends_ck CHECK (ends_at > started_at),
    CONSTRAINT hourly_billing_closure_ck
        CHECK ((status = 'EM_CURSO') = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS hourly_billing_open_idx
    ON public.hourly_billing (tenant_id, status, ends_at);

CREATE INDEX IF NOT EXISTS hourly_billing_room_idx
    ON public.hourly_billing (room_id, status);

CREATE INDEX IF NOT EXISTS hourly_billing_created_idx
    ON public.hourly_billing (tenant_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.set_hourly_billing_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hourly_billing_updated_at ON public.hourly_billing;
CREATE TRIGGER hourly_billing_updated_at
    BEFORE UPDATE ON public.hourly_billing
    FOR EACH ROW EXECUTE FUNCTION public.set_hourly_billing_updated_at();


-- ------------------------------------------------------------
-- 6. Conta do hospede - extrato transparente
-- ------------------------------------------------------------
-- O hospede abre a app do cliente e ve, linha a linha, tudo o que
-- consumiu no hotel. Cada linha nasce de um lancamento real, nunca de
-- um resumo calculado pela aplicacao.
CREATE TABLE IF NOT EXISTS public.guest_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    account_number TEXT NOT NULL,
    guest_profile_id UUID REFERENCES public.guest_profiles (id) ON DELETE SET NULL,
    -- Conta ligada a uma sessao autenticada: e a chave que a app do
    -- cliente usa para encontrar o extrato proprio.
    auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,
    room_number TEXT,
    source TEXT NOT NULL DEFAULT 'HOSPEDAGEM'
        CHECK (source IN ('HOSPEDAGEM', 'RESTAURANTE', 'BAR', 'EVENTO')),
    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA', 'PAGA', 'CANCELADA')),
    currency TEXT NOT NULL DEFAULT 'AOA',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    -- O total nunca e escrito por ninguem: e sempre subtotal menos
    -- desconto, calculado pelo proprio Postgres. O extrato do hospede
    -- nao pode divergir da soma das linhas.
    total NUMERIC(14, 2)
        GENERATED ALWAYS AS (subtotal - discount) STORED,
    pre_billed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT guest_accounts_number_uq UNIQUE (tenant_id, account_number),
    CONSTRAINT guest_accounts_closure_ck
        CHECK ((status = 'ABERTA') = (closed_at IS NULL)),
    CONSTRAINT guest_accounts_discount_ck CHECK (discount <= subtotal)
);

CREATE INDEX IF NOT EXISTS guest_accounts_tenant_idx
    ON public.guest_accounts (tenant_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS guest_accounts_auth_idx
    ON public.guest_accounts (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_accounts_reservation_idx
    ON public.guest_accounts (reservation_id)
    WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_accounts_room_idx
    ON public.guest_accounts (tenant_id, room_number);

CREATE OR REPLACE FUNCTION public.set_guest_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guest_accounts_updated_at ON public.guest_accounts;
CREATE TRIGGER guest_accounts_updated_at
    BEFORE UPDATE ON public.guest_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_guest_accounts_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    account_id UUID NOT NULL
        REFERENCES public.guest_accounts (id) ON DELETE CASCADE,
    origin TEXT NOT NULL DEFAULT 'RESTAURANTE'
        CHECK (origin IN (
            'ALOJAMENTO', 'RESTAURANTE', 'BAR', 'SNACK', 'PISCINA',
            'GINASIO', 'LAVANDARIA', 'ROOM_SERVICE', 'EVENTO', 'SERVICO'
        )),
    -- Rastro ate a fonte: se a linha veio de uma comanda do POS,
    -- devolve-se a comanda e a linha originais.
    pos_order_id UUID REFERENCES public.pos_orders (id) ON DELETE SET NULL,
    pos_order_item_id UUID REFERENCES public.pos_order_items (id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.pos_products (id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT guest_order_items_line_ck
        CHECK (abs(line_total - ((quantity * unit_price) - discount)) <= 0.01)
);

CREATE INDEX IF NOT EXISTS guest_order_items_account_idx
    ON public.guest_order_items (account_id, consumed_at);

CREATE INDEX IF NOT EXISTS guest_order_items_tenant_idx
    ON public.guest_order_items (tenant_id, consumed_at DESC);

-- O total da conta e sempre a soma das linhas: nenhuma rota de codigo
-- escreve o total diretamente, por isso o extrato nunca mente.
CREATE OR REPLACE FUNCTION public.recalc_guest_account_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_account UUID := COALESCE(NEW.account_id, OLD.account_id);
    v_tenant  UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
    UPDATE public.guest_accounts AS a
    SET subtotal = agg.sub,
        updated_at = now()
    FROM (
        SELECT COALESCE(sum(g.line_total), 0) AS sub
        FROM public.guest_order_items AS g
        WHERE g.account_id = v_account
    ) AS agg
    WHERE a.id = v_account
      AND a.tenant_id = v_tenant;

    RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS guest_order_items_recalc
    ON public.guest_order_items;
CREATE TRIGGER guest_order_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON public.guest_order_items
    FOR EACH ROW EXECUTE FUNCTION public.recalc_guest_account_total();


-- ------------------------------------------------------------
-- 7. Pre-conta auditada
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.pre_bill_seq START 1;

CREATE TABLE IF NOT EXISTS public.pre_bill_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'PRE_CONTA'
        CHECK (doc_type IN ('PRE_CONTA', 'EXTRATO')),
    context TEXT NOT NULL DEFAULT 'MESA'
        CHECK (context IN ('MESA', 'QUARTO', 'CONTA')),
    pos_order_id UUID REFERENCES public.pos_orders (id) ON DELETE SET NULL,
    guest_account_id UUID REFERENCES public.guest_accounts (id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,
    label TEXT,
    guest_name TEXT,
    room_number TEXT,
    line_count INT NOT NULL DEFAULT 0 CHECK (line_count >= 0),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    currency TEXT NOT NULL DEFAULT 'AOA',
    -- Largura do papel: 58mm (terminal de mesa) ou 80mm (balcao).
    printer TEXT NOT NULL DEFAULT 'ESCPOS_80'
        CHECK (printer IN ('ESCPOS_58', 'ESCPOS_80', 'PDF')),
    -- Fotografia completa do documento: sobrevive a alteracoes posteriores
    -- da comanda e e o que a app do cliente mostra como comprovativo.
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    issued_by UUID,
    issued_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pre_bill_logs_number_uq UNIQUE (tenant_id, doc_number),
    CONSTRAINT pre_bill_logs_source_ck
        CHECK (pos_order_id IS NOT NULL OR guest_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS pre_bill_logs_tenant_idx
    ON public.pre_bill_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pre_bill_logs_order_idx
    ON public.pre_bill_logs (pos_order_id)
    WHERE pos_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pre_bill_logs_account_idx
    ON public.pre_bill_logs (guest_account_id)
    WHERE guest_account_id IS NOT NULL;


-- ------------------------------------------------------------
-- 8. Bloqueio auditado dos itens da comanda
-- ------------------------------------------------------------
-- Emitida a pre-conta, os valores deixam de ser editaveis. So sai um
-- item bloqueado com justificativa escrita, e a remocao fica registada
-- na auditoria da instancia.
ALTER TABLE public.pos_order_items
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by UUID,
    ADD COLUMN IF NOT EXISTS pre_bill_id UUID
        REFERENCES public.pre_bill_logs (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS removal_justification TEXT,
    ADD COLUMN IF NOT EXISTS removed_by UUID,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pos_order_items_locked_idx
    ON public.pos_order_items (order_id, locked_at)
    WHERE locked_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_locked_order_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.locked_at IS NOT NULL
           AND (OLD.removal_justification IS NULL
                OR length(trim(OLD.removal_justification)) < 8) THEN
            RAISE EXCEPTION
                'Item de pre-conta bloqueado (%): a remocao exige justificativa auditada de 8 caracteres ou mais.',
                OLD.id
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.locked_at IS NOT NULL
       AND (NEW.quantity     IS DISTINCT FROM OLD.quantity
         OR NEW.unit_price   IS DISTINCT FROM OLD.unit_price
         OR NEW.line_total   IS DISTINCT FROM OLD.line_total
         OR NEW.product_name IS DISTINCT FROM OLD.product_name) THEN
        RAISE EXCEPTION
            'Item de pre-conta bloqueado (%): o valor ja emitido e imutavel.',
            OLD.id
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pos_order_items_protected ON public.pos_order_items;
CREATE TRIGGER pos_order_items_protected
    BEFORE UPDATE OR DELETE ON public.pos_order_items
    FOR EACH ROW EXECUTE FUNCTION public.protect_locked_order_items();

-- A remocao de um item ja impresso deixa rasto permanente: quem, quando,
-- o que saiu e porquê. Escrito por trigger, fora do alcance da app.
CREATE OR REPLACE FUNCTION public.audit_locked_order_item_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := (SELECT auth.uid());
    v_role  TEXT;
BEGIN
    IF TG_OP <> 'DELETE' OR OLD.locked_at IS NULL THEN
        RETURN OLD;
    END IF;

    SELECT u.role INTO v_role
    FROM public.app_users AS u
    WHERE u.auth_user_id = v_actor
    LIMIT 1;

    INSERT INTO public.tenant_audit_log (
        tenant_id, actor_id, actor_role, action, entity_table,
        entity_id, before_data
    ) VALUES (
        OLD.tenant_id, v_actor, v_role, 'ITEM_PRE_CONTA_REMOVIDO',
        'pos_order_items', OLD.id::text,
        jsonb_build_object(
            'product_name', OLD.product_name,
            'quantity', OLD.quantity,
            'unit_price', OLD.unit_price,
            'line_total', OLD.line_total,
            'pre_bill_id', OLD.pre_bill_id,
            'justification', OLD.removal_justification
        )
    );

    RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS pos_order_items_removal_audit
    ON public.pos_order_items;
CREATE TRIGGER pos_order_items_removal_audit
    AFTER DELETE ON public.pos_order_items
    FOR EACH ROW EXECUTE FUNCTION public.audit_locked_order_item_removal();


-- ------------------------------------------------------------
-- 9. Funcoes de negocio
-- ------------------------------------------------------------

-- 9.1 Resolucao de tarifa: quarto -> tipo -> propriedade.
-- Devolve JSONB (e nao um registo) para que "sem tarifa" seja
-- explicitamente NULL e nunca um conjunto vazio ambiguo.
CREATE OR REPLACE FUNCTION public.hr_pick_room_rate(
    p_room_id UUID,
    p_billing_mode TEXT DEFAULT 'PER_DAY',
    p_block_hours INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT jsonb_build_object(
                'rate_id', r.id,
                'price', r.price,
                'extra', r.extra_hour_price,
                'label', r.label,
                'scope', 'ROOM'
            )
            FROM public.room_rates AS r
            WHERE r.tenant_id = (SELECT h.tenant_id FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.room_id = p_room_id
              AND r.billing_mode = p_billing_mode
              AND r.block_hours = p_block_hours
              AND r.is_active
              AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
            ORDER BY r.is_default DESC, r.updated_at DESC
            LIMIT 1
        ),
        (
            SELECT jsonb_build_object(
                'rate_id', r.id,
                'price', r.price,
                'extra', r.extra_hour_price,
                'label', r.label,
                'scope', 'TYPE'
            )
            FROM public.room_rates AS r
            WHERE r.tenant_id = (SELECT h.tenant_id FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.room_id IS NULL
              AND r.room_type = (SELECT h.room_type FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.billing_mode = p_billing_mode
              AND r.block_hours = p_block_hours
              AND r.is_active
              AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
            ORDER BY r.is_default DESC, r.updated_at DESC
            LIMIT 1
        ),
        (
            SELECT jsonb_build_object(
                'rate_id', r.id,
                'price', r.price,
                'extra', r.extra_hour_price,
                'label', r.label,
                'scope', 'PROPERTY'
            )
            FROM public.room_rates AS r
            WHERE r.tenant_id = (SELECT h.tenant_id FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.room_id IS NULL
              AND r.room_type IS NULL
              AND r.billing_mode = p_billing_mode
              AND r.block_hours = p_block_hours
              AND r.is_active
              AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
            ORDER BY r.is_default DESC, r.updated_at DESC
            LIMIT 1
        ),
        NULL::jsonb
    )
$$;

-- 9.2 Preco resolvido, com o preco diario do quarto como ultima rede.
CREATE OR REPLACE FUNCTION public.hr_room_rate(
    p_room_id UUID,
    p_billing_mode TEXT DEFAULT 'PER_DAY',
    p_block_hours INT DEFAULT 0
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (public.hr_pick_room_rate(p_room_id, p_billing_mode, p_block_hours)->>'price')::numeric,
        (SELECT h.price_per_night FROM public.hotel_rooms AS h WHERE h.id = p_room_id),
        0
    )
$$;

-- 9.3 Stock por produto. E a regra de stock zero do POS: um artigo so
-- aparece na tela de vendas se nao consumir economato ou se tiver saldo.
-- Chamada pelo app; se a migracao 011 ainda nao estiver aplicada, o app
-- falha em silencio e mantem a carta completa visivel.
CREATE OR REPLACE FUNCTION public.hr_pos_stock(
    p_product_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    product_id UUID,
    quantity_in_stock NUMERIC,
    is_available BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
    SELECT p.id,
           COALESCE(i.current_stock, 0),
           (
               p.affects_inventory = FALSE
               OR p.inventory_item_id IS NULL
               OR COALESCE(i.current_stock, 0) > 0
           )
    FROM public.pos_products AS p
    LEFT JOIN public.inventory_items AS i ON i.id = p.inventory_item_id
    WHERE p.tenant_id = (SELECT public.hr_tenant_id())
      AND p.is_active
      AND (p_product_ids IS NULL OR cardinality(p_product_ids) = 0
           OR p.id = ANY (p_product_ids))
$$;

-- 9.4 O usuario autenticado pertence ao quadro de propriedade (tem
-- perfil em app_users). Distingue a staff do hospede na RLS: a staff
-- ve as contas da instancia, o hospede so a propria.
CREATE OR REPLACE FUNCTION public.hr_is_property_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.app_users AS u
        WHERE u.auth_user_id = (SELECT auth.uid())
          AND u.tenant_id = (SELECT public.hr_tenant_id())
    )
$$;

-- 9.5 Emissao de pre-conta: congela a comanda, numeroa o documento e
-- guarda a fotografia completa. SECURITY DEFINER porque atravessa
-- comanda, itens e log numa unica operacao - mas valida a permissao
-- da sessao antes de escrever qualquer coisa.
CREATE OR REPLACE FUNCTION public.hr_issue_pre_bill(
    p_order_id UUID DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_context TEXT DEFAULT 'MESA',
    p_label TEXT DEFAULT NULL,
    p_guest_name TEXT DEFAULT NULL,
    p_printer TEXT DEFAULT 'ESCPOS_80'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant   UUID := (SELECT public.hr_tenant_id());
    v_actor    UUID := (SELECT auth.uid());
    v_actor_name TEXT;
    v_doc      TEXT;
    v_lines    JSONB := '[]'::jsonb;
    v_subtotal NUMERIC(14, 2) := 0;
    v_discount NUMERIC(14, 2) := 0;
    v_count    INT := 0;
    v_guest    TEXT;
    v_room     TEXT;
    v_res      UUID;
    v_id       UUID;
    v_locked   INT := 0;
    v_issued_at TIMESTAMPTZ := now();
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('pos')) THEN
        RAISE EXCEPTION 'Sem permissao para emitir documentos de venda.'
            USING ERRCODE = '42501';
    END IF;

    IF p_order_id IS NULL AND p_account_id IS NULL THEN
        RAISE EXCEPTION 'Indique a comanda ou a conta do hospede a emitir.'
            USING ERRCODE = '22023';
    END IF;

    IF p_context NOT IN ('MESA', 'QUARTO', 'CONTA') THEN
        RAISE EXCEPTION 'Contexto de documento invalido: %', p_context
            USING ERRCODE = '22023';
    END IF;

    IF p_printer NOT IN ('ESCPOS_58', 'ESCPOS_80', 'PDF') THEN
        RAISE EXCEPTION 'Impressora invalida: %', p_printer
            USING ERRCODE = '22023';
    END IF;

    SELECT n.name INTO v_actor_name
    FROM public.app_users AS n
    WHERE n.auth_user_id = v_actor
    LIMIT 1;

    IF p_order_id IS NOT NULL THEN
        SELECT COALESCE(p_guest_name, o.customer_name) AS guest,
               o.reservation_id
        INTO v_guest, v_res
        FROM public.pos_orders AS o
        WHERE o.id = p_order_id
          AND o.tenant_id = v_tenant;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Comanda nao encontrada nesta instancia.'
                USING ERRCODE = 'P0002';
        END IF;

        SELECT COALESCE(jsonb_agg(
                   jsonb_build_object(
                       'id', i.id,
                       'description', i.product_name,
                       'quantity', i.quantity,
                       'unit_price', i.unit_price,
                       'line_total', i.line_total
                   ) ORDER BY i.created_at, i.id
               ), '[]'::jsonb),
               COALESCE(sum(i.line_total), 0),
               count(*)::int
        INTO v_lines, v_subtotal, v_count
        FROM public.pos_order_items AS i
        WHERE i.order_id = p_order_id;

        IF v_count = 0 THEN
            RAISE EXCEPTION 'A comanda nao tem itens para emitir pre-conta.'
                USING ERRCODE = '22023';
        END IF;
    ELSE
        SELECT COALESCE(p_guest_name, a.guest_name) AS guest,
               a.room_number,
               a.reservation_id
        INTO v_guest, v_room, v_res
        FROM public.guest_accounts AS a
        WHERE a.id = p_account_id
          AND a.tenant_id = v_tenant;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Conta do hospede nao encontrada nesta instancia.'
                USING ERRCODE = 'P0002';
        END IF;

        SELECT COALESCE(jsonb_agg(
                   jsonb_build_object(
                       'id', g.id,
                       'description', g.description,
                       'quantity', g.quantity,
                       'unit_price', g.unit_price,
                       'line_total', g.line_total
                   ) ORDER BY g.consumed_at, g.id
               ), '[]'::jsonb),
               COALESCE(sum(g.line_total), 0),
               count(*)::int
        INTO v_lines, v_subtotal, v_count
        FROM public.guest_order_items AS g
        WHERE g.account_id = p_account_id;

        IF v_count = 0 THEN
            RAISE EXCEPTION 'A conta do hospede nao tem itens para emitir extrato.'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.guest_accounts
        SET pre_billed_at = COALESCE(pre_billed_at, v_issued_at)
        WHERE id = p_account_id;
    END IF;

    v_doc := 'PC-' || to_char(v_issued_at, 'YYYYMMDD') || '-'
             || lpad(nextval('public.pre_bill_seq')::text, 6, '0');

    INSERT INTO public.pre_bill_logs (
        tenant_id, doc_number, doc_type, context,
        pos_order_id, guest_account_id, reservation_id,
        label, guest_name, room_number,
        line_count, subtotal, discount, total,
        printer, payload, issued_by, issued_by_name
    ) VALUES (
        v_tenant, v_doc,
        CASE WHEN p_account_id IS NOT NULL THEN 'EXTRATO' ELSE 'PRE_CONTA' END,
        p_context,
        p_order_id, p_account_id, v_res,
        p_label, v_guest, v_room,
        v_count, v_subtotal, v_discount, v_subtotal - v_discount,
        p_printer,
        jsonb_build_object(
            'doc_number', v_doc,
            'context', p_context,
            'label', p_label,
            'guest_name', v_guest,
            'room_number', v_room,
            'currency', 'AOA',
            'line_count', v_count,
            'subtotal', v_subtotal,
            'discount', v_discount,
            'total', v_subtotal - v_discount,
            'issued_by_name', v_actor_name,
            'issued_at', v_issued_at,
            'lines', v_lines
        ),
        v_actor, v_actor_name
    )
    RETURNING id INTO v_id;

    IF p_order_id IS NOT NULL THEN
        UPDATE public.pos_order_items
        SET locked_at = v_issued_at,
            locked_by = v_actor,
            pre_bill_id = v_id
        WHERE order_id = p_order_id
          AND locked_at IS NULL;
        GET DIAGNOSTICS v_locked = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'pre_bill_id', v_id,
        'doc_number', v_doc,
        'doc_type', CASE WHEN p_account_id IS NOT NULL
                         THEN 'EXTRATO' ELSE 'PRE_CONTA' END,
        'context', p_context,
        'label', p_label,
        'guest_name', v_guest,
        'room_number', v_room,
        'currency', 'AOA',
        'line_count', v_count,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'total', v_subtotal - v_discount,
        'printer', p_printer,
        'locked_items', v_locked,
        'issued_by', v_actor,
        'issued_by_name', v_actor_name,
        'issued_at', v_issued_at,
        'lines', v_lines
    );
END
$$;

-- 9.6 Sessao horaria: abre, estende e fecha. A abertura calcula o preco
-- pela tarifa do bloco e marca o quarto como ocupado.
CREATE OR REPLACE FUNCTION public.hr_start_hourly_billing(
    p_room_id UUID,
    p_block_hours INT DEFAULT 1,
    p_reservation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant  UUID := (SELECT public.hr_tenant_id());
    v_actor   UUID := (SELECT auth.uid());
    v_room    RECORD;
    v_pick    JSONB;
    v_rate    NUMERIC(12, 2) := 0;
    v_extra   NUMERIC(12, 2) := 0;
    v_rate_id UUID;
    v_open    INT := 0;
    v_id      UUID;
    v_ends    TIMESTAMPTZ;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao para abrir sessoes horarias.'
            USING ERRCODE = '42501';
    END IF;

    IF p_block_hours IS NULL OR p_block_hours NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'Bloco horario invalido: %. Use 1, 2 ou 3 horas.',
            COALESCE(p_block_hours::text, 'nulo')
            USING ERRCODE = '22023';
    END IF;

    SELECT h.id, h.room_number, h.tenant_id, h.status, h.room_type,
           h.price_per_night
    INTO v_room
    FROM public.hotel_rooms AS h
    WHERE h.id = p_room_id
      AND h.tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quarto nao encontrado nesta instancia.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*)::int INTO v_open
    FROM public.hourly_billing AS b
    WHERE b.tenant_id = v_tenant
      AND b.room_id = p_room_id
      AND b.status = 'EM_CURSO';

    IF v_open > 0 THEN
        RAISE EXCEPTION 'Ja existe uma sessao horaria activa no quarto %.',
            v_room.room_number
            USING ERRCODE = '23505';
    END IF;

    v_pick := public.hr_pick_room_rate(p_room_id, 'PER_HOUR', p_block_hours);

    IF v_pick IS NULL THEN
        -- Sem tarifa horaria definida, o preco diario e a referencia:
        -- destravado, e o que a administracao corrige no formulario.
        v_rate := COALESCE(v_room.price_per_night, 0);
        v_extra := CASE WHEN v_rate > 0
                        THEN round(v_rate / 24, 2) ELSE 0 END;
    ELSE
        v_rate := COALESCE((v_pick->>'price')::numeric, 0);
        v_rate_id := (v_pick->>'rate_id')::uuid;
        v_extra := COALESCE(
            (v_pick->>'extra')::numeric,
            CASE WHEN v_rate > 0
                 THEN round(v_rate / p_block_hours, 2) ELSE 0 END
        );
    END IF;

    v_ends := now() + make_interval(hours => p_block_hours);

    INSERT INTO public.hourly_billing (
        tenant_id, room_id, room_rate_id, reservation_id,
        block_hours, rate, extra_hour_rate, started_at, ends_at
    ) VALUES (
        v_tenant, p_room_id, v_rate_id, p_reservation_id,
        p_block_hours, v_rate, v_extra, now(), v_ends
    )
    RETURNING id INTO v_id;

    UPDATE public.hotel_rooms AS h
    SET status = 'OCUPADO',
        updated_at = now()
    WHERE h.id = p_room_id
      AND h.tenant_id = v_tenant
      AND h.status <> 'OCUPADO';

    RETURN jsonb_build_object(
        'hourly_billing_id', v_id,
        'room_id', p_room_id,
        'room_number', v_room.room_number,
        'block_hours', p_block_hours,
        'rate', v_rate,
        'extra_hour_rate', v_extra,
        'rate_id', v_rate_id,
        'started_at', now(),
        'ends_at', v_ends,
        'seconds_left', extract(epoch FROM (v_ends - now()))::bigint,
        'actor_id', v_actor
    );
END
$$;

CREATE OR REPLACE FUNCTION public.hr_extend_hourly_billing(
    p_billing_id UUID,
    p_extra_hours INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant UUID := (SELECT public.hr_tenant_id());
    v_row    RECORD;
    v_new_end TIMESTAMPTZ;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao para estender sessoes horarias.'
            USING ERRCODE = '42501';
    END IF;

    IF p_extra_hours IS NULL OR p_extra_hours NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'Estendimento invalido: %. Use 1, 2 ou 3 horas.',
            COALESCE(p_extra_hours::text, 'nulo')
            USING ERRCODE = '22023';
    END IF;

    SELECT b.id, b.room_id, b.ends_at, b.extensions, b.status,
           b.extra_hour_rate, b.rate, h.room_number
    INTO v_row
    FROM public.hourly_billing AS b
    JOIN public.hotel_rooms AS h ON h.id = b.room_id
    WHERE b.id = p_billing_id
      AND b.tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessao horaria nao encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF v_row.status <> 'EM_CURSO' THEN
        RAISE EXCEPTION 'Sessao ja encerrada: nao e possivel estender.'
            USING ERRCODE = '23514';
    END IF;

    v_new_end := v_row.ends_at + make_interval(hours => p_extra_hours);

    UPDATE public.hourly_billing AS b
    SET ends_at = v_new_end,
        extensions = b.extensions + 1
    WHERE b.id = p_billing_id;

    RETURN jsonb_build_object(
        'hourly_billing_id', p_billing_id,
        'room_number', v_row.room_number,
        'extra_hours', p_extra_hours,
        'extensions', v_row.extensions + 1,
        'ends_at', v_new_end,
        'seconds_left', extract(epoch FROM (v_new_end - now()))::bigint,
        'extra_hour_rate', COALESCE(v_row.extra_hour_rate, 0),
        'extra_amount', round(
            COALESCE(v_row.extra_hour_rate, 0) * p_extra_hours, 2
        )
    );
END
$$;

CREATE OR REPLACE FUNCTION public.hr_close_hourly_billing(
    p_billing_id UUID,
    p_amount_paid NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant UUID := (SELECT public.hr_tenant_id());
    v_row    RECORD;
    v_paid   NUMERIC(12, 2);
    v_used   INT;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao para encerrar sessoes horarias.'
            USING ERRCODE = '42501';
    END IF;

    SELECT b.id, b.room_id, b.status, b.started_at, b.rate,
           b.extra_hour_rate, b.block_hours, b.extensions, h.room_number
    INTO v_row
    FROM public.hourly_billing AS b
    JOIN public.hotel_rooms AS h ON h.id = b.room_id
    WHERE b.id = p_billing_id
      AND b.tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessao horaria nao encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF v_row.status <> 'EM_CURSO' THEN
        RAISE EXCEPTION 'Sessao ja encerrada.' USING ERRCODE = '23514';
    END IF;

    v_used := ceil(extract(epoch FROM (now() - v_row.started_at)) / 3600)::int;

    -- Facturado: o bloco contratado + hora extra ao tempo, nunca menos
    -- do que o bloco minimo.
    v_paid := COALESCE(
        p_amount_paid,
        round(
            v_row.rate
            + (GREATEST(v_used - v_row.block_hours, 0)
               * COALESCE(v_row.extra_hour_rate, 0)),
            2
        )
    );

    UPDATE public.hourly_billing AS b
    SET status = 'PAGO',
        amount_paid = v_paid,
        closed_at = now(),
        closed_by = (SELECT auth.uid()),
        notes = COALESCE(p_notes, b.notes)
    WHERE b.id = p_billing_id;

    UPDATE public.hotel_rooms AS h
    SET status = 'LIMPEZA',
        updated_at = now()
    WHERE h.id = v_row.room_id
      AND h.tenant_id = v_tenant;

    RETURN jsonb_build_object(
        'hourly_billing_id', p_billing_id,
        'room_number', v_row.room_number,
        'hours_used', v_used,
        'block_hours', v_row.block_hours,
        'extensions', v_row.extensions,
        'amount_paid', v_paid,
        'closed_at', now()
    );
END
$$;


-- ------------------------------------------------------------
-- 10. RLS e privilegios
-- ------------------------------------------------------------
-- Lacuna da 008: `pos_products` so tinha GRANT SELECT, mas a policy de
-- escrita ja la existia. Qualquer INSERT/UPDATE feito pela interface da
-- empresa devolvia 42501. A escrita continua condicionada a
-- hr_can_write_module('pos') pela policy pos_products_write da 008.
GRANT INSERT, UPDATE, DELETE ON TABLE public.pos_products TO authenticated;

ALTER TABLE public.master_products_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_rates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_billing           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_bill_logs            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.master_products_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_rates               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hourly_billing           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_accounts           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_order_items        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pre_bill_logs            FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.master_products_catalog TO service_role;
GRANT ALL ON TABLE public.room_rates               TO service_role;
GRANT ALL ON TABLE public.hourly_billing           TO service_role;
GRANT ALL ON TABLE public.guest_accounts           TO service_role;
GRANT ALL ON TABLE public.guest_order_items        TO service_role;
GRANT ALL ON TABLE public.pre_bill_logs            TO service_role;

-- Catalogo mestre: leitura livre (cada propriedade copia para si),
-- escrita exclusiva do Master Global - igual a system_licenses na 010.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_products_catalog TO authenticated;

DROP POLICY IF EXISTS master_products_catalog_select
    ON public.master_products_catalog;
CREATE POLICY master_products_catalog_select
    ON public.master_products_catalog
    FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS master_products_catalog_master
    ON public.master_products_catalog;
CREATE POLICY master_products_catalog_master
    ON public.master_products_catalog
    FOR ALL
    TO authenticated
    USING ((SELECT public.hr_is_master_global()))
    WITH CHECK ((SELECT public.hr_is_master_global()));

-- Tarifas: a staff da instancia le e escreve; o hospede nunca.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.room_rates TO authenticated;

DROP POLICY IF EXISTS room_rates_select ON public.room_rates;
CREATE POLICY room_rates_select
    ON public.room_rates
    FOR SELECT
    TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

DROP POLICY IF EXISTS room_rates_write ON public.room_rates;
CREATE POLICY room_rates_write
    ON public.room_rates
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

DROP POLICY IF EXISTS room_rates_update ON public.room_rates;
CREATE POLICY room_rates_update
    ON public.room_rates
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

DROP POLICY IF EXISTS room_rates_delete ON public.room_rates;
CREATE POLICY room_rates_delete
    ON public.room_rates
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_admin())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

-- Sessoes horarias: mesma regra das tarifas.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hourly_billing TO authenticated;

DROP POLICY IF EXISTS hourly_billing_select ON public.hourly_billing;
CREATE POLICY hourly_billing_select
    ON public.hourly_billing
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
    );

DROP POLICY IF EXISTS hourly_billing_write ON public.hourly_billing;
CREATE POLICY hourly_billing_write
    ON public.hourly_billing
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

DROP POLICY IF EXISTS hourly_billing_update ON public.hourly_billing;
CREATE POLICY hourly_billing_update
    ON public.hourly_billing
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

-- Contas do hospede: a staff le tudo da instancia; o hospede, so a
-- propria conta e as linhas dela. Escrita apenas da staff.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guest_accounts TO authenticated;

DROP POLICY IF EXISTS guest_accounts_select ON public.guest_accounts;
CREATE POLICY guest_accounts_select
    ON public.guest_accounts
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            (SELECT public.hr_is_property_staff())
            OR auth_user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS guest_accounts_insert ON public.guest_accounts;
CREATE POLICY guest_accounts_insert
    ON public.guest_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

DROP POLICY IF EXISTS guest_accounts_update ON public.guest_accounts;
CREATE POLICY guest_accounts_update
    ON public.guest_accounts
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

DROP POLICY IF EXISTS guest_accounts_delete ON public.guest_accounts;
CREATE POLICY guest_accounts_delete
    ON public.guest_accounts
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_admin())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guest_order_items TO authenticated;

DROP POLICY IF EXISTS guest_order_items_select ON public.guest_order_items;
CREATE POLICY guest_order_items_select
    ON public.guest_order_items
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            (SELECT public.hr_is_property_staff())
            OR account_id IN (
                SELECT a.id FROM public.guest_accounts AS a
                WHERE a.auth_user_id = (SELECT auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS guest_order_items_insert ON public.guest_order_items;
CREATE POLICY guest_order_items_insert
    ON public.guest_order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

DROP POLICY IF EXISTS guest_order_items_update ON public.guest_order_items;
CREATE POLICY guest_order_items_update
    ON public.guest_order_items
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

-- Um item do extrato nunca desaparece a meio da estadia: apaga-se a
-- conta inteira (cascata), nunca uma linha solta.
DROP POLICY IF EXISTS guest_order_items_delete ON public.guest_order_items;
CREATE POLICY guest_order_items_delete
    ON public.guest_order_items
    FOR DELETE
    TO authenticated
    USING (FALSE);

-- Pre-contas: a staff le; o operador do POS escreve. Nao ha politica de
-- apagamento - o log de documentos e permanente.
GRANT SELECT, INSERT, UPDATE ON TABLE public.pre_bill_logs TO authenticated;

DROP POLICY IF EXISTS pre_bill_logs_select ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_select
    ON public.pre_bill_logs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
    );

DROP POLICY IF EXISTS pre_bill_logs_insert ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_insert
    ON public.pre_bill_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

DROP POLICY IF EXISTS pre_bill_logs_update ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_update
    ON public.pre_bill_logs
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

-- Politicas de SELECT sao somadas, nao substituidas: o hospede lê os
-- documentos emitidos sobre a CONTA PROPRIA (o comprovativo no extrato
-- da app do cliente) e a staff continua a ler todos da instancia.
DROP POLICY IF EXISTS pre_bill_logs_guest ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_guest
    ON public.pre_bill_logs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND guest_account_id IN (
            SELECT a.id
            FROM public.guest_accounts AS a
            WHERE a.auth_user_id = (SELECT auth.uid())
        )
    );

REVOKE ALL ON FUNCTION public.hr_pick_room_rate(UUID, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_room_rate(UUID, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_pos_stock(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_is_property_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_issue_pre_bill(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_start_hourly_billing(UUID, INT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_extend_hourly_billing(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_close_hourly_billing(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hr_pick_room_rate(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_room_rate(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_pos_stock(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_property_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_issue_pre_bill(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_start_hourly_billing(UUID, INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_extend_hourly_billing(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_close_hourly_billing(UUID, NUMERIC, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.hr_issue_pre_bill(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_start_hourly_billing(UUID, INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_extend_hourly_billing(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_close_hourly_billing(UUID, NUMERIC, TEXT) TO service_role;


-- ------------------------------------------------------------
-- 11. Realtime
-- ------------------------------------------------------------
-- O quadro de quartos e a app do cliente assinam estas tabelas para
-- reflectir um lancamento sem recarregar o ecra.
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_accounts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_order_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hourly_billing;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_rates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pre_bill_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------
-- 12. Seed do catalogo mestre
-- ------------------------------------------------------------
-- Carta base de uma propriedade angolana: cervejas e refrigerantes
-- locais, pratos da cozinha angolana, snacks de bar e servicos do
-- hotel. A propriedade copia o que quiser para o seu POS e muda o
-- preco; o catalogo fica intacto.
INSERT INTO public.master_products_catalog (
    sku, name, kind, category, unit, suggested_price, origin, description
) VALUES
-- Cervejas
('BERV-CUCA-330',    'Cuca 330ml',              'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Cerveja angolana, garrafa de 330ml'),
('BERV-CUCA-600',    'Cuca 600ml',              'BEBIDA', 'BEBIDA', 'garrafa', 1100,  'LOCAL',  'Cerveja angolana, garrafa de 600ml'),
('BERV-CUCA-1L',     'Cuca 1L',                 'BEBIDA', 'BEBIDA', 'garrafa', 1600,  'LOCAL',  'Cerveja angolana, garrafa de 1 litro'),
('BERV-NGOLA-330',   'N''gola 330ml',           'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Cerveja angolana N''gola, 330ml'),
('BERV-NGOLA-600',   'N''gola 600ml',           'BEBIDA', 'BEBIDA', 'garrafa', 1100,  'LOCAL',  'Cerveja angolana N''gola, 600ml'),
('BERV-EKA-330',     'Eka 330ml',               'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Cerveja angolana Eka, 330ml'),
('BERV-EKA-600',     'Eka 600ml',               'BEBIDA', 'BEBIDA', 'garrafa', 1050,  'LOCAL',  'Cerveja angolana Eka, 600ml'),
('BERV-BOHEMIA-330', 'Bohemia 330ml',           'BEBIDA', 'BEBIDA', 'garrafa',  800,  'LOCAL',  'Cerveja Bohemia, 330ml'),
('BERV-BOHEMIA-600', 'Bohemia 600ml',           'BEBIDA', 'BEBIDA', 'garrafa', 1200,  'LOCAL',  'Cerveja Bohemia, 600ml'),
('BERV-HEINEKEN-330','Heineken 330ml',          'BEBIDA', 'BEBIDA', 'garrafa', 1200,  'GLOBAL', 'Cerveja internacional, 330ml'),
('BERV-HEINEKEN-650','Heineken 650ml',          'BEBIDA', 'BEBIDA', 'garrafa', 1800,  'GLOBAL', 'Cerveja internacional, 650ml'),
('BERV-STELLA-330',  'Stella Artois 330ml',     'BEBIDA', 'BEBIDA', 'garrafa', 1300,  'GLOBAL', 'Cerveja internacional, 330ml'),
('BERV-STELLA-660',  'Stella Artois 660ml',     'BEBIDA', 'BEBIDA', 'garrafa', 1900,  'GLOBAL', 'Cerveja internacional, 660ml'),

-- Refrigerantes, sumos e agua
('REFR-COMPAL-250',  'Compal 250ml',            'BEBIDA', 'BEBIDA', 'lata',     600,  'GLOBAL', 'Sumo de fruta, lata de 250ml'),
('REFR-COMPAL-1L',   'Compal 1L',               'BEBIDA', 'BEBIDA', 'garrafa', 1300,  'GLOBAL', 'Sumo de fruta, garrafa de 1 litro'),
('REFR-SANTAL-250',  'Santal 250ml',            'BEBIDA', 'BEBIDA', 'lata',     600,  'GLOBAL', 'Refrigerante de citrinos, lata de 250ml'),
('REFR-SANTAL-1L',   'Santal 1L',               'BEBIDA', 'BEBIDA', 'garrafa', 1300,  'GLOBAL', 'Refrigerante de citrinos, 1 litro'),
('REFR-COCA-330',    'Coca-Cola 330ml',         'BEBIDA', 'BEBIDA', 'lata',     700,  'GLOBAL', 'Refrigerante de cola, lata de 330ml'),
('REFR-COCA-1L',     'Coca-Cola 1L',            'BEBIDA', 'BEBIDA', 'garrafa', 1400,  'GLOBAL', 'Refrigerante de cola, 1 litro'),
('REFR-FANTA-330',   'Fanta Laranja 330ml',     'BEBIDA', 'BEBIDA', 'lata',     700,  'GLOBAL', 'Refrigerante de laranja, lata de 330ml'),
('REFR-SPRITE-330',  'Sprite 330ml',            'BEBIDA', 'BEBIDA', 'lata',     700,  'GLOBAL', 'Refrigerante de citrinos, lata de 330ml'),
('REFR-VITALO-330',  'Vitalo 330ml',            'BEBIDA', 'BEBIDA', 'lata',     650,  'LOCAL',  'Refrigerante angolano, lata de 330ml'),
('REFR-VITALO-1L',   'Vitalo 1L',               'BEBIDA', 'BEBIDA', 'garrafa', 1250,  'LOCAL',  'Refrigerante angolano, 1 litro'),
('REFR-AGUA-500',    'Agua Mineral 500ml',      'BEBIDA', 'BEBIDA', 'garrafa',  450,  'LOCAL',  'Agua mineral natural, 500ml'),
('REFR-AGUA-1500',   'Agua Mineral 1,5L',       'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Agua mineral natural, 1,5 litro'),
('REFR-TONICA-330',  'Agua Tonica 330ml',       'BEBIDA', 'BEBIDA', 'lata',     750,  'GLOBAL', 'Agua tonica, lata de 330ml'),

-- Cafe e cafeteria
('CAFE-ESPRESSO',    'Cafe Expresso',           'BEBIDA', 'CAFETERIA', 'xicara', 400, 'LOCAL',  'Cafe expresso servido na hora'),
('CAFE-GALAO',       'Cafe Galao',              'BEBIDA', 'CAFETERIA', 'xicara', 600, 'LOCAL',  'Cafe com leite, xicara grande'),
('CAFE-PINGADO',     'Cafe Pingado',            'BEBIDA', 'CAFETERIA', 'xicara', 500, 'LOCAL',  'Cafe com um fio de leite'),
('CAFE-CAFETEIRA',   'Cafe de Cafeteira',       'BEBIDA', 'CAFETERIA', 'jarra', 2200, 'LOCAL',  'Cafe de cafeteira, 6 xicaras'),
('CAFE-CHOCALATE',   'Chocolate Quente',        'BEBIDA', 'CAFETERIA', 'xicara', 800, 'GLOBAL', 'Chocolate quente com leite'),

-- Vinhos
('VINH-TINTO-750',   'Vinho Tinto 750ml',       'BEBIDA', 'BEBIDA', 'garrafa', 6500,  'GLOBAL', 'Vinho tinto da casa, 750ml'),
('VINH-BRANCO-750',  'Vinho Branco 750ml',      'BEBIDA', 'BEBIDA', 'garrafa', 6500,  'GLOBAL', 'Vinho branco da casa, 750ml'),
('VINH-ROSE-750',    'Vinho Rose 750ml',        'BEBIDA', 'BEBIDA', 'garrafa', 7000,  'GLOBAL', 'Vinho rose da casa, 750ml'),
('VINH-ESPUMANTE-750','Espumante 750ml',        'BEBIDA', 'BEBIDA', 'garrafa',12000,  'GLOBAL', 'Espumante bruto, 750ml'),
('VINH-COPA-TINTO',  'Copa de Vinho Tinto',     'BEBIDA', 'BEBIDA', 'copo',    2500,  'GLOBAL', 'Copo de vinho tinto, 150ml'),

-- Destilados
('DEST-WHISKY-700',  'Whisky Blended 700ml',    'BEBIDA', 'BEBIDA', 'garrafa',14000,  'GLOBAL', 'Whisky misturado, 700ml'),
('DEST-WHISKY-1000', 'Whisky Premium 1L',       'BEBIDA', 'BEBIDA', 'garrafa',22000,  'GLOBAL', 'Whisky premium, 1 litro'),
('DEST-VODKA-700',   'Vodka 700ml',             'BEBIDA', 'BEBIDA', 'garrafa',11000,  'GLOBAL', 'Vodka neutra, 700ml'),
('DEST-RUM-700',     'Rum 700ml',               'BEBIDA', 'BEBIDA', 'garrafa',11000,  'GLOBAL', 'Rum escuro, 700ml'),
('DEST-GIN-700',     'Gin 700ml',               'BEBIDA', 'BEBIDA', 'garrafa',13000,  'GLOBAL', 'Gin seco, 700ml'),
('DEST-BRANDY-700',  'Conhaque 700ml',          'BEBIDA', 'BEBIDA', 'garrafa',12000,  'GLOBAL', 'Conhaque envelhecido, 700ml'),
('DEST-LICOR-700',   'Licor de Maracuja 700ml', 'BEBIDA', 'BEBIDA', 'garrafa', 9000,  'LOCAL',  'Licor de maracuja, 700ml'),
('DEST-COPO-MISTO',  'Copos de Destilado',      'BEBIDA', 'BEBIDA', 'copo',    3500,  'GLOBAL', 'Dose de destilado, 40ml'),

-- Pratos da cozinha angolana e classica
('PRAT-MUAMBA',      'Muamba de Galinha',       'PRATO', 'COMIDA', 'prato',  3500,  'LOCAL',  'Prato nacional com funge de bombó'),
('PRAT-CALDEIRADA',  'Caldeirada de Peixe',     'PRATO', 'COMIDA', 'prato',  3800,  'LOCAL',  'Caldeirada angolana de peixe'),
('PRAT-MFUMBWA',     'Mfumbwa',                 'PRATO', 'COMIDA', 'prato',  2500,  'LOCAL',  'Folhas de mandioca com óleo de palma'),
('PRAT-FUNGE-CARNE', 'Funge com Carne',         'PRATO', 'COMIDA', 'prato',  3000,  'LOCAL',  'Funge de bombó com carne guisada'),
('PRAT-CACHUPA',     'Cachupa Gorda',           'PRATO', 'COMIDA', 'prato',  3200,  'LOCAL',  'Prato de panela com milho e feijao'),
('PRAT-BIFE-CAFE',   'Bife a Cafe',             'PRATO', 'COMIDA', 'prato',  4200,  'LOCAL',  'Bife com ovo, batata e arroz'),
('PRAT-MAMBA',       'Mamba com Funge',         'PRATO', 'COMIDA', 'prato',  3600,  'LOCAL',  'Carante de mamba com funge'),
('PRAT-CHOCO',       'Choco Frito',             'PRATO', 'COMIDA', 'prato',  4500,  'LOCAL',  'Choco frito com arroz e batata'),
('PRAT-FUNGE-PEIXE', 'Funge com Peixe Seco',    'PRATO', 'COMIDA', 'prato',  3000,  'LOCAL',  'Funge com peixe seco e óleo de palma'),
('PRAT-VACA-ARROZ',  'Carne de Vaca com Arroz', 'PRATO', 'COMIDA', 'prato',  3900,  'LOCAL',  'Carne guisada com arroz branco'),
('PRAT-FRANGO-GRELH','Frango Grelhado',         'PRATO', 'COMIDA', 'prato',  3300,  'LOCAL',  'Frango grelhado com batata'),
('PRAT-CAMARAO',     'Camarao Grelhado',        'PRATO', 'COMIDA', 'prato',  8500,  'LOCAL',  'Camarão grelhado com arroz'),
('PRAT-ARROZ',       'Arroz Branco',            'PRATO', 'COMIDA', 'prato',   900,  'LOCAL',  'Porção de arroz branco'),
('PRAT-FUNGE-BOMBO', 'Funge de Bombó',          'PRATO', 'COMIDA', 'prato',   900,  'LOCAL',  'Porção de funge de bombó'),
('PRAT-BATATA-DOCE', 'Batata Doce Frita',       'PRATO', 'COMIDA', 'prato',  1200,  'LOCAL',  'Porção de batata doce frita'),
('PRAT-OMELETE-GRAN','Omelete Grande',          'PRATO', 'COMIDA', 'prato',  2200,  'LOCAL',  'Omelete com queijo, presunto e batata'),

-- Snacks de bar e snack-bar
('SNCK-HAMBURGUER',  'Hamburguer Classico',     'LANCHE', 'SNACK', 'unidade', 2500, 'GLOBAL', 'Hambúrguer com queijo, alface e tomate'),
('SNCK-HAMB-XBACON', 'Hamburguer com Bacon',    'LANCHE', 'SNACK', 'unidade', 3000, 'GLOBAL', 'Hambúrguer com bacon extra'),
('SNCK-TOSTA-MISTA', 'Tosta Mista',             'LANCHE', 'SNACK', 'unidade', 1500, 'GLOBAL', 'Pão com presunto e queijo prensado'),
('SNCK-CACHORRO',    'Cachorro Quente',         'LANCHE', 'SNACK', 'unidade', 1800, 'GLOBAL', 'Salsicha com molho e batata palha'),
('SNCK-BATATA-FRITA','Batata Frita',            'LANCHE', 'SNACK', 'porcao',  1400, 'GLOBAL', 'Porção de batata frita rústica'),
('SNCK-OMELETE',     'Omelete',                 'LANCHE', 'SNACK', 'unidade', 1600, 'GLOBAL', 'Omelete simples de dois ovos'),
('SNCK-OME-QUEIJO',  'Omelete com Queijo',      'LANCHE', 'SNACK', 'unidade', 1900, 'GLOBAL', 'Omelete recheada com queijo'),
('SNCK-ASINHAS',     'Asinhas de Frango',       'LANCHE', 'SNACK', 'porcao',  2600, 'LOCAL',  'Seis asinhas de frango com molho'),
('SNCK-PIZZA',       'Pizza Individual',        'LANCHE', 'SNACK', 'unidade', 3200, 'GLOBAL', 'Pizza individual de forno'),
('SNCK-SALADA-FRUTA','Salada de Fruta',         'LANCHE', 'SNACK', 'prato',   1200, 'LOCAL',  'Fruta da época cortada à mão'),
('SNCK-IOGURTE',     'Iogurte com Granola',     'LANCHE', 'SNACK', 'tigela',  1500, 'GLOBAL', 'Iogurte natural com granola'),

-- Servicos do hotel
('SERV-WIFI',        'Wi-Fi Premium',           'SERVICO', 'HOSPEDAGEM', 'sessao',     0, 'GLOBAL', 'Acesso de alta velocidade em todo o hotel'),
('SERV-LAVANDARIA',  'Lavagem de Roupa',        'SERVICO', 'LAVANDARIA', 'quilo',   1500, 'LOCAL',  'Lavagem e engomadoria por quilo'),
('SERV-GINASIO',     'Acesso ao Ginasio',       'SERVICO', 'GINASIO',    'entrada', 2500, 'GLOBAL', 'Acesso diário à sala de musculação'),
('SERV-PISCINA',     'Acesso a Piscina',        'SERVICO', 'PISCINA',    'entrada', 2000, 'LOCAL',  'Acesso diário à piscina exterior'),
('SERV-ROOMSERVICE', 'Room Service',            'SERVICO', 'HOSPEDAGEM', 'servico', 1000, 'GLOBAL', 'Entrega de consumos ao quarto'),
('SERV-PARKING',     'Estacionamento',          'SERVICO', 'HOSPEDAGEM', 'diaria',  1000, 'LOCAL',  'Lugar de estacionamento vigiado'),
('SERV-CHECKOUT-TAR','Late Checkout',           'SERVICO', 'HOSPEDAGEM', 'servico', 5000, 'GLOBAL', 'Saida tardia sujeita a disponibilidade'),
('SERV-BABY-SITTING','Baby Sitting',            'SERVICO', 'HOSPEDAGEM', 'hora',    3000, 'GLOBAL', 'Serviço de babysitter por hora')
ON CONFLICT (sku) DO NOTHING;


-- ------------------------------------------------------------
-- 13. Registo da versao
-- ------------------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('011', '011_guest_ledger_rates_prebill.sql')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public._schema_migrations (version, name)
VALUES ('011', '011_guest_ledger_rates_prebill.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/012_tenant_id_default.sql ================
-- ============================================================
-- HR-HOSPITALITY - Migracao 012
-- DEFAULT de tenant_id nas tabelas de tenant que nao tem nenhum
-- ============================================================
-- Sumario:
--   1. Causa-raiz
--   2. DEFAULT public.hr_tenant_id() onde falta
--   3. Registo da versao
--
-- Causa-raiz: a partir da migracao 007 todas as tabelas novas
-- declaram `tenant_id UUID NOT NULL` sem default. A app POS nao
-- envia a coluna - confia na RLS para filtrar pelo perfil em
-- sessao -, pelo que o INSERT chega com tenant_id NULL e o
-- WITH CHECK `tenant_id = hr_tenant_id()` evalua a NULL e
-- rejeita com 42501:
--   new row violates row-level security policy for pos_orders
--
-- Correcao: a coluna passa a ter um default que resolve o tenant
-- a partir da sessao autenticada. O isolamento multi-tenant
-- fica intacto:
--   - o default so se aplica quando a app omite a coluna;
--   - qualquer valor explicito continua a mandar;
--   - as policies continuam a exigir `tenant_id = hr_tenant_id()`
--     e `hr_can_write_module`, portanto ninguem escreve noutro
--     hotel - nao ha bypass, nao ha USING TRUE.
--
-- Nao se toca nas tabelas de 001, 002 e 004: essas ja tem
-- default e troca-lo por hr_tenant_id() passaria a devolver
-- NULL em INSERT de service_role sem sessao, o que quebraria o
-- seed e as operacoes de administracao.
-- ============================================================

-- ---------------------------------------------------
-- 2. DEFAULT onde falta
-- ---------------------------------------------------
-- Percorre o catalogo e so altera colunas `tenant_id`
-- NOT NULL que estejam sem default. Cobre pos_orders,
-- pos_order_items e as restantes tabelas de 007, 008,
-- 010 e 011 com o mesmo defeito latente.
DO $$
DECLARE
    alvo TEXT;
BEGIN
    FOR alvo IN
        SELECT c.table_name
          FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.column_name = 'tenant_id'
           AND c.is_nullable = 'NO'
           AND c.column_default IS NULL
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.hr_tenant_id()',
            alvo
        );
    END LOOP;
END
$$;

-- Nada muda nas policies: pos_orders_write, da migracao 008,
-- ja cobre INSERT com USING e WITH CHECK iguais a
-- `tenant_id = hr_tenant_id() AND hr_can_write_module('pos')`.
-- Criar uma segunda policy identica nao acrescenta seguranca,
-- porque as policies permisivas sao unidas por OU.

-- ---------------------------------------------------
-- 3. Registo da versao
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('012', '012_tenant_id_default.sql')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public._schema_migrations (version, name)
VALUES ('012', '012_tenant_id_default.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/supabase/013_pos_tables_write_grant.sql ================
-- ============================================================
-- HR-HOSPITALITY - Migracao 013
-- GRANT de escrita em pos_tables (o unico que faltava)
-- ============================================================
-- Sumario:
--   1. Causa-raiz
--   2. GRANT de escrita em pos_tables
--   3. Registo da versao
--
-- Causa-raiz: a migracao 008 criou a policy `pos_tables_write`
-- (FOR ALL, com tenant_id = hr_tenant_id() E
-- hr_can_write_module('pos')) mas so emitiu
--   GRANT SELECT ... TO authenticated;
-- O PostgREST valida o GRANT ANTES da RLS, portanto qualquer
-- UPDATE chega ao servidor e devolve
--   permission denied for table pos_tables (42501)
-- sem as policies sequer serem avaliadas. O POS falha ao abrir
-- uma comanda de mesa porque o trigger e a app nao conseguem
-- passar a mesa a OCUPADA.
--
-- E o MESMO defeito que a migracao 011 ja tinha corrigido para
-- pos_products - la o GRANT de escrita passou a existir e o
-- `pos_products_write` deixou de ser inalcancavel. pos_tables
-- ficou por corrigir: e a ultima tabela com o padrao incompleto
-- (auditado em producao: pos_tables ins/upd/del = false com 2
-- policies activas; todas as restantes tabelas com policy de
-- escrita ja tem grants completos).
--
-- Correcao: alinhar o GRANT no padrao ja usado por pos_orders,
-- pos_order_items, inventory_items, inventory_movements e
-- cash_sessions. NAO se mexe em nenhuma policy:
--   - `pos_tables_write` continua a exigir
--     tenant_id = hr_tenant_id() AND hr_can_write_module('pos');
--   - portanto so quem opera o POS do proprio hotel escreve;
--   - nao ha USING (true), nao ha WITH CHECK trivial, nao ha
--     bypass do isolamento multi-tenant.
-- ============================================================

-- ---------------------------------------------------
-- 2. GRANT de escrita em pos_tables
-- ---------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.pos_tables TO authenticated;

-- tenant_audit_log fica so com SELECT de proposito: so e
-- escrito por funcoes SECURITY DEFINER, nunca pela app.

-- ---------------------------------------------------
-- 3. Registo da versao
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('013', '013_pos_tables_write_grant.sql')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public._schema_migrations (version, name)
VALUES ('013', '013_pos_tables_write_grant.sql') ON CONFLICT (version) DO NOTHING;

-- ================ migrations/seeders/supabase_demo.sql ================
-- ============================================================
--   HR-HOSPITALITY — SEEDER DE DEMONSTRAÇÃO (Supabase / Postgres)
-- ============================================================
--   Alimenta o esquema criado por 001..008 com dados de demonstração
--   coerentes para a sessão de demonstração.
--
--   • Idempotente: seguro para re-executar (ON CONFLICT / WHERE NOT EXISTS).
--   • Correr como `postgres` (superuser) via PSQL ou pelo runner:
--         node hr-hospitality-app/scripts/seed.mjs --target=supabase
--   • NÃO cria utilizadores nem palavras-passe: as contas nascem no
--     Supabase Auth e o perfil é criado em `public.app_users`.
--   • O IBAN é deliberadamente o PLACEHOLDER `AO06 0000 …`; a aplicação
--     móvel detecta-o (`isPlaceholderIban`) e recusa enviar instruções de
--     pagamento. Substitua-o e reinicie a app antes do lançamento real.
-- ============================================================

-- ─── 1. Segundo tenant (demonstração de multi-tenancy / RLS) ─────────────────
INSERT INTO public.tenants (id, name, slug, currency, created_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'Hotel Demo Reserva', 'hotel-demo-reserva', 'Kz', now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.hotel_rooms (id, tenant_id, room_number, room_type, status, price_per_night, floor, description)
VALUES
  ('b1111111-1111-4111-8111-000000000201', '22222222-2222-2222-2222-222222222222', '11', 'Standard', 'DISPONIVEL', 130.00, 1, 'Quarto standard (tenant de demonstração)'),
  ('b1111111-1111-4111-8111-000000000202', '22222222-2222-2222-2222-222222222222', '12', 'Standard', 'DISPONIVEL', 130.00, 1, 'Quarto standard (tenant de demonstração)'),
  ('b1111111-1111-4111-8111-000000000203', '22222222-2222-2222-2222-222222222222', '21', 'Double',    'OCUPADO',    200.00, 2, 'Quarto duplo (tenant de demonstração)'),
  ('b1111111-1111-4111-8111-000000000204', '22222222-2222-2222-2222-222222222222', '31', 'Suite',     'DISPONIVEL', 420.00, 3, 'Suite (tenant de demonstração)')
ON CONFLICT (tenant_id, room_number) DO NOTHING;

-- ─── 2. Conta bancária do tenant principal (placeholder deliberado) ──────────
INSERT INTO public.tenant_bank_accounts (
    id, tenant_id, bank_name, iban, account_holder, account_type, currency,
    supports_multicaixa_express, is_primary, is_active, instructions, created_at, updated_at
)
SELECT
    'c1111111-1111-4111-8111-000000000001',
    t.id,
    'Banco de Angola (PLACEHOLDER)',
    'AO06 0000 0000 0000 0000 0000 0',
    'Hotel Lukweku, Lda.',
    'CORRENTE',
    'Kz',
    false,
    true,
    true,
    'IBAN de demonstração. Substituir pelo IBAN real antes de aceitar pagamentos.',
    now(), now()
FROM public.tenants t
WHERE t.id = '11111111-1111-1111-1111-111111111111'
  AND NOT EXISTS (
        SELECT 1 FROM public.tenant_bank_accounts b
         WHERE b.tenant_id = t.id AND b.is_primary
  );

-- ─── 3. Planos de ginásio / piscina ──────────────────────────────────────────
INSERT INTO public.gym_plans (id, tenant_id, name, plan_type, price, duration_days,
                              guest_discount_pct, guest_included, includes_pool, includes_gym,
                              max_guests, description, is_active, sort_order, created_at, updated_at)
SELECT 'd1111111-1111-4111-8111-000000000001', t.id, 'Diária Ginasio', 'DIARIA', 3500.00, 1,
       0, false, false, true, 1, 'Acesso ao ginásio durante um dia.', true, 1, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.gym_plans (id, tenant_id, name, plan_type, price, duration_days,
                              guest_discount_pct, guest_included, includes_pool, includes_gym,
                              max_guests, description, is_active, sort_order, created_at, updated_at)
SELECT 'd1111111-1111-4111-8111-000000000002', t.id, 'Semana Ginasio + Piscina', 'SEMANAL', 15000.00, 7,
       10, false, true, true, 1, 'Acesso semanal ao ginásio e às piscinas.', true, 2, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.gym_plans (id, tenant_id, name, plan_type, price, duration_days,
                              guest_discount_pct, guest_included, includes_pool, includes_gym,
                              max_guests, description, is_active, sort_order, created_at, updated_at)
SELECT 'd1111111-1111-4111-8111-000000000003', t.id, 'Mensal Ilimitado', 'MENSAL', 45000.00, 30,
       100, true, true, true, 2, 'Incluído na diária dos hóspedes.', true, 3, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

-- ─── 4. Catálogos públicos (piscinas, lavandaria, salas de eventos) ──────────
INSERT INTO public.public_pools (id, slug, name, description, depth_min_m, depth_max_m,
                                 opening_hours, image_url, is_active, sort_order, created_at)
SELECT 'e1111111-1111-4111-8111-000000000001', 'piscina-principal', 'Piscina Principal',
       'Piscina olímpica com bar e zona de descanso.', 1.2, 2.0,
       '08:00 – 19:00', NULL, true, 1, now()
WHERE NOT EXISTS (SELECT 1 FROM public.public_pools WHERE slug = 'piscina-principal');

INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT 'e1111111-1111-4111-8111-000000000001', 'Adulto', 4500.00, 'Kz/pessoa', 1
WHERE NOT EXISTS (SELECT 1 FROM public.public_pool_prices WHERE pool_id = 'e1111111-1111-4111-8111-000000000001' AND label = 'Adulto');

INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT 'e1111111-1111-4111-8111-000000000001', 'Criança (até 10 anos)', 2000.00, 'Kz/pessoa', 2
WHERE NOT EXISTS (SELECT 1 FROM public.public_pool_prices WHERE pool_id = 'e1111111-1111-4111-8111-000000000001' AND label = 'Criança (até 10 anos)');

INSERT INTO public.public_pools (id, slug, name, description, depth_min_m, depth_max_m,
                                 opening_hours, image_url, is_active, sort_order, created_at)
SELECT 'e1111111-1111-4111-8111-000000000002', 'piscina-infantil', 'Piscina Infantil',
       'Piscina rasa com atrações aquáticas para crianças.', 0.4, 0.8,
       '09:00 – 18:00', NULL, true, 2, now()
WHERE NOT EXISTS (SELECT 1 FROM public.public_pools WHERE slug = 'piscina-infantil');

INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT 'e1111111-1111-4111-8111-000000000002', 'Criança', 1500.00, 'Kz/pessoa', 1
WHERE NOT EXISTS (SELECT 1 FROM public.public_pool_prices WHERE pool_id = 'e1111111-1111-4111-8111-000000000002' AND label = 'Criança');

INSERT INTO public.public_laundry_services (id, slug, name, description, price, unit,
                                            turnaround_hours, sort_order, is_active, created_at)
VALUES
  ('f1111111-1111-4111-8111-000000000001', 'lavagem-por-kg', 'Lavagem por quilo',
   'Lavagem, secagem e dobragem.', 1800.00, 'Kz/kg', 24, 1, true, now()),
  ('f1111111-1111-4111-8111-000000000002', 'lavagem-urgente', 'Lavagem urgente (6h)',
   'Serviço expresso com suplemento.', 3200.00, 'Kz/kg', 6, 2, true, now()),
  ('f1111111-1111-4111-8111-000000000003', 'engomadoria', 'Engomadoria de peça',
   'Engomadoria de camisas e vestidos.', 2500.00, 'Kz/peça', 12, 3, true, now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.public_event_spaces (id, slug, name, description, capacity,
                                        price_per_hour, price_per_day, image_url,
                                        is_active, sort_order, created_at)
VALUES
  ('a2222222-1111-4111-8111-000000000001', 'salao-lukweku', 'Salão Lukweku',
   'Salão principal para banquetes e conferências.', 250, 45000.00, 320000.00, NULL, true, 1, now()),
  ('a2222222-1111-4111-8111-000000000002', 'sala-reuniao', 'Sala de Reunião',
   'Sala equipada para 20 pessoas com projetor.', 20, 12000.00, 80000.00, NULL, true, 2, now())
ON CONFLICT (slug) DO NOTHING;

-- ─── 5. Recursos humanos ─────────────────────────────────────────────────────
INSERT INTO public.hr_employees (id, tenant_id, employee_code, name, position, department,
                                 hire_date, base_salary, contacts, status, created_at, updated_at)
SELECT 'a3333333-1111-4111-8111-000000000001', t.id, 'EMP-2026-001', 'Ana Manuel', 'Rececionista',
       'Recepção', DATE '2026-01-15', 280000.00, '[{"type":"telefone","value":"+244 900 000 001"}]'::jsonb,
       'ATIVO', now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.hr_employees (id, tenant_id, employee_code, name, position, department,
                                 hire_date, base_salary, contacts, status, created_at, updated_at)
SELECT 'a3333333-1111-4111-8111-000000000002', t.id, 'EMP-2026-002', 'Bruno Cassoma', 'Chefe de Balcão',
       'Recepção', DATE '2025-11-02', 340000.00, '[{"type":"telefone","value":"+244 900 000 002"}]'::jsonb,
       'ATIVO', now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.hr_employees (id, tenant_id, employee_code, name, position, department,
                                 hire_date, base_salary, contacts, status, created_at, updated_at)
SELECT 'a3333333-1111-4111-8111-000000000003', t.id, 'EMP-2026-003', 'Carla Domingos', 'Operadora de POS',
       'Restauração', DATE '2026-03-01', 210000.00, '[]'::jsonb,
       'ATIVO', now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ─── 6. Economato (stock) ────────────────────────────────────────────────────
INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000001', t.id, 'INV-AGUA-500', 'Água mineral 500ml',
       'BEBIDA', 'un', 240, 48, 180.00, 'Lukweku Distribuidora', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000002', t.id, 'INV-CERVEJA-330', 'Cerveja 330ml',
       'BEBIDA', 'un', 180, 60, 420.00, 'Lukweku Distribuidora', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000003', t.id, 'INV-TOALHA', 'Toalha de banho',
       'ROUPARIA', 'un', 120, 40, 2500.00, 'Têxtil Kilamba', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000004', t.id, 'INV-DET', 'Detergente 5L',
       'LIMPEZA', 'un', 25, 10, 3900.00, 'Clean Angola', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

-- ─── 7. Salas / mesas do POS ─────────────────────────────────────────────────
INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000001', t.id, 'SB-01', 'Mesa Snack 1',  'SNACK_BAR',  4, 'LIVRE', true, 1, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000002', t.id, 'SB-02', 'Mesa Snack 2',  'SNACK_BAR',  6, 'LIVRE', true, 2, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000003', t.id, 'BAL-01', 'Balcão',       'BALCAO',     2, 'OCUPADA', true, 3, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000004', t.id, 'PIS-01', 'Esplanada piscina', 'PISCINA', 4, 'LIVRE', true, 4, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ─── 8. Produtos POS (ligados ao economato quando consomem stock) ────────────
INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000001', t.id, 'POS-AGUA-500', 'Água mineral 500ml',
       'BEBIDA', 'un', 700.00,
       (SELECT i.id FROM public.inventory_items i WHERE i.tenant_id = t.id AND i.sku = 'INV-AGUA-500'),
       true, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000002', t.id, 'POS-CERVEJA-330', 'Cerveja 330ml',
       'BEBIDA', 'un', 1500.00,
       (SELECT i.id FROM public.inventory_items i WHERE i.tenant_id = t.id AND i.sku = 'INV-CERVEJA-330'),
       true, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000003', t.id, 'POS-BIFE', 'Bife com batata',
       'COMIDA', 'un', 6500.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000004', t.id, 'POS-CAFÉ', 'Cappuccino',
       'CAFETERIA', 'un', 2200.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000005', t.id, 'POS-BOLACHAS', 'Bolachas 150g',
       'SNACK', 'un', 1200.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000006', t.id, 'POS-ENTRADA-SPA', 'Entrada Spa',
       'HOSPEDAGEM', 'un', 12000.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;


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

COMMIT;
