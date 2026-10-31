# Phase 1: Authorization Audit

Status: repository inventory completed; the supplied live ACL recheck confirms the legacy order/stock RPC revocations are active. Trigger bodies, event definitions, enabled states, public-table RLS flags, and the public policy snapshot have been reviewed from user-supplied live query results. A Phase 1 remediation migration and the manual-cash client RPC switch are prepared in the working tree but have not been applied to Supabase. Effective table/column grants, schema grants, sequence grants, and view verification remain.

## Scope and evidence limits

This review covers the React/Electron client, the SQL migrations checked into this repository, and `docs/assistant-role-rls-hardening.sql`, plus live query results supplied by the user. It does not prove which migrations or policies are deployed beyond those query snapshots. The base schema and many existing policies/functions are managed outside this checkout. No Supabase CLI or `psql` executable was available in this environment, so this is not an independently run or complete live database audit.

Do not apply broad RLS changes until the deployed permissive policies, table grants, and view security modes have been exported and reviewed. Restrictive policies can deny access even when existing policies grant it.

## Role contract in the client

Source: `src/lib/permissions.js`.

| Role | Intended app areas | Sensitive limits |
| --- | --- | --- |
| Owner | All areas | Only role allowed to manage shop settings, close cash register, refund, permanently delete, and view archive. |
| Manager | Orders, products, delivery, reports, suppliers, team | No refunds, permanent deletion, owner settings, cash close, or archive browsing. |
| Florist | Orders, products, cart, checkout, customers, delivery | No refunds, permanent deletion, cash register, settings, suppliers, reports, or team. |
| Cashier | Cart, checkout, orders, customers | Payment and sale operations only; no stock/product management, order edit/status, cancel, or refund. |
| Delivery | Delivery workflows and order handoff | No order edits, status changes outside delivery workflow, payment, refund, or cash access. Archive action is currently allowed by the UI action matrix for every role. |

## Write path inventory

| Data area | Current mutation path | Intended authorization / audit boundary | Phase 1 action |
| --- | --- | --- | --- |
| Orders, items, stock on sale | `blossom_create_order` and `blossom_create_loyalty_order` RPCs | Active owner/manager/florist/cashier checks; transaction handles order, items, inventory and cash. | Verify deployed function definitions and grants; test each role against the live schema. |
| Order status, edit, cancel, reopen, delay, archive, delete | Narrow order RPCs in `src/lib/orders.js` | Role checks and audit records are present in repository migrations; archive allows active POS staff, archived reads are owner-only. | Verify every deployed overload and ensure legacy unrestricted functions are not executable. |
| Payments/refunds | `record_order_payment` RPC | Active POS roles can collect; only owner/manager can refund; order row lock, idempotency record, cash entry and audit log. | Confirm exact grants and row policies; add active-role tests, including delivery/cashier refund denial. |
| Delivery outcomes | `record_delivery_outcome`, `delay_order`, status RPC | Active owner/manager/florist/delivery for delivery outcomes; ordinary status RPC excludes cashier/delivery. | Confirm direct `orders` updates are not permitted to delivery clients. |
| Customer create/resolve | `blossom_resolve_customer` RPC | Active owner/manager/florist/cashier; phone identity is handled server-side. | Verify function is deployed and execute is unavailable to anon/public; keep table writes from authenticated clients revoked if current UI no longer needs them. |
| Customer profile update | Direct `customers.update()` in `useCustomers.js` | Intended owner/manager/florist/cashier. No update RPC is present in checked-in migrations. | Add a narrow role-checked update RPC after confirming exact customer columns and required trigger behavior; avoid arbitrary JSON-to-row updates. |
| Products/catalog | Direct insert/update in `useProductsAdmin.js`; stock removal uses `remove_product_stock` RPC | Intended owner/manager/florist for product/catalog changes; cashier can use products in sales but not manage catalog. | Move create/edit/deactivate to narrow RPCs. Separate stock adjustment from metadata update and audit stock changes. Validate existing RLS and role checks. |
| Suppliers | Direct supplier insert/update/deactivate; purchase, entry adjustment, void and payments use RPCs | Owner/manager only. Transaction RPCs must preserve stock and balance invariants. | Add scoped supplier CRUD RPCs or verified RLS policies; confirm existing receiving/payment RPC checks and grants. |
| Settings | Direct update with first-run insert fallback in `useSettings.js` | Owner only. | Prefer owner-checked settings RPC; remove client insert fallback unless bootstrap requires it and is safely constrained. Verify table grants/RLS. |
| Team profiles | Direct `profiles.update()` in `useTeam.js`; account creation/password reset use Edge Functions | Owner and manager can manage members; only owner can change roles. | Verify database trigger prevents manager role escalation, self-deactivation, and last-owner removal. Restrict which fields each role may update. Audit Edge Function JWT and caller-role checks. |
| Manual cash register entries | `record_manual_cash_entry` RPC in the working tree; open/close and order payments use dedicated RPCs. | Owner-only manual cash entries with server-side validation, request idempotency, and audit trigger. | Apply the prepared migration and verify effective table/function grants and the live payment/register workflow in staging. |
| Flower waste | `record_flower_waste` RPC | Should be active shop-operations roles with validated quantities and stock effect. | Verify function authorization and table/view policies in deployed DB. |
| Loyalty ledger | Direct `SELECT`; writes happen through trigger/RPC | POS staff may read balances; only trusted DB workflows should write ledger entries. | Verify authenticated has no INSERT/UPDATE/DELETE grant; verify trigger function is not directly executable and redemption RPC enforces balance under lock. |
| Categories and reports | Category reads; report view reads | Product-management roles for categories; owner/manager for reports. | Export grants and view security modes. Confirm views use `security_invoker` or have deliberate, role-checked access. |

## Confirmed repository-level concerns

1. Direct table writes remain for customers, products, suppliers, settings, and team profiles. Their security cannot be established from client code; it depends on production RLS/grants and, for team roles, triggers. The manual cash write was moved to an owner-checked RPC in the working tree; that change is not live until its migration is applied.
2. Product edit currently includes `stock_level` in the same direct update as catalog fields. That can bypass the dedicated stock-removal RPC and does not provide a consistent reasoned stock-adjustment path.
3. The checked-in `docs/assistant-role-rls-hardening.sql` explicitly covers read surfaces only. Its comments warn that it does not secure writes and must be applied only after reviewing current policies.
4. Some database functions are defined in multiple chronological migrations. Production verification must inspect the final deployed definitions and all overloads, not just the first migration that introduced a function.
5. `supabase/functions/*/index.ts` must be checked for JWT validation, active-owner/manager checks, request-field allowlists, and prevention of self/last-owner lockout. `verify_jwt = false` in `supabase/config.toml` makes handler-level authorization especially important.

   Initial handler review: `create-team-member` verifies the caller JWT and active owner profile, validates fields, and audits/rolls back account creation; its UI is owner-only. `reset-member-password` verifies the JWT, permits active owner/manager callers, and restricts managers from resetting owner/manager accounts. Confirm whether reset audit failures should be treated as a support alert; the function returns success with `audit_recorded: false` because the password change cannot be rolled back.

## Live database verification checklist

Export and review these before applying a policy migration:

- Effective table and column privileges for `anon`, `authenticated`, and `service_role`, reviewed alongside the received `pg_policies` snapshot.
- Sequence, schema, and function privileges for `anon`, `authenticated`, and `service_role`.
- Final `pg_get_functiondef` and `proacl` for every callable RPC, including overloaded functions.
- `reloptions` / security mode and grants for `report_*`, `daily_cash_summary`, `supplier_balances`, `order_receipt_view`, and `monthly_flower_waste` views.
- Triggers on `profiles`, `orders`, `products`, `customers`, `cash_register`, and supplier tables.
- Edge Function JWT and application-level role checks for staff creation and password reset.
- Migration history versus repository migrations, especially archive, loyalty, and normalized customer identity.

The read-only catalog queries are in `docs/phase1_authorization_catalog.sql`. Run them in the Supabase SQL Editor and retain the outputs with the deployment record; they are intentionally SELECT-only.

## Live table RLS inventory received

The supplied query 1 result lists 35 public tables. RLS is enabled on all 35; `relforcerowsecurity` is false on all 35. This confirms the RLS flags, not the policies or effective access: API roles still need table privileges and applicable policies. Table owners can bypass ordinary RLS unless it is forced; roles with `BYPASSRLS` can bypass RLS even when it is forced. Do not treat a table as secured solely because `rls_enabled` is true.

