-- Route distances are trusted only when calculated and stored server-side.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_route_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS shipping_route_provider text,
  ADD COLUMN IF NOT EXISTS shipping_route_max_snap_distance_m double precision;

CREATE OR REPLACE FUNCTION public.blossom_protect_shipping_route_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_internal_route_write boolean := coalesce(auth.role(), '') = 'service_role';
  v_destination_changed boolean := false;
BEGIN
  IF v_internal_route_write THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_destination_changed := OLD.delivery_city IS DISTINCT FROM NEW.delivery_city
      OR OLD.delivery_wilaya IS DISTINCT FROM NEW.delivery_wilaya
      OR OLD.delivery_latitude IS DISTINCT FROM NEW.delivery_latitude
      OR OLD.delivery_longitude IS DISTINCT FROM NEW.delivery_longitude;
  END IF;

  IF TG_OP = 'INSERT' OR v_destination_changed THEN
    NEW.delivery_origin_name := NULL;
    NEW.delivery_origin_latitude := NULL;
    NEW.delivery_origin_longitude := NULL;
    NEW.shipping_distance_km := NULL;
    NEW.shipping_transit_days := NULL;
    NEW.shipping_route_duration_seconds := NULL;
    NEW.shipping_route_provider := NULL;
    NEW.shipping_route_max_snap_distance_m := NULL;
    NEW.shipping_route_calculated_at := NULL;
  ELSE
    NEW.delivery_origin_name := OLD.delivery_origin_name;
    NEW.delivery_origin_latitude := OLD.delivery_origin_latitude;
    NEW.delivery_origin_longitude := OLD.delivery_origin_longitude;
    NEW.shipping_distance_km := OLD.shipping_distance_km;
    NEW.shipping_transit_days := OLD.shipping_transit_days;
    NEW.shipping_route_duration_seconds := OLD.shipping_route_duration_seconds;
    NEW.shipping_route_provider := OLD.shipping_route_provider;
    NEW.shipping_route_max_snap_distance_m := OLD.shipping_route_max_snap_distance_m;
    NEW.shipping_route_calculated_at := OLD.shipping_route_calculated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_protect_shipping_route_snapshot ON public.orders;
CREATE TRIGGER orders_protect_shipping_route_snapshot
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_protect_shipping_route_snapshot();

REVOKE ALL ON FUNCTION public.blossom_set_order_shipping_route(
  uuid, text, text, double precision, double precision, numeric
) FROM PUBLIC, anon, authenticated;
