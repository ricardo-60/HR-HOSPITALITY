-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO LOCAL SQLite
--   Adaptado do MIGRATION_FULL.sql para SQLite (porta 3002)
--   Execute via: POST http://localhost:3002/api/db/execute
-- ============================================================

-- Tabela de quartos do hotel
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

-- Tabela de reservas do hotel
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

-- Tabela de consumos/extras por estadia
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

-- Índices de desempenho
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_tenant ON hotel_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_status ON hotel_rooms(status);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON hotel_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON hotel_consumptions(reservation_id);

-- Fila de sincronização (compatível com GestPro)
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL,
    record_id TEXT NOT NULL,
    data TEXT,
    timestamp INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- DADOS INICIAIS — Quartos do Hotel Lukweku
-- ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO hotel_rooms (id, tenant_id, room_number, room_type, status, price_per_night, floor, description) VALUES
('room-101', '11111111-1111-1111-1111-111111111111', '101', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('room-102', '11111111-1111-1111-1111-111111111111', '102', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('room-103', '11111111-1111-1111-1111-111111111111', '103', 'Standard',      'LIMPEZA',    150.00, 1, 'Quarto standard — em limpeza'),
('room-104', '11111111-1111-1111-1111-111111111111', '104', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para a piscina'),
('room-201', '11111111-1111-1111-1111-111111111111', '201', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com cama king-size'),
('room-202', '11111111-1111-1111-1111-111111111111', '202', 'Double',        'OCUPADO',    220.00, 2, 'Quarto duplo — hóspede activo'),
('room-203', '11111111-1111-1111-1111-111111111111', '203', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com varanda'),
('room-204', '11111111-1111-1111-1111-111111111111', '204', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com banheira'),
('room-301', '11111111-1111-1111-1111-111111111111', '301', 'Suite',         'DISPONIVEL', 450.00, 3, 'Suite com sala de estar e jacuzzi'),
('room-302', '11111111-1111-1111-1111-111111111111', '302', 'Suite',         'OCUPADO',    450.00, 3, 'Suite VIP — hóspede activo'),
('room-303', '11111111-1111-1111-1111-111111111111', '303', 'Suite Premium', 'DISPONIVEL', 750.00, 3, 'Suite Presidencial com terraço privativo'),
('room-304', '11111111-1111-1111-1111-111111111111', '304', 'Suite',         'MANUTENCAO', 450.00, 3, 'Suite — em manutenção');

-- Reservas de demonstração
INSERT OR IGNORE INTO hotel_reservations (id, tenant_id, guest_name, email, service_type, status, reservation_date) VALUES
('res-demo-1', '11111111-1111-1111-1111-111111111111', 'Hermenegildo Ricardo', 'h.ricardo@email.com', 'quarto', 'PENDENTE_PAGAMENTO', date('now', '+2 days')),
('res-demo-2', '11111111-1111-1111-1111-111111111111', 'Maria da Conceição',   'm.conceicao@email.com', 'quarto', 'PENDENTE_PAGAMENTO', date('now', '+3 days')),
('res-demo-3', '11111111-1111-1111-1111-111111111111', 'Carlos Mendonça',      'c.mendonca@empresa.ao', 'conferencia', 'PENDENTE_PAGAMENTO', date('now', '+5 days')),
('res-demo-4', '11111111-1111-1111-1111-111111111111', 'Ana Paula Silva',      'ana.silva@gmail.com', 'quarto', 'CONFIRMADA', date('now', '+1 day'));
