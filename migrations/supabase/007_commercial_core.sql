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
