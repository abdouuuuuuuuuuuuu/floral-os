-- Require an ACTIVE staff profile to read shop data.
--
-- Since 20261030130000, a public sign-up gets a profile that is an inactive
-- florist. Several tables still have permissive "any signed-in user may read"
-- policies (orders_select, customers_select, products_select, profiles_select
-- ... USING true). The only thing keeping inactive accounts out of them was
-- blossom_assistant_read_role_limit, which is not defined in any migration, so
-- whether it is RESTRICTIVE could not be verified from the repository.
--
-- This adds an explicit RESTRICTIVE guard per table. It does not change what
-- any ACTIVE role can see: blossom_active_role() returns that role, so the
-- guard passes and the existing policies decide as before. It only blocks
-- accounts that are inactive or have no profile.
--
-- profiles: an inactive user may still read their OWN row, because the app
-- reads it at sign-in to show "This account has been deactivated".
--
-- Safe to run more than once. Tables that do not exist are skipped.

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'orders', 'order_items', 'customers', 'products', 'categories',
    'cash_register', 'flower_waste', 'spoilage_logs',
    'suppliers', 'supplier_payments', 'supplier_transactions',
    'customer_loyalty_cards', 'customer_loyalty_transactions',
    'order_events', 'delivery_attempts', 'order_notifications'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS blossom_require_active_account ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY blossom_require_active_account ON public.%I
         AS RESTRICTIVE FOR SELECT TO authenticated
         USING (public.blossom_active_role() IS NOT NULL)',
      v_table
    );
  END LOOP;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS blossom_require_active_account ON public.profiles;
    CREATE POLICY blossom_require_active_account ON public.profiles
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (id = (SELECT auth.uid()) OR public.blossom_active_role() IS NOT NULL);
  END IF;
END
$$;
