-- READ-ONLY review of deployed function grants and bodies flagged by Phase 1.
-- Run in the Supabase SQL Editor. This script makes no schema or data changes.

-- 1. Effective execute rights and expanded ACL entries for legacy write
-- overloads and their current Blossom entry points. PUBLIC appears as grantee
-- "PUBLIC". Effective checks include inherited grants and PUBLIC privileges.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END,
          'privilege', a.privilege_type,
          'grantable', a.is_grantable
        )
        ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END
      )
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      LEFT JOIN pg_roles r ON r.oid = a.grantee
    ),
    '[]'::jsonb
  ) AS acl_entries
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_order',
    'record_order_payment',
    'record_order_refund',
    'update_order_items',
    'decrement_stock',
    'void_order',
    'delete_order',
    'blossom_create_order',
    'blossom_edit_order',
    'blossom_void_order',
    'blossom_delete_order',
    'blossom_archive_order'
  )
ORDER BY p.proname, p.oid::regprocedure::text;

-- 2. Exact definitions for comparison. Review for role checks, input
-- validation, qualified object references, transaction boundaries, and audit
-- behavior. Keep this output private because routine bodies can expose schema
-- details even though it contains no row data.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_order',
    'record_order_payment',
    'record_order_refund',
    'update_order_items',
    'decrement_stock',
    'void_order',
    'delete_order',
    'blossom_create_order',
    'blossom_edit_order',
    'blossom_void_order',
    'blossom_delete_order',
    'blossom_archive_order'
  )
ORDER BY p.proname, p.oid::regprocedure::text;
