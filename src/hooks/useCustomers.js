import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const pageSize = 500
    let offset = 0
    const data = []
    let error = null
    while (true) {
      const page = await supabase
        .from('customers')
        .select('*')
        // Was customer_id DESC — creation order, which is almost never the
        // question. A florist looks someone up to check what they bought
        // last time or whether they owe money. last_order_date makes the
        // list "who's been in recently"; nulls last so customers who have
        // never ordered don't head the list.
        .order('last_order_date', { ascending: false, nullsFirst: false })
        .order('customer_id', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (page.error) { error = page.error; break }
      const rows = page.data || []
      data.push(...rows)
      if (rows.length < pageSize) break
      offset += pageSize
    }

    if (error) {
      console.error('Error fetching customers:', error)
    } else {
      setCustomers(data || [])
    }
    setLoading(false)
  }, [])

  // ── New: create from form (primary fields only) ──
  const createCustomer = useCallback(async (customerData) => {
    const { data, error } = await supabase.rpc('blossom_resolve_customer', {
      p_full_name: customerData.full_name?.trim(),
      p_phone: customerData.phone?.trim(),
      p_email: customerData.email?.trim() || null,
      p_billing_address: customerData.billing_address?.trim() || null,
      p_notes: customerData.notes?.trim() || null,
      p_preferred_delivery_method: customerData.preferred_delivery_method || 'pickup',
      p_preferred_payment_method: customerData.preferred_payment_method || 'cash',
      p_customer_source: customerData.customer_source || 'inhouse',
    })

    return { success: !error, data, error, id: data?.customer_id }
  }, [])

  // ── New: update existing ──
  const updateCustomer = useCallback(async (customerId, updates) => {
    const { data, error } = await supabase
      .from('customers')
      .update({
        full_name: updates.full_name?.trim(),
        phone: updates.phone?.trim() || null,
        email: updates.email?.trim() || null,
        billing_address: updates.billing_address?.trim() || null,
        notes: updates.notes?.trim() || null,
        preferred_delivery_method: updates.preferred_delivery_method,
        preferred_payment_method: updates.preferred_payment_method,
        customer_source: updates.customer_source,
      })
      .eq('customer_id', customerId)
      .select()
      .single()

    return { success: !error, data, error }
  }, [])

  // ── Legacy: used by Checkout/Cart (backward compatible) ──
  const upsertCustomer = useCallback(async (customerData) => {
    const name = customerData.full_name || customerData.name
    const phone = customerData.phone
    const { data, error } = await supabase.rpc('blossom_resolve_customer', {
      p_full_name: name?.trim(),
      p_phone: phone?.trim(),
      p_email: customerData.email?.trim() || null,
      p_notes: customerData.notes?.trim() || null,
    })
    if (!error && !data) return { success: false, data: null, error: new Error('A valid phone number is required to create a customer profile.') }
    return { success: !error, data, error, id: data?.customer_id }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  return {
    customers,
    loading,
    refresh: fetchCustomers,
    createCustomer,
    updateCustomer,
    upsertCustomer,
  }
}