The listed objects include retired tables (`_retired_team_members`, `_retired_user_roles`, `_retired_users`) and overlapping-looking business areas such as `clients`/`customers` and `client_debts`/`debt_payments`. Confirm their policy/grant state and whether the POS still uses them before any cleanup. No table-level changes should be based on this inventory alone.

## Live policy snapshot received

The supplied query 2 result contains 64 policies across 20 of the 35 public tables. Every listed policy targets `authenticated`; no `anon` or `PUBLIC` policy appears in this output. The other 15 RLS-enabled tables have no policy in the snapshot: `_retired_user_roles`, `_retired_users`, `cash_register_after_hours_orders`, `clients`, `coffre_forte`, `delivery_details`, `expenses`, `inventory_reservations`, `order_creation_requests`, `order_item_edit_batches`, `order_payment_requests`, `order_stock_tracking_cutover`, `recipe_components`, `recipes`, and `sale_items`. With RLS enabled, no applicable policy means default deny for ordinary table access, but grants and service-role/SECURITY DEFINER workflows still need review. Several internal request/cutover tables are explicitly revoked from app roles in repository migrations; confirm those grants remain revoked. Classify the remaining no-policy tables before changing or removing them.

PostgreSQL combines applicable permissive policies with `OR` and restrictive policies with `AND`. Therefore, broad permissive `orders_select` and `order_items_select` policies do not defeat the restrictive archived-owner checks; the archived rows remain limited by those restrictive policies. The `blossom_assistant_read_role_limit` rules are also restrictive database policies, so they cap every matching authenticated `SELECT`, not only reads initiated by the assistant. This matches the configured role sets for orders, customers, products, suppliers, and cash, but should be considered when diagnosing any role-specific read failures.

Policy findings to validate against effective grants before changing production:

| Policy finding | Potential effect if the matching table privilege is granted | Follow-up |
| --- | --- | --- |
| `client_debts` and `debt_payments` each have a permissive `ALL USING (true) WITH CHECK (true)` policy named `Allow authenticated full access`. | This broad policy ORs with the narrower role policies and allows any authenticated caller through RLS for every command. | Query 3/11/12: confirm effective table and column grants. If DML is granted, remove or replace the broad policy after confirming app/RPC paths. |
| `stock_adjustments` has `INSERT WITH CHECK (true)` and `SELECT USING (true)` permissive policies in addition to role-scoped policies. | Any authenticated caller passes the RLS condition for inserts and reads; the narrower insert check cannot restrict the broad permissive rule. | Confirm table grants; then remove the broad policies or scope them to the intended active roles. |
| `audit_logs.audit_insert` allows authenticated inserts with `WITH CHECK (true)`. | Any authenticated caller with INSERT can fabricate audit rows, weakening trust in the audit trail. | Check effective INSERT grant; prefer writes through trusted audit triggers/RPCs and deny direct client inserts if not required. |
| `flower_waste` has `SELECT USING (true)` and `INSERT WITH CHECK (created_by = auth.uid())`; `spoilage_logs` has `SELECT USING (true)`. | Any authenticated caller with the relevant grants can read all rows; any authenticated caller can create a waste record attributed to themselves. The policies do not check active POS role. | Confirm effective grants and whether these records should be limited to active owner/manager/florist roles. |
| `settings_update` allows both owner and manager, while the app role contract says settings are owner-only. | Managers can update settings through direct table access if UPDATE is granted, subject to any applicable column grants. | Confirm grants and whether this policy is intentional; align it with the owner-only contract or update the contract/UI. |
| `orders_update` includes owner, manager, florist, cashier, and delivery; `order_items_write` grants ALL to owner, manager, florist, and cashier; `order_payments` grants inserts to owner/manager/cashier and ALL updates/deletes to owner/manager. | If direct DML grants exist, these policies can let clients bypass narrower order/payment RPC validation and action checks. RLS roles do not limit which columns a granted UPDATE can change. | Query 3/11/12 and compare with the direct write paths. Revoke broad table DML only after replacement flows and required column grants are confirmed. |
| `profiles_update_own` allows a user to update their own profile row; `profiles_manage` allows owner/manager ALL. | Effective changes depend on column privileges and `prevent_role_escalation()`; the known trigger does not fully protect last-owner deactivation and does not cover DELETE. | Review effective column grants and keep the profile-guard finding open until last-owner deactivation/deletion is protected. |

