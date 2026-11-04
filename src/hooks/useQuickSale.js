// src/hooks/useQuickSale.js
//
// The sale itself now goes through lib/orders.createOrder(), which
// calls the create_order RPC. This hook no longer duplicates order
// numbering, item insertion, or stock decrementing — that logic lived
// in two places and drifted apart.

import { useState, useCallback, useEffect } from 'react'
import { createOrder } from '../lib/orders'
import { useAuth } from '../context/AuthContext'
import { loyaltyDiscountForPoints, normalizeRedeemedPoints } from '../lib/loyalty'

// Restore a cart that survived a refresh, a crash, or an accidental
// Alt+F4 mid-sale. Previously the cart was pure useState and vanished.
function loadPersistedCart(key) {
  if (!key) return []
  try {
    const raw = sessionStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistCart(key, cart) {
  if (!key) return
  try {
    if (cart.length) sessionStorage.setItem(key, JSON.stringify(cart))
    else sessionStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

export function useQuickSale() {
  const { user } = useAuth()
  const storageKey = user?.id ? `blossom.quick-cart:${user.id}` : null
  const [quickCart, setQuickCartRaw] = useState([])
  const [loadedKey, setLoadedKey] = useState(null)
  const [loading, setLoading] = useState(false)
  const [priceAdjustment, setPriceAdjustment] = useState(0)

  useEffect(() => {
    setQuickCartRaw(loadPersistedCart(storageKey))
    setLoadedKey(storageKey)
  }, [storageKey])

  const setQuickCart = useCallback((updater) => {
    setQuickCartRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (loadedKey === storageKey) persistCart(storageKey, next)
      return next
    })
  }, [loadedKey, storageKey])

  const addToQuickCart = useCallback((product) => {
    setQuickCart((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        // No stock ceiling — a florist can sell what's physically on
        // the bench even when the count is stale.
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.price,
              }
            : item
        )
      }
      return [...prev, { ...product, quantity: 1, totalPrice: product.price }]
    })
  }, [setQuickCart])

  const updateQuantity = useCallback((productId, qty) => {
    if (qty <= 0) {
      setQuickCart((prev) => prev.filter((item) => item.id !== productId))
      return
    }
    setQuickCart((prev) =>
      prev.map((item) =>
        item.id === productId
          ? { ...item, quantity: qty, totalPrice: qty * item.price }
          : item
      )
    )
  }, [setQuickCart])

  const clearQuickCart = useCallback(() => {
    setQuickCart([])
    setPriceAdjustment(0)
  }, [setQuickCart])

  const quickSubtotal = quickCart.reduce((sum, item) => sum + item.totalPrice, 0)
  const quickTotal = quickSubtotal
  const adjustedTotal = Math.max(0, quickTotal + priceAdjustment)

  const completeQuickSale = useCallback(
    async (paymentMethod, clientSource, notes = '', customer = null, paymentData = null) => {
      if (quickCart.length === 0) return { error: 'Cart is empty' }

      setLoading(true)

      // Snapshot before the await. The cart is cleared on success and
      // the receipt still needs these values.
      const snapshot = {
        items: quickCart.map((item) => ({ ...item })),
        subtotal: quickSubtotal,
        total: adjustedTotal,
        priceAdjustment,
        customerName: customer?.full_name || 'Walk-in Customer',
        customerPhone: customer?.phone || null,
        customerId: customer?.customer_id || null,
      }
      const loyaltyPointsToRedeem = normalizeRedeemedPoints(paymentData?.loyaltyPointsToRedeem)
      const loyaltyDiscount = loyaltyDiscountForPoints(loyaltyPointsToRedeem)

      try {
        const result = await createOrder({
          clientName: snapshot.customerName,
          clientPhone: snapshot.customerPhone,
          customerId: snapshot.customerId,
          deliveryMethod: 'pickup',
          paymentMethod: paymentMethod || 'cash',
          clientSource: clientSource || 'inhouse',
          status: 'done',
          orderType: 'quick_sale',
          notes: notes || 'Quick sale',
          items: snapshot.items,
          subtotal: snapshot.subtotal,
          total: snapshot.total,
          priceAdjustment: snapshot.priceAdjustment,
          loyaltyPointsToRedeem,
          loyaltyCardCode: paymentData?.loyaltyCardCode ?? null,
          loyaltyOverrideReason: paymentData?.loyaltyOverrideReason ?? null,
          paymentStatus: paymentData?.paymentStatus || 'paid',
          amountPaid: paymentData?.amountPaid ?? snapshot.total,
          amountDue: paymentData?.amountDue ?? 0,
          paymentNotes: paymentData?.notes || '',
        })

        clearQuickCart()

        // Offline: the sale is safely queued and will finalize automatically
        // when the connection returns. No order number or receipt yet.
        if (result.queued) {
          return {
            success: true,
            queued: true,
            total: Math.max(0, snapshot.total - loyaltyDiscount),
            customerName: snapshot.customerName,
          }
        }

        const { order, warnings } = result

        return {
          success: true,
          orderNumber: order.order_number,
          orderId: order.id,
          paymentStatus: paymentData?.paymentStatus || 'paid',
          amountPaid: paymentData?.amountPaid ?? snapshot.total,
          amountDue: paymentData?.amountDue ?? 0,
          paymentNotes: paymentData?.notes || '',
          // Products that went negative — surface this so the florist
          // knows the count needs a recount, without blocking the sale.
          negativeStock: warnings.negative_stock,
          ...snapshot,
          customerId: order.customer_id ?? snapshot.customerId,
          customerName: order.client_name ?? snapshot.customerName,
          customerPhone: order.client_phone ?? snapshot.customerPhone,
          total: Math.max(0, snapshot.total - loyaltyDiscount),
          loyaltyPointsRedeemed: loyaltyPointsToRedeem,
        }
      } catch (err) {
        // The cart is deliberately NOT cleared. The whole sale rolled
        // back server-side, so the cashier can retry without re-scanning.
        return { error: err.message || 'Could not complete the sale' }
      } finally {
        setLoading(false)
      }
    },
    [quickCart, quickSubtotal, adjustedTotal, priceAdjustment, clearQuickCart]
  )

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
