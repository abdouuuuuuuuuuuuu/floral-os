-- Drop the legacy 4-argument payment/refund overloads.
--
-- Context: the live audit (checks/security_audit.sql check #4 and the
-- SECURITY DEFINER / search_path review) flagged two definer functions with no
-- pinned search_path:
--     public.record_order_payment(uuid, integer, text, text)
--     public.record_order_refund (uuid, integer, text, text)
--
-- These predate the current six-argument idempotent payment RPC. They were
-- already revoked from PUBLIC, anon and authenticated in
-- 20261018110000_revoke_legacy_order_stock_rpcs.sql, so no API client can call
-- them. They remain in the database as SECURITY DEFINER functions owned by
-- postgres with NO SET search_path, which is an unnecessary
-- privilege-escalation surface: a definer function without a fixed search_path
-- can resolve unqualified objects from a schema an attacker can influence and
-- run that code with the owner's rights.
--
-- Nothing in this repo calls them:
--   * the app records payments AND refunds through
--       public.record_order_payment(uuid, uuid, numeric, text, text, text)
--     with p_action = 'payment' | 'refund' (see src/lib/orders.js,
--     src/hooks/useOrders.js). That current function IS hardened
--     (SECURITY DEFINER, SET search_path = public, pg_temp).
--   * no SQL migration PERFORMs/SELECTs the 4-arg overloads internally.
--
-- So remove the dead functions rather than hardening code that should not run.
-- IF EXISTS keeps this safe to re-run and safe if a copy was already dropped
-- in another environment.

BEGIN;

DROP FUNCTION IF EXISTS public.record_order_payment(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.record_order_refund(uuid, integer, text, text);

COMMIT;
