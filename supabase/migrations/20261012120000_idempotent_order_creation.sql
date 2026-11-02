-- Make retries of an order creation return the original result instead of
-- inserting the order and stock/cash effects a second time.
CREATE TABLE IF NOT EXISTS public.order_creation_requests (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_id)
);

ALTER TABLE public.order_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_creation_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.blossom_create_order(
  p_order jsonb,
  p_items jsonb,
  p_request_id uuid
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
  v_fingerprint text;
  v_saved public.order_creation_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create orders';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'an order creation request id is required'; END IF;
  IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid order payload';
  END IF;

  v_fingerprint := md5(p_order::text || '|' || p_items::text);
  INSERT INTO public.order_creation_requests(actor_id, request_id, request_fingerprint)
  VALUES (v_user_id, p_request_id, v_fingerprint)
  ON CONFLICT (actor_id, request_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO v_saved
    FROM public.order_creation_requests
    WHERE actor_id = v_user_id AND request_id = p_request_id
    FOR UPDATE;
    IF v_saved.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for different order details';
    END IF;
    IF v_saved.result IS NULL THEN
      RAISE EXCEPTION 'order creation request is still processing; retry with the same request id';
    END IF;
    RETURN v_saved.result;
  END IF;

  -- Reuse the existing workflow's validation, stock changes, numbering, and
  -- cash-register behavior. The original wrapper runs inside this transaction.
  v_result := public.blossom_create_order(p_order, p_items);
  UPDATE public.order_creation_requests
  SET result = v_result
  WHERE actor_id = v_user_id AND request_id = p_request_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_order(jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_create_order(jsonb, jsonb, uuid) TO authenticated;
