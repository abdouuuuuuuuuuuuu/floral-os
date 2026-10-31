# Blossom assistant: enhancement requirements and implementation checklist

**Purpose:** Turn the assistant capability map into an implementation-ready product and engineering plan. The plan describes the current baseline, the user-facing requirement, the concrete build approach, acceptance criteria, and a prioritized to-do list.

**Scope:** The in-app Blossom assistant, its chat/orb UI, intent and local-model routing, live reads, guided order workflows, role checks, and evaluation. This is a plan only; implementation and production builds are out of scope for this document.

## Product principles

1. **Understand the requested outcome.** Resolve the domain, operation, entity, requested fields, time scope, and follow-up context before choosing a tool.
2. **Treat Blossom data as the source of truth.** The model can interpret language and propose a typed tool call; verified database results determine factual answers.
3. **Be concise by default.** Answer the field asked for first. Offer full records or more detail only when requested or useful.
4. **Never guess identity or scope.** Ask one focused question when names, dates, actions, or targets are ambiguous. A generic “orders” request does not mean today.
5. **Make writes review-first.** Show a clear before/after or transaction summary, check role permissions, and require confirmation before any write. Keep destructive operations explicit.
6. **Make errors recoverable.** Distinguish not found, forbidden, unsupported, validation, offline, and transient failures. Keep the user's prompt and draft available where safe.

## Current architecture and baseline

The UI and session state live in `src/components/layout/BlossomAssistant.jsx`; guided order forms and review actions live in `AssistantOrderActions.jsx`. `src/lib/assistant/intentEngine.js` classifies deterministic intents, `router.js` selects the route, `capabilities.js` defines local-model tools, `localAssistantModel.js` validates model tool proposals, `queryService.js` performs live reads, and `conversationState.js` retains session context. `dataAccess.js` provides shared query/date helpers. `permissions.js` and Supabase RLS enforce access. Electron's assistant bridge allowlists local-model operations.

Today, deterministic rules are primary. Ollama is used for `help` and `order_clarification` fallbacks rather than every turn. A model-selected read may be synthesized from verified rows; model output is never authoritative business data. The assistant generally runs one selected capability per turn. It already supports live reads across orders, customers, products/stock, deliveries, suppliers, cash register (owner only), and reports; guided create, edit, delay, payment/refund, cancel, and delete review flows exist with different role gates. Existing RPCs include `edit_order_and_items`, `delay_order`, `record_order_payment`, `void_order`, and `delete_order`.

Important existing limits to retain as explicit constraints: no current stock movement ledger; no purchase-cost basis for profit; waste reporting is monthly aggregate; supplier, cash-register, and delivery capabilities have read limits; no multi-record writes; and chat context is session-local. Current accepted status labels, stock bands, route permissions, report definitions, and date semantics must be verified against their source screens/schema when implementing enhancements rather than copied as hidden assumptions.

## Requirements by capability

### A. Conversation, intent, and local model

**A1. Unified intent contract — P0 foundation**

- **Requirement:** Every turn resolves to a typed result: `success`, `needs_clarification`, `not_found`, `forbidden`, `unsupported`, `validation_error`, or `retryable_error`. It must include domain, operation, entities/IDs, requested fields, time filters, and whether the user is asking for information, guidance, navigation, or a write.
- **Build:** Normalize spelling, punctuation, accents, singular/plural, known French/local terms, and catalog aliases in `intentEngine.js`. Move extraction and route choice behind one orchestrator in `router.js`. Keep current deterministic exact-match routes as fast paths. For uncertain supported-language paraphrases, ask the local model for a schema-validated typed proposal using `capabilities.js`; resolve its entity references against live Blossom records before query execution. Keep the Electron allowlist and argument validators in sync. Do not execute database calls from model-authored prose.
- **Acceptance:** Equivalent paraphrases produce the same typed operation; an invalid tool/argument invokes no query or mutation; no-match and unsupported requests are not rendered as generic failure.

**A2. Conversational continuity — P0/P2.1**

- **Requirement:** Follow-ups such as “what’s its number?”, “what about Hedade?”, “the second one”, and “show all details” continue the correct topic/entity while explicit new names, IDs, domains, or tasks replace stale context.
- **Build:** Extend the versioned state in `conversationState.js` with active domain/entity, candidate result IDs, selected result, pending slot/clarification, active draft ID/type, and compact last structured result. Resolve pronouns and ordinals only against those IDs. Implement explicit transitions: retain for a relevant follow-up; replace for an explicit new target; clear/refresh on new chat, role/user change, and successful mutation. If multiple references remain plausible, ask one targeted clarification and show candidates. Keep business facts live-read; context stores identifiers, not remembered answers.
- **Acceptance:** Order fact follow-ups fetch the same order; “what about [name]?” searches that name; switching to stock cannot leak an old order; ambiguous references never silently select one.

