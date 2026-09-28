-- ============================================================
-- HR-HOSPITALITY - Migracao 013
-- GRANT de escrita em pos_tables (o unico que faltava)
-- ============================================================
-- Sumario:
--   1. Causa-raiz
--   2. GRANT de escrita em pos_tables
--   3. Registo da versao
--
-- Causa-raiz: a migracao 008 criou a policy `pos_tables_write`
-- (FOR ALL, com tenant_id = hr_tenant_id() E
-- hr_can_write_module('pos')) mas so emitiu
--   GRANT SELECT ... TO authenticated;
-- O PostgREST valida o GRANT ANTES da RLS, portanto qualquer
-- UPDATE chega ao servidor e devolve
--   permission denied for table pos_tables (42501)
-- sem as policies sequer serem avaliadas. O POS falha ao abrir
-- uma comanda de mesa porque o trigger e a app nao conseguem
-- passar a mesa a OCUPADA.
--
-- E o MESMO defeito que a migracao 011 ja tinha corrigido para
-- pos_products - la o GRANT de escrita passou a existir e o
-- `pos_products_write` deixou de ser inalcancavel. pos_tables
-- ficou por corrigir: e a ultima tabela com o padrao incompleto
-- (auditado em producao: pos_tables ins/upd/del = false com 2
-- policies activas; todas as restantes tabelas com policy de
-- escrita ja tem grants completos).
--
-- Correcao: alinhar o GRANT no padrao ja usado por pos_orders,
-- pos_order_items, inventory_items, inventory_movements e
-- cash_sessions. NAO se mexe em nenhuma policy:
--   - `pos_tables_write` continua a exigir
--     tenant_id = hr_tenant_id() AND hr_can_write_module('pos');
--   - portanto so quem opera o POS do proprio hotel escreve;
--   - nao ha USING (true), nao ha WITH CHECK trivial, nao ha
--     bypass do isolamento multi-tenant.
-- ============================================================

-- ---------------------------------------------------
-- 2. GRANT de escrita em pos_tables
-- ---------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.pos_tables TO authenticated;

-- tenant_audit_log fica so com SELECT de proposito: so e
-- escrito por funcoes SECURITY DEFINER, nunca pela app.

-- ---------------------------------------------------
-- 3. Registo da versao
-- ---------------------------------------------------
INSERT INTO public._schema_migrations (version, name)
VALUES ('013', '013_pos_tables_write_grant.sql')
ON CONFLICT (version) DO NOTHING;
