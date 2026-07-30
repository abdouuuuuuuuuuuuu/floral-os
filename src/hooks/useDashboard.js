import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useDashboard() {
  const [stats, setStats] = useState({
    todaySales: 0,
    yesterdaySales: 0,
    salesChange: 0,
    avgOrderValue: 0,
    lastWeekAvg: 0,
    avgChange: 0,
    ordersToday: 0,
    ordersYesterday: 0,
    ordersChange: 0,
    dailyTarget: 56000,
    targetProgress: 0,
    targetRemaining: 0,
    hoursRemaining: 6,
  })
  
  const [pendingOrders, setPendingOrders] = useState([])
  const [todayDeliveries, setTodayDeliveries] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    const { data: settingsData } = await supabase
      .from('settings')
      .select('daily_target')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()

    const dailyTarget = settingsData?.daily_target || 56000

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)

    const { data: yesterdayOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .gte('created_at', `${yesterday}T00:00:00`)
      .lte('created_at', `${yesterday}T23:59:59`)

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const { data: lastWeekOrders } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .gte('created_at', `${weekAgo}T00:00:00`)
      .lt('created_at', `${today}T00:00:00`)

    const todaySales = todayOrders?.reduce((sum, o) => sum + o.total_amount, 0) || 0
    const yesterdaySales = yesterdayOrders?.reduce((sum, o) => sum + o.total_amount, 0) || 0
    
    const lastWeekSales = lastWeekOrders?.reduce((sum, o) => sum + o.total_amount, 0) || 0
    const lastWeekOrderCount = lastWeekOrders?.length || 1
    const lastWeekAvg = Math.round(lastWeekSales / lastWeekOrderCount)
    const avgChange = lastWeekAvg ? ((stats.avgOrderValue - lastWeekAvg) / lastWeekAvg * 100).toFixed(1) : 0

    const { data: allOrders, error: allError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    const pending = (allOrders || []).filter(o => 
      o.status === 'new' || o.status === 'processing'
    )

    const { data: deliveries, error: deliveryError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'done')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false })

    // FIX: Only select columns that exist in your table — no 'id'
    const { data: stock, error: stockError } = await supabase
      .from('products')
      .select('product_id, item_name, stock_level, low_stock_threshold')
      .lt('stock_level', 10)
      .order('stock_level', { ascending: true })

    console.log('Low stock query:', { stock, stockError, count: stock?.length })

    setStats({
      todaySales,
      yesterdaySales,
      salesChange: yesterdaySales ? ((todaySales - yesterdaySales) / yesterdaySales * 100).toFixed(1) : 0,
      avgOrderValue: todayOrders?.length ? Math.round(todaySales / todayOrders.length) : 0,
      lastWeekAvg,
      avgChange,
      ordersToday: todayOrders?.length || 0,
      ordersYesterday: yesterdayOrders?.length || 0,
      ordersChange: yesterdayOrders?.length ? ((todayOrders.length - yesterdayOrders.length) / yesterdayOrders.length * 100).toFixed(1) : 0,
      dailyTarget,
      targetProgress: Math.round((todaySales / dailyTarget) * 100),
      targetRemaining: Math.max(0, dailyTarget - todaySales),
      hoursRemaining: Math.max(0, 18 - new Date().getHours()),
    })

    setPendingOrders(pending)
    setTodayDeliveries(deliveries || [])
    setLowStock(stock || [])
    setLoading(false)
  }

  const updateStatus = async (orderId, newStatus) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
    
    if (error) {
      console.error('Update failed:', error)
      return false
    }
    return true
  }

  return { stats, pendingOrders, todayDeliveries, lowStock, loading, updateStatus, refresh: fetchDashboardData }
}