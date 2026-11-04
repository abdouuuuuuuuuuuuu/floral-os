-- Blossom Petals are now earned per flower, not per 100 DA:
--   lily                                  3 petals each
--   rose                                  2 petals each
--   chrysanthemum, alstroemeria, branch
--   and any other flower                  1 petal each
--   anything that is not a flower         0 petals
--   a bouquet                             the petals of the flowers inside it
-- An order earns its petals once it is fully paid and has a customer.
--
-- Orders that already exist stay on the money rule, so no current balance
-- changes and a later edit, cancel or refund still reverses the right amount.
-- The redemption rate (50 petals = 500 DA) is not changed here.

-- ─── 1. Which rule each order uses ──────────────────────────────────────────
-- Adding the column with 'money' marks every existing order. Changing the
-- default afterwards puts every new order on the flower rule, without having
-- to touch the order creation functions.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_scheme text NOT NULL DEFAULT 'money';
ALTER TABLE public.orders
  ALTER COLUMN loyalty_scheme SET DEFAULT 'per_flower';
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_loyalty_scheme_check,
  ADD CONSTRAINT orders_loyalty_scheme_check CHECK (loyalty_scheme IN ('money', 'per_flower'));

-- Marks the ledger rows written by the flower rule, so spent petals and
-- reversals are never mistaken for earnings.
ALTER TABLE public.customer_loyalty_transactions
  ADD COLUMN IF NOT EXISTS is_flower_earning boolean NOT NULL DEFAULT false;

-- What a bouquet contains. All zero means the product is sold as a single item.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bouquet_lilies integer NOT NULL DEFAULT 0 CHECK (bouquet_lilies >= 0),
  ADD COLUMN IF NOT EXISTS bouquet_roses integer NOT NULL DEFAULT 0 CHECK (bouquet_roses >= 0),
  ADD COLUMN IF NOT EXISTS bouquet_other_flowers integer NOT NULL DEFAULT 0 CHECK (bouquet_other_flowers >= 0);

-- A bouquet's petals when it was sold, so changing its contents later never
-- changes what an earlier order earned. Empty for anything else.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS bouquet_petals_per_unit integer;

-- A trigger, so every path that adds an order line is covered.
CREATE OR REPLACE FUNCTION public.blossom_set_line_bouquet_petals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT nullif(3 * bouquet_lilies + 2 * bouquet_roses + bouquet_other_flowers, 0)
  INTO NEW.bouquet_petals_per_unit
  FROM public.products
  WHERE product_id = NEW.product_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.blossom_set_line_bouquet_petals() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_set_bouquet_petals ON public.order_items;
CREATE TRIGGER order_items_set_bouquet_petals
  BEFORE INSERT OR UPDATE OF product_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.blossom_set_line_bouquet_petals();

