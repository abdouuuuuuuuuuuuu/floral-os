# Blossom assistant P1 enhancement plan

P1 closes important gaps in the assistant’s day-to-day order workflow after P0 data and routing reliability. Any operation that changes records must remain review-first and use the same business rules as the Orders and Checkout screens.

## P1.1 — Make order creation payment truthful

**Problem:** The chat order flow treated USD as a payment-method label, then asked staff to type an unverified conversion note while recording a DA amount. This could make the order, cash-in, and receipt disagree.

**Change:** Read the configured USD exchange rate from Blossom Settings. When USD is selected, accept the amount in USD, show the DA equivalent and remaining balance, persist the DA amount to the order/cash records, and store the conversion as an audit note. Disable USD selection when no exchange rate is configured.

**Acceptance:** The review step shows USD tender and DA equivalent. Amount paid/due and cash-in use the converted DA amount. Invalid or missing rates cannot be used to create a USD payment.

## P1.2 — Keep cart items available inside guided order creation

**Problem:** The assistant order draft can search the catalog but does not bring in items already selected in the cart, although the full editor supports this.

**Change:** Add an explicit “Add products from your cart” action to the in-chat products step. Merge duplicate product lines by quantity and retain the cart’s price and product details; keep quantity and removal controls available after import.

**Acceptance:** Cart lines are added once per click, merged by product ID, included in the visible order total, and carried into review and save.

## P1.3 — Make order edits complete but reviewable

**Change:** Support add/remove products (including from cart), quantity and unit-price adjustment, customer/contact, date/time/fulfillment, notes, source, and authorized status changes. Search the complete active catalog with category browsing, loading/error/empty states, and incremental results. Present a field-level before/after diff and total/paid/due summary before save. Keep recorded payments immutable in order editing; use the dedicated payment action for money changes. Reuse the same request key when retrying an unchanged item-addition save.

**Acceptance:** Every editable field maps to the correct persisted order field; cancelled orders and unauthorized roles cannot be edited; no change is saved before review confirmation. Price, quantity, additions, removals, tax, and adjustment produce an accurate preview; collected payments remain unchanged while due/payment status is recalculated by the transactional RPC; an uncertain retry cannot duplicate added products.

## P1.4 — Expand assistant capability coverage safely

**Change:** Compare each user-facing module with assistant read/action capabilities. Add missing grounded read paths for customer order history, supplier purchase history, and cash register periods. Keep reports, delivery schedules, and the existing read tools aligned to their real data sources. For high-risk or bulk operations, require explicit selection and review; use transactional database operations before exposing multi-record writes.

**Acceptance:** The assistant only claims a module capability when there is a grounded query/action behind it. Customer history resolves linked IDs and legacy exact-name orders; supplier and cash results stay role-gated; date-range totals are based on all matching register rows. Unsupported analytics (such as profit without cost data) receive a precise limitation and next step rather than an invented figure.

## Delivery sequence

1. P1.1 USD payment conversion.
2. P1.2 use current cart in the guided draft.
3. P1.3 complete edit review and persistence mapping.
4. P1.4 feature coverage audit and missing read tools; treat multi-record writes as a separate reviewed, transactional slice.

## Implementation status (2026-10-10)

- **P1.1 implemented:** both the guided draft and its review editor use the configured rate and store the DA equivalent plus conversion note.
- **P1.2 implemented:** cart lines can be merged into the in-chat order draft.
- **P1.3 implemented in the assistant editor:** full active catalog search/category browsing, loading/error/empty/retry states, incremental result loading, editable unit prices, cart/product/quantity changes, delivery/customer/source/note/status updates, an explicit field-level review, and retained payment history with an updated due preview. Retries reuse an item-add request id while the same draft is being saved.
- **P1.4 implementation:** added customer order history (with exact-name fallback for legacy/unlinked orders), supplier purchase history with current balance, explicit supplier field selection, and owner-only cash-register summaries across a requested day/week/month period. Delivery reads use Delivery route permission (including delivery staff without Orders access), and dashboard overview is denied when Dashboard is unavailable. Capability copy names only supported reads. Report revenue is distinguished from cash collected, and profit remains explicitly unavailable without cost data.
- **P1.8 implementation:** delivery schedule responses now page in batches of 10, sort by date/time, report exact totals and visible ranges, and support a “next deliveries” follow-up that retains the original date and status filters.
- **P1.4/P1.8 still need workspace verification:** exercise the documented role, RLS, schema, date-boundary, empty-result, and pagination scenarios against the configured Supabase workspace. Supplier history is purchase-entry history (not a full payment ledger); period cash detail shows the latest eight entries, while daily summaries appear only for single-day queries.
- **Next P1.5 implemented:** added an order-delay migration with an optional RPC reason, `Africa/Algiers` business-date validation, and explicit preservation of status/payment fields. The date picker uses the same timezone, and delay failures show actionable messages. Unit/catalog checks pass; live Supabase migration and role verification remain open.
- **USDT tender rate set to 250 DA:** the legacy `usd_exchange_rate` setting now defaults to 250, the Settings screen labels the tender as USDT, and a migration updates the saved shop setting and database default. The internal `usd` method/column stays for data compatibility.
- **Automatic order-ticket printing:** checkout receipts, quick-sale tickets, and assistant-created orders trigger the existing print flow once when their ticket/success view appears. The manual Print controls remain available for retries or extra copies.
- **Verification:** no tests or build were run in this pass. Run the manual scenarios in `assistant-p1.4-capability-audit.md` through the VS Code workflow before marking P1 fully accepted.
