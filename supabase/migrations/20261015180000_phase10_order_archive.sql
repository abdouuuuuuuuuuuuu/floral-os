-- Phase 10: allow an owner to archive an order (including a quick sale)
-- while preserving its order, items, payment, stock, and audit history.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE OR REPLACE FUNCTION public.blossom_archive_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_order public.orders%ROWTYPE;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can archive orders';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order id is required'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('archived', true, 'already_archived', true, 'order_id', p_order_id);
  END IF;

  UPDATE public.orders
  SET deleted_at = now(), deleted_by = v_user_id, deletion_reason = v_reason
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (
    performed_by, action_taken, target_table, old_value, new_value
  ) VALUES (
    v_user_id::text,
    'archive_order',
    'orders',
    to_jsonb(v_order),
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'reason', v_reason,
      'deleted_at', now()
    )
  );

  RETURN jsonb_build_object('archived', true, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_archive_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_archive_order(uuid, text) TO authenticated;
