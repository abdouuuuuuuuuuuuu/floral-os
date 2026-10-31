-- Store town-level locations and a road-distance snapshot for dispatch planning.
-- The app supplies the road route distance from its configured OSRM-compatible
-- provider; transit bands are always calculated here from the saved distance.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS shop_location_name text,
  ADD COLUMN IF NOT EXISTS shop_location_wilaya text,
  ADD COLUMN IF NOT EXISTS shop_latitude double precision,
  ADD COLUMN IF NOT EXISTS shop_longitude double precision,
  ADD COLUMN IF NOT EXISTS routing_service_url text;

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_shop_map_coordinates_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_shop_map_coordinates_check
    CHECK (
      (shop_latitude IS NULL AND shop_longitude IS NULL)
      OR (
        shop_latitude IS NOT NULL AND shop_longitude IS NOT NULL
        AND shop_latitude BETWEEN -90 AND 90
        AND shop_longitude BETWEEN -180 AND 180
      )
    );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_wilaya text,
  ADD COLUMN IF NOT EXISTS delivery_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_longitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_origin_name text,
  ADD COLUMN IF NOT EXISTS delivery_origin_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_origin_longitude double precision,
  ADD COLUMN IF NOT EXISTS shipping_distance_km numeric(8, 3),
  ADD COLUMN IF NOT EXISTS shipping_transit_days smallint,
  ADD COLUMN IF NOT EXISTS shipping_route_calculated_at timestamptz;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_shipping_transit_days_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shipping_transit_days_check
    CHECK (shipping_transit_days IS NULL OR shipping_transit_days BETWEEN 0 AND 2);
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_shipping_distance_nonnegative_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shipping_distance_nonnegative_check
    CHECK (shipping_distance_km IS NULL OR shipping_distance_km >= 0);
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_coordinates_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_coordinates_check
    CHECK (
      (delivery_latitude IS NULL AND delivery_longitude IS NULL)
      OR (
        delivery_latitude IS NOT NULL AND delivery_longitude IS NOT NULL
        AND delivery_latitude BETWEEN -90 AND 90
        AND delivery_longitude BETWEEN -180 AND 180
      )
    );
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_shipping_band_matches_distance_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shipping_band_matches_distance_check
    CHECK (
      (shipping_distance_km IS NULL AND shipping_transit_days IS NULL)
      OR (
        shipping_distance_km IS NOT NULL
        AND shipping_transit_days = CASE
          WHEN shipping_distance_km < 80 THEN 0
          WHEN shipping_distance_km <= 600 THEN 1
          ELSE 2
        END
      )
    );

CREATE INDEX IF NOT EXISTS orders_dispatch_queue_idx
  ON public.orders (delivery_date, status)
  WHERE deleted_at IS NULL AND delivery_method <> 'pickup';

-- Keep the existing phone-based customer linking and order-creation workflow,
-- then attach delivery geography to the order in the same transaction.
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
      shipping_route_calculated_at = CASE WHEN v_distance IS NULL THEN NULL ELSE now() END
  WHERE id = v_order_id
  RETURNING * INTO v_saved_order;

  v_result := jsonb_set(v_result, '{order}', to_jsonb(v_saved_order), true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_order(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blossom_create_order(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.blossom_set_order_shipping_route(
  p_order_id uuid,
  p_delivery_city text,
  p_delivery_wilaya text,
  p_delivery_latitude double precision,
  p_delivery_longitude double precision,
  p_shipping_distance_km numeric
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
  v_origin_lat double precision;
  v_origin_lon double precision;
  v_origin_name text;
  v_transit_days smallint;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot update delivery route';
  END IF;
  IF p_delivery_latitude IS NULL OR p_delivery_longitude IS NULL
     OR p_delivery_latitude NOT BETWEEN -90 AND 90 OR p_delivery_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'delivery town coordinates are invalid';
  END IF;
  IF p_shipping_distance_km IS NULL OR p_shipping_distance_km < 0 OR p_shipping_distance_km > 3000 THEN
    RAISE EXCEPTION 'road distance is outside the supported range';
  END IF;
  IF nullif(btrim(coalesce(p_delivery_city, '')), '') IS NULL THEN
    RAISE EXCEPTION 'select a delivery town before saving its route';
  END IF;

  SELECT shop_latitude, shop_longitude, shop_location_name
  INTO v_origin_lat, v_origin_lon, v_origin_name
  FROM public.settings
  WHERE id = '00000000-0000-0000-0000-000000000001';
  IF v_origin_lat IS NULL OR v_origin_lon IS NULL THEN
    RAISE EXCEPTION 'set the shop location in Settings before calculating dispatch dates';
  END IF;

  v_transit_days := CASE WHEN p_shipping_distance_km < 80 THEN 0 WHEN p_shipping_distance_km <= 600 THEN 1 ELSE 2 END;
  UPDATE public.orders
  SET delivery_city = btrim(p_delivery_city),
      delivery_wilaya = nullif(btrim(coalesce(p_delivery_wilaya, '')), ''),
      delivery_latitude = p_delivery_latitude,
      delivery_longitude = p_delivery_longitude,
      delivery_origin_name = v_origin_name,
      delivery_origin_latitude = v_origin_lat,
      delivery_origin_longitude = v_origin_lon,
      shipping_distance_km = p_shipping_distance_km,
      shipping_transit_days = v_transit_days,
      shipping_route_calculated_at = now()
  WHERE id = p_order_id
    AND deleted_at IS NULL
    AND delivery_method <> 'pickup'
    AND status IN ('new', 'processing')
  RETURNING * INTO v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'active delivery order not found'; END IF;
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_set_order_shipping_route(uuid, text, text, double precision, double precision, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_set_order_shipping_route(uuid, text, text, double precision, double precision, numeric) TO authenticated;
