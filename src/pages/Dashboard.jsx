import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, Package,
  ArrowUpRight, ArrowDownRight, Clock, AlertTriangle, CheckCircle2,
  Bike, Truck, Store, CalendarClock, RefreshCw, Vault, Wallet,
  Phone, ChevronRight, Flower2,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useDashboard } from '../hooks/useDashboard'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { useUndo } from '../context/UndoContext'
import { DashboardSkeleton } from '../components/common/Skeleton'
import { ColourSignature } from '../components/common/FlowerColour'
import AnimatedFigure from '../components/common/AnimatedFigure'
import { useConfirm } from '../context/ConfirmContext'
import { addCalendarDays, localDate } from '../lib/assistant/dataAccess'
import { formatDistance } from '../lib/shippingPlan'
import { formatBusinessDate } from '../lib/businessDate.js'

// Keep the overview short; the full Orders, Delivery, and Products pages
// handle longer lists and detailed work.
const SHOW_QUEUE = 5
const SHOW_DELIVERY = 4
const SHOW_STOCK = 4
const SHOW_UNPAID = 3

const fmt = (n) => (n ?? 0).toLocaleString('fr-FR') + ' DA'

// ─── COMPACT STAT TILE ─────────────────────────────────────────────
// Replaces the expandable AnalyticCard. Those were ~150px tall each,
// stacked four high — most of the vertical budget for information that
// fits on one line.
function StatTile({ label, value, numeric, suffix = '', sub, change, icon: Icon, tone = 'primary', onClick, error, onRetry }) {
  // The sage tone was near-invisible: light grey on light grey. If an
  // icon can't be read it's noise, not decoration.
  const tones = {
    primary: 'bg-primary-subtle text-primary',
    teal: 'bg-primary-subtle text-primary',
    accent: 'bg-accent-subtle text-accent',
    sage: 'bg-sage-dark text-primary',
  }
  const positive = change >= 0

  const tileClass = `min-h-[132px] rounded-2xl border border-sage-dark/70 bg-white p-4 text-left shadow-sm ${onClick && !error ? 'lift cursor-pointer hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30' : 'cursor-default'}`
  const content = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={17} />
        </div>
        {!error && change !== undefined && change !== null && (
          <span
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-2xs font-semibold ${
              positive ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'
            }`}
          >
            {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {positive ? '+' : ''}{Math.round(change)}%
          </span>
        )}
      </div>
      <p className="text-xl font-semibold leading-tight tabular-nums text-gray-900">
        {error ? '—' : numeric != null
          ? <AnimatedFigure value={numeric} suffix={suffix} />
          : value}
      </p>
      <p className="mt-1 text-xs font-semibold text-gray-600">{label}</p>
      {error ? <div className="mt-1 flex items-center justify-between gap-1"><p className="text-2xs text-rose-700">Unavailable</p><button type="button" onClick={onRetry} className="text-2xs font-semibold text-primary hover:underline">Retry</button></div> : sub && <p className="mt-1 min-h-8 text-2xs leading-4 text-gray-500">{sub}</p>}
    </>
  )
  if (onClick && !error) return <button type="button" onClick={onClick} className={`w-full ${tileClass}`}>{content}</button>
  return <div className={tileClass}>{content}</div>
}

// ─── CASH TILE (owner only) ────────────────────────────────────────
function CashTile({ cash, onClick }) {
  const variance = cash.declared !== null ? cash.declared - cash.computed : null

  return (
    <button
      onClick={onClick}
      className="min-h-[132px] w-full rounded-2xl border border-primary-dark/20 bg-primary p-4 text-left text-white shadow-sm transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lift"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
          <Vault size={17} />
        </div>
        <span
          className={`px-1.5 py-0.5 rounded-full text-2xs font-semibold uppercase ${
            cash.isClosed
              ? 'bg-white/20'
              : cash.hasOpening
                ? 'bg-emerald-400/90 text-emerald-950'
                : 'bg-amber-400/90 text-amber-950'
          }`}
        >
          {cash.isClosed ? 'Closed' : cash.hasOpening ? 'Open' : 'Not opened'}
        </span>
      </div>
      <p className="text-xs font-medium text-white/70">Expected</p>
      <p className="text-xl font-semibold leading-tight"><AnimatedFigure value={cash.computed} suffix=" DA" /></p>
      {cash.isClosed ? <div className="mt-2 border-t border-white/15 pt-2 text-2xs text-white/80">
        <p>Counted <strong className="text-white">{Number(cash.declared || 0).toLocaleString('fr-FR')} DA</strong></p>
        <p className={variance === 0 ? 'text-emerald-100' : 'text-amber-100'}>{variance === 0 ? 'Balanced' : `${variance > 0 ? 'Over' : 'Short'} by ${Math.abs(variance).toLocaleString('fr-FR')} DA`}</p>
      </div> : <p className="mt-1 min-h-8 text-2xs leading-4 text-white/75">{cash.hasOpening ? `Opening ${cash.opening.toLocaleString('fr-FR')} DA · +${cash.cashIn.toLocaleString('fr-FR')} in · −${cash.cashOut.toLocaleString('fr-FR')} out` : 'Set today’s opening balance to start'}</p>}
    </button>
  )
}

function SectionError({ message, onRetry }) {
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-800"><div className="flex items-center justify-between gap-3"><span>{message}</span><button type="button" onClick={onRetry} className="shrink-0 font-semibold underline">Retry</button></div></div>
}

// ─── PANEL SHELL ───────────────────────────────────────────────────
function Panel({ icon: Icon, iconClass, title, subtitle, count, countClass, action, children }) {
  return (
    <section className="rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconClass}`}>
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight text-gray-900">{title}</h2>
          {subtitle && <p className="text-2xs text-gray-400">{subtitle}</p>}
        </div>
        {count !== undefined && (
          <span className={`ml-auto px-2 py-0.5 rounded-full text-2xs font-semibold ${countClass}`}>
            {count}
          </span>
        )}
      </div>
      {children}
      {action}
    </section>
  )
}

