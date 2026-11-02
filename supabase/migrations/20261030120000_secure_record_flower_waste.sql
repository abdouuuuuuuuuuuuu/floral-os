-- record_flower_waste is SECURITY DEFINER, so table policies do not apply to
-- it. The deployed version only checked that the caller was signed in: any
-- account, including delivery staff, could reduce stock through it. It also
-- dated waste with the server's UTC date and left product_status stale when
-- stock reached zero.

CREATE OR REPLACE FUNCTION public.record_flower_waste(
  p_product_id integer,
  p_quantity integer,
  p_reason text DEFAULT 'Other'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_quantity integer := p_quantity;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Other'), 100);
  v_unit_cost numeric(12, 2);
  v_waste_id uuid;
  v_remaining integer;
  v_waste_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF coalesce(public.blossom_active_role(), '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot record flower waste' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'Product is required'; END IF;
  IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE product_id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF lower(coalesce(btrim(v_product.category), '')) <> 'flowers' THEN
    RAISE EXCEPTION 'Only products in the Flowers category can be recorded as flower waste';
  END IF;
  IF coalesce(v_product.stock_level, 0) < v_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %', coalesce(v_product.stock_level, 0);
  END IF;

  v_unit_cost := greatest(coalesce(v_product.wholesale_cost, 0), 0);
  v_remaining := coalesce(v_product.stock_level, 0) - v_quantity;

  UPDATE public.products
  SET stock_level = v_remaining,
      product_status = CASE WHEN v_remaining > 0 THEN 'in_stock' ELSE 'out_of_stock' END
  WHERE product_id = p_product_id;

  INSERT INTO public.flower_waste (product_id, quantity, reason, unit_cost, waste_date, created_by)
  VALUES (p_product_id, v_quantity, v_reason, v_unit_cost, v_waste_date, v_user_id)
  RETURNING id INTO v_waste_id;

  RETURN jsonb_build_object(
    'success', true,
    'waste_id', v_waste_id,
    'product_id', p_product_id,
    'product_name', v_product.item_name,
    'quantity', v_quantity,
    'remaining', v_remaining,
    'reason', v_reason,
    'unit_cost', v_unit_cost,
    'total_cost', v_quantity * v_unit_cost,
    'waste_date', v_waste_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_flower_waste(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_flower_waste(integer, integer, text) TO authenticated;
