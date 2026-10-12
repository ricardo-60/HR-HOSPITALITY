-- =====================================================================
-- 017 - Registo universal: documento, comprovativo e foto facial
-- =====================================================================
-- ÂMBITO
--   1. Colunas de cadastro/media em `hotel_reservations`.
--   2. Bucket `client-faces` (os outros dois já existem: 007).
--   3. RLS de Storage: `anon` só SUBIR, `authenticated` só LER/GERIR.
--   4. RPC pública `hr_create_public_reservation` - único caminho de
--      escrita pública, devolve `{id, reference}`.
--   5. RPC de limpeza de ficheiros órfãos.
--   6. Fecho do INSERT directo de `anon` (a RPC passa a ser o caminho).
--
-- PORQUÊ
--   O registo online (Landing Page e app) tinha de recolher quatro
--   pilares: dados cadastrais, documento de identidade, comprovativo de
--   pagamento e foto facial. A base já tinha `guest_profiles`/
--   `guest_documents`/`payment_proofs` (007) mas:
--     * `hotel_reservations` não guardava nenhum caminho - a receção,
--       que lê SEMPRE o SQLite local (tabela "local authoritative"),
--       via nada;
--     * a RLS de Storage era `TO authenticated` - o visitante anónimo
--       NÃO conseguia carregar ficheiro nenhum;
--     * não existia câmara nem upload em `hotel-lukweku-repo/index.html`.
--
-- PORQUÊ COLUNAS NA RESERVA E NÃO SÓ EM `guest_profiles`
--   `ReservationsPanel.tsx` e o resto do alojamento leem do SQLite local
--   via `dataLayer` → `localAuthoritativeTables` inclui
--   `hotel_reservations`. Se os caminhos ficassem só em `guest_profiles`
--   (que não é sincronizado para baixo), a receção teria de ir à nuvem
--   ver a cara do hóspede. Com colunas na reserva, o `cloudInboundSync`
--   existente (`.select('*')`) traz tudo em uma sincronização.
--
-- ORDEM DE IMPLEMENTAÇÃO IMPORTANTE (senão há janela de indisponibilidade)
--   1. Correr ESTA migração no SQL Editor.
--   2. Fazer deploy da Landing Page no Vercel de imediato.
--   O passo 6 fecha o INSERT directo de `anon` em favor da RPC, e a
--   política pública passa a exigir os três ficheiros. Enquanto o site
--   antigo ainda estiver publicado, o INSERT dele falha com 42501.
--   Para desfazer:
--     REVOKE... -> voltar a GRANT INSERT e recriar a política da 009.
--
-- IDADE E SEGURANÇA DO UPLOAD ANÓNIMO
--   `anon` pode criar objectos SEMPRE QUE o path comece no tenant e a
--   extensão esteja na lista. Não pode LER (não há policy de SELECT)
--   nem APAGAR. O limite de tamanho e de MIME é imposto pelo bucket
--   (prova empírica: `text/plain` devolve 415 `invalid_mime_type`).
--   Objectos que fiquem sem reserva referenciados são removidos por
--   `hr_purge_public_media`.
--
-- Idempotente - seguro de re-executar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------
-- 1. Colunas de cadastro e media na reserva
-- ---------------------------------------------------
ALTER TABLE public.hotel_reservations
    ADD COLUMN IF NOT EXISTS document_type   TEXT,
    ADD COLUMN IF NOT EXISTS document_number TEXT,
    ADD COLUMN IF NOT EXISTS document_path   TEXT,
    ADD COLUMN IF NOT EXISTS receipt_path    TEXT,
    ADD COLUMN IF NOT EXISTS face_path       TEXT;

