import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, Bike, ChevronLeft, ChevronRight, Phone, MapPin, Clock,
  CheckCircle2, AlertTriangle, Calendar, Printer, Wallet, X, Archive,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useDeliveries } from '../hooks/useDeliveries'
import { useNotification } from '../context/NotificationContext'
import { ListSkeleton } from '../components/common/Skeleton'
import { printThermalReceipt } from '../utils/printThermal'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { archiveOrder } from '../lib/orders'
import { addCalendarDays, BUSINESS_TIME_ZONE, formatBusinessDate, localDate } from '../lib/businessDate.js'

const fmt = (n) => (n ?? 0).toLocaleString('fr-FR') + ' DA'

function dayLabel(dateStr) {
  const day = String(dateStr || '').slice(0, 10)
  const today = localDate()
  if (day === today) return 'Today'
  if (day === addCalendarDays(today, 1)) return 'Tomorrow'
  if (day === addCalendarDays(today, -1)) return 'Yesterday'
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('fr-FR', { timeZone: BUSINESS_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
    : 'Unknown date'
}

// ─── ONE STOP ──────────────────────────────────────────────────────
function Stop({ order, index, onHandoff, onDeliver, onFailure, onOpen, onArchive, late }) {
  const Icon = order.delivery_method === 'motorcycle' ? Bike : Truck
  const done = order.status === 'done'
  const owes = (order.amount_due || 0) > 0

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-sage/20 sm:flex-row sm:items-start ${
        done ? 'bg-sage/20' : ''
      }`}
    >
      {/* Stop number, so the driver can count down the run. */}
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold shrink-0 ${
          done
            ? 'bg-success-subtle text-success'
            : late
              ? 'bg-danger-subtle text-danger'
              : 'bg-sage text-gray-500'
        }`}
      >
        {done ? <CheckCircle2 size={14} /> : index}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold tabular-nums text-gray-900">
            {order.delivery_time && order.delivery_time !== '00:00:00'
              ? order.delivery_time.slice(0, 5)
              : 'Any time'}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-gray-800">{order.client_name}</span>
          <button
            onClick={() => onOpen(order.id)}
            className="shrink-0 rounded-md bg-primary-subtle px-2 py-1 text-2xs font-semibold text-primary transition hover:bg-primary hover:text-white"
          >
            #{order.order_number}
          </button>
          {late && (
            <span className="pill pill-danger">
              {formatBusinessDate(order.delivery_date)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {order.client_phone && (
            // A driver at the door needs to call, not read a number.
            <a
              href={`tel:${order.client_phone}`}
              className="flex items-center gap-1 text-2xs text-gray-500 hover:text-primary"
            >
              <Phone size={11} /> {order.client_phone}
            </a>
          )}
          <span className="flex items-center gap-1 text-2xs text-gray-400">
            <Icon size={11} />
            {order.delivery_method === 'motorcycle' ? 'Motorcycle' : 'DHD'}
          </span>
          {order.delivery_handed_off_at && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-2xs font-semibold text-sky-800">
            <Truck size={11} /> Courier handoff · {new Date(order.delivery_handed_off_at).toLocaleTimeString('fr-FR', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}
          </span>}
          {done && order.delivered_at && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-800">
            <CheckCircle2 size={11} /> Delivered · {new Date(order.delivered_at).toLocaleTimeString('fr-FR', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}
          </span>}
          {owes && (
            // What the driver has to collect at the door. Nothing in the
            // app surfaced this and it's the thing most likely to go
            // wrong on a run.
            <span className="flex items-center gap-1 text-2xs font-semibold text-danger">
              <Wallet size={11} /> Collect {fmt(order.amount_due)}
            </span>
          )}
        </div>

        {order.notes && (
          <p className="flex items-start gap-1 text-2xs text-gray-400 mt-1">
            <MapPin size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{order.notes}</span>
          </p>
        )}

        {order.last_delivery_attempt && <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-2xs text-amber-900">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span><strong>Previous attempt:</strong> {order.last_delivery_attempt.reason} · {order.last_delivery_attempt.resolution === 'rescheduled' ? `Rescheduled to ${formatBusinessDate(order.last_delivery_attempt.rescheduled_delivery_date)}` : 'Returned to shop'}</span>
        </p>}
      </div>

      <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:ml-auto">
        {!done && <>
          {!order.delivery_handed_off_at && <button
            onClick={() => onHandoff(order)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            <Truck size={14} /> Handed to courier
          </button>}
          <button
            onClick={() => onDeliver(order)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <CheckCircle2 size={14} /> Delivered
          </button>
          <button
            onClick={() => onFailure(order)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sage-dark bg-white px-3 text-xs font-medium text-gray-600 transition hover:border-danger/25 hover:bg-danger-subtle hover:text-danger"
          >
            Unable to deliver
          </button>
        </>}
        <button type="button" onClick={() => onArchive(order)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-100">
          <Archive size={14} /> Archive
        </button>
      </div>
    </div>
  )
}

// ─── PAGE ──────────────────────────────────────────────────────────
function Delivery() {
  const {
    date, step, goToday, run, overdue, needsPlan, weekCounts, stats,
    loading, error, markDelivered, markHandedOff, recordDeliveryFailure, refresh,
  } = useDeliveries()

  const navigate = useNavigate()
  const { addNotification } = useNotification()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [showOverdue, setShowOverdue] = useState(true)
  const [failureOrder, setFailureOrder] = useState(null)
  const [failureReason, setFailureReason] = useState('Recipient unavailable')
  const [resolution, setResolution] = useState('reschedule')
  const [newDate, setNewDate] = useState('')
  const [failureSaving, setFailureSaving] = useState(false)
  const [failureError, setFailureError] = useState('')

  const isToday = date === localDate()

  const handleDeliver = async (order) => {
    try {
      await markDelivered(order.id)
      addNotification(`#${order.order_number} marked delivered`, 'success')
    } catch (err) {
      addNotification(err.message || 'Could not mark as delivered.', 'error')
    }
  }

  const handleHandoff = async (order) => {
    try {
      const result = await markHandedOff(order.id)
      addNotification(
        result?.already_handed_off ? `#${order.order_number} is already with the courier` : `#${order.order_number} handed to courier`,
        result?.already_handed_off ? 'info' : 'success'
      )
    } catch (err) {
      addNotification(err.message || 'Could not record courier handoff.', 'error')
    }
  }

  const handleArchive = async (order) => {
    const ok = await confirm({
      title: `Archive order #${order.order_number}?`,
      message: 'The order will leave active work and remain available in the owner’s Archived Orders page with its history.',
      confirmLabel: 'Archive order',
      danger: false,
    })
    if (!ok) return
    try {
      await archiveOrder(order.id)
      await refresh()
      addNotification(`Order #${order.order_number} archived`, 'success')
    } catch (error) {
      addNotification(error.message || 'Could not archive this order.', 'error')
    }
  }

  const submitFailure = async (event) => {
    event.preventDefault()
    if (!failureOrder || failureSaving) return
    setFailureSaving(true)
    setFailureError('')
    try {
      await recordDeliveryFailure(failureOrder, {
        reason: failureReason,
        resolution,
        newDate,
        actor: profile?.full_name || profile?.username,
      })
      addNotification(
        resolution === 'reschedule'
          ? `#${failureOrder.order_number} rescheduled for ${newDate}`
          : `#${failureOrder.order_number} returned to shop and left unresolved`,
        'success'
      )
      setFailureOrder(null)
    } catch (err) {
      setFailureError(err.message || 'Could not save this delivery outcome.')
    } finally {
      setFailureSaving(false)
    }
  }

  const handlePrintRun = () => {
    const stops = [...run.timed, ...run.anytime]
    if (stops.length === 0) return

    const rows = stops
      .map((o, i) => `
        <div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed #000">
          <div class="row" style="font-size:13px">
            <span><strong>${i + 1}. ${
              o.delivery_time && o.delivery_time !== '00:00:00'
                ? o.delivery_time.slice(0, 5)
                : 'Any'
            }</strong></span>
            <span>#${o.order_number}</span>
          </div>
          <div style="font-size:12px">${o.client_name || ''}</div>
          ${o.client_phone ? `<div style="font-size:11px">${o.client_phone}</div>` : ''}
          ${o.notes ? `<div style="font-size:11px">${o.notes}</div>` : ''}
          ${
            (o.amount_due || 0) > 0
              ? `<div style="font-size:12px"><strong>COLLECT ${o.amount_due.toLocaleString('fr-FR')} DA</strong></div>`
              : ''
          }
        </div>`)
      .join('')

    printThermalReceipt(
      `
        <div class="center brand">DELIVERY RUN</div>
        <div class="center sub">${dayLabel(date)}</div>
        <div class="divider"></div>
        <div class="row"><span>Stops</span><span>${stops.length}</span></div>
        <div class="row"><span>To collect</span><span>${stats.toCollect.toLocaleString('fr-FR')} DA</span></div>
        <div class="divider"></div>
        ${rows}
      `,
      `Delivery run ${date}`,
      './logo-Black.png'
    )
  }

  const allStops = [...run.timed, ...run.anytime]

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1500px] space-y-5 pb-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Delivery workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Daily deliveries</h1>
            <p className="mt-1 text-sm text-gray-500">A time-ordered run sheet with collection amounts and delivery outcomes.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-sage-dark/70 bg-white p-1 shadow-sm">
              <button type="button" onClick={() => step(-1)} aria-label="Previous day" className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 transition hover:bg-sage hover:text-primary">
              <ChevronLeft size={18} />
            </button>

            <div className="min-w-[165px] px-2 text-center">
              <h2 className="text-sm font-semibold leading-tight text-gray-900">
                {dayLabel(date)}
              </h2>
              <p className="mt-0.5 text-2xs text-gray-400">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
                  timeZone: BUSINESS_TIME_ZONE,
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            </div>

            <button type="button" onClick={() => step(1)} aria-label="Next day" className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 transition hover:bg-sage hover:text-primary">
              <ChevronRight size={18} />
            </button>
          </div>

            {!isToday && <button type="button" onClick={goToday} className="min-h-11 rounded-xl border border-sage-dark/70 bg-white px-3.5 text-sm font-semibold text-gray-600 transition hover:border-primary/25 hover:text-primary">Today</button>}
            <button
              type="button"
              onClick={handlePrintRun}
              disabled={allStops.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage-dark/70 bg-white px-3.5 text-sm font-semibold text-gray-600 transition hover:border-primary/25 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer size={15} /> Print run
            </button>
          </div>
        </header>

        <section aria-label="Delivery summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-subtle text-primary"><Truck size={18} /></span>
            <div><p className="text-lg font-semibold tabular-nums text-gray-900">{stats.total}</p><p className="text-xs text-gray-500">Scheduled stops</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-subtle text-accent"><CheckCircle2 size={18} /></span>
            <div><p className="text-lg font-semibold tabular-nums text-gray-900">{stats.done}<span className="ml-1 text-sm font-medium text-gray-400">/ {stats.total}</span></p><p className="text-xs text-gray-500">Stops completed</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-warning-subtle text-warning"><Wallet size={18} /></span>
            <div><p className="text-lg font-semibold tabular-nums text-gray-900">{fmt(stats.toCollect)}</p><p className="text-xs text-gray-500">To collect at delivery</p></div>
          </div>
        </section>

        {/* ── Load across the coming days, so you can see where the
               pressure is without leaving the day you're working on. ── */}
        <section aria-label="Choose delivery day" className="rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-gray-800">Jump to a day</h2><p className="mt-0.5 text-xs text-gray-500">Nearby delivery load</p></div>
            <Calendar size={17} className="text-gray-400" />
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => {
            const ds = addCalendarDays(date, i - 1)
            const d = new Date(`${ds}T12:00:00Z`)
            const count = weekCounts[ds] || 0
            const active = ds === date
            return (
              <button
                key={ds}
                type="button"
                aria-pressed={active}
                onClick={() => step(i - 1)}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  active
                    ? 'border-primary bg-primary text-white font-semibold shadow-sm'
                    : count > 0
                      ? 'border-sage-dark bg-sage/40 text-gray-700 hover:border-primary/30'
                      : 'border-sage-dark/50 bg-white text-gray-400 hover:bg-sage/30'
                }`}
              >
                <span>{d.toLocaleDateString('fr-FR', { timeZone: BUSINESS_TIME_ZONE, weekday: 'short' })}</span>
                <span className="flex items-center gap-1.5 font-semibold">{d.toLocaleDateString('fr-FR', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short' })}
                  {count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-primary-subtle text-primary'}`}>
                    {count}
                  </span>}
                </span>
              </button>
            )
          })}
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-subtle p-3">
            <p className="text-sm text-danger">{error}</p>
            <button onClick={refresh} className="text-sm font-semibold text-danger hover:underline">
              Retry
            </button>
          </div>
        )}

        {needsPlan.length > 0 && (
          <section aria-label="Deliveries needing a date" className="overflow-hidden rounded-2xl border border-warning/30 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-warning/20 bg-warning-subtle/50 px-4 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-warning"><Calendar size={16} /></span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{needsPlan.length} delivery {needsPlan.length === 1 ? 'order needs' : 'orders need'} a date</h2>
                <p className="text-xs text-gray-600">These active courier orders cannot be placed on a run sheet yet.</p>
              </div>
            </div>
            <div className="divide-y divide-sage-dark/60">
              {needsPlan.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">#{order.order_number} · {order.client_name || 'Customer not set'}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{order.client_phone || 'No phone number'} · {order.status || 'New'}</p>
                  </div>
                  <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="min-h-9 rounded-lg border border-sage-dark px-3 text-xs font-semibold text-primary transition hover:bg-primary-subtle">Set delivery date</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Late deliveries, whatever their date ──
             The dashboard panel filters on today/tomorrow, so a delivery
             that never went is invisible there by construction. This is
             the one place it surfaces. ── */}
        {overdue.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-danger/25 bg-white shadow-sm">
            <button
              onClick={() => setShowOverdue((v) => !v)}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-danger-subtle/40"
            >
              <div className="w-8 h-8 rounded-lg bg-danger-subtle flex items-center justify-center">
                <AlertTriangle size={15} className="text-danger" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-semibold text-gray-900">
                  {overdue.length} late {overdue.length === 1 ? 'delivery' : 'deliveries'}
                </h2>
                <p className="text-2xs text-gray-400">Past their date and still open</p>
              </div>
              <ChevronRight
                size={16}
                className={`ml-auto text-gray-400 transition-transform ${showOverdue ? 'rotate-90' : ''}`}
              />
            </button>

            {showOverdue && (
              <div className="divide-y divide-sage-dark/70 border-t border-sage-dark/70">
                {overdue.map((o, i) => (
                  <Stop
                    key={o.id}
                    order={o}
                    index={i + 1}
                    late
                    onDeliver={handleDeliver}
                    onHandoff={handleHandoff}
                    onArchive={handleArchive}
                    onFailure={(order) => { setFailureOrder(order); setFailureError('') }}
                    onOpen={(id) => navigate(`/orders/${id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── The run ── */}
        {loading ? (
          <ListSkeleton rows={5} />
        ) : allStops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sage-dark bg-white p-10 text-center sm:p-14">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sage text-primary"><Truck size={25} /></span>
            <p className="font-semibold text-gray-700">No deliveries {dayLabel(date).toLowerCase()}</p>
            <p className="text-gray-400 text-sm mt-1">
              Orders with a delivery date appear here on the day
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {run.timed.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-sage-dark/70 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-sage-dark/70 bg-sage/25 px-4 py-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-primary"><Clock size={16} /></span>
                  <div><h2 className="text-sm font-semibold text-gray-800">Timed deliveries</h2><p className="text-xs text-gray-500">In scheduled order</p></div>
                  <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-600">{run.timed.length}</span>
                </div>
                <div className="divide-y divide-sage-dark/70">
                  {run.timed.map((o, i) => (
                    <Stop
                      key={o.id}
                      order={o}
                      index={i + 1}
                      onDeliver={handleDeliver}
                      onHandoff={handleHandoff}
                      onArchive={handleArchive}
                      onFailure={(order) => { setFailureOrder(order); setFailureError('') }}
                      onOpen={(id) => navigate(`/orders/${id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Untimed stops are fitted around the timed ones — they're a
                separate group, not interleaved at an invented midnight. */}
            {run.anytime.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-sage-dark/70 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-sage-dark/70 bg-sage/25 px-4 py-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-primary"><Calendar size={16} /></span>
                  <div><h2 className="text-sm font-semibold text-gray-800">Flexible timing</h2><p className="text-xs text-gray-500">No delivery time set</p></div>
                  <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-600">{run.anytime.length}</span>
                </div>
                <div className="divide-y divide-sage-dark/70">
                  {run.anytime.map((o, i) => (
                    <Stop
                      key={o.id}
                      order={o}
                      index={run.timed.length + i + 1}
                      onDeliver={handleDeliver}
                      onHandoff={handleHandoff}
                      onArchive={handleArchive}
                      onFailure={(order) => { setFailureOrder(order); setFailureError('') }}
                      onOpen={(id) => navigate(`/orders/${id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {failureOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delivery-failure-title">
          <form onSubmit={submitFailure} className="w-full max-w-md space-y-4 rounded-2xl border border-sage-dark/70 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delivery-failure-title" className="font-semibold text-gray-900">Delivery not completed</h2>
                <p className="mt-1 text-sm text-gray-500">Order #{failureOrder.order_number} · {failureOrder.client_name}</p>
              </div>
              <button type="button" onClick={() => setFailureOrder(null)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-sage hover:text-gray-700"><X size={18} /></button>
            </div>

            <div>
              <label htmlFor="delivery-failure-reason" className="mb-1.5 block text-xs font-semibold text-gray-600">Reason</label>
              <select id="delivery-failure-reason" value={failureReason} onChange={(e) => setFailureReason(e.target.value)} className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3 text-sm outline-none focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10">
                <option>Recipient unavailable</option>
                <option>Could not reach customer</option>
                <option>Address or location issue</option>
                <option>Customer declined delivery</option>
                <option>Payment issue</option>
                <option>Other</option>
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-semibold text-gray-600">Next step</legend>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${resolution === 'reschedule' ? 'border-accent/30 bg-accent-subtle/40' : 'border-sage-dark/70 hover:bg-sage/25'}`}>
                <input type="radio" name="delivery-resolution" value="reschedule" checked={resolution === 'reschedule'} onChange={() => setResolution('reschedule')} className="mt-0.5 accent-[var(--color-accent)]" />
                <span className="flex-1">Reschedule delivery</span>
              </label>
              {resolution === 'reschedule' && (
                <div className="pl-7">
                  <label htmlFor="delivery-new-date" className="mb-1.5 block text-xs font-semibold text-gray-600">New delivery date</label>
                  <input id="delivery-new-date" type="date" min={localDate()} value={newDate} onChange={(e) => setNewDate(e.target.value)} required className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3 text-sm outline-none focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10" />
                </div>
              )}
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${resolution === 'return' ? 'border-accent/30 bg-accent-subtle/40' : 'border-sage-dark/70 hover:bg-sage/25'}`}>
                <input type="radio" name="delivery-resolution" value="return" checked={resolution === 'return'} onChange={() => setResolution('return')} className="mt-0.5 accent-[var(--color-accent)]" />
                <span>Return to shop and leave this order unresolved</span>
              </label>
            </fieldset>

            {failureError && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-subtle p-3 text-sm text-danger">{failureError}</p>}
            <div className="flex justify-end gap-2 border-t border-sage-dark/60 pt-4">
              <button type="button" onClick={() => setFailureOrder(null)} disabled={failureSaving} className="min-h-11 rounded-xl border border-sage-dark px-4 text-sm font-semibold text-gray-600 transition hover:bg-sage disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={failureSaving} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50">{failureSaving ? 'Saving…' : 'Save outcome'}</button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  )
}

export default Delivery
