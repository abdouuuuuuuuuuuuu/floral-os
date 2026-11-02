-- Phase 6: read-only review of order-linked stock adjustments.

-- A. Adjustments now linked by order UUID, including product and order status.
SELECT sa.order_id, o.order_number, o.status,
       sa.product_id, sa.adjustment_type, sa.quantity, sa.reason,
       sa.previous_stock, sa.new_stock
FROM public.stock_adjustments sa
JOIN public.orders o ON o.id = sa.order_id
ORDER BY o.order_number, sa.product_id;

-- B. Order-labelled adjustments that remain unlinked. These include ambiguous
-- references such as duplicate order numbers; review before assigning links.
SELECT sa.product_id, sa.adjustment_type, sa.quantity, sa.reason,
       sa.previous_stock, sa.new_stock
FROM public.stock_adjustments sa
WHERE sa.order_id IS NULL
  AND sa.reason ~* 'order[[:space:]]*#[[:space:]]*[0-9]+([^0-9]|$)'
ORDER BY sa.reason, sa.product_id;
