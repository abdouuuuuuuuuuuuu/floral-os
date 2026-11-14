-- READ-ONLY check before applying
--   supabase/migrations/20261109100000_require_active_account_for_reads.sql
--
-- That migration stops any signed-in account that is inactive, or has no
-- profile, from reading shop data. Run this in the Supabase SQL Editor first.
-- It changes nothing. Each result tells you whether it is safe to apply.

-- 1. The migration needs this function. Expect ONE row.
--    No row: do NOT apply the migration (every read would be blocked).
SELECT 'blossom_active_role exists' AS check_name, p.oid::regprocedure AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'blossom_active_role';

-- 2. Accounts that WILL lose access to shop data. Expect only people who
--    really should be locked out (former staff, test accounts).
SELECT
  u.email,
  p.username,
  p.full_name,
  p.role,
  CASE WHEN p.id IS NULL THEN 'NO PROFILE' ELSE 'INACTIVE' END AS reason,
  u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL OR p.is_active IS DISTINCT FROM true
ORDER BY u.last_sign_in_at DESC NULLS LAST;

-- 3. Accounts that keep access: every active staff member. Check every
--    person who works at the till today is in this list.
SELECT p.username, p.full_name, p.role, u.last_sign_in_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_active IS TRUE
ORDER BY p.role, p.full_name;

-- 4. What blossom_active_role() returns for YOU (the SQL Editor runs as the
--    postgres role, so this is normally NULL here; that is expected).
--    To test a real staff login, sign in to the app as that person after
--    applying the migration and open Orders, Products and Customers.
