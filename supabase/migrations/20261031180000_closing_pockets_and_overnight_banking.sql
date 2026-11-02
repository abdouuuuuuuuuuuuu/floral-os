-- Register reconciliation, production hardening:
-- 1. Persist the per-pocket counts entered at closing (cash / BaridiMob / USD),
--    so each rail can be reconciled on its own line in history, not just the
--    summed total.
-- 2. Record overnight banking: money removed from the drawer at night is
--    stored as a 'Banked overnight' cash-out, and the closing balance becomes
--    the float that stays in the drawer. That keeps the day's real variance
--    intact while making closing == next morning's opening, so the carry check
--    is meaningful.

ALTER TABLE public.cash_register
  ADD COLUMN IF NOT EXISTS counted_cash integer,
  ADD COLUMN IF NOT EXISTS counted_baridimob integer,
  ADD COLUMN IF NOT EXISTS counted_usd integer,
  ADD COLUMN IF NOT EXISTS banked_overnight integer;

CREATE OR REPLACE FUNCTION public.blossom_close_cash_register(
  p_cash numeric,
  p_baridimob numeric,
  p_usd numeric,
  p_banked numeric DEFAULT 0
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
  v_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_cash integer := round(coalesce(p_cash, 0))::integer;
  v_baridi integer := round(coalesce(p_baridimob, 0))::integer;
  v_usd integer := round(coalesce(p_usd, 0))::integer;
  v_banked integer := round(coalesce(p_banked, 0))::integer;
  v_counted integer;
  v_float integer;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an active owner can close the cash register';
  END IF;
  IF v_cash < 0 OR v_baridi < 0 OR v_usd < 0 OR v_banked < 0 THEN
    RAISE EXCEPTION 'counted amounts cannot be negative';
  END IF;

  v_counted := v_cash + v_baridi + v_usd;
  IF v_banked > v_counted THEN
    RAISE EXCEPTION 'banked amount cannot exceed the counted total';
  END IF;
  v_float := v_counted - v_banked;

  PERFORM pg_advisory_xact_lock(hashtext('cash-register-closing'), v_date - DATE '2000-01-01');
  IF NOT EXISTS (SELECT 1 FROM public.cash_register WHERE register_date = v_date AND transaction_type = 'opening') THEN
    RAISE EXCEPTION 'set today’s opening balance before closing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_register WHERE register_date = v_date AND transaction_type = 'closing') THEN
    RAISE EXCEPTION 'cash register is already closed for today';
  END IF;

  -- Banked money leaves the drawer. Recording it as a cash-out keeps the day's
  -- variance correct (expected drops by the banked amount, closing is the
  -- float), with no change to the summary view.
  IF v_banked > 0 THEN
    INSERT INTO public.cash_register (
      transaction_type, amount, description, category, payment_method,
      register_date, user_id, created_by
    ) VALUES (
      'cash_out', v_banked, 'Banked overnight', 'Banked overnight', 'cash',
      v_date, v_user_id, v_user_id
    );
  END IF;

  INSERT INTO public.cash_register (
    transaction_type, amount, description, category, register_date, user_id,
    counted_cash, counted_baridimob, counted_usd, banked_overnight
  ) VALUES (
    'closing', v_float, 'Closing balance', 'Closing', v_date, v_user_id,
    v_cash, v_baridi, v_usd, v_banked
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'closing_transaction_id', v_id,
    'register_date', v_date,
    'counted_total', v_counted,
    'banked', v_banked,
    'closing_float', v_float
  );
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_close_cash_register(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_close_cash_register(numeric, numeric, numeric, numeric) TO authenticated;