function MoreLink({ hidden, onClick, label = 'View all' }) {
  if (!hidden) return null
  return (
    <button
      onClick={onClick}
      className="w-full mt-2 py-1.5 text-2xs font-semibold text-primary hover:underline flex items-center justify-center gap-1"
    >
      {label}
      {hidden > 0 ? ` (${hidden} more)` : ''}
      <ChevronRight size={12} />
    </button>
  )
}

// ─── ORDER WORK ITEM ────────────────────────────────────────────────
function QueueOrderCard({ order, level = 'normal', groupLabel, onOpen, onComplete, completing, canComplete = false }) {
  const DeliveryIcon =
    order.delivery_method === 'motorcycle' ? Bike
    : order.delivery_method === 'dhd' ? Truck
    : Store

  const owes = (order.amount_due || 0) > 0

  return (
    <div className={`rounded-xl border bg-white px-4 py-3.5 transition-colors ${level === 'late' ? 'border-danger/30 hover:border-danger/50' : level === 'due' ? 'border-warning/30 hover:border-warning/50' : 'border-sage-dark/70 hover:border-primary/20'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-primary text-sm shrink-0">#{order.order_number}</span>
          {/* The florist standing at the bench is looking for "the red
              one", not for order 121. */}
          <ColourSignature items={order.order_items} size={11} max={4} />
          {groupLabel && (
            <span
              className={`px-1.5 py-0.5 rounded text-2xs font-semibold uppercase shrink-0 ${
                level === 'late'
                  ? 'bg-danger-subtle text-danger'
                  : level === 'due'
                    ? 'bg-warning-subtle text-warning'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {groupLabel}
            </span>
          )}
          <span className="text-sm text-gray-700 truncate">{order.client_name}</span>
        </div>
        <span className="font-semibold text-primary text-sm shrink-0">{fmt(order.total_amount)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-2xs text-gray-400">
        <span className="flex items-center gap-1">
          <DeliveryIcon size={10} />
          <span className="capitalize">{order.delivery_method || 'Pickup'}</span>
        </span>
        {order.delivery_date && (
          <span
            className={`flex items-center gap-1 ${
              level === 'late' ? 'text-danger font-semibold'
              : level === 'due' ? 'text-warning font-semibold'
              : ''
            }`}
          >
            <CalendarClock size={10} />
            {formatBusinessDate(order.delivery_date)}
            {/* A null delivery_time was rendering as 00:00 — the UI
                inventing midnight for an order with no time set. */}
            {order.delivery_time && order.delivery_time !== '00:00:00'
              ? ` · ${order.delivery_time.slice(0, 5)}`
              : ' · any time'}
          </span>
        )}
        {owes && <span className="text-rose-600 font-semibold">{order.amount_due.toLocaleString('fr-FR')} due</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => onOpen(order)} className="btn btn-ghost px-2.5 py-1 text-2xs">Open</button>
          {canComplete && <button type="button" onClick={() => onComplete(order)} disabled={completing} title="Mark this order as completed" className="btn btn-secondary px-2.5 py-1 text-2xs disabled:opacity-50">
            {completing ? 'Saving…' : <><CheckCircle2 size={12} /> Mark done</>}
          </button>}
        </div>
      </div>
    </div>
  )
}

// ─── ORDERS THAT FELL THROUGH ──────────────────────────────────────
// These are NOT work. An order eleven days past its date can't be made
// today — it either went out and nobody closed it, or it was missed and
// there's an angry customer. Both need a decision.
//
// A small exception queue with direct completion, inline rescheduling,
// and a permission-checked void action.
function StalePanel({ orders, onDelivered, onVoid, onReschedule, canVoid, onViewAll }) {
  const [busy, setBusy] = useState(null)
  const [rescheduling, setRescheduling] = useState(null)
  const [newDate, setNewDate] = useState('')

  if (orders.length === 0) return null

  const act = async (id, fn) => {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const daysLate = (d) =>
    Math.max(0, Math.floor((new Date(`${localDate()}T00:00:00`) - new Date(`${d}T00:00:00`)) / 86400000))

  return (
    <details className="group mt-3 overflow-hidden rounded-xl border border-danger/20 bg-danger-subtle/25">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-danger">
          <AlertTriangle size={15} className="text-danger" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-gray-900">Needs a decision</h3>
          <p className="text-2xs text-gray-600">Over 3 days overdue · check delivery or reschedule</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-danger">{orders.length}</span>
        <ChevronRight size={15} className="text-gray-500 transition-transform group-open:rotate-90" />
      </summary>

      <div className="divide-y divide-danger/10 border-t border-danger/15 bg-white">
        {orders.slice(0, 4).map((o) => (
          <div key={o.id}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:px-5">
            <span className="pill pill-danger shrink-0">{daysLate(o.delivery_date)}d late</span>
            <span className="font-semibold text-primary text-sm shrink-0">#{o.order_number}</span>
            <span className="text-sm text-gray-700 truncate flex-1">{o.client_name}</span>
            <span className="text-sm text-gray-900 tabular shrink-0">
              {(o.total_amount ?? 0).toLocaleString('fr-FR')} DA
            </span>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => act(o.id, () => onDelivered(o))}
                disabled={busy === o.id}
                className="btn btn-secondary text-2xs px-2.5 py-1"
                title="It went out — just close it"
              >
                Mark delivered
              </button>
              {o.delivery_method !== 'pickup' && <button
                onClick={() => {
                  if (rescheduling === o.id) setRescheduling(null)
                  else { setRescheduling(o.id); setNewDate(localDate()) }
                }}
                aria-expanded={rescheduling === o.id}
                disabled={busy === o.id}
                className="btn btn-ghost text-2xs px-2.5 py-1"
              >Reschedule</button>}
              {canVoid && <button onClick={() => act(o.id, () => onVoid(o))} disabled={busy === o.id} className="btn btn-ghost text-2xs px-2.5 py-1 text-danger">Void</button>}
            </div>
          </div>
          {rescheduling === o.id && (
            <form
              className="flex items-center justify-end gap-2 px-4 pb-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (!newDate) return
                act(o.id, async () => {
                  await onReschedule(o, newDate)
                  setRescheduling(null)
                })
              }}
            >
              <label className="text-xs text-gray-500" htmlFor={`reschedule-${o.id}`}>New delivery date</label>
              <input id={`reschedule-${o.id}`} type="date" min={localDate()} value={newDate} onChange={(event) => setNewDate(event.target.value)} required className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
              <button type="submit" disabled={busy === o.id || !newDate} className="btn btn-primary text-2xs px-2.5 py-1">{busy === o.id ? 'Saving…' : 'Save'}</button>
            </form>
          )}
          </div>
        ))}
      </div>

      {orders.length > 4 && (
        <div className="border-t border-sage-dark px-4 py-3 sm:px-5">
          <button type="button" onClick={onViewAll} className="text-2xs font-semibold text-primary hover:underline">View all {orders.length} orders needing review <ChevronRight size={12} className="inline" /></button>
        </div>
      )}
    </details>
  )
}

