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

INSERT INTO public.tenants (id, name, slug, currency)
VALUES ('11111111-1111-1111-1111-111111111111', 'Hotel Lukweku', 'hotel-lukweku', 'Kz')
ON CONFLICT (slug) DO NOTHING;

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
