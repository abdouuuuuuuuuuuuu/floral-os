-- Blossom assistant read boundary hardening
--
-- Apply only after reviewing the existing schema and policies in Supabase.
-- This adds RESTRICTIVE SELECT policies: they cap access even when a broader
-- permissive policy exists, but do not grant access by themselves. Existing
-- permissive policies and table SELECT grants must still allow intended reads.
-- Missing/inactive profiles resolve to no role (deny).
--
-- This script covers assistant read surfaces only. It does not replace the
-- write authorization already implemented by the app's SECURITY DEFINER RPCs,
-- nor does it authorize direct INSERT/UPDATE/DELETE operations.

CREATE OR REPLACE FUNCTION public.blossom_active_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.role::text
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.is_active IS TRUE
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.blossom_active_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_active_role() TO authenticated;

-- Shared role sets, matching src/lib/permissions.js and the assistant's
-- permission gates. The delivery role can read orders needed by the delivery
-- module; the UI still narrows which order fields/actions it exposes.
DO $$
DECLARE
  item record;
  table_name text;
  roles text[];
  policy_name text;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('orders',                ARRAY['owner','manager','florist','cashier','delivery']::text[]),
      ('order_items',           ARRAY['owner','manager','florist','cashier','delivery']::text[]),
      ('customers',             ARRAY['owner','manager','florist','cashier']::text[]),
      ('products',              ARRAY['owner','manager','florist','cashier']::text[]),
      ('suppliers',             ARRAY['owner','manager']::text[]),
      ('supplier_transactions', ARRAY['owner','manager']::text[]),
      ('supplier_payments',     ARRAY['owner','manager']::text[]),
      ('cash_register',         ARRAY['owner']::text[])
    ) AS access(table_name, roles)
  LOOP
    table_name := item.table_name;
    roles := item.roles;
    policy_name := 'blossom_assistant_read_role_limit';

    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Required assistant RLS table public.% is missing; inspect the deployed schema before applying', table_name;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.blossom_active_role() = ANY (%L::text[]))',
      policy_name, table_name, roles
    );
  END LOOP;
END
$$;

-- Profiles contain contact and account information. Users can read their own
-- profile (including an inactive profile, so the client can explain lockout);
-- only active owners/managers can read the staff directory. This is a
-- restrictive cap and still requires a permissive profile SELECT policy.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blossom_assistant_profile_read_role_limit ON public.profiles;
CREATE POLICY blossom_assistant_profile_read_role_limit
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.blossom_active_role() = ANY (ARRAY['owner','manager']::text[])
  );

-- Views (supplier_balances, daily_cash_summary, report_*, monthly_flower_waste)
-- inherit access from their underlying tables only when created as
-- security_invoker. Review each view's security_invoker setting and grants in
-- Supabase; a SECURITY DEFINER view can bypass the table policies above.

-- Verification queries (run after applying):
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- SELECT c.relname, c.relkind, c.reloptions
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'v';
