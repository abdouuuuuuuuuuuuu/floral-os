import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Activity, RefreshCw, Search, ShoppingCart, Banknote, Undo2, XCircle, Trash2,
  RotateCcw, Archive, ArrowRightLeft, Flower2, Vault, Users, Sparkles, Circle,
  ChevronDown, MapPin, UserRound, Clock,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { localDate } from '../lib/businessDate.js'

const TZ = 'Africa/Algiers'
const money = (value) => Number(value || 0).toLocaleString('fr-FR')

// Each activity type: an icon, a tinted circle, and whether its amount is
// money coming in, going out, or just context.
const KIND = {
  sale:     { label: 'Sale',          Icon: ShoppingCart,  tone: 'emerald', flow: 'in' },
  payment:  { label: 'Payment',       Icon: Banknote,      tone: 'emerald', flow: 'in' },
  refund:   { label: 'Refund',        Icon: Undo2,         tone: 'rose',    flow: 'out' },
  void:     { label: 'Cancelled',     Icon: XCircle,       tone: 'rose',    flow: 'none' },
  delete:   { label: 'Deleted',       Icon: Trash2,        tone: 'rose',    flow: 'none' },
  restore:  { label: 'Restored',      Icon: RotateCcw,     tone: 'amber',   flow: 'none' },
  reopen:   { label: 'Reopened',      Icon: RotateCcw,     tone: 'amber',   flow: 'none' },
  archive:  { label: 'Archived',      Icon: Archive,       tone: 'slate',   flow: 'none' },
  status:   { label: 'Status change', Icon: ArrowRightLeft,tone: 'sky',     flow: 'none' },
  waste:    { label: 'Flower waste',  Icon: Flower2,       tone: 'amber',   flow: 'none' },
  register: { label: 'Register',      Icon: Vault,         tone: 'violet',  flow: 'none' },
  team:     { label: 'Team',          Icon: Users,         tone: 'sky',     flow: 'none' },
  loyalty:  { label: 'Loyalty card',  Icon: Sparkles,      tone: 'fuchsia', flow: 'none' },
  other:    { label: 'Other',         Icon: Circle,        tone: 'slate',   flow: 'none' },
}

const TONE = {
  emerald: 'bg-emerald-50 text-emerald-600',
  rose:    'bg-rose-50 text-rose-600',
  amber:   'bg-amber-50 text-amber-600',
  slate:   'bg-slate-100 text-slate-500',
  sky:     'bg-sky-50 text-sky-600',
  violet:  'bg-violet-50 text-violet-600',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600',
}

const TYPE_FILTERS = [
  ['', 'All types'], ['sale', 'Sales'], ['payment', 'Payments'], ['refund', 'Refunds'],
  ['void', 'Cancellations'], ['delete', 'Deletions'], ['status', 'Status'],
  ['register', 'Register'], ['waste', 'Waste'], ['team', 'Team'], ['loyalty', 'Loyalty'],
]

function dayBounds(fromDay, toDay) {
  const from = new Date(`${fromDay}T00:00:00`)
  const to = new Date(`${toDay}T00:00:00`)
  to.setDate(to.getDate() + 1) // inclusive of the end day
  return { from: from.toISOString(), to: to.toISOString() }
}

const dayKey = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const timeLabel = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const fullTime = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ })

