-- =====================================================================
-- 016 - INSERT publico em hotel_reservations: assercao e verificacao
-- =====================================================================
-- ÂMBITO
--   1. Diagnostico: reporta o estado real dos privilegios e policies.
--   2. Garantia idempotente de `GRANT INSERT ... TO anon`.
--   3. Unica policy de INSERT publica (nome pedido), endurecida.
--   4. Publicacao Realtime de `hotel_reservations`.
--   5. Registo da versao.
--   6. Verificacao final.
--
-- DIAGNOSTICO - qual era o problema ACTUALMENTE
-- ---------------------------------------------------------------
--   A queixa era "401 / 42501 permission denied" no INSERT da Landing
--   Page. Medido em producao (projecto rzelexvouysvkejfwrbf) em
--   2026-10-12, o estado real e este:
--
--     anon  INSERT  sem  RETURNING  ->  201  (FUNCIONA)
--     anon  INSERT  com  RETURNING  ->  401 / 42501
--     anon  SELECT                  ->  401 / 42501  (intencional)
--     politica a recusar payload invalido -> 401 / 42501 (funciona)
--
--   A causa do 42501 NAO e o GRANT de INSERT em falta - o GRANT da 009
--   esta aplicado e e comprovavel. E o `INSERT ... RETURNING`:
--
--     PostgREST interpreta  Prefer: return=representation  (que o
--     supabase-js emite quando se encadeia `.select()`) como
--     `INSERT ... RETURNING *`, e o Postgres exige SELECT sobre a
--     tabela para devolver linhas. `anon` nao tem SELECT de
--     `hotel_reservations` - e de proposito: nomes, emails e documentos
--     de hospedes nao podem sair para a internet.
--
--   Ou seja: a chamada da Landing Page
--
--     supabase.from('hotel_reservations').insert([payload])   // sem .select()
--
--   devolve 201 e cria a reserva. A mesma chamada com `.select()` devolve
--   42501. O `hotel-lukweku-repo/index.html` (linha 1260) ja faz a versao
--   correcta e o comentario das linhas 1257-1259 documenta a razao.
--
--   NOTA SOBRE A EDGE FUNCTION
--   A Landing Page NUNCA chama `supabase.functions.invoke(...)` nem
--   `create-reservation` (verificado no repo inteiro). O 404 dessa funcao
--   e um artefacto de a funcao nao estar implantada, mas nao afecta o
--   fluxo: as reservas vao por INSERT directo. Nao e preciso implanta-la
--   para o formulario funcionar.
--
-- PORQUE EXISTE ESTA MIGRACAO
--   Nao para corrigir - para GARANTIR. Todas as instrucoes sao
--   idempotentes e reproduzem exactamente o estado da 009, pelo que
--   correr esta migracao num projecto ja correcto nao altera
--   comportamento. Serve tres propositos:
--     a) o SQL Editor fica com prova escrita do diagnostico, para que
--        ninguem volte a "corrigir" um GRANT que nao estava em falta;
--     b) um projecto re-provisionado (novo, clonado, ou com a 006
--        aplicada sem a 009 por cima) fica correcto;
--     c) a assercao da publicacao Realtime nao depende de a 001 ter
--        corrido.
--
-- O QUE NAO SE MEXE (SEGURANCA)
--   * `anon` continua SEM SELECT, SEM UPDATE e SEM DELETE. Repoe-se
--     explicitamente este posture com um REVOKE + GRANT de INSERT,
--     pelo que o resultado final e "apenas inserir".
--   * As policies de modulo da 005 para `authenticated`
--     (`reservations_*_lodging`, com tenant + hr_can_module) continuam
--     a existir por cima; a policy publica abaixo e adicional e esta
--     limitada a `PENDENTE_PAGAMENTO`.
--
-- PORQUÊ NAO `WITH CHECK (true)`
--   Um `WITH CHECK (true)` para `anon` permitiria a qualquer visitante
--   inserir linhas com qualquer `tenant_id` (injecao cross-empresa num
--   Supabase multi-tenant), com `status = 'CHECKED_IN'` (ocupacao falsa
--   de quartos reais), com `guest_profile_id` a apontar para o perfil
--   KYC de outro hospede, e sem validacao de formato - spam ilimitado
--   na tabela de reservas do hotel. A policy abaixo valida exactamente
--   o payload que a Landing Page envia (index.html:1237-1249), pelo que
--   o site funciona igual; verificacao empirica:
--     email invalido   -> recusado
--     status CHECKED_IN -> recusado
--     outro tenant_id   -> recusado
--
-- Idempotente - seguro de re-executar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------
-- 1. Diagnostico (fica na saida do SQL Editor)
-- ---------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== 016 diagnostico inicial ===';

    RAISE NOTICE 'anon tem GRANT INSERT em hotel_reservations: %',
        EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'anon'
               AND table_schema = 'public'
               AND table_name = 'hotel_reservations'
               AND privilege_type = 'INSERT'
        );

    RAISE NOTICE 'anon tem GRANT SELECT em hotel_reservations (tem de ser false): %',
        EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'anon'
               AND table_schema = 'public'
               AND table_name = 'hotel_reservations'
               AND privilege_type = 'SELECT'
        );

    RAISE NOTICE 'policies de INSERT existentes: %',
        (SELECT coalesce(string_agg(policyname, ', '), '(nenhuma)')
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'hotel_reservations'
            AND cmd = 'INSERT');

    RAISE NOTICE 'hotel_reservations na publicacao supabase_realtime: %',
        EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = 'hotel_reservations'
        );

    RAISE NOTICE 'coluna guest_phone existe: %',
        EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'hotel_reservations'
               AND column_name = 'guest_phone'
        );

    RAISE NOTICE 'trigger de referencia (LKW-...) existe: %',
        EXISTS (
            SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.hotel_reservations'::regclass
               AND tgname = 'trg_reservations_reference'
        );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'diagnostico indisponivel: %', SQLERRM;
