import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDeliveries() {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDeliveries = useCallback(async () => {
    setLoading(true)

    // ✅ Only select columns that exist in your table
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        client_name,
        client_phone,
        delivery_date,
        delivery_method,
        status,
        total_amount,
        notes,
        created_at
      `)
      .order('delivery_date', { ascending: true })

    if (error) {
      console.error('Fetch deliveries error:', error)
      setDeliveries([])
    } else {
      const filtered = (data || []).filter(order => {
        if (!order.delivery_date) return false
        if (order.delivery_method === 'pickup') return false
        return true
      })

      console.log('Raw orders:', data?.length, 'Filtered deliveries:', filtered.length)
      setDeliveries(filtered)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDeliveries()
  }, [fetchDeliveries])

  return {
    deliveries,
    loading,
    refresh: fetchDeliveries,
  }
}