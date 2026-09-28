-- ============================================================
-- HR-HOSPITALITY - Migracao 011
-- Catalogo mestre, conta do hospede, tarifas por hora e
-- pre-conta anti-fraude
-- ============================================================
-- Sumario:
--   1. Estado de quarto RESERVADO
--   2. master_products_catalog (global) e vinculos locais
--   3. Regra de stock zero no POS (chave estrangeira + RPC)
--   4. room_rates - tarifa diaria ou por bloco horario
--   5. hourly_billing - sessoes horarias com contagem decrescente
--   6. guest_accounts / guest_order_items - extrato transparente
--   7. pre_bill_logs - pre-conta auditada
--   8. Bloqueio auditado dos itens da comanda
--   9. Funcoes de negocio
--  10. RLS e privilegios
--  11. Realtime
--  12. Seed do catalogo (produtos angolanos e internacionais)
--  13. Registo da versao
--
-- Regra de compatibilidade: nenhum valor novo do enum
-- `hotel_room_status` e consumido dentro desta migracao - o Postgres
-- so liberta o valor depois do commit. Quem atribui RESERVADO e o
-- painel, ja com a migracao aplicada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Estado de quarto RESERVADO
-- ------------------------------------------------------------
-- Livre, Ocupado, Reservado, Limpeza e Manutencao sao os cinco
-- estados do quadro de quartos. O quarto reservado para hoje mas
-- ainda sem check-in fica visivel de amarelo.
DO $$
BEGIN
    IF to_regtype('public.hotel_room_status') IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_enum AS e
        JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'hotel_room_status'
          AND e.enumlabel = 'RESERVADO'
    ) THEN
        ALTER TYPE public.hotel_room_status ADD VALUE 'RESERVADO';
    END IF;
END
$$;


-- ------------------------------------------------------------
-- 2. Catalogo mestre de produtos
-- ------------------------------------------------------------
-- Tabela GLOBAL (sem tenant): e o dicionario partilhado de todas as
-- instancias. Cada propriedade copia o que quiser para os seus
-- `pos_products` / `inventory_items` e ajusta o preco local.
CREATE TABLE IF NOT EXISTS public.master_products_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    -- `kind` alimenta os relatorios (Top Pratos vs Top Bebidas);
    -- `category` usa o mesmo vocabulario do POS para copia 1:1.
    kind TEXT NOT NULL DEFAULT 'OUTRO'
        CHECK (kind IN ('BEBIDA', 'PRATO', 'LANCHE', 'SERVICO', 'OUTRO')),
    category TEXT NOT NULL DEFAULT 'outro'
        CHECK (category IN (
            'BEBIDA', 'COMIDA', 'CAFETERIA', 'SNACK', 'PISCINA',
            'GINASIO', 'LAVANDARIA', 'HOSPEDAGEM', 'outro'
        )),
    unit TEXT NOT NULL DEFAULT 'un',
    suggested_price NUMERIC(12, 2) NOT NULL DEFAULT 0
        CHECK (suggested_price >= 0),
    -- LOCAL = marca ou prato angolano; GLOBAL = marca internacional.
    origin TEXT NOT NULL DEFAULT 'LOCAL'
        CHECK (origin IN ('LOCAL', 'GLOBAL')),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT master_products_catalog_sku_uq UNIQUE (sku),
    CONSTRAINT master_products_catalog_name_ck
        CHECK (length(trim(name)) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS master_products_catalog_kind_idx
    ON public.master_products_catalog (kind, is_active);

CREATE INDEX IF NOT EXISTS master_products_catalog_category_idx
    ON public.master_products_catalog (category, is_active);

CREATE INDEX IF NOT EXISTS master_products_catalog_name_idx
    ON public.master_products_catalog (upper(name));

CREATE OR REPLACE FUNCTION public.set_master_products_catalog_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS master_products_catalog_updated_at
    ON public.master_products_catalog;
CREATE TRIGGER master_products_catalog_updated_at
    BEFORE UPDATE ON public.master_products_catalog
    FOR EACH ROW EXECUTE FUNCTION public.set_master_products_catalog_updated_at();


-- ------------------------------------------------------------
-- 3. Vinculos locais + regra de stock zero
-- ------------------------------------------------------------
-- Cadeia: pos_products -> inventory_items -> master_products_catalog.
-- E o que permite ao POS esconder automaticamente o artigo cujo saldo
-- chegou a zero, mantendo-o visivel na gestao do painel.
ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS master_product_id UUID
        REFERENCES public.master_products_catalog (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_items_master_product_idx
    ON public.inventory_items (master_product_id)
    WHERE master_product_id IS NOT NULL;

ALTER TABLE public.pos_products
    ADD COLUMN IF NOT EXISTS master_product_id UUID
        REFERENCES public.master_products_catalog (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pos_products_master_product_idx
    ON public.pos_products (master_product_id)
    WHERE master_product_id IS NOT NULL;

-- `inventory_item_id` nunca teve chave estrangeira - so um CHECK. Um
-- artigo apagado do economato deixava o produto do POS a apontar para o
-- nada e impedia o embed `inventory_items(current_stock)` no PostgREST.
-- Limpa as referencias pendentes e instala a FK.
UPDATE public.pos_products AS p
SET inventory_item_id = NULL,
    affects_inventory = FALSE,
    updated_at = now()
WHERE p.inventory_item_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.inventory_items AS i WHERE i.id = p.inventory_item_id
  );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'pos_products_inventory_item_fkey'
          AND conrelid = 'public.pos_products'::regclass
    ) THEN
        ALTER TABLE public.pos_products
            ADD CONSTRAINT pos_products_inventory_item_fkey
            FOREIGN KEY (inventory_item_id)
            REFERENCES public.inventory_items (id)
            ON DELETE SET NULL;
    END IF;
END
$$;


-- ------------------------------------------------------------
-- 4. Tarifas de quarto - diaria ou por bloco horario
-- ------------------------------------------------------------
-- Escopo de aplicacao, por ordem de especificidade:
--   1. `room_id`       -> tarifa daquele quarto
--   2. `room_type`     -> tarifa do tipo de quarto
--   3. ambos nulos     -> tarifa geral da propriedade
-- `block_hours = 0` significa "nao se aplica" (tarifa diaria); 1, 2 e 3
-- sao os blocos horarios vendidos.
CREATE TABLE IF NOT EXISTS public.room_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.hotel_rooms (id) ON DELETE CASCADE,
    room_type TEXT,
    label TEXT NOT NULL DEFAULT 'Tarifa padrao',
    billing_mode TEXT NOT NULL DEFAULT 'PER_DAY'
        CHECK (billing_mode IN ('PER_DAY', 'PER_HOUR')),
    block_hours INT NOT NULL DEFAULT 0
        CHECK (block_hours IN (0, 1, 2, 3)),
    price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    -- Hora extra apos o bloco contratado. NULL = calculada como
    -- preco do bloco dividido pelo numero de horas.
    extra_hour_price NUMERIC(12, 2)
        CHECK (extra_hour_price IS NULL OR extra_hour_price >= 0),
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE,
    valid_to DATE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Tarifa diaria nao tem bloco; tarifa horaria tem de ter 1, 2 ou 3.
    CONSTRAINT room_rates_block_ck
        CHECK (
            (billing_mode = 'PER_DAY'  AND block_hours = 0)
         OR (billing_mode = 'PER_HOUR' AND block_hours IN (1, 2, 3))
        ),
    CONSTRAINT room_rates_period_ck
        CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)
);

