-- Phase 6: link stock adjustments to orders by UUID where the reason text
-- identifies exactly one existing order. Ambiguous duplicate order numbers
-- remain unlinked; this migration never changes stock quantities.

ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_adjustments_order_id_fkey'
      AND conrelid = 'public.stock_adjustments'::regclass
  ) THEN
    ALTER TABLE public.stock_adjustments
      ADD CONSTRAINT stock_adjustments_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS stock_adjustments_order_id_idx
  ON public.stock_adjustments(order_id);

CREATE OR REPLACE FUNCTION public.link_stock_adjustment_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match text[];
  v_order_number numeric;
  v_match_count integer;
  v_order_id uuid;
BEGIN
  -- Preserve an explicit, previously assigned link.
  IF NEW.order_id IS NOT NULL OR NEW.reason IS NULL THEN
    RETURN NEW;
  END IF;

  v_match := regexp_match(NEW.reason, 'order[[:space:]]*#[[:space:]]*([0-9]+)([^0-9]|$)', 'i');
  IF v_match IS NULL THEN RETURN NEW; END IF;
  v_order_number := v_match[1]::numeric;

  SELECT count(*) INTO v_match_count
  FROM public.orders o
  WHERE CASE
    WHEN btrim(o.order_number) ~ '^[0-9]+$'
      THEN btrim(o.order_number)::numeric = v_order_number
    ELSE false
  END;

  -- Never guess when a legacy number belongs to multiple order UUIDs.
  IF v_match_count <> 1 THEN RETURN NEW; END IF;

  SELECT o.id INTO v_order_id
  FROM public.orders o
  WHERE CASE
    WHEN btrim(o.order_number) ~ '^[0-9]+$'
      THEN btrim(o.order_number)::numeric = v_order_number
    ELSE false
  END;
  NEW.order_id := v_order_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_stock_adjustment_to_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_stock_adjustment_to_order() TO authenticated;

DROP TRIGGER IF EXISTS stock_adjustments_link_order ON public.stock_adjustments;
CREATE TRIGGER stock_adjustments_link_order
BEFORE INSERT OR UPDATE ON public.stock_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.link_stock_adjustment_to_order();

-- Backfill only reason references that resolve to exactly one order. The
-- trigger performs the same safe match; quantities and stock levels are not
-- modified. Rows referring to duplicate numbers remain NULL in order_id.
WITH parsed AS (
  SELECT sa.ctid,
         (regexp_match(sa.reason, 'order[[:space:]]*#[[:space:]]*([0-9]+)([^0-9]|$)', 'i'))[1]::numeric AS order_number
  FROM public.stock_adjustments sa
  WHERE sa.order_id IS NULL
    AND sa.reason ~* 'order[[:space:]]*#[[:space:]]*[0-9]+([^0-9]|$)'
), candidates AS (
  SELECT p.ctid, min(o.id::text)::uuid AS order_id, count(o.id) AS matches
  FROM parsed p
  LEFT JOIN public.orders o
    ON CASE
      WHEN btrim(o.order_number) ~ '^[0-9]+$'
        THEN btrim(o.order_number)::numeric = p.order_number
      ELSE false
    END
  GROUP BY p.ctid
)
UPDATE public.stock_adjustments sa
SET order_id = c.order_id
FROM candidates c
WHERE sa.ctid = c.ctid
  AND c.matches = 1
  AND sa.order_id IS NULL;
