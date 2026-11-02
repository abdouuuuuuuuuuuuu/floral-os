-- Lets checkout ask whether an earlier attempt with this request id was saved.
-- When a sale fails with a network error and the cashier then edits the cart,
-- the old request id can no longer be reused (its fingerprint differs). The
-- client looks it up first: if the order exists it shows that order instead of
-- creating a second one; otherwise it safely starts a new request id.

CREATE OR REPLACE FUNCTION public.get_order_creation_result(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT result
  FROM public.order_creation_requests
  WHERE actor_id = auth.uid()
    AND request_id = p_request_id
    AND result IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_order_creation_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_creation_result(uuid) TO authenticated;
