-- Closes the fraud and balance gaps in Blossom Petals:
--   1. Spending petals needs the customer's card, or an owner or manager and a reason.
--   2. Every redemption and manual correction appears in the owner activity log.
--   3. Owners can correct a balance, with a required reason.
--   4. Spent petals always go back to the customer who spent them.
--   5. A petal discount can't be edited away while the petals stay spent.
--   6. Deleting a customer can't erase their petal history.
--   7. Linking a card can't skip the recorded server step.
--
-- Apply this after 20261103100000. The app must be rebuilt afterwards: the old
-- redemption call no longer exists, so an old build can't spend petals.

-- ─── 1. Spending petals needs proof ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.blossom_create_loyalty_order(jsonb, jsonb, uuid, integer);

CREATE OR REPLACE FUNCTION public.blossom_create_loyalty_order(
  p_order jsonb,
  p_items jsonb,
  p_request_id uuid,
  p_points_to_redeem integer,
  p_card_code text DEFAULT NULL,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_customer_id integer;
  v_customer_name text;
  v_balance bigint;
  v_discount integer;
  v_order jsonb;
  v_order_id uuid;
  v_order_payload jsonb;
  v_existing boolean;
  v_base_total numeric;
  v_role text;
  v_active boolean;
  v_card_code text := nullif(upper(btrim(coalesce(p_card_code, ''))), '');
  v_reason text := nullif(left(btrim(coalesce(p_override_reason, '')), 500), '');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create orders';
  END IF;
  IF p_request_id IS NULL OR p_points_to_redeem IS NULL OR p_points_to_redeem < 50
     OR p_points_to_redeem % 50 <> 0 THEN
    RAISE EXCEPTION 'redeem petals in multiples of 50';
  END IF;
  IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid order payload';
  END IF;

  v_customer_id := nullif(p_order->>'customer_id', '')::integer;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'a customer profile is required to redeem petals'; END IF;
  v_discount := p_points_to_redeem * 10;
  SELECT coalesce(sum((item->>'quantity')::numeric * (item->>'unit_price')::numeric), 0)
       + coalesce(nullif(p_order->>'tax_amount', '')::numeric, 0)
       + coalesce(nullif(p_order->>'price_adjustment', '')::numeric, 0)
    INTO v_base_total
  FROM jsonb_array_elements(p_items) AS lines(item);
  IF v_discount > greatest(0, v_base_total) THEN
    RAISE EXCEPTION 'petal reward is greater than the order total';
  END IF;
  v_order_payload := jsonb_set(
    p_order,
    '{price_adjustment}',
    to_jsonb(coalesce(nullif(p_order->>'price_adjustment', '')::integer, 0) - v_discount),
    true
  );

  -- Serialize redemptions for this customer and make retries idempotent.
  SELECT full_name INTO v_customer_name FROM public.customers WHERE customer_id = v_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.customer_loyalty_transactions
    WHERE request_id = p_request_id AND transaction_type = 'redeem'
  ) INTO v_existing;

  IF NOT v_existing THEN
    IF v_card_code IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.customer_loyalty_cards
        WHERE code = v_card_code AND customer_id = v_customer_id
      ) THEN
        RAISE EXCEPTION 'this card does not belong to this customer';
      END IF;
    ELSIF v_role NOT IN ('owner', 'manager') THEN
      RAISE EXCEPTION 'scan the customer''s loyalty card to use petals';
    ELSIF v_reason IS NULL THEN
      RAISE EXCEPTION 'give a reason for using petals without the card';
    END IF;

    SELECT coalesce(sum(points_delta), 0) INTO v_balance
    FROM public.customer_loyalty_transactions WHERE customer_id = v_customer_id;
    IF v_balance < p_points_to_redeem THEN
      RAISE EXCEPTION 'not enough petals; this customer currently has %', greatest(v_balance, 0);
    END IF;
  END IF;

  v_order := public.blossom_create_order(v_order_payload, p_items, p_request_id);
  v_order_id := nullif(v_order->'order'->>'id', '')::uuid;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'order creation returned no order id'; END IF;

  IF NOT v_existing THEN
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, request_id, transaction_type, points_delta, note, created_by)
    VALUES (
      v_customer_id, v_order_id, p_request_id, 'redeem', -p_points_to_redeem,
      format('Redeemed %s petals for %s DA off Order #%s', p_points_to_redeem, v_discount, v_order->'order'->>'order_number'),
      v_user_id
    );

    INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
    VALUES (
      v_user_id::text, 'redeem_petals', 'customer_loyalty_transactions', NULL,
      jsonb_build_object(
        'customer_id', v_customer_id, 'customer_name', v_customer_name,
        'order_number', v_order->'order'->>'order_number',
        'points', p_points_to_redeem, 'discount', v_discount,
        'card_code', v_card_code, 'reason', v_reason
      )
    );
  END IF;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_loyalty_order(jsonb, jsonb, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_create_loyalty_order(jsonb, jsonb, uuid, integer, text, text) TO authenticated;

-- ─── 2. Owner corrections ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.blossom_adjust_customer_petals(
  p_customer_id integer,
  p_points integer,
  p_reason text,
  p_request_id uuid
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
  v_customer_name text;
  v_balance bigint;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an owner can correct petals';
  END IF;
  IF p_customer_id IS NULL OR p_request_id IS NULL OR coalesce(p_points, 0) = 0 THEN
    RAISE EXCEPTION 'customer and a number of petals other than zero are required';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'give a reason for this correction'; END IF;

  SELECT full_name INTO v_customer_name FROM public.customers WHERE customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;

  SELECT coalesce(sum(points_delta), 0) INTO v_balance
  FROM public.customer_loyalty_transactions WHERE customer_id = p_customer_id;

  -- A retry of a correction that already went through changes nothing.
  IF EXISTS (SELECT 1 FROM public.customer_loyalty_transactions WHERE request_id = p_request_id) THEN
    RETURN jsonb_build_object('balance', v_balance, 'already_applied', true);
  END IF;

  IF v_balance + p_points < 0 THEN
    RAISE EXCEPTION 'this would leave the customer below zero; they have % petals', greatest(v_balance, 0);
  END IF;

  INSERT INTO public.customer_loyalty_transactions
    (customer_id, request_id, transaction_type, points_delta, note, created_by)
  VALUES (p_customer_id, p_request_id, 'adjustment', p_points,
    'Manual correction: ' || v_reason, v_user_id);

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_user_id::text, 'adjust_petals', 'customer_loyalty_transactions',
    jsonb_build_object('balance', v_balance),
    jsonb_build_object(
      'customer_id', p_customer_id, 'customer_name', v_customer_name,
      'points', p_points, 'reason', v_reason, 'balance', v_balance + p_points
    )
  );

  RETURN jsonb_build_object('balance', v_balance + p_points);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_adjust_customer_petals(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_adjust_customer_petals(integer, integer, text, uuid) TO authenticated;

-- ─── 3. Show redemptions and corrections in the activity log ────────────────
DO $migration$
DECLARE
  c_kind CONSTANT text := $t$WHEN ar.action IN ('assign_loyalty_card', 'unlink_loyalty_card') THEN 'loyalty'$t$;
  c_label CONSTANT text := $t$WHEN 'loyalty' THEN CASE WHEN d.action = 'unlink_loyalty_card' THEN 'Loyalty card unlinked' ELSE 'Loyalty card linked' END$t$;
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.blossom_activity_feed(timestamptz,timestamptz,uuid,text,integer)'::regprocedure
  );
  IF position(c_kind IN v_definition) = 0 OR position(c_label IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected blossom_activity_feed definition; update the loyalty fixes migration.';
  END IF;
  v_definition := replace(v_definition, c_kind,
    $t$WHEN ar.action IN ('assign_loyalty_card', 'unlink_loyalty_card', 'redeem_petals', 'adjust_petals') THEN 'loyalty'$t$);
  v_definition := replace(v_definition, c_label,
    $t$WHEN 'loyalty' THEN CASE d.action
        WHEN 'unlink_loyalty_card' THEN 'Loyalty card unlinked'
        WHEN 'redeem_petals' THEN (d.nv->>'points') || ' petals spent for ' || (d.nv->>'discount') || ' DA off'
          || coalesce(' · Order #' || d.order_no, '')
          || CASE WHEN d.nv->>'card_code' IS NULL THEN ' · no card' ELSE '' END
        WHEN 'adjust_petals' THEN 'Petals corrected by ' || (d.nv->>'points')
        ELSE 'Loyalty card linked' END$t$);
  EXECUTE v_definition;
END;
$migration$;

-- ─── 4. Spent petals go back to whoever spent them ──────────────────────────
-- An order's customer can change after it spent petals, so the current customer
-- is not always the one who is owed them.
CREATE OR REPLACE FUNCTION public.blossom_sync_spent_petals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_returned CONSTANT text := 'Spent petals returned because the order was cancelled';
  c_retaken CONSTANT text := 'Spent petals taken again because the order was reopened';
  v_row record;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT (NEW.status = 'cancelled' OR OLD.status = 'cancelled') THEN RETURN NEW; END IF;

  FOR v_row IN
    SELECT customer_id,
      coalesce(sum(-points_delta) FILTER (WHERE transaction_type = 'redeem'), 0)::integer AS spent,
      coalesce(sum(points_delta) FILTER (WHERE note IN (c_returned, c_retaken)), 0)::integer AS returned
    FROM public.customer_loyalty_transactions
    WHERE order_id = NEW.id
    GROUP BY customer_id
  LOOP
    IF NEW.status = 'cancelled' AND v_row.spent - v_row.returned > 0 THEN
      INSERT INTO public.customer_loyalty_transactions
        (customer_id, order_id, transaction_type, points_delta, note, created_by)
      VALUES (v_row.customer_id, NEW.id, 'adjustment', v_row.spent - v_row.returned, c_returned, auth.uid());
    ELSIF OLD.status = 'cancelled' AND v_row.returned > 0 THEN
      INSERT INTO public.customer_loyalty_transactions
        (customer_id, order_id, transaction_type, points_delta, note, created_by)
      VALUES (v_row.customer_id, NEW.id, 'adjustment', -v_row.returned, c_retaken, auth.uid());
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Same as 20261031150000, except the petals are reversed per customer.
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

  -- Undo what this order earned and spent, for each customer it touched, so an
  -- archived or fake sale no longer rewards anyone.
  FOR v_row IN
    SELECT customer_id, sum(points_delta)::integer AS net
    FROM public.customer_loyalty_transactions
    WHERE order_id = p_order_id
    GROUP BY customer_id
    HAVING sum(points_delta) <> 0
  LOOP
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by)
    VALUES (v_row.customer_id, p_order_id, 'adjustment', -v_row.net,
      'Petals reversed because the order was archived', v_user_id);
    v_net_points := v_net_points + v_row.net;
  END LOOP;

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

-- ─── 5. A petal discount can't be edited away ───────────────────────────────
-- The discount lives in the order's price adjustment, next to manual discounts.
-- The amount is read from the redemption's note because the rate has changed
-- over time (100 petals = 500 DA, then 50 petals = 500 DA).
CREATE OR REPLACE FUNCTION public.blossom_protect_petal_discount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_discount integer;
BEGIN
  IF coalesce(NEW.price_adjustment, 0) <= coalesce(OLD.price_adjustment, 0)
     OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(substring(note FROM 'for ([0-9]+) DA off')::integer), 0)
  INTO v_discount
  FROM public.customer_loyalty_transactions
  WHERE order_id = NEW.id AND transaction_type = 'redeem';

  IF v_discount > 0 AND coalesce(NEW.price_adjustment, 0) > -v_discount THEN
    RAISE EXCEPTION 'This order has a % DA petal reward, so its adjustment must stay at -% DA or lower. To undo the reward, cancel the order.',
      v_discount, v_discount;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.blossom_protect_petal_discount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_protect_petal_discount ON public.orders;
CREATE TRIGGER orders_protect_petal_discount
  BEFORE UPDATE OF price_adjustment ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_protect_petal_discount();

-- ─── 6. Deleting a customer can't erase their petal history ─────────────────
ALTER TABLE public.customer_loyalty_transactions
  DROP CONSTRAINT IF EXISTS customer_loyalty_transactions_customer_id_fkey,
  ADD CONSTRAINT customer_loyalty_transactions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id) ON DELETE RESTRICT;

-- ─── 7. Linking a card always goes through the recorded server step ─────────
DROP POLICY IF EXISTS customer_loyalty_cards_staff_assign ON public.customer_loyalty_cards;
REVOKE UPDATE ON TABLE public.customer_loyalty_cards FROM authenticated;
