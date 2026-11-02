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
    const pageSize = 500
    let offset = 0
    const data = []
    let error = null
    while (true) {
      const page = await supabase
        .from('products')
        .select('product_id, item_name, retail_price, stock_level, product_status, is_active, category, image_url, color, flower_type')
        .eq('is_active', true)
        .order('item_name')
        .order('product_id')
        .range(offset, offset + pageSize - 1)
      if (page.error) { error = page.error; break }
      const rows = page.data || []
      data.push(...rows)
      if (rows.length < pageSize) break
      offset += pageSize
    }

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
        image_url: p.image_url || '',
        color: p.color || '',
        flower_type: p.flower_type || '',
      })) || []
      setProducts(mapped)
    }
    setLoading(false)
  }

  return { products, categories, loading, refresh: fetchProducts }
}
