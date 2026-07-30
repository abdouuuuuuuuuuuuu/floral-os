import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProductsAdmin() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('item_name')

    if (error) {
      setError(error.message)
    } else {
      setProducts(data || [])
    }

    setLoading(false)
  }, [])

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name')

    if (!error) {
      setCategories(data || [])
    }
  }, [])

  const createProduct = useCallback(async (product) => {
    setSaving(true)
    setError(null)

    const { data, error } = await supabase
      .from('products')
      .insert({
        item_name: product.item_name,
        retail_price: product.retail_price,
        stock_level: product.stock_level,
        category: product.category,
        description: product.description,
        image_url: product.image_url,
        is_active: true,
        product_status: product.stock_level > 0 ? 'in_stock' : 'out_of_stock',
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      setError(error.message)
      return { success: false, error: error.message }
    }

    setProducts((prev) => [...prev, data])
    return { success: true, data }
  }, [])

  const updateProduct = useCallback(async (id, updates) => {
    setSaving(true)
    setError(null)

    const dbUpdates = {
      ...(updates.item_name !== undefined && { item_name: updates.item_name }),
      ...(updates.retail_price !== undefined && { retail_price: updates.retail_price }),
      ...(updates.stock_level !== undefined && { 
        stock_level: updates.stock_level,
        product_status: updates.stock_level > 0 ? 'in_stock' : 'out_of_stock'
      }),
      ...(updates.category !== undefined && { category: updates.category }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.image_url !== undefined && { image_url: updates.image_url }),
      ...(updates.is_active !== undefined && { is_active: updates.is_active }),
    }

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('product_id', id)
      .select()
      .single()

    setSaving(false)

    if (error) {
      setError(error.message)
      return { success: false, error: error.message }
    }

    setProducts((prev) => prev.map((p) => (p.product_id === id ? data : p)))
    return { success: true, data }
  }, [])

  // Remove stock (for damaged/spoiled inventory)
  const removeStock = useCallback(async (id, quantity, reason = '') => {
    setSaving(true)
    setError(null)

    const product = products.find(p => p.product_id === id)
    if (!product) {
      setSaving(false)
      return { success: false, error: 'Product not found' }
    }

    const currentStock = product.stock_level || 0
    if (quantity > currentStock) {
      setSaving(false)
      return { success: false, error: `Cannot remove more than ${currentStock} units` }
    }

    const newStock = Math.max(0, currentStock - quantity)

    const { data, error } = await supabase
      .from('products')
      .update({
        stock_level: newStock,
        product_status: newStock > 0 ? 'in_stock' : 'out_of_stock',
      })
      .eq('product_id', id)
      .select()
      .single()

    setSaving(false)

    if (error) {
      setError(error.message)
      return { success: false, error: error.message }
    }

    // Log the adjustment
    await supabase.from('stock_adjustments').insert({
      product_id: id,
      adjustment_type: 'removal',
      quantity: -quantity,
      reason: reason || 'Damaged/Spoiled',
      previous_stock: currentStock,
      new_stock: newStock,
    })

    setProducts((prev) => prev.map((p) => (p.product_id === id ? data : p)))
    return { success: true, data, removed: quantity, remaining: newStock }
  }, [products])

  // SOFT DELETE — sets is_active = false instead of hard-deleting
  // This preserves order history and avoids FK constraint errors
  const deleteProduct = useCallback(async (id) => {
    setSaving(true)
    setError(null)

    const { data, error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('product_id', id)
      .select()
      .single()

    setSaving(false)

    if (error) {
      setError(error.message)
      return { success: false, error: error.message }
    }

    setProducts((prev) => prev.map((p) => (p.product_id === id ? data : p)))
    return { success: true, data }
  }, [])

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [fetchProducts, fetchCategories])

  return {
    products,
    categories,
    loading,
    saving,
    error,
    refresh: fetchProducts,
    createProduct,
    updateProduct,
    removeStock,
    deleteProduct,
  }
}