-- Link existing unpaid orders to a customer only when the match is unique.
-- Phone is preferred; a normalized full-name match is used when phone cannot
-- identify exactly one customer. Ambiguous records remain untouched.
WITH phone_matches AS (
  SELECT o.id AS order_id,
         count(c.customer_id) AS match_count,
         min(c.customer_id) AS customer_id
  FROM public.orders o
  JOIN public.customers c
    ON length(regexp_replace(coalesce(o.client_phone, ''), '[^0-9]', '', 'g')) >= 7
   AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') =
       regexp_replace(coalesce(o.client_phone, ''), '[^0-9]', '', 'g')
  WHERE o.customer_id IS NULL
    AND o.deleted_at IS NULL
    AND coalesce(o.status, '') <> 'cancelled'
    AND coalesce(o.amount_due, 0) > 0
  GROUP BY o.id
), name_matches AS (
  SELECT o.id AS order_id,
         count(c.customer_id) AS match_count,
         min(c.customer_id) AS customer_id
  FROM public.orders o
  JOIN public.customers c
    ON lower(btrim(c.full_name)) = lower(btrim(o.client_name))
  WHERE o.customer_id IS NULL
    AND o.deleted_at IS NULL
    AND coalesce(o.status, '') <> 'cancelled'
    AND coalesce(o.amount_due, 0) > 0
  GROUP BY o.id
), unique_matches AS (
  SELECT o.id AS order_id,
         CASE
           WHEN pm.match_count = 1 THEN pm.customer_id
           WHEN nm.match_count = 1 THEN nm.customer_id
           ELSE NULL
         END AS customer_id
  FROM public.orders o
  LEFT JOIN phone_matches pm ON pm.order_id = o.id
  LEFT JOIN name_matches nm ON nm.order_id = o.id
  WHERE o.customer_id IS NULL
    AND o.deleted_at IS NULL
    AND coalesce(o.status, '') <> 'cancelled'
    AND coalesce(o.amount_due, 0) > 0
)
UPDATE public.orders o
SET customer_id = m.customer_id
FROM unique_matches m
WHERE o.id = m.order_id
  AND m.customer_id IS NOT NULL
  AND o.customer_id IS NULL;