-- Uma tarifa por ambito e por bloco. Os indices sao parciais porque o
-- Postgres trata NULLs como distintos numa chave unica.
CREATE UNIQUE INDEX IF NOT EXISTS room_rates_room_uq
    ON public.room_rates (tenant_id, room_id, billing_mode, block_hours)
    WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_rates_type_uq
    ON public.room_rates (tenant_id, room_type, billing_mode, block_hours)
    WHERE room_id IS NULL AND room_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_rates_global_uq
    ON public.room_rates (tenant_id, billing_mode, block_hours)
    WHERE room_id IS NULL AND room_type IS NULL;

CREATE INDEX IF NOT EXISTS room_rates_tenant_idx
    ON public.room_rates (tenant_id, is_active, billing_mode);

CREATE OR REPLACE FUNCTION public.set_room_rates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS room_rates_updated_at ON public.room_rates;
CREATE TRIGGER room_rates_updated_at
    BEFORE UPDATE ON public.room_rates
    FOR EACH ROW EXECUTE FUNCTION public.set_room_rates_updated_at();


-- ------------------------------------------------------------
-- 5. Sessoes de facturacao horaria
-- ------------------------------------------------------------
-- O quadro de quartos desenha a contagem decrescente a partir de
-- `ends_at`; a aplicacao so faz a diferenca para a hora local.
CREATE TABLE IF NOT EXISTS public.hourly_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.hotel_rooms (id) ON DELETE CASCADE,
    room_rate_id UUID REFERENCES public.room_rates (id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,
    block_hours INT NOT NULL DEFAULT 1 CHECK (block_hours IN (1, 2, 3)),
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
    extra_hour_rate NUMERIC(12, 2)
        CHECK (extra_hour_rate IS NULL OR extra_hour_rate >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    extensions INT NOT NULL DEFAULT 0 CHECK (extensions >= 0),
    grace_minutes INT NOT NULL DEFAULT 15 CHECK (grace_minutes >= 0),
    status TEXT NOT NULL DEFAULT 'EM_CURSO'
        CHECK (status IN ('EM_CURSO', 'PAGO', 'CANCELADA')),
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hourly_billing_ends_ck CHECK (ends_at > started_at),
    CONSTRAINT hourly_billing_closure_ck
        CHECK ((status = 'EM_CURSO') = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS hourly_billing_open_idx
    ON public.hourly_billing (tenant_id, status, ends_at);

CREATE INDEX IF NOT EXISTS hourly_billing_room_idx
    ON public.hourly_billing (room_id, status);

CREATE INDEX IF NOT EXISTS hourly_billing_created_idx
    ON public.hourly_billing (tenant_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.set_hourly_billing_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hourly_billing_updated_at ON public.hourly_billing;
CREATE TRIGGER hourly_billing_updated_at
    BEFORE UPDATE ON public.hourly_billing
    FOR EACH ROW EXECUTE FUNCTION public.set_hourly_billing_updated_at();


-- ------------------------------------------------------------
-- 6. Conta do hospede - extrato transparente
-- ------------------------------------------------------------
-- O hospede abre a app do cliente e ve, linha a linha, tudo o que
-- consumiu no hotel. Cada linha nasce de um lancamento real, nunca de
-- um resumo calculado pela aplicacao.
CREATE TABLE IF NOT EXISTS public.guest_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    account_number TEXT NOT NULL,
    guest_profile_id UUID REFERENCES public.guest_profiles (id) ON DELETE SET NULL,
    -- Conta ligada a uma sessao autenticada: e a chave que a app do
    -- cliente usa para encontrar o extrato proprio.
    auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,
    room_number TEXT,
    source TEXT NOT NULL DEFAULT 'HOSPEDAGEM'
        CHECK (source IN ('HOSPEDAGEM', 'RESTAURANTE', 'BAR', 'EVENTO')),
    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA', 'PAGA', 'CANCELADA')),
    currency TEXT NOT NULL DEFAULT 'AOA',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    -- O total nunca e escrito por ninguem: e sempre subtotal menos
    -- desconto, calculado pelo proprio Postgres. O extrato do hospede
    -- nao pode divergir da soma das linhas.
    total NUMERIC(14, 2)
        GENERATED ALWAYS AS (subtotal - discount) STORED,
    pre_billed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT guest_accounts_number_uq UNIQUE (tenant_id, account_number),
    CONSTRAINT guest_accounts_closure_ck
        CHECK ((status = 'ABERTA') = (closed_at IS NULL)),
    CONSTRAINT guest_accounts_discount_ck CHECK (discount <= subtotal)
);

CREATE INDEX IF NOT EXISTS guest_accounts_tenant_idx
    ON public.guest_accounts (tenant_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS guest_accounts_auth_idx
    ON public.guest_accounts (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_accounts_reservation_idx
    ON public.guest_accounts (reservation_id)
    WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_accounts_room_idx
    ON public.guest_accounts (tenant_id, room_number);

CREATE OR REPLACE FUNCTION public.set_guest_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guest_accounts_updated_at ON public.guest_accounts;
CREATE TRIGGER guest_accounts_updated_at
    BEFORE UPDATE ON public.guest_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_guest_accounts_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    account_id UUID NOT NULL
        REFERENCES public.guest_accounts (id) ON DELETE CASCADE,
    origin TEXT NOT NULL DEFAULT 'RESTAURANTE'
        CHECK (origin IN (
            'ALOJAMENTO', 'RESTAURANTE', 'BAR', 'SNACK', 'PISCINA',
            'GINASIO', 'LAVANDARIA', 'ROOM_SERVICE', 'EVENTO', 'SERVICO'
        )),
    -- Rastro ate a fonte: se a linha veio de uma comanda do POS,
    -- devolve-se a comanda e a linha originais.
    pos_order_id UUID REFERENCES public.pos_orders (id) ON DELETE SET NULL,
    pos_order_item_id UUID REFERENCES public.pos_order_items (id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.pos_products (id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT guest_order_items_line_ck
        CHECK (abs(line_total - ((quantity * unit_price) - discount)) <= 0.01)
);

CREATE INDEX IF NOT EXISTS guest_order_items_account_idx
    ON public.guest_order_items (account_id, consumed_at);

CREATE INDEX IF NOT EXISTS guest_order_items_tenant_idx
    ON public.guest_order_items (tenant_id, consumed_at DESC);

-- O total da conta e sempre a soma das linhas: nenhuma rota de codigo
-- escreve o total diretamente, por isso o extrato nunca mente.
CREATE OR REPLACE FUNCTION public.recalc_guest_account_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_account UUID := COALESCE(NEW.account_id, OLD.account_id);
    v_tenant  UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
    UPDATE public.guest_accounts AS a
    SET subtotal = agg.sub,
        updated_at = now()
    FROM (
        SELECT COALESCE(sum(g.line_total), 0) AS sub
        FROM public.guest_order_items AS g
        WHERE g.account_id = v_account
    ) AS agg
    WHERE a.id = v_account
      AND a.tenant_id = v_tenant;

    RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS guest_order_items_recalc
    ON public.guest_order_items;
CREATE TRIGGER guest_order_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON public.guest_order_items
    FOR EACH ROW EXECUTE FUNCTION public.recalc_guest_account_total();


-- ------------------------------------------------------------
-- 7. Pre-conta auditada
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.pre_bill_seq START 1;

CREATE TABLE IF NOT EXISTS public.pre_bill_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'PRE_CONTA'
        CHECK (doc_type IN ('PRE_CONTA', 'EXTRATO')),
    context TEXT NOT NULL DEFAULT 'MESA'
        CHECK (context IN ('MESA', 'QUARTO', 'CONTA')),
    pos_order_id UUID REFERENCES public.pos_orders (id) ON DELETE SET NULL,
    guest_account_id UUID REFERENCES public.guest_accounts (id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.hotel_reservations (id) ON DELETE SET NULL,
    label TEXT,
    guest_name TEXT,
    room_number TEXT,
    line_count INT NOT NULL DEFAULT 0 CHECK (line_count >= 0),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    currency TEXT NOT NULL DEFAULT 'AOA',
    -- Largura do papel: 58mm (terminal de mesa) ou 80mm (balcao).
    printer TEXT NOT NULL DEFAULT 'ESCPOS_80'
        CHECK (printer IN ('ESCPOS_58', 'ESCPOS_80', 'PDF')),
    -- Fotografia completa do documento: sobrevive a alteracoes posteriores
    -- da comanda e e o que a app do cliente mostra como comprovativo.
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    issued_by UUID,
    issued_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pre_bill_logs_number_uq UNIQUE (tenant_id, doc_number),
    CONSTRAINT pre_bill_logs_source_ck
        CHECK (pos_order_id IS NOT NULL OR guest_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS pre_bill_logs_tenant_idx
    ON public.pre_bill_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pre_bill_logs_order_idx
    ON public.pre_bill_logs (pos_order_id)
    WHERE pos_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pre_bill_logs_account_idx
    ON public.pre_bill_logs (guest_account_id)
    WHERE guest_account_id IS NOT NULL;


-- ------------------------------------------------------------
-- 8. Bloqueio auditado dos itens da comanda
-- ------------------------------------------------------------
-- Emitida a pre-conta, os valores deixam de ser editaveis. So sai um
-- item bloqueado com justificativa escrita, e a remocao fica registada
-- na auditoria da instancia.
ALTER TABLE public.pos_order_items
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by UUID,
    ADD COLUMN IF NOT EXISTS pre_bill_id UUID
        REFERENCES public.pre_bill_logs (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS removal_justification TEXT,
    ADD COLUMN IF NOT EXISTS removed_by UUID,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pos_order_items_locked_idx
    ON public.pos_order_items (order_id, locked_at)
    WHERE locked_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_locked_order_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.locked_at IS NOT NULL
           AND (OLD.removal_justification IS NULL
                OR length(trim(OLD.removal_justification)) < 8) THEN
            RAISE EXCEPTION
                'Item de pre-conta bloqueado (%): a remocao exige justificativa auditada de 8 caracteres ou mais.',
                OLD.id
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.locked_at IS NOT NULL
       AND (NEW.quantity     IS DISTINCT FROM OLD.quantity
         OR NEW.unit_price   IS DISTINCT FROM OLD.unit_price
         OR NEW.line_total   IS DISTINCT FROM OLD.line_total
         OR NEW.product_name IS DISTINCT FROM OLD.product_name) THEN
        RAISE EXCEPTION
            'Item de pre-conta bloqueado (%): o valor ja emitido e imutavel.',
            OLD.id
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pos_order_items_protected ON public.pos_order_items;
CREATE TRIGGER pos_order_items_protected
    BEFORE UPDATE OR DELETE ON public.pos_order_items
    FOR EACH ROW EXECUTE FUNCTION public.protect_locked_order_items();

-- A remocao de um item ja impresso deixa rasto permanente: quem, quando,
-- o que saiu e porquê. Escrito por trigger, fora do alcance da app.
CREATE OR REPLACE FUNCTION public.audit_locked_order_item_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := (SELECT auth.uid());
    v_role  TEXT;
BEGIN
    IF TG_OP <> 'DELETE' OR OLD.locked_at IS NULL THEN
        RETURN OLD;
    END IF;

    SELECT u.role INTO v_role
    FROM public.app_users AS u
    WHERE u.auth_user_id = v_actor
    LIMIT 1;

    INSERT INTO public.tenant_audit_log (
        tenant_id, actor_id, actor_role, action, entity_table,
        entity_id, before_data
    ) VALUES (
        OLD.tenant_id, v_actor, v_role, 'ITEM_PRE_CONTA_REMOVIDO',
        'pos_order_items', OLD.id::text,
        jsonb_build_object(
            'product_name', OLD.product_name,
            'quantity', OLD.quantity,
            'unit_price', OLD.unit_price,
            'line_total', OLD.line_total,
            'pre_bill_id', OLD.pre_bill_id,
            'justification', OLD.removal_justification
        )
    );

    RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS pos_order_items_removal_audit
    ON public.pos_order_items;
CREATE TRIGGER pos_order_items_removal_audit
    AFTER DELETE ON public.pos_order_items
    FOR EACH ROW EXECUTE FUNCTION public.audit_locked_order_item_removal();


-- ------------------------------------------------------------
-- 9. Funcoes de negocio
-- ------------------------------------------------------------

-- 9.1 Resolucao de tarifa: quarto -> tipo -> propriedade.
-- Devolve JSONB (e nao um registo) para que "sem tarifa" seja
-- explicitamente NULL e nunca um conjunto vazio ambiguo.
CREATE OR REPLACE FUNCTION public.hr_pick_room_rate(
    p_room_id UUID,
    p_billing_mode TEXT DEFAULT 'PER_DAY',
    p_block_hours INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT jsonb_build_object(
                'rate_id', r.id,
                'price', r.price,
                'extra', r.extra_hour_price,
                'label', r.label,
                'scope', 'ROOM'
            )
            FROM public.room_rates AS r
            WHERE r.tenant_id = (SELECT h.tenant_id FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.room_id = p_room_id
              AND r.billing_mode = p_billing_mode
              AND r.block_hours = p_block_hours
              AND r.is_active
              AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
            ORDER BY r.is_default DESC, r.updated_at DESC
            LIMIT 1
        ),
        (
            SELECT jsonb_build_object(
                'rate_id', r.id,
                'price', r.price,
                'extra', r.extra_hour_price,
                'label', r.label,
                'scope', 'TYPE'
            )
            FROM public.room_rates AS r
            WHERE r.tenant_id = (SELECT h.tenant_id FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.room_id IS NULL
              AND r.room_type = (SELECT h.room_type FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.billing_mode = p_billing_mode
              AND r.block_hours = p_block_hours
              AND r.is_active
              AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
            ORDER BY r.is_default DESC, r.updated_at DESC
            LIMIT 1
        ),
        (
            SELECT jsonb_build_object(
                'rate_id', r.id,
                'price', r.price,
                'extra', r.extra_hour_price,
                'label', r.label,
                'scope', 'PROPERTY'
            )
            FROM public.room_rates AS r
            WHERE r.tenant_id = (SELECT h.tenant_id FROM public.hotel_rooms AS h WHERE h.id = p_room_id)
              AND r.room_id IS NULL
              AND r.room_type IS NULL
              AND r.billing_mode = p_billing_mode
              AND r.block_hours = p_block_hours
              AND r.is_active
              AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
            ORDER BY r.is_default DESC, r.updated_at DESC
            LIMIT 1
        ),
        NULL::jsonb
    )
$$;

-- 9.2 Preco resolvido, com o preco diario do quarto como ultima rede.
CREATE OR REPLACE FUNCTION public.hr_room_rate(
    p_room_id UUID,
    p_billing_mode TEXT DEFAULT 'PER_DAY',
    p_block_hours INT DEFAULT 0
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (public.hr_pick_room_rate(p_room_id, p_billing_mode, p_block_hours)->>'price')::numeric,
        (SELECT h.price_per_night FROM public.hotel_rooms AS h WHERE h.id = p_room_id),
        0
    )
$$;

-- 9.3 Stock por produto. E a regra de stock zero do POS: um artigo so
-- aparece na tela de vendas se nao consumir economato ou se tiver saldo.
-- Chamada pelo app; se a migracao 011 ainda nao estiver aplicada, o app
-- falha em silencio e mantem a carta completa visivel.
CREATE OR REPLACE FUNCTION public.hr_pos_stock(
    p_product_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    product_id UUID,
    quantity_in_stock NUMERIC,
    is_available BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
    SELECT p.id,
           COALESCE(i.current_stock, 0),
           (
               p.affects_inventory = FALSE
               OR p.inventory_item_id IS NULL
               OR COALESCE(i.current_stock, 0) > 0
           )
    FROM public.pos_products AS p
    LEFT JOIN public.inventory_items AS i ON i.id = p.inventory_item_id
    WHERE p.tenant_id = (SELECT public.hr_tenant_id())
      AND p.is_active
      AND (p_product_ids IS NULL OR cardinality(p_product_ids) = 0
           OR p.id = ANY (p_product_ids))
$$;

-- 9.4 O usuario autenticado pertence ao quadro de propriedade (tem
-- perfil em app_users). Distingue a staff do hospede na RLS: a staff
-- ve as contas da instancia, o hospede so a propria.
CREATE OR REPLACE FUNCTION public.hr_is_property_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.app_users AS u
        WHERE u.auth_user_id = (SELECT auth.uid())
          AND u.tenant_id = (SELECT public.hr_tenant_id())
    )
$$;

-- 9.5 Emissao de pre-conta: congela a comanda, numeroa o documento e
-- guarda a fotografia completa. SECURITY DEFINER porque atravessa
-- comanda, itens e log numa unica operacao - mas valida a permissao
-- da sessao antes de escrever qualquer coisa.
CREATE OR REPLACE FUNCTION public.hr_issue_pre_bill(
    p_order_id UUID DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_context TEXT DEFAULT 'MESA',
    p_label TEXT DEFAULT NULL,
    p_guest_name TEXT DEFAULT NULL,
    p_printer TEXT DEFAULT 'ESCPOS_80'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant   UUID := (SELECT public.hr_tenant_id());
    v_actor    UUID := (SELECT auth.uid());
    v_actor_name TEXT;
    v_doc      TEXT;
    v_lines    JSONB := '[]'::jsonb;
    v_subtotal NUMERIC(14, 2) := 0;
    v_discount NUMERIC(14, 2) := 0;
    v_count    INT := 0;
    v_guest    TEXT;
    v_room     TEXT;
    v_res      UUID;
    v_id       UUID;
    v_locked   INT := 0;
    v_issued_at TIMESTAMPTZ := now();
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('pos')) THEN
        RAISE EXCEPTION 'Sem permissao para emitir documentos de venda.'
            USING ERRCODE = '42501';
    END IF;

    IF p_order_id IS NULL AND p_account_id IS NULL THEN
        RAISE EXCEPTION 'Indique a comanda ou a conta do hospede a emitir.'
            USING ERRCODE = '22023';
    END IF;

    IF p_context NOT IN ('MESA', 'QUARTO', 'CONTA') THEN
        RAISE EXCEPTION 'Contexto de documento invalido: %', p_context
            USING ERRCODE = '22023';
    END IF;

    IF p_printer NOT IN ('ESCPOS_58', 'ESCPOS_80', 'PDF') THEN
        RAISE EXCEPTION 'Impressora invalida: %', p_printer
            USING ERRCODE = '22023';
    END IF;

    SELECT n.name INTO v_actor_name
    FROM public.app_users AS n
    WHERE n.auth_user_id = v_actor
    LIMIT 1;

    IF p_order_id IS NOT NULL THEN
        SELECT COALESCE(p_guest_name, o.customer_name) AS guest,
               o.reservation_id
        INTO v_guest, v_res
        FROM public.pos_orders AS o
        WHERE o.id = p_order_id
          AND o.tenant_id = v_tenant;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Comanda nao encontrada nesta instancia.'
                USING ERRCODE = 'P0002';
        END IF;

        SELECT COALESCE(jsonb_agg(
                   jsonb_build_object(
                       'id', i.id,
                       'description', i.product_name,
                       'quantity', i.quantity,
                       'unit_price', i.unit_price,
                       'line_total', i.line_total
                   ) ORDER BY i.created_at, i.id
               ), '[]'::jsonb),
               COALESCE(sum(i.line_total), 0),
               count(*)::int
        INTO v_lines, v_subtotal, v_count
        FROM public.pos_order_items AS i
        WHERE i.order_id = p_order_id;

        IF v_count = 0 THEN
            RAISE EXCEPTION 'A comanda nao tem itens para emitir pre-conta.'
                USING ERRCODE = '22023';
        END IF;
    ELSE
        SELECT COALESCE(p_guest_name, a.guest_name) AS guest,
               a.room_number,
               a.reservation_id
        INTO v_guest, v_room, v_res
        FROM public.guest_accounts AS a
        WHERE a.id = p_account_id
          AND a.tenant_id = v_tenant;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Conta do hospede nao encontrada nesta instancia.'
                USING ERRCODE = 'P0002';
        END IF;

        SELECT COALESCE(jsonb_agg(
                   jsonb_build_object(
                       'id', g.id,
                       'description', g.description,
                       'quantity', g.quantity,
                       'unit_price', g.unit_price,
                       'line_total', g.line_total
                   ) ORDER BY g.consumed_at, g.id
               ), '[]'::jsonb),
               COALESCE(sum(g.line_total), 0),
               count(*)::int
        INTO v_lines, v_subtotal, v_count
        FROM public.guest_order_items AS g
        WHERE g.account_id = p_account_id;

        IF v_count = 0 THEN
            RAISE EXCEPTION 'A conta do hospede nao tem itens para emitir extrato.'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.guest_accounts
        SET pre_billed_at = COALESCE(pre_billed_at, v_issued_at)
        WHERE id = p_account_id;
    END IF;

    v_doc := 'PC-' || to_char(v_issued_at, 'YYYYMMDD') || '-'
             || lpad(nextval('public.pre_bill_seq')::text, 6, '0');

    INSERT INTO public.pre_bill_logs (
        tenant_id, doc_number, doc_type, context,
        pos_order_id, guest_account_id, reservation_id,
        label, guest_name, room_number,
        line_count, subtotal, discount, total,
        printer, payload, issued_by, issued_by_name
    ) VALUES (
        v_tenant, v_doc,
        CASE WHEN p_account_id IS NOT NULL THEN 'EXTRATO' ELSE 'PRE_CONTA' END,
        p_context,
        p_order_id, p_account_id, v_res,
        p_label, v_guest, v_room,
        v_count, v_subtotal, v_discount, v_subtotal - v_discount,
        p_printer,
        jsonb_build_object(
            'doc_number', v_doc,
            'context', p_context,
            'label', p_label,
            'guest_name', v_guest,
            'room_number', v_room,
            'currency', 'AOA',
            'line_count', v_count,
            'subtotal', v_subtotal,
            'discount', v_discount,
            'total', v_subtotal - v_discount,
            'issued_by_name', v_actor_name,
            'issued_at', v_issued_at,
            'lines', v_lines
        ),
        v_actor, v_actor_name
    )
    RETURNING id INTO v_id;

    IF p_order_id IS NOT NULL THEN
        UPDATE public.pos_order_items
        SET locked_at = v_issued_at,
            locked_by = v_actor,
            pre_bill_id = v_id
        WHERE order_id = p_order_id
          AND locked_at IS NULL;
        GET DIAGNOSTICS v_locked = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'pre_bill_id', v_id,
        'doc_number', v_doc,
        'doc_type', CASE WHEN p_account_id IS NOT NULL
                         THEN 'EXTRATO' ELSE 'PRE_CONTA' END,
        'context', p_context,
        'label', p_label,
        'guest_name', v_guest,
        'room_number', v_room,
        'currency', 'AOA',
        'line_count', v_count,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'total', v_subtotal - v_discount,
        'printer', p_printer,
        'locked_items', v_locked,
        'issued_by', v_actor,
        'issued_by_name', v_actor_name,
        'issued_at', v_issued_at,
        'lines', v_lines
    );
END
$$;

-- 9.6 Sessao horaria: abre, estende e fecha. A abertura calcula o preco
-- pela tarifa do bloco e marca o quarto como ocupado.
CREATE OR REPLACE FUNCTION public.hr_start_hourly_billing(
    p_room_id UUID,
    p_block_hours INT DEFAULT 1,
    p_reservation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant  UUID := (SELECT public.hr_tenant_id());
    v_actor   UUID := (SELECT auth.uid());
    v_room    RECORD;
    v_pick    JSONB;
    v_rate    NUMERIC(12, 2) := 0;
    v_extra   NUMERIC(12, 2) := 0;
    v_rate_id UUID;
    v_open    INT := 0;
    v_id      UUID;
    v_ends    TIMESTAMPTZ;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao para abrir sessoes horarias.'
            USING ERRCODE = '42501';
    END IF;

    IF p_block_hours IS NULL OR p_block_hours NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'Bloco horario invalido: %. Use 1, 2 ou 3 horas.',
            COALESCE(p_block_hours::text, 'nulo')
            USING ERRCODE = '22023';
    END IF;

    SELECT h.id, h.room_number, h.tenant_id, h.status, h.room_type,
           h.price_per_night
    INTO v_room
    FROM public.hotel_rooms AS h
    WHERE h.id = p_room_id
      AND h.tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quarto nao encontrado nesta instancia.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*)::int INTO v_open
    FROM public.hourly_billing AS b
    WHERE b.tenant_id = v_tenant
      AND b.room_id = p_room_id
      AND b.status = 'EM_CURSO';

    IF v_open > 0 THEN
        RAISE EXCEPTION 'Ja existe uma sessao horaria activa no quarto %.',
            v_room.room_number
            USING ERRCODE = '23505';
    END IF;

    v_pick := public.hr_pick_room_rate(p_room_id, 'PER_HOUR', p_block_hours);

    IF v_pick IS NULL THEN
        -- Sem tarifa horaria definida, o preco diario e a referencia:
        -- destravado, e o que a administracao corrige no formulario.
        v_rate := COALESCE(v_room.price_per_night, 0);
        v_extra := CASE WHEN v_rate > 0
                        THEN round(v_rate / 24, 2) ELSE 0 END;
    ELSE
        v_rate := COALESCE((v_pick->>'price')::numeric, 0);
        v_rate_id := (v_pick->>'rate_id')::uuid;
        v_extra := COALESCE(
            (v_pick->>'extra')::numeric,
            CASE WHEN v_rate > 0
                 THEN round(v_rate / p_block_hours, 2) ELSE 0 END
        );
    END IF;

    v_ends := now() + make_interval(hours => p_block_hours);

    INSERT INTO public.hourly_billing (
        tenant_id, room_id, room_rate_id, reservation_id,
        block_hours, rate, extra_hour_rate, started_at, ends_at
    ) VALUES (
        v_tenant, p_room_id, v_rate_id, p_reservation_id,
        p_block_hours, v_rate, v_extra, now(), v_ends
    )
    RETURNING id INTO v_id;

    UPDATE public.hotel_rooms AS h
    SET status = 'OCUPADO',
        updated_at = now()
    WHERE h.id = p_room_id
      AND h.tenant_id = v_tenant
      AND h.status <> 'OCUPADO';

    RETURN jsonb_build_object(
        'hourly_billing_id', v_id,
        'room_id', p_room_id,
        'room_number', v_room.room_number,
        'block_hours', p_block_hours,
        'rate', v_rate,
        'extra_hour_rate', v_extra,
        'rate_id', v_rate_id,
        'started_at', now(),
        'ends_at', v_ends,
        'seconds_left', extract(epoch FROM (v_ends - now()))::bigint,
        'actor_id', v_actor
    );
END
$$;

CREATE OR REPLACE FUNCTION public.hr_extend_hourly_billing(
    p_billing_id UUID,
    p_extra_hours INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant UUID := (SELECT public.hr_tenant_id());
    v_row    RECORD;
    v_new_end TIMESTAMPTZ;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao para estender sessoes horarias.'
            USING ERRCODE = '42501';
    END IF;

    IF p_extra_hours IS NULL OR p_extra_hours NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'Estendimento invalido: %. Use 1, 2 ou 3 horas.',
            COALESCE(p_extra_hours::text, 'nulo')
            USING ERRCODE = '22023';
    END IF;

    SELECT b.id, b.room_id, b.ends_at, b.extensions, b.status,
           b.extra_hour_rate, b.rate, h.room_number
    INTO v_row
    FROM public.hourly_billing AS b
    JOIN public.hotel_rooms AS h ON h.id = b.room_id
    WHERE b.id = p_billing_id
      AND b.tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessao horaria nao encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF v_row.status <> 'EM_CURSO' THEN
        RAISE EXCEPTION 'Sessao ja encerrada: nao e possivel estender.'
            USING ERRCODE = '23514';
    END IF;

    v_new_end := v_row.ends_at + make_interval(hours => p_extra_hours);

    UPDATE public.hourly_billing AS b
    SET ends_at = v_new_end,
        extensions = b.extensions + 1
    WHERE b.id = p_billing_id;

    RETURN jsonb_build_object(
        'hourly_billing_id', p_billing_id,
        'room_number', v_row.room_number,
        'extra_hours', p_extra_hours,
        'extensions', v_row.extensions + 1,
        'ends_at', v_new_end,
        'seconds_left', extract(epoch FROM (v_new_end - now()))::bigint,
        'extra_hour_rate', COALESCE(v_row.extra_hour_rate, 0),
        'extra_amount', round(
            COALESCE(v_row.extra_hour_rate, 0) * p_extra_hours, 2
        )
    );
END
$$;

CREATE OR REPLACE FUNCTION public.hr_close_hourly_billing(
    p_billing_id UUID,
    p_amount_paid NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant UUID := (SELECT public.hr_tenant_id());
    v_row    RECORD;
    v_paid   NUMERIC(12, 2);
    v_used   INT;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Sessao sem instancia activa.' USING ERRCODE = '42501';
    END IF;

    IF NOT (SELECT public.hr_can_write_module('alojamento')) THEN
        RAISE EXCEPTION 'Sem permissao para encerrar sessoes horarias.'
            USING ERRCODE = '42501';
    END IF;

    SELECT b.id, b.room_id, b.status, b.started_at, b.rate,
           b.extra_hour_rate, b.block_hours, b.extensions, h.room_number
    INTO v_row
    FROM public.hourly_billing AS b
    JOIN public.hotel_rooms AS h ON h.id = b.room_id
    WHERE b.id = p_billing_id
      AND b.tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessao horaria nao encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF v_row.status <> 'EM_CURSO' THEN
        RAISE EXCEPTION 'Sessao ja encerrada.' USING ERRCODE = '23514';
    END IF;

    v_used := ceil(extract(epoch FROM (now() - v_row.started_at)) / 3600)::int;

    -- Facturado: o bloco contratado + hora extra ao tempo, nunca menos
    -- do que o bloco minimo.
    v_paid := COALESCE(
        p_amount_paid,
        round(
            v_row.rate
            + (GREATEST(v_used - v_row.block_hours, 0)
               * COALESCE(v_row.extra_hour_rate, 0)),
            2
        )
    );

    UPDATE public.hourly_billing AS b
    SET status = 'PAGO',
        amount_paid = v_paid,
        closed_at = now(),
        closed_by = (SELECT auth.uid()),
        notes = COALESCE(p_notes, b.notes)
    WHERE b.id = p_billing_id;

    UPDATE public.hotel_rooms AS h
    SET status = 'LIMPEZA',
        updated_at = now()
    WHERE h.id = v_row.room_id
      AND h.tenant_id = v_tenant;

    RETURN jsonb_build_object(
        'hourly_billing_id', p_billing_id,
        'room_number', v_row.room_number,
        'hours_used', v_used,
        'block_hours', v_row.block_hours,
        'extensions', v_row.extensions,
        'amount_paid', v_paid,
        'closed_at', now()
    );
END
$$;


-- ------------------------------------------------------------
-- 10. RLS e privilegios
-- ------------------------------------------------------------
ALTER TABLE public.master_products_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_rates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_billing           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_bill_logs            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.master_products_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.room_rates               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hourly_billing           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_accounts           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_order_items        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pre_bill_logs            FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.master_products_catalog TO service_role;
GRANT ALL ON TABLE public.room_rates               TO service_role;
GRANT ALL ON TABLE public.hourly_billing           TO service_role;
GRANT ALL ON TABLE public.guest_accounts           TO service_role;
GRANT ALL ON TABLE public.guest_order_items        TO service_role;
GRANT ALL ON TABLE public.pre_bill_logs            TO service_role;

-- Catalogo mestre: leitura livre (cada propriedade copia para si),
-- escrita exclusiva do Master Global - igual a system_licenses na 010.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_products_catalog TO authenticated;

DROP POLICY IF EXISTS master_products_catalog_select
    ON public.master_products_catalog;
CREATE POLICY master_products_catalog_select
    ON public.master_products_catalog
    FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS master_products_catalog_master
    ON public.master_products_catalog;
CREATE POLICY master_products_catalog_master
    ON public.master_products_catalog
    FOR ALL
    TO authenticated
    USING ((SELECT public.hr_is_master_global()))
    WITH CHECK ((SELECT public.hr_is_master_global()));

-- Tarifas: a staff da instancia le e escreve; o hospede nunca.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.room_rates TO authenticated;

DROP POLICY IF EXISTS room_rates_select ON public.room_rates;
CREATE POLICY room_rates_select
    ON public.room_rates
    FOR SELECT
    TO authenticated
    USING (tenant_id = (SELECT public.hr_tenant_id()));

DROP POLICY IF EXISTS room_rates_write ON public.room_rates;
CREATE POLICY room_rates_write
    ON public.room_rates
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

DROP POLICY IF EXISTS room_rates_update ON public.room_rates;
CREATE POLICY room_rates_update
    ON public.room_rates
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

DROP POLICY IF EXISTS room_rates_delete ON public.room_rates;
CREATE POLICY room_rates_delete
    ON public.room_rates
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_admin())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

-- Sessoes horarias: mesma regra das tarifas.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hourly_billing TO authenticated;

DROP POLICY IF EXISTS hourly_billing_select ON public.hourly_billing;
CREATE POLICY hourly_billing_select
    ON public.hourly_billing
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
    );

DROP POLICY IF EXISTS hourly_billing_write ON public.hourly_billing;
CREATE POLICY hourly_billing_write
    ON public.hourly_billing
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

DROP POLICY IF EXISTS hourly_billing_update ON public.hourly_billing;
CREATE POLICY hourly_billing_update
    ON public.hourly_billing
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

-- Contas do hospede: a staff le tudo da instancia; o hospede, so a
-- propria conta e as linhas dela. Escrita apenas da staff.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guest_accounts TO authenticated;

DROP POLICY IF EXISTS guest_accounts_select ON public.guest_accounts;
CREATE POLICY guest_accounts_select
    ON public.guest_accounts
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            (SELECT public.hr_is_property_staff())
            OR auth_user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS guest_accounts_insert ON public.guest_accounts;
CREATE POLICY guest_accounts_insert
    ON public.guest_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

DROP POLICY IF EXISTS guest_accounts_update ON public.guest_accounts;
CREATE POLICY guest_accounts_update
    ON public.guest_accounts
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

DROP POLICY IF EXISTS guest_accounts_delete ON public.guest_accounts;
CREATE POLICY guest_accounts_delete
    ON public.guest_accounts
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_admin())
        AND (SELECT public.hr_can_write_module('alojamento'))
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guest_order_items TO authenticated;

DROP POLICY IF EXISTS guest_order_items_select ON public.guest_order_items;
CREATE POLICY guest_order_items_select
    ON public.guest_order_items
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (
            (SELECT public.hr_is_property_staff())
            OR account_id IN (
                SELECT a.id FROM public.guest_accounts AS a
                WHERE a.auth_user_id = (SELECT auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS guest_order_items_insert ON public.guest_order_items;
CREATE POLICY guest_order_items_insert
    ON public.guest_order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

DROP POLICY IF EXISTS guest_order_items_update ON public.guest_order_items;
CREATE POLICY guest_order_items_update
    ON public.guest_order_items
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
        AND (
            (SELECT public.hr_can_write_module('alojamento'))
            OR (SELECT public.hr_can_write_module('pos'))
        )
    );

-- Um item do extrato nunca desaparece a meio da estadia: apaga-se a
-- conta inteira (cascata), nunca uma linha solta.
DROP POLICY IF EXISTS guest_order_items_delete ON public.guest_order_items;
CREATE POLICY guest_order_items_delete
    ON public.guest_order_items
    FOR DELETE
    TO authenticated
    USING (FALSE);

-- Pre-contas: a staff le; o operador do POS escreve. Nao ha politica de
-- apagamento - o log de documentos e permanente.
GRANT SELECT, INSERT, UPDATE ON TABLE public.pre_bill_logs TO authenticated;

DROP POLICY IF EXISTS pre_bill_logs_select ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_select
    ON public.pre_bill_logs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_is_property_staff())
    );

DROP POLICY IF EXISTS pre_bill_logs_insert ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_insert
    ON public.pre_bill_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

DROP POLICY IF EXISTS pre_bill_logs_update ON public.pre_bill_logs;
CREATE POLICY pre_bill_logs_update
    ON public.pre_bill_logs
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    )
    WITH CHECK (
        tenant_id = (SELECT public.hr_tenant_id())
        AND (SELECT public.hr_can_write_module('pos'))
    );

REVOKE ALL ON FUNCTION public.hr_pick_room_rate(UUID, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_room_rate(UUID, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_pos_stock(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_is_property_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_issue_pre_bill(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_start_hourly_billing(UUID, INT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_extend_hourly_billing(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_close_hourly_billing(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hr_pick_room_rate(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_room_rate(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_pos_stock(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_property_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_issue_pre_bill(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_start_hourly_billing(UUID, INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_extend_hourly_billing(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_close_hourly_billing(UUID, NUMERIC, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.hr_issue_pre_bill(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_start_hourly_billing(UUID, INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_extend_hourly_billing(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_close_hourly_billing(UUID, NUMERIC, TEXT) TO service_role;


-- ------------------------------------------------------------
-- 11. Realtime
-- ------------------------------------------------------------
-- O quadro de quartos e a app do cliente assinam estas tabelas para
-- reflectir um lancamento sem recarregar o ecra.
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_accounts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_order_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hourly_billing;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_rates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pre_bill_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------
-- 12. Seed do catalogo mestre
-- ------------------------------------------------------------
-- Carta base de uma propriedade angolana: cervejas e refrigerantes
-- locais, pratos da cozinha angolana, snacks de bar e servicos do
-- hotel. A propriedade copia o que quiser para o seu POS e muda o
-- preco; o catalogo fica intacto.
INSERT INTO public.master_products_catalog (
    sku, name, kind, category, unit, suggested_price, origin, description
) VALUES
-- Cervejas
('BERV-CUCA-330',    'Cuca 330ml',              'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Cerveja angolana, garrafa de 330ml'),
('BERV-CUCA-600',    'Cuca 600ml',              'BEBIDA', 'BEBIDA', 'garrafa', 1100,  'LOCAL',  'Cerveja angolana, garrafa de 600ml'),
('BERV-CUCA-1L',     'Cuca 1L',                 'BEBIDA', 'BEBIDA', 'garrafa', 1600,  'LOCAL',  'Cerveja angolana, garrafa de 1 litro'),
('BERV-NGOLA-330',   'N''gola 330ml',           'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Cerveja angolana N''gola, 330ml'),
('BERV-NGOLA-600',   'N''gola 600ml',           'BEBIDA', 'BEBIDA', 'garrafa', 1100,  'LOCAL',  'Cerveja angolana N''gola, 600ml'),
('BERV-EKA-330',     'Eka 330ml',               'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Cerveja angolana Eka, 330ml'),
('BERV-EKA-600',     'Eka 600ml',               'BEBIDA', 'BEBIDA', 'garrafa', 1050,  'LOCAL',  'Cerveja angolana Eka, 600ml'),
('BERV-BOHEMIA-330', 'Bohemia 330ml',           'BEBIDA', 'BEBIDA', 'garrafa',  800,  'LOCAL',  'Cerveja Bohemia, 330ml'),
('BERV-BOHEMIA-600', 'Bohemia 600ml',           'BEBIDA', 'BEBIDA', 'garrafa', 1200,  'LOCAL',  'Cerveja Bohemia, 600ml'),
('BERV-HEINEKEN-330','Heineken 330ml',          'BEBIDA', 'BEBIDA', 'garrafa', 1200,  'GLOBAL', 'Cerveja internacional, 330ml'),
('BERV-HEINEKEN-650','Heineken 650ml',          'BEBIDA', 'BEBIDA', 'garrafa', 1800,  'GLOBAL', 'Cerveja internacional, 650ml'),
('BERV-STELLA-330',  'Stella Artois 330ml',     'BEBIDA', 'BEBIDA', 'garrafa', 1300,  'GLOBAL', 'Cerveja internacional, 330ml'),
('BERV-STELLA-660',  'Stella Artois 660ml',     'BEBIDA', 'BEBIDA', 'garrafa', 1900,  'GLOBAL', 'Cerveja internacional, 660ml'),

-- Refrigerantes, sumos e agua
('REFR-COMPAL-250',  'Compal 250ml',            'BEBIDA', 'BEBIDA', 'lata',     600,  'GLOBAL', 'Sumo de fruta, lata de 250ml'),
('REFR-COMPAL-1L',   'Compal 1L',               'BEBIDA', 'BEBIDA', 'garrafa', 1300,  'GLOBAL', 'Sumo de fruta, garrafa de 1 litro'),
('REFR-SANTAL-250',  'Santal 250ml',            'BEBIDA', 'BEBIDA', 'lata',     600,  'GLOBAL', 'Refrigerante de citrinos, lata de 250ml'),
('REFR-SANTAL-1L',   'Santal 1L',               'BEBIDA', 'BEBIDA', 'garrafa', 1300,  'GLOBAL', 'Refrigerante de citrinos, 1 litro'),
('REFR-COCA-330',    'Coca-Cola 330ml',         'BEBIDA', 'BEBIDA', 'lata',     700,  'GLOBAL', 'Refrigerante de cola, lata de 330ml'),
('REFR-COCA-1L',     'Coca-Cola 1L',            'BEBIDA', 'BEBIDA', 'garrafa', 1400,  'GLOBAL', 'Refrigerante de cola, 1 litro'),
('REFR-FANTA-330',   'Fanta Laranja 330ml',     'BEBIDA', 'BEBIDA', 'lata',     700,  'GLOBAL', 'Refrigerante de laranja, lata de 330ml'),
('REFR-SPRITE-330',  'Sprite 330ml',            'BEBIDA', 'BEBIDA', 'lata',     700,  'GLOBAL', 'Refrigerante de citrinos, lata de 330ml'),
('REFR-VITALO-330',  'Vitalo 330ml',            'BEBIDA', 'BEBIDA', 'lata',     650,  'LOCAL',  'Refrigerante angolano, lata de 330ml'),
('REFR-VITALO-1L',   'Vitalo 1L',               'BEBIDA', 'BEBIDA', 'garrafa', 1250,  'LOCAL',  'Refrigerante angolano, 1 litro'),
('REFR-AGUA-500',    'Agua Mineral 500ml',      'BEBIDA', 'BEBIDA', 'garrafa',  450,  'LOCAL',  'Agua mineral natural, 500ml'),
('REFR-AGUA-1500',   'Agua Mineral 1,5L',       'BEBIDA', 'BEBIDA', 'garrafa',  700,  'LOCAL',  'Agua mineral natural, 1,5 litro'),
('REFR-TONICA-330',  'Agua Tonica 330ml',       'BEBIDA', 'BEBIDA', 'lata',     750,  'GLOBAL', 'Agua tonica, lata de 330ml'),

-- Cafe e cafeteria
('CAFE-ESPRESSO',    'Cafe Expresso',           'BEBIDA', 'CAFETERIA', 'xicara', 400, 'LOCAL',  'Cafe expresso servido na hora'),
('CAFE-GALAO',       'Cafe Galao',              'BEBIDA', 'CAFETERIA', 'xicara', 600, 'LOCAL',  'Cafe com leite, xicara grande'),
('CAFE-PINGADO',     'Cafe Pingado',            'BEBIDA', 'CAFETERIA', 'xicara', 500, 'LOCAL',  'Cafe com um fio de leite'),
('CAFE-CAFETEIRA',   'Cafe de Cafeteira',       'BEBIDA', 'CAFETERIA', 'jarra', 2200, 'LOCAL',  'Cafe de cafeteira, 6 xicaras'),
('CAFE-CHOCALATE',   'Chocolate Quente',        'BEBIDA', 'CAFETERIA', 'xicara', 800, 'GLOBAL', 'Chocolate quente com leite'),

-- Vinhos
('VINH-TINTO-750',   'Vinho Tinto 750ml',       'BEBIDA', 'BEBIDA', 'garrafa', 6500,  'GLOBAL', 'Vinho tinto da casa, 750ml'),
('VINH-BRANCO-750',  'Vinho Branco 750ml',      'BEBIDA', 'BEBIDA', 'garrafa', 6500,  'GLOBAL', 'Vinho branco da casa, 750ml'),
('VINH-ROSE-750',    'Vinho Rose 750ml',        'BEBIDA', 'BEBIDA', 'garrafa', 7000,  'GLOBAL', 'Vinho rose da casa, 750ml'),
('VINH-ESPUMANTE-750','Espumante 750ml',        'BEBIDA', 'BEBIDA', 'garrafa',12000,  'GLOBAL', 'Espumante bruto, 750ml'),
('VINH-COPA-TINTO',  'Copa de Vinho Tinto',     'BEBIDA', 'BEBIDA', 'copo',    2500,  'GLOBAL', 'Copo de vinho tinto, 150ml'),

-- Destilados
('DEST-WHISKY-700',  'Whisky Blended 700ml',    'BEBIDA', 'BEBIDA', 'garrafa',14000,  'GLOBAL', 'Whisky misturado, 700ml'),
('DEST-WHISKY-1000', 'Whisky Premium 1L',       'BEBIDA', 'BEBIDA', 'garrafa',22000,  'GLOBAL', 'Whisky premium, 1 litro'),
('DEST-VODKA-700',   'Vodka 700ml',             'BEBIDA', 'BEBIDA', 'garrafa',11000,  'GLOBAL', 'Vodka neutra, 700ml'),
('DEST-RUM-700',     'Rum 700ml',               'BEBIDA', 'BEBIDA', 'garrafa',11000,  'GLOBAL', 'Rum escuro, 700ml'),
('DEST-GIN-700',     'Gin 700ml',               'BEBIDA', 'BEBIDA', 'garrafa',13000,  'GLOBAL', 'Gin seco, 700ml'),
('DEST-BRANDY-700',  'Conhaque 700ml',          'BEBIDA', 'BEBIDA', 'garrafa',12000,  'GLOBAL', 'Conhaque envelhecido, 700ml'),
('DEST-LICOR-700',   'Licor de Maracuja 700ml', 'BEBIDA', 'BEBIDA', 'garrafa', 9000,  'LOCAL',  'Licor de maracuja, 700ml'),
('DEST-COPO-MISTO',  'Copos de Destilado',      'BEBIDA', 'BEBIDA', 'copo',    3500,  'GLOBAL', 'Dose de destilado, 40ml'),

-- Pratos da cozinha angolana e classica
('PRAT-MUAMBA',      'Muamba de Galinha',       'PRATO', 'COMIDA', 'prato',  3500,  'LOCAL',  'Prato nacional com funge de bombó'),
('PRAT-CALDEIRADA',  'Caldeirada de Peixe',     'PRATO', 'COMIDA', 'prato',  3800,  'LOCAL',  'Caldeirada angolana de peixe'),
('PRAT-MFUMBWA',     'Mfumbwa',                 'PRATO', 'COMIDA', 'prato',  2500,  'LOCAL',  'Folhas de mandioca com óleo de palma'),
('PRAT-FUNGE-CARNE', 'Funge com Carne',         'PRATO', 'COMIDA', 'prato',  3000,  'LOCAL',  'Funge de bombó com carne guisada'),
('PRAT-CACHUPA',     'Cachupa Gorda',           'PRATO', 'COMIDA', 'prato',  3200,  'LOCAL',  'Prato de panela com milho e feijao'),
('PRAT-BIFE-CAFE',   'Bife a Cafe',             'PRATO', 'COMIDA', 'prato',  4200,  'LOCAL',  'Bife com ovo, batata e arroz'),
('PRAT-MAMBA',       'Mamba com Funge',         'PRATO', 'COMIDA', 'prato',  3600,  'LOCAL',  'Carante de mamba com funge'),
('PRAT-CHOCO',       'Choco Frito',             'PRATO', 'COMIDA', 'prato',  4500,  'LOCAL',  'Choco frito com arroz e batata'),
('PRAT-FUNGE-PEIXE', 'Funge com Peixe Seco',    'PRATO', 'COMIDA', 'prato',  3000,  'LOCAL',  'Funge com peixe seco e óleo de palma'),
('PRAT-VACA-ARROZ',  'Carne de Vaca com Arroz', 'PRATO', 'COMIDA', 'prato',  3900,  'LOCAL',  'Carne guisada com arroz branco'),
('PRAT-FRANGO-GRELH','Frango Grelhado',         'PRATO', 'COMIDA', 'prato',  3300,  'LOCAL',  'Frango grelhado com batata'),
('PRAT-CAMARAO',     'Camarao Grelhado',        'PRATO', 'COMIDA', 'prato',  8500,  'LOCAL',  'Camarão grelhado com arroz'),
('PRAT-ARROZ',       'Arroz Branco',            'PRATO', 'COMIDA', 'prato',   900,  'LOCAL',  'Porção de arroz branco'),
('PRAT-FUNGE-BOMBO', 'Funge de Bombó',          'PRATO', 'COMIDA', 'prato',   900,  'LOCAL',  'Porção de funge de bombó'),
('PRAT-BATATA-DOCE', 'Batata Doce Frita',       'PRATO', 'COMIDA', 'prato',  1200,  'LOCAL',  'Porção de batata doce frita'),
('PRAT-OMELETE-GRAN','Omelete Grande',          'PRATO', 'COMIDA', 'prato',  2200,  'LOCAL',  'Omelete com queijo, presunto e batata'),

-- Snacks de bar e snack-bar
('SNCK-HAMBURGUER',  'Hamburguer Classico',     'LANCHE', 'SNACK', 'unidade', 2500, 'GLOBAL', 'Hambúrguer com queijo, alface e tomate'),
('SNCK-HAMB-XBACON', 'Hamburguer com Bacon',    'LANCHE', 'SNACK', 'unidade', 3000, 'GLOBAL', 'Hambúrguer com bacon extra'),
('SNCK-TOSTA-MISTA', 'Tosta Mista',             'LANCHE', 'SNACK', 'unidade', 1500, 'GLOBAL', 'Pão com presunto e queijo prensado'),
('SNCK-CACHORRO',    'Cachorro Quente',         'LANCHE', 'SNACK', 'unidade', 1800, 'GLOBAL', 'Salsicha com molho e batata palha'),
('SNCK-BATATA-FRITA','Batata Frita',            'LANCHE', 'SNACK', 'porcao',  1400, 'GLOBAL', 'Porção de batata frita rústica'),
('SNCK-OMELETE',     'Omelete',                 'LANCHE', 'SNACK', 'unidade', 1600, 'GLOBAL', 'Omelete simples de dois ovos'),
('SNCK-OME-QUEIJO',  'Omelete com Queijo',      'LANCHE', 'SNACK', 'unidade', 1900, 'GLOBAL', 'Omelete recheada com queijo'),
('SNCK-ASINHAS',     'Asinhas de Frango',       'LANCHE', 'SNACK', 'porcao',  2600, 'LOCAL',  'Seis asinhas de frango com molho'),
('SNCK-PIZZA',       'Pizza Individual',        'LANCHE', 'SNACK', 'unidade', 3200, 'GLOBAL', 'Pizza individual de forno'),
('SNCK-SALADA-FRUTA','Salada de Fruta',         'LANCHE', 'SNACK', 'prato',   1200, 'LOCAL',  'Fruta da época cortada à mão'),
('SNCK-IOGURTE',     'Iogurte com Granola',     'LANCHE', 'SNACK', 'tigela',  1500, 'GLOBAL', 'Iogurte natural com granola'),

-- Servicos do hotel
('SERV-WIFI',        'Wi-Fi Premium',           'SERVICO', 'HOSPEDAGEM', 'sessao',     0, 'GLOBAL', 'Acesso de alta velocidade em todo o hotel'),
('SERV-LAVANDARIA',  'Lavagem de Roupa',        'SERVICO', 'LAVANDARIA', 'quilo',   1500, 'LOCAL',  'Lavagem e engomadoria por quilo'),
('SERV-GINASIO',     'Acesso ao Ginasio',       'SERVICO', 'GINASIO',    'entrada', 2500, 'GLOBAL', 'Acesso diário à sala de musculação'),
('SERV-PISCINA',     'Acesso a Piscina',        'SERVICO', 'PISCINA',    'entrada', 2000, 'LOCAL',  'Acesso diário à piscina exterior'),
('SERV-ROOMSERVICE', 'Room Service',            'SERVICO', 'HOSPEDAGEM', 'servico', 1000, 'GLOBAL', 'Entrega de consumos ao quarto'),
('SERV-PARKING',     'Estacionamento',          'SERVICO', 'HOSPEDAGEM', 'diaria',  1000, 'LOCAL',  'Lugar de estacionamento vigiado'),
('SERV-CHECKOUT-TAR','Late Checkout',           'SERVICO', 'HOSPEDAGEM', 'servico', 5000, 'GLOBAL', 'Saida tardia sujeita a disponibilidade'),
('SERV-BABY-SITTING','Baby Sitting',            'SERVICO', 'HOSPEDAGEM', 'hora',    3000, 'GLOBAL', 'Serviço de babysitter por hora')
ON CONFLICT (sku) DO NOTHING;


-- ------------------------------------------------------------
-- 13. Registo da versao
-- ------------------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('011', '011_guest_ledger_rates_prebill.sql')
ON CONFLICT (version) DO NOTHING;
