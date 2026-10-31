// src/hooks/useOrders.js
//
// FIXES IN THIS VERSION
//
// 1. DOUBLE STOCK DEDUCTION. createOrder() decrements stock at creation.
//    updateStatus() decremented it AGAIN on the transition to 'done'.
//    Every normal order removed twice what it sold.
//    Rule now: stock leaves at CREATION, comes back on CANCEL or DELETE.
//    Nothing happens on the 'done' transition.
//
// 2. create_order() writes the sale row itself; later payments and refunds
//    use a transaction-safe RPC so the order and register stay in sync.
//
// 3. deleteOrder used to orphan cash rows by nulling order_id, leaving
//    the money counted against a sale that no longer exists. It now
//    reverses them properly.
//
// 4. stats used toISOString() (UTC) while the register uses local dates.
//    In UTC+1 that put anything sold before 01:00 on the previous day.
//
// 5. Removed 4 console.log debug lines.
//
// 6. Payments and refunds update the order and cash ledger atomically and
//    use request IDs to make retried submissions idempotent.
//
// 7. DIAGNOSTIC: updateOrder() now exposes the complete Supabase RPC
//    error (message, code, details, hint) so we can identify why a
//    florist cannot save an order edit.
//

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { delayOrder as delayOrderWorkflow, recordOrderPayment as recordOrderPaymentWorkflow, reopenVoidedOrder as reopenVoidedOrderWorkflow, restoreVoidedOrder as restoreVoidedOrderWorkflow, saveOrderEdits, setOrderStatus as setOrderStatusWorkflow, voidOrder as voidOrderWorkflow } from '../lib/orders'

const PAYMENT_METHODS = new Set(['cash', 'baridimob', 'usd'])

function normalizePaymentMethod(value) {
  const normalized = String(value || 'cash')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

  if (normalized === 'baridi' || normalized === 'baridimobile') {
    return 'baridimob'
  }

  if (normalized === 'dollar' || normalized === 'dollars') {
    return 'usd'
  }

  return PAYMENT_METHODS.has(normalized) ? normalized : 'cash'
}

function normalizeSearchText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** YYYY-MM-DD in LOCAL time. Must match useCashRegister. */
function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const COMMON_COLORS = [
  'red',
  'pink',
  'white',
  'yellow',
  'orange',
  'purple',
  'blue',
  'green',
  'black',
  'peach',
  'coral',
  'lavender',
  'cream',
  'burgundy',
  'maroon',
  'gold',
  'silver',
  'ivory',
  'mauve',
  'teal',
  'navy',
  'crimson',
  'salmon',
  'fuchsia',
  'magenta',
  'violet',
  'indigo',
  'turquoise',
  'lime',
  'olive',
  'chocolate',
  'tan',
  'beige',
  'mint',
  'lilac',
  'plum',
  'ruby',
  'emerald',
  'sapphire',
  'amber',
  'copper',
  'rose',
  'blush',
  'snow',
  'lemon',
  'tangerine',
  'berry',
  'wine',
  'caramel',
  'honey',
  'champagne',
  'taupe',
  'slate',
  'charcoal',
  'mahogany',
  'rust',
  'mustard',
  'jade',
  'aqua',
  'sky',
  'forest',
  'sage',
  'moss',
  'sand',
  'dusty',
  'pastel',
  'neon',
  'bright',
  'dark',
  'light',
  'pale',
  'deep',
  'soft',
  'hot',
  'cool',
  'warm',
  'royal',
  'baby',
  'powder',
  'midnight',
  'sunset',
  'sunrise',
  'rainbow',
  'ombre',
  'multicolor',
  'mixed',
  'assorted',
  'variegated',
]

