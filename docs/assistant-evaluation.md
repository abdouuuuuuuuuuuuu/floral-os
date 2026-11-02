# Blossom assistant routing evaluation

Run `npm run assistant:eval` to evaluate the deterministic router against the
synthetic corpus. The generated suite contains 100 unique prompts for each of
35 directly user-routeable intents (3,500 prompts total): English, French, and
Arabic requests; reproducible spelling mutations; and contextual short turns.
The planner-only `read_plan` intent is covered by the separate read-plan safety
checks rather than treated as a direct user request.

The evaluator reports route accuracy and contract validity by intent, language,
and mutation type, plus a confusion matrix, route source counts, and accuracy
grouped by heuristic route-score bands. It also measures Brier score, expected
calibration error (ECE), maximum calibration error (MCE), and reliability bins
against the corpus's expected-intent labels, overall and by language. Failure
output contains case IDs and expected/actual intent families only; it never
prints prompt text.

The latest run on 2026-10-12 passed 3,209 of 3,550 cases (90%). English cases
passed 1,127/1,233 (91%), French 1,048/1,158 (90%), and Arabic 1,034/1,159 (89%).
For the 3,550 scored routes, Brier score was 0.103, ECE 0.145, and MCE 0.369;
ECE by language was English 0.149, French 0.151, and Arabic 0.135. The remaining
top confusions include how-to → order creation (16) and status filter → order
list (14). The `P0` failure analysis in `docs/assistant-routing-p0-632-failure-analysis.md`
explains the original 632 failures, fixes applied, and the test-generation issues
that still distort the score. Scores remain heuristic signals, not probabilities
or authorization to write. These synthetic results are not production accuracy
estimates. Use `npm run assistant:eval -- --strict` to make any corpus failure
set the command exit code; the default command prints the baseline without
failing.

Run `npm run assistant:test` for the shared action-catalog suite. It exercises
one labeled phrase for every catalog tool, intent-to-action mapping, the role
matrix, read-versus-write confirmation metadata, payment/refund access, order
number selection, ambiguous customer matches, database errors, localized and
misspelled high-impact phrases, and configured low-stock thresholds. Query tests
use an injected in-memory Supabase-shaped fake; they never connect to Blossom's
live database.

### Real user corrections

The current project has no captured Blossom-assistant correction transcripts.
The user messages available in the Codex task history are instructions about
building or running the product, not conversations with Blossom's in-product
assistant, so they are not valid assistant-routing labels. Do not invent a
“real” correction from them. When a consented, anonymized in-product correction
is provided, add the original prompt, prior intent/context, corrected expected
intent, and language to `src/lib/assistant/evaluation/staffPhrases.v1.js` with
`source: 'real_user_correction'` and `mutation: 'correction'`. Keep the original
and corrected labels together so the regression remains auditable.

## Interpretation and limits

- The corpus is synthetic and rule-based. It is a regression benchmark, not a
  substitute for consented real examples or a claim about production accuracy.
- It runs with Ollama disabled to keep route results reproducible. The separate
  local-model tie-break path needs model-specific evaluation before deployment.
- French and Arabic cases intentionally measure current language coverage; this
  version uses standard Arabic, not Algerian Darija. A
  failing translation is a visible coverage gap, not a silently ignored case.
- The calibration report measures the existing heuristic scores; it does not
  fit or apply a calibration transform. Its labels are synthetic expected
  intents, so the numbers diagnose this benchmark and do not establish
  production confidence. Route-score bands are not probabilities.
- Calibration estimates depend on the corpus mix and binning. Use a held-out,
  reviewed set of representative production-style prompts (including
  language-specific coverage) before fitting a transform. Keep write
  authorization behind explicit confirmation and permission checks.
- Optional assistant diagnostics store aggregate route-score bands only. User
  helpfulness votes are a weak quality signal, not ground-truth intent labels;
  they are bucketed by score only when diagnostics are enabled. No prompt,
  customer name, order number, or answer text is stored.
- Add a curated example to the fixture when a failure reveals a supported
  phrase the router should recognize. Keep typo generation deterministic so
  the same case IDs and score reports can be compared between revisions.
