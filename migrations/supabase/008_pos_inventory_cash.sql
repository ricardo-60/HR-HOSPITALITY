-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 008 · POS, ECONOMATO E CAIXA
--   Fase 1 · módulo comercial de operação
--   Idempotente: seguro para re-execução.
-- ============================================================
--
-- ÂMBITO
--   1. `pos_tables` / `pos_products` / `pos_orders` / `pos_order_items`
--      → comandas de snack-bar, bar, esplanada e piscina, com liquidação na
--        conta do quarto ou venda avulsa.
--   2. `inventory_items` / `inventory_movements` → economato, com saldo
--      calculado por trigger e alertas de stock mínimo.
--   3. `cash_sessions` → aberturas e fechos de caixa por meio de pagamento,
--        base do painel executivo de fluxo de caixa.
--   4. `tenant_audit_log` → rasto de auditoria por tenant, obrigatório num
--      produto comercializável.
--
-- DECISÃO DE MODELAGEM
--   O saldo de stock NÃO é uma coluna que o cliente escreva: é calculado por
--   trigger a partir de `inventory_movements`. Um `UPDATE` directo de
--   `current_stock` sem movimento deixaria o inventário sem justificação.
-- ============================================================

BEGIN;

-- ── 1. Catálogo POS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    zone TEXT NOT NULL
        CHECK (zone IN ('SNACK_BAR', 'BALCAO', 'ESPLANADA', 'PISCINA', 'RESTAURANTE')),
    seats INT NOT NULL DEFAULT 4 CHECK (seats > 0),
    status TEXT NOT NULL DEFAULT 'LIVRE'
        CHECK (status IN ('LIVRE', 'OCUPADA', 'RESERVADA', 'MANUTENCAO')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pos_tables_code_tenant_uq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS pos_tables_tenant_idx
    ON public.pos_tables (tenant_id, zone, is_active);

-- Produtos vendáveis no POS. Aponta para o economato quando o artigo é
-- consumível com stock físico.
CREATE TABLE IF NOT EXISTS public.pos_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'outro'
        CHECK (category IN (
            'BEBIDA', 'COMIDA', 'CAFETERIA', 'SNACK', 'PISCINA',
            'GINASIO', 'LAVANDARIA', 'HOSPEDAGEM', 'outro'
        )),
    unit TEXT NOT NULL DEFAULT 'un',
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    -- NULL = artigo revendido (bebidas engarrafadas compradas a pronto), que
    -- não consome stock do economato. Preenchido = artigo de stock.
    inventory_item_id UUID,
    affects_inventory BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pos_products_sku_tenant_uq UNIQUE (tenant_id, sku),
    CONSTRAINT pos_products_stock_link_chk
        CHECK (affects_inventory = false OR inventory_item_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS pos_products_tenant_idx
    ON public.pos_products (tenant_id, is_active, category);

-- ── 2. Comandas ───────────────────────────────────────────────────────────
-- `reservation_id` preenchido = lançamento na conta do quarto (o valor é
-- liquidado no checkout geral). NULL = venda avulsa a cliente externo.
CREATE TABLE IF NOT EXISTS public.pos_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    table_id UUID REFERENCES public.pos_tables (id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,

    customer_name TEXT,
    guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count > 0),

    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA', 'PAGA', 'CANCELADA')),
    payment_method TEXT
        CHECK (payment_method IS NULL OR payment_method IN (
            'MULTICAIXA_EXPRESS', 'TRANSFERENCIA', 'TPA', 'DINHEIRO', 'CONTA_DO_QUARTO'
        )),

    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,

    opened_by UUID,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by UUID,
    closed_at TIMESTAMPTZ,

    CONSTRAINT pos_orders_number_tenant_uq UNIQUE (tenant_id, order_number),
    CONSTRAINT pos_orders_closure_chk
        CHECK ((status = 'ABERTA') = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS pos_orders_open_idx
    ON public.pos_orders (tenant_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS pos_orders_reservation_idx
    ON public.pos_orders (reservation_id)
    WHERE reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pos_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_id UUID NOT NULL
        REFERENCES public.pos_orders (id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.pos_products (id) ON DELETE SET NULL,
    -- Cópia do nome e do preço no momento da venda: o histórico não pode mudar
    -- quando o hotel reajustar a carta.
    product_name TEXT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_order_items_order_idx
    ON public.pos_order_items (order_id);

-- O total da comanda é sempre derivado das linhas. Nunca é escrito pelo
-- cliente, o que impede que uma comanda mostre um total diferente da soma.
CREATE OR REPLACE FUNCTION public.recalc_pos_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_order UUID := COALESCE(NEW.order_id, OLD.order_id);
    new_subtotal NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(line_total), 0) INTO new_subtotal
    FROM public.pos_order_items
    WHERE order_id = target_order;

    UPDATE public.pos_orders
    SET subtotal = new_subtotal,
        total = GREATEST(new_subtotal - discount, 0)
    WHERE id = target_order;

    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS pos_order_items_recalc ON public.pos_order_items;
CREATE TRIGGER pos_order_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON public.pos_order_items
    FOR EACH ROW EXECUTE FUNCTION public.recalc_pos_order_total();

-- Uma comanda sobre conta do quarto tem de apontar para uma reserva; avulsa
-- tem de ser liquidada na hora. Misturar os dois deixaria valores órfãos.
CREATE OR REPLACE FUNCTION public.validate_pos_order_liquidation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IN ('FECHADA', 'PAGA') THEN
        IF NEW.reservation_id IS NOT NULL AND NEW.payment_method IS DISTINCT FROM 'CONTA_DO_QUARTO' THEN
            RAISE EXCEPTION
                'Uma comanda lançada na conta do quarto liquida como CONTA_DO_QUARTO'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.reservation_id IS NULL AND NEW.payment_method IS NULL THEN
            RAISE EXCEPTION
                'Uma venda avulsa precisa de um meio de pagamento'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.closed_at IS NULL THEN
            NEW.closed_at := now();
        END IF;
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pos_orders_liquidation_guard ON public.pos_orders;
CREATE TRIGGER pos_orders_liquidation_guard
    BEFORE INSERT OR UPDATE ON public.pos_orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_pos_order_liquidation();

-- A mesa passa a OCUPADA quando abre comanda e volta a LIVRE quando fecha.
CREATE OR REPLACE FUNCTION public.sync_pos_table_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.table_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF NEW.status = 'ABERTA' THEN
        UPDATE public.pos_tables
        SET status = 'OCUPADA', updated_at = now()
        WHERE id = NEW.table_id AND status IN ('LIVRE', 'RESERVADA');
    ELSIF NEW.status IN ('FECHADA', 'PAGA', 'CANCELADA') THEN
        -- Só volta a LIVRE se não houver outra comanda aberta na mesma mesa.
        IF NOT EXISTS (
            SELECT 1 FROM public.pos_orders o
            WHERE o.table_id = NEW.table_id
              AND o.status = 'ABERTA'
              AND o.id <> NEW.id
        ) THEN
            UPDATE public.pos_tables
            SET status = 'LIVRE', updated_at = now()
            WHERE id = NEW.table_id AND status = 'OCUPADA';
        END IF;
    END IF;

    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS pos_orders_table_status ON public.pos_orders;
CREATE TRIGGER pos_orders_table_status
    AFTER INSERT OR UPDATE OF status ON public.pos_orders
    FOR EACH ROW EXECUTE FUNCTION public.sync_pos_table_status();

-- ── 3. Economato e stock ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'outro'
        CHECK (category IN (
            'BEBIDA', 'COMIDA', 'LIMPEZA', 'HIGIENE',
            'ROUPARIA', 'MANUTENCAO', 'ESCRITORIO', 'outro'
        )),
    unit TEXT NOT NULL DEFAULT 'un',
    -- Saldo derivado de `inventory_movements` (ver trigger abaixo).
    current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
    min_stock NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    -- Preço médio ponderado, mantido pelo trigger de movimento.
    average_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
    supplier TEXT,
    last_restock_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT inventory_items_sku_tenant_uq UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS inventory_items_tenant_idx
    ON public.inventory_items (tenant_id, is_active, category);

-- Liga o catálogo POS ao economato.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.pos_products'::regclass
          AND conname = 'pos_products_inventory_item_fkey'
    ) THEN
        ALTER TABLE public.pos_products
            DROP CONSTRAINT IF EXISTS pos_products_inventory_item_fkey;
        ALTER TABLE public.pos_products
            ADD CONSTRAINT pos_products_inventory_item_fkey
            FOREIGN KEY (inventory_item_id)
            REFERENCES public.inventory_items (id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.inventory_items (id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL
        CHECK (movement_type IN ('ENTRADA', 'SAIDA', 'QUEBRA', 'INVENTARIO', 'AJUSTE')),

    -- Sempre positivo na quantia; o sinal vem de `movement_type`. Assim o
    -- histórico nunca tem quantidades negativas ambíguas.
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),

    reason TEXT,
    reference_type TEXT
        CHECK (reference_type IS NULL OR reference_type IN (
            'COMPRA', 'POS', 'MANUTENCAO', 'LAVANDARIA', 'INVENTARIO', 'PERDA'
        )),
    reference_id UUID,
    balance_after NUMERIC(14, 3),

    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_item_idx
    ON public.inventory_movements (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_tenant_idx
    ON public.inventory_movements (tenant_id, created_at DESC);

-- O saldo e o preço médio são SEMPRE derivados dos movimentos. Um cliente que
-- escreva `current_stock` diretamente não tem como: a coluna é recalculada em
-- cada movimento e o rasto fica completo.
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    item_row RECORD;
    delta NUMERIC(14, 3);
    new_stock NUMERIC(14, 3);
    new_average NUMERIC(14, 4);
BEGIN
    SELECT * INTO item_row
    FROM public.inventory_items
    WHERE id = NEW.item_id
    FOR UPDATE;

    IF item_row IS NULL THEN
        RAISE EXCEPTION 'Artigo de stock inexistente: %', NEW.item_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF item_row.tenant_id <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Movimento de stock entre tenants é proibido'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Entrada e inventário aumentam; os restantes Diminuem.
    IF NEW.movement_type IN ('ENTRADA', 'INVENTARIO') THEN
        delta := NEW.quantity;
    ELSE
        delta := -NEW.quantity;
    END IF;

    new_stock := item_row.current_stock + delta;

    IF new_stock < 0 THEN
        RAISE EXCEPTION
            'Stock insuficiente em %: disponível %, pedido %',
            item_row.name, item_row.current_stock, NEW.quantity
            USING ERRCODE = 'check_violation';
    END IF;

    -- Preço médio ponderado, só recalculado em entradas.
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND NEW.movement_type = 'ENTRADA' THEN
        IF item_row.current_stock > 0 AND item_row.average_cost > 0 THEN
            new_average := (
                (item_row.current_stock * item_row.average_cost) + (NEW.quantity * NEW.unit_cost)
            ) / new_stock;
        ELSE
            new_average := NEW.unit_cost;
        END IF;
    ELSE
        new_average := item_row.average_cost;
    END IF;

    UPDATE public.inventory_items
    SET current_stock = new_stock,
        average_cost = ROUND(new_average, 2),
        last_restock_at = CASE
            WHEN NEW.movement_type = 'ENTRADA' THEN now()
            ELSE last_restock_at
        END,
        updated_at = now()
    WHERE id = NEW.item_id;

    NEW.balance_after := new_stock;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS inventory_movements_apply ON public.inventory_movements;
CREATE TRIGGER inventory_movements_apply
    BEFORE INSERT ON public.inventory_movements
    FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ── 4. Caixa ──────────────────────────────────────────────────────────────
-- Abertura e fecho por turno, com o dinheiro declarado por meio de pagamento.
-- É a fonte primária do painel executivo de fluxo de caixa.
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    session_number TEXT NOT NULL,
    opened_by UUID,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by UUID,
    closed_at TIMESTAMPTZ,

    -- Fundos com que a caixa abriu, por método.
    opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),

    -- Contagens declaradas no fecho.
    closing_cash NUMERIC(12, 2) CHECK (closing_cash IS NULL OR closing_cash >= 0),
    expected_cash NUMERIC(12, 2),
    difference NUMERIC(12, 2),

    -- Totais apurados pelo sistema a partir de `pos_orders`, para comparação.
    system_multicaixa NUMERIC(12, 2) NOT NULL DEFAULT 0,
    system_tpa NUMERIC(12, 2) NOT NULL DEFAULT 0,
    system_transfer NUMERIC(12, 2) NOT NULL DEFAULT 0,
    system_room_charge NUMERIC(12, 2) NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA', 'ANULADA')),
    notes TEXT,

    CONSTRAINT cash_sessions_number_tenant_uq UNIQUE (tenant_id, session_number),
    CONSTRAINT cash_sessions_closure_chk CHECK ((status = 'ABERTA') = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS cash_sessions_tenant_idx
    ON public.cash_sessions (tenant_id, opened_at DESC);

-- Uma caixa aberta por tenant impede uma segunda aberta. Índices únicos
-- parciais resolvem sem trigger.
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_uq
    ON public.cash_sessions (tenant_id)
    WHERE status = 'ABERTA';

-- Ao fechar, calcula a diferença entre o declarado e o esperado.
CREATE OR REPLACE FUNCTION public.close_cash_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'ABERTA' AND NEW.status = 'FECHADA' THEN
        IF NEW.closing_cash IS NULL THEN
            RAISE EXCEPTION 'O fecho de caixa exige a contagem de dinheiro'
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_multicaixa
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'MULTICAIXA_EXPRESS'
          AND o.status = 'PAGA'
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_tpa
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'TPA'
          AND o.status = 'PAGA'
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_transfer
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'TRANSFERENCIA'
          AND o.status = 'PAGA'
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        SELECT COALESCE(SUM(o.total), 0) INTO NEW.system_room_charge
        FROM public.pos_orders o
        WHERE o.tenant_id = NEW.tenant_id
          AND o.payment_method = 'CONTA_DO_QUARTO'
          AND o.status IN ('FECHADA', 'PAGA')
          AND o.closed_at >= NEW.opened_at
          AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at);

        -- Para vendas em dinheiro o esperado é a abertura mais o que entrou em
        -- numerário. Multicaixa, TPA e transferências entram por terminal, não
        -- na gaveta, e ficam registados em separado.
        NEW.expected_cash := NEW.opening_cash + (
            SELECT COALESCE(SUM(o.total), 0)
            FROM public.pos_orders o
            WHERE o.tenant_id = NEW.tenant_id
              AND o.payment_method = 'DINHEIRO'
              AND o.status = 'PAGA'
              AND o.closed_at >= NEW.opened_at
              AND (NEW.closed_at IS NULL OR o.closed_at <= NEW.closed_at)
        );

        NEW.difference := NEW.closing_cash - NEW.expected_cash;

        IF NEW.closed_at IS NULL THEN
            NEW.closed_at := now();
        END IF;
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cash_sessions_close ON public.cash_sessions;
CREATE TRIGGER cash_sessions_close
    BEFORE UPDATE OF status ON public.cash_sessions
    FOR EACH ROW EXECUTE FUNCTION public.close_cash_session();

-- ── 5. Rastro de auditoria ────────────────────────────────────────────────
-- Num produto comercializável é preciso responder "quem mudou o quê, quando e
-- em que hotel". Escrito por trigger, não pela aplicação, para que nenhuma
-- rota de código o contorne.
CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    actor_id UUID,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_table TEXT NOT NULL,
    entity_id TEXT,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_audit_log_tenant_idx
    ON public.tenant_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_audit_log_entity_idx
    ON public.tenant_audit_log (tenant_id, entity_table, entity_id);

CREATE OR REPLACE FUNCTION public.write_tenant_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    row_id TEXT;
BEGIN
    row_id := COALESCE(
        (NEW.id::text),
        (OLD.id::text)
    );

    INSERT INTO public.tenant_audit_log (
        tenant_id, actor_id, actor_role, action, entity_table,
        entity_id, before_data, after_data
    )
    VALUES (
        COALESCE(
            (SELECT p.tenant_id FROM public.hr_current_profile() AS p),
            (NEW.tenant_id),
            (OLD.tenant_id)
        ),
        (SELECT auth.uid()),
        (SELECT p.role FROM public.hr_current_profile() AS p),
        TG_OP,
        TG_TABLE_NAME,
        row_id,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    RETURN COALESCE(NEW, OLD);
END
$$;

-- Auditoria nas operações sensíveis. `tenant_bank_accounts` fica de fora de
-- propósito: guardar o IBAN e o resto da linha em texto simples duplicaria um
-- dado de pagamento sem necessidade.
DO $$
DECLARE
    audit_table TEXT;
BEGIN
    FOREACH audit_table IN ARRAY ARRAY[
        'guest_profiles', 'payment_proofs',
        'pos_orders', 'pos_order_items',
        'inventory_movements', 'cash_sessions'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', audit_table || '_audit', audit_table);
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.write_tenant_audit()',
            audit_table || '_audit', audit_table
        );
    END LOOP;
END
$$;

-- ── 6. RLS e privilégios ──────────────────────────────────────────────────
ALTER TABLE public.pos_tables           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_log     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'pos_tables', 'pos_products', 'pos_orders', 'pos_order_items',
              'inventory_items', 'inventory_movements', 'cash_sessions',
              'tenant_audit_log'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            policy_row.policyname, policy_row.schemaname, policy_row.tablename
        );
    END LOOP;
END
$$;

REVOKE ALL ON TABLE public.pos_tables          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_products        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_orders          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_order_items     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_items     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cash_sessions       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_audit_log    FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.pos_tables          TO service_role;
GRANT ALL ON TABLE public.pos_products        TO service_role;
GRANT ALL ON TABLE public.pos_orders          TO service_role;
GRANT ALL ON TABLE public.pos_order_items     TO service_role;
GRANT ALL ON TABLE public.inventory_items     TO service_role;
GRANT ALL ON TABLE public.inventory_movements TO service_role;
GRANT ALL ON TABLE public.cash_sessions       TO service_role;
GRANT ALL ON TABLE public.tenant_audit_log    TO service_role;

-- O módulo POS não dá dinheiro ao `anon`. O `anon` fica sem qualquer acesso.
GRANT SELECT ON TABLE public.pos_tables   TO authenticated;
GRANT SELECT ON TABLE public.pos_products TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.pos_orders, public.pos_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.inventory_items, public.inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.cash_sessions TO authenticated;
GRANT SELECT ON TABLE public.tenant_audit_log TO authenticated;

-- Mesas e produtos: leitura em todo o tenant, escrita por quem opera o POS.
CREATE POLICY pos_tables_read
    ON public.pos_tables FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY pos_tables_write
    ON public.pos_tables FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

CREATE POLICY pos_products_read
    ON public.pos_products FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY pos_products_write
    ON public.pos_products FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

-- O `EXECUTIVO` lê, e é tudo o que faz: não há policy de escrita para ele.
CREATE POLICY pos_orders_read
    ON public.pos_orders FOR SELECT TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_module('pos'))
    );

CREATE POLICY pos_orders_write
    ON public.pos_orders FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

CREATE POLICY pos_order_items_read
    ON public.pos_order_items FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY pos_order_items_write
    ON public.pos_order_items FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

CREATE POLICY inventory_items_read
    ON public.inventory_items FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY inventory_items_write
    ON public.inventory_items FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    );

-- O POS consome stock, por isso precisa de inserir movimentos. Não precisa de
-- mexer no artigo: o saldo é do trigger.
CREATE POLICY inventory_movements_read
    ON public.inventory_movements FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY inventory_movements_insert_pos
    ON public.inventory_movements FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            (SELECT public.hr_can_write_module('economato'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

CREATE POLICY inventory_movements_write_economato
    ON public.inventory_movements FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('economato'))
    );

CREATE POLICY cash_sessions_read
    ON public.cash_sessions FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

CREATE POLICY cash_sessions_write
    ON public.cash_sessions FOR ALL TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

-- Auditoria: leitura para quem lê o tenant, escrita apenas por trigger
-- SECURITY DEFINER. Consequentemente nenhuma policy de INSERT/UPDATE/DELETE.
CREATE POLICY tenant_audit_log_read
    ON public.tenant_audit_log FOR SELECT TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

COMMIT;
