-- Restores delivery dates wiped by order edits between the 2026-11-12
-- reschedule migration and the 20261114100000 update_order_items fix.
--
-- Every wipe left an order_events row whose delivery_date change goes
-- '<date>' -> null. Its 'from' is the date the order should have: for a
-- rescheduled order that is the new date, otherwise the date it already had.
-- Pickup orders a user deliberately cleared (last delay_history entry is
-- 'cleared') are left alone.
--
-- Run STEP 1 first and check the list. Then run STEP 2.

-- STEP 1: preview
WITH last_date_change AS (
  SELECT DISTINCT ON (e.order_id)
    e.order_id, e.occurred_at,
    e.changes->'delivery_date'->>'from' AS from_date,
    e.changes->'delivery_date'->>'to'   AS to_date
  FROM public.order_events e
  WHERE e.changes ? 'delivery_date'
    AND e.occurred_at >= '2026-11-12'
  ORDER BY e.order_id, e.occurred_at DESC, e.id DESC
)
SELECT o.order_number, o.client_name, o.delivery_method, o.status,
       c.from_date::date AS restore_to, c.occurred_at AS wiped_at
FROM public.orders o
JOIN last_date_change c ON c.order_id = o.id
WHERE o.delivery_date IS NULL
  AND c.to_date IS NULL AND c.from_date IS NOT NULL
  AND coalesce(o.delay_history->-1->>'direction', '') <> 'cleared'
ORDER BY c.occurred_at DESC;

-- STEP 2: restore (same filter as the preview)
/*
WITH last_date_change AS (
  SELECT DISTINCT ON (e.order_id)
    e.order_id,
    e.changes->'delivery_date'->>'from' AS from_date,
    e.changes->'delivery_date'->>'to'   AS to_date
  FROM public.order_events e
  WHERE e.changes ? 'delivery_date'
    AND e.occurred_at >= '2026-11-12'
  ORDER BY e.order_id, e.occurred_at DESC, e.id DESC
)
UPDATE public.orders o
SET delivery_date = c.from_date::date
FROM last_date_change c
WHERE c.order_id = o.id
  AND o.delivery_date IS NULL
  AND c.to_date IS NULL AND c.from_date IS NOT NULL
  AND coalesce(o.delay_history->-1->>'direction', '') <> 'cleared'
RETURNING o.order_number, o.delivery_date;
*/
