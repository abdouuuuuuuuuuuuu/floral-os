-- Security fixes found by reviewing the live schema (2026-10-30).
--
-- 1. Self-service owner accounts. handle_new_user() took the new profile's
--    role from user-supplied sign-up metadata (and made the very first
--    account an owner). prevent_role_escalation() returns early when
--    auth.uid() is null, which is always the case while Auth inserts a new
--    user, so it never checked sign-ups. With public sign-up enabled and the
--    anon key shipped in the app, anyone could create an active owner.
--    New profiles now start as an inactive florist; only the
--    create-team-member Edge Function (service role) assigns the real role
--    and activates the account.
--
-- 2. Cashier and delivery accounts could not exist: profiles_role_valid only
--    allowed owner/manager/florist, so "Add member" failed for those roles.
--
-- 3. has_role() did not require an active profile, so permissive policies
--    built on it kept working for deactivated staff holding a valid token.
--
-- 4. Reporting views ran with their owner's rights, bypassing table RLS: any
--    signed-in role could read cash and sales totals through them.
--
-- 5. username_available() was callable without signing in and is unused by
--    the app; it only helped enumerate staff usernames.

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_username text;
BEGIN
  v_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'))
  );

  -- Guarantee uniqueness rather than failing the sign-up outright.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_username)) THEN
    v_username := v_username || substr(replace(new.id::text, '-', ''), 1, 4);
  END IF;

  -- Never trust sign-up metadata for access. The account stays inactive with
  -- the least-privileged role until an owner's create-team-member call sets
  -- its role and activates it.
  INSERT INTO public.profiles (id, email, full_name, username, role, is_active)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_username,
    'florist',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- 2 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_valid
  CHECK (role = ANY (ARRAY['owner', 'manager', 'florist', 'cashier', 'delivery']::text[]));

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(public.blossom_active_role() = ANY (p_roles), false);
$$;

-- 4 ─────────────────────────────────────────────────────────────────────────
ALTER VIEW public.daily_cash_summary SET (security_invoker = true);
ALTER VIEW public.order_receipt_view SET (security_invoker = true);
ALTER VIEW public.report_daily_revenue SET (security_invoker = true);
ALTER VIEW public.report_weekly_revenue SET (security_invoker = true);
ALTER VIEW public.report_monthly_revenue SET (security_invoker = true);
ALTER VIEW public.report_top_products SET (security_invoker = true);
ALTER VIEW public.report_breakdowns SET (security_invoker = true);
ALTER VIEW public.report_totals SET (security_invoker = true);
ALTER VIEW public.report_cashier_performance SET (security_invoker = true);
ALTER VIEW public.supplier_balances SET (security_invoker = true);
ALTER VIEW public.flower_waste_details SET (security_invoker = true);
ALTER VIEW public.monthly_flower_waste SET (security_invoker = true);

-- 5 ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'username_available'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
  END LOOP;
END;
$$;
