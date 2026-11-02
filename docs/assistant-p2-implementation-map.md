# Blossom assistant P2 implementation map

## Phase objective

Make the assistant dependable across a continuing conversation: understand the user’s intent and references, gather live Blossom data, combine related reads when needed, and prepare multi-step changes for review. It should feel conversational while remaining grounded in the software’s data, role rules, and existing business operations.

P2 builds on P0/P1 reliability. It does not mean an unconstrained language model can write directly to Supabase. The model may interpret language and select typed tools; Blossom validates permissions, arguments, data, and all writes.

## Entry conditions

- P0 order lookup, guided creation, timezone, and order filtering behavior remain intact.
- P1 order payment/cart/edit paths and the P1.4 module reads are reviewed against the app and build successfully in the developer’s environment.
- Existing role rules and Supabase row-level security remain the source of truth.
- No migration or server-side model dependency is introduced without a separate schema/security review.

## Work map

### P2.1 — Conversation context and entity continuity

**Problem:** Follow-ups can lose the active order/customer/product or accidentally attach to an old result.

**Implementation:**

1. Define a typed conversation state for active entity, active result set, current task/draft, pending clarification, and last tool result.
2. Define explicit context transitions: retain context for short follow-ups; switch context on a clear new domain; clear stale IDs on new chat, user/role change, and successful mutation.
3. Resolve pronouns, ordinal references, “what about [name]?”, and attribute follow-ups against IDs rather than rendered message text.
4. If multiple entities remain plausible, ask one targeted clarification and present the candidate choices.

**Likely files:** `src/lib/assistant/conversationState.js`, `src/lib/assistant/intentEngine.js`, `src/lib/assistant/router.js`, `src/components/layout/BlossomAssistant.jsx`.

**Acceptance:** “Show order 786” → “who is it for?” → “what’s their number?” stays on the same record. “What about Hedade?” starts a new customer-order lookup. A clear stock question exits order context. Ambiguous references never silently choose a record.

### P2.2 — Unified intent and tool routing

**Problem:** Deterministic phrases and local-model fallback can interpret the same request differently; some natural paraphrases fall into generic help.

**Implementation:**

1. Define one typed request contract for read, navigation, clarification, and staged write intents.
2. Route every user turn through one orchestrator: normalize → identify domain/action/entity → validate required fields and role → call typed tool → format result.
3. Use deterministic rules as high-confidence shortcuts and the local model for paraphrases, entity extraction, and ambiguity resolution; never trust model-generated facts.
4. Validate tool arguments against catalog/database entities before execution. Keep tool names and schemas aligned with `capabilities.js` and Electron’s allowlist.
5. Return structured outcomes (`success`, `needs_clarification`, `not_found`, `forbidden`, `unsupported`, `retryable_error`) instead of relying on response copy to signal state.

**Likely files:** `capabilities.js`, `router.js`, `localAssistantModel.js`, `queryService.js`, Electron assistant IPC/preload allowlist.

**Acceptance:** Paraphrased supported requests resolve to the same typed intent; invalid model arguments call no tools; real data is always read from Blossom; unsupported/forbidden/not-found results have distinct next steps.

### P2.3 — Multi-tool read planning and grounded synthesis

**Problem:** Blossom can execute one capability per turn, limiting questions that combine related data (“who created the last 3 orders and what were their totals?”).

**Implementation:**

1. Add a bounded read plan that may call multiple allowlisted read tools when they answer one user request.
2. Set per-turn limits for tool count, rows, time, and result size; reject recursive or unrelated plans.
3. Give the response composer only the verified result objects needed for the answer.
4. Keep the visible response concise and show source rows/cards for inspection.
5. Do not include write tools in multi-tool plans.

**Likely files:** `router.js`, `queryService.js`, `localAssistantModel.js`, `BlossomAssistant.jsx` result rendering.

**Acceptance:** Combined read questions return all requested facts with exact names, dates, statuses, and amounts. Partial failures are stated explicitly. No facts are generated beyond returned data, and a read plan cannot trigger mutations.

### P2.4 — Multi-step order actions with review checkpoints

**Problem:** Complex requests require users to repeat details across turns or move between separate assistant flows.

**Implementation:**

1. Model create/edit/delay/payment/cancel tasks as resumable drafts with explicit required and optional fields.
2. Ask only for missing required information, one conversational question at a time; accept multiple fields in one reply.
3. Preserve the draft while answering an unrelated read question, then offer a clear resume/cancel action.
4. Show a before/after summary for edits and a complete review for new orders, payments, refunds, delays, and cancellations.
5. Save through the same validated functions/transactions as Blossom’s existing screens; clear or refresh context only after confirmed success.
6. Keep permanent deletion as a separate owner-only explicit confirmation flow.

**Likely files:** `BlossomAssistant.jsx` draft/review components, `conversationState.js`, existing order/payment/delay hooks and RPC functions, `permissions.js`.

**Acceptance:** A user can make a multi-turn order change without losing collected details. Missing fields are identified precisely. No write occurs before a review confirmation. Failed saves preserve the draft and explain recovery.

### P2.5 — Answer quality and recovery UX

**Problem:** Generic fallback messages, long legacy cards, and silent model failures make correct data feel unreliable.

**Implementation:**

1. Create response templates for each outcome and intent family: direct fact, list, metric, clarification, permission boundary, not found, and error.
2. Match answer length to the question; show one requested fact first, with optional “show full details” expansion.
3. Preserve actionable follow-up suggestions based on current result/context, not a static starter list.
4. Add visible model/tool states (interpreting, looking up, preparing review, saving, retry available) without fake progress.
5. Provide retry and “open relevant module” recovery only where they are valid; retain the user’s prompt and active draft on transient failure.
6. Accessibility: keyboard navigation, focus management, reduced-motion handling, screen-reader status announcements, and responsive layout.

