// Delivery run sheet: load one date at a time, plus overdue and unplanned work.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { createOrderRequestId, delayOrder, markOrderDelivered, markOrderHandedOff, recordDeliveryOutcome as recordDeliveryOutcomeWorkflow } from '../lib/orders'
import { addCalendarDays, localDate } from '../lib/businessDate.js'

export function useDeliveries(initialDate = localDate()) {
  const [date, setDate] = useState(initialDate)
  const [deliveries, setDeliveries] = useState([])
  const [overdue, setOverdue] = useState([])
  const [needsPlan, setNeedsPlan] = useState([])
  const [weekCounts, setWeekCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const deliveryAttemptRequestIds = useRef(new Map())

  const FIELDS = `
    id, order_number, client_name, client_phone,
    delivery_date, delivery_time, delivery_method,
    status, payment_status, total_amount, amount_due,
    delivery_handed_off_at, delivered_at, delivered_by,
    notes, created_at
  `

  const fetchDay = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const { data, error: dayErr } = await supabase
        .from('orders').select(FIELDS).is('deleted_at', null)
        .eq('delivery_date', date).neq('delivery_method', 'pickup')
        .neq('status', 'cancelled')
        .order('delivery_time', { ascending: true, nullsFirst: false })
      if (dayErr) throw dayErr

      const today = localDate()
      const { data: late, error: lateErr } = await supabase
        .from('orders').select(FIELDS).is('deleted_at', null)
        .lt('delivery_date', today).neq('delivery_method', 'pickup')
        .in('status', ['new', 'processing', 'ready'])
        .order('delivery_date', { ascending: true })
      if (lateErr) throw lateErr

      // Active courier orders without a date cannot appear in a dated run sheet.
      const { data: unplanned, error: unplannedErr } = await supabase
        .from('orders').select(FIELDS).is('deleted_at', null)
        .is('delivery_date', null).neq('delivery_method', 'pickup')
        .in('status', ['new', 'processing', 'ready'])
        .order('created_at', { ascending: true })
      if (unplannedErr) throw unplannedErr

      const { data: around, error: aroundErr } = await supabase
        .from('orders').select('delivery_date').is('deleted_at', null)
        .gte('delivery_date', addCalendarDays(date, -3))
        .lte('delivery_date', addCalendarDays(date, 10))
        .neq('delivery_method', 'pickup').neq('status', 'cancelled')
      if (aroundErr) throw aroundErr

      const counts = {}
      for (const row of around || []) counts[row.delivery_date] = (counts[row.delivery_date] || 0) + 1
      setWeekCounts(counts)

      const attemptOrderIds = [...new Set([...(data || []), ...(late || []), ...(unplanned || [])].map((order) => order.id))]
      let latestAttemptByOrder = {}
      if (attemptOrderIds.length) {
        const { data: attempts, error: attemptErr } = await supabase
          .from('delivery_attempts')
          .select('id, order_id, reason, resolution, attempted_at, actor_name, rescheduled_delivery_date')
          .in('order_id', attemptOrderIds)
          .order('attempted_at', { ascending: false }).order('id', { ascending: false })
        if (attemptErr) console.error('Delivery attempt history unavailable:', attemptErr)
        else for (const attempt of attempts || []) {
          if (!latestAttemptByOrder[attempt.order_id]) latestAttemptByOrder[attempt.order_id] = attempt
        }
      }

      setDeliveries((data || []).map((order) => ({ ...order, last_delivery_attempt: latestAttemptByOrder[order.id] || null })))
      setOverdue((late || []).map((order) => ({ ...order, last_delivery_attempt: latestAttemptByOrder[order.id] || null })))
      setNeedsPlan((unplanned || []).map((order) => ({ ...order, last_delivery_attempt: latestAttemptByOrder[order.id] || null })))
    } catch (err) {
      console.error('Deliveries fetch failed:', err)
      setError('Could not load deliveries.')
      if (!silent) {
        setDeliveries([])
        setOverdue([])
        setNeedsPlan([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [date])

  useEffect(() => { void fetchDay() }, [fetchDay])

  useEffect(() => {
    let active = true
    let refreshTimer
    const refreshQuietly = () => {
      if (!active) return
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => { if (active) void fetchDay({ silent: true }) }, 250)
    }
    const channel = supabase.channel(`deliveries-activity-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, refreshQuietly)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refreshQuietly() })
    window.addEventListener('online', refreshQuietly)
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshQuietly() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      clearTimeout(refreshTimer)
      window.removeEventListener('online', refreshQuietly)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [fetchDay])

  const step = useCallback((days) => setDate((prev) => addCalendarDays(prev, days)), [])
  const goToday = useCallback(() => setDate(localDate()), [])
  const run = useMemo(() => {
    const timed = []
    const anytime = []
    for (const order of deliveries) {
      if (order.delivery_time && order.delivery_time !== '00:00:00') timed.push(order)
      else anytime.push(order)
    }
    return { timed, anytime }
  }, [deliveries])
  const stats = useMemo(() => {
    const done = deliveries.filter((order) => order.status === 'done').length
    return {
      total: deliveries.length,
      done,
      remaining: deliveries.length - done,
      value: deliveries.reduce((sum, order) => sum + (order.total_amount || 0), 0),
      toCollect: deliveries.reduce((sum, order) => sum + (order.amount_due || 0), 0),
    }
  }, [deliveries])

  const markDelivered = useCallback(async (orderId) => {
    await markOrderDelivered(orderId)
    await fetchDay()
  }, [fetchDay])

  const markHandedOff = useCallback(async (orderId) => {
    const result = await markOrderHandedOff(orderId)
    await fetchDay()
    return result
  }, [fetchDay])

  const reschedule = useCallback(async (orderId, newDate) => {
    await delayOrder(orderId, newDate, 'Rescheduled from the delivery run')
    await fetchDay()
  }, [fetchDay])

  const recordDeliveryFailure = useCallback(async (order, { reason, resolution, newDate, actor }) => {
    const cleanReason = String(reason || '').trim().slice(0, 200)
    if (!cleanReason) throw new Error('Choose a reason before saving.')
    if (resolution === 'reschedule' && !/^\d{4}-\d{2}-\d{2}$/.test(newDate || '')) throw new Error('Choose a new delivery date.')
    const resolvedDate = resolution === 'reschedule' ? newDate : null
    const requestKey = `${order.id}:${cleanReason}:${resolvedDate || 'returned-to-shop'}`
    const requestId = deliveryAttemptRequestIds.current.get(requestKey) || createOrderRequestId()
    deliveryAttemptRequestIds.current.set(requestKey, requestId)
    await recordDeliveryOutcomeWorkflow({ orderId: order.id, reason: cleanReason, actor: actor || null, newDate: resolvedDate, requestId })
    deliveryAttemptRequestIds.current.delete(requestKey)
    await fetchDay()
  }, [fetchDay])

  return {
    date, setDate, step, goToday, deliveries, run, overdue, needsPlan,
    weekCounts, stats, loading, error, markDelivered, markHandedOff,
    reschedule, recordDeliveryFailure, refresh: fetchDay,
  }
}
