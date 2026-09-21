-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 004 · RECURSOS HUMANOS (SQLite)
--   Tabela de empregados para os módulos /rh/*.
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_employees (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    employee_code TEXT,
    name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    hire_date TEXT,
    base_salary REAL DEFAULT 0,
    -- JSON array de contactos, ex.: '[{"type":"telefone","value":"+244..."}]'
    contacts TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','FERIAS','SUSPENSO','DESLIGADO')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'synced',
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_tenant ON hr_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON hr_employees(status);
CREATE INDEX IF NOT EXISTS idx_hr_employees_department ON hr_employees(department);
