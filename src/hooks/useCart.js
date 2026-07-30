import { useState, useCallback } from 'react'

export function useCart() {
  const [items, setItems] = useState([])

  const addItem = useCallback((product) => {
    // Use stock_level (matches your DB column)
    const stock = product.stock_level ?? product.stock_quantity ?? 0

    if (stock <= 0) {
      return { success: false, error: 'Out of stock' }
    }

    let result = { success: true }

    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id)

      if (existing) {
        const newQuantity = existing.quantity + 1
        if (newQuantity > stock) {
          result = { success: false, error: `Only ${stock} available` }
          return prev
        }

        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: newQuantity, totalPrice: newQuantity * item.price }
            : item
        )
      }

      return [...prev, { ...product, quantity: 1, totalPrice: product.price }]
    })

    return result
  }, [])

  const removeItem = useCallback((productId) => {
    setItems((prev) => prev.filter((item) => item.id !== productId))
  }, [])

  const updateQuantity = useCallback(
    (productId, quantity, maxStock) => {
      if (quantity <= 0) {
        removeItem(productId)
        return
      }

      const safeQty = Math.min(quantity, maxStock ?? quantity)

      setItems((prev) =>
        prev.map((item) =>
          item.id === productId
            ? { ...item, quantity: safeQty, totalPrice: safeQty * item.price }
            : item
        )
      )
    },
    [removeItem]
  )

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
  const total = subtotal

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    total,
    itemCount: items.length,
  }
}