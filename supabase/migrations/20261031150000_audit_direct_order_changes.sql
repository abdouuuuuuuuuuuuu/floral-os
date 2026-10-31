-- Catch order changes made directly in the database (Supabase SQL editor or
-- table editor), which bypass the app's RPCs and so never reach the activity
-- log. Those sessions have no app user, so auth.uid() is null; app writes
-- always have one. We log only when auth.uid() is null, so this never
-- double-logs an app action that already wrote its own audit row.

CREATE OR REPLACE FUNCTION public.blossom_audit_direct_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.orders%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  -- App sessions carry a user; only direct/service changes have none.
  IF auth.uid() IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := OLD;
    INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
    VALUES (
      'direct-db', 'direct_delete_order', 'orders',
      to_jsonb(v_old),
      jsonb_build_object('order_number', v_old.order_number,
        'total_amount', v_old.total_amount, 'permanent', true)
    );
    RETURN NULL;
  END IF;

  -- UPDATE
  v_old := OLD;
  v_order := NEW;
  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    'direct-db', 'direct_update_order', 'orders',
    to_jsonb(v_old),
    jsonb_build_object('order', to_jsonb(v_order), 'order_number', v_order.order_number,
      'total_amount', v_order.total_amount)
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_audit_direct_order_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_audit_direct_change ON public.orders;
CREATE TRIGGER orders_audit_direct_change
  AFTER UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_audit_direct_order_change();
