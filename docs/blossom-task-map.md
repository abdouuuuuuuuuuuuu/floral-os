# Blossom task map for assistant expansion

This map was assembled from the routes in `src/App.jsx`, role rules in
`src/lib/permissions.js`, page and hook behavior, Supabase calls, assistant
intents/tools, migrations, and Edge Functions. It describes capabilities found
in this checkout; it is not a claim that production RLS has been verified.

## Roles and app areas

| Area / route | Current UI access | Tasks available in the app |
| --- | --- | --- |
| Sign in, `/auth/login` | Public | Sign in with email or username and password; choose remember-me; recover password; handle invitation-only sign-up; update password from recovery link; sign out. |
| Dashboard, `/dashboard` | Owner, manager, florist, cashier | View business and order queues, due/overdue work, outstanding balances, stock alerts, cash tile where available, alerts; open relevant order/product/delivery pages; complete/void/reschedule queue orders. |
| Products, `/products` | Owner, manager, florist | Browse/search/filter catalog and stock; add product; edit name, price, category, description/image, stock and active state; remove stock with reason; view categories; mark favorite. Flower waste can be recorded through the waste workflow. |
| Cart, `/cart` | Owner, manager, florist, cashier | Search/filter/sort products; add, remove, change quantities, clear cart; see totals and low-stock warnings; retain cart for the current signed-in session. |
| Checkout, `/checkout` | Owner, manager, florist, cashier | Select/create customer; enter customer/contact, delivery date/time/method, source, notes; adjust price; choose payment; review/confirm order; record initial payment; open receipt. Quick sale is the same cart/checkout flow with pickup defaults. |
| Orders, `/orders`, `/orders/:id` | Owner, manager, florist, cashier | Search, filter, sort, page, inspect and print orders/receipts; edit order fields and line items; change status; record full/partial payment; refund; delay/reschedule with reason; cancel/void with reason; permanently delete (owner only in UI role matrix). |
| Deliveries, `/delivery` | Owner, manager, florist, delivery | Browse daily/overdue/weekly delivery queues; change date; mark delivered; record failed delivery and resolution/reschedule; open linked order. |
| Customers, `/customers` | Owner, manager, florist, cashier | Search/browse customers; create and edit profile/contact/address/notes/preferences/source; view order history; expand recent orders; attach customer during checkout. |
| Reports, `/reports` | Owner, manager | View revenue/order trends, top products, status/source/payment/delivery breakdowns, cashier performance and totals; select date range/tab; refresh; export report as CSV. Flower waste report is included. |
| Suppliers, `/suppliers` | Owner, manager | Search/create/edit/deactivate supplier; inspect balance and purchase/payment history; receive stock and record supplier purchase; edit or void supplier entry; record supplier payment/settlement. |
| Cash register, `/coffre-forte` | Owner | View current and historical daily summaries/transactions; open register and carry after-hours orders; add cash-in/cash-out entries and expenses; reconcile linked order payments; close register by payment method; inspect day details; print daily report. |
| Team, `/team` | Owner, manager | Browse staff; invite/create member via Edge Function; update contact/profile fields; activate/deactivate; owner can assign role; reset member password through Edge Function. Manager role changes are blocked. |
| Settings, `/settings` | Owner | Edit shop identity/contact, business hours, alerts, daily target and USD exchange rate; save settings. |
| Shell / cross-cutting | Signed in (varies by component) | Navigate routes; receive notifications; monitor connection/realtime state; show live cursors; use undo where available; configure local assistant/model preferences; print receipts and reports. |

The app role map is: `owner` and `manager` can access management areas; `florist`
can operate products and shop workflows; `cashier` can use front-counter/order
workflows; `delivery` can use delivery workflows. The exact route matrix is the
source of truth in `src/lib/permissions.js`; database authorization must match
and may be stricter for individual mutations.

## Assistant capabilities found today

The assistant currently routes read requests for:

- Order lookup/search/listing, status, customer facts and history, creator,
  delivery date/period, overdue, unpaid, created-today, and business overview.
- Product stock/availability/price and flower-waste reporting.
- Customer lookup, supplier lookup plus supplier purchase/payment history.
- Cash-register summary (owner-gated) and sales/report-period questions.
- Navigation, help/how-to, multi-read plans, and selection from prior results.

It can start guided order creation/editing and prepare these reviewed actions:

- Create or edit an order and its line items.
- Delay/reschedule an order.
- Record order payment or refund.
- Cancel/void an order; permanently delete after explicit confirmation.

The assistant uses `intentEngine.js` + `router.js`, model-facing tool schemas in
`capabilities.js`, validation in `intentContract.js`, read logic in
`queryService.js`, and UI write components in `AssistantOrderActions.jsx`.
Those are the current assistant execution boundaries.

## App tasks not yet exposed as assistant actions

These tasks exist in the UI but are not first-class assistant tools in the
current capability list. They are the main expansion backlog:

1. **Catalog and stock changes:** add/update/deactivate product, adjust stock
   with reason, record flower waste, manage categories/favorites.
2. **Customer management:** create/update customer, update preferences/notes,
   merge or deduplicate if the product later supports it (merge is not present
   in this app today).
3. **Delivery execution:** mark delivered, record failed delivery and its
   resolution, change status. The assistant can read and reschedule deliveries,
   but does not execute these delivery outcomes today.
4. **Supplier operations:** create/edit/deactivate supplier, receive stock,
   amend/void a purchase entry, record/settle supplier payment.
5. **Cash operations:** open/close register, enter cash-in/out/expense, reconcile
   discrepancies, list after-hours orders and carry them into opening.
6. **Team administration:** create staff account, change profile/role, activate
   or deactivate, reset password. These involve account-security consequences
   and should remain tightly confirmed and owner-authorized.
7. **Shop settings:** edit business details, hours, targets, alerts, exchange
   rate.
8. **Report output:** choose ranges/sections and export CSV; print receipts or
   daily cash reports. These are UI/browser side effects rather than database
   writes, but still need explicit supported tools.
9. **Cart/checkout composition:** add/remove/change cart lines and prepare
   checkout fields before final order review. The assistant's current order
   creation form already covers much of this, but is separate from general
   cart manipulation.

## Existing mutation entry points to reuse

Do not let the model write tables directly. Reuse these operations and migrate
any unsafe direct writes into checked RPCs/functions before exposing them:

| Operation family | Current data entry points |
| --- | --- |
| Orders | `create_order`; `edit_order_and_items`; `record_order_payment`; `delay_order`; `void_order`; `delete_order`; some status updates remain direct `orders.update()` calls. |
| Delivery | `record_delivery_outcome`; `delay_order`; `markDelivered` and some status changes include direct `orders.update()` calls. |
| Suppliers | `receive_supplier_stock`; `update_supplier_entry`; `void_supplier_entry`; `pay_supplier`; supplier CRUD currently uses direct table writes. |
| Cash | `open_cash_register_with_after_hours`; `close_cash_register`; `list_after_hours_orders`; cash transaction insertion currently includes direct table writes. |
| Inventory/waste | `record_flower_waste`; stock adjustments and product CRUD currently include direct table writes. |
| Customers/settings/team | Customer and settings CRUD, and profile updates, include direct table writes; staff account creation/password reset use Edge Functions. |

The specific role checks inside every deployed RPC/function and the RLS policies
for direct writes still need a live schema/policy audit. The assistant role
checks in JavaScript are defense-in-depth for UX, not a database security
boundary. In particular, the previously generated SQL only caps SELECT access;
it does not secure these mutations.

## Suggested capability catalog shape

Represent each supported task with a stable identifier and metadata, rather
than growing a large prompt-only list:

```text
id, domain, operation, read_or_write, input_schema, resolver,
required_roles, confirmation_level, idempotency_key, reversible,
result_schema, audit_event, tests
```

Execution should resolve conversational names to live record IDs, validate
every argument, re-check role and current record state at execution time, then
call a narrow RPC/Edge Function. High-impact operations should return a review
card before commit. The model should receive only the minimum record fields
needed to resolve and explain the task.

## Priority order

1. **Unify authorization and mutation APIs.** Move direct high-impact writes
   (status, cash entries, product stock, supplier/customer/profile changes) to
   narrow role-checked database functions; inventory current RLS first.
2. **Complete core operations:** delivery outcomes, inventory/waste, customer
   edits, supplier receiving/payment, and cash open/close/transactions.
3. **Add team/settings tools** with stricter owner-only checks and audit logs.
4. **Add navigation, printing and export helpers**, then build multilingual
   phrase coverage and a real evaluation set around all catalog entries.

## Evidence locations

- Routes: `src/App.jsx`
- Route/action roles: `src/lib/permissions.js`
- Assistant intent/tool contract: `src/lib/assistant/intentEngine.js`,
  `src/lib/assistant/capabilities.js`, `src/lib/assistant/intentContract.js`
- Assistant reads and gating: `src/lib/assistant/queryService.js`
- Assistant write UI and RPC calls: `src/components/layout/AssistantOrderActions.jsx`,
  `src/components/layout/BlossomAssistant.jsx`
- App data behavior: `src/hooks/` and `src/pages/`
- Database functions included in this checkout: `supabase/migrations/`
- Privileged account flows: `supabase/functions/`
