-- Phase 7: record product stock deductions made during order creation.
-- This wraps the existing validated create_order function so order, stock,
-- cash, and stock_adjustments remain one transaction. Requires Phase 6's
-- stock_adjustments.order_id column.

CREATE TABLE IF NOT EXISTS public.order_stock_tracking_cutover (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_stock_tracking_cutover ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_stock_tracking_cutover FROM PUBLIC, anon, authenticated;
INSERT INTO public.order_stock_tracking_cutover(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

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
  v_product_id integer;
  v_stock integer;
  v_before jsonb := '{}'::jsonb;
  v_result jsonb;
  v_order_id uuid;
  v_order_number text;
  v_item record;
  v_after integer;
  v_previous integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create orders';
  END IF;
  IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid order payload';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS i(value)
    WHERE coalesce(i.value->>'product_id', '') !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'each order item needs a valid product id';
  END IF;

  -- Lock products in a stable order before observing stock so concurrent
  -- orders cannot capture a stale before value or deadlock on reversed carts.
  FOR v_product_id IN
    SELECT DISTINCT (i.value->>'product_id')::integer
    FROM jsonb_array_elements(p_items) AS i(value)
    ORDER BY 1
  LOOP
    SELECT coalesce(stock_level, 0) INTO v_stock
    FROM public.products
    WHERE product_id = v_product_id AND coalesce(is_active, false) = true
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product % is missing or inactive', v_product_id; END IF;
    v_before := jsonb_set(v_before, ARRAY[v_product_id::text], to_jsonb(v_stock), true);
  END LOOP;

  v_result := public.create_order(p_order, p_items);
  v_order_id := nullif(v_result->'order'->>'id', '')::uuid;
  v_order_number := v_result->'order'->>'order_number';
  IF v_order_id IS NULL OR v_order_number IS NULL THEN
    RAISE EXCEPTION 'order creation did not return its order identity';
  END IF;

  FOR v_item IN
    SELECT (i.value->>'product_id')::integer AS product_id,
           sum((i.value->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS i(value)
    GROUP BY (i.value->>'product_id')::integer
    ORDER BY (i.value->>'product_id')::integer
  LOOP
    SELECT coalesce(stock_level, 0) INTO v_after
    FROM public.products WHERE product_id = v_item.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'product % disappeared during order creation', v_item.product_id; END IF;
    v_previous := (v_before->>v_item.product_id::text)::integer;

    IF v_previous - v_after <> v_item.quantity THEN
      RAISE EXCEPTION 'stock changed unexpectedly while creating order #% for product %',
        v_order_number, v_item.product_id;
    END IF;

    INSERT INTO public.stock_adjustments (
      product_id, adjustment_type, quantity, reason,
      previous_stock, new_stock, created_by, order_id
    ) VALUES (
      v_item.product_id, 'removal', v_item.quantity,
      'Order #' || v_order_number || ' created',
      v_previous, v_after, v_user_id, v_order_id
    );
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_order(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_create_order(jsonb, jsonb) TO authenticated;
