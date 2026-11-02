-- lpad(text, 3, '0') truncates values longer than 3 characters in Postgres.
-- Preserve the existing 3-digit padding, but increase the width as needed.
CREATE OR REPLACE FUNCTION public.create_order(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_role         text;
  v_order_number text;
  v_order_seq    bigint;
  v_order        public.orders;
  v_item         jsonb;
  v_new_stock    int;
  v_product_name text;
  v_amount_paid  int;
  v_payment      text;
  v_low_stock    jsonb := '[]'::jsonb;
BEGIN
  -- Authorisation
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create an order'
      USING errcode = '28000';
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

  -- Validation
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot create an order with no items';
  END IF;

  -- Order number: LPAD truncates strings longer than its requested width.
  v_order_seq := nextval('public.order_number_seq');
  v_order_number := lpad(v_order_seq::text, greatest(3, length(v_order_seq::text)), '0');

  -- Header
  INSERT INTO public.orders (
    order_number, client_name, client_phone, customer_id,
    delivery_date, delivery_time, delivery_method,
    payment_method, client_source, status, notes, order_type,
    subtotal_amount, tax_amount, total_amount, price_adjustment,
    amount_paid, amount_due, payment_status, payment_notes,
    created_by, cashier_id
  )
  VALUES (
    v_order_number,
    coalesce(p_order->>'client_name', 'Walk-in Customer'),
    nullif(p_order->>'client_phone', ''),
    (p_order->>'customer_id')::int,
    (nullif(p_order->>'delivery_date', ''))::date,
    (nullif(p_order->>'delivery_time', ''))::time,
    coalesce(p_order->>'delivery_method', 'pickup'),
    coalesce(p_order->>'payment_method', 'cash'),
    coalesce(p_order->>'client_source', 'inhouse'),
    coalesce(p_order->>'status', 'new'),
    nullif(p_order->>'notes', ''),
    coalesce(p_order->>'order_type', 'standard'),
    coalesce((p_order->>'subtotal_amount')::int, 0),
    coalesce((p_order->>'tax_amount')::int, 0),
    coalesce((p_order->>'total_amount')::int, 0),
    coalesce((p_order->>'price_adjustment')::numeric, 0),
    coalesce((p_order->>'amount_paid')::int, 0),
    coalesce((p_order->>'amount_due')::int, 0),
    coalesce(p_order->>'payment_status', 'unpaid'),
    nullif(p_order->>'payment_notes', ''),
    v_actor,
    v_actor
  )
  RETURNING * INTO v_order;

  -- Line items
  INSERT INTO public.order_items (
    order_id, product_id, quantity, unit_price, total_price,
    product_name, product_image, color, flower_type, category
  )
  SELECT
    v_order.id,
    (i->>'product_id')::int,
    (i->>'quantity')::int,
    (i->>'unit_price')::int,
    (i->>'total_price')::int,
    nullif(i->>'product_name', ''),
    nullif(i->>'product_image', ''),
    nullif(i->>'color', ''),
    nullif(i->>'flower_type', ''),
    nullif(i->>'category', '')
  FROM jsonb_array_elements(p_items) AS i;

  -- Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.products
    SET stock_level = stock_level - (v_item->>'quantity')::int
    WHERE product_id = (v_item->>'product_id')::int
    RETURNING stock_level, item_name INTO v_new_stock, v_product_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % no longer exists', v_item->>'product_id';
    END IF;

    IF v_new_stock < 0 THEN
      v_low_stock := v_low_stock || jsonb_build_object(
        'product_id', (v_item->>'product_id')::int,
        'product_name', v_product_name,
        'stock_level', v_new_stock
      );
    END IF;
  END LOOP;

  -- All payment methods write to cash_register, matching the current function.
  v_amount_paid := coalesce((p_order->>'amount_paid')::int, 0);
  v_payment := coalesce(p_order->>'payment_method', 'cash');

  IF v_amount_paid > 0 THEN
    INSERT INTO public.cash_register (
      transaction_type, amount, description, category,
      register_date, payment_method, order_id, created_by, user_id
    )
    VALUES (
      'cash_in',
      v_amount_paid,
      'Sale #' || v_order_number || ' — ' || coalesce(v_order.client_name, 'Walk-in'),
      'sale',
      current_date,
      v_payment,
      v_order.id,
      v_actor,
      v_actor
    );
  END IF;

  -- Audit
  INSERT INTO public.audit_logs (
    performed_by, action_taken, target_table, new_value
  )
  VALUES (
    v_actor::text,
    'create_order',
    'orders',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order_number,
      'total_amount', v_order.total_amount,
      'item_count', jsonb_array_length(p_items)
    )
  );

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'warnings', jsonb_build_object('negative_stock', v_low_stock)
  );
END;
$function$;
