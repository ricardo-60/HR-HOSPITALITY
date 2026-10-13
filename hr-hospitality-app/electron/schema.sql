-- ============================================================
--   HR-HOSPITALITY â€” SCHEMA LOCAL SQLite
--   InicializaÃ§Ã£o das tabelas de hospitalidade no Servidor Local
-- ============================================================

-- Tabela de quartos do hotel
CREATE TABLE IF NOT EXISTS hotel_rooms (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    room_number TEXT NOT NULL,
    room_type TEXT NOT NULL,
    status TEXT DEFAULT 'DISPONIVEL' CHECK (status IN ('DISPONIVEL','OCUPADO','RESERVADO','LIMPEZA','MANUTENCAO')),
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
    -- Registo universal do hóspede (migração 017): tipo/número do documento
    -- de identidade e os caminhos no Supabase Storage do documento, do
    -- comprovativo de pagamento e do rosto (client-faces).
    guest_phone TEXT,
    document_type TEXT CHECK (document_type IS NULL OR document_type IN ('BI','PASSAPORTE')),
    document_number TEXT,
    document_path TEXT,
    receipt_path TEXT,
    face_path TEXT,
    -- Ligação estrita ao cliente KYC cadastrado (clients.id / clients.client_number)
    client_id TEXT,
    client_number TEXT,
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
    source_zone TEXT,
    source_table TEXT,
    registered_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    FOREIGN KEY (reservation_id) REFERENCES hotel_reservations(id)
);

-- Ãndices de desempenho
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_tenant ON hotel_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_status ON hotel_rooms(status);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON hotel_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_client ON hotel_reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON hotel_reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON hotel_consumptions(reservation_id);

