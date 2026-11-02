# Blossom assistant P0 enhancement plan

P0 covers failures that prevent a user from getting a reliable answer or completing a core order task. The first pass is deliberately limited to behavior that can be verified from current code and user-reported failures.

## P0.1 — Make order retrieval complete and consistent

**Problem:** Supabase `neq('order_type', 'quick_sale')` also excludes rows where `order_type` is `NULL`. Other assistant queries already include null legacy rows, so the same question can return different order populations depending on its wording.

**Change:** Use the same predicate everywhere an assistant request means regular orders: `order_type IS NULL OR order_type != 'quick_sale'`. Apply it to due, overdue, period, status, and created-today queries. Keep quick-sale orders out of those results; queries explicitly about sales/revenue may include them according to the Reports page’s definition.

**Acceptance:** A legacy order with null `order_type` appears in every applicable order query. A quick sale does not appear in regular-order results. Counts and displayed rows use the same predicate.

## P0.2 — Give order creation one guided entry point

**Problem:** A bare “create order” starts the in-chat guided draft, while a more detailed request opens a different editor. This makes the assistant’s behavior unpredictable and weakens its conversational order flow.

**Change:** All explicit create-order requests start the guided in-chat draft. Preserve the original request as context and let the user add products, customer, fulfillment, payment, notes, and adjustments through the existing draft controls and review step. Never save without explicit review and confirmation.

**Acceptance:** “Create order”, “Create an order for Amel”, and “Create an order with 3 red roses” all open the same guided workflow. The user can still ask an unrelated question and resume or cancel the draft.

## P0.3 — Protect answer accuracy and action boundaries

**Change:** Keep order facts grounded in database results; answer the requested field concisely, preserve the selected order as follow-up context, and show disambiguation when a customer name matches multiple orders. Writes remain review-first and permission-checked.

**Acceptance:** After “Who is order 786 for?”, “what’s their number?” resolves against order 786. A named customer lookup returns order details when requested, not just navigation. Ambiguous matches are presented as choices.

## P0.4 — Stabilize shop-day date handling

**Problem:** Assistant date ranges currently depend on the machine’s local timezone. A staff device configured outside Algeria can disagree with the shop’s calendar day.

**Change:** Use the shop timezone (`Africa/Algiers`) for assistant day boundaries, relative dates, and timestamp ranges. Keep date-only delivery fields as calendar dates.

**Acceptance:** “Today”, “tomorrow”, and “created today” use Algeria’s shop day even when the computer timezone differs.

## Delivery order

1. P0.1 order population consistency.
2. P0.2 one guided order-creation path.
3. P0.3 verify conversational entity continuity and concise fact answers; fix any missed branches found during the code pass.
4. P0.4 timezone-safe assistant date ranges.

Each slice should be checked against the acceptance criteria and the app build before moving to the next priority tier.

## First-pass implementation status (2026-10-10)

- **P0.1 complete:** assistant order lists now consistently include `NULL` legacy order types and exclude quick sales, including “created today”.
- **P0.2 complete:** every explicit create-order request enters the guided in-chat draft; no separate create editor is opened based on phrasing.
- **P0.3 code review complete:** grounded order lookups, customer-name switching, concise fact responses, and stored order follow-up context are present. Still needs interaction validation with real workspace data before marking closed.
- **P0.4 complete:** assistant calendar interpretation and timestamp range filters now use `Africa/Algiers`.
- **Verification:** production build succeeds. Oxlint reports no warnings in the edited assistant modules; repository-wide lint still reports pre-existing warnings in other files.
