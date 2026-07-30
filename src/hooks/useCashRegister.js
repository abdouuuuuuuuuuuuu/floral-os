import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Returns YYYY-MM-DD in LOCAL timezone (not UTC). */
function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  const [dayTransactions, setDayTransactions] = useState([])
  const [dayOrders, setDayOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isMounted = useRef(true)
  const channelRef = useRef(null)

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
    return data || []
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

  // ─── Fetch linked orders for today ────────────────────────────────────────────
  const fetchLinkedOrders = useCallback(async () => {
    const today = getLocalDateStr()
    const dayStart = `${today}T00:00:00`
    const dayEnd = `${today}T23:59:59`

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, status, created_at, client_name, payment_method')
      .eq('status', 'done')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      throw ordersError
    }

    if (!orders || orders.length === 0) return []
    return enrichOrders(orders)
  }, [enrichOrders])

  // ─── Load day details ─────────────────────────────────────────────────────────
  const loadDayDetails = useCallback(async (date) => {
    if (!isValidDateStr(date)) {
      console.error('Invalid date:', date)
      return
    }

    setDayTransactions([])
    setDayOrders([])

    const dayStart = `${date}T00:00:00`
    const dayEnd = `${date}T23:59:59`

    try {
      const [txRes, ordersRes] = await Promise.all([
        supabase
          .from('cash_register')
          .select('*')
          .eq('register_date', date)
          .order('created_at', { ascending: true }),
        supabase
          .from('orders')
          .select('id, order_number, total_amount, status, created_at, client_name, payment_method')
          .eq('status', 'done')
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd)
          .order('created_at', { ascending: true })
      ])

      if (!isMounted.current) return
      if (txRes.error) throw txRes.error

      const enrichedOrders = await enrichOrders(ordersRes.data || [])
      if (!isMounted.current) return

      setDayTransactions(txRes.data || [])
      setDayOrders(enrichedOrders)
    } catch (err) {
      console.error('Failed to load day details:', err)
    }
  }, [enrichOrders])

  // ─── Load all data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isMounted.current) return
    setLoading(true)
    setError(null)

    try {
      const [txns, summary, calDays, orders] = await Promise.all([
        fetchTodayTransactions(),
        fetchDailySummary(),
        fetchCalendarDays(),
        fetchLinkedOrders()
      ])

      if (!isMounted.current) return

      setTransactions(txns)
      setDailySummary(summary)
      setCalendarDays(calDays)
      setLinkedOrders(orders)
    } catch (err) {
      console.error('Error loading cash register data:', err)
      if (isMounted.current) setError(err)
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [fetchTodayTransactions, fetchDailySummary, fetchCalendarDays, fetchLinkedOrders])

  // ─── Realtime subscription (per-instance, properly cleaned up) ────────────────
  useEffect(() => {
    isMounted.current = true
    loadData()

    channelRef.current = supabase
      .channel('cash_register_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_register' },
        () => {
          if (isMounted.current) loadData()
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn('[useCashRegister] Realtime status:', status)
        }
      })

    return () => {
      isMounted.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(console.error)
        channelRef.current = null
      }
    }
  }, [loadData])

  // ─── Add transaction ────────────────────────────────────────────────────────────
  const addTransaction = useCallback(async (type, amount, description = '', category = '', quantity = null, unitPrice = null) => {
    const today = getLocalDateStr()

    if (!['opening', 'cash_in', 'cash_out', 'closing'].includes(type)) {
      throw new Error('Invalid transaction type')
    }

    const numAmount = toIntegerAmount(amount)
    if (Number.isNaN(numAmount)) {
      throw new Error('Invalid amount')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('cash_register')
      .insert({
        transaction_type: type,
        amount: numAmount,
        description: String(description || '').slice(0, 500),
        category: String(category || '').slice(0, 100),
        quantity: quantity !== null ? Math.max(0, Math.round(Number(quantity))) : null,
        unit_price: unitPrice !== null ? Math.round(Number(unitPrice)) : null,
        register_date: today,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding transaction:', error)
      throw error
    }

    return data
  }, [])

  // ─── Add expense ──────────────────────────────────────────────────────────────
  const addExpense = useCallback(async (item, quantity, unitPrice, category = 'Supplies') => {
    const qty = Math.max(1, Math.round(Number(quantity)) || 1)
    const price = Math.round(Number(unitPrice)) || 0
    const total = qty * price
    if (total <= 0 || !item?.trim()) throw new Error('Invalid expense data')
    return addTransaction('cash_out', total, item.trim(), category, qty, price)
  }, [addTransaction])

  // ─── Set opening balance ───────────────────────────────────────────────────────
  const setOpeningBalance = useCallback(async (amount) => {
    return addTransaction('opening', amount, 'Opening balance', 'Opening')
  }, [addTransaction])

  // ─── Set closing balance ───────────────────────────────────────────────────────
  const setClosingBalance = useCallback(async (amount) => {
    return addTransaction('closing', amount, 'Closing balance', 'Closing')
  }, [addTransaction])

  return {
    transactions,
    dailySummary,
    calendarDays,
    linkedOrders,
    dayTransactions,
    dayOrders,
    loading,
    error,
    addTransaction,
    addExpense,
    setOpeningBalance,
    setClosingBalance,
    refresh: loadData,
    loadDayDetails
  }
}