**Likely files:** `BlossomAssistant.jsx`, assistant styles/components, `queryService.js` response contracts.

**Acceptance:** A fact question has a direct answer without an unrelated data dump. Loading/error/permission states are distinguishable. Keyboard and narrow-window flows remain usable.

### P2.6 — Evaluation, diagnostics, and release gate

**Problem:** Routing regressions are discovered by users and console errors rather than a repeatable quality gate.

**Implementation:**

1. Create a versioned scenario set from the order, stock, reports, customer, supplier, delivery, and cash question catalogs.
2. Include misspellings, multilingual/business vocabulary, follow-ups, ambiguous names, empty results, role restrictions, timezone edges, and model-offline cases.
3. Evaluate intent, extracted entities/filters, tool calls, permission decisions, factual grounding, and final response separately.
4. Use synthetic fixtures or a redacted local fixture set; never store customer/order content in telemetry by default.
5. Add opt-in feedback and privacy-safe counters for route type, outcome, latency, and fallback reason; avoid logging raw prompts or result rows.
6. Define the release gate: build, static checks, scenario evaluation, role matrix check, and manual smoke pass in Orders/Products/Reports/Delivery/Cash.

**Likely files:** new `src/lib/assistant/evaluation/` fixtures/runner, docs for test data, assistant error/latency instrumentation.

**Acceptance:** The scenario suite reports measurable route and tool correctness; permission and write-safety scenarios have zero unsafe pass cases; diagnostics reveal failure category without collecting sensitive business content.

## Recommended sequence

1. P2.1 Conversation context and entity continuity.
2. P2.2 Unified intent/tool contract and routing outcomes.
3. P2.5 Response and recovery UX (parallelizable with P2.1 after contract decisions).
4. P2.3 Bounded multi-tool reads.
5. P2.4 Resumable multi-step write drafts.
6. P2.6 Evaluation and release gate; start scenario authoring during P2.1 and require the full gate before release.

## Phase-wide constraints

- Model output is a proposal for a typed intent/tool call, never authoritative business data.
- Every read is role checked; Supabase RLS is still the enforcement boundary.
- Every mutation is validated by the same business rules as the app, review-first, and auditable.
- No bulk mutation in P2 without explicit record selection, transaction semantics, and recovery behavior.
- No external/cloud model provider or raw-prompt telemetry by default; local Ollama remains optional and the deterministic assistant remains available offline.
- A user correction or “no, I meant…” should re-resolve the active turn and preserve the prior result until a new result succeeds.

## Definition of done

P2 is complete when the acceptance criteria for P2.1–P2.6 pass, role-restricted scenarios produce no protected data, reviewed writes persist only after confirmation, the app build and release gate pass, and the assistant’s capability description matches the shipped tools.

## Progress (2026-10-10)

- **P2.1 implementation added:** versioned conversation context, active entity/result tracking, pending order clarifications, resumable order-task context, and context refresh/clear behavior after mutations and session boundaries.
- **P2.2 implementation started:** a shared intent contract now validates deterministic and local-model intents before query/action dispatch. Invalid order IDs, dates, amounts, ranges, status filters, page/limit values, and malformed periods are rejected before database execution; an invalid model proposal falls back to the validated rule route.
- **P2.3 implementation started:** compound-read prompts may use at most three allowlisted read-only tools. Only bounded order/delivery lookups and product lookups enter plans; catalog reads cap at 200 rows in a plan, each read has a 15-second response bound, and combined output is capped at 12 rows/2,200 text characters. Partial failures and role restrictions are surfaced. Write tools are not passed to the planner.
- **P2.4 implementation started:** the active create-order flow and create/edit review form now recover from a page reload using a user-and-role-scoped `sessionStorage` draft (12-hour expiry). Payment, refund, delay, cancellation, and delete confirmations retain their reviewed intent; their order data is reloaded before the action is shown again, and editable action fields are restored. Edit drafts compare a compact order fingerprint before applying saved edits so an older draft cannot silently overwrite an order changed elsewhere. No action is submitted during recovery; each still requires its existing confirmation/save control. Drafts contain only the current task, not chat history or authentication credentials.
- **P2.5 implementation started:** responses now expose outcome states (access restricted, no match, clarification, validation, partial result, unsupported, retryable failure), cap long result lists behind an accessible “Show more” control, and offer order/product-specific follow-ups when the entity is known. Local-model fallback is disclosed in the reply. Conversation announcements now react to new messages instead of every streamed text update; keyboard focus cycling includes selects and textareas, and automatic scrolling respects reduced-motion preferences. Existing grounded answers, activity states, retry affordance, global focus styling, and reduced-motion animation rules remain in use.
- **P2.6 implementation added:** versioned synthetic routing cases now cover orders, stock, reports, customers, suppliers, delivery, cash, follow-ups, ambiguity, roles, timezone phrasing, greetings, and offline deterministic routing. The local runner reports aggregate and per-family intent/field accuracy, contract safety checks, and failed case IDs without printing prompts. Added default-off local-only quality counters and answer feedback; counters store categories and latency buckets only, never prompt/result data, and are not uploaded. `npm run assistant:eval` result: 34/34 scenarios passed; bounded read-plan and write-rejection checks passed.
- **Verification boundary:** the assistant evaluator and syntax/parser checks pass. No production build was run. Live data/empty-result behavior, interactive UI smoke checks, role enforcement against the database, and Supabase/RLS scenarios remain deferred as requested. See [assistant-p2-quality-gate.md](assistant-p2-quality-gate.md) for the remaining release gate.
