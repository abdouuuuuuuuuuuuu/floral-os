-- Route all order writes through narrow, role-checked Postgres workflows.
-- UI checks are conveniences only; auth.uid() and the active profile role are
-- authoritative for every function exposed to authenticated clients.

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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create orders';
  END IF;
  IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid order payload';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'invalid order payload'; END IF;
  RETURN to_jsonb(public.create_order(p_order, p_items));
END;
$$;

CREATE OR REPLACE FUNCTION public.blossom_void_order(p_order_id uuid, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'only an active owner or manager can void orders';
  END IF;
  IF p_order_id IS NULL OR length(btrim(coalesce(p_reason, ''))) > 500 THEN
    RAISE EXCEPTION 'order id is required and reason must be 500 characters or fewer';
  END IF;
  PERFORM public.void_order(p_order_id, coalesce(nullif(btrim(p_reason), ''), 'Voided from Blossom'));
  RETURN jsonb_build_object('voided', true, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.blossom_edit_order(
  p_order_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_order_data jsonb DEFAULT '{}'::jsonb,
  p_additions jsonb DEFAULT '[]'::jsonb,
  p_request_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist') THEN
    RAISE EXCEPTION 'role cannot edit orders';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'processing', 'done') THEN
    RAISE EXCEPTION 'invalid order edit status; use the cancellation workflow to cancel an order';
  END IF;
  RETURN public.edit_order_and_items(p_order_id, p_items, p_order_data, p_additions, p_request_id, p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.blossom_delete_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can delete orders';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order id is required'; END IF;
  PERFORM public.delete_order(p_order_id);
  RETURN jsonb_build_object('deleted', true, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery')
     OR (v_role = 'delivery' AND p_status <> 'done') THEN
    RAISE EXCEPTION 'role cannot update order status';
  END IF;
  IF p_order_id IS NULL OR p_status IS NULL OR p_status NOT IN ('new', 'processing', 'ready', 'done') THEN
    RAISE EXCEPTION 'invalid order status';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status IN ('done', 'cancelled') AND v_order.status <> p_status THEN
    RAISE EXCEPTION 'completed or cancelled orders cannot be reopened';
  END IF;
  IF v_role = 'delivery' AND v_order.delivery_method = 'pickup' THEN
    RAISE EXCEPTION 'delivery staff cannot mark pickup orders delivered';
  END IF;
  UPDATE public.orders SET status = p_status WHERE id = p_order_id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_order(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blossom_edit_order(uuid, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blossom_void_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blossom_delete_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_create_order(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blossom_edit_order(uuid, jsonb, jsonb, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blossom_void_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blossom_delete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;

-- Prevent API clients from bypassing RPC validation and stock/accounting logic.
-- SECURITY DEFINER workflow functions continue to perform these writes.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items FROM PUBLIC, anon, authenticated;

-- Existing implementations remain internal workflow primitives. Clients use
-- the role-checked Blossom wrappers above instead.
REVOKE ALL ON FUNCTION public.create_order(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_order_and_items(uuid, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_items(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_order_items(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Regrant only workflows that authenticate the caller internally.
GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid, uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delay_order(uuid, date, text) TO authenticated;
