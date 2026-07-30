import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([
    { id: 'flowers', name: 'Flowers', color: '#E91E63' },
    { id: 'chocolates', name: 'Chocolates', color: '#795548' },
    { id: 'gifts', name: 'Gifts', color: '#9C27B0' },
  ])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('product_id, item_name, retail_price, stock_level, product_status, is_active, category')
      .eq('is_active', true)
      .order('item_name')

    if (error) {
      console.error('Error fetching products:', error)
    } else {
      const mapped = data?.map(p => ({
        id: p.product_id,
        name: p.item_name,
        price: parseInt(p.retail_price),
        stock_quantity: p.stock_level,
        status: p.product_status,
        is_active: p.is_active,
        category: p.category || 'Uncategorized',
      })) || []
      setProducts(mapped)
    }
    setLoading(false)
  }

  return { products, categories, loading, refresh: fetchProducts }
}