END
$$;

-- ---------------------------------------------------
-- 2. Garantia do GRANT de INSERT
-- ---------------------------------------------------
-- PostgREST valida os privilegios de tabela ANTES de avaliar as
-- policies, portanto o GRANT tem de existir explicitamente (mesmo
-- que a 009 ja o tenha dado): sem ele, todo o INSERT devolve
-- "permission denied for table hotel_reservations" e nenhuma policy
-- chega sequer a ser lida.
GRANT INSERT ON TABLE public.hotel_reservations TO anon;
GRANT INSERT ON TABLE public.hotel_reservations TO authenticated;

-- Repoe o posture de seguranca da 006/009: o site nao Le, nao altera
-- nem apaga reservas de hospedes.
REVOKE ALL ON TABLE public.hotel_reservations FROM anon;

-- A revogacao acima remove tambem o INSERT acabado de dar - emite-o
-- por cima, ficando `anon` com APENAS `INSERT`.
GRANT INSERT ON TABLE public.hotel_reservations TO anon;

-- ---------------------------------------------------
-- 3. Unica policy de INSERT publica (endurecida)
-- ---------------------------------------------------
-- Entra com o nome pedido pela equipa. Remove primeiro as politicas de
-- INSERT publica conhecidas (006 e 009) para nao ficarem duas em
-- paralelo - em Postgres as policies PERMISSIVE sao combinadas com OR,
-- por isso uma politica velha mais laxa anularia a restricao nova.
DROP POLICY IF EXISTS reservations_insert_public ON public.hotel_reservations;
DROP POLICY IF EXISTS reservations_insert_public_site ON public.hotel_reservations;
DROP POLICY IF EXISTS "Permitir criacao de reservas via Landing Page" ON public.hotel_reservations;

CREATE POLICY "Permitir criacao de reservas via Landing Page"
    ON public.hotel_reservations
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        -- So o hotel Lukweku: impossivel injectar linhas noutra empresa.
        tenant_id = '11111111-1111-1111-1111-111111111111'
        -- O site nunca confirma nem ocupa quartos: a rececao faz check-in.
        AND status = 'PENDENTE_PAGAMENTO'
        -- Vocabulario do catalogo publico e do app local.
        AND service_type IN (
            'quarto', 'piscina', 'evento', 'lavandaria',
            'conferencia', 'restaurante', 'transfer'
        )
        AND length(btrim(guest_name)) BETWEEN 2 AND 200
        AND email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]{2,}$'
        AND (guest_phone IS NULL
             OR guest_phone ~ '^[+0-9()][0-9 ()+-]{4,19}$')
        -- Datas coerentes quando ambas preenchidas.
        AND (check_in_date IS NULL
             OR check_out_date IS NULL
             OR check_out_date >= check_in_date)
        AND COALESCE(total_amount, 0) >= 0
        -- Sempre `NULL`: um visitante nao escolhe o perfil KYC de ninguem.
        AND guest_profile_id IS NULL
    );

-- ---------------------------------------------------
-- 4. Publicacao Realtime
-- ---------------------------------------------------
-- A Landing Page assina `postgres_changes` sobre `hotel_reservations`
-- (index.html:1192) e o Servidor local depende do mesmo evento para
-- ingerir a reserva em tempo real. `ALTER PUBLICATION ADD TABLE` rebenta
-- se a tabela ja la esta, por isso so se emite quando falta.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'hotel_reservations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_reservations;
        RAISE NOTICE 'hotel_reservations ADICIONADA a publicacao supabase_realtime';
    ELSE
        RAISE NOTICE 'hotel_reservations ja estava na publicacao supabase_realtime';
    END IF;
END
$$;

-- ---------------------------------------------------
-- 5. Registo da versao
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('016', '016_landing_page_insert_grant.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------------------------------------------------
-- 6. Verificacao final (fica visivel no SQL Editor)
-- ---------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== 016 diagnostico final ===';
    RAISE NOTICE 'anon INSERT em hotel_reservations (tem de ser true) : %',
        EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'anon'
               AND table_schema = 'public'
               AND table_name = 'hotel_reservations'
               AND privilege_type = 'INSERT'
        );
    RAISE NOTICE 'anon SELECT em hotel_reservations (tem de ser false): %',
        EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'anon'
               AND table_schema = 'public'
               AND table_name = 'hotel_reservations'
               AND privilege_type = 'SELECT'
        );
    RAISE NOTICE 'policies de INSERT (tem de ficar 1): %',
        (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'hotel_reservations'
            AND cmd = 'INSERT');
    RAISE NOTICE 'hotel_reservations em supabase_realtime (true): %',
        EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = 'hotel_reservations'
        );
END
$$;

-- =====================================================================
-- COMO VERIFICAR DEPOIS (fora do SQL Editor)
--
--   .\scripts\verify-landing-insert.ps1           # com app local a correr
--   .\scripts\verify-landing-insert.ps1 -Offline  # so Supabase
--
-- Espera-se: insert real 201, payloads invalidos recusados, SELECT/UPDATE/
-- DELETE negados, e a reserva a aparecer no Servidor local.
-- =====================================================================
