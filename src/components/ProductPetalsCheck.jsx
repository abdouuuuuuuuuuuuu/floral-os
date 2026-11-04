import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { bouquetPetals } from '../lib/loyalty'

const BATCH_SIZE = 8

// The database decides what a product earns, so ask it rather than repeat the rule here.
async function petalsFor(product) {
  const contents = bouquetPetals(product.bouquet_lilies, product.bouquet_roses, product.bouquet_other_flowers)
  if (contents > 0) return { petals: contents, bouquet: true }
  const { data, error } = await supabase.rpc('blossom_loyalty_points_per_unit', {
    p_category: product.category, p_flower_type: product.flower_type, p_name: product.item_name,
  })
  if (error) throw error
  return { petals: data, bouquet: false }
}

// Shows what every active product earns, so a wrong rate is caught before a sale.
export default function ProductPetalsCheck() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error: queryError } = await supabase.from('products')
        .select('product_id, item_name, category, flower_type, bouquet_lilies, bouquet_roses, bouquet_other_flowers')
        .eq('is_active', true)
      if (queryError) throw queryError
      const results = []
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE)
        const rates = await Promise.all(batch.map(petalsFor))
        batch.forEach((product, index) => results.push({ ...product, ...rates[index] }))
      }
      return results.sort((a, b) => b.petals - a.petals || a.item_name.localeCompare(b.item_name))
    }
    load()
      .then((results) => { if (active) setRows(results) })
      .catch((loadError) => {
        console.error('Could not load product petals:', loadError)
        if (active) setError('Could not load product petals. Check the connection and try again.')
      })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rows || []).filter((row) => !term || row.item_name.toLowerCase().includes(term))
  }, [rows, search])

  return (
    <section aria-label="Petals per product" className="rounded-2xl border border-sage-dark bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Petals per product</h2>
          <p className="text-xs text-gray-500">A lily or rose showing 1 petal has a name the rule doesn't recognise. Add the English or French name to the product, or enter its flowers on the product form.</p>
        </div>
        <input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="w-48 rounded-lg border border-sage-dark px-3 py-2 text-sm" />
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      ) : !rows ? (
        <p className="mt-3 text-sm text-gray-500"><Loader2 size={15} className="mr-2 inline animate-spin" />Checking products…</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-sage-dark text-xs text-gray-500"><tr><th className="py-2 pr-4 font-medium">Product</th><th className="py-2 pr-4 font-medium">Category</th><th className="py-2 text-right font-medium">Petals</th></tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.product_id} className="border-b border-sage-dark/60">
                  <td className="py-2 pr-4 text-gray-800">{row.item_name}{row.bouquet && <span className="ml-2 text-xs text-fuchsia-700">bouquet</span>}</td>
                  <td className="py-2 pr-4 text-gray-600">{row.category || '—'}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-gray-900">{row.petals}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <p className="py-6 text-center text-sm text-gray-500">No products match this search.</p>}
        </div>
      )}
    </section>
  )
}