**A3. Local model orchestration — P1**

- **Requirement:** Make the local model a natural-language interpreter and response composer for Blossom tasks while preserving deterministic behavior when Ollama is unavailable.
- **Build:** First implement A1's typed contract. Then expand model use to entity extraction, paraphrases, compound read planning, and follow-up resolution, not direct DB access. Use per-request timeouts, cancellation, bounded input/history/context, JSON/schema validation, allowlisted tool names, and deterministic fallback. For reads, pass only the minimum verified result rows into synthesis. For writes, model may fill a draft but cannot confirm or save. Show model connection/offline state accurately and never imply a cloud LLM is active.
- **Acceptance:** With Ollama offline the deterministic supported paths remain functional; malformed or prompt-injected output cannot expand access or perform a write; generated summaries contain only facts present in verified results.

**A4. Confidence, ambiguity, and recovery — P0**

- **Requirement:** Use confidence internally to decide answer vs clarify; never claim heuristic scores are measured probabilities. Route uncertainty to a small set of useful recovery actions.
- **Build:** Implement the existing `assistant-intent-probability-tree.md` as routing rules with recorded reason codes. High-confidence reads can execute; mid-confidence requests clarify; low-confidence requests give scoped examples. Missing write target/details always clarify. Add typed error presentation and retry policy. Keep prompt, active entity, and valid draft on transient errors.
- **Acceptance:** Similar competing intents trigger clarification; generic words never select arbitrary dates/entities; retry does not duplicate mutations.

### B. Orders

**B1. Find orders by every supported key — P0**

- **Requirement:** Resolve by exact order number/ID, customer name, phone, status, delivery date/time, created date, amount/amount range, payment state/method, item/product, and combinations. Distinguish order ID from an amount or unrelated number.
- **Build:** Define a normalized `OrderSearch` input contract in `intentEngine.js` / `queryService.js`. Build one query builder over `orders` with explicit filters and pagination, using the shared order-type predicate (include legacy NULL `order_type`; exclude quick sale for regular order searches). For customer search, match normalized name/phone and return all relevant order candidates, not only the newest. Add ranges and exact-money parsing with DA/USD context safeguards. Resolve relative dates using `Africa/Algiers`. Return stable IDs plus only the fields needed for the question. Add indexes only after checking existing schema/query plans.
- **Acceptance:** Each key works independently and in combination; no result is silently substituted; multiple customer matches are numbered choices; a bare query does not default to today; list counts and rows share the same filter.

**B2. Answer exactly the requested order field — P0**

- **Requirement:** “Name?” returns customer name; “what’s its number?” returns phone if that is the conversational context; status, payment status, date, items, creator, total, paid, due, method, notes, and full details each have distinct response shapes.
- **Build:** Add a field-selection stage after target resolution. Use typed answer templates in `queryService.js`/a response formatter. Only fetch extra related fields when needed. Keep a “Show full order” expansion for itemized data. Preserve structured order context for follow-ups.
- **Acceptance:** Every field question answers first with only that fact; “show order 876” returns the full supported record; missing values are labeled unavailable rather than invented.

**B3. Order lists, status, creator, and delivery queries — P0/P1**

- **Requirement:** Support explicit status buckets, orders created by staff, latest N, due/late schedules, delivery method, and date ranges with reliable sort and counts.
- **Build:** Share filter construction and status mapping across list intents. Parse “last N” with a safe cap and communicate the cap. Join creator profiles only when requested and permission allows. Keep pickup orders out of delivery-run queries; define active/cancelled behavior explicitly. Sort scheduled rows by date/time, put unknown times last, and return complete count metadata separate from displayed sample size.
- **Acceptance:** “Who created the last 3 orders?” returns creator per order; “orders due tomorrow” uses the shop timezone; pickup/cancelled inclusion follows explicit rules; counts match filters.

**B4. Guided order creation — P0/P1**

