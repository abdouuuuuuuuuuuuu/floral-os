-- Reverse a recent order void as one transaction. The void workflow returns
-- reserved stock, writes a cash refund for cash orders, and snapshots the
-- original order in audit_logs. This RPC restores those exact effects.
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

  -- Cancellation returned each product to stock. Re-deduct the same quantities
  -- before reopening, and abort cleanly if any stock has since been sold.
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
