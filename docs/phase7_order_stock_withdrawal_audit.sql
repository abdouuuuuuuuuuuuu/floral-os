-- Phase 7: read-only check for stock deductions recorded during order creation.
-- Apply after the Phase 7 migration; older orders are not backfilled here.

WITH cutover AS (
  SELECT applied_at
  FROM public.order_stock_tracking_cutover
  WHERE singleton = true
), ordered AS (
  SELECT o.id AS order_id, o.order_number, o.status,
         oi.product_id, sum(oi.quantity)::integer AS ordered_quantity
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  CROSS JOIN cutover c
  WHERE o.created_at >= c.applied_at
  GROUP BY o.id, o.order_number, o.status, oi.product_id
), recorded AS (
  SELECT order_id, product_id,
         (sum(quantity) FILTER (
           WHERE adjustment_type = 'removal'
             AND reason LIKE 'Order #% created'
         ))::integer AS recorded_creation_withdrawal
  FROM public.stock_adjustments
  WHERE order_id IS NOT NULL
  GROUP BY order_id, product_id
)
SELECT o.order_id, o.order_number, o.status, o.product_id,
       o.ordered_quantity,
       coalesce(r.recorded_creation_withdrawal, 0) AS recorded_creation_withdrawal,
       o.ordered_quantity - coalesce(r.recorded_creation_withdrawal, 0) AS difference
FROM ordered o
LEFT JOIN recorded r ON r.order_id = o.order_id AND r.product_id = o.product_id
WHERE coalesce(r.recorded_creation_withdrawal, 0) <> o.ordered_quantity
ORDER BY o.order_number, o.product_id;
