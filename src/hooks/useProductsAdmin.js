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
      // Alphabetical is a SEARCH result, not a browse order. Nobody asks
      // "what starts with C" — they ask what's running out. Low stock
      // first puts the actionable rows at the top.
      .order('stock_level', { ascending: true, nullsFirst: false })
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
        bouquet_lilies: product.bouquet_lilies ?? 0,
        bouquet_roses: product.bouquet_roses ?? 0,
        bouquet_other_flowers: product.bouquet_other_flowers ?? 0,
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

    // Stock is never written as an absolute value from here: a sale made while
    // the form was open would be overwritten. set_product_stock only applies
    // the new count if stock still matches what the editor saw.
    let stockProduct = null
    if (updates.stock_level !== undefined && updates.stock_level !== updates.expected_stock_level) {
      if (updates.expected_stock_level === undefined) {
        setSaving(false)
        const message = 'Reopen the product before changing its stock.'
        setError(message)
        return { success: false, error: message }
      }
      const { data: stockData, error: stockError } = await supabase.rpc('set_product_stock', {
        p_product_id: id,
        p_expected_stock: updates.expected_stock_level,
        p_new_stock: updates.stock_level,
        p_reason: 'Stock count correction',
      })
      if (stockError) {
        setSaving(false)
        setError(stockError.message)
        return { success: false, error: stockError.message }
      }
      stockProduct = stockData?.product ?? null
    }

    const dbUpdates = {
      ...(updates.item_name !== undefined && { item_name: updates.item_name }),
      ...(updates.retail_price !== undefined && { retail_price: updates.retail_price }),
      ...(updates.category !== undefined && { category: updates.category }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.image_url !== undefined && { image_url: updates.image_url }),
      ...(updates.bouquet_lilies !== undefined && { bouquet_lilies: updates.bouquet_lilies }),
      ...(updates.bouquet_roses !== undefined && { bouquet_roses: updates.bouquet_roses }),
      ...(updates.bouquet_other_flowers !== undefined && { bouquet_other_flowers: updates.bouquet_other_flowers }),
      ...(updates.is_active !== undefined && { is_active: updates.is_active }),
      ...(updates.is_starred !== undefined && { is_starred: updates.is_starred }),
    }

    let data = stockProduct
    if (Object.keys(dbUpdates).length) {
      const result = await supabase
        .from('products')
        .update(dbUpdates)
        .eq('product_id', id)
        .select()
        .single()

      if (result.error) {
        setSaving(false)
        setError(result.error.message)
        return { success: false, error: result.error.message }
      }
      data = result.data
    }

    setSaving(false)

    if (data) setProducts((prev) => prev.map((p) => (p.product_id === id ? data : p)))
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

    const { data, error } = await supabase.rpc('remove_product_stock', {
      p_product_id: id,
      p_quantity: quantity,
      p_reason: reason || 'Damaged/Spoiled',
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return { success: false, error: error.message }
    }

    const updatedProduct = data?.product
    if (!updatedProduct) {
      const message = 'Stock adjustment returned no updated product'
      setError(message)
      return { success: false, error: message }
    }

    setProducts((prev) => prev.map((p) => (p.product_id === id ? updatedProduct : p)))
    return { success: true, data: updatedProduct, removed: data.removed, remaining: data.remaining }
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
