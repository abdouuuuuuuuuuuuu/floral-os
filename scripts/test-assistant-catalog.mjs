import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { translateOrderError } from '../src/lib/orderErrors.js'
import { routeAssistantTurn } from '../src/lib/assistant/router.js'
import { resolveQuestion } from '../src/lib/assistant/queryService.js'
import { classifyQuestion, isGreetingMessage } from '../src/lib/assistant/intentEngine.js'
import { buildEvaluationCorpus } from '../src/lib/assistant/evaluation/corpus.v2.js'
import { continuePendingClarification, updateConversationContext, emptyConversationContext } from '../src/lib/assistant/conversationState.js'
import { validateAssistantIntent } from '../src/lib/assistant/intentContract.js'
import {
  ASSISTANT_ACTION_CATALOG,
  canRunAssistantAction,
  getAssistantAction,
  getAssistantActionForIntent,
  getAssistantActionRoles,
  getAssistantTools,
} from '../src/lib/assistant/actionCatalog.js'

const cases = [
  ['lookup_order', 'show me order 786', 'order_lookup'],
  ['search_orders', 'find orders by client name Amal Benali', 'order_search'],
  ['list_orders', 'list all recent orders', 'orders_list'],
  ['recent_order_creators', 'who created the last 3 orders', 'orders_created_by'],
  ['check_stock', 'how many red flowers are left in stock', 'product_stock'],
  ['check_product_price', 'how much do red roses cost', 'product_price'],
  ['analyze_reports', 'show sales yesterday', 'report_period'],
  ['create_order', 'create a new order for Amal', 'order_create'],
  ['edit_order', 'edit order 786 add two red roses', 'order_edit'],
  ['delay_order', 'delay order 786 until 2030-11-20', 'order_delay'],
  ['record_order_payment', 'record payment of 1000 DA for order 786', 'order_payment'],
  ['cancel_order', 'cancel order 786', 'order_cancel'],
  // Permanent deletion only routes through the exact confirmation phrase.
  ['delete_order', 'pepepeace #786', 'order_delete'],
  ['get_business_overview', 'give me a business overview', 'overview'],
  ['find_customer', 'find customer Amal Benali', 'customer_lookup'],
  ['find_supplier', 'find supplier Green Garden', 'supplier_lookup'],
  ['list_deliveries', 'show today delivery run', 'deliveries'],
  ['cash_register_summary', 'show cash register transactions today', 'cash_register'],
  ['guide_workflow', 'how do I create an order', 'how_to'],
]

const allowedRoles = ['owner', 'manager', 'florist', 'cashier', 'delivery']
let checks = 0
const pendingChecks = []
function check(name, fn) {
  pendingChecks.push(Promise.resolve().then(fn).then(() => {
    checks += 1
    console.log(`PASS ${name}`)
  }, (error) => {
    console.error(`FAIL ${name}: ${error.message}`)
    throw error
  }))
}

