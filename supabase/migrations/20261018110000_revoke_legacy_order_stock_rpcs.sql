-- Stop public/API clients from calling legacy order and stock helpers
-- directly. The POS uses the role-checked Blossom workflows and the
-- six-argument idempotent payment RPC instead.
--
-- SECURITY DEFINER workflow functions owned by postgres can still call these
-- helpers internally after app-role EXECUTE is revoked. This migration does
-- not change data, RLS policies, or the trusted postgres/service_role grants.

BEGIN;

REVOKE ALL ON FUNCTION public.create_order(
  integer, text, text, date, time without time zone, text, text, text, text,
  jsonb, integer, integer, numeric, text, integer, integer, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_order_payment(
  uuid, integer, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_order_refund(
  uuid, integer, text, text
) FROM PUBLIC, anon, authenticated;

-- Revoke every legacy overload; no renderer or Edge Function in this repo
-- calls these helpers directly. SECURITY INVOKER overloads also remain
-- subject to caller table privileges and RLS, but should not be exposed as
-- general-purpose RPC endpoints.
REVOKE ALL ON FUNCTION public.decrement_stock(bigint, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_stock(bigint, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_stock(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_stock(uuid, integer)
  FROM PUBLIC, anon, authenticated;

COMMIT;
