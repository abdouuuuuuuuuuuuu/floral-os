import { normalizeIntentText } from './intentEngine.js'

// These are routing scores, not probabilities. They become calibrated
// probabilities only after comparison with a labeled production dataset.
const SIGNALS = [
  { family: 'orders', weight: 0.24, pattern: /\borders?|order\s*#?\d+|commande\b/ },
  { family: 'inventory', weight: 0.24, pattern: /\bstock|inventory|flowers?|products?|roses?|tulips?|carnations?|lilies\b/ },
  { family: 'delivery', weight: 0.24, pattern: /\bdeliver(?:y|ies|ed)|due|overdue|pickup|reschedule|postpone\b/ },
  { family: 'reports', weight: 0.24, pattern: /\brevenue|sales|profit|report|performance|earned\b/ },
  { family: 'cash', weight: 0.24, pattern: /\bcash|coffre|register|balance|cash.?in|cash.?out\b/ },
  { family: 'customers', weight: 0.24, pattern: /\bcustomer|client|phone number|contact\b/ },
  { family: 'suppliers', weight: 0.24, pattern: /\bsupplier|vendor\b/ },
]

const ACTION = /\b(create|make|place|edit|update|change|modify|add|remove|delete|cancel|refund|pay|record|delay|reschedule|postpone)\b/
const TARGET = /(?:#\s*\d+|\b(?:order|commande)\s*(?:number|no\.?|id)?\s*#?\s*\d+\b|\b(?:today|tomorrow|yesterday|this week|last week|next week|this month|\d{4}-\d{2}-\d{2})\b)/
const FACT = /\b(status|payment|paid|unpaid|items?|products?|customer|client|name|phone|number|date|time|total|amount|due|creator|created by|delivery method)\b/
const INVENTORY_QUESTION = /\b(how many|quantity|count|left|remaining|available|in stock|stock level|low stock|out of stock|price)\b/
const ORDER_QUESTION = /\b(show|find|search|look up|what|who|when|which|list|details|status|paid|unpaid|payment|items?|customer|client|delivery|created)\b/

export function assessRoute(prompt, intent, context = {}) {
  const text = normalizeIntentText(prompt)
  if (intent?.type === 'greeting') {
    return { score: 0.99, evidence: ['greeting_match'], families: [], needsModelTieBreak: false, shouldClarify: false }
  }
  const families = SIGNALS.filter(({ pattern }) => pattern.test(text)).map(({ family }) => family)
  // These terms commonly describe an order rather than a second subject:
  // “customer name on order 123” and “orders due tomorrow” are single-domain asks.
  if (families.includes('orders')) {
    if (/\b(customer|client|name|phone)\b/.test(text) && families.includes('customers')) families.splice(families.indexOf('customers'), 1)
    if (/\b(due|delivery date|delivery time|delivering)\b/.test(text) && families.includes('delivery')) families.splice(families.indexOf('delivery'), 1)
  }
  const action = ACTION.test(text)
  const target = TARGET.test(text)
  const fact = FACT.test(text)
  let score = 0.56
  const evidence = []

  if (families.length === 1) { score += 0.14; evidence.push('single_domain') }
  else if (families.length > 1) { score -= Math.min(0.24, (families.length - 1) * 0.12); evidence.push('multiple_domains') }
  if (action) { score += 0.12; evidence.push('explicit_operation') }
  if (target) { score += 0.12; evidence.push('explicit_target_or_period') }
  if (fact) { score += 0.06; evidence.push('requested_fact') }
  if (families.includes('inventory') && INVENTORY_QUESTION.test(text)) { score += 0.14; evidence.push('inventory_question_predicate') }
  if (families.includes('orders') && ORDER_QUESTION.test(text)) { score += 0.12; evidence.push('order_question_predicate') }

  const contextual = Boolean(context?.activeOrder || context?.activeCustomer || context?.activeProduct || context?.activeEntity || context?.currentTask)
  const shortFollowup = text.split(/\s+/).filter(Boolean).length <= 4
  if (shortFollowup && contextual) { score += 0.08; evidence.push('conversation_context') }
  if (shortFollowup && !contextual && !action && families.length === 0) { score -= 0.2; evidence.push('underspecified') }
  if (intent?.type === 'help' || intent?.type === 'invalid_intent' || intent?.type === 'order_clarification') {
    score = Math.min(score, 0.54)
    evidence.push('rule_fallback')
  }

  score = Math.max(0, Math.min(0.98, Number(score.toFixed(2))))
  const competing = families.length > 1
  // Ask the user to choose a topic when two domains appear without a clear
  // operation or target. Explicit operations/targets keep their normal route.
  const isResolvedFactRoute = ['overdue', 'orders_due', 'orders_period', 'orders_status', 'product_stock', 'product_price', 'cash_register', 'report_period', 'sales'].includes(intent?.type)
  const shouldClarify = competing && !isResolvedFactRoute && !action && !target && score < 0.72
  return {
    score,
    evidence,
    families,
    needsModelTieBreak: score < 0.78 || competing,
    shouldClarify,
  }
}

