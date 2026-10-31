import { runAssistantEvaluation } from '../src/lib/assistant/evaluation/runEvaluation.js'
import { buildEvaluationCorpus, CASES_PER_INTENT, CORPUS_VERSION, EVALUATION_INTENTS_V2 } from '../src/lib/assistant/evaluation/corpus.v2.js'
import { ASSISTANT_SCENARIOS_V1 } from '../src/lib/assistant/evaluation/scenarios.v1.js'
import { STAFF_PHRASES_V1, STAFF_PHRASES_VERSION } from '../src/lib/assistant/evaluation/staffPhrases.v1.js'

const corpus = buildEvaluationCorpus()
const result = await runAssistantEvaluation([...ASSISTANT_SCENARIOS_V1, ...corpus, ...STAFF_PHRASES_V1])
console.log(`Assistant evaluation corpus v${CORPUS_VERSION}: ${result.summary.passed}/${result.summary.total} passed (${Math.round(result.summary.accuracy * 100)}%)`)
console.log(`${EVALUATION_INTENTS_V2.length} intents × ${CASES_PER_INTENT} cases = ${corpus.length} synthetic cases`)
console.log(`Curated staff-style phrases v${STAFF_PHRASES_VERSION}: ${STAFF_PHRASES_V1.filter((item) => item.source === 'synthetic_staff_style').length} labeled cases (representative, not production transcripts)`)
console.log('Per intent:')
for (const [intent, stats] of Object.entries(result.families)) console.log(`  ${intent}: ${stats.passed}/${stats.total}`)
console.log('Per language:')
for (const [language, stats] of Object.entries(result.byLanguage)) console.log(`  ${language}: ${stats.passed}/${stats.total}`)
console.log('Per variation:')
for (const [variation, stats] of Object.entries(result.byMutation)) console.log(`  ${variation}: ${stats.passed}/${stats.total}`)
console.log('Route score bands (heuristic scores, not probabilities):')
for (const [band, stats] of Object.entries(result.routeScoreBands)) console.log(`  ${band}: ${stats.passed}/${stats.total}`)
const calibration = result.confidenceCalibration
const fmtCalibration = (name, stats) => {
  if (!stats || !stats.sampleCount) return `  ${name}: no scored cases`
  return `  ${name}: n=${stats.sampleCount}, Brier=${stats.brierScore.toFixed(3)}, ECE=${stats.expectedCalibrationError.toFixed(3)}, MCE=${stats.maximumCalibrationError.toFixed(3)}`
}
console.log('Confidence calibration (synthetic correctness labels; heuristic scores, not probabilities):')
console.log(fmtCalibration('overall', calibration.overall))
for (const [language, stats] of Object.entries(calibration.byLanguage)) console.log(fmtCalibration(language, stats))
console.log('Reliability bins (score range: cases, mean score, observed accuracy):')
for (const bin of calibration.overall.bins) {
  console.log(`  ${bin.lower.toFixed(1)}–${bin.upper.toFixed(1)}: n=${bin.count}, score=${bin.meanScore.toFixed(3)}, accuracy=${bin.accuracy.toFixed(3)}, gap=${bin.gap.toFixed(3)}`)
}
const topConfusions = Object.entries(result.confusion)
  .flatMap(([expected, actuals]) => Object.entries(actuals).filter(([actual]) => actual !== expected).map(([actual, count]) => ({ expected, actual, count })))
  .sort((left, right) => right.count - left.count)
  .slice(0, 12)
if (topConfusions.length) console.log(`Most common route confusions: ${topConfusions.map(({ expected, actual, count }) => `${expected}→${actual} (${count})`).join('; ')}`)
console.log(`Route sources: ${JSON.stringify(result.routeSources)}`)
console.log(`Safety: ${Object.entries(result.safety).map(([key, passed]) => `${key}=${passed ? 'pass' : 'FAIL'}`).join(', ')}`)
if (result.failures.length) {
  const failuresByIntent = {}
  for (const failure of result.failures) failuresByIntent[failure.family] = (failuresByIntent[failure.family] || 0) + 1
  console.error(`Failure counts by intent (prompts omitted; ${result.failures.length} total):`)
  for (const [intent, count] of Object.entries(failuresByIntent).sort((a, b) => b[1] - a[1])) console.error(`  ${intent}: ${count}`)
  const representativeCases = new Set()
  for (const failure of result.failures) if (!representativeCases.has(failure.family)) {
    representativeCases.add(failure.family)
    console.error(`  sample ${failure.id} [${failure.family}]: ${failure.check}`)
  }
  if (process.argv.includes('--strict')) process.exitCode = 1
}
