const ENABLED_KEY = 'blossom.assistantDiagnostics.enabled.v1'
const COUNTERS_KEY = 'blossom.assistantDiagnostics.counters.v1'
const MAX_KEYS = 80

function scoreBand(score) {
  if (!Number.isFinite(score)) return 'unknown'
  if (score < 0.55) return 'low'
  if (score < 0.78) return 'medium'
  if (score < 0.9) return 'high'
  return 'very_high'
}

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

function readCounters() {
  try {
    const value = JSON.parse(storage()?.getItem(COUNTERS_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}

function key(value, allowed, fallback = 'other') {
  return allowed.includes(value) ? value : fallback
}

export function isAssistantDiagnosticsEnabled() {
  return storage()?.getItem(ENABLED_KEY) === 'true'
}

export function setAssistantDiagnosticsEnabled(enabled) {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
    if (!enabled) store.removeItem(COUNTERS_KEY)
    return true
  } catch { return false }
}

/** Stores aggregate categories only. Never pass prompt, entity, result, or error text here. */
export function recordAssistantMetric({ route, outcome, routeSource, fallbackReason, latencyMs, routeScore } = {}) {
  if (!isAssistantDiagnosticsEnabled()) return
  const store = storage()
  if (!store) return
  try {
    const counters = readCounters()
    const increment = (group, value) => {
      counters[group] ||= {}
      const bucket = key(value, group === 'route' ? ['orders', 'stock', 'reports', 'customers', 'suppliers', 'delivery', 'cash', 'conversation', 'write', 'other']
        : group === 'outcome' ? ['success', 'needs_clarification', 'not_found', 'forbidden', 'validation_error', 'partial_success', 'unsupported', 'retryable_error', 'other']
          : group === 'routeSource' ? ['rules', 'rules-fallback', 'rules-fallback-clarification', 'clarification', 'local-model', 'local-read-plan', 'read-plan-unavailable']
            : group === 'routeScoreBand' ? ['low', 'medium', 'high', 'very_high', 'unknown']
              : ['local_model_unavailable', 'invalid_tool_arguments', 'no_safe_tool_route', 'local_model_error', 'unsafe_or_unavailable_read_plan', 'network', 'permission', 'other'])
      counters[group][bucket] = (counters[group][bucket] || 0) + 1
    }
    const routeDomain = /^order|^orders|^select_result/.test(route || '') ? 'orders'
      : /^product|^stock/.test(route || '') ? 'stock'
        : /^report|^sales|^overview/.test(route || '') ? 'reports'
          : /^customer/.test(route || '') ? 'customers'
            : /^supplier/.test(route || '') ? 'suppliers'
              : /^deliver|^overdue/.test(route || '') ? 'delivery'
                : /^cash/.test(route || '') ? 'cash'
                  : ['greeting', 'help', 'how_to', 'capabilities'].includes(route) ? 'conversation'
                    : 'other'
    increment('route', routeDomain)
    increment('outcome', outcome)
    increment('routeSource', routeSource)
    increment('routeScoreBand', scoreBand(routeScore))
    if (fallbackReason) increment('fallbackReason', fallbackReason)
    const latencyBucket = !Number.isFinite(latencyMs) ? 'unknown' : latencyMs < 500 ? 'lt_500ms' : latencyMs < 2000 ? '500ms_2s' : latencyMs < 5000 ? '2s_5s' : 'gte_5s'
    increment('latency', latencyBucket)
    counters.total = (counters.total || 0) + 1
    const trim = (object) => Object.fromEntries(Object.entries(object || {}).slice(0, MAX_KEYS))
    for (const group of ['route', 'outcome', 'routeSource', 'routeScoreBand', 'fallbackReason', 'latency', 'feedback', 'feedbackByScoreBand']) counters[group] = trim(counters[group])
    store.setItem(COUNTERS_KEY, JSON.stringify(counters))
  } catch { /* Diagnostics are optional and must not affect the assistant. */ }
}

export function recordAssistantFeedback(helpful, { routeScore } = {}) {
  if (!isAssistantDiagnosticsEnabled()) return
  const store = storage()
  if (!store) return
  try {
    const counters = readCounters()
    counters.feedback ||= { helpful: 0, needs_work: 0 }
    const label = helpful ? 'helpful' : 'needs_work'
    counters.feedback[label] = (counters.feedback[label] || 0) + 1
    const band = scoreBand(routeScore)
    counters.feedbackByScoreBand ||= {}
    counters.feedbackByScoreBand[band] ||= { helpful: 0, needs_work: 0 }
    counters.feedbackByScoreBand[band][label] += 1
    store.setItem(COUNTERS_KEY, JSON.stringify(counters))
  } catch { /* Ignore unavailable browser storage. */ }
}

export function getAssistantDiagnostics() {
  return { version: 1, enabled: isAssistantDiagnosticsEnabled(), ...readCounters() }
}

export function clearAssistantDiagnostics() {
  try { storage()?.removeItem(COUNTERS_KEY); return true } catch { return false }
}
