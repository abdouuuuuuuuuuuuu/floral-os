# [P0] Blossom assistant routing failures

**Status:** Mitigated; routing fixes applied, evaluation cleanup still needed  
**Detected:** 2026-10-12  
**Scope:** Deterministic assistant intent routing and its synthetic regression set

## What the 632 failures were

The earlier run passed 2,918 of 3,550 cases (82%) and failed 632. Failure
analysis found:

| Dimension | Failures | What it indicates |
| --- | ---: | --- |
| Typo mutation | 418 | A one-character mutation broke a whole French/Arabic phrase alias or left an important English keyword unrecognized. |
| Short-follow-up variation | 174 | The generator wrapped an English follow-up in French/Arabic words, repeated conjunctions, or otherwise produced unnatural turns. |
| Paraphrase | 30 | Supported intent was phrased differently from the small rule/alias set. |
| Short follow-up | 7 | Context did not preserve the prior task for a short continuation. |
| Clean prompt | 3 | Genuine rule/label mismatches in the unmutated seed prompts. |

Language labels on those failures were Arabic 275, French 216, and English 141.
That split was partly contaminated: the follow-up generator marked phrases such
as `et show the transactions` as French and mixed Arabic wrappers with English
task text. These cases do not measure ordinary French or Arabic conversation
well. The corpus is synthetic; none of these numbers is production accuracy.

## Fixes applied

- Added token and phrase recovery for common French and Arabic stock/order,
  report, date, register, greeting, capability, and navigation wording. This
  addresses the weakness where a single typo prevented a full-sentence alias
  from matching.
- Improved typo handling for high-impact terms and conversational wrappers,
  including French `en cours`, Arabic week/date phrases, ordinal result picks,
  and order-status clarification.
- Separated “how do I create an order?” from a request to create one.
- Routed generic sales questions to the sales intent while keeping explicit
  periods on the report-period intent.
- Added regression cases for the observed failure patterns.

The current run passes 3,209/3,550 cases (90%), reducing failures from 632 to
341. Sales and report-period routing each pass 99/100 cases; common order status,
greeting, cash register, navigation, and localized cases improved substantially.
The assistant catalog suite passes 34 checks.

## Why 341 remain

| Failure source | Remaining |
| --- | ---: |
| Short-follow-up variations | 172 |
| Typo mutations | 159 |
| Short follow-ups | 7 |
| Paraphrases | 3 |

The largest remaining bucket is still the generated follow-ups. Examples include
stacking `and` onto an existing `and yesterday`, prepending English prompts with
French `et`, or adding politeness to an ordinal selection in a way current
selection parsing does not recognize. The typo bucket now concentrates on
ambiguous misspellings and terms outside the current alias vocabulary. The
remaining language split is Arabic 125, French 110, and English 106.

Top remaining route confusions are how-to → order creation (16), status filter
→ order list (14), and overview → help (13). Many failures are multi-language
mutation edge cases; adding a bespoke rule for each generated misspelling would
overfit this corpus. The best next fix is to repair the evaluation generator so
follow-up examples are natural, consistently labeled, and grounded in realistic
continuations, then add consented staff examples and improve the remaining
high-frequency route pairs against that clean set.

## Closure criteria

- Replace mixed-language and malformed follow-up generation with reviewed,
  language-consistent examples that include the correct preceding turn.
- Keep user corrections separate from synthetic examples; add a correction only
  when it comes from an actual Blossom interaction and is consented/anonymized.
- Require `npm run assistant:eval -- --strict` to pass the reviewed release set,
  and keep role checks, confirmation, and database validation independent of
  route scores.
- Measure real production-style accuracy and calibration before using scores to
  influence consequential actions.

The current evaluation does **not** pass the strict gate because 341 cases
remain. This is tracked as P0 until the suite is corrected and the reviewed
release set passes.