// ─── MAIN ──────────────────────────────────────────────────────────
function Dashboard() {
  const {
    stats, queueGroups, stale, rescheduleOrder, voidOrder,
    deliveryRun, productsNeeded, shippingPrep,
    outstanding, totalOutstanding, lowStock, alertsEnabled, cashPosition,
    loading, sectionErrors, updateStatus, refresh,
  } = useDashboard()

  const navigate = useNavigate()
  const { addNotification } = useNotification()
  const { role, profile } = useAuth()
  const confirm = useConfirm()
  const { offerUndo } = useUndo()
  const alertedRef = useRef(new Set())
  const [completingOrder, setCompletingOrder] = useState(null)

  useEffect(() => {
    if (!alertsEnabled || !lowStock?.length) return
    lowStock.forEach((p) => {
      const stock = p.stock_level ?? 0
      const threshold = p.low_stock_threshold ?? 10
      const pct = threshold > 0 ? (stock / threshold) * 100 : 0
      const key = p.product_id || p.item_name
      if ((pct <= 20 || stock <= 0) && !alertedRef.current.has(key)) {
        alertedRef.current.add(key)
        addNotification(
          stock <= 0 ? `${p.item_name} is out of stock.` : `${p.item_name} is down to ${stock}.`,
          stock <= 0 ? 'error' : 'warning'
        )
      }
    })
  }, [lowStock, alertsEnabled, addNotification])

  if (loading) {
    return (
      <DashboardLayout>
        {/* Mirrors the real layout below, so nothing jumps when the data
            lands. A skeleton that doesn't match is worse than a spinner. */}
        <DashboardSkeleton tiles={role === 'owner' ? 5 : 4} />
      </DashboardLayout>
    )
  }

  const dueQueue = [
    ...queueGroups.overdue.map((o) => ({ o, label: 'Overdue', level: 'late' })),
    ...queueGroups.today.map((o) => ({ o, label: 'Today', level: 'due' })),
  ]
  const upcomingQueue = [
    ...queueGroups.tomorrow.map((o) => ({ o, label: 'Tomorrow', level: 'normal' })),
    ...queueGroups.later.map((o) => ({ o, label: null, level: 'normal' })),
    ...queueGroups.undated.map((o) => ({ o, label: 'No date', level: 'normal' })),
  ]
  const queueCount = dueQueue.length
  const activeOrderCount = Number(sectionErrors.orders ? 0 : (queueGroups.overdue.length + queueGroups.today.length + queueGroups.tomorrow.length + queueGroups.later.length + queueGroups.undated.length + stale.length))
  const overdueCount = queueGroups.overdue.length
  const today = localDate()
  const tomorrow = addCalendarDays(today, 1)
  const todayDeliveryCount = deliveryRun.filter((order) => String(order.delivery_date).slice(0, 10) === today).length
  const tomorrowDeliveryCount = deliveryRun.filter((order) => String(order.delivery_date).slice(0, 10) === tomorrow).length

  const handleStaleDelivered = async (order) => {
    try {
      await updateStatus(order.id, 'done')
      await refresh({ quiet: true })
      offerUndo({
        message: `#${order.order_number} closed`,
        onUndo: async () => {
          await updateStatus(order.id, order.status || 'processing')
          await refresh({ quiet: true })
        },
      })
    } catch (err) {
      addNotification(err.message || 'Could not close the order.', 'error')
    }
  }

  const handleStaleReschedule = async (order, next) => {
    try {
      await rescheduleOrder(order.id, next)
      addNotification(`#${order.order_number} moved to ${next}`, 'success')
    } catch (err) {
      addNotification(err.message || 'Could not reschedule.', 'error')
    }
  }

  const handleStaleVoid = async (order) => {
    const approved = await confirm({
      title: `Void order #${order.order_number}?`,
      message: 'This reverses its stock and payment records. This action cannot be undone.',
      confirmLabel: 'Void order',
      danger: true,
    })
    if (!approved) return
    try {
      // Voiding moves stock and money, so it goes through the RPC and
      // is NOT offered as an undo — the reversal is the void itself.
      await voidOrder(order.id, 'Never delivered')
      addNotification(`#${order.order_number} voided — stock and payment reversed`, 'success')
    } catch (err) {
      addNotification(err.message || 'Could not void the order.', 'error')
    }
  }

  const handleComplete = async (order) => {
    if (completingOrder) return
    setCompletingOrder(order.id)
    try {
      await updateStatus(order.id, 'done')
      await refresh({ quiet: true })
      offerUndo({
        message: `#${order.order_number} marked done`,
        onUndo: async () => {
          await updateStatus(order.id, order.status || 'new')
          await refresh({ quiet: true })
        },
      })
      addNotification(`Order #${order.order_number} completed.`, 'success')
    } catch (err) {
      addNotification(err.message || 'Could not complete the order.', 'error')
    } finally {
      setCompletingOrder(null)
    }
  }

  const businessHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Algiers', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const greeting = businessHour < 12 ? 'Good morning' : businessHour < 18 ? 'Good afternoon' : 'Good evening'
  const sectionErrorCount = Object.keys(sectionErrors).length

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1480px] space-y-5 pb-8">
      {sectionErrorCount > 0 && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-warning/20 bg-warning-subtle px-4 py-3 text-xs text-warning"><span>{sectionErrorCount === 1 ? 'One dashboard section could not refresh. Its panel shows the issue.' : `${sectionErrorCount} dashboard sections could not refresh. Affected panels show the issues.`}</span><button type="button" onClick={() => refresh({ quiet: true })} className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold hover:bg-white/70">Retry all</button></div>}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Business overview</p>
          <h1 className="text-2xl font-display font-semibold leading-tight text-gray-900 sm:text-[28px]">{greeting}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p className="mt-1.5 text-sm text-gray-500">Here’s what needs your attention today.</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="rounded-xl border border-sage-dark/70 bg-white px-3 py-2 text-xs font-medium capitalize text-gray-600">{new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Algiers', weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <button type="button" onClick={() => refresh({ quiet: true })} aria-label="Refresh dashboard" title="Refresh dashboard" className="grid h-9 w-9 place-items-center rounded-xl border border-sage-dark/70 bg-white text-gray-500 transition hover:border-primary/25 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

        {/* ── Compact business snapshot ── */}
        <section aria-label="Business snapshot" className={`grid grid-cols-2 gap-3 sm:gap-4 ${cashPosition ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
          <StatTile
            label="Payments received today"
            numeric={stats.todaySales}
            suffix=" DA"
            sub={stats.dailyTarget ? `${stats.targetProgress}% of daily collection target · ${fmt(stats.targetRemaining)} remaining` : `Yesterday received: ${fmt(stats.yesterdaySales)}`}
            change={stats.salesChange}
            icon={TrendingUp}
            tone="primary"
            error={Boolean(sectionErrors.metrics)}
            onRetry={() => refresh({ quiet: true })}
          />
          <StatTile
            label="Open orders"
            numeric={activeOrderCount}
            sub={`${overdueCount} overdue · ${queueGroups.today.length} due today · ${stale.length} need review`}
            icon={ShoppingBag}
            tone="accent"
            onClick={() => navigate('/orders')}
            error={Boolean(sectionErrors.orders)}
            onRetry={() => refresh({ quiet: true })}
          />
          <StatTile
            label="Deliveries today"
            numeric={todayDeliveryCount}
            sub={`${tomorrowDeliveryCount} scheduled tomorrow`}
            icon={Truck}
            tone="teal"
            onClick={() => navigate('/delivery')}
            error={Boolean(sectionErrors.orders)}
            onRetry={() => refresh({ quiet: true })}
          />
          <StatTile
            label={role === 'florist' ? 'Stock alerts' : 'Unpaid balance'}
            numeric={role === 'florist' ? lowStock.length : totalOutstanding}
            suffix={role === 'florist' ? '' : ' DA'}
            sub={role === 'florist' ? 'Products need restocking' : `${outstanding.length} orders have a balance due`}
            icon={role === 'florist' ? AlertTriangle : Wallet}
            tone="sage"
            onClick={() => role === 'florist' ? navigate('/products') : navigate('/orders', { state: { dashboardFilter: 'due' } })}
            error={role === 'florist' ? Boolean(sectionErrors.stock) : Boolean(sectionErrors.payments)}
            onRetry={() => refresh({ quiet: true })}
          />
          {cashPosition && !sectionErrors.cash && (
            <CashTile cash={cashPosition} onClick={() => navigate('/coffre-forte')} />
          )}
          {role === 'owner' && sectionErrors.cash && <div role="alert" className="min-h-[132px] rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"><p className="font-semibold">Cash register unavailable</p><button type="button" onClick={() => refresh({ quiet: true })} className="mt-2 rounded-lg bg-white px-2.5 py-1.5 font-semibold text-primary">Retry</button></div>}
        </section>

        {/* ── Today's work first, supporting checks beside it ── */}
        <div className="grid grid-cols-12 items-start gap-4 xl:gap-5">
          {/* Work queue */}
          <div className="col-span-12 xl:col-span-8">
            <Panel
              icon={Clock}
              iconClass="bg-primary-subtle text-primary"
              title="Prepare today"
              subtitle={`${overdueCount} overdue · ${queueGroups.today.length} due today · earliest first`}
              count={queueCount}
              countClass={overdueCount > 0 ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning'}
              action={
                <MoreLink
                  hidden={Math.max(0, queueCount - SHOW_QUEUE)}
                  onClick={() => navigate('/orders')}
                />
              }
            >
              {sectionErrors.orders ? <SectionError message={sectionErrors.orders} onRetry={() => refresh({ quiet: true })} /> : queueCount === 0 ? (
                <div className="text-center py-10 bg-white/60 rounded-xl">
                  <CheckCircle2 size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-700 font-semibold">Nothing overdue or due today</p>
                  <p className="text-xs text-gray-500 mt-0.5">{activeOrderCount ? `${activeOrderCount} open orders are scheduled for later or need a date.` : 'You’re all caught up.'}</p>
                </div>
              ) : (
                <div className="space-y-3 stagger">
                  {dueQueue.slice(0, SHOW_QUEUE).map(({ o, label, level }) => (
                    <QueueOrderCard key={o.id} order={o} level={level} groupLabel={label} onOpen={(order) => navigate(`/orders/${order.id}`)} onComplete={handleComplete} completing={completingOrder === o.id} canComplete />
                  ))}
                </div>
              )}
              {!sectionErrors.orders && <StalePanel
                orders={stale}
                onDelivered={handleStaleDelivered}
                onReschedule={handleStaleReschedule}
                onVoid={handleStaleVoid}
                canVoid={role === 'owner' || role === 'manager'}
                onViewAll={() => navigate('/orders', { state: { dashboardFilter: 'stale' } })}
              />}
              {!sectionErrors.orders && upcomingQueue.length > 0 && <details className="mt-4 rounded-xl border border-sage-dark/70 bg-sage/60"><summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-gray-700">Upcoming &amp; unscheduled <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-gray-500">{upcomingQueue.length}</span></summary><div className="space-y-3 border-t border-sage-dark/70 p-3">{upcomingQueue.slice(0, 8).map(({ o, label, level }) => <QueueOrderCard key={o.id} order={o} level={level} groupLabel={label} onOpen={(order) => navigate(`/orders/${order.id}`)} />)}{upcomingQueue.length > 8 && <button type="button" onClick={() => navigate('/orders')} className="w-full py-2 text-xs font-semibold text-primary hover:underline">View all {upcomingQueue.length} upcoming orders</button>}</div></details>}
            </Panel>
          </div>

          {/* Delivery run + low stock */}
          <div className="col-span-12 space-y-4 xl:col-span-4 xl:space-y-5">
            <Panel
              icon={Truck}
              iconClass="bg-rose-100 text-rose-700"
              title="Carrier handoff"
              subtitle="Calculated from delivery town road distance"
              count={shippingPrep.shipToday.length}
              countClass="bg-rose-100 text-rose-800"
              action={shippingPrep.shipToday.length + shippingPrep.needsAttention.length > 0 && <button type="button" onClick={() => navigate('/orders')} className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-2xs font-semibold text-primary hover:underline">Open dispatch queue <ChevronRight size={12} /></button>}
            >
              {sectionErrors.orders ? <SectionError message={sectionErrors.orders} onRetry={() => refresh({ quiet: true })} /> : <>
                {shippingPrep.shipToday.length === 0 && <p className="py-2 text-xs text-gray-500">No route-confirmed orders need carrier handoff today.</p>}
                <div className="space-y-2">
                  {shippingPrep.shipToday.slice(0, 3).map(({ order, plan }) => <button type="button" key={order.id} onClick={() => navigate('/orders', { state: { shippingOrderId: order.id } })} className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-left transition hover:border-rose-300 hover:shadow-sm">
                    <span className="block truncate text-xs font-semibold text-gray-900">#{order.order_number} · {order.client_name || 'Customer'}</span>
                    <span className="mt-0.5 block truncate text-2xs text-gray-500">{order.delivery_city || 'Unknown town'}{order.delivery_wilaya ? ` · ${order.delivery_wilaya}` : ''} · {formatDistance(plan.distanceKm)} · {plan.label}</span>
                  </button>)}
                </div>
                {shippingPrep.needsAttention.length > 0 && <button type="button" onClick={() => navigate('/orders')} className="mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-2xs font-semibold text-amber-900 hover:bg-amber-100">
                  {shippingPrep.needsAttention.length} delivery order{shippingPrep.needsAttention.length === 1 ? '' : 's'} need a destination, date, or route estimate.
                </button>}
              </>}
            </Panel>

            {sectionErrors.orders ? <Panel icon={Flower2} iconClass="bg-accent-subtle text-accent" title="Products to prepare"><SectionError message={sectionErrors.orders} onRetry={() => refresh({ quiet: true })} /></Panel> : productsNeeded.items.length > 0 && (
              <Panel
                icon={Flower2}
                iconClass="bg-accent-subtle text-accent"
                title="Products to prepare"
                subtitle="Order units for overdue and today"
                count={`${productsNeeded.items.reduce((n, item) => n + item.quantity, 0)} units`}
                countClass="bg-accent text-white"
              >
                <div className="flex flex-wrap gap-1.5">
                  {productsNeeded.items.slice(0, 12).map(({ name, quantity }) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-white border border-sage-dark"
                    >
                      <Package size={12} className="text-accent" aria-hidden="true" />
                      <span className="text-2xs text-gray-700">{name}</span>
                      <span className="text-2xs font-semibold text-gray-900 tabular">
                        {quantity}
                      </span>
                    </span>
                  ))}
                </div>
                {productsNeeded.unlabelled > 0 && <p className="mt-2 text-2xs text-amber-800">{productsNeeded.unlabelled} units need a product name before prep can be assigned.</p>}
              </Panel>
            )}

            <Panel
              icon={Truck}
              iconClass="bg-primary-subtle text-primary"
              title="Delivery run"
              subtitle="Today and tomorrow, by time"
              count={deliveryRun.length}
              countClass="bg-primary-subtle text-primary"
            >
              {/* An empty delivery run doesn't need a full panel in the
                  best slot on the page — a single line says the same
                  thing and hands the space back. */}
              {sectionErrors.orders ? <SectionError message={sectionErrors.orders} onRetry={() => refresh({ quiet: true })} /> : deliveryRun.length === 0 ? (
                <div className="flex items-center gap-2 py-1">
                  <span className="text-xs text-gray-400">Nothing scheduled</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {deliveryRun.slice(0, SHOW_DELIVERY).map((o) => {
                    const isToday = o.delivery_date === today
                    return (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="w-full text-left bg-white rounded-xl px-3 py-2.5 border border-gray-100 hover:border-teal/40 press"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-2xs font-semibold shrink-0 ${
                                isToday ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {isToday ? 'TODAY' : 'TOMO'}
                            </span>
                            <span className="text-xs font-semibold text-gray-800 shrink-0">
                              {o.delivery_time && o.delivery_time !== '00:00:00' ? o.delivery_time.slice(0, 5) : 'Any time'}
                            </span>
                            <span className="text-xs text-gray-600 truncate">{o.client_name}</span>
                          </div>
                          <span className="font-semibold text-primary text-xs shrink-0">
                            #{o.order_number}
                          </span>
                        </div>
                        {o.client_phone && (
                          <p className="flex items-center gap-1 text-2xs text-gray-400 mt-1">
                            <Phone size={9} /> {o.client_phone}
                          </p>
                        )}
                      </button>
                    )
                  })}
                  <MoreLink
                    hidden={Math.max(0, deliveryRun.length - SHOW_DELIVERY)}
                    onClick={() => navigate('/delivery')}
                  />
                </div>
              )}
            </Panel>

            {role !== 'florist' && (
              <Panel icon={Wallet} iconClass="bg-accent-subtle text-accent" title="Payment follow-up" subtitle="Oldest balances first" count={fmt(totalOutstanding)} countClass="bg-accent-subtle text-accent">
                {sectionErrors.payments ? <SectionError message={sectionErrors.payments} onRetry={() => refresh({ quiet: true })} /> : outstanding.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                    <CheckCircle2 size={16} /> No customer balances are due
                  </div>
                ) : (
                  <div className="space-y-3">
                    {outstanding.slice(0, SHOW_UNPAID).map((order) => (
                      <div key={order.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 hover:border-rose-200">
                        <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="min-w-0 flex-1 text-left">
                        <span className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-semibold text-primary">#{order.order_number} · {order.client_name}</span>
                          <span className="shrink-0 font-semibold text-rose-600">{fmt(order.amount_due)}</span>
                        </span>
                        </button>
                        {order.client_phone && <a href={`tel:${String(order.client_phone).replace(/[^+\d]/g, '')}`} aria-label={`Call ${order.client_name || 'customer'} about order ${order.order_number}`} title="Call customer" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100"><Phone size={14} /></a>}
                      </div>
                    ))}
                    <button type="button" onClick={() => navigate('/orders', { state: { dashboardFilter: 'due' } })} className="w-full py-1.5 text-center text-2xs font-semibold text-primary hover:underline">View all {outstanding.length} orders with a balance due <ChevronRight size={12} className="inline" /></button>
                  </div>
                )}
              </Panel>
            )}

            <Panel
              icon={AlertTriangle}
              iconClass="bg-red-100 text-red-600"
              title="Low stock"
              subtitle="At or below threshold"
              count={sectionErrors.stock ? '—' : lowStock.length}
              countClass="bg-red-600 text-white"
            >
              {sectionErrors.stock ? <SectionError message={sectionErrors.stock} onRetry={() => refresh({ quiet: true })} /> : lowStock.length === 0 ? (
                <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                  <Package size={20} className="mx-auto text-emerald-400 mb-1" />
                  <p className="text-xs text-emerald-700 font-medium">Stock levels good</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStock.slice(0, SHOW_STOCK).map((p) => {
                    const stock = p.stock_level ?? 0
                    const threshold = p.low_stock_threshold ?? 10
                    const pct = threshold > 0 ? Math.min(100, (stock / threshold) * 100) : 0
                    const critical = stock <= 0 || pct <= 20
                    return (
                      <button
                        key={p.product_id}
                        onClick={() => navigate('/products')}
                        className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                          critical
                            ? 'bg-red-50 border-red-200 hover:border-red-300'
                            : 'bg-amber-50 border-amber-200 hover:border-amber-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-900 truncate">
                            {p.item_name}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 shrink-0">
                            {stock}
                            <span className="text-2xs text-gray-400 font-medium">/{threshold}</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-white/80 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full ${critical ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    )
                  })}
                  <MoreLink
                    hidden={Math.max(0, lowStock.length - SHOW_STOCK)}
                    onClick={() => navigate('/products')}
                  />
                </div>
              )}
            </Panel>
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}

export default Dashboard
