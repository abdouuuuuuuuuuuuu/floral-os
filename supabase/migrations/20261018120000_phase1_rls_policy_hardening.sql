-- Phase 1 RLS hardening based on the supplied live policy catalog.
-- Review effective API-role table/column grants and deployed view security
-- settings before applying this migration to Supabase.
--
-- POS order/payment writes already go through role-checked SECURITY DEFINER
-- RPCs. Direct authenticated DML policies are removed from those tables so
-- table grants alone cannot bypass the RPC validation and audit paths.
-- Other direct-write surfaces still used by the client (customers, products,
-- settings, profiles, and suppliers) are left available under their own
-- policies and are handled separately in the authorization review.

-- Remove broad permissive rules that bypass the narrower debt role policies.
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.client_debts;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.debt_payments;
CREATE POLICY phase1_client_debts_active_role_limit
  ON public.client_debts
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'cashier']::text[])
  )
  WITH CHECK (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'cashier']::text[])
  );
CREATE POLICY phase1_debt_payments_active_role_limit
  ON public.debt_payments
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'cashier']::text[])
  )
  WITH CHECK (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'cashier']::text[])
  );

-- Remove broad stock-adjustment policies. Keep the existing role-scoped
-- stock_adj_insert policy and make reads available to active stock operators.
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.stock_adjustments;
DROP POLICY IF EXISTS stock_adj_select ON public.stock_adjustments;
CREATE POLICY stock_adj_select
  ON public.stock_adjustments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist']::text[])
  );
CREATE POLICY phase1_stock_adjustment_insert_role_limit
  ON public.stock_adjustments
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist']::text[])
  );

-- Audit entries are produced by the SECURITY DEFINER trigger function. Do not
-- let authenticated clients insert fabricated audit rows directly.
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;

-- Settings are owner-only in the POS role contract.
DROP POLICY IF EXISTS settings_update ON public.settings;
CREATE POLICY settings_update
  ON public.settings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.has_role(VARIADIC ARRAY['owner'::text]))
  WITH CHECK (public.has_role(VARIADIC ARRAY['owner'::text]));

-- Flower waste and spoilage records contain operational data. Require an
-- active shop-operations role for direct reads and waste inserts. The existing
-- flower_waste_insert_own policy still binds direct inserts to auth.uid().
CREATE POLICY phase1_flower_waste_read_role_limit
  ON public.flower_waste
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist']::text[])
  );

CREATE POLICY phase1_flower_waste_insert_role_limit
  ON public.flower_waste
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist']::text[])
  );

CREATE POLICY phase1_spoilage_read_role_limit
  ON public.spoilage_logs
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist']::text[])
  );

-- The client reads orders and order items directly but performs order writes
-- through the checked workflow RPCs. Remove direct table mutation policies.
DROP POLICY IF EXISTS orders_insert ON public.orders;
DROP POLICY IF EXISTS orders_update ON public.orders;
DROP POLICY IF EXISTS orders_delete ON public.orders;
DROP POLICY IF EXISTS order_items_write ON public.order_items;

-- Payment records are written through record_order_payment and related
-- SECURITY DEFINER workflows. Keep order_pay_select for any authorized reads.
DROP POLICY IF EXISTS order_pay_all ON public.order_payments;
DROP POLICY IF EXISTS order_pay_insert ON public.order_payments;
DROP POLICY IF EXISTS order_pay_modify ON public.order_payments;

