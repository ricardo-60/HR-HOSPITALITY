-- =====================================================================
-- 015 - Chave estrangeira `hotel_reservations.room_id` -> `hotel_rooms`
-- =====================================================================
-- ÂMBITO
--   1. `hotel_reservations.room_id` passa a ter FK para `hotel_rooms(id)`.
--
-- PORQUÊ
--   A coluna `room_id` já existia e já era preenchida (3 das 4 reservas
--   de demonstração apontam para um quarto real), mas nunca recebeu a
--   CONSTRAINT. Sem ela o PostgREST não conhece a relação entre as duas
--   tabelas e recusa qualquer `embed`:
--
--     GET /rest/v1/hotel_rooms?select=...,hotel_reservations(...)
--     -> HTTP 400  {"code":"PGRST200",
--                   "message":"Could not find a relationship between
--                   'hotel_rooms' and 'hotel_reservations'"}
--
--   `listOccupancy()` em `src/lib/adminData.ts` usa exactamente esse
--   embed para a tabela de ocupação, pelo que a página /kyc devolvia
--   400 e não carregava os quartos. O inverso
--   (`hotel_reservations -> hotel_rooms`) falhava da mesma forma.
--
-- DECISÕES DE MODELAGEM
--   * ON DELETE SET NULL, não CASCADE. Os `room_rates` e os
--     `hourly_billing` pertencem ao quarto e morrem com ele; uma
--     RESERVA é histórico financeiro e legal do hóspede e não pode
--     desaparecer porque alguém apagou um quarto. SET NULL mantém a
--     reserva viva e apenas a desvincula.
--   * SET NULL é também a única opção segura face à eliminação em
--     cascata de empresa da 014: `hr_delete_tenant()` apaga
--     `hotel_rooms` e `hotel_reservations` pela lista de tabelas, por
--     ordem não garantida. RESTRICT falharia a transacção inteira se
--     os quartos fossem apagados primeiro.
--   * FK de UMA coluna (`room_id -> id`, a PK). Não existe índice
--     único em `hotel_rooms (id, tenant_id)`, pelo que uma FK composta
--     com `tenant_id` exigiria criá-lo primeiro. A protecção
--     multi-empresa continua a vir das FKs de `tenant_id` da 014, que
--     já existem nas duas tabelas.
--   * A coluna é anulável (1 das 4 reservas de demonstração não tem
--     quarto atribuído), por isso a FK só passa a ser testada quando
--     `room_id` tem valor - que é exactamente o significado de "esta
--     reserva tem quarto".
--
-- SEGURANÇA
--   * A migração RECUSA-SE A CORRER se existirem reservas cujo
--     `room_id` não aponte para um quarto existente, em vez de as
--     apagar ou de as silenciar - tal como a 014 fez com os órfãs de
--     `tenant_id`. Verificado em produção antes de aplicar: 12 quartos,
--     4 reservas, 3 com `room_id`, 0 órfãs.
--
-- Idempotente - seguro de re-executar.
-- =====================================================================

BEGIN;

DO $$
DECLARE
    orphans BIGINT;
BEGIN
    -- 1. Nada é criado se o dado existente for inconsistente.
    SELECT count(*) INTO orphans
      FROM public.hotel_reservations AS r
     WHERE r.room_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.hotel_rooms AS h WHERE h.id = r.room_id
       );

    IF orphans > 0 THEN
        RAISE EXCEPTION
            '015 bloqueada: % reserva(s) apontam para um room_id inexistente em hotel_rooms; resolver primeiro',
            orphans;
    END IF;

    -- 2. Cria a FK apenas se ainda não existir.
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_constraint
         WHERE conname = 'hotel_reservations_room_id_fkey'
           AND conrelid = 'public.hotel_reservations'::regclass
    ) THEN
        ALTER TABLE public.hotel_reservations
            ADD CONSTRAINT hotel_reservations_room_id_fkey
            FOREIGN KEY (room_id)
            REFERENCES public.hotel_rooms (id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- 3. O PostgREST mantém o esquema em memória: sem este aviso a relação
--    só passaria a ser conhecida na próxima recarga da cache e o /kyc
--    continuaria a dar 400 logo a seguir à migração.
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------
-- 4. Registo da versão
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('015', '015_reservation_room_fk.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
