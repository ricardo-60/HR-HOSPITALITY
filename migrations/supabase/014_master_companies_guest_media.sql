-- =====================================================================
-- 014 - Empresas do Master Global, eliminação segura em cascata,
--       media de hóspedes e abertura auditada de documentos
-- =====================================================================
-- ÂMBITO
--   1. `tenants` ganha `license_status`, `license_expires_at`,
--      `admin_user_id` e `tax_id`: a instância carrega o seu próprio
--      estado de licença e o apontador para o seu administrador local,
--      em vez de o painel Master reconstruir isso em cada leitura.
--   2. Cascata COMPLETA: `hotel_rooms`, `hotel_reservations`,
--      `hotel_consumptions` e `hr_employees` ainda não tinham FK para
--      `tenants`, pelo que apagar uma empresa deixaria órfãos. Passam a
--      ter `ON DELETE CASCADE`, como as restantes 22 tabelas com
--      `tenant_id`.
--   3. `hr_delete_tenant()` - eliminação de empresa apenas pelo Master
--      Global, com confirmação literal do nome e registo permanente em
--      `master_tenant_deletions`.
--   4. `guest_profiles.photo_url` / `id_document_url` - a fotografia e o
--      BI/Passaporte do hóspede, mantidos por trigger a partir de
--      `guest_documents`, que continua a ser a única fonte de verdade.
--   5. `hr_open_guest_document()` - abrir um documento no balcão fica
--      registado em `tenant_audit_log`.
--   6. `hr_tenant_admins()` - quem pode ser administrador local de cada
--      instância, devolvido pela função em vez de por uma política nova,
--      para não expor os hashes de palavra-passe de `app_users`.
--
-- DECISÕES DE MODELAGEM
--   * `photo_url` e `id_document_url` guardam o CAMINHO no Storage, não
--     uma URL assinada: uma URL assinada expira em 300 s e ficaria
--     partida dentro da base de dados. Quem lê resolve a URL no momento
--     com `createSignedUrl`. A coluna é preenchida por trigger, nunca
--     escrita pela app, para não haver duas fontes de verdade.
--   * `license_status` e `license_expires_at` são DERIVADOS de
--     `system_licenses` por trigger. Não são campos que o painel escreve:
--     o mesmo valor em dois sítios acaba por divergir.
--   * `master_tenant_deletions` NÃO tem FK para `tenants` - exactamente
--     para não ser varrida pela própria cascata que regista.
--   * A eliminação exige o nome exacto da empresa digitado. Um clique
--     perdido nunca apaga uma instância inteira.
--
-- Idempotente - seguro de re-executar.
-- =====================================================================

BEGIN;

-- ── 1. Licença e administrador na própria instância ─────────────────────
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS license_status TEXT NOT NULL DEFAULT 'SEM_LICENCA';

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMPTZ;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS admin_user_id UUID;

