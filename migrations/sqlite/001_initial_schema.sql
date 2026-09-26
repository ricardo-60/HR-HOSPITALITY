-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 001 · SCHEMA INICIAL (SQLite)
--   Tabelas base: tenants, hotel_rooms, hotel_reservations,
--   hotel_consumptions + dados de demonstração.
--   Consolidado de: electron/schema.sql + MIGRATION_FULL.sql
--   Idempotente: seguro para re-execução.
-- ============================================================

-- ── Tabela base de tenants ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    currency TEXT DEFAULT 'Kz',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Reconciliação com bases legadas (esquema GestPro antigo, com
-- company_name NOT NULL e sem name/slug/currency). Os ADD COLUMN
-- falham com "duplicate column name" numa base já nova — o executor
-- de migrações ignora esses erros (idempotência) e o INSERT abaixo
-- passa a funcionar em AMBOS os formatos.
ALTER TABLE tenants ADD COLUMN name TEXT;
ALTER TABLE tenants ADD COLUMN slug TEXT;
ALTER TABLE tenants ADD COLUMN currency TEXT DEFAULT 'Kz';
ALTER TABLE tenants ADD COLUMN company_name TEXT;

INSERT OR IGNORE INTO tenants (id, name, slug, currency, company_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Hotel Lukweku', 'hotel-lukweku', 'Kz', 'Hotel Lukweku');

-- ── Quartos do hotel ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_rooms (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    room_number TEXT NOT NULL,
    room_type TEXT NOT NULL,
    status TEXT DEFAULT 'DISPONIVEL' CHECK (status IN ('DISPONIVEL','OCUPADO','LIMPEZA','MANUTENCAO')),
    price_per_night REAL NOT NULL DEFAULT 0,
    floor INTEGER DEFAULT 1,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    UNIQUE(tenant_id, room_number)
);

-- ── Reservas do hotel ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_reservations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    guest_name TEXT NOT NULL,
    email TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('quarto','conferencia','restaurante','transfer')),
    room_number TEXT,
    room_id TEXT,
    check_in_date TEXT,
    check_out_date TEXT,
    status TEXT DEFAULT 'PENDENTE_PAGAMENTO' CHECK (status IN ('PENDENTE_PAGAMENTO','CONFIRMADA','CHECKED_IN','CHECKED_OUT','CANCELADA')),
    reservation_date TEXT DEFAULT (date('now')),
    notes TEXT,
    total_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced'
);

-- ── Consumos/extras por estadia ─────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_consumptions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    reservation_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    category TEXT DEFAULT 'outro' CHECK (category IN ('minibar','restaurante','lavandaria','telefone','outro')),
    registered_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    FOREIGN KEY (reservation_id) REFERENCES hotel_reservations(id)
);

-- ── Índices de desempenho ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_tenant ON hotel_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_status ON hotel_rooms(status);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON hotel_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON hotel_consumptions(reservation_id);

-- ── Dados iniciais — Quartos do Hotel Lukweku ───────────────
INSERT OR IGNORE INTO hotel_rooms (id, tenant_id, room_number, room_type, status, price_per_night, floor, description) VALUES
('a1111111-1111-4111-8111-000000000101', '11111111-1111-1111-1111-111111111111', '101', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('a1111111-1111-4111-8111-000000000102', '11111111-1111-1111-1111-111111111111', '102', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('a1111111-1111-4111-8111-000000000103', '11111111-1111-1111-1111-111111111111', '103', 'Standard',      'LIMPEZA',    150.00, 1, 'Quarto standard — em limpeza'),
('a1111111-1111-4111-8111-000000000104', '11111111-1111-1111-1111-111111111111', '104', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para a piscina'),
('a1111111-1111-4111-8111-000000000201', '11111111-1111-1111-1111-111111111111', '201', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com cama king-size'),
('a1111111-1111-4111-8111-000000000202', '11111111-1111-1111-1111-111111111111', '202', 'Double',        'OCUPADO',    220.00, 2, 'Quarto duplo — hóspede activo'),
('a1111111-1111-4111-8111-000000000203', '11111111-1111-1111-1111-111111111111', '203', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com varanda'),
('a1111111-1111-4111-8111-000000000204', '11111111-1111-1111-1111-111111111111', '204', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com banheira'),
('a1111111-1111-4111-8111-000000000301', '11111111-1111-1111-1111-111111111111', '301', 'Suite',         'DISPONIVEL', 450.00, 3, 'Suite com sala de estar e jacuzzi'),
('a1111111-1111-4111-8111-000000000302', '11111111-1111-1111-1111-111111111111', '302', 'Suite',         'OCUPADO',    450.00, 3, 'Suite VIP — hóspede activo'),
('a1111111-1111-4111-8111-000000000303', '11111111-1111-1111-1111-111111111111', '303', 'Suite Premium', 'DISPONIVEL', 750.00, 3, 'Suite Presidencial com terraço privativo'),
('a1111111-1111-4111-8111-000000000304', '11111111-1111-1111-1111-111111111111', '304', 'Suite',         'MANUTENCAO', 450.00, 3, 'Suite — em manutenção');

-- ── Reservas de demonstração ────────────────────────────────
INSERT OR IGNORE INTO hotel_reservations (id, tenant_id, guest_name, email, service_type, status, reservation_date) VALUES
('b2222222-2222-4222-8222-000000000001', '11111111-1111-1111-1111-111111111111', 'Hermenegildo Ricardo', 'h.ricardo@email.com', 'quarto', 'PENDENTE_PAGAMENTO', date('now', '+2 days')),
('b2222222-2222-4222-8222-000000000002', '11111111-1111-1111-1111-111111111111', 'Maria da Conceição',   'm.conceicao@email.com', 'quarto', 'CHECKED_IN', date('now')),
('b2222222-2222-4222-8222-000000000003', '11111111-1111-1111-1111-111111111111', 'Carlos Mendonça',      'c.mendonca@empresa.ao', 'conferencia', 'PENDENTE_PAGAMENTO', date('now', '+5 days')),
('b2222222-2222-4222-8222-000000000004', '11111111-1111-1111-1111-111111111111', 'Ana Paula Silva',      'ana.silva@gmail.com', 'quarto', 'CHECKED_IN', date('now'));
