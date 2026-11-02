-- Phase 5: read-only order-number review. This does not change existing data.

-- A. Existing duplicate order numbers. Each UUID is a separate order record.
SELECT btrim(order_number) AS order_number,
       count(*) AS order_count,
       array_agg(id ORDER BY created_at, id) AS order_ids,
       array_agg(status ORDER BY created_at, id) AS statuses,
       array_agg(created_at ORDER BY created_at, id) AS created_times
FROM public.orders
WHERE order_number IS NOT NULL AND btrim(order_number) <> ''
GROUP BY btrim(order_number)
HAVING count(*) > 1
ORDER BY btrim(order_number);

-- B. Compare numeric order numbers with the sequence's current position.
-- The migration advances the sequence to at least the larger of these values.
SELECT
  (SELECT max(btrim(order_number)::numeric)
   FROM public.orders
   WHERE btrim(order_number) ~ '^[0-9]+$') AS max_stored_order_number,
  last_value AS sequence_last_value,
  is_called AS sequence_is_called
FROM public.order_number_seq;
