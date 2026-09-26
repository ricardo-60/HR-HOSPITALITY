-- ============================================================
--   HR-HOSPITALITY — SEEDER DE DEMONSTRAÇÃO (Supabase / Postgres)
-- ============================================================
--   Alimenta o esquema criado por 001..008 com dados de demonstração
--   coerentes para a sessão de demonstração.
--
--   • Idempotente: seguro para re-executar (ON CONFLICT / WHERE NOT EXISTS).
--   • Correr como `postgres` (superuser) via PSQL ou pelo runner:
--         node hr-hospitality-app/scripts/seed.mjs --target=supabase
--   • NÃO cria utilizadores nem palavras-passe: as contas nascem no
--     Supabase Auth e o perfil é criado em `public.app_users`.
--   • O IBAN é deliberadamente o PLACEHOLDER `AO06 0000 …`; a aplicação
--     móvel detecta-o (`isPlaceholderIban`) e recusa enviar instruções de
--     pagamento. Substitua-o e reinicie a app antes do lançamento real.
-- ============================================================

-- ─── 1. Segundo tenant (demonstração de multi-tenancy / RLS) ─────────────────
INSERT INTO public.tenants (id, name, slug, currency, created_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'Hotel Demo Reserva', 'hotel-demo-reserva', 'Kz', now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.hotel_rooms (id, tenant_id, room_number, room_type, status, price_per_night, floor, description)
VALUES
  ('b1111111-1111-4111-8111-000000000201', '22222222-2222-2222-2222-222222222222', '11', 'Standard', 'DISPONIVEL', 130.00, 1, 'Quarto standard (tenant de demonstração)'),
  ('b1111111-1111-4111-8111-000000000202', '22222222-2222-2222-2222-222222222222', '12', 'Standard', 'DISPONIVEL', 130.00, 1, 'Quarto standard (tenant de demonstração)'),
  ('b1111111-1111-4111-8111-000000000203', '22222222-2222-2222-2222-222222222222', '21', 'Double',    'OCUPADO',    200.00, 2, 'Quarto duplo (tenant de demonstração)'),
  ('b1111111-1111-4111-8111-000000000204', '22222222-2222-2222-2222-222222222222', '31', 'Suite',     'DISPONIVEL', 420.00, 3, 'Suite (tenant de demonstração)')
ON CONFLICT (tenant_id, room_number) DO NOTHING;

-- ─── 2. Conta bancária do tenant principal (placeholder deliberado) ──────────
INSERT INTO public.tenant_bank_accounts (
    id, tenant_id, bank_name, iban, account_holder, account_type, currency,
    supports_multicaixa_express, is_primary, is_active, instructions, created_at, updated_at
)
SELECT
    'c1111111-1111-4111-8111-000000000001',
    t.id,
    'Banco de Angola (PLACEHOLDER)',
    'AO06 0000 0000 0000 0000 0000 0',
    'Hotel Lukweku, Lda.',
    'CORRENTE',
    'Kz',
    false,
    true,
    true,
    'IBAN de demonstração. Substituir pelo IBAN real antes de aceitar pagamentos.',
    now(), now()
FROM public.tenants t
WHERE t.id = '11111111-1111-1111-1111-111111111111'
  AND NOT EXISTS (
        SELECT 1 FROM public.tenant_bank_accounts b
         WHERE b.tenant_id = t.id AND b.is_primary
  );

-- ─── 3. Planos de ginásio / piscina ──────────────────────────────────────────
INSERT INTO public.gym_plans (id, tenant_id, name, plan_type, price, duration_days,
                              guest_discount_pct, guest_included, includes_pool, includes_gym,
                              max_guests, description, is_active, sort_order, created_at, updated_at)
SELECT 'd1111111-1111-4111-8111-000000000001', t.id, 'Diária Ginasio', 'DIARIA', 3500.00, 1,
       0, false, false, true, 1, 'Acesso ao ginásio durante um dia.', true, 1, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.gym_plans (id, tenant_id, name, plan_type, price, duration_days,
                              guest_discount_pct, guest_included, includes_pool, includes_gym,
                              max_guests, description, is_active, sort_order, created_at, updated_at)
SELECT 'd1111111-1111-4111-8111-000000000002', t.id, 'Semana Ginasio + Piscina', 'SEMANAL', 15000.00, 7,
       10, false, true, true, 1, 'Acesso semanal ao ginásio e às piscinas.', true, 2, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.gym_plans (id, tenant_id, name, plan_type, price, duration_days,
                              guest_discount_pct, guest_included, includes_pool, includes_gym,
                              max_guests, description, is_active, sort_order, created_at, updated_at)
SELECT 'd1111111-1111-4111-8111-000000000003', t.id, 'Mensal Ilimitado', 'MENSAL', 45000.00, 30,
       100, true, true, true, 2, 'Incluído na diária dos hóspedes.', true, 3, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

-- ─── 4. Catálogos públicos (piscinas, lavandaria, salas de eventos) ──────────
INSERT INTO public.public_pools (id, slug, name, description, depth_min_m, depth_max_m,
                                 opening_hours, image_url, is_active, sort_order, created_at)
SELECT 'e1111111-1111-4111-8111-000000000001', 'piscina-principal', 'Piscina Principal',
       'Piscina olímpica com bar e zona de descanso.', 1.2, 2.0,
       '08:00 – 19:00', NULL, true, 1, now()
WHERE NOT EXISTS (SELECT 1 FROM public.public_pools WHERE slug = 'piscina-principal');

INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT 'e1111111-1111-4111-8111-000000000001', 'Adulto', 4500.00, 'Kz/pessoa', 1
WHERE NOT EXISTS (SELECT 1 FROM public.public_pool_prices WHERE pool_id = 'e1111111-1111-4111-8111-000000000001' AND label = 'Adulto');

INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT 'e1111111-1111-4111-8111-000000000001', 'Criança (até 10 anos)', 2000.00, 'Kz/pessoa', 2
WHERE NOT EXISTS (SELECT 1 FROM public.public_pool_prices WHERE pool_id = 'e1111111-1111-4111-8111-000000000001' AND label = 'Criança (até 10 anos)');

INSERT INTO public.public_pools (id, slug, name, description, depth_min_m, depth_max_m,
                                 opening_hours, image_url, is_active, sort_order, created_at)
SELECT 'e1111111-1111-4111-8111-000000000002', 'piscina-infantil', 'Piscina Infantil',
       'Piscina rasa com atrações aquáticas para crianças.', 0.4, 0.8,
       '09:00 – 18:00', NULL, true, 2, now()
WHERE NOT EXISTS (SELECT 1 FROM public.public_pools WHERE slug = 'piscina-infantil');

INSERT INTO public.public_pool_prices (pool_id, label, price, unit, sort_order)
SELECT 'e1111111-1111-4111-8111-000000000002', 'Criança', 1500.00, 'Kz/pessoa', 1
WHERE NOT EXISTS (SELECT 1 FROM public.public_pool_prices WHERE pool_id = 'e1111111-1111-4111-8111-000000000002' AND label = 'Criança');

INSERT INTO public.public_laundry_services (id, slug, name, description, price, unit,
                                            turnaround_hours, sort_order, is_active, created_at)
VALUES
  ('f1111111-1111-4111-8111-000000000001', 'lavagem-por-kg', 'Lavagem por quilo',
   'Lavagem, secagem e dobragem.', 1800.00, 'Kz/kg', 24, 1, true, now()),
  ('f1111111-1111-4111-8111-000000000002', 'lavagem-urgente', 'Lavagem urgente (6h)',
   'Serviço expresso com suplemento.', 3200.00, 'Kz/kg', 6, 2, true, now()),
  ('f1111111-1111-4111-8111-000000000003', 'engomadoria', 'Engomadoria de peça',
   'Engomadoria de camisas e vestidos.', 2500.00, 'Kz/peça', 12, 3, true, now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.public_event_spaces (id, slug, name, description, capacity,
                                        price_per_hour, price_per_day, image_url,
                                        is_active, sort_order, created_at)
VALUES
  ('a2222222-1111-4111-8111-000000000001', 'salao-lukweku', 'Salão Lukweku',
   'Salão principal para banquetes e conferências.', 250, 45000.00, 320000.00, NULL, true, 1, now()),
  ('a2222222-1111-4111-8111-000000000002', 'sala-reuniao', 'Sala de Reunião',
   'Sala equipada para 20 pessoas com projetor.', 20, 12000.00, 80000.00, NULL, true, 2, now())
ON CONFLICT (slug) DO NOTHING;

-- ─── 5. Recursos humanos ─────────────────────────────────────────────────────
INSERT INTO public.hr_employees (id, tenant_id, employee_code, name, position, department,
                                 hire_date, base_salary, contacts, status, created_at, updated_at)
SELECT 'a3333333-1111-4111-8111-000000000001', t.id, 'EMP-2026-001', 'Ana Manuel', 'Rececionista',
       'Recepção', DATE '2026-01-15', 280000.00, '[{"type":"telefone","value":"+244 900 000 001"}]'::jsonb,
       'ATIVO', now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.hr_employees (id, tenant_id, employee_code, name, position, department,
                                 hire_date, base_salary, contacts, status, created_at, updated_at)
SELECT 'a3333333-1111-4111-8111-000000000002', t.id, 'EMP-2026-002', 'Bruno Cassoma', 'Chefe de Balcão',
       'Recepção', DATE '2025-11-02', 340000.00, '[{"type":"telefone","value":"+244 900 000 002"}]'::jsonb,
       'ATIVO', now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.hr_employees (id, tenant_id, employee_code, name, position, department,
                                 hire_date, base_salary, contacts, status, created_at, updated_at)
SELECT 'a3333333-1111-4111-8111-000000000003', t.id, 'EMP-2026-003', 'Carla Domingos', 'Operadora de POS',
       'Restauração', DATE '2026-03-01', 210000.00, '[]'::jsonb,
       'ATIVO', now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ─── 6. Economato (stock) ────────────────────────────────────────────────────
INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000001', t.id, 'INV-AGUA-500', 'Água mineral 500ml',
       'BEBIDA', 'un', 240, 48, 180.00, 'Lukweku Distribuidora', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000002', t.id, 'INV-CERVEJA-330', 'Cerveja 330ml',
       'BEBIDA', 'un', 180, 60, 420.00, 'Lukweku Distribuidora', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000003', t.id, 'INV-TOALHA', 'Toalha de banho',
       'ROUPARIA', 'un', 120, 40, 2500.00, 'Têxtil Kilamba', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory_items (id, tenant_id, sku, name, category, unit, current_stock,
                                    min_stock, average_cost, supplier, is_active, created_at, updated_at)
SELECT 'a4444444-1111-4111-8111-000000000004', t.id, 'INV-DET', 'Detergente 5L',
       'LIMPEZA', 'un', 25, 10, 3900.00, 'Clean Angola', true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

-- ─── 7. Salas / mesas do POS ─────────────────────────────────────────────────
INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000001', t.id, 'SB-01', 'Mesa Snack 1',  'SNACK_BAR',  4, 'LIVRE', true, 1, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000002', t.id, 'SB-02', 'Mesa Snack 2',  'SNACK_BAR',  6, 'LIVRE', true, 2, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000003', t.id, 'BAL-01', 'Balcão',       'BALCAO',     2, 'OCUPADA', true, 3, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.pos_tables (id, tenant_id, code, name, zone, seats, status, is_active, sort_order, created_at, updated_at)
SELECT 'a5555555-1111-4111-8111-000000000004', t.id, 'PIS-01', 'Esplanada piscina', 'PISCINA', 4, 'LIVRE', true, 4, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ─── 8. Produtos POS (ligados ao economato quando consomem stock) ────────────
INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000001', t.id, 'POS-AGUA-500', 'Água mineral 500ml',
       'BEBIDA', 'un', 700.00,
       (SELECT i.id FROM public.inventory_items i WHERE i.tenant_id = t.id AND i.sku = 'INV-AGUA-500'),
       true, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000002', t.id, 'POS-CERVEJA-330', 'Cerveja 330ml',
       'BEBIDA', 'un', 1500.00,
       (SELECT i.id FROM public.inventory_items i WHERE i.tenant_id = t.id AND i.sku = 'INV-CERVEJA-330'),
       true, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000003', t.id, 'POS-BIFE', 'Bife com batata',
       'COMIDA', 'un', 6500.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000004', t.id, 'POS-CAFÉ', 'Cappuccino',
       'CAFETERIA', 'un', 2200.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000005', t.id, 'POS-BOLACHAS', 'Bolachas 150g',
       'SNACK', 'un', 1200.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.pos_products (id, tenant_id, sku, name, category, unit, price,
                                 inventory_item_id, affects_inventory, is_active, created_at, updated_at)
SELECT 'a6666666-1111-4111-8111-000000000006', t.id, 'POS-ENTRADA-SPA', 'Entrada Spa',
       'HOSPEDAGEM', 'un', 12000.00, NULL, false, true, now(), now()
FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, sku) DO NOTHING;
