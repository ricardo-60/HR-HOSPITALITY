/* ============================================================
   HR-HOSPITALITY — MIGRAÇÃO PARA O NOVO PROJETO SUPABASE
   Projeto: zqmtxxjoocwhaodlnhxg
   Hotel Lukweku · Tenant: 11111111-1111-1111-1111-111111111111

   COMO USAR:
   1. Abrir https://supabase.com/dashboard/project/zqmtxxjoocwhaodlnhxg/sql/new
   2. Colar TODO este ficheiro e clicar em RUN (Ctrl+Enter)
   3. No fim deve mostrar: tenants=1 · hotel_rooms=12 · hotel_reservations=4
   ============================================================ */

-- ─────────────────────────────────────────────────────────────
-- PASSO 1: TABELA BASE DE TENANTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.tenants (id, name, slug)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Hotel Lukweku',
    'hotel-lukweku'
)
ON CONFLICT (slug) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- PASSO 2: TIPO ENUM PARA STATUS DO QUARTO
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE hotel_room_status AS ENUM ('DISPONIVEL', 'OCUPADO', 'LIMPEZA', 'MANUTENCAO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────
-- PASSO 3: TABELA hotel_rooms
-- ─────────────────────────────────────────────────────────────
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
    CONSTRAINT unique_room_per_tenant UNIQUE (tenant_id, room_number)
);

ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_all_tenant" ON public.hotel_rooms;
CREATE POLICY "rooms_all_tenant" ON public.hotel_rooms
    FOR ALL USING (true);  -- Aberto enquanto a app usa auth local; restringir após migrar para Supabase Auth


-- ─────────────────────────────────────────────────────────────
-- PASSO 4: POPULAR hotel_rooms — Hotel Lukweku
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.hotel_rooms (tenant_id, room_number, room_type, status, price_per_night, floor, description) VALUES
('11111111-1111-1111-1111-111111111111', '101', 'Standard', 'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('11111111-1111-1111-1111-111111111111', '102', 'Standard', 'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('11111111-1111-1111-1111-111111111111', '103', 'Standard', 'LIMPEZA',    150.00, 1, 'Quarto standard — em limpeza'),
('11111111-1111-1111-1111-111111111111', '104', 'Standard', 'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para a piscina'),
('11111111-1111-1111-1111-111111111111', '201', 'Double',   'DISPONIVEL', 220.00, 2, 'Quarto duplo com cama king-size'),
('11111111-1111-1111-1111-111111111111', '202', 'Double',   'OCUPADO',    220.00, 2, 'Quarto duplo — hóspede activo'),
('11111111-1111-1111-1111-111111111111', '203', 'Double',   'DISPONIVEL', 220.00, 2, 'Quarto duplo com varanda'),
('11111111-1111-1111-1111-111111111111', '204', 'Double',   'DISPONIVEL', 220.00, 2, 'Quarto duplo com banheira'),
('11111111-1111-1111-1111-111111111111', '301', 'Suite',    'DISPONIVEL', 450.00, 3, 'Suite com sala de estar e jacuzzi'),
('11111111-1111-1111-1111-111111111111', '302', 'Suite',    'OCUPADO',    450.00, 3, 'Suite VIP — hóspede activo'),
('11111111-1111-1111-1111-111111111111', '303', 'Suite Premium', 'DISPONIVEL', 750.00, 3, 'Suite Presidencial com terraço privativo'),
('11111111-1111-1111-1111-111111111111', '304', 'Suite',    'MANUTENCAO', 450.00, 3, 'Suite — em manutenção')
ON CONFLICT (tenant_id, room_number) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- PASSO 5: TABELA hotel_reservations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hotel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    guest_name TEXT NOT NULL,
    email TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('quarto', 'conferencia', 'restaurante', 'transfer')),
    room_number TEXT,
    room_id TEXT,
    check_in_date DATE,
    check_out_date DATE,
    status TEXT DEFAULT 'PENDENTE_PAGAMENTO' CHECK (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELADA')),
    reservation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    total_amount DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotente: garante as colunas de estadia mesmo numa tabela já pré-criada
-- (paridade com o schema SQLite local; o frontend lê/grava check_in_date).
ALTER TABLE public.hotel_reservations ADD COLUMN IF NOT EXISTS check_in_date DATE;
ALTER TABLE public.hotel_reservations ADD COLUMN IF NOT EXISTS check_out_date DATE;
ALTER TABLE public.hotel_reservations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.hotel_reservations ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_all_open" ON public.hotel_reservations;
CREATE POLICY "reservations_all_open" ON public.hotel_reservations
    FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON public.hotel_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON public.hotel_reservations(created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- PASSO 6: TABELA hotel_consumptions (extras da estadia)
-- ─────────────────────────────────────────────────────────────
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
CREATE POLICY "consumptions_all_open" ON public.hotel_consumptions
    FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON public.hotel_consumptions(reservation_id);


-- ─────────────────────────────────────────────────────────────
-- PASSO 7: RESERVAS DE DEMONSTRAÇÃO (Site/Lead)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.hotel_reservations (tenant_id, guest_name, email, service_type, status, reservation_date) VALUES
('11111111-1111-1111-1111-111111111111', 'Hermenegildo Ricardo', 'h.ricardo@email.com', 'quarto', 'PENDENTE_PAGAMENTO', CURRENT_DATE + 2),
('11111111-1111-1111-1111-111111111111', 'Maria da Conceição', 'm.conceicao@email.com', 'quarto', 'PENDENTE_PAGAMENTO', CURRENT_DATE + 3),
('11111111-1111-1111-1111-111111111111', 'Carlos Mendonça', 'c.mendonca@empresa.ao', 'conferencia', 'PENDENTE_PAGAMENTO', CURRENT_DATE + 5),
('11111111-1111-1111-1111-111111111111', 'Ana Paula Silva', 'ana.silva@gmail.com', 'quarto', 'CONFIRMADA', CURRENT_DATE + 1)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- PASSO 8: REALTIME — publicar alterações das tabelas
-- (permite os .channel() do frontend receberem updates)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_rooms;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_reservations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO FINAL
-- Deve devolver: tenants=1 · hotel_rooms=12 · hotel_reservations=4
-- ─────────────────────────────────────────────────────────────
SELECT 'tenants' AS tabela, COUNT(*) AS registos FROM public.tenants
UNION ALL
SELECT 'hotel_rooms', COUNT(*) FROM public.hotel_rooms
UNION ALL
SELECT 'hotel_reservations', COUNT(*) FROM public.hotel_reservations
UNION ALL
SELECT 'hotel_consumptions', COUNT(*) FROM public.hotel_consumptions;
