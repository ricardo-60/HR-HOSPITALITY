-- ============================================================
-- HR-HOSPITALITY — MIGRAÇÃO 007 — PERFIS POS/EXECUTIVO (SQLite)
-- Alarga o CHECK de app_users.role aos novos perfis introduzidos
-- pela migração Supabase 007_commercial_core.sql:
--   POS       → ponto de venda / comandas
--   EXECUTIVO → dono ou gestão (leitura integral)
--
-- SQLite não suporta ALTER TABLE ... CHECK, por isso a tabela é
-- reconstruída preservando todos os dados e índices.
-- Idempotente: reconstrói sempre para o mesmo esquema alvo.
-- ============================================================

PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE app_users_backup AS SELECT * FROM app_users;

DROP TABLE app_users;

CREATE TABLE app_users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMINISTRATOR','PERMISSAO','ACESSO','POS','EXECUTIVO')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    commission_rate REAL NOT NULL DEFAULT 0.02,
    restrictions TEXT NOT NULL DEFAULT '[]',
    allowed_modules TEXT NOT NULL DEFAULT '["*"]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','BLOQUEADO')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    auth_user_id TEXT,
    email TEXT,
    employee_code TEXT,
    UNIQUE(tenant_id, name)
);

INSERT INTO app_users
    (id, tenant_id, name, role, must_change_password, commission_rate,
     restrictions, allowed_modules, status, created_at, updated_at,
     auth_user_id, email, employee_code)
SELECT id, tenant_id, name, role, must_change_password, commission_rate,
       restrictions, allowed_modules, status, created_at, updated_at,
       auth_user_id, email, employee_code
  FROM app_users_backup;

DROP TABLE app_users_backup;

CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON app_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(lower(email));
