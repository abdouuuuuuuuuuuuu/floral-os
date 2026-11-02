-- Phase 2: route every ordinary order status change through one role-checked,
-- audited transition function. Cancellation and reopening retain their
-- dedicated stock/payment workflows.

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
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
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot update order status';
  END IF;
  IF p_order_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('new', 'processing', 'done') THEN
    RAISE EXCEPTION 'invalid order status';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status = p_status THEN RETURN to_jsonb(v_order); END IF;
  IF v_order.status IS NULL THEN
    RAISE EXCEPTION 'order has no valid current status';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'cancelled orders must be reopened through the reopen workflow';
  END IF;

  IF NOT (
       (v_order.status = 'new' AND p_status IN ('processing', 'done'))
    OR (v_order.status = 'processing' AND p_status IN ('new', 'done'))
    OR (v_order.status = 'ready' AND p_status IN ('processing', 'done'))
  ) THEN
    RAISE EXCEPTION 'invalid order status transition from % to %', v_order.status, p_status;
  END IF;

  v_old_order := v_order;
  UPDATE public.orders SET status = p_status
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_user_id::text, 'change_order_status', 'orders', to_jsonb(v_old_order),
    to_jsonb(v_order)
  );
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;

-- Edits and status changes remain one transaction, but status is applied by
-- set_order_status so assistant edits obey the same transition rules.
CREATE OR REPLACE FUNCTION public.blossom_edit_order(
  p_order_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_order_data jsonb DEFAULT '{}'::jsonb,
  p_additions jsonb DEFAULT '[]'::jsonb,
  p_request_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
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
  v_status_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot edit orders';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'processing', 'done') THEN
    RAISE EXCEPTION 'invalid order edit status; use the cancellation workflow to cancel an order';
  END IF;

  PERFORM public.edit_order_and_items(
    p_order_id, p_items, coalesce(p_order_data, '{}'::jsonb) - 'status',
    p_additions, p_request_id, NULL
  );
  IF p_status IS NOT NULL THEN
    v_status_result := public.set_order_status(p_order_id, p_status);
  END IF;
  RETURN jsonb_build_object(
    'updated', true,
    'order_id', p_order_id,
    'status', coalesce(v_status_result->>'status', p_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_edit_order(uuid, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_edit_order(uuid, jsonb, jsonb, jsonb, uuid, text) TO authenticated;

-- Delivery outcomes may move a new order into processing; record that change
-- with the delivery outcome so it is visible in the same audit history.
CREATE OR REPLACE FUNCTION public.record_delivery_outcome(
  p_order_id uuid,
  p_reason text,
  p_actor text DEFAULT NULL,
  p_new_date date DEFAULT NULL
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
  v_old_order jsonb;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_event jsonb;
  v_note text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot record delivery outcomes';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'delivery reason is required'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'completed or cancelled orders cannot be updated';
  END IF;
  IF coalesce(v_order.status, '') NOT IN ('new', 'processing', 'ready') THEN
    RAISE EXCEPTION 'order has no valid status for a delivery outcome';
  END IF;
  IF p_new_date IS NOT NULL THEN
    IF v_order.delivery_method = 'pickup' THEN
      RAISE EXCEPTION 'pickup orders do not have a delivery date';
    END IF;
    IF p_new_date <= (now() AT TIME ZONE 'Africa/Algiers')::date THEN
      RAISE EXCEPTION 'new delivery date must be in the future';
    END IF;
    IF v_order.delivery_date IS NOT NULL AND p_new_date <= v_order.delivery_date THEN
      RAISE EXCEPTION 'new delivery date must be later than the current date';
    END IF;
  END IF;

  v_old_order := to_jsonb(v_order);
  v_note := format('[Delivery attempt %s%s] %s. %s.',
    to_char(now() AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD HH24:MI'),
    CASE WHEN nullif(btrim(coalesce(p_actor, '')), '') IS NULL
      THEN '' ELSE ' by ' || left(btrim(p_actor), 100) END,
    v_reason,
    CASE WHEN p_new_date IS NULL
      THEN 'Returned to shop; delivery remains unresolved'
      ELSE 'Rescheduled to ' || p_new_date::text END);

  IF p_new_date IS NOT NULL THEN
    v_event := jsonb_build_object(
      'delayed_at', now(), 'delayed_by', v_user_id,
      'from_date', v_order.delivery_date, 'to_date', p_new_date,
      'reason', v_reason, 'source', 'failed_delivery'
    );
  END IF;

  UPDATE public.orders SET
    status = 'processing',
    notes = concat_ws(E'\n', nullif(btrim(coalesce(v_order.notes, '')), ''), v_note),
    delivery_date = coalesce(p_new_date, delivery_date),
    original_delivery_date = CASE WHEN p_new_date IS NULL
      THEN original_delivery_date ELSE coalesce(original_delivery_date, delivery_date) END,
    delay_reason = CASE WHEN p_new_date IS NULL THEN delay_reason ELSE v_reason END,
    delayed_at = CASE WHEN p_new_date IS NULL THEN delayed_at ELSE now() END,
    delay_history = CASE WHEN p_new_date IS NULL THEN delay_history
      ELSE coalesce(delay_history, '[]'::jsonb) || jsonb_build_array(v_event) END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (v_user_id::text, 'delivery_outcome', 'orders', v_old_order, to_jsonb(v_order));
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.record_delivery_outcome(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_delivery_outcome(uuid, text, text, date) TO authenticated;
