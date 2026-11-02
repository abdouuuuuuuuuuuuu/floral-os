-- Bug: archiving an order hid it from the lists but left its cash-in sitting
-- in the register, so the money kept counting in the day's totals (the totals
-- are summed straight from cash_register, with no order-status check), and its
-- earned petals stayed on the customer.
--
-- Fix: when an order is archived, reverse its remaining money out of the
-- register and reverse its net earned petals.
--
-- Cash is reversed by the NET still in the register per payment method, so an
-- order that was already cancelled (void already wrote a cash_out refund for
-- cash) nets to zero and produces no extra rows. Reversals are themselves
-- cash_register rows, so the live totals and the daily_cash_summary view stay
-- consistent with no change to the read queries. A reversal lands on the
-- original day while it is still open; if that day is already closed (counted
-- and reconciled), it lands on the current day, so a closed day is never
-- rewritten.

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
  v_today date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_row record;
  v_src_date date;
  v_target date;
  v_reversed integer := 0;
  v_net_points integer := 0;
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

  -- Reverse the NET still in the register, per payment method. A cancelled
  -- order (void already refunded its cash) nets to zero and yields no rows.
  -- Prior reversal rows are excluded so this can never double-reverse.
  FOR v_row IN
    SELECT payment_method,
      sum(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE -amount END) AS net
    FROM public.cash_register
    WHERE order_id = p_order_id
      AND transaction_type IN ('cash_in', 'cash_out')
      AND coalesce(category, '') <> 'Archived order reversal'
    GROUP BY payment_method
    HAVING sum(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE -amount END) <> 0
  LOOP
    SELECT max(register_date) INTO v_src_date
    FROM public.cash_register
    WHERE order_id = p_order_id
      AND coalesce(payment_method, '') = coalesce(v_row.payment_method, '')
      AND transaction_type IN ('cash_in', 'cash_out')
      AND coalesce(category, '') <> 'Archived order reversal';

    v_target := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.cash_register c
        WHERE c.register_date = v_src_date AND c.transaction_type = 'closing'
      ) THEN v_today
      ELSE v_src_date
    END;

    INSERT INTO public.cash_register (
      transaction_type, amount, description, category, payment_method,
      register_date, user_id, created_by, order_id
    ) VALUES (
      CASE WHEN v_row.net > 0 THEN 'cash_out' ELSE 'cash_in' END,
      abs(v_row.net),
      format('Archived Order #%s — reversed from %s', v_order.order_number, v_src_date),
      'Archived order reversal',
      v_row.payment_method,
      v_target, v_user_id, v_user_id, p_order_id
    );
    v_reversed := v_reversed + 1;
  END LOOP;

  -- Reverse the order's net earned petals (also undoes any petals it redeemed),
  -- so an archived/fake sale no longer rewards the customer.
  IF v_order.customer_id IS NOT NULL THEN
    SELECT coalesce(sum(points_delta), 0) INTO v_net_points
    FROM public.customer_loyalty_transactions
    WHERE order_id = p_order_id;

    IF v_net_points <> 0 THEN
      INSERT INTO public.customer_loyalty_transactions
        (customer_id, order_id, transaction_type, points_delta, note, created_by)
      VALUES (v_order.customer_id, p_order_id, 'adjustment', -v_net_points,
        'Petals reversed because the order was archived', v_user_id);
    END IF;
  END IF;

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
      'cash_rows_reversed', v_reversed,
      'petals_reversed', v_net_points,
      'deleted_at', now()
    )
  );

  RETURN jsonb_build_object('archived', true, 'order_id', p_order_id,
    'cash_rows_reversed', v_reversed, 'petals_reversed', v_net_points);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_archive_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_archive_order(uuid, text) TO authenticated;