The explicit `SELECT USING (true)` policies on customers, profiles, orders, and order items are not by themselves proof of unrestricted reads: restrictive role/archived-row rules also apply on those tables. Review the effective policy combination rather than judging one row in isolation. Conversely, the broad permissive rules above have no corresponding restrictive role check for their DML commands in this snapshot.

### Phase 1 remediation prepared

`supabase/migrations/20261018120000_phase1_rls_policy_hardening.sql` addresses the policy findings against the supplied snapshot. It removes broad debt, stock-adjustment, audit-log, and cash-register write policies; limits settings writes to owners; adds active-role caps for debt, stock adjustment, flower-waste, and spoilage access; removes direct order/item/payment DML policies so the checked RPCs own those writes; narrows profile management to updates; adds a serialized last-active-owner guard; and enables insert auditing for customers, products, sale items, and cash-register rows. It also defines `record_manual_cash_entry` with owner validation and request idempotency.

The corresponding `useCashRegister.js` change calls that RPC instead of inserting manual cash rows directly. This migration is prepared but not deployed. Review effective table/column privileges, view security settings, and any external database clients before applying it; then apply and verify in staging. This workspace has no Supabase CLI or `psql`, so it has not been applied remotely.

## Deployed function catalog received

The live function-attribute snapshot, function definitions, and execute ACL results have now been reviewed together. The attribute snapshot by itself did not establish reachability; the ACL results below confirm which API roles could invoke each function.

High-priority findings from that snapshot:

| Deployed signature | Catalog finding | Why to verify |
| --- | --- | --- |
| `create_order(integer, text, text, date, time, text, text, text, text, jsonb, integer, integer, numeric, text, integer, integer, text)` | `SECURITY DEFINER`; no function-level settings (`proconfig` is null) | Legacy order-creation overload. The checked-in hardening migration revokes the JSONB overload, not this long signature. If this signature is executable by `PUBLIC`, `anon`, or `authenticated`, it could bypass the Blossom wrapper's role and validation checks. |
| `record_order_payment(uuid, integer, text, text)` | `SECURITY DEFINER`; no fixed `search_path` | Older payment overload alongside the six-argument idempotent RPC. It may bypass newer payment checks or auditing if callable. |
| `record_order_refund(uuid, integer, text, text)` | `SECURITY DEFINER`; no fixed `search_path` | Legacy refund overload. Check its grants and body for role checks, balance handling, and cash-register effects. |
| `update_order_items(uuid, jsonb, jsonb)` | `SECURITY DEFINER`; no fixed `search_path` | Direct mutation helper. The repository migration revokes this exact overload from app roles, but the live ACL still needs confirmation. |
| `decrement_stock(integer, integer)` | `SECURITY DEFINER`; no fixed `search_path` | Direct inventory mutation helper. Confirm whether any client role can execute it. |

The newer Blossom order/payment RPCs shown in the catalog have a function-level `search_path` of `public, pg_temp`, which is preferable to an unset path, but the function bodies and execute ACLs still need review. Functions configured with only `search_path=public` also need review of schema write privileges and name resolution. Every listed function is owned by `postgres`; that is a normal Supabase owner, but it makes execute grants and internal authorization checks especially important.

The checked-in `20261012090000_secure_order_workflows.sql` revokes app-role execution from selected older routines, but missed the long `create_order` overload, the four-argument payment/refund overloads, and every `decrement_stock` overload. The live ACL confirms those missed grants were present in Supabase.

### Function definitions received

The supplied definitions confirm the following behavior in the deployed database:

