import { BLOSSOM_LOCAL_TOOLS } from './assistant/capabilities.js'

const MODEL_PROXY = '/__local-ollama'
const MODEL_REQUEST_TIMEOUT_MS = 45_000



const toPeriod = (period) => ({
  today: 'today', yesterday: 'yesterday', this_week: 'this week', last_week: 'last week',
  next_week: 'next week', this_month: 'this month', last_month: 'last month',
}[period] || 'this week')

function validateToolArguments(name, args) {
  const tool = BLOSSOM_LOCAL_TOOLS.find((entry) => entry.function.name === name)
  if (!tool || !args || typeof args !== 'object' || Array.isArray(args)) return false
  const schema = tool.function.parameters
  const properties = schema.properties || {}
  if (Object.keys(args).some((key) => !Object.hasOwn(properties, key))) return false
  if ((schema.required || []).some((key) => !Object.hasOwn(args, key))) return false
  return Object.entries(args).every(([key, value]) => {
    const field = properties[key]
    if (field.enum && !field.enum.includes(value)) return false
    if (field.type === 'string') return typeof value === 'string' && value.length <= 500
    if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value)
    if (field.type === 'integer') return Number.isInteger(value) && value >= (field.minimum ?? -Infinity) && value <= (field.maximum ?? Infinity)
    if (field.type === 'boolean') return typeof value === 'boolean'
    if (field.type === 'array') return Array.isArray(value) && value.length <= 20 && (!field.items?.enum || value.every((item) => field.items.enum.includes(item)))
    return false
  })
}

export function intentFromLocalToolCall(toolCall, prompt, { reportPeriodFromText, productSearchTerms } = {}) {
  const name = toolCall?.function?.name
  let args = toolCall?.function?.arguments || {}
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { return null }
  }
  if (!validateToolArguments(name, args)) return null
  const orderNumber = args.order_number == null ? null : String(args.order_number).replace(/^#/, '').trim()
  if (orderNumber != null && !/^\d+$/.test(orderNumber)) return null

  switch (name) {
    case 'lookup_order':
      return orderNumber ? { type: 'order_lookup', orderNumber, facts: Array.isArray(args.facts) ? args.facts : ['summary'], prompt } : null
    case 'recent_order_creators':
      return { type: 'orders_created_by', limit: Math.min(10, Math.max(1, Number(args.limit) || 3)), prompt }
    case 'search_orders':
      return { type: 'order_search', term: String(args.term || '').trim() || null, searchField: args.search_by === 'phone' ? 'client_phone' : args.search_by === 'customer_name' ? 'client_name' : null, amount: Number.isFinite(Number(args.amount)) ? Number(args.amount) : null, amountRange: Number.isFinite(Number(args.minimum_amount)) && Number.isFinite(Number(args.maximum_amount)) ? [Number(args.minimum_amount), Number(args.maximum_amount)] : null, comparator: ['above', 'below', 'around'].includes(args.comparator) ? args.comparator : 'exact', prompt }
    case 'list_orders': {
      const statusesByName = { new: ['new'], processing: ['processing'], done: ['done'], cancelled: ['cancelled'], open: ['new', 'processing'] }
      const statuses = statusesByName[args.status] || null
      if (args.period === 'overdue') return { type: 'overdue', prompt }
      if (args.period === 'created_today' || (args.date_field === 'created' && args.period === 'today')) return { type: 'created_today', offset: args.period === 'yesterday' ? -1 : 0, prompt }
      if (args.period === 'all') return statuses ? { type: 'orders_status', statuses, label: args.status, createdOffset: null, prompt } : { type: 'orders_list', prompt }
      if (['today', 'tomorrow', 'yesterday'].includes(args.period)) {
        const offset = args.period === 'tomorrow' ? 1 : args.period === 'yesterday' ? -1 : 0
        if (args.deliveries_only) return { type: 'deliveries', offset, statuses, prompt }
        return { type: 'orders_due', offset, statuses, prompt }
      }
      return { type: 'orders_period', period: reportPeriodFromText?.(toPeriod(args.period)) || null, dateField: args.date_field === 'created' ? 'created_at' : 'delivery_date', statuses, term: null, prompt }
    }
    case 'check_stock':
      return { type: 'product_stock', search: productSearchTerms?.(String(args.product || '')).join(' ') || String(args.product || '').trim(), scope: args.scope || null, availability: args.availability || null, stockValueMode: args.value_mode || null, prompt }
    case 'check_product_price':
      return { type: 'product_price', search: productSearchTerms?.(String(args.product || '')).join(' ') || String(args.product || '').trim(), prompt }
    case 'analyze_reports':
      return { type: 'report_period', period: reportPeriodFromText?.(toPeriod(args.period)) || null, prompt, question: String(args.question || prompt) }
    case 'create_order':
      return { type: 'order_create', prompt: String(args.request || prompt) }
    case 'edit_order':
      return { type: 'order_edit', orderNumber, prompt: String(args.requested_change || prompt) }
    case 'delay_order':
      const deliveryDate = reportPeriodFromText?.(String(args.delivery_date || ''))?.startDate || String(args.delivery_date || '').match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null
      return orderNumber ? { type: 'order_delay', orderNumber, deliveryDate, reason: args.reason || '', prompt } : null
    case 'record_order_payment':
      return { type: 'order_payment', orderNumber, action: args.action === 'refund' ? 'refund' : 'payment', amount: Number.isFinite(Number(args.amount)) ? Number(args.amount) : null, full: Boolean(args.full), method: args.method || null, prompt }
    case 'cancel_order':
      return orderNumber ? { type: 'order_cancel', orderNumber, prompt } : null
    case 'delete_order':
      return orderNumber && typeof args.delete_command === 'string'
        ? { type: 'order_delete', orderNumber, deleteCommand: args.delete_command, prompt }
        : null
    case 'get_business_overview':
      return { type: 'overview', prompt }
    case 'find_customer':
      return { type: 'customer_lookup', name: String(args.name || '').trim(), prompt }
    case 'find_supplier':
      return { type: 'supplier_lookup', name: String(args.name || '').trim(), prompt }
    case 'list_deliveries': {
      const date = String(args.date || '').match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null
      const offset = args.period === 'tomorrow' ? 1 : args.period === 'yesterday' ? -1 : 0
      const statusesByName = { new: ['new'], processing: ['processing'], done: ['done'] }
      if (args.period === 'overdue') return { type: 'overdue', deliveryOnly: true, prompt }
      if (['this_week', 'next_week', 'this_month'].includes(args.period)) return { type: 'deliveries_period', period: reportPeriodFromText?.(toPeriod(args.period)) || null, statuses: statusesByName[args.status] || null, prompt }
      return { type: 'deliveries', offset, targetDate: date, statuses: statusesByName[args.status] || null, prompt }
    }
    case 'cash_register_summary':
      return { type: 'cash_register', targetDate: String(args.date || '').match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null, offset: args.period === 'yesterday' ? -1 : 0, detail: Boolean(args.detail), prompt }
    case 'guide_workflow':
      return { type: 'how_to', topic: String(args.topic || prompt), prompt }
    default:
      return null
  }
}

export async function getLocalModelStatus() {
  if (window.electronAPI?.localModel?.status) return window.electronAPI.localModel.status()
  const response = await fetch(`${MODEL_PROXY}/api/tags`, { signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error('The local model service did not respond.')
  const data = await response.json()
  return { available: true, models: (data.models || []).map((model) => ({ name: model.name, size: model.size })) }
}

export async function askLocalModel({ model, messages, tools = BLOSSOM_LOCAL_TOOLS, timeoutMs = MODEL_REQUEST_TIMEOUT_MS, stream = false, onToken }) {
  const body = { model, messages, tools, stream, options: { temperature: 0.1, num_ctx: 8192 } }
  if (window.electronAPI?.localModel?.streamChat && stream) {
    return window.electronAPI.localModel.streamChat({ ...body, timeoutMs }, onToken)
  }
  if (window.electronAPI?.localModel?.chat) return window.electronAPI.localModel.chat({ ...body, timeoutMs })

  const response = await fetch(`${MODEL_PROXY}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'The local model could not complete this request.')
  }
  if (!stream) {
    const result = await response.json().catch(() => ({}))
    if (result.error) throw new Error(result.error)
    return result
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Streaming is unavailable for the local model response.')
  const decoder = new TextDecoder()
  let pending = ''
  let content = ''
  const processLine = (line) => {
    if (!line.trim()) return
    const part = JSON.parse(line)
    if (part.error) throw new Error(part.error)
    const token = String(part.message?.content || '')
    if (token) { content += token; onToken?.(token) }
  }
  while (true) {
    const { value, done } = await reader.read()
    pending += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    for (const line of lines) processLine(line)
    if (done) break
  }
  if (pending.trim()) processLine(pending)
  return { message: { role: 'assistant', content } }
}
