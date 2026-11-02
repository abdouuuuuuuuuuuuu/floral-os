import { routeAssistantTurn } from '../router.js'
import { validateAssistantIntent, READ_PLAN_INTENTS } from '../intentContract.js'
import { canAccessRoute, orderActionsFor } from '../../permissions.js'
import { ASSISTANT_SCENARIOS_V1, ASSISTANT_SCENARIO_VERSION } from './scenarios.v1.js'
import { calibrationByGroup, measureConfidenceCalibration } from './confidenceCalibration.js'
import { STAFF_PHRASES_V1 } from './staffPhrases.v1.js'

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object)
}

function equals(actual, expected) {
  if (Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected)
  return actual === expected
}

export async function runAssistantEvaluation(scenarios = [...ASSISTANT_SCENARIOS_V1, ...STAFF_PHRASES_V1]) {
  const failures = []
  const familyStats = {}
  const languageStats = {}
  const mutationStats = {}
  const confusion = {}
  const routeSources = {}
  const routeScoreBands = {}
  const scoreObservations = []
  for (const scenario of scenarios) {
    let route
    try {
      route = await routeAssistantTurn({
        prompt: scenario.prompt,
        context: scenario.context,
        previousIntent: scenario.previousIntent,
        role: scenario.permission?.role || 'owner',
        modelEnabled: false,
      })
    } catch {
      failures.push({ id: scenario.id, family: scenario.family, check: 'route-error' })
      continue
    }
    const intent = route.intent
    const contract = validateAssistantIntent(intent)
    const language = scenario.language || 'en'
    const mutation = scenario.mutation || 'curated'
    const actualType = intent?.type || 'missing'
    if (Number.isFinite(route.routeScore)) scoreObservations.push({ score: route.routeScore, correct: actualType === scenario.type, language: scenario.language || 'en', intent: scenario.type })
    const scoreBand = !Number.isFinite(route.routeScore) ? 'unscored'
      : route.routeScore < 0.55 ? 'low'
        : route.routeScore < 0.78 ? 'medium'
          : route.routeScore < 0.9 ? 'high' : 'very_high'
    routeSources[route.routeSource || 'unknown'] = (routeSources[route.routeSource || 'unknown'] || 0) + 1
    confusion[scenario.type] ||= {}
    confusion[scenario.type][actualType] = (confusion[scenario.type][actualType] || 0) + 1
    const bump = (table, key) => {
      const stats = table[key] ||= { total: 0, passed: 0 }
      stats.total += 1
      return stats
    }
    const checks = [
      ['intent-type', intent?.type === scenario.type],
      ['intent-contract', contract.ok],
    ]
    for (const [field, expected] of Object.entries(scenario.fields || {})) {
      checks.push([`field:${field}`, equals(getPath(intent, field), expected)])
    }
    if (scenario.permission?.action) {
      checks.push(['permission:order-action', orderActionsFor(scenario.permission.role)[scenario.permission.action] === scenario.permission.allowed])
    }
    if (scenario.permission?.route) {
      checks.push(['permission:route', canAccessRoute(scenario.permission.role, scenario.permission.route) === scenario.permission.allowed])
    }
    if (intent?.type === 'read_plan') {
      checks.push(['read-plan-only', Array.isArray(intent.plan) && intent.plan.every((step) => READ_PLAN_INTENTS.has(step.type))])
    }
    const failedChecks = checks.filter(([, passed]) => !passed).map(([name]) => name)
    const stats = bump(familyStats, scenario.family)
    const languageGroup = bump(languageStats, language)
    const mutationGroup = bump(mutationStats, mutation)
    const scoreGroup = bump(routeScoreBands, scoreBand)
    if (!failedChecks.length) { stats.passed += 1; languageGroup.passed += 1; mutationGroup.passed += 1; scoreGroup.passed += 1 }
    else failures.push({ id: scenario.id, family: scenario.family, check: failedChecks.join(', ') })
  }

  const validReadPlan = validateAssistantIntent({ type: 'read_plan', plan: [
    { type: 'order_lookup', orderNumber: '786' }, { type: 'product_stock', search: 'red rose' },
  ] }).ok
  const writePlanRejected = !validateAssistantIntent({ type: 'read_plan', plan: [
    { type: 'order_lookup', orderNumber: '786' }, { type: 'order_delete', orderNumber: '786' },
  ] }).ok
  const oversizedPlanRejected = !validateAssistantIntent({ type: 'read_plan', plan: [
    { type: 'order_lookup', orderNumber: '786' }, { type: 'product_stock', search: 'rose' }, { type: 'product_price', search: 'rose' }, { type: 'orders_list' },
  ] }).ok
  const safety = { validReadPlan, writePlanRejected, oversizedPlanRejected }
  for (const [name, passed] of Object.entries(safety)) if (!passed) failures.push({ id: `contract-${name}`, family: 'write-safety', check: name })

  const total = scenarios.length
  const scenarioFailures = failures.filter((item) => !item.id.startsWith('contract-')).length
  return {
    version: ASSISTANT_SCENARIO_VERSION,
    summary: { total, passed: total - scenarioFailures, failed: scenarioFailures, accuracy: total ? Number(((total - scenarioFailures) / total).toFixed(4)) : 1 },
    families: familyStats,
    byLanguage: languageStats,
    byMutation: mutationStats,
    confusion,
    routeSources,
    routeScoreBands,
    confidenceCalibration: {
      note: 'Heuristic score reliability against synthetic route labels; not production calibration.',
      overall: measureConfidenceCalibration(scoreObservations),
      byLanguage: calibrationByGroup(scoreObservations, (item) => item.language),
      byIntent: calibrationByGroup(scoreObservations, (item) => item.intent),
    },
    safety,
    failures,
  }
}