-- Manual cash entries are owner-only in the POS. Replace the renderer's direct
-- INSERT path with an idempotent, validated SECURITY DEFINER RPC.
CREATE TABLE IF NOT EXISTS public.manual_cash_entry_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_fingerprint text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_cash_entry_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_cash_entry_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_manual_cash_entry(
  p_request_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_description text DEFAULT '',
  p_category text DEFAULT '',
  p_payment_method text DEFAULT 'cash',
  p_quantity numeric DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_type text := lower(btrim(coalesce(p_transaction_type, '')));
  v_method text := lower(regexp_replace(coalesce(p_payment_method, 'cash'), '[[:space:]_-]+', '', 'g'));
  v_description text := left(btrim(coalesce(p_description, '')), 500);
  v_category text := left(btrim(coalesce(p_category, '')), 100);
  v_register_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_fingerprint text;
  v_claimed_request_id uuid;
  v_existing public.manual_cash_entry_requests%ROWTYPE;
  v_entry public.cash_register%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'must be signed in' USING ERRCODE = '28000';
  END IF;
  IF public.blossom_active_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only an active owner can record manual cash entries' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request id is required';
  END IF;
  IF v_type NOT IN ('cash_in', 'cash_out') THEN
    RAISE EXCEPTION 'manual entries must be cash_in or cash_out';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount) OR p_amount > 2147483647 THEN
    RAISE EXCEPTION 'amount must be a positive whole number within the supported range';
  END IF;

  IF v_method IN ('baridi', 'baridimobile') THEN v_method := 'baridimob'; END IF;
  IF v_method IN ('dollar', 'dollars') THEN v_method := 'usd'; END IF;
  IF v_method NOT IN ('cash', 'baridimob', 'usd') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;

  IF (p_quantity IS NULL) <> (p_unit_price IS NULL) THEN
    RAISE EXCEPTION 'quantity and unit price must both be supplied or both omitted';
  END IF;
  IF p_quantity IS NOT NULL AND (
       p_quantity < 0 OR p_quantity <> trunc(p_quantity) OR p_quantity > 2147483647
       OR p_unit_price < 0 OR p_unit_price <> trunc(p_unit_price) OR p_unit_price > 2147483647
     ) THEN
    RAISE EXCEPTION 'quantity and unit price must be non-negative whole numbers';
  END IF;
  IF p_quantity IS NOT NULL AND p_amount <> p_quantity * p_unit_price THEN
    RAISE EXCEPTION 'amount must equal quantity multiplied by unit price';
  END IF;
  IF p_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'order payments must use record_order_payment';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'transaction_type', v_type,
    'amount', p_amount,
    'description', v_description,
    'category', v_category,
    'payment_method', v_method,
    'quantity', p_quantity,
    'unit_price', p_unit_price,
    'order_id', p_order_id
  )::text);

  INSERT INTO public.manual_cash_entry_requests(request_id, actor_id, request_fingerprint)
  VALUES (p_request_id, v_user_id, v_fingerprint)
  ON CONFLICT (request_id) DO NOTHING
  RETURNING request_id INTO v_claimed_request_id;

  IF v_claimed_request_id IS NULL THEN
    SELECT * INTO v_existing
      FROM public.manual_cash_entry_requests
     WHERE request_id = p_request_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cash-entry request could not be recovered; retry with the same request id';
    END IF;
    IF v_existing.actor_id <> v_user_id OR v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for a different cash entry';
    END IF;
    RETURN coalesce(v_existing.result, jsonb_build_object('already_processed', true));
  END IF;

  INSERT INTO public.cash_register (
    transaction_type, amount, description, category, payment_method,
    quantity, unit_price, register_date, user_id, order_id, created_by
  ) VALUES (
    v_type, p_amount::integer, v_description, v_category, v_method,
    p_quantity::integer, p_unit_price::integer, v_register_date,
    v_user_id, NULL, v_user_id
  )
  RETURNING * INTO v_entry;

  v_result := pg_catalog.to_jsonb(v_entry);
  UPDATE public.manual_cash_entry_requests
     SET result = v_result
   WHERE request_id = p_request_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_manual_cash_entry(
  uuid, text, numeric, text, text, text, numeric, numeric, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_cash_entry(
  uuid, text, numeric, text, text, text, numeric, numeric, uuid
) TO authenticated;

-- Do not permit direct renderer DML on cash movements; all writes use checked
-- register/order RPCs. Authenticated reads remain governed by cash_select and
-- blossom_assistant_read_role_limit.
DROP POLICY IF EXISTS cash_all ON public.cash_register;
DROP POLICY IF EXISTS cash_delete ON public.cash_register;
DROP POLICY IF EXISTS cash_insert ON public.cash_register;
DROP POLICY IF EXISTS cash_update ON public.cash_register;

-- Profile creation is performed by the privileged team Edge Function. Team
-- management needs updates, not direct INSERT or DELETE access.
DROP POLICY IF EXISTS profiles_manage ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_manage
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.has_role(VARIADIC ARRAY['owner'::text, 'manager'::text]))
  WITH CHECK (public.has_role(VARIADIC ARRAY['owner'::text, 'manager'::text]));

-- Prevent losing the final active owner through either deactivation, role
-- change, or direct deletion. Serialize concurrent owner removals before
-- counting, and read the whole profile table as the function owner.
CREATE OR REPLACE FUNCTION public.blossom_prevent_last_active_owner_lockout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_active_owner_count bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM 'owner'
       OR OLD.is_active IS DISTINCT FROM TRUE
       OR (NEW.role IS NOT DISTINCT FROM 'owner' AND NEW.is_active IS TRUE) THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role IS DISTINCT FROM 'owner'
       OR OLD.is_active IS DISTINCT FROM TRUE THEN
      RETURN OLD;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(7051731001::bigint);

  SELECT count(*)
    INTO v_active_owner_count
    FROM public.profiles AS p
   WHERE p.role = 'owner'
     AND p.is_active IS TRUE;

  IF v_active_owner_count <= 1 THEN
    RAISE EXCEPTION 'Cannot deactivate, demote, or delete the last active owner'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_last_active_owner_guard ON public.profiles;
CREATE TRIGGER profiles_last_active_owner_guard
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.blossom_prevent_last_active_owner_lockout();

REVOKE ALL ON FUNCTION public.blossom_prevent_last_active_owner_lockout()
  FROM PUBLIC, anon, authenticated;

-- write_audit_log() handles INSERT, UPDATE, and DELETE. Expand the existing
-- triggers so creates are audited too, and include manual cash-register rows.
DROP TRIGGER IF EXISTS trigger_audit_customers ON public.customers;
CREATE TRIGGER trigger_audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS trigger_audit_products ON public.products;
CREATE TRIGGER trigger_audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS trigger_audit_sale_items ON public.sale_items;
CREATE TRIGGER trigger_audit_sale_items
  AFTER INSERT OR UPDATE OR DELETE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS trigger_audit_cash_register ON public.cash_register;
CREATE TRIGGER trigger_audit_cash_register
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_register
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