function extractColorFromName(name = '') {
  const lower = name.toLowerCase()

  for (const color of COMMON_COLORS) {
    if (lower.includes(color)) {
      return color.charAt(0).toUpperCase() + color.slice(1)
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────

export function useOrders() {
  const [orders, setOrders] = useState([])
  const ordersRef = useRef(orders)
  const [staffById, setStaffById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [deliveryRange, setDeliveryRange] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, role, avatar_url')

    const map = {}

    for (const p of data || []) {
      map[p.id] = p
    }

    setStaffById(map)
  }, [])

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

    const pageSize = 500
    let offset = 0
    const data = []
    let fetchError = null
    while (true) {
      const page = await supabase
        .from('orders')
        .select(`
          *,
          order_items(
            *,
            products(
              product_id,
              item_name,
              image_url,
              color,
              flower_type,
              category,
              description
            )
          )
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (page.error) { fetchError = page.error; break }
      const rows = page.data || []
      data.push(...rows)
      if (rows.length < pageSize) break
      offset += pageSize
    }

    if (fetchError) {
      console.error('Error fetching orders:', fetchError)
      setError('Could not load orders.')
    } else {
      setError(null)
      setOrders(data)
      ordersRef.current = data
    }

    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    fetchStaff()
    fetchOrders()
  }, [fetchStaff, fetchOrders])

  useEffect(() => {
    const refreshOrders = () => fetchOrders({ silent: true })
    window.addEventListener('blossom:orders-changed', refreshOrders)
    return () => window.removeEventListener('blossom:orders-changed', refreshOrders)
  }, [fetchOrders])

  // The activity table is the single cross-device signal for order changes.
  // Refreshing the snapshot keeps the existing list/filter logic authoritative.
  useEffect(() => {
    let channel
    let active = true
    let refreshTimer
    const refreshQuietly = () => {
      if (!active) return
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => { if (active) void fetchOrders({ silent: true }) }, 250)
    }
    channel = supabase
      .channel('orders-activity-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, refreshQuietly)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refreshQuietly()
      })
    window.addEventListener('online', refreshQuietly)
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshQuietly() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      clearTimeout(refreshTimer)
      window.removeEventListener('online', refreshQuietly)
      document.removeEventListener('visibilitychange', onVisibility)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [fetchOrders])

  const ordersWithStaff = useMemo(
    () =>
      orders.map((o) => ({
        ...o,
        cashier: staffById[o.cashier_id] || staffById[o.created_by] || null,
      })),
    [orders, staffById]
  )

  const normalOrders = useMemo(
    () => ordersWithStaff.filter((o) => o.order_type !== 'quick_sale'),
    [ordersWithStaff]
  )

  const searchDateOrders = useMemo(() => {
    let result = [...normalOrders]

    if (searchQuery.trim()) {
      const query = normalizeSearchText(searchQuery.trim())
      const terms = query.split(/\s+/).filter(Boolean)
      const phoneDigits = query.replace(/\D/g, '')
      result = result.filter((order) => {
        const searchable = [
          order.client_name,
          order.order_number,
          order.client_phone,
          order.notes,
          ...(order.order_items || []).map((item) => item.product_name || item.products?.item_name),
        ].map(normalizeSearchText).join(' ')
        return terms.every((term) => searchable.includes(term)) ||
          (phoneDigits.length > 0 && String(order.client_phone || '').replace(/\D/g, '').includes(phoneDigits))
      })
    }

    if (deliveryRange !== 'all') {
      const today = new Date()
      const todayStr = getLocalDateStr(today)
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfWeek = new Date(startOfToday)
      endOfWeek.setDate(endOfWeek.getDate() + 7)
      const weekEndStr = getLocalDateStr(endOfWeek)
      const staleBefore = new Date(startOfToday)
      staleBefore.setDate(staleBefore.getDate() - 3)
      const staleBeforeStr = getLocalDateStr(staleBefore)
      const monthPrefix = todayStr.slice(0, 7)
      result = result.filter((order) => {
        const deliveryDate = order.delivery_date ? String(order.delivery_date).slice(0, 10) : ''
        if (deliveryRange === 'unscheduled') return !deliveryDate
        if (deliveryRange === 'stale') return Boolean(deliveryDate && deliveryDate < staleBeforeStr && ['new', 'processing'].includes(order.status))
        if (!deliveryDate) return false
        if (deliveryRange === 'today') return deliveryDate === todayStr
        if (deliveryRange === 'week') return deliveryDate >= todayStr && deliveryDate < weekEndStr
        if (deliveryRange === 'month') return deliveryDate.startsWith(monthPrefix)
        return true
      })
    }

    return result
  }, [normalOrders, searchQuery, deliveryRange])

  const filteredOrders = useMemo(() => {
    let result = [...searchDateOrders]
    if (statusFilter !== 'all') result = result.filter((order) => order.status === statusFilter)
    if (paymentFilter === 'due') result = result.filter((order) => Number(order.amount_due ?? (Number(order.total_amount || 0) - Number(order.amount_paid || 0))) > 0)
    else if (paymentFilter !== 'all') result = result.filter((order) => order.payment_status === paymentFilter)

    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'amount') cmp = (Number(a.total_amount) || 0) - (Number(b.total_amount) || 0)
      if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '')
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [searchDateOrders, statusFilter, paymentFilter, sortBy, sortDir])

  const stats = useMemo(() => {
    const todayStr = getLocalDateStr()

    const activeOrders = normalOrders.filter((order) => order.status !== 'cancelled')
    const todayOrders = activeOrders.filter(
      (o) => getLocalDateStr(new Date(o.created_at)) === todayStr
    )

    const paidOrders = normalOrders.filter(
      (o) => o.payment_status === 'paid'
    )

    const unpaidOrders = normalOrders.filter(
      (o) =>
        o.payment_status === 'unpaid' ||
        o.payment_status === 'partial'
    )

    return {
      total: normalOrders.length,
      today: todayOrders.length,
      pending: normalOrders.filter(
        (o) => o.status === 'new' || o.status === 'processing'
      ).length,
      done: normalOrders.filter((o) => o.status === 'done').length,
      cancelled: normalOrders.filter(
        (o) => o.status === 'cancelled'
      ).length,
      paid: paidOrders.length,
      unpaid: unpaidOrders.length,
      totalRevenue: activeOrders.reduce(
        (sum, order) => sum + Number(order.amount_paid || 0),
        0
      ),
      todayRevenue: todayOrders.reduce(
        (sum, order) => sum + Number(order.amount_paid || 0),
        0
      ),
      outstanding: unpaidOrders.reduce((s, o) => {
        const due =
          o.amount_due ??
          o.total_amount - (o.amount_paid || 0)

        return s + Math.max(0, due || 0)
      }, 0),
    }
  }, [normalOrders])

  const statusCounts = useMemo(() => {
    const scoped = paymentFilter === 'all'
      ? searchDateOrders
      : paymentFilter === 'due'
        ? searchDateOrders.filter((order) => Number(order.amount_due ?? (Number(order.total_amount || 0) - Number(order.amount_paid || 0))) > 0)
        : searchDateOrders.filter((order) => order.payment_status === paymentFilter)
    return {
      all: scoped.length,
      new: scoped.filter((order) => order.status === 'new').length,
      processing: scoped.filter((order) => order.status === 'processing').length,
      done: scoped.filter((order) => order.status === 'done').length,
      cancelled: scoped.filter((order) => order.status === 'cancelled').length,
    }
  }, [searchDateOrders, paymentFilter])

  const paymentCounts = useMemo(() => {
    const scoped = statusFilter === 'all'
      ? searchDateOrders
      : searchDateOrders.filter((order) => order.status === statusFilter)
    return {
      all: scoped.length,
      paid: scoped.filter((order) => order.payment_status === 'paid').length,
      partial: scoped.filter((order) => order.payment_status === 'partial').length,
      unpaid: scoped.filter((order) => order.payment_status === 'unpaid').length,
      due: scoped.filter((order) => Number(order.amount_due ?? (Number(order.total_amount || 0) - Number(order.amount_paid || 0))) > 0).length,
      refunded: scoped.filter((order) => order.payment_status === 'refunded').length,
    }
  }, [searchDateOrders, statusFilter])

  const processingFlowersByColor = useMemo(() => {
    const colorMap = {}

    normalOrders
      .filter((o) => o.status === 'processing')
      .forEach((order) => {
        order.order_items?.forEach((item) => {
          let color = item.color || item.products?.color

          if (!color) {
            color = extractColorFromName(
              item.product_name ||
                item.products?.item_name ||
                ''
            )
          }

          if (!color) {
            color = item.flower_type || item.products?.flower_type
          }

          if (color) {
            colorMap[color] =
              (colorMap[color] || 0) + (item.quantity || 0)
          }
        })
      })

    return Object.entries(colorMap)
      .sort((a, b) => b[1] - a[1])
      .map(([color, quantity]) => ({
        color,
        quantity,
      }))
  }, [normalOrders])

  // ─── Status ────────────────────────────────────────────────────

  const updateStatus = useCallback(
    async (orderId, newStatus) => {
      try {
        const {
          data: order,
          error: fetchErr,
        } = await supabase
          .from('orders')
          .select(
            'status, amount_paid, order_number, payment_method, order_items(product_id, quantity)'
          )
          .eq('id', orderId)
          .single()

        if (fetchErr) {
          throw fetchErr
        }

        if (order.status !== 'cancelled' && newStatus === 'cancelled') return await voidOrder(orderId, 'Cancelled from Orders')
        if (order.status === 'cancelled' && newStatus !== 'cancelled') {
          const data = await reopenVoidedOrderWorkflow(orderId, newStatus)
          await fetchOrders({ silent: true })
          return data
        }
        await setOrderStatusWorkflow(orderId, newStatus)

        await fetchOrders({ silent: true })

        return true
      } catch (err) {
        console.error('Error updating status:', err)
        throw new Error(
          err.message || 'Could not update the order status.'
        )
      }
    },
    [fetchOrders]
  )

  // ─── Payments ──────────────────────────────────────────────────
  // Payment state and the register ledger are committed together by the RPC.
  const recordOrderPayment = useCallback(async ({ orderId, requestId, amount, paymentMethod, notes, action }) => {
    await recordOrderPaymentWorkflow({ orderId, requestId, amount, paymentMethod: normalizePaymentMethod(paymentMethod), notes: notes || '', action })
    void fetchOrders({ silent: true })
    return true
  }, [fetchOrders])

  const markAsPaid = useCallback(async (orderId, paymentMethod = null, notes = '', requestId = null) => {
    const order = ordersRef.current.find((item) => item.id === orderId)
    if (!order) throw new Error('Order not found.')
    const remaining = Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0))
    if (!remaining) return true
    return recordOrderPayment({ orderId, requestId, amount: remaining, paymentMethod: paymentMethod || order.payment_method, notes: notes || 'Full payment received', action: 'payment' })
  }, [recordOrderPayment])

  const recordPartialPayment = useCallback(async (orderId, amount, notes = '', paymentMethod = null, requestId = null) => {
    const order = ordersRef.current.find((item) => item.id === orderId)
    if (!order) throw new Error('Order not found.')
    return recordOrderPayment({ orderId, requestId, amount, paymentMethod: paymentMethod || order.payment_method, notes, action: 'payment' })
  }, [recordOrderPayment])

  const recordRefund = useCallback(async (orderId, amount, notes = '', paymentMethod = null, requestId = null) => {
    const order = ordersRef.current.find((item) => item.id === orderId)
    if (!order) throw new Error('Order not found.')
    return recordOrderPayment({ orderId, requestId, amount, paymentMethod: paymentMethod || order.payment_method, notes, action: 'refund' })
  }, [recordOrderPayment])

  // ─── Void and delete ───────────────────────────────────────────

  const voidOrder = useCallback(
    async (orderId, reason = '') => {
      const data = await voidOrderWorkflow(orderId, reason)

      await fetchOrders({ silent: true })

      return data
    },
    [fetchOrders]
  )

  const restoreVoidedOrder = useCallback(
    async (orderId) => {
      const data = await restoreVoidedOrderWorkflow(orderId)
      await fetchOrders({ silent: true })
      return data
    },
    [fetchOrders]
  )

  // ─── Edit ──────────────────────────────────────────────────────

  const updateOrder = useCallback(
    async (
      orderId,
      {
        orderData = {},
        itemUpdates = [],
        requestId = null,
        status = null,
      } = {}
    ) => {
      const previousOrder = ordersRef.current.find((order) => order.id === orderId)
      if (previousOrder) {
        const edits = itemUpdates || []
        const nextItems = (previousOrder.order_items || [])
          .map((line) => {
            const edit = edits.find((item) => !item.is_new && item.id === line.id)
            if (!edit) return line
            if (edit.deleted) return null
            const quantity = Math.max(1, Number(edit.quantity) || 1)
            return { ...line, quantity, total_price: quantity * Number(line.unit_price || 0) }
          })
          .filter(Boolean)
        for (const edit of edits.filter((item) => item.is_new && !item.deleted)) {
          nextItems.push({
            id: edit.id || `pending-${orderId}-${edit.product_id}-${Date.now()}`,
            order_id: orderId,
            product_id: edit.product_id,
            quantity: Math.max(1, Number(edit.quantity) || 1),
            unit_price: Number(edit.unit_price || 0),
            total_price: Math.max(1, Number(edit.quantity) || 1) * Number(edit.unit_price || 0),
            product_name: edit.product_name || 'Product',
            product_image: edit.product_image || '',
            color: edit.color || '',
            flower_type: edit.flower_type || '',
            category: edit.category || '',
          })
        }
        const subtotal = nextItems.reduce((sum, line) => sum + Number(line.total_price ?? (line.quantity * line.unit_price) ?? 0), 0)
        const total = Math.max(0, subtotal + Number(orderData.price_adjustment ?? previousOrder.price_adjustment ?? 0) + Number(previousOrder.tax_amount || 0))
        const amountPaid = Number(previousOrder.amount_paid || 0)
        const optimisticOrder = {
          ...previousOrder,
          ...orderData,
          order_items: nextItems,
          subtotal_amount: subtotal,
          total_amount: total,
          amount_due: Math.max(0, total - amountPaid),
          payment_status: amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
          ...(status ? { status } : {}),
        }
        const nextOrders = ordersRef.current.map((order) => order.id === orderId ? optimisticOrder : order)
        ordersRef.current = nextOrders
        setOrders(nextOrders)
      }

      const restoreOrder = () => {
        if (!previousOrder) return
        const nextOrders = ordersRef.current.map((order) => order.id === orderId ? previousOrder : order)
        ordersRef.current = nextOrders
        setOrders(nextOrders)
      }

      const additions = (itemUpdates || []).filter((item) => item.is_new && !item.deleted)
      let data
      try {
        data = await saveOrderEdits({
          orderId,
          items: (itemUpdates || []).filter((item) => !item.is_new).map((item) => ({ id: item.id, quantity: item.quantity, deleted: Boolean(item.deleted) })),
          orderData: orderData || {},
          additions: additions.map(({ product_id, quantity, unit_price }) => ({ product_id, quantity, unit_price })),
          requestId: additions.length ? requestId : null,
          status,
        })
      } catch (error) {
        restoreOrder()
        void fetchOrders({ silent: true })
        throw error
      }

      void fetchOrders({ silent: true })

      return data
    },
    [fetchOrders]
  )

  const delayOrder = useCallback(async (orderId, deliveryDate, reason) => {
    const data = await delayOrderWorkflow(orderId, deliveryDate, reason)
    await fetchOrders({ silent: true })
    return data
  }, [fetchOrders])

  const toggleSort = useCallback(
    (field) => {
      setSortBy((prev) => {
        if (prev === field) {
          setSortDir((d) =>
            d === 'asc' ? 'desc' : 'asc'
          )

          return prev
        }

        setSortDir(field === 'status' ? 'asc' : 'desc')

        return field
      })
    },
    []
  )

  return {
    orders: filteredOrders,
    allOrders: normalOrders,
    staffById,
    loading,
    error,

    statusFilter,
    setStatusFilter,

    paymentFilter,
    setPaymentFilter,

    deliveryRange,
    setDeliveryRange,

    searchQuery,
    setSearchQuery,

    sortBy,
    sortDir,

    stats,
    statusCounts,
    paymentCounts,
    processingFlowersByColor,

    updateStatus,
    voidOrder,
    restoreVoidedOrder,

    markAsPaid,
    recordPartialPayment,
    recordRefund,

    updateOrder,
    delayOrder,

    refresh: fetchOrders,
    toggleSort,
  }
}
