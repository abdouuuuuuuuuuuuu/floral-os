-- Track orders created after the register has been closed so their receipts
-- can be carried into the next opening day's cash-in ledger exactly once.
CREATE TABLE IF NOT EXISTS public.cash_register_after_hours_orders (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  closed_register_date date NOT NULL,
  captured_at timestamptz NOT NULL,
  processed_register_date date,
  processed_at timestamptz
);

REVOKE ALL ON TABLE public.cash_register_after_hours_orders FROM PUBLIC, anon, authenticated;
ALTER TABLE public.cash_register_after_hours_orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.capture_after_hours_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_register_date date := (NEW.created_at AT TIME ZONE 'Africa/Algiers')::date;
  v_closed_at timestamptz;
BEGIN
  SELECT created_at INTO v_closed_at
  FROM public.cash_register
  WHERE register_date = v_register_date
    AND transaction_type = 'closing'
    AND created_at < NEW.created_at
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_closed_at IS NOT NULL THEN
    INSERT INTO public.cash_register_after_hours_orders (order_id, closed_register_date, captured_at)
    VALUES (NEW.id, v_register_date, NEW.created_at)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_after_hours_order ON public.orders;
CREATE TRIGGER capture_after_hours_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_after_hours_order();

CREATE OR REPLACE FUNCTION public.open_cash_register_with_after_hours(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_register_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_amount integer := round(p_amount)::integer;
  v_carry record;
  v_items text;
  v_description text;
  v_moved_count integer := 0;
  v_opening_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'must be signed in';
  END IF;

  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can open the cash register';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'opening balance must be greater than zero';
  END IF;
  -- Serialize first, then check: checking before taking this lock lets two
  -- simultaneous opening requests both pass and create duplicate balances.
  PERFORM pg_advisory_xact_lock(hashtext('cash-register-opening'), v_register_date - DATE '2000-01-01');

  IF EXISTS (
    SELECT 1 FROM public.cash_register
    WHERE register_date = v_register_date AND transaction_type = 'opening'
  ) THEN
    RAISE EXCEPTION 'opening balance is already set for today';
  END IF;

  FOR v_carry IN
    SELECT q.order_id, q.closed_register_date, o.order_number, o.client_name,
           o.client_phone, o.created_at, o.delivery_date, o.delivery_time,
           o.delivery_method, o.total_amount, o.amount_paid,
           o.payment_status, o.payment_method, o.notes
    FROM public.cash_register_after_hours_orders q
    JOIN public.orders o ON o.id = q.order_id
    WHERE q.processed_at IS NULL
      AND q.closed_register_date < v_register_date
    ORDER BY q.captured_at, q.order_id
    FOR UPDATE OF q
  LOOP
    SELECT string_agg(
      format('%s × %s @ %s DA', coalesce(product_name, 'Product'), quantity, unit_price),
      ', ' ORDER BY product_name
    ) INTO v_items
    FROM public.order_items
    WHERE order_id = v_carry.order_id;

    v_description := left(format(
      'After-hours order #%s · %s · Created %s · %s · Delivery %s %s (%s) · Total %s DA · Paid %s DA · Items: %s%s',
      v_carry.order_number,
      coalesce(v_carry.client_name, 'Walk-in customer'),
      to_char(v_carry.created_at AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD HH24:MI'),
      coalesce(v_carry.payment_status, 'unpaid'),
      coalesce(v_carry.delivery_date::text, 'not scheduled'),
      coalesce(v_carry.delivery_time::text, ''),
      coalesce(v_carry.delivery_method, 'unspecified'),
      coalesce(v_carry.total_amount, 0),
      coalesce(v_carry.amount_paid, 0),
      coalesce(v_items, 'No items recorded'),
      CASE WHEN nullif(v_carry.notes, '') IS NOT NULL THEN ' · Note: ' || v_carry.notes ELSE '' END
    ), 500);

    UPDATE public.cash_register
    SET register_date = v_register_date,
        category = 'After-hours Orders',
        description = v_description
    WHERE order_id = v_carry.order_id
      AND transaction_type = 'cash_in'
      AND created_at >= v_carry.created_at;

    IF NOT FOUND AND coalesce(v_carry.amount_paid, 0) > 0 THEN
      INSERT INTO public.cash_register (
        transaction_type, amount, description, category, payment_method,
        register_date, user_id, order_id
      ) VALUES (
        'cash_in', round(v_carry.amount_paid)::integer, v_description,
        'After-hours Orders', v_carry.payment_method,
        v_register_date, v_user_id, v_carry.order_id
      );
    END IF;

    UPDATE public.cash_register_after_hours_orders
    SET processed_register_date = v_register_date,
        processed_at = now()
    WHERE order_id = v_carry.order_id;

    v_moved_count := v_moved_count + 1;
  END LOOP;

  INSERT INTO public.cash_register (
    transaction_type, amount, description, category, register_date, user_id
  ) VALUES (
    'opening', v_amount, 'Opening balance', 'Opening', v_register_date, v_user_id
  ) RETURNING id INTO v_opening_id;

  RETURN jsonb_build_object(
    'opening_transaction_id', v_opening_id,
    'register_date', v_register_date,
    'after_hours_orders', v_moved_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_register_with_after_hours(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cash_register_with_after_hours(numeric) TO authenticated;
