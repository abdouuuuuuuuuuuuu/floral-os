import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('customer_id', { ascending: false })

    if (error) {
      console.error('Error fetching customers:', error)
    } else {
      setCustomers(data || [])
    }
    setLoading(false)
  }, [])

  const upsertCustomer = useCallback(async (customerData) => {
    // Check if customer exists by phone
    let query = supabase.from('customers').select('customer_id')
    if (customerData.phone) {
      query = query.eq('phone', customerData.phone)
    } else {
      query = query.eq('full_name', customerData.name)
    }
    const { data: existing } = await query.maybeSingle()

    if (existing?.customer_id) {
      // Update existing
      const { data, error } = await supabase
        .from('customers')
        .update({
          full_name: customerData.name,
          phone: customerData.phone,
          email: customerData.email,
          notes: customerData.notes,
          total_orders: customerData.total_orders,
          total_spent: customerData.total_spent,
          last_order_date: customerData.last_order_date,
        })
        .eq('customer_id', existing.customer_id)
        .select()
        .single()

      return { success: !error, data, error, id: existing.customer_id }
    } else {
      // Create new
      const { data, error } = await supabase
        .from('customers')
        .insert({
          full_name: customerData.name,
          phone: customerData.phone,
          email: customerData.email,
          notes: customerData.notes,
          total_orders: 1,
          total_spent: customerData.total_spent || 0,
          last_order_date: customerData.last_order_date,
        })
        .select()
        .single()

      return { success: !error, data, error, id: data?.customer_id }
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  return { customers, loading, refresh: fetchCustomers, upsertCustomer }
}