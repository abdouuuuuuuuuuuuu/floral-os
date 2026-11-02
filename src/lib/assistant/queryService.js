import { canAccessRoute, orderActionsFor } from '../permissions.js'
import { normalize, productMatchesTerms, productSearchTerms, reportPeriodFromText } from './intentEngine.js'
import { ACTIVE_STATUSES, addCalendarDays, applyNameTokens, businessDayStartIso, dateLabel, fetchAllRows, localDate, localDayBounds, money, prettyTime } from './dataAccess.js'
import { READ_PLAN_INTENTS, validateAssistantIntent } from './intentContract.js'
import { formatAssistantDate } from './preferences.js'
import { canRunAssistantAction, getAssistantActionForIntent } from './actionCatalog.js'

function applyDatePreference(response, dateFormat) {
  if (!response || !dateFormat) return response
  const format = (text) => typeof text === 'string' ? text.replace(/\b(20\d{2}-\d{2}-\d{2})(?:(T| )(\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?))?\b/g, (match, date, separator = '', time = '') => {
    const formattedDate = formatAssistantDate(date, dateFormat)
    return time ? `${formattedDate}${separator === 'T' ? ' · ' : ' '}${time.replace(/\.(\d+)?(?:Z|[+-].*)?$/, '').replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '')}` : formattedDate
  }) : text
  return {
    ...response,
    title: format(response.title),
    text: format(response.text),
    rows: response.rows?.map((row) => ({ ...row, title: format(row.title), detail: format(row.detail), value: format(row.value) })),
  }
}

// `neq` excludes NULL values in Postgres, which hid legacy regular orders from
// assistant results. Keep the same definition used by the other order queries.
function regularOrders(query) {
  return query.or('order_type.is.null,order_type.neq.quick_sale')
}

function normalizedName(value = '') {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function withReadTimeout(promise, timeoutMs) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('read_timeout')), timeoutMs) }),
  ]).finally(() => clearTimeout(timer))
}

