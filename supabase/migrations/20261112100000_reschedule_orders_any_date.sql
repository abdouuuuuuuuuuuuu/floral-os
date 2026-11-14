-- Order dates could not be changed in practice.
--
-- delay_order() only accepted a date that was BOTH after today AND after the
-- order's current date, and refused pickup orders outright. Editing the date
-- from the order form went through the same rule when the date moved later
-- (so it failed with the same errors), and when the date moved earlier it was
-- handed to the legacy update_order_items() helper, which does not apply it.
-- Staff saw either an error or a date that silently snapped back.
--
-- reschedule_order() replaces the rule: any date from today onward, earlier
-- or later, for pickup and delivery orders. The delay history is still kept,
-- and an order only shows as "delayed" while it sits later than its first
-- planned date. delay_order() stays as a compatibility wrapper so older app
-- builds, the assistant, and the delivery run keep working.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_delivery_date date,
  ADD COLUMN IF NOT EXISTS delay_reason text,
  ADD COLUMN IF NOT EXISTS delayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delay_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.reschedule_order(
  p_order_id uuid,
  p_delivery_date date,
  p_reason text DEFAULT ''
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
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_business_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_original date;
  v_is_delayed boolean;
  v_direction text;
  v_event jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;

  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot delay orders';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order and new delivery date are required';
  END IF;
  IF length(coalesce(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'delay reason must be 500 characters or fewer';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'archived orders cannot be updated'; END IF;
  IF v_order.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'completed or cancelled orders cannot be delayed';
  END IF;
  -- A pickup order may have no date ("whenever the customer comes"); a
  -- delivery always needs one so dispatch can plan it.
  IF p_delivery_date IS NULL AND v_order.delivery_method <> 'pickup' THEN
    RAISE EXCEPTION 'delivery orders need a delivery date';
  END IF;
  IF p_delivery_date IS NOT NULL AND p_delivery_date < v_business_date THEN
    RAISE EXCEPTION 'new delivery date cannot be in the past';
  END IF;

  -- Same date: nothing to record.
  IF p_delivery_date IS NOT DISTINCT FROM v_order.delivery_date THEN
    RETURN to_jsonb(v_order);
  END IF;

  v_original := coalesce(v_order.original_delivery_date, v_order.delivery_date);
  v_is_delayed := v_original IS NOT NULL AND p_delivery_date IS NOT NULL AND p_delivery_date > v_original;
  v_direction := CASE
    WHEN v_order.delivery_date IS NULL THEN 'set'
    WHEN p_delivery_date IS NULL THEN 'cleared'
    WHEN p_delivery_date > v_order.delivery_date THEN 'later'
    ELSE 'earlier'
  END;
  v_event := jsonb_build_object(
    'delayed_at', now(), 'delayed_by', v_user_id,
    'from_date', v_order.delivery_date, 'to_date', p_delivery_date,
    'reason', coalesce(v_reason, 'Not specified'),
    'direction', v_direction, 'source', 'reschedule'
  );

  UPDATE public.orders
  SET original_delivery_date = v_original,
      delivery_date = p_delivery_date,
      -- "Delayed" means later than the first planned date. Bringing the order
      -- back on or before that date clears the flag; the history stays.
      delayed_at = CASE WHEN v_is_delayed THEN now() ELSE NULL END,
      delay_reason = CASE WHEN v_is_delayed THEN coalesce(v_reason, 'Not specified') ELSE NULL END,
      delay_history = coalesce(delay_history, '[]'::jsonb) || jsonb_build_array(v_event)
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_order(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_order(uuid, date, text) TO authenticated;

-- Compatibility wrapper: same signature as before, new rules.
CREATE OR REPLACE FUNCTION public.delay_order(
  p_order_id uuid,
  p_delivery_date date,
  p_reason text DEFAULT 'Not specified'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_order_id IS NULL OR p_delivery_date IS NULL THEN
    RAISE EXCEPTION 'order and new delivery date are required';
  END IF;
  RETURN public.reschedule_order(p_order_id, p_delivery_date, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.delay_order(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delay_order(uuid, date, text) TO authenticated;

-- Order edits: every delivery-date change (earlier, later, set, or cleared on
-- a pickup) goes through reschedule_order() in the same transaction, and the
-- date keys never reach the legacy update_order_items() helper.
CREATE OR REPLACE FUNCTION public.edit_order_and_items(
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
  v_order public.orders%ROWTYPE;
  v_order_data jsonb := coalesce(p_order_data, '{}'::jsonb);
  v_requested_delivery_date date;
  v_next_method text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot edit orders';
  END IF;
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_additions, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_order_data, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'invalid order edit payload';
  END IF;
  IF jsonb_array_length(coalesce(p_additions, '[]'::jsonb)) > 0 AND p_request_id IS NULL THEN
    RAISE EXCEPTION 'an edit request id is required when adding products';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'processing', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'invalid order status';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF v_order_data ? 'delivery_date' THEN
    BEGIN
      v_requested_delivery_date := nullif(btrim(coalesce(v_order_data->>'delivery_date', '')), '')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid delivery date';
    END;
    v_next_method := coalesce(nullif(btrim(v_order_data->>'delivery_method'), ''), v_order.delivery_method);

    IF v_requested_delivery_date IS DISTINCT FROM v_order.delivery_date THEN
      IF v_requested_delivery_date IS NULL AND v_next_method <> 'pickup' THEN
        RAISE EXCEPTION 'delivery orders need a delivery date';
      END IF;
      -- Switching to pickup and clearing the date in one edit: apply the
      -- method first so the reschedule sees a pickup order.
      IF v_requested_delivery_date IS NULL AND v_order.delivery_method <> 'pickup' THEN
        UPDATE public.orders SET delivery_method = 'pickup' WHERE id = p_order_id;
      END IF;
      PERFORM public.reschedule_order(
        p_order_id,
        v_requested_delivery_date,
        coalesce(nullif(btrim(v_order_data->>'delay_reason'), ''), 'Rescheduled from order edit')
      );
    END IF;
    v_order_data := v_order_data - 'delivery_date' - 'delay_reason';
  END IF;

  -- These calls share the caller's transaction: any exception rolls back the
  -- existing-line edits, added lines, stock movements, and status change.
  PERFORM public.update_order_items(
    p_order_id,
    coalesce(p_items, '[]'::jsonb),
    v_order_data
  );

  IF jsonb_array_length(coalesce(p_additions, '[]'::jsonb)) > 0 THEN
    PERFORM public.add_order_items(p_order_id, p_request_id, p_additions);
  END IF;

  IF p_status IS NOT NULL THEN
    UPDATE public.orders SET status = p_status WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  END IF;

  RETURN jsonb_build_object('updated', true, 'order_id', p_order_id);
END;
$$;

-- Still only reachable through the role-checked blossom_edit_order wrapper.
REVOKE ALL ON FUNCTION public.edit_order_and_items(uuid, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;

-- Failed deliveries: a retry later the same day is a normal outcome, so the
-- rescheduled date only has to be today or later.
CREATE OR REPLACE FUNCTION public.record_delivery_outcome(
  p_order_id uuid,
  p_reason text,
  p_actor text DEFAULT NULL,
  p_new_date date DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
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
  v_actor_name text;
  v_order public.orders%ROWTYPE;
  v_old_order jsonb;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_attempt public.delivery_attempts%ROWTYPE;
  v_event jsonb;
  v_resolution text;
  v_previous_delivery_date date;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active,
    coalesce(nullif(btrim(full_name), ''), nullif(btrim(username), ''), 'Staff')
  INTO v_role, v_active, v_actor_name
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot record delivery outcomes';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'delivery reason is required'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT * INTO v_attempt FROM public.delivery_attempts WHERE request_id = v_request_id;
  IF FOUND THEN
    IF v_attempt.order_id <> p_order_id OR v_attempt.attempted_by <> v_user_id THEN
      RAISE EXCEPTION 'delivery attempt request id is already used';
    END IF;
    RETURN jsonb_build_object('order_id', p_order_id, 'attempt_id', v_attempt.id,
      'resolution', v_attempt.resolution, 'already_recorded', true);
  END IF;
  IF v_order.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'archived orders cannot be updated'; END IF;
  IF v_order.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'completed or cancelled orders cannot be updated';
  END IF;
  IF coalesce(v_order.status, '') NOT IN ('new', 'processing', 'ready') THEN
    RAISE EXCEPTION 'order has no valid status for a delivery outcome';
  END IF;
  IF p_new_date IS NOT NULL THEN
    IF v_order.delivery_method = 'pickup' THEN RAISE EXCEPTION 'pickup orders do not have a delivery date'; END IF;
    IF p_new_date < (now() AT TIME ZONE 'Africa/Algiers')::date THEN
      RAISE EXCEPTION 'new delivery date cannot be in the past';
    END IF;
  END IF;

  v_resolution := CASE WHEN p_new_date IS NULL THEN 'returned_to_shop' ELSE 'rescheduled' END;
  v_previous_delivery_date := v_order.delivery_date;
  IF p_new_date IS NOT NULL THEN
    v_event := jsonb_build_object(
      'delayed_at', now(), 'delayed_by', v_user_id,
      'from_date', v_order.delivery_date, 'to_date', p_new_date,
      'reason', v_reason, 'source', 'failed_delivery',
      'direction', CASE WHEN v_order.delivery_date IS NULL THEN 'set'
        WHEN p_new_date > v_order.delivery_date THEN 'later'
        WHEN p_new_date < v_order.delivery_date THEN 'earlier' ELSE 'same' END
    );
  END IF;

  v_old_order := to_jsonb(v_order);
  -- Insert first so notification handling can collapse the related order
  -- status/date event into this single attempt alert in the same transaction.
  INSERT INTO public.delivery_attempts (
    request_id, order_id, order_number, reason, resolution,
    attempted_by, actor_name, previous_delivery_date, rescheduled_delivery_date
  ) VALUES (
    v_request_id, p_order_id, v_order.order_number::text, v_reason, v_resolution,
    v_user_id, v_actor_name, v_previous_delivery_date, p_new_date
  ) RETURNING * INTO v_attempt;

  UPDATE public.orders SET
    status = 'processing',
    delivery_date = coalesce(p_new_date, delivery_date),
    original_delivery_date = CASE WHEN p_new_date IS NULL
      THEN original_delivery_date ELSE coalesce(original_delivery_date, delivery_date) END,
    delay_reason = CASE WHEN p_new_date IS NULL THEN delay_reason ELSE v_reason END,
    delayed_at = CASE WHEN p_new_date IS NULL THEN delayed_at ELSE now() END,
    delay_history = CASE WHEN p_new_date IS NULL THEN delay_history
      ELSE coalesce(delay_history, '[]'::jsonb) || jsonb_build_array(v_event) END,
    delivery_handed_off_at = NULL,
    delivery_handed_off_by = NULL
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (v_user_id::text, 'delivery_outcome', 'orders', v_old_order, to_jsonb(v_order));

  RETURN jsonb_build_object('order_id', p_order_id, 'attempt_id', v_attempt.id,
    'resolution', v_attempt.resolution, 'already_recorded', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_delivery_outcome(uuid, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_delivery_outcome(uuid, text, text, date, uuid) TO authenticated;

-- Let PostgREST see reschedule_order right away.
NOTIFY pgrst, 'reload schema';
