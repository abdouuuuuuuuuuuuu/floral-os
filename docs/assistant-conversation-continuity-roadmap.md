# Blossom conversation continuity roadmap

## P2.1 implementation slice (verification pending)

- A versioned context shape tracks the current topic, typed active entity, active order, recent order results, selected result, pending clarification, current order task, and a compact last result.
- Context transitions reset unrelated entities when the conversation moves to a different business area.
- Clarification replies can fill missing order targets or reschedule dates without requiring the user to restate the action.
- Ambiguous customer-to-order matches keep their candidate order numbers and can be resolved by order number or ordinal; the selected order is looked up before a response is returned.
- Guided create/edit review tasks remain represented while the user asks another question; explicit cancel, new chat, successful mutation, and user/role changes clear or refresh stale state.
- The local model receives structured current context alongside recent conversation turns, without treating context text as verified data.
- Build and live interaction verification are pending; the developer is running the app through VS Code.

## P2.2 implementation slice (in progress)

- Added a shared intent contract used after deterministic/context routing and after local-model tool interpretation.
- Invalid targets, dates, amounts, ranges, status filters, and pagination values are rejected before the database query/action handlers run.
- Invalid model proposals return to the validated deterministic route; malformed deterministic intents become an explicit clarification outcome.
- The query execution boundary revalidates every intent, including restored session tasks and future direct callers, before any read handler runs.
- Tool schemas still define what the local model may propose. Blossom continues to fetch business facts live and enforce role checks before reads or actions.
- Supabase/RLS interaction scenarios are intentionally deferred; no production build was run.

## P2.3 implementation slice (in progress)

- Compound-read requests can be planned with a maximum of three read-only tool calls. The planner receives no order mutation tools.
- Supported plan steps are bounded order/delivery queries and product stock/price reads. Product reads are capped at 200 active rows per planned read; larger catalogs return a clear request to split the question.
- Planned reads run concurrently with a 15-second response bound. The combined response includes at most 12 source rows and 2,200 characters; partial failures and role restrictions are stated explicitly.
- The planner now receives a compact structured snapshot of the active entity, selected result set, recent orders, last result rows, current intent, and period. It is instructed to resolve “those orders” against the displayed result IDs and to fetch current values instead of treating context as business truth.
- If Ollama is unavailable or cannot make a safe plan, Blossom asks the user to split the request instead of silently answering only one part.
- Supabase/RLS scenarios and full build verification remain deferred.

## Later continuity milestones

### P2.2 — Unified routing contract

Move clarification state and entity resolution into shared typed routing outcomes. This will give tool execution a common contract for `needs_clarification`, `not_found`, `forbidden`, and successful resolution instead of inferring state from prose.

### P2.3 — Context-aware multi-read planning

Allow bounded combinations of read tools that reference the active entity or result set. Examples: creator plus total for the last three orders, or product stock plus its current price. Keep tool limits and factual provenance visible.

### P2.4 — Resumable task drafts

**Implementation started (2026-10-10):** create-order steps, create/edit review forms, and payment/refund/delay/cancel/delete confirmation tasks now persist in tab-scoped storage for up to 12 hours. Resume rechecks the current user/role and refreshes order facts before showing an action. Edit recovery uses a baseline fingerprint to stop stale edits overwriting newer order data. No write runs during recovery; the user must still confirm. Payment notes/amount selections are draft-only and no credentials or chat transcript are stored. Remaining verification is deferred to the developer’s local workflow.

### P3.1 — User-controlled assistant preferences

**Implementation started (2026-10-10):** added account-scoped local preferences for concise/balanced wording and regional/US/ISO date display, with a settings panel to review and reset them. Preferences influence on-device AI wording and dates in assistant results; complete business data cards remain intact. No order/customer facts or chat history are stored as preferences. Verification and narrow-window interaction checks are pending.

### Later milestone — Multi-session continuity, opt-in

If cross-device continuity is needed, store only minimal conversation metadata and draft IDs server-side, scoped by authenticated user and role. Re-check permissions and re-fetch all business facts on resume. Add retention limits, encryption, audit records, and a user-visible clear-history control before enabling it.

## Long-term product vision

Blossom should feel like one ongoing assistant that remembers what the user means within the current task, yet never confuses conversational context with current business truth. It should recall the active order or draft, fetch live state whenever a fact is asked, explain when the conversation changed topics, and let the user correct or clear context at any time.

Future memory should be deliberately tiered:

1. **Turn context:** the active request and clarification, held only while needed.
2. **Conversation context:** active entities, recent result IDs, and resumable tasks in the current chat.
3. **User preferences:** optional user-approved response preferences, separate from business records.
4. **Business truth:** always queried from authorized Blossom records; never inferred from prior assistant wording or stored as model memory.

Cross-device or long-term memory is a later opt-in capability. P2.1 stays session-local and resets context on user/role changes and new chat.
