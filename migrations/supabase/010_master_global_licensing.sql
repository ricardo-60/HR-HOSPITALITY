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
