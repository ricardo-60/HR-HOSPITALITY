-- ============================================================
--   HR-HOSPITALITY — BUNDLE UNICO (migracoes 001..008 + seed + master)
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
INSERT INTO public.app_users (
    id, tenant_id, auth_user_id, email, employee_code, name, role,
    commission_rate, restrictions, allowed_modules, status,
    must_change_password, created_at, updated_at
) VALUES (
    '9e42e6aa-5155-4440-b368-5972fe391669',
    '11111111-1111-1111-1111-111111111111',
    '9e42e6aa-5155-4440-b368-5972fe391669',
    'hermenegildo.ricardo@gmail.com',
    'MASTER',
    'Hermenegildo Ricardo',
    'ADMINISTRATOR',
    0.0200,
    '[]'::jsonb,
    '["*"]'::jsonb,
    'ATIVO',
    false, NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email,
    employee_code = EXCLUDED.employee_code,
    name = EXCLUDED.name,
    role = 'ADMINISTRATOR',
    allowed_modules = '["*"]'::jsonb,
    status = 'ATIVO',
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
