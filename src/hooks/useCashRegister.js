import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { localDate } from '../lib/businessDate'

const PAYMENT_METHODS = new Set(['cash', 'baridimob', 'usd'])

function normalizePaymentMethod(value) {
  const normalized = String(value || 'cash')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

  if (normalized === 'baridi' || normalized === 'baridimobile') return 'baridimob'
  if (normalized === 'dollar' || normalized === 'dollars') return 'usd'
  return PAYMENT_METHODS.has(normalized) ? normalized : 'cash'
}

function makeCashEntryRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns YYYY-MM-DD in the shop's business time zone. The database files
 * register rows under the Africa/Algiers date, so the till must agree with it
 * even when the PC clock is set to another zone.
 */
function getLocalDateStr(date = new Date()) {
  return localDate(date)
}

function isValidDateStr(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str)
}

/** Safely coerce a form value to a positive integer amount. */
function toIntegerAmount(val) {
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(n)
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useCashRegister() {
  const [transactions, setTransactions] = useState([])
  const [dailySummary, setDailySummary] = useState(null)
  const [calendarDays, setCalendarDays] = useState([])
  const [linkedOrders, setLinkedOrders] = useState([])
  const [afterHoursOrders, setAfterHoursOrders] = useState([])
  const [dayTransactions, setDayTransactions] = useState([])
  const [dayOrders, setDayOrders] = useState([])
  const [dayUnlinkedCashIn, setDayUnlinkedCashIn] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  const isMounted = useRef(true)
  const channelRef = useRef(null)
  const pendingCashEntryRequestIds = useRef(new Map())
  const activeDayRef = useRef(null)

  // ─── Fetch today's transactions ─────────────────────────────────────────────
  const fetchTodayTransactions = useCallback(async () => {
    const today = getLocalDateStr()
    const { data, error } = await supabase
      .from('cash_register')
      .select('*')
      .eq('register_date', today)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching transactions:', error)
      throw error
    }
    return data || []
  }, [])

  // ─── Fetch daily summary ──────────────────────────────────────────────────────
  const fetchDailySummary = useCallback(async () => {
    const today = getLocalDateStr()
    const { data, error } = await supabase
      .from('daily_cash_summary')
      .select('*')
      .eq('register_date', today)
      .maybeSingle()

    if (error) {
      console.error('Error fetching summary:', error)
      throw error
    }

    return data || {
      register_date: today,
      opening_balance: 0,
      total_cash_in: 0,
      total_cash_out: 0,
      closing_balance: 0,
      is_closed: false,
    }
  }, [])

  // ─── Fetch 30-day calendar data ─────────────────────────────────────────────
  const fetchCalendarDays = useCallback(async () => {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 29)

    const startStr = getLocalDateStr(startDate)
    const endStr = getLocalDateStr(endDate)

    const { data, error } = await supabase
      .from('daily_cash_summary')
      .select('*')
      .gte('register_date', startStr)
      .lte('register_date', endStr)
      .order('register_date', { ascending: true })

    if (error) {
      console.error('Error fetching calendar days:', error)
      throw error
    }

    // The summary view can diverge from the underlying ledger. Rebuild each
    // historical day's in/out totals from the cash transactions themselves,
    // while retaining opening/closing counts and closed state from the view.
    const registerRows = []
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error: registerError } = await supabase
        .from('cash_register')
        .select('register_date, transaction_type, amount')
        .gte('register_date', startStr)
        .lte('register_date', endStr)
        .range(offset, offset + 999)
      if (registerError) throw registerError
      registerRows.push(...(page || []))
      if (!page || page.length < 1000) break
    }

    const totalsByDate = new Map()
    for (const transaction of registerRows) {
      const date = transaction.register_date
      if (!totalsByDate.has(date)) totalsByDate.set(date, { total_cash_in: 0, total_cash_out: 0 })
      const totals = totalsByDate.get(date)
      if (transaction.transaction_type === 'cash_in') totals.total_cash_in += Number(transaction.amount) || 0
      if (transaction.transaction_type === 'cash_out') totals.total_cash_out += Number(transaction.amount) || 0
    }

    return (data || []).map((day) => ({
      ...day,
      total_cash_in: totalsByDate.get(day.register_date)?.total_cash_in || 0,
      total_cash_out: totalsByDate.get(day.register_date)?.total_cash_out || 0,
    }))
  }, [])

  // ─── Fetch order items with product names ───────────────────────────────────
  const fetchOrderItems = useCallback(async (orderIds) => {
    if (!orderIds || orderIds.length === 0) return {}

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, unit_price')
      .in('order_id', orderIds)

    if (itemsError || !items || items.length === 0) {
      if (itemsError) console.error('[fetchOrderItems] Error:', itemsError)
      return {}
    }

    const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))]

    let productsMap = {}
    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('product_id, item_name')
        .in('product_id', productIds)

      if (productsError) {
        console.error('[fetchOrderItems] Products error:', productsError)
      } else {
        (productsData || []).forEach(p => {
          productsMap[p.product_id] = p.item_name
        })
      }
    }

    const itemsByOrder = {}
    items.forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
      itemsByOrder[item.order_id].push({
        ...item,
        product_name: productsMap[item.product_id] || 'Unknown'
      })
    })

    return itemsByOrder
  }, [])

  // ─── Enrich orders with items ─────────────────────────────────────────────────
  const enrichOrders = useCallback(async (orders) => {
    if (!orders || orders.length === 0) return []
    const orderIds = orders.map(o => o.id)
    const itemsByOrder = await fetchOrderItems(orderIds)

    return orders.map(o => ({
      ...o,
      order_items: itemsByOrder[o.id] || []
    }))
  }, [fetchOrderItems])

  // ─── Fetch orders that had CASH IN today (payment-centric) ────────────────────
  const fetchLinkedOrders = useCallback(async () => {
    const today = getLocalDateStr()

    let cashEntries = []
    try {
      const { data, error } = await supabase
        .from('cash_register')
        .select('id, order_id, amount, description, category, payment_method, created_at')
        .eq('register_date', today)
        .eq('transaction_type', 'cash_in')
        .not('order_id', 'is', null)
        .order('created_at', { ascending: true })

      if (error) {
        if (error.message?.includes('order_id') || error.code === '42703') {
          console.warn('[fetchLinkedOrders] order_id column missing. Run migration.')
        } else {
          console.error('Error fetching linked cash entries:', error)
        }
      } else {
        cashEntries = data || []
      }
    } catch (err) {
      console.error('[fetchLinkedOrders] Failed:', err)
    }

    if (cashEntries.length === 0) return []

    const orderIds = [...new Set(cashEntries.map(e => e.order_id))]

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, status, created_at, client_name, client_phone, delivery_date, delivery_time, delivery_method, notes, payment_method, amount_paid, payment_status, order_type, deleted_at')
      .in('id', orderIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      throw ordersError
    }

    const enriched = await enrichOrders(orders || [])

    return enriched.map(order => ({
      ...order,
      day_cash_entries: cashEntries.filter(e => e.order_id === order.id)
    }))
  }, [enrichOrders])

  // ─── Load day details (payment-centric) ───────────────────────────────────────
  const loadDayDetails = useCallback(async (date) => {
    if (!isValidDateStr(date)) {
      console.error('Invalid date:', date)
      return
    }

    activeDayRef.current = date

    setDayTransactions([])
    setDayOrders([])
    setDayUnlinkedCashIn([])

    try {
      const { data: allTx, error: txError } = await supabase
        .from('cash_register')
        .select('*')
        .eq('register_date', date)
        .order('created_at', { ascending: true })

      if (txError) throw txError

      const transactionsList = allTx || []

      const cashInEntries = transactionsList.filter(t => t.transaction_type === 'cash_in')
      const orderIds = [...new Set(cashInEntries.map(t => t.order_id).filter(Boolean))]
      let enrichedOrders = []
      if (orderIds.length > 0) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, order_number, total_amount, status, created_at, client_name, client_phone, delivery_date, delivery_time, delivery_method, notes, payment_method, amount_paid, payment_status, order_type, deleted_at')
          .in('id', orderIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })

        enrichedOrders = await enrichOrders(ordersData || [])

        enrichedOrders = enrichedOrders.map(order => ({
          ...order,
          day_cash_entries: cashInEntries.filter(t => t.order_id === order.id)
        }))
      }
      const visibleOrderIds = new Set(enrichedOrders.map(order => order.id))
      // Keep archived-order payments in the day’s cash totals, but detach
      // them from order cards and list them with unlinked cash entries.
      const unlinkedEntries = cashInEntries
        .filter(t => !visibleOrderIds.has(t.order_id))
        .map(t => ({ ...t, archived_order_link: Boolean(t.order_id) }))

      if (!isMounted.current) return

      setDayTransactions(transactionsList)
      setDayOrders(enrichedOrders)
      setDayUnlinkedCashIn(unlinkedEntries)
    } catch (err) {
      console.error('Failed to load day details:', err)
    }
  }, [enrichOrders])

  const fetchAfterHoursOrders = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_after_hours_orders', { p_register_date: getLocalDateStr() })
    if (error?.code === 'PGRST202') {
      console.warn('[cash register] Apply the latest Supabase migration to enable the after-hours order list.')
      return []
    }
    if (error) throw error
    const orders = data || []
    const ids = orders.map(order => order.id).filter(Boolean)
    if (!ids.length) return orders

    const { data: archivedRows, error: archivedError } = await supabase
      .from('orders')
      .select('id')
      .in('id', ids)
      .not('deleted_at', 'is', null)
    if (archivedError) throw archivedError
    const archivedIds = new Set((archivedRows || []).map(order => order.id))
    return orders.filter(order => !archivedIds.has(order.id))
  }, [])

  // ─── Load all data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isMounted.current) return
    setError(null)

    try {
      const [txns, summary, calDays, orders, afterHours] = await Promise.all([
        fetchTodayTransactions(),
        fetchDailySummary(),
        fetchCalendarDays(),
        fetchLinkedOrders(),
        fetchAfterHoursOrders()
      ])

      if (!isMounted.current) return

      setTransactions(txns)
      setDailySummary(summary)
      setCalendarDays(calDays)
      setLinkedOrders(orders)
      setAfterHoursOrders(afterHours)
      setLastSyncedAt(new Date())
    } catch (err) {
      console.error('Error loading cash register data:', err)
      if (isMounted.current) setError(err)
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [fetchTodayTransactions, fetchDailySummary, fetchCalendarDays, fetchLinkedOrders, fetchAfterHoursOrders])

  // ─── Realtime subscription (cash_register + orders) ───────────────────────────
  useEffect(() => {
    isMounted.current = true
    loadData()

    // Realtime keeps the register quick; polling is the safety net for missed
    // events, temporary websocket disconnects, or tables not in the Realtime
    // publication. Refresh again when the user returns to this tab.
    let refreshTimer = null
    const refreshVisibleRegister = () => {
      if (!isMounted.current || document.visibilityState === 'hidden') return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        if (!isMounted.current) return
        void loadData()
        if (activeDayRef.current) void loadDayDetails(activeDayRef.current)
      }, 250)
    }

    const pollId = window.setInterval(refreshVisibleRegister, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', refreshVisibleRegister)
    window.addEventListener('focus', refreshVisibleRegister)
    window.addEventListener('online', refreshVisibleRegister)

    channelRef.current = supabase
      .channel('cash_register_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_register' },
        () => {
          refreshVisibleRegister()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          refreshVisibleRegister()
        }
      )
      .subscribe((status) => {
        // CLOSED is normal when React unmounts the page and cleanup removes
        // the channel. Log only states that indicate a real connection issue.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[useCashRegister] Realtime connection error:', status)
        }
      })

    return () => {
      isMounted.current = false
      window.clearInterval(pollId)
      if (refreshTimer) clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', refreshVisibleRegister)
      window.removeEventListener('focus', refreshVisibleRegister)
      window.removeEventListener('online', refreshVisibleRegister)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(console.error)
        channelRef.current = null
      }
    }
  }, [loadData, loadDayDetails])

  // ─── Add transaction ────────────────────────────────────────────────────────────
  const addTransaction = useCallback(async (
    type,
    amount,
    description = '',
    category = '',
    quantity = null,
    unitPrice = null,
    orderId = null,
    paymentMethod = 'cash'
  ) => {
    if (!['cash_in', 'cash_out'].includes(type)) {
      throw new Error('Manual transactions must be cash in or cash out')
    }

    const numAmount = toIntegerAmount(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0 || numAmount > 2147483647) {
      throw new Error('Invalid amount')
    }

    const parsedQuantity = quantity !== null && quantity !== undefined
      ? Number(quantity)
      : null
    const parsedUnitPrice = unitPrice !== null && unitPrice !== undefined
      ? Number(unitPrice)
      : null
    if ((parsedQuantity === null) !== (parsedUnitPrice === null)) {
      throw new Error('Quantity and unit price must be supplied together')
    }
    if (
      (parsedQuantity !== null && (!Number.isInteger(parsedQuantity) || parsedQuantity < 0 || parsedQuantity > 2147483647)) ||
      (parsedUnitPrice !== null && (!Number.isInteger(parsedUnitPrice) || parsedUnitPrice < 0 || parsedUnitPrice > 2147483647))
    ) {
      throw new Error('Quantity and unit price must be non-negative whole numbers')
    }
    if (parsedQuantity !== null && parsedQuantity * parsedUnitPrice !== numAmount) {
      throw new Error('Amount must match quantity multiplied by unit price')
    }

    const normalized = {
      type,
      amount: numAmount,
      description: String(description || '').trim().slice(0, 500),
      category: String(category || '').trim().slice(0, 100),
      paymentMethod: normalizePaymentMethod(paymentMethod),
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
      orderId: orderId || null,
    }
    const requestKey = JSON.stringify(normalized)
    let requestId = pendingCashEntryRequestIds.current.get(requestKey)
    if (!requestId) {
      requestId = makeCashEntryRequestId()
      pendingCashEntryRequestIds.current.set(requestKey, requestId)
    }

    const { data, error } = await supabase.rpc('record_manual_cash_entry', {
      p_request_id: requestId,
      p_transaction_type: normalized.type,
      p_amount: normalized.amount,
      p_description: normalized.description,
      p_category: normalized.category,
      p_payment_method: normalized.paymentMethod,
      p_quantity: normalized.quantity,
      p_unit_price: normalized.unitPrice,
      p_order_id: normalized.orderId,
    })

    if (error) {
      console.error('[cash_register] RPC insert failed:', error)
      throw error
    }

    pendingCashEntryRequestIds.current.delete(requestKey)
    return data
  }, [])

  // ─── Add expense ──────────────────────────────────────────────────────────────
  const addExpense = useCallback(async (item, quantity, unitPrice, category = 'Supplies', paymentMethod = 'cash') => {
    const qty = Math.max(1, Math.round(Number(quantity)) || 1)
    const price = Math.round(Number(unitPrice)) || 0
    const total = qty * price
    if (total <= 0 || !item?.trim()) throw new Error('Invalid expense data')
    return addTransaction('cash_out', total, item.trim(), category, qty, price, null, paymentMethod)
  }, [addTransaction])

  // ─── Set opening balance ───────────────────────────────────────────────────────
  const setOpeningBalance = useCallback(async (amount) => {
    const openingAmount = toIntegerAmount(amount)
    if (Number.isNaN(openingAmount) || openingAmount < 0) {
      throw new Error('Invalid opening balance')
    }

    const { data, error } = await supabase.rpc('open_cash_register_with_after_hours', {
      p_amount: openingAmount,
    })
    if (error) throw error
    return data
  }, [])

  // ─── Set closing balance ───────────────────────────────────────────────────────
  const setClosingBalance = useCallback(async (amount) => {
    const closingAmount = toIntegerAmount(amount)
    if (Number.isNaN(closingAmount)) throw new Error('Invalid closing balance')
    const { data, error } = await supabase.rpc('close_cash_register', { p_amount: closingAmount })
    if (error) throw error
    return data
  }, [])

  // ─── Per-pocket breakdowns ─────────────────────────────────────────────────────
  //
  // Always returns every pocket at 0 rather than an empty object, so the
  // UI can read .cash without a guard. CoffreForte's day panel was
  // destructuring dayCashInByMethod / dayCashOutByMethod, which this hook
  // never returned — reading .cash off undefined crashed the panel every
  // time you expanded a calendar day.
  const emptyPockets = () => ({ cash: 0, baridimob: 0, usd: 0, other: 0 })

  const sumByMethod = (rows, type) => {
    const result = emptyPockets()

    for (const transaction of rows || []) {
      if (transaction.transaction_type !== type) continue

      const method = normalizePaymentMethod(transaction.payment_method)
      const amount = Number(transaction.amount) || 0

      if (result[method] !== undefined) result[method] += amount
      else result.other += amount
    }

    return result
  }
  const todayCashInByMethod  = useMemo(() => sumByMethod(transactions, 'cash_in'),  [transactions])
  const todayCashOutByMethod = useMemo(() => sumByMethod(transactions, 'cash_out'), [transactions])

  // Same breakdown for whichever calendar day is open.
  const dayCashInByMethod  = useMemo(() => sumByMethod(dayTransactions, 'cash_in'),  [dayTransactions])
  const dayCashOutByMethod = useMemo(() => sumByMethod(dayTransactions, 'cash_out'), [dayTransactions])

  return {
    transactions,
    dailySummary,
    calendarDays,
    linkedOrders,
    afterHoursOrders,
    dayTransactions,
    dayOrders,
    dayUnlinkedCashIn,
    loading,
    error,
    lastSyncedAt,
    todayCashInByMethod,
    todayCashOutByMethod,
    dayCashInByMethod,
    dayCashOutByMethod,
    addTransaction,
    addExpense,
    setOpeningBalance,
    setClosingBalance,
    refresh: loadData,
    loadDayDetails
  }
}
