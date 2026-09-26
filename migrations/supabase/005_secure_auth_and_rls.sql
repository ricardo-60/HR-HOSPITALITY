-- ============================================================
-- HR-HOSPITALITY — MIGRAÇÃO 005 · SUPABASE AUTH + RLS
--
-- Security cutover:
--   * app_users is linked to auth.users;
--   * legacy PBKDF2 password columns are removed;
--   * roles/tenant come from the protected profile, never user_metadata;
--   * all permissive USING(true) policies are removed;
--   * public/anon access to operational tables is denied.
--
-- Run with a full Supabase backup and a staging test first.
-- ============================================================

BEGIN;

-- ── Identity columns and compatibility columns ─────────────────────────────
ALTER TABLE public.app_users
    ADD COLUMN IF NOT EXISTS auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS employee_code TEXT;

ALTER TABLE public.hotel_reservations
    ADD COLUMN IF NOT EXISTS check_in_date DATE,
    ADD COLUMN IF NOT EXISTS check_out_date DATE,
    ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

ALTER TABLE public.hotel_consumptions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

UPDATE public.hotel_reservations
SET sync_status = 'synced'
WHERE sync_status IS NULL;

UPDATE public.hotel_consumptions
SET sync_status = 'synced'
WHERE sync_status IS NULL;

ALTER TABLE public.hotel_reservations
    ALTER COLUMN sync_status SET DEFAULT 'synced';

ALTER TABLE public.hotel_consumptions
    ALTER COLUMN sync_status SET DEFAULT 'synced';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.app_users'::regclass
          AND conname = 'app_users_auth_user_id_fkey'
    ) THEN
        ALTER TABLE public.app_users
            ADD CONSTRAINT app_users_auth_user_id_fkey
            FOREIGN KEY (auth_user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE
            NOT VALID;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_uq
    ON public.app_users (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservations_id_tenant_uq
    ON public.hotel_reservations (id, tenant_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hotel_consumptions'::regclass
          AND conname = 'hotel_consumptions_reservation_tenant_fkey'
    ) THEN
        ALTER TABLE public.hotel_consumptions
            ADD CONSTRAINT hotel_consumptions_reservation_tenant_fkey
            FOREIGN KEY (reservation_id, tenant_id)
            REFERENCES public.hotel_reservations(id, tenant_id)
            ON DELETE CASCADE
            NOT VALID;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_uq
    ON public.app_users (lower(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_employee_code_uq
    ON public.app_users (tenant_id, lower(employee_code))
    WHERE employee_code IS NOT NULL;

-- Password hashes cannot be imported into Supabase Auth. Remove them from the
-- public schema instead of moving them to another client-accessible location.
ALTER TABLE public.app_users
    DROP COLUMN IF EXISTS password_hash,
    DROP COLUMN IF EXISTS password_salt;

-- Legacy browser identities have no Supabase Auth UUID and cannot be used.
-- Keep the rows for audit, but force them into an explicitly blocked state.
UPDATE public.app_users
SET status = 'BLOQUEADO'
WHERE auth_user_id IS NULL;

-- ── Protected authorization helpers ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_current_profile()
RETURNS TABLE (
    profile_id UUID,
    tenant_id UUID,
    role TEXT,
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT au.id, au.tenant_id, au.role, au.status
    FROM public.app_users AS au
    WHERE au.auth_user_id = (SELECT auth.uid())
      AND au.status = 'ATIVO'
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.hr_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT p.role = 'ADMINISTRATOR'
            FROM public.hr_current_profile() AS p
        ),
        FALSE
    )
$$;

CREATE OR REPLACE FUNCTION public.hr_can_module(requested_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT CASE p.role
                WHEN 'ADMINISTRATOR' THEN TRUE
                WHEN 'PERMISSAO' THEN NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(p_profile.restrictions) = 'array'
                            THEN p_profile.restrictions
                            ELSE '[]'::jsonb
                        END
                    ) AS restricted(value)
                    WHERE restricted.value = requested_module
                       OR restricted.value = '/' || requested_module
                       OR restricted.value LIKE '/' || requested_module || '/%'
                )
                WHEN 'ACESSO' THEN EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(p_profile.allowed_modules) = 'array'
                            THEN p_profile.allowed_modules
                            ELSE '[]'::jsonb
                        END
                    ) AS allowed(value)
                    WHERE allowed.value = '*'
                       OR allowed.value = requested_module
                )
                ELSE FALSE
            END
            FROM public.hr_current_profile() AS p
            JOIN public.app_users AS p_profile ON p_profile.id = p.profile_id
        ),
        FALSE
    )
$$;

CREATE OR REPLACE FUNCTION public.set_app_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS app_users_set_updated_at ON public.app_users;
CREATE TRIGGER app_users_set_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.set_app_users_updated_at();

