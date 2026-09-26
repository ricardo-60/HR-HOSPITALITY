-- ============================================================
-- HR-HOSPITALITY — MIGRAÇÃO 005 · IDENTIDADE LOCAL SEGURA
-- Supabase Auth passa a ser a única fonte de credenciais.
-- ============================================================

ALTER TABLE app_users ADD COLUMN auth_user_id TEXT;
ALTER TABLE app_users ADD COLUMN email TEXT;
ALTER TABLE app_users ADD COLUMN employee_code TEXT;

CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id
    ON app_users(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_app_users_email
    ON app_users(lower(email));

-- PBKDF2 hashes are not compatible with Supabase Auth and must not remain in
-- the local database. Existing browser identities are intentionally discarded.
ALTER TABLE app_users DROP COLUMN password_hash;
ALTER TABLE app_users DROP COLUMN password_salt;

ALTER TABLE hotel_consumptions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

CREATE INDEX IF NOT EXISTS idx_consumptions_tenant ON hotel_consumptions(tenant_id);
