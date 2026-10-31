import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Archive, ArrowLeft, CalendarClock, CircleDollarSign, Search, ReceiptText } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const money = (value) => Number(value || 0).toLocaleString('fr-FR')
const dateTime = (value) => value
  ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  : '—'

function ArchivedOrders() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadArchivedOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = []
      const pageSize = 500
      let offset = 0
      while (true) {
        const { data, error: queryError } = await supabase
          .from('orders')
          .select('id, order_number, client_name, client_phone, total_amount, amount_paid, amount_due, payment_status, status, order_type, created_at, deleted_at, deletion_reason, order_items(id, product_name, quantity)')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1)

        if (queryError) throw queryError
        rows.push(...(data || []))
        if (!data || data.length < pageSize) break
        offset += pageSize
      }
      setOrders(rows)
    } catch (loadError) {
      console.error('Archived orders fetch failed:', loadError)
      setError('Archived orders could not be loaded. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (role === 'owner') loadArchivedOrders()
  }, [loadArchivedOrders, role])

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return orders
    return orders.filter((order) => [
      order.order_number,
      order.client_name,
      order.client_phone,
      order.status,
      order.payment_status,
      ...(order.order_items || []).map((item) => item.product_name),
    ].some((value) => String(value || '').toLocaleLowerCase().includes(query)))
  }, [orders, search])

  const archivedValue = useMemo(() => orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0), [orders])
  const archivedBalance = useMemo(() => orders.reduce((sum, order) => sum + Number(order.amount_due ?? Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0))), 0), [orders])

  if (role !== 'owner') return <Navigate to="/orders" replace />

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1500px] space-y-5 pb-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate('/orders')} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary">
              <ArrowLeft size={14} /> All orders
            </button>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Order history</p>
            <h1 className="text-2xl font-display font-semibold leading-tight text-gray-900 sm:text-[28px]">Archived orders</h1>
            <p className="mt-1.5 text-sm text-gray-500">Archived orders are hidden from active work but retained with their payment and item history.</p>
          </div>
          <button type="button" onClick={loadArchivedOrders} disabled={loading} className="rounded-xl border border-sage-dark/70 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-sage disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <section aria-label="Archived order totals" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sage-dark/70 bg-white p-4"><p className="text-xs text-gray-500">Archived orders</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{orders.length.toLocaleString('fr-FR')}</p></div>
          <div className="rounded-2xl border border-sage-dark/70 bg-white p-4"><p className="flex items-center gap-1.5 text-xs text-gray-500"><CircleDollarSign size={14} /> Order value</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{money(archivedValue)} DA</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><p className="text-xs text-amber-700">Outstanding balance</p><p className="mt-1 text-xl font-semibold tabular-nums text-amber-900">{money(archivedBalance)} DA</p></div>
        </section>

        <section className="space-y-4 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
          <label className="relative block">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number, customer, phone, or item" className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/30 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10" />
          </label>

          {error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading archived orders…</div>
          ) : visibleOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sage-dark p-10 text-center">
              <Archive size={24} className="mx-auto text-gray-300" />
              <p className="mt-2 text-sm font-semibold text-gray-700">{orders.length ? 'No archived orders match your search' : 'No archived orders'}</p>
              <p className="mt-1 text-xs text-gray-500">{orders.length ? 'Try another customer, order number, or item.' : 'When you archive an order from Orders, it will appear here.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => {
                const due = Number(order.amount_due ?? Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0)))
                return (
                  <article key={order.id} className="rounded-xl border border-sage-dark/70 bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">#{order.order_number}</span>
                          <span className="text-sm font-semibold text-gray-900">{order.client_name || 'Walk-in customer'}</span>
                          {order.order_type === 'quick_sale' && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-2xs font-semibold text-purple-700">Quick sale</span>}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{order.client_phone || 'No phone'} · {order.status || 'unknown status'} · {order.payment_status || 'unknown payment status'}</p>
                      </div>
                      <button type="button" onClick={() => navigate(`/orders/receipt?id=${order.id}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-sage-dark/70 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-sage">
                        <ReceiptText size={14} /> View receipt
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                      <span className="font-semibold text-gray-800">Total {money(order.total_amount)} DA</span>
                      <span className="text-gray-500">Paid {money(order.amount_paid)} DA</span>
                      {due > 0 && <span className="font-semibold text-rose-700">Due {money(due)} DA</span>}
                      <span className="inline-flex items-center gap-1 text-gray-500"><CalendarClock size={13} /> Created {dateTime(order.created_at)}</span>
                      <span className="inline-flex items-center gap-1 text-gray-500"><CalendarClock size={13} /> Archived {dateTime(order.deleted_at)}</span>
                    </div>
                    {!!order.order_items?.length && <p className="mt-3 text-xs text-gray-600">{order.order_items.map((item) => `${item.quantity} × ${item.product_name || 'Item'}`).join(' · ')}</p>}
                    {order.deletion_reason && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Archive note: {order.deletion_reason}</p>}
                  </article>
                )
              })}
            </div>
          )}
          {!error && !loading && visibleOrders.length > 0 && <p className="text-center text-xs text-gray-400">Showing {visibleOrders.length.toLocaleString('fr-FR')} of {orders.length.toLocaleString('fr-FR')} archived orders</p>}
        </section>
      </main>
    </DashboardLayout>
  )
}

export default ArchivedOrders
