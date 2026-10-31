-- A permanent order delete must still leave a private owner record, so a
-- corrected or fake entry can be removed from the shop's working data while
-- the fact that it happened (and the full order it was) survives in the
-- owner-only activity log. audit_logs is not cascade-deleted with the order,
-- so this row persists after the order row is gone.
--
-- Redefines blossom_delete_order to snapshot the order and its items into the
-- audit log before deleting. Owner-only and phrase-gated exactly as before.

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
  v_items jsonb;
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

  SELECT coalesce(jsonb_agg(to_jsonb(oi.*)), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  -- Private owner record, written before the order is removed. This survives
  -- the delete and is what the activity log shows.
  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_user_id::text, 'delete_order', 'orders',
    jsonb_build_object('order', to_jsonb(v_order), 'items', v_items),
    jsonb_build_object(
      'order_number', v_order.order_number,
      'total_amount', v_order.total_amount,
      'amount_paid', v_order.amount_paid,
      'permanent', true
    )
  );

  PERFORM public.delete_order(p_order_id);
  RETURN jsonb_build_object('deleted', true, 'order_id', p_order_id, 'order_number', v_order.order_number);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_delete_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_delete_order(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
