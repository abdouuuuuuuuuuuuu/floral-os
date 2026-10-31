import { askLocalModel, intentFromLocalToolCall } from '../localAssistantModel.js'
import { getAssistantReadPlanTools, getAssistantTools } from './actionCatalog.js'
import { classifyQuestion, contextualCustomerFollowup, contextualOrderFollowup, contextualProductFollowup, contextualTaskFollowup, guardIntent, isGreetingMessage, normalizeIntentText, productSearchTerms, reportPeriodFromText } from './intentEngine.js'
import { continuePendingClarification } from './conversationState.js'
import { invalidAssistantIntent, READ_PLAN_INTENTS, validateAssistantIntent } from './intentContract.js'
import { assessRoute } from './routeAssessment.js'

const MODEL_FALLBACK_INTENTS = new Set(['help', 'order_clarification', 'invalid_intent'])
const WRITE_INTENTS = new Set(['order_create', 'order_edit', 'order_delay', 'order_payment', 'order_cancel', 'order_delete'])
const BUSINESS_REQUEST = /\b(orders?|stock|inventory|flowers?|products?|customers?|clients?|suppliers?|vendors?|sales|revenue|reports?|payment|cash|deliver(?:y|ies)|price|profit|create|edit|delete|cancel|refund|pay|purchase|supplier)\b/i

function isCompoundReadRequest(text) {
  if (!/\b(?:and|also|plus|as well as)\b/.test(text)) return false
  const subjects = [
    /\borders?\b|\bdeliver(?:y|ies)\b/.test(text),
    /\bstock|inventory|flowers?|products?\b/.test(text),
    /\bcreator|created by|who made|who entered\b/.test(text),
    /\btotal|amount|payment|paid|due|price|cost|revenue\b/.test(text),
    /\bstatus|delivery date|delivery time\b/.test(text),
  ]
  const facts = [
    /\b(?:due|overdue|delivery date|delivery time|created|creator|created by|status|customer|client|paid|payment|order number|total|amount)\b/.test(text),
    /\b(?:stock|inventory|how many|quantity|left|remaining|available|low stock|out of stock|price)\b/.test(text),
    /\b(?:creator|created by|who made|who entered)\b/.test(text),
    /\b(?:total|amount|payment|paid|due|price|cost|revenue|sales)\b/.test(text),
    /\b(?:status|delivery date|delivery time)\b/.test(text),
  ]
  // A bare “orders and flowers” names two areas but does not tell Blossom
  // what to read in either one. Ask which topic the user means instead.
  return subjects.filter(Boolean).length >= 2 && facts.filter(Boolean).length >= 2
}

function safePlan(plan) {
  if (plan.length < 2 || plan.length > 3) return false
  const signatures = new Set()
  for (const intent of plan) {
    if (!READ_PLAN_INTENTS.has(intent?.type) || !validateAssistantIntent(intent).ok) return false
    const signature = JSON.stringify(intent)
    if (signatures.has(signature)) return false
    signatures.add(signature)
  }
  return true
}

function historyForModel(messages = []) {
  return messages.slice(-8).map((message) => {
    const lines = [message.title, message.text].filter(Boolean)
    if (message.rows?.length) {
      lines.push(message.rows.slice(0, 8).map((row) => [row.title, row.detail, row.value].filter(Boolean).join(' · ')).join('\n'))
    }
    return { role: message.from === 'user' ? 'user' : 'assistant', content: lines.join('\n').slice(0, 1800) }
  })
}

function plannerContext(context = {}) {
  const rows = (context.activeResultSet?.rows || []).slice(0, 8).map((row) => ({
    orderNumber: row.orderNumber || null,
    customerName: row.customerName || null,
    index: row.index,
  }))
  const lastRows = (context.lastResult?.rows || []).slice(0, 6).map((row) => ({
    orderNumber: row.orderNumber || null,
    customerName: row.customerName || null,
    title: row.title || null,
  }))
  return {
    topic: context.topic || null,
    currentIntent: context.intent?.type || null,
    activeEntity: context.activeEntity || null,
    activeOrder: context.activeOrder || null,
    activeCustomer: context.activeCustomer || null,
    activeProduct: context.activeProduct || null,
    recentOrders: (context.recentOrders || []).slice(0, 8),
    activeResultSet: rows.length ? {
      topic: context.activeResultSet.topic,
      sourceIntent: context.activeResultSet.sourceIntent,
      selectedIndex: context.activeResultSet.selectedIndex ?? null,
      rows,
    } : null,
    lastResult: context.lastResult ? {
      topic: context.lastResult.topic,
      intentType: context.lastResult.intentType,
      title: context.lastResult.title,
      rows: lastRows,
    } : null,
    period: context.period || null,
  }
}