| Deployed signature | Body finding | Risk if callable by an API role |
| --- | --- | --- |
| `create_order(integer, text, text, date, time, text, text, text, text, jsonb, integer, integer, numeric, text, integer, integer, text)` | No `auth.uid()` rejection or role check; has no fixed `search_path`; accepts totals/payment amounts from arguments; writes orders, items, stock, and cash register using unqualified table names. | Critical: direct order, inventory, and cash-entry mutation outside the validated JSONB creation workflow. |
| `record_order_payment(uuid, integer, text, text)` | Only uses `auth.uid()` to populate audit columns; it does not reject a null user or check role, validate amount/order, lock/update the order balance, or enforce the newer request-id idempotency flow. It only inserts a `cash_in`. | Critical: arbitrary cash-in rows can be associated with an order without recording the corresponding payment against that order. |
| `record_order_refund(uuid, integer, text, text)` | Same legacy pattern, inserting `cash_out` without caller authorization, amount/order validation, or updating the order's payment state. | Critical: arbitrary cash-out entries without a valid refund workflow. |
| `update_order_items(uuid, jsonb, jsonb)` | No caller authorization and no fixed `search_path`; item updates/deletes use supplied item IDs without constraining each row to `p_order_id`; totals are recalculated for the separately supplied order ID. | Critical: direct edits/deletions to order items, potentially across orders, if directly executable. The checked-in workflow calls it from a role-checked `SECURITY DEFINER` wrapper and revokes direct app-role execution; that internal owner call can continue after app-role revocation. |
| `decrement_stock(integer, integer)` | No caller authorization and no fixed `search_path`; predicate is `product_id = product_id`, which is ambiguous between the parameter and table column. | Critical if callable; the ambiguous predicate can fail at runtime or, if resolved as the column on both sides, match every product. No current renderer call was found. |

The current live definitions for `create_order(jsonb,jsonb)` and the Blossom order, edit, archive, void, delete, and six-argument payment entry points contain active-profile role checks. The six-argument payment routine also validates the action, order state, amount, method, and request ID. The follow-up ACL confirms these current entry points remain available to authenticated clients. No direct client call to the legacy overloads was found in this repository; external integrations are not represented in the checkout.

### Function ACL results received

The initial ACL result showed the risky legacy routines callable by both `anon` and `authenticated`, with `PUBLIC` also granted EXECUTE:

| Signature group | Effective access in supplied result | Assessment |
| --- | --- | --- |
| Long `create_order(...)` overload | `anon=true`, `authenticated=true`; `PUBLIC` grant | Confirmed critical exposure. Its body bypasses the current role-checked order-creation workflow. |
| Four-argument `record_order_payment(...)` and `record_order_refund(...)` | Both roles true; `PUBLIC` grant | Confirmed critical exposure. The bodies insert cash movements without the current authorization, validation, and order-balance workflow. |
| All four `decrement_stock(...)` overloads | Both roles true; `PUBLIC` grant | Confirmed RPC exposure. The integer/integer overload is `SECURITY DEFINER` and has the ambiguous predicate described above. The other three are invoker functions, so their ability to change stock also depends on product-table grants and RLS. |
| `create_order(jsonb,jsonb)`, `delete_order(uuid)`, `update_order_items(...)`, `void_order(...)` | `anon=false`, `authenticated=false` | Direct app-role execution is already revoked in the live ACL. Internal `postgres`-owned workflows retain access. |
| Blossom order/archive/edit/delete/void functions and six-argument `record_order_payment(...)` | `anon=false`, `authenticated=true` | Expected API grant pattern; the supplied definitions contain active-role and action checks. |

The follow-up ACL result confirms the revocations are now active: the long legacy `create_order`, four-argument payment/refund functions, and all four stock-helper overloads report `false` for both `anon` and `authenticated`; ACL entries retain only `postgres` and `service_role`. The secure Blossom RPCs remain executable by `authenticated` and not by `anon`. This matches `supabase/migrations/20261018110000_revoke_legacy_order_stock_rpcs.sql`. The live result confirms the database state; this workspace did not apply the migration directly.

### Trigger function review

The supplied trigger-function output contains 13 trigger-function associations and their bodies. It was paired with the supplied query 6 result to verify trigger timing/events and enabled state.

