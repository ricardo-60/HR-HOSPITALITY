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
