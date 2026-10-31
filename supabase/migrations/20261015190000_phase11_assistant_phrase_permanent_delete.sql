-- Phase 11: only the exact owner-only Assistant command may permanently
-- delete an order: "pepepeace #<stored order number>".

REVOKE ALL ON FUNCTION public.blossom_delete_order(uuid)
  FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.blossom_delete_order(uuid);

CREATE OR REPLACE FUNCTION public.blossom_delete_order(
  p_order_id uuid,
  p_command_phrase text
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
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can permanently delete orders';
  END IF;
  IF p_order_id IS NULL OR p_command_phrase IS NULL THEN
    RAISE EXCEPTION 'order id and the exact deletion command are required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF lower(p_command_phrase) <> lower('pepepeace #' || v_order.order_number) THEN
    RAISE EXCEPTION 'type exactly: pepepeace #% to permanently delete this order', v_order.order_number;
  END IF;

  PERFORM public.delete_order(p_order_id);
  RETURN jsonb_build_object('deleted', true, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_delete_order(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_delete_order(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
