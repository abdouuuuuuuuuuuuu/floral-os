import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarClock, CircleDollarSign, Printer, ReceiptText, Search, Zap, Loader2 } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { supabase } from '../lib/supabase'
import { useShopName } from '../hooks/useShopName'
import { useNotification } from '../context/NotificationContext'
import { printOrderReceipt } from '../utils/orderReceipt'

const money = (value) => Number(value || 0).toLocaleString('fr-FR')
const dateTime = (value) => value
  ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  : '—'

const RANGES = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: 'Last 7 days', days: 6 },
  { key: '30d', label: 'Last 30 days', days: 29 },
]
const PAYMENT_LABELS = { cash: 'Cash', baridimob: 'BaridiMob', usd: 'USDT' }

const rangeStart = (days) => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function QuickSalesHistory() {
  const navigate = useNavigate()
  const shopName = useShopName()
  const { addNotification } = useNotification()
  const [sales, setSales] = useState([])
  const [range, setRange] = useState('today')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printingId, setPrintingId] = useState(null)

  const loadSales = useCallback(async () => {
    setLoading(true)
    setError('')
    const days = RANGES.find((option) => option.key === range)?.days ?? 0
    try {
      const rows = []
      const pageSize = 500
      let offset = 0
      while (true) {
        const { data, error: queryError } = await supabase
          .from('orders')
          .select('*, order_items(*, products(item_name))')
          .eq('order_type', 'quick_sale')
          .is('deleted_at', null)
          .gte('created_at', rangeStart(days))
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (queryError) throw queryError
        rows.push(...(data || []))
        if (!data || data.length < pageSize) break
        offset += pageSize
      }
      setSales(rows)
    } catch (loadError) {
      console.error('Quick sales fetch failed:', loadError)
      setError(navigator.onLine === false
        ? 'You are offline. Quick sales will load when you reconnect.'
        : 'Quick sales could not be loaded. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { loadSales() }, [loadSales])

  const visibleSales = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return sales
    return sales.filter((sale) => [
      sale.order_number,
      sale.client_name,
      sale.client_phone,
      sale.notes,
      ...(sale.order_items || []).map((item) => item.product_name || item.products?.item_name),
    ].some((value) => String(value || '').toLocaleLowerCase().includes(query)))
  }, [sales, search])

  const activeSales = useMemo(() => sales.filter((sale) => sale.status !== 'cancelled'), [sales])
  const totalValue = useMemo(() => activeSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0), [activeSales])
  const averageValue = activeSales.length ? Math.round(totalValue / activeSales.length) : 0

  const handlePrint = async (sale) => {
    if (printingId) return
    setPrintingId(sale.id)
    try {
      const opened = await printOrderReceipt(sale, shopName)
      if (!opened) addNotification('The print dialog did not open. Check printer settings and try again.', 'warning')
    } catch (printError) {
      console.warn('[quick-sales] Could not print receipt.', printError)
      addNotification('Could not print the receipt. Try again.', 'error')
    } finally {
      setPrintingId(null)
    }
  }

  const rangeLabel = RANGES.find((option) => option.key === range)?.label.toLocaleLowerCase()

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1500px] space-y-5 pb-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate('/orders')} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary">
              <ArrowLeft size={14} /> All orders
            </button>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700">Walk-in sales</p>
            <h1 className="text-2xl font-display font-semibold leading-tight text-gray-900 sm:text-[28px]">Quick sales</h1>
            <p className="mt-1.5 text-sm text-gray-500">Every quick sale with its receipt, ready to print or reprint.</p>
          </div>
          <button type="button" onClick={loadSales} disabled={loading} className="rounded-xl border border-sage-dark/70 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-sage disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <section aria-label="Quick sale totals" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sage-dark/70 bg-white p-4"><p className="text-xs text-gray-500">Sales {rangeLabel}</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{activeSales.length.toLocaleString('fr-FR')}</p></div>
          <div className="rounded-2xl border border-sage-dark/70 bg-white p-4"><p className="flex items-center gap-1.5 text-xs text-gray-500"><CircleDollarSign size={14} /> Total value</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{money(totalValue)} DA</p></div>
          <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4"><p className="text-xs text-purple-700">Average sale</p><p className="mt-1 text-xl font-semibold tabular-nums text-purple-900">{money(averageValue)} DA</p></div>
        </section>

        <section className="space-y-4 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sale number, customer, phone, or item" className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/30 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10" />
            </label>
            <div role="group" aria-label="Date range" className="inline-flex shrink-0 rounded-xl border border-sage-dark/80 bg-sage/35 p-1">
              {RANGES.map((option) => (
                <button key={option.key} type="button" aria-pressed={range === option.key} onClick={() => setRange(option.key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${range === option.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading quick sales…</div>
          ) : visibleSales.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sage-dark p-10 text-center">
              <Zap size={24} className="mx-auto text-gray-300" />
              <p className="mt-2 text-sm font-semibold text-gray-700">{sales.length ? 'No quick sales match your search' : `No quick sales ${rangeLabel}`}</p>
              <p className="mt-1 text-xs text-gray-500">{sales.length ? 'Try another customer, sale number, or item.' : 'Sales made from the quick-sale cart will appear here.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSales.map((sale) => {
                const cancelled = sale.status === 'cancelled'
                const due = Number(sale.amount_due ?? Math.max(0, Number(sale.total_amount || 0) - Number(sale.amount_paid || 0)))
                return (
                  <article key={sale.id} className={`rounded-xl border border-sage-dark/70 bg-white p-4 sm:p-5 ${cancelled ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800">#{sale.order_number}</span>
                          <span className="text-sm font-semibold text-gray-900">{sale.client_name || 'Walk-in customer'}</span>
                          {cancelled && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-2xs font-semibold text-rose-700">Cancelled</span>}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{sale.client_phone || 'No phone'} · {PAYMENT_LABELS[sale.payment_method] || sale.payment_method || 'Unknown payment'} · {sale.payment_status || 'paid'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => navigate(`/orders/receipt?id=${sale.id}`)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sage-dark/70 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-sage">
                          <ReceiptText size={14} /> View receipt
                        </button>
                        <button type="button" onClick={() => handlePrint(sale)} disabled={Boolean(printingId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                          {printingId === sale.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print receipt
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                      <span className="font-semibold text-gray-800">Total {money(sale.total_amount)} DA</span>
                      <span className="text-gray-500">Paid {money(sale.amount_paid)} DA</span>
                      {due > 0 && <span className="font-semibold text-rose-700">Due {money(due)} DA</span>}
                      <span className="inline-flex items-center gap-1 text-gray-500"><CalendarClock size={13} /> {dateTime(sale.created_at)}</span>
                    </div>
                    {!!sale.order_items?.length && <p className="mt-3 text-xs text-gray-600">{sale.order_items.map((item) => `${item.quantity} × ${item.product_name || item.products?.item_name || 'Item'}`).join(' · ')}</p>}
                  </article>
                )
              })}
            </div>
          )}
          {!error && !loading && visibleSales.length > 0 && <p className="text-center text-xs text-gray-400">Showing {visibleSales.length.toLocaleString('fr-FR')} of {sales.length.toLocaleString('fr-FR')} quick sales</p>}
        </section>
      </main>
    </DashboardLayout>
  )
}

export default QuickSalesHistory
