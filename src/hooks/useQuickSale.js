import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useQuickSale() {
  const [quickCart, setQuickCart] = useState([])
  const [loading, setLoading] = useState(false)
  const [priceAdjustment, setPriceAdjustment] = useState(0)

  const addToQuickCart = (product) => {
    setQuickCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        if (existing.quantity >= product.stock_level) return prev
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.price }
            : item
        )
      }
      return [...prev, { ...product, quantity: 1, totalPrice: product.price }]
    })
  }

  const updateQuantity = (productId, qty) => {
    if (qty <= 0) {
      setQuickCart(prev => prev.filter(item => item.id !== productId))
      return
    }
    setQuickCart(prev => prev.map(item =>
      item.id === productId
        ? { ...item, quantity: qty, totalPrice: qty * item.price }
        : item
    ))
  }

  const clearQuickCart = () => {
    setQuickCart([])
    setPriceAdjustment(0)
  }

  const quickSubtotal = quickCart.reduce((sum, item) => sum + item.totalPrice, 0)
  const quickTotal = quickSubtotal
  const adjustedTotal = Math.max(0, quickTotal + priceAdjustment)

  const completeQuickSale = useCallback(async (paymentMethod, clientSource, notes = '', customer = null) => {
    if (quickCart.length === 0) return { error: 'Cart is empty' }

    setLoading(true)

    const itemsSnapshot = quickCart.map(item => ({ ...item }))
    const snapshot = {
      items: itemsSnapshot,
      subtotal: quickSubtotal,
      total: adjustedTotal,
      priceAdjustment,
      customerName: customer?.full_name || 'Walk-in Customer',
      customerPhone: customer?.phone || null,
      customerId: customer?.customer_id || null,
    }

    try {
      const { data: lastOrder, error: lastOrderErr } = await supabase
        .from('orders')
        .select('order_number')
        .order('created_at', { ascending: false })
        .limit(1)

      if (lastOrderErr) throw lastOrderErr

      const lastNum = lastOrder?.[0]?.order_number ? parseInt(lastOrder[0].order_number) : 0
      const newOrderNumber = String(lastNum + 1).padStart(3, '0')

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: newOrderNumber,
          client_name: snapshot.customerName,
          client_phone: snapshot.customerPhone,
          customer_id: snapshot.customerId,
          delivery_date: null,
          delivery_method: 'pickup',
          payment_method: paymentMethod || 'cash',
          client_source: clientSource || 'inhouse',
          status: 'done',
          notes: notes || 'Quick sale',
          total_amount: snapshot.total,
          subtotal_amount: snapshot.subtotal,
          tax_amount: 0,
          amount_paid: 0,
          amount_due: snapshot.total,
          payment_status: 'unpaid',
          price_adjustment: snapshot.priceAdjustment,
        })
        .select()
        .single()

      if (orderError) throw orderError

      const orderItems = itemsSnapshot.map(item => ({
        order_id: orderData.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.totalPrice,
        product_name: item.name || item.item_name || null,
        product_image: item.image_url || null,
        color: item.color || null,
        flower_type: item.flower_type || null,
        category: item.category || null,
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) throw itemsError

      for (const item of itemsSnapshot) {
        const { data: product, error: fetchErr } = await supabase
          .from('products')
          .select('stock_level')
          .eq('product_id', item.id)
          .single()

        if (fetchErr || !product) {
          console.error(`Stock fetch failed for product ${item.id}:`, fetchErr)
          continue
        }

        const newStock = Math.max(0, product.stock_level - item.quantity)
        const { error: updateErr } = await supabase
          .from('products')
          .update({ stock_level: newStock })
          .eq('product_id', item.id)

        if (updateErr) {
          console.error(`Stock update failed for product ${item.id}:`, updateErr)
        }
      }

      clearQuickCart()

      return {
        success: true,
        orderNumber: newOrderNumber,
        orderId: orderData.id,
        ...snapshot,
      }
    } catch (err) {
      console.error('completeQuickSale error:', err)
      return { error: err.message || 'Failed to complete sale' }
    } finally {
      setLoading(false)
    }
  }, [quickCart, quickSubtotal, adjustedTotal, priceAdjustment])

  return {
    quickCart,
    addToQuickCart,
    updateQuantity,
    clearQuickCart,
    quickSubtotal,
    quickTotal,
    adjustedTotal,
    priceAdjustment,
    setPriceAdjustment,
    completeQuickSale,
    loading,
  }
}