REVOKE ALL ON FUNCTION public.hr_current_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_can_module(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_can_module(TEXT) TO authenticated;

-- ── Remove every policy from the protected business tables ────────────────
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'tenants',
              'app_users',
              'hotel_rooms',
              'hotel_reservations',
              'hotel_consumptions',
              'hr_employees'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            policy_row.policyname,
            policy_row.schemaname,
            policy_row.tablename
        );
    END LOOP;
END
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regclass('public._schema_migrations') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public._schema_migrations ENABLE ROW LEVEL SECURITY';
    END IF;
END
$$;

REVOKE ALL ON TABLE public.tenants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.app_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hotel_rooms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hotel_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hotel_consumptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hr_employees FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.tenants TO service_role;
GRANT ALL ON TABLE public.app_users TO service_role;
GRANT ALL ON TABLE public.hotel_rooms TO service_role;
GRANT ALL ON TABLE public.hotel_reservations TO service_role;
GRANT ALL ON TABLE public.hotel_consumptions TO service_role;
GRANT ALL ON TABLE public.hr_employees TO service_role;

DO $$
BEGIN
    IF to_regclass('public._schema_migrations') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON TABLE public._schema_migrations FROM PUBLIC, anon, authenticated';
        EXECUTE 'GRANT ALL ON TABLE public._schema_migrations TO service_role';
    END IF;
END
$$;

-- ── Tenant and safe profile access ─────────────────────────────────────────
GRANT SELECT ON TABLE public.tenants TO authenticated;

CREATE POLICY tenants_select_current_tenant
ON public.tenants
FOR SELECT
TO authenticated
USING (id = (SELECT tenant_id FROM public.hr_current_profile()));

GRANT SELECT (
    id,
    auth_user_id,
    tenant_id,
    email,
    employee_code,
    name,
    role,
    commission_rate,
    restrictions,
    allowed_modules,
    status,
    must_change_password,
    created_at,
    updated_at
) ON TABLE public.app_users TO authenticated;

CREATE POLICY app_users_select_self_or_admin
ON public.app_users
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (
        auth_user_id = (SELECT auth.uid())
        OR (SELECT public.hr_is_admin())
    )
);

-- ── Operational tables ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.hotel_rooms, public.hotel_reservations, public.hotel_consumptions
TO authenticated;

CREATE POLICY rooms_select_lodging
ON public.hotel_rooms
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY rooms_insert_lodging
ON public.hotel_rooms
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY rooms_update_lodging
ON public.hotel_rooms
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY rooms_delete_admin
ON public.hotel_rooms
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_is_admin())
);

CREATE POLICY reservations_select_lodging
ON public.hotel_reservations
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY reservations_insert_lodging
ON public.hotel_reservations
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY reservations_update_lodging
ON public.hotel_reservations
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('alojamento'))
);

CREATE POLICY reservations_delete_admin
ON public.hotel_reservations
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_is_admin())
);

CREATE POLICY consumptions_select_lodging_or_pos
ON public.hotel_consumptions
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
);

CREATE POLICY consumptions_insert_lodging_or_pos
ON public.hotel_consumptions
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
);

CREATE POLICY consumptions_update_lodging_or_pos
ON public.hotel_consumptions
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (
        (SELECT public.hr_can_module('alojamento'))
        OR (SELECT public.hr_can_module('pos'))
    )
);

CREATE POLICY consumptions_delete_admin
ON public.hotel_consumptions
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND EXISTS (
        SELECT 1
        FROM public.hotel_reservations AS r
        WHERE r.id = hotel_consumptions.reservation_id
          AND r.tenant_id = hotel_consumptions.tenant_id
    )
    AND (SELECT public.hr_is_admin())
);

-- ── HR employees ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.hr_employees
TO authenticated;

CREATE POLICY employees_select_rh
ON public.hr_employees
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
);

CREATE POLICY employees_insert_rh
ON public.hr_employees
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
);

CREATE POLICY employees_update_rh
ON public.hr_employees
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_can_module('rh'))
);

CREATE POLICY employees_delete_admin
ON public.hr_employees
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT tenant_id FROM public.hr_current_profile())
    AND (SELECT public.hr_is_admin())
);

-- Fail the migration if a protected table still has a literal-true policy.
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'tenants', 'app_users', 'hotel_rooms',
              'hotel_reservations', 'hotel_consumptions', 'hr_employees'
          )
    LOOP
        IF (
            policy_row.qual IS NOT NULL
            AND policy_row.qual ~* '(^|[^[:alnum:]_])true([^[:alnum:]_]|$)'
        ) OR (
            policy_row.with_check IS NOT NULL
            AND policy_row.with_check ~* '(^|[^[:alnum:]_])true([^[:alnum:]_]|$)'
        ) THEN
            RAISE EXCEPTION 'Permissive policy remains: %.%', policy_row.tablename, policy_row.policyname;
        END IF;
    END LOOP;
END
$$;

COMMIT;
