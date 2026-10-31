import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, ShoppingBag, RefreshCw } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatBusinessDateTime, localDate } from '../lib/businessDate.js'

const money = (value) => Number(value || 0).toLocaleString('fr-FR')

// Each kind gets a quiet dot colour so the feed scans at a glance without
// turning into a wall of badges.
const KIND_STYLE = {
  sale: { label: 'Sale', dot: 'bg-emerald-500' },
  payment: { label: 'Payment', dot: 'bg-emerald-500' },
  refund: { label: 'Refund', dot: 'bg-rose-500' },
  void: { label: 'Cancelled', dot: 'bg-rose-500' },
  delete: { label: 'Deleted', dot: 'bg-rose-600' },
  restore: { label: 'Restored', dot: 'bg-amber-500' },
  reopen: { label: 'Reopened', dot: 'bg-amber-500' },
  archive: { label: 'Archived', dot: 'bg-slate-400' },
  status: { label: 'Status', dot: 'bg-sky-500' },
  waste: { label: 'Waste', dot: 'bg-amber-600' },
  register: { label: 'Register', dot: 'bg-violet-500' },
  team: { label: 'Team', dot: 'bg-sky-600' },
  direct: { label: 'Direct DB', dot: 'bg-rose-600' },
  other: { label: 'Other', dot: 'bg-slate-300' },
}

const KIND_FILTERS = [
  ['', 'All types'], ['sale', 'Sales'], ['payment', 'Payments'], ['refund', 'Refunds'],
  ['void', 'Cancellations'], ['delete', 'Deletions'], ['direct', 'Direct database'],
  ['status', 'Status'], ['register', 'Register'], ['waste', 'Waste'], ['team', 'Team'],
]

// Local midnight (Algiers) for a date input value, as a timestamptz the RPC
// can bound on.
function dayBounds(fromDay, toDay) {
  const from = new Date(`${fromDay}T00:00:00`)
  const to = new Date(`${toDay}T00:00:00`)
  to.setDate(to.getDate() + 1) // inclusive of the end day
  return { from: from.toISOString(), to: to.toISOString() }
}

function ActivityLog() {
  const { role } = useAuth()
  const today = localDate()
  const [fromDay, setFromDay] = useState(today)
  const [toDay, setToDay] = useState(today)
  const [actor, setActor] = useState('')
  const [kind, setKind] = useState('')
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
        supabase.rpc('blossom_activity_feed', {
          p_from: from, p_to: to, p_actor: actor || null, p_kind: kind || null, p_limit: 1000,
        }),
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

  useEffect(() => {
    if (role === 'owner') load()
  }, [role, load])

  const staffName = useMemo(() => {
    const map = {}
    staff.forEach((s) => { map[s.id] = s.full_name || s.username })
    return map
  }, [staff])

  if (role && role !== 'owner') return <Navigate to="/forbidden" replace />

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Activity size={22} className="text-primary" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Activity log</h1>
              <p className="text-xs text-gray-500">Who did what, and when. Owner only.</p>
            </div>
          </div>
          <button type="button" onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-gray-500">From
            <input type="date" value={fromDay} max={toDay} onChange={(e) => setFromDay(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-gray-800" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">To
            <input type="date" value={toDay} min={fromDay} max={today} onChange={(e) => setToDay(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-gray-800" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">Staff
            <select value={actor} onChange={(e) => setActor(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-gray-800">
              <option value="">Everyone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.username}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-gray-800">
              {KIND_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {/* Per-staff summary */}
        {summary.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Staff</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sales</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sold (DA)</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Discounts (DA)</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Voids</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Refunds (DA)</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.actor_id || row.actor_name} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-900">{staffName[row.actor_id] || row.actor_name}</span>
                      <span className="ml-1.5 text-xs text-gray-400">{row.actor_role}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.sales_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(row.sales_total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{money(row.discount_total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{Number(row.voids) || ''}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{money(row.refunds_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Feed */}
        <div className="mt-6 space-y-1">
          {loading && <p className="py-10 text-center text-sm text-gray-400">Loading…</p>}
          {!loading && feed.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-gray-400">
              <ShoppingBag size={28} /><p className="text-sm">No activity in this range.</p>
            </div>
          )}
          {!loading && feed.map((row, index) => {
            const style = KIND_STYLE[row.kind] || KIND_STYLE.other
            return (
              <div key={`${row.at}-${index}`}
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 ${
                  row.kind === 'direct' ? 'bg-rose-50/60 ring-1 ring-rose-100' : ''}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                <span className="w-32 shrink-0 text-xs tabular-nums text-gray-400">{formatBusinessDateTime(row.at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{staffName[row.actor_id] || row.actor_name}</span>
                    <span className="text-gray-400"> · {row.actor_role}</span>
                  </p>
                  <p className="text-sm text-gray-600">{row.summary}</p>
                </div>
                {row.amount != null && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">{money(row.amount)} DA</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default ActivityLog