- **Requirement:** A single in-chat flow supports catalog search across the full product set, categories, quantity/price, cart import, existing/new/walk-in customer, fulfillment schedule, delivery method, notes, payment method, amount collected, USD conversion, review, save, and receipt printing. Walk-in orders can be payment-only/pickup-now where selected; delivery is not forced for walk-ins.
- **Build:** Reuse `AssistantOrderActions.jsx` and existing order persistence rules. Improve product step to query/search the full active catalog (not just recent/popular products), with category/filter, stock and price visibility, empty/loading/error states, paging, and add controls. Merge imported cart lines by product ID. Keep draft structured and resumable while reading other data. Validate stock/quantity, required customer/delivery fields, configured USD exchange rate, amount paid, notes, and totals. Show a complete review card and an explicit confirmation. On success return order number and print action using the same receipt function as Orders. On failure preserve draft and avoid duplicate retry.
- **Acceptance:** Search finds older catalog products; all order fields are reviewable; totals/payment/cash-in/stock effects agree; save occurs once; print action only appears after successful creation.

**B5. Edit order, including cart products — P1**

- **Requirement:** In one reviewable edit flow staff can add/remove products, change quantities/prices, import cart items, update customer/contact, delivery date/time/method, notes/source, status, and payment information only where role policy permits.
- **Build:** Load order into an isolated draft keyed by order ID; compare original vs proposed lines/fields. Reuse product catalog and cart-merge utilities from B4. Validate line totals, stock adjustments, paid/due invariants, legal status transitions, and role matrix. Submit the complete diff through `edit_order_and_items` or a reviewed transactional RPC; do not update order rows and stock separately in a way that can partially succeed. Show before/after with added/removed lines and total/payment delta. Clear stale context and re-fetch after success.
- **Acceptance:** Every displayed edit maps to a persisted field; stock and order totals stay consistent; cancelled/unauthorized edits are blocked; cancel discards draft; save only follows explicit review.

**B6. Delay/reschedule one order or selected orders — P1 then later bulk**

- **Requirement:** Delay a specific identified order with a new date; reason is optional. Preserve payment/status. A future “all orders” operation must present an explicit selection, preview, and transaction semantics.
- **Build:** Use `delay_order` via the validated RPC signature already installed in the DB; handle schema-cache/migration mismatch as a clear retryable setup error. Require target + valid new date; do not require reason. For multi-order delay, first add selection UI and a transactional server-side bulk RPC with per-order outcomes, role checks, idempotency, audit details, and all-or-nothing or explicitly partial semantics; never infer which “all” means.
- **Acceptance:** Date persists; payment/status unchanged; optional reason does not block save; failures retain the draft. Bulk remains disabled until explicit selection and server transaction are available.

**B7. Payment, refund, cancel, delete — P1**

- **Requirement:** Distinguish payment-state questions from collecting money; distinguish cancel/void from permanent deletion; prevent overpayment/refund errors.
- **Build:** Keep `record_order_payment`, `void_order`, and `delete_order` behind role checks and typed drafts. Validate amount, method, remaining balance/refundable amount, USD rate, cash-register effects, reason, and state transition. Show order ID, customer, amount, method, and balance impact before confirmation. Permanent delete remains owner-only and uses a separate destructive confirmation. Use idempotency keys or server-side duplicate protection where available.
- **Acceptance:** No financial/destructive write from an ambiguous prompt; payment and cash register reconcile; cancel preserves an audit record; delete is explicit and permission-gated.

### C. Products, inventory, and waste

**C1. Product lookup/search — P0**

- **Requirement:** Resolve product by full catalog name, alias/shortcut, category, flower type, color, and SKU if available; distinguish product price from order/revenue amount.
- **Build:** Read canonical catalog data and shortcut mapping, normalize aliases to product IDs, and return exact matching products with price/stock. If color alone maps to multiple flower types, clarify or show the matches. Reuse full catalog search from B4.
- **Acceptance:** Common singular/plural, color, typo, and local-language variants map only to valid catalog records; ambiguous color does not invent a flower.

**C2. Stock levels, thresholds, and inventory summary — P0/P1**

- **Requirement:** Answer exact quantity, out/low/healthy lists, threshold, category/color breakdowns, total units, and retail valuation without implying profit or purchase cost.
- **Build:** Centralize stock bands/threshold definitions and make them match Products UI settings; avoid hardcoded `1–9/10–29/30+` if configurable thresholds exist. Query active product inventory with pagination. Aggregate by catalog dimensions only when data supports the grouping. Label retail value as `stock × selling price`. Clarify negative stock as an inventory correction issue.
- **Acceptance:** Chat and Products page agree on bands and thresholds; counts/sums match the filtered active product set; retail value never appears as cost/profit.

**C3. Stock movement and adjustments — later, schema-dependent**

