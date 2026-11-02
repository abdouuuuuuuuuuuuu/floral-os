import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Vault,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  X,
  ChevronRight,
  Calendar,
  Clock,
  ShoppingBag,
  Printer,
  RefreshCw,
  Link2,
  Unlink,
  Zap,
  Banknote,
  Smartphone,
  DollarSign,
  Trash2,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useCashRegister } from '../hooks/useCashRegister'
import { printThermalReceipt } from '../utils/printThermal'
import { useShopName } from '../hooks/useShopName'
import { useNotification } from '../context/NotificationContext'
import { addCalendarDays, localDate } from '../lib/businessDate'

// Payment methods are stored lowercase by the write paths; fold anything else
// into cash so a stray value still reconciles somewhere.
function normalizeMethod(value) {
  const v = String(value || 'cash').trim().toLowerCase()
  if (v === 'baridimob' || v === 'usd') return v
  return 'cash'
}

// Per-rail reconciliation for a day's cash_register rows: expected (full drawer
// before any overnight banking) vs the counts recorded at closing. Returns null
// until the day is closed with per-pocket counts. Shared by the day view and
// the printed slip.
function reconcileDay(rows) {
  const list = rows || []
  const closing = list.find((t) => t.transaction_type === 'closing')
  if (!closing || closing.counted_cash == null) return null
  const opening = Number(list.find((t) => t.transaction_type === 'opening')?.amount || 0)
  const sum = (type, method, excludeBanked = false) => list
    .filter((t) => t.transaction_type === type
      && normalizeMethod(t.payment_method) === method
      && !(excludeBanked && t.category === 'Banked overnight'))
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0)
  const expected = {
    cash: opening + sum('cash_in', 'cash') - sum('cash_out', 'cash', true),
    baridimob: sum('cash_in', 'baridimob') - sum('cash_out', 'baridimob'),
    usd: sum('cash_in', 'usd') - sum('cash_out', 'usd'),
  }
  const counted = {
    cash: Number(closing.counted_cash || 0),
    baridimob: Number(closing.counted_baridimob || 0),
    usd: Number(closing.counted_usd || 0),
  }
  const rails = [
    { key: 'cash', label: 'Cash drawer', expected: expected.cash, counted: counted.cash },
    { key: 'baridimob', label: 'BaridiMob', expected: expected.baridimob, counted: counted.baridimob },
    { key: 'usd', label: 'USDT (DZD equiv.)', expected: expected.usd, counted: counted.usd },
  ].map((r) => ({ ...r, diff: r.counted - r.expected }))
  const countedTotal = counted.cash + counted.baridimob + counted.usd
  const expectedTotal = expected.cash + expected.baridimob + expected.usd
  return {
    rails,
    countedTotal,
    expectedTotal,
    variance: countedTotal - expectedTotal,
    banked: Number(closing.banked_overnight || 0),
    float: Number(closing.amount || 0),
  }
}

const transactionTypes = {
  opening: { label: 'Opening Balance', icon: Unlock, color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  cash_in: { label: 'Cash In', icon: ArrowUpCircle, color: 'text-teal-700', bg: 'bg-teal-100', border: 'border-teal-200' },
  cash_out: { label: 'Cash Out', icon: ArrowDownCircle, color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-200' },
  closing: { label: 'Closing Balance', icon: Lock, color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
}

function PocketRow({ label, Icon, expected, value, onChange, diff }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="w-9 h-9 rounded-lg bg-sage flex items-center justify-center shrink-0">
        <Icon size={17} className="text-gray-500" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-2xs text-gray-500">
          Expected {expected.toLocaleString('fr-FR')} DA
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {diff !== 0 && value !== '' && (
          <span className={`pill ${diff > 0 ? 'pill-success' : 'pill-danger'}`}>
            {diff > 0 ? '+' : ''}{diff.toLocaleString('fr-FR')}
          </span>
        )}
        {diff === 0 && expected > 0 && value !== '' && (
          <span className="pill pill-neutral">Exact</span>
        )}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))}
          placeholder="0"
          className="w-28 px-3 py-2 rounded-lg bg-sage border border-transparent focus:bg-white focus:border-sage-dark focus:ring-2 focus:ring-accent/15 outline-none text-base font-semibold text-right tabular"
        />
      </div>
    </div>
  )
}

function CenteredModal({ isOpen, onClose, children, maxWidth = 'max-w-xl' }) {
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto scrim-enter"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      {/* overflow-y-auto, not overflow-hidden.
          The shell capped height at 90vh and then clipped anything past
          it with no scrollable child — so on a laptop screen the Close
          Register modal cut off at "Total Actual Count" and the confirm
          button was unreachable. */}
      <div className={`relative w-full ${maxWidth} bg-white rounded-2xl shadow-2xl sheet-enter max-h-[90vh] overflow-y-auto overscroll-contain flex flex-col`}>
        {children}
      </div>
    </div>
  )
}

