-- Reopen a previously cancelled order with an explicit target status.
-- Stock is reserved again; completed cancellation cash refunds remain in the
-- register. Non-cash payment state is restored from the pre-void snapshot,
-- since void_order does not create a non-cash refund register entry.
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
  v_original_method text;
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

  -- Cancellation returned the items to inventory. Re-reserve the same stock
  -- atomically. If any product has since sold out, leave the order cancelled.
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

  v_original_method := coalesce(v_old_order->>'payment_method', 'cash');
  IF v_original_method = 'cash' THEN
    -- void_order has already paid cash refunds out. Reopened cash orders need
    -- to be collected again; keep the refund transaction as the audit record.
    v_paid := 0;
    v_due := coalesce(v_order.total_amount, 0);
    v_payment_status := 'unpaid';
  ELSE
    -- The void workflow doesn't create a cash-register refund for these rails.
    v_paid := coalesce(nullif(v_old_order->>'amount_paid', '')::numeric, 0);
    v_due := coalesce(nullif(v_old_order->>'amount_due', '')::numeric, 0);
    v_payment_status := coalesce(nullif(v_old_order->>'payment_status', ''), 'unpaid');
  END IF;

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
