-- Owner-only traceability: a single read of who did what and when, built from
-- the history Blossom already records (audit_logs + the register ledger), plus
-- a per-staff summary. Read-only; both functions refuse anyone but an owner.
-- This is the feature that replaces live cursors.

-- ─── Normalised activity feed ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.blossom_activity_feed(
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
  kind text,
  order_number text,
  amount integer,
  summary text,
  detail jsonb
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
    -- Audited actions: sales, payments, refunds, voids, restores, deletes,
    -- archives, status changes, team changes, waste.
    SELECT
      a.logged_at AS at,
      nullif(a.performed_by, '')::uuid AS actor_id,
      a.action_taken AS action,
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
      a.new_value AS detail
    FROM public.audit_logs a
    WHERE a.logged_at >= p_from AND a.logged_at < p_to

    UNION ALL

    -- Register open/close: not in the audit log, taken from the ledger.
    SELECT
      c.created_at,
      c.user_id,
      'register_' || c.transaction_type,
      NULL,
      c.amount,
      jsonb_build_object('register_date', c.register_date, 'description', c.description)
    FROM public.cash_register c
    WHERE c.transaction_type IN ('opening', 'closing')
      AND c.created_at >= p_from AND c.created_at < p_to
  ),
  mapped AS (
    SELECT
      raw.at,
      raw.actor_id,
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
        ELSE 'other'
      END AS kind,
      raw.action,
      raw.order_number,
      raw.amount,
      raw.detail
    FROM raw
  )
  SELECT
    m.at,
    m.actor_id,
    coalesce(p.full_name, p.username, 'System') AS actor_name,
    coalesce(p.role, '—') AS actor_role,
    m.kind,
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
      WHEN 'waste' THEN 'Flower waste recorded'
      WHEN 'register' THEN CASE WHEN m.action = 'register_opening' THEN 'Register opened' ELSE 'Register closed' END
      WHEN 'team' THEN 'Team: ' || replace(m.action, '_', ' ')
      ELSE replace(m.action, '_', ' ')
    END AS summary,
    m.detail
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

-- ─── Per-staff summary ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.blossom_staff_activity_summary(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  actor_id uuid,
  actor_name text,
  actor_role text,
  sales_count bigint,
  sales_total bigint,
  discount_total bigint,
  voids bigint,
  refunds_count bigint,
  refunds_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('owner') THEN
    RAISE EXCEPTION 'only an owner can read the activity log' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH a AS (
    SELECT nullif(performed_by, '')::uuid AS actor_id, action_taken, new_value
    FROM public.audit_logs
    WHERE logged_at >= p_from AND logged_at < p_to
  ),
  per AS (
    SELECT
      a.actor_id,
      count(*) FILTER (WHERE a.action_taken = 'create_order') AS sales_count,
      coalesce(sum((a.new_value->>'total_amount')::numeric)
        FILTER (WHERE a.action_taken = 'create_order'), 0)::bigint AS sales_total,
      coalesce(sum(
        CASE WHEN a.action_taken = 'create_order' THEN (
          SELECT coalesce(sum(greatest(0,
            (ov->>'catalog_unit_price')::numeric - (ov->>'charged_unit_price')::numeric)
            * (ov->>'quantity')::numeric), 0)
          FROM jsonb_array_elements(coalesce(a.new_value->'price_overrides', '[]'::jsonb)) AS ov
        ) ELSE 0 END), 0)::bigint AS discount_total,
      count(*) FILTER (WHERE a.action_taken = 'void_order') AS voids,
      count(*) FILTER (WHERE a.action_taken = 'refund_order_payment') AS refunds_count,
      coalesce(sum((a.new_value->'payment_event'->>'amount')::numeric)
        FILTER (WHERE a.action_taken = 'refund_order_payment'), 0)::bigint AS refunds_total
    FROM a
    GROUP BY a.actor_id
  )
  SELECT
    per.actor_id,
    coalesce(p.full_name, p.username, 'System') AS actor_name,
    coalesce(p.role, '—') AS actor_role,
    per.sales_count, per.sales_total, per.discount_total,
    per.voids, per.refunds_count, per.refunds_total
  FROM per
  LEFT JOIN public.profiles p ON p.id = per.actor_id
  ORDER BY per.sales_total DESC, per.sales_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_staff_activity_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_staff_activity_summary(timestamptz, timestamptz)
  TO authenticated;
