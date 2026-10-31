// src/hooks/useReports.js
//
// REWRITTEN. The old version ran SEVEN separate full scans of `orders`
// per load — daily, monthly, status, source, payment, delivery, totals —
// each pulling every row with no bound, then aggregated in JavaScript.
// The realtime subscription re-ran all seven on any order change.
//
// Now: seven indexed aggregates from Postgres views (migration 012),
// fetched in parallel. The return shape is UNCHANGED so Reports.jsx
// needs no edits, plus one addition: cashierPerformance.
//
// Also fixed:
//   * cancelled orders no longer count as revenue
//   * top products is a real ranked aggregate, not an arbitrary 1000 rows
//   * dates are Africa/Algiers, not UTC
//   * the cache is scoped per user and cleared on sign-out

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CACHE_DURATION = 5 * 60 * 1000

const EMPTY = {
  dailyRevenue: [],
  weeklyRevenue: [],
  monthlyRevenue: [],
  topProducts: [],
  orderStatusBreakdown: [],
  sourceBreakdown: [],
  paymentBreakdown: [],
  deliveryBreakdown: [],
  cashierPerformance: [],
  totalStats: {
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    totalCustomers: 0,
    totalOutstanding: 0,
  },
}

export function useReports() {
  const { user } = useAuth()
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const debounceRef = useRef(null)

  // Scoped per user. The old cache key was global, so on a shared till
  // one person could see another's cached figures — and it survived
  // sign-out.
  const cacheKey = user?.id ? `reports_cache:${user.id}` : null

  const loadFromCache = useCallback(() => {
    if (!cacheKey) return false
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (!cached) return false
      const { data: cachedData, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_DURATION) {
        setData({ ...EMPTY, ...cachedData })
        setLastUpdated(new Date(timestamp))
        return true
      }
    } catch {
      /* corrupt cache — ignore it */
    }
    return false
  }, [cacheKey])

  const saveToCache = useCallback(
    (newData) => {
      if (!cacheKey) return
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: newData, timestamp: Date.now() }))
      } catch {
        /* quota or private mode — not worth surfacing */
      }
    },
    [cacheKey]
  )

  const fetchReports = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true)
      setError(null)

      try {
        const [daily, weekly, monthly, products, breakdowns, totals, cashiers] =
          await Promise.all([
            supabase.from('report_daily_revenue').select('*').order('date', { ascending: true }),
            supabase.from('report_weekly_revenue').select('*').order('week', { ascending: true }),
            supabase.from('report_monthly_revenue').select('*').order('month', { ascending: true }),
            supabase.from('report_top_products').select('*').order('quantity', { ascending: false }).limit(50),
            supabase.from('report_breakdowns').select('*'),
            supabase.from('report_totals').select('*').maybeSingle(),
            supabase.from('report_cashier_performance').select('*').order('revenue', { ascending: false }),
          ])

        const firstError = [daily, weekly, monthly, products, breakdowns, totals, cashiers]
          .find((r) => r.error)?.error

        if (firstError) throw firstError

        // The breakdowns view returns one table with a `dimension`
        // column, so this is one round trip instead of four.
        const rows = breakdowns.data || []
        const pick = (dimension) => rows.filter((r) => r.dimension === dimension)

        const t = totals.data || {}

        const newData = {
          dailyRevenue: (daily.data || []).map((r) => ({
            date: r.date,
            amount: Number(r.amount) || 0,
            orders: r.orders,
          })),
          weeklyRevenue: (weekly.data || []).map((r) => ({
            week: r.week,
            amount: Number(r.amount) || 0,
            orders: r.orders,
          })),
          monthlyRevenue: (monthly.data || []).map((r) => ({
            month: r.month,
            amount: Number(r.amount) || 0,
            orders: r.orders,
          })),
          topProducts: (products.data || []).map((r) => ({
            name: r.name,
            productId: r.productId,
            quantity: Number(r.quantity) || 0,
            revenue: Number(r.revenue) || 0,
            orderCount: r.order_count,
          })),
          orderStatusBreakdown: pick('status')
            .map((r) => ({ status: r.label, count: r.count }))
            .sort((a, b) => b.count - a.count),
          sourceBreakdown: pick('source')
            .map((r) => ({ source: r.label, count: r.count }))
            .sort((a, b) => b.count - a.count),
          paymentBreakdown: pick('payment')
            .map((r) => ({ method: r.label, count: r.count, amount: Number(r.amount) || 0 }))
            .sort((a, b) => b.amount - a.amount),
          deliveryBreakdown: pick('delivery')
            .map((r) => ({ method: r.label, count: r.count }))
            .sort((a, b) => b.count - a.count),
          cashierPerformance: (cashiers.data || []).map((r) => ({
            cashierId: r.cashier_id,
            name: r.name,
            username: r.username,
            role: r.role,
            orders: r.orders,
            revenue: Number(r.revenue) || 0,
            avgOrder: Number(r.avg_order) || 0,
            lastSale: r.last_sale,
          })),
          totalStats: {
            totalRevenue: Number(t.total_revenue) || 0,
            totalOrders: t.total_orders || 0,
            avgOrderValue: Number(t.avg_order_value) || 0,
            totalOutstanding: Number(t.total_outstanding) || 0,
            totalCustomers: t.total_customers || 0,
          },
        }

        setData(newData)
        setLastUpdated(new Date())
        saveToCache(newData)
        setError(null)
      } catch (err) {
        console.error('Reports fetch error:', err)

        const missingView =
          err.code === '42P01' || err.message?.includes('does not exist')

        setError(
          missingView
            ? 'Report views are missing. Run migration 012_report_views.sql.'
            : err.message || 'Could not load reports.'
        )

        if (!loadFromCache()) {
          // Leave the empty shape in place rather than stale figures.
          setData(EMPTY)
        }
      } finally {
        setLoading(false)
      }
    },
    [loadFromCache, saveToCache]
  )

  useEffect(() => {
    const hasCache = loadFromCache()
    fetchReports(!hasCache)

    // Refresh on order changes, debounced. Cheap now — seven aggregates
    // instead of seven table scans.
    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchReports(false), 3000)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchReports(false), 3000)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchReports, loadFromCache])

  return { ...data, loading, error, lastUpdated, refresh: fetchReports }
}