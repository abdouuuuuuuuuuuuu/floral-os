import { ASSISTANT_CATALOG_INTENTS } from './actionCatalog.js'

const SYSTEM_INTENTS = [
  'capabilities', 'greeting', 'help', 'navigate', 'order_clarification',
  'route_clarification', 'select_result', 'read_plan', 'read_plan_unavailable', 'order_delete_forbidden',
]
const SUPPORTED_INTENTS = new Set([...SYSTEM_INTENTS, ...ASSISTANT_CATALOG_INTENTS])
export const READ_PLAN_INTENTS = new Set([
  'order_lookup', 'order_search', 'orders_due', 'orders_list', 'orders_period', 'orders_status',
  'orders_created_by', 'deliveries', 'deliveries_period', 'overdue', 'unpaid', 'product_stock', 'product_price',
])

const ORDER_STATUSES = new Set(['new', 'processing', 'done', 'cancelled'])
const ENUM_FIELDS = {
  action: ['payment', 'refund'],
  availability: ['low', 'out', 'medium', 'healthy'],
  comparator: ['exact', 'above', 'below', 'around'],
  dateField: ['created_at', 'delivery_date'],
  field: ['summary', 'full', 'order_number', 'client_name', 'client_phone', 'created_by', 'status', 'payment_status', 'payment_method', 'amount_paid', 'amount_due', 'total_amount', 'delivery_date', 'delivery_time', 'delivery_method', 'items', 'notes', 'created_at'],
  method: ['cash', 'baridimob', 'usd'],
  requestedFact: ['purchase_history', 'payment_history', 'order_history', 'phone', 'email', 'last_order', 'total_spent'],
  scope: ['all', 'flowers'],
  searchField: ['client_name', 'client_phone'],
  stockValueMode: ['retail_value', 'purchase_cost_unavailable'],
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function invalid(reason) {
  return { ok: false, reason }
}

/** Validate the intent envelope before it reaches query or action handlers. */
export function validateAssistantIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return invalid('missing_intent')
  if (!SUPPORTED_INTENTS.has(intent.type)) return invalid('unsupported_intent')
  if (intent.type === 'route_clarification') {
    const allowedTopics = new Set(['orders', 'inventory', 'delivery', 'reports', 'cash', 'customers', 'suppliers'])
    if (!Array.isArray(intent.topics) || intent.topics.length > 5
      || intent.topics.some((topic) => !allowedTopics.has(topic))) return invalid('invalid_route_topics')
    return { ok: true, intent }
  }
  if (intent.prompt !== undefined && (typeof intent.prompt !== 'string' || intent.prompt.length > 5000)) return invalid('invalid_prompt')
  if (intent.type === 'read_plan') {
    if (!Array.isArray(intent.plan) || intent.plan.length < 2 || intent.plan.length > 3) return invalid('invalid_plan_size')
    for (const step of intent.plan) {
      const result = validateAssistantIntent(step)
      if (!result.ok || !READ_PLAN_INTENTS.has(step?.type)) return invalid('unsafe_plan_step')
    }
    return { ok: true, intent }
  }

  if (intent.orderNumber != null && !/^\d{1,20}$/.test(String(intent.orderNumber))) return invalid('invalid_order_number')
  if (intent.type === 'order_delete' && !/^pepepeace\s+#\d{1,20}$/i.test(String(intent.deleteCommand || ''))) {
    return invalid('permanent_delete_phrase_required')
  }
  if (intent.orderId != null && (typeof intent.orderId !== 'string' || intent.orderId.length > 100)) return invalid('invalid_order_id')
  if (intent.customerId != null && !((typeof intent.customerId === 'string' && intent.customerId.length > 0 && intent.customerId.length <= 100)
    || (Number.isSafeInteger(intent.customerId) && intent.customerId > 0))) return invalid('invalid_customer_id')
  if (intent.supplierId != null && !((typeof intent.supplierId === 'string' && intent.supplierId.length > 0 && intent.supplierId.length <= 100)
    || (Number.isSafeInteger(intent.supplierId) && intent.supplierId > 0))) return invalid('invalid_supplier_id')
  if (intent.page !== undefined && (!Number.isInteger(intent.page) || intent.page < 0 || intent.page > 1000)) return invalid('invalid_page')
  if (intent.limit !== undefined && (!Number.isInteger(intent.limit) || intent.limit < 1 || intent.limit > 100)) return invalid('invalid_limit')
  if (intent.index !== undefined && (!Number.isInteger(intent.index) || intent.index < 0 || intent.index > 11)) return invalid('invalid_result_index')
  if (intent.offset !== undefined && (!Number.isInteger(intent.offset) || intent.offset < -3650 || intent.offset > 3650)) return invalid('invalid_date_offset')
  if (intent.action !== undefined && !ENUM_FIELDS.action.includes(intent.action)) return invalid('invalid_action')
  if (intent.deliveryOnly !== undefined && typeof intent.deliveryOnly !== 'boolean') return invalid('invalid_delivery_filter')
  if (intent.full !== undefined && typeof intent.full !== 'boolean') return invalid('invalid_full_payment_flag')
  if (intent.printRequested !== undefined && typeof intent.printRequested !== 'boolean') return invalid('invalid_print_request_flag')
  if (intent.detailRequested !== undefined && typeof intent.detailRequested !== 'boolean') return invalid('invalid_detail_request_flag')
  if (intent.itemChange !== undefined) {
    const change = intent.itemChange
    if (intent.type !== 'order_edit' || !change || change.kind !== 'replace'
      || typeof change.sourceTerm !== 'string' || !change.sourceTerm.trim() || change.sourceTerm.length > 100
      || typeof change.targetTerm !== 'string' || !change.targetTerm.trim() || change.targetTerm.length > 100
      || (change.quantity != null && (!Number.isSafeInteger(change.quantity) || change.quantity < 1 || change.quantity > 10000))) {
      return invalid('invalid_order_item_change')
    }
  }
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    if (intent[field] !== undefined && intent[field] !== null && !allowed.includes(intent[field])) return invalid(`invalid_${field}`)
  }

  if (intent.deliveryDate != null && !validDateOnly(intent.deliveryDate)) return invalid('invalid_delivery_date')
  if (intent.targetDate != null && !validDateOnly(intent.targetDate)) return invalid('invalid_target_date')
  if (intent.amount != null && (!Number.isFinite(intent.amount) || intent.amount < 0)) return invalid('invalid_amount')
  if (intent.amountRange != null && (!Array.isArray(intent.amountRange) || intent.amountRange.length !== 2
    || intent.amountRange.some((amount) => !Number.isFinite(amount) || amount < 0)
    || intent.amountRange[0] > intent.amountRange[1])) return invalid('invalid_amount_range')

  if (intent.statuses != null && (!Array.isArray(intent.statuses) || intent.statuses.length > ORDER_STATUSES.size
    || intent.statuses.some((status) => !ORDER_STATUSES.has(status)))) return invalid('invalid_status_filter')
  for (const field of ['term', 'name', 'search', 'topic', 'reason']) {
    if (intent[field] !== undefined && intent[field] !== null && (typeof intent[field] !== 'string' || intent[field].length > 500)) {
      return invalid(`invalid_${field}`)
    }
  }

  if (['orders_period', 'deliveries_period', 'report_period', 'stock_waste'].includes(intent.type)) {
    const period = intent.period
    if (period != null && (!validDateOnly(period.startDate) || !validDateOnly(period.endDate) || period.endDate <= period.startDate)) {
      return invalid('invalid_period')
    }
    if (intent.type === 'deliveries_period' && !period) return invalid('missing_period')
  }

  return { ok: true, intent }
}

export function invalidAssistantIntent(prompt, reason) {
  return { type: 'invalid_intent', prompt, contractReason: reason }
}
