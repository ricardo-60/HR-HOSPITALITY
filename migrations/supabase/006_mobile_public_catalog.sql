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

    ALTER TABLE public.hotel_reservations
        ADD CONSTRAINT hotel_reservations_service_type_check
        CHECK (service_type = ANY (allowed));
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

    ALTER TABLE public.hotel_consumptions
        ADD CONSTRAINT hotel_consumptions_category_check
        CHECK (category = ANY (allowed));
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