function makeDatabase({ rows = {}, errors = {}, calls = [] } = {}) {
  return {
    calls,
    from(table) {
      const filters = []
      const query = {
        select(value) { query.selection = value; return query },
        eq(field, value) { filters.push([field, value]); return query },
        ilike(field, value) { filters.push([field, value]); return query },
        or(value) { filters.push(['or', value]); return query },
        in(field, value) { filters.push([field, value]); return query },
        gte(field, value) { filters.push([field, value]); return query },
        gt(field, value) { filters.push([field, value]); return query },
        lt(field, value) { filters.push([field, value]); return query },
        lte(field, value) { filters.push([field, value]); return query },
        neq(field, value) { filters.push([field, value]); return query },
        order() { return query },
        limit() { return query },
        range() { return query },
        maybeSingle() {
          calls.push({ table, selection: query.selection, filters })
          return Promise.resolve({ data: (rows[table] || [])[0] || null, error: errors[table] || null })
        },
        // oxlint-disable-next-line unicorn/no-thenable -- Supabase query builders are thenable; the fake must preserve await semantics.
        then(resolve, reject) {
          calls.push({ table, selection: query.selection, filters })
          return Promise.resolve({ data: rows[table] || [], count: (rows[table] || []).length, error: errors[table] || null }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

check('route generic sales questions to the sales workflow and preserve explicit periods', () => {
  assert.equal(classifyQuestion('how much money did we make').type, 'sales')
  assert.equal(classifyQuestion('how much moey did we make').type, 'sales')
  assert.equal(classifyQuestion('combien d argent avons nous gagne').type, 'sales')
  assert.equal(classifyQuestion('كم حققنا من المال').type, 'sales')
  assert.equal(classifyQuestion('show sales yesterday').type, 'report_period')
})

check('recognize localized greetings and route common typos and polite follow-ups', () => {
  assert.equal(isGreetingMessage('bonjour Blossom'), true)
  assert.equal(isGreetingMessage('من فضلك صباح الخير يا بلوسوم'), true)
  assert.equal(isGreetingMessage('good moning Blossom'), true)
  assert.equal(classifyQuestion('list prcessing orders').type, 'orders_status')
  assert.equal(classifyQuestion('please the second one', { type: 'orders_list' }).type, 'select_result')
  assert.equal(classifyQuestion('please how do I create an order').type, 'how_to')
  assert.equal(classifyQuestion('liste les commandes en curs').type, 'orders_status')
  assert.equal(classifyQuestion('montre les tansactions de caisse aujourd hui').type, 'cash_register')
  assert.equal(classifyQuestion('que peux-tu fare dans Blossom').type, 'capabilities')
  assert.equal(classifyQuestion('اعرض التوصيلات هذا اأسبوع').type, 'deliveries_period')
  assert.equal(classifyQuestion('اعرض معاملات اصندوق اليوم').type, 'cash_register')
  assert.equal(classifyQuestion('اعرض مبيعات الأمس').type, 'report_period')
  assert.equal(classifyQuestion('s il te plait quel est le statut de la commande').type, 'order_clarification')
  assert.equal(classifyQuestion('افتح صفحة الطلبت').type, 'navigate')
  const usdtPayment = classifyQuestion('record payment of 1000 DA for order 786 using USDT')
  assert.equal(usdtPayment.type, 'order_payment')
  assert.equal(usdtPayment.method, 'usd')
})

check('evaluation follow-ups carry their prior context and use non-duplicated connectors', () => {
  const followups = buildEvaluationCorpus().filter((scenario) => scenario.mutation?.startsWith('short-followup'))
  assert.equal(followups.length, 35 * 10)
  for (const scenario of followups) {
    assert.ok(scenario.context?.intent?.type, `${scenario.id} has prior intent context`)
    assert.ok(scenario.previousIntent?.type, `${scenario.id} has a previous intent`)
    assert.doesNotMatch(scenario.prompt, /\b(?:and\s+and|et\s+et)\b/i, `${scenario.id} avoids duplicate connectors`)
  }
  assert.ok(followups.some((scenario) => scenario.family === 'product_price' && scenario.type === 'product_stock'))
  assert.ok(followups.some((scenario) => scenario.family === 'product_stock' && scenario.type === 'product_price'))
})

check('contextual follow-ups resolve before compound-read planning', async () => {
  const orderIntent = { type: 'order_lookup', orderNumber: '786', facts: ['full'] }
  const orderResult = await routeAssistantTurn({
    prompt: 'and payment status',
    context: { topic: 'orders', activeOrder: { orderNumber: '786' }, activeEntity: { type: 'order', orderNumber: '786' }, intent: orderIntent },
    previousIntent: orderIntent,
    role: 'owner', modelEnabled: false,
  })
  assert.equal(orderResult.intent.type, 'order_lookup')
  assert.deepEqual(orderResult.intent.facts, ['payment_status'])

  const customerResult = await routeAssistantTurn({
    prompt: 'what about phone',
    context: { topic: 'customers', activeCustomer: 'Amal Benali', activeEntity: { type: 'customer', name: 'Amal Benali' }, intent: { type: 'customer_lookup', name: 'Amal Benali' } },
    role: 'owner', modelEnabled: false,
  })
  assert.equal(customerResult.intent.type, 'customer_lookup')
  assert.equal(customerResult.intent.requestedFact, 'phone')

  const capabilitiesResult = await routeAssistantTurn({
    prompt: 'what else can you do',
    context: { intent: { type: 'capabilities' } }, previousIntent: { type: 'capabilities' },
    role: 'owner', modelEnabled: false,
  })
  assert.equal(capabilitiesResult.intent.type, 'capabilities')

  const productResult = await routeAssistantTurn({
    prompt: 'and the stock',
    context: { topic: 'stock', activeProduct: 'red roses', activeEntity: { type: 'product', name: 'red roses' }, intent: { type: 'product_price', search: 'red roses' } },
    role: 'owner', modelEnabled: false,
  })
  assert.equal(productResult.intent.type, 'product_stock')
  assert.equal(productResult.routeSource, 'conversation-task-followup')

  const createFollowup = await routeAssistantTurn({
    prompt: 'add three red roses', context: { topic: 'orders', currentTask: { type: 'order_create' }, intent: { type: 'order_create' } },
    role: 'owner', modelEnabled: false,
  })
  assert.equal(createFollowup.intent.type, 'order_create')

  // A bare order number after a delete request must not become a delete:
  // permanent deletion only accepts the exact "pepepeace #<number>" phrase.
  const deleteTarget = classifyQuestion('786', { type: 'order_delete' }, { topic: 'orders', activeOrder: { orderNumber: '786' }, intent: { type: 'order_delete' } })
  assert.notEqual(deleteTarget.type, 'order_delete')

  const editResult = await routeAssistantTurn({
    prompt: 'add two roses to this order',
    context: { topic: 'orders', activeOrder: { orderNumber: '786' }, intent: { type: 'order_edit', orderNumber: '786' } },
    role: 'owner', modelEnabled: false,
  })
  assert.equal(editResult.intent.type, 'order_edit')
  assert.equal(editResult.intent.orderNumber, '786')

  assert.equal(classifyQuestion('ابحث عن رقم العميل أمل بن علي').type, 'customer_lookup')
})

const order = {
  id: 'order-786', order_number: 786, client_name: 'Amal Benali', client_phone: '0555000000',
  total_amount: 2000, amount_paid: 500, amount_due: 1500, payment_status: 'partial',
  payment_method: 'cash', status: 'processing', delivery_date: '2030-11-01', delivery_time: '10:00:00',
  delivery_method: 'delivery', notes: '', price_adjustment: 0, order_items: [],
}

check('a plain "delete order" request is locked behind the confirmation phrase', async () => {
  const result = await routeAssistantTurn({ prompt: 'delete order 786', role: 'owner', modelEnabled: false })
  assert.equal(result.intent?.type, 'order_delete_forbidden')
})

for (const [toolName, prompt, expectedIntent] of cases) {
  check(`intent and catalog mapping: ${toolName}`, async () => {
    const result = await routeAssistantTurn({ prompt, role: 'owner', modelEnabled: false })
    assert.equal(result.intent?.type, expectedIntent)
    assert.equal(getAssistantActionForIntent(result.intent)?.toolName, toolName)
  })
}

check('catalog and role matrix covers every tool', () => {
  assert.equal(ASSISTANT_ACTION_CATALOG.length, cases.length)
  for (const action of ASSISTANT_ACTION_CATALOG) {
    assert.ok(action.intents.length, `${action.toolName} has intents`)
    assert.ok(action.roles.length, `${action.toolName} has roles`)
    assert.ok(action.intents.every((type) => getAssistantActionForIntent({ type })), `${action.toolName} intents resolve`)
    for (const role of allowedRoles) {
      assert.equal(canRunAssistantAction(action, role, { type: action.intents[0] }), action.roles.includes(role))
    }
    if (action.kind === 'write') {
      assert.ok(action.impact && action.confirmation !== 'none' && action.undo)
    }
  }
  assert.deepEqual(getAssistantActionRoles(getAssistantAction('record_order_payment'), { action: 'refund' }), ['owner', 'manager'])
  assert.ok(!getAssistantTools({ role: 'cashier' }).find((tool) => tool.function.name === 'record_order_payment')?.function.parameters.properties.action.enum.includes('refund'))
})

check('specific order number selects that record and read runs directly', async () => {
  const database = makeDatabase({ rows: { orders: [order] } })
  const result = await resolveQuestion({ type: 'order_lookup', orderNumber: '786', facts: ['summary'] }, { role: 'owner', database })
  assert.equal(database.calls[0].filters.find(([field]) => field === 'order_number')?.[1], '786')
  assert.equal(result.outcome.entity.key, '786')
  assert.equal(result.outcome.confirmation, 'none')
  assert.notEqual(result.outcome.interaction, 'review_required')
})

check('empty order results are stated plainly without inventing a match', async () => {
  const result = await resolveQuestion({ type: 'order_lookup', orderNumber: '999999', facts: ['summary'] }, { role: 'owner', database: makeDatabase({ rows: { orders: [] } }) })
  assert.match(result.title, /no order/i)
  assert.equal(result.rows?.length || 0, 0)
  assert.equal(result.outcome.status, 'not_found')
})

check('ambiguous customer matches request a choice', async () => {
  const database = makeDatabase({ rows: { orders: [order, { ...order, id: 'order-787', order_number: 787 }] } })
  const result = await resolveQuestion({ type: 'order_customer_fact', term: 'Amal Benali', field: 'full' }, { role: 'owner', database })
  assert.equal(result.outcome.status, 'needs_clarification')
  assert.equal(result.pendingClarification?.slot, 'orderChoice')
  assert.deepEqual(result.choices.map((choice) => choice.answer), ['786', '787'])
})

check('customer order history is scoped to the resolved profile and excludes quick sales', async () => {
  const database = makeDatabase({ rows: {
    customers: [{ customer_id: 'c-1', full_name: 'Amal Benali', phone: '0555000000' }],
    orders: [{ id: 'o-1', order_number: 12, client_name: 'Amal Benali', status: 'new', order_items: [] }],
  } })
  const result = await resolveQuestion({ type: 'customer_lookup', name: 'Amal Benali', requestedFact: 'order_history' }, { role: 'owner', database })
  assert.match(result.title, /order history/)
  const ordersQuery = database.calls.find((call) => call.table === 'orders')
  assert.ok(ordersQuery.filters.some(([field, value]) => field === 'customer_id' && value === 'c-1'))
  assert.ok(ordersQuery.filters.some(([field, value]) => field === 'or' && /order_type\.is\.null/.test(value)))
})

check('role denial happens before any database read', async () => {
  const database = makeDatabase()
  const result = await resolveQuestion({ type: 'supplier_lookup', name: 'Green Garden' }, { role: 'cashier', database })
  assert.equal(result.outcome.status, 'forbidden')
  assert.equal(database.calls.length, 0)
  const refund = await resolveQuestion({ type: 'order_payment', orderNumber: '786', action: 'refund' }, { role: 'cashier', database })
  assert.equal(refund.outcome.status, 'forbidden')
  const cash = await resolveQuestion({ type: 'cash_register', targetDate: '2026-10-12' }, { role: 'manager', database })
  assert.match(cash.title, /restricted/)
  assert.equal(database.calls.length, 0)
})

check('supplier matches are clarified before reading a balance or history', async () => {
  const database = makeDatabase({ rows: { suppliers: [
    { supplier_id: 's1', company_name: 'Green Garden North', phone: '111' },
    { supplier_id: 's2', company_name: 'Green Garden South', phone: '222' },
  ] } })
  const result = await resolveQuestion({ type: 'supplier_lookup', name: 'Green Garden', requestedFact: 'payment_history' }, { role: 'owner', database })
  assert.equal(result.choices.length, 2)
  assert.match(result.text, /Choose the exact supplier/)
  assert.equal(database.calls.length, 1)
  assert.equal(database.calls[0].table, 'suppliers')
  const context = updateConversationContext(emptyConversationContext(), { type: 'supplier_lookup', name: 'Green Garden', requestedFact: 'payment_history' }, result)
  const selected = continuePendingClarification('first', context.pendingClarification, { normalize: (value) => value.toLowerCase() })
  assert.equal(selected.type, 'supplier_lookup')
  assert.equal(selected.supplierId, 's1')
  assert.equal(validateAssistantIntent(selected).ok, true)
})

check('failed database calls reject instead of returning a false success', async () => {
  const database = makeDatabase({ errors: { orders: new Error('mock database outage') } })
  await assert.rejects(resolveQuestion({ type: 'order_lookup', orderNumber: '786' }, { role: 'owner', database }), /mock database outage/)
})

check('assistant report uses the Reports daily revenue source and labels revenue separately from cash', async () => {
  const database = makeDatabase({ rows: { report_daily_revenue: [
    { date: '2026-10-10', amount: 12500, orders: 3 },
  ] } })
  const result = await resolveQuestion({
    type: 'report_period',
    period: { startDate: '2026-10-10', endDate: '2026-10-11', previousStartDate: '2026-10-09', previousEndDate: '2026-10-10', label: 'Saturday, October 10, 2026' },
    prompt: 'revenue',
  }, { role: 'owner', database })
  assert.match(result.text, /12\D+500 DA order revenue/)
  assert.match(result.text, /4\D+167 DA average order value/)
  assert.match(result.text, /not the same as cash collected/)
  assert.match(result.title, /October 10, 2026|10\/10\/2026/)
  assert.ok(database.calls.length >= 2)
  assert.ok(database.calls.every((call) => call.table === 'report_daily_revenue'))
  assert.ok(database.calls.some((call) => call.filters.some(([field, value]) => field === 'date' && value === '2026-10-10')))
})

check('Reports page uses Algiers calendar dates and explicit non-cash revenue labels', async () => {
  const source = await readFile(new URL('../src/pages/Reports.jsx', import.meta.url), 'utf8')
  assert.match(source, /addCalendarDays, localDate/)
  const filterBlock = source.slice(source.indexOf('// ─── FILTER DATA BY DATE RANGE'), source.indexOf('// ─── COMPUTED STATS'))
  assert.match(filterBlock, /addCalendarDays\(today, -\(daysBack - 1\)\)/)
  assert.doesNotMatch(filterBlock, /toISOString/)
  assert.match(source, /All-time order revenue · not cash collected/)
  assert.match(source, /Today's Order Revenue/)
})

check('order delay migration uses the business date, allows an omitted reason, and preserves status/payment', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261012100000_align_order_delay_business_date.sql', import.meta.url), 'utf8')
  assert.match(migration, /p_reason text DEFAULT 'Not specified'/)
  assert.match(migration, /v_business_date date := \(now\(\) AT TIME ZONE 'Africa\/Algiers'\)::date/)
  assert.match(migration, /p_delivery_date <= v_business_date/)
  assert.match(migration, /SET original_delivery_date = coalesce\(original_delivery_date, delivery_date\),[\s\S]*?delay_history = coalesce\(delay_history, '\[\]'::jsonb\)/)
  const updateClause = migration.match(/UPDATE public\.orders([\s\S]*?)WHERE id = p_order_id/)
  assert.ok(updateClause)
  assert.doesNotMatch(updateClause[1], /\b(status|payment_status|amount_paid|amount_due)\s*=/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.delay_order\(uuid, date, text\) TO authenticated/)
})

check('forward order delay migration installs its schema dependencies and guarded RPC', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261012140000_ensure_order_delay_schema.sql', import.meta.url), 'utf8')
  for (const column of ['original_delivery_date', 'delay_reason', 'delayed_at', 'delay_history']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`))
  }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delay_order\(/)
  assert.match(migration, /v_business_date date := \(now\(\) AT TIME ZONE 'Africa\/Algiers'\)::date/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.delay_order\(uuid, date, text\) TO authenticated/)
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/)
  const updateClause = migration.match(/UPDATE public\.orders([\s\S]*?)WHERE id = p_order_id/)
  assert.ok(updateClause)
  assert.doesNotMatch(updateClause[1], /\b(status|payment_status|amount_paid|amount_due)\s*=/)
})

check('order delay error translation identifies the correct migration', () => {
  assert.match(translateOrderError({ code: 'PGRST202', message: 'Could not find the function public.delay_order in the schema cache' }), /latest order-delay migration/)
  assert.match(translateOrderError({ code: '42703', message: 'column "delay_history" does not exist' }), /latest order-delay migration/)
})

check('order creation retry migration uses an actor-scoped key and returns the saved result', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261012120000_idempotent_order_creation.sql', import.meta.url), 'utf8')
  assert.match(migration, /PRIMARY KEY \(actor_id, request_id\)/)
  assert.match(migration, /FUNCTION public\.blossom_create_order\s*\(\s*p_order jsonb,\s*p_items jsonb,\s*p_request_id uuid\s*\)/)
  assert.match(migration, /v_result := public\.blossom_create_order\(p_order, p_items\)/)
  assert.match(migration, /RETURN v_saved\.result/)
  assert.match(migration, /request id was already used for different order details/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.blossom_create_order\(jsonb, jsonb, uuid\) TO authenticated/)
})

check('order creation wrapper migration installs the RPC dependency with server-side role checks', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261012130000_restore_order_creation_wrapper.sql', import.meta.url), 'utf8')
  assert.match(migration, /FUNCTION public\.blossom_create_order\(p_order jsonb, p_items jsonb\)/)
  assert.match(migration, /public\.create_order\(p_order, p_items\)/)
  assert.match(migration, /v_role[\s\S]*NOT IN \('owner', 'manager', 'florist', 'cashier'\)/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.blossom_create_order\(jsonb, jsonb\) TO authenticated/)
})

check('order delay errors are translated into retryable staff guidance', () => {
  assert.equal(translateOrderError({ message: 'role cannot delay orders' }), 'You do not have permission to reschedule orders.')
  assert.equal(translateOrderError({ message: 'new delivery date must be in the future' }), 'Choose a delivery date after today.')
  assert.equal(translateOrderError({ message: 'order not found' }), 'This order could not be found. Refresh the order list and try again.')
  assert.match(translateOrderError({ code: 'PGRST202', message: 'Could not find the function public.blossom_create_order(jsonb, jsonb)' }), /No order was saved.*latest order-creation migration/)
})

check('USDT exchange rate migration sets the default and current shop rate to 250 DA', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261012110000_set_usdt_exchange_rate.sql', import.meta.url), 'utf8')
  assert.match(migration, /ALTER COLUMN usd_exchange_rate SET DEFAULT 250/)
  assert.match(migration, /SET usd_exchange_rate = 250[\s\S]*?usd_exchange_rate IS DISTINCT FROM 250/)
})

check('low-stock answers use each product configured threshold', async () => {
  const database = makeDatabase({ rows: { products: [
    { product_id: 1, item_name: 'Rose A', stock_level: 12, low_stock_threshold: 15 },
    { product_id: 2, item_name: 'Rose B', stock_level: 12, low_stock_threshold: 10 },
  ] } })
  const result = await resolveQuestion({ type: 'product_stock', search: '', availability: 'low' }, { role: 'owner', database })
  assert.deepEqual(result.rows.map((row) => row.title), ['Rose A'])
  assert.match(database.calls[0].selection, /low_stock_threshold/)
  assert.match(result.text, /configured low-stock threshold/)
})

const reviewCases = [
  { type: 'order_create', role: 'cashier', responseKey: 'orderForm' },
  { type: 'order_edit', orderNumber: '786', role: 'florist', responseKey: 'orderForm' },
  { type: 'order_delay', orderNumber: '786', deliveryDate: '2030-11-20', role: 'manager', responseKey: 'delayOrder' },
  { type: 'order_payment', orderNumber: '786', action: 'payment', amount: 1000, role: 'cashier', responseKey: 'paymentAction' },
  { type: 'order_payment', orderNumber: '786', action: 'refund', amount: 100, role: 'manager', responseKey: 'paymentAction' },
  { type: 'order_cancel', orderNumber: '786', role: 'manager', responseKey: 'cancelOrder' },
  { type: 'order_delete', orderNumber: '786', deleteCommand: 'pepepeace #786', role: 'owner', responseKey: 'deleteOrder' },
]
for (const scenario of reviewCases) {
  check(`confirmation before write: ${scenario.type}${scenario.action ? `/${scenario.action}` : ''}`, async () => {
    const result = await resolveQuestion(scenario, { role: scenario.role, database: makeDatabase({ rows: { orders: [order] } }) })
    assert.ok(result[scenario.responseKey], `expected ${scenario.responseKey} review UI data`)
    assert.equal(result.outcome.interaction, 'review_required')
    assert.equal(result.outcome.confirmation, scenario.type === 'order_delete' ? 'explicit_confirm' : 'review')
  })
}

check('order creation is conversational until the existing final review', async () => {
  const source = await readFile(new URL('../src/components/layout/BlossomAssistant.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /<AssistantOrderDraftCard\b/)
  assert.match(source, /async function answerOrderDraft/)
  for (const step of ['products', 'customer', 'schedule', 'payment_method', 'payment_amount', 'notes']) {
    assert.match(source, new RegExp(`${step}:`))
  }
  assert.match(source, /from\('customers'\)\.select\('customer_id, full_name, phone'\)/)
  assert.match(source, /orderForm: \{ mode: 'create', role, initialDraft: readyDraft \}/)
})

await Promise.all(pendingChecks)
console.log(`Assistant catalog checks: ${checks} passed.`)
