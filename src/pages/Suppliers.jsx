import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search, Plus, Trash2, Edit3, Phone, Mail, MapPin, Package,
  CheckCircle2, ChevronDown, ChevronUp, X, Building2,
  User, TrendingDown, RefreshCw, Banknote, AlertTriangle
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useSuppliers } from '../hooks/useSuppliers'
import { useProducts } from '../hooks/useProducts'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { useUndo } from '../context/UndoContext'
import { supabase } from '../lib/supabase'

const paymentStatusConfig = {
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Paid', dot: 'bg-emerald-500' },
  partial: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Partial', dot: 'bg-amber-500' },
  unpaid: { bg: 'bg-red-50', text: 'text-red-600', label: 'Unpaid', dot: 'bg-red-500' },
}

const transactionTypeConfig = {
  purchase: { icon: Package, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Purchase' },
  payment: { icon: Banknote, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Payment' },
}

function nowForInput() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
}

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function HighlightText({ text, query }) {
  if (!query || !text) return <span>{text}</span>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <span>
      {parts.map((part, index) => (
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 text-gray-900 rounded px-0.5">{part}</mark>
        ) : <span key={index}>{part}</span>
      ))}
    </span>
  )
}

function formatDateTime(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString('fr-FR')
}

function EntryEditModal({ entry, onClose, onSave, onVoid }) {
  const [quantity, setQuantity] = useState(entry.quantity ?? 0)
  const [unitCost, setUnitCost] = useState(entry.unit_cost ?? 0)
  const [notes, setNotes] = useState(entry.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const qty = Number(quantity) || 0
  const cost = Number(unitCost) || 0
  const newTotal = qty * cost
  const oldTotal = Number(entry.total_cost) || 0
  const stockDelta = qty - (Number(entry.quantity) || 0)

  const handleSave = async () => {
    setError('')
    if (qty <= 0) {
      setError('Quantity must be greater than zero. Void the entry instead.')
      return
    }
    setSaving(true)
    try {
      await onSave(entry.transaction_id, { quantity: qty, unitCost: cost, notes })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save the change.')
    } finally {
      setSaving(false)
    }
  }

  const handleVoid = async () => {
    setError('')
    setSaving(true)
    try {
      await onVoid(entry.transaction_id, voidReason)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not void the entry.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto scrim-enter" role="dialog" aria-modal="true" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto sheet-enter">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Correct this delivery</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {entry.products?.item_name || `Product #${entry.product_id}`} · entry #{entry.transaction_id}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        {error && <div role="alert" className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg"><p className="text-sm text-rose-700">{error}</p></div>}

        {confirmVoid ? (
          <div className="p-6">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={24} className="text-red-500" /></div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">Void this entry?</h3>
            <p className="text-sm text-gray-500 text-center mb-4">{entry.quantity} units will be removed from stock and {oldTotal.toLocaleString('fr-FR')} DA taken off what you owe. The record stays, marked void.</p>
            <input type="text" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Reason" className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm mb-5" />
            <div className="flex gap-3">
              <button onClick={() => setConfirmVoid(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">Back</button>
              <button onClick={handleVoid} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 disabled:opacity-50">{saving ? 'Voiding…' : 'Void entry'}</button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity</label>
                <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
                <p className="text-2xs text-gray-400 mt-1">was {entry.quantity}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Unit cost (DA)</label>
                <input type="number" min="0" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
                <p className="text-2xs text-gray-400 mt-1">was {Number(entry.unit_cost || 0).toLocaleString('fr-FR')}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
            </div>
            <div className="bg-cream rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">New total</span><span className="font-semibold text-gray-900">{newTotal.toLocaleString('fr-FR')} DA</span></div>
              {newTotal !== oldTotal && <div className="flex justify-between text-xs"><span className="text-gray-400">Change to what you owe</span><span className={newTotal > oldTotal ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>{newTotal > oldTotal ? '+' : ''}{(newTotal - oldTotal).toLocaleString('fr-FR')} DA</span></div>}
              {stockDelta !== 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Stock adjustment</span><span className={stockDelta > 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{stockDelta > 0 ? '+' : ''}{stockDelta} units</span></div>}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmVoid(true)} className="px-4 py-3 rounded-xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100">Void</button>
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">Cancel</button>
              <button onClick={handleSave} disabled={saving || (newTotal === oldTotal && notes === (entry.notes || ''))} className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-dark disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SupplierTransactions({ supplierId, canEdit, onUpdateEntry, onVoidEntry }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: purchases, error: purchasesError }, { data: payments, error: paymentsError }] = await Promise.all([
        supabase.from('supplier_transactions').select('*, products(item_name)').eq('supplier_id', supplierId).order('received_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
        supabase.from('supplier_payments').select('*').eq('supplier_id', supplierId).order('paid_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      ])

      if (purchasesError) throw purchasesError
      if (paymentsError) throw paymentsError

      const paymentRows = (payments || []).map((payment) => ({
        transaction_id: -payment.payment_id,
        supplier_id: payment.supplier_id,
        product_id: null,
        quantity: null,
        unit_cost: null,
        total_cost: payment.amount,
        amount_paid: payment.amount,
        payment_status: 'paid',
        notes: payment.notes,
        transaction_date: payment.paid_at || payment.created_at,
        created_at: payment.created_at,
        paid_at: payment.paid_at || payment.created_at,
        paid_by: payment.paid_by,
        payment_method: payment.payment_method || payment.method || 'cash',
        transaction_type: 'payment',
        voided_at: null,
        void_reason: null,
        products: null,
      }))

      const merged = [...(purchases || []), ...paymentRows].sort((a, b) => {
        const dateA = new Date(a.transaction_type === 'payment' ? a.paid_at || a.created_at : a.received_at || a.transaction_date || a.created_at)
        const dateB = new Date(b.transaction_type === 'payment' ? b.paid_at || b.created_at : b.received_at || b.transaction_date || b.created_at)
        return dateB - dateA
      })

      setTransactions(merged)
    } catch (error) {
      console.error('Supplier transaction fetch error:', error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
  if (transactions.length === 0) return <div className="p-6 text-center text-gray-400 text-sm"><Package size={24} className="mx-auto mb-2 opacity-30" />No transactions yet</div>

  return (
    <div className="divide-y divide-gray-50">
      {transactions.map((tx) => {
        const cfg = paymentStatusConfig[tx.payment_status] || paymentStatusConfig.unpaid
        const typeCfg = transactionTypeConfig[tx.transaction_type] || transactionTypeConfig.purchase
        const TypeIcon = typeCfg.icon
        const isPayment = tx.transaction_type === 'payment'

        return (
          <div key={tx.transaction_id} className={`px-4 py-3 flex items-center justify-between group ${tx.voided_at ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${typeCfg.bg} flex items-center justify-center`}><TypeIcon size={14} className={typeCfg.color} /></div>
              <div>
                {isPayment ? (
                  <>
                    <p className="text-sm font-medium text-emerald-700">Payment to Supplier</p>
                    <p className="text-2xs text-gray-400">{tx.payment_method || 'cash'}{tx.notes ? ` · ${tx.notes}` : ''}</p>
                    <p className="text-2xs text-gray-400">Paid: {formatDateTime(tx.paid_at || tx.created_at)}</p>
                    <p className="text-2xs text-gray-400">Recorded by: {tx.paid_by || 'Unknown'}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-800">{tx.products?.item_name || `Product #${tx.product_id}`}</p>
                    <p className={`text-2xs ${tx.voided_at ? 'text-gray-400 line-through' : 'text-gray-400'}`}>{tx.quantity} × {Number(tx.unit_cost || 0).toLocaleString('fr-FR')} DA = {Number(tx.total_cost || 0).toLocaleString('fr-FR')} DA</p>
                    <p className="text-2xs text-gray-400">Received: {formatDateTime(tx.received_at || tx.transaction_date || tx.created_at)}</p>
                    <p className="text-2xs text-gray-400">Recorded by: {tx.created_by || 'Unknown'}</p>
                    {tx.voided_at && <p className="text-2xs font-semibold uppercase tracking-wider text-rose-500 mt-0.5">Voided{tx.void_reason ? ` — ${tx.void_reason}` : ''}</p>}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                {isPayment ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold border bg-emerald-50 text-emerald-600"><Banknote size={10} />-{Number(tx.amount_paid || 0).toLocaleString('fr-FR')} DA</span>
                ) : (
                  <>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold border ${cfg.bg} ${cfg.text}`}><div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
                    <p className="text-xs text-gray-500 mt-1">Paid: {Number(tx.amount_paid || 0).toLocaleString('fr-FR')} / {Number(tx.total_cost || 0).toLocaleString('fr-FR')} DA</p>
                  </>
                )}
              </div>
              {canEdit && !isPayment && !tx.voided_at && <button onClick={() => setEditing(tx)} title="Correct this delivery" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-primary hover:bg-primary/5 opacity-0 group-hover:opacity-100 transition-all"><Edit3 size={14} /></button>}
            </div>
          </div>
        )
      })}

      {editing && <EntryEditModal entry={editing} onClose={() => setEditing(null)} onSave={async (id, changes) => { await onUpdateEntry(id, changes); await fetchTransactions() }} onVoid={async (id, reason) => { await onVoidEntry(id, reason); await fetchTransactions() }} />}
    </div>
  )
}

function SupplierCard({ supplier, summary, isExpanded, onToggle, onEdit, onDelete, onReceiveStock, onPaySupplier, searchQuery, canEdit, onUpdateEntry, onVoidEntry }) {
  return (
    <div className={`bg-white rounded-xl border transition-all ${isExpanded ? 'border-primary/30 shadow-md ring-1 ring-primary/10' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={onToggle}>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Building2 size={20} className="text-primary" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate"><HighlightText text={supplier.company_name} query={searchQuery} /></h3>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {supplier.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} /><HighlightText text={supplier.phone} query={searchQuery} /></span>}
            {supplier.contact_person && <span className="text-xs text-gray-400 flex items-center gap-1"><User size={10} /><HighlightText text={supplier.contact_person} query={searchQuery} /></span>}
            {supplier.email && !supplier.phone && !supplier.contact_person && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} /><HighlightText text={supplier.email} query={searchQuery} /></span>}
          </div>
        </div>
        <div className="shrink-0">
          {summary.totalDue > 0 ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold bg-red-50 text-red-600 border border-red-200"><TrendingDown size={11} />{summary.totalDue.toLocaleString('fr-FR')} DA due</span> : summary.totalOwed > 0 ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle2 size={11} />Paid</span> : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold bg-gray-50 text-gray-400 border border-gray-200">No transactions</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(event) => { event.stopPropagation(); onEdit(supplier) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"><Edit3 size={14} /></button>
          <button onClick={(event) => { event.stopPropagation(); onDelete(supplier) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/50">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-3">
              <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Profile</h4>
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm"><Building2 size={14} className="text-gray-400" /><span className="font-medium text-gray-900">{supplier.company_name}</span></div>
                {supplier.contact_person && <div className="flex items-center gap-2 text-sm"><User size={14} className="text-gray-400" /><span className="text-gray-600">{supplier.contact_person}</span></div>}
                {supplier.phone && <div className="flex items-center gap-2 text-sm"><Phone size={14} className="text-gray-400" /><span className="text-gray-600">{supplier.phone}</span></div>}
                {supplier.email && <div className="flex items-center gap-2 text-sm"><Mail size={14} className="text-gray-400" /><span className="text-gray-600">{supplier.email}</span></div>}
                {supplier.address && <div className="flex items-center gap-2 text-sm"><MapPin size={14} className="text-gray-400" /><span className="text-gray-600">{supplier.address}</span></div>}
                {supplier.notes && <div className="pt-2 border-t border-gray-100"><p className="text-xs text-gray-500 italic">"{supplier.notes}"</p></div>}
              </div>
              <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Balance</h4>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Total Purchases</span><span className="font-semibold">{summary.totalOwed.toLocaleString('fr-FR')} DA</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Total Paid</span><span className="font-semibold text-emerald-600">{summary.totalPaid.toLocaleString('fr-FR')} DA</span></div>
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-200"><span className={summary.totalDue > 0 ? 'text-red-600' : 'text-gray-900'}>Amount Due</span><span className={summary.totalDue > 0 ? 'text-red-600' : 'text-gray-900'}>{summary.totalDue.toLocaleString('fr-FR')} DA</span></div>
                {summary.credit > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Credit</span><span className="font-semibold text-amber-600">{summary.credit.toLocaleString('fr-FR')} DA</span></div>}
              </div>
            </div>
            <div className="col-span-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Package size={12} /> Transactions</h4>
                <div className="flex items-center gap-2">
                  <button onClick={() => onPaySupplier(supplier)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"><Banknote size={12} /> Pay Supplier</button>
                  <button onClick={() => onReceiveStock(supplier)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-dark"><Plus size={12} /> Receive Stock</button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><SupplierTransactions supplierId={supplier.supplier_id} canEdit={canEdit} onUpdateEntry={onUpdateEntry} onVoidEntry={onVoidEntry} /></div>
            </div>
            <div className="col-span-3">
              <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h4>
              <div className="space-y-2">
                <button onClick={() => onReceiveStock(supplier)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"><Package size={14} /> Receive Products</button>
                {summary.totalDue > 0 && <button onClick={() => onPaySupplier(supplier)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"><Banknote size={14} /> Pay {summary.totalDue.toLocaleString('fr-FR')} DA</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SupplierModal({ supplier, onClose, onSave }) {
  const [form, setForm] = useState({
    company_name: supplier?.company_name || '',
    contact_person: supplier?.contact_person || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.company_name.trim()) return
    await onSave(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 scrim-enter">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 sheet-enter">
        <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-semibold text-gray-900">{supplier ? 'Edit Supplier' : 'Add Supplier'}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Company Name *</label><input type="text" value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required /></div>
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Contact Person</label><input type="text" value={form.contact_person} onChange={(event) => setForm({ ...form, contact_person: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Phone</label><input type="text" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div><div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Email</label><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div></div>
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Address</label><input type="text" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div>
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none" /></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button><button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark">{supplier ? 'Save' : 'Add'}</button></div>
        </form>
      </div>
    </div>
  )
}

function ReceiveStockModal({ supplier, products, onClose, onSave }) {
  const [items, setItems] = useState([{ _key: 1, product_id: '', quantity: '', unit_cost: '', notes: '' }])
  const [batchNotes, setBatchNotes] = useState('')
  const [receivedAt, setReceivedAt] = useState(nowForInput())
  const [paidNow, setPaidNow] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [nextKey, setNextKey] = useState(2)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addItem = () => {
    setItems((previous) => [...previous, { _key: nextKey, product_id: '', quantity: '', unit_cost: '', notes: '' }])
    setNextKey((key) => key + 1)
  }

  const removeItem = (_key) => {
    if (items.length <= 1) return
    setItems((previous) => previous.filter((item) => item._key !== _key))
  }

  const updateItem = (_key, field, value) => {
    setItems((previous) => previous.map((item) => item._key === _key ? { ...item, [field]: value } : item))
  }

  const lineTotal = (item) => (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)
  const validItems = items.filter((item) => item.product_id && Number(item.quantity) > 0 && Number(item.unit_cost) >= 0)
  const grandTotal = items.reduce((sum, item) => sum + lineTotal(item), 0)
  const paidAmount = Number(paidNow) || 0
  const remainingDue = Math.max(0, grandTotal - paidAmount)
  const credit = Math.max(0, paidAmount - grandTotal)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (validItems.length === 0) {
      setError('Add at least one valid product line.')
      return
    }
    if (paidAmount < 0 || paidAmount > grandTotal) {
      setError('Paid now cannot be greater than the delivery total.')
      return
    }

    setSaving(true)
    try {
      await onSave({
        supplierId: supplier.supplier_id,
        items: validItems.map((item) => ({ productId: Number(item.product_id), quantity: Number(item.quantity), unitCost: Number(item.unit_cost), notes: item.notes || batchNotes })),
        batchNotes,
        receivedAt: new Date(receivedAt).toISOString(),
        paidNow: paidAmount,
        paymentMethod,
        paymentNotes,
      })
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Could not record the delivery.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 scrim-enter">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto sheet-enter">
        <div className="flex items-center justify-between mb-5"><div><h3 className="text-lg font-semibold text-gray-900">Receive from {supplier.company_name}</h3><p className="text-xs text-gray-400 mt-0.5">Record delivery, payment, date, and calculator result</p></div><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={18} /></button></div>
        {error && <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item._key} className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between"><span className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">Item #{index + 1}</span>{items.length > 1 && <button type="button" onClick={() => removeItem(item._key)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 size={12} /> Remove</button>}</div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6"><label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Product *</label><select value={item.product_id} onChange={(event) => updateItem(item._key, 'product_id', event.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} (Stock: {product.stock_quantity})</option>)}</select></div>
                  <div className="col-span-3"><label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Qty *</label><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item._key, 'quantity', event.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required /></div>
                  <div className="col-span-3"><label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Unit Cost *</label><input type="number" min="0" step="1" value={item.unit_cost} onChange={(event) => updateItem(item._key, 'unit_cost', event.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required /></div>
                </div>
                <div className="flex items-center justify-between"><input type="text" value={item.notes} onChange={(event) => updateItem(item._key, 'notes', event.target.value)} placeholder="Line notes (optional)..." className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none mr-3" />{item.quantity && item.unit_cost && <span className="text-sm font-semibold text-primary whitespace-nowrap">{lineTotal(item).toLocaleString('fr-FR')} DA</span>}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-medium hover:border-primary hover:text-primary flex items-center justify-center gap-2"><Plus size={16} /> Add Another Product</button>
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Batch Notes</label><input type="text" value={batchNotes} onChange={(event) => setBatchNotes(event.target.value)} placeholder="Invoice number or delivery note" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Received date and time</label><input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Paid now (DA)</label><input type="number" min="0" max={grandTotal} step="1" value={paidNow} onChange={(event) => setPaidNow(event.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div>
          </div>
          {paidAmount > 0 && <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Payment method</label><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"><option value="cash">Cash</option><option value="transfer">Bank transfer</option><option value="cheque">Cheque</option></select></div><div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Payment note</label><input type="text" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Reference or cheque number" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></div></div>}
          <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium text-gray-700">Grand Total</span><span className="text-xl font-bold text-primary">{grandTotal.toLocaleString('fr-FR')} DA</span></div><div className="flex items-center justify-between text-sm"><span className="text-gray-500">Paid now</span><span className="font-semibold text-emerald-600">{paidAmount.toLocaleString('fr-FR')} DA</span></div><div className="flex items-center justify-between text-sm border-t border-primary/10 pt-2"><span className="font-semibold text-gray-700">Remaining due</span><span className="font-bold text-red-600">{remainingDue.toLocaleString('fr-FR')} DA</span></div>{credit > 0 && <div className="text-xs font-semibold text-amber-600">Credit: {credit.toLocaleString('fr-FR')} DA</div>}</div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button><button type="submit" disabled={saving || validItems.length === 0} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark flex items-center justify-center gap-2 disabled:opacity-50"><Package size={14} />{saving ? 'Saving…' : `Receive ${validItems.length} Product${validItems.length !== 1 ? 's' : ''}`}</button></div>
        </form>
      </div>
    </div>
  )
}

function PaySupplierModal({ supplier, summary, onClose, onSave }) {
  const [form, setForm] = useState({ amount: summary.totalDue > 0 ? String(summary.totalDue) : '', notes: '', method: 'cash' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const amount = Number(form.amount) || 0
  const remainingAfterPayment = Math.max(0, summary.totalDue - amount)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!(amount > 0) || amount > summary.totalDue) {
      setError('Payment must be greater than zero and cannot exceed the amount due.')
      return
    }
    setSaving(true)
    try {
      await onSave({ supplierId: supplier.supplier_id, amount, notes: form.notes, method: form.method })
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Could not record the payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 scrim-enter">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 sheet-enter">
        <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-semibold text-gray-900">Pay {supplier.company_name}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={18} /></button></div>
        {error && <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2"><div className="flex justify-between text-xs text-gray-500"><span>Total Purchases</span><span className="font-medium text-gray-900">{summary.totalOwed.toLocaleString('fr-FR')} DA</span></div><div className="flex justify-between text-xs text-gray-500"><span>Already Paid</span><span className="font-medium text-emerald-600">{summary.totalPaid.toLocaleString('fr-FR')} DA</span></div><div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-200"><span className="text-red-600">Amount Due</span><span className="text-red-600">{summary.totalDue.toLocaleString('fr-FR')} DA</span></div></div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Payment Amount (DA) *</label><input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none" min="1" max={summary.totalDue} required /></div>
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Payment method</label><select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"><option value="cash">Cash</option><option value="transfer">Bank transfer</option><option value="cheque">Cheque</option></select><p className="mt-1 text-[11px] text-gray-400">Blossom records the payment date and time when you save.</p></div>
          <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label><input type="text" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Invoice, transfer, or cheque reference" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none" /></div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex justify-between text-sm"><span className="text-gray-600">Remaining after payment</span><strong className="text-red-600">{remainingAfterPayment.toLocaleString('fr-FR')} DA</strong></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button><button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50"><Banknote size={14} />{saving ? 'Saving…' : 'Record Payment'}</button></div>
        </form>
      </div>
    </div>
  )
}

function Suppliers() {
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier, receiveStockBatch, paySupplier, updateEntry, voidEntry, getSupplierSummary, refresh } = useSuppliers()
  const { products } = useProducts()
  const { addNotification } = useNotification()
  const { role } = useAuth()
  useUndo()
  const canEdit = role === 'owner' || role === 'manager'

  const handleUpdateEntry = async (id, changes) => { await updateEntry(id, changes); addNotification('Delivery corrected', 'success') }
  const handleVoidEntry = async (id, reason) => { await voidEntry(id, reason); addNotification('Entry voided', 'success') }

  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery, 300)
  const [expandedSupplier, setExpandedSupplier] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveSupplier, setReceiveSupplier] = useState(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [paySupplierData, setPaySupplierData] = useState(null)

  const supplierSummaries = useMemo(() => {
    const map = {}
    suppliers.forEach((supplier) => { map[supplier.supplier_id] = getSupplierSummary(supplier.supplier_id) })
    return map
  }, [suppliers, getSupplierSummary])

  const filteredSuppliers = useMemo(() => {
    if (!debouncedQuery.trim()) return suppliers
    const query = debouncedQuery.toLowerCase()
    return suppliers.filter((supplier) => supplier.company_name?.toLowerCase().includes(query) || supplier.contact_person?.toLowerCase().includes(query) || supplier.phone?.toLowerCase().includes(query) || supplier.email?.toLowerCase().includes(query) || supplier.address?.toLowerCase().includes(query) || supplier.notes?.toLowerCase().includes(query))
  }, [suppliers, debouncedQuery])

  const totalDebt = useMemo(() => suppliers.reduce((sum, supplier) => sum + (supplierSummaries[supplier.supplier_id]?.totalDue || 0), 0), [suppliers, supplierSummaries])

  const handleSave = async (form) => {
    if (editingSupplier) {
      const success = await updateSupplier(editingSupplier.supplier_id, form)
      if (success) addNotification('Supplier updated', 'success')
    } else {
      const data = await addSupplier(form)
      if (data) addNotification('Supplier added', 'success')
    }
  }

  const handleDelete = async (supplier) => {
    const success = await deleteSupplier(supplier.supplier_id)
    if (success) {
      addNotification('Supplier deleted', 'success')
      if (expandedSupplier === supplier.supplier_id) setExpandedSupplier(null)
    }
  }

  const handleSaveStock = async ({ supplierId, items, batchNotes, receivedAt, paidNow, paymentMethod, paymentNotes }) => {
    const result = await receiveStockBatch(supplierId, items, batchNotes, receivedAt, paidNow, paymentMethod, paymentNotes)
    if (result) addNotification('Stock delivery recorded', 'success')
  }

  const handleSavePayment = async ({ supplierId, amount, notes, method }) => {
    const result = await paySupplier(supplierId, amount, notes, method)
    if (result) addNotification(`Recorded payment of ${amount.toLocaleString('fr-FR')} DA`, 'success')
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-gray-900">Suppliers</h1><p className="text-sm text-gray-400 mt-0.5">{suppliers.length} suppliers · {totalDebt.toLocaleString('fr-FR')} DA total debt</p></div><div className="flex items-center gap-2"><button onClick={refresh} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream text-gray-700 text-sm font-medium hover:bg-cream-dark border border-gray-200"><RefreshCw size={14} /> Refresh</button><button onClick={() => { setEditingSupplier(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark"><Plus size={18} /> Add Supplier</button></div></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4"><div className="relative max-w-xl"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, contact, phone, email, address, notes..." className="w-full pl-11 pr-10 py-3 rounded-xl bg-gray-50 border-0 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-shadow" />{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 flex items-center justify-center"><X size={14} /></button>}</div>{debouncedQuery && <p className="text-xs text-gray-400 mt-2 ml-1">{filteredSuppliers.length} result{filteredSuppliers.length !== 1 ? 's' : ''} for "<span className="font-medium text-gray-600">{debouncedQuery}</span>"</p>}</div>
        <div className="space-y-3">
          {loading ? <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div> : filteredSuppliers.length === 0 ? <div className="bg-cream rounded-2xl border border-gray-100 p-16 text-center"><Building2 size={32} className="mx-auto mb-3 text-gray-300" /><p className="text-gray-500 font-semibold">No suppliers found</p>{debouncedQuery && <p className="text-xs text-gray-400 mt-1">Try a different search term</p>}</div> : filteredSuppliers.map((supplier) => <SupplierCard key={supplier.supplier_id} supplier={supplier} summary={supplierSummaries[supplier.supplier_id]} isExpanded={expandedSupplier === supplier.supplier_id} onToggle={() => setExpandedSupplier(expandedSupplier === supplier.supplier_id ? null : supplier.supplier_id)} onEdit={(item) => { setEditingSupplier(item); setShowModal(true) }} onDelete={handleDelete} canEdit={canEdit} onUpdateEntry={handleUpdateEntry} onVoidEntry={handleVoidEntry} onReceiveStock={(item) => { setReceiveSupplier(item); setShowReceiveModal(true) }} onPaySupplier={(item) => { setPaySupplierData(item); setShowPayModal(true) }} searchQuery={debouncedQuery} />)}
        </div>
      </div>
      {showModal && <SupplierModal supplier={editingSupplier} onClose={() => setShowModal(false)} onSave={handleSave} />}
      {showReceiveModal && receiveSupplier && <ReceiveStockModal supplier={receiveSupplier} products={products} onClose={() => setShowReceiveModal(false)} onSave={handleSaveStock} />}
      {showPayModal && paySupplierData && <PaySupplierModal supplier={paySupplierData} summary={supplierSummaries[paySupplierData.supplier_id] || { totalOwed: 0, totalPaid: 0, totalDue: 0 }} onClose={() => setShowPayModal(false)} onSave={handleSavePayment} />}
    </DashboardLayout>
  )
}

export default Suppliers