-- ─── 2. Petals for one unit of a product ────────────────────────────────────
-- Same reading order as the flower filters in Cart.jsx: flower type, then
-- category, then the product name for items kept in the general Flowers
-- category. Whole-word matching keeps lisianthus from counting as a lily.
CREATE OR REPLACE FUNCTION public.blossom_loyalty_points_per_unit(
  p_category text,
  p_flower_type text,
  p_name text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_from CONSTANT text := 'àâäéèêëîïôöùûüç';
  v_to CONSTANT text := 'aaaeeeeiioouuuc';
  v_category text := translate(lower(btrim(coalesce(p_category, ''))), v_from, v_to);
  v_type text := translate(lower(btrim(coalesce(p_flower_type, ''))), v_from, v_to);
  v_name text := translate(lower(btrim(coalesce(p_name, ''))), v_from, v_to);
  v_in_flowers boolean;
  v_text text;
BEGIN
  v_in_flowers := v_category IN ('flowers', 'flower', 'fleurs', 'fleur');
  v_text := v_type || ' ' || v_category || CASE WHEN v_in_flowers THEN ' ' || v_name ELSE '' END;

  IF v_text ~ '\m(lily|lilies|lys|lis)\M' THEN RETURN 3; END IF;
  -- Checked before roses, because "rose" is also the French word for pink.
  IF v_text ~ '\m(chrys|branch|alstr)' THEN RETURN 1; END IF;
  -- A name only counts when no flower type is set: a "Gerbera rose" is a pink gerbera.
  IF (v_type || ' ' || v_category) ~ '\m(rose|roses)\M'
     OR (v_in_flowers AND v_type = '' AND v_name ~ '\m(rose|roses)\M') THEN
    RETURN 2;
  END IF;
  IF v_in_flowers OR (v_type <> '' AND v_category IN ('', 'uncategorized')) THEN RETURN 1; END IF;
  RETURN 0;
END;
$$;

-- ─── 3. Keep an order's petals equal to what it should have earned ──────────
-- Compares the target with the ledger instead of old and new values, so it
-- gives the same result whichever change triggered it and however often it runs.
CREATE OR REPLACE FUNCTION public.blossom_sync_order_flower_petals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_target integer := 0;
  v_current integer;
  v_other record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  -- blossom_archive_order reverses an archived order's petals itself, and a
  -- deleted order is handled by orders_reverse_flower_petals_on_delete.
  IF NOT FOUND OR v_order.loyalty_scheme <> 'per_flower' OR v_order.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_order.customer_id IS NOT NULL
     AND v_order.status IS DISTINCT FROM 'cancelled'
     AND coalesce(v_order.amount_paid, 0) >= coalesce(v_order.total_amount, 0)
     -- A free order earns nothing, unless petals are what made it free.
     AND (coalesce(v_order.total_amount, 0) > 0 OR EXISTS (
       SELECT 1 FROM public.customer_loyalty_transactions
       WHERE order_id = p_order_id AND transaction_type = 'redeem'
     )) THEN
    SELECT coalesce(floor(sum(
      oi.quantity * coalesce(oi.bouquet_petals_per_unit, public.blossom_loyalty_points_per_unit(
        coalesce(nullif(oi.category, ''), p.category),
        coalesce(nullif(oi.flower_type, ''), p.flower_type),
        coalesce(nullif(oi.product_name, ''), p.item_name)
      ))
    )), 0)::integer
    INTO v_target
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.product_id = oi.product_id
    WHERE oi.order_id = p_order_id;
  END IF;

  -- The order moved to another customer: take the petals back from the old one.
  FOR v_other IN
    SELECT customer_id, sum(points_delta)::integer AS net
    FROM public.customer_loyalty_transactions
    WHERE order_id = p_order_id AND is_flower_earning
      AND customer_id IS DISTINCT FROM v_order.customer_id
    GROUP BY customer_id
    HAVING sum(points_delta) <> 0
  LOOP
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by, is_flower_earning)
    VALUES (v_other.customer_id, p_order_id, 'adjustment', -v_other.net,
      'Earned petals moved with the order customer', auth.uid(), true);
  END LOOP;

  IF v_order.customer_id IS NULL THEN RETURN; END IF;

  SELECT coalesce(sum(points_delta), 0)::integer INTO v_current
  FROM public.customer_loyalty_transactions
  WHERE order_id = p_order_id AND is_flower_earning AND customer_id = v_order.customer_id;

  IF v_target <> v_current THEN
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by, is_flower_earning)
    VALUES (
      v_order.customer_id, p_order_id,
      CASE WHEN v_target > v_current THEN 'earn' ELSE 'adjustment' END,
      v_target - v_current,
      CASE WHEN v_target > v_current
        THEN 'Petals earned from the flowers in this order'
        ELSE 'Earned petals adjusted after order change, cancellation, or refund'
      END,
      auth.uid(), true
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.blossom_sync_order_flower_petals(uuid) FROM PUBLIC, anon, authenticated;

-- These run at commit, after every order line and payment of the transaction
-- has been written, like orders_cashier_discount_limit. A sale therefore gets
-- one ledger row instead of one per line.
CREATE OR REPLACE FUNCTION public.blossom_order_flower_petals_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    PERFORM public.blossom_sync_order_flower_petals(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.blossom_sync_order_flower_petals(OLD.order_id);
  ELSE
    PERFORM public.blossom_sync_order_flower_petals(NEW.order_id);
    IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
      PERFORM public.blossom_sync_order_flower_petals(OLD.order_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.blossom_order_flower_petals_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_sync_flower_petals ON public.orders;
CREATE CONSTRAINT TRIGGER orders_sync_flower_petals
  AFTER INSERT OR UPDATE OF customer_id, status, total_amount, amount_paid
  ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.blossom_order_flower_petals_trigger();

DROP TRIGGER IF EXISTS order_items_sync_flower_petals ON public.order_items;
CREATE CONSTRAINT TRIGGER order_items_sync_flower_petals
  AFTER INSERT OR UPDATE OR DELETE
  ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.blossom_order_flower_petals_trigger();

-- Permanent delete: undo whatever is still net on the order, earned and spent.
-- This runs BEFORE the delete because the foreign key clears order_id afterwards.
-- An archived order already nets to zero, so it is not reversed a second time.
CREATE OR REPLACE FUNCTION public.blossom_reverse_flower_petals_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT customer_id, sum(points_delta)::integer AS net
    FROM public.customer_loyalty_transactions
    WHERE order_id = OLD.id
    GROUP BY customer_id
    HAVING sum(points_delta) <> 0
  LOOP
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, transaction_type, points_delta, note, created_by)
    VALUES (v_row.customer_id, 'adjustment', -v_row.net,
      'Petals reversed because the order was deleted', auth.uid());
  END LOOP;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.blossom_reverse_flower_petals_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_reverse_flower_petals_on_delete ON public.orders;
CREATE TRIGGER orders_reverse_flower_petals_on_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.blossom_reverse_flower_petals_on_delete();

-- ─── 4. The money rule now only applies to orders made before this change ───
-- Deleted orders of either rule are handled by orders_reverse_flower_petals_on_delete.
CREATE OR REPLACE FUNCTION public.blossom_sync_order_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_points integer := 0;
  v_new_points integer := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.loyalty_scheme <> 'money' THEN RETURN NEW; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_points := public.blossom_loyalty_points_for_order(
      OLD.customer_id, OLD.status, OLD.total_amount, OLD.amount_paid
    );
  END IF;
  v_new_points := public.blossom_loyalty_points_for_order(
    NEW.customer_id, NEW.status, NEW.total_amount, NEW.amount_paid
  );

  IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id THEN
    IF v_new_points <> v_old_points AND NEW.customer_id IS NOT NULL THEN
      INSERT INTO public.customer_loyalty_transactions
        (customer_id, order_id, transaction_type, points_delta, note, created_by)
      VALUES (
        NEW.customer_id, NEW.id,
        CASE WHEN v_new_points > v_old_points THEN 'earn' ELSE 'adjustment' END,
        v_new_points - v_old_points,
        CASE WHEN v_new_points > v_old_points
          THEN 'Petals earned from collected order payment'
          ELSE 'Earned petals adjusted after order change, cancellation, or refund'
        END,
        auth.uid()
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT NULL AND v_old_points > 0 THEN
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by)
    VALUES (OLD.customer_id, OLD.id, 'adjustment', -v_old_points,
      'Earned petals moved with the order customer', auth.uid());
  END IF;
  IF NEW.customer_id IS NOT NULL AND v_new_points > 0 THEN
    INSERT INTO public.customer_loyalty_transactions
      (customer_id, order_id, transaction_type, points_delta, note, created_by)
    VALUES (NEW.customer_id, NEW.id, 'earn', v_new_points,
      'Petals earned from collected order payment', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
