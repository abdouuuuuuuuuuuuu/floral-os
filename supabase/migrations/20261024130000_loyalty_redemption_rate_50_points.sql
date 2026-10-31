-- Blossom Petals now redeem in 50-point units at 500 DA per reward.
-- Existing points remain intact; their redemption value follows the new rate.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.blossom_create_loyalty_order(jsonb,jsonb,uuid,integer)'::regprocedure
  );
  IF position('p_points_to_redeem < 100' IN v_definition) = 0
     OR position('p_points_to_redeem % 100' IN v_definition) = 0
     OR position('p_points_to_redeem * 5' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected blossom_create_loyalty_order definition; update the 50-point redemption migration.';
  END IF;
  v_definition := replace(v_definition, 'p_points_to_redeem < 100', 'p_points_to_redeem < 50');
  v_definition := replace(v_definition, 'p_points_to_redeem % 100', 'p_points_to_redeem % 50');
  v_definition := replace(v_definition, 'multiples of 100', 'multiples of 50');
  v_definition := replace(v_definition, 'p_points_to_redeem * 5', 'p_points_to_redeem * 10');
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(
    'public.blossom_loyalty_dashboard_summary()'::regprocedure
  );
  IF position('ranked.balance) / 100' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected blossom_loyalty_dashboard_summary definition; update the 50-point redemption migration.';
  END IF;
  v_definition := replace(v_definition, 'ranked.balance) / 100', 'ranked.balance) / 50');
  EXECUTE v_definition;
END;
$migration$;
