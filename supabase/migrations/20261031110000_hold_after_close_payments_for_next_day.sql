-- Payments recorded after today's register is closed are accepted, and their
-- cash-in goes to the next day's register instead of the closed one. Refunds
-- after close are held the same way as cash-out. If the shop does not open
-- the next day, the next opening moves held entries onto its own date, like
-- after-hours orders.
--
-- Safe to run whether or not an earlier draft of 20261031100000 (which
-- refused these payments) was applied: that check is removed if present.

CREATE OR REPLACE FUNCTION public.blossom_register_closed_today()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cash_register
    WHERE register_date = (now() AT TIME ZONE 'Africa/Algiers')::date
      AND transaction_type = 'closing'
  );
$$;

REVOKE ALL ON FUNCTION public.blossom_register_closed_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_register_closed_today() TO authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_anchor text;
BEGIN
  -- ─── record_order_payment: date held entries to the next day ─────────────
  v_definition := pg_get_functiondef(
    'public.record_order_payment(uuid,uuid,numeric,text,text,text)'::regprocedure
  );

  IF position('After-hours payments' IN v_definition) = 0 THEN
    -- Remove the earlier draft's refusal, if it was applied.
    v_definition := replace(v_definition,
      'IF EXISTS (SELECT 1 FROM public.cash_register'
      || ' WHERE register_date = (now() AT TIME ZONE ''Africa/Algiers'')::date'
      || ' AND transaction_type = ''closing'') THEN'
      || ' RAISE EXCEPTION ''the register is closed for today; record this after the next opening'';'
      || ' END IF; ', '');

    v_anchor := 'v_category, v_method, (now() AT TIME ZONE ''Africa/Algiers'')::date,';
    IF position(v_anchor IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected record_order_payment definition; update the held payments migration.';
    END IF;
    v_definition := replace(v_definition, v_anchor,
      'CASE WHEN public.blossom_register_closed_today()'
      || ' THEN CASE WHEN v_type = ''cash_out'' THEN ''After-hours refunds'' ELSE ''After-hours payments'' END'
      || ' ELSE v_category END,'
      || ' v_method,'
      || ' (now() AT TIME ZONE ''Africa/Algiers'')::date'
      || ' + CASE WHEN public.blossom_register_closed_today() THEN 1 ELSE 0 END,');
    EXECUTE v_definition;
  END IF;

  -- ─── Opening: move held entries onto the opening date ────────────────────
  v_definition := pg_get_functiondef(
    'public.open_cash_register_with_after_hours(numeric)'::regprocedure
  );

  IF position('After-hours payments' IN v_definition) = 0 THEN
    v_anchor := 'END LOOP;';
    IF position(v_anchor IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected open_cash_register_with_after_hours definition; update the held payments migration.';
    END IF;
    -- Held entries are dated after the last closed day; anything dated between
    -- that day and today belongs to this opening.
    v_definition := replace(v_definition, v_anchor, v_anchor
      || ' UPDATE public.cash_register SET register_date = v_register_date'
      || ' WHERE category IN (''After-hours payments'', ''After-hours refunds'')'
      || ' AND register_date < v_register_date'
      || ' AND register_date > coalesce((SELECT max(c.register_date) FROM public.cash_register c'
      || ' WHERE c.transaction_type = ''closing'' AND c.register_date < v_register_date), DATE ''2000-01-01'');');
    EXECUTE v_definition;
  END IF;
END;
$migration$;
