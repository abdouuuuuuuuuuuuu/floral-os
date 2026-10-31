-- Phase 5: record courier handoff separately from order completion.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_handed_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_handed_off_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.mark_order_handed_off(p_order_id uuid)
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
  IF NOT coalesce(v_active, false) THEN RAISE EXCEPTION 'account is not active'; END IF;
  IF coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot record courier handoff';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order id is required'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'active order not found'; END IF;
  IF coalesce(v_order.delivery_method, '') IN ('pickup', '') THEN RAISE EXCEPTION 'pickup orders cannot be handed to a courier'; END IF;
  IF v_order.delivery_date IS NULL THEN RAISE EXCEPTION 'delivery date is required before courier handoff'; END IF;
  IF coalesce(v_order.status, '') NOT IN ('new', 'processing', 'ready') THEN
    RAISE EXCEPTION 'order is not ready for courier handoff';
  END IF;
  IF v_order.delivery_handed_off_at IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'already_handed_off', true);
  END IF;

  UPDATE public.orders
  SET delivery_handed_off_at = clock_timestamp(), delivery_handed_off_by = v_user_id
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (v_user_id::text, 'mark_order_handed_off', 'orders', to_jsonb(v_order),
    (SELECT to_jsonb(o) FROM public.orders o WHERE o.id = p_order_id));

  RETURN jsonb_build_object('order_id', p_order_id, 'already_handed_off', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_handed_off(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_handed_off(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.blossom_capture_courier_handoff_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_type text;
  v_summary text;
  v_value jsonb;
BEGIN
  IF OLD.delivery_handed_off_at IS NOT DISTINCT FROM NEW.delivery_handed_off_at THEN
    RETURN NEW;
  END IF;
  IF NEW.delivery_handed_off_at IS NULL THEN
    v_type := 'delivery_returned_to_shop';
    v_summary := 'Delivery returned to shop after an unsuccessful attempt';
    v_value := jsonb_build_object('from', OLD.delivery_handed_off_at, 'to', NULL);
  ELSE
    v_type := 'delivery_handed_off';
    v_summary := 'Order handed to courier';
    v_value := jsonb_build_object('from', OLD.delivery_handed_off_at, 'to', NEW.delivery_handed_off_at);
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'Staff'), coalesce(p.role, 'staff')
      INTO v_actor_name, v_actor_role
      FROM public.profiles p WHERE p.id = v_actor_id;
  END IF;

  INSERT INTO public.order_events (
    order_id, order_number, event_type, summary, actor_id, actor_name,
    actor_role, actor_type, changes
  ) VALUES (
    NEW.id, NEW.order_number::text, v_type, v_summary, v_actor_id,
    coalesce(v_actor_name, 'System'), coalesce(v_actor_role, 'system'),
    CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'user' END,
    jsonb_build_object('delivery_handed_off_at', v_value)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_capture_courier_handoff_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_capture_courier_handoff_event ON public.orders;
CREATE TRIGGER orders_capture_courier_handoff_event
  AFTER UPDATE OF delivery_handed_off_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_capture_courier_handoff_event();

-- A failed delivery closes the current courier leg. Preserve the failed
-- attempt in notes/activity, then allow a later handoff to be recorded.
CREATE OR REPLACE FUNCTION public.record_delivery_outcome(
  p_order_id uuid,
  p_reason text,
  p_actor text DEFAULT NULL,
  p_new_date date DEFAULT NULL
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
  v_old_order jsonb;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_event jsonb;
  v_note text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'delivery') THEN
    RAISE EXCEPTION 'role cannot record delivery outcomes';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'delivery reason is required'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'archived orders cannot be updated'; END IF;
  IF v_order.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'completed or cancelled orders cannot be updated';
  END IF;
  IF coalesce(v_order.status, '') NOT IN ('new', 'processing', 'ready') THEN
    RAISE EXCEPTION 'order has no valid status for a delivery outcome';
  END IF;
  IF p_new_date IS NOT NULL THEN
    IF v_order.delivery_method = 'pickup' THEN RAISE EXCEPTION 'pickup orders do not have a delivery date'; END IF;
    IF p_new_date <= (now() AT TIME ZONE 'Africa/Algiers')::date THEN
      RAISE EXCEPTION 'new delivery date must be in the future';
    END IF;
    IF v_order.delivery_date IS NOT NULL AND p_new_date <= v_order.delivery_date THEN
      RAISE EXCEPTION 'new delivery date must be later than the current date';
    END IF;
  END IF;

  v_old_order := to_jsonb(v_order);
  v_note := format('[Delivery attempt %s%s] %s. %s.',
    to_char(now() AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD HH24:MI'),
    CASE WHEN nullif(btrim(coalesce(p_actor, '')), '') IS NULL
      THEN '' ELSE ' by ' || left(btrim(p_actor), 100) END,
    v_reason,
    CASE WHEN p_new_date IS NULL
      THEN 'Returned to shop; delivery remains unresolved'
      ELSE 'Rescheduled to ' || p_new_date::text END);

  IF p_new_date IS NOT NULL THEN
    v_event := jsonb_build_object(
      'delayed_at', now(), 'delayed_by', v_user_id,
      'from_date', v_order.delivery_date, 'to_date', p_new_date,
      'reason', v_reason, 'source', 'failed_delivery'
    );
  END IF;

  UPDATE public.orders SET
    status = 'processing',
    notes = concat_ws(E'\n', nullif(btrim(coalesce(v_order.notes, '')), ''), v_note),
    delivery_date = coalesce(p_new_date, delivery_date),
    original_delivery_date = CASE WHEN p_new_date IS NULL
      THEN original_delivery_date ELSE coalesce(original_delivery_date, delivery_date) END,
    delay_reason = CASE WHEN p_new_date IS NULL THEN delay_reason ELSE v_reason END,
    delayed_at = CASE WHEN p_new_date IS NULL THEN delayed_at ELSE now() END,
    delay_history = CASE WHEN p_new_date IS NULL THEN delay_history
      ELSE coalesce(delay_history, '[]'::jsonb) || jsonb_build_array(v_event) END,
    delivery_handed_off_at = NULL,
    delivery_handed_off_by = NULL
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (v_user_id::text, 'delivery_outcome', 'orders', v_old_order, to_jsonb(v_order));
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.record_delivery_outcome(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_delivery_outcome(uuid, text, text, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