- **Requirement:** Users can ask what was received/used/wasted and request controlled receive, damage, or adjustment operations with a traceable history.
- **Build:** First design a stock ledger schema (product, delta, movement type, unit cost where known, reference, actor, timestamp, reason, idempotency). Backfill only if source records exist. Then add read filters and staged writes through a server transaction/RPC with permissions and before/after stock review. Until shipped, state clearly that current stock is available but historical movement detail is not.
- **Acceptance:** Ledger totals reconcile with product on-hand levels; each adjustment has actor/time/reason; no chat response claims a receipt or loss was recorded before confirmed success.

**C4. Flower waste — P1**

- **Requirement:** Answer current supported monthly waste aggregates and make data coverage explicit; later support date/product detail if stored.
- **Build:** Use `monthly_flower_waste`; define month/timezone and cost meaning with Reports source. Include quantity, estimate, entry/product counts; do not fabricate daily or per-product breakdowns. Add deeper breakdown only after schema provides the dimensions.
- **Acceptance:** Values match Reports for the same period and the assistant labels monthly aggregate coverage.

### D. Customers and suppliers

**D1. Customer lookup and history — P1**

- **Requirement:** Find customers by name/phone; answer contact details and order count/history/balance as asked without confusing a customer profile with one order.
- **Build:** Define separate customer and customer-order intents. Search normalized names/phone; if several customers match, ask which. Add paged order history from live `orders` with shared order filters. Display only requested PII fields and obey Customers/Orders route permissions. Do not provide aggregate receivable unless the data and role permit it.
- **Acceptance:** “Find customer X” returns profile; “show X’s orders” returns matching orders; follow-up phone stays with selected customer; no unrelated newest order is selected silently.

**D2. Supplier lookup and balances — current read-only, P1 improvement**

- **Requirement:** Search supplier identity/contact/balance and answer supported purchase history only if schema semantics are confirmed.
- **Build:** Keep current role gate (owner/manager) before reads. Add exact fields and query limits to the typed contract. Before exposing purchase-history answers, inspect stable source tables, define paid/due semantics, and reconcile with Suppliers page. Supplier create/payment/stock-receive remain guided to their existing module until matching transactional operations are implemented.
- **Acceptance:** Permission denial occurs before query; unsupported fields say what is available; supplier payable is never confused with customer receivable.

### E. Delivery, reports, cash register, and business pulse

**E1. Delivery schedule — P1**

- **Requirement:** Find scheduled deliveries by today/tomorrow/exact date/week/month, time, method, status, and customer; exclude pickup from delivery runs unless explicitly requested.
- **Build:** Use shop timezone ranges; share order filters; document whether cancelled/done orders are included per query wording. Support pagination for periods over the current 20-row cap, show total vs shown, sort by date/time, and clearly flag missing time. Preserve order links/context.
- **Acceptance:** Same schedule dates as Orders; pickup exclusion is consistent; longer ranges can be paged and never silently truncate without a label.

**E2. Reports and business pulse — P1/P2**

- **Requirement:** Answer revenue, order count, average order value, comparisons, best day/top products, and actionable business overview with exact period and metric definition. Revenue must not be described as cash collected; profit must not be claimed without cost data.
- **Build:** Reuse existing report views/functions (including `report_daily_revenue`) rather than recalculate incompatible metrics in the client. Resolve periods in shop timezone and report the exact dates. For comparative requests, query comparable periods and calculate delta/percent with zero-baseline handling. Show source metric/period and summarize only verified output. Add a bounded multi-read plan later for compound questions.
- **Acceptance:** Assistant values reconcile with Reports; period/metric are stated; missing cost data blocks profit claims; partial query failure is surfaced.

**E3. Cash register/Coffre Forte — owner-only, read-only initially**

- **Requirement:** Read opening/closing state and cash-in/out summaries with date, and distinguish register cash from order revenue/payment totals. Later cover post-close orders as a tagged next-opening cash-in, if not already handled in register logic.
- **Build:** Preserve owner gate and read source. Define date and transaction inclusion from Coffre Forte. For post-close order carryover, model a closing-session ID and deferred-entry linkage (order ID, creation timestamp, amount/method, original close, next opening), display the source tag, and create/reconcile entries transactionally when opening. Audit and prevent duplicate carryover. Chat can explain/list it only after the underlying register flow is correct; do not implement cash writes through model routing.
- **Acceptance:** Chat totals match Coffre Forte for the same session; no double cash-in; deferred orders retain original order/creation details and a distinct tag at next opening.

### F. Write safety and audit

**F1. Consistent review and permissions — P0 foundation**

