-- Phase 1: let delivery staff confirm successful delivery without granting
-- them the broader order-status permissions used by shop operations.
CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id uuid)
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
  v_old_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) THEN
    RAISE EXCEPTION 'account is not active';
  END IF;
  IF coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot mark deliveries complete';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order id is required'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'order is not an active delivery';
  END IF;
  IF v_order.delivery_method = 'pickup' THEN
    RAISE EXCEPTION 'order is not an active delivery';
  END IF;

  -- A lost response can safely be retried without a duplicate audit entry.
  IF v_order.status = 'done' THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'status', v_order.status,
      'already_completed', true
    );
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'cancelled orders cannot be marked delivered';
  END IF;
  IF coalesce(v_order.status, '') NOT IN ('new', 'processing', 'ready') THEN
    RAISE EXCEPTION 'order is not in a deliverable status';
  END IF;

  v_old_order := v_order;
  UPDATE public.orders
  SET status = 'done'
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (
    performed_by, action_taken, target_table, old_value, new_value
  ) VALUES (
    v_user_id::text,
    'mark_order_delivered',
    'orders',
    to_jsonb(v_old_order),
    to_jsonb(v_order)
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', v_order.status,
    'already_completed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_delivered(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
