-- Phase 1: validate order lines and derive financial fields in Postgres.
-- Staff may still enter negotiated unit prices; any price differing from the
-- current catalog price is included in the order creation audit event.
CREATE OR REPLACE FUNCTION public.create_order(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_order_number text;
  v_order_seq bigint;
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_quantity integer;
  v_unit_price integer;
  v_catalog_price numeric;
  v_new_stock integer;
  v_payment text;
  v_order_type text;
  v_status text;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_adjustment numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_payment_status text;
  v_price_overrides jsonb := '[]'::jsonb;
  v_low_stock jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create an order' USING errcode = '28000';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_actor AND coalesce(is_active, true);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Your account is not active' USING errcode = '28000';
  END IF;
  IF v_role NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'Your role cannot create orders' USING errcode = '42501';
  END IF;

  IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot create an order without valid order details and items';
  END IF;

  -- Validate and lock every catalog product before creating the order. Prices
  -- remain overrideable for staff, but must be whole, nonnegative amounts.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR coalesce(v_item->>'product_id', '') !~ '^[0-9]+$'
       OR coalesce(v_item->>'quantity', '') !~ '^[0-9]+$'
       OR coalesce(v_item->>'unit_price', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Each order item needs a valid product, positive quantity, and nonnegative whole-unit price';
    END IF;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::integer;
    IF v_quantity <= 0 OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Each order item needs a positive quantity and nonnegative price';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE product_id = (v_item->>'product_id')::integer
      AND coalesce(is_active, false) = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is missing or inactive', v_item->>'product_id';
    END IF;

    v_catalog_price := round(coalesce(v_product.retail_price, 0));
    IF v_unit_price <> v_catalog_price THEN
      v_price_overrides := v_price_overrides || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.product_id,
        'product_name', v_product.item_name,
        'catalog_unit_price', v_catalog_price,
        'charged_unit_price', v_unit_price,
        'quantity', v_quantity
      ));
    END IF;
    v_subtotal := v_subtotal + v_quantity::numeric * v_unit_price::numeric;
  END LOOP;

  IF coalesce(p_order->>'tax_amount', '0') !~ '^[0-9]+$'
     OR coalesce(p_order->>'price_adjustment', '0') !~ '^-?[0-9]+$'
     OR coalesce(p_order->>'amount_paid', '0') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Tax, adjustment, or payment amount is invalid';
  END IF;
  v_tax := coalesce(nullif(p_order->>'tax_amount', '')::numeric, 0);
  v_adjustment := coalesce(nullif(p_order->>'price_adjustment', '')::numeric, 0);
  v_paid := coalesce(nullif(p_order->>'amount_paid', '')::numeric, 0);
  v_total := greatest(0, v_subtotal + v_tax + v_adjustment);
  IF v_paid > v_total THEN
    RAISE EXCEPTION 'Amount collected cannot exceed the order total';
  END IF;
  v_due := v_total - v_paid;
  v_payment_status := CASE
    WHEN v_due = 0 THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  v_order_type := coalesce(nullif(p_order->>'order_type', ''), 'standard');
  IF v_order_type NOT IN ('standard', 'quick_sale') THEN
    RAISE EXCEPTION 'Invalid order type';
  END IF;
  v_status := CASE WHEN v_order_type = 'quick_sale' THEN 'done' ELSE 'new' END;
  IF nullif(p_order->>'status', '') IS NOT NULL
     AND p_order->>'status' <> v_status THEN
    RAISE EXCEPTION 'New orders must use their workflow default status';
  END IF;

  v_payment := lower(coalesce(nullif(p_order->>'payment_method', ''), 'cash'));
  IF v_payment NOT IN ('cash', 'baridimob', 'usd') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  v_order_seq := nextval('public.order_number_seq');
  v_order_number := lpad(v_order_seq::text, greatest(3, length(v_order_seq::text)), '0');

  INSERT INTO public.orders (
    order_number, client_name, client_phone, customer_id,
    delivery_date, delivery_time, delivery_method,
    payment_method, client_source, status, notes, order_type,
    subtotal_amount, tax_amount, total_amount, price_adjustment,
    amount_paid, amount_due, payment_status, payment_notes,
    created_by, cashier_id
  ) VALUES (
    v_order_number,
    coalesce(nullif(btrim(p_order->>'client_name'), ''), 'Walk-in Customer'),
    nullif(p_order->>'client_phone', ''),
    (nullif(p_order->>'customer_id', ''))::integer,
    (nullif(p_order->>'delivery_date', ''))::date,
    (nullif(p_order->>'delivery_time', ''))::time,
    coalesce(nullif(p_order->>'delivery_method', ''), 'pickup'),
    v_payment,
    coalesce(nullif(p_order->>'client_source', ''), 'inhouse'),
    v_status,
    nullif(p_order->>'notes', ''),
    v_order_type,
    v_subtotal::integer,
    v_tax::integer,
    v_total::integer,
    v_adjustment,
    v_paid::integer,
    v_due::integer,
    v_payment_status,
    nullif(p_order->>'payment_notes', ''),
    v_actor,
    v_actor
  ) RETURNING * INTO v_order;

  INSERT INTO public.order_items (
    order_id, product_id, quantity, unit_price, total_price,
    product_name, product_image, color, flower_type, category
  )
  SELECT v_order.id,
         p.product_id,
         (i->>'quantity')::integer,
         (i->>'unit_price')::integer,
         ((i->>'quantity')::integer * (i->>'unit_price')::integer),
         p.item_name,
         coalesce(p.image_url, ''),
         p.color,
         p.flower_type,
         p.category
  FROM jsonb_array_elements(p_items) AS input(i)
  JOIN public.products p ON p.product_id = (i->>'product_id')::integer;

  -- Preserve the existing oversell workflow: the order is accepted and the
  -- warning is returned, while zero/negative quantities are rejected above.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.products
    SET stock_level = coalesce(stock_level, 0) - (v_item->>'quantity')::integer
    WHERE product_id = (v_item->>'product_id')::integer
    RETURNING stock_level INTO v_new_stock;
    IF v_new_stock < 0 THEN
      v_low_stock := v_low_stock || jsonb_build_array(jsonb_build_object(
        'product_id', (v_item->>'product_id')::integer,
        'product_name', (SELECT item_name FROM public.products WHERE product_id = (v_item->>'product_id')::integer),
        'stock_level', v_new_stock
      ));
    END IF;
  END LOOP;

  IF v_paid > 0 THEN
    INSERT INTO public.cash_register (
      transaction_type, amount, description, category,
      register_date, payment_method, order_id, created_by, user_id
    ) VALUES (
      'cash_in', v_paid::integer,
      'Sale #' || v_order_number || ' — ' || coalesce(v_order.client_name, 'Walk-in'),
      'sale',
      (now() AT TIME ZONE 'Africa/Algiers')::date,
      v_payment, v_order.id, v_actor, v_actor
    );
  END IF;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, new_value)
  VALUES (
    v_actor::text,
    'create_order',
    'orders',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order_number,
      'total_amount', v_order.total_amount,
      'item_count', jsonb_array_length(p_items),
      'price_overrides', v_price_overrides
    )
  );

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'warnings', jsonb_build_object('negative_stock', v_low_stock)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
