-- Phase 4: read-only inventory integrity review.
-- These queries identify candidates for manual review. They do not repair data.

-- A. Current negative or missing stock values.
SELECT product_id, item_name, stock_level, is_active
FROM public.products
WHERE stock_level IS NULL OR stock_level < 0
ORDER BY stock_level NULLS FIRST, product_id;

-- B. Removal adjustment sign and arithmetic checks.
-- quantity should be a positive magnitude and adjustment_type should carry
-- direction. Older UI writes may have stored removal quantities as negative.
SELECT product_id, adjustment_type, quantity, previous_stock, new_stock,
       reason, created_by,
       (quantity < 0) AS has_negative_removal_quantity,
       (previous_stock - abs(quantity) <> new_stock) AS stock_delta_mismatch
FROM public.stock_adjustments
WHERE adjustment_type = 'removal'
  AND (quantity < 0 OR previous_stock - abs(quantity) <> new_stock)
ORDER BY product_id, created_by;

-- C. Order lines with invalid quantities, missing products, or products that
-- were deactivated. Inactive historical products may be intentional; review.
SELECT oi.order_id, o.order_number, o.status,
       oi.product_id, oi.product_name, oi.quantity,
       p.item_name AS current_product_name, p.is_active, p.stock_level
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.products p ON p.product_id = oi.product_id
WHERE oi.quantity IS NULL OR oi.quantity <= 0
   OR (oi.product_id IS NOT NULL AND p.product_id IS NULL)
   OR (oi.product_id IS NOT NULL AND p.product_id IS NOT NULL AND coalesce(p.is_active, false) = false)
ORDER BY o.order_number;

-- D. Orphaned inventory adjustments whose product no longer exists.
SELECT sa.product_id, sa.adjustment_type, sa.quantity,
       sa.previous_stock, sa.new_stock, sa.reason
FROM public.stock_adjustments sa
LEFT JOIN public.products p ON p.product_id = sa.product_id
WHERE p.product_id IS NULL
ORDER BY sa.product_id, sa.created_by;
