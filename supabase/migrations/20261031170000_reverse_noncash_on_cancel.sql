-- Cancelling a non-cash (BaridiMob/USDT) order used to leave its money in the
-- register: the inner void_order refunds cash out but writes nothing for
-- non-cash rails. The owner wants non-cash reversed out of the register on
-- cancel too, like cash.
--
-- To keep the cancel / undo / reopen trio consistent, all three change:
--   * void   — reverse the net non-cash still in the register (cash already
--               handled by void_order, so it nets to zero here).
--   * undo   — add back exactly the rows the cancel reversed (register-based,
--               so partial payments and delivery fees restore correctly).
--   * reopen — a reopened non-cash order must now be re-collected, like cash.
-- Cash behaviour is unchanged. Earned petals are already reversed by the
-- loyalty trigger when the order becomes 'cancelled'.

-- ─── void: reverse net non-cash out of the register ─────────────────────────
CREATE OR REPLACE FUNCTION public.blossom_void_order(p_order_id uuid, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_order_number text;
  v_today date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_row record;
  v_src_date date;
  v_target date;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'only an active owner or manager can void orders';
  END IF;
  IF p_order_id IS NULL OR length(btrim(coalesce(p_reason, ''))) > 500 THEN
    RAISE EXCEPTION 'order id is required and reason must be 500 characters or fewer';
  END IF;

  PERFORM public.void_order(p_order_id, coalesce(nullif(btrim(p_reason), ''), 'Voided from Blossom'));

  SELECT order_number INTO v_order_number FROM public.orders WHERE id = p_order_id;

  FOR v_row IN
    SELECT payment_method,
      sum(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE -amount END) AS net
    FROM public.cash_register
    WHERE order_id = p_order_id
      AND transaction_type IN ('cash_in', 'cash_out')
      AND coalesce(payment_method, 'cash') <> 'cash'
      AND coalesce(category, '') <> 'Cancelled order reversal'
    GROUP BY payment_method
    HAVING sum(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE -amount END) > 0
  LOOP
    SELECT max(register_date) INTO v_src_date
    FROM public.cash_register
    WHERE order_id = p_order_id
      AND coalesce(payment_method, '') = coalesce(v_row.payment_method, '')
      AND transaction_type IN ('cash_in', 'cash_out')
      AND coalesce(category, '') <> 'Cancelled order reversal';

    v_target := CASE
      WHEN EXISTS (SELECT 1 FROM public.cash_register c
                   WHERE c.register_date = v_src_date AND c.transaction_type = 'closing')
      THEN v_today ELSE v_src_date END;

    INSERT INTO public.cash_register (
      transaction_type, amount, description, category, payment_method,
      register_date, user_id, created_by, order_id
    ) VALUES (
      'cash_out', v_row.net,
      format('Cancelled Order #%s — %s reversed from %s', v_order_number, v_row.payment_method, v_src_date),
      'Cancelled order reversal', v_row.payment_method,
      v_target, v_user_id, v_user_id, p_order_id
    );
  END LOOP;

  RETURN jsonb_build_object('voided', true, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_void_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_void_order(uuid, text) TO authenticated;

-- ─── undo: restore cash (as before) and the reversed non-cash rows ──────────
CREATE OR REPLACE FUNCTION public.blossom_restore_voided_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_order public.orders%ROWTYPE;
  v_old_order jsonb;
  v_item record;
  v_rev record;
  v_stock integer;
  v_original_status text;
  v_original_paid numeric;
  v_original_due numeric;
  v_original_payment_status text;
  v_refund numeric;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_actor AND coalesce(is_active, true);
  IF coalesce(v_role, '') NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'only an owner or manager can undo an order cancellation';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'cancelled' OR v_order.voided_at IS NULL THEN
    RAISE EXCEPTION 'order is not cancelled';
  END IF;
  IF v_order.voided_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'the undo window has expired';
  END IF;

  SELECT old_value INTO v_old_order
  FROM public.audit_logs
  WHERE action_taken = 'void_order'
    AND target_table = 'orders'
    AND old_value->>'id' = p_order_id::text
  ORDER BY logged_at DESC, log_id DESC
  LIMIT 1;
  IF v_old_order IS NULL THEN
    RAISE EXCEPTION 'original order details for this cancellation were not found';
  END IF;

  v_original_status := v_old_order->>'status';
  v_original_paid := coalesce(nullif(v_old_order->>'amount_paid', '')::numeric, 0);
  v_original_due := coalesce(nullif(v_old_order->>'amount_due', '')::numeric, 0);
  v_original_payment_status := coalesce(nullif(v_old_order->>'payment_status', ''), 'unpaid');
  IF v_original_status IS NULL OR v_original_status = 'cancelled' THEN
    RAISE EXCEPTION 'saved order status is invalid';
  END IF;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    SELECT stock_level INTO v_stock
    FROM public.products
    WHERE product_id = v_item.product_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'an order product no longer exists'; END IF;
    IF coalesce(v_stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'not enough stock to reopen this order';
    END IF;
    UPDATE public.products
    SET stock_level = coalesce(stock_level, 0) - v_item.quantity
    WHERE product_id = v_item.product_id
    RETURNING stock_level INTO v_stock;
    INSERT INTO public.stock_adjustments (
      product_id, adjustment_type, quantity, reason,
      previous_stock, new_stock, created_by
    ) VALUES (
      v_item.product_id, 'removal', v_item.quantity,
      'Undo cancellation - Order #' || v_order.order_number,
      v_stock + v_item.quantity, v_stock, v_actor
    );
  END LOOP;

  -- The void RPC wrote a cash_out refund for cash payments. Reverse that entry
  -- with a linked cash_in; non-cash voids wrote no cash-register refund row.
  v_refund := coalesce(nullif(v_old_order->>'amount_paid', '')::numeric, 0);
  IF v_refund > 0 AND coalesce(v_old_order->>'payment_method', 'cash') = 'cash' THEN
    INSERT INTO public.cash_register (
      transaction_type, amount, description, category,
      register_date, payment_method, order_id, created_by, user_id
    ) VALUES (
      'cash_in', v_refund,
      'Undo void refund - Order #' || v_order.order_number,
      'Payment', current_date, 'cash', p_order_id, v_actor, v_actor
    );
  END IF;

  -- Put back the non-cash amounts the cancellation reversed out, row for row.
  FOR v_rev IN
    SELECT amount, payment_method
    FROM public.cash_register
    WHERE order_id = p_order_id AND category = 'Cancelled order reversal'
  LOOP
    INSERT INTO public.cash_register (
      transaction_type, amount, description, category,
      register_date, payment_method, order_id, created_by, user_id
    ) VALUES (
      'cash_in', v_rev.amount,
      'Undo cancellation reversal - Order #' || v_order.order_number,
      'Payment', current_date, v_rev.payment_method, p_order_id, v_actor, v_actor
    );
  END LOOP;

  UPDATE public.orders
  SET status = v_original_status,
      payment_status = v_original_payment_status,
      amount_paid = v_original_paid,
      amount_due = v_original_due,
      voided_at = NULL,
      voided_by = NULL,
      void_reason = NULL
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_actor::text, 'undo_void_order', 'orders', to_jsonb(v_order),
    jsonb_build_object('order_number', v_order.order_number, 'restored_status', v_original_status)
  );

  RETURN jsonb_build_object('restored', true, 'order_number', v_order.order_number, 'status', v_original_status);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_restore_voided_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_restore_voided_order(uuid) TO authenticated;

-- ─── reopen: a reopened order is now always re-collected ────────────────────
CREATE OR REPLACE FUNCTION public.blossom_reopen_voided_order(
  p_order_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_order public.orders%ROWTYPE;
  v_old_order jsonb;
  v_item record;
  v_stock integer;
  v_paid numeric;
  v_due numeric;
  v_payment_status text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_actor AND coalesce(is_active, true);
  IF coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot reopen orders';
  END IF;
  IF p_order_id IS NULL OR p_status NOT IN ('new', 'processing', 'done') THEN
    RAISE EXCEPTION 'invalid reopened order status';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'cancelled' OR v_order.voided_at IS NULL THEN
    RAISE EXCEPTION 'order is not cancelled';
  END IF;

  SELECT old_value INTO v_old_order
  FROM public.audit_logs
  WHERE action_taken = 'void_order'
    AND target_table = 'orders'
    AND old_value->>'id' = p_order_id::text
  ORDER BY logged_at DESC, log_id DESC
  LIMIT 1;
  IF v_old_order IS NULL THEN
    RAISE EXCEPTION 'original order details for this cancellation were not found';
  END IF;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    SELECT stock_level INTO v_stock
    FROM public.products
    WHERE product_id = v_item.product_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'an order product no longer exists'; END IF;
    IF coalesce(v_stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'not enough stock to reopen this order';
    END IF;
    UPDATE public.products
    SET stock_level = coalesce(stock_level, 0) - v_item.quantity
    WHERE product_id = v_item.product_id
    RETURNING stock_level INTO v_stock;
    INSERT INTO public.stock_adjustments (
      product_id, adjustment_type, quantity, reason,
      previous_stock, new_stock, created_by
    ) VALUES (
      v_item.product_id, 'removal', v_item.quantity,
      'Order #' || v_order.order_number || ' reopened',
      v_stock + v_item.quantity, v_stock, v_actor
    );
  END LOOP;

  -- Cancellation reversed the money out of the register for every rail (cash
  -- via void_order, non-cash via blossom_void_order). A reopened order must be
  -- collected again regardless of payment method.
  v_paid := 0;
  v_due := coalesce(v_order.total_amount, 0);
  v_payment_status := 'unpaid';

  UPDATE public.orders
  SET status = p_status,
      payment_status = v_payment_status,
      amount_paid = v_paid,
      amount_due = v_due,
      voided_at = NULL,
      voided_by = NULL,
      void_reason = NULL
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_actor::text, 'reopen_order', 'orders', to_jsonb(v_order),
    jsonb_build_object('order_number', v_order.order_number, 'status', p_status)
  );

  RETURN jsonb_build_object(
    'reopened', true,
    'order_number', v_order.order_number,
    'status', p_status,
    'payment_status', v_payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_reopen_voided_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_reopen_voided_order(uuid, text) TO authenticated;
