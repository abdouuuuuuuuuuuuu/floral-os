-- Loyalty card traceability and correction:
-- 1. Record who linked a card (assigned_by), set server-side so it can't be
--    spoofed, and write an audit row. Assignment moves from a direct table
--    UPDATE to this RPC.
-- 2. Give owners a way to unlink a mis-linked card (frees it back to blank),
--    which was impossible before (RLS blocks clearing customer_id, delete is
--    revoked), forcing a Supabase edit. Audited.

ALTER TABLE public.customer_loyalty_cards
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── Assign a blank card to a customer ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.blossom_assign_loyalty_card(
  p_code text,
  p_customer_id integer
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
  v_card public.customer_loyalty_cards%ROWTYPE;
  v_customer public.customers%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false)
     OR coalesce(v_role, '') NOT IN ('owner', 'manager', 'florist', 'cashier') THEN
    RAISE EXCEPTION 'role cannot assign loyalty cards';
  END IF;
  IF p_code IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'card code and customer are required';
  END IF;

  SELECT * INTO v_card FROM public.customer_loyalty_cards WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'card not found'; END IF;
  IF v_card.customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'this card is already linked to a customer';
  END IF;

  SELECT * INTO v_customer FROM public.customers WHERE customer_id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;

  -- One card per customer (enforced by the unique constraint too).
  IF EXISTS (SELECT 1 FROM public.customer_loyalty_cards WHERE customer_id = p_customer_id) THEN
    RAISE EXCEPTION 'this customer already has a loyalty card';
  END IF;

  UPDATE public.customer_loyalty_cards
  SET customer_id = p_customer_id, assigned_at = now(), assigned_by = v_user_id
  WHERE code = p_code;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_user_id::text, 'assign_loyalty_card', 'customer_loyalty_cards',
    jsonb_build_object('code', p_code, 'customer_id', NULL),
    jsonb_build_object('code', p_code, 'customer_id', p_customer_id,
      'customer_name', v_customer.full_name)
  );

  RETURN jsonb_build_object('code', p_code, 'customer_id', p_customer_id,
    'customer_name', v_customer.full_name);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_assign_loyalty_card(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_assign_loyalty_card(text, integer) TO authenticated;

-- ─── Unlink a card (owner only) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.blossom_unlink_loyalty_card(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_card public.customer_loyalty_cards%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an owner can unlink a loyalty card';
  END IF;
  IF p_code IS NULL THEN RAISE EXCEPTION 'card code is required'; END IF;

  SELECT * INTO v_card FROM public.customer_loyalty_cards WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'card not found'; END IF;
  IF v_card.customer_id IS NULL THEN
    RETURN jsonb_build_object('code', p_code, 'already_blank', true);
  END IF;

  UPDATE public.customer_loyalty_cards
  SET customer_id = NULL, assigned_at = NULL, assigned_by = NULL
  WHERE code = p_code;

  INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  VALUES (
    v_user_id::text, 'unlink_loyalty_card', 'customer_loyalty_cards',
    jsonb_build_object('code', p_code, 'customer_id', v_card.customer_id),
    jsonb_build_object('code', p_code, 'customer_id', NULL)
  );

  RETURN jsonb_build_object('code', p_code, 'unlinked', true,
    'previous_customer_id', v_card.customer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_unlink_loyalty_card(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_unlink_loyalty_card(text) TO authenticated;
