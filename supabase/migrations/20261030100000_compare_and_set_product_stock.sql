-- Stock counts edited from the product form used to be written as an absolute
-- value captured when the form opened, overwriting any sale made meanwhile and
-- skipping stock_adjustments. This RPC applies the new count only if the stock
-- still matches what the editor saw, and records the correction.

CREATE OR REPLACE FUNCTION public.set_product_stock(
  p_product_id integer,
  p_expected_stock integer,
  p_new_stock integer,
  p_reason text DEFAULT 'Stock count correction'
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
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot manage inventory';
  END IF;
  IF p_product_id IS NULL OR p_expected_stock IS NULL OR p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'product, expected stock, and a nonnegative new stock are required';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE product_id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;

  v_previous_stock := coalesce(v_product.stock_level, 0);
  IF v_previous_stock <> p_expected_stock THEN
    RAISE EXCEPTION 'stock changed from % to % while you were editing; reopen the product and try again',
      p_expected_stock, v_previous_stock
      USING ERRCODE = '40001';
  END IF;
  IF p_new_stock = v_previous_stock THEN
    RETURN jsonb_build_object('product', to_jsonb(v_product), 'changed', false);
  END IF;

  UPDATE public.products
  SET stock_level = p_new_stock,
      product_status = CASE WHEN p_new_stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END
  WHERE product_id = p_product_id
  RETURNING * INTO v_product;

  INSERT INTO public.stock_adjustments (
    product_id, adjustment_type, quantity, reason,
    previous_stock, new_stock, created_by
  ) VALUES (
    p_product_id,
    CASE WHEN p_new_stock > v_previous_stock THEN 'restore' ELSE 'removal' END,
    abs(p_new_stock - v_previous_stock),
    coalesce(nullif(v_reason, ''), 'Stock count correction'),
    v_previous_stock, p_new_stock, v_user_id
  );

  RETURN jsonb_build_object('product', to_jsonb(v_product), 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_stock(integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_stock(integer, integer, integer, text) TO authenticated;
