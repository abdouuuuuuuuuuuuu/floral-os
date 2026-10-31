const CONTEXT_VERSION = 2

const ORDER_INTENTS = new Set([
  'order_lookup', 'order_customer_fact', 'order_search', 'order_clarification',
  'orders_list', 'orders_status', 'orders_due', 'orders_period', 'orders_created_by',
  'deliveries', 'deliveries_period', 'overdue', 'created_today', 'order_create',
  'order_edit', 'order_delete', 'order_cancel', 'order_payment', 'order_delay', 'select_result',
])
const STOCK_INTENTS = new Set(['product_stock', 'product_price', 'low_stock', 'stock_waste'])
const REPORT_INTENTS = new Set(['report_period', 'sales', 'unpaid', 'overview'])

export function conversationTopicFor(intent) {
  if (!intent) return null
  if (intent.type === 'read_plan') {
    const topics = [...new Set((intent.plan || []).map((step) => conversationTopicFor(step)).filter(Boolean))]
    return topics.length === 1 ? topics[0] : 'mixed'
  }
  if (ORDER_INTENTS.has(intent.type) || intent.type.startsWith('order') || intent.type.startsWith('orders')) return 'orders'
  if (STOCK_INTENTS.has(intent.type)) return 'stock'
  if (REPORT_INTENTS.has(intent.type)) return 'reports'
  if (intent.type === 'customer_lookup') return 'customers'
  if (intent.type === 'supplier_lookup') return 'suppliers'
  if (intent.type === 'cash_register') return 'cash'
  if (intent.type === 'navigate') return intent.topic || 'navigation'
  return intent.type
}

