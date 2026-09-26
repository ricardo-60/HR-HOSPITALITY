-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 004 · RECURSOS HUMANOS (Supabase)
--   Tabela de empregados para os módulos /rh/*.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hr_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    employee_code TEXT,
    name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    hire_date DATE,
    base_salary DECIMAL(12,2) DEFAULT 0,
    contacts JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','FERIAS','SUSPENSO','DESLIGADO')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_employee_per_tenant UNIQUE (tenant_id, name)
);

ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_employees_all_tenant" ON public.hr_employees;
-- RLS remains deny-by-default here. Migration 005 installs the RBAC policies.

CREATE INDEX IF NOT EXISTS idx_hr_employees_tenant ON public.hr_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON public.hr_employees(status);
CREATE INDEX IF NOT EXISTS idx_hr_employees_department ON public.hr_employees(department);
