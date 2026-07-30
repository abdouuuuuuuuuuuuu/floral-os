import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Truck, Bike, Store, Clock,
  Phone, Package, CheckCircle2, X, Search, Printer,
  MapPin, AlertCircle, CalendarDays, ArrowUpRight
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useDeliveries } from '../hooks/useDeliveries'
import { supabase } from '../lib/supabase'

const statusConfig = {
  new:        { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    dot: 'bg-rose-500',    label: 'New' },
  processing: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Processing' },
  done:       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Delivered' },
  cancelled:  { bg: 'bg-slate-100',  border: 'border-slate-200',   text: 'text-slate-600',   dot: 'bg-slate-400',   label: 'Cancelled' },
}

const methodConfig = {
  motorcycle: { icon: Bike, label: 'Moto', color: 'text-blue-600', bg: 'bg-blue-50' },
  dhd:        { icon: Truck, label: 'DHD', color: 'text-violet-600', bg: 'bg-violet-50' },
  pickup:     { icon: Store, label: 'Pickup', color: 'text-slate-600', bg: 'bg-slate-100' },
}

// ─── DELIVERY CARD ───────────────────────────────────────────────
function DeliveryCard({ delivery, onStatusChange, onClick }) {
  const cfg = statusConfig[delivery.status] || statusConfig.new
  const method = methodConfig[delivery.delivery_method] || methodConfig.motorcycle
  const MethodIcon = method.icon
  const isDone = delivery.status === 'done'

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
        isDone ? 'opacity-50 grayscale-[0.3]' : ''
      } ${cfg.bg} ${cfg.border}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-6 h-6 rounded-md ${method.bg} flex items-center justify-center`}>
          <MethodIcon size={12} className={method.color} />
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>
          #{delivery.order_number}
        </span>
        <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ml-auto`} />
      </div>

      <p className="font-semibold text-slate-800 text-xs truncate leading-tight">
        {delivery.client_name}
      </p>

      {delivery.client_phone && (
        <a
          href={`tel:${delivery.client_phone}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors mt-0.5"
        >
          <Phone size={9} />
          {delivery.client_phone}
        </a>
      )}

      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-black/5">
        <span className="text-[11px] font-bold text-slate-700">
          {delivery.total_amount?.toLocaleString('fr-FR')} DA
        </span>
        {!isDone && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStatusChange(delivery.id, 'done')
            }}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center hover:bg-emerald-500 hover:text-white hover:border-emerald-500 text-slate-400 transition-all"
            title="Mark delivered"
          >
            <CheckCircle2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── DETAIL MODAL ────────────────────────────────────────────────
function DeliveryModal({ delivery, onClose, onStatusChange }) {
  const navigate = useNavigate()
  if (!delivery) return null

  const cfg = statusConfig[delivery.status] || statusConfig.new
  const method = methodConfig[delivery.delivery_method] || methodConfig.motorcycle
  const MethodIcon = method.icon

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-6 py-4 ${cfg.bg} border-b ${cfg.border} flex items-center justify-between`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-lg ${method.bg} flex items-center justify-center`}>
              <MethodIcon size={18} className={method.color} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Order #{delivery.order_number}</h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-slate-600">{delivery.client_name?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900">{delivery.client_name}</p>
              {delivery.client_phone && (
                <a href={`tel:${delivery.client_phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                  <Phone size={12} />
                  {delivery.client_phone}
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Delivery Date</p>
              <p className="text-sm font-semibold text-slate-800">{delivery.delivery_date || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Time</p>
              <p className="text-sm font-semibold text-slate-800">{delivery.delivery_time || '—'}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Method</p>
            <div className="flex items-center gap-2">
              <MethodIcon size={14} className={method.color} />
              <span className="text-sm font-semibold text-slate-800 capitalize">{delivery.delivery_method || '—'}</span>
            </div>
          </div>

          {delivery.notes && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-amber-800">{delivery.notes}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-sm text-slate-500">Total Amount</span>
            <span className="text-2xl font-black text-slate-900">
              {delivery.total_amount?.toLocaleString('fr-FR')} <span className="text-sm font-medium text-slate-400">DA</span>
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => navigate(`/orders/${delivery.id}`)}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            View Full Order
          </button>
          {delivery.status !== 'done' && (
            <button
              onClick={() => {
                onStatusChange(delivery.id, 'done')
                onClose()
              }}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} /> Mark Delivered
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
function Delivery() {
  const { deliveries, loading, refresh } = useDeliveries()
  const navigate = useNavigate()

  const [weekOffset, setWeekOffset] = useState(0)
  const [filter, setFilter] = useState('all') // all | pending | done
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const week = useMemo(() => {
    const today = new Date()
    const dow = today.getDay()
    const start = new Date(today)
    start.setDate(today.getDate() - dow + (weekOffset * 7))

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const str = d.toISOString().split('T')[0]
      return {
        dateStr: str,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
        dayNum: d.getDate(),
        isToday: str === new Date().toISOString().split('T')[0],
        isPast: str < new Date().toISOString().split('T')[0],
      }
    })
  }, [weekOffset])

  const filtered = useMemo(() => {
    const [start, end] = [week[0].dateStr, week[6].dateStr]
    let d = deliveries.filter(x => x.delivery_date >= start && x.delivery_date <= end)

    if (filter === 'pending') d = d.filter(x => x.status !== 'done' && x.status !== 'cancelled')
    if (filter === 'done') d = d.filter(x => x.status === 'done')

    if (search.trim()) {
      const q = search.toLowerCase()
      d = d.filter(x =>
        x.client_name?.toLowerCase().includes(q) ||
        x.order_number?.includes(q) ||
        x.client_phone?.includes(q)
      )
    }
    return d
  }, [deliveries, week, filter, search])

  const stats = useMemo(() => {
    const weekDels = deliveries.filter(d => d.delivery_date >= week[0].dateStr && d.delivery_date <= week[6].dateStr)
    return {
      total: weekDels.length,
      pending: weekDels.filter(d => d.status !== 'done' && d.status !== 'cancelled').length,
      done: weekDels.filter(d => d.status === 'done').length,
      value: weekDels.reduce((s, d) => s + (d.total_amount || 0), 0),
    }
  }, [deliveries, week])

  const getDayDels = (dateStr) => filtered.filter(d => d.delivery_date === dateStr)

  const handleStatus = async (id, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id)
    if (!error) refresh()
  }

  const weekRange = `${new Date(week[0].dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${new Date(week[6].dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Delivery Schedule</h1>
            <p className="text-sm text-slate-400 mt-1">
              {stats.pending > 0 ? (
                <span className="text-rose-600 font-medium">{stats.pending} pending</span>
              ) : (
                <span className="text-emerald-600 font-medium">All caught up</span>
              )}
              {' · '}{stats.done} delivered · {stats.total} total
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none w-44 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={12} />
                </button>
              )}
            </div>

            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="done">Delivered</option>
            </select>

            <button onClick={() => window.print()} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-all">
              <Printer size={16} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, icon: CalendarDays, color: 'text-slate-700', bg: 'bg-slate-100' },
            { label: 'Pending', value: stats.pending, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Delivered', value: stats.done, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Week Value', value: `${stats.value.toLocaleString('fr-FR')} DA`, icon: ArrowUpRight, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
              <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center`}>
                <s.icon size={18} className={s.color} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{s.value}</p>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Week Nav */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 p-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="px-4 text-sm font-semibold text-slate-700 min-w-[160px] text-center">{weekRange}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
          <button
            onClick={() => setWeekOffset(0)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              weekOffset === 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Today
          </button>
        </div>

        {/* Calendar */}
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            {/* Headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {week.map(day => (
                <div
                  key={`h-${day.dateStr}`}
                  className={`p-3 text-center border-r border-slate-100 last:border-r-0 ${
                    day.isToday ? 'bg-slate-900 text-white' : day.isPast ? 'bg-slate-50' : 'bg-white'
                  }`}
                >
                  <p className={`text-[11px] font-medium uppercase tracking-wider ${day.isToday ? 'text-slate-300' : 'text-slate-400'}`}>
                    {day.dayName}
                  </p>
                  <p className={`text-xl font-bold mt-0.5 ${day.isToday ? 'text-white' : day.isPast ? 'text-slate-400' : 'text-slate-900'}`}>
                    {day.dayNum}
                  </p>
                </div>
              ))}
            </div>

            {/* Cells */}
            <div className="grid grid-cols-7 min-h-[480px]">
              {week.map(day => {
                const dayDels = getDayDels(day.dateStr)
                const pending = dayDels.filter(d => d.status !== 'done' && d.status !== 'cancelled').length

                return (
                  <div
                    key={`c-${day.dateStr}`}
                    className={`p-2 border-r border-slate-100 last:border-r-0 ${
                      day.isToday ? 'bg-blue-50/30' : day.isPast ? 'bg-slate-50/50' : ''
                    }`}
                  >
                    {dayDels.length > 0 && (
                      <div className="flex items-center justify-between mb-2 px-0.5">
                        <span className="text-[10px] font-bold text-slate-400">
                          {dayDels.length}
                        </span>
                        {pending > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-bold">
                            {pending}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {dayDels.length === 0 ? (
                        <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-slate-200">
                          <Package size={16} />
                        </div>
                      ) : (
                        dayDels.map(d => (
                          <DeliveryCard
                            key={d.id}
                            delivery={d}
                            onStatusChange={handleStatus}
                            onClick={() => setSelected(d)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <DeliveryModal
          delivery={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatus}
        />
      )}
    </DashboardLayout>
  )
}

export default Delivery