function rowEntity(row, fallbackCustomerName = null) {
  if (!row?.orderNumber) return null
  const titleName = row.title?.match(/^#?\d+\s*[·-]\s*(.+)$/)?.[1]
  const name = row.customerName || fallbackCustomerName || (titleName === 'Walk-in customer' ? null : titleName) || null
  return { id: row.id || null, orderNumber: String(row.orderNumber), customerName: name }
}

function stableResultRows(rows = []) {
  return rows.slice(0, 12).map((row, index) => ({
    id: row.id || null,
    orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
    customerName: row.customerName || row.title?.match(/^#?\d+\s*[·-]\s*(.+)$/)?.[1] || null,
    title: row.title || null,
    index,
  }))
}

function clarificationFrom(intent, response) {
  if (response?.pendingClarification) {
    return {
      ...response.pendingClarification,
      intent: response.pendingClarification.intent || intent,
      candidates: (response.rows || []).filter((row) => row.orderNumber != null).map((row) => ({
        id: row.id || null, orderNumber: String(row.orderNumber), customerName: row.customerName || null,
      })).concat((response.rows || []).filter((row) => row.customerId != null).map((row) => ({
        customerId: row.customerId, name: row.title || row.customerName || null,
    }))).concat((response.rows || []).filter((row) => row.supplierId != null).map((row) => ({
      supplierId: row.supplierId, name: row.title || row.supplierName || null,
      }))),
    }
  }
  if (intent.type === 'order_clarification') return { kind: 'order_lookup', slot: 'orderTarget', intent }
  return null
}

export function updateConversationContext(previous, intent, response) {
  if (!intent) return previous
  const resolvedIntent = response?.followupContext || intent
  if (['greeting', 'help', 'capabilities', 'route_clarification'].includes(resolvedIntent.type)) return previous

  const topic = conversationTopicFor(resolvedIntent)
  const sameTopic = previous.topic === topic
  const rows = stableResultRows(response?.rows || [])
  const orderRows = rows.filter((row) => row.orderNumber != null)
  let recentOrders = sameTopic ? [...(previous.recentOrders || [])] : []
  // Order writes retain their active target even if the caller is transitioning
  // from the immediately preceding order lookup context.
  let activeOrder = sameTopic || resolvedIntent.type === 'order_edit' ? previous.activeOrder || null : null
  let activeCustomer = sameTopic ? previous.activeCustomer || null : null
  let activeProduct = sameTopic ? previous.activeProduct || null : null

  if (resolvedIntent.type === 'select_result') {
    activeOrder = recentOrders[resolvedIntent.index] || activeOrder
  } else if (resolvedIntent.orderNumber) {
    const number = String(resolvedIntent.orderNumber)
    activeOrder = {
      id: resolvedIntent.orderId || (activeOrder?.orderNumber === number ? activeOrder.id : null),
      orderNumber: number,
      customerName: resolvedIntent.customerName || (activeOrder?.orderNumber === number ? activeOrder.customerName : null),
    }
  } else if (orderRows.length === 1) {
    activeOrder = rowEntity(response.rows.find((row) => String(row.orderNumber) === orderRows[0].orderNumber), resolvedIntent.term)
  }
  if (resolvedIntent.type === 'order_edit' && resolvedIntent.orderNumber) {
    activeOrder = { id: previous.activeOrder?.id || null, orderNumber: String(resolvedIntent.orderNumber), customerName: previous.activeOrder?.customerName || null }
  }

  const replacesOrderResults = ['order_lookup', 'order_search', 'order_customer_fact', 'orders_list', 'orders_status', 'orders_due', 'orders_period', 'orders_created_by', 'deliveries', 'deliveries_period', 'overdue', 'created_today'].includes(resolvedIntent.type)
    || (resolvedIntent.type === 'read_plan' && topic === 'orders')
  const lookupMiss = response?.outcome?.status === 'not_found'
    || /^no orders? found|^no matching orders|^no order found/i.test(response?.title || '')
  if (lookupMiss && topic === 'orders') activeOrder = null
  else if (replacesOrderResults && !orderRows.length && !resolvedIntent.orderNumber) activeOrder = null
  if (orderRows.length) recentOrders = orderRows.map((row) => rowEntity(row, resolvedIntent.term)).filter(Boolean)
  else if (resolvedIntent.type === 'order_lookup' && activeOrder) recentOrders = [activeOrder]
  else if (replacesOrderResults) recentOrders = []
  else if (topic !== 'orders') recentOrders = []

  if (resolvedIntent.type === 'order_customer_fact' || resolvedIntent.type === 'order_search') {
    if (resolvedIntent.term) activeCustomer = resolvedIntent.term
  } else if (resolvedIntent.type === 'customer_lookup') {
    activeCustomer = resolvedIntent.name || activeCustomer
  } else if (topic === 'orders' && activeOrder?.customerName) {
    activeCustomer = activeOrder.customerName
  } else if (!sameTopic) {
    activeCustomer = null
  }

  if (['product_stock', 'product_price'].includes(resolvedIntent.type)) {
    activeProduct = resolvedIntent.search || null
  } else if (!sameTopic || topic !== 'stock') {
    activeProduct = null
  }

  const clarification = clarificationFrom(resolvedIntent, response)
  let activeEntity = null
  if (topic === 'orders' && activeOrder) activeEntity = { type: 'order', ...activeOrder }
  else if (topic === 'customers' && response?.rows?.length === 1) activeEntity = { type: 'customer', id: response.rows[0].id || null, name: response.rows[0].title || activeCustomer }
  else if (topic === 'customers' && activeCustomer) activeEntity = { type: 'customer', name: activeCustomer }
  else if (topic === 'orders' && activeCustomer) activeEntity = { type: 'order_customer_search', name: activeCustomer }
  else if (activeProduct) activeEntity = { type: 'product', name: activeProduct }
  else if (resolvedIntent.type === 'supplier_lookup' && resolvedIntent.name) activeEntity = { type: 'supplier', name: resolvedIntent.name }

  const activeTask = response?.orderForm
    ? { type: response.orderForm.mode === 'edit' ? 'order_edit' : 'order_create', step: response.orderForm.initialDraft?.step || 'review', orderNumber: response.orderForm.order?.order_number || null }
    : sameTopic ? previous.currentTask : null

  return {
    version: CONTEXT_VERSION,
    topic,
    intent: resolvedIntent,
    activeEntity,
    activeOrder: activeOrder || null,
    activeCustomer,
    activeProduct,
    period: resolvedIntent.period || (sameTopic ? previous.period : null),
    recentOrders,
    activeResultSet: orderRows.length || replacesOrderResults
      ? { topic, sourceIntent: resolvedIntent.type, rows: orderRows, selectedIndex: resolvedIntent.type === 'select_result' ? resolvedIntent.index : null }
      : sameTopic ? previous.activeResultSet || null : null,
    pendingClarification: clarification,
    currentTask: activeTask,
    lastResult: response ? { topic, intentType: resolvedIntent.type, title: response.title || '', text: response.text || '', rows: rows.slice(0, 8) } : previous.lastResult || null,
  }
}

export function continuePendingClarification(question, pending, { normalize, reportPeriodFromText } = {}) {
  if (!pending?.intent || !normalize) return null
  const text = normalize(question).trim().replace(/[?.!]+$/g, '')
  const previousIntent = pending.intent
  const number = text.match(/^(?:order\s*)?#?\s*(\d{1,20})$/)?.[1]

  if (pending.slot === 'orderChoice') {
    const ordinal = text.match(/^(?:the\s+)?(first|1st|one|second|2nd|two|third|3rd|three|fourth|4th|four|fifth|5th|five)$/)?.[1]
    const indexes = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2, fourth: 3, '4th': 3, four: 3, fifth: 4, '5th': 4, five: 4 }
    if (ordinal) {
      const selected = pending.candidates?.[indexes[ordinal]]
      if (selected) return { type: 'order_lookup', orderNumber: selected.orderNumber, facts: previousIntent.field ? [previousIntent.field] : ['full'], printRequested: Boolean(previousIntent.printRequested), prompt: question }
    }
    if (number) return { type: 'order_lookup', orderNumber: number, facts: previousIntent.field ? [previousIntent.field] : ['full'], printRequested: Boolean(previousIntent.printRequested), prompt: question }
  }

  if (pending.slot === 'customerChoice') {
    const ordinal = text.match(/^(?:the\s+)?(first|1st|one|second|2nd|two|third|3rd|three|fourth|4th|four|fifth|5th|five|yes|that one)$/)?.[1]
    const indexes = { first: 0, '1st': 0, one: 0, 'that one': 0, yes: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2, fourth: 3, '4th': 3, four: 3, fifth: 4, '5th': 4, five: 4 }
    const selected = ordinal ? pending.candidates?.[indexes[ordinal]] : null
    if (selected?.customerId != null) return {
      ...previousIntent,
      type: 'customer_lookup',
      customerId: selected.customerId,
      name: selected.name || previousIntent.name,
      prompt: question,
    }
  }

  if (pending.slot === 'supplierChoice') {
    const ordinal = text.match(/^(?:the\s+)?(first|1st|one|second|2nd|two|third|3rd|three|fourth|4th|four|fifth|5th|five|yes|that one)$/)?.[1]
    const indexes = { first: 0, '1st': 0, one: 0, 'that one': 0, yes: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2, fourth: 3, '4th': 3, four: 3, fifth: 4, '5th': 4, five: 4 }
    const selected = ordinal ? pending.candidates?.[indexes[ordinal]] : null
    if (selected?.supplierId != null) return {
      ...previousIntent,
      type: 'supplier_lookup',
      supplierId: selected.supplierId,
      name: selected.name || previousIntent.name,
      candidates: undefined,
      prompt: question,
    }
  }

  if (['orderNumber', 'orderTarget'].includes(pending.slot)) {
    if (number) {
      const orderNumber = number
      if (pending.kind === 'order_edit') return { ...previousIntent, type: 'order_edit', orderNumber, prompt: question }
      if (pending.kind === 'order_delay') return { ...previousIntent, type: 'order_delay', orderNumber, prompt: question }
      if (pending.kind === 'order_payment') return { ...previousIntent, type: 'order_payment', orderNumber, prompt: question }
      if (pending.kind === 'order_cancel') return { ...previousIntent, type: 'order_cancel', orderNumber, prompt: question }
      if (pending.kind === 'order_delete') return { ...previousIntent, type: 'order_delete', orderNumber, prompt: question }
      return { type: 'order_lookup', orderNumber, facts: ['full'], prompt: question }
    }
    if (pending.slot === 'orderTarget' && text.length > 1 && text.length <= 80) {
      return { type: 'order_customer_fact', term: question.trim(), field: 'full', prompt: question }
    }
  }

  if (pending.slot === 'deliveryDate') {
    const date = reportPeriodFromText?.(question)?.startDate || text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0]
    if (date) return { ...previousIntent, type: 'order_delay', deliveryDate: date, prompt: question }
  }

  if (pending.slot === 'customerName' && text.length > 1 && text.length <= 100) {
    return pending.kind === 'customer_lookup'
      ? { ...previousIntent, type: 'customer_lookup', name: question.trim(), prompt: question }
      : { ...previousIntent, type: 'order_customer_fact', term: question.trim(), field: previousIntent.field || 'full', prompt: question }
  }
  return null
}

export function setConversationTask(previous, task) {
  return { ...previous, version: CONTEXT_VERSION, currentTask: task || null }
}

export function completeConversationAction(previous, { type, order = null, orderNumber = null } = {}) {
  const deleted = type === 'order_delete'
  if (type === 'order_create') {
    return {
      ...previous,
      topic: 'orders', intent: null, activeEntity: null, activeOrder: null, activeCustomer: null,
      recentOrders: [], activeResultSet: null, pendingClarification: null, currentTask: null, lastResult: null,
    }
  }
  const targetNumber = String(orderNumber || order?.order_number || previous.activeOrder?.orderNumber || '')
  const activeOrder = deleted
    ? (previous.activeOrder?.orderNumber === targetNumber ? null : previous.activeOrder)
    : targetNumber
      ? { id: order?.id || previous.activeOrder?.id || null, orderNumber: targetNumber, customerName: order?.client_name || previous.activeOrder?.customerName || null }
      : previous.activeOrder
  return {
    ...previous,
    activeOrder,
    activeEntity: activeOrder ? { type: 'order', ...activeOrder } : deleted && previous.activeOrder?.orderNumber === targetNumber ? null : previous.activeEntity,
    recentOrders: activeOrder ? [activeOrder] : previous.recentOrders.filter((item) => item.orderNumber !== targetNumber),
    activeResultSet: null,
    pendingClarification: null,
    currentTask: null,
    lastResult: null,
    intent: activeOrder ? { type: 'order_lookup', orderNumber: activeOrder.orderNumber, facts: ['summary'] } : previous.intent,
  }
}

export function clearConversationContext() {
  return {
    version: CONTEXT_VERSION,
    topic: null,
    intent: null,
    activeEntity: null,
    activeOrder: null,
    activeCustomer: null,
    activeProduct: null,
    period: null,
    recentOrders: [],
    activeResultSet: null,
    pendingClarification: null,
    currentTask: null,
    lastResult: null,
  }
}

export function emptyConversationContext() {
  return clearConversationContext()
}
