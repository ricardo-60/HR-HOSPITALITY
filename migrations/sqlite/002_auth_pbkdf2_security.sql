-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 002 · SEGURANÇA AUTH PBKDF2 (SQLite)
--   Tabela de utilizadores com credenciais com hash — alinhada
--   com o AuthContext (PBKDF2-SHA256, 150k iterações, salt 16B).
--
--   ⚠️ NUNCA inserir palavras-passe em texto simples nesta tabela.
--   O seed de contas de demonstração continua a ser feito pelo
--   AuthContext (que gera hash + salt no arranque).
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMINISTRATOR','PERMISSAO','ACESSO')),
    -- Hash PBKDF2-SHA256 (Base64) — nunca texto simples
    password_hash TEXT,
    -- Salt aleatório de 16 bytes (Base64)
    password_salt TEXT,
    -- 1 = credencial padrão/conhecida; o login exige substituição
    must_change_password INTEGER NOT NULL DEFAULT 0,
    commission_rate REAL NOT NULL DEFAULT 0.02,
    -- JSON array de caminhos bloqueados, ex.: '["/spa"]'
    restrictions TEXT NOT NULL DEFAULT '[]',
    -- JSON array de módulos permitidos, ex.: '["pos","lavandaria"]'
    allowed_modules TEXT NOT NULL DEFAULT '["*"]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','BLOQUEADO')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