// Pull the human-meaningful "what" out of an audit detail object.
function detailFacts(row) {
  const d = row.detail || {}
  const pay = d.payment_event || {}
  const out = []
  const add = (label, value) => { if (value != null && value !== '' && value !== 0) out.push([label, value]) }
  const da = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DA`
  const methodLabel = (m) => ({ cash: 'Cash', baridimob: 'BaridiMob', usd: 'USDT' }[m] || m)

  if (row.kind === 'sale') {
    add('Order total', da(d.total_amount))
    add('Items', d.item_count)
    if (Array.isArray(d.price_overrides) && d.price_overrides.length) {
      add('Price overrides', d.price_overrides.map((o) => `${o.product_name}: ${da(o.catalog_unit_price)}→${da(o.charged_unit_price)} ×${o.quantity}`).join('; '))
    }
  } else if (row.kind === 'payment' || row.kind === 'refund') {
    add(row.kind === 'refund' ? 'Refunded' : 'Paid', da(pay.amount ?? d.amount))
    add('Method', methodLabel(pay.payment_method))
    add('Note', pay.notes)
  } else if (row.kind === 'archive') {
    add('Reason', d.reason)
    add('Cash rows reversed', d.cash_rows_reversed)
    add('Petals reversed', d.petals_reversed)
  } else if (row.kind === 'delete') {
    add('Order total', da(d.total_amount))
    add('Amount paid', da(d.amount_paid))
    if (d.permanent) out.push(['Permanent', 'Yes — order row removed'])
  } else if (row.kind === 'loyalty') {
    add('Card', d.code)
    add('Customer', d.customer_name)
  } else if (row.kind === 'register') {
    add('Amount', da(row.amount))
    add('Register date', d.register_date)
  } else if (row.kind === 'waste') {
    add('Amount', da(row.amount))
  }
  // Changes (edit/status/void): show what moved from → to.
  const before = row.before || {}
  if (['status', 'void', 'restore', 'reopen'].includes(row.kind)) {
    if (before.status && d.restored_status && before.status !== d.restored_status) add('Status', `${before.status} → ${d.restored_status}`)
    else if (before.status && d.status && before.status !== d.status) add('Status', `${before.status} → ${d.status}`)
    add('Reason', d.reason || before.void_reason)
  }
  return out
}
function dayHeading(key) {
  const todayKey = localDate()
  const label = new Date(`${key}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  if (key === todayKey) return `Today · ${label}`
  const y = new Date(`${todayKey}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1)
  if (key === y.toISOString().slice(0, 10)) return `Yesterday · ${label}`
  return label
}

function ActivityLog() {
  const { role } = useAuth()
  const today = localDate()
  const [fromDay, setFromDay] = useState(today)
  const [toDay, setToDay] = useState(today)
  const [actor, setActor] = useState('')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')
  const [openRow, setOpenRow] = useState(null)
  const [staff, setStaff] = useState([])
  const [feed, setFeed] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (role !== 'owner') return
    supabase.from('profiles').select('id, full_name, username, role').order('full_name')
      .then(({ data }) => setStaff(data || []))
  }, [role])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { from, to } = dayBounds(fromDay, toDay)
      const [feedRes, sumRes] = await Promise.all([
        supabase.rpc('blossom_activity_feed', { p_from: from, p_to: to, p_actor: actor || null, p_kind: kind || null, p_limit: 1000 }),
        supabase.rpc('blossom_staff_activity_summary', { p_from: from, p_to: to }),
      ])
      if (feedRes.error) throw feedRes.error
      if (sumRes.error) throw sumRes.error
      setFeed(feedRes.data || [])
      setSummary(sumRes.data || [])
    } catch (loadError) {
      console.error('Activity log failed:', loadError)
      setError('The activity log could not be loaded. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [fromDay, toDay, actor, kind])

  useEffect(() => { if (role === 'owner') load() }, [role, load])

  const setRange = useCallback((days) => {
    const end = localDate()
    const start = new Date(`${end}T12:00:00Z`)
    start.setUTCDate(start.getUTCDate() - (days - 1))
    setFromDay(start.toISOString().slice(0, 10))
    setToDay(end)
  }, [])

  const staffName = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.full_name || s.username])), [staff])

  // Client-side text search over the loaded range, then group by day.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? feed.filter((r) => [r.summary, r.order_number, staffName[r.actor_id] || r.actor_name, KIND[r.kind]?.label]
          .some((v) => String(v || '').toLowerCase().includes(q)))
      : feed
    const map = new Map()
    for (const r of rows) {
      const key = dayKey(r.at)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return { total: rows.length, days: [...map.entries()].map(([key, items]) => ({ key, items })) }
  }, [feed, query, staffName])

  const activeRange = fromDay === toDay && toDay === today ? 0
    : (() => {
        const span = Math.round((new Date(`${toDay}T12:00:00Z`) - new Date(`${fromDay}T12:00:00Z`)) / 86400000) + 1
        return toDay === today && (span === 7 || span === 30) ? span : -1
      })()

  if (role && role !== 'owner') return <Navigate to="/forbidden" replace />

  const rangeChip = (days, label) => (
    <button type="button" onClick={() => setRange(days || 1)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        activeRange === (days || 0) ? 'bg-primary text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}>
      {label}
    </button>
  )

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Activity size={20} /></span>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Activity log</h1>
              <p className="text-xs text-gray-500">Every money and staff action, newest first. Owner only.</p>
            </div>
          </div>
          <button type="button" onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Quick ranges */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {rangeChip(0, 'Today')}
          {rangeChip(7, 'Last 7 days')}
          {rangeChip(30, 'Last 30 days')}
          <span className="mx-1 hidden text-slate-300 sm:inline">·</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">From
            <input type="date" value={fromDay} max={toDay} onChange={(e) => setFromDay(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-gray-800" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">To
            <input type="date" value={toDay} min={fromDay} max={today} onChange={(e) => setToDay(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-gray-800" />
          </label>
        </div>

        {/* Search + filters */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by order number, staff or action…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
          </div>
          <select aria-label="Filter by staff" value={actor} onChange={(e) => setActor(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-gray-800">
            <option value="">Everyone</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.username}</option>)}
          </select>
          <select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-gray-800">
            {TYPE_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {/* Per-staff summary */}
        {summary.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By staff · selected range</h2>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Staff</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Sales</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Sold</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Discounts</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Voids</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Refunds</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.actor_id || row.actor_name} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5"><span className="font-medium text-gray-900">{staffName[row.actor_id] || row.actor_name}</span><span className="ml-1.5 text-xs capitalize text-gray-400">{row.actor_role}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.sales_count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row.sales_total)} DA</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{Number(row.discount_total) ? `${money(row.discount_total)} DA` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{Number(row.voids) || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{Number(row.refunds_total) ? `${money(row.refunds_total)} DA` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Count */}
        {!loading && !error && (
          <p className="mt-6 text-xs text-slate-500">
            {groups.total === 0 ? 'No matching activity' : `${groups.total.toLocaleString('fr-FR')} ${groups.total === 1 ? 'event' : 'events'}`}
            {query && feed.length !== groups.total ? ` (filtered from ${feed.length.toLocaleString('fr-FR')})` : ''}
          </p>
        )}

        {/* Feed grouped by day */}
        <div className="mt-2">
          {loading && <p className="py-12 text-center text-sm text-gray-400">Loading…</p>}
          {!loading && groups.total === 0 && !error && (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-gray-400">
              <Activity size={26} /><p className="text-sm">Nothing happened in this range. Try a wider date range or clear the search.</p>
            </div>
          )}
          {!loading && groups.days.map(({ key, items }) => (
            <section key={key} className="mt-5 first:mt-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold capitalize text-gray-700">{dayHeading(key)}</h3>
                <span className="text-xs text-slate-400">{items.length} {items.length === 1 ? 'event' : 'events'}</span>
              </div>
              <ul className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {items.map((row, index) => {
                  const meta = KIND[row.kind] || KIND.other
                  const { Icon } = meta
                  const amountTone = meta.flow === 'in' ? 'text-emerald-700' : meta.flow === 'out' ? 'text-rose-700' : 'text-slate-500'
                  const rowId = `${row.at}-${index}`
                  const isOpen = openRow === rowId
                  const facts = isOpen ? detailFacts(row) : []
                  return (
                    <li key={rowId}>
                      <button type="button" onClick={() => setOpenRow(isOpen ? null : rowId)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50/70 sm:px-4">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${TONE[meta.tone]}`}><Icon size={15} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-900">{row.summary}</p>
                          <p className="truncate text-xs text-gray-500">
                            <span className="font-medium text-gray-600">{staffName[row.actor_id] || row.actor_name}</span>
                            <span className="capitalize"> · {row.actor_role}</span>
                            {row.area ? <span className="text-slate-400"> · {row.area}</span> : null}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {row.amount != null && (
                            <div className={`text-sm font-semibold tabular-nums ${amountTone}`}>
                              {meta.flow === 'out' ? '−' : ''}{money(row.amount)} DA
                            </div>
                          )}
                          <div className="text-xs tabular-nums text-slate-400">{timeLabel(row.at)}</div>
                        </div>
                        <ChevronDown size={15} className={`shrink-0 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4">
                          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                            <div className="flex items-start gap-2">
                              <UserRound size={14} className="mt-0.5 shrink-0 text-slate-400" />
                              <div><dt className="text-2xs uppercase tracking-wide text-slate-400">Who</dt>
                                <dd className="text-sm text-gray-800">{staffName[row.actor_id] || row.actor_name}<span className="capitalize text-gray-400"> · {row.actor_role}</span>{row.actor_username ? <span className="text-gray-400"> · @{row.actor_username}</span> : null}</dd></div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Clock size={14} className="mt-0.5 shrink-0 text-slate-400" />
                              <div><dt className="text-2xs uppercase tracking-wide text-slate-400">When</dt>
                                <dd className="text-sm text-gray-800">{fullTime(row.at)}</dd></div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                              <div><dt className="text-2xs uppercase tracking-wide text-slate-400">Where</dt>
                                <dd className="text-sm text-gray-800">{row.area || '—'}{row.order_number ? ` · Order #${row.order_number}` : ''}</dd></div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Activity size={14} className="mt-0.5 shrink-0 text-slate-400" />
                              <div><dt className="text-2xs uppercase tracking-wide text-slate-400">What</dt>
                                <dd className="text-sm text-gray-800">{meta.label}</dd></div>
                            </div>
                          </dl>
                          {facts.length > 0 && (
                            <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-slate-200/70 pt-3 sm:grid-cols-2">
                              {facts.map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-3 sm:block">
                                  <dt className="text-2xs uppercase tracking-wide text-slate-400">{label}</dt>
                                  <dd className="text-sm text-gray-800">{String(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default ActivityLog
