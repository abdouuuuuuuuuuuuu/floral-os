-- Shop rules decided on 2026-10-31:
-- 1. A cashier may discount an order by at most 20% below catalog prices.
--    Larger discounts need an owner, manager or florist account. Petal
--    (loyalty) rewards do not count toward the limit.
-- 2. Once today's register is closed, later payments and refunds on existing
--    orders are refused until the next opening. New after-hours sales keep
--    their existing carry-into-next-opening behaviour.
-- 3. The register may be opened with 0 DA (the app asks for confirmation).
--
-- Rules 2 and 3 patch the live function definitions in place, like the
-- 50-point loyalty migration, and stop if a definition is not as expected.

-- ─── 1. Cashier discount limit ──────────────────────────────────────────────
-- A deferred constraint trigger runs at commit, after every order line,
-- adjustment and petal redemption of the transaction has been written, so it
-- covers creation, loyalty orders and edits without replacing those RPCs.
CREATE OR REPLACE FUNCTION public.blossom_enforce_cashier_discount_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit constant numeric := 0.20;
  v_role text;
  v_order public.orders%ROWTYPE;
  v_catalog numeric;
  v_petal_credit numeric;
  v_charged numeric;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF coalesce(v_role, '') <> 'cashier' THEN RETURN NULL; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.id;
  IF NOT FOUND OR v_order.status = 'cancelled' THEN RETURN NULL; END IF;

  SELECT coalesce(sum(oi.quantity * round(coalesce(p.retail_price, oi.unit_price))), 0)
  INTO v_catalog
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.product_id = oi.product_id
  WHERE oi.order_id = NEW.id;
  IF v_catalog <= 0 THEN RETURN NULL; END IF;

  -- The redemption note records the DA value applied at the time.
  SELECT coalesce(sum(substring(note FROM 'for ([0-9]+) DA off')::numeric), 0)
  INTO v_petal_credit
  FROM public.customer_loyalty_transactions
  WHERE order_id = NEW.id AND transaction_type = 'redeem';

  v_charged := coalesce(v_order.total_amount, 0) - coalesce(v_order.tax_amount, 0) + v_petal_credit;
  IF v_charged < v_catalog * (1 - v_limit) THEN
    RAISE EXCEPTION 'discount exceeds the cashier limit of 20%%; a manager must apply this price'
      USING errcode = '42501';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_enforce_cashier_discount_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_cashier_discount_limit ON public.orders;
CREATE CONSTRAINT TRIGGER orders_cashier_discount_limit
  AFTER INSERT OR UPDATE OF total_amount, subtotal_amount, price_adjustment
  ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.blossom_enforce_cashier_discount_limit();

-- ─── 2 & 3. Register rules ──────────────────────────────────────────────────
DO $migration$
DECLARE
  v_definition text;
  v_anchor text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.record_order_payment(uuid,uuid,numeric,text,text,text)'::regprocedure
  );
  v_anchor := 'RAISE EXCEPTION ''payments cannot be recorded on a cancelled order'';
  END IF;';
  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected record_order_payment definition; update the register rules migration.';
  END IF;
  v_definition := replace(v_definition, v_anchor, v_anchor || '
  IF EXISTS (
    SELECT 1 FROM public.cash_register
    WHERE register_date = (now() AT TIME ZONE ''Africa/Algiers'')::date
      AND transaction_type = ''closing''
  ) THEN
    RAISE EXCEPTION ''the register is closed for today; record this after the next opening'';
  END IF;');
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(
    'public.open_cash_register_with_after_hours(numeric)'::regprocedure
  );
  v_anchor := 'IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION ''opening balance must be greater than zero'';';
  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected open_cash_register_with_after_hours definition; update the register rules migration.';
  END IF;
  v_definition := replace(v_definition, v_anchor, 'IF v_amount IS NULL OR v_amount < 0 THEN
    RAISE EXCEPTION ''opening balance cannot be negative'';');
  EXECUTE v_definition;
END;
$migration$;
