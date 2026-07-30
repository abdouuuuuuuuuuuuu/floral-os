import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CACHE_KEY = 'reports_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function useReports() {
  const [data, setData] = useState({
    dailyRevenue: [],
    weeklyRevenue: [],
    monthlyRevenue: [],
    topProducts: [],
    orderStatusBreakdown: [],
    sourceBreakdown: [],
    paymentBreakdown: [],
    deliveryBreakdown: [],
    totalStats: { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0, totalCustomers: 0 },
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const subscriptionRef = useRef(null)

  // ─── LOAD FROM CACHE ────────────────────────────────────────────
  const loadFromCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          setData(cachedData)
          setLastUpdated(new Date(timestamp))
          return true
        }
      }
    } catch (e) {
      console.warn('Failed to load cache:', e)
    }
    return false
  }, [])

  // ─── SAVE TO CACHE ──────────────────────────────────────────────
  const saveToCache = useCallback((newData) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: newData,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.warn('Failed to save cache:', e)
    }
  }, [])

  // ─── FETCH REPORTS ──────────────────────────────────────────────
  const fetchReports = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    
    try {
      const today = new Date().toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

      // ── Daily revenue (last 30 days) ──
      const { data: dailyData, error: dailyError } = await supabase
        .from('orders')
        .select('created_at, total_amount')
        .gte('created_at', `${thirtyDaysAgo}T00:00:00`)
        .order('created_at', { ascending: true })

      if (dailyError) throw dailyError

      const dailyMap = {}
      dailyData?.forEach((o) => {
        const date = o.created_at?.split('T')[0]
        if (date) dailyMap[date] = (dailyMap[date] || 0) + (o.total_amount || 0)
      })
      const dailyRevenue = Object.entries(dailyMap)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // ── Weekly revenue ──
      const weeklyMap = {}
      dailyRevenue.forEach((d) => {
        const date = new Date(d.date)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        const weekKey = weekStart.toISOString().split('T')[0]
        weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + (d.amount || 0)
      })
      const weeklyRevenue = Object.entries(weeklyMap)
        .map(([week, amount]) => ({ week, amount }))
        .sort((a, b) => a.week.localeCompare(b.week))

      // ── Monthly revenue (all time) ──
      const { data: monthlyData, error: monthlyError } = await supabase
        .from('orders')
        .select('created_at, total_amount')

      if (monthlyError) throw monthlyError

      const monthlyMap = {}
      monthlyData?.forEach((o) => {
        const month = o.created_at?.slice(0, 7)
        if (month) monthlyMap[month] = (monthlyMap[month] || 0) + (o.total_amount || 0)
      })
      const monthlyRevenue = Object.entries(monthlyMap)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month))

      // ── Top products ──
      // Fetch order_items and products separately, then join in JS
      // This avoids Supabase relationship syntax issues
      let topProducts = []
      try {
        // Fetch all order_items
        const { data: itemsData, error: itemsError } = await supabase
          .from('order_items')
          .select('product_id, quantity, total_price')
          .limit(1000)

        if (itemsError) throw itemsError

        // Fetch all products for name lookup
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('product_id, item_name')

        if (productsError) throw productsError

        // Build product name lookup map
        const productNameMap = {}
        productsData?.forEach(p => {
          productNameMap[p.product_id] = p.item_name
        })

        // Aggregate by product
        const productMap = {}
        itemsData?.forEach((item) => {
          const pid = item.product_id
          const name = productNameMap[pid] || `Product #${pid}`
          if (!productMap[name]) productMap[name] = { name, quantity: 0, revenue: 0, productId: pid }
          productMap[name].quantity += (item.quantity || 0)
          productMap[name].revenue += (item.total_price || 0)
        })
        topProducts = Object.values(productMap)
          .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))
          .slice(0, 20)
      } catch (e) {
        console.warn('Failed to fetch top products:', e)
        topProducts = []
      }

      // ── Order status breakdown ──
      const { data: statusData, error: statusError } = await supabase
        .from('orders')
        .select('status')

      if (statusError) throw statusError

      const statusMap = {}
      statusData?.forEach((o) => {
        const status = o.status || 'new'
        statusMap[status] = (statusMap[status] || 0) + 1
      })
      const orderStatusBreakdown = Object.entries(statusMap)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count)

      // ── Source breakdown ──
      const { data: sourceData, error: sourceError } = await supabase
        .from('orders')
        .select('client_source')

      if (sourceError) throw sourceError

      const sourceMap = {}
      sourceData?.forEach((o) => {
        const source = o.client_source || 'inhouse'
        sourceMap[source] = (sourceMap[source] || 0) + 1
      })
      const sourceBreakdown = Object.entries(sourceMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)

      // ── Payment breakdown ──
      const { data: paymentData, error: paymentError } = await supabase
        .from('orders')
        .select('payment_method, total_amount')

      if (paymentError) throw paymentError

      const paymentMap = {}
      paymentData?.forEach((o) => {
        const method = o.payment_method || 'cash'
        if (!paymentMap[method]) paymentMap[method] = { method, amount: 0, count: 0 }
        paymentMap[method].amount += (o.total_amount || 0)
        paymentMap[method].count += 1
      })
      const paymentBreakdown = Object.values(paymentMap)
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))

      // ── Delivery breakdown ──
      const { data: deliveryData, error: deliveryError } = await supabase
        .from('orders')
        .select('delivery_method')

      if (deliveryError) throw deliveryError

      const deliveryMap = {}
      deliveryData?.forEach((o) => {
        const method = o.delivery_method || 'pickup'
        deliveryMap[method] = (deliveryMap[method] || 0) + 1
      })
      const deliveryBreakdown = Object.entries(deliveryMap)
        .map(([method, count]) => ({ method, count }))
        .sort((a, b) => b.count - a.count)

      // ── Total stats ──
      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select('total_amount')

      if (ordersError) throw ordersError

      const totalRevenue = allOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0
      const totalOrders = allOrders?.length || 0
      
      let totalCustomers = 0
      try {
        const { count, error: customersError } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
        if (!customersError) totalCustomers = count || 0
      } catch (e) {
        console.warn('Failed to count customers:', e)
      }

      const newData = {
        dailyRevenue,
        weeklyRevenue,
        monthlyRevenue,
        topProducts,
        orderStatusBreakdown,
        sourceBreakdown,
        paymentBreakdown,
        deliveryBreakdown,
        totalStats: {
          totalRevenue,
          totalOrders,
          avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
          totalCustomers: totalCustomers || 0,
        },
      }

      setData(newData)
      setLastUpdated(new Date())
      saveToCache(newData)
      setError(null)
    } catch (err) {
      console.error('Reports fetch error:', err)
      setError(err.message || 'Failed to load reports data')
      // Try to load from cache as fallback
      if (!loadFromCache()) {
        setError('Failed to load data and no cached data available')
      }
    } finally {
      setLoading(false)
    }
  }, [loadFromCache, saveToCache])

  // ─── REAL-TIME SUBSCRIPTION ─────────────────────────────────────
  useEffect(() => {
    // Try cache first for instant load
    const hasCache = loadFromCache()
    if (!hasCache) {
      fetchReports(true)
    } else {
      // Still fetch in background to update
      fetchReports(false)
    }

    // Subscribe to orders changes
    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // Debounce: wait 2 seconds then refresh
          if (subscriptionRef.current) clearTimeout(subscriptionRef.current)
          subscriptionRef.current = setTimeout(() => {
            fetchReports(false)
          }, 2000)
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => {
          if (subscriptionRef.current) clearTimeout(subscriptionRef.current)
          subscriptionRef.current = setTimeout(() => {
            fetchReports(false)
          }, 2000)
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
      if (subscriptionRef.current) clearTimeout(subscriptionRef.current)
    }
  }, [fetchReports, loadFromCache])

  return { ...data, loading, error, lastUpdated, refresh: fetchReports }
}