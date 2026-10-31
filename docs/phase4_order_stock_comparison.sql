-- Read-only comparison of order quantities with stock_adjustments rows whose
-- reason text includes that order number. stock_adjustments has no order_id
-- foreign key, so this is a best-effort text match, not a complete stock ledger.

-- A. For each order/product pair, show the current reservation expectation and
-- any matching adjustment records. Cancelled orders should no longer reserve
-- stock; other order states are treated as reserved.
WITH order_product_quantities AS (
  SELECT o.id AS order_id, o.order_number, o.status,
         oi.product_id, max(oi.product_name) AS product_name,
         sum(oi.quantity)::integer AS ordered_quantity
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE oi.product_id IS NOT NULL
  GROUP BY o.id, o.order_number, o.status, oi.product_id
)
SELECT q.order_id, q.order_number, q.status, q.product_id, q.product_name,
       q.ordered_quantity,
       CASE WHEN q.status = 'cancelled' THEN 0 ELSE q.ordered_quantity END AS expected_reserved_quantity,
       coalesce(a.adjustment_count, 0) AS matching_adjustment_count,
       coalesce(a.adjustments, '[]'::jsonb) AS matching_adjustments
FROM order_product_quantities q
LEFT JOIN LATERAL (
  SELECT count(*) AS adjustment_count,
         jsonb_agg(jsonb_build_object(
           'adjustment_type', sa.adjustment_type,
           'quantity', sa.quantity,
           'reason', sa.reason,
           'previous_stock', sa.previous_stock,
           'new_stock', sa.new_stock
         )) AS adjustments
  FROM public.stock_adjustments sa
  WHERE sa.product_id = q.product_id
    AND sa.reason ~* (
      'order[[:space:]]*#[[:space:]]*' || q.order_number || '([^0-9]|$)'
    )
) a ON true
ORDER BY q.order_number, q.product_id;

-- B. Order-labelled adjustments whose product does not appear on that order.
-- These can reveal a wrong product reference or an ambiguous reason label.
SELECT o.id AS order_id, o.order_number, o.status,
       sa.product_id AS adjusted_product_id,
       sa.adjustment_type, sa.quantity, sa.reason,
       sa.previous_stock, sa.new_stock
FROM public.orders o
JOIN public.stock_adjustments sa
  ON sa.reason ~* (
    'order[[:space:]]*#[[:space:]]*' || o.order_number || '([^0-9]|$)'
  )
LEFT JOIN public.order_items oi
  ON oi.order_id = o.id AND oi.product_id = sa.product_id
WHERE oi.order_id IS NULL
ORDER BY o.order_number, sa.product_id;
