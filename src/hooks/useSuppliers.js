// src/hooks/useSuppliers.js
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

function readable(error, fallback) {
  const msg = error?.message || ''

  if (msg.includes('duplicate key')) return 'That supplier already exists.'
  if (msg.includes('violates foreign key')) return 'That product or supplier no longer exists.'
  if (msg.includes('Only an owner')) return msg
  if (msg.includes('already voided')) return 'That entry has already been voided.'
  if (msg.includes('no longer exists')) return 'That entry no longer exists. Refresh the page.'
  if (msg.includes('Only purchase entries')) return 'Only purchase entries can be edited.'
  if (msg.includes('check constraint')) return 'The values entered are not valid for this record.'
  if (msg.includes('function public.pay_supplier')) {
    return 'The payment function does not match the application. Check the RPC parameters.'
  }
  if (msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'You do not have permission to do that.'
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Cannot reach the server. Check your connection.'
  }

  return msg || fallback
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isMounted = useRef(false)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await supabase
      .from('suppliers')
      .select('*')
      .order('company_name')

    if (fetchError) {
      console.error('Error fetching suppliers:', fetchError)
      setError(readable(fetchError, 'Could not load suppliers.'))
    } else {
      setError(null)
      setSuppliers((data || []).filter((supplier) => supplier.supplier_status !== 'inactive'))
    }

    setLoading(false)
  }, [])

  const fetchBalances = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('supplier_balances')
      .select('*')

    if (fetchError) {
      console.error('Error fetching supplier balances:', fetchError)
      setBalances([])
      setError(readable(fetchError, 'Could not load supplier balances.'))
    } else {
      setBalances(data || [])
    }
  }, [])

  // This state is kept for existing callers. The supplier page separately
  // fetches supplier payments and filters its purchase query to purchase rows.
  const fetchTransactions = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('supplier_transactions')
      .select('*, suppliers(company_name), products(item_name)')
      .eq('transaction_type', 'purchase')
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Error fetching supplier transactions:', fetchError)
      setTransactions([])
      setError(readable(fetchError, 'Could not load supplier transactions.'))
    } else {
      setTransactions(data || [])
    }
  }, [])

  useEffect(() => {
    if (isMounted.current) return

    isMounted.current = true
    fetchSuppliers()
    fetchTransactions()
    fetchBalances()
  }, [fetchSuppliers, fetchTransactions, fetchBalances])

  // Suppliers
  const addSupplier = useCallback(async (supplier) => {
    if (!supplier.company_name?.trim()) {
      throw new Error('Enter a company name.')
    }

    const { data, error: insertError } = await supabase
      .from('suppliers')
      .insert({
        company_name: supplier.company_name.trim(),
        contact_person: supplier.contact_person || null,
        phone: supplier.phone || null,
        email: supplier.email || null,
        supplier_status: supplier.supplier_status || 'active',
        address: supplier.address || null,
        notes: supplier.notes || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error adding supplier:', insertError)
      throw new Error(readable(insertError, 'Could not add the supplier.'))
    }

    await fetchSuppliers()
    return data
  }, [fetchSuppliers])

  const updateSupplier = useCallback(async (supplierId, updates) => {
    const { error: updateError } = await supabase
      .from('suppliers')
      .update({
        company_name: updates.company_name,
        contact_person: updates.contact_person,
        phone: updates.phone,
        email: updates.email,
        supplier_status: updates.supplier_status,
        address: updates.address,
        notes: updates.notes,
      })
      .eq('supplier_id', supplierId)

    if (updateError) {
      console.error('Error updating supplier:', updateError)
      throw new Error(readable(updateError, 'Could not update the supplier.'))
    }

    await fetchSuppliers()
    return true
  }, [fetchSuppliers])

  // Soft delete. Purchase history remains intact.
  const deleteSupplier = useCallback(async (supplierId) => {
    const { error: deleteError } = await supabase
      .from('suppliers')
      .update({ supplier_status: 'inactive' })
      .eq('supplier_id', supplierId)

    if (deleteError) {
      console.error('Error deactivating supplier:', deleteError)
      throw new Error(readable(deleteError, 'Could not remove the supplier.'))
    }

    await fetchSuppliers()
    return true
  }, [fetchSuppliers])

  // Receiving stock
  // This call intentionally sends only the parameters already supported by
  // the existing receive_supplier_stock RPC. Do not add new named arguments
  // until that PostgreSQL function has been updated.
  const receiveStockBatch = useCallback(async (
    supplierId,
    items,
    batchNotes = '',
    receivedAt = null,
    paidNow = 0,
    paymentMethod = 'cash',
    paymentNotes = ''
  ) => {
    if (!items?.length) {
      throw new Error('Add at least one product to receive.')
    }

    for (const item of items) {
      if (!item.productId) {
        throw new Error('Every line needs a product.')
      }
      if (!(Number(item.quantity) > 0)) {
        throw new Error('Quantity must be greater than zero.')
      }
      if (!(Number(item.unitCost) >= 0)) {
        throw new Error('Unit cost cannot be negative.')
      }
    }

    // Checked here so the calculator cannot submit an impossible amount. The
    // paid-now amount is recorded below as a separate pay_supplier call;
    // receivedAt is still not sent (receive_supplier_stock has no such argument).
    const grandTotal = items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
      0
    )
    const numericPaidNow = Number(paidNow) || 0

    if (numericPaidNow < 0 || numericPaidNow > grandTotal) {
      throw new Error('Paid now must be between zero and the delivery total.')
    }

    const { data, error: rpcError } = await supabase.rpc('receive_supplier_stock', {
      p_supplier_id: supplierId,
      p_items: items.map((item) => ({
        product_id: Number(item.productId),
        quantity: Number(item.quantity),
        unit_cost: Math.round(Number(item.unitCost)),
        notes: item.notes || batchNotes || '',
      })),
    })

    if (rpcError) {
      console.error('Receive stock error:', rpcError)
      throw new Error(readable(rpcError, 'Could not record the delivery.'))
    }

    // "Paid now" used to be validated and then dropped, so the supplier's
    // balance never showed the money handed over at delivery. Record it as a
    // normal supplier payment through the existing pay_supplier RPC.
    if (numericPaidNow > 0) {
      const { error: payError } = await supabase.rpc('pay_supplier', {
        p_supplier_id: Number(supplierId),
        p_amount: numericPaidNow,
        p_notes: paymentNotes || 'Paid on delivery',
        p_method: paymentMethod || 'cash',
        p_transaction_id: null,
      })
      if (payError) {
        console.error('Pay on delivery error:', payError)
        await Promise.all([fetchTransactions(), fetchSuppliers(), fetchBalances()])
        throw new Error(`The stock delivery was saved, but the ${numericPaidNow.toLocaleString('fr-FR')} DA payment was not: ${readable(payError, 'record it with "Pay supplier".')}`)
      }
    }

    await Promise.all([fetchTransactions(), fetchSuppliers(), fetchBalances()])
    return data
  }, [fetchTransactions, fetchSuppliers, fetchBalances])

  const receiveStock = useCallback(async (
    supplierId,
    productId,
    quantity,
    unitCost,
    notes = ''
  ) => {
    const result = await receiveStockBatch(
      supplierId,
      [{ productId, quantity, unitCost, notes }],
      notes
    )

    return result?.[0] ?? result
  }, [receiveStockBatch])

  // Editing entries
  const updateEntry = useCallback(async (transactionId, changes = {}) => {
    if (changes.quantity != null && Number(changes.quantity) <= 0) {
      throw new Error('Quantity must be greater than zero. Void the entry instead.')
    }

    if (changes.unitCost != null && Number(changes.unitCost) < 0) {
      throw new Error('Unit cost cannot be negative.')
    }

    const { data, error: rpcError } = await supabase.rpc('update_supplier_entry', {
      p_transaction_id: transactionId,
      p_quantity: changes.quantity ?? null,
      p_unit_cost: changes.unitCost != null
        ? Math.round(Number(changes.unitCost))
        : null,
      p_notes: changes.notes ?? null,
      p_transaction_date: changes.date || null,
    })

    if (rpcError) {
      console.error('Update entry failed:', rpcError)
      throw new Error(readable(rpcError, 'Could not update the entry.'))
    }

    await Promise.all([fetchTransactions(), fetchBalances(), fetchSuppliers()])
    return data
  }, [fetchTransactions, fetchBalances, fetchSuppliers])

  const voidEntry = useCallback(async (transactionId, reason = '') => {
    const { data, error: rpcError } = await supabase.rpc('void_supplier_entry', {
      p_transaction_id: transactionId,
      p_reason: reason,
    })

    if (rpcError) {
      console.error('Void entry failed:', rpcError)
      throw new Error(readable(rpcError, 'Could not void the entry.'))
    }

    await Promise.all([fetchTransactions(), fetchBalances(), fetchSuppliers()])
    return data
  }, [fetchTransactions, fetchBalances, fetchSuppliers])

  // Payments
  // Confirmed database signature:
  // p_supplier_id integer,
  // p_amount numeric,
  // p_notes text,
  // p_method text default 'cash',
  // p_transaction_id integer default null
  //
  // Do not send p_paid_at here. It does not exist in the current RPC.
  const paySupplier = useCallback(async (
    supplierId,
    amount,
    notes = '',
    method = 'cash'
  ) => {
    const numericAmount = Number(amount)

    if (!(numericAmount > 0)) {
      throw new Error('Enter an amount greater than zero.')
    }

    const { data, error: rpcError } = await supabase.rpc('pay_supplier', {
      p_supplier_id: Number(supplierId),
      p_amount: numericAmount,
      p_notes: notes || '',
      p_method: method || 'cash',
      p_transaction_id: null,
    })

    if (rpcError) {
      console.error('Pay supplier error:', rpcError)
      throw new Error(readable(rpcError, 'Could not record the payment.'))
    }

    await Promise.all([fetchTransactions(), fetchBalances()])
    return data
  }, [fetchTransactions, fetchBalances])

  const recordPartialPayment = useCallback(async (
    transactionId,
    amount,
    method = 'cash'
  ) => {
    const numericAmount = Number(amount)

    if (!(numericAmount > 0)) {
      throw new Error('Enter an amount greater than zero.')
    }

    const { data, error: rpcError } = await supabase.rpc('pay_supplier', {
      p_supplier_id: null,
      p_amount: numericAmount,
      p_notes: '',
      p_method: method || 'cash',
      p_transaction_id: Number(transactionId),
    })

    if (rpcError) {
      console.error('Record payment error:', rpcError)
      throw new Error(readable(rpcError, 'Could not record the payment.'))
    }

    await Promise.all([fetchTransactions(), fetchBalances()])
    return data
  }, [fetchTransactions, fetchBalances])

  // Derived supplier totals come from supplier_balances only.
  // Do not sum supplier_transactions.amount_paid here; that would double count
  // payments already stored in supplier_payments.
  const getSupplierSummary = useCallback((supplierId) => {
    const balance = balances.find((item) => item.supplier_id === supplierId)

    if (!balance) {
      return {
        totalOwed: 0,
        totalPaid: 0,
        totalDue: 0,
        credit: 0,
        transactionCount: 0,
        lastTransaction: null,
      }
    }

    return {
      totalOwed: Number(balance.total_purchased) || 0,
      totalPaid: Number(balance.total_paid) || 0,
      totalDue: Number(balance.total_due) || 0,
      credit: Number(balance.credit) || 0,
      transactionCount: Number(balance.purchase_count) || 0,
      lastTransaction: balance.last_purchase,
    }
  }, [balances])

  const refresh = useCallback(() => {
    fetchSuppliers()
    fetchTransactions()
    fetchBalances()
  }, [fetchSuppliers, fetchTransactions, fetchBalances])

  return {
    suppliers,
    transactions,
    balances,
    loading,
    error,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    receiveStock,
    receiveStockBatch,
    updateEntry,
    voidEntry,
    paySupplier,
    recordPartialPayment,
    getSupplierSummary,
    refresh,
  }
}
