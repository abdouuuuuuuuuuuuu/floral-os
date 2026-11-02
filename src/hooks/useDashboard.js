import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { delayOrder, setOrderStatus, voidOrder as voidOrderWorkflow } from '../lib/orders'
import { useAuth } from '../context/AuthContext'
import { addCalendarDays, fetchAllRows, localDate, localDayBounds } from '../lib/assistant/dataAccess'
import { getShippingPlan, localDateString } from '../lib/shippingPlan'

const ACTIVE = ['new', 'processing']
const STALE_DAYS = 3
const emptyStats = { todaySales: 0, yesterdaySales: 0, salesChange: null, dailyTarget: 0, targetProgress: 0, targetRemaining: 0 }

export function useDashboard() {
  const { role } = useAuth()
  const isOwner = role === 'owner'
  const canReadCashLedger = ['owner', 'manager', 'cashier'].includes(role)
  const [stats, setStats] = useState(emptyStats)
  const [workQueue, setWorkQueue] = useState([])
  const [outstanding, setOutstanding] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [cashPosition, setCashPosition] = useState(null)
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [sectionErrors, setSectionErrors] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchDashboardData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    const today = localDate()
    const todayBounds = localDayBounds(0)
    const yesterdayBounds = localDayBounds(-1)
    const failures = {}

    const loadSection = async (name, load) => {
      try { await load() } catch (error) {
        console.error(`Dashboard ${name} section failed:`, error)
        failures[name] = 'This section could not be loaded. Check your connection and retry.'
        if (name === 'metrics') { setStats(emptyStats); setAlertsEnabled(false) }
        if (name === 'orders') setWorkQueue([])
        if (name === 'payments') setOutstanding([])
        if (name === 'stock') setLowStock([])
        if (name === 'cash') setCashPosition(null)
      }
    }

    await Promise.all([
      loadSection('metrics', async () => {
        const todayReceiptRows = canReadCashLedger
          ? fetchAllRows((from, to) => supabase.from('cash_register').select('amount')
            .eq('register_date', today).eq('transaction_type', 'cash_in').not('order_id', 'is', null)
            .order('id', { ascending: true }).range(from, to), 500)
          : fetchAllRows((from, to) => supabase.from('orders').select('amount_paid')
            .is('deleted_at', null).or('status.is.null,status.neq.cancelled').gte('created_at', todayBounds.start).lt('created_at', todayBounds.end)
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 500)
        const yesterdayReceiptRows = canReadCashLedger
          ? fetchAllRows((from, to) => supabase.from('cash_register').select('amount')
            .eq('register_date', addCalendarDays(today, -1)).eq('transaction_type', 'cash_in').not('order_id', 'is', null)
            .order('id', { ascending: true }).range(from, to), 500)
          : fetchAllRows((from, to) => supabase.from('orders').select('amount_paid')
            .is('deleted_at', null).or('status.is.null,status.neq.cancelled').gte('created_at', yesterdayBounds.start).lt('created_at', yesterdayBounds.end)
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 500)

        const [{ data: settings, error: settingsError }, todayReceipts, yesterdayReceipts] = await Promise.all([
          supabase.from('settings').select('daily_target, low_stock_alert').limit(1).maybeSingle(),
          todayReceiptRows,
          yesterdayReceiptRows,
        ])
        if (settingsError) throw settingsError
        const todaySales = todayReceipts.reduce((sum, row) => sum + Number(row.amount ?? row.amount_paid ?? 0), 0)
        const yesterdaySales = yesterdayReceipts.reduce((sum, row) => sum + Number(row.amount ?? row.amount_paid ?? 0), 0)
        const dailyTarget = Number(settings?.daily_target || 0)
        setAlertsEnabled(settings?.low_stock_alert !== false)
        setStats({
          todaySales,
          yesterdaySales,
          salesChange: yesterdaySales > 0 ? Number((((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1)) : null,
          dailyTarget,
          targetProgress: dailyTarget ? Math.round((todaySales / dailyTarget) * 100) : 0,
          targetRemaining: Math.max(0, dailyTarget - todaySales),
        })
      }),
      loadSection('orders', async () => {
        const queue = await fetchAllRows((from, to) => supabase.from('orders')
          .select('id, order_number, client_name, client_phone, total_amount, amount_due, delivery_method, delivery_date, delivery_time, delivery_city, delivery_wilaya, delivery_latitude, delivery_longitude, shipping_distance_km, shipping_transit_days, order_type, status, order_items(quantity, color, flower_type, product_name, products(item_name))')
          .in('status', ACTIVE)
          .or('order_type.is.null,order_type.neq.quick_sale')
          .order('delivery_date', { ascending: true, nullsFirst: false })
          .order('delivery_time', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to), 500)
        setWorkQueue(queue)
      }),
      loadSection('payments', async () => {
        const rows = await fetchAllRows((from, to) => supabase.from('orders')
          .select('id, order_number, client_name, client_phone, total_amount, amount_paid, amount_due, payment_status, created_at, delivery_date, status')
          .or('status.is.null,status.neq.cancelled')
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 500)
        const dueOrders = rows.map((order) => ({
          ...order,
          amount_due: order.amount_due == null
            ? Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0))
            : Number(order.amount_due),
        })).filter((order) => order.amount_due > 0)
        setOutstanding(dueOrders)
      }),
      loadSection('stock', async () => {
        const products = await fetchAllRows((from, to) => supabase.from('products')
          .select('product_id, item_name, stock_level, low_stock_threshold, image_url')
          .eq('is_active', true).order('stock_level', { ascending: true }).order('product_id', { ascending: true }).range(from, to), 500)
        setLowStock(products.filter((product) => Number(product.stock_level || 0) <= Number(product.low_stock_threshold ?? 10)))
      }),
      loadSection('cash', async () => {
        if (!isOwner) { setCashPosition(null); return }
        const rows = await fetchAllRows((from, to) => supabase.from('cash_register')
          .select('transaction_type, amount, is_closed, created_at')
          .eq('register_date', today).order('created_at', { ascending: true }).range(from, to), 500)
        const sum = (type) => rows.filter((row) => row.transaction_type === type)
          .reduce((total, row) => total + Number(row.amount || 0), 0)
        const closing = [...rows].reverse().find((row) => row.transaction_type === 'closing')
        const openingExists = rows.some((row) => row.transaction_type === 'opening')
        setCashPosition({
          opening: sum('opening'),
          cashIn: sum('cash_in'),
          cashOut: sum('cash_out'),
          computed: sum('opening') + sum('cash_in') - sum('cash_out'),
          declared: closing ? Number(closing.amount || 0) : null,
          isClosed: Boolean(closing),
          hasOpening: openingExists,
        })
      }),
    ])

    setSectionErrors(failures)
    if (!quiet) setLoading(false)
  }, [isOwner, canReadCashLedger, role])

  useEffect(() => { fetchDashboardData() }, [fetchDashboardData])

  const queueGroups = useMemo(() => {
    const today = localDate()
    const tomorrow = addCalendarDays(today, 1)
    const staleBefore = addCalendarDays(today, -STALE_DAYS)
    const groups = { overdue: [], today: [], tomorrow: [], later: [], undated: [] }
    for (const order of workQueue) {
      const date = order.delivery_date ? String(order.delivery_date).slice(0, 10) : ''
      if (!date) groups.undated.push(order)
      else if (date < staleBefore) continue
      else if (date < today) groups.overdue.push(order)
      else if (date === today) groups.today.push(order)
      else if (date === tomorrow) groups.tomorrow.push(order)
      else groups.later.push(order)
    }
    const byTime = (a, b) => (a.delivery_time || '99:99').localeCompare(b.delivery_time || '99:99')
    groups.overdue.sort(byTime)
    groups.today.sort(byTime)
    groups.tomorrow.sort(byTime)
    return groups
  }, [workQueue])

  const stale = useMemo(() => {
    const staleBefore = addCalendarDays(localDate(), -STALE_DAYS)
    return workQueue.filter((order) => order.delivery_date && String(order.delivery_date).slice(0, 10) < staleBefore)
      .sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)))
  }, [workQueue])

  const productsNeeded = useMemo(() => {
    const counts = new Map()
    let unlabelled = 0
    for (const order of [...queueGroups.overdue, ...queueGroups.today]) {
      for (const item of order.order_items || []) {
        const name = String(item.product_name || item.products?.item_name || '').trim()
        const quantity = Number(item.quantity || 0)
        if (!name) { unlabelled += quantity; continue }
        const key = name.toLocaleLowerCase()
        const entry = counts.get(key) || { name, quantity: 0 }
        entry.quantity += quantity
        counts.set(key, entry)
      }
    }
    return { items: [...counts.values()].sort((a, b) => b.quantity - a.quantity), unlabelled }
  }, [queueGroups])

  const deliveryRun = useMemo(() => {
    const today = localDate()
    const tomorrow = addCalendarDays(today, 1)
    return workQueue.filter((order) => order.delivery_method && order.delivery_method !== 'pickup'
      && [today, tomorrow].includes(String(order.delivery_date || '').slice(0, 10)))
      .sort((a, b) => `${a.delivery_date}${a.delivery_time || '99:99'}`.localeCompare(`${b.delivery_date}${b.delivery_time || '99:99'}`))
  }, [workQueue])

  const shippingPrep = useMemo(() => {
    const today = localDateString()
    const planned = workQueue.map((order) => ({ order, plan: getShippingPlan(order, today) })).filter(({ plan }) => plan)
    return {
      shipToday: planned.filter(({ plan }) => ['today', 'overdue'].includes(plan.urgency))
        .sort((a, b) => String(a.plan.shipDate).localeCompare(String(b.plan.shipDate))),
      needsAttention: planned.filter(({ plan }) => plan.urgency === 'attention'),
    }
  }, [workQueue])

  const totalOutstanding = useMemo(() => outstanding.reduce((sum, order) => sum + order.amount_due, 0), [outstanding])

  const updateStatus = useCallback(async (orderId, newStatus) => {
    if (newStatus === 'cancelled') await voidOrderWorkflow(orderId, 'Cancelled from dashboard')
    else await setOrderStatus(orderId, newStatus)
    await fetchDashboardData({ quiet: true })
    return true
  }, [fetchDashboardData])

  const rescheduleOrder = useCallback(async (orderId, newDate) => {
    await delayOrder(orderId, newDate, 'Rescheduled from dashboard')
    await fetchDashboardData({ quiet: true })
  }, [fetchDashboardData])

  const voidOrder = useCallback(async (orderId, reason) => {
    await voidOrderWorkflow(orderId, reason || 'Never delivered')
    await fetchDashboardData({ quiet: true })
  }, [fetchDashboardData])

  return {
    stats, workQueue, stale, rescheduleOrder, voidOrder, queueGroups, deliveryRun, shippingPrep,
    productsNeeded, outstanding, totalOutstanding, lowStock, alertsEnabled, cashPosition,
    loading, sectionErrors, updateStatus, refresh: fetchDashboardData,
  }
}
