import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt, History, Loader2, X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

const RECENT_LIMIT = 10

const startOfToday = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Header button on the quick-sale screen listing today's quick sales, each
// with a shortcut to its receipt page (where it can be printed or reprinted).
function RecentQuickSales() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef(null)

  const loadSales = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, client_name, total_amount, payment_method, created_at, status, order_items(quantity)')
      .eq('order_type', 'quick_sale')
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('created_at', startOfToday())
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT)
    if (fetchError) {
      console.error('[recent-quick-sales] Could not load sales.', fetchError)
      setError(navigator.onLine === false ? 'You are offline. Recent sales will load when you reconnect.' : 'Could not load recent sales.')
    } else {
      setSales(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) loadSales()
  }, [open, loadSales])

  useEffect(() => {
    if (!open) return undefined
    const handlePointer = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    const handleKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handlePointer)
    window.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sage-dark/80 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <History size={14} /> Recent sales
      </button>

      {open && (
        <div role="dialog" aria-label="Today's quick sales" className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-sage-dark/80 bg-white shadow-xl shadow-gray-900/10">
          <div className="flex items-center justify-between border-b border-sage-dark/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Today&apos;s quick sales</p>
              <p className="text-[11px] text-gray-500">Open a sale to print its receipt.</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={loadSales} disabled={loading} aria-label="Refresh recent sales" className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-sage hover:text-gray-700 disabled:opacity-50">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close recent sales" className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-sage hover:text-gray-700">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {loading && sales.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : error ? (
              <p role="alert" className="px-4 py-6 text-center text-sm text-amber-800">{error}</p>
            ) : sales.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No quick sales yet today.</p>
            ) : (
              <ul className="divide-y divide-sage-dark/50">
                {sales.map((sale) => {
                  const units = (sale.order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
                  return (
                    <li key={sale.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">#{sale.order_number} · {sale.client_name || 'Walk-in customer'}</p>
                        <p className="text-[11px] text-gray-500">{formatTime(sale.created_at)} · {units} item{units === 1 ? '' : 's'} · <span className="font-semibold tabular-nums text-gray-700">{Number(sale.total_amount || 0).toLocaleString('fr-FR')} DA</span></p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/receipt?id=${sale.id}`)}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-sage-dark/80 px-2.5 text-xs font-semibold text-gray-700 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                      >
                        <Receipt size={14} /> Receipt
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RecentQuickSales
