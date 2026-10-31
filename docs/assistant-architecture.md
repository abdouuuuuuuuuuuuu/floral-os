# Blossom assistant architecture

## Request path

1. `BlossomAssistant.jsx` owns the panel, session state, chat rendering, and review forms. Every explicit “create order” request starts the same guided in-chat products → customer → delivery/payment flow, followed by a review step before saving.
2. `assistant/router.js` evaluates the deterministic intent and its supporting evidence first. Clear requests stay on the immediate rules path. A route assessment score detects underspecified or competing-domain requests and can ask Ollama for a structured tie-break. The score is a heuristic rank, not a probability. Any model tool call is schema-validated and guarded; it cannot directly access the database or save a change.
3. `assistant/capabilities.js` is the model-facing tool contract. `localAssistantModel.js` validates tool names and argument shapes, then converts the selected tool into a typed Blossom intent.
4. `assistant/queryService.js` checks route/role access and reads current data through Supabase. `assistant/dataAccess.js` contains shared date, pagination, money, and query helpers.
5. When the local model selected a read-only capability, Blossom sends the actual structured query result back to that local model for a short grounded response. If that step times out or fails, Blossom keeps its deterministic answer and result cards.
6. Changes such as edits, payment, cancellation, deletion, and rescheduling are presented as review components. Supabase permissions remain the final access boundary.
7. `assistant/conversationState.js` stores active order/customer/product IDs and the selected result list as structured state. It does not infer entity identity from displayed text.

## Interaction and data boundaries

- Chat history and active conversation context live in the current renderer session; switching users/roles or starting a new chat clears them.
- Live order, customer, inventory, and report facts come from Blossom’s current Supabase data. The model only receives the small result needed to phrase a response, and Ollama runs locally on the device.
- The Electron bridge accepts only requests from Blossom’s top-level window, limits message size, and allowlists assistant tool names.
- Order creation drafts can be paused by asking a separate question, then resumed or discarded from the chat.
- Order delays use the existing `delay_order` database operation and review UI, preserving the status/payment while recording the reschedule.

## Current limits

- Deterministic rules remain the primary router. The local model helps on low-scoring or competing-domain routes, not every known intent. Confidence scores are not calibrated probabilities; collect labeled corrections and evaluate calibration before presenting them as probabilities.
- Tool routing remains non-streaming so Blossom can validate the selected capability before execution. Grounded read-answer wording streams tokens through a separate Electron IPC channel that accepts no tools; the browser fallback reads Ollama's newline-delimited response stream directly.
- Blossom intentionally runs one selected capability per request. Compound requests should be split if they require unrelated data domains or multiple write actions.
- Routing accuracy is not presented as a probability. The existing probability tree is a proposed taxonomy, not a measured evaluation set.

## Routing safeguards added

- Customer and order names are resolved against live Blossom records. An exact match can answer directly; a partial or ambiguous match asks the user to choose a current record. Order search results also offer order-number choices that load the selected order details in chat.
- Route scores are heuristic read-routing signals only. They are not used to authorize writes. Every create/edit/payment/delay/cancel/delete flow still checks the target and role in Blossom, then presents the existing review or confirmation UI before any save.
- If Ollama is offline, proposes invalid tool arguments, or cannot safely route an uncertain business request, the assistant uses the deterministic intent when it is clear. Otherwise it offers a short clarification; no action runs from an invalid proposal.
- Development builds show per-response route diagnostics: intent, route source, heuristic score, evidence, fallback reason, and the write-review gate for mutation intents. These details are hidden from production users.
