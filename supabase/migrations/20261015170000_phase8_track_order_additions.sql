-- Phase 8: record stock withdrawals when products are added to an existing
-- order. Requires Phase 6's stock_adjustments.order_id column.

CREATE OR REPLACE FUNCTION public.add_order_items(
  p_order_id uuid,
  p_request_id uuid,
  p_items jsonb
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
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_product_id text;
  v_quantity integer;
  v_unit_price numeric;
  v_subtotal numeric;
  v_total numeric;
  v_due numeric;
  v_existing_order_id uuid;
  v_added integer := 0;
  v_previous_stock integer;
  v_new_stock integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot edit orders';
  END IF;
  IF p_order_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'order and request id are required';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one cart item is required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'cancelled orders cannot be edited';
  END IF;

  INSERT INTO public.order_item_edit_batches (request_id, order_id)
  VALUES (p_request_id, p_order_id)
  ON CONFLICT (request_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT order_id INTO v_existing_order_id
    FROM public.order_item_edit_batches
    WHERE request_id = p_request_id;
    IF v_existing_order_id IS DISTINCT FROM p_order_id THEN
      RAISE EXCEPTION 'request id was already used for another order';
    END IF;
    RETURN jsonb_build_object('already_processed', true);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := nullif(v_item->>'product_id', '');
    IF coalesce(v_product_id, '') !~ '^[0-9]+$'
       OR coalesce(v_item->>'quantity', '') !~ '^[0-9]+$'
       OR coalesce(v_item->>'unit_price', '') !~ '^[0-9]+([.][0-9]+)?$' THEN
      RAISE EXCEPTION 'cart item has invalid product, quantity, or price';
    END IF;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := round((v_item->>'unit_price')::numeric);
    IF v_quantity < 1 OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'cart item has invalid product, quantity, or price';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE product_id::text = v_product_id AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'a cart product is no longer available'; END IF;
    v_previous_stock := coalesce(v_product.stock_level, 0);

    INSERT INTO public.order_items (
      order_id, product_id, quantity, unit_price, total_price,
      product_name, product_image, color, flower_type, category
    ) VALUES (
      p_order_id,
      v_product.product_id,
      v_quantity,
      v_unit_price,
      v_quantity * v_unit_price,
      v_product.item_name,
      coalesce(v_product.image_url, ''),
      coalesce(v_product.color, ''),
      coalesce(v_product.flower_type, ''),
      coalesce(v_product.category, '')
    );

    UPDATE public.products
    SET stock_level = coalesce(stock_level, 0) - v_quantity
    WHERE product_id = v_product.product_id
    RETURNING stock_level INTO v_new_stock;

    INSERT INTO public.stock_adjustments (
      product_id, adjustment_type, quantity, reason,
      previous_stock, new_stock, created_by, order_id
    ) VALUES (
      v_product.product_id, 'removal', v_quantity,
      'Order #' || v_order.order_number || ' edited',
      v_previous_stock, v_new_stock, v_user_id, p_order_id
    );

    v_added := v_added + 1;
  END LOOP;

  SELECT coalesce(sum(coalesce(total_price, quantity * unit_price)), 0)
  INTO v_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id;

  v_total := greatest(0,
    v_subtotal + coalesce(v_order.price_adjustment, 0) + coalesce(v_order.tax_amount, 0));
  v_due := greatest(0, v_total - coalesce(v_order.amount_paid, 0));

  UPDATE public.orders
  SET subtotal_amount = v_subtotal,
      total_amount = v_total,
      amount_due = v_due,
      payment_status = CASE
        WHEN coalesce(amount_paid, 0) >= v_total THEN 'paid'
        WHEN coalesce(amount_paid, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'already_processed', false,
    'items_added', v_added,
    'subtotal_amount', v_subtotal,
    'total_amount', v_total,
    'amount_due', v_due
  );
END;
$$;

-- Clients call the role-checked edit wrapper, which invokes this function
-- inside the same transaction. Keep direct execution disabled.
REVOKE ALL ON FUNCTION public.add_order_items(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
