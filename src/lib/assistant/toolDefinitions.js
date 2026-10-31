export const LOCAL_TOOL_DEFINITIONS = [
  {
    type: 'function', function: { name: 'lookup_order', description: 'Read one order by its order number. Use facts to return only the requested details; use full only when the user asks to see the whole order.', parameters: { type: 'object', properties: { order_number: { type: 'string' }, facts: { type: 'array', items: { type: 'string', enum: ['summary', 'full', 'order_number', 'client_name', 'client_phone', 'status', 'payment_status', 'payment_method', 'amount_paid', 'amount_due', 'total_amount', 'delivery_date', 'delivery_time', 'delivery_method', 'items', 'notes', 'created_at'] } } }, required: ['order_number'] } },
  },
  {
    type: 'function', function: { name: 'search_orders', description: 'Find orders by customer name, phone number, order amount, delivery date, or order status.', parameters: { type: 'object', properties: { term: { type: 'string' }, search_by: { type: 'string', enum: ['customer_name', 'phone', 'any'] }, amount: { type: 'number' }, minimum_amount: { type: 'number' }, maximum_amount: { type: 'number' }, comparator: { type: 'string', enum: ['exact', 'above', 'below', 'around'] } } } },
  },
  {
    type: 'function', function: { name: 'list_orders', description: 'List orders by delivery date, creation date, delivery run, or status.', parameters: { type: 'object', properties: { period: { type: 'string', enum: ['today', 'tomorrow', 'yesterday', 'this_week', 'last_week', 'this_month', 'all', 'overdue', 'created_today'] }, status: { type: 'string', enum: ['new', 'processing', 'done', 'cancelled', 'open', 'all'] }, date_field: { type: 'string', enum: ['delivery', 'created'] }, deliveries_only: { type: 'boolean' } }, required: ['period'] } },
  },
  {
    type: 'function', function: { name: 'recent_order_creators', description: 'Find who created the latest N Blossom orders. Use when asked who created, entered, or placed the most recent orders.', parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } } } },
  },
  {
    type: 'function', function: { name: 'check_stock', description: 'Check live product or flower stock, including quantity, availability, low-stock, and stock valuation.', parameters: { type: 'object', properties: { product: { type: 'string' }, scope: { type: 'string', enum: ['all', 'flowers'] }, availability: { type: 'string', enum: ['low', 'out', 'medium', 'healthy'] }, value_mode: { type: 'string', enum: ['retail_value', 'purchase_cost_unavailable'] } } } },
  },
  {
    type: 'function', function: { name: 'check_product_price', description: 'Look up a live catalog retail price for a product.', parameters: { type: 'object', properties: { product: { type: 'string' } }, required: ['product'] } },
  },
  {
    type: 'function', function: { name: 'analyze_reports', description: 'Analyze Blossom sales, revenue, order counts, or product performance for a time period.', parameters: { type: 'object', properties: { period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month'] }, question: { type: 'string' } }, required: ['period'] } },
  },
  {
    type: 'function', function: { name: 'create_order', description: 'Start a new order. This opens the guided order form; it does not save without the user reviewing and confirming.', parameters: { type: 'object', properties: { request: { type: 'string' } } } },
  },
  {
    type: 'function', function: { name: 'edit_order', description: 'Open an order for editing. The app requires review before changes are saved.', parameters: { type: 'object', properties: { order_number: { type: 'string' }, requested_change: { type: 'string' } }, required: ['requested_change'] } },
  },
  {
    type: 'function', function: { name: 'delay_order', description: 'Prepare a delivery date change for a specific order. The user reviews and saves the change.', parameters: { type: 'object', properties: { order_number: { type: 'string' }, delivery_date: { type: 'string' }, reason: { type: 'string' } }, required: ['order_number'] } },
  },
  {
    type: 'function', function: { name: 'record_order_payment', description: 'Prepare a payment or refund for an order. The user must review and confirm before saving.', parameters: { type: 'object', properties: { order_number: { type: 'string' }, action: { type: 'string', enum: ['payment', 'refund'] }, amount: { type: 'number' }, full: { type: 'boolean' }, method: { type: 'string', enum: ['cash', 'baridimob', 'usd'] } }, required: ['action'] } },
  },
  {
    type: 'function', function: { name: 'cancel_order', description: 'Prepare an order cancellation for user review and confirmation.', parameters: { type: 'object', properties: { order_number: { type: 'string' } }, required: ['order_number'] } },
  },
  {
    type: 'function', function: { name: 'delete_order', description: 'Request permanent deletion only when the user typed exactly pepepeace #<order-number>. The app will require a separate explicit confirmation.', parameters: { type: 'object', properties: { order_number: { type: 'string' }, delete_command: { type: 'string' } }, required: ['order_number', 'delete_command'] } },
  },
  {
    type: 'function', function: { name: 'get_business_overview', description: 'Get a current business overview with due orders, late orders, stock alerts, payments, and cash summary subject to the user role.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function', function: { name: 'find_customer', description: 'Find a customer record by name, phone, or email.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  },
  {
    type: 'function', function: { name: 'find_supplier', description: 'Find supplier records by company name or contact details. Supplier access is limited to owners and managers.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  },
  {
    type: 'function', function: { name: 'list_deliveries', description: 'List scheduled deliveries for a supported period or a specific YYYY-MM-DD date.', parameters: { type: 'object', properties: { period: { type: 'string', enum: ['today', 'tomorrow', 'yesterday', 'this_week', 'next_week', 'this_month', 'overdue'] }, date: { type: 'string' }, status: { type: 'string', enum: ['new', 'processing', 'done', 'all'] } } } },
  },
  {
    type: 'function', function: { name: 'cash_register_summary', description: 'Read cash register totals and transaction details for a date. Owner access only.', parameters: { type: 'object', properties: { date: { type: 'string' }, period: { type: 'string', enum: ['today', 'yesterday'] }, detail: { type: 'boolean' } } } },
  },
  {
    type: 'function', function: { name: 'guide_workflow', description: 'Explain how to perform a Blossom workflow without changing data.', parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } },
  },
]