- **Requirement:** All write flows enforce the proposed role matrix in UI and server/database, show a complete review, and have success/failure recovery.
- **Build:** Map each typed action to a permission key in `permissions.js`; check before query and again in the authoritative RPC/RLS. Keep review UI in a shared action component. Include target identity, changed values, money/stock/cash effects, and confirmation. Refresh context only after verified persistence.
- **Acceptance:** UI and backend deny the same roles; no write is made by a read tool or model synthesis; rejected saves retain editable draft state.

**F2. Audit trail and undo — P2, schema-dependent**

- **Requirement:** Let authorized staff see who changed what/when and safely reverse eligible mistakes.
- **Build:** Design append-only audit records for actor, operation, entity, before/after diff, timestamp, outcome, reason, and correlation/idempotency ID. Add server-side transaction logging for edits, payment/refund, delay, cancel, and stock adjustments. Define reversible operations and time limits; “undo” creates a compensating transaction, never erases audit history. Gate audit visibility by role.
- **Acceptance:** Audit row and business mutation commit atomically; each undo is permission-checked and auditable; irreversible delete is clearly marked and excluded from undo unless soft-delete semantics are introduced.

### G. Chat UI, input, and orb

**G1. Answer presentation and progressive detail — P1**

- **Requirement:** A clean chat surface: direct answer first, compact result cards, expandable full details, contextual suggestions, and distinct assistant/user messages.
- **Build:** Use reusable renderers by response type (fact, list, metric, candidate picker, draft, review, error). Keep cards visually compact with accessible labels and stable alignment. Suggestions derive from the latest intent/result (e.g. after an order, status/items/phone; after stock, price/low stock), not a static universal set. Escape unsafe formatting/entities.
- **Acceptance:** Short fact responses stay short; full data is one explicit expansion; suggestions remain relevant after follow-up turns and do not replace the answer.

**G2. State, loading, and accessibility — P1**

- **Requirement:** Accurately show ready/listening/interpreting/looking up/preparing review/saving/success/offline/error states, with smooth but restrained animation.
- **Build:** Derive orb/chat state from actual request lifecycle and model connectivity; cancel stale requests; do not fake progress. Respect reduced motion. Add keyboard navigation, focus trapping/restore for the panel, screen-reader announcements, visible focus, and narrow-window layout checks.
- **Acceptance:** No stuck spinner after errors; status is announced and visually distinct; keyboard/reduced-motion paths work.

**G3. Panel/orb controls — preserve agreed interaction**

- **Requirement:** `K` toggles assistant when focus is not in an editable control; Escape minimizes; right-click orb exposes “Close Blossom entirely”; minimized/closed orb does not obscure page controls.
- **Build:** Keep shortcut registration centralized; ignore inputs/contenteditable; add tooltips and menu keyboard access; persist minimized state per session only if it does not conflict with explicit full-close. Verify stacking/position across page layouts and zoom levels. Full-close removes orb until `K` reopens.
- **Acceptance:** No collision with primary buttons; behavior is consistent across routes; keyboard shortcut is discoverable without interfering with typing.

### H. Guidance and navigation

**H1. How-to and page navigation — P1**

- **Requirement:** “How do I…?” provides short accurate steps; “open/go to…” navigates; data questions return data rather than sending the user to a page as a substitute.
- **Build:** Separate guidance/navigation from read intents. Maintain a route/capability registry derived from actual routes and role permissions. Link directly to relevant module only as a secondary action. Do not treat “show me order…” as navigation.
- **Acceptance:** Record requests return record cards; explicit navigation opens the page; unauthorized route never appears as an available action.

## Cross-cutting implementation requirements

- **Data contracts:** Version typed intents, tool schemas, results, drafts, and conversation context. Keep validators, Electron allowlist, and capability descriptions aligned.
- **Security:** Re-check role on every read/action; use RLS and server-side RPC checks as authority. Avoid leaking PII to local-model context beyond what is required to answer.
- **Reliability:** Add request cancellation, timeouts, pagination, stale-result protection, idempotency for writes, and explicit retry semantics.
- **Observability:** Record route category, outcome, latency, and fallback/error code only with privacy-safe diagnostics; do not collect raw prompts or result rows by default.
- **Schema discipline:** No new DB schema is assumed by the current UI plan. Audit/undo, stock ledger, cross-device drafts, and deferred cash carryover require separate migrations, RLS policies, transactional RPC design, and reconciliation.
- **Release discipline:** Add tests/evaluation fixtures as implementation work, but run them/build only when requested by the developer. Do not use a production build as an incidental check; developer builds through VS Code.

## Prioritized to-do list

### P0 — Accuracy and safe core (first)

