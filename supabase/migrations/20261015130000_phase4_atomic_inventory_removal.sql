-- Phase 4: update stock and write its adjustment record in one transaction.
-- Apply manually after reviewing. This function covers manual stock removal
-- (damaged/spoiled inventory); order reserve/release functions are separate.

CREATE OR REPLACE FUNCTION public.remove_product_stock(
  p_product_id integer,
  p_quantity integer,
  p_reason text DEFAULT 'Damaged/Spoiled'
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
  v_product public.products%ROWTYPE;
  v_previous_stock integer;
  v_new_stock integer;
  v_reason text := left(btrim(coalesce(p_reason, 'Damaged/Spoiled')), 500);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot manage inventory';
  END IF;
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'product and positive whole-unit quantity are required';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE product_id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;

  v_previous_stock := coalesce(v_product.stock_level, 0);
  IF p_quantity > v_previous_stock THEN
    RAISE EXCEPTION 'cannot remove % units; only % are in stock', p_quantity, v_previous_stock;
  END IF;
  v_new_stock := v_previous_stock - p_quantity;

  UPDATE public.products
  SET stock_level = v_new_stock,
      product_status = CASE WHEN v_new_stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END
  WHERE product_id = p_product_id
  RETURNING * INTO v_product;

  INSERT INTO public.stock_adjustments (
    product_id, adjustment_type, quantity, reason,
    previous_stock, new_stock, created_by
  ) VALUES (
    p_product_id, 'removal', p_quantity,
    coalesce(nullif(v_reason, ''), 'Damaged/Spoiled'),
    v_previous_stock, v_new_stock, v_user_id
  );

  RETURN jsonb_build_object(
    'product', to_jsonb(v_product),
    'removed', p_quantity,
    'remaining', v_new_stock
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_product_stock(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_product_stock(integer, integer, text) TO authenticated;
