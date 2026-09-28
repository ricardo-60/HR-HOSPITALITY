-- ============================================================
-- HR-HOSPITALITY - Migracao 012
-- DEFAULT de tenant_id nas tabelas de tenant que nao tem nenhum
-- ============================================================
-- Sumario:
--   1. Causa-raiz
--   2. DEFAULT public.hr_tenant_id() onde falta
--   3. Registo da versao
--
-- Causa-raiz: a partir da migracao 007 todas as tabelas novas
-- declaram `tenant_id UUID NOT NULL` sem default. A app POS nao
-- envia a coluna - confia na RLS para filtrar pelo perfil em
-- sessao -, pelo que o INSERT chega com tenant_id NULL e o
-- WITH CHECK `tenant_id = hr_tenant_id()` evalua a NULL e
-- rejeita com 42501:
--   new row violates row-level security policy for pos_orders
--
-- Correcao: a coluna passa a ter um default que resolve o tenant
-- a partir da sessao autenticada. O isolamento multi-tenant
-- fica intacto:
--   - o default so se aplica quando a app omite a coluna;
--   - qualquer valor explicito continua a mandar;
--   - as policies continuam a exigir `tenant_id = hr_tenant_id()`
--     e `hr_can_write_module`, portanto ninguem escreve noutro
--     hotel - nao ha bypass, nao ha USING TRUE.
--
-- Nao se toca nas tabelas de 001, 002 e 004: essas ja tem
-- default e troca-lo por hr_tenant_id() passaria a devolver
-- NULL em INSERT de service_role sem sessao, o que quebraria o
-- seed e as operacoes de administracao.
-- ============================================================

-- ---------------------------------------------------
-- 2. DEFAULT onde falta
-- ---------------------------------------------------
-- Percorre o catalogo e so altera colunas `tenant_id`
-- NOT NULL que estejam sem default. Cobre pos_orders,
-- pos_order_items e as restantes tabelas de 007, 008,
-- 010 e 011 com o mesmo defeito latente.
DO $$
DECLARE
    alvo TEXT;
BEGIN
    FOR alvo IN
        SELECT c.table_name
          FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.column_name = 'tenant_id'
           AND c.is_nullable = 'NO'
           AND c.column_default IS NULL
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.hr_tenant_id()',
            alvo
        );
    END LOOP;
END
$$;

-- Nada muda nas policies: pos_orders_write, da migracao 008,
-- ja cobre INSERT com USING e WITH CHECK iguais a
-- `tenant_id = hr_tenant_id() AND hr_can_write_module('pos')`.
-- Criar uma segunda policy identica nao acrescenta seguranca,
-- porque as policies permisivas sao unidas por OU.

-- ---------------------------------------------------
-- 3. Registo da versao
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('012', '012_tenant_id_default.sql')
ON CONFLICT (version) DO NOTHING;
