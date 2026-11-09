import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight, CalendarDays, CreditCard, Plus, ThumbsUp, ThumbsDown,
  Package, Send, Sparkles, Truck, X, Cpu, RefreshCw, Settings2,
  AlertTriangle, Check, CloudOff, Info, Lightbulb, Pause, Upload, UserRound, WifiOff, Wrench,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { canAccessRoute } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import { deleteOrder as deleteOrderWorkflow } from '../../lib/orders'
import { addCalendarDays, fetchAllRows, localDate } from '../../lib/assistant/dataAccess'
import { resolveQuestion } from '../../lib/assistant/queryService'
import { getAssistantActionForIntent } from '../../lib/assistant/actionCatalog'
import { AssistantDeleteOrder, AssistantDelayOrder, AssistantOrderEditor, AssistantPaymentAction, AssistantVoidOrder } from './AssistantOrderActions'
import { useCartContext } from '../../context/CartContext'
import { useSettings } from '../../hooks/useSettings'
import { useShopName } from '../../hooks/useShopName'
import { printOrderReceipt } from '../../utils/orderReceipt'
import { getLocalModelStatus } from '../../lib/localAssistantModel'
import { composeGroundedAssistantReply, routeAssistantTurn } from '../../lib/assistant/router'
import { completeConversationAction, emptyConversationContext, setConversationTask, updateConversationContext } from '../../lib/assistant/conversationState'
import { classifyQuestion, normalize, productSearchTerms, reportPeriodFromText } from '../../lib/assistant/intentEngine'
import { clearAssistantDraft, loadAssistantDraft, saveAssistantDraft } from '../../lib/assistant/draftRecovery'
import { clearAssistantDiagnostics, getAssistantDiagnostics, isAssistantDiagnosticsEnabled, recordAssistantFeedback, recordAssistantMetric, setAssistantDiagnosticsEnabled } from '../../lib/assistant/diagnostics'
import { loadAssistantPreferences, resetAssistantPreferences, saveAssistantPreferences } from '../../lib/assistant/preferences'





















const ORB_BADGES = {
  error: AlertTriangle, warning: AlertTriangle, insight: Info,
  proactive: Lightbulb, paused: Pause, update: Upload, connection: CloudOff,
  offline: WifiOff, settings: Wrench, busy: UserRound,
}
function AssistantFace({ size = 28, state = 'idle', className = '' }) {
  const visualState = state === 'thinking' || state === 'speaking' ? 'processing' : state
  const Badge = ORB_BADGES[visualState]
  const showEyes = !['success', 'disabled', 'offline', 'connection', 'busy', 'paused'].includes(visualState)
  return <span aria-hidden="true" data-state={visualState} className={`assistant-orb assistant-orb-${visualState} ${className}`} style={{ width: size, height: size }}>
    {visualState === 'listening' && <><i className="assistant-orb-wave assistant-orb-wave-left" /><i className="assistant-orb-wave assistant-orb-wave-right" /></>}
    <span className="assistant-orb-ring" />
    <span className="assistant-orb-core">
      {visualState === 'success' ? <Check className="assistant-orb-success-mark" size={Math.round(size * .48)} strokeWidth={3.5} /> : visualState === 'processing' ? <span className="assistant-orb-spinner" /> : showEyes ? <span className="assistant-orb-eyes"><i /><i /></span> : visualState === 'busy' ? <UserRound size={Math.round(size * .4)} className="assistant-orb-muted-symbol" /> : visualState === 'connection' ? <CloudOff size={Math.round(size * .44)} className="assistant-orb-muted-symbol" /> : <span className="assistant-orb-paused-eyes"><i /><i /></span>}
    </span>
    {visualState === 'disabled' && <span className="assistant-orb-disabled-slash" />}
    {Badge && size >= 25 && <span className={`assistant-orb-badge assistant-orb-badge-${visualState}`}><Badge size={Math.round(size * .36)} strokeWidth={2.8} /></span>}
    {visualState === 'idle' && size >= 25 && <span className="assistant-orb-status-dot" />}
  </span>
}

function createOrderDraft(initialPrompt = '') {
  return {
    step: 'products', items: [], customer_id: null, is_walk_in: false, client_name: '', client_phone: '', delivery_date: '', delivery_time: '',
    delivery_method: 'motorcycle', payment_method: 'cash', client_source: 'inhouse', notes: '', payment_notes: '', amount_paid: 0, amount_paid_usd: '', price_adjustment: 0, initialPrompt,
  }
}


function isClearQuestionDuringOrderDraft(prompt = '') {
  const text = normalize(prompt)
  if (/^(?:cancel order draft|resume order draft|continue order draft|pause order draft|cancel|resume|continue|pause)$/.test(text)) return false
  if (/^(?:(?:use|choose)\s+)?walk[ -]?in(?: customer)?$/.test(text)) return false
  return /^(?:what|who|how|when|where|which|show|find|search|check|tell me|list|open|do we|does|is there|are there|can you|could you|status|payment|sales|revenue|stock|inventory|price|edit|update|change|delay|reschedule|cancel order|delete order|record payment|create order|new order)\b/.test(text)
    || /^(?:in stock|payment status|order status|orders? due|sales|revenue|stock|inventory|price|payment|cash|delivery|client|customer)\b.*\?$/.test(text)
}

function isBareOrderCreation(prompt = '') {
  const text = normalize(prompt).replace(/[.!?]+$/g, '').trim()
  return /^(?:(?:(?:(?:please|can you|could you|let'?s|i want to|i need to|i'?d like to)\s+)?(?:create|make|place|start|build|prepare)(?:\s+me)?)(?:\s+(?:a|an))?(?:\s+(?:new|another))?\s+order|(?:(?:please|i need|i want|give me)\s+)?(?:a\s+)?(?:new|another)\s+order|order new)$/i.test(text)
}

function orderDraftQuestion(draft, text = '') {
  const itemSummary = draft.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')
  const question = {
    products: draft.items.length
      ? `I’ve added ${itemSummary}. What else should go in the order? Say “done” when the products are complete.`
      : 'What products should go in the order? Include quantities, for example “12 red roses”.',
    customer: 'Who is the order for? Give me the customer’s name or phone, or say “walk-in”.',
    schedule: draft.is_walk_in ? 'Walk-in pickup is set. When should the order be ready? Say “now” or give a time.' : 'Should this be delivery or pickup, and when should it be ready? For example, “deliver tomorrow at 3 pm”.',
    payment_method: 'How will they pay: cash, BaridiMob, or USDT?',
    payment_amount: 'How much are they paying now? Give an amount, or say “none” if they will pay later.',
    notes: 'Any delivery address, card message, or other order note? Say “skip” if there are none.',
    review: 'The order is ready for you to review.',
  }[draft.step]
  const choices = {
    products: draft.items.length ? [{ label: 'Done adding products', answer: 'done' }] : undefined,
    customer: [{ label: 'Walk-in customer', answer: 'walk-in' }],
    notes: [{ label: 'No notes', answer: 'skip' }],
    schedule: undefined,
  }[draft.step]
  return {
    title: '',
    text: text ? `${text} ${question}` : question,
    choices,
    suppressSuggestions: true,
  }
}