-- Tabela de mesas do POS (Restaurante/Snack Bar)
CREATE TABLE IF NOT EXISTS pos_tables (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    zone TEXT NOT NULL,
    seats INTEGER NOT NULL DEFAULT 4,
    status TEXT DEFAULT 'LIVRE' CHECK (status IN ('LIVRE','OCUPADA','RESERVADA','MANUTENCAO')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pos_tables_tenant ON pos_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_tables_zone ON pos_tables(zone);
CREATE INDEX IF NOT EXISTS idx_pos_tables_status ON pos_tables(status);

-- Fila de sincronizaÃ§Ã£o (compatÃ­vel com GestPro)
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL CHECK (table_name IN ('hotel_rooms','hotel_reservations','hotel_consumptions','pos_tables','pos_table_consumptions','clients','client_biometrics','loyalty_tiers','client_visits')),
    action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    record_id TEXT NOT NULL,
    data TEXT,
    timestamp INTEGER NOT NULL
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- DADOS INICIAIS â€” Quartos do Hotel Lukweku
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT OR IGNORE INTO hotel_rooms (id, tenant_id, room_number, room_type, status, price_per_night, floor, description) VALUES
('a1111111-1111-4111-8111-000000000101', '11111111-1111-1111-1111-111111111111', '101', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('a1111111-1111-4111-8111-000000000102', '11111111-1111-1111-1111-111111111111', '102', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para o jardim'),
('a1111111-1111-4111-8111-000000000103', '11111111-1111-1111-1111-111111111111', '103', 'Standard',      'LIMPEZA',    150.00, 1, 'Quarto standard â€” em limpeza'),
('a1111111-1111-4111-8111-000000000104', '11111111-1111-1111-1111-111111111111', '104', 'Standard',      'DISPONIVEL', 150.00, 1, 'Quarto standard com vista para a piscina'),
('a1111111-1111-4111-8111-000000000201', '11111111-1111-1111-1111-111111111111', '201', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com cama king-size'),
('a1111111-1111-4111-8111-000000000202', '11111111-1111-1111-1111-111111111111', '202', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com varanda'),
('a1111111-1111-4111-8111-000000000203', '11111111-1111-1111-1111-111111111111', '203', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com varanda'),
('a1111111-1111-4111-8111-000000000204', '11111111-1111-1111-1111-111111111111', '204', 'Double',        'DISPONIVEL', 220.00, 2, 'Quarto duplo com banheira'),
('a1111111-1111-4111-8111-000000000301', '11111111-1111-1111-1111-111111111111', '301', 'Suite',         'DISPONIVEL', 450.00, 3, 'Suite com sala de estar e jacuzzi'),
('a1111111-1111-4111-8111-000000000302', '11111111-1111-1111-1111-111111111111', '302', 'Suite',         'DISPONIVEL', 450.00, 3, 'Suite VIP com vista para a cidade'),
('a1111111-1111-4111-8111-000000000303', '11111111-1111-1111-1111-111111111111', '303', 'Suite Premium', 'DISPONIVEL', 750.00, 3, 'Suite Presidencial com terraÃ§o privativo'),
('a1111111-1111-4111-8111-000000000304', '11111111-1111-1111-1111-111111111111', '304', 'Suite',         'MANUTENCAO', 450.00, 3, 'Suite â€” em manutenÃ§Ã£o');

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- TABELA DE CONSUMOS DE MESAS (HistÃ³rico do que foi pedido)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS pos_table_consumptions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    table_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    category TEXT,
    status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENVIADO', 'CANCELADO', 'PAGO')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    FOREIGN KEY (table_id) REFERENCES pos_tables(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pos_consumptions_table ON pos_table_consumptions(table_id);
CREATE INDEX IF NOT EXISTS idx_pos_consumptions_status ON pos_table_consumptions(status);
CREATE INDEX IF NOT EXISTS idx_pos_consumptions_created ON pos_table_consumptions(created_at);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- DADOS INICIAIS â€” Mesas do POS (Restaurante/Snack Bar)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT OR IGNORE INTO pos_tables (id, tenant_id, code, name, zone, seats, status, sort_order) VALUES
-- Restaurante
('c3333333-3333-4333-8333-000000000001', '11111111-1111-1111-1111-111111111111', 'M01', 'Mesa 1', 'RESTAURANTE', 4, 'LIVRE', 1),
('c3333333-3333-4333-8333-000000000002', '11111111-1111-1111-1111-111111111111', 'M02', 'Mesa 2', 'RESTAURANTE', 4, 'LIVRE', 2),
('c3333333-3333-4333-8333-000000000003', '11111111-1111-1111-1111-111111111111', 'M03', 'Mesa 3', 'RESTAURANTE', 6, 'LIVRE', 3),
('c3333333-3333-4333-8333-000000000004', '11111111-1111-1111-1111-111111111111', 'M04', 'Mesa 4', 'RESTAURANTE', 6, 'LIVRE', 4),
('c3333333-3333-4333-8333-000000000005', '11111111-1111-1111-1111-111111111111', 'M05', 'Mesa 5', 'RESTAURANTE', 8, 'LIVRE', 5),
('c3333333-3333-4333-8333-000000000006', '11111111-1111-1111-1111-111111111111', 'M06', 'Mesa 6', 'RESTAURANTE', 4, 'LIVRE', 6),
('c3333333-3333-4333-8333-000000000007', '11111111-1111-1111-1111-111111111111', 'M07', 'Mesa 7', 'RESTAURANTE', 4, 'LIVRE', 7),
('c3333333-3333-4333-8333-000000000008', '11111111-1111-1111-1111-111111111111', 'M08', 'Mesa 8', 'RESTAURANTE', 2, 'LIVRE', 8),
-- Snack Bar
('c3333333-3333-4333-8333-000000000011', '11111111-1111-1111-1111-111111111111', 'S01', 'Mesa 1', 'SNACK_BAR', 2, 'LIVRE', 11),
('c3333333-3333-4333-8333-000000000012', '11111111-1111-1111-1111-111111111111', 'S02', 'Mesa 2', 'SNACK_BAR', 2, 'LIVRE', 12),
('c3333333-3333-4333-8333-000000000013', '11111111-1111-1111-1111-111111111111', 'S03', 'Mesa 3', 'SNACK_BAR', 4, 'LIVRE', 13),
('c3333333-3333-4333-8333-000000000014', '11111111-1111-1111-1111-111111111111', 'S04', 'Mesa 4', 'SNACK_BAR', 4, 'LIVRE', 14),
-- Esplanada
('c3333333-3333-4333-8333-000000000021', '11111111-1111-1111-1111-111111111111', 'E01', 'Mesa 1', 'ESPLANADA', 4, 'LIVRE', 21),
('c3333333-3333-4333-8333-000000000022', '11111111-1111-1111-1111-111111111111', 'E02', 'Mesa 2', 'ESPLANADA', 4, 'LIVRE', 22),
('c3333333-3333-4333-8333-000000000023', '11111111-1111-1111-1111-111111111111', 'E03', 'Mesa 3', 'ESPLANADA', 6, 'LIVRE', 23),
('c3333333-3333-4333-8333-000000000024', '11111111-1111-1111-1111-111111111111', 'E04', 'Mesa 4', 'ESPLANADA', 6, 'LIVRE', 24),
-- BalcÃ£o
('c3333333-3333-4333-8333-000000000031', '11111111-1111-1111-1111-111111111111', 'B01', 'BalcÃ£o 1', 'BALCAO', 1, 'LIVRE', 31),
('c3333333-3333-4333-8333-000000000032', '11111111-1111-1111-1111-111111111111', 'B02', 'BalcÃ£o 2', 'BALCAO', 1, 'LIVRE', 32),
('c3333333-3333-4333-8333-000000000033', '11111111-1111-1111-1111-111111111111', 'B03', 'BalcÃ£o 3', 'BALCAO', 1, 'LIVRE', 33),
-- Piscina
('c3333333-3333-4333-8333-000000000041', '11111111-1111-1111-1111-111111111111', 'P01', 'Mesa Piscina 1', 'PISCINA', 4, 'LIVRE', 41),
('c3333333-3333-4333-8333-000000000042', '11111111-1111-1111-1111-111111111111', 'P02', 'Mesa Piscina 2', 'PISCINA', 4, 'LIVRE', 42);

-- ============================================================
-- RESERVAS
-- NAO ha reservas de demonstracao: toda a reserva nasce de um
-- check-in real (Checkin360) ou do portal e referencia um
-- cliente KYC cadastrado em `clients` (client_id/client_number).
-- ============================================================

-- ============================================================
-- MÃ“DULO CRM/KYC â€” CLIENTES, BIOMETRIA E FIDELIDADE
-- ============================================================

-- Tabela de Clientes (KYC/Onboarding)
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    client_number TEXT NOT NULL UNIQUE, -- NÃºmero Ãºnico de cliente (ex: HR-2024-00001)
    full_name TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('BI','PASSAPORTE','NIF','CARTAO_CIDADAO')),
    document_number TEXT NOT NULL,
    address TEXT,
    email TEXT,
    phone TEXT,
    whatsapp TEXT,
    date_of_birth TEXT,
    nationality TEXT,
    face_embedding TEXT, -- Embedding facial serializado (JSON array de floats)
    face_image_path TEXT, -- Caminho da foto facial armazenada
    kyc_completed INTEGER DEFAULT 0 CHECK (kyc_completed IN (0,1)), -- 0=pendente, 1=completo
    kyc_completed_at TEXT,
    loyalty_tier TEXT DEFAULT 'REGISTADO' CHECK (loyalty_tier IN ('REGISTADO','OCASIONAL','FREQUENTE','VIP','RESIDENTE')),
    loyalty_points INTEGER DEFAULT 0,
    total_visits INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    total_stays INTEGER DEFAULT 0,
    total_pos_spent REAL DEFAULT 0,
    first_visit_date TEXT,
    last_visit_date TEXT,
    preferred_room_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    UNIQUE(tenant_id, document_number)
);

CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_number ON clients(client_number);
CREATE INDEX IF NOT EXISTS idx_clients_document ON clients(document_number);
CREATE INDEX IF NOT EXISTS idx_clients_tier ON clients(loyalty_tier);
CREATE INDEX IF NOT EXISTS idx_clients_kyc ON clients(kyc_completed);

-- Tabela de Biometria Facial (histÃ³rico de capturas)
CREATE TABLE IF NOT EXISTS client_biometrics (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    client_id TEXT NOT NULL,
    embedding TEXT NOT NULL, -- Embedding facial (JSON array)
    image_path TEXT, -- Caminho da imagem capturada
    confidence REAL, -- ConfianÃ§a da captura (0.0 - 1.0)
    device_info TEXT, -- Info do dispositivo usado
    created_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_biometrics_client ON client_biometrics(client_id);
CREATE INDEX IF NOT EXISTS idx_biometrics_tenant ON client_biometrics(tenant_id);

-- Tabela de Tier de Fidelidade (configuraÃ§Ã£o de nÃ­veis)
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    name TEXT NOT NULL, -- Ex: 'VIP', 'RESIDENTE'
    min_visits INTEGER DEFAULT 0,
    min_spent REAL DEFAULT 0,
    discount_percent REAL DEFAULT 0, -- Desconto em percentual (ex: 10 = 10%)
    bonus_points_multiplier REAL DEFAULT 1.0, -- Multiplicador de pontos
    color TEXT, -- Cor para UI (hex)
    icon TEXT, -- Ãcone (nome do lucide-react)
    benefits TEXT, -- JSON com benefÃ­cios
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_tenant ON loyalty_tiers(tenant_id);

-- Tabela de Visitas/Hospedagens do Cliente (para histÃ³rico e mÃ©tricas)
CREATE TABLE IF NOT EXISTS client_visits (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    client_id TEXT NOT NULL,
    reservation_id TEXT, -- ReferÃªncia Ã  reserva (se aplicÃ¡vel)
    visit_type TEXT NOT NULL CHECK (visit_type IN ('HOSPEDAGEM','POS','EVENTO','SPA','OUTRO')),
    check_in_date TEXT,
    check_out_date TEXT,
    room_number TEXT,
    room_type TEXT,
    amount_spent REAL DEFAULT 0,
    loyalty_points_earned INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (reservation_id) REFERENCES hotel_reservations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_visits_client ON client_visits(client_id);
CREATE INDEX IF NOT EXISTS idx_client_visits_type ON client_visits(visit_type);
CREATE INDEX IF NOT EXISTS idx_client_visits_date ON client_visits(check_in_date);
CREATE INDEX IF NOT EXISTS idx_client_visits_tenant ON client_visits(tenant_id);

-- Dados iniciais: Tiers de Fidelidade
INSERT OR IGNORE INTO loyalty_tiers (id, tenant_id, name, min_visits, min_spent, discount_percent, bonus_points_multiplier, color, icon, benefits, is_active) VALUES
('tier-registado', '11111111-1111-1111-1111-111111111111', 'REGISTADO', 0, 0, 0, 1.0, '#6B7280', 'User', '["Acesso ao app", "Registo de preferÃªncias"]', 1),
('tier-ocasional', '11111111-1111-1111-1111-111111111111', 'OCASIONAL', 1, 5000, 5, 1.2, '#10B981', 'Star', '["5% desconto", "Pontos 1.2x", "Oferta de boas-vindas"]', 1),
('tier-frequente', '11111111-1111-1111-1111-111111111111', 'FREQUENTE', 5, 25000, 10, 1.5, '#F59E0B', 'Award', '["10% desconto", "Pontos 1.5x", "Upgrade quando disponÃ­vel", "Late check-out"]', 1),
('tier-vip', '11111111-1111-1111-1111-111111111111', 'VIP', 10, 100000, 15, 2.0, '#8B5CF6', 'Crown', '["15% desconto", "Pontos 2x", "Upgrade garantido", "Late check-out", "Welcome drink", "Concierge dedicado"]', 1),
('tier-residente', '11111111-1111-1111-1111-111111111111', 'RESIDENTE', 20, 250000, 20, 2.5, '#EF4444', 'Building2', '["20% desconto", "Pontos 2.5x", "Suite preferencial", "Early check-in", "Late check-out", "ServiÃ§o de quarto 24h", "Gestor de conta dedicado"]', 1);

-- Dados de teste: 3 Clientes KYC prÃ©-cadastrados
INSERT OR IGNORE INTO clients (id, tenant_id, client_number, full_name, document_type, document_number, address, email, phone, whatsapp, kyc_completed, kyc_completed_at, loyalty_tier, loyalty_points, total_visits, total_spent, total_stays, total_pos_spent, created_at, updated_at, sync_status) VALUES
('b1111111-1111-4111-8111-000000000001', '11111111-1111-1111-1111-111111111111', 'HR-2026-00001', 'Ricardo Valdemar', 'BI', '004812345LA042', 'Luanda, Ingombota', 'ricardo.valdemar@email.com', '+244 923 000 001', '+244 923 000 001', 1, datetime('now'), 'REGISTADO', 0, 0, 0, 0, 0, datetime('now'), datetime('now'), 'synced'),
('b1111111-1111-4111-8111-000000000002', '11111111-1111-1111-1111-111111111111', 'HR-2026-00002', 'JÃºlia Casseca', 'BI', '004854321LA043', 'Luanda, Maianga', 'julia.casseca@email.com', '+244 923 000 002', '+244 923 000 002', 1, datetime('now'), 'REGISTADO', 0, 0, 0, 0, 0, datetime('now'), datetime('now'), 'synced'),
('b1111111-1111-4111-8111-000000000003', '11111111-1111-1111-1111-111111111111', 'HR-2026-00003', 'Wisley Ricardo', 'BI', '004898765LA044', 'Luanda, Viana', 'wisley.ricardo@email.com', '+244 923 000 003', '+244 923 000 003', 1, datetime('now'), 'REGISTADO', 0, 0, 0, 0, 0, datetime('now'), datetime('now'), 'synced');
