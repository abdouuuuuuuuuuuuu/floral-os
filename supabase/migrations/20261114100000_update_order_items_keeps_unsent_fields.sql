-- Editing an order wiped its delivery date.
--
-- The live update_order_items() (never in this repo until now) wrote every
-- order field on every call, reading each from the payload:
--   delivery_date = NULLIF((p_order_data->>'delivery_date')::text, '')::date
-- Since 20261112100000, edit_order_and_items() moves the date through
-- reschedule_order() and removes it from the payload. A missing key reads as
-- NULL, so the next line set the date to NULL straight after the reschedule.
-- client_phone, customer_id and notes were also cleared whenever a caller
-- left them out, and delivery_time was never saved at all.
--
-- Now a field changes only when its key is present in the payload. A key
-- sent as '' still clears it, as before. Totals logic is unchanged.

CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_order_data jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d jsonb := coalesce(p_order_data, '{}'::jsonb);
  v_typed public.orders;
  v_item jsonb;
  v_subtotal integer := 0;
  v_adjustment numeric;
  v_total integer;
  v_tax integer := 0;
  v_amount_paid integer := 0;
  v_amount_due integer;
  v_payment_status text;
BEGIN
  -- 1. Apply item changes, only to lines of this order.
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    IF coalesce((v_item->>'deleted')::boolean, false) THEN
      DELETE FROM public.order_items
      WHERE id = (v_item->>'id')::uuid AND order_id = p_order_id;
    ELSE
      UPDATE public.order_items
      SET quantity = (v_item->>'quantity')::integer,
          total_price = unit_price * (v_item->>'quantity')::integer
      WHERE id = (v_item->>'id')::uuid AND order_id = p_order_id;
    END IF;
  END LOOP;

  -- 2. Recalculate subtotal from remaining items.
  SELECT coalesce(sum(total_price), 0) INTO v_subtotal
  FROM public.order_items WHERE order_id = p_order_id;

  -- 3. Current tax, paid amount and adjustment.
  SELECT coalesce(tax_amount, 0), coalesce(amount_paid, 0), coalesce(price_adjustment, 0)
  INTO v_tax, v_amount_paid, v_adjustment
  FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  -- 4. Adjustment from the payload when sent (negative = discount).
  IF d ? 'price_adjustment' THEN
    v_adjustment := coalesce(nullif(d->>'price_adjustment', '')::numeric, 0);
  END IF;

  -- 5. Totals.
  v_total := greatest(0, v_subtotal + round(v_adjustment)::integer + v_tax);
  v_amount_due := greatest(0, v_total - v_amount_paid);

  -- 6. Payment status follows the new total.
  v_payment_status := CASE
    WHEN v_amount_paid >= v_total THEN 'paid'
    WHEN v_amount_paid > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  -- Typed copies of the sent values, whatever the column types are.
  v_typed := jsonb_populate_record(NULL::public.orders, jsonb_strip_nulls(jsonb_build_object(
    'delivery_date', nullif(d->>'delivery_date', ''),
    'delivery_time', nullif(d->>'delivery_time', ''),
    'customer_id', nullif(d->>'customer_id', '')
  )));

  -- 7. Update only the fields the caller sent.
  UPDATE public.orders SET
    client_name     = CASE WHEN d ? 'client_name' THEN coalesce(nullif(d->>'client_name', ''), client_name) ELSE client_name END,
    client_phone    = CASE WHEN d ? 'client_phone' THEN nullif(d->>'client_phone', '') ELSE client_phone END,
    customer_id     = CASE WHEN d ? 'customer_id' THEN v_typed.customer_id ELSE customer_id END,
    delivery_date   = CASE WHEN d ? 'delivery_date' THEN v_typed.delivery_date ELSE delivery_date END,
    delivery_time   = CASE WHEN d ? 'delivery_time' THEN v_typed.delivery_time ELSE delivery_time END,
    delivery_method = coalesce(nullif(d->>'delivery_method', ''), delivery_method),
    payment_method  = coalesce(nullif(d->>'payment_method', ''), payment_method),
    client_source   = coalesce(nullif(d->>'client_source', ''), client_source),
    notes           = CASE WHEN d ? 'notes' THEN nullif(d->>'notes', '') ELSE notes END,
    price_adjustment = v_adjustment,
    subtotal_amount  = v_subtotal,
    total_amount     = v_total,
    amount_due       = v_amount_due,
    payment_status   = v_payment_status
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

-- Only reachable through edit_order_and_items() / blossom_edit_order().
REVOKE ALL ON FUNCTION public.update_order_items(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
