// src/hooks/useCart.js
//
// Brought into line with useQuickSale on two things that were
// genuinely inconsistent:
//
// 1. THE STOCK RULE. This hook refused to add past stock_level —
//    "Only 3 available" — while Quick Sale deliberately allowed it,
//    with the comment "REMOVED stock ceiling". Same shop, same
//    products, opposite behaviour depending on which screen you're on.
//
//    Quick Sale's rule is the correct one for a florist: the count is
//    frequently stale, and refusing to sell a bouquet that's physically
//    on the bench because a number says 0 is worse than an inaccurate
//    number. The sale is allowed and the negative stock is reported.
//
// 2. PERSISTENCE. This was pure useState — refresh, crash, or an
//    accidental Alt+F4 mid-order and the whole cart was gone. On a shop
//    till that's a customer standing there while you rebuild it.

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

function loadPersisted(key) {
  if (!key) return []
  try {
    const raw = sessionStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useCart() {
  const { user } = useAuth()
  const storageKey = user?.id ? `blossom.cart:${user.id}` : null
  const [items, setItemsRaw] = useState([])
  const [loadedKey, setLoadedKey] = useState(null)

  useEffect(() => {
    setItemsRaw(loadPersisted(storageKey))
    setLoadedKey(storageKey)
  }, [storageKey])

  // sessionStorage, not localStorage: a cart should survive a refresh
  // or a crash, but NOT survive closing the app. Yesterday's abandoned
  // cart reappearing tomorrow morning is worse than no cart.
  useEffect(() => {
    if (loadedKey !== storageKey) return
    try {
      if (!storageKey || !items.length) {
        if (storageKey) sessionStorage.removeItem(storageKey)
      } else sessionStorage.setItem(storageKey, JSON.stringify(items))
    } catch {
      /* private mode or quota — the cart still works, it just won't survive */
    }
  }, [items, loadedKey, storageKey])

  const setItems = useCallback((updater) => setItemsRaw(updater), [])

  const addItem = useCallback((product) => {
    // useProducts maps stock_level -> stock_quantity before products
    // reach the cart, so check both — Quick Sale passes the raw field.
    const stock = product.stock_quantity ?? product.stock_level ?? 0

    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id)

      if (existing) {
        const newQuantity = existing.quantity + 1
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: newQuantity, totalPrice: newQuantity * item.price }
            : item
        )
      }

      return [...prev, { ...product, quantity: 1, totalPrice: product.price }]
    })

    // The sale goes through either way, but say so when the count is
    // about to go negative — that's a recount the florist needs to do,
    // not a reason to block the customer.
    const existingQty = items.find((i) => i.id === product.id)?.quantity ?? 0
    if (existingQty + 1 > stock) {
      return {
        success: true,
        warning: stock <= 0
          ? `${product.name || 'This item'} shows 0 in stock — recount needed`
          : `Only ${stock} in stock — the count will go negative`,
      }
    }

    return { success: true }
  }, [items, setItems])

  const removeItem = useCallback((productId) => {
    setItems((prev) => prev.filter((item) => item.id !== productId))
  }, [setItems])

  const updateQuantity = useCallback(
    (productId, quantity) => {
      if (quantity <= 0) {
        removeItem(productId)
        return
      }

      // No maxStock clamp. It silently rewrote what the florist typed —
      // asking for 12 and getting 3 with no explanation.
      setItems((prev) =>
        prev.map((item) =>
          item.id === productId
            ? { ...item, quantity, totalPrice: quantity * item.price }
            : item
        )
      )
    },
    [removeItem, setItems]
  )

  const clearCart = useCallback(() => {
    setItems([])
    try { if (storageKey) sessionStorage.removeItem(storageKey) } catch { /* noop */ }
  }, [setItems, storageKey])

  const subtotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0)

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    total: subtotal,
    itemCount: items.length,
    // Total units, not lines. "3 items" meaning three lines when the
    // customer is buying twelve stems is misleading on a receipt.
    unitCount: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
  }
}