async function resolveQuestionResponse(intent, context = {}) {
  const { canSeeFinancials, role, lastAnswer } = context
  const database = context.database || (await import('../supabase.js')).supabase
  const dateFormat = context.preferences?.dateFormat || 'regional'
  const formatDate = (value) => formatAssistantDate(value, dateFormat)
  const formatDateTime = (value) => formatAssistantDateTime(value, dateFormat)
  const today = localDate()
  const fieldList = 'id, order_number, client_name, client_phone, total_amount, amount_due, amount_paid, payment_status, status, delivery_date, delivery_time, delivery_method, created_at'
  if (intent.type === 'read_plan_unavailable') {
    return { title: 'I couldn’t combine those reads right now', text: 'The local assistant planner is unavailable or couldn’t produce a safe plan. Ask the two parts separately, and I’ll still look up each answer from Blossom.', outcomeStatus: 'retryable_error' }
  }
  if (intent.type === 'read_plan') {
    if (!validateAssistantIntent(intent).ok || intent.plan.some((step) => !READ_PLAN_INTENTS.has(step.type))) {
      return { title: 'I couldn’t safely plan those reads', text: 'Ask one question at a time, or split the request into two short questions.', outcomeStatus: 'needs_clarification' }
    }
    const results = await Promise.allSettled(intent.plan.map((step) => withReadTimeout(
      resolveQuestionResponse({ ...step, planMode: true, prompt: step.prompt || intent.prompt }, { canSeeFinancials, role, lastAnswer, preferences: context.preferences, database }), 15_000,
    )))
    const fulfilled = results.map((result, index) => ({ result, step: intent.plan[index] }))
      .filter(({ result }) => result.status === 'fulfilled')
    const restricted = fulfilled.filter(({ result }) => /\b(restricted|access is restricted)\b/i.test(result.value.title || ''))
    const successful = fulfilled.filter(({ result }) => !/\b(restricted|access is restricted)\b/i.test(result.value.title || ''))
    const failedCount = results.length - successful.length
    const rows = []
    const summaries = []
    const actions = []
    for (const { result } of successful) {
      const value = result.value
      summaries.push(`${value.title || 'Result'}${value.text ? `: ${value.text}` : ''}`.slice(0, 500))
      for (const row of (value.rows || []).slice(0, 5)) {
        if (rows.length >= 12) break
        rows.push({ ...row, id: `plan-${rows.length}-${row.id || row.title}`, detail: [value.title, row.detail].filter(Boolean).join(' · ') })
      }
      for (const action of value.actions || []) {
        if (actions.length < 3 && !actions.some((existing) => existing.path === action.path && existing.label === action.label)) actions.push(action)
      }
    }
    if (restricted.length) summaries.push(`${restricted.length} part${restricted.length === 1 ? ' is' : 's are'} restricted for your role.`)
    if (results.some((result) => result.status === 'rejected')) summaries.push(`${results.filter((result) => result.status === 'rejected').length} part(s) couldn’t be retrieved; ask that part separately to retry.`)
    const allRestricted = restricted.length === results.length
    return {
      title: `Blossom checked ${successful.length} of ${results.length} requested items`,
      text: summaries.join(' ').slice(0, 2200), rows, actions,
      outcomeStatus: allRestricted ? 'forbidden' : failedCount ? (successful.length ? 'partial_success' : 'retryable_error') : 'success',
      ...(successful.some(({ result }) => result.value.suppressSuggestions) ? { suppressSuggestions: true } : {}),
    }
  }
  if (intent.type === 'invalid_intent') {
    return { title: 'I need to clarify that request', text: 'I couldn’t safely match the request to a supported Blossom action. Try adding an order number, product name, or date, or ask me what I can do.' , outcomeStatus: 'needs_clarification' }
  }
  if (intent.type === 'route_clarification') {
    const options = {
      orders: { label: 'Orders', answer: 'Show my orders' },
      inventory: { label: 'Products & stock', answer: 'Check product stock' },
      delivery: { label: 'Deliveries', answer: 'Show deliveries' },
      reports: { label: 'Reports & sales', answer: 'Show the business report' },
      cash: { label: 'Cash balance', answer: 'Check the cash register balance' },
      customers: { label: 'Customers', answer: 'Find a customer' },
      suppliers: { label: 'Suppliers', answer: 'Find a supplier' },
    }
    const topicList = intent.topics.length ? intent.topics : ['orders', 'inventory', 'delivery', 'reports']
    const choices = topicList.map((topic) => options[topic]).filter(Boolean)
    const topicNames = choices.map(({ label }) => label)
    return {
      title: intent.topics.length ? 'Which topic should I handle?' : 'I couldn’t confidently route that request',
      text: intent.topics.length
        ? `Your message could refer to ${topicNames.join(' or ')}. Choose one and I’ll focus on that first.`
        : 'I couldn’t select a safe Blossom action, so I didn’t run one. Choose a Blossom area below or rephrase your request.',
      choices,
      suppressSuggestions: true,
      outcomeStatus: 'needs_clarification',
    }
  }
  const orderIntents = ['order_lookup', 'order_customer_fact', 'order_search', 'order_clarification', 'orders_list', 'orders_status', 'orders_due', 'orders_period', 'orders_created_by', 'order_delay', 'overdue', 'created_today', 'order_create', 'order_edit', 'order_delete', 'order_cancel', 'order_payment']
  const overdueDeliveryIntent = intent.type === 'overdue' && intent.deliveryOnly === true
  if (orderIntents.includes(intent.type) && !overdueDeliveryIntent && !canAccessRoute(role, '/orders')) {
    return { title: 'Order information is restricted', text: 'Your Blossom role cannot access order records. Ask an owner to review your access.' }
  }
  if ((['deliveries', 'deliveries_period'].includes(intent.type) || overdueDeliveryIntent) && !canAccessRoute(role, '/delivery')) {
    return { title: 'Delivery information is restricted', text: 'Your Blossom role cannot access the delivery run. Ask an owner or manager to review your access.' }
  }
  if (intent.type === 'overview' && !canAccessRoute(role, '/dashboard')) {
    return { title: 'Business overview is restricted', text: 'Your Blossom role cannot access the business dashboard. I can still help with the specific modules your role allows.' }
  }
  if (intent.type === 'stock_waste' && !canAccessRoute(role, '/reports')) {
    return { title: 'Waste reporting is restricted', text: 'Flower-waste summaries are available to roles with Reports access.' }
  }
  if (intent.type === 'customer_lookup' && !canAccessRoute(role, '/customers')) {
    return { title: 'Customer information is restricted', text: 'Your Blossom role cannot access customer records. Ask an owner to review your access.' }
  }
  if (intent.type === 'customer_lookup' && intent.requestedFact === 'order_history' && !canAccessRoute(role, '/orders')) {
    return { title: 'Customer order history is restricted', text: 'Your role can access customer profiles but cannot view order records. Ask an owner to review your access.' }
  }
  if (intent.type === 'supplier_lookup' && !canAccessRoute(role, '/suppliers')) {
    return { title: 'Supplier information is restricted', text: 'Supplier records are available to owners and managers.' }
  }
  if (intent.type === 'cash_register' && role !== 'owner') {
    return { title: 'Cash register information is restricted', text: 'Only the owner role can access cash register records.' }
  }

  if (intent.type === 'supplier_lookup') {
    let query = database.from('suppliers').select('supplier_id, company_name, contact_person, phone, email, supplier_status', { count: 'exact' })
    if (intent.supplierId != null) query = query.eq('supplier_id', intent.supplierId)
    else if (intent.name) query = applyNameTokens(query, 'company_name', intent.name)
    const { data, count, error } = await query.order('company_name').limit(8)
    if (error) throw error
    if (!data?.length) return { title: intent.name ? `No supplier found for “${intent.name}”` : 'No suppliers found', text: 'Try a shorter company name or open Suppliers to browse the list.', actions: [{ label: 'Open suppliers', path: '/suppliers' }] }
    const exactSupplier = (supplier) => intent.supplierId != null
      ? String(supplier.supplier_id) === String(intent.supplierId)
      : normalizedName(supplier.company_name || '') === normalizedName(intent.name || '')
    const needsSupplierChoice = intent.supplierId == null && Boolean(intent.name)
      && (data.length > 1 || !exactSupplier(data[0]))
    if (needsSupplierChoice) {
      const candidates = data.map((supplier) => ({ supplierId: supplier.supplier_id, name: supplier.company_name }))
      return {
        title: data.length === 1 ? 'Confirm the supplier match' : 'Choose the matching supplier',
        text: data.length === 1
          ? `I found one close match, “${data[0].company_name}”. Confirm it before I use its balance or history.`
          : `I found ${data.length} possible suppliers for “${intent.name}”. Choose the exact supplier before I use its balance or history.`,
        rows: data.map((supplier) => ({ id: supplier.supplier_id, supplierId: supplier.supplier_id, supplierName: supplier.company_name, path: '/suppliers', title: supplier.company_name, detail: [supplier.contact_person, supplier.phone].filter(Boolean).join(' · ') || 'Supplier record', value: null })),
        choices: candidates.slice(0, 5).map((supplier, index) => ({ label: supplier.name, answer: ['first', 'second', 'third', 'fourth', 'fifth'][index] })),
        pendingClarification: { kind: 'supplier_lookup', slot: 'supplierChoice', intent, candidates },
        suppressSuggestions: true,
      }
    }
    const ids = data.map((supplier) => supplier.supplier_id).filter(Boolean)
    const { data: balances, error: balanceError } = ids.length
      ? await database.from('supplier_balances').select('supplier_id, total_purchased, total_paid, total_due, credit, purchase_count, last_purchase').in('supplier_id', ids)
      : { data: [], error: null }
    if (balanceError) throw balanceError
    const balanceById = Object.fromEntries((balances || []).map((balance) => [balance.supplier_id, balance]))
    if (intent.requestedFact === 'purchase_history' && data.length === 1) {
      const supplier = data[0]
      const { data: purchases, count: purchaseCount, error: purchaseError } = await database.from('supplier_transactions')
        .select('transaction_id, product_id, quantity, unit_cost, total_cost, amount_paid, received_at, transaction_date, created_at, notes, voided_at, products(item_name)', { count: 'exact' })
        .eq('supplier_id', supplier.supplier_id).eq('transaction_type', 'purchase')
        .order('received_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(10)
      if (purchaseError) throw purchaseError
      const balance = balanceById[supplier.supplier_id]
      const purchasesFound = purchases || []
      return {
        title: `${supplier.company_name} · purchase history`,
        text: purchasesFound.length
          ? `Showing ${purchasesFound.length}${purchaseCount > purchasesFound.length ? ` of ${purchaseCount}` : ''} recorded purchases, newest first. Current balance: ${balance ? `${money(balance.total_due)} due` : 'not available'}. Voided entries are marked.`
          : `No purchase entries are recorded for ${supplier.company_name}.${balance ? ` Current balance: ${money(balance.total_due)} due.` : ''}`,
        rows: purchasesFound.map((purchase) => ({
          id: purchase.transaction_id,
          path: '/suppliers',
          title: purchase.products?.item_name || `Product #${purchase.product_id}`,
          detail: `${purchase.quantity} × ${money(purchase.unit_cost)} · ${purchase.received_at || purchase.transaction_date || purchase.created_at ? formatDate(purchase.received_at || purchase.transaction_date || purchase.created_at) : 'Date unavailable'}${purchase.voided_at ? ' · Voided' : ''}${purchase.notes ? ` · ${purchase.notes}` : ''}`,
          value: `${money(purchase.total_cost)} total · ${money(purchase.amount_paid)} paid`,
        })),
        actions: [{ label: 'Open supplier history', path: '/suppliers' }],
      }
    }
    if (intent.requestedFact === 'payment_history' && data.length === 1) {
      const supplier = data[0]
      const { data: payments, count: paymentCount, error: paymentError } = await database.from('supplier_payments')
        .select('*', { count: 'exact' })
        .eq('supplier_id', supplier.supplier_id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(10)
      if (paymentError) throw paymentError
      const balance = balanceById[supplier.supplier_id]
      const paymentRows = payments || []
      return {
        title: `${supplier.company_name} · payment history`,
        text: paymentRows.length
          ? `Showing ${paymentRows.length}${paymentCount > paymentRows.length ? ` of ${paymentCount}` : ''} separately recorded supplier payments, newest first. Purchase receipts with amounts paid at delivery are listed in purchase history. Current balance: ${balance ? `${money(balance.total_due)} due` : 'not available'}.`
          : `No separate supplier payments are recorded for ${supplier.company_name}.${balance ? ` Current balance: ${money(balance.total_due)} due.` : ''} Amounts paid when stock was received appear in purchase history.`,
        rows: paymentRows.map((payment) => ({
          id: payment.payment_id,
          path: '/suppliers',
          title: `${money(payment.amount)} paid${payment.payment_method || payment.method ? ` · ${payment.payment_method || payment.method}` : ''}`,
          detail: `${payment.paid_at || payment.created_at ? formatDate(payment.paid_at || payment.created_at) : 'Date unavailable'}${payment.paid_by ? ` · by ${payment.paid_by}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`,
          value: null,
        })),
        actions: [{ label: 'Open supplier history', path: '/suppliers' }],
      }
    }
    return {
      title: `${count ?? data.length} supplier${(count ?? data.length) === 1 ? '' : 's'} found`,
      text: 'Supplier details and balances are live from Blossom.',
      rows: data.map((supplier) => {
        const balance = balanceById[supplier.supplier_id]
        return { id: supplier.supplier_id, path: '/suppliers', title: supplier.company_name, detail: [supplier.contact_person, supplier.phone, supplier.email, supplier.supplier_status].filter(Boolean).join(' · '), value: balance ? `${money(balance.total_due)} due` : null }
      }),
      actions: [{ label: 'Open suppliers', path: '/suppliers' }],
    }
  }

  if (intent.type === 'cash_register') {
    const targetDate = intent.targetDate || intent.period?.startDate || addCalendarDays(today, intent.offset || 0)
    const period = intent.period?.startDate && intent.period?.endDate ? intent.period : null
    const isSingleDay = !period || period.endDate === addCalendarDays(period.startDate, 1)
    const [transactions, summaryResult] = await Promise.all([
      fetchAllRows((from, to) => {
        let query = database.from('cash_register').select('id, amount, description, category, payment_method, transaction_type, created_at, order_id, register_date')
        if (period) query = query.gte('register_date', period.startDate).lt('register_date', period.endDate)
        else query = query.eq('register_date', targetDate)
        return query.order('register_date').order('created_at', { ascending: true }).range(from, to)
      }, 500),
      isSingleDay ? database.from('daily_cash_summary').select('is_closed, opening_balance, closing_balance').eq('register_date', targetDate).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    if (summaryResult.error) throw summaryResult.error
    const cashIn = transactions.filter((row) => row.transaction_type === 'cash_in').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const cashOut = transactions.filter((row) => row.transaction_type === 'cash_out').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const summary = summaryResult.data
    const periodLabel = period?.label || targetDate
    const groupedByDate = Object.values(transactions.reduce((groups, row) => {
      const date = row.register_date || row.created_at?.slice(0, 10) || 'Unknown date'
      const group = groups[date] || { date, cashIn: 0, cashOut: 0, count: 0 }
      group.count += 1
      group[row.transaction_type === 'cash_out' ? 'cashOut' : 'cashIn'] += Number(row.amount || 0)
      groups[date] = group
      return groups
    }, {}))
    return {
      title: `Cash register · ${periodLabel}`,
      text: `${transactions.length} entries · ${money(cashIn)} cash in · ${money(cashOut)} cash out${summary ? ` · opening ${money(summary.opening_balance)} · ${summary.is_closed ? `closed at ${money(summary.closing_balance)}` : 'still open'}` : isSingleDay ? ' · no daily opening/closing summary found' : ` · totals cover ${groupedByDate.length} days`}.`,
      rows: intent.detail
        ? transactions.slice(-8).reverse().map((row) => ({ id: row.id, title: `${row.transaction_type === 'cash_out' ? 'Cash out' : 'Cash in'} · ${money(row.amount)}`, detail: [row.register_date, row.description, row.category, row.payment_method, new Date(row.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '), value: row.order_id ? 'Linked order' : null }))
        : period ? groupedByDate.slice(-8).reverse().map((day) => ({ id: day.date, title: day.date, detail: `${day.count} entries`, value: `${money(day.cashIn)} in · ${money(day.cashOut)} out` })) : [],
      actions: [{ label: 'Open cash register', path: '/coffre-forte' }],
    }
  }

  if (intent.type === 'order_clarification') {
    return {
      title: 'Which order detail do you need?',
      text: 'I don’t want to guess. Ask by customer name or order number, then say what you need—for example, “What items are in Djabali Wasila’s order?”, “What’s the status of order 673?”, or “Show orders due tomorrow.”',
      pendingClarification: { kind: 'order_lookup', slot: 'orderTarget', intent },
      suppressSuggestions: true,
    }
  }

  if (intent.type === 'orders_created_by') {
    const { data: orders, error } = await database.from('orders')
      .select('id, order_number, client_name, created_at, created_by, cashier_id, total_amount')
      .or('order_type.is.null,order_type.neq.quick_sale')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(intent.limit || 3)
    if (error) throw error
    if (!orders?.length) return { title: 'No orders found', text: 'There are no regular orders to check yet.', suppressSuggestions: true }

    const creatorIds = [...new Set(orders.map((order) => order.created_by || order.cashier_id).filter(Boolean))]
    let profileById = {}
    if (creatorIds.length) {
      const { data: profiles, error: profilesError } = await database.from('profiles')
        .select('id, full_name, username')
        .in('id', creatorIds)
      if (profilesError) throw profilesError
      profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]))
    }
    const rows = orders.map((order) => {
      const creatorId = order.created_by || order.cashier_id
      const creator = creatorId ? profileById[creatorId] : null
      const creatorName = creator?.full_name || creator?.username || (creatorId ? 'Staff profile unavailable' : 'Creator not recorded')
      return {
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.client_name || null,
        path: `/orders/${order.id}`,
        title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`,
        detail: `Created by ${creatorName} · ${formatDateTime(order.created_at)}`,
        value: money(order.total_amount),
      }
    })
    const hasRecordedCreators = rows.some((row) => !row.detail.includes('Creator not recorded'))
    const allCreatorsMatched = rows.every((row) => !row.detail.includes('Creator not recorded') && !row.detail.includes('Staff profile unavailable'))
    return {
      title: `Creators of the ${orders.length} latest order${orders.length === 1 ? '' : 's'}`,
      text: allCreatorsMatched
        ? 'Newest first. I matched each order’s creator to the Blossom staff profile.'
        : hasRecordedCreators
          ? 'Newest first. Some orders have a creator recorded, but I couldn’t match every creator to a staff profile.'
          : 'These orders were found, but Blossom has no creator recorded for them.',
      rows,
      actions: [{ label: 'Open orders', path: '/orders' }],
    }
  }

  if (intent.type === 'order_create') {
    return canAccessRoute(role, '/orders')
      ? { title: 'Let’s build the order', text: 'I filled any details I could read from your message. Check them, add missing products or delivery info, and review before creating it.', orderForm: { mode: 'create', role, initialPrompt: intent.prompt } }
      : { title: 'You can’t create orders', text: 'Your Blossom role does not have access to order creation. Ask an owner to review your access.' }
  }

  if (intent.type === 'order_delay') {
    if (!orderActionsFor(role).edit) return { title: 'You can’t reschedule orders', text: 'Your Blossom role cannot change delivery dates. Ask an owner or manager to review your access.' }
    if (!intent.orderNumber) return { title: 'Which order should I reschedule?', text: 'Give me the order number, then I’ll prepare the date change for you.', pendingClarification: { kind: 'order_delay', slot: 'orderNumber', intent } }
    const { data: order, error } = await database.from('orders')
      .select('id, order_number, client_name, delivery_date, status')
      .eq('order_number', intent.orderNumber).maybeSingle()
    if (error) throw error
    if (!order) return { title: `Order #${intent.orderNumber} wasn’t found`, text: 'Check the number and try again.' }
    if (order.status === 'cancelled') return { title: `Order #${order.order_number} is cancelled`, text: 'Cancelled orders can’t be rescheduled.' }
    const requestedFrom = order.delivery_date || today
    const earliestDate = addCalendarDays(requestedFrom, 1) < today ? today : addCalendarDays(requestedFrom, 1)
    if (!intent.deliveryDate) return {
      title: `Choose a new date for order #${order.order_number}`,
      text: 'What date should I move the delivery to? You can say “tomorrow” or give a specific date.',
      pendingClarification: { kind: 'order_delay', slot: 'deliveryDate', intent: { ...intent, orderNumber: String(order.order_number), orderId: order.id, customerName: order.client_name } },
      followupContext: { type: 'order_delay', orderId: order.id, orderNumber: order.order_number, customerName: order.client_name, deliveryDate: intent.deliveryDate || null, reason: intent.reason || '', prompt: intent.prompt },
    }
    if (intent.deliveryDate < earliestDate) return { title: 'Choose a later delivery date', text: `Order #${order.order_number} can be moved to ${earliestDate} or later.` }
    return {
      title: `Review new delivery date · Order #${order.order_number}`,
      text: `I’ll move ${order.client_name || 'this order'} from ${order.delivery_date || 'an unscheduled date'} to ${intent.deliveryDate}. Review and save below; the order status and payment stay unchanged.`,
      delayOrder: { ...order, requestedDeliveryDate: intent.deliveryDate, reason: intent.reason || '' },
      followupContext: { type: 'order_delay', orderId: order.id, orderNumber: order.order_number, customerName: order.client_name, deliveryDate: intent.deliveryDate, reason: intent.reason || '', prompt: intent.prompt },
      suppressSuggestions: true,
    }
  }
  if (intent.type === 'order_edit') {
    const selectedOrderNumber = intent.orderNumber || (intent.resultIndex !== undefined ? lastAnswer?.rows?.[intent.resultIndex]?.orderNumber : null)
    if (!selectedOrderNumber) return { title: 'Which order should I edit?', text: 'Tell me its order number, for example: “Edit order 123”, or show me the orders for a day or week and ask me to edit one.', pendingClarification: { kind: 'order_edit', slot: 'orderNumber', intent } }
    const { data: order, error } = await database.from('orders')
      .select('id, order_number, client_name, client_phone, customer_id, delivery_date, delivery_time, delivery_method, payment_method, payment_status, amount_paid, amount_due, total_amount, price_adjustment, notes, status, order_items(id, product_id, quantity, unit_price, product_name, products(item_name))')
      .eq('order_number', selectedOrderNumber).maybeSingle()
    if (error) throw error
    if (!order) return { title: `Order #${intent.orderNumber} wasn’t found`, text: 'Check the number and try again.' }
    if (order.status === 'cancelled') return { title: `Order #${order.order_number} is cancelled`, text: 'Cancelled orders can’t be edited. Create a new order if the customer still needs one.' }
    if (!orderActionsFor(role).edit) return { title: 'You can’t edit orders', text: 'Your Blossom role can view orders but cannot change them. Ask an owner or manager to review your access.' }
    return { title: `Edit order #${order.order_number}`, text: 'I prefilled any requested changes I could identify. Check the customer, delivery, notes, status, price adjustment, and products, then review before saving.', orderForm: { mode: 'edit', order, role, initialPrompt: intent.prompt } }
  }

  if (intent.type === 'order_payment') {
    if (!intent.orderNumber) return { title: 'Which order is this for?', text: 'Give me the order number, for example “Record a 2,000 DA payment for order 123”.', pendingClarification: { kind: 'order_payment', slot: 'orderNumber', intent } }
    const permitted = intent.action === 'refund' ? orderActionsFor(role).refund : orderActionsFor(role).payment
    if (!permitted) return { title: intent.action === 'refund' ? 'Refund access is restricted' : 'Payment access is restricted', text: intent.action === 'refund' ? 'Only an owner or manager can record refunds.' : 'Your Blossom role cannot record order payments.' }
    const { data: order, error } = await database.from('orders')
      .select('id, order_number, client_name, total_amount, amount_paid, amount_due, payment_status, payment_method, status')
      .eq('order_number', intent.orderNumber).maybeSingle()
    if (error) throw error
    if (!order) return { title: `Order #${intent.orderNumber} wasn’t found`, text: 'Check the number and try again.' }
    if (order.status === 'cancelled' && intent.action === 'payment') return { title: `Order #${order.order_number} is cancelled`, text: 'A payment cannot be added to a cancelled order.' }
    const due = Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0))
    const max = intent.action === 'refund' ? Number(order.amount_paid || 0) : due
    if (max <= 0) return { title: intent.action === 'refund' ? 'Nothing has been paid yet' : 'This order is already paid', text: `Order #${order.order_number} has no ${intent.action === 'refund' ? 'paid amount to refund' : 'remaining balance'}.` }
    return {
      title: `${intent.action === 'refund' ? 'Review refund' : 'Record payment'} · Order #${order.order_number}`,
      text: 'Confirm the amount and payment method. The order and cash register will update together only after you confirm.',
      paymentAction: { order, role, action: intent.action, amount: intent.full ? (intent.action === 'refund' ? '' : due) : (intent.amount ?? ''), method: intent.method },
      suppressSuggestions: true,
    }
  }

  if (intent.type === 'order_cancel') {
    if (!intent.orderNumber) return { title: 'Which order should I cancel?', text: 'Send the order number. I’ll show you the order and ask you to confirm before cancelling it.', pendingClarification: { kind: 'order_cancel', slot: 'orderNumber', intent } }
    if (!['owner', 'manager'].includes(role)) return { title: 'Cancellation access is restricted', text: 'Only an owner or manager can cancel an order.' }
    const { data: order, error } = await database.from('orders')
      .select('id, order_number, client_name, total_amount, status, payment_status')
      .eq('order_number', intent.orderNumber).maybeSingle()
    if (error) throw error
    if (!order) return { title: `Order #${intent.orderNumber} wasn’t found`, text: 'Check the number and try again.' }
    return { title: `Review cancellation · Order #${order.order_number}`, text: 'This keeps an audit record. Check the order details and add a reason before confirming.', cancelOrder: order, suppressSuggestions: true }
  }

  if (intent.type === 'order_delete_forbidden') {
    return { title: 'Permanent deletion is locked', text: 'To permanently delete an order, type exactly: pepepeace #<order-number> (for example, pepepeace #123). I will still ask you to confirm before deletion.' }
  }

  if (intent.type === 'order_delete') {
    if (!orderActionsFor(role).delete) return { title: 'You can’t delete orders', text: 'Only an owner can permanently delete an order. Ask the owner if this record needs to be removed.' }
    if (!intent.orderNumber || String(intent.deleteCommand || '').toLowerCase() !== `pepepeace #${intent.orderNumber}`.toLowerCase()) {
      return { title: 'Permanent deletion is locked', text: 'Type exactly: pepepeace #<order-number> (for example, pepepeace #123). I will still ask you to confirm before deletion.' }
    }
    const { data: order, error } = await database.from('orders')
      .select('id, order_number, client_name, total_amount, status')
      .eq('order_number', intent.orderNumber).maybeSingle()
    if (error) throw error
    if (!order) return { title: `Order #${intent.orderNumber} wasn’t found`, text: 'Check the number and try again.' }
    const expectedCommand = `pepepeace #${order.order_number}`
    if (intent.deleteCommand.toLowerCase() !== expectedCommand.toLowerCase()) {
      return { title: 'Command does not match', text: `Use exactly: ${expectedCommand}` }
    }
    return { title: `Permanently delete order #${order.order_number}?`, text: 'This command is accepted. Review the order and confirm below to continue.', deleteOrder: { ...order, deleteCommand: expectedCommand } }
  }

  if (intent.type === 'select_result') {
    const row = lastAnswer?.rows?.[intent.index]
    return row?.path && canAccessRoute(role, row.path.split('?')[0])
      ? { title: `Opening ${row.title}`, text: 'Here’s the result you selected.', actions: [{ label: 'Open result', path: row.path }] }
      : { title: 'Which result did you mean?', text: 'Ask me to show the list again, then choose one of the results.' }
  }

  if (intent.type === 'overview') {
    const [todayResult, lateResult, stockRows, unpaidRows, cashRows, registerResult] = await Promise.all([
      regularOrders(database.from('orders').select(fieldList, { count: 'exact' })
        .eq('delivery_date', today).in('status', ACTIVE_STATUSES))
        .order('delivery_time', { ascending: true, nullsFirst: false }).limit(5),
      regularOrders(database.from('orders').select('id', { count: 'exact', head: true })
        .lt('delivery_date', today).in('status', ACTIVE_STATUSES)),
      canAccessRoute(role, '/products')
        ? fetchAllRows((from, to) => database.from('products').select('product_id, item_name, stock_level, low_stock_threshold')
          .eq('is_active', true).order('stock_level', { ascending: true }).range(from, to))
        : Promise.resolve([]),
      canSeeFinancials
        ? fetchAllRows((from, to) => database.from('orders').select('amount_due').neq('status', 'cancelled').gt('amount_due', 0).range(from, to))
        : Promise.resolve([]),
      role === 'owner'
        ? fetchAllRows((from, to) => database.from('cash_register').select('transaction_type, amount').eq('register_date', today).range(from, to))
        : Promise.resolve([]),
      role === 'owner'
        ? database.from('daily_cash_summary').select('is_closed, opening_balance, closing_balance').eq('register_date', today).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    const firstError = [todayResult, lateResult, registerResult].find((result) => result.error)?.error
    if (firstError) throw firstError

    const stockAlerts = stockRows.filter((item) => Number(item.stock_level || 0) <= Number(item.low_stock_threshold ?? 10))
    const dueCount = todayResult.count ?? todayResult.data?.length ?? 0
    const overdueCount = lateResult.count ?? 0
    const canSeeStock = canAccessRoute(role, '/products')
    const parts = [`${dueCount} order${dueCount === 1 ? '' : 's'} due today`, `${overdueCount} overdue`]
    if (canSeeStock) parts.push(`${stockAlerts.length} stock alert${stockAlerts.length === 1 ? '' : 's'}`)
    const outstanding = canSeeFinancials
      ? unpaidRows.reduce((sum, row) => sum + Number(row.amount_due || 0), 0)
      : 0
    if (canSeeFinancials) {
      parts.push(`${money(outstanding)} outstanding`)
    }
    if (role === 'owner') {
      const transactions = cashRows
      const cashIn = transactions.filter((row) => row.transaction_type === 'cash_in').reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const cashOut = transactions.filter((row) => row.transaction_type === 'cash_out').reduce((sum, row) => sum + Number(row.amount || 0), 0)
      parts.push(`${money(cashIn)} cash in`, `${money(cashOut)} cash out`)
      if (registerResult.data) parts.push(`register ${registerResult.data.is_closed ? 'closed' : 'open'}`)
    }
    const registerOpen = role === 'owner' && registerResult.data && !registerResult.data.is_closed
    const attention = dueCount > 0 || overdueCount > 0 || (canSeeStock && stockAlerts.length > 0) || outstanding > 0 || registerOpen
    return {
      title: attention ? 'Your Blossom business pulse' : 'Your Blossom business pulse is clear',
      text: `${parts.join(' · ')}. ${registerOpen ? 'The cash register is still open.' : attention ? 'There is work to review today; use the shortcuts below to act.' : canSeeStock ? 'No orders, overdue work, or stock alerts need attention today.' : 'No order or overdue-work alerts need attention in the areas I can access today.'}${dueCount > 4 ? ` Showing 4 of ${dueCount} orders due today.` : ''}`,
      rows: (todayResult.data || []).slice(0, 4).map((order) => ({ id: order.id, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${prettyTime(order.delivery_time)} · ${order.delivery_method || 'Pickup'} · ${order.status}`, value: money(order.total_amount) })),
      actions: [
        { label: 'Open orders', path: '/orders' },
        { label: 'Review stock', path: '/products' },
        ...(role === 'owner' ? [{ label: 'Open cash register', path: '/coffre-forte' }] : []),
      ].filter((action) => canAccessRoute(role, action.path)),
    }
  }

  if (intent.type === 'capabilities') {
    const modules = [
      ['Orders & customers', '/orders'], ['Products & stock', '/products'],
      ['Deliveries', '/delivery'], ['Quick sale', '/cart?mode=quick_sale'],
      ['Suppliers', '/suppliers'], ['Reports', '/reports'],
      ['Team', '/team'], ['Cash register', '/coffre-forte'], ['Settings', '/settings'],
    ]
    return {
      title: 'I can help across Blossom',
      text: `Ask in your own words. I can look up live orders and customer order history, products, stock and prices; find delivery schedules by date or period; and summarize report revenue for a period. I can create or edit orders with a review before saving${canAccessRoute(role, '/suppliers') ? ', look up suppliers, balances, purchase history, and separate supplier payments' : ''}${role === 'owner' ? ', and summarize cash register entries by day or period' : ''}. Payment and cancellation actions follow your Blossom role; permanent deletion is owner-only. For workflows I cannot safely complete here, I’ll guide you to the right place in Blossom.`,
      actions: modules.filter(([, path]) => canAccessRoute(role, path)).map(([label, path]) => ({ label, path })),
    }
  }

  if (intent.type === 'customer_lookup') {
    const isPhone = /\d/.test(intent.name) && !/[a-z]/i.test(intent.name)
    const searchTerm = isPhone ? intent.name.replace(/\D/g, '') : intent.name
    let customerQuery = database.from('customers')
      .select('customer_id, full_name, phone, email, total_orders, total_spent, last_order_date', { count: 'exact' })
    customerQuery = intent.customerId != null
      ? customerQuery.eq('customer_id', intent.customerId)
      : customerQuery.ilike(isPhone ? 'phone' : 'full_name', `%${searchTerm}%`)
    const { data, count, error } = await customerQuery.order('last_order_date', { ascending: false, nullsFirst: false }).limit(5)
    if (error) throw error
    const customers = data || []
    const exactMatch = (customer) => intent.customerId != null
      ? String(customer.customer_id) === String(intent.customerId)
      : isPhone
        ? String(customer.phone || '').replace(/\D/g, '') === searchTerm
        : normalizedName(customer.full_name || '') === normalizedName(intent.name || '')
    if (customers.length === 1 && exactMatch(customers[0]) && intent.requestedFact && intent.requestedFact !== 'order_history') {
      const customer = customers[0]
      const values = {
        phone: customer.phone || 'No phone number is saved',
        email: customer.email || 'No email address is saved',
        last_order: customer.last_order_date || 'No last-order date is recorded',
        total_spent: customer.total_spent == null ? 'Total spend is not available' : money(customer.total_spent),
      }
      const fact = values[intent.requestedFact]
      if (fact) return { title: customer.full_name, text: fact, actions: [{ label: 'Open customer profile', path: '/customers' }], followupContext: { type: 'customer_lookup', name: customer.full_name, customerId: customer.customer_id } }
    }
    if (customers.length === 1 && exactMatch(customers[0]) && intent.requestedFact === 'order_history') {
      const customer = customers[0]
      const select = 'id, order_number, client_name, total_amount, amount_paid, amount_due, payment_status, status, delivery_date, created_at, order_items(quantity, product_name, unit_price)'
      let { data: customerOrders, count: orderCount, error: orderError } = await regularOrders(database.from('orders').select(select, { count: 'exact' }))
        .eq('customer_id', customer.customer_id).order('created_at', { ascending: false }).limit(10)
      if (orderError) throw orderError
      // Older orders can be missing customer_id; fall back to an exact name match only when the linked history is empty.
      if (!customerOrders?.length) {
        const legacy = await regularOrders(database.from('orders').select(select, { count: 'exact' }))
          .ilike('client_name', customer.full_name).order('created_at', { ascending: false }).limit(10)
        if (legacy.error) throw legacy.error
        customerOrders = legacy.data || []
        orderCount = legacy.count
      }
      const history = customerOrders || []
      return {
        title: `${customer.full_name} · order history`,
        text: history.length ? `Showing ${history.length}${orderCount > history.length ? ` of ${orderCount}` : ''} orders, newest first.` : `No orders are linked to ${customer.full_name} yet.`,
        rows: history.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          customerName: customer.full_name,
          path: `/orders/${order.id}`,
          title: `#${order.order_number} · ${order.status}`,
          detail: `${order.delivery_date || 'No delivery date'} · ${(order.order_items || []).map((item) => `${item.quantity} × ${item.product_name || 'Product'}`).join(', ') || 'No items recorded'} · ${order.payment_status || 'Unknown payment status'}`,
          value: `${money(order.total_amount)} · ${money(order.amount_due)} due`,
        })),
        actions: [{ label: 'Open customers', path: '/customers' }],
        followupContext: { type: 'customer_lookup', name: customer.full_name, customerId: customer.customer_id, requestedFact: 'order_history' },
      }
    }
    if (!customers.length && intent.requestedFact === 'order_history') {
      const { data: history, count: historyCount, error: historyError } = await regularOrders(database.from('orders')
        .select('id, order_number, client_name, total_amount, amount_due, payment_status, status, delivery_date, created_at, order_items(quantity, product_name)', { count: 'exact' }))
        .ilike('client_name', intent.name).order('created_at', { ascending: false }).limit(10)
      if (historyError) throw historyError
      return history?.length ? {
        title: `${intent.name} · order history`,
        text: `No customer profile matched, but I found ${historyCount ?? history.length} order${historyCount === 1 ? '' : 's'} under this exact name. Showing ${history.length}, newest first.`,
        rows: history.map((order) => ({ id: order.id, orderNumber: order.order_number, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.status}`, detail: `${order.delivery_date || 'No delivery date'} · ${(order.order_items || []).map((item) => `${item.quantity} × ${item.product_name || 'Product'}`).join(', ') || 'No items recorded'} · ${order.payment_status || 'Unknown payment status'}`, value: `${money(order.total_amount)} · ${money(order.amount_due)} due` })),
        actions: [{ label: 'Open orders', path: '/orders' }],
      } : { title: `No order history found for “${intent.name}”`, text: 'I checked both customer profiles and exact-name order records. Try a shorter name or search by phone.', actions: [{ label: 'Open customers', path: '/customers' }] }
    }
    const needsCustomerChoice = customers.length > 1 || (customers.length === 1 && !exactMatch(customers[0]))
    const customerChoices = customers.map((customer, index) => ({
      label: `${customer.full_name}${customer.phone ? ` · ${customer.phone}` : ''}`,
      answer: ['first', 'second', 'third', 'fourth', 'fifth'][index],
    }))
    return customers.length ? {
      title: needsCustomerChoice ? 'Choose the matching customer' : `Customer: ${customers[0].full_name}`,
      text: needsCustomerChoice
        ? customers.length === 1 ? `I found one close match for “${intent.name}”. Confirm it before I use this customer’s details.` : `I found ${customers.length} possible matches for “${intent.name}”. Choose the exact customer before I use their details.`
        : `Showing the exact customer record. Open Customers to review the full history or search by phone.`,
      rows: customers.map((customer) => ({ id: customer.customer_id, customerId: customer.customer_id, path: '/customers', title: customer.full_name, customerName: customer.full_name, detail: [customer.phone, customer.total_orders != null ? `${customer.total_orders} orders` : null, customer.last_order_date ? `Last order ${customer.last_order_date}` : null].filter(Boolean).join(' · '), value: customer.total_spent != null ? money(customer.total_spent) : null })),
      ...(needsCustomerChoice ? {
        choices: customerChoices,
        pendingClarification: { kind: 'customer_lookup', slot: 'customerChoice', intent, candidates: customers.map((customer) => ({ customerId: customer.customer_id, name: customer.full_name })) },
        suppressSuggestions: true,
      } : {}),
      actions: [{ label: 'Open customers', path: '/customers' }],
      ...(!needsCustomerChoice && customers.length === 1 ? { followupContext: { type: 'customer_lookup', name: customers[0].full_name, customerId: customers[0].customer_id } } : {}),
    } : { title: `No customer found for “${intent.name}”`, text: 'Try a shorter part of their name, or search by phone on the Customers page.', actions: [{ label: 'Open customers', path: '/customers' }] }
  }

  if (intent.type === 'stock_waste') {
    if (intent.detailRequested) return {
      title: 'That waste breakdown is not available yet',
      text: 'The connected waste report only stores monthly totals for all flowers: quantity, estimated cost, entry count, and product count. It does not expose enough source detail to give a reliable product-specific or daily breakdown. I can show the monthly total instead.',
      actions: [
        { label: 'Show monthly waste total', prompt: 'How much flower waste was recorded this month?' },
        { label: 'Open reports', path: '/reports' },
      ],
    }
    const period = intent.period || reportPeriodFromText('this month')
    const monthStart = `${period.startDate.slice(0, 7)}-01`
    const nextMonthDate = new Date(`${monthStart}T00:00:00Z`)
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1)
    const { data, error } = await database.from('monthly_flower_waste')
      .select('month, total_quantity, total_cost, entry_count, product_count')
      .gte('month', monthStart).lt('month', nextMonthDate.toISOString().slice(0, 10)).order('month', { ascending: true })
    if (error) throw error
    const rows = data || []
    const quantity = rows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0)
    const cost = rows.reduce((sum, row) => sum + Number(row.total_cost || 0), 0)
    const entries = rows.reduce((sum, row) => sum + Number(row.entry_count || 0), 0)
    const products = rows.reduce((sum, row) => sum + Number(row.product_count || 0), 0)
    const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' })
    const isMonthlyPeriod = /month/i.test(period.label)
    return {
      title: `Flower waste · ${monthLabel}`,
      text: rows.length
        ? `${quantity.toLocaleString('fr-FR')} units recorded as waste across ${entries} entries and ${products} products; estimated cost ${money(cost)}. This is an all-flower monthly aggregate, not a per-product breakdown.${isMonthlyPeriod ? '' : ` Blossom stores this report monthly, so an exact ${period.label} total is not available; this is the full-month summary for ${monthLabel}.`}`
        : `No flower-waste entries are recorded for ${monthLabel}.${isMonthlyPeriod ? '' : ` Blossom stores waste totals monthly, so a more precise ${period.label} figure is not available.`}`,
      rows: rows.map((row) => ({ id: row.month, title: monthLabel, detail: `${Number(row.entry_count || 0)} entries · ${Number(row.product_count || 0)} products`, value: `${Number(row.total_quantity || 0).toLocaleString('fr-FR')} units · ${money(row.total_cost)}` })),
      actions: [{ label: 'Open reports', path: '/reports' }],
    }
  }

  if (intent.type === 'product_stock' || intent.type === 'product_price') {
    if (!canAccessRoute(role, '/products')) return { title: 'Product information is restricted', text: 'Your Blossom role cannot access the product catalog. Ask an owner or manager to review your access.' }
    if (intent.stockValueMode === 'purchase_cost_unavailable') return {
      title: 'Purchase-cost valuation is not available',
      text: 'Blossom stores current stock quantities and listed retail prices, but the product catalog does not expose purchase cost. I can calculate the inventory’s listed retail value instead.',
      actions: [{ label: 'Open products', path: '/products' }],
    }
    let data
    if (intent.planMode) {
      const { data: catalog, count, error } = await database.from('products')
        .select('product_id, item_name, stock_level, low_stock_threshold, product_status, color, flower_type, category, retail_price', { count: 'exact' })
        .eq('is_active', true).order('item_name').range(0, 199)
      if (error) throw error
      if ((count ?? 0) > 200) return { title: 'Catalog is too large to combine safely', text: 'I found more than 200 active products. Ask the stock or price question separately so I can search the full catalog.' }
      data = catalog || []
    } else {
      data = await fetchAllRows((from, to) => database.from('products')
        .select('product_id, item_name, stock_level, low_stock_threshold, product_status, color, flower_type, category, retail_price')
        .eq('is_active', true).order('item_name').range(from, to))
    }
    const tokens = productSearchTerms(intent.search)
    const matches = (data || []).filter((product) => {
      const matchesScope = intent.scope === 'all' || intent.scope !== 'flowers'
        || Boolean(product.flower_type) || /\b(flower|floral|stem|rose|tulip|carnation|lily|orchid|chrysanthemum|bouquet|plant)\b/.test(normalize(`${product.item_name || ''} ${product.category || ''}`))
      const level = Number(product.stock_level || 0)
      const lowThreshold = Number(product.low_stock_threshold ?? 10)
      const matchesAvailability = intent.availability === 'out' ? level <= 0
        : intent.availability === 'low' ? level > 0 && level <= lowThreshold
          : intent.availability === 'medium' ? level >= 10 && level < 30
            : intent.availability === 'healthy' ? level >= 30 : true
      return matchesScope && matchesAvailability && (!tokens.length || productMatchesTerms(product, tokens))
    })
    if (intent.type === 'product_price') {
      return matches.length ? {
        title: `Price for ${intent.search}`,
        text: `Showing up to 7 of ${matches.length} matching product${matches.length === 1 ? '' : 's'} and their current listed retail prices.`,
        rows: matches.slice(0, 7).map((product) => ({ id: product.product_id, path: '/products', title: product.item_name, detail: [product.color, product.flower_type, product.category].filter(Boolean).join(' · ') || 'Product', value: product.retail_price != null ? money(product.retail_price) : 'No price set' })),
        actions: [{ label: 'Open products', path: '/products' }],
      } : { title: `I couldn’t find ${intent.search}`, text: 'Try a shorter product name or color, or open Products to search the full catalog.', actions: [{ label: 'Open products', path: '/products' }] }
    }
    if (intent.stockValueMode === 'retail_value') {
      const retailValue = matches.reduce((sum, product) => sum + Math.max(0, Number(product.stock_level || 0)) * Math.max(0, Number(product.retail_price || 0)), 0)
      return {
        title: `Listed retail value · ${money(retailValue)}`,
        text: `Calculated from current on-hand quantity × listed retail price${intent.search ? ` for ${matches.length} matching catalog items` : ` across ${matches.length} active catalog items`}. This is not purchase cost or profit.${matches.length > 7 ? ' Showing the first 7 line values.' : ''}`,
        rows: matches.slice(0, 7).map((product) => ({ id: product.product_id, path: '/products', title: product.item_name, detail: `${Number(product.stock_level || 0)} × ${money(product.retail_price)}`, value: money(Math.max(0, Number(product.stock_level || 0)) * Math.max(0, Number(product.retail_price || 0))) })),
        actions: [{ label: 'Open products', path: '/products' }],
      }
    }
    const units = matches.reduce((sum, product) => sum + Math.max(0, Number(product.stock_level || 0)), 0)
    const inStock = matches.filter((product) => Number(product.stock_level || 0) > 0)
    const negativeStock = matches.filter((product) => Number(product.stock_level || 0) < 0)
    const outOfStockCount = (data || []).filter((product) => Number(product.stock_level || 0) <= 0).length
    const lowStockCount = (data || []).filter((product) => Number(product.stock_level || 0) > 0 && Number(product.stock_level || 0) < 10).length
    const mediumStockCount = (data || []).filter((product) => Number(product.stock_level || 0) >= 10 && Number(product.stock_level || 0) < 30).length
    const healthyStockCount = (data || []).filter((product) => Number(product.stock_level || 0) >= 30).length
    const specificFlower = /\b(rose|tulip|bouquet|carnation|lily|orchid|chrysanthemum|plant)\b/.test(intent.search || '')
    const label = intent.search ? (intent.scope === 'flowers' && !specificFlower ? `${intent.search} flowers` : intent.search) : intent.scope === 'flowers' ? 'flowers' : 'products'
    const availabilityTitle = intent.availability === 'out' ? `Out of stock: ${label}`
      : intent.availability === 'low' ? `Low stock: ${label}`
        : intent.availability === 'medium' ? `Medium stock: ${label}`
          : intent.availability === 'healthy' ? `Healthy stock: ${label}` : null
    const stockOverview = !intent.search && intent.scope === 'all'
      ? `Across ${data?.length || 0} active products: ${outOfStockCount} out of stock, ${lowStockCount} low (1–9), ${mediumStockCount} medium (10–29), and ${healthyStockCount} healthy (30+). These bands match the Products page.`
      : null
    return matches.length ? {
      title: availabilityTitle || `${units.toLocaleString('fr-FR')} units of ${label} available`,
      text: `${stockOverview ? `${stockOverview} ` : ''}${intent.availability === 'out' ? `${matches.length} matching catalog item${matches.length === 1 ? '' : 's'} have no sellable stock.` : intent.availability === 'low' ? `${matches.length} matching catalog item${matches.length === 1 ? '' : 's'} have positive quantities at or below their configured low-stock threshold (10 units by default).` : intent.availability === 'medium' ? `${matches.length} matching catalog item${matches.length === 1 ? '' : 's'} have between 10 and 29 units.` : intent.availability === 'healthy' ? `${matches.length} matching catalog item${matches.length === 1 ? '' : 's'} have at least 30 units.` : `That’s ${inStock.length} matching product${inStock.length === 1 ? '' : 's'} with stock, across ${matches.length} catalog item${matches.length === 1 ? '' : 's'}.`}${negativeStock.length ? ` ${negativeStock.length} item${negativeStock.length === 1 ? ' has' : 's have'} negative tracked stock and need a recount.` : ''}${matches.length > 7 ? ` Showing the first 7.` : ''}`,
      rows: matches.slice(0, 7).map((product) => {
        const level = Number(product.stock_level || 0)
        const stockState = level <= 0 ? (level < 0 ? 'Below zero · recount' : 'Out of stock') : level <= Number(product.low_stock_threshold ?? 10) ? 'Low' : level < 30 ? 'Medium' : 'Healthy'
        return { id: product.product_id, path: '/products', title: product.item_name, detail: [...[product.color, product.flower_type, product.category, product.product_status].filter(Boolean), stockState].join(' · ') || stockState, value: `${level.toLocaleString('fr-FR')} in stock` }
      }),
      actions: [{ label: 'Open products', path: '/products' }],
    } : {
      title: intent.availability === 'out' ? `No ${label} are out of stock` : intent.availability === 'low' ? `No ${label} are low on stock` : intent.availability === 'medium' ? `No ${label} have medium stock` : intent.availability === 'healthy' ? `No ${label} have healthy stock` : `I couldn’t find ${label}`,
      text: intent.availability ? 'I checked the current active product quantities against the stock bands shown in Products.' : 'Try a shorter name or color, such as “red”, or open Products to check the full catalog.',
      actions: [{ label: 'Open products', path: '/products' }],
    }
  }

  if (intent.type === 'navigate') {
    const text = normalize(intent.topic)
    const [label, path] = text.includes('settings') ? ['Settings', '/settings']
      : text.includes('products') ? ['Products', '/products']
        : text.includes('quick sale') ? ['Quick sale', '/cart?mode=quick_sale']
          : text.includes('reports') ? ['Reports', '/reports']
            : text.includes('customer') ? ['Customers', '/customers']
              : text.includes('supplier') ? ['Suppliers', '/suppliers']
                : text.includes('delivery') ? ['Delivery', '/delivery']
                  : text.includes('team') ? ['Team', '/team']
                    : text.includes('cash') || text.includes('coffre') ? ['Cash register', '/coffre-forte'] : ['Orders', '/orders']
    return canAccessRoute(role, path)
      ? { title: `Open ${label}`, text: `I’ll take you to ${label.toLowerCase()} now.`, actions: [{ label: `Go to ${label}`, path }] }
      : { title: `${label} is restricted`, text: 'Your current Blossom role does not have access to that area. Ask an owner to review your access.' }
  }

  if (intent.type === 'how_to') {
    const topic = normalize(intent.topic || '')
    const guide = topic.includes('supplier') || topic.includes('stock')
      ? { title: 'Receive supplier stock', text: 'Open Suppliers, choose the supplier, add each product with its received quantity and unit cost, then review the batch and any payment before saving.', path: '/suppliers', label: 'Open suppliers' }
      : topic.includes('role') || topic.includes('permission')
        ? { title: 'Staff roles and access', text: 'Open Team to review active members and assigned roles. Owners manage access and invitations; each role sees only the Blossom areas assigned to it.', path: '/team', label: 'Open team' }
        : topic.includes('cash') || topic.includes('coffre') || topic.includes('register')
          ? { title: 'Manage the cash register', text: 'Open Coffre Forte to review today’s opening balance, cash in and out, then close the balance at the end of the shift. Only the owner role can access this area.', path: '/coffre-forte', label: 'Open cash register' }
          : topic.includes('report') || topic.includes('sales') || topic.includes('revenue')
            ? { title: 'Review business reports', text: 'Open Reports to review revenue trends, order and payment breakdowns, top products, and team performance.', path: '/reports', label: 'Open reports' }
            : topic.includes('edit order') || topic.includes('change order') || topic.includes('delay') || topic.includes('postpone')
              ? { title: 'Update or delay an order', text: 'Open Orders, choose the order, and use its edit panel to change items or details. To delay it, update its delivery date and time, add the reason, and save the change.', path: '/orders', label: 'Open orders' }
              : topic.includes('product') || topic.includes('catalog')
                ? { title: 'Manage products', text: 'Open Products to search the catalog, filter products, update product details, and review current stock levels.', path: '/products', label: 'Open products' }
        : topic.includes('quick sale')
          ? { title: 'Make a quick sale', text: 'Add products to the shared cart, choose Quick sale at checkout, then record payment. Blossom marks it as a quick sale and updates stock and cash records.', path: '/cart?mode=quick_sale', label: 'Start quick sale' }
          : topic.includes('cart') || topic.includes('finish an order')
            ? { title: 'Complete an order', text: 'Add products in the cart, adjust quantities, attach the customer and delivery details, then continue to checkout to review payment and save the order.', path: '/cart', label: 'Open cart' }
            : topic.includes('customer')
              ? { title: 'Find a customer', text: 'Open Customers and search by name, phone, or email. Expand a customer card to review their recent order history.', path: '/customers', label: 'Open customers' }
              : topic.includes('order') || topic.includes('cart')
                ? { title: 'Create an order', text: 'Add products in the cart, attach the customer and delivery details, then review the total and payment before saving.', path: '/cart', label: 'Open cart' }
                : { title: 'What would you like to do?', text: 'I can guide you through order updates, quick sales, products, stock receiving, customer lookup, reports, and cash workflows. Choose the area you need.', path: '/orders', label: 'Open orders' }
    if (!canAccessRoute(role, guide.path)) return { title: guide.title, text: 'Your current Blossom role does not have access to that area. Ask an owner to review your access.' }
    return {
      title: guide.title,
      text: guide.text,
      steps: guide.steps,
      actions: [{ label: guide.label, path: guide.path }],
    }
  }

  if (intent.type === 'help') {
    return {
      title: 'I didn’t quite catch that',
      text: 'Try “Create a new order”, “Edit order 123”, or “Delete order 123”. I can also find orders by customer, check delivery dates and product stock or prices, and guide you through Blossom.',
      actions: [{ label: 'Orders', path: '/orders' }, ...(canAccessRoute(role, '/products') ? [{ label: 'Products', path: '/products' }] : [])],
    }
  }

  if (intent.type === 'unpaid' || intent.type === 'sales') {
    if (!canSeeFinancials) {
      return { text: 'Payment and sales summaries are available to owners and managers. I can still help you find an order or check today’s work.' }
    }
    if (intent.type === 'unpaid') {
      const due = await fetchAllRows((from, to) => database.from('orders').select(fieldList)
        .neq('status', 'cancelled').gt('amount_due', 0)
        .order('created_at', { ascending: true }).range(from, to))
      const total = due.reduce((sum, order) => sum + Number(order.amount_due || 0), 0)
      return {
        title: `${due.length} orders need payment`,
        text: due.length ? `${money(total)} outstanding across all ${due.length} matching orders.${due.length > 5 ? ` Showing the 5 oldest balances.` : ''}` : 'No outstanding order balances right now.',
        rows: due.slice(0, 5).map((order) => ({ id: order.id, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.payment_status || 'unpaid'} · ${order.delivery_date || 'No delivery date'}`, value: money(order.amount_due) })),
        actions: [{ label: 'Open orders', path: '/orders' }],
      }
    }

    intent.period ||= reportPeriodFromText('today')
    intent.type = 'report_period'
  }

  if (intent.type === 'report_period') {
    if (!canAccessRoute(role, '/reports')) return { title: 'Reports are restricted', text: 'Sales and performance analysis is available to owners and managers.' }
    if (/\b(profit|profitable|margin)\b/i.test(intent.prompt || '')) return { title: 'Profit data is not available', text: 'Blossom Reports has order revenue, but it does not include complete product and operating costs, so I can’t calculate profit reliably.' }
    const period = intent.period || reportPeriodFromText(intent.prompt || 'today')
    if (!period) return { title: 'Choose a reporting period', text: 'Ask about today, yesterday, a specific date, this week, last week, or this month.' }
    const periodEndInclusive = addCalendarDays(period.endDate, -1)
    const periodRangeLabel = period.startDate === periodEndInclusive
      ? period.startDate
      : `${period.startDate} through ${periodEndInclusive}`
    const loadDaily = (startDate, endDate) => fetchAllRows((from, to) => database.from('report_daily_revenue')
      .select('date, amount, orders').gte('date', startDate).lt('date', endDate)
      .order('date', { ascending: true }).range(from, to), 500)
    const [currentDays, previousDays] = await Promise.all([
      loadDaily(period.startDate, period.endDate),
      loadDaily(period.previousStartDate, period.previousEndDate),
    ])
    const summarize = (days) => days.reduce((summary, day) => ({
      revenue: summary.revenue + Number(day.amount || 0),
      orders: summary.orders + Number(day.orders || 0),
    }), { revenue: 0, orders: 0 })
    const current = summarize(currentDays)
    const previous = summarize(previousDays)
    const averageOrder = current.orders ? current.revenue / current.orders : 0
    const change = previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null
    const bestDay = [...currentDays].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0]
    let productRanking = []
    if (intent.productAnalysis) {
      const start = businessDayStartIso(period.startDate)
      const end = businessDayStartIso(period.endDate)
      const itemOrders = await fetchAllRows((from, to) => database.from('orders')
        .select('id, order_items(product_name, quantity, unit_price)')
        .neq('status', 'cancelled').gte('created_at', start).lt('created_at', end)
        .range(from, to), 500)
      const terms = intent.productQuery ? productSearchTerms(intent.productQuery) : []
      const totals = new Map()
      for (const order of itemOrders) for (const item of order.order_items || []) {
        const name = item.product_name || 'Unnamed product'
        const searchable = normalize(name)
        if (terms.length && !terms.every((term) => searchable.includes(term))) continue
        const previousProduct = totals.get(name) || { name, quantity: 0, revenue: 0 }
        const quantity = Number(item.quantity || 0)
        previousProduct.quantity += quantity
        previousProduct.revenue += quantity * Number(item.unit_price || 0)
        totals.set(name, previousProduct)
      }
      productRanking = [...totals.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 5)
    }
    const trend = change === null ? 'There is no prior-period revenue for a reliable percentage comparison.'
      : `That is ${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'above' : 'below'} the previous comparable period (${money(previous.revenue)}).`
    let analysis = current.orders
      ? `${current.orders} orders · ${money(current.revenue)} order revenue · ${money(Math.round(averageOrder))} average order value. ${trend}${bestDay ? ` Best day by order revenue: ${bestDay.date}, ${money(bestDay.amount)} across ${Number(bestDay.orders || 0)} orders.` : ''} Revenue follows the Reports page and is not the same as cash collected.`
      : `No reportable orders or revenue were recorded ${period.label} (${periodRangeLabel}). ${trend}`
    if (intent.productAnalysis) {
      analysis += productRanking.length
        ? ` Top products by units sold: ${productRanking.map((product, index) => `${index + 1}. ${product.name} — ${product.quantity} units (${money(product.revenue)})`).join('; ')}.`
        : ` I couldn’t find matching product sales ${period.label}${intent.productQuery ? ` for “${intent.productQuery}”` : ''}.`
    }
    return {
      title: `Business report · ${period.label} (${periodRangeLabel})`,
      text: analysis,
      rows: [...currentDays].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 4)
        .map((day) => ({ id: day.date, title: day.date, detail: `${Number(day.orders || 0)} orders`, value: money(day.amount) })),
      actions: [{ label: 'Open full reports', path: '/reports' }, { label: 'Orders in this period', prompt: `Show orders ${period.label}` }],
    }
  }

  if (intent.type === 'orders_period') {
    const period = intent.period
    if (!period) return { title: 'Choose a date range', text: 'Try “show this week’s orders”, “orders due yesterday”, or “orders created last week”.' }
    let query = regularOrders(database.from('orders').select(fieldList, { count: 'exact' }))
    if (intent.statuses?.length) query = query.in('status', intent.statuses)
    if (intent.dateField === 'created_at') query = query.gte('created_at', businessDayStartIso(period.startDate)).lt('created_at', businessDayStartIso(period.endDate))
    else query = query.gte('delivery_date', period.startDate).lt('delivery_date', period.endDate)
    if (intent.term) query = query.ilike('client_name', `%${intent.term}%`)
    const { data, count, error } = await query.order(intent.dateField === 'created_at' ? 'created_at' : 'delivery_date', { ascending: true }).order('delivery_time', { ascending: true, nullsFirst: false }).limit(30)
    if (error) throw error
    const orders = data || []
    const label = intent.dateField === 'created_at' ? 'created' : 'scheduled'
    return {
      title: `${count ?? orders.length} ${intent.statuses ? `${intent.statuses.length > 1 ? 'open' : intent.statuses[0]} ` : ''}orders ${label} · ${period.label}`,
      text: orders.length ? `Showing ${orders.length}${(count ?? orders.length) > orders.length ? ` of ${count}` : ''}, sorted by ${intent.dateField === 'created_at' ? 'creation time' : 'delivery time'}. Ask me to edit an order by its number or position, for example “edit the second one”.` : `No matching orders were ${label} ${period.label}.`,
      rows: orders.slice(0, 8).map((order) => ({ id: order.id, orderNumber: order.order_number, customerName: order.client_name || null, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date || 'No delivery date'} · ${prettyTime(order.delivery_time)} · ${order.status}`, value: money(order.total_amount) })),
      actions: [{ label: 'Open orders', path: '/orders' }],
    }
  }

  if (intent.type === 'low_stock') {
    if (!canAccessRoute(role, '/products')) return { title: 'Product stock is restricted', text: 'Your Blossom role cannot access product inventory. Ask an owner or manager to review your access.' }
    const data = await fetchAllRows((from, to) => database.from('products')
      .select('product_id, item_name, stock_level, low_stock_threshold')
      .eq('is_active', true).order('stock_level', { ascending: true }).range(from, to))
    const low = data.filter((product) => Number(product.stock_level || 0) <= Number(product.low_stock_threshold ?? 10))
    return {
      title: low.length ? `${low.length} products need a stock check` : 'Stock looks healthy',
      text: low.length ? `These are at or below their configured alert level.${low.length > 6 ? ` Showing 6 of ${low.length}.` : ''}` : 'No active product is below its stock threshold.',
      rows: low.slice(0, 6).map((product) => ({ id: product.product_id, path: '/products', title: product.item_name, detail: `Alert at ${product.low_stock_threshold ?? 10}`, value: `${product.stock_level ?? 0} left` })),
      actions: [{ label: 'Open products', path: '/products' }],
    }
  }

  if (intent.type === 'order_customer_fact') {
    if (!canAccessRoute(role, '/orders')) return { title: 'Order access is restricted', text: 'Your Blossom role cannot access orders. Ask an owner or manager to review your access.' }
    const { data, count, error } = await applyNameTokens(database.from('orders')
      .select('id, order_number, client_name, client_phone, created_by, cashier_id, status, payment_status, payment_method, total_amount, amount_paid, amount_due, delivery_date, delivery_time, delivery_method, created_at, notes, original_delivery_date, delay_reason, order_items(id, product_name, quantity, unit_price, products(item_name))', { count: 'exact' })
      , 'client_name', intent.term)
      // Include legacy orders where order_type is NULL while excluding quick sales.
      .or('order_type.is.null,order_type.neq.quick_sale')
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) throw error
    const matches = data || []
    if (!matches.length) return {
      title: `No order found for “${intent.term}”`,
      text: 'I couldn’t match that customer name to an order. Try another part of the name or give me the order number.',
      actions: [{ label: 'Open orders', path: '/orders' }],
    }
    let profilesById = {}
    if (intent.field === 'created_by') {
      const creatorIds = [...new Set(matches.map((order) => order.created_by || order.cashier_id).filter(Boolean))]
      if (creatorIds.length) {
        const { data: profiles, error: profilesError } = await database.from('profiles').select('id, full_name, username').in('id', creatorIds)
        if (profilesError) throw profilesError
        profilesById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name || profile.username || 'Staff profile unavailable']))
      }
    }
    const labelFor = (order) => ({
      summary: `${order.client_name || 'Walk-in customer'} · ${order.status} · ${order.delivery_date || 'No delivery date'} · ${money(order.total_amount)}`,
      client_name: order.client_name || 'Walk-in customer',
      client_phone: order.client_phone || 'No phone on the order',
      order_number: `#${order.order_number}`,
      created_by: profilesById[order.created_by || order.cashier_id] || (order.created_by || order.cashier_id ? 'Staff profile unavailable' : 'Creator not recorded'),
      items: (order.order_items || []).map((item) => `${item.quantity} × ${item.product_name || item.products?.item_name || 'Product'}`).join(', ') || 'No items recorded on the order',
      full: `${order.client_name || 'Walk-in customer'}${order.client_phone ? ` · ${order.client_phone}` : ''}. ${order.status || 'Status unknown'} · ${order.payment_status || 'Payment status unknown'}${order.payment_method ? ` by ${order.payment_method}` : ''}. Delivery ${order.delivery_date || 'date not set'} at ${prettyTime(order.delivery_time)} · ${order.delivery_method || 'method not set'}. Total ${money(order.total_amount)}, paid ${money(order.amount_paid)}, due ${money(order.amount_due)}.${order.notes ? ` Notes: ${order.notes}` : ''}${order.delay_reason ? ` Delay note: ${order.delay_reason}` : ''}`,
      status: order.status || 'Unknown',
      payment_status: order.payment_status || 'Unknown',
      payment_method: order.payment_method || 'Not specified',
      amount_paid: money(order.amount_paid),
      amount_due: money(order.amount_due),
      total_amount: money(order.total_amount),
      delivery_date: order.delivery_date || 'No delivery date set',
      delivery_time: prettyTime(order.delivery_time),
      delivery_method: order.delivery_method || 'Not specified',
      notes: order.notes || 'No notes on the order',
      created_at: order.created_at ? new Date(order.created_at).toLocaleString('en-GB') : 'Creation time unavailable',
    })[intent.field] || `${order.client_name || 'Walk-in customer'} · ${order.status || 'Unknown'}`
    const orderChoices = matches.slice(0, 5).map((order) => ({
      label: `#${order.order_number} · ${order.client_name || 'Walk-in'} · ${order.delivery_date || 'No date'}`,
      answer: String(order.order_number),
    }))
    if (matches.length === 1 && normalizedName(matches[0].client_name || '') !== normalizedName(intent.term || '')) {
      const order = matches[0]
      return {
        title: 'Confirm the customer match',
        text: `I found a close name match, “${order.client_name}”. I won’t assume it is the customer you meant. Choose the order to confirm, or try another name.`,
        rows: [{ id: order.id, orderNumber: order.order_number, customerName: order.client_name || null, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date || 'No delivery date'} · ${order.status}`, value: money(order.total_amount) }],
        choices: orderChoices,
        pendingClarification: { kind: 'order_customer_fact', slot: 'orderChoice', intent },
        suppressSuggestions: true,
      }
    }
    const itemRows = (order) => (order.order_items || []).map((item) => ({
      id: `${order.id}-${item.id}`,
      title: `${item.quantity} × ${item.product_name || item.products?.item_name || 'Product'}`,
      detail: `${money(item.unit_price)} each`,
      value: money(Number(item.quantity || 0) * Number(item.unit_price || 0)),
    }))
    if (matches.length === 1) {
      const order = matches[0]
      if (intent.field === 'full') return {
        title: `Order #${order.order_number} · ${order.client_name || 'Walk-in customer'}`,
        text: labelFor(order),
        rows: itemRows(order),
        ...(intent.printRequested ? { printOrder: order } : {}),
        actions: [
          { label: 'Edit this order', prompt: `Edit order ${order.order_number}` },
          { label: 'Record payment', prompt: `Record payment for order ${order.order_number}` },
          { label: 'Delay delivery', prompt: `Delay order ${order.order_number}` },
          { label: 'Open order', path: `/orders/${order.id}` },
        ],
        suppressSuggestions: true,
        followupContext: { type: 'order_lookup', orderId: order.id, orderNumber: order.order_number, customerName: order.client_name || null, facts: ['full'], prompt: intent.prompt },
      }
      return {
        title: intent.field === 'client_name' ? labelFor(order) : intent.field === 'order_number' ? labelFor(order) : `Order #${order.order_number} · ${intent.field.replaceAll('_', ' ')}`,
        text: ['client_name', 'order_number'].includes(intent.field) ? '' : labelFor(order),
        suppressSuggestions: true,
        followupContext: { type: 'order_lookup', orderId: order.id, orderNumber: order.order_number, customerName: order.client_name || null, facts: [intent.field], prompt: intent.prompt },
      }
    }
    if (intent.field === 'full') return {
      title: `${count ?? matches.length} orders for ${matches[0].client_name || intent.term}`,
      text: `I found several matching orders. Showing ${matches.length}${count > matches.length ? ` of ${count}` : ''}; choose the order number you mean.`,
      rows: matches.flatMap((order) => [
        { id: order.id, orderNumber: order.order_number, customerName: order.client_name || null, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date || 'No delivery date'} · ${prettyTime(order.delivery_time)} · ${order.status} · ${order.payment_status || 'unpaid'}`, value: money(order.total_amount) },
        ...itemRows(order),
      ]),
      pendingClarification: { kind: 'order_customer_fact', slot: 'orderChoice', intent },
      choices: orderChoices,
      suppressSuggestions: true,
    }
    return {
      title: `${count ?? matches.length} orders for ${matches[0].client_name || intent.term}`,
      text: `I found more than one order for this customer. Showing ${matches.length}${count > matches.length ? ` of ${count}` : ''}. Which order number do you mean?`,
      rows: matches.map((order) => ({ id: order.id, orderNumber: order.order_number, customerName: order.client_name || null, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: intent.field === 'items' ? `${order.delivery_date || 'No delivery date'} · ${order.status}` : `${order.delivery_date || 'No delivery date'} · ${order.status} · ${order.payment_status || 'unpaid'}`, value: intent.field === 'payment_status' ? (order.payment_status || 'Unknown') : intent.field === 'status' ? (order.status || 'Unknown') : intent.field === 'client_phone' ? (order.client_phone || 'No phone') : intent.field === 'items' ? (order.order_items || []).map((item) => `${item.quantity} × ${item.product_name || item.products?.item_name || 'Product'}`).join(', ') || 'No items' : money(order.total_amount) })),
      pendingClarification: { kind: 'order_customer_fact', slot: 'orderChoice', intent },
      choices: orderChoices,
      suppressSuggestions: true,
    }
  }

  if (intent.type === 'order_lookup') {
    const facts = intent.facts?.length ? intent.facts : ['summary']
    const isFull = facts.includes('full')
    const fields = new Set(['id', 'order_number'])
    const columnsByFact = {
      client_name: ['client_name'], client_phone: ['client_phone'], created_by: ['created_by', 'cashier_id'], status: ['status'], payment_status: ['payment_status'],
      delivery_date: ['delivery_date'], delivery_time: ['delivery_time'], delivery_method: ['delivery_method'],
      payment_method: ['payment_method'], amount_paid: ['amount_paid', 'payment_status'],
      amount_due: ['amount_due', 'payment_status'], total_amount: ['total_amount'],
      order_number: [],
      notes: ['notes'], created_at: ['created_at'], items: ['order_items(id, product_name, product_id, quantity, unit_price, products(item_name, color, flower_type))'],
      summary: ['client_name', 'status', 'delivery_date', 'total_amount'],
      full: ['client_name', 'client_phone', 'created_by', 'cashier_id', 'status', 'payment_status', 'payment_method', 'amount_paid', 'amount_due', 'total_amount', 'delivery_date', 'delivery_time', 'delivery_method', 'client_source', 'created_at', 'notes', 'original_delivery_date', 'delay_reason', 'order_items(id, product_name, product_id, quantity, unit_price, products(item_name, color, flower_type))'],
    }
    for (const fact of facts) for (const column of columnsByFact[fact] || []) fields.add(column)
    const { data: order, error } = await database.from('orders').select([...fields].join(', '))
      .eq('order_number', intent.orderNumber).maybeSingle()
    if (error) throw error
    if (!order) return { title: `No order found for #${intent.orderNumber}`, text: 'Check the number and try again, or search by customer, date, or amount.', actions: [{ label: 'Open orders', path: '/orders' }] }
    let creatorName = null
    if (facts.includes('created_by') || isFull) {
      const creatorId = order.created_by || order.cashier_id
      if (creatorId) {
        const { data: profile, error: profileError } = await database.from('profiles').select('full_name, username').eq('id', creatorId).maybeSingle()
        if (profileError) throw profileError
        creatorName = profile?.full_name || profile?.username || 'Staff profile unavailable'
      } else creatorName = 'Creator not recorded'
    }
    const valueFor = (fact) => ({
      client_name: order.client_name || 'Walk-in customer', client_phone: order.client_phone || 'No phone on the order',
      order_number: String(order.order_number),
      created_by: creatorName || 'Creator not recorded',
      status: order.status, payment_status: order.payment_status || 'Unknown', delivery_date: order.delivery_date || 'No delivery date set',
      delivery_time: prettyTime(order.delivery_time), delivery_method: order.delivery_method || 'Not specified',
      payment_method: order.payment_method || 'Not specified', amount_paid: money(order.amount_paid),
      amount_due: `${money(order.amount_due)} due · ${order.payment_status || 'unpaid'}`,
      total_amount: money(order.total_amount), notes: order.notes || 'No notes on the order',
      created_at: order.created_at ? new Date(order.created_at).toLocaleString('en-GB') : 'Creation time unavailable',
      items: (order.order_items || []).map((item) => `${item.quantity} × ${item.product_name || item.products?.item_name || 'Product'}`).join(', ') || 'No items recorded',
    })[fact]
    if (!isFull && facts.length === 1 && facts[0] === 'client_name') return { title: valueFor('client_name'), text: '', suppressSuggestions: true }
    if (!isFull && facts.length === 1) return { title: `Order #${order.order_number}`, text: valueFor(facts[0]), suppressSuggestions: true }
    if (!isFull && facts[0] !== 'summary') {
      return { title: `Order #${order.order_number}`, text: facts.map((fact) => `${fact.replaceAll('_', ' ')}: ${valueFor(fact)}`).join(' · '), suppressSuggestions: true }
    }
    const rows = (order.order_items || []).map((item) => ({ id: `${order.id}-${item.id}`, title: `${item.quantity} × ${item.product_name || item.products?.item_name || 'Product'}`, detail: `${money(item.unit_price)} each`, value: money(Number(item.quantity || 0) * Number(item.unit_price || 0)) }))
    if (isFull) rows.unshift({ id: order.id, orderNumber: order.order_number, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.status} · ${order.payment_status || 'unpaid'} · ${order.delivery_date || 'No delivery date'} · ${order.client_phone || 'No phone'}`, value: `${money(order.total_amount)} · due ${money(order.amount_due)}` })
    const summary = isFull
      ? `${order.client_name || 'Walk-in customer'}${order.client_phone ? ` · ${order.client_phone}` : ''}. ${order.status} · ${order.payment_status || 'unpaid'} · ${order.delivery_date || 'No delivery date'} at ${prettyTime(order.delivery_time)} by ${order.delivery_method || 'unspecified'}. Total ${money(order.total_amount)}, paid ${money(order.amount_paid)}, due ${money(order.amount_due)}.${creatorName ? ` Created by ${creatorName}.` : ''}${order.notes ? ` Notes: ${order.notes}` : ''}${order.delay_reason ? ` Delay note: ${order.delay_reason}` : ''}`
      : `${order.client_name || 'Walk-in customer'} · ${order.status} · ${order.delivery_date || 'No delivery date'} · ${money(order.total_amount)}`
    return {
      title: `Order #${order.order_number}${isFull ? ' · Full details' : ''}`,
      text: summary,
      rows,
      ...(isFull && intent.printRequested ? { printOrder: order } : {}),
      actions: [
        { label: 'Edit this order in chat', prompt: `Edit order ${order.order_number}` },
        ...(isFull ? [
          { label: 'Record payment', prompt: `Record payment for order ${order.order_number}` },
          { label: 'Delay delivery', prompt: `Delay order ${order.order_number}` },
          { label: 'Open order', path: `/orders/${order.id}` },
        ] : []),
      ],
      followupContext: { type: 'order_lookup', orderId: order.id, orderNumber: String(order.order_number), customerName: order.client_name || null, facts, prompt: intent.prompt },
    }
  }

  if (intent.type === 'order_search') {
    const isPhone = intent.searchField === 'client_phone' || Boolean(intent.term && /\d/.test(intent.term) && !/[a-z]/i.test(intent.term))
    const field = isPhone ? 'client_phone' : 'client_name'
    const searchTerm = isPhone ? intent.term.replace(/\D/g, '') : intent.term
    let query = database.from('orders').select(fieldList, { count: 'exact' }).or('order_type.is.null,order_type.neq.quick_sale')
    if (intent.amountRange) query = query.gte('total_amount', intent.amountRange[0]).lte('total_amount', intent.amountRange[1])
    else if (Number.isFinite(intent.amount)) {
      if (intent.comparator === 'above') query = query.gt('total_amount', intent.amount)
      else if (intent.comparator === 'below') query = query.lt('total_amount', intent.amount)
      else if (intent.comparator === 'around') query = query.gte('total_amount', Math.round(intent.amount * 0.95)).lte('total_amount', Math.round(intent.amount * 1.05))
      else query = query.eq('total_amount', intent.amount)
    }
    if (searchTerm) query = field === 'client_name'
      ? applyNameTokens(query, field, searchTerm)
      : query.ilike(field, `%${searchTerm}%`)
    if (!searchTerm && !Number.isFinite(intent.amount) && !intent.amountRange) return { title: 'What detail should I search by?', text: 'Give me an order number, customer name or phone, date, or total amount—for example “orders between 4,000 and 5,000 DA”.' }
    const { data, count, error } = await query.order('created_at', { ascending: false }).limit(8)
    if (error) throw error
    const matches = data || []
    return matches.length ? {
      title: `${count ?? matches.length} matching orders`,
      text: `Showing ${matches.length}${(count ?? matches.length) > matches.length ? ` of ${count}` : ''} matching order${(count ?? matches.length) === 1 ? '' : 's'}. Choose an order below to see its details in chat, or open the Orders page.`,
      rows: matches.map((order) => ({ id: order.id, orderNumber: order.order_number, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date || 'No delivery date'} · ${order.status} · ${order.client_phone || 'No phone'}`, value: money(order.total_amount) })),
      choices: matches.slice(0, 5).map((order) => ({
        label: `#${order.order_number} · ${order.client_name || 'Walk-in'}`,
        answer: String(order.order_number),
      })),
      pendingClarification: {
        kind: 'order_customer_fact',
        slot: 'orderChoice',
        intent: { type: 'order_customer_fact', term: searchTerm || '', field: 'full', prompt: intent.prompt },
      },
      suppressSuggestions: true,
      actions: [{ label: 'Open orders', path: '/orders' }],
    } : {
      title: 'No matching orders',
      text: searchTerm ? `I couldn’t find an order matching “${searchTerm}”. Try another customer name, phone number, or a different amount.` : 'I couldn’t find orders matching those filters. Try a different date, status, or amount.',
      actions: [{ label: 'Open orders', path: '/orders' }],
    }
  }

  if (intent.type === 'orders_list') {
    const { data, count, error } = await database.from('orders')
      .select(fieldList, { count: 'exact' })
      .or('order_type.is.null,order_type.neq.quick_sale')
      .order('created_at', { ascending: false })
      .limit(8)
    if (error) throw error
    const orders = data || []
    return {
      title: `${count ?? orders.length} orders${count > orders.length ? ' · latest 8 shown' : ''}`,
      text: orders.length ? 'Here are the most recently created orders. Ask for one by number or customer, or say “edit the second one”.' : 'There are no orders to show yet.',
      rows: orders.map((order) => ({ id: order.id, orderNumber: order.order_number, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date || 'No delivery date'} · ${prettyTime(order.delivery_time)} · ${order.status} · ${order.payment_status || 'unpaid'}`, value: money(order.total_amount) })),
      actions: [{ label: 'Open orders', path: '/orders' }],
    }
  }

  if (intent.type === 'orders_status') {
    const bounds = intent.createdOffset === null || intent.createdOffset === undefined ? null : localDayBounds(intent.createdOffset)
    let statusQuery = regularOrders(database.from('orders').select(fieldList, { count: 'exact' })
      .in('status', intent.statuses))
    if (bounds) statusQuery = statusQuery.gte('created_at', bounds.start).lt('created_at', bounds.end)
    const { data, count, error } = await statusQuery.order('created_at', { ascending: false }).limit(8)
    if (error) throw error
    const orders = data || []
    return {
      title: `${count ?? orders.length} ${intent.label} orders${bounds ? intent.createdOffset < 0 ? ' created yesterday' : ' created today' : ''}`,
      text: orders.length ? `Showing the latest ${orders.length} orders${bounds ? ' from that day' : ''}.` : `There are no ${intent.label} orders${bounds ? intent.createdOffset < 0 ? ' created yesterday' : ' created today' : ' right now'}.`,
      rows: orders.map((order) => ({ id: order.id, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date || 'No delivery date'} · ${prettyTime(order.delivery_time)} · ${order.status}`, value: money(order.total_amount) })),
      actions: [{ label: 'Open orders', path: '/orders' }],
    }
  }

  if (intent.type === 'created_today') {
    const dayOffset = intent.offset || 0
    const bounds = localDayBounds(dayOffset)
    const createdDayLabel = dayOffset < 0 ? 'yesterday' : 'today'
    const { data, count, error } = await regularOrders(database.from('orders').select(fieldList, { count: 'exact' })
      .neq('status', 'cancelled')).gte('created_at', bounds.start).lt('created_at', bounds.end)
      .order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    const orders = data || []
    return {
      title: `${count ?? orders.length} orders created ${createdDayLabel}`,
      text: orders.length ? `Newest orders first${(count ?? orders.length) > 6 ? ` · showing 6 of ${count ?? orders.length}` : ''}.` : `No orders were created ${createdDayLabel}.`,
      rows: orders.slice(0, 6).map((order) => ({ id: order.id, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `Created ${new Date(order.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })} · ${order.status}`, value: money(order.total_amount) })),
      actions: [{ label: 'View all orders', path: '/orders' }],
    }
  }

  if (intent.type === 'deliveries_period') {
    const period = intent.period
    if (!period?.startDate || !period?.endDate) return { title: 'Which delivery dates?', text: 'Give me a date or a period such as today, this week, or next week.' }
    const pageSize = 10
    const page = Math.max(0, Number(intent.page || 0))
    let periodQuery = regularOrders(database.from('orders').select(fieldList, { count: 'exact' })
      .gte('delivery_date', period.startDate).lt('delivery_date', period.endDate).in('status', intent.statuses || ACTIVE_STATUSES))
      .neq('delivery_method', 'pickup')
    const { data, count, error } = await periodQuery.order('delivery_date').order('delivery_time', { ascending: true, nullsFirst: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) throw error
    const rows = data || []
    const total = count ?? rows.length
    const start = page * pageSize
    const end = Math.min(start + rows.length, total)
    const hasMore = end < total
    return {
      title: `${total} deliveries · ${period.label}`,
      text: rows.length ? `Scheduled deliveries, sorted by date and time · showing ${start + 1}–${end} of ${total}.` : page ? `There are no more deliveries in ${period.label}.` : `No deliveries are scheduled for ${period.label}.`,
      rows: rows.map((order) => ({ id: order.id, orderNumber: order.order_number, path: `/orders/${order.id}`, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${order.delivery_date} · ${prettyTime(order.delivery_time)} · ${order.delivery_method || 'Delivery'} · ${order.status}`, value: money(order.total_amount) })),
      actions: [{ label: 'Open delivery run', path: '/delivery' }],
      ...(hasMore ? { suggestions: [{ label: 'Next 10 deliveries', prompt: 'next deliveries' }] } : page ? { suppressSuggestions: true } : {}),
    }
  }

  const targetDateStr = intent.targetDate || addCalendarDays(today, intent.offset || 0)
  const statuses = intent.statuses || ACTIVE_STATUSES
  let query = regularOrders(database.from('orders').select(fieldList, { count: 'exact' })
    .eq('delivery_date', targetDateStr).in('status', statuses))
  if (intent.type === 'overdue') query = regularOrders(database.from('orders').select(fieldList, { count: 'exact' })
    .lt('delivery_date', today).in('status', statuses))
  if (intent.type === 'deliveries' || intent.deliveryOnly) query = query.neq('delivery_method', 'pickup')

  const pageSize = 10
  const page = Math.max(0, Number(intent.page || 0))
  const { data, count, error } = await query.order('delivery_time', { ascending: true, nullsFirst: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw error
  const orders = data || []
  const total = count ?? orders.length
  const start = page * pageSize
  const end = Math.min(start + orders.length, total)
  const hasMore = end < total
  const noun = intent.type === 'overdue' ? (intent.deliveryOnly ? 'overdue deliveries' : 'overdue orders') : intent.type === 'deliveries' ? 'deliveries' : `${intent.statusLabel ? `${intent.statusLabel} ` : ''}orders due`
  const when = intent.type === 'overdue' ? 'past their delivery date' : intent.offset ? `for ${dateLabel(targetDateStr, dateFormat)}` : 'for today'
  return {
    title: `${total} ${noun} ${when}`,
    text: orders.length ? `Here’s the preparation list, earliest time first · showing ${start + 1}–${end} of ${total}.` : page ? `There are no more orders ${when}.` : `Nothing is scheduled ${when}.`,
    rows: orders.map((order) => ({ id: order.id, path: intent.deliveryOnly ? '/delivery' : `/orders/${order.id}`, orderNumber: order.order_number, customerName: order.client_name || null, title: `#${order.order_number} · ${order.client_name || 'Walk-in customer'}`, detail: `${prettyTime(order.delivery_time)} · ${order.delivery_method || 'Pickup'} · ${order.status}`, value: money(order.total_amount) })),
    actions: [{ label: intent.type === 'deliveries' || intent.deliveryOnly ? 'Open delivery run' : 'Open orders', path: intent.type === 'deliveries' || intent.deliveryOnly ? '/delivery' : '/orders' }],
    ...(hasMore ? { suggestions: [{ label: 'Next 10', prompt: 'next deliveries' }] } : page ? { suppressSuggestions: true } : {}),
  }
}

// Keep the existing display shape stable while giving routing, diagnostics,
// and future evaluation a machine-readable outcome instead of parsing copy.
export async function resolveQuestion(intent, context = {}) {
  // Enforce the shared routing contract again at the execution boundary. This
  // also protects resumed session drafts and any future caller that bypasses
  // the conversational router; malformed intents must never reach a query.
  const validation = validateAssistantIntent(intent)
  if (!validation.ok) {
    return {
      title: 'I need to clarify that request',
      text: 'I couldn’t safely validate the request, so I did not run it. Please restate what you want to look up or change.',
      outcome: { status: 'needs_clarification', domain: 'general', operation: 'contract_validation', entity: null, fields: [], timeScope: null },
    }
  }
  intent = validation.intent
  const catalogAction = getAssistantActionForIntent(intent)
  if (catalogAction && !canRunAssistantAction(catalogAction, context?.role, intent)) {
    return {
      title: 'That Blossom task is restricted',
      text: 'Your current role is not allowed to use this assistant capability. I did not access the requested data or make any changes.',
      outcome: {
        status: 'forbidden', domain: catalogAction.domain,
        operation: intent.type, entity: null, fields: [], timeScope: null,
        interaction: 'answer',
      },
    }
  }
  const response = await resolveQuestionResponse(intent, context)
  const title = String(response?.title || '').toLowerCase()
  const hasReviewableAction = Boolean(response?.orderForm || response?.paymentAction || response?.refundAction
    || response?.deleteOrder || response?.voidOrder || response?.cancelOrder || response?.delayOrder)
  const reviewRequired = hasReviewableAction && catalogAction?.confirmation !== 'none'
  const status = response?.outcomeStatus || (response?.pendingClarification ? 'needs_clarification'
    : /\b(restricted|can.t|cannot|don.t have access)\b/.test(title) ? 'forbidden'
      : /\b(no order|no matching|wasn.t found|couldn.t find|not found|no customer|no product|no supplier)\b/.test(title) ? 'not_found'
        : /\b(invalid|choose a later|must be|enter a valid|cannot be before)\b/.test(title) ? 'validation_error'
          : intent?.type === 'help' ? 'unsupported'
        : 'success')
  const entity = intent?.orderNumber ? { type: 'order', key: String(intent.orderNumber) }
    : intent?.orderId ? { type: 'order', id: String(intent.orderId) }
      : intent?.term ? { type: 'search_term', value: String(intent.term) }
        : intent?.name ? { type: 'search_term', value: String(intent.name) }
          : null
  const type = intent?.type || ''
  const domain = type.startsWith('order') || type.startsWith('orders') ? 'orders'
    : type.startsWith('product') || type === 'low_stock' ? 'products'
      : type.startsWith('customer') ? 'customers'
        : type.startsWith('supplier') ? 'suppliers'
          : type === 'cash_register' ? 'cash'
            : type.startsWith('deliver') || type === 'overdue' ? 'deliveries'
              : ['report_period', 'sales', 'unpaid', 'overview', 'stock_waste'].includes(type) ? 'reports' : 'general'
  return {
    ...applyDatePreference(response, context?.preferences?.dateFormat || 'regional'),
    outcome: {
      status,
      domain,
      operation: intent?.type || 'help',
      entity,
      fields: intent?.facts || (intent?.field ? [intent.field] : []),
      timeScope: intent?.period || intent?.targetDate || (intent?.offset !== undefined ? { offsetDays: intent.offset } : null),
      interaction: response?.pendingClarification ? 'clarification'
        : reviewRequired ? 'review_required'
          : response?.path || response?.actions?.length ? 'navigation_available' : 'answer',
      impact: catalogAction?.impact || 'safe',
      confirmation: catalogAction?.confirmation || 'none',
      undoAvailable: catalogAction?.undo === 'available',
    },
  }
}
