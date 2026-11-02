-- READ-ONLY Phase 1 authorization inventory for the Supabase SQL Editor.
-- This script does not change schema or data. Run each SELECT separately if
-- the SQL Editor limits result sets. Review results before preparing policies.

-- 1. Public tables and whether RLS is enabled/forced.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  c.reloptions AS relation_options
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 2. Every public table policy, including command, role, and predicate.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Table privileges granted to application roles.
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- 4. Function signatures and execute privileges. Includes overloads.
SELECT
  routine_schema,
  routine_name,
  specific_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY routine_name, specific_name, grantee;

-- 5. Security mode and definition of public views. Check whether each view
-- uses security_invoker; SECURITY DEFINER views need deliberate review.
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.reloptions,
  pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
ORDER BY c.relname;

-- 6. Triggers that enforce invariants or authorization, including whether
-- triggers are disabled. This lists definitions, not their function bodies.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled AS trigger_enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
ORDER BY c.relname, t.tgname;

-- 7. Exact deployed function security attributes for public RPCs.
-- Use pg_get_functiondef(oid) for the specific functions flagged in results.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig AS function_settings,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments;

-- 8. Schema privileges. SECURITY DEFINER functions whose search_path includes
-- public require public to be a trusted schema; API roles should not have
-- CREATE there. This is read-only.
SELECT
  n.nspname AS schema_name,
  has_schema_privilege('anon', n.oid, 'USAGE') AS anon_can_use,
  has_schema_privilege('anon', n.oid, 'CREATE') AS anon_can_create,
  has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_can_use,
  has_schema_privilege('authenticated', n.oid, 'CREATE') AS authenticated_can_create,
  has_schema_privilege('service_role', n.oid, 'USAGE') AS service_role_can_use,
  has_schema_privilege('service_role', n.oid, 'CREATE') AS service_role_can_create
FROM pg_namespace n
WHERE n.nspname = 'public';

-- 9. Effective sequence privileges for API roles. Table grants do not include
-- sequence permissions such as USAGE, SELECT, and UPDATE.
SELECT
  n.nspname AS schema_name,
  c.relname AS sequence_name,
  has_sequence_privilege('anon', c.oid, 'USAGE') AS anon_can_use,
  has_sequence_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
  has_sequence_privilege('anon', c.oid, 'UPDATE') AS anon_can_update,
  has_sequence_privilege('authenticated', c.oid, 'USAGE') AS authenticated_can_use,
  has_sequence_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
  has_sequence_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_can_update,
  has_sequence_privilege('service_role', c.oid, 'USAGE') AS service_role_can_use,
  has_sequence_privilege('service_role', c.oid, 'SELECT') AS service_role_can_select,
  has_sequence_privilege('service_role', c.oid, 'UPDATE') AS service_role_can_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'S'
ORDER BY c.relname;

-- 10. Effective execute rights for every public SECURITY DEFINER function
-- and every public function currently callable by an API role. This includes
-- PUBLIC and inherited access through has_function_privilege.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    p.prosecdef
    OR has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
ORDER BY p.proname, p.oid::regprocedure::text;

-- 11. Effective table/view privileges for API roles, including PUBLIC grants
-- and inherited privileges. RLS still determines which rows can be accessed.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT') AS service_role_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') AS service_role_update,
  has_table_privilege('service_role', c.oid, 'DELETE') AS service_role_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY c.relname;

-- 12. Effective column privileges. This catches column-level grants that
-- are not visible in table-level privilege summaries.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS column_name,
  has_column_privilege('anon', c.oid, a.attname, 'SELECT') AS anon_select,
  has_column_privilege('anon', c.oid, a.attname, 'INSERT') AS anon_insert,
  has_column_privilege('anon', c.oid, a.attname, 'UPDATE') AS anon_update,
  has_column_privilege('authenticated', c.oid, a.attname, 'SELECT') AS authenticated_select,
  has_column_privilege('authenticated', c.oid, a.attname, 'INSERT') AS authenticated_insert,
  has_column_privilege('authenticated', c.oid, a.attname, 'UPDATE') AS authenticated_update,
  has_column_privilege('service_role', c.oid, a.attname, 'SELECT') AS service_role_select,
  has_column_privilege('service_role', c.oid, a.attname, 'INSERT') AS service_role_insert,
  has_column_privilege('service_role', c.oid, a.attname, 'UPDATE') AS service_role_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

-- 13. Trigger function bodies for public tables. Pair with query 6 to check
-- enabled state and relation coverage. This returns code, not row data.
SELECT DISTINCT
  t.tgname AS trigger_name,
  c.relname AS table_name,
  p.oid::regprocedure AS trigger_function,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
ORDER BY c.relname, t.tgname;