function AddTransactionModal({ isOpen, onClose, onSubmit, submitting, initialType = 'cash_in' }) {
  const [formType, setFormType] = useState('cash_in')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('cash')

  const categories = {
    cash_in: ['Sales', 'Delivery', 'Deposit', 'Refund', 'Other'],
    cash_out: ['Supplies', 'Delivery', 'Salary', 'Rent', 'Utilities', 'Other'],
    opening: ['Opening'],
    closing: ['Closing'],
  }

  useEffect(() => {
    if (!isOpen) {
      setFormType(initialType)
      setAmount('')
      setDescription('')
      setCategory('')
      setSource('cash')
    }
  }, [isOpen, initialType])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const numAmount = Number(amount)
    if (amount === '' || !Number.isFinite(numAmount) || numAmount < 0) return
    if (numAmount === 0) {
      // An empty drawer is allowed at opening, but never by accident.
      if (formType !== 'opening') return
      if (!window.confirm('Open the register with an empty drawer (0 DA)?')) return
    }
    try { await onSubmit(formType, numAmount, description, category, source) } catch {}
  }

  const config = transactionTypes[formType]
  const Icon = config.icon

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center`}>
            <Icon size={20} className={config.color} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Add Transaction</h3>
            <p className="text-xs text-gray-500">Record a manual entry</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto p-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Transaction Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(transactionTypes).map(([key, cfg]) => {
                const TypeIcon = cfg.icon
                return (
                  <button key={key} type="button"
                    onClick={() => { setFormType(key); setCategory('') }}
                    className={`py-3 px-2 rounded-xl border-2 font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                      formType === key ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-gray-50'
                    }`}>
                    <TypeIcon size={18} />{cfg.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label htmlFor="tx-amount" className="block text-sm font-medium text-gray-700 mb-1.5">Amount (DA)</label>
            <input id="tx-amount" type="number" step="1" min={formType === 'opening' ? 0 : 1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-lg font-semibold text-center" required autoFocus />
          </div>
          <div>
            <label htmlFor="tx-category" className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select id="tx-category" value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm">
              <option value="">Select category</option>
              {(categories[formType] || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          {(formType === 'cash_in' || formType === 'cash_out') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Source / Drawer</label>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm">
                <option value="cash">💵 Cash Drawer</option>
                <option value="baridimob">📱 BaridiMob</option>
                <option value="usd">💵 USDT Cash</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="tx-desc" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input id="tx-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </CenteredModal>
  )
}

function CashInModal({ isOpen, onClose, cashInTransactions, todayCashIn, linkedOrders, afterHoursOrders = [] }) {
  const visibleOrderIds = useMemo(() => new Set((linkedOrders || []).map(order => order.id)), [linkedOrders])
  const manualEntries = useMemo(() => cashInTransactions
    .filter(tx => !tx.order_id || !visibleOrderIds.has(tx.order_id))
    .map(tx => ({ ...tx, archived_order_link: Boolean(tx.order_id) })), [cashInTransactions, visibleOrderIds])
  const linkedTotal = useMemo(() =>
    linkedOrders?.reduce((sum, o) => sum + (o.day_cash_entries?.reduce((s, e) => s + (Number(e.amount) || 0), 0) || 0), 0) || 0
  , [linkedOrders])
  const manualTotal = useMemo(() => manualEntries.reduce((sum, t) => sum + (Number(t.amount) || 0), 0), [manualEntries])

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
            <TrendingUp size={20} className="text-teal-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cash In — Today</h3>
            <p className="text-xs text-gray-500">Order payments &amp; manual entries</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto p-6 space-y-6">
        <div className="bg-teal-50 rounded-xl p-5 border border-teal-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-teal-700 font-medium">Total Cash In Today</p>
              <p className="text-3xl font-bold text-teal-800 mt-1">{todayCashIn.toLocaleString('fr-FR')} DA</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center">
              <TrendingUp size={28} className="text-teal-700" />
            </div>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-teal-600">
            <span className="flex items-center gap-1"><Link2 size={12} /> Linked: {linkedTotal.toLocaleString('fr-FR')} DA</span>
            <span className="flex items-center gap-1"><Unlink size={12} /> Unlinked: {manualTotal.toLocaleString('fr-FR')} DA</span>
          </div>
        </div>

        {linkedOrders && linkedOrders.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Link2 size={16} className="text-teal-600" /> Order Payments
              <span className="text-xs text-gray-400 font-normal">({linkedOrders.length} order{linkedOrders.length !== 1 ? 's' : ''})</span>
            </h4>
            <div className="space-y-3">
              {linkedOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden sheet-enter">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold bg-teal-100 text-teal-700 px-2.5 py-1 rounded-lg">#{order.order_number}</span>
                      <span className="text-xs text-gray-500">{order.client_name}</span>
                      <span className="text-2xs text-gray-400">Created {order.created_at ? new Date(order.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
                      {order.day_cash_entries?.some((entry) => entry.category === 'After-hours Orders') && (
                        <span className="text-2xs font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">After-hours</span>
                      )}
                      {order.order_type === 'quick_sale' && (
                        <span className="text-2xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Zap size={10} /> Quick Sale</span>
                      )}
                      {order.deleted_at && <span className="text-2xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Archived · history retained</span>}
                      <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                        order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : order.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {order.payment_status === 'paid' ? 'Completed' : order.payment_status === 'partial' ? 'Partial' : order.payment_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-right shrink-0">
                      <p className="text-xs text-gray-400">Lifetime: {order.amount_paid?.toLocaleString('fr-FR')} / {order.total_amount?.toLocaleString('fr-FR')} DA</p>
                    </div>
                  </div>
                  {order.order_items?.length > 0 && (
                    <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-gray-400">Order items</p>
                      <div className="space-y-1">
                        {order.order_items.map((item, index) => (
                          <div key={`${item.product_id || item.product_name}-${index}`} className="flex justify-between gap-3 text-xs text-gray-600">
                            <span>{item.product_name} <span className="text-gray-400">× {item.quantity}</span></span>
                            <span className="shrink-0">{(Number(item.unit_price || 0) * Number(item.quantity || 0)).toLocaleString('fr-FR')} DA</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="px-4 py-2 border-b border-gray-50 text-xs text-gray-500">
                    <span>{order.client_phone || 'No phone recorded'}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    <span>{order.delivery_method || 'No delivery method'}</span>
                    {order.delivery_date && <span> · {order.delivery_date}{order.delivery_time ? ` at ${order.delivery_time}` : ''}</span>}
                    {order.notes && <p className="mt-1 text-gray-400">Note: {order.notes}</p>}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {order.day_cash_entries?.map((entry) => (
                      <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-mono">{entry.created_at ? new Date(entry.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                          {entry.category === 'After-hours Orders' && <span className="text-2xs font-semibold rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">After-hours</span>}
                          <span className="text-sm text-gray-600">{entry.description || 'Payment'}</span>
                        </div>
                        <span className="font-semibold text-teal-700">+{Number(entry.amount).toLocaleString('fr-FR')} DA</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-50 flex justify-between text-xs">
                    <span className="text-gray-500">Today&apos;s total for this order</span>
                    <span className="font-semibold text-teal-700">+{order.day_cash_entries?.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString('fr-FR')} DA</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {afterHoursOrders.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Clock size={16} className="text-violet-600" /> After-hours orders
              <span className="text-xs text-gray-400 font-normal">({afterHoursOrders.length})</span>
            </h4>
            <p className="text-xs text-gray-500 mb-3">Created after the previous register close. Only amounts actually paid are included in Cash In.</p>
            <div className="space-y-2">
              {afterHoursOrders.map((order) => (
                <article key={order.id} className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">#{order.order_number}</span>
                        <span className="text-sm font-medium text-gray-800">{order.client_name || 'Walk-in customer'}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-2xs text-gray-600">{order.payment_status || 'unpaid'}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Created {order.created_at ? new Date(order.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'} · {order.client_phone || 'No phone'}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="font-semibold text-gray-800">{Number(order.total_amount || 0).toLocaleString('fr-FR')} DA total</p>
                      <p className="text-teal-700">{Number(order.amount_paid || 0).toLocaleString('fr-FR')} DA paid</p>
                      <p className="text-gray-500">{Number(order.amount_due || 0).toLocaleString('fr-FR')} DA due</p>
                    </div>
                  </div>
                  {order.order_items?.length > 0 && <p className="mt-3 border-t border-violet-100 pt-2 text-xs text-gray-600">{order.order_items.map((item) => `${item.product_name} × ${item.quantity}`).join(' · ')}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {manualEntries.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Unlink size={16} className="text-amber-600" /> Unlinked / Manual Entries
              <span className="text-xs text-gray-400 font-normal">({manualEntries.length})</span>
            </h4>
            <div className="space-y-2">
              {manualEntries.map((tx) => (
                <div key={tx.id} className="bg-amber-50/50 rounded-xl p-4 border border-amber-100 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg">{tx.category || 'Sales'}</span>
                      <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg">{tx.payment_method === 'baridimob' ? 'BaridiMob' : tx.payment_method === 'usd' ? 'USDT' : 'Cash'}</span>
                      <span className="text-xs text-gray-400 font-mono">{tx.created_at ? new Date(tx.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                    </div>
                    <span className="font-semibold text-teal-700 text-xl">+{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span>
                  </div>
                  <p className="text-sm text-gray-700 font-medium">{tx.description || 'Cash In'}</p>
                      {tx.archived_order_link
                        ? <p className="text-2xs text-amber-600 mt-1">Archived order hidden from Coffre Forte; this payment remains in cash totals.</p>
                        : <p className="text-2xs text-amber-600 mt-1">Not linked to any order — may be from an old trigger or manual entry.</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(!linkedOrders || linkedOrders.length === 0) && manualEntries.length === 0 && afterHoursOrders.length === 0 && (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-400 text-sm border border-gray-100">
            <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No cash in recorded today</p>
            <p className="text-xs mt-1">Payments will appear here automatically</p>
          </div>
        )}
      </div>
    </CenteredModal>
  )
}

function CashOutModal({ isOpen, onClose, transactions, todayCashOutByMethod, addExpense, refresh }) {
  const [expenseItem, setExpenseItem] = useState('')
  const [expenseQty, setExpenseQty] = useState('')
  const [expensePrice, setExpensePrice] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('Supplies')
  const [expenseSource, setExpenseSource] = useState('cash')
  const [submitting, setSubmitting] = useState(false)

  const expenseCategories = ['Supplies', 'Salary', 'Rent', 'Utilities', 'Marketing', 'Other']

  const todayCashOut = useMemo(() =>
    transactions.filter(t => t.transaction_type === 'cash_out').reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  , [transactions])

  const todayExpenses = useMemo(() => transactions.filter(t => t.transaction_type === 'cash_out'), [transactions])

  useEffect(() => {
    if (!isOpen) {
      setExpenseItem('')
      setExpenseQty('')
      setExpensePrice('')
      setExpenseCategory('Supplies')
      setExpenseSource('cash')
      setSubmitting(false)
    }
  }, [isOpen])

  const handleExpenseSubmit = async (e) => {
    e.preventDefault()
    const qty = Math.max(1, Math.round(Number(expenseQty)) || 1)
    const price = Math.round(Number(expensePrice)) || 0
    const total = qty * price
    if (!total || !expenseItem.trim()) return
    setSubmitting(true)
    try {
      await addExpense(expenseItem.trim(), qty, price, expenseCategory, expenseSource)
      setExpenseItem('')
      setExpenseQty('')
      setExpensePrice('')
      setExpenseCategory('Supplies')
      setExpenseSource('cash')
      await refresh()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to add expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <TrendingDown size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cash Out / Expenses</h3>
            <p className="text-xs text-gray-500">Record a new expense</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto p-6 space-y-6">
        <div className="bg-red-50 rounded-xl p-5 border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 font-medium">Total Cash Out Today</p>
              <p className="text-3xl font-bold text-red-800 mt-1">{todayCashOut.toLocaleString('fr-FR')} DA</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <TrendingDown size={28} className="text-red-700" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-2xs font-semibold bg-white/70 text-red-800 px-2 py-1 rounded-full border border-red-100">Cash {todayCashOutByMethod.cash.toLocaleString('fr-FR')} DA</span>
            {todayCashOutByMethod.baridimob > 0 && <span className="text-2xs font-semibold bg-white/70 text-red-800 px-2 py-1 rounded-full border border-red-100">BaridiMob {todayCashOutByMethod.baridimob.toLocaleString('fr-FR')} DA</span>}
            {todayCashOutByMethod.usd > 0 && <span className="text-2xs font-semibold bg-white/70 text-red-800 px-2 py-1 rounded-full border border-red-100">USDT {todayCashOutByMethod.usd.toLocaleString('fr-FR')} DA</span>}
          </div>
          <p className="text-xs text-red-600 mt-2">Manually recorded expenses &amp; refunds</p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Plus size={16} /> Add New Expense</h4>
          <form onSubmit={handleExpenseSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="exp-item" className="block text-xs font-medium text-gray-600 mb-1">Item / Description</label>
                <input id="exp-item" type="text" value={expenseItem} onChange={(e) => setExpenseItem(e.target.value)} placeholder="e.g. Fresh Roses Supply" required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none" />
              </div>
              <div>
                <label htmlFor="exp-qty" className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input id="exp-qty" type="number" value={expenseQty} onChange={(e) => setExpenseQty(e.target.value)} placeholder="0" min="1" required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none" />
              </div>
              <div>
                <label htmlFor="exp-price" className="block text-xs font-medium text-gray-600 mb-1">Unit Price (DA)</label>
                <input id="exp-price" type="number" value={expensePrice} onChange={(e) => setExpensePrice(e.target.value)} placeholder="0" min="0" required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exp-cat" className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select id="exp-cat" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none">
                  {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Paid From</label>
                <select value={expenseSource} onChange={(e) => setExpenseSource(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none">
                  <option value="cash">💵 Cash</option>
                  <option value="baridimob">📱 BaridiMob</option>
                  <option value="usd">💵 USDT</option>
                </select>
              </div>
            </div>
            <div className="flex items-end justify-end">
              <button type="submit" disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                {submitting ? 'Saving...' : 'Add Expense'}
              </button>
            </div>
            {(expenseQty && expensePrice) && (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                Total: <span className="font-semibold text-red-700 text-lg">{Math.round(Number(expenseQty)) * Math.round(Number(expensePrice))} DA</span>
                <span className="text-gray-400 text-xs ml-2">({expenseQty} × {expensePrice} DA)</span>
              </div>
            )}
          </form>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Today&apos;s Expenses</h4>
          <div className="space-y-2">
            {todayExpenses.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <ArrowDownCircle size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.description || 'Expense'}</p>
                    <p className="text-xs text-gray-500">{tx.category || 'Other'}{tx.quantity && tx.unit_price && <span className="ml-2 text-gray-400">{tx.quantity} × {tx.unit_price} DA</span>}</p>
                  </div>
                </div>
                <span className="font-semibold text-red-700 text-lg">-{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span>
              </div>
            ))}
            {todayExpenses.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm border border-gray-100">
                <TrendingDown size={32} className="mx-auto mb-2 opacity-30" />
                <p>No expenses recorded today</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </CenteredModal>
  )
}

function ClosingBalanceModal({ isOpen, onClose, computedBalance, openingBalance, todayCashIn, todayCashOut, todayCashInByMethod, todayCashOutByMethod, setClosingBalance, refresh }) {
  const [counts, setCounts] = useState({ cash: '', baridimob: '', usd: '' })
  const [banked, setBanked] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const cashExpected = openingBalance + todayCashInByMethod.cash - todayCashOutByMethod.cash
  const baridiExpected = todayCashInByMethod.baridimob - todayCashOutByMethod.baridimob
  const usdExpected = todayCashInByMethod.usd - todayCashOutByMethod.usd

  useEffect(() => {
    if (isOpen) {
      setCounts({
        cash: cashExpected > 0 ? cashExpected.toString() : '',
        baridimob: baridiExpected > 0 ? baridiExpected.toString() : '',
        usd: usdExpected > 0 ? usdExpected.toString() : '',
      })
    }
    if (!isOpen) {
      setCounts({ cash: '', baridimob: '', usd: '' })
      setBanked('')
      setSubmitting(false)
    }
  }, [isOpen, cashExpected, baridiExpected, usdExpected])

  const totalActual = Math.round(Number(counts.cash || 0)) + Math.round(Number(counts.baridimob || 0)) + Math.round(Number(counts.usd || 0))
  const totalDiff = totalActual - computedBalance
  const bankedAmount = Math.max(0, Math.round(Number(banked || 0)))
  const carriedFloat = totalActual - bankedAmount

  const getDiff = (actual, expected) => Math.round(Number(actual || 0)) - expected

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (totalActual < 0 || bankedAmount > totalActual) return
    setSubmitting(true)
    try {
      await setClosingBalance({
        cash: Math.round(Number(counts.cash || 0)),
        baridimob: Math.round(Number(counts.baridimob || 0)),
        usd: Math.round(Number(counts.usd || 0)),
        banked: bankedAmount,
      })
      await refresh()
      onClose()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to set closing balance')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Lock size={20} className="text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Close Register</h3>
            <p className="text-xs text-gray-500">Count each pocket separately</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>
      <div className="p-6 space-y-5">
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Opening Balance (Cash)</span>
            <span className="font-medium text-emerald-800">{openingBalance.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Cash In</span>
            <span className="font-medium text-teal-700">+{todayCashIn.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Cash Out</span>
            <span className="font-medium text-red-700">-{todayCashOut.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="pt-2 border-t border-amber-200 flex justify-between text-sm font-semibold">
            <span className="text-gray-800">Computed Total</span>
            <span className="text-amber-800">{computedBalance.toLocaleString('fr-FR')} DA</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* One container, hairline dividers — the alternative to three
              tinted cards stacked inside a card inside a scrim. */}
          <div className="list-group">
            <PocketRow label="Cash Drawer" Icon={Banknote} expected={cashExpected} value={counts.cash}
              onChange={(v) => setCounts(prev => ({ ...prev, cash: v }))} diff={getDiff(counts.cash, cashExpected)} />
            <PocketRow label="BaridiMob" Icon={Smartphone} expected={baridiExpected} value={counts.baridimob}
              onChange={(v) => setCounts(prev => ({ ...prev, baridimob: v }))} diff={getDiff(counts.baridimob, baridiExpected)} />
            <PocketRow label="USDT cash (DZD equiv.)" Icon={DollarSign} expected={usdExpected} value={counts.usd}
              onChange={(v) => setCounts(prev => ({ ...prev, usd: v }))} diff={getDiff(counts.usd, usdExpected)} />
          </div>

          <div className="bg-gray-900 rounded-xl p-4 text-white">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-300">Total Actual Count</span>
              <span className="text-2xl font-bold">{totalActual.toLocaleString('fr-FR')} DA</span>
            </div>
            {totalDiff !== 0 ? (
              <div className={`text-xs font-medium text-center py-1.5 rounded-lg ${totalDiff > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                {totalDiff > 0 ? `+${totalDiff.toLocaleString('fr-FR')} DA surplus` : `${totalDiff.toLocaleString('fr-FR')} DA shortage`}
              </div>
            ) : (
              <div className="text-xs font-medium text-center py-1.5 rounded-lg bg-gray-700 text-gray-300">Exact match with computed balance</div>
            )}
          </div>

          {/* Overnight banking: what you take out tonight, and the float that
              stays in the drawer and becomes tomorrow's opening. */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Banked overnight (optional)</span>
              <span className="mt-0.5 block text-xs text-gray-400">Cash you remove tonight. Leave 0 to keep everything in the drawer.</span>
              <input type="number" min="0" max={totalActual} step="1" value={banked}
                onChange={(e) => setBanked(e.target.value)} placeholder="0"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-right tabular-nums outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
            </label>
            {bankedAmount > totalActual ? (
              <p className="text-xs font-medium text-red-600">Banked amount can’t exceed the counted total.</p>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Float carried to tomorrow</span>
                <span className="font-semibold text-emerald-800">{carriedFloat.toLocaleString('fr-FR')} DA</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting || totalActual < 0 || bankedAmount > totalActual}
              className="flex-1 py-3 rounded-lg bg-amber-700 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : 'Close Register'}
            </button>
          </div>
        </form>
      </div>
    </CenteredModal>
  )
}

