-- Use a normalized phone number as the unique customer identity.

CREATE OR REPLACE FUNCTION public.blossom_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF left(v_digits, 2) = '00' THEN v_digits := substr(v_digits, 3); END IF;
  IF left(v_digits, 3) = '213' AND length(v_digits) = 12 THEN
    v_digits := '0' || substr(v_digits, 4);
  ELSIF left(v_digits, 3) = '213' AND length(v_digits) = 13 AND substr(v_digits, 4, 1) = '0' THEN
    v_digits := substr(v_digits, 4);
  ELSIF length(v_digits) = 9 THEN
    v_digits := '0' || v_digits;
  END IF;
  IF length(v_digits) < 9 OR length(v_digits) > 15 THEN RETURN NULL; END IF;
  RETURN v_digits;
END;
$$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_normalized text;

UPDATE public.customers
SET phone_normalized = public.blossom_normalize_phone(phone)
WHERE phone_normalized IS DISTINCT FROM public.blossom_normalize_phone(phone);

-- Keep the customer profile that already owns the most orders; move all
-- related records from duplicate profiles before removing the duplicates.
CREATE TEMP TABLE blossom_customer_merge ON COMMIT DROP AS
WITH order_counts AS (
  SELECT c.customer_id, c.phone_normalized, count(o.id) AS linked_orders
  FROM public.customers c
  LEFT JOIN public.orders o ON o.customer_id = c.customer_id
  WHERE c.phone_normalized IS NOT NULL
  GROUP BY c.customer_id, c.phone_normalized
), ranked AS (
  SELECT customer_id, phone_normalized,
    first_value(customer_id) OVER (
      PARTITION BY phone_normalized
      ORDER BY linked_orders DESC, customer_id ASC
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY phone_normalized
      ORDER BY linked_orders DESC, customer_id ASC
    ) AS row_num
  FROM order_counts
)
SELECT customer_id AS duplicate_id, keeper_id
FROM ranked
WHERE row_num > 1;

-- Preserve contact details which exist only on a duplicate profile.
UPDATE public.customers keeper
SET email = coalesce(nullif(keeper.email, ''), (
      SELECT nullif(source.email, '') FROM blossom_customer_merge m
      JOIN public.customers source ON source.customer_id = m.duplicate_id
      WHERE m.keeper_id = keeper.customer_id AND nullif(source.email, '') IS NOT NULL
      ORDER BY source.customer_id LIMIT 1)),
    billing_address = coalesce(nullif(keeper.billing_address, ''), (
      SELECT nullif(source.billing_address, '') FROM blossom_customer_merge m
      JOIN public.customers source ON source.customer_id = m.duplicate_id
      WHERE m.keeper_id = keeper.customer_id AND nullif(source.billing_address, '') IS NOT NULL
      ORDER BY source.customer_id LIMIT 1)),
    notes = coalesce(nullif(keeper.notes, ''), (
      SELECT nullif(source.notes, '') FROM blossom_customer_merge m
      JOIN public.customers source ON source.customer_id = m.duplicate_id
      WHERE m.keeper_id = keeper.customer_id AND nullif(source.notes, '') IS NOT NULL
      ORDER BY source.customer_id LIMIT 1)),
    preferred_delivery_method = coalesce(keeper.preferred_delivery_method, (
      SELECT source.preferred_delivery_method FROM blossom_customer_merge m
      JOIN public.customers source ON source.customer_id = m.duplicate_id
      WHERE m.keeper_id = keeper.customer_id AND source.preferred_delivery_method IS NOT NULL
      ORDER BY source.customer_id LIMIT 1)),
    preferred_payment_method = coalesce(keeper.preferred_payment_method, (
      SELECT source.preferred_payment_method FROM blossom_customer_merge m
      JOIN public.customers source ON source.customer_id = m.duplicate_id
      WHERE m.keeper_id = keeper.customer_id AND source.preferred_payment_method IS NOT NULL
      ORDER BY source.customer_id LIMIT 1)),
    customer_source = coalesce(keeper.customer_source, (
      SELECT source.customer_source FROM blossom_customer_merge m
      JOIN public.customers source ON source.customer_id = m.duplicate_id
      WHERE m.keeper_id = keeper.customer_id AND source.customer_source IS NOT NULL
      ORDER BY source.customer_id LIMIT 1))
WHERE keeper.customer_id IN (SELECT DISTINCT keeper_id FROM blossom_customer_merge);

-- Update all single-column foreign keys that point to customers.customer_id.
-- Avoid firing the loyalty projection while moving both orders and its ledger;
-- the existing ledger rows themselves move to the keeper below.
ALTER TABLE public.orders DISABLE TRIGGER orders_sync_loyalty_points;

DO $$
DECLARE
  v_fk record;
BEGIN
  FOR v_fk IN
    SELECT con.conrelid::regclass AS child_table, child_col.attname AS child_column
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) key(attnum) ON true
    JOIN pg_attribute child_col ON child_col.attrelid = con.conrelid AND child_col.attnum = key.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.customers'::regclass
      AND cardinality(con.conkey) = 1
      AND con.confkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.customers'::regclass AND attname = 'customer_id'
      )
  LOOP
    EXECUTE format(
      'UPDATE %s child SET %I = merge.keeper_id FROM pg_temp.blossom_customer_merge merge WHERE child.%I = merge.duplicate_id',
      v_fk.child_table, v_fk.child_column, v_fk.child_column
    );
  END LOOP;