| Trigger/function | Review result |
| --- | --- |
| `profiles_role_guard` / `prevent_role_escalation()` | Live trigger definition is enabled and fires `BEFORE INSERT OR UPDATE` only; there is no profile DELETE trigger in the supplied catalog. The function protects role changes and privileged inserts through `public.has_role('owner')`, but returns immediately when `auth.uid()` is null, so table grants/RLS must prevent anonymous direct profile writes. Its last-owner check only blocks changing an owner's role away from `owner`; it does not block setting the last active owner's `is_active` to false. Verify profile update/delete policies and the team-member flow, then harden against last-owner deactivation and deletion. |
| `customers_set_normalized_phone` / `blossom_set_customer_normalized_phone()` | Normalizes the phone before writes and rejects an invalid non-empty phone. It delegates to the qualified `public.blossom_normalize_phone` function. This is data validation, not authorization; customer RLS/grants remain decisive. |
| `orders_sync_loyalty_points` / `blossom_sync_order_loyalty_points()` | Live trigger is enabled for `AFTER INSERT OR UPDATE OR DELETE`. It reverses or adjusts earned points when order/customer/payment state changes and writes the loyalty ledger through a `SECURITY DEFINER` trigger. The trigger function is not an API role boundary; ledger table grants/RLS still need verification. |
| `orders_guard_unique_order_number` / `guard_unique_order_number()` | Rejects empty/duplicate order numbers and serializes same-number writes using a transaction advisory lock. The body is qualified for `public.orders`. |
| `capture_after_hours_order` / `capture_after_hours_order()` | Live trigger is enabled for `AFTER INSERT`. Adds an order to the after-hours table when an order is inserted after the matching register close; uses `ON CONFLICT` to avoid duplicate capture. Confirm API roles cannot write the after-hours table directly. |
| `stock_adjustments_link_order` / `link_stock_adjustment_to_order()` | Fills `order_id` only when a reason string identifies exactly one matching order; preserves an explicit link and avoids guessing on duplicates. It does not authorize stock adjustments. |
| `trigger_audit_customers`, `trigger_audit_products`, `trigger_audit_sale_items` / `write_audit_log()` | Enabled triggers run only after `UPDATE` or `DELETE`; they do not audit inserts. The function writes before/after row JSON to `audit_logs` and uses qualified table references. The supplied trigger list contains no audit trigger on `cash_register`; `useCashRegister.js` inserts manual cash transactions directly and does not write an audit row, so cash-entry auditability also depends on another deployed mechanism. |
| `trigger_anonymize_customer` / `anonymize_customer()`; timestamp triggers | These implement anonymization or timestamp maintenance. They do not establish caller authorization. |
| `update_team_members_updated_at` on `_retired_team_members` | Appears to be a legacy trigger association on a retired table. Confirm the table is unused before cleanup; it is not a current POS authorization control. |

The trigger bodies for `write_audit_log` and `prevent_role_escalation` use `search_path=public`; the referenced application tables/functions in the supplied bodies are schema-qualified. Current RPCs and other trigger routines commonly use `public, pg_temp`. Query 8 now checks whether `anon` or `authenticated` can create objects in `public`; do not standardize these function paths until that schema privilege is confirmed.

The supplied trigger-state result lists 13 non-internal triggers in `public`; all report `tgenabled = 'O'` (enabled for normal operation). Their event definitions agree with the supplied trigger-function inventory: customers normalize on insert/update and anonymize before update; order after-hours capture runs after insert; order-number guard runs before insert/update; loyalty sync runs after insert/update/delete; profile role guard and timestamp maintenance run before update (role guard also before insert); audit triggers run after update/delete for customers, products, and sale_items, so inserts are not covered; settings timestamp maintenance runs before update; stock-adjustment linking runs before insert/update. The catalog contains no profile-delete trigger and no cash-register audit trigger. This confirms trigger state and events, but not table grants, RLS behavior, or view/sequence/schema privileges. Those remaining live results are required before any broad policy or table-grant migration.

## Implementation order after live verification

1. The legacy-RPC revocation is confirmed by the follow-up ACL output; retain that output with the deployment record.
2. Close any remaining public/anon access to sensitive tables and functions.
3. The cash-entry RPC is prepared in the working tree; add role-checked RPCs for product metadata and inventory, customer updates, supplier CRUD, settings, and narrowly scoped profile edits.
4. Remove or revoke obsolete direct write paths only after the replacement is deployed and the UI is switched over.
5. Keep reads governed by least-privilege RLS and verify every view's security mode.
6. Run role matrix checks in staging: allowed operation succeeds; disallowed operation fails at the database boundary; service-role-only workflows remain unavailable to renderer clients.
7. Apply reviewed policy changes to production only after staging verification and a current backup.