function CoffreForte() {
  const { addNotification } = useNotification()
  const {
    transactions,
    calendarDays = [],
    linkedOrders,
    afterHoursOrders = [],
    dayTransactions,
    dayOrders,
    dayUnlinkedCashIn,
    loading,
    lastSyncedAt,
    todayCashInByMethod,
    todayCashOutByMethod,
    dayCashInByMethod,
    dayCashOutByMethod,
    addTransaction,
    addExpense,
    setOpeningBalance,
    setClosingBalance,
    refresh,
    loadDayDetails
  } = useCashRegister()

  const [searchParams, setSearchParams] = useSearchParams()
  const [showCashInModal, setShowCashInModal] = useState(false)
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [showClosingModal, setShowClosingModal] = useState(false)
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false)
  const [initialTransactionType, setInitialTransactionType] = useState('cash_in')
  const [activePanel, setActivePanel] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedDayData, setSelectedDayData] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const todayCashIn = useMemo(() =>
    transactions.filter(t => t.transaction_type === 'cash_in').reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  , [transactions])

  const todayCashOut = useMemo(() =>
    transactions.filter(t => t.transaction_type === 'cash_out').reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  , [transactions])

  const closingTransaction = useMemo(() => transactions.find(t => t.transaction_type === 'closing'), [transactions])
  const closingBalance = closingTransaction ? closingTransaction.amount : 0
  const hasClosing = !!closingTransaction

  const openingTransaction = useMemo(() => transactions.find(t => t.transaction_type === 'opening'), [transactions])
  const openingBalance = openingTransaction ? openingTransaction.amount : 0
  const hasOpening = !!openingTransaction

  const computedBalance = openingBalance + todayCashIn - todayCashOut
  const cashInTransactions = useMemo(() => transactions.filter(t => t.transaction_type === 'cash_in'), [transactions])
  const selectedDayCashIn = useMemo(() => (dayTransactions || []).filter((t) => t.transaction_type === 'cash_in').reduce((sum, t) => sum + Number(t.amount || 0), 0), [dayTransactions])
  const selectedDayCashOut = useMemo(() => (dayTransactions || []).filter((t) => t.transaction_type === 'cash_out').reduce((sum, t) => sum + Number(t.amount || 0), 0), [dayTransactions])
  const selectedDayExpected = Number(selectedDayData?.opening_balance || 0) + selectedDayCashIn - selectedDayCashOut
  const selectedDayVariance = Number(selectedDayData?.closing_balance || 0) - selectedDayExpected

  // Per-rail reconciliation, for the opened calendar day and for today.
  const dayReconcile = useMemo(() => reconcileDay(dayTransactions), [dayTransactions])
  const todayReconcile = useMemo(() => reconcileDay(transactions), [transactions])

  useEffect(() => {
    const panel = searchParams.get('panel')
    if (panel === 'cashout') {
      setShowCashOutModal(true)
      const next = new URLSearchParams(searchParams)
      next.delete('panel')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleAddTransaction = useCallback(async (type, amount, description, category, paymentMethod = 'cash') => {
    setSubmitting(true)
    try {
      if (type === 'opening') await setOpeningBalance(amount)
      else await addTransaction(type, amount, description, category, null, null, null, paymentMethod)
      await refresh()
      setShowAddTransactionModal(false)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to save transaction')
    } finally {
      setSubmitting(false)
    }
  }, [addTransaction, setOpeningBalance, refresh])

  const openDayDetail = useCallback(async (date, dayData) => {
    setSelectedDate(date)
    setSelectedDayData(dayData)
    setActivePanel('day-detail')
    try { await loadDayDetails(date) } catch (err) { console.error('Failed to load day details:', err) }
  }, [loadDayDetails])

  const shopName = useShopName()

  const handlePrintDailyReport = useCallback(() => {
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    // After overnight banking, computedBalance/closingBalance reflect the float.
    // Reconcile against the full counted total so the slip's verdict is the
    // real variance, and show the per-rail breakdown when it was recorded.
    const diff = todayReconcile ? todayReconcile.variance : (closingBalance - computedBalance)
    const cashOutCount = transactions.filter((t) => t.transaction_type === 'cash_out').length

    // Three states, each with a plain-language line so whoever reads the
    // slip tomorrow doesn't have to work out what a number means.
    const verdict =
      diff === 0
        ? {
            label: 'BALANCED',
            amount: 'Exact match',
            note: 'Counted cash matches the expected total.',
          }
        : diff > 0
          ? {
              label: 'SURPLUS',
              amount: `+${diff.toLocaleString('fr-FR')} DA`,
              note: `There is ${diff.toLocaleString('fr-FR')} DA more in the drawer than expected. Check for a missed sale or an unrecorded deposit.`,
            }
          : {
              label: 'SHORTAGE',
              amount: `${diff.toLocaleString('fr-FR')} DA`,
              note: `There is ${Math.abs(diff).toLocaleString('fr-FR')} DA less than expected. Check for an unrecorded expense or change given wrongly.`,
            }

    const money = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DA`

    const htmlContent = `
      <div class="center brand">${(shopName || 'BLOSSOM').toUpperCase()}</div>
      <div class="center sub">Daily Cash Report</div>
      <div class="center" style="font-size:11px;font-weight:700">${dateStr}</div>
      <div class="center" style="font-size:10px;margin-bottom:6px">Printed at ${timeStr}</div>

      <div class="divider"></div>

      <div class="row" style="font-size:13px">
        <span>Opening balance</span><span>${money(openingBalance)}</span>
      </div>
      <div style="font-size:9px;margin:0 0 5px 0">What was in the drawer at the start of the day</div>

      <div class="row" style="font-size:13px">
        <span>Cash in &nbsp;(${cashInTransactions.length})</span><span>+ ${money(todayCashIn)}</span>
      </div>
      <div style="font-size:9px;margin:0 0 5px 0">Sales and deposits received today</div>

      <div class="row" style="font-size:13px">
        <span>Cash out (${cashOutCount})</span><span>- ${money(todayCashOut)}</span>
      </div>
      <div style="font-size:9px;margin:0 0 5px 0">Expenses, supplier payments and refunds</div>

      <div class="divider"></div>

      <div class="row" style="font-size:14px;font-weight:900">
        <span>Expected total</span><span>${money(todayReconcile ? todayReconcile.expectedTotal : computedBalance)}</span>
      </div>
      <div style="font-size:9px;margin:0 0 5px 0">Opening + cash in - cash out</div>

      ${todayReconcile ? `
      <div style="font-size:9px;font-weight:700;margin:4px 0 2px 0">COUNTED BY RAIL</div>
      ${todayReconcile.rails.map((r) => `
        <div class="row" style="font-size:12px">
          <span>${r.label}</span><span>${money(r.counted)}${r.diff !== 0 ? ` (${r.diff > 0 ? '+' : ''}${r.diff.toLocaleString('fr-FR')})` : ''}</span>
        </div>`).join('')}
      ` : ''}

      <div class="row" style="font-size:14px;font-weight:900">
        <span>Counted total</span><span>${money(todayReconcile ? todayReconcile.countedTotal : closingBalance)}</span>
      </div>
      <div style="font-size:9px;margin:0 0 6px 0">What was physically counted at closing</div>

      <div class="total-row">
        <span>${verdict.label}</span><span>${verdict.amount}</span>
      </div>

      ${todayReconcile && todayReconcile.banked > 0 ? `
      <div class="divider"></div>
      <div class="row" style="font-size:13px">
        <span>Banked overnight</span><span>- ${money(todayReconcile.banked)}</span>
      </div>
      <div class="row" style="font-size:14px;font-weight:900">
        <span>Float to tomorrow</span><span>${money(todayReconcile.float)}</span>
      </div>
      <div style="font-size:9px;margin:0 0 5px 0">Stays in the drawer; becomes tomorrow's opening</div>
      ` : ''}
      <div style="font-size:10px;text-align:center;margin-top:5px;line-height:1.35">
        ${verdict.note}
      </div>

      <div class="divider" style="margin-top:10px"></div>

      <div style="font-size:10px;margin-top:10px">
        <div>Counted by: _______________________</div>
        <div style="margin-top:12px">Signature: _______________________</div>
      </div>

      <div class="footer" style="margin-top:14px">
        <div style="font-size:10px">Keep this slip with the day's takings</div>
      </div>
    `

    printThermalReceipt(htmlContent, 'Daily Cash Report', './logo-Black.png')
  }, [
    transactions, cashInTransactions, openingBalance, todayCashIn,
    todayCashOut, closingBalance, computedBalance, shopName, todayReconcile,
  ])

  // ─── A LEDGER, NOT A CALENDAR ────────────────────────────────────
  //
  // A calendar is the right tool for SCHEDULING — picking a future date
  // out of a month. Reconciliation is the opposite job: you're scanning
  // a running record for the day that didn't balance.
  //
  // The grid made that impossible. Four figures crammed into a 112px
  // cell at 10px, and — the real problem — Monday's closing balance sat
  // 7 columns away from Tuesday's opening. Those two numbers should be
  // identical, and any day they aren't is exactly what you're looking
  // for. A calendar physically prevents you from comparing them.
  //
  // Newest first, because the question is almost always about a recent
  // day.
  const ledger = useMemo(() => {
    const rows = []
    // Register days are Africa/Algiers dates, whatever the PC clock zone is.
    const todayStr = localDate()

    for (let i = 0; i < 30; i++) {
      const dateStr = addCalendarDays(todayStr, -i)
      // Noon UTC keeps the same calendar day when formatted for display.
      const d = new Date(`${dateStr}T12:00:00Z`)

      const data = Array.isArray(calendarDays)
        ? calendarDays.find((cd) => cd && cd.register_date === dateStr)
        : null

      rows.push({
        date: dateStr,
        isToday: i === 0,
        weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        dayNum: d.getDate(),
        month: d.toLocaleDateString('fr-FR', { month: 'short' }),
        data: data || null,
        expectedBalance: data
          ? Number(data.opening_balance || 0) + Number(data.total_cash_in || 0) - Number(data.total_cash_out || 0)
          : null,
        closingVariance: data?.is_closed
          ? Number(data.closing_balance || 0) - (Number(data.opening_balance || 0) + Number(data.total_cash_in || 0) - Number(data.total_cash_out || 0))
          : null,
      })
    }

    // The check the calendar hid: today's opening should equal
    // yesterday's closing. Anywhere it doesn't, cash moved without being
    // recorded — which is the single thing this page exists to catch.
    for (let i = 0; i < rows.length - 1; i++) {
      const cur = rows[i].data
      const prev = rows[i + 1].data
      if (!cur || !prev) continue
      const gap = (cur.opening_balance || 0) - (prev.closing_balance || 0)
      rows[i].carryGap = gap
    }

    return rows
  }, [calendarDays])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1500px] space-y-5 pb-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Cash management</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl"><Vault size={25} className="text-primary" /> Coffre Forte</h1>
            <p className="mt-1 text-sm text-gray-500">Track today’s cash, reconcile the register, and review previous days.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 text-right text-[11px] leading-tight text-gray-400" aria-live="polite">
              <span className="block">Auto-sync · 30 min</span>
              <span className="block">{lastSyncedAt ? `Updated ${lastSyncedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Syncing…'}</span>
            </div>
            <button type="button" onClick={() => { void refresh() }} title="Refresh cash register data" aria-label="Refresh cash register data"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage-dark/70 bg-white px-3.5 text-sm font-semibold text-gray-600 transition hover:border-primary/25 hover:text-primary">
              <RefreshCw size={15} />Refresh
            </button>
            {hasClosing && (
              <button type="button" onClick={handlePrintDailyReport}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage-dark/70 bg-white px-3.5 text-sm font-semibold text-gray-600 transition hover:border-primary/25 hover:text-primary">
                <Printer size={16} />Print report
              </button>
            )}
            <button type="button" onClick={() => { setInitialTransactionType('cash_in'); setShowAddTransactionModal(true) }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
              <Plus size={17} />Add transaction
            </button>
          </div>
        </header>

        <section aria-label="Today’s register summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-subtle text-primary"><Unlock size={18} /></span>
              <div><p className="text-sm font-semibold text-gray-800">Opening balance</p><p className="text-xs text-gray-400">Cash counted at start</p></div>
            </div>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{hasOpening ? `${openingBalance.toLocaleString('fr-FR')} DA` : 'Not set'}</p>
          </div>

          <button type="button" onClick={() => setShowCashInModal(true)} className="group rounded-2xl border border-sage-dark/70 bg-white p-4 text-left shadow-sm transition hover:border-accent/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-subtle text-accent"><TrendingUp size={18} /></span>
              <div><p className="text-sm font-semibold text-gray-800">Cash in</p><p className="text-xs text-gray-400">Order payments + entries</p></div>
              <ChevronRight size={16} className="ml-auto text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
            <p className="text-2xl font-semibold tabular-nums text-primary">{todayCashIn.toLocaleString('fr-FR')} DA</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-sage/50 px-2 py-1 text-[10px] font-medium text-gray-600">Cash {todayCashInByMethod.cash.toLocaleString('fr-FR')}</span>
              <span className="rounded-lg bg-sage/50 px-2 py-1 text-[10px] font-medium text-gray-600">BaridiMob {todayCashInByMethod.baridimob.toLocaleString('fr-FR')}</span>
              {todayCashInByMethod.usd > 0 && <span className="rounded-lg bg-sage/50 px-2 py-1 text-[10px] font-medium text-gray-600">USDT {todayCashInByMethod.usd.toLocaleString('fr-FR')}</span>}
            </div>
          </button>

          <button type="button" onClick={() => setShowCashOutModal(true)} className="group rounded-2xl border border-sage-dark/70 bg-white p-4 text-left shadow-sm transition hover:border-danger/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger-subtle text-danger"><TrendingDown size={18} /></span>
              <div><p className="text-sm font-semibold text-gray-800">Cash out</p><p className="text-xs text-gray-400">Expenses and withdrawals</p></div>
              <ChevronRight size={16} className="ml-auto text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-danger" />
            </div>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{todayCashOut.toLocaleString('fr-FR')} DA</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-sage/50 px-2 py-1 text-[10px] font-medium text-gray-600">Cash {todayCashOutByMethod.cash.toLocaleString('fr-FR')}</span>
              {todayCashOutByMethod.baridimob > 0 && <span className="rounded-lg bg-sage/50 px-2 py-1 text-[10px] font-medium text-gray-600">BaridiMob {todayCashOutByMethod.baridimob.toLocaleString('fr-FR')}</span>}
              {todayCashOutByMethod.usd > 0 && <span className="rounded-lg bg-sage/50 px-2 py-1 text-[10px] font-medium text-gray-600">USDT {todayCashOutByMethod.usd.toLocaleString('fr-FR')}</span>}
            </div>
          </button>

          <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${hasClosing ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-primary-subtle'}`}>
            <div className="mb-3 flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${hasClosing ? 'bg-white/15 text-white' : 'bg-white text-primary'}`}><Lock size={18} /></span>
              <div><p className={`text-sm font-semibold ${hasClosing ? 'text-white' : 'text-primary'}`}>{hasClosing ? 'Closing balance' : 'Expected balance'}</p><p className={`text-xs ${hasClosing ? 'text-white/70' : 'text-primary/70'}`}>{hasClosing ? 'Counted at close' : hasOpening ? 'Opening + in − out' : 'Set opening to begin'}</p></div>
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${hasClosing ? 'text-white' : 'text-primary'}`}>{hasOpening ? `${(hasClosing ? closingBalance : computedBalance).toLocaleString('fr-FR')} DA` : '—'}</p>
            <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${hasClosing ? 'bg-white/15 text-white' : hasOpening ? 'bg-white text-primary' : 'bg-warning-subtle text-warning'}`}><span className={`h-1.5 w-1.5 rounded-full ${hasClosing ? 'bg-white' : hasOpening ? 'bg-accent' : 'bg-warning'}`} />{hasClosing ? 'Register closed' : hasOpening ? 'Register open' : 'Opening required'}</span>
          </div>
        </section>

        {!hasOpening && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/20 bg-warning-subtle/60 p-4">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-warning"><Unlock size={18} /></span><div><p className="text-sm font-semibold text-gray-800">Start today’s register</p><p className="text-xs text-gray-600">Record the cash you counted before beginning sales.</p></div></div>
            <button type="button" onClick={() => { setInitialTransactionType('opening'); setShowAddTransactionModal(true) }} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-dark">Set opening balance</button>
          </div>
        )}

        {!hasClosing && hasOpening && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent-subtle/40 p-4">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-accent"><Lock size={18} /></span><div><p className="text-sm font-semibold text-gray-800">Ready to reconcile?</p><p className="text-xs text-gray-600">Expected in register: <strong className="tabular-nums">{computedBalance.toLocaleString('fr-FR')} DA</strong></p></div></div>
            <button type="button" onClick={() => setShowClosingModal(true)} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-dark">Count and close</button>
          </div>
        )}

        {hasClosing && afterHoursOrders.length > 0 && (
          <button type="button" onClick={() => setShowCashInModal(true)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-subtle p-4 text-left transition hover:border-primary/40">
            <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-primary"><Clock size={17} /></span><span><span className="block text-sm font-semibold text-primary">After-close orders are ready for tomorrow</span><span className="mt-0.5 block text-xs text-gray-600">{afterHoursOrders.length} order{afterHoursOrders.length === 1 ? '' : 's'} created after closing · view the payment and time details</span></span></span><ChevronRight size={17} className="text-primary" />
          </button>
        )}

        <section className="overflow-hidden rounded-2xl border border-sage-dark/70 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sage-dark/70 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-subtle text-primary"><Calendar size={16} /></span>
              <div><h3 className="text-sm font-semibold text-gray-900">Register history</h3><p className="text-xs text-gray-500">Last 30 days · compare yesterday’s close with today’s opening</p></div>
            </div>
            <span className="text-xs text-gray-400">Select a day to inspect transactions</span>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-sage-dark">
                <th className="px-4 py-2 text-left"><span className="label-section">Day</span></th>
                <th className="px-4 py-2 text-right"><span className="label-section">Opening</span></th>
                <th className="px-4 py-2 text-right"><span className="label-section">In</span></th>
                <th className="px-4 py-2 text-right"><span className="label-section">Out</span></th>
                <th className="px-4 py-2 text-right"><span className="label-section">Expected</span></th>
                <th className="px-4 py-2 text-right"><span className="label-section">Closing</span></th>
                <th className="px-4 py-2 text-right w-[130px]"><span className="label-section">Carry</span></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-sage-dark">
              {ledger.map((row) => {
                const d = row.data
                const gap = row.carryGap

                return (
                  <tr
                    key={row.date}
                    onClick={() => openDayDetail(row.date, d)}
                    className={`cursor-pointer transition-colors hover:bg-sage/50 ${
                      row.isToday ? 'bg-primary-subtle/50' : ''
                    } ${!d ? 'opacity-40' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900">
                          {row.weekday} {row.dayNum} {row.month}
                        </span>
                        {row.isToday && <span className="pill pill-info">Today</span>}
                        {d?.is_closed && !row.isToday && (
                          <span className="pill pill-neutral">Closed</span>
                        )}
                      </div>
                    </td>

                    {/* One colour for the figures. Colour is reserved for
                        the carry mismatch, which is the only thing on
                        this table that needs acting on. */}
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600 tabular">
                      {d ? (d.opening_balance || 0).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-700 tabular">
                      {d ? '+' + (d.total_cash_in || 0).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-700 tabular">
                      {d ? '−' + (d.total_cash_out || 0).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 tabular">
                      {d ? row.expectedBalance.toLocaleString('fr-FR') : '—'}
                      {row.closingVariance !== null && row.closingVariance !== 0 && <span className={`ml-1 text-[10px] ${row.closingVariance > 0 ? 'text-amber-700' : 'text-red-700'}`} title="Counted closing minus calculated expected">({row.closingVariance > 0 ? '+' : ''}{row.closingVariance.toLocaleString('fr-FR')})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 tabular">
                      {d ? (d.closing_balance || 0).toLocaleString('fr-FR') : '—'}
                    </td>

                    {/* The check the calendar made impossible: this day's
                        opening against yesterday's closing. They should
                        be identical. Any day they aren't, cash moved
                        without being recorded. */}
                    <td className="px-4 py-2.5 text-right">
                      {gap == null ? (
                        <span className="text-2xs text-gray-300">—</span>
                      ) : gap === 0 ? (
                        <span className="text-2xs text-gray-400">ok</span>
                      ) : (
                        <span className={`pill ${gap > 0 ? 'pill-warning' : 'pill-danger'}`}>
                          {gap > 0 ? '+' : ''}{gap.toLocaleString('fr-FR')}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </section>
      </main>

      <AddTransactionModal isOpen={showAddTransactionModal} onClose={() => setShowAddTransactionModal(false)} onSubmit={handleAddTransaction} submitting={submitting} initialType={initialTransactionType} />
      <CashInModal isOpen={showCashInModal} onClose={() => setShowCashInModal(false)} cashInTransactions={cashInTransactions} todayCashIn={todayCashIn} linkedOrders={linkedOrders} afterHoursOrders={afterHoursOrders} />
      <CashOutModal isOpen={showCashOutModal} onClose={() => setShowCashOutModal(false)} transactions={transactions} todayCashOutByMethod={todayCashOutByMethod} addExpense={addExpense} refresh={refresh} />
      <ClosingBalanceModal isOpen={showClosingModal} onClose={() => setShowClosingModal(false)} computedBalance={computedBalance} openingBalance={openingBalance} todayCashIn={todayCashIn} todayCashOut={todayCashOut} todayCashInByMethod={todayCashInByMethod} todayCashOutByMethod={todayCashOutByMethod} setClosingBalance={setClosingBalance} refresh={refresh} />

      {activePanel === 'day-detail' && selectedDate && (
        <div className="fixed inset-0 z-50 flex scrim-enter">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setActivePanel(null)} />
          <div className="fixed inset-y-0 right-0 flex w-full max-w-2xl transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sage-dark/70 bg-sage/20 p-4">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-gray-600" />
                <h3 className="font-semibold text-gray-900">{new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                {selectedDayData?.is_closed ? (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Closed</span>
                ) : selectedDate === localDate() ? (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Open</span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Past</span>
                )}
              </div>
              <button onClick={() => setActivePanel(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100"><p className="text-xs text-gray-500 mb-1">Opening</p><p className="text-xl font-semibold text-emerald-800">{(selectedDayData?.opening_balance || 0).toLocaleString('fr-FR')} DA</p></div>
                <div className="bg-teal-50 rounded-lg p-4 border border-teal-100">
                  <p className="text-xs text-gray-500 mb-1">Cash In</p>
                  <p className="text-xl font-semibold text-teal-700">{(selectedDayData?.total_cash_in || 0).toLocaleString('fr-FR')} DA</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {dayCashInByMethod.cash > 0 && <span className="text-2xs bg-white/70 text-teal-800 px-2 py-0.5 rounded-full border border-teal-100">Cash {dayCashInByMethod.cash.toLocaleString('fr-FR')} DA</span>}
                    {dayCashInByMethod.baridimob > 0 && <span className="text-2xs bg-white/70 text-teal-800 px-2 py-0.5 rounded-full border border-teal-100">BaridiMob {dayCashInByMethod.baridimob.toLocaleString('fr-FR')} DA</span>}
                    {dayCashInByMethod.usd > 0 && <span className="text-2xs bg-white/70 text-teal-800 px-2 py-0.5 rounded-full border border-teal-100">USDT {dayCashInByMethod.usd.toLocaleString('fr-FR')} DA</span>}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                  <p className="text-xs text-gray-500 mb-1">Cash Out</p>
                  <p className="text-xl font-semibold text-red-700">{(selectedDayData?.total_cash_out || 0).toLocaleString('fr-FR')} DA</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {dayCashOutByMethod.cash > 0 && <span className="text-2xs bg-white/70 text-red-800 px-2 py-0.5 rounded-full border border-red-100">Cash {dayCashOutByMethod.cash.toLocaleString('fr-FR')} DA</span>}
                    {dayCashOutByMethod.baridimob > 0 && <span className="text-2xs bg-white/70 text-red-800 px-2 py-0.5 rounded-full border border-red-100">BaridiMob {dayCashOutByMethod.baridimob.toLocaleString('fr-FR')} DA</span>}
                    {dayCashOutByMethod.usd > 0 && <span className="text-2xs bg-white/70 text-red-800 px-2 py-0.5 rounded-full border border-red-100">USDT {dayCashOutByMethod.usd.toLocaleString('fr-FR')} DA</span>}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <p className="text-xs text-gray-500 mb-1">Expected (opening + in − out)</p>
                  <p className="text-xl font-semibold text-blue-900">{selectedDayExpected.toLocaleString('fr-FR')} DA</p>
                  {selectedDayData?.is_closed && <p className={`mt-1 text-xs font-medium ${selectedDayVariance === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Counted close {Number(selectedDayData.closing_balance || 0).toLocaleString('fr-FR')} DA · variance {selectedDayVariance > 0 ? '+' : ''}{selectedDayVariance.toLocaleString('fr-FR')} DA
                  </p>}
                </div>
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-100"><p className="text-xs text-gray-500 mb-1">Closing</p><p className="text-xl font-semibold text-gray-900">{(selectedDayData?.closing_balance || 0).toLocaleString('fr-FR')} DA</p></div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3"><Link2 size={18} className="text-teal-600" /><h4 className="text-sm font-semibold text-gray-700">Cash In — Order Payments</h4><span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">Linked</span></div>
                {(!dayOrders || dayOrders.length === 0) ? (
                  <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">No linked order payments for this day</div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    {dayOrders.map((order) => (
                      <div key={order.id} className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold bg-teal-100 text-teal-700 px-2 py-1 rounded">Order #{order.order_number || order.id?.slice(0, 8)}</span>
                            <span className="text-xs text-gray-500">{order.client_name}</span>
                            {order.order_type === 'quick_sale' && <span className="text-2xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Zap size={10} /> Quick Sale</span>}
                            {<span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : order.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{order.payment_status === 'paid' ? 'Completed' : order.payment_status === 'partial' ? 'Partial' : order.payment_status}</span>}
                          </div>
                          <span className="font-semibold text-teal-700 text-lg shrink-0">+{order.day_cash_entries?.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString('fr-FR')} DA</span>
                        </div>
                        <div className="space-y-1.5 pl-2 border-l-2 border-teal-100 mb-3">
                          <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">Payments this day</p>
                          {order.day_cash_entries?.map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <span className="text-teal-500">•</span>
                                <span>{entry.description || 'Payment'}</span>
                                <span className="text-2xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                  {entry.payment_method || 'cash'}
                                </span>
                                <span className="text-xs text-gray-400 font-mono">{entry.created_at ? new Date(entry.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                              </div>
                              <span className="font-medium text-teal-700">+{Number(entry.amount || 0).toLocaleString('fr-FR')} DA</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                          <span>Order Total: <span className="font-medium text-gray-700">{order.total_amount?.toLocaleString('fr-FR')} DA</span></span>
                          <span>Lifetime Paid: <span className="font-medium text-emerald-700">{order.amount_paid?.toLocaleString('fr-FR')} DA</span></span>
                          <span>Due: <span className="font-medium text-red-600">{Math.max(0, (order.total_amount || 0) - (order.amount_paid || 0)).toLocaleString('fr-FR')} DA</span></span>
                        </div>
                        {order.order_items && order.order_items.length > 0 && (
                          <div className="space-y-1.5 pl-2 border-l-2 border-gray-100 mt-3">
                            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">Items</p>
                            {order.order_items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm text-gray-600">
                                <div className="flex items-center gap-2"><span className="text-gray-400">•</span><span>{item.product_name || 'Unknown'}</span><span className="text-xs text-gray-400">× {item.quantity || 1}</span></div>
                                <span className="font-medium">{Number((item.unit_price || 0) * (item.quantity || 1)).toLocaleString('fr-FR')} DA</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {dayUnlinkedCashIn && dayUnlinkedCashIn.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3"><Unlink size={18} className="text-amber-600" /><h4 className="text-sm font-semibold text-gray-700">Cash In — Unlinked / Manual</h4><span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">No active order link</span></div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    {dayUnlinkedCashIn.map((tx) => (
                      <div key={tx.id} className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${/reversal/i.test(tx.category || '') ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{tx.category || 'Sales'}</span>
                            <span className="text-xs text-gray-400 font-mono">{tx.created_at ? new Date(tx.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            <span className="text-sm text-gray-600">{tx.description || 'Cash In'}</span>
                          </div>
                          <span className="font-semibold text-teal-700 text-lg">+{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span>
                        </div>
                        {tx.archived_order_link && <p className="mt-2 text-xs text-amber-700">Archived order is hidden; payment remains included in this day’s cash totals.</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3"><TrendingDown size={18} className="text-red-600" /><h4 className="text-sm font-semibold text-gray-700">Cash Out — Expenses</h4><span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Manual Entry</span></div>
                {(!dayTransactions || dayTransactions.filter(t => t.transaction_type === 'cash_out').length === 0) ? (
                  <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">No expenses for this day</div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    {dayTransactions.filter(t => t.transaction_type === 'cash_out').map((tx) => (
                      <div key={tx.id} className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><ArrowDownCircle size={18} /></div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 flex items-center gap-2">{tx.description || 'Expense'}{/reversal/i.test(tx.category || '') && <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-2xs font-semibold text-indigo-700">↩ Reversal</span>}</p>
                              <p className="text-xs text-gray-500">{tx.category || 'Other'}</p>
                              <p className="text-2xs text-gray-400 mt-0.5">
                                {/reversal/i.test(tx.category || '') ? 'Reversed to: ' : 'Paid from: '}<span className="font-medium text-gray-600">{tx.payment_method === 'baridimob' ? 'BaridiMob' : tx.payment_method === 'usd' ? 'USDT' : 'Cash'}</span>
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold text-red-700 text-lg">-{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span>
                        </div>
                        {(tx.quantity || tx.unit_price) && (
                          <div className="mt-2 ml-12 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span className="bg-gray-100 px-2 py-1 rounded">Item: <span className="font-medium text-gray-700">{tx.description}</span></span>
                            <span className="bg-gray-100 px-2 py-1 rounded">Qty: <span className="font-medium text-gray-700">{tx.quantity || 1}</span></span>
                            <span className="bg-gray-100 px-2 py-1 rounded">Unit: <span className="font-medium text-gray-700">{Number(tx.unit_price || 0).toLocaleString('fr-FR')} DA</span></span>
                            <span className="bg-red-50 px-2 py-1 rounded">Total: <span className="font-medium text-red-700">{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span></span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {dayReconcile && (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">Closing reconciliation by rail</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-2 font-semibold">Rail</th>
                        <th className="px-4 py-2 text-right font-semibold">Expected</th>
                        <th className="px-4 py-2 text-right font-semibold">Counted</th>
                        <th className="px-4 py-2 text-right font-semibold">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayReconcile.rails.map((r) => (
                        <tr key={r.key} className="border-t border-gray-50">
                          <td className="px-4 py-2 text-gray-700">{r.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-500">{r.expected.toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{r.counted.toLocaleString('fr-FR')}</td>
                          <td className={`px-4 py-2 text-right tabular-nums font-semibold ${r.diff === 0 ? 'text-gray-400' : r.diff > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{r.diff === 0 ? '—' : `${r.diff > 0 ? '+' : ''}${r.diff.toLocaleString('fr-FR')}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dayReconcile.banked > 0 && (
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-sm">
                      <span className="inline-flex items-center gap-2 text-gray-600"><span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-2xs font-semibold text-indigo-700">Banked overnight</span>Carried float</span>
                      <span className="tabular-nums text-gray-500">−{dayReconcile.banked.toLocaleString('fr-FR')} → <span className="font-semibold text-emerald-800">{dayReconcile.float.toLocaleString('fr-FR')} DA</span></span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {dayTransactions?.filter(t => t.transaction_type === 'opening').map(tx => (
                  <div key={tx.id} className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 flex items-center gap-3">
                    <Unlock size={16} className="text-emerald-600" />
                    <div><p className="text-xs text-gray-500">Opening Balance</p><p className="font-semibold text-emerald-800">{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</p></div>
                  </div>
                ))}
                {dayTransactions?.filter(t => t.transaction_type === 'closing').map(tx => (
                  <div key={tx.id} className="bg-amber-50 rounded-lg p-3 border border-amber-100 flex items-center gap-3">
                    <Lock size={16} className="text-amber-600" />
                    <div><p className="text-xs text-gray-500">Closing Balance</p><p className="font-semibold text-amber-800">{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default CoffreForte