function orderFingerprint(order) {
  if (!order) return null
  return JSON.stringify({
    id: order.id,
    customer: [order.client_name, order.client_phone, order.customer_id],
    delivery: [order.delivery_date, order.delivery_time, order.delivery_method],
    status: [order.status, order.payment_method, order.notes],
    totals: [order.total_amount, order.amount_paid, order.price_adjustment],
    items: (order.order_items || []).map((item) => [item.id, item.product_id, item.quantity, item.unit_price]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  })
}

function nextOrderDraftStep(draft, step) {
  return { ...draft, step }
}

function extractProductQuantity(answer) {
  const match = answer.trim().match(/^(?:(?:add|with|please add)\s+)?(\d+)\s+(.+)$/i)
  return { quantity: match ? Math.max(1, Number(match[1])) : 1, productName: (match?.[2] || answer).replace(/[?.!,]+$/g, '').trim() }
}

async function answerOrderDraft(draft, answer, role, cachedProducts = [], usdExchangeRate = 0) {
  const value = answer.trim()
  const normalized = normalize(value)
  if (/^(cancel|cancel order(?: draft)?|stop|start over)$/i.test(normalized)) {
    return { draft: null, response: { title: 'Order draft cancelled', text: 'No order was created. You can start again whenever you’re ready.', suppressSuggestions: true } }
  }
  if (/^(resume|continue|resume order draft|continue order draft)$/i.test(normalized)) return { draft, response: orderDraftQuestion(draft, 'Your order draft is ready to continue.') }
  if (/^(pause|pause order draft)$/i.test(normalized)) return { draft, response: { title: 'Order draft paused', text: 'Nothing has been saved. Ask your next question, then choose Resume order to continue.', suppressSuggestions: true } }
  const skipped = /^(skip|none|no|no thanks|done)$/i.test(normalized)

  if (draft.step === 'products') {
    if (/^(done|finish|that'?s all|no more)$/i.test(normalized) && draft.items.length) {
      return { draft: nextOrderDraftStep(draft, 'customer'), response: orderDraftQuestion(nextOrderDraftStep(draft, 'customer')) }
    }
    const { quantity, productName } = extractProductQuantity(value)
    const terms = productSearchTerms(productName).filter((term) => !['add', 'with', 'please', 'of', 'the', 'a', 'an', 'product', 'products', 'item', 'items'].includes(term))
    if (!terms.length) return { draft, response: orderDraftQuestion(draft, 'Tell me a product name and quantity, or say “done” if you have added everything.') }
    const data = cachedProducts.length ? cachedProducts : await fetchAllRows((from, to) => supabase.from('products')
      .select('product_id, item_name, retail_price, stock_level, color, flower_type, category, image_url')
      .eq('is_active', true).order('item_name').order('product_id').range(from, to), 500)
    const matches = data.filter((product) => {
      const searchable = normalize(`${product.item_name} ${product.color || ''} ${product.flower_type || ''} ${product.category || ''}`)
      return terms.every((term) => searchable.includes(term) || (term.endsWith('s') && searchable.includes(term.slice(0, -1))))
    })
    if (matches.length !== 1) {
      const response = matches.length > 1
        ? { title: '', text: `I found ${matches.length} matching products. Which one should I add?`, choices: matches.slice(0, 5).map((product) => ({ label: `${product.item_name}${product.color ? ` · ${product.color}` : ''}`, answer: `${quantity} ${product.item_name} ${product.color || ''}`.trim() })), suppressSuggestions: true }
        : orderDraftQuestion(draft, `I couldn’t find “${productName}” in the active product catalog. Try its catalog name or a shorter description.`)
      return { draft, response }
    }
    const product = matches[0]
    const item = {
      product_id: product.product_id, name: product.item_name, quantity,
      unit_price: Math.round(Number(product.retail_price || 0)), image_url: product.image_url || '',
      color: product.color || '', flower_type: product.flower_type || '', category: product.category || '',
    }
    const existing = draft.items.find((line) => String(line.product_id) === String(item.product_id))
    const items = existing
      ? draft.items.map((line) => String(line.product_id) === String(item.product_id) ? { ...line, quantity: line.quantity + quantity } : line)
      : [...draft.items, item]
    const updated = { ...draft, items }
    return { draft: updated, response: orderDraftQuestion(updated) }
  }

  if (draft.step === 'customer') {
    if (/^(?:(?:use|choose)\s+)?walk[ -]?in(?: customer)?$|^(no customer|skip customer)$/i.test(normalized)) {
      const updated = nextOrderDraftStep({ ...draft, customer_id: null, client_name: 'Walk-in Customer', client_phone: '', is_walk_in: true, delivery_date: '', delivery_time: '', delivery_method: 'pickup' }, 'schedule')
      return { draft: updated, response: orderDraftQuestion(updated, 'Walk-in pickup selected.') }
    }
    if (!value || skipped) return { draft, response: orderDraftQuestion(draft, 'Choose a customer name or use the walk-in option.') }
    const safeCustomerSearch = value.replace(/[,()%_*]/g, ' ').trim()
    const { data, error } = await supabase.from('customers').select('customer_id, full_name, phone').or(`full_name.ilike.%${safeCustomerSearch}%,phone.ilike.%${safeCustomerSearch}%`).limit(8)
    if (error) throw error
    const normalizedValue = normalize(value)
    const exact = (data || []).filter((customer) => normalize(`${customer.full_name || ''} ${customer.phone || ''}`) === normalizedValue)
    const matches = exact.length ? exact : (data || []).filter((customer) => normalize(customer.full_name || '').includes(normalizedValue) || normalize(customer.phone || '').includes(normalizedValue))
    if (matches.length > 1) return { draft, response: { text: `I found ${matches.length} customers matching “${value}”. Which customer is this for?`, choices: matches.slice(0, 5).map((customer) => ({ label: `${customer.full_name}${customer.phone ? ` · ${customer.phone}` : ''}`, answer: customer.phone || customer.full_name })), suppressSuggestions: true } }
    if (matches.length !== 1) return { draft, response: orderDraftQuestion(draft, `I couldn’t find “${value}” in your customer records. Try their phone number, another spelling, or say “walk-in”.`) }
    const customer = matches[0]
    const updated = nextOrderDraftStep({ ...draft, customer_id: customer.customer_id, is_walk_in: false, client_name: customer.full_name, client_phone: customer.phone || '' }, 'schedule')
    return { draft: updated, response: orderDraftQuestion(updated, `Found ${customer.full_name}.`) }
  }

  if (draft.step === 'schedule') {
    let deliveryDate = ''
    let deliveryTime = ''
    if (!skipped) {
      const isoDate = value.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]
      const parsedDate = reportPeriodFromText(value)?.startDate
      const relativeDay = /\btomorrow\b/i.test(value) ? 1 : /\btoday\b/i.test(value) ? 0 : null
      if (isoDate || parsedDate) deliveryDate = isoDate || parsedDate
      else if (relativeDay !== null) deliveryDate = addCalendarDays(localDate(), relativeDay)
      const timeMatch = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
      if (timeMatch) {
        let hour = Number(timeMatch[1])
        const suffix = timeMatch[3]?.toLowerCase()
        if (suffix === 'pm' && hour < 12) hour += 12
        if (suffix === 'am' && hour === 12) hour = 0
        deliveryTime = `${String(hour).padStart(2, '0')}:${timeMatch[2] || '00'}`
      }
      if (!deliveryDate && !deliveryTime && !/\b(pickup|pick up|collect|collection|now|today)\b/i.test(value)) return { draft, response: orderDraftQuestion(draft, 'I couldn’t read a date or time. Try “tomorrow at 3 pm”, “pickup today”, or “now”.') }
    }
    const method = /\b(pickup|pick up|collect|collection|now)\b/i.test(value) ? 'pickup' : /\bdhd\b/i.test(value) ? 'dhd' : /\b(motorcycle|bike)\b/i.test(value) ? 'motorcycle' : draft.delivery_method
    const updated = { ...draft, delivery_date: deliveryDate, delivery_time: deliveryTime, delivery_method: method }
    const next = nextOrderDraftStep(updated, 'payment_method')
    return { draft: next, response: orderDraftQuestion(next, `${method === 'pickup' ? 'Pickup' : 'Delivery'} details noted.`) }
  }

  if (draft.step === 'payment_method') {
    const payment = /\b(usdt|usd|dollars?)\b/i.test(value) ? 'usd' : /\b(baridi ?mob)\b/i.test(value) ? 'baridimob' : /\bcash\b/i.test(value) ? 'cash' : null
    if (!payment) return { draft, response: orderDraftQuestion(draft, 'Please choose cash, BaridiMob, or USDT.') }
    if (payment === 'usd' && !usdExchangeRate) return { draft, response: orderDraftQuestion(draft, 'USDT is unavailable until an exchange rate is set in Settings. Choose cash or BaridiMob for this order.') }
    const inlineAmount = value.match(/\d+(?:\.\d{1,2})?/)
    if (inlineAmount) {
      const amount = Number(inlineAmount[0])
      const total = draft.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) + Number(draft.price_adjustment || 0)
      const amountPaid = payment === 'usd' ? Math.round(amount * usdExchangeRate) : Math.round(amount)
      if (amountPaid > total) return { draft, response: orderDraftQuestion(draft, `That exceeds the ${total.toLocaleString('fr-FR')} DA order total. Choose the payment method and enter a smaller amount.`) }
      const next = nextOrderDraftStep({ ...draft, payment_method: payment, amount_paid: amountPaid, amount_paid_usd: payment === 'usd' ? String(amount) : '' }, 'notes')
      return { draft: next, response: orderDraftQuestion(next, `${payment === 'usd' ? 'USDT' : payment === 'baridimob' ? 'BaridiMob' : 'Cash'} selected. I’ll record ${amount.toLocaleString('fr-FR')} ${payment === 'usd' ? 'USDT' : 'DA'} collected.`) }
    }
    const next = nextOrderDraftStep({ ...draft, payment_method: payment }, 'payment_amount')
    return { draft: next, response: orderDraftQuestion(next, `${payment === 'usd' ? 'USDT' : payment === 'baridimob' ? 'BaridiMob' : 'Cash'} selected.`) }
  }

  if (draft.step === 'payment_amount') {
    const amountMatch = value.match(/\d+(?:\.\d{1,2})?/)
    if (!amountMatch && !skipped) return { draft, response: orderDraftQuestion(draft, 'Give the amount collected now, or say “none”.') }
    const amount = amountMatch ? Number(amountMatch[0]) : 0
    const total = draft.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) + Number(draft.price_adjustment || 0)
    const amountPaid = draft.payment_method === 'usd' ? Math.round(amount * usdExchangeRate) : Math.round(amount)
    if (amountPaid > total) return { draft, response: orderDraftQuestion(draft, `That exceeds the ${total.toLocaleString('fr-FR')} DA order total. Enter a smaller amount or say “none”.`) }
    const next = nextOrderDraftStep({ ...draft, amount_paid: amountPaid, amount_paid_usd: draft.payment_method === 'usd' ? String(amount) : '' }, 'notes')
    return { draft: next, response: orderDraftQuestion(next, amountPaid ? `I’ll record ${amount.toLocaleString('fr-FR')} ${draft.payment_method === 'usd' ? 'USDT' : 'DA'} collected.` : 'No payment will be recorded yet.') }
  }

  if (draft.step === 'notes') {
    const updated = { ...draft, notes: skipped ? '' : value, step: 'review' }
    const paymentNotes = updated.payment_method === 'usd' && updated.amount_paid > 0
      ? `${Number(updated.amount_paid_usd || 0).toFixed(2)} USDT at ${usdExchangeRate} DA/USDT = ${updated.amount_paid} DA`
      : updated.payment_notes || ''
    const readyDraft = { ...updated, payment_notes: paymentNotes }
    return { draft: null, response: { title: 'Review your order', text: `Here’s the order I prepared: ${readyDraft.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')} for ${readyDraft.is_walk_in ? 'walk-in' : readyDraft.client_name}. Total ${readyDraft.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0).toLocaleString('fr-FR')} DA. Review the details below before I save it.`, orderForm: { mode: 'create', role, initialDraft: readyDraft }, suppressSuggestions: true } }
  }

  return { draft, response: orderDraftQuestion(draft) }
}