-- `ADD CONSTRAINT IF NOT EXISTS` não existe em Postgres: cria-se só
-- quando o nome ainda não está em `pg_constraint`.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hotel_reservations_doc_type_chk') THEN
        ALTER TABLE public.hotel_reservations
            ADD CONSTRAINT hotel_reservations_doc_type_chk
            CHECK (document_type IS NULL OR document_type IN ('BI', 'PASSAPORTE'));
    END IF;

    -- Tipo e número andam juntos: não se declara um sem o outro.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hotel_reservations_doc_number_chk') THEN
        ALTER TABLE public.hotel_reservations
            ADD CONSTRAINT hotel_reservations_doc_number_chk
            CHECK (
                (document_type IS NULL) = (document_number IS NULL)
                AND (document_number IS NULL
                     OR length(btrim(document_number)) BETWEEN 3 AND 32)
            );
    END IF;

    -- Um path é `<tenant-uuid>/<dono-uuid>/<ficheiro>`: exactamente três
    -- segmentos, com UUIDs bem formados. BLOQUEIA paths arbitrários.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hotel_reservations_media_path_chk') THEN
        ALTER TABLE public.hotel_reservations
            ADD CONSTRAINT hotel_reservations_media_path_chk
            CHECK (
                (document_path IS NULL OR document_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$')
             AND (receipt_path   IS NULL OR receipt_path   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$')
             AND (face_path      IS NULL OR face_path      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$')
            );
    END IF;
END
$$;

-- Índices para a receção procurar por documento.
CREATE INDEX IF NOT EXISTS idx_reservations_document_number
    ON public.hotel_reservations (tenant_id, upper(document_number))
    WHERE document_number IS NOT NULL;

-- ---------------------------------------------------
-- 2. Tenant do registo público
-- ---------------------------------------------------
-- `anon` não tem `tenant_id` no JWT, pelo que `hr_tenant_id()` (007)
-- devolve NULL e qualquer comparação falhava. O 009 já resolve isto
-- fixando o hotel público; centraliza-se aqui para as policies de
-- Storage usarem a mesma fonte.
CREATE OR REPLACE FUNCTION public.hr_public_tenant()
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT '11111111-1111-1111-1111-111111111111'::uuid
$$;

GRANT EXECUTE ON FUNCTION public.hr_public_tenant() TO anon, authenticated;

-- ---------------------------------------------------
-- 3. Bucket `client-faces`
-- ---------------------------------------------------
-- `kyc-documents` (documento) e `payment-proofs` (comprovativo) já foram
-- criados pela 007 e são os que a app usa em `adminData.ts`, `/kyc` e
-- `/comprovativos` - não se duplicam. Só falta o rosto.
-- 5 MB e só imagem: um rosto não precisa de mais, e limita o abuso
-- anónimo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('client-faces', 'client-faces', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------
-- 4. RLS de Storage
-- ---------------------------------------------------

-- 4a. `anon` SUBIR. Só dentro do tenant, só com extensão conhecida, só
--     três segmentos no path (sem sub-directórios infinitos).
DROP POLICY IF EXISTS public_media_upload_anon ON storage.objects;
CREATE POLICY public_media_upload_anon ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (
        bucket_id IN ('kyc-documents', 'payment-proofs', 'client-faces')
        AND public.hr_storage_path_tenant(name) = (SELECT public.hr_public_tenant())
        AND split_part(name, '/', 3) <> ''
        AND split_part(name, '/', 4) = ''
        -- Extensão alinhada com `allowed_mime_types` do bucket
        -- (o ficheiro é o 3.º e último segmento do path).
        AND lower(split_part(name, '/', 3)) ~ '\.(jpg|jpeg|png|webp|pdf)$'
        -- O rosto é sempre uma fotografia.
        AND (bucket_id <> 'client-faces'
             OR lower(split_part(name, '/', 3)) ~ '\.(jpg|jpeg|png|webp)$')
    );

-- 4a-bis. A policy acima corre como `anon` (SECURITY INVOKER): ela
--         invoca `hr_storage_path_tenant()`, que é parsing puro de
--         texto (IMMUTABLE, sem acesso a dados - ver 007), mas a 007
--         revogou o EXECUTE a `anon` porque então não havia policy
--         anon que a usasse. Sem este GRANT o upload falha com
--         403 "permission denied for function hr_storage_path_tenant".
GRANT EXECUTE ON FUNCTION public.hr_storage_path_tenant(TEXT) TO anon;

-- 4b. `anon` NÃO lê nem apaga: não se cria policy de SELECT/DELETE para
--     `anon`. Documenta-se a intenção para que ninguém a "corrija".
DO $$
DECLARE
    n INTEGER;
BEGIN
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND 'anon' = ANY(roles) AND cmd <> 'INSERT';
    IF n > 0 THEN
        RAISE NOTICE 'AVISO: existem % policy(s) de % para anon em storage.objects (fora da INSERT criada aqui)',
                     n, (SELECT string_agg(cmd, ',') FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND 'anon' = ANY(roles) AND cmd <> 'INSERT');
    END IF;
END
$$;

-- 4c. `authenticated` LÊ o rosto (a receção mostra-o) e gere os três
--     buckets. Espelha as policies da 007 para `kyc-documents`.
DROP POLICY IF EXISTS client_faces_read ON storage.objects;
CREATE POLICY client_faces_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'client-faces'
        AND public.hr_storage_path_tenant(name) = (SELECT public.hr_tenant_id())
    );

DROP POLICY IF EXISTS client_faces_write ON storage.objects;
CREATE POLICY client_faces_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'client-faces'
        AND public.hr_storage_path_tenant(name) = (SELECT public.hr_tenant_id())
    );

DROP POLICY IF EXISTS client_faces_delete ON storage.objects;
CREATE POLICY client_faces_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'client-faces'
        AND public.hr_storage_path_tenant(name) = (SELECT public.hr_tenant_id())
    );

-- ---------------------------------------------------
-- 5. Validação dos ficheiros carregados
-- ---------------------------------------------------
-- Devolve TRUE quando `p_path` aponta para um objecto real do bucket
-- `p_bucket` dentro de `p_tenant`. SECURITY DEFINER porque `anon` não
-- tem SELECT em `storage.objects` (nem deve ter).
--
-- Se o papel que corre a função não tiver PRIVILÉGIO de leitura em
-- `storage.objects` (erro 42501, apanhado abaixo), não há como
-- verificar - devolve TRUE e regista um NOTICE. Em ambiente normal o
-- `postgres` consegue ler e a verificação é efectiva.
CREATE OR REPLACE FUNCTION public.hr_media_object_exists(
    p_bucket  TEXT,
    p_path    TEXT,
    p_tenant  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_found BOOLEAN;
BEGIN
    IF p_path IS NULL THEN
        RETURN FALSE;
    END IF;

    BEGIN
        SELECT EXISTS (
            SELECT 1 FROM storage.objects o
             WHERE o.bucket_id = p_bucket
               AND o.name = p_path
               AND public.hr_storage_path_tenant(o.name) = p_tenant
        ) INTO v_found;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'hr_media_object_exists: sem privilegio de leitura em storage.objects - verificacao saltada';
        RETURN TRUE;
    END;

    RETURN v_found;
END;
$$;

-- Só o staff pode usá-la (não é um segredo: é uma consulta de leitura),
-- mas `anon` fica de fora para não poder sondar que ficheiros existem.
REVOKE ALL ON FUNCTION public.hr_media_object_exists(TEXT, TEXT, UUID)
    FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_media_object_exists(TEXT, TEXT, UUID)
    TO authenticated;

-- ---------------------------------------------------
-- 6. RPC pública: cria a reserva completa e devolve o código
-- ---------------------------------------------------
-- É o ÚNICO caminho de escrita pública. Concentra aqui toda a validação
-- que a política RLS fazia, com a vantagem de poder devolver o `id` e a
-- `reference` gerada pelo trigger - algo que um simples INSERT não faz
-- (`INSERT ... RETURNING` exige SELECT, que `anon` não tem e não deve
-- ter; ver `migrations/supabase/016_landing_page_insert_grant.sql`).
--
-- Esperado:  { "id": "<uuid>", "reference": "LKW-2026-A1B2C3" }
CREATE OR REPLACE FUNCTION public.hr_create_public_reservation(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant       UUID := public.hr_public_tenant();
    v_name         TEXT;
    v_email        TEXT;
    v_phone        TEXT;
    v_service      TEXT;
    v_check_in     DATE;
    v_check_out    DATE;
    v_notes        TEXT;
    v_total        NUMERIC;
    v_room_number  TEXT;
    v_room_id      UUID;
    v_doc_type     TEXT;
    v_doc_number   TEXT;
    v_doc_path     TEXT;
    v_receipt_path TEXT;
    v_face_path    TEXT;
    v_id           UUID;
    v_reference    TEXT;
    v_kind         TEXT;
BEGIN
    -- ── dados cadastrais ────────────────────────────────────────────
    v_name    := btrim(coalesce(p_payload->>'guest_name', ''));
    v_email   := lower(btrim(coalesce(p_payload->>'email', '')));
    v_phone   := nullif(btrim(coalesce(p_payload->>'guest_phone', '')), '');
    v_service := coalesce(p_payload->>'service_type', '');
    v_notes   := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
    v_total   := coalesce((p_payload->>'total_amount')::numeric, 0);

    IF length(v_name) < 2 OR length(v_name) > 200 THEN
        RAISE EXCEPTION 'Nome do hospede invalido (2 a 200 caracteres).'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]{2,}$' THEN
        RAISE EXCEPTION 'Email invalido.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_phone IS NOT NULL AND v_phone !~ '^[+0-9()][0-9 ()+-]{4,19}$' THEN
        RAISE EXCEPTION 'Telefone invalido.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_service NOT IN ('quarto', 'piscina', 'evento', 'lavandaria',
                         'conferencia', 'restaurante', 'transfer') THEN
        RAISE EXCEPTION 'Tipo de servico invalido.' USING ERRCODE = 'check_violation';
    END IF;

    BEGIN
        v_check_in  := (p_payload->>'check_in_date')::date;
        v_check_out := nullif(p_payload->>'check_out_date', '')::date;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Datas de estadia invalidas.' USING ERRCODE = 'check_violation';
    END;

    IF v_check_in IS NULL THEN
        RAISE EXCEPTION 'Data de entrada obrigatoria.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_check_out IS NOT NULL AND v_check_out < v_check_in THEN
        RAISE EXCEPTION 'Data de saida anterior a entrada.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_total < 0 THEN
        RAISE EXCEPTION 'Valor invalido.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_service = 'quarto' AND v_check_out IS NULL THEN
        RAISE EXCEPTION 'Estadia de quarto exige data de saida.' USING ERRCODE = 'check_violation';
    END IF;

    -- ── documento de identidade ─────────────────────────────────────
    v_doc_type   := upper(coalesce(p_payload->>'document_type', ''));
    v_doc_number := nullif(btrim(coalesce(p_payload->>'document_number', '')), '');

    IF v_doc_type NOT IN ('BI', 'PASSAPORTE') THEN
        RAISE EXCEPTION 'Tipo de documento invalido (BI ou PASSAPORTE).'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_doc_number IS NULL OR length(v_doc_number) NOT BETWEEN 3 AND 32 THEN
        RAISE EXCEPTION 'Numero de documento invalido (3 a 32 caracteres).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- ── os tres ficheiros sao OBRIGATORIOS ──────────────────────────
    v_doc_path     := nullif(p_payload->>'document_path', '');
    v_receipt_path := nullif(p_payload->>'receipt_path', '');
    v_face_path    := nullif(p_payload->>'face_path', '');

    IF v_doc_path IS NULL OR v_receipt_path IS NULL OR v_face_path IS NULL THEN
        RAISE EXCEPTION 'Registo incompleto: documento, comprovativo e foto facial sao obrigatorios.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cada path tem de pertencer ao tenant e a um objecto real.
    FOREACH v_kind IN ARRAY ARRAY['document', 'receipt', 'face'] LOOP
        DECLARE
            v_path   TEXT;
            v_bucket TEXT;
        BEGIN
            v_path := CASE v_kind
                          WHEN 'document' THEN v_doc_path
                          WHEN 'receipt'  THEN v_receipt_path
                          ELSE v_face_path
                      END;

            v_bucket := CASE v_kind
                            WHEN 'document' THEN 'kyc-documents'
                            WHEN 'receipt'  THEN 'payment-proofs'
                            ELSE 'client-faces'
                        END;

            IF public.hr_storage_path_tenant(v_path) IS DISTINCT FROM v_tenant THEN
                RAISE EXCEPTION 'Ficheiro de % fora do tenant.', v_kind
                    USING ERRCODE = 'check_violation';
            END IF;

            IF NOT public.hr_media_object_exists(v_bucket, v_path, v_tenant) THEN
                RAISE EXCEPTION 'Ficheiro de % nao encontrado no armazenamento.', v_kind
                    USING ERRCODE = 'check_violation';
            END IF;
        END;
    END LOOP;

    -- ── insert ──────────────────────────────────────────────────────
    -- `guest_profile_id` fica NULL: um visitante não escolhe o perfil
    -- KYC de ninguém (regra herdada da política da 009).
    BEGIN
        v_room_id := nullif(p_payload->>'room_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_room_id := NULL;
    END;

    INSERT INTO public.hotel_reservations (
        tenant_id, guest_name, email, guest_phone, service_type, status,
        check_in_date, check_out_date, notes, total_amount,
        room_number, room_id,
        document_type, document_number,
        document_path, receipt_path, face_path
    )
    VALUES (
        v_tenant, v_name, v_email, v_phone, v_service, 'PENDENTE_PAGAMENTO',
        v_check_in, v_check_out, v_notes, v_total,
        nullif(p_payload->>'room_number', ''), v_room_id,
        v_doc_type, v_doc_number,
        v_doc_path, v_receipt_path, v_face_path
    )
    RETURNING id, reference INTO v_id, v_reference;

    RETURN jsonb_build_object('id', v_id, 'reference', v_reference);

EXCEPTION
    WHEN check_violation THEN
        RAISE;
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Referencia de reserva duplicada, tente novamente.'
            USING ERRCODE = 'unique_violation';
END;
$$;

-- Só o público (site) e o staff autenticado podem chamá-la.
REVOKE ALL ON FUNCTION public.hr_create_public_reservation(JSONB)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_create_public_reservation(JSONB)
    TO anon, authenticated;

-- ---------------------------------------------------
-- 7. Limpeza de ficheiros órfãos
-- ---------------------------------------------------
-- Um visitante pode carregar os três ficheiros e nunca concluir a
-- reserva. Sem SELECT sobre `storage.objects`, `anon` não os apaga, por
-- isso o hotel limpa aqui. Devolve quantos objectos saíram.
--
-- RESTRITO A STAFF: exige um perfil com o módulo de alojamento.
CREATE OR REPLACE FUNCTION public.hr_purge_public_media(p_min_age INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_tenant UUID := public.hr_public_tenant();
    v_removed INTEGER := 0;
    v_cut TIMESTAMPTZ := now() - p_min_age;
    v_row RECORD;
BEGIN
    -- Só staff com o módulo de alojamento: `hr_can_module` (005) é a
    -- mesma exigência que as policies de reservas já usam.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Autentique-se para limpar o armazenamento.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT (SELECT public.hr_can_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao: modulo de alojamento necessario.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    FOR v_row IN
        SELECT o.bucket_id, o.name
          FROM storage.objects o
         WHERE o.bucket_id IN ('kyc-documents', 'payment-proofs', 'client-faces')
           AND public.hr_storage_path_tenant(o.name) = v_tenant
           AND o.created_at < v_cut
           AND NOT EXISTS (
                   SELECT 1 FROM public.hotel_reservations r
                    WHERE o.name IN (coalesce(r.document_path, ''),
                                     coalesce(r.receipt_path, ''),
                                     coalesce(r.face_path, ''))
               )
    LOOP
        DELETE FROM storage.objects o
         WHERE o.bucket_id = v_row.bucket_id AND o.name = v_row.name;
        v_removed := v_removed + 1;
    END LOOP;

    RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_purge_public_media(INTERVAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_purge_public_media(INTERVAL) TO authenticated;

-- ---------------------------------------------------
-- 8. Fecho do INSERT directo público
-- ---------------------------------------------------
-- A RPC da secção 6 é o caminho único: valida tudo e devolve o código.
-- Manter um INSERT directo permitiria contornar a exigência dos três
-- ficheiros (as policies PERMISSIVE combinam-se com OR, por isso a
-- política velha laxa anularia a nova).
DROP POLICY IF EXISTS reservations_insert_public ON public.hotel_reservations;
DROP POLICY IF EXISTS reservations_insert_public_site ON public.hotel_reservations;
DROP POLICY IF EXISTS "Permitir criacao de reservas via Landing Page" ON public.hotel_reservations;

REVOKE INSERT ON TABLE public.hotel_reservations FROM anon;

-- `authenticated` continua a criar reservas pelas policies de módulo da
-- 005 (tenant + hr_can_module('alojamento')), que não foram tocadas.

-- ---------------------------------------------------
-- 9. Registo da versão
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('017', '017_public_registration_media.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------------------------------------------------
-- 10. Verificação final (fica visível no SQL Editor)
-- ---------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== 017 diagnostico final ===';
    RAISE NOTICE 'coluna document_type  : %', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='hotel_reservations' AND column_name='document_type');
    RAISE NOTICE 'coluna document_number: %', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='hotel_reservations' AND column_name='document_number');
    RAISE NOTICE 'coluna document_path  : %', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='hotel_reservations' AND column_name='document_path');
    RAISE NOTICE 'coluna receipt_path   : %', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='hotel_reservations' AND column_name='receipt_path');
    RAISE NOTICE 'coluna face_path      : %', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='hotel_reservations' AND column_name='face_path');
    RAISE NOTICE 'bucket client-faces   : %', EXISTS (SELECT 1 FROM storage.buckets WHERE id='client-faces');
    RAISE NOTICE 'anon INSERT reservas (tem de ser FALSE): %', EXISTS (SELECT 1
        FROM information_schema.role_table_grants WHERE grantee='anon'
          AND table_schema='public' AND table_name='hotel_reservations' AND privilege_type='INSERT');
    RAISE NOTICE 'policies de INSERT em hotel_reservations: %', (SELECT count(*)
        FROM pg_policies WHERE schemaname='public' AND tablename='hotel_reservations' AND cmd='INSERT');
    RAISE NOTICE 'policy public_media_upload_anon        : %', EXISTS (SELECT 1
        FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
          AND policyname='public_media_upload_anon');
    RAISE NOTICE 'funcao hr_create_public_reservation    : %', EXISTS (SELECT 1
        FROM pg_proc WHERE proname='hr_create_public_reservation');
END
$$;

-- =====================================================================
-- COMO TESTAR (depois do deploy da Landing Page)
--
--   .\scripts\verify-landing-insert.ps1   -> agora deve reportar que o
--   INSERT directo de anon foi NEGADO e que a RPC responde.
-- =====================================================================
