-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 002 · SEGURANÇA AUTH PBKDF2 (Supabase)
--   Tabela de utilizadores com credenciais com hash — alinhada
--   com o AuthContext (PBKDF2-SHA256, 150k iterações, salt 16B).
--
--   ⚠️ NUNCA inserir palavras-passe em texto simples nesta tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMINISTRATOR','PERMISSAO','ACESSO')),
    -- Hash PBKDF2-SHA256 (Base64) — nunca texto simples
    password_hash TEXT,
    -- Salt aleatório de 16 bytes (Base64)
    password_salt TEXT,
    -- true = credencial padrão/conhecida; o login exige substituição
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    restrictions JSONB NOT NULL DEFAULT '[]',
    allowed_modules JSONB NOT NULL DEFAULT '["*"]',
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','BLOQUEADO')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_user_per_tenant UNIQUE (tenant_id, name)
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_all_tenant" ON public.app_users;
CREATE POLICY "app_users_all_tenant" ON public.app_users
    FOR ALL USING (true);  -- Restringir por tenant após migração para Supabase Auth

CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON public.app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON public.app_users(status);