const ROUTE_HINTS = {
  '/dashboard': [
    { label: 'Give me the business pulse', prompt: 'Give me a business overview', icon: Sparkles },
    { label: 'What needs restocking?', prompt: 'Which products are low on stock?', icon: Package, productAccess: true },
    { label: "What’s due today?", prompt: 'What orders do we have today?', icon: CalendarDays },
    { label: 'Open reports', prompt: 'Show me the reports area', icon: ArrowUpRight, path: '/reports' },
  ],
  '/orders': [
    { label: 'Create an order', prompt: 'Create a new order', icon: Package },
    { label: 'Record a payment', prompt: 'Record a payment', icon: CreditCard },
    { label: 'Who still owes?', prompt: 'Which orders have unpaid balances?', icon: CreditCard, financial: true },
    { label: "What’s due today?", prompt: 'What orders do we have today?', icon: CalendarDays },
    { label: 'Anything running late?', prompt: 'Show overdue orders', icon: Truck },
  ],
  '/delivery': [
    { label: 'What’s going out today?', prompt: 'Show today’s delivery run', icon: Truck },
    { label: 'What’s going out tomorrow?', prompt: 'Show tomorrow’s delivery run', icon: CalendarDays },
    { label: 'Anything running late?', prompt: 'Show overdue orders', icon: CalendarDays },
  ],
  '/products': [
    { label: 'What needs restocking?', prompt: 'Which products are low on stock?', icon: Package, productAccess: true },
    { label: 'Check a product price', prompt: 'What is the price of red roses?', icon: CreditCard, productAccess: true },
    { label: "What’s due today?", prompt: 'What orders do we have today?', icon: CalendarDays },
    { label: 'Help me create an order', prompt: 'How do I create an order?', icon: ArrowUpRight },
  ],
  '/customers': [
    { label: 'How do I find someone?', prompt: 'How do I find a customer?', icon: ArrowUpRight },
    { label: 'Orders due today', prompt: 'What orders do we have today?', icon: CalendarDays },
    { label: 'Start a quick sale', prompt: 'Show me quick sale', icon: ArrowUpRight, path: '/cart?mode=quick_sale' },
  ],
  '/suppliers': [
    { label: 'Receive new stock', prompt: 'How do I receive stock from a supplier?', icon: Package },
    { label: 'What needs restocking?', prompt: 'Which products are low on stock?', icon: Package, productAccess: true },
    { label: 'Open products', prompt: 'Show me products', icon: ArrowUpRight, path: '/products' },
  ],
  '/reports': [
    { label: 'Give me the business pulse', prompt: 'Give me a business overview', icon: Sparkles },
    { label: 'Today’s order value', prompt: 'What is today’s order value?', icon: CreditCard, financial: true },
    { label: 'Open orders', prompt: 'Show me orders', icon: ArrowUpRight, path: '/orders' },
  ],
  '/team': [
    { label: 'How do staff roles work?', prompt: 'Explain staff roles and access', icon: ArrowUpRight },
    { label: 'Open settings', prompt: 'Show me settings', icon: ArrowUpRight, path: '/settings' },
  ],
  '/settings': [
    { label: 'How do staff roles work?', prompt: 'Explain staff roles and access', icon: ArrowUpRight },
    { label: 'Open reports', prompt: 'Show me reports', icon: ArrowUpRight, path: '/reports' },
  ],
  '/cart': [
    { label: 'How do quick sales work?', prompt: 'How do I make a quick sale?', icon: ArrowUpRight },
    { label: 'Start a quick sale', prompt: 'Show me quick sale', icon: ArrowUpRight, path: '/cart?mode=quick_sale' },
    { label: 'How do I finish an order?', prompt: 'How do I complete an order from the cart?', icon: ArrowUpRight },
    { label: 'What came in today?', prompt: 'Show orders created today', icon: CalendarDays },
    { label: 'What’s due today?', prompt: 'What orders do we have today?', icon: CalendarDays },
    { label: 'What needs restocking?', prompt: 'Which products are low on stock?', icon: Package, productAccess: true },
    { label: 'Open orders', prompt: 'Show me orders', icon: ArrowUpRight, path: '/orders' },
  ],
  '/coffre-forte': [
    { label: 'What came in today?', prompt: 'Show orders created today', icon: CalendarDays },
    { label: 'What’s today’s order value?', prompt: 'What is today’s sales value?', icon: CreditCard, financial: true },
    { label: 'Who still owes?', prompt: 'Which orders have unpaid balances?', icon: CreditCard, financial: true },
  ],
}

const DEFAULT_HINTS = [
  { label: 'Give me the business pulse', prompt: 'Give me a business overview', icon: Sparkles },
  { label: "What’s due today?", prompt: 'What orders do we have today?', icon: CalendarDays },
  { label: 'What’s going out?', prompt: 'Show today’s delivery run', icon: Truck },
  { label: 'What needs restocking?', prompt: 'Which products are low on stock?', icon: Package, productAccess: true },
  { label: 'Who still owes?', prompt: 'Which orders have unpaid balances?', icon: CreditCard, financial: true },
]



