-- Richer activity log: alongside what/who/when, return the staff username, the
-- area of the app the action touched ("where"), and the full before/after
-- values so each entry can be expanded to its exact detail. Return columns
-- change, so the function is dropped and recreated.

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
  before jsonb
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
      a.target_table AS target_table,
      coalesce(
        a.new_value->>'order_number', a.new_value->'order'->>'order_number',
        a.old_value->>'order_number', a.old_value->'order'->>'order_number'
      ) AS order_number,
      coalesce(
        (a.new_value->'payment_event'->>'amount')::numeric,
        (a.new_value->>'amount')::numeric,
        (a.new_value->>'total_amount')::numeric,
        (a.new_value->'order'->>'total_amount')::numeric
      )::integer AS amount,
      a.new_value AS detail,
      a.old_value AS before
    FROM public.audit_logs a
    WHERE a.logged_at >= p_from AND a.logged_at < p_to

    UNION ALL

    SELECT
      c.created_at,
      c.user_id,
      'register_' || c.transaction_type,
      'cash_register',
      NULL,
      c.amount,
      jsonb_build_object('register_date', c.register_date, 'description', c.description,
        'payment_method', c.payment_method),
      NULL::jsonb
    FROM public.cash_register c
    WHERE c.transaction_type IN ('opening', 'closing')
      AND c.created_at >= p_from AND c.created_at < p_to
  ),
  mapped AS (
    SELECT
      raw.at, raw.actor_id, raw.target_table,
      CASE raw.action
        WHEN 'create_order' THEN 'sale'
        WHEN 'record_order_payment' THEN 'payment'
        WHEN 'refund_order_payment' THEN 'refund'
        WHEN 'void_order' THEN 'void'
        WHEN 'undo_void_order' THEN 'restore'
        WHEN 'restore_voided_order' THEN 'restore'
        WHEN 'reopen_order' THEN 'reopen'
        WHEN 'delete_order' THEN 'delete'
        WHEN 'archive_order' THEN 'archive'
        WHEN 'change_order_status' THEN 'status'
        WHEN 'set_order_status' THEN 'status'
        WHEN 'record_flower_waste' THEN 'waste'
        WHEN 'register_opening' THEN 'register'
        WHEN 'register_closing' THEN 'register'
        WHEN 'create_team_member' THEN 'team'
        WHEN 'update_team_member' THEN 'team'
        WHEN 'delete_team_member' THEN 'team'
        WHEN 'set_member_status' THEN 'team'
        WHEN 'assign_loyalty_card' THEN 'loyalty'
        WHEN 'unlink_loyalty_card' THEN 'loyalty'
        ELSE 'other'
      END AS kind,
      raw.action, raw.order_number, raw.amount, raw.detail, raw.before
    FROM raw
  )
  SELECT
    m.at,
    m.actor_id,
    coalesce(p.full_name, p.username, 'System') AS actor_name,
    coalesce(p.role, '—') AS actor_role,
    p.username AS actor_username,
    m.kind,
    CASE
      WHEN m.kind = 'register' THEN 'Cash register'
      WHEN m.target_table = 'orders' THEN 'Orders'
      WHEN m.target_table = 'cash_register' THEN 'Cash register'
      WHEN m.target_table = 'customer_loyalty_cards' THEN 'Loyalty cards'
      WHEN m.target_table = 'profiles' THEN 'Team'
      WHEN m.target_table IN ('flower_waste', 'products', 'stock_adjustments') THEN 'Inventory'
      ELSE coalesce(initcap(replace(m.target_table, '_', ' ')), '—')
    END AS area,
    m.order_number,
    m.amount,
    CASE m.kind
      WHEN 'sale' THEN 'Sale' || coalesce(' #' || m.order_number, '')
      WHEN 'payment' THEN 'Payment' || coalesce(' #' || m.order_number, '')
      WHEN 'refund' THEN 'Refund' || coalesce(' #' || m.order_number, '')
      WHEN 'void' THEN 'Order cancelled' || coalesce(' #' || m.order_number, '')
      WHEN 'restore' THEN 'Cancellation undone' || coalesce(' #' || m.order_number, '')
      WHEN 'reopen' THEN 'Order reopened' || coalesce(' #' || m.order_number, '')
      WHEN 'delete' THEN 'Order permanently deleted' || coalesce(' #' || m.order_number, '')
      WHEN 'archive' THEN 'Order archived' || coalesce(' #' || m.order_number, '')
      WHEN 'status' THEN 'Status changed' || coalesce(' #' || m.order_number, '')
      WHEN 'loyalty' THEN CASE WHEN m.action = 'unlink_loyalty_card'
        THEN 'Loyalty card unlinked' ELSE 'Loyalty card linked' END
      WHEN 'waste' THEN 'Flower waste recorded'
      WHEN 'register' THEN CASE WHEN m.action = 'register_opening' THEN 'Register opened' ELSE 'Register closed' END
      WHEN 'team' THEN 'Team: ' || replace(m.action, '_', ' ')
      ELSE replace(m.action, '_', ' ')
    END AS summary,
    m.detail,
    m.before
  FROM mapped m
  LEFT JOIN public.profiles p ON p.id = m.actor_id
  WHERE (p_actor IS NULL OR m.actor_id = p_actor)
    AND (p_kind IS NULL OR m.kind = p_kind)
  ORDER BY m.at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_activity_feed(timestamptz, timestamptz, uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_activity_feed(timestamptz, timestamptz, uuid, text, integer)
  TO authenticated;
