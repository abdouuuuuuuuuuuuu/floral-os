-- Phase 6: retain the actual delivery completion time and staff member.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Recover available completion times from the Phase 2 order timeline. Orders
-- completed before activity tracking began remain without a historical time.
WITH latest_delivery_event AS (
  SELECT DISTINCT ON (order_id) order_id, actor_id, occurred_at
  FROM public.order_events
  WHERE event_type = 'delivery_completed'
  ORDER BY order_id, occurred_at DESC, id DESC
)
UPDATE public.orders o
SET delivered_at = e.occurred_at,
    delivered_by = e.actor_id
FROM latest_delivery_event e
WHERE o.id = e.order_id
  AND o.status = 'done'
  AND o.deleted_at IS NULL
  AND o.delivery_method <> 'pickup'
  AND o.delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.blossom_stamp_delivery_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' AND NEW.delivery_method IS DISTINCT FROM 'pickup' THEN
      NEW.delivered_at := clock_timestamp();
      NEW.delivered_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
    NEW.delivered_at := NULL;
    NEW.delivered_by := NULL;
  ELSIF NEW.status = 'done'
    AND NEW.delivery_method IS DISTINCT FROM 'pickup'
    AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.delivered_at := clock_timestamp();
    NEW.delivered_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_stamp_delivery_completion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_stamp_delivery_completion ON public.orders;
CREATE TRIGGER orders_stamp_delivery_completion
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_stamp_delivery_completion();

CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id uuid)
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
  v_old_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) THEN RAISE EXCEPTION 'account is not active'; END IF;
  IF coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot mark deliveries complete';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order id is required'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'order is not an active delivery'; END IF;
  IF v_order.delivery_method = 'pickup' THEN RAISE EXCEPTION 'order is not an active delivery'; END IF;

  -- Safe retry: return the original completion details without logging twice.
  IF v_order.status = 'done' THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'status', v_order.status,
      'delivered_at', v_order.delivered_at,
      'delivered_by', v_order.delivered_by,
      'already_completed', true
    );
  END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'cancelled orders cannot be marked delivered'; END IF;
  IF coalesce(v_order.status, '') NOT IN ('new', 'processing', 'ready') THEN
    RAISE EXCEPTION 'order is not in a deliverable status';
  END IF;

  v_old_order := v_order;
  UPDATE public.orders
  SET status = 'done', delivered_at = clock_timestamp(), delivered_by = v_user_id
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (v_user_id::text, 'mark_order_delivered', 'orders', to_jsonb(v_old_order), to_jsonb(v_order));

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', v_order.status,
    'delivered_at', v_order.delivered_at,
    'delivered_by', v_order.delivered_by,
    'already_completed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_delivered(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
