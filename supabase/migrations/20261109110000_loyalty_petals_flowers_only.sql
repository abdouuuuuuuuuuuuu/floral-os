-- Blossom Petals: only flowers earn.
--
-- The rule from 20261103100000 also gave petals to items that are not flowers:
--   * any product with a flower type but an empty or "Uncategorized" category
--     earned 1 petal (decorations, wrapping, accessories);
--   * "rose", "lily", "branch"… were matched in ANY category or flower type, so
--     e.g. a "rose" (pink) ribbon in Gifts earned 2 petals.
--
-- Now a product line earns petals only when:
--   1. its category is Flowers (flowers / flower / fleurs / fleur), by type:
--        lily 3 · rose 2 · chrysanthemum, alstroemeria, branch, any other flower 1
--   2. or it is a bouquet with its flowers set on the product (bouquet_lilies,
--      bouquet_roses, bouquet_other_flowers): it earns for those flowers only.
--      That part is unchanged (order_items.bouquet_petals_per_unit).
-- Chocolates, gifts, decorations, uncategorized items and anything else: 0.
--
-- Petals already earned are NOT recalculated. The rule applies the next time an
-- order is created or changed. Safe to run more than once.

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
  v_text text;
BEGIN
  -- Not in the Flowers category: not a flower, no petals.
  IF v_category NOT IN ('flowers', 'flower', 'fleurs', 'fleur') THEN
    RETURN 0;
  END IF;

  -- The flower type decides; the name is only read when no type is set.
  v_text := CASE WHEN v_type <> '' THEN v_type ELSE v_name END;

  -- Whole words, so lisianthus does not count as a lily.
  IF v_text ~ '\m(lily|lilies|lys|lis)\M' THEN RETURN 3; END IF;
  -- Checked before roses, because "rose" is also the French word for pink.
  IF v_text ~ '\m(chrys|branch|alstr)' THEN RETURN 1; END IF;
  IF v_text ~ '\m(rose|roses)\M' THEN RETURN 2; END IF;
  -- Any other flower.
  RETURN 1;
END;
$$;