-- `tax_id` já existe desde a migração 010; `IF NOT EXISTS` mantém este
-- ficheiro seguro numa instância que a tenha recebido por outro caminho.
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS tax_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenants_license_status_check'
          AND conrelid = 'public.tenants'::regclass
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_license_status_check
            CHECK (license_status IN (
                'SEM_LICENCA', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenants_admin_user_fk'
          AND conrelid = 'public.tenants'::regclass
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_admin_user_fk
            FOREIGN KEY (admin_user_id)
            REFERENCES public.app_users (id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tenants_license_status
    ON public.tenants (license_status)
    WHERE license_status <> 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_tenants_admin_user
    ON public.tenants (admin_user_id)
    WHERE admin_user_id IS NOT NULL;

-- Estado de licença derivado de `system_licenses`. Sem licença registada a
-- instância NÃO é bloqueada (mesma regra da migração 010): só o bloqueio
-- começa quando existe licença e ela caduca.
CREATE OR REPLACE FUNCTION public.hr_tenant_license(p_tenant_id UUID)
RETURNS TABLE (status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH latest AS (
        SELECT sl.*
        FROM public.system_licenses AS sl
        WHERE sl.tenant_id = p_tenant_id
        ORDER BY sl.expires_at DESC NULLS LAST, sl.created_at DESC
        LIMIT 1
    )
    SELECT
        CASE
            WHEN l.id IS NULL THEN 'SEM_LICENCA'
            WHEN l.status = 'SUSPENDED' THEN 'SUSPENDED'
            WHEN now() > l.expires_at + make_interval(days => l.grace_period_days)
                THEN 'EXPIRED'
            WHEN now() > l.expires_at THEN 'GRACE_PERIOD'
            WHEN l.license_type = 'TRAINING_GRACE' THEN 'GRACE_PERIOD'
            ELSE 'ACTIVE'
        END,
        l.expires_at
    FROM (SELECT 1) AS dummy
    LEFT JOIN latest AS l ON TRUE
$$;

-- Qualquer escrita manual em `license_status`/`license_expires_at` é
-- reescrita com o valor derivado: o painel não pode "esticar" uma licença
-- alterando a coluna em vez de emitir uma licença nova.
CREATE OR REPLACE FUNCTION public.tenants_recompute_license()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    SELECT COALESCE(x.status, 'SEM_LICENCA'), x.expires_at
      INTO NEW.license_status, NEW.license_expires_at
      FROM public.hr_tenant_license(NEW.id) AS x;

    IF NEW.license_status IS NULL THEN
        NEW.license_status := 'SEM_LICENCA';
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenants_license_recompute ON public.tenants;
CREATE TRIGGER tenants_license_recompute
    BEFORE INSERT OR UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.tenants_recompute_license();

-- Emitir, suspender ou prolongar uma licença reflecte-se de imediato na
-- instância, sem que o painel tenha de fazer join em cada leitura.
CREATE OR REPLACE FUNCTION public.sync_tenant_license()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant UUID;
    v_status TEXT;
    v_expires TIMESTAMPTZ;
BEGIN
    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    IF v_tenant IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(x.status, 'SEM_LICENCA'), x.expires_at
      INTO v_status, v_expires
      FROM public.hr_tenant_license(v_tenant) AS x;

    UPDATE public.tenants
       SET license_status = COALESCE(v_status, 'SEM_LICENCA'),
           license_expires_at = v_expires
     WHERE id = v_tenant
       AND (
           license_status IS DISTINCT FROM COALESCE(v_status, 'SEM_LICENCA')
           OR license_expires_at IS DISTINCT FROM v_expires
       );

    RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS system_licenses_sync_tenant ON public.system_licenses;
CREATE TRIGGER system_licenses_sync_tenant
    AFTER INSERT OR UPDATE OR DELETE ON public.system_licenses
    FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_license();

-- ── 2. Estado actual das instâncias e do administrador local ────────────
UPDATE public.tenants AS t
   SET license_status = sub.status,
       license_expires_at = sub.expires
  FROM (
        SELECT t2.id,
               COALESCE(x.status, 'SEM_LICENCA') AS status,
               x.expires_at AS expires
          FROM public.tenants AS t2
          LEFT JOIN LATERAL public.hr_tenant_license(t2.id) AS x ON TRUE
       ) AS sub
 WHERE t.id = sub.id
   AND (
       t.license_status IS DISTINCT FROM sub.status
       OR t.license_expires_at IS DISTINCT FROM sub.expires
   );

-- O administrador local é o administrador ACTIVO da instância que não é o
-- Master Global. Feito por SQL, não pelo painel: cada instância passa a ter
-- o seu admin apontado mesmo que nunca tenha aberto o ecrã de gestão.
UPDATE public.tenants AS t
   SET admin_user_id = sub.admin_id
  FROM (
        SELECT DISTINCT ON (au.tenant_id)
               au.tenant_id,
               au.id AS admin_id
          FROM public.app_users AS au
         WHERE au.tenant_id IS NOT NULL
           AND au.role = 'ADMINISTRATOR'
           AND au.status = 'ATIVO'
           AND au.is_master_global = false
         ORDER BY au.tenant_id, au.created_at
       ) AS sub
 WHERE t.id = sub.tenant_id
   AND t.admin_user_id IS NULL;

-- ── 3. Cascata completa a partir de `tenants` ───────────────────────────
-- Falta a ligação em quatro tabelas herdadas do esquema legado. Uma empresa
-- eliminada deixaria quartos, reservas, consumos e funcionários órfãos, e o
-- orfão continuaria visível em relatórios de quem já não tem instância.
-- A migração recusa-se a correr em vez de apagar silenciosamente linhas que
-- não pertençam a nenhuma empresa.
DO $$
DECLARE
    tbl TEXT;
    orphans BIGINT;
    fk_name TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'hotel_rooms', 'hotel_reservations', 'hotel_consumptions', 'hr_employees'
    ]
    LOOP
        fk_name := tbl || '_tenant_fk';

        IF EXISTS (
            SELECT 1
              FROM pg_constraint AS c
              JOIN pg_class AS r ON r.oid = c.conrelid
              JOIN pg_namespace AS n ON n.oid = r.relnamespace
             WHERE c.contype = 'f'
               AND c.confrelid = 'public.tenants'::regclass
               AND n.nspname = 'public'
               AND r.relname = tbl
               AND EXISTS (
                   SELECT 1
                     FROM unnest(c.conkey) AS k(attnum)
                     JOIN pg_attribute AS a
                       ON a.attrelid = c.conrelid AND a.attnum = k.attnum
                    WHERE a.attname = 'tenant_id'
               )
        ) THEN
            RAISE NOTICE 'ligação de tenants já existe em % - ignorada', tbl;
            CONTINUE;
        END IF;

        EXECUTE format(
            'SELECT count(*) FROM public.%I AS c '
            'WHERE c.tenant_id IS NOT NULL '
            'AND NOT EXISTS (SELECT 1 FROM public.tenants AS t WHERE t.id = c.tenant_id)',
            tbl
        ) INTO orphans;

        IF orphans > 0 THEN
            RAISE EXCEPTION
                'Não é possível ligar % a tenants: % linha(s) órfã(s) de tenant_id.',
                tbl, orphans;
        END IF;

        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I '
            'FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE',
            tbl, fk_name
        );
        RAISE NOTICE 'cascata ON DELETE CASCADE adicionada em %', tbl;
    END LOOP;
END
$$;

-- ── 4. Eliminação segura de empresa ─────────────────────────────────────
-- Sem FK para `tenants`: a linha tem de sobreviver ao que regista.
CREATE TABLE IF NOT EXISTS public.master_tenant_deletions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    tenant_name TEXT NOT NULL,
    tenant_slug TEXT,
    actor_id UUID,
    actor_role TEXT,
    confirm_input TEXT NOT NULL,
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    storage_objects_removed BIGINT NOT NULL DEFAULT 0,
    storage_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS master_tenant_deletions_tenant_idx
    ON public.master_tenant_deletions (tenant_id);

CREATE INDEX IF NOT EXISTS master_tenant_deletions_created_idx
    ON public.master_tenant_deletions (created_at DESC);

CREATE OR REPLACE FUNCTION public.hr_delete_tenant(
    p_tenant_id UUID,
    p_confirm TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name TEXT;
    v_slug TEXT;
    v_actor UUID;
    v_role TEXT;
    v_counts JSONB;
    v_removed BIGINT := 0;
    v_storage_error TEXT;
    v_deleted INT := 0;
BEGIN
    IF NOT (SELECT public.hr_is_master_global()) THEN
        RAISE EXCEPTION 'Apenas o Utilizador Master Global pode eliminar empresas.';
    END IF;

    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Empresa não indicada.';
    END IF;

    SELECT t.name, t.slug INTO v_name, v_slug
      FROM public.tenants AS t
     WHERE t.id = p_tenant_id;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Empresa não encontrada.';
    END IF;

    -- Ninguém apaga a instância em que está a trabalhar: era uma forma de
    -- apagar a própria sessão e o próprio perfil de administração.
    IF p_tenant_id = (SELECT public.hr_tenant_id()) THEN
        RAISE EXCEPTION 'Não pode eliminar a instância em que está a trabalhar.';
    END IF;

    -- Confirmação literal do nome. Um clique perdido nunca apaga uma
    -- instância inteira.
    IF btrim(COALESCE(p_confirm, '')) <> btrim(v_name) THEN
        RAISE EXCEPTION 'Confirmação errada: escreva exactamente "%".', v_name;
    END IF;

    v_actor := (SELECT auth.uid());
    v_role := (
        SELECT au.role
          FROM public.app_users AS au
         WHERE au.auth_user_id = v_actor
           AND au.tenant_id = p_tenant_id
         LIMIT 1
    );

    -- Contagem ANTES da cascata, para o registo explicar o que desapareceu.
    SELECT jsonb_build_object(
        'quartos',            (SELECT count(*) FROM public.hotel_rooms WHERE tenant_id = p_tenant_id),
        'reservas',           (SELECT count(*) FROM public.hotel_reservations WHERE tenant_id = p_tenant_id),
        'consumos',           (SELECT count(*) FROM public.hotel_consumptions WHERE tenant_id = p_tenant_id),
        'utilizadores',       (SELECT count(*) FROM public.app_users WHERE tenant_id = p_tenant_id),
        'funcionarios',       (SELECT count(*) FROM public.hr_employees WHERE tenant_id = p_tenant_id),
        'hospedes',           (SELECT count(*) FROM public.guest_profiles WHERE tenant_id = p_tenant_id),
        'documentos',         (SELECT count(*) FROM public.guest_documents WHERE tenant_id = p_tenant_id),
        'mesas_pos',          (SELECT count(*) FROM public.pos_tables WHERE tenant_id = p_tenant_id),
        'produtos_pos',       (SELECT count(*) FROM public.pos_products WHERE tenant_id = p_tenant_id),
        'comandas',           (SELECT count(*) FROM public.pos_orders WHERE tenant_id = p_tenant_id),
        'licencas',           (SELECT count(*) FROM public.system_licenses WHERE tenant_id = p_tenant_id),
        'despesas',           (SELECT count(*) FROM public.daily_expenses WHERE tenant_id = p_tenant_id),
        'lancamentos',        (SELECT count(*) FROM public.financial_transactions WHERE tenant_id = p_tenant_id)
    ) INTO v_counts;

    -- Os ficheiros de KYC e comprovativos não têm FK: são linhas de objectos
    -- no Storage. Limpos aqui, dentro de um bloco de excepção próprio, para
    -- que uma falha do Storage não impeça a eliminação da base de dados.
    BEGIN
        DELETE FROM storage.objects
         WHERE bucket_id IN ('kyc-documents', 'payment-proofs')
           AND public.hr_storage_path_tenant(name) = p_tenant_id;
        GET DIAGNOSTICS v_removed = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_storage_error := SQLERRM;
    END;

    -- Desligar primeiro o apontador circular para a própria instância: a
    -- cascata apaga os `app_users` e o SET NULL desta FK já não tem nada
    -- para actualizar.
    UPDATE public.tenants SET admin_user_id = NULL WHERE id = p_tenant_id;

    DELETE FROM public.tenants WHERE id = p_tenant_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Empresa não encontrada.';
    END IF;

    INSERT INTO public.master_tenant_deletions (
        tenant_id, tenant_name, tenant_slug, actor_id, actor_role,
        confirm_input, counts, storage_objects_removed, storage_error
    )
    VALUES (
        p_tenant_id, v_name, v_slug, v_actor, v_role,
        btrim(p_confirm), v_counts, v_removed, v_storage_error
    );

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'tenant_name', v_name,
        'counts', v_counts,
        'storage_objects_removed', v_removed,
        'storage_error', v_storage_error
    );
END
$$;

-- ── 5. Media do hóspede: fotografia e BI/Passaporte ─────────────────────
ALTER TABLE public.guest_profiles
    ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE public.guest_profiles
    ADD COLUMN IF NOT EXISTS id_document_url TEXT;

-- Mantidas por trigger a partir de `guest_documents`. Guardam o caminho no
-- Storage, nunca uma URL assinada - essa expiraria.
CREATE OR REPLACE FUNCTION public.sync_guest_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_guest UUID;
    v_photo TEXT;
    v_document TEXT;
BEGIN
    v_guest := COALESCE(NEW.guest_profile_id, OLD.guest_profile_id);
    IF v_guest IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(
               MAX(d.storage_path) FILTER (WHERE d.kind = 'SELFIE'),
               MAX(d.storage_path) FILTER (WHERE d.kind = 'BI_VERSO')
           ),
           COALESCE(
               MAX(d.storage_path) FILTER (WHERE d.kind = 'BI_FRENTE'),
               MAX(d.storage_path) FILTER (WHERE d.kind = 'PASSAPORTE')
           )
      INTO v_photo, v_document
      FROM public.guest_documents AS d
     WHERE d.guest_profile_id = v_guest;

    UPDATE public.guest_profiles
       SET photo_url = v_photo,
           id_document_url = v_document
     WHERE id = v_guest
       AND (photo_url IS DISTINCT FROM v_photo
            OR id_document_url IS DISTINCT FROM v_document);

    RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS guest_documents_sync_media ON public.guest_documents;
CREATE TRIGGER guest_documents_sync_media
    AFTER INSERT OR UPDATE OR DELETE ON public.guest_documents
    FOR EACH ROW EXECUTE FUNCTION public.sync_guest_media();

-- Quem carrega um documento no balcão fica registado. A 008 auditava
-- `guest_profiles` mas esqueceu `guest_documents`, que é onde estão os
-- ficheiros de identificação.
DROP TRIGGER IF EXISTS guest_documents_audit ON public.guest_documents;
CREATE TRIGGER guest_documents_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.guest_documents
    FOR EACH ROW EXECUTE FUNCTION public.write_tenant_audit();

-- ── 6. Abertura auditada de documentos no balcão ────────────────────────
CREATE OR REPLACE FUNCTION public.hr_open_guest_document(p_document_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    d RECORD;
    v_role TEXT;
BEGIN
    IF NOT (SELECT public.hr_is_master_global())
       AND (SELECT public.hr_tenant_id()) IS NULL THEN
        RAISE EXCEPTION 'Sessão sem empresa associada.';
    END IF;

    SELECT gd.id, gd.tenant_id, gd.kind, gd.storage_path, gd.mime_type
      INTO d
      FROM public.guest_documents AS gd
     WHERE gd.id = p_document_id;

    IF d IS NULL THEN
        RAISE EXCEPTION 'Documento não encontrado.';
    END IF;

    IF NOT ((SELECT public.hr_is_master_global())
            OR d.tenant_id = (SELECT public.hr_tenant_id())) THEN
        RAISE EXCEPTION 'Sem acesso a este documento.';
    END IF;

    v_role := (
        SELECT au.role
          FROM public.app_users AS au
         WHERE au.auth_user_id = (SELECT auth.uid())
           AND au.tenant_id = d.tenant_id
         LIMIT 1
    );

    INSERT INTO public.tenant_audit_log (
        tenant_id, actor_id, actor_role, action, entity_table,
        entity_id, after_data
    )
    VALUES (
        d.tenant_id, (SELECT auth.uid()), v_role, 'DOCUMENTO_ABERTO',
        'guest_documents', d.id::text,
        jsonb_build_object(
            'kind', d.kind,
            'storage_path', d.storage_path,
            'mime_type', d.mime_type
        )
    );

    RETURN jsonb_build_object(
        'storage_path', d.storage_path,
        'kind', d.kind,
        'mime_type', d.mime_type
    );
END
$$;

-- ── 7. Administrador local de cada instância ─────────────────────────────
-- O Master Global precisa de saber quem gere cada hotel. Ler `app_users`
-- directamente não dá: a tabela guarda os hashes de palavra-passe e a RLS só
-- deixa ver a própria instância. Em vez de uma política nova, uma função
-- SECURITY DEFINER que só devolve o essencial e só corre para o Master.
CREATE OR REPLACE FUNCTION public.hr_tenant_admins(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    role TEXT,
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT au.id, au.name, au.email, au.role, au.status
    FROM public.app_users AS au
    WHERE au.tenant_id = p_tenant_id
      AND au.role = 'ADMINISTRATOR'
      AND (SELECT public.hr_is_master_global())
    ORDER BY au.status, au.name
$$;

-- ── 8. RLS e privilégios ────────────────────────────────────────────────
ALTER TABLE public.master_tenant_deletions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.master_tenant_deletions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.master_tenant_deletions TO service_role;
GRANT SELECT ON TABLE public.master_tenant_deletions TO authenticated;

DROP POLICY IF EXISTS master_tenant_deletions_read ON public.master_tenant_deletions;
CREATE POLICY master_tenant_deletions_read
    ON public.master_tenant_deletions
    FOR SELECT
    TO authenticated
    USING ((SELECT public.hr_is_master_global()));

-- `tenants` já tem SELECT/INSERT/UPDATE de tabela inteira desde 005 e 010,
-- por isso as colunas novas estão cobertas. Concedemos mesmo assim de forma
-- explícita para que uma revogação futura coluna a coluna não as deixe de
-- fora, como já aconteceu com a 007 em `tenant_bank_accounts`.
GRANT SELECT (license_status, license_expires_at, admin_user_id, tax_id)
    ON TABLE public.tenants TO authenticated;
GRANT SELECT (photo_url, id_document_url)
    ON TABLE public.guest_profiles TO authenticated;

REVOKE ALL ON FUNCTION public.hr_tenant_license(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_delete_tenant(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_open_guest_document(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_tenant_admins(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hr_tenant_license(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_delete_tenant(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_open_guest_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_tenant_admins(UUID) TO authenticated;

-- ---------------------------------------------------
-- 9. Registo da versão
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('014', '014_master_companies_guest_media.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
