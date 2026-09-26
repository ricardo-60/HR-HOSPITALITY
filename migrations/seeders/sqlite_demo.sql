-- ============================================================
--   HR-HOSPITALITY — SEEDER DE DEMONSTRAÇÃO (SQLite local)
-- ============================================================
--   Alimenta o esquema local (`hr-hospitality-app/hospitality_local.db`)
--   criado por migrations/sqlite/001..007 com dados de demonstração.
--
--   • Idempotente: seguro para re-executar.
--   • Correr com:
--         node hr-hospitality-app/scripts/seed.mjs --target=sqlite
--     (ou automaticamente por start-server.bat / start-server.sh)
--   • NÃO cria contas de autenticação: as contas de demonstração do
--     painel local são criadas pelo AuthContext no primeiro arranque.
--   • Os IDs seguem o esquema canónico introduzido pela migração 006.
-- ============================================================

-- ─── 1. Reservas de demonstração ─────────────────────────────────────────────
INSERT OR IGNORE INTO hotel_reservations
    (id, tenant_id, guest_name, email, service_type, room_number, room_id,
     check_in_date, check_out_date, status, reservation_date, notes,
     total_amount, created_at, updated_at, sync_status)
VALUES
  ('b2222222-2222-4222-8222-000000000011', '11111111-1111-1111-1111-111111111111',
   'Joana Pedro', 'joana.pedro@exemplo.ao', 'quarto', '201',
   'a1111111-1111-4111-8111-000000000201', '2026-09-26', '2026-09-29',
   'CHECKED_IN', date('now'), 'Estadia de demonstração — 3 noites.', 660.00,
   datetime('now'), datetime('now'), 'synced'),
  ('b2222222-2222-4222-8222-000000000012', '11111111-1111-1111-1111-111111111111',
   'Mário Sebastião', 'mario.sebastiao@exemplo.ao', 'quarto', '301',
   'a1111111-1111-4111-8111-000000000301', '2026-09-27', '2026-10-01',
   'CONFIRMADA', date('now'), 'Reserva de demonstração com comprovativo aprovado.', 1800.00,
   datetime('now'), datetime('now'), 'synced'),
  ('b2222222-2222-4222-8222-000000000013', '11111111-1111-1111-1111-111111111111',
   'Sandra Kiluanje', 'sandra.kiluanje@exemplo.ao', 'restaurante', NULL, NULL,
   NULL, NULL, 'PENDENTE_PAGAMENTO', date('now'), 'Reserva de restaurante para 8 pessoas.', 96000.00,
   datetime('now'), datetime('now'), 'synced'),
  ('b2222222-2222-4222-8222-000000000014', '11111111-1111-1111-1111-111111111111',
   'Paulo Nzinga', 'paulo.nzinga@exemplo.ao', 'transfer', NULL, NULL,
   NULL, NULL, 'CONFIRMADA', date('now'), 'Transfer do aeroporto — voo das 21h.', 25000.00,
   datetime('now'), datetime('now'), 'synced');

-- ─── 2. Consumos ligados às reservas existentes ──────────────────────────────
INSERT OR IGNORE INTO hotel_consumptions
    (id, tenant_id, reservation_id, description, quantity, unit_price,
     total_price, category, registered_at, created_at, sync_status)
SELECT 'c2222222-2222-4222-8222-000000000001', '11111111-1111-1111-1111-111111111111',
       r.id, 'Água mineral 500ml', 2, 700.00, 1400.00, 'minibar',
       datetime('now'), datetime('now'), 'synced'
  FROM hotel_reservations r
 WHERE r.id = 'b2222222-2222-4222-8222-000000000011';

INSERT OR IGNORE INTO hotel_consumptions
    (id, tenant_id, reservation_id, description, quantity, unit_price,
     total_price, category, registered_at, created_at, sync_status)
SELECT 'c2222222-2222-4222-8222-000000000002', '11111111-1111-1111-1111-111111111111',
       r.id, 'Jantar no restaurante', 1, 12500.00, 12500.00, 'restaurante',
       datetime('now'), datetime('now'), 'synced'
  FROM hotel_reservations r
 WHERE r.id = 'b2222222-2222-4222-8222-000000000011';

INSERT OR IGNORE INTO hotel_consumptions
    (id, tenant_id, reservation_id, description, quantity, unit_price,
     total_price, category, registered_at, created_at, sync_status)
SELECT 'c2222222-2222-4222-8222-000000000003', '11111111-1111-1111-1111-111111111111',
       r.id, 'Serviço de lavandaria (3 peças)', 1, 7500.00, 7500.00, 'lavandaria',
       datetime('now'), datetime('now'), 'synced'
  FROM hotel_reservations r
 WHERE r.id = 'b2222222-2222-4222-8222-000000000012';

-- ─── 3. Recursos humanos ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO hr_employees
    (id, tenant_id, employee_code, name, position, department,
     hire_date, base_salary, contacts, status, created_at, updated_at, sync_status)
VALUES
  ('a3333333-1111-4111-8111-000000000011', '11111111-1111-1111-1111-111111111111',
   'EMP-2026-001', 'Ana Manuel', 'Rececionista', 'Recepção',
   '2026-01-15', 280000.00, '[{"type":"telefone","value":"+244 900 000 001"}]',
   'ATIVO', datetime('now'), datetime('now'), 'synced'),
  ('a3333333-1111-4111-8111-000000000012', '11111111-1111-1111-1111-111111111111',
   'EMP-2026-002', 'Bruno Cassoma', 'Chefe de Balcão', 'Recepção',
   '2025-11-02', 340000.00, '[{"type":"telefone","value":"+244 900 000 002"}]',
   'ATIVO', datetime('now'), datetime('now'), 'synced'),
  ('a3333333-1111-4111-8111-000000000013', '11111111-1111-1111-1111-111111111111',
   'EMP-2026-003', 'Carla Domingos', 'Operadora de POS', 'Restauração',
   '2026-03-01', 210000.00, '[]', 'ATIVO', datetime('now'), datetime('now'), 'synced'),
  ('a3333333-1111-4111-8111-000000000014', '11111111-1111-1111-1111-111111111111',
   'EMP-2026-004', 'Domingos Kiala', 'Animador de Hotel', 'Animação',
   '2026-05-20', 195000.00, '[]', 'FERIAS', datetime('now'), datetime('now'), 'synced');
