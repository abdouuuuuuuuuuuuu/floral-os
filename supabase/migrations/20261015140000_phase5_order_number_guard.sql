-- Phase 5: keep future order numbers unique without renumbering historical
-- orders. Existing duplicates remain untouched and must be reviewed separately.

DO $$
DECLARE
  v_max_order_number numeric;
  v_sequence_value bigint;
  v_sequence_called boolean;
  v_target numeric;
BEGIN
  SELECT max(btrim(order_number)::numeric)
  INTO v_max_order_number
  FROM public.orders
  WHERE btrim(order_number) ~ '^[0-9]+$';

  SELECT last_value, is_called
  INTO v_sequence_value, v_sequence_called
  FROM public.order_number_seq;

  v_target := greatest(coalesce(v_max_order_number, 0), coalesce(v_sequence_value, 0));
  IF v_target > 9223372036854775807 THEN
    RAISE EXCEPTION 'stored order number is too large for order_number_seq';
  END IF;

  IF v_target > 0 THEN
    PERFORM setval('public.order_number_seq'::regclass, v_target::bigint, true);
  ELSIF v_sequence_called THEN
    PERFORM setval('public.order_number_seq'::regclass, v_sequence_value, true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_unique_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_number text := btrim(NEW.order_number);
BEGIN
  IF v_order_number IS NULL OR v_order_number = '' THEN
    RAISE EXCEPTION 'order number cannot be empty';
  END IF;

  -- Preserve legacy duplicate rows during ordinary updates, but do not allow
  -- an order number to be reassigned to a different order.
  IF TG_OP = 'UPDATE' AND btrim(OLD.order_number) = v_order_number THEN
    RETURN NEW;
  END IF;

  -- Serialize equal-number checks so concurrent inserts cannot both pass.
  PERFORM pg_advisory_xact_lock(hashtext('public.orders.order_number'), hashtext(v_order_number));

  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE btrim(o.order_number) = v_order_number
      AND o.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'order number % is already in use', v_order_number
      USING ERRCODE = '23505';
  END IF;

  NEW.order_number := v_order_number;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_unique_order_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_unique_order_number() TO authenticated;

DROP TRIGGER IF EXISTS orders_guard_unique_order_number ON public.orders;
CREATE TRIGGER orders_guard_unique_order_number
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_unique_order_number();