- [ ] **P0.1** Finalize typed turn/result contract and map every existing intent to a structured outcome.
- [ ] **P0.2** Audit order query predicates, legacy NULL order types, quick-sale exclusion, pagination, and consistent counts.
- [ ] **P0.3** Complete order entity/field extraction for number, customer, phone, amount, status, dates, product, payment, creator, and requested field.
- [ ] **P0.4** Ensure direct field answers, explicit full-detail answer, disambiguation, and truthful no-match handling.
- [ ] **P0.5** Validate continuity transitions and topic switching using IDs, not rendered chat text.
- [ ] **P0.6** Align all relative date and timestamp filters to `Africa/Algiers`; keep delivery date-only values as calendar dates.
- [ ] **P0.7** Ensure all create/edit/payment/refund/delay/cancel/delete flows are role checked and review-first; reason is optional for delay.
- [ ] **P0.8** Add a versioned scenario catalog for every P0 route and neighboring-intent ambiguity before calling P0 closed.

### P1 — Complete day-to-day workflows

- [x] **P1.1** Make order creation search the complete catalog with category/filter, pagination, clear empty/loading/error states, and reliable aliases.
- [x] **P1.2** Finish create draft fields: cart import, customer/new/walk-in, pickup/delivery, date/time/method, note, payment/amount, USD conversion, final review.
- [ ] **P1.3** Add post-create receipt printing and duplicate-submit protection.
- [x] **P1.4** Complete order edit diff, cart import, product/quantity/price changes, customer/contact, fulfillment, notes, status/payment constraints, and atomic persistence.
- [ ] **P1.5** Fix and verify single-order delay RPC/schema compatibility, optional reason, preserved status/payment, and recoverable error state. Local forward migration and UI date boundary are ready; live Supabase verification remains open.
- [x] **P1.6** Complete payment/refund/cancel/delete amount/state validation and role-specific review.
- [x] **P1.7** Unify product stock thresholds with the Products page and expose full catalog/color/category searches.
- [x] **P1.8** Implement delivery pagination in batches of 10, preserve period/status on continuation, sort by date/time, and show total-versus-shown labels. (Manual Supabase/RLS verification remains.)
- [ ] **P1.9** Reconcile report definitions/periods with Reports UI; label revenue vs collected cash and report limitations. Local assistant and screen now use the same daily revenue view and Algiers calendar dates; live data reconciliation remains open.
- [x] **P1.10** Improve customer search/history and supplier/cash read contracts while respecting their role gates. Customer history is linked by profile ID and excludes quick sales; supplier ambiguity now requires an explicit selection before balance/history reads; owner-only cash gate is checked before querying.
- [ ] **P1.11** Refine response cards, contextual suggestions, loading/error states, keyboard access, reduced motion, and narrow layout.
- [ ] **P1.12** Add privacy-safe evaluation coverage for paraphrase, typo, French/local terms, empty data, permissions, and model offline.

### P2 — Smarter, continuous assistant

- [ ] **P2.1** Finish and verify current session-local context, active entity, candidate order list, selected record, and resumable draft transitions.
- [ ] **P2.2** Route every turn through one typed orchestrator; expand Ollama to constrained intent/entity interpretation and follow-up resolution with deterministic fallback.
- [ ] **P2.3** Add bounded multi-read planning for compound questions; cap tools, rows, time, and synthesis context; prohibit writes in read plans.
- [ ] **P2.4** Add resumable create/edit/payment/delay/cancel drafts with field validation, expiry, recovery, and explicit discard.
- [ ] **P2.5** Add append-only audit events and compensating undo after migration/RLS/RPC design.
- [ ] **P2.6** Create measurable evaluation runner and release gates; track outcome codes/latency without raw user data by default.
- [ ] **P2.7** Review global orb controls (`K`, Escape, right-click full close), visual states, non-overlap, and keyboard discoverability.

### P3 — Schema-backed business capabilities and later vision

- [ ] **P3.1** Design and ship stock movement ledger before answering receipt/history or enabling chat stock adjustments.
- [ ] **P3.2** Add supplier purchase history and supplier payment only after field semantics and transactional flows are verified.
  - **Progress:** assistant read support is implemented; safe supplier-payment writes from chat are still pending the idempotent RPC/audit and cash-register coupling work described below.
  - Assistant now reads the supplier purchase ledger and the separate supplier payment ledger, with current balance and clear distinction between amounts paid on receipt and later payments.
  - Supplier payment dates are server-recorded at save time; the Suppliers form no longer presents a date control that its RPC silently ignored.
  - Payment mutation through chat remains gated on an idempotent, auditable RPC and verified cash-register coupling; do not replay a payment after an ambiguous network failure.
