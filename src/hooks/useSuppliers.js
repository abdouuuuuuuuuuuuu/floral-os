import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const isMounted = useRef(false)

  useEffect(() => {
    if (isMounted.current) return
    isMounted.current = true
    fetchSuppliers()
    fetchTransactions()
  }, [])

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('company_name')

    if (error) {
      console.error('Error fetching suppliers:', error)
    } else {
      setSuppliers((data || []).filter(s => s.supplier_status !== 'inactive'))
    }
    setLoading(false)
  }, [])

  const fetchTransactions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_transactions')
        .select('*, suppliers(company_name), products(item_name)')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching transactions:', error)
        setTransactions([])
      } else {
        setTransactions(data || [])
      }
    } catch (e) {
      console.error('Transactions fetch error:', e)
      setTransactions([])
    }
  }, [])

  const addSupplier = useCallback(async (supplier) => {
    console.log('Adding supplier:', supplier)

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        company_name: supplier.company_name,
        contact_person: supplier.contact_person,
        phone: supplier.phone,
        email: supplier.email,
        supplier_status: supplier.supplier_status || 'active',
        address: supplier.address,
        notes: supplier.notes,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding supplier:', error)
      alert('Error adding supplier: ' + error.message)
      return false
    }

    console.log('Supplier added:', data)
    await fetchSuppliers()
    return data
  }, [fetchSuppliers])

  const updateSupplier = useCallback(async (supplierId, updates) => {
    const { error } = await supabase
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

    if (error) {
      console.error('Error updating supplier:', error)
      alert('Error updating: ' + error.message)
      return false
    }
    await fetchSuppliers()
    return true
  }, [fetchSuppliers])

  const deleteSupplier = useCallback(async (supplierId) => {
    const { error } = await supabase
      .from('suppliers')
      .update({ supplier_status: 'inactive' })
      .eq('supplier_id', supplierId)

    if (error) {
      console.error('Error deleting supplier:', error)
      alert('Error deleting: ' + error.message)
      return false
    }
    await fetchSuppliers()
    return true
  }, [fetchSuppliers])

  // ─── RECEIVE STOCK ─────────────────────────────────────────────
  const receiveStock = useCallback(async (supplierId, productId, quantity, unitCost, notes = '') => {
    const totalCost = quantity * unitCost
    console.log('Receiving stock:', { supplierId, productId, quantity, unitCost, totalCost })

    try {
      // 1. Create transaction
      const { data: tx, error: txError } = await supabase
        .from('supplier_transactions')
        .insert({
          supplier_id: supplierId,
          product_id: productId,
          quantity,
          unit_cost: unitCost,
          total_cost: totalCost,
          amount_paid: 0,
          payment_status: 'unpaid',
          transaction_type: 'purchase',
          notes,
        })
        .select()
        .single()

      if (txError) {
        console.error('Transaction error:', txError)
        alert('Transaction error: ' + txError.message)
        return false
      }

      console.log('Transaction created:', tx)

      // 2. Get current stock
      const { data: product, error: prodError } = await supabase
        .from('products')
        .select('stock_level')
        .eq('product_id', productId)
        .single()

      if (prodError) {
        console.error('Product fetch error:', prodError)
        alert('Product error: ' + prodError.message)
        return false
      }

      const newStock = (product?.stock_level || 0) + quantity
      console.log('Updating stock from', product?.stock_level, 'to', newStock)

      // 3. Update stock
      const { error: stockError } = await supabase
        .from('products')
        .update({ stock_level: newStock })
        .eq('product_id', productId)

      if (stockError) {
        console.error('Stock update error:', stockError)
        alert('Stock update error: ' + stockError.message)
        return false
      }

      console.log('Stock updated successfully')
      await fetchTransactions()
      return tx

    } catch (e) {
      console.error('Receive stock error:', e)
      alert('Error: ' + e.message)
      return false
    }
  }, [fetchTransactions])

  // ─── PAY SUPPLIER ──────────────────────────────────────────────
  const paySupplier = useCallback(async (supplierId, amount, notes = '') => {
    console.log('Paying supplier:', { supplierId, amount, notes })

    try {
      // 1. Create payment transaction
      const { data: paymentTx, error: payError } = await supabase
        .from('supplier_transactions')
        .insert({
          supplier_id: supplierId,
          product_id: null,
          quantity: 0,
          unit_cost: 0,
          total_cost: 0,
          amount_paid: amount,
          payment_status: 'paid',
          transaction_type: 'payment',
          notes,
        })
        .select()
        .single()

      if (payError) {
        console.error('Payment error:', payError)
        alert('Payment error: ' + payError.message)
        return false
      }

      console.log('Payment recorded:', paymentTx)
      await fetchTransactions()
      return paymentTx

    } catch (e) {
      console.error('Pay supplier error:', e)
      alert('Error: ' + e.message)
      return false
    }
  }, [fetchTransactions])

  // ─── UPDATE PAYMENT STATUS ON PURCHASE ───────────────────────
  const recordPartialPayment = useCallback(async (transactionId, amount) => {
    try {
      const { data: tx, error: fetchError } = await supabase
        .from('supplier_transactions')
        .select('amount_paid, total_cost')
        .eq('transaction_id', transactionId)
        .single()

      if (fetchError) {
        console.error('Fetch error:', fetchError)
        return false
      }

      const newAmountPaid = (tx.amount_paid || 0) + amount
      const status = newAmountPaid >= tx.total_cost ? 'paid' : 'partial'

      const { error: updateError } = await supabase
        .from('supplier_transactions')
        .update({
          amount_paid: newAmountPaid,
          payment_status: status,
        })
        .eq('transaction_id', transactionId)

      if (updateError) {
        console.error('Update error:', updateError)
        alert('Error recording payment: ' + updateError.message)
        return false
      }

      await fetchTransactions()
      return true
    } catch (e) {
      console.error('Record payment error:', e)
      alert('Error: ' + e.message)
      return false
    }
  }, [fetchTransactions])

  const getSupplierSummary = useCallback((supplierId) => {
    const txs = transactions.filter(t => t.supplier_id === supplierId)
    const totalOwed = txs
      .filter(t => t.transaction_type === 'purchase')
      .reduce((s, t) => s + (t.total_cost || 0), 0)
    const totalPaid = txs.reduce((s, t) => s + (t.amount_paid || 0), 0)
    const totalDue = totalOwed - totalPaid
    const transactionCount = txs.length
    const lastTransaction = txs[0]?.transaction_date

    return { totalOwed, totalPaid, totalDue, transactionCount, lastTransaction }
  }, [transactions])

  const refresh = useCallback(() => {
    fetchSuppliers()
    fetchTransactions()
  }, [fetchSuppliers, fetchTransactions])

  return {
    suppliers,
    transactions,
    loading,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    receiveStock,
    paySupplier,
    recordPartialPayment,
    getSupplierSummary,
    refresh,
  }
}