-- Keep order edits, payment state, and cash movements in one Postgres
-- transaction. The existing edit routines remain the source of stock logic;
-- this wrapper makes their changes atomic from the client.

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

  -- Editing an order to a later delivery date is a delay. Preserve the delay
  -- history in the same transaction as the rest of the edit.
  IF nullif(v_order_data->>'delivery_date', '') IS NOT NULL THEN
    v_requested_delivery_date := (v_order_data->>'delivery_date')::date;
    IF v_order.delivery_date IS NOT NULL AND v_requested_delivery_date > v_order.delivery_date THEN
      PERFORM public.delay_order(
        p_order_id,
        v_requested_delivery_date,
        coalesce(nullif(btrim(v_order_data->>'delay_reason'), ''), 'Rescheduled from order edit')
      );
      v_order_data := v_order_data - 'delivery_date' - 'delay_reason';
    END IF;
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

REVOKE ALL ON FUNCTION public.edit_order_and_items(uuid, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_order_and_items(uuid, jsonb, jsonb, jsonb, uuid, text) TO authenticated;

-- Request keys make a retried payment safe after a lost network response.
CREATE TABLE IF NOT EXISTS public.order_payment_requests (
  request_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  request_fingerprint text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.order_payment_requests FROM PUBLIC, anon, authenticated;
ALTER TABLE public.order_payment_requests ENABLE ROW LEVEL SECURITY;

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

-- Enforce one opening and one closing record per local register day even if
-- two clients submit simultaneously. The old opening routine still checks
-- first, but the unique index closes the race at the database boundary.
CREATE UNIQUE INDEX IF NOT EXISTS cash_register_one_opening_per_day
  ON public.cash_register(register_date) WHERE transaction_type = 'opening';
CREATE UNIQUE INDEX IF NOT EXISTS cash_register_one_closing_per_day
  ON public.cash_register(register_date) WHERE transaction_type = 'closing';

CREATE OR REPLACE FUNCTION public.close_cash_register(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_amount integer;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can close the cash register';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'closing balance cannot be negative'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cash-register-closing'), v_date - DATE '2000-01-01');
  IF NOT EXISTS (SELECT 1 FROM public.cash_register WHERE register_date = v_date AND transaction_type = 'opening') THEN
    RAISE EXCEPTION 'set today’s opening balance before closing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_register WHERE register_date = v_date AND transaction_type = 'closing') THEN
    RAISE EXCEPTION 'cash register is already closed for today';
  END IF;
  v_amount := round(p_amount)::integer;
  INSERT INTO public.cash_register(transaction_type, amount, description, category, register_date, user_id)
  VALUES ('closing', v_amount, 'Closing balance', 'Closing', v_date, v_user_id)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('closing_transaction_id', v_id, 'register_date', v_date, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_register(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_register(numeric) TO authenticated;

-- The drawer is owner-only; return the after-hours list through a narrow
-- function because the tracking table itself is intentionally private.
CREATE OR REPLACE FUNCTION public.list_after_hours_orders(p_register_date date DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_date date := coalesce(p_register_date, (now() AT TIME ZONE 'Africa/Algiers')::date);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can view after-hours orders';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'client_name', o.client_name,
    'client_phone', o.client_phone, 'created_at', o.created_at,
    'delivery_date', o.delivery_date, 'delivery_time', o.delivery_time,
    'delivery_method', o.delivery_method, 'total_amount', o.total_amount,
    'amount_paid', o.amount_paid, 'amount_due', o.amount_due,
    'payment_status', o.payment_status, 'payment_method', o.payment_method,
    'notes', o.notes, 'processed_at', q.processed_at,
    'order_items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'product_name', i.product_name,
        'quantity', i.quantity, 'unit_price', i.unit_price
      ) ORDER BY i.product_name)
      FROM public.order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.cash_register_after_hours_orders q
  JOIN public.orders o ON o.id = q.order_id
  WHERE (q.closed_register_date = v_date AND q.processed_at IS NULL)
     OR q.processed_register_date = v_date
  ORDER BY q.captured_at, q.order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_after_hours_orders(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_after_hours_orders(date) TO authenticated;

-- Record a failed delivery and optional reschedule as one audited update.
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
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_event jsonb;
  v_note text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot record delivery outcomes';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'delivery reason is required'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status IN ('done', 'cancelled') THEN RAISE EXCEPTION 'completed or cancelled orders cannot be updated'; END IF;
  IF p_new_date IS NOT NULL THEN
    IF v_order.delivery_method = 'pickup' THEN RAISE EXCEPTION 'pickup orders do not have a delivery date'; END IF;
    IF p_new_date <= (now() AT TIME ZONE 'Africa/Algiers')::date THEN RAISE EXCEPTION 'new delivery date must be in the future'; END IF;
    IF v_order.delivery_date IS NOT NULL AND p_new_date <= v_order.delivery_date THEN RAISE EXCEPTION 'new delivery date must be later than the current date'; END IF;
  END IF;

  v_note := format('[Delivery attempt %s%s] %s. %s.',
    to_char(now() AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD HH24:MI'),
    CASE WHEN nullif(btrim(coalesce(p_actor, '')), '') IS NULL THEN '' ELSE ' by ' || left(btrim(p_actor), 100) END,
    v_reason,
    CASE WHEN p_new_date IS NULL THEN 'Returned to shop; delivery remains unresolved' ELSE 'Rescheduled to ' || p_new_date::text END);

  IF p_new_date IS NOT NULL THEN
    v_event := jsonb_build_object('delayed_at', now(), 'delayed_by', v_user_id,
      'from_date', v_order.delivery_date, 'to_date', p_new_date, 'reason', v_reason, 'source', 'failed_delivery');
  END IF;

  UPDATE public.orders SET
    status = 'processing',
    notes = concat_ws(E'\n', nullif(btrim(coalesce(v_order.notes, '')), ''), v_note),
    delivery_date = coalesce(p_new_date, delivery_date),
    original_delivery_date = CASE WHEN p_new_date IS NULL THEN original_delivery_date ELSE coalesce(original_delivery_date, delivery_date) END,
    delay_reason = CASE WHEN p_new_date IS NULL THEN delay_reason ELSE v_reason END,
    delayed_at = CASE WHEN p_new_date IS NULL THEN delayed_at ELSE now() END,
    delay_history = CASE WHEN p_new_date IS NULL THEN delay_history ELSE coalesce(delay_history, '[]'::jsonb) || jsonb_build_array(v_event) END
  WHERE id = p_order_id
  RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.record_delivery_outcome(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_delivery_outcome(uuid, text, text, date) TO authenticated;
