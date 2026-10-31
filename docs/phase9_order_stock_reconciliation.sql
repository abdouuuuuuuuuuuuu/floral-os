-- Phase 9: reconcile order-linked stock movements against the current order
-- lines. Run after Phases 6-8. This is read-only and makes no stock changes.
-- It includes products that were removed from an order, unlike the Phase 8
-- line-only check, so unmatched restores/removals remain visible.

WITH cutover AS (
  SELECT applied_at
  FROM public.order_stock_tracking_cutover
  WHERE singleton = true
), eligible_orders AS (
  SELECT o.id AS order_id, o.order_number, o.status
  FROM public.orders o
  CROSS JOIN cutover c
  WHERE o.created_at >= c.applied_at
), current_lines AS (
  SELECT oi.order_id, oi.product_id,
         sum(coalesce(oi.quantity, 0))::integer AS current_quantity
  FROM public.order_items oi
  JOIN eligible_orders o ON o.order_id = oi.order_id
  WHERE oi.product_id IS NOT NULL
  GROUP BY oi.order_id, oi.product_id
), linked_movements AS (
  SELECT sa.order_id, sa.product_id,
         sum(CASE
           WHEN lower(sa.adjustment_type) = 'removal' THEN -abs(sa.quantity)
           WHEN lower(sa.adjustment_type) = 'restore' THEN abs(sa.quantity)
           ELSE 0
         END)::integer AS recorded_net_stock_delta,
         count(*) FILTER (
           WHERE lower(sa.adjustment_type) NOT IN ('removal', 'restore')
         ) AS unrecognized_adjustment_count
  FROM public.stock_adjustments sa
  JOIN eligible_orders o ON o.order_id = sa.order_id
  GROUP BY sa.order_id, sa.product_id
), order_products AS (
  SELECT order_id, product_id FROM current_lines
  UNION
  SELECT order_id, product_id FROM linked_movements
), comparison AS (
  SELECT o.order_id, o.order_number, o.status, p.product_id,
         coalesce(l.current_quantity, 0) AS current_quantity,
         CASE WHEN o.status = 'cancelled' THEN 0
              ELSE -coalesce(l.current_quantity, 0)
         END AS expected_net_stock_delta,
         coalesce(m.recorded_net_stock_delta, 0) AS recorded_net_stock_delta,
         coalesce(m.unrecognized_adjustment_count, 0) AS unrecognized_adjustment_count
  FROM eligible_orders o
  JOIN order_products p ON p.order_id = o.order_id
  LEFT JOIN current_lines l
    ON l.order_id = p.order_id AND l.product_id = p.product_id
  LEFT JOIN linked_movements m
    ON m.order_id = p.order_id AND m.product_id = p.product_id
)
SELECT order_id, order_number, status, product_id, current_quantity,
       expected_net_stock_delta, recorded_net_stock_delta,
       unrecognized_adjustment_count,
       CASE
         WHEN unrecognized_adjustment_count > 0 THEN 'review: unrecognized adjustment type'
         WHEN recorded_net_stock_delta <> expected_net_stock_delta THEN 'review: movement mismatch'
       END AS finding
FROM comparison
WHERE recorded_net_stock_delta <> expected_net_stock_delta
   OR unrecognized_adjustment_count > 0
ORDER BY order_number, order_id, product_id;

-- Also list unlinked order-labelled stock movements since cutover. These
-- cannot be safely attributed automatically when order numbers are duplicated.
SELECT sa.id AS adjustment_id, sa.product_id, sa.adjustment_type, sa.quantity,
       sa.reason, sa.created_at
FROM public.stock_adjustments sa
WHERE sa.order_id IS NULL
  AND sa.created_at >= (
    SELECT applied_at
    FROM public.order_stock_tracking_cutover
    WHERE singleton = true
  )
  AND sa.reason ILIKE 'Order #%';
