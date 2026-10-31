import { LOCAL_TOOL_DEFINITIONS } from './toolDefinitions.js'

const FRONT_COUNTER = ['owner', 'manager', 'florist', 'cashier']
const MANAGEMENT = ['owner', 'manager']
const SHOP_OPERATIONS = ['owner', 'manager', 'florist']
const ALL_STAFF = ['owner', 'manager', 'florist', 'cashier', 'delivery']
const SAFE_READ = { impact: 'safe', confirmation: 'none', undo: 'not_applicable' }
const CONSEQUENTIAL_WRITE = { impact: 'consequential', confirmation: 'review', undo: 'unsupported' }

// This registry is the assistant's shared contract for model tools, supported
// intents, role filtering, confirmation requirements, and execution metadata.
// Keep database/RPC authorization authoritative; this catalog is a UX and
// routing boundary only.
const ACTION_METADATA = {
  lookup_order: { id: 'orders.lookup', domain: 'orders', intents: ['order_lookup', 'order_customer_fact'], roles: FRONT_COUNTER, kind: 'read', readPlan: true, ...SAFE_READ },
  search_orders: { id: 'orders.search', domain: 'orders', intents: ['order_search'], roles: FRONT_COUNTER, kind: 'read', readPlan: true, ...SAFE_READ },
  list_orders: { id: 'orders.list', domain: 'orders', intents: ['orders_list', 'orders_status', 'orders_due', 'orders_period', 'created_today', 'overdue'], roles: FRONT_COUNTER, kind: 'read', readPlan: true, ...SAFE_READ },
  recent_order_creators: { id: 'orders.creators.recent', domain: 'orders', intents: ['orders_created_by'], roles: FRONT_COUNTER, kind: 'read', readPlan: true, ...SAFE_READ },
  check_stock: { id: 'products.stock.read', domain: 'products', intents: ['product_stock', 'low_stock'], roles: SHOP_OPERATIONS, kind: 'read', readPlan: true, ...SAFE_READ },
  check_product_price: { id: 'products.price.read', domain: 'products', intents: ['product_price'], roles: SHOP_OPERATIONS, kind: 'read', readPlan: true, ...SAFE_READ },
  analyze_reports: { id: 'reports.analyze', domain: 'reports', intents: ['report_period', 'sales', 'unpaid', 'stock_waste'], roles: MANAGEMENT, kind: 'read', readPlan: false, ...SAFE_READ },
  create_order: { id: 'orders.create', domain: 'orders', intents: ['order_create'], roles: FRONT_COUNTER, kind: 'write', ...CONSEQUENTIAL_WRITE },
  edit_order: { id: 'orders.edit', domain: 'orders', intents: ['order_edit'], roles: SHOP_OPERATIONS, kind: 'write', ...CONSEQUENTIAL_WRITE },
  delay_order: { id: 'orders.delay', domain: 'orders', intents: ['order_delay'], roles: SHOP_OPERATIONS, kind: 'write', ...CONSEQUENTIAL_WRITE },
  record_order_payment: { id: 'orders.payment', domain: 'orders', intents: ['order_payment'], roles: FRONT_COUNTER, refundRoles: MANAGEMENT, kind: 'write', ...CONSEQUENTIAL_WRITE },
  cancel_order: { id: 'orders.cancel', domain: 'orders', intents: ['order_cancel'], roles: MANAGEMENT, kind: 'write', impact: 'consequential', confirmation: 'review', undo: 'unsupported' },
  delete_order: { id: 'orders.delete', domain: 'orders', intents: ['order_delete'], roles: ['owner'], kind: 'write', impact: 'critical', confirmation: 'explicit_confirm', undo: 'unsupported' },
  get_business_overview: { id: 'business.overview', domain: 'dashboard', intents: ['overview'], roles: FRONT_COUNTER, kind: 'read', readPlan: false, ...SAFE_READ },
  find_customer: { id: 'customers.find', domain: 'customers', intents: ['customer_lookup'], roles: FRONT_COUNTER, kind: 'read', readPlan: false, ...SAFE_READ },
  find_supplier: { id: 'suppliers.find', domain: 'suppliers', intents: ['supplier_lookup'], roles: MANAGEMENT, kind: 'read', readPlan: false, ...SAFE_READ },
  list_deliveries: { id: 'deliveries.list', domain: 'deliveries', intents: ['deliveries', 'deliveries_period', 'overdue'], roles: ['owner', 'manager', 'florist', 'delivery'], kind: 'read', readPlan: true, ...SAFE_READ },
  cash_register_summary: { id: 'cash.read', domain: 'cash', intents: ['cash_register'], roles: ['owner'], kind: 'read', readPlan: false, ...SAFE_READ },
  guide_workflow: { id: 'workflow.guide', domain: 'navigation', intents: ['how_to'], roles: ALL_STAFF, kind: 'navigation', readPlan: false, ...SAFE_READ },
}

