-- Phase 8: read-only order stock movement comparison.
-- Focus on orders created since Phase 7 began tracking initial withdrawals.

WITH cutover AS (
  SELECT applied_at FROM public.order_stock_tracking_cutover WHERE singleton = true
), order_lines AS (
  SELECT o.id AS order_id, o.order_number, o.status,
         oi.product_id, sum(oi.quantity)::integer AS ordered_quantity
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  CROSS JOIN cutover c
  WHERE o.created_at >= c.applied_at
  GROUP BY o.id, o.order_number, o.status, oi.product_id
), net_stock_movement AS (
  SELECT order_id, product_id,
         sum(CASE
           WHEN adjustment_type = 'removal' THEN -abs(quantity)
           WHEN adjustment_type = 'restore' THEN abs(quantity)
           ELSE 0
         END)::integer AS net_stock_delta
  FROM public.stock_adjustments
  WHERE order_id IS NOT NULL
  GROUP BY order_id, product_id
)
SELECT l.order_id, l.order_number, l.status, l.product_id,
       l.ordered_quantity,
       CASE WHEN l.status = 'cancelled' THEN 0 ELSE -l.ordered_quantity END AS expected_net_stock_delta,
       coalesce(m.net_stock_delta, 0) AS recorded_net_stock_delta
FROM order_lines l
LEFT JOIN net_stock_movement m
  ON m.order_id = l.order_id AND m.product_id = l.product_id
WHERE coalesce(m.net_stock_delta, 0) <>
      CASE WHEN l.status = 'cancelled' THEN 0 ELSE -l.ordered_quantity END
ORDER BY l.order_number, l.product_id;
