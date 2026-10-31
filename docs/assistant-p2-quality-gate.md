# Assistant P2.6 quality gate

## Local evaluation

Run `npm run assistant:eval` from the project root. It evaluates the versioned synthetic scenario set in `src/lib/assistant/evaluation/scenarios.v1.js` through Blossom's deterministic router with the local model disabled. The runner prints aggregate accuracy, per-family counts, safety checks, and failed scenario IDs only; it does not print prompt text or access Supabase.

The current set covers order lookup/search/create/delay and follow-ups; stock and prices; customer and supplier lookup; reports; delivery; cash register; greetings; role-matrix decisions; date/timezone phrasing; ambiguity; offline deterministic routing; and write-plan safety.

## Diagnostics privacy

Assistant feedback and quality counters are off by default. Users can opt in under assistant settings. When enabled, only local aggregate categories and totals are stored: broad route domain, outcome, route source, fallback category, latency bucket, and helpful/needs-work counts. The assistant does not store prompt text, customer/order identifiers, result rows, or raw error text in these counters. Data is not uploaded. Users can export the aggregate JSON or clear it from the same settings area; switching the option off clears counters.

## Current results

Scenario version 1.0.0 passes **34/34 routing scenarios**. Contract safety checks pass for a valid bounded read plan, rejecting a write inside a read plan, and rejecting a plan above the three-step limit. These are synthetic intent and permission-matrix checks, not a substitute for data-layer enforcement.

## Remaining release gate

The scenario runner does not exercise live data retrieval, empty-result copy, database role enforcement, Supabase/RLS behavior, or UI interactions. Those remain deferred. Before release, complete the owner-requested VS Code build and manual Orders, Products, Reports, Delivery, and Cash smoke pass, plus the separately deferred Supabase/RLS review. Do not describe this P2.6 slice as release approval.