- [ ] **P3.3** Add detailed waste reporting only if source records capture date/product/cost dimensions.
  - **Status:** deeper reporting is deferred. The application exposes `monthly_flower_waste` aggregates (`month`, quantity, estimated cost, entry count, product count); the `record_flower_waste` RPC accepts a product, quantity, and reason, but its underlying ledger schema is not present here to verify safe detail queries.
  - The assistant now declines product/date breakdown requests and labels supported figures as all-flower monthly aggregates. Do not add detail views until the source ledger and cost basis are verified.
- [ ] **P3.4** Design deferred post-close order cash-in linkage for next opening; add transaction idempotency, audit, tagged register entry, and reconciliation.
- [ ] **P3.5** Add cross-device continuity only as opt-in, minimal server-side metadata; re-fetch all business facts and re-check permission on resume.
- [ ] **P3.6** Add user-controlled saved response preferences separately from business records, with view/edit/forget controls.
- [ ] **P3.7** Consider selected multi-record writes only with explicit record selection, atomic/clearly partial transaction semantics, per-row outcomes, and recovery.

## Dependency order

```text
Typed outcomes + role/action contract
    ├── accurate entity resolution and order field answers
    │      ├── reliable follow-up context
    │      └── safe create/edit/payment/delay review
    ├── full catalog + product/stock query consistency
    ├── bounded read planning + grounded local-model synthesis
    └── scenario evaluation and release gate

Schema-backed audit / stock ledger / deferred cash carryover
    └── migrations + RLS + transactional RPCs + reconciliation before chat UI
```

## Definition of done

The assistant is ready for broad use when supported intents have explicit typed outcomes; accepted questions resolve the correct live entity and requested field; every write is permission-checked, validated, review-confirmed, and recoverable; role-restricted data cannot leak; model offline does not break deterministic paths; answers match the corresponding Blossom module; and the scenario suite passes for ambiguous, empty, malformed, follow-up, multilingual, and unauthorized cases. The in-app capability description must be generated from or kept in sync with the shipped tool registry.

## Implementation tracking

This checklist is intentionally unmarked. Existing implementation claims in `assistant-p0-enhancement-plan.md`, `assistant-p1-enhancement-plan.md`, and `assistant-p2-implementation-map.md` remain subject to interaction verification in the developer's VS Code workflow. Check an item only after its acceptance criteria are met.

### P1 implementation and verification (2026-10-12)

- **P1.1/P1.2/P1.4/P1.6/P1.7:** implemented locally: full active catalog/category search and paging; guided customer/walk-in, fulfillment, payment and USDT review; cart import; field/item-level edit review and atomic save; payment/refund/cancel/delete review and server workflow role checks; configured stock threshold reads.
- **P1.3:** the assistant editor reports a failed print-dialog launch as a retryable error instead of silent success. Its save button prevents repeat submits while the request is in flight, and unchanged retries reuse an idempotency key. The user reports applying `20261012120000_idempotent_order_creation.sql`; the app calls that three-argument RPC, which delegates to the two-argument secure wrapper. Added `20261012130000_restore_order_creation_wrapper.sql` to restore that dependency safely. Supabase application/deployed signature verification and real printer/browser behavior remain open.
- **P1.5/P1.8:** the local delay migrations (including forward schema repair) and delivery paging are present. Live Supabase schema/RLS/role checks remain open.
- **P1.9:** the assistant and Reports page use the daily revenue view and Algiers business-calendar dates. Reports filters use inclusive 7/30/90-day windows; KPIs use local-day boundaries and exact 7-day comparisons. Assistant report cards show the selected dates, order revenue, rounded average order value, and explicitly distinguish revenue from cash collected. Live Supabase reconciliation remains open.
- **P1.10:** customer history is profile-linked with a legacy-name fallback, supplier matches are clarified before sensitive account reads, payment history remains distinct from purchases, and cash summaries are owner-only. Supplier payment column names and balance semantics still need a deployed-schema check.
- **P1.11:** compact result cards, relevant suggestions, error/retry states, live announcements, focus handling, reduced-motion CSS, and narrow-layout styles are implemented. Interaction verification needs an authenticated workspace; the local app opened to sign-in.
- **P1.12:** the versioned multilingual suite supplies prior intent/context on generated short follow-ups and labels intentional product-topic switches correctly. Catalog checks cover routes, role denial, ambiguous matching, empty results, failed queries, review requirements, and configured thresholds. This pass fixed follow-up routing being overridden by low-confidence scoring, order-write number replies, active-order edits, and several French/Arabic typo aliases. Current strict synthetic benchmark is **3,472/3,550 (98%)**; curated scenarios are **50/50**. The remaining **78 synthetic mismatches** mean the strict gate still exits 1. Failures concentrate in generated customer-name variants, result selection, navigation without a concrete destination, and multilingual follow-ups. Add consented, anonymized staff corrections before tuning those cases further.
- **Verification:** `npm run assistant:test` passes (49 grouped checks); `npm run lint` exits 0 with 42 existing warnings and no errors; `npm run build` succeeds (with existing bundle-size and Supabase chunking warnings). `npm run assistant:eval -- --strict` reports 3,472/3,550 (98%) and exits 1 because of the 78 mismatches. The in-app browser had no open tabs, so no authenticated UI or live Supabase checks were performed in this pass.

