-- Phase 2: keep an append-only, privacy-limited activity history for orders.
-- Existing audit_logs remain the financial/security audit record; this table
-- is the staff-facing operational timeline.
CREATE TABLE IF NOT EXISTS public.order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  order_number text NOT NULL,
  event_type text NOT NULL,
  summary text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changes) = 'object'),
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS order_events_order_time_idx
  ON public.order_events (order_id, occurred_at DESC, id DESC);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_events TO authenticated;

DROP POLICY IF EXISTS order_events_select_authorized ON public.order_events;
CREATE POLICY order_events_select_authorized
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist', 'cashier']::text[])
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_events.order_id
        AND (o.deleted_at IS NULL OR public.blossom_active_role() = 'owner')
    )
  );

CREATE OR REPLACE FUNCTION public.blossom_capture_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_changed_fields text[] := ARRAY[]::text[];
  v_key text;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_event_type text;
  v_summary text;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    FOREACH v_key IN ARRAY ARRAY[
      'status', 'delivery_date', 'delivery_time', 'delivery_method',
      'delivery_city', 'delivery_wilaya', 'shipping_distance_km',
      'shipping_transit_days', 'shipping_route_calculated_at',
      'shipping_route_provider', 'shipping_route_duration_seconds',
      'original_delivery_date', 'delayed_at', 'delay_reason',
      'payment_method', 'payment_status', 'subtotal_amount', 'tax_amount',
      'total_amount', 'amount_paid', 'amount_due', 'price_adjustment',
      'delivery_fee_amount', 'delivery_fee_collected',
      'delivery_fee_payment_method', 'client_source', 'order_type', 'deleted_at'
    ] LOOP
      IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
        v_changes := v_changes || jsonb_build_object(
          v_key,
          jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
        );
      END IF;
    END LOOP;

    -- Record that private customer/contact or note fields changed without
    -- copying their contents into the timeline.
    IF v_old -> 'client_name' IS DISTINCT FROM v_new -> 'client_name'
       OR v_old -> 'client_phone' IS DISTINCT FROM v_new -> 'client_phone'
       OR v_old -> 'customer_id' IS DISTINCT FROM v_new -> 'customer_id' THEN
      v_changed_fields := array_append(v_changed_fields, 'customer_details');
      v_changes := v_changes || jsonb_build_object('customer_details', jsonb_build_object('changed', true));
    END IF;
    IF v_old -> 'delivery_latitude' IS DISTINCT FROM v_new -> 'delivery_latitude'
       OR v_old -> 'delivery_longitude' IS DISTINCT FROM v_new -> 'delivery_longitude' THEN
      v_changed_fields := array_append(v_changed_fields, 'destination_map_point');
      v_changes := v_changes || jsonb_build_object('destination_map_point', jsonb_build_object('changed', true));
    END IF;
    IF v_old -> 'notes' IS DISTINCT FROM v_new -> 'notes' THEN
      v_changed_fields := array_append(v_changed_fields, 'notes');
      v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('changed', true));
    END IF;
    IF v_old -> 'payment_notes' IS DISTINCT FROM v_new -> 'payment_notes' THEN
      v_changed_fields := array_append(v_changed_fields, 'payment_notes');
      v_changes := v_changes || jsonb_build_object('payment_notes', jsonb_build_object('changed', true));
    END IF;

    IF cardinality(v_changed_fields) = 0 THEN
      RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_event_type := 'order_archived';
      v_summary := 'Order archived';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_event_type := 'order_restored';
      v_summary := 'Order restored';
    ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
      v_event_type := 'order_cancelled';
      v_summary := 'Order cancelled';
    ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done' AND NEW.delivery_method <> 'pickup' THEN
      v_event_type := 'delivery_completed';
      v_summary := 'Delivery marked complete';
    ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done' THEN
      v_event_type := 'order_completed';
      v_summary := 'Order marked done';
    ELSIF v_old -> 'notes' IS DISTINCT FROM v_new -> 'notes'
      AND (
        (nullif(btrim(OLD.notes), '') IS NULL AND coalesce(NEW.notes, '') LIKE '[Delivery attempt %')
        OR (
          nullif(btrim(OLD.notes), '') IS NOT NULL
          AND left(btrim(NEW.notes), char_length(btrim(OLD.notes))) = btrim(OLD.notes)
          AND substring(btrim(NEW.notes) FROM char_length(btrim(OLD.notes)) + 1) LIKE E'\n[Delivery attempt %'
        )
      ) THEN
      v_event_type := 'delivery_attempt_failed';
      v_summary := 'Delivery attempt recorded';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := 'status_changed';
      v_summary := 'Order status changed';
    ELSIF v_changes ?| ARRAY['payment_method', 'payment_status', 'subtotal_amount', 'tax_amount', 'total_amount', 'amount_paid', 'amount_due', 'delivery_fee_amount', 'delivery_fee_collected', 'delivery_fee_payment_method', 'payment_notes'] THEN
      v_event_type := 'payment_or_total_changed';
      v_summary := 'Payment or order total updated';
    ELSIF v_changes ?| ARRAY['delivery_date', 'delivery_time', 'delivery_method', 'delivery_city', 'delivery_wilaya', 'destination_map_point', 'shipping_distance_km', 'shipping_transit_days', 'shipping_route_calculated_at', 'shipping_route_provider', 'shipping_route_duration_seconds', 'original_delivery_date', 'delayed_at', 'delay_reason'] THEN
      v_event_type := 'delivery_plan_changed';
      v_summary := 'Delivery plan updated';
    ELSE
      v_event_type := 'order_edited';
      v_summary := 'Order details updated';
    END IF;
  ELSE
    v_old := '{}'::jsonb;
    v_event_type := 'order_created';
    v_summary := 'Order created';
    v_changes := jsonb_build_object(
      'status', jsonb_build_object('to', v_new -> 'status'),
      'delivery_date', jsonb_build_object('to', v_new -> 'delivery_date'),
      'delivery_method', jsonb_build_object('to', v_new -> 'delivery_method')
    );
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'Staff'), coalesce(p.role, 'staff')
    INTO v_actor_name, v_actor_role
    FROM public.profiles p
    WHERE p.id = v_actor_id;
  END IF;
  v_actor_name := coalesce(v_actor_name, CASE WHEN v_actor_id IS NULL THEN 'System' ELSE 'Staff' END);
  v_actor_role := coalesce(v_actor_role, CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'staff' END);

  INSERT INTO public.order_events (
    order_id, order_number, event_type, summary,
    actor_id, actor_name, actor_role, actor_type, changes, occurred_at
  ) VALUES (
    NEW.id, NEW.order_number::text, v_event_type, v_summary,
    v_actor_id, v_actor_name, v_actor_role,
    CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'user' END,
    v_changes, clock_timestamp()
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_capture_order_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_capture_activity_event ON public.orders;
CREATE TRIGGER orders_capture_activity_event
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_capture_order_event();

CREATE OR REPLACE FUNCTION public.blossom_capture_order_item_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_old_item jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_event_type text;
  v_summary text;
  v_changes jsonb;
  v_product_name text;
  v_key text;
  v_item_changed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
    v_item := to_jsonb(OLD);
    v_old_item := '{}'::jsonb;
  ELSE
    v_order_id := NEW.order_id;
    v_item := to_jsonb(NEW);
    v_old_item := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH v_key IN ARRAY ARRAY['product_id', 'product_name', 'quantity', 'unit_price', 'total_price', 'color', 'flower_type', 'category'] LOOP
      IF v_old_item -> v_key IS DISTINCT FROM v_item -> v_key THEN
        v_item_changed := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_item_changed THEN RETURN NEW; END IF;
  END IF;

  SELECT o.order_number::text INTO v_order_number
  FROM public.orders o
  WHERE o.id = v_order_id;
  -- Do not create misleading item history for a permanent parent-order delete.
  IF v_order_number IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Initial order lines belong to the order-created event in the same
  -- transaction; subsequent line changes receive their own timeline entries.
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.order_events e
    WHERE e.order_id = v_order_id
      AND e.event_type = 'order_created'
      AND e.transaction_id = txid_current()
  ) THEN
    RETURN NEW;
  END IF;

  v_product_name := coalesce(nullif(v_item ->> 'product_name', ''), 'Product');
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'order_item_added';
    v_summary := 'Added ' || left(v_product_name, 160);
    v_changes := jsonb_build_object(
      'item_name', v_product_name,
      'quantity', jsonb_build_object('to', v_item -> 'quantity'),
      'unit_price', jsonb_build_object('to', v_item -> 'unit_price'),
      'line_total', jsonb_build_object('to', v_item -> 'total_price')
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'order_item_removed';
    v_summary := 'Removed ' || left(v_product_name, 160);
    v_changes := jsonb_build_object(
      'item_name', v_product_name,
      'quantity', jsonb_build_object('from', v_item -> 'quantity'),
      'unit_price', jsonb_build_object('from', v_item -> 'unit_price'),
      'line_total', jsonb_build_object('from', v_item -> 'total_price')
    );
  ELSE
    v_event_type := 'order_item_updated';
    v_summary := 'Updated ' || left(v_product_name, 160);
    v_changes := jsonb_build_object(
      'item_name', v_product_name,
      'quantity', jsonb_build_object('from', v_old_item -> 'quantity', 'to', v_item -> 'quantity'),
      'unit_price', jsonb_build_object('from', v_old_item -> 'unit_price', 'to', v_item -> 'unit_price'),
      'line_total', jsonb_build_object('from', v_old_item -> 'total_price', 'to', v_item -> 'total_price')
    );
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'Staff'), coalesce(p.role, 'staff')
    INTO v_actor_name, v_actor_role
    FROM public.profiles p
    WHERE p.id = v_actor_id;
  END IF;
  v_actor_name := coalesce(v_actor_name, CASE WHEN v_actor_id IS NULL THEN 'System' ELSE 'Staff' END);
  v_actor_role := coalesce(v_actor_role, CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'staff' END);

  INSERT INTO public.order_events (
    order_id, order_number, event_type, summary,
    actor_id, actor_name, actor_role, actor_type, changes
  ) VALUES (
    v_order_id, v_order_number, v_event_type, v_summary,
    v_actor_id, v_actor_name, v_actor_role,
    CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'user' END,
    v_changes
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_capture_order_item_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_capture_activity_event ON public.order_items;
CREATE TRIGGER order_items_capture_activity_event
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.blossom_capture_order_item_event();

NOTIFY pgrst, 'reload schema';
