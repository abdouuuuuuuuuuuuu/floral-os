-- Phase 1: prevent collecting or refunding payments on cancelled orders.
-- Reopening must happen first through blossom_reopen_voided_order.


CREATE OR REPLACE FUNCTION public.record_order_payment(
  p_order_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT '',
  p_action text DEFAULT 'payment'
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
  v_method text := lower(coalesce(p_payment_method, 'cash'));
  v_action text := lower(coalesce(p_action, 'payment'));
  v_requested integer := round(p_amount)::integer;
  v_applied integer;
  v_new_paid integer;
  v_new_due integer;
  v_new_status text;
  v_type text;
  v_category text;
  v_description text;
  v_after_hours boolean := false;
  v_fingerprint text;
  v_existing public.order_payment_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) THEN RAISE EXCEPTION 'account is not active'; END IF;
  IF v_action = 'payment' AND coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot record order payments';
  ELSIF v_action = 'refund' AND coalesce(v_role, '') NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'role cannot refund order payments';
  ELSIF v_action NOT IN ('payment', 'refund') THEN
    RAISE EXCEPTION 'invalid payment action';
  END IF;
  IF p_order_id IS NULL OR p_request_id IS NULL OR p_amount IS NULL OR v_requested <= 0 THEN
    RAISE EXCEPTION 'order, request id, and positive amount are required';
  END IF;
  IF v_method NOT IN ('cash', 'baridimob', 'usd') THEN RAISE EXCEPTION 'invalid payment method'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.cash_register_after_hours_orders WHERE order_id = p_order_id)
  INTO v_after_hours;

  v_fingerprint := md5(concat_ws('|', p_order_id::text, v_action, v_requested::text, v_method, coalesce(p_notes, '')));
  INSERT INTO public.order_payment_requests(request_id, order_id, request_fingerprint)
  VALUES (p_request_id, p_order_id, v_fingerprint)
  ON CONFLICT (request_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.order_payment_requests WHERE request_id = p_request_id;
    IF v_existing.order_id <> p_order_id OR v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for a different payment';
    END IF;
    RETURN coalesce(v_existing.result, jsonb_build_object('already_processed', true));
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'payments cannot be recorded on a cancelled order';
  END IF;

  IF v_action = 'payment' THEN
    v_applied := least(v_requested, greatest(0, coalesce(v_order.total_amount, 0) - coalesce(v_order.amount_paid, 0)));
    IF v_applied <= 0 THEN RAISE EXCEPTION 'order is already fully paid'; END IF;
    v_new_paid := coalesce(v_order.amount_paid, 0) + v_applied;
    v_new_due := greatest(0, coalesce(v_order.total_amount, 0) - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'paid' ELSE 'partial' END;
    v_type := 'cash_in';
    v_category := CASE WHEN v_after_hours THEN 'After-hours Orders' ELSE 'Sales' END;
    v_description := CASE WHEN v_new_due = 0 THEN 'Balance paid' ELSE 'Partial payment' END;
  ELSE
    IF v_requested > coalesce(v_order.amount_paid, 0) THEN RAISE EXCEPTION 'refund exceeds the amount paid'; END IF;
    v_applied := v_requested;
    v_new_paid := greatest(0, coalesce(v_order.amount_paid, 0) - v_applied);
    v_new_due := greatest(0, coalesce(v_order.total_amount, 0) - v_new_paid);
    v_new_status := CASE
      WHEN v_new_paid = 0 THEN 'refunded'
      WHEN v_new_paid >= coalesce(v_order.total_amount, 0) THEN 'paid'
      ELSE 'partial'
    END;
    v_type := 'cash_out';
    v_category := 'Refund';
    v_description := 'Refund';
  END IF;

  UPDATE public.orders
  SET payment_status = v_new_status,
      amount_paid = v_new_paid,
      amount_due = v_new_due,
      payment_notes = left(coalesce(p_notes, ''), 500)
  WHERE id = p_order_id;

  INSERT INTO public.cash_register (
    transaction_type, amount, description, category, payment_method,
    register_date, user_id, order_id
  ) VALUES (
    v_type, v_applied,
    left(format('%s — Order #%s%s', v_description, v_order.order_number,
      CASE WHEN nullif(btrim(coalesce(p_notes, '')), '') IS NOT NULL THEN ' · ' || btrim(p_notes) ELSE '' END), 500),
    v_category, v_method, (now() AT TIME ZONE 'Africa/Algiers')::date, v_user_id, p_order_id
  );

  v_result := jsonb_build_object(
    'already_processed', false,
    'order_id', p_order_id,
    'amount', v_applied,
    'amount_paid', v_new_paid,
    'amount_due', v_new_due,
    'payment_status', v_new_status
  );
  UPDATE public.order_payment_requests SET result = v_result WHERE request_id = p_request_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_payment(uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid, uuid, numeric, text, text, text) TO authenticated;