END;
$$;

ALTER TABLE public.orders ENABLE TRIGGER orders_sync_loyalty_points;

DELETE FROM public.customers c
USING blossom_customer_merge merge
WHERE c.customer_id = merge.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_normalized_unique
  ON public.customers(phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION public.blossom_set_customer_normalized_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF nullif(btrim(coalesce(NEW.phone, '')), '') IS NULL THEN
    NEW.phone_normalized := NULL;
  ELSE
    NEW.phone_normalized := public.blossom_normalize_phone(NEW.phone);
    IF NEW.phone_normalized IS NULL THEN
      RAISE EXCEPTION 'Enter a valid phone number with at least 9 digits';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_set_normalized_phone ON public.customers;
CREATE TRIGGER customers_set_normalized_phone
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.blossom_set_customer_normalized_phone();

CREATE OR REPLACE FUNCTION public.blossom_resolve_customer(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_customer_id integer DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_billing_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_preferred_delivery_method text DEFAULT NULL,
  p_preferred_payment_method text DEFAULT NULL,
  p_customer_source text DEFAULT 'inhouse',
  p_create_if_missing boolean DEFAULT true
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
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_normalized text;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_customer public.customers%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create or link customers';
  END IF;

  v_normalized := public.blossom_normalize_phone(v_phone);
  IF v_phone IS NOT NULL AND v_normalized IS NULL THEN
    RAISE EXCEPTION 'Enter a valid phone number with at least 9 digits';
  END IF;

  IF v_normalized IS NULL THEN
    IF p_customer_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_customer FROM public.customers WHERE customer_id = p_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'customer profile not found'; END IF;
    RETURN to_jsonb(v_customer);
  END IF;

  -- Serialize phone lookups and inserts, then let the unique index provide a
  -- second line of defense against simultaneous checkouts.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_normalized, 0));
  SELECT * INTO v_customer FROM public.customers
  WHERE phone_normalized = v_normalized
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.customers SET
      full_name = coalesce(nullif(btrim(full_name), ''), nullif(v_name, '')),
      email = coalesce(nullif(email, ''), nullif(btrim(coalesce(p_email, '')), '')),
      billing_address = coalesce(nullif(billing_address, ''), nullif(btrim(coalesce(p_billing_address, '')), '')),
      notes = coalesce(nullif(notes, ''), nullif(btrim(coalesce(p_notes, '')), '')),
      preferred_delivery_method = coalesce(preferred_delivery_method, p_preferred_delivery_method),
      preferred_payment_method = coalesce(preferred_payment_method, p_preferred_payment_method),
      customer_source = coalesce(customer_source, p_customer_source)
    WHERE customer_id = v_customer.customer_id
    RETURNING * INTO v_customer;
    RETURN to_jsonb(v_customer);
  END IF;

  IF NOT coalesce(p_create_if_missing, true) THEN RETURN NULL; END IF;
  IF nullif(v_name, '') IS NULL THEN RAISE EXCEPTION 'Enter the customer name for this new phone number'; END IF;

  INSERT INTO public.customers (
    full_name, phone, phone_normalized, email, billing_address, notes,
    preferred_delivery_method, preferred_payment_method, customer_source
  ) VALUES (
    v_name, v_phone, v_normalized,
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_billing_address, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_preferred_delivery_method, 'pickup'),
    coalesce(p_preferred_payment_method, 'cash'),
    coalesce(p_customer_source, 'inhouse')
  ) RETURNING * INTO v_customer;

  RETURN to_jsonb(v_customer);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_resolve_customer(text, text, integer, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_resolve_customer(text, text, integer, text, text, text, text, text, text, boolean) TO authenticated;

-- Reuse the existing order transaction, but resolve the customer inside it.
CREATE OR REPLACE FUNCTION public.blossom_create_order(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_order jsonb := coalesce(p_order, '{}'::jsonb);
  v_customer jsonb;
  v_customer_id integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot create orders';
  END IF;
  IF jsonb_typeof(v_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(coalesce(p_items, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'invalid order payload';
  END IF;

  v_customer := public.blossom_resolve_customer(
    p_full_name => v_order->>'client_name',
    p_phone => v_order->>'client_phone',
    p_customer_id => nullif(v_order->>'customer_id', '')::integer,
    p_customer_source => coalesce(nullif(v_order->>'client_source', ''), 'inhouse')
  );
  IF v_customer IS NOT NULL THEN
    v_customer_id := (v_customer->>'customer_id')::integer;
    v_order := jsonb_set(v_order, '{customer_id}', to_jsonb(v_customer_id), true);
    v_order := jsonb_set(v_order, '{client_name}', to_jsonb(v_customer->>'full_name'), true);
    v_order := jsonb_set(v_order, '{client_phone}', to_jsonb(coalesce(v_customer->>'phone', '')), true);
  ELSIF coalesce(nullif(v_order->>'order_type', ''), 'standard') <> 'quick_sale' THEN
    RAISE EXCEPTION 'Add a phone number or select a customer profile before creating this order';
  END IF;

  RETURN to_jsonb(public.create_order(v_order, p_items));
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_create_order(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blossom_create_order(jsonb, jsonb) TO authenticated;