function greetingResponse(prompt, profile) {
  const rawFirstName = profile?.full_name?.trim().split(/\s+/)[0]
  const firstName = rawFirstName ? rawFirstName[0].toLocaleUpperCase() + rawFirstName.slice(1) : ''
  const source = String(prompt || '').trim()
  const normalizedSource = normalize(source).replace(/[,.!?]+/g, ' ').replace(/\s+/g, ' ').trim()
  const name = firstName ? `, ${firstName}` : ''
  if (/^(?:(?:hey|hi|hello|hiya|howdy)\s+)?(?:how are you(?: doing)?|how is it going|what is up|are you (?:good|okay|ok|well|doing well)|you good|what about you|how(?:'s| is) your day)$/.test(normalizedSource)) {
    return { title: `I’m doing well, thanks for asking${name}.`, text: 'What can I help you with?' }
  }
  const explicit = source.match(/\b(good morning|morning|good afternoon|afternoon|good evening|evening|good night|bonjour|bonsoir|salut|salam|salaam|marhaba)\b/i)?.[1]
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'good morning' : hour < 17 ? 'good afternoon' : hour < 21 ? 'good evening' : 'good evening'
  const normalizedExplicit = explicit?.toLowerCase()
  const greeting = normalizedExplicit === 'bonjour' ? 'Bonjour'
    : normalizedExplicit === 'bonsoir' ? 'Bonsoir'
      : ['salut', 'salam', 'salaam', 'marhaba'].includes(normalizedExplicit) ? explicit[0].toUpperCase() + explicit.slice(1)
        : explicit ? explicit[0].toUpperCase() + explicit.slice(1)
          : `Hey, ${timeGreeting}`
  return {
    title: `${greeting}${name}.`,
    text: 'What can I help you with?',
  }
}









// Final arbitration prevents broad fallback intents from overriding a
// customer/order question or silently assuming a date the user never gave.


function nextQuestionsFor(type, role, entity = {}) {
  const orderNumber = entity.orderNumber ? String(entity.orderNumber) : ''
  if (orderNumber && ['order_lookup', 'order_customer_fact', 'order_search', 'orders_status'].includes(type)) {
    return [
      { label: 'Items in this order', prompt: `What items are in order ${orderNumber}?` },
      { label: 'Payment status', prompt: `What is the payment status of order ${orderNumber}?` },
      { label: 'Delivery details', prompt: `When is order ${orderNumber} due?` },
    ]
  }
  if (entity.productName && ['product_stock', 'product_price'].includes(type)) {
    const product = entity.productName
    return [
      { label: 'Check this product’s stock', prompt: `How many ${product} do I have in stock?` },
      { label: 'Check this product’s price', prompt: `What is the price of ${product}?` },
      { label: 'Low-stock products', prompt: 'Which products are low on stock?' },
    ]
  }
  if (entity.supplierName && type === 'supplier_lookup') {
    const supplier = entity.supplierName
    return [
      { label: 'Purchase history', prompt: `What did we buy from supplier ${supplier}?` },
      { label: 'Payment history', prompt: `Show payment history for supplier ${supplier}` },
      { label: 'Find another supplier', prompt: 'Find a supplier' },
    ]
  }
  const questions = {
    orders_due: [
      { label: 'See tomorrow', prompt: 'What orders do we have tomorrow?' },
      { label: 'Check deliveries', prompt: 'Show today’s delivery run' },
      { label: 'Anything late?', prompt: 'Show overdue orders' },
    ],
    deliveries: [
      { label: 'See tomorrow’s run', prompt: 'Show tomorrow’s delivery run' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
      { label: 'Anything late?', prompt: 'Show overdue orders' },
    ],
    overdue: [
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
      { label: 'Today’s deliveries', prompt: 'Show today’s delivery run' },
      { label: 'Check low stock', prompt: 'Which products are low on stock?' },
    ],
    low_stock: [
      { label: 'Open products', prompt: 'How do I manage products?' },
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
      { label: 'Today’s deliveries', prompt: 'Show today’s delivery run' },
    ],
    product_stock: [
      { label: 'Check low-stock alerts', prompt: 'Which products are low on stock?' },
      { label: 'See all products', prompt: 'Show me products' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
    ],
    product_price: [
      { label: 'Check current stock', prompt: 'How many red roses do I have?' },
      { label: 'What needs restocking?', prompt: 'Which products are low on stock?' },
      { label: 'See all products', prompt: 'Show me products' },
    ],
    unpaid: [
      { label: 'Today’s order value', prompt: 'What is today’s order value?' },
      { label: 'Orders created today', prompt: 'Show orders created today' },
      { label: 'How do I find an order?', prompt: 'How do I find an order?' },
    ],
    sales: [
      { label: 'Who still owes?', prompt: 'Which orders have unpaid balances?' },
      { label: 'Orders created today', prompt: 'Show orders created today' },
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
    ],
    created_today: [
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
      { label: 'Today’s deliveries', prompt: 'Show today’s delivery run' },
      { label: 'Check low stock', prompt: 'Which products are low on stock?' },
    ],
    order_lookup: [
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
      { label: 'Check deliveries', prompt: 'Show today’s delivery run' },
      { label: 'How do I find an order?', prompt: 'How do I find an order?' },
    ],
    order_payment: [
      { label: 'Check unpaid orders', prompt: 'Which orders have unpaid balances?' },
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
      { label: 'Find another order', prompt: 'Find an order' },
    ],
    order_cancel: [
      { label: 'Show open orders', prompt: 'Show pending orders' },
      { label: 'Find another order', prompt: 'Find an order' },
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
    ],
    order_create: [
      { label: 'Create another order', prompt: 'Create a new order' },
      { label: 'Show open orders', prompt: 'Show pending orders' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
    ],
    order_edit: [
      { label: 'Find another order', prompt: 'Find an order' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
      { label: 'Record a payment', prompt: 'Record a payment' },
    ],
    order_delete: [
      { label: 'Create a new order', prompt: 'Create a new order' },
      { label: 'Show open orders', prompt: 'Show pending orders' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
    ],
    report_period: [
      { label: 'Compare with last week', prompt: 'Compare this week with last week' },
      { label: 'Top products', prompt: 'Which products sold the most this week?' },
      { label: 'Review orders', prompt: 'Show me this week’s orders' },
    ],
    orders_period: [
      { label: 'Analyze the period', prompt: 'How did sales perform this week?' },
      { label: 'Show tomorrow', prompt: 'What orders do we have tomorrow?' },
      { label: 'Find an order', prompt: 'Find an order' },
    ],
    order_search: [
      { label: 'Show open orders', prompt: 'Show pending orders' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
      { label: 'Show processing orders', prompt: 'Show processing orders' },
    ],
    orders_status: [
      { label: 'Show processing orders', prompt: 'Show processing orders' },
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
      { label: 'Show overdue orders', prompt: 'Show overdue orders' },
    ],
    how_to: [
      { label: 'What’s due today?', prompt: 'What orders do we have today?' },
      { label: 'Check low stock', prompt: 'Which products are low on stock?' },
      { label: 'How do I find an order?', prompt: 'How do I find an order?' },
    ],
    help: [
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
      { label: 'Today’s deliveries', prompt: 'Show today’s delivery run' },
      { label: 'Check low stock', prompt: 'Which products are low on stock?' },
    ],
    overview: [
      { label: 'Open today’s orders', prompt: 'What orders do we have today?' },
      { label: 'Check deliveries', prompt: 'Show today’s delivery run' },
      { label: 'Review stock alerts', prompt: 'Which products are low on stock?' },
    ],
    capabilities: [
      { label: 'Give me the business pulse', prompt: 'Give me a business overview' },
      { label: 'How do I find an order?', prompt: 'How do I find an order?' },
      { label: 'What needs restocking?', prompt: 'Which products are low on stock?' },
    ],
    customer_lookup: [
      { label: 'Today’s orders', prompt: 'What orders do we have today?' },
      { label: 'How do I find an order?', prompt: 'How do I find an order?' },
      { label: 'Open customers', prompt: 'How do I find a customer?' },
    ],
  }
  const selected = questions[type] || questions.help
  const canSeeFinancials = role === 'owner' || role === 'manager'
  return selected.filter((item) => {
    const itemIntent = classifyQuestion(item.prompt)
    const needsProducts = itemIntent.type === 'product_stock' || itemIntent.type === 'product_price' || itemIntent.type === 'low_stock' || /products/i.test(item.label)
    const needsFinancials = itemIntent.type === 'unpaid' || itemIntent.type === 'sales'
    const needsOrders = ['orders_due', 'deliveries', 'overdue', 'created_today', 'orders_list', 'orders_status', 'orders_period', 'order_search', 'order_lookup', 'order_create', 'order_edit', 'order_delete', 'order_cancel', 'order_payment'].includes(itemIntent.type)
    const needsReports = ['report_period', 'stock_waste'].includes(itemIntent.type)
    return (!needsFinancials || canSeeFinancials) && (!needsProducts || canAccessRoute(role, '/products')) && (!needsOrders || canAccessRoute(role, '/orders')) && (!needsReports || canAccessRoute(role, '/reports'))
  })
}

function AssistantMessage({ message, onNavigate, onRetry, onAnswer, onDeleteOrder, onCancelOrderAction, onDismissOrderAction, onCompleteAction, onOrderEditorDraftChange, onActionDraftChange, cartItems, role, usdExchangeRate, onFeedback }) {
  const isUser = message.from === 'user'
  const [showAllRows, setShowAllRows] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const visibleRows = showAllRows ? message.rows : message.rows?.slice(0, 5)
  const messageFaceState = message.isError ? 'error' : message.stat ? 'insight' : message.suggestions?.length ? 'proactive' : 'idle'
  const outcomeLabels = {
    forbidden: 'Access restricted', not_found: 'No match', needs_clarification: 'Needs a detail',
    validation_error: 'Check this detail', retryable_error: 'Could not load', partial_success: 'Partial results', unsupported: 'Not supported',
  }
  return (
    <div role="group" aria-label={isUser ? 'Your message' : 'Blossom assistant response'} className={`assistant-message-enter flex w-full items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FCE8F0] text-[#B52C64]"><AssistantFace size={19} state={messageFaceState} /></span>}
      <div className={`${isUser ? 'max-w-[86%] rounded-[15px] rounded-br-[5px] bg-[#A82E61] text-white' : 'w-[calc(100%-2rem)] max-w-none rounded-[14px] rounded-bl-[5px] border border-[#F1E3E9] bg-white text-[#394150] shadow-[0_2px_8px_rgba(90,43,63,0.035)]'} px-3.5 py-3 text-[13px] leading-[1.55]`}>
      {!isUser && message.outcome?.status && message.outcome.status !== 'success' && outcomeLabels[message.outcome.status] && <p className="mb-2 inline-flex rounded-full bg-[#FFF2F5] px-2 py-0.5 text-[10px] font-semibold text-[#8D2C57]">{outcomeLabels[message.outcome.status]}</p>}
      {!isUser && message.outcome?.interaction === 'action_completed' && <p role="status" className="mb-2 inline-flex rounded-full bg-[#EAF7EF] px-2 py-0.5 text-[10px] font-semibold text-[#25613A]">Completed</p>}
      {message.title && !message.stat && <p className={`mb-1 font-semibold ${isUser ? 'text-white' : 'text-[#512A45]'}`}>{message.title}</p>}
      {message.stat && <div className="mb-2.5 rounded-[10px] bg-[#FFF3F7] px-3 py-2.5"><p className="text-2xl font-semibold leading-none tracking-tight text-[#512A45]">{message.stat.value}</p><p className="mt-1 text-xs font-medium text-gray-600">{message.stat.label}</p></div>}
      {message.text && <p className={isUser ? 'text-white' : 'text-gray-600'}>{message.text}{message.isStreaming && <span className='ml-0.5 animate-pulse text-primary' aria-hidden='true'>▍</span>}</p>}{message.isStreaming && !message.text && <p className='text-xs text-gray-500' role='status'>Putting the live answer together…</p>}
      {message.steps?.length > 0 && <ol className="mt-2.5 space-y-2">{message.steps.map((step, index) => <li key={step} className="flex gap-2.5 text-xs text-gray-600"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-subtle text-[10px] font-bold text-accent-dark">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol>}
    {message.orderForm && <AssistantOrderEditor key={message.id} mode={message.orderForm.mode} order={message.orderForm.order} role={message.orderForm.role} initialPrompt={message.orderForm.initialPrompt} initialDraft={message.orderForm.initialDraft} cartItems={cartItems} usdExchangeRate={usdExchangeRate} onDraftChange={(draft) => onOrderEditorDraftChange(message.id, draft)} onCancel={() => onCancelOrderAction(message.id)} onSuccess={() => onCompleteAction(message.id, message.orderForm.mode === 'create' ? 'order_create' : 'order_edit', message.orderForm.mode === 'create' ? 'Order created successfully.' : `Order #${message.orderForm.order.order_number} updated successfully.`)} />}
      {message.deleteOrder && <AssistantDeleteOrder order={message.deleteOrder} onDelete={() => onDeleteOrder(message.deleteOrder.id, message.id, message.deleteOrder.deleteCommand)} onCancel={() => onCancelOrderAction(message.id)} />}
      {message.cancelOrder && <AssistantVoidOrder order={message.cancelOrder} initialReason={message.actionDraft?.reason} onDraftChange={(draft) => onActionDraftChange(draft)} onCancel={() => onCancelOrderAction(message.id)} onDone={() => onDismissOrderAction(message.id)} onSuccess={() => onCompleteAction(message.id, 'order_cancel', `Order #${message.cancelOrder.order_number} was cancelled. Its record is preserved.`)} />}
      {message.delayOrder && <AssistantDelayOrder key={message.id} order={message.delayOrder} role={role} initialDraft={message.actionDraft} onDraftChange={(draft) => onActionDraftChange(draft)} onCancel={() => onDismissOrderAction(message.id)} onSuccess={() => onCompleteAction(message.id, 'order_delay', `Order #${message.delayOrder.order_number} was rescheduled to ${message.delayOrder.requestedDeliveryDate}. The order status and payment are unchanged.`)} />}
      {message.paymentAction && <AssistantPaymentAction key={message.id} order={message.paymentAction.order} role={message.paymentAction.role} initialAmount={message.actionDraft?.amount ?? message.paymentAction.amount} initialAction={message.actionDraft?.action ?? message.paymentAction.action} initialMethod={message.actionDraft?.method ?? message.paymentAction.method} initialDraft={message.actionDraft} onDraftChange={(draft) => onActionDraftChange(draft)} onCancel={() => onCancelOrderAction(message.id)} onDone={() => onDismissOrderAction(message.id)} onSuccess={(data) => onCompleteAction(message.id, 'order_payment', `${message.paymentAction.action === 'refund' ? 'Refund' : 'Payment'} of ${Number(data.amount || 0).toLocaleString('fr-FR')} DA recorded for order #${message.paymentAction.order.order_number}. ${Number(data.amount_due || 0).toLocaleString('fr-FR')} DA remains due.`)} />}
      {message.draftNotice && <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[#F0DCE5] bg-[#FFF7FA] px-2.5 py-2 text-xs"><span className="font-medium text-[#75405A]">Order draft paused · nothing saved</span><div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => onAnswer('resume order draft')} className="rounded-md bg-white px-2 py-1 font-semibold text-primary">Resume</button><button type="button" onClick={() => onAnswer('cancel order draft')} className="rounded-md px-2 py-1 font-semibold text-gray-500">Discard</button></div></div>}
      {message.choices?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.choices.map((choice) => <button key={`${choice.label}-${choice.answer}`} type="button" onClick={() => onAnswer(choice.answer)} className="rounded-[9px] border border-[#F0DCE5] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#63334F] transition hover:border-[#D987A7] hover:bg-[#FFF3F7]">{choice.label}</button>)}</div>}
      {message.rows?.length > 0 && (
        <div aria-label="Results" className="mt-3 max-h-64 divide-y divide-[#F3E9ED] overflow-auto rounded-[10px] border border-[#F3E9ED] bg-white">
          {visibleRows.map((row) => {
            const actionable = Boolean(row.path && canAccessRoute(role, row.path.split('?')[0]))
            const Row = actionable ? 'button' : 'div'
            return <Row key={row.id} type={actionable ? 'button' : undefined} onClick={actionable ? () => onNavigate(row.path) : undefined} className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left ${actionable ? 'transition hover:bg-[#FFF7FA]' : ''}`}>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-800">{row.title}</p>
                {row.detail && <p className="mt-0.5 text-2xs text-gray-500">{row.detail}</p>}
              </div>
              {row.value && <span className="shrink-0 text-2xs font-semibold text-primary">{row.value}</span>}
            </Row>
          })}
        </div>
      )}
      {message.rows?.length > 5 && <button type="button" aria-expanded={showAllRows} onClick={() => setShowAllRows((value) => !value)} className="mt-2 rounded-md px-1 py-1 text-[11px] font-semibold text-[#8D2C57] underline-offset-2 hover:underline">{showAllRows ? 'Show fewer' : `Show ${message.rows.length - 5} more`}</button>}
      {message.actions?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.actions.map((action) => (
              <button key={action.label} type="button" onClick={() => action.prompt ? onAnswer(action.prompt) : onNavigate(action.path)} className="inline-flex items-center gap-1 rounded-lg bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
              {action.label}<ArrowUpRight size={12} aria-hidden="true" focusable="false" />
            </button>
          ))}
        </div>
      )}
      {message.retryPrompt && (
        <button type="button" onClick={() => onRetry(message.retryPrompt)} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-accent-subtle px-2.5 py-1.5 text-xs font-semibold text-accent-dark transition hover:bg-accent/15">
          Try again<ArrowUpRight size={12} />
        </button>
      )}
      {!isUser && message.outcome?.status !== 'retryable_error' && !message.isStreaming && (message.text || message.rows?.length || message.stat) && onFeedback && <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#F5EDF0] pt-2"><span className="mr-1 text-[10px] text-[#93838B]">Was this helpful?</span><button type="button" disabled={feedback !== null} onClick={() => { setFeedback(true); onFeedback(true, message) }} aria-label="Helpful answer" title="Helpful" className={`rounded-md p-1.5 transition hover:bg-[#FFF1F6] disabled:opacity-60 ${feedback === true ? 'text-[#A82E61]' : 'text-[#887780]'}`}><ThumbsUp size={13} aria-hidden="true" focusable="false" /></button><button type="button" disabled={feedback !== null} onClick={() => { setFeedback(false); onFeedback(false, message) }} aria-label="Answer needs work" title="Needs work" className={`rounded-md p-1.5 transition hover:bg-[#FFF1F6] disabled:opacity-60 ${feedback === false ? 'text-[#A82E61]' : 'text-[#887780]'}`}><ThumbsDown size={13} aria-hidden="true" focusable="false" /></button>{feedback !== null && <span role="status" className="text-[10px] text-[#7B6A73]">Thanks for the feedback.</span>}</div>}
      </div>
    </div>
  )
}

const ACTIVITY_COPY = {
  thinking: ['Thinking', 'Understanding your question'],
  checking: ['Checking Blossom', 'Looking at your live workspace data'],
  writing: ['Writing a reply', 'Putting the answer together'],
  holding: ['Still checking', 'This is taking a little longer than usual'],
}

function AssistantActivity({ state }) {
  const [label, detail] = ACTIVITY_COPY[state] || ACTIVITY_COPY.checking
  return <div className="assistant-message-enter flex items-end gap-2.5" role="status" aria-live="polite">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FCE8F0] text-[#B52C64]"><AssistantFace size={19} state={state === 'writing' ? 'speaking' : 'thinking'} /></span>
    <div className="rounded-[12px] rounded-bl-[5px] border border-[#F1E3E9] bg-white px-3.5 py-2.5">
      <div className="flex items-center gap-2"><span className="flex gap-1"><i className="assistant-dot h-1.5 w-1.5 rounded-full bg-[#C84D7D]" /><i className="assistant-dot h-1.5 w-1.5 rounded-full bg-[#C84D7D] [animation-delay:140ms]" /><i className="assistant-dot h-1.5 w-1.5 rounded-full bg-[#C84D7D] [animation-delay:280ms]" /></span><span className="text-xs font-semibold text-[#512A45]">{label}</span></div>
      <p className="mt-0.5 text-[10px] text-gray-500">{detail}</p>
    </div>
  </div>
}

export default function BlossomAssistant() {
  const { user, profile, role } = useAuth()
  const { items: cartItems } = useCartContext()
  const { settings } = useSettings()
  const shopName = useShopName()
  const usdExchangeRate = Number(settings.usd_exchange_rate) || 0
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [fullyClosed, setFullyClosed] = useState(false)
  const [launcherMenuOpen, setLauncherMenuOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [chatState, setChatState] = useState('idle')
  const [inputFocused, setInputFocused] = useState(false)
  const [faceFeedback, setFaceFeedback] = useState('idle')
  const busy = chatState !== 'idle'
  const [messages, setMessages] = useState([])
  const [orderDraft, setOrderDraft] = useState(null)
  const [productCatalog, setProductCatalog] = useState([])
  const [lastIntent, setLastIntent] = useState(null)
  const [lastAnswer, setLastAnswer] = useState(null)
  const [conversationContext, setConversationContext] = useState(emptyConversationContext)
  const draftHydratedForRef = useRef('')
  const [localModelStatus, setLocalModelStatus] = useState({ available: false, models: [], loading: false })
  const [selectedLocalModel, setSelectedLocalModel] = useState(() => localStorage.getItem('blossom.localAssistantModel') || '')
  const [useLocalModel, setUseLocalModel] = useState(() => localStorage.getItem('blossom.useLocalAssistantModel') !== 'false')
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [assistantPreferences, setAssistantPreferences] = useState(() => loadAssistantPreferences(user?.id))
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(isAssistantDiagnosticsEnabled)
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState(getAssistantDiagnostics)
  const panelRef = useRef(null)
  const launcherMenuRef = useRef(null)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const holdTimerRef = useRef(null)
  const faceFeedbackTimerRef = useRef(null)
  const activeUserIdRef = useRef(`${user?.id}:${role}`)
  const requestVersionRef = useRef(0)
  const canSeeFinancials = role === 'owner' || role === 'manager'
  const lastAssistantMessage = messages.at(-1)?.from === 'assistant' ? messages.at(-1) : null
  const faceState = showModelSettings ? 'settings' : busy ? (chatState === 'writing' ? 'speaking' : 'thinking') : inputFocused ? 'listening' : faceFeedback !== 'idle' ? faceFeedback : lastAssistantMessage?.isError ? 'error' : lastAssistantMessage?.stat ? 'insight' : lastAssistantMessage?.suggestions?.length ? 'proactive' : useLocalModel && localModelStatus.error ? 'warning' : 'idle'
  const flashFace = (state, duration = 900) => {
    clearTimeout(faceFeedbackTimerRef.current)
    setFaceFeedback(state)
    faceFeedbackTimerRef.current = window.setTimeout(() => setFaceFeedback('idle'), duration)
  }

  useEffect(() => () => clearTimeout(faceFeedbackTimerRef.current), [])

  const suggestions = useMemo(() => {
    const hints = ROUTE_HINTS[pathname] || DEFAULT_HINTS
    return hints.filter((hint) => (!hint.financial || canSeeFinancials) && (!hint.productAccess || canAccessRoute(role, '/products')) && (!hint.path || canAccessRoute(role, hint.path)))
  }, [pathname, canSeeFinancials, role])
  useEffect(() => {
    const identity = `${user?.id}:${role}`
    const changed = activeUserIdRef.current !== identity
    activeUserIdRef.current = identity
    if (!changed) return
    requestVersionRef.current += 1
    setMessages([])
    setOrderDraft(null)
    setQuestion('')
    setChatState('idle')
    clearTimeout(holdTimerRef.current)
    setLastIntent(null)
    setLastAnswer(null)
    setConversationContext(emptyConversationContext())
    setAssistantPreferences(loadAssistantPreferences(user?.id))
    draftHydratedForRef.current = ''
  }, [user?.id, role])

  const isChoosingOrderProducts = orderDraft?.step === 'products'
  useEffect(() => {
    if (!user?.id) return
    const identity = `${user.id}:${role}`
    if (draftHydratedForRef.current === identity) return
    draftHydratedForRef.current = identity
    const saved = loadAssistantDraft(user.id, role)
    if (!saved) return
    if (saved.kind === 'order_create' && saved.orderDraft) {
      setOrderDraft(saved.orderDraft)
      setMessages([{ id: `${Date.now()}-draft-resume`, from: 'assistant', title: 'Your order draft is ready', text: 'I restored your unsaved order from this browser session. Continue where you left off; nothing has been saved to the order yet.', suggestions: [] }])
      return
    }
    if (saved.kind === 'order_editor' && saved.orderForm) {
      const restoredForm = saved.orderForm
      const resume = async () => {
        let order = restoredForm.order || null
        if (restoredForm.mode === 'edit') {
          const { data, error } = await supabase.from('orders')
            .select('id, order_number, client_name, client_phone, customer_id, delivery_date, delivery_time, delivery_method, payment_method, payment_status, amount_paid, amount_due, total_amount, price_adjustment, notes, status, order_items(id, product_id, quantity, unit_price, product_name, products(item_name))')
            .eq('id', restoredForm.orderId).maybeSingle()
          if (error || !data) {
            setMessages([{ id: `${Date.now()}-draft-resume-error`, from: 'assistant', title: 'Order draft needs attention', text: 'I couldn’t reload the current order. Your changes are still saved in this browser session; reopen the order and try again.', suggestions: [] }])
            return
          }
          order = data
        }
        if (restoredForm.mode === 'edit' && saved.orderFingerprint && saved.orderFingerprint !== orderFingerprint(order)) {
          clearAssistantDraft(user.id, role)
          setMessages([{ id: `${Date.now()}-draft-conflict`, from: 'assistant', title: `Order #${order.order_number} changed`, text: 'Another update was saved while you were away, so I did not apply your older edits over the newer order. Reopen the order to review its current details and make your changes again.', suggestions: [] }])
          return
        }
        setMessages([{ id: `${Date.now()}-draft-resume`, from: 'assistant', title: restoredForm.mode === 'edit' ? `Resume editing order #${order.order_number}` : 'Resume creating this order', text: 'Your changes were restored as an unsaved draft. Review the latest order details before saving.', orderForm: { ...restoredForm, initialPrompt: restoredForm.initialDraft?.editorDraft ? '' : restoredForm.initialPrompt, order, role }, suggestions: [] }])
      }
      resume()
      return
    }
    if (saved.kind === 'action' && saved.intent) {
      const resumeAction = async () => {
        try {
          const response = await resolveQuestion(saved.intent, { role, canSeeFinancials: role === 'owner' || role === 'manager', lastAnswer: null })
          const actionable = response?.paymentAction || response?.delayOrder || response?.cancelOrder || response?.deleteOrder
          if (!actionable) {
            clearAssistantDraft(user.id, role)
            setMessages([{ id: `${Date.now()}-draft-expired`, from: 'assistant', title: 'This action is no longer available', text: response?.text || 'The order changed while you were away. Ask me to prepare the action again using the latest order details.', suggestions: [] }])
            return
          }
          setMessages([{ id: `${Date.now()}-action-resume`, from: 'assistant', title: response.title, text: 'I rechecked the latest order details. Review this action again before confirming.', paymentAction: response.paymentAction, delayOrder: response.delayOrder, cancelOrder: response.cancelOrder, deleteOrder: response.deleteOrder, actionDraft: saved.actionDraft || null, suggestions: [] }])
        } catch {
          setMessages([{ id: `${Date.now()}-action-resume-error`, from: 'assistant', title: 'Could not resume this action', text: 'Your action draft is still in this browser session. Check the connection and reopen the action to review the latest order details.', suggestions: [] }])
        }
      }
      resumeAction()
    }
  }, [user?.id, role])

  useEffect(() => {
    if (!orderDraft) return
    if (draftHydratedForRef.current === `${user?.id}:${role}`) saveAssistantDraft(user?.id, role, { kind: 'order_create', orderDraft })
    setConversationContext((current) => setConversationTask(current, {
      type: 'order_create',
      step: orderDraft.step,
      itemCount: orderDraft.items.length,
      customerName: orderDraft.client_name || null,
    }))
  }, [orderDraft, user?.id, role])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const refreshLocalModelStatus = async () => {
    setLocalModelStatus((current) => ({ ...current, loading: true }))
    try {
      const status = await getLocalModelStatus()
      setLocalModelStatus({ ...status, loading: false })
      if (status.available && status.models?.length) {
        const selected = status.models.some((model) => model.name === selectedLocalModel)
          ? selectedLocalModel
          : (status.models.find((model) => /^qwen3(?::|$)/i.test(model.name)) || status.models[0]).name
        setSelectedLocalModel(selected)
        localStorage.setItem('blossom.localAssistantModel', selected)
      }
    } catch {
      setLocalModelStatus({ available: false, models: [], loading: false, error: 'Ollama is not responding.' })
    }
  }

  useEffect(() => {
    if (open) refreshLocalModelStatus()
  }, [open])

  useEffect(() => {
    if (!isChoosingOrderProducts) return undefined
    let active = true
    fetchAllRows((from, to) => supabase.from('products')
      .select('product_id, item_name, retail_price, stock_level, color, flower_type, category, image_url')
      .eq('is_active', true).order('item_name').order('product_id').range(from, to), 500)
      .then((data) => {
        if (!active) return
        setProductCatalog(data)
      })
      .catch((error) => {
        console.error('[assistant] Product autocomplete failed', { category: /failed to fetch|network|timeout/i.test(error?.message || '') ? 'network' : 'other' })
      })
    return () => { active = false }
  }, [isChoosingOrderProducts])

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    messagesEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'end' })
  }, [messages, busy])

  useEffect(() => {
    const onKeyDown = (event) => {
      const typingTarget = event.target?.closest?.('input, textarea, select, [contenteditable="true"]')
      if (event.key.toLowerCase() === 'k' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !typingTarget) {
        event.preventDefault()
        setFullyClosed(false)
        setOpen((value) => !value)
        return
      }
      if (event.key === 'Escape' && launcherMenuOpen) {
        setLauncherMenuOpen(false)
        return
      }
      if (!open) return
      if (event.key === 'Escape') {
        setOpen(false)
        document.activeElement?.blur?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = [...(panelRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, launcherMenuOpen])

  useEffect(() => {
    if (!launcherMenuOpen) return undefined
    const closeMenuOutside = (event) => {
      if (!launcherMenuRef.current?.contains(event.target)) setLauncherMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeMenuOutside)
    return () => window.removeEventListener('pointerdown', closeMenuOutside)
  }, [launcherMenuOpen])

  if (!user) return null

  const navigateTo = (path) => {
    setOpen(false)
    navigate(path)
  }

  const trackAssistantMetric = (metric) => {
    recordAssistantMetric(metric)
    if (diagnosticsEnabled) setDiagnosticsSnapshot(getAssistantDiagnostics())
  }

  const toggleAssistantDiagnostics = (enabled) => {
    setAssistantDiagnosticsEnabled(enabled)
    setDiagnosticsEnabled(enabled)
    setDiagnosticsSnapshot(getAssistantDiagnostics())
  }

  const updateAssistantPreference = (change) => {
    setAssistantPreferences((current) => saveAssistantPreferences(user?.id, { ...current, ...change }))
  }

  const restoreAssistantPreferences = () => {
    const defaults = resetAssistantPreferences(user?.id)
    setAssistantPreferences(defaults)
  }

  const exportAssistantDiagnostics = () => {
    const payload = getAssistantDiagnostics()
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = 'blossom-assistant-diagnostics.json'
    link.click()
    URL.revokeObjectURL(blobUrl)
  }

  const submitAssistantFeedback = (helpful, message) => {
    recordAssistantFeedback(helpful, { routeScore: message?.routeScore })
    if (diagnosticsEnabled) setDiagnosticsSnapshot(getAssistantDiagnostics())
  }

  const answerQuestion = async (rawQuestion) => {
    const prompt = rawQuestion.trim()
    if (!prompt || busy) return
    const isPermanentDeleteCommand = /^pepepeace\s+#\d{1,20}$/i.test(prompt)
    setQuestion('')
    // Do not retain the permanent-delete phrase in the visible transcript.
    if (!isPermanentDeleteCommand) {
      setMessages((current) => [...current, { id: `${Date.now()}-user`, from: 'user', text: prompt }])
    } else {
      clearAssistantDraft(user?.id, role)
    }
    setChatState('thinking')
    const requestUserId = `${user?.id}:${role}`
    const requestVersion = ++requestVersionRef.current
    const startedAt = performance.now()
    let routeSource = 'rules'
    let fallbackReason = null
    let intent
    let routeScore = null
    let routeEvidence = []
    let routedFallbackReason = null

    try {
      const routed = await routeAssistantTurn({
        prompt,
        context: conversationContext,
        previousIntent: lastIntent,
        messages,
        role,
        modelEnabled: useLocalModel && !orderDraft,
        modelStatus: localModelStatus,
        modelName: selectedLocalModel,
        preferences: assistantPreferences,
      })
      intent = routed.intent
      routeSource = routed.routeSource || 'rules'
      routeScore = routed.routeScore ?? null
      routeEvidence = routed.routeEvidence || []
      routedFallbackReason = routed.fallbackReason || null
      fallbackReason = routed.fallbackReason || (routed.modelError ? 'local_model_unavailable' : null)
      const naturalReply = routed.naturalReply
      if (routed.modelError) {
        console.warn('[assistant] Local model unavailable for this turn; using Blossom intent rules.')
        const message = String(routed.modelError?.message || '')
        setLocalModelStatus((current) => ({
          ...current,
          error: /out.of.memory|allocate buffer|memory/i.test(message)
            ? 'This model ran out of available memory. Try a smaller model such as qwen3:1.7b, or close other apps and retry.'
            : message.slice(0, 240) || 'The local model could not answer. Blossom’s built-in assistant is still available.',
        }))
      }
      if (activeUserIdRef.current !== requestUserId || requestVersionRef.current !== requestVersion) return
      setChatState('checking')
      holdTimerRef.current = window.setTimeout(() => setChatState((state) => state === 'checking' ? 'holding' : state), 1600)
      let response
      if (naturalReply) {
        response = { title: '', text: naturalReply }
      } else if (intent.type === 'greeting') {
        response = greetingResponse(prompt, profile)
      } else if (orderDraft && !isClearQuestionDuringOrderDraft(prompt)) {
        const result = await answerOrderDraft(orderDraft, prompt, role, productCatalog, usdExchangeRate)
        setOrderDraft(result.draft)
        if (!result.draft) setConversationContext((current) => setConversationTask(current, result.response.orderForm
          ? { type: 'order_create', step: 'review', customerName: result.response.orderForm.initialDraft?.client_name || null }
          : null))
        response = result.response
      } else if (intent.type === 'order_create') {
        if (!canAccessRoute(role, '/orders')) {
          response = { title: 'You can’t create orders', text: 'Your Blossom role does not have access to order creation. Ask an owner to review your access.' }
        } else if (orderDraft) {
          response = { title: 'An order draft is already in progress', text: 'Finish or discard the current draft before starting another order.', suppressSuggestions: true }
        } else {
          const draft = createOrderDraft(prompt)
          setOrderDraft(draft)
          response = orderDraftQuestion(draft, isBareOrderCreation(prompt)
            ? ''
            : 'I’ll keep your request in context while we build the order together.')
        }
      } else {
        response = await resolveQuestion(intent, { canSeeFinancials, role, lastAnswer, preferences: assistantPreferences })
      }
      if (intent?.printRequested && response?.printOrder) {
        const orderToPrint = response.printOrder
        const { printOrder: _printOrder, ...responseWithoutPrintData } = response
        try {
          const opened = await printOrderReceipt(orderToPrint, shopName)
          response = opened
            ? { ...responseWithoutPrintData, title: `Receipt sent to print · Order #${orderToPrint.order_number}`, text: `I opened the receipt print dialog for ${orderToPrint.client_name || 'this customer'}’s order.` }
            : { ...responseWithoutPrintData, title: `Couldn’t print order #${orderToPrint.order_number}`, text: 'The receipt print dialog could not be opened. Check the printer and ask me to print it again.', outcome: { ...response.outcome, status: 'retryable_error' }, retryPrompt: prompt }
        } catch (printError) {
          console.warn('[assistant] Could not open the order receipt print dialog.', printError)
          response = { ...responseWithoutPrintData, title: `Couldn’t print order #${orderToPrint.order_number}`, text: 'The receipt could not be prepared. Check the printer and ask me to print it again.', outcome: { ...response.outcome, status: 'retryable_error' }, retryPrompt: prompt }
        }
      }
      if (routed.synthesisModel && response?.text && !intent?.printRequested && !response.orderForm && !response.paymentAction && !response.deleteOrder && !response.voidOrder && !response.delayOrder) {
        const streamingMessageId = `${Date.now()}-assistant-stream`
        let streamedText = ''
        setChatState('writing')
        setMessages((current) => [...current, { id: streamingMessageId, from: 'assistant', text: '', isStreaming: true }])
        try {
          const conversationalText = await composeGroundedAssistantReply({
            model: routed.synthesisModel,
            prompt,
            intent,
            response,
            preferences: assistantPreferences,
            onToken: (token) => {
              streamedText += token
              setMessages((current) => current.map((message) => message.id === streamingMessageId ? { ...message, text: streamedText } : message))
            },
          })
          if (conversationalText) response = { ...response, text: conversationalText }
        } catch {
          console.warn('[assistant] Grounded wording unavailable; keeping the verified Blossom response.')
        } finally {
          setMessages((current) => current.filter((message) => message.id !== streamingMessageId))
        }
      }
      clearTimeout(holdTimerRef.current)
      if (activeUserIdRef.current !== requestUserId || requestVersionRef.current !== requestVersion) return
      setChatState('writing')
      const { followupContext, ...responseForDisplay } = response
      const displayResponse = { ...responseForDisplay }
      delete displayResponse.pendingClarification
      const activeOrderForm = displayResponse.orderForm
      if (activeOrderForm) saveAssistantDraft(user?.id, role, {
        kind: 'order_editor',
        orderForm: {
          mode: activeOrderForm.mode,
          orderId: activeOrderForm.order?.id || null,
          initialPrompt: activeOrderForm.initialPrompt || '',
          initialDraft: activeOrderForm.initialDraft || null,
        },
        orderFingerprint: orderFingerprint(activeOrderForm.order),
      })
      else if (!displayResponse.deleteOrder && (displayResponse.paymentAction || displayResponse.delayOrder || displayResponse.cancelOrder)) {
        // Store only the typed action intent. The order is reloaded and revalidated before recovery.
        saveAssistantDraft(user?.id, role, { kind: 'action', intent, actionDraft: null })
      }
      if (intent.type === 'order_delete') {
        // The one-use phrase is not needed to continue after the confirmation
        // card is shown, and should not be carried in conversation context.
        setLastIntent(null)
        setLastAnswer(null)
      } else if (!['greeting', 'help', 'capabilities', 'route_clarification'].includes(intent.type)) {
        setLastIntent(followupContext || intent)
        setLastAnswer(displayResponse)
        setConversationContext((current) => updateConversationContext(current, intent, response))
      }
      const stockStat = intent.type === 'product_stock' && displayResponse.title?.match(/^([\d,\u202f ]+) units of (.+) (?:in stock|available)$/i)
      const countStat = ['orders_due', 'deliveries', 'overdue', 'unpaid', 'low_stock', 'created_today', 'orders_status', 'order_search'].includes(intent.type)
        ? displayResponse.title?.match(/^(\d[\d,\u202f ]*)\s+(.+)$/)
        : null
      const stat = stockStat
        ? { value: stockStat[1].trim(), label: `units of ${stockStat[2]} in stock` }
        : countStat
          ? { value: countStat[1].trim(), label: countStat[2] }
          : null
      const suggestionIntent = followupContext || intent
      const suggestionContext = intent.type === 'greeting' ? lastIntent?.type || 'help' : suggestionIntent.type
      const onlyResult = displayResponse.rows?.length === 1 ? displayResponse.rows[0] : null
      const suggestionEntity = {
        orderNumber: suggestionIntent.orderNumber || onlyResult?.orderNumber,
        productName: suggestionIntent.search || suggestionIntent.productName,
        supplierName: displayResponse.rows?.length === 1
          ? suggestionIntent.name || displayResponse.rows[0]?.title?.match(/^(.+?)\s*[·-]\s*(?:payment history|purchase history)$/i)?.[1]
          : '',
      }
      setMessages((current) => [...current, { id: `${Date.now()}-assistant`, from: 'assistant', ...displayResponse, routeType: intent?.type, routeSource, routeScore, routeEvidence, fallbackReason: routedFallbackReason, stat, draftNotice: Boolean(orderDraft && isClearQuestionDuringOrderDraft(prompt)), suggestions: displayResponse.suppressSuggestions ? [] : displayResponse.suggestions || nextQuestionsFor(suggestionContext, role, suggestionEntity) }])
      trackAssistantMetric({ route: intent?.type, outcome: displayResponse.outcome?.status || 'success', routeSource, routeScore, fallbackReason, latencyMs: performance.now() - startedAt })
      flashFace('speaking', 850)
    } catch (error) {
      const isPermissionError = error.code === '42501' || /permission|row-level security/i.test(error.message || '')
      const isNetworkError = /failed to fetch|network|timeout/i.test(error.message || '')
      console.error('[assistant] Request failed', { category: isPermissionError ? 'permission' : isNetworkError ? 'network' : 'other' })
      trackAssistantMetric({ route: intent?.type, outcome: isPermissionError ? 'forbidden' : 'retryable_error', routeSource, routeScore, fallbackReason: isNetworkError ? 'network' : isPermissionError ? 'permission' : fallbackReason, latencyMs: performance.now() - startedAt })
      if (activeUserIdRef.current !== requestUserId || requestVersionRef.current !== requestVersion) return
      clearTimeout(holdTimerRef.current)
      setChatState('writing')
      setMessages((current) => [...current, {
        id: `${Date.now()}-assistant-error`,
        from: 'assistant',
        outcome: {
          status: isPermissionError ? 'forbidden' : 'retryable_error',
          domain: intent?.type?.startsWith('order') || intent?.type?.startsWith('orders') ? 'orders' : intent?.type || 'general',
          operation: intent?.type || 'help',
          entity: intent?.orderNumber ? { type: 'order', key: String(intent.orderNumber) } : null,
          fields: intent?.facts || (intent?.field ? [intent.field] : []),
          timeScope: intent?.period || null,
          interaction: 'error',
        },
        text: isPermissionError
          ? 'Your role cannot access this information. Ask an owner to review your access.'
          : isNetworkError
            ? 'I lost connection while checking Blossom. Check your connection, then try again.'
            : 'I couldn’t load that Blossom information just now. You can retry or ask me another way.',
        retryPrompt: isPermissionError || isPermanentDeleteCommand ? null : prompt,
        isError: true,
        suggestions: nextQuestionsFor(intent?.type || 'help', role),
      }])
      flashFace('error', 1400)
    } finally {
      if (activeUserIdRef.current === requestUserId && requestVersionRef.current === requestVersion) setChatState('idle')
    }
  }

  const cancelOrderAction = (messageId) => {
    clearAssistantDraft(user?.id, role)
    setConversationContext((current) => setConversationTask(current, null))
    setMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, orderForm: null, deleteOrder: null, cancelOrder: null, paymentAction: null, delayOrder: null, text: 'Cancelled. No changes were made.' }
      : message))
  }

  const dismissOrderAction = (messageId) => {
    clearAssistantDraft(user?.id, role)
    setConversationContext((current) => setConversationTask(current, null))
    setMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, orderForm: null, deleteOrder: null, cancelOrder: null, paymentAction: null, delayOrder: null }
      : message))
  }

  const deleteOrderFromChat = async (orderId, messageId, commandPhrase) => {
    await deleteOrderWorkflow(orderId, commandPhrase)
    window.dispatchEvent(new Event('blossom:orders-changed'))
    if (messageId) completeAction(messageId, 'order_delete', 'Order permanently deleted. Its linked stock and cash records were handled by Blossom.')
  }

  const completeAction = (messageId, type, text) => {
    clearAssistantDraft(user?.id, role)
    flashFace('success', 1200)
    const actionMessage = messages.find((message) => message.id === messageId)
    const order = actionMessage?.orderForm?.order || actionMessage?.paymentAction?.order || actionMessage?.delayOrder || actionMessage?.cancelOrder || actionMessage?.deleteOrder || null
    const action = getAssistantActionForIntent({ type })
    setConversationContext((current) => completeConversationAction(current, { type, order, orderNumber: order?.order_number }))
    setLastAnswer(null)
    setLastIntent(order && type !== 'order_delete' ? { type: 'order_lookup', orderNumber: String(order.order_number), facts: ['summary'] } : null)
    setMessages((current) => current.map((message) => message.id !== messageId ? message : ({
      ...message,
      outcome: {
        ...message.outcome,
        status: 'success',
        domain: action?.domain || message.outcome?.domain || 'general',
        operation: type,
        impact: action?.impact || 'consequential',
        confirmation: action?.confirmation || 'review',
        undoAvailable: action?.undo === 'available',
        interaction: 'action_completed',
      },
      orderForm: null,
      deleteOrder: null,
      cancelOrder: null,
      paymentAction: null,
      delayOrder: null,
      text,
      suggestions: nextQuestionsFor(type, role),
    })))
  }

  const startNewChat = () => {
    clearAssistantDraft(user?.id, role)
    requestVersionRef.current += 1
    clearTimeout(holdTimerRef.current)
    setMessages([])
    setOrderDraft(null)
    setQuestion('')
    setChatState('idle')
    setLastIntent(null)
    setLastAnswer(null)
    setConversationContext(emptyConversationContext())
    inputRef.current?.focus()
  }

  const toggleLocalModel = (enabled) => {
    setUseLocalModel(enabled)
    localStorage.setItem('blossom.useLocalAssistantModel', String(enabled))
  }

  const onOrderEditorDraftChange = (messageId, editorDraft) => {
    const message = messages.find((item) => item.id === messageId)
    if (!message?.orderForm) return
    const orderForm = message.orderForm
    const nextInitialDraft = orderForm.mode === 'create'
      ? { ...orderForm.initialDraft, editorDraft }
      : { editorDraft }
    setMessages((current) => current.map((item) => item.id !== messageId || item.orderForm?.initialDraft?.editorDraft === editorDraft
      ? item
      : { ...item, orderForm: { ...item.orderForm, initialDraft: nextInitialDraft } }))
    saveAssistantDraft(user?.id, role, {
      kind: 'order_editor',
      orderForm: {
        mode: orderForm.mode,
        orderId: orderForm.order?.id || null,
        initialPrompt: orderForm.initialPrompt || '',
        initialDraft: nextInitialDraft,
      },
      orderFingerprint: orderFingerprint(orderForm.order),
    })
  }

  const onActionDraftChange = (actionDraft) => {
    const saved = loadAssistantDraft(user?.id, role)
    if (saved?.kind === 'action') saveAssistantDraft(user?.id, role, { ...saved, actionDraft })
  }

  const selectLocalModel = (model) => {
    setSelectedLocalModel(model)
    localStorage.setItem('blossom.localAssistantModel', model)
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] print:hidden">
      <div aria-hidden={!open} inert={!open} className={`assistant-panel-motion fixed bottom-5 right-5 ${open ? 'assistant-panel-open' : 'assistant-panel-closed'}`}>
        <section ref={panelRef} className="pointer-events-auto flex h-[min(46rem,calc(100dvh-2.5rem))] w-[min(30rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[20px] border border-[#F0DCE5] bg-[#FFFBFD] shadow-[0_18px_60px_rgba(88,43,64,0.16)]" role="dialog" aria-modal="true" aria-labelledby="blossom-assistant-title" aria-keyshortcuts="K">
          <header className="flex items-center gap-3 border-b border-[#F1E3E9] bg-white px-4 py-3">
            <div className="relative grid h-10 w-10 place-items-center rounded-[13px] border border-[#E8C79E]/70 bg-[linear-gradient(145deg,#FFF9F0,#FCE9F0_58%,#F4DCE8)] text-[#9B4264] shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_3px_10px_rgba(118,51,81,.12)]"><AssistantFace size={31} state={faceState} /></div>
            <div className="min-w-0 flex-1">
              <p id="blossom-assistant-title" className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#43283A]">Blossom</p>
            </div>
            <button type="button" onClick={() => setShowModelSettings((value) => !value)} aria-label="Assistant settings" aria-expanded={showModelSettings} title="Assistant settings" className="rounded-[9px] p-2 text-[#806B78] transition hover:bg-[#FFF1F6] hover:text-[#A92E61]"><Settings2 size={16} /></button>
            {messages.length > 0 && <button type="button" onClick={startNewChat} disabled={busy} aria-label="Start a new chat" title="New chat" className="rounded-[9px] p-2 text-[#806B78] transition hover:bg-[#FFF1F6] hover:text-[#A92E61] disabled:opacity-40"><Plus size={17} /></button>}
            <button type="button" onClick={() => { setOpen(false); setLauncherMenuOpen(false); document.activeElement?.blur?.() }} aria-label="Minimize assistant" title="Minimize assistant · Esc" className="rounded-[9px] p-2 text-[#806B78] transition hover:bg-[#FFF1F6] hover:text-[#A92E61]"><X size={18} /></button>
          </header>

          {showModelSettings && <div className="space-y-2 border-b border-[#F1E3E9] bg-white px-4 py-3 text-[11px]">
            <div className="rounded-[10px] border border-[#F1E3E9] bg-[#FFFBFD] p-2.5">
              <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-[#512A45]">Your assistant preferences</p><button type="button" onClick={restoreAssistantPreferences} className="rounded-md px-2 py-1 text-[10px] font-medium text-[#8D2C57] hover:bg-[#FFF1F6]">Reset</button></div>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 space-y-1 text-[10px] text-[#75636D]"><span>Reply style</span><select value={assistantPreferences.answerStyle} onChange={(event) => updateAssistantPreference({ answerStyle: event.target.value })} className="w-full rounded-lg border border-[#EADCE2] bg-white px-2 py-1.5 text-[11px] text-[#554550]"><option value="balanced">Balanced</option><option value="concise">Concise</option></select></label>
                <label className="min-w-0 space-y-1 text-[10px] text-[#75636D]"><span>Date format</span><select value={assistantPreferences.dateFormat} onChange={(event) => updateAssistantPreference({ dateFormat: event.target.value })} className="w-full rounded-lg border border-[#EADCE2] bg-white px-2 py-1.5 text-[11px] text-[#554550]"><option value="regional">DD/MM/YYYY</option><option value="us">MM/DD/YYYY</option><option value="iso">YYYY-MM-DD</option></select></label>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-[#9A8A92]">Saved on this device. Reset restores the default reply style and regional date format.</p>
            </div>
            <details className="rounded-lg border border-[#F1E3E9] bg-white px-2.5 py-2">
              <summary className="cursor-pointer text-[10px] font-semibold text-[#75636D]">Advanced options</summary>
              <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium text-[#554550]"><Cpu size={14} className="text-[#B94975]" />On-device language model</div>
              <input type="checkbox" checked={useLocalModel} onChange={(event) => toggleLocalModel(event.target.checked)} aria-label="Use on-device language model" className="accent-[#B72D66]" />
            </div>
            {localModelStatus.available && localModelStatus.models?.length ? <div className="flex items-center gap-2">
              <span className="shrink-0 text-emerald-700">Local model available</span>
              <select value={selectedLocalModel} onChange={(event) => selectLocalModel(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#EADCE2] bg-white px-2 py-1.5 text-[11px] text-[#554550]">
                {localModelStatus.models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
              </select>
              <button type="button" onClick={refreshLocalModelStatus} disabled={localModelStatus.loading} title="Refresh local models" className="rounded-md p-1.5 text-[#806B78] hover:bg-[#FFF1F6] disabled:opacity-50"><RefreshCw size={13} className={localModelStatus.loading ? 'animate-spin' : ''} /></button>
            </div> : <div className="flex items-start justify-between gap-3 text-[#7B6A73]">
              <p>{localModelStatus.loading ? 'Checking local model availability…' : localModelStatus.available ? <>No local language model is installed yet.</> : <>No local language model is available. Blossom will continue using its built-in assistant.</>}</p>
              <button type="button" onClick={refreshLocalModelStatus} disabled={localModelStatus.loading} className="shrink-0 rounded-md px-2 py-1 text-[#8D2C57] hover:bg-[#FFF1F6] disabled:opacity-50">Check</button>
            </div>}
            {localModelStatus.error && localModelStatus.available && <p role="status" className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-900">{localModelStatus.error}</p>}
            <div className="border-t border-[#F3E9ED] pt-2">
              <label className="flex items-start gap-2 text-[10px] leading-relaxed text-[#65545E]"><input type="checkbox" checked={diagnosticsEnabled} onChange={(event) => toggleAssistantDiagnostics(event.target.checked)} className="mt-0.5 accent-[#B72D66]" /><span>Share anonymous assistant quality counters on this device. Stores only totals, categories, latency ranges, and feedback; never prompts, names, or result rows. Nothing is uploaded.</span></label>
              {diagnosticsEnabled && <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-[#8A7280]">{diagnosticsSnapshot.total || 0} assistant turns counted locally</span><div className="flex gap-1.5"><button type="button" onClick={exportAssistantDiagnostics} className="rounded-md border border-[#EADCE2] px-2 py-1 text-[10px] font-medium text-[#75405A] hover:bg-[#FFF7FA]">Export</button><button type="button" onClick={() => { clearAssistantDiagnostics(); setDiagnosticsSnapshot(getAssistantDiagnostics()) }} className="rounded-md border border-[#EADCE2] px-2 py-1 text-[10px] font-medium text-[#75405A] hover:bg-[#FFF7FA]">Clear</button></div></div>}
            </div>
              </div>
            </details>
          </div>}

          <div role="log" aria-label="Blossom assistant conversation" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#FFFBFD_0%,#FFF9FC_100%)] px-4 py-4 scroll-smooth sm:px-5">
            {messages.length === 0 ? (
              <div className="space-y-5 py-1">
                <div className="rounded-[14px] border border-[#F1E3E9] bg-white p-4 shadow-[0_2px_10px_rgba(90,43,63,.035)]">
                  <p className="text-[15px] font-semibold tracking-[-0.02em] text-[#43283A]">Hi{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</p>
                  <p className="mt-1.5 text-[13px] leading-[1.55] text-[#6F626A]">Ask naturally. I can look up live Blossom information and help you act on it.</p>
                </div>
                <div className="space-y-2.5">
                  <p className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9A828F]">Try asking</p>
                  <div className="grid grid-cols-2 gap-2">
                    {suggestions.slice(0, 4).map(({ label, prompt, icon: Icon }) => (
                      <button key={label} type="button" onClick={() => answerQuestion(prompt)} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-[#F1E3E9] bg-white px-3 py-2.5 text-left text-[11px] font-medium leading-snug text-[#554550] transition hover:border-[#DEA2BA] hover:bg-[#FFF5F8] disabled:opacity-50">
                        <Icon size={14} className="shrink-0 text-[#B94975]" />
                        <span className="line-clamp-2">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => <AssistantMessage key={message.id} message={message} onNavigate={navigateTo} onRetry={answerQuestion} onAnswer={answerQuestion} onDeleteOrder={deleteOrderFromChat} onCancelOrderAction={cancelOrderAction} onDismissOrderAction={dismissOrderAction} onCompleteAction={completeAction} onOrderEditorDraftChange={onOrderEditorDraftChange} onActionDraftChange={onActionDraftChange} cartItems={cartItems} role={role} usdExchangeRate={usdExchangeRate} onFeedback={submitAssistantFeedback} />)}
                {messages.at(-1)?.from === 'assistant' && !busy && messages.at(-1)?.suggestions?.length > 0 && (
                  <div className="assistant-message-enter space-y-2 pt-1">
                    <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9A828F]">Continue</p>
                    <div className="flex flex-wrap gap-1.5">
                      {messages.at(-1).suggestions.map(({ label, prompt }) => (
                        <button key={label} type="button" onClick={() => answerQuestion(prompt)} className="rounded-[9px] border border-[#F0DCE5] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#65545E] transition hover:border-[#D987A7] hover:bg-[#FFF3F7] hover:text-[#8D2C57]">{label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {busy && <AssistantActivity state={chatState} />}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={(event) => { event.preventDefault(); answerQuestion(question) }} className="border-t border-[#F0DCE5] bg-white p-3">
            <div className="flex items-center gap-2 rounded-[12px] border border-[#EADCE2] bg-[#FFFBFD] px-3 py-1.5 transition focus-within:border-[#CE7D9D] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#C24B79]/10">
              <input ref={inputRef} value={question} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} onChange={(event) => setQuestion(event.target.value)} placeholder={orderDraft ? 'Reply to continue building the order…' : 'Ask Blossom…'} aria-label="Ask Blossom assistant" className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-[#38313A] outline-none placeholder:text-[#A1959C]" />
              <button type="submit" aria-label="Send question" disabled={!question.trim() || busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[#B72D66] text-white transition hover:bg-[#9F2456] disabled:cursor-not-allowed disabled:opacity-35"><Send size={15} /></button>
            </div>
          </form>
        </section>
      </div>

      {!open && !fullyClosed && <div ref={launcherMenuRef} className="pointer-events-auto fixed bottom-5 right-5">
        {launcherMenuOpen && <div role="menu" aria-label="Assistant options" className="absolute bottom-full right-0 mb-2 w-44 rounded-xl border border-[#EADCE2] bg-white p-1.5 shadow-[0_8px_28px_rgba(67,40,58,.18)]">
          <button type="button" role="menuitem" onClick={() => { setLauncherMenuOpen(false); setFullyClosed(true) }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[#654653] transition hover:bg-[#FFF1F6] hover:text-[#A92E61]">Close Blossom entirely</button>
        </div>}
        <button type="button" onClick={() => { setLauncherMenuOpen(false); setOpen(true) }} onContextMenu={(event) => { event.preventDefault(); setLauncherMenuOpen((value) => !value) }} aria-label="Open Blossom assistant. Right-click for options." aria-haspopup="menu" aria-expanded={launcherMenuOpen} title="Open assistant · K · right-click for options" className="grid h-9 w-9 place-items-center rounded-[13px] border border-[#E8C79E]/70 bg-[linear-gradient(145deg,#FFF9F0,#FCE8F0_58%,#EFB5CC)] text-[#9B4264] shadow-[0_4px_12px_rgba(111,49,78,.18)] transition hover:scale-105 hover:shadow-[0_6px_16px_rgba(111,49,78,.22)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#D78EAD]/30">
          <AssistantFace size={27} state={faceState} />
        </button>
      </div>}

    </div>
  )
}


