-- READ-ONLY security audit. Run in the Supabase SQL Editor; it changes nothing.
-- Anyone can read this app's public repo, so they know the project URL and the
-- public (anon) key. These checks list what that key, or any signed-in
-- account, could reach. Every query should return NO ROWS unless noted.
-- Results come back as one table: check, object, detail.

WITH findings AS (

  -- 1. CRITICAL: tables with Row Level Security OFF. Through the API, anyone
  --    with a granted role reads and writes every row of these.
  SELECT '1 RLS disabled' AS check_name, c.relname::text AS object,
         'grants to anon: ' || coalesce((SELECT string_agg(DISTINCT g.privilege_type, ',')
           FROM information_schema.role_table_grants g
           WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee = 'anon'), 'none')
         || ' | to authenticated: ' || coalesce((SELECT string_agg(DISTINCT g.privilege_type, ',')
           FROM information_schema.role_table_grants g
           WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee = 'authenticated'), 'none') AS detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity

  UNION ALL
  -- 2. HIGH: policies that apply to anonymous (signed-out) visitors.
  SELECT '2 policy open to anon', tablename || '.' || policyname,
         cmd || ' USING ' || coalesce(qual, '-') || ' CHECK ' || coalesce(with_check, '-')
  FROM pg_policies
  WHERE schemaname = 'public' AND ('anon' = ANY (roles) OR 'public' = ANY (roles))

  UNION ALL
  -- 3. HIGH: write policies for signed-in users with no condition at all.
  --    Any account (including a deactivated one) could change every row.
  SELECT '3 unconditional write policy', tablename || '.' || policyname,
         cmd || ' for ' || array_to_string(roles, ',')
  FROM pg_policies
  WHERE schemaname = 'public' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND permissive = 'PERMISSIVE'
    AND coalesce(nullif(btrim(qual), ''), 'true') = 'true'
    AND coalesce(nullif(btrim(with_check), ''), 'true') = 'true'

  UNION ALL
  -- 4. HIGH: SECURITY DEFINER functions (they run with the owner's full
  --    rights) that anonymous visitors may call. Expected here: only
  --    sign-in helpers such as email_for_username and get_shop_name.
  SELECT '4 definer function callable by anon', p.oid::regprocedure::text, 'review'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')

  UNION ALL
  -- 5. MEDIUM: views that ignore Row Level Security (owner's rights) and that
  --    signed-in or anonymous users can read.
  SELECT '5 view bypasses RLS', c.relname::text,
         CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'readable by ANON' ELSE 'readable by authenticated' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND NOT coalesce(c.reloptions::text[] && ARRAY['security_invoker=true', 'security_invoker=on'], false)
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))

  UNION ALL
  -- 6. MEDIUM: public storage buckets (files readable by anyone with the link).
  SELECT '6 public storage bucket', b.name::text, 'public = true'
  FROM storage.buckets b WHERE b.public

  UNION ALL
  -- 7. LEAST PRIVILEGE: the app's roles must not own tables (owners can DROP
  --    and ALTER them). Expect no rows.
  SELECT '7 table owned by app role', c.relname::text, pg_get_userbyid(c.relowner)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v')
    AND pg_get_userbyid(c.relowner) IN ('anon', 'authenticated')

  UNION ALL
  -- 8. LEAST PRIVILEGE: can the app's roles create objects in public?
  SELECT '8 role can CREATE in public schema', r, 'CREATE on schema public'
  FROM unnest(ARRAY['anon', 'authenticated']) AS r
  WHERE has_schema_privilege(r, 'public', 'CREATE')

  UNION ALL
  -- 9. INFO (not a finding by itself): accounts whose email is not confirmed
  --    or that signed up on their own, i.e. not created from Team.
  SELECT '9 info: self-signed-up account', u.email::text,
         'created ' || u.created_at::date || coalesce(', profile role ' || p.role, ', no profile')
         || coalesce(', active ' || p.is_active::text, '')
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.created_by IS NULL AND coalesce(p.role, '') <> 'owner'
)
SELECT check_name, object, detail FROM findings ORDER BY check_name, object;