function needsFallbackClarification(intent, assessment, prompt) {
  return ['help', 'invalid_intent'].includes(intent?.type)
    && (assessment.families.length > 0 || BUSINESS_REQUEST.test(prompt))
}

function fallbackClarification(prompt, assessment, reason, modelError = null) {
  return {
    intent: { type: 'route_clarification', topics: assessment.families.slice(0, 5), prompt },
    naturalReply: null,
    modelError,
    fallbackReason: reason,
    routeSource: 'rules-fallback-clarification',
    routeScore: assessment.score,
    routeEvidence: [...assessment.evidence, 'fallback_clarification'],
  }
}

export async function routeAssistantTurn({ prompt, context, previousIntent, messages, role, modelEnabled, modelStatus, modelName, preferences }) {
  const normalized = normalizeIntentText(prompt)
  const taskFollowup = contextualTaskFollowup(prompt, context, previousIntent)
  const orderFollowup = contextualOrderFollowup(prompt, context)
  const customerFollowup = contextualCustomerFollowup(prompt, context)
  const productFollowup = contextualProductFollowup(prompt, context)
  const exactPermanentDeleteCommand = /^pepepeace\s+#\d{1,20}$/i.test(String(prompt).trim())
  const classifiedIntent = exactPermanentDeleteCommand
    ? classifyQuestion(prompt, context?.intent || previousIntent, context)
    : isGreetingMessage(prompt)
    ? { type: 'greeting', prompt }
    : continuePendingClarification(prompt, context?.pendingClarification, { normalize: normalizeIntentText, reportPeriodFromText })
      || orderFollowup
      || customerFollowup
      || productFollowup
      || taskFollowup
      || classifyQuestion(prompt, context?.intent || previousIntent, context)
  const validation = validateAssistantIntent(classifiedIntent)
  const ruleIntent = validation.ok
    ? validation.intent
    : validation.reason === 'permanent_delete_phrase_required'
      ? { type: 'order_delete_forbidden', prompt }
      : invalidAssistantIntent(prompt, validation.reason)
  if (ruleIntent.type === 'order_delete' || ruleIntent.type === 'order_delete_forbidden') {
    return { intent: ruleIntent, naturalReply: null, modelError: null, routeSource: 'permanent-delete-command-gate', routeScore: 1, routeEvidence: ['exact_phrase_required'] }
  }
  const assessment = assessRoute(prompt, ruleIntent, context)

  // A deterministic follow-up already has a trusted target from conversation
  // state. Preserve it before generic scoring can ask an unnecessary question.
  const resolvedConversationFollowup = Boolean(taskFollowup || orderFollowup || customerFollowup || productFollowup)
  if (resolvedConversationFollowup && validation.ok) {
    return { intent: ruleIntent, naturalReply: null, modelError: null, routeSource: 'conversation-task-followup', routeScore: Math.max(assessment.score, 0.8), routeEvidence: [...assessment.evidence, 'active_conversation_intent'] }
  }

  // A clearly worded item replacement tied to the active order is an edit
  // request. Keep it out of cross-domain tie-breaking; the user still reviews
  // the replacement in Blossom's order editor before saving.
  if (ruleIntent.type === 'order_edit' && ruleIntent.orderNumber
    && String(context?.activeOrder?.orderNumber || '') === String(ruleIntent.orderNumber)) {
    return {
      intent: ruleIntent,
      naturalReply: null,
      modelError: null,
      routeSource: 'conversation-order-edit',
      routeScore: Math.max(assessment.score, 0.82),
      routeEvidence: [...assessment.evidence, 'active_order_target', 'explicit_item_replacement'],
    }
  }

  if (modelEnabled && modelStatus?.available && modelStatus.models?.length && modelName && !resolvedConversationFollowup && isCompoundReadRequest(normalized)) {
    try {
      const readContext = plannerContext(context)
      const planResult = await askLocalModel({
        model: modelName,
        tools: getAssistantReadPlanTools(role),
        timeoutMs: 12_000,
        messages: [
          { role: 'system', content: `Plan only the independent reads needed to answer the user's compound question. You may call at most 3 of the available read tools. Never make up data, chain writes, or call the same read twice. If one read is enough, make one call. Resolve words such as “it”, “them”, “those orders”, “the second one”, and “same customer” using the active entity/result set and recent conversation. When the user refers to a displayed result set, query those exact order numbers; do not substitute the latest orders. If the reference could identify more than one set and context cannot resolve it, return no tool call so Blossom can ask the user to clarify. Context identifies entities only; always fetch current business values with the read tools. Role: ${role}. Context: ${JSON.stringify(readContext)}` },
          ...historyForModel(messages),
          { role: 'user', content: prompt },
        ],
      })
      const calls = planResult?.message?.tool_calls || []
      if (calls.length >= 1 && calls.length <= 3) {
        const planned = calls.map((call) => intentFromLocalToolCall(call, prompt, { reportPeriodFromText, productSearchTerms }))
        if (planned.every(Boolean)) {
          const guarded = planned.map((intent) => guardIntent(prompt, intent, context?.intent || previousIntent))
          const safeIntent = guarded.length === 1
            ? READ_PLAN_INTENTS.has(guarded[0].type) && validateAssistantIntent(guarded[0]).ok ? guarded[0] : null
            : safePlan(guarded) ? { type: 'read_plan', plan: guarded, prompt } : null
          if (safeIntent) return { intent: safeIntent, naturalReply: null, modelError: null, routeSource: 'local-read-plan', synthesisModel: modelName, routeScore: assessment.score, routeEvidence: assessment.evidence }
        }
      }
    } catch (modelError) {
      console.warn('[assistant] Read planning unavailable; using the single-read route.')
    }
  }
  if (!resolvedConversationFollowup && isCompoundReadRequest(normalized)) {
    return fallbackClarification(prompt, assessment, 'unsafe_or_unavailable_read_plan')
  }

  if (assessment.shouldClarify) {
    const topics = assessment.families.slice(0, 5)
    return {
      intent: { type: 'route_clarification', topics, prompt },
      naturalReply: null,
      modelError: null,
      routeSource: 'clarification',
      routeScore: assessment.score,
      routeEvidence: assessment.evidence,
    }
  }

  const modelAvailable = modelEnabled && modelStatus?.available && modelStatus.models?.length && modelName
  const useModelForIntent = MODEL_FALLBACK_INTENTS.has(ruleIntent.type) || assessment.needsModelTieBreak
  if (!modelAvailable || !useModelForIntent) {
    if (!modelAvailable && needsFallbackClarification(ruleIntent, assessment, normalized)) return fallbackClarification(prompt, assessment, 'local_model_unavailable')
    return { intent: guardIntent(prompt, ruleIntent, context?.intent || previousIntent), naturalReply: null, modelError: null, routeSource: 'rules', routeScore: assessment.score, routeEvidence: assessment.evidence }
  }

  const modelContext = {
    topic: context?.topic,
    activeOrder: context?.activeOrder,
    activeCustomer: context?.activeCustomer,
    activeProduct: context?.activeProduct,
    activeEntity: context?.activeEntity,
    activeResultSet: context?.activeResultSet,
    pendingClarification: context?.pendingClarification,
    currentTask: context?.currentTask,
    period: context?.period,
    recentOrders: context?.recentOrders,
    pendingAction: context?.pendingAction,
    userRole: role,
  }
  try {
    const result = await askLocalModel({
      model: modelName,
      tools: getAssistantTools({ role }),
      messages: [
        { role: 'system', content: `You resolve an uncertain Blossom POS route. The rule router's candidate is ${JSON.stringify(ruleIntent)}. Choose a tool only when the message and conversation clearly support it; otherwise ask one concise clarification. Use conversation context for follow-ups. Select tools only for real Blossom data or actions. Do not claim data or actions you have not received. For casual conversation, answer naturally and ${preferences?.answerStyle === 'concise' ? 'very briefly in one sentence' : 'briefly'}. The current role is ${role}; do not suggest bypassing permissions. Context: ${JSON.stringify(modelContext)}` },
        ...historyForModel(messages),
        { role: 'user', content: prompt },
      ],
    })
    const call = result?.message?.tool_calls?.[0]
    if (call) {
      const modelIntent = intentFromLocalToolCall(call, prompt, { reportPeriodFromText, productSearchTerms })
      if (modelIntent) {
        const guardedIntent = guardIntent(prompt, modelIntent, context?.intent || previousIntent)
        const checkedIntent = validateAssistantIntent(guardedIntent)
        const isSafeWriteSuggestion = !WRITE_INTENTS.has(guardedIntent.type) || (
          assessment.evidence.includes('explicit_operation')
          && /\borders?\b|\border\s*#?\s*\d+\b/i.test(normalized)
          && (guardedIntent.type === 'order_create' || /#?\d{2,}|\b(?:order|orders)\s+(?:for|of|by|named?)\s+[\p{L}]/iu.test(normalized))
        )
        if (checkedIntent.ok && isSafeWriteSuggestion) return { intent: checkedIntent.intent, naturalReply: null, modelError: null, routeSource: 'local-model', synthesisModel: modelName, routeScore: assessment.score, routeEvidence: assessment.evidence }
      }
    }
    const reply = String(result?.message?.content || '').trim()
    const invalidToolArguments = Boolean(result?.message?.tool_calls?.length)
    if (needsFallbackClarification(ruleIntent, assessment, normalized)) {
      return fallbackClarification(prompt, assessment, invalidToolArguments ? 'invalid_tool_arguments' : 'no_safe_tool_route')
    }
    return {
      intent: guardIntent(prompt, ruleIntent, context?.intent || previousIntent),
      naturalReply: reply && ruleIntent.type === 'help' && !BUSINESS_REQUEST.test(normalized) ? reply : null,
      modelError: null,
      routeSource: 'rules-fallback',
      fallbackReason: invalidToolArguments ? 'invalid_tool_arguments' : 'no_safe_tool_route',
      routeScore: assessment.score,
      routeEvidence: assessment.evidence,
    }
  } catch (modelError) {
    if (needsFallbackClarification(ruleIntent, assessment, normalized)) return fallbackClarification(prompt, assessment, 'local_model_error', modelError)
    return { intent: guardIntent(prompt, ruleIntent, context?.intent || previousIntent), naturalReply: null, modelError, routeSource: 'rules-fallback', fallbackReason: 'local_model_error', routeScore: assessment.score, routeEvidence: assessment.evidence }
  }
}
const READ_ONLY_INTENTS = new Set([
  'order_lookup', 'order_customer_fact', 'order_search', 'orders_list', 'orders_status', 'orders_due',
  'orders_period', 'orders_created_by', 'deliveries', 'overdue', 'created_today', 'overview',
  'customer_lookup', 'stock_waste', 'product_stock', 'product_price', 'unpaid', 'sales', 'report_period',
  'supplier_lookup', 'cash_register', 'deliveries_period', 'read_plan',
])

export async function composeGroundedAssistantReply({ model, prompt, intent, response, onToken, preferences }) {
  if (!model || !READ_ONLY_INTENTS.has(intent?.type) || !response?.text) return null
  const source = {
    title: response.title || '',
    text: response.text,
    rows: (response.rows || []).slice(0, 8).map(({ title, detail, value }) => ({ title, detail, value })),
  }
  const result = await askLocalModel({
    model,
    tools: [],
    timeoutMs: 12_000,
    stream: true,
    onToken,
    messages: [
      { role: 'system', content: `Answer the user ${preferences?.answerStyle === 'concise' ? 'in one short sentence' : 'in one or two concise sentences'} using only the supplied Blossom result. The result is authoritative. Preserve exact names, dates, statuses, and amounts. Do not add inferred facts, calculations, recommendations, or claims of actions. If the result does not contain the requested fact, say that it is unavailable. Do not repeat the result as a data dump; the app shows the result details separately.` },
      { role: 'user', content: `Question: ${prompt}\nBlossom result JSON: ${JSON.stringify(source).slice(0, 7000)}` },
    ],
  })
  const reply = String(result?.message?.content || '').trim()
  return reply.length <= 700 ? reply : `${reply.slice(0, 697).trimEnd()}…`
}
