ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_collected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee_payment_method text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_fee_amount_check,
  ADD CONSTRAINT orders_delivery_fee_amount_check CHECK (delivery_fee_amount >= 0),
  DROP CONSTRAINT IF EXISTS orders_delivery_fee_collection_check,
  ADD CONSTRAINT orders_delivery_fee_collection_check CHECK (
    (delivery_fee_collected = false AND delivery_fee_amount = 0)
    OR (delivery_fee_collected = true AND delivery_fee_amount > 0 AND delivery_method <> 'pickup')
  ),
  DROP CONSTRAINT IF EXISTS orders_delivery_fee_payment_method_check,
  ADD CONSTRAINT orders_delivery_fee_payment_method_check CHECK (
    delivery_fee_payment_method IS NULL OR delivery_fee_payment_method IN ('cash', 'baridimob', 'usd')
  );

-- Keep delivery-fee collection atomic with order creation, separate from the
-- product sale total and customer balance. The 3-argument idempotent wrapper
-- delegates here, so request retries cannot collect the fee twice.
CREATE OR REPLACE FUNCTION public.blossom_create_order(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_order jsonb := coalesce(p_order, '{}'::jsonb);
  v_customer jsonb;
  v_customer_id integer;
  v_result jsonb;
  v_saved_order public.orders%ROWTYPE;
  v_order_id uuid;
  v_lat double precision;
  v_lon double precision;
  v_origin_lat double precision;
  v_origin_lon double precision;
  v_origin_name text;
  v_distance numeric(8, 3);
  v_transit_days smallint;
  v_fee_amount integer := 0;
  v_fee_collected boolean := false;
  v_fee_payment_method text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create orders';
  END IF;
  IF jsonb_typeof(v_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(coalesce(p_items, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'invalid order payload';
  END IF;

  IF coalesce(v_order->>'delivery_fee_amount', '0') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'delivery fee must be a whole number of dinars';
  END IF;
  v_fee_amount := coalesce(nullif(v_order->>'delivery_fee_amount', '')::integer, 0);
  v_fee_collected := coalesce((v_order->>'delivery_fee_collected')::boolean, false);
  v_fee_payment_method := lower(coalesce(nullif(v_order->>'delivery_fee_payment_method', ''), 'cash'));
  IF v_fee_amount < 0 OR (v_fee_collected AND (v_fee_amount <= 0 OR coalesce(v_order->>'delivery_method', 'pickup') = 'pickup')) THEN
    RAISE EXCEPTION 'a collected delivery fee needs a positive amount and a delivery order';
  END IF;
  IF v_fee_payment_method NOT IN ('cash', 'baridimob', 'usd') THEN
    RAISE EXCEPTION 'invalid delivery fee payment method';
  END IF;
  IF NOT v_fee_collected THEN v_fee_amount := 0; END IF;

  v_customer := public.blossom_resolve_customer(
    p_full_name => v_order->>'client_name',
    p_phone => v_order->>'client_phone',
    p_customer_id => nullif(v_order->>'customer_id', '')::integer,
    p_customer_source => coalesce(nullif(v_order->>'client_source', ''), 'inhouse')
  );
  IF v_customer IS NOT NULL THEN
    v_customer_id := (v_customer->>'customer_id')::integer;
    v_order := jsonb_set(v_order, '{customer_id}', to_jsonb(v_customer_id), true);
    v_order := jsonb_set(v_order, '{client_name}', to_jsonb(v_customer->>'full_name'), true);
    v_order := jsonb_set(v_order, '{client_phone}', to_jsonb(coalesce(v_customer->>'phone', '')), true);
  ELSIF coalesce(nullif(v_order->>'order_type', ''), 'standard') <> 'quick_sale' THEN
    RAISE EXCEPTION 'Add a phone number or select a customer profile before creating this order';
  END IF;

  v_result := to_jsonb(public.create_order(v_order, p_items));
  v_order_id := nullif(v_result->'order'->>'id', '')::uuid;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'order creation returned no order id'; END IF;

  v_lat := nullif(v_order->>'delivery_latitude', '')::double precision;
  v_lon := nullif(v_order->>'delivery_longitude', '')::double precision;
  v_distance := nullif(v_order->>'shipping_distance_km', '')::numeric;
  IF (v_lat IS NULL) <> (v_lon IS NULL)
     OR (v_lat IS NOT NULL AND (v_lat NOT BETWEEN -90 AND 90 OR v_lon NOT BETWEEN -180 AND 180)) THEN
    RAISE EXCEPTION 'delivery town coordinates are invalid';
  END IF;
  IF v_distance IS NOT NULL AND (v_distance < 0 OR v_distance > 3000) THEN
    RAISE EXCEPTION 'road distance is outside the supported range';
  END IF;

  SELECT shop_latitude, shop_longitude, shop_location_name
  INTO v_origin_lat, v_origin_lon, v_origin_name
  FROM public.settings
  WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_distance IS NOT NULL
     AND (v_lat IS NULL OR v_lon IS NULL OR v_origin_lat IS NULL OR v_origin_lon IS NULL) THEN
    RAISE EXCEPTION 'a saved route requires both the shop and delivery town locations';
  END IF;
  IF v_distance IS NOT NULL THEN
    v_transit_days := CASE WHEN v_distance < 80 THEN 0 WHEN v_distance <= 600 THEN 1 ELSE 2 END;
  END IF;

  UPDATE public.orders
  SET delivery_city = nullif(btrim(v_order->>'delivery_city'), ''),
      delivery_wilaya = nullif(btrim(v_order->>'delivery_wilaya'), ''),
      delivery_latitude = v_lat,
      delivery_longitude = v_lon,
      delivery_origin_name = v_origin_name,
      delivery_origin_latitude = v_origin_lat,
      delivery_origin_longitude = v_origin_lon,
      shipping_distance_km = v_distance,
      shipping_transit_days = v_transit_days,
      shipping_route_calculated_at = CASE WHEN v_distance IS NULL THEN NULL ELSE now() END,
      delivery_fee_amount = v_fee_amount,
      delivery_fee_collected = v_fee_collected,
      delivery_fee_payment_method = CASE WHEN v_fee_collected THEN v_fee_payment_method ELSE NULL END
  WHERE id = v_order_id
  RETURNING * INTO v_saved_order;

  IF v_fee_collected AND NOT EXISTS (
    SELECT 1 FROM public.cash_register
    WHERE order_id = v_order_id AND transaction_type = 'cash_in' AND category = 'Delivery'
  ) THEN
    INSERT INTO public.cash_register (
      transaction_type, amount, description, category,
      register_date, payment_method, order_id, created_by, user_id
    ) VALUES (
      'cash_in', v_fee_amount,
      'Delivery fee collected for Order #' || v_saved_order.order_number,
      'Delivery',
      (now() AT TIME ZONE 'Africa/Algiers')::date,
      v_fee_payment_method, v_order_id, v_user_id, v_user_id
    );
  END IF;

  v_result := jsonb_set(v_result, '{order}', to_jsonb(v_saved_order), true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_order(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blossom_create_order(jsonb, jsonb) TO authenticated;
