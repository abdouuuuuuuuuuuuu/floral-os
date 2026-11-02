-- Allow active POS staff to archive orders while keeping the archive itself
-- owner-only in the application.
CREATE OR REPLACE FUNCTION public.blossom_archive_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
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
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier', 'delivery') THEN
    RAISE EXCEPTION 'active staff role cannot archive orders';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order id is required'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('archived', true, 'already_archived', true, 'order_id', p_order_id);
  END IF;

  UPDATE public.orders
  SET deleted_at = now(), deleted_by = v_user_id, deletion_reason = v_reason
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (
    performed_by, action_taken, target_table, old_value, new_value
  ) VALUES (
    v_user_id::text,
    'archive_order',
    'orders',
    to_jsonb(v_order),
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'reason', v_reason,
      'deleted_at', now()
    )
  );

  RETURN jsonb_build_object('archived', true, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_archive_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_archive_order(uuid, text) TO authenticated;

-- Archived order rows and their items remain readable only by owners. These
-- restrictive policies preserve existing live-order policies for staff.
DROP POLICY IF EXISTS orders_archived_owner_only ON public.orders;
CREATE POLICY orders_archived_owner_only ON public.orders
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'owner' AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS order_items_archived_owner_only ON public.order_items;
CREATE POLICY order_items_archived_owner_only ON public.order_items
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'owner' AND p.is_active = true
    )
  );
