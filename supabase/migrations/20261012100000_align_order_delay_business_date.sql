-- Keep order-delay validation aligned with Blossom's Africa/Algiers business day.
-- The default also lets authenticated RPC callers omit an optional reason.
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
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_order public.orders%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_event jsonb;
  v_business_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'must be signed in';
  END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot delay orders';
  END IF;

  IF p_order_id IS NULL OR p_delivery_date IS NULL THEN
    RAISE EXCEPTION 'order and new delivery date are required';
  END IF;
  IF length(coalesce(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'delay reason must be 500 characters or fewer';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'completed or cancelled orders cannot be delayed';
  END IF;
  IF v_order.delivery_method = 'pickup' THEN
    RAISE EXCEPTION 'pickup orders do not have a delivery date';
  END IF;
  IF p_delivery_date <= v_business_date THEN
    RAISE EXCEPTION 'new delivery date must be in the future';
  END IF;
  IF v_order.delivery_date IS NOT NULL AND p_delivery_date <= v_order.delivery_date THEN
    RAISE EXCEPTION 'new delivery date must be later than the current date';
  END IF;

  v_reason := coalesce(v_reason, 'Not specified');
  v_event := jsonb_build_object(
    'delayed_at', now(),
    'delayed_by', v_user_id,
    'from_date', v_order.delivery_date,
    'to_date', p_delivery_date,
    'reason', v_reason
  );

  -- Only schedule/audit fields change; status and payment data stay intact.
  UPDATE public.orders
  SET original_delivery_date = coalesce(original_delivery_date, delivery_date),
      delivery_date = p_delivery_date,
      delay_reason = v_reason,
      delayed_at = now(),
      delay_history = coalesce(delay_history, '[]'::jsonb) || jsonb_build_array(v_event)
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.delay_order(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delay_order(uuid, date, text) TO authenticated;
