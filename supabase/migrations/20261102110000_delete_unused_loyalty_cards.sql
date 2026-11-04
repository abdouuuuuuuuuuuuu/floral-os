-- Lets the owner remove cards that were never linked to a customer, so unused
-- batches can be cleared from the app. Linked cards can never be deleted here.

CREATE OR REPLACE FUNCTION public.blossom_delete_unused_loyalty_cards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_codes text[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;
  SELECT role, is_active INTO v_role, v_active FROM public.profiles WHERE id = v_user_id;
  IF NOT coalesce(v_active, false) OR coalesce(v_role, '') <> 'owner' THEN
    RAISE EXCEPTION 'only an owner can delete unused loyalty cards';
  END IF;

  WITH removed AS (
    DELETE FROM public.customer_loyalty_cards
    WHERE customer_id IS NULL
    RETURNING code
  )
  SELECT coalesce(array_agg(code), '{}') INTO v_codes FROM removed;

  IF coalesce(array_length(v_codes, 1), 0) > 0 THEN
    INSERT INTO public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
    VALUES (
      v_user_id::text, 'delete_unused_loyalty_cards', 'customer_loyalty_cards',
      jsonb_build_object('codes', to_jsonb(v_codes)),
      jsonb_build_object('deleted', array_length(v_codes, 1))
    );
  END IF;

  RETURN jsonb_build_object('deleted', coalesce(array_length(v_codes, 1), 0));
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_delete_unused_loyalty_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blossom_delete_unused_loyalty_cards() TO authenticated;
