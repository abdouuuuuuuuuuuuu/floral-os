import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Trash2, Edit3, Phone, Mail, MapPin, Package,
  DollarSign, AlertTriangle, CheckCircle2, XCircle, ChevronDown,
  ChevronUp, X, Building2, User, Calendar, TrendingDown, Wallet,
  ArrowRight, RefreshCw, Banknote, CreditCard
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useSuppliers } from '../hooks/useSuppliers'
import { useProducts } from '../hooks/useProducts'
import { useNotification } from '../context/NotificationContext'
import { supabase } from '../lib/supabase'

const paymentStatusConfig = {
  paid:     { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Paid', dot: 'bg-emerald-500' },
  partial:  { bg: 'bg-amber-50',  text: 'text-amber-600',  label: 'Partial', dot: 'bg-amber-500' },
  unpaid:   { bg: 'bg-red-50',    text: 'text-red-600',    label: 'Unpaid', dot: 'bg-red-500' },
}

const transactionTypeConfig = {
  purchase: { icon: Package, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Purchase' },
  payment:  { icon: Banknote, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Payment' },
}

// ─── SUPPLIER TRANSACTIONS ────────────────────────────────────────
function SupplierTransactions({ supplierId }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('supplier_transactions')
        .select('*, products(item_name)')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
      setTransactions(data || [])
    } catch (e) {
      console.error('Fetch error:', e)
      setTransactions([])
    }
    setLoading(false)
  }, [supplierId])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
  if (transactions.length === 0) return (
    <div className="p-6 text-center text-gray-400 text-sm">
      <Package size={24} className="mx-auto mb-2 opacity-30" />
      No transactions yet
    </div>
  )

  return (
    <div className="divide-y divide-gray-50">
      {transactions.map((tx) => {
        const cfg = paymentStatusConfig[tx.payment_status] || paymentStatusConfig.unpaid
        const typeCfg = transactionTypeConfig[tx.transaction_type] || transactionTypeConfig.purchase
        const TypeIcon = typeCfg.icon

        return (
          <div key={tx.transaction_id} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${typeCfg.bg} flex items-center justify-center`}>
                <TypeIcon size={14} className={typeCfg.color} />
              </div>
              <div>
                {tx.transaction_type === 'purchase' ? (
                  <>
                    <p className="text-sm font-medium text-gray-800">{tx.products?.item_name || `Product #${tx.product_id}`}</p>
                    <p className="text-[11px] text-gray-400">
                      {tx.quantity} x {tx.unit_cost?.toLocaleString('fr-FR')} DA = {tx.total_cost?.toLocaleString('fr-FR')} DA
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-emerald-700">Payment to Supplier</p>
                    <p className="text-[11px] text-gray-400">{tx.notes || 'No notes'}</p>
                  </>
                )}
                <p className="text-[10px] text-gray-400">{new Date(tx.transaction_date).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
            <div className="text-right">
              {tx.transaction_type === 'purchase' ? (
                <>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    Paid: {tx.amount_paid?.toLocaleString('fr-FR')} / {tx.total_cost?.toLocaleString('fr-FR')} DA
                  </p>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-600">
                  <Banknote size={10} />
                  -{tx.amount_paid?.toLocaleString('fr-FR')} DA
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── SUPPLIER CARD ────────────────────────────────────────────────
function SupplierCard({ supplier, summary, isExpanded, onToggle, onEdit, onDelete, onReceiveStock, onPaySupplier }) {
  return (
    <div className={`bg-white rounded-xl border transition-all ${
      isExpanded ? 'border-primary/30 shadow-md ring-1 ring-primary/10' : 'border-gray-100 hover:border-gray-200'
    }`}>
      {/* Card Header */}
      <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={onToggle}>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 size={20} className="text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm truncate">{supplier.company_name}</h3>
          <div className="flex items-center gap-3 mt-0.5">
            {supplier.phone && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Phone size={10} /> {supplier.phone}
              </span>
            )}
            {supplier.contact_person && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <User size={10} /> {supplier.contact_person}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {summary.totalDue > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">
              <TrendingDown size={11} />
              {summary.totalDue.toLocaleString('fr-FR')} DA due
            </span>
          ) : summary.totalOwed > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 size={11} /> Paid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-50 text-gray-400 border border-gray-200">
              No transactions
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit(supplier) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors">
            <Edit3 size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(supplier) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-danger hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/50">
          <div className="grid grid-cols-12 gap-6">
            {/* Left: Profile */}
            <div className="col-span-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Profile</h4>
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={14} className="text-gray-400" />
                  <span className="font-medium text-gray-900">{supplier.company_name}</span>
                </div>
                {supplier.contact_person && (
                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-gray-400" />
                    <span className="text-gray-600">{supplier.contact_person}</span>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={14} className="text-gray-400" />
                    <span className="text-gray-600">{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={14} className="text-gray-400" />
                    <span className="text-gray-600">{supplier.email}</span>
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={14} className="text-gray-400" />
                    <span className="text-gray-600">{supplier.address}</span>
                  </div>
                )}
                {supplier.notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 italic">"{supplier.notes}"</p>
                  </div>
                )}
              </div>

              <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Balance</h4>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Total Purchases</span>
                  <span className="font-semibold">{summary.totalOwed.toLocaleString('fr-FR')} DA</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Total Paid</span>
                  <span className="font-semibold text-emerald-600">{summary.totalPaid.toLocaleString('fr-FR')} DA</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                  <span className={summary.totalDue > 0 ? 'text-red-600' : 'text-gray-900'}>Amount Due</span>
                  <span className={summary.totalDue > 0 ? 'text-red-600' : 'text-gray-900'}>{summary.totalDue.toLocaleString('fr-FR')} DA</span>
                </div>
              </div>
            </div>

            {/* Middle: Transactions */}
            <div className="col-span-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Package size={12} /> Transactions
                </h4>
                <div className="flex items-center gap-2">
                  <button onClick={() => onPaySupplier(supplier)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors">
                    <Banknote size={12} /> Pay Supplier
                  </button>
                  <button onClick={() => onReceiveStock(supplier)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors">
                    <Plus size={12} /> Receive Stock
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <SupplierTransactions supplierId={supplier.supplier_id} />
              </div>
            </div>

            {/* Right: Quick Actions */}
            <div className="col-span-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h4>
              <div className="space-y-2">
                <button onClick={() => onReceiveStock(supplier)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">
                  <Package size={14} /> Receive Products
                </button>
                {summary.totalDue > 0 && (
                  <button onClick={() => onPaySupplier(supplier)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
                    <Banknote size={14} /> Pay {summary.totalDue.toLocaleString('fr-FR')} DA
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MODALS ──────────────────────────────────────────────────────
function SupplierModal({ supplier, onClose, onSave }) {
  const [form, setForm] = useState({
    company_name: supplier?.company_name || '',
    contact_person: supplier?.contact_person || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.company_name.trim()) return
    onSave(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">{supplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Company Name *</label>
            <input type="text" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Contact Person</label>
            <input type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark">{supplier ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ReceiveStockModal({ supplier, products, onClose, onSave }) {
  const [form, setForm] = useState({ product_id: '', quantity: '', unit_cost: '', notes: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.product_id || !form.quantity || !form.unit_cost) return
    onSave({ supplierId: supplier.supplier_id, productId: parseInt(form.product_id), quantity: parseInt(form.quantity), unitCost: parseInt(form.unit_cost), notes: form.notes })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Receive from {supplier.company_name}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Product *</label>
            <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_quantity})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Quantity *</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" min="1" required />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Unit Cost (DA) *</label>
              <input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" min="1" required />
            </div>
          </div>
          {form.quantity && form.unit_cost && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-lg font-black text-primary">{(parseInt(form.quantity) * parseInt(form.unit_cost)).toLocaleString('fr-FR')} DA</p>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark">Receive</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── PAY SUPPLIER MODAL ──────────────────────────────────────────
function PaySupplierModal({ supplier, summary, onClose, onSave }) {
  const [form, setForm] = useState({ amount: '', notes: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) return
    onSave({ supplierId: supplier.supplier_id, amount, notes: form.notes })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Pay {supplier.company_name}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={18} /></button>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Total Purchases</span>
            <span className="font-medium text-gray-900">{summary.totalOwed.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Already Paid</span>
            <span className="font-medium text-emerald-600">{summary.totalPaid.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
            <span className="text-red-600">Amount Due</span>
            <span className="text-red-600">{summary.totalDue.toLocaleString('fr-FR')} DA</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Payment Amount (DA) *</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              min="1"
              max={summary.totalDue}
              placeholder={`Max: ${summary.totalDue.toLocaleString('fr-FR')} DA`}
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              placeholder="e.g. Bank transfer, Cash, Check #123..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2">
              <Banknote size={14} /> Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
function Suppliers() {
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier, receiveStock, paySupplier, getSupplierSummary, refresh } = useSuppliers()
  const { products } = useProducts()
  const { addNotification } = useNotification()

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSupplier, setExpandedSupplier] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveSupplier, setReceiveSupplier] = useState(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [paySupplierData, setPaySupplierData] = useState(null)

  const supplierSummaries = useMemo(() => {
    const map = {}
    suppliers.forEach(s => {
      map[s.supplier_id] = getSupplierSummary(s.supplier_id)
    })
    return map
  }, [suppliers, getSupplierSummary])

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers
    const q = searchQuery.toLowerCase()
    return suppliers.filter(s =>
      s.company_name?.toLowerCase().includes(q) ||
      s.contact_person?.toLowerCase().includes(q) ||
      s.phone?.includes(q)
    )
  }, [suppliers, searchQuery])

  const totalDebt = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (supplierSummaries[s.supplier_id]?.totalDue || 0), 0)
  }, [suppliers, supplierSummaries])

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
    if (!window.confirm(`Delete ${supplier.company_name}?`)) return
    const success = await deleteSupplier(supplier.supplier_id)
    if (success) {
      addNotification('Supplier deleted', 'success')
      if (expandedSupplier === supplier.supplier_id) setExpandedSupplier(null)
    }
  }

  const handleSaveStock = async ({ supplierId, productId, quantity, unitCost, notes }) => {
    const tx = await receiveStock(supplierId, productId, quantity, unitCost, notes)
    if (tx) addNotification(`Received ${quantity} units`, 'success')
  }

  const handleSavePayment = async ({ supplierId, amount, notes }) => {
    const tx = await paySupplier(supplierId, amount, notes)
    if (tx) addNotification(`Recorded payment of ${amount.toLocaleString('fr-FR')} DA`, 'success')
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Suppliers</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {suppliers.length} suppliers · {totalDebt.toLocaleString('fr-FR')} DA total debt
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream text-gray-700 text-sm font-medium hover:bg-cream-dark border border-gray-200">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={() => { setEditingSupplier(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark">
              <Plus size={18} /> Add Supplier
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search suppliers..." className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-gray-50 border-0 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="bg-cream rounded-2xl border border-gray-100 p-16 text-center">
              <Building2 size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-semibold">No suppliers found</p>
            </div>
          ) : (
            filteredSuppliers.map((supplier) => (
              <SupplierCard
                key={supplier.supplier_id}
                supplier={supplier}
                summary={supplierSummaries[supplier.supplier_id]}
                isExpanded={expandedSupplier === supplier.supplier_id}
                onToggle={() => setExpandedSupplier(expandedSupplier === supplier.supplier_id ? null : supplier.supplier_id)}
                onEdit={(s) => { setEditingSupplier(s); setShowModal(true) }}
                onDelete={handleDelete}
                onReceiveStock={(s) => { setReceiveSupplier(s); setShowReceiveModal(true) }}
                onPaySupplier={(s) => { setPaySupplierData(s); setShowPayModal(true) }}
              />
            ))
          )}
        </div>
      </div>

      {showModal && <SupplierModal supplier={editingSupplier} onClose={() => setShowModal(false)} onSave={handleSave} />}
      {showReceiveModal && <ReceiveStockModal supplier={receiveSupplier} products={products} onClose={() => setShowReceiveModal(false)} onSave={handleSaveStock} />}
      {showPayModal && (
        <PaySupplierModal
          supplier={paySupplierData}
          summary={supplierSummaries[paySupplierData.supplier_id]}
          onClose={() => setShowPayModal(false)}
          onSave={handleSavePayment}
        />
      )}
    </DashboardLayout>
  )
}

export default Suppliers