-- Duplicate protection for removing stock and recording flower waste.
--
-- remove_product_stock and record_flower_waste take stock away on every call.
-- If the connection drops after the server saved but before the till heard
-- back, a retry removed the stock a second time. Sales, payments and cash
-- entries already carry a request id; these two did not.
--
-- This adds a 4-argument version of each that takes p_request_id. The first
-- call with an id runs the original and stores its result; a repeat with the
-- same id returns that stored result and changes nothing.
--
-- The original 3-argument functions are NOT changed, so tills still running an
-- older app version keep working while this is applied (no downtime, no
-- forced update). Safe to run more than once. Runs as one transaction.

BEGIN;

-- ─── Results of requests already processed ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blossom_request_results (
  actor_id    uuid        NOT NULL,
  request_id  uuid        NOT NULL,
  action      text        NOT NULL,
  fingerprint text        NOT NULL,
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_id)
);
-- Written and read only by the functions below, never by the app directly.
ALTER TABLE public.blossom_request_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blossom_request_results FROM PUBLIC, anon, authenticated;

-- ─── Remove stock (damaged / spoiled) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_product_stock(
  p_product_id integer,
  p_quantity integer,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_fingerprint text;
  v_saved public.blossom_request_results%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  IF p_request_id IS NULL THEN
    RETURN public.remove_product_stock(p_product_id, p_quantity, coalesce(p_reason, 'Damaged/Spoiled'));
  END IF;

  v_fingerprint := md5(concat_ws('|', 'remove_product_stock', p_product_id, p_quantity, coalesce(p_reason, '')));
  -- Two copies of the same request arriving together wait for each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || '|' || p_request_id::text, 0));

  SELECT * INTO v_saved FROM public.blossom_request_results
  WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_saved.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for a different action';
    END IF;
    RETURN v_saved.result;
  END IF;

  v_result := public.remove_product_stock(p_product_id, p_quantity, coalesce(p_reason, 'Damaged/Spoiled'));

  INSERT INTO public.blossom_request_results (actor_id, request_id, action, fingerprint, result)
  VALUES (v_actor, p_request_id, 'remove_product_stock', v_fingerprint, v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_product_stock(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_product_stock(integer, integer, text, uuid) TO authenticated;

-- ─── Flower waste ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_flower_waste(
  p_product_id integer,
  p_quantity integer,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_fingerprint text;
  v_saved public.blossom_request_results%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_request_id IS NULL THEN
    RETURN public.record_flower_waste(p_product_id, p_quantity, coalesce(p_reason, 'Other'));
  END IF;

  v_fingerprint := md5(concat_ws('|', 'record_flower_waste', p_product_id, p_quantity, coalesce(p_reason, '')));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || '|' || p_request_id::text, 0));

  SELECT * INTO v_saved FROM public.blossom_request_results
  WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_saved.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for a different action';
    END IF;
    RETURN v_saved.result;
  END IF;

  v_result := public.record_flower_waste(p_product_id, p_quantity, coalesce(p_reason, 'Other'));

  INSERT INTO public.blossom_request_results (actor_id, request_id, action, fingerprint, result)
  VALUES (v_actor, p_request_id, 'record_flower_waste', v_fingerprint, v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_flower_waste(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_flower_waste(integer, integer, text, uuid) TO authenticated;

COMMIT;

-- Check: both should return 2 (the original and the new version).
SELECT proname, count(*) AS versions
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname IN ('remove_product_stock', 'record_flower_waste')
GROUP BY proname;