### P1 external verification required before closure

- Apply `20261012130000_restore_order_creation_wrapper.sql` in Supabase. The three-argument idempotency RPC depends on the two-argument secure wrapper; this forward migration installs that dependency and is safe to rerun.
- Verify in Supabase migration history that both `20261012120000_idempotent_order_creation.sql` and `20261012130000_restore_order_creation_wrapper.sql` completed and that both `blossom_create_order` overloads are deployed (there is no database connector here to verify them directly).
- In Supabase, verify the create-order retry RPC returns the same order on a repeated request key and rejects a changed payload using that key. Verify the order, stock, and cash effects occur once.
- Verify the delay, order-write wrappers, RLS, and role matrix against the deployed schema with owner, manager, florist, cashier, and delivery accounts.
- Apply `20261012140000_ensure_order_delay_schema.sql`; then verify authorized roles can move an eligible delivery date to a future date while order status and payment fields remain unchanged, and unauthorized roles are denied.
- Reconcile assistant report values with the live Reports page for matching periods; verify supplier purchase/payment fields against the deployed supplier schema.
- Compare assistant and Reports values for today, yesterday, 7 days, 30 days, and a month boundary; validate report view totals/counts against live rows and verify the configured date dimension/cancelled-order policy.
- Sign in to the local app and exercise catalog search, order create/edit, receipt printing/retry, responsive layout, keyboard/focus, and reduced-motion behavior with a supported browser/printer.
- For P1.12’s remaining 78 generated-case mismatches, add consented, anonymized staff examples and corrections to the labeled evaluation set, then target the frequent confusion families before treating the 98% synthetic score as release-ready.

### P0 work started (2026-10-10)

- Added a machine-readable `outcome` alongside the existing assistant response shape, including status, domain, operation, entity/search term, requested fields, time scope, and interaction type. Existing chat rendering remains compatible.
- Added direct order-creator fact resolution by order number and customer name, using the recorded `created_by`/`cashier_id` profile where available.
- Filled missing customer-order fact formatters for phone, amount paid, delivery method, notes, creation time, and creator, so a recognized field does not fall through to a generic order summary.
- Customer-name order matches now report the returned candidate count and indicate when the 10-order lookup cap truncates the result. Empty searches no longer print an undefined search term.
- Search honors an explicit phone search field rather than reclassifying the term based on its characters.
- **Still open:** broader unified order filters, inventory threshold alignment, role/action audit, scenario evaluation, and interaction verification. No tests or build were run in this pass.

### P1.4 coverage work started (2026-10-10)

- Added customer purchase history from live linked orders, with an exact-name fallback for legacy orders that have no customer link; ambiguous customer matches remain a selection task.
- Added supplier purchase-history reads alongside current supplier balances, and limited supplier selects to fields used by the assistant.
- Cash-register questions can now summarize a day or a parsed date range. Owner role gating remains; period summaries group all matching entries by register date.
- Capability text describes those reads and their limits. Profit remains unavailable without cost data; supplier payment ledger and bulk writes are not claimed.
- **Still open:** verify configured Supabase schema/RLS and interactions in VS Code; improve delivery range pagination and broaden the P1.4 scenario coverage. No tests or build were run in this pass.

### P1.5 order delay workflow (2026-10-12)

- Added forward migrations that set the RPC reason default, ensure delay-history columns exist, use the `Africa/Algiers` business date for future-date validation, reject missing/inactive/unauthorized profiles safely, and leave order status/payment fields untouched.
- The assistant delay date picker now starts at tomorrow in the business timezone and respects the existing delivery date; database errors show actionable guidance while keeping the form available for correction/retry.
- Added catalog checks for the migration contract and user-facing error translation. Test/build/lint results are recorded after this implementation pass.
- **Still open:** apply `20261012140000_ensure_order_delay_schema.sql` and verify the RPC against configured Supabase roles/schema; this environment did not execute a live database migration.
