-- Plain-language activity log.
--
-- A generic row-change trigger writes "Inserted row" / "Updated row" /
-- "Deleted row" entries into audit_logs. The feed did not recognise them, so
-- they showed as "Other" with the raw trigger label. Most of them duplicate a
-- real action logged in the same transaction (same logged_at):
--   * products  "Updated row"  — stock decrement from a sale / cancel / delivery
--   * cash_register "Inserted row" with an order_id — the money of a sale/payment
--   * customers "Updated row"  — order_count / total_spent recalculation
-- This version hides those duplicates and describes every remaining entry in
-- shop terms. It also returns the raw action so the page can show field-level
-- changes. Return columns change, so the function is dropped and recreated.

CREATE OR REPLACE FUNCTION public.blossom_jsonb_changed_keys(p_old jsonb, p_new jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH o AS (SELECT CASE WHEN jsonb_typeof(p_old) = 'object' THEN p_old ELSE '{}'::jsonb END AS v),
       n AS (SELECT CASE WHEN jsonb_typeof(p_new) = 'object' THEN p_new ELSE '{}'::jsonb END AS v)
  SELECT coalesce(array_agg(keys.k ORDER BY keys.k), ARRAY[]::text[])
  FROM o, n, LATERAL (SELECT DISTINCT jsonb_object_keys(o.v || n.v) AS k) keys
  WHERE keys.k <> 'updated_at'
    AND (o.v -> keys.k) IS DISTINCT FROM (n.v -> keys.k)
$$;

DROP FUNCTION IF EXISTS public.blossom_activity_feed(timestamptz, timestamptz, uuid, text, integer);

CREATE FUNCTION public.blossom_activity_feed(
  p_from timestamptz,
  p_to timestamptz,
  p_actor uuid DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_role text,
  actor_username text,
  kind text,
  area text,
  order_number text,
  amount integer,
  summary text,
  detail jsonb,
  before jsonb,
  action text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
BEGIN
  IF NOT public.has_role('owner') THEN
    RAISE EXCEPTION 'only an owner can read the activity log' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH raw AS (
    SELECT
      a.logged_at AS at,
      nullif(a.performed_by, '')::uuid AS actor_id,
      a.action_taken AS action,
      a.target_table AS tbl,
      a.new_value AS nv,
      a.old_value AS ov
    FROM public.audit_logs a
    WHERE a.logged_at >= p_from AND a.logged_at < p_to
  ),
  -- Moments when a real business action was logged. Generic row changes at
  -- the same instant belong to that action's transaction.
  business AS (
    SELECT DISTINCT r.at
    FROM raw r
    WHERE r.action NOT IN ('Inserted row', 'Updated row', 'Deleted row')
  ),
  audit_rows AS (
    SELECT
      r.*,
      coalesce(r.nv, r.ov) AS rowv,
      CASE WHEN r.action = 'Updated row'
        THEN public.blossom_jsonb_changed_keys(r.ov, r.nv)
        ELSE ARRAY[]::text[] END AS changed,
      EXISTS (SELECT 1 FROM business b WHERE b.at = r.at) AS in_business
    FROM raw r
  ),
  classified AS (
    SELECT
      ar.at, ar.actor_id, ar.action, ar.tbl, ar.nv, ar.ov, ar.rowv, ar.changed,
      CASE
        WHEN ar.action IN ('Inserted row', 'Updated row', 'Deleted row') THEN
          CASE ar.tbl
            WHEN 'cash_register' THEN
              CASE
                -- Opening/closing counts are listed from cash_register below.
                WHEN ar.action = 'Inserted row' AND ar.rowv->>'transaction_type' IN ('opening', 'closing') THEN 'hidden'
                -- The money of a sale or payment already listed.
                WHEN ar.action = 'Inserted row' AND ar.rowv->>'order_id' IS NOT NULL AND ar.in_business THEN 'hidden'
                WHEN ar.action = 'Inserted row' AND ar.rowv->>'transaction_type' = 'cash_out' THEN 'expense'
                WHEN ar.action = 'Inserted row' THEN 'cash_in'
                WHEN ar.action = 'Updated row' AND cardinality(ar.changed) = 0 THEN 'hidden'
                ELSE 'register'
              END
            WHEN 'products' THEN
              CASE
                WHEN ar.action = 'Updated row' AND cardinality(ar.changed) = 0 THEN 'hidden'
                -- Stock moved by a sale, cancellation or stock delivery.
                WHEN ar.action = 'Updated row' AND ar.changed <@ ARRAY['stock_level', 'product_status'] AND ar.in_business THEN 'hidden'
                ELSE 'product'
              END
            WHEN 'customers' THEN
              CASE
                -- Totals recalculated after an order; no one edited the customer.
                WHEN ar.action = 'Updated row'
                  AND ar.changed <@ ARRAY['order_count', 'total_spent', 'last_order_date', 'phone_normalized'] THEN 'hidden'
                ELSE 'customer'
              END
            ELSE 'other'
          END
        WHEN ar.action = 'create_order' THEN 'sale'
        WHEN ar.action = 'record_order_payment' THEN 'payment'
        WHEN ar.action = 'refund_order_payment' THEN 'refund'
        WHEN ar.action = 'void_order' THEN 'void'
        WHEN ar.action IN ('undo_void_order', 'restore_voided_order') THEN 'restore'
        WHEN ar.action = 'reopen_order' THEN 'reopen'
        WHEN ar.action = 'delete_order' THEN 'delete'
        WHEN ar.action = 'archive_order' THEN 'archive'
        WHEN ar.action IN ('change_order_status', 'set_order_status') THEN 'status'
        WHEN ar.action = 'record_flower_waste' THEN 'waste'
        WHEN ar.action IN ('receive_stock', 'void_supplier_entry') THEN 'stock'
        WHEN ar.action IN ('create_team_member', 'update_team_member', 'delete_team_member',
          'set_member_status', 'deactivate_team_member', 'reactivate_team_member',
          'reset_member_password', 'reset_team_member_password') THEN 'team'
        WHEN ar.action IN ('assign_loyalty_card', 'unlink_loyalty_card') THEN 'loyalty'
        ELSE 'other'
      END AS kind
    FROM audit_rows ar

    UNION ALL

    SELECT
      c.created_at,
      c.user_id,
      'register_' || c.transaction_type,
      'cash_register',
      jsonb_build_object('register_date', c.register_date, 'description', c.description,
        'payment_method', c.payment_method, 'amount', c.amount),
      NULL::jsonb,
      jsonb_build_object('amount', c.amount),
      ARRAY[]::text[],
      'register'
    FROM public.cash_register c
    WHERE c.transaction_type IN ('opening', 'closing')
      AND c.created_at >= p_from AND c.created_at < p_to
  ),
  described AS (
    SELECT
      cl.*,
      coalesce(
        cl.nv->>'order_number', cl.nv->'order'->>'order_number',
        cl.ov->>'order_number', cl.ov->'order'->>'order_number'
      ) AS order_no,
      (SELECT coalesce(tp.full_name, tp.username)
         FROM public.profiles tp
        WHERE tp.id::text = coalesce(cl.nv->>'id', cl.nv->>'target_user_id', cl.ov->>'id')
        LIMIT 1) AS target_name
    FROM classified cl
    WHERE cl.kind <> 'hidden'
  )
  SELECT
    d.at,
    d.actor_id,
    coalesce(p.full_name, p.username, 'System') AS actor_name,
    coalesce(p.role, '—') AS actor_role,
    p.username AS actor_username,
    d.kind,
    CASE
      WHEN d.tbl = 'orders' THEN 'Orders'
      WHEN d.tbl = 'cash_register' THEN 'Cash register'
      WHEN d.tbl = 'customer_loyalty_cards' THEN 'Loyalty cards'
      WHEN d.tbl IN ('profiles', 'auth.users') THEN 'Team'
      WHEN d.tbl = 'customers' THEN 'Customers'
      WHEN d.tbl = 'supplier_transactions' THEN 'Suppliers'
      WHEN d.tbl IN ('flower_waste', 'products', 'stock_adjustments') THEN 'Inventory'
      ELSE coalesce(initcap(replace(d.tbl, '_', ' ')), '—')
    END AS area,
    d.order_no,
    (CASE
      WHEN d.tbl = 'cash_register' THEN (d.rowv->>'amount')::numeric
      WHEN d.kind = 'stock' THEN (d.nv->>'total_cost')::numeric
      WHEN d.kind IN ('product', 'customer', 'team', 'other', 'status', 'archive', 'reopen', 'restore', 'loyalty') THEN NULL
      ELSE coalesce(
        (d.nv->'payment_event'->>'amount')::numeric,
        (d.nv->>'amount')::numeric,
        (d.nv->>'total_amount')::numeric,
        (d.nv->'order'->>'total_amount')::numeric,
        (d.ov->'order'->>'total_amount')::numeric
      )
    END)::integer AS amount,
    CASE d.kind
      WHEN 'sale' THEN 'Sale' || coalesce(' #' || d.order_no, '')
        || coalesce(' · ' || (d.nv->>'item_count') || CASE WHEN d.nv->>'item_count' = '1' THEN ' item' ELSE ' items' END, '')
      WHEN 'payment' THEN 'Payment received' || coalesce(' · Order #' || d.order_no, '')
        || coalesce(' · ' || CASE d.nv->'payment_event'->>'payment_method'
             WHEN 'cash' THEN 'Cash' WHEN 'baridimob' THEN 'BaridiMob' WHEN 'usd' THEN 'USDT'
             ELSE d.nv->'payment_event'->>'payment_method' END, '')
      WHEN 'refund' THEN 'Refund given' || coalesce(' · Order #' || d.order_no, '')
      WHEN 'void' THEN 'Order' || coalesce(' #' || d.order_no, '') || ' cancelled'
        || coalesce(' — ' || nullif(d.nv->>'reason', ''), '')
      WHEN 'restore' THEN 'Cancellation undone' || coalesce(' · Order #' || d.order_no, '')
      WHEN 'reopen' THEN 'Order' || coalesce(' #' || d.order_no, '') || ' reopened'
      WHEN 'delete' THEN 'Order' || coalesce(' #' || d.order_no, '') || ' permanently deleted'
      WHEN 'archive' THEN 'Order' || coalesce(' #' || d.order_no, '') || ' archived'
      WHEN 'status' THEN 'Order' || coalesce(' #' || d.order_no, '')
        || coalesce(': ' || initcap(replace(d.ov->>'status', '_', ' ')) || ' → '
             || initcap(replace(coalesce(d.nv->>'status', d.nv->>'restored_status'), '_', ' ')), ' status changed')
      WHEN 'loyalty' THEN CASE WHEN d.action = 'unlink_loyalty_card' THEN 'Loyalty card unlinked' ELSE 'Loyalty card linked' END
        || coalesce(' · ' || nullif(d.nv->>'customer_name', ''), '')
      WHEN 'waste' THEN 'Flower waste recorded'
      WHEN 'stock' THEN CASE WHEN d.action = 'void_supplier_entry'
        THEN 'Supplier delivery voided' || coalesce(' — ' || nullif(d.nv->>'reason', ''), '')
        ELSE 'Stock received from supplier' END
      WHEN 'team' THEN CASE d.action
        WHEN 'create_team_member' THEN 'New team member · ' || coalesce(d.nv->>'username', d.target_name, '?')
          || coalesce(' (' || (d.nv->>'role') || ')', '')
        WHEN 'deactivate_team_member' THEN 'Team member deactivated · ' || coalesce(d.target_name, '?')
        WHEN 'reactivate_team_member' THEN 'Team member reactivated · ' || coalesce(d.target_name, '?')
        WHEN 'reset_member_password' THEN 'Password reset · ' || coalesce(d.nv->>'target_username', d.target_name, '?')
        WHEN 'reset_team_member_password' THEN 'Password reset · ' || coalesce(d.nv->>'target_username', d.target_name, '?')
        ELSE 'Team: ' || replace(d.action, '_', ' ') || coalesce(' · ' || d.target_name, '')
      END
      WHEN 'register' THEN CASE
        WHEN d.action = 'register_opening' THEN 'Register opened'
        WHEN d.action = 'register_closing' THEN 'Register closed'
        WHEN d.action = 'Deleted row' THEN 'Register entry removed · '
          || coalesce(nullif(d.rowv->>'description', ''), d.rowv->>'category', 'entry')
        ELSE 'Register entry edited · ' || coalesce(nullif(d.rowv->>'description', ''), d.rowv->>'category', 'entry')
      END
      WHEN 'cash_in' THEN 'Money in' || coalesce(' · ' || nullif(d.rowv->>'category', ''), '')
        || coalesce(' — ' || nullif(d.rowv->>'description', ''), '')
      WHEN 'expense' THEN 'Expense' || coalesce(' · ' || nullif(d.rowv->>'category', ''), '')
        || coalesce(' — ' || nullif(d.rowv->>'description', ''), '')
      WHEN 'product' THEN CASE
        WHEN d.action = 'Inserted row' THEN 'New product · ' || coalesce(d.rowv->>'item_name', '?')
          || coalesce(' at ' || (d.rowv->>'retail_price') || ' DA', '')
        WHEN d.action = 'Deleted row' THEN 'Product deleted · ' || coalesce(d.rowv->>'item_name', '?')
        WHEN d.changed <@ ARRAY['stock_level', 'product_status'] AND 'stock_level' = ANY (d.changed)
          THEN 'Stock count changed · ' || coalesce(d.rowv->>'item_name', '?') || ': '
            || coalesce(d.ov->>'stock_level', '?') || ' → ' || coalesce(d.nv->>'stock_level', '?')
        WHEN 'retail_price' = ANY (d.changed)
          THEN 'Price changed · ' || coalesce(d.rowv->>'item_name', '?') || ': '
            || coalesce(d.ov->>'retail_price', '?') || ' → ' || coalesce(d.nv->>'retail_price', '?') || ' DA'
        ELSE 'Product edited · ' || coalesce(d.rowv->>'item_name', '?')
      END
      WHEN 'customer' THEN CASE
        WHEN d.action = 'Inserted row' THEN 'New customer · ' || coalesce(d.rowv->>'full_name', '?')
          || coalesce(' · ' || nullif(d.rowv->>'phone', ''), '')
        WHEN d.action = 'Deleted row' THEN 'Customer deleted · ' || coalesce(d.rowv->>'full_name', '?')
        ELSE 'Customer details edited · ' || coalesce(d.rowv->>'full_name', '?')
      END
      ELSE CASE
        WHEN d.action IN ('Inserted row', 'Updated row', 'Deleted row')
          THEN CASE d.action WHEN 'Inserted row' THEN 'Record added' WHEN 'Updated row' THEN 'Record edited' ELSE 'Record removed' END
            || ' · ' || coalesce(initcap(replace(d.tbl, '_', ' ')), 'unknown table')
        ELSE initcap(replace(d.action, '_', ' '))
      END
    END AS summary,
    d.nv AS detail,
    d.ov AS before,
    d.action::text
  FROM described d
  LEFT JOIN public.profiles p ON p.id = d.actor_id
  WHERE (p_actor IS NULL OR d.actor_id = p_actor)
    AND (p_kind IS NULL OR d.kind = p_kind)
  ORDER BY d.at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_activity_feed(timestamptz, timestamptz, uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_activity_feed(timestamptz, timestamptz, uuid, text, integer)
  TO authenticated;