export const ASSISTANT_ACTION_CATALOG = Object.freeze(LOCAL_TOOL_DEFINITIONS.map((tool) => {
  const metadata = ACTION_METADATA[tool.function.name]
  if (!metadata) throw new Error(`Missing assistant catalog metadata: ${tool.function.name}`)
  return Object.freeze({
    ...metadata,
    toolName: tool.function.name,
    inputSchema: tool.function.parameters,
    toolDefinition: tool,
    enabled: true,
  })
}))
export const ASSISTANT_CATALOG_INTENTS = Object.freeze([...new Set(ASSISTANT_ACTION_CATALOG.flatMap((action) => action.intents))])

const actionByToolName = new Map(ASSISTANT_ACTION_CATALOG.map((action) => [action.toolName, action]))

export function getAssistantAction(toolName) {
  return actionByToolName.get(toolName) || null
}

export function getAssistantActionForIntent(intent) {
  if (!intent?.type) return null
  if (intent.type === 'deliveries' || intent.type === 'deliveries_period'
    || (intent.type === 'overdue' && intent.deliveryOnly)) return actionByToolName.get('list_deliveries') || null
  return ASSISTANT_ACTION_CATALOG.find((action) => action.intents.includes(intent.type)) || null
}

export function getAssistantActionRoles(action, intent) {
  if (!action) return []
  if (action.id === 'orders.payment' && intent?.action === 'refund') return action.refundRoles
  return action.roles
}

export function canRunAssistantAction(action, role, intent) {
  return Boolean(action?.enabled && getAssistantActionRoles(action, intent).includes(role))
}

// Fail closed if a new mutating tool is added without an explicit impact and
// confirmation policy. Confirmation is an interaction rule, never auth.
for (const action of ASSISTANT_ACTION_CATALOG) {
  if (action.kind === 'write' && (!action.impact || action.confirmation === 'none' || !action.undo)) {
    throw new Error(`Assistant write action is missing its safety policy: ${action.toolName}`)
  }
}

export function getAssistantTools(options = {}) {
  const { role, readOnly = false } = options
  const enforceRole = Object.hasOwn(options, 'role')
  return ASSISTANT_ACTION_CATALOG
    .filter((action) => action.enabled
      && (!readOnly || action.kind === 'read')
      && (!enforceRole || action.roles.includes(role) || action.refundRoles?.includes(role)))
    .map((action) => {
      // The payment tool also represents refunds. Do not advertise that
      // variant to roles that can take payments but cannot issue refunds.
      if (action.id !== 'orders.payment' || !role || action.refundRoles.includes(role)) return action.toolDefinition
      return {
        ...action.toolDefinition,
        function: {
          ...action.toolDefinition.function,
          parameters: {
            ...action.inputSchema,
            properties: {
              ...action.inputSchema.properties,
              action: { ...action.inputSchema.properties.action, enum: ['payment'] },
            },
          },
        },
      }
    })
}

export function getAssistantReadPlanTools(role) {
  return ASSISTANT_ACTION_CATALOG
    .filter((action) => action.enabled && action.readPlan && action.roles.includes(role))
    .map((action) => action.toolDefinition)
}

