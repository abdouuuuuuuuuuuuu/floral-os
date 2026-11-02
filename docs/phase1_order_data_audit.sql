-- Read-only Phase 1 audit. Run before any repair; this file does not update data.

-- A. Order headers whose stored money fields do not reconcile.
WITH item_totals AS (
  SELECT order_id,
         coalesce(sum(coalesce(total_price, quantity * unit_price)), 0)::numeric AS item_subtotal,
         bool_or(quantity IS NULL OR quantity <= 0) AS has_invalid_quantity
  FROM public.order_items
  GROUP BY order_id
), calculated AS (
  SELECT o.id, o.order_number, o.status,
         coalesce(i.item_subtotal, 0) AS item_subtotal,
         o.subtotal_amount, o.tax_amount, o.price_adjustment, o.total_amount,
         o.amount_paid, o.amount_due, o.payment_status,
         coalesce(i.has_invalid_quantity, false) AS has_invalid_quantity,
         greatest(0, coalesce(o.subtotal_amount, 0) + coalesce(o.tax_amount, 0)
                     + coalesce(o.price_adjustment, 0)) AS calculated_total
  FROM public.orders o
  LEFT JOIN item_totals i ON i.order_id = o.id
)
SELECT *,
       (item_subtotal <> coalesce(subtotal_amount, 0)) AS subtotal_mismatch,
       (calculated_total <> coalesce(total_amount, 0)) AS total_mismatch,
       (greatest(0, coalesce(total_amount, 0) - coalesce(amount_paid, 0))
          <> coalesce(amount_due, 0)) AS due_mismatch,
       (coalesce(amount_paid, 0) < 0 OR coalesce(amount_paid, 0) > coalesce(total_amount, 0)) AS paid_out_of_range
FROM calculated
WHERE item_subtotal <> coalesce(subtotal_amount, 0)
   OR calculated_total <> coalesce(total_amount, 0)
   OR greatest(0, coalesce(total_amount, 0) - coalesce(amount_paid, 0)) <> coalesce(amount_due, 0)
   OR coalesce(amount_paid, 0) < 0
   OR coalesce(amount_paid, 0) > coalesce(total_amount, 0)
   OR has_invalid_quantity
ORDER BY id;

-- B. Invalid or negative order-line quantities/prices/totals.
SELECT id, order_id, product_id, product_name, quantity, unit_price, total_price
FROM public.order_items
WHERE quantity IS NULL OR quantity <= 0
   OR unit_price IS NULL OR unit_price < 0
   OR total_price IS NULL OR total_price <> quantity * unit_price
ORDER BY order_id, id;

-- C. Negative inventory currently recorded in the catalog.
SELECT product_id, item_name, stock_level, retail_price, is_active
FROM public.products
WHERE coalesce(stock_level, 0) < 0
ORDER BY stock_level, product_id;

-- D. Unusual payment states for manual review; this is not a repair query.
SELECT id, order_number, status, payment_status, total_amount, amount_paid, amount_due,
       payment_method, voided_at, void_reason
FROM public.orders
WHERE coalesce(amount_paid, 0) < 0
   OR coalesce(amount_paid, 0) > coalesce(total_amount, 0)
   OR coalesce(amount_due, 0) < 0
   OR (status = 'cancelled' AND coalesce(amount_due, 0) = 0 AND coalesce(amount_paid, 0) > 0)
ORDER BY created_at DESC;
