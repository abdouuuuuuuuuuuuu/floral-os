-- Petals spent on an order go back to the customer when the order is cancelled,
-- and are taken again if the order is reopened. Earned petals were already
-- handled by orders_sync_loyalty_points; only spent petals were left behind.
--
-- This runs on the status change, so every path that cancels or reopens an
-- order is covered. Archiving does not change status and has its own reversal.

CREATE OR REPLACE FUNCTION public.blossom_sync_spent_petals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_returned CONSTANT text := 'Spent petals returned because the order was cancelled';
  c_retaken CONSTANT text := 'Spent petals taken again because the order was reopened';
  v_spent integer;
  v_returned integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.status = 'cancelled' OR OLD.status = 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(sum(-points_delta) FILTER (WHERE transaction_type = 'redeem'), 0),
    coalesce(sum(points_delta) FILTER (WHERE note IN (c_returned, c_retaken)), 0)
  INTO v_spent, v_returned
  FROM public.customer_loyalty_transactions
  WHERE order_id = NEW.id;

  IF NEW.status = 'cancelled' AND v_spent - v_returned > 0 THEN
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by)
    VALUES (NEW.customer_id, NEW.id, 'adjustment', v_spent - v_returned, c_returned, auth.uid());
  ELSIF OLD.status = 'cancelled' AND v_returned > 0 THEN
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by)
    VALUES (NEW.customer_id, NEW.id, 'adjustment', -v_returned, c_retaken, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_sync_spent_petals() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_sync_spent_petals ON public.orders;
CREATE TRIGGER orders_sync_spent_petals
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_sync_spent_petals();
