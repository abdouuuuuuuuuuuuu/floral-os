import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ChevronDown, ChevronUp, Package, Phone, Calendar, Clock,
  DollarSign, Trash2, AlertTriangle, ArrowUpDown, Eye, Printer, FileText,
  CheckCircle2, XCircle, Loader2, Bike, Truck, Store,
  Download, RefreshCw, X, Hash, CreditCard,
  TrendingUp, ShoppingBag, Layers, RotateCcw, Wallet, Banknote,
  Pencil
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useOrders } from '../hooks/useOrders'
import { useNotification } from '../context/NotificationContext'

const statusConfig = {
  new:        { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-600',     dot: 'bg-red-500',     label: 'New',        icon: AlertTriangle },
  processing: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-600',   dot: 'bg-amber-500',   label: 'Processing', icon: Loader2 },
  done:       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', dot: 'bg-emerald-500', label: 'Done',       icon: CheckCircle2 },
  cancelled:  { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-500',    dot: 'bg-gray-400',    label: 'Cancelled',  icon: XCircle },
}

const paymentStatusConfig = {
  paid:     { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', dot: 'bg-emerald-500', label: 'Paid' },
  partial:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-600',  dot: 'bg-amber-500',  label: 'Partial' },
  unpaid:   { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-600',    dot: 'bg-red-500',    label: 'Unpaid' },
  refunded: { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-500',   dot: 'bg-gray-400',   label: 'Refunded' },
}

const paymentConfig = {
  cash:      { label: 'Cash',      icon: DollarSign },
  baridimob: { label: 'BaridiMob', icon: CreditCard },
  usd:       { label: 'USD',       icon: DollarSign },
}

const deliveryConfig = {
  motorcycle: { label: 'Motorcycle', icon: Bike,  color: 'text-blue-500',  bg: 'bg-blue-50' },
  dhd:        { label: 'DHD',        icon: Truck, color: 'text-purple-500', bg: 'bg-purple-50' },
  pickup:     { label: 'Pickup',     icon: Store, color: 'text-teal-500',  bg: 'bg-teal-50' },
}

const sourceConfig = {
  instagram: { label: 'Instagram', color: 'text-pink-500' },
  whatsapp:  { label: 'WhatsApp',  color: 'text-green-500' },
  phone:     { label: 'Phone',     color: 'text-blue-500' },
  facebook:  { label: 'Facebook',  color: 'text-blue-600' },
  inhouse:   { label: 'In-House',  color: 'text-gray-500' },
}

function PaymentPanel({ order, onClose, onMarkAsPaid, onRecordPartial, onRefund }) {
  const [activeTab, setActiveTab] = useState('partial')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  const remaining = order.total_amount - (order.amount_paid || 0)
  const maxRefund = order.amount_paid || 0

  const handleSubmit = () => {
    const val = parseInt(amount)
    if (!val || val <= 0) return

    if (activeTab === 'paid') {
      onMarkAsPaid(order.id)
    } else if (activeTab === 'partial') {
      const paymentAmount = Math.min(val, remaining)
      onRecordPartial(order.id, paymentAmount, notes || `Partial payment: ${paymentAmount} DA`)
    } else if (activeTab === 'refund') {
      const refundAmount = Math.min(val, maxRefund)
      onRefund(order.id, refundAmount, notes || `Refund: ${refundAmount} DA`)
    }
    onClose()
  }

  const tabs = order.payment_status === 'paid'
    ? [{ id: 'refund', label: 'Refund', icon: RotateCcw, color: 'text-gray-600', bg: 'bg-gray-50', activeBg: 'bg-gray-100' }]
    : [
        { id: 'partial', label: 'Partial', icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50', activeBg: 'bg-amber-100' },
        { id: 'paid', label: 'Full Pay', icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50', activeBg: 'bg-emerald-100' },
      ]

  const getMax = () => {
    if (activeTab === 'partial') return remaining
    if (activeTab === 'refund') return maxRefund
    return undefined
  }

  const max = getMax()

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <DollarSign size={16} className="text-primary" />
          Payment — #{order.order_number}
        </h4>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-2.5 space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Total</span>
          <span className="font-semibold">{order.total_amount?.toLocaleString('fr-FR')} DA</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Paid</span>
          <span className="font-semibold text-emerald-600">{(order.amount_paid || 0).toLocaleString('fr-FR')} DA</span>
        </div>
        <div className="flex justify-between text-xs font-bold text-gray-900 pt-1 border-t border-gray-200">
          <span>Remaining</span>
          <span className="text-red-500">{remaining.toLocaleString('fr-FR')} DA</span>
        </div>
      </div>

      <div className="flex gap-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setAmount(''); setNotes('') }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                isActive ? `${tab.activeBg} ${tab.color} border border-current` : `${tab.bg} ${tab.color} opacity-60 hover:opacity-100`
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
          {activeTab === 'refund' ? 'Refund Amount' : 'Amount'} (DA)
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              const v = parseInt(e.target.value) || ''
              if (max && v > max) {
                setAmount(max.toString())
              } else {
                setAmount(e.target.value)
              }
            }}
            placeholder={activeTab === 'paid' ? order.total_amount.toString() : '0'}
            max={max}
            className="w-full pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">DA</span>
        </div>
        {activeTab === 'partial' && (
          <p className="text-[10px] text-gray-400 mt-1">
            Remaining: <span className="font-semibold text-amber-600">{remaining.toLocaleString('fr-FR')} DA</span>
          </p>
        )}
        {activeTab === 'refund' && (
          <p className="text-[10px] text-gray-400 mt-1">
            Max refund: <span className="font-semibold text-gray-600">{maxRefund.toLocaleString('fr-FR')} DA</span>
          </p>
        )}
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Deposit, versement..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 placeholder-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!amount || parseInt(amount) <= 0}
          className={`flex-1 py-2 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-40 ${
            activeTab === 'refund' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-primary hover:bg-primary-dark'
          }`}
        >
          {activeTab === 'paid' ? 'Confirm' : activeTab === 'refund' ? 'Refund' : 'Record'}
        </button>
      </div>
    </div>
  )
}

function OrderRow({ order, isExpanded, onToggle, onStatusChange, onDelete, onViewReceipt, onMarkAsPaid, onRecordPartial, onRefund, onUpdateOrder }) {
  const config = statusConfig[order.status] || statusConfig.new
  const StatusIcon = config.icon
  const payConfig = paymentConfig[order.payment_method] || paymentConfig.cash
  const PayIcon = payConfig.icon
  const delConfig = deliveryConfig[order.delivery_method] || deliveryConfig.pickup
  const DelIcon = delConfig.icon
  const srcConfig = sourceConfig[order.client_source] || sourceConfig.inhouse
  const payStatusConfig = paymentStatusConfig[order.payment_status] || paymentStatusConfig.unpaid

  const [showPaymentPanel, setShowPaymentPanel] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── Edit mode state ──
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editLoading, setEditLoading] = useState(false)

  const startEditing = (e) => {
    e.stopPropagation()
    setEditForm({
      client_name: order.client_name || '',
      client_phone: order.client_phone || '',
      delivery_date: order.delivery_date ? order.delivery_date.split('T')[0] : '',
      delivery_method: order.delivery_method || 'pickup',
      payment_method: order.payment_method || 'cash',
      client_source: order.client_source || 'inhouse',
      notes: order.notes || '',
    })
    setEditItems(order.order_items?.map(item => ({
      id: item.id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      product_name: item.product_name || item.products?.item_name || `Product #${item.product_id}`,
      deleted: false,
    })) || [])
    setIsEditing(true)
    if (!isExpanded) onToggle()
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm(null)
    setEditItems([])
  }

  const handleSave = async () => {
    if (!editItems.some(i => !i.deleted) || !editForm.client_name.trim()) return
    setEditLoading(true)

    const itemUpdates = editItems
      .filter(item => item.deleted || item.quantity !== (order.order_items.find(i => i.id === item.id)?.quantity))
      .map(item => ({ id: item.id, quantity: item.quantity, deleted: item.deleted }))

    const success = await onUpdateOrder(order.id, {
      orderData: editForm,
      itemUpdates: itemUpdates.length > 0 ? itemUpdates : undefined,
    })

    if (success) {
      setIsEditing(false)
      setEditForm(null)
      setEditItems([])
    }
    setEditLoading(false)
  }

  const liveSubtotal = editItems
    .filter(i => !i.deleted)
    .reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  return (
    <div className={`bg-white rounded-xl border transition-all ${
      isExpanded ? 'border-primary/30 shadow-md ring-1 ring-primary/10' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
    }`}>
      {/* Row Header */}
      <div className={`px-5 py-4 flex items-center gap-4 ${isEditing ? 'cursor-default' : 'cursor-pointer'}`} onClick={() => !isEditing && onToggle()}>
        <div className="w-5 h-5 rounded border-2 border-gray-200 flex items-center justify-center shrink-0 hover:border-primary transition-colors">
          <div className="w-2.5 h-2.5 rounded-sm bg-primary opacity-0" />
        </div>

        <div className="w-24 shrink-0">
          <span className="font-black text-primary text-sm">#{order.order_number}</span>
        </div>

        <div className="w-44 shrink-0 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{order.client_name}</p>
          {order.client_phone && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <Phone size={10} /> {order.client_phone}
            </p>
          )}
        </div>

        <div className="w-28 shrink-0">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar size={11} />
            {new Date(order.created_at).toLocaleDateString('fr-FR')}
          </p>
          {order.delivery_date && (
            <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
              <Clock size={10} />
              {new Date(order.delivery_date).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>

        <div className="w-16 shrink-0 text-center">
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {order.order_items?.length || 0} items
          </span>
        </div>

        <div className="w-28 shrink-0 text-right">
          <p className="font-bold text-gray-900 text-sm">{order.total_amount?.toLocaleString('fr-FR')} DA</p>
        </div>

        <div className="w-28 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${config.bg} ${config.text} ${config.border}`}>
            <StatusIcon size={11} /> {config.label}
          </span>
        </div>

        <div className="w-24 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${payStatusConfig.bg} ${payStatusConfig.text} ${payStatusConfig.border}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${payStatusConfig.dot}`} />
            {payStatusConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-1 ml-auto shrink-0">
          {isEditing && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide mr-1">
              Editing
            </span>
          )}

          <button onClick={(e) => { e.stopPropagation(); onViewReceipt(order) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors" title="View receipt">
            <Eye size={15} />
          </button>

          {!isEditing && (
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(e) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit order"
            >
              <Pencil size={15} />
            </button>
          )}

          {!isEditing && (showDeleteConfirm ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { onDelete(order); setShowDeleteConfirm(false) }}
                className="px-2 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold hover:bg-red-600 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-danger hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          ))}

          {!isEditing && (
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Detail View */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/50">
          {isEditing ? (
            <div className="grid grid-cols-12 gap-6">
              {/* Edit Left: Items */}
              <div className="col-span-5">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShoppingBag size={12} /> Order Items
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {editItems.filter(item => !item.deleted).map((item) => {
                      const originalItem = order.order_items.find(oi => oi.id === item.id)
                      const product = originalItem?.products
                      return (
                        <div key={item.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                              {product?.image_url ? (
                                <img src={product.image_url} alt={product.item_name} className="w-full h-full object-cover" />
                              ) : (
                                <Package size={16} className="text-gray-400 m-auto" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                              <p className="text-[11px] text-gray-400">{item.unit_price?.toLocaleString('fr-FR')} DA each</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it))}
                                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                              >
                                <span className="text-xs font-bold">-</span>
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 1
                                  setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, quantity: Math.max(1, val) } : it))
                                }}
                                className="w-12 text-center py-1 rounded-lg border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                              />
                              <button
                                onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, quantity: it.quantity + 1 } : it))}
                                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                              >
                                <span className="text-xs font-bold">+</span>
                              </button>
                            </div>
                            <span className="text-sm font-bold text-gray-700 w-20 text-right">
                              {(item.quantity * item.unit_price).toLocaleString('fr-FR')} DA
                            </span>
                            <button
                              onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, deleted: true } : it))}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Remove item"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {editItems.filter(i => i.deleted).length > 0 && (
                      <div className="px-4 py-2 bg-red-50/50">
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1">Removed Items</p>
                        {editItems.filter(i => i.deleted).map(item => (
                          <div key={item.id} className="flex items-center justify-between py-1">
                            <span className="text-xs text-gray-400 line-through">{item.product_name}</span>
                            <button
                              onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, deleted: false } : it))}
                              className="text-[10px] font-bold text-primary hover:underline"
                            >
                              Undo
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span>
                      <span>{liveSubtotal.toLocaleString('fr-FR')} DA</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-dashed border-gray-200">
                      <span className="text-sm font-bold text-gray-900">New Total</span>
                      <span className="text-sm font-black text-primary">{liveSubtotal.toLocaleString('fr-FR')} DA</span>
                    </div>
                    {order.total_amount !== liveSubtotal && (
                      <div className="flex justify-between text-[10px] text-amber-600 font-medium">
                        <span>Original Total</span>
                        <span>{order.total_amount?.toLocaleString('fr-FR')} DA</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Middle: Order Details Form */}
              <div className="col-span-4 space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Order Details
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Client Name</label>
                    <input
                      type="text"
                      value={editForm.client_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, client_name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
                    <input
                      type="tel"
                      value={editForm.client_phone}
                      onChange={(e) => setEditForm(prev => ({ ...prev, client_phone: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Delivery Date</label>
                    <input
                      type="date"
                      value={editForm.delivery_date}
                      onChange={(e) => setEditForm(prev => ({ ...prev, delivery_date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Delivery Method</label>
                    <select
                      value={editForm.delivery_method}
                      onChange={(e) => setEditForm(prev => ({ ...prev, delivery_method: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {Object.entries(deliveryConfig).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Payment Method</label>
                    <select
                      value={editForm.payment_method}
                      onChange={(e) => setEditForm(prev => ({ ...prev, payment_method: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {Object.entries(paymentConfig).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Source</label>
                    <select
                      value={editForm.client_source}
                      onChange={(e) => setEditForm(prev => ({ ...prev, client_source: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {Object.entries(sourceConfig).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Edit Right: Actions */}
              <div className="col-span-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Layers size={12} /> Actions
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  {order.status === 'done' && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-[10px] font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      Stock will adjust automatically
                    </div>
                  )}

                  {!editItems.some(i => !i.deleted) && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Order must have at least one item
                    </div>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={editLoading || !editItems.some(i => !i.deleted) || !editForm.client_name.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-40"
                  >
                    {editLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Save Changes
                  </button>

                  <button
                    onClick={cancelEditing}
                    disabled={editLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>

                <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Summary</h4>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Original Total</span>
                    <span>{order.total_amount?.toLocaleString('fr-FR')} DA</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>New Total</span>
                    <span className="font-semibold text-primary">{liveSubtotal.toLocaleString('fr-FR')} DA</span>
                  </div>
                  {order.total_amount !== liveSubtotal && (
                    <div className="flex justify-between text-xs font-bold text-amber-600 pt-1 border-t border-gray-100">
                      <span>Difference</span>
                      <span>{(liveSubtotal - order.total_amount).toLocaleString('fr-FR')} DA</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6">
              {/* Left: Items + Totals */}
              <div className="col-span-5">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShoppingBag size={12} /> Order Items
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {order.order_items?.map((item, i) => {
                      const product = item.products
                      return (
                        <div key={i} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                              {product?.image_url ? (
                                <img src={product.image_url} alt={product.item_name} className="w-full h-full object-cover" />
                              ) : (
                                <Package size={16} className="text-gray-400 m-auto" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">
                                {item.product_name || product?.item_name || `Product #${item.product_id}`}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {(item.color || product?.color) && (
                                  <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {item.color || product?.color}
                                  </span>
                                )}
                                {(item.flower_type || product?.flower_type) && (
                                  <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {item.flower_type || product?.flower_type}
                                  </span>
                                )}
                                <span className="text-[11px] text-gray-400">
                                  {item.quantity} × {item.unit_price?.toLocaleString('fr-FR')} DA
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-gray-700">{item.total_price?.toLocaleString('fr-FR')} DA</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span><span>{order.subtotal_amount?.toLocaleString('fr-FR')} DA</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-dashed border-gray-200">
                      <span className="text-sm font-bold text-gray-900">Total</span>
                      <span className="text-sm font-black text-primary">{order.total_amount?.toLocaleString('fr-FR')} DA</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle: Order Details */}
              <div className="col-span-4 space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Order Details
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${delConfig.bg} flex items-center justify-center`}>
                      <DelIcon size={16} className={delConfig.color} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Delivery Method</p>
                      <p className="text-sm font-semibold text-gray-800 capitalize">{delConfig.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <PayIcon size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment Method</p>
                      <p className="text-sm font-semibold text-gray-800">{payConfig.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                      <TrendingUp size={16} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Source</p>
                      <p className={`text-sm font-semibold ${srcConfig.color}`}>{srcConfig.label}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    <div className={`w-9 h-9 rounded-lg ${payStatusConfig.bg} flex items-center justify-center`}>
                      <DollarSign size={16} className={payStatusConfig.text} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment Status</p>
                      <p className={`text-sm font-semibold ${payStatusConfig.text}`}>
                        {payStatusConfig.label}
                        {order.amount_paid > 0 && order.amount_paid < order.total_amount && (
                          <span className="text-gray-400 font-normal ml-1">
                            ({order.amount_paid?.toLocaleString('fr-FR')} / {order.total_amount?.toLocaleString('fr-FR')} DA)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {(order.payment_status === 'partial' || order.payment_status === 'unpaid') && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Amount Due</p>
                      <p className="text-lg font-black text-red-500">
                        {(order.amount_due ?? (order.total_amount - (order.amount_paid || 0)))?.toLocaleString('fr-FR')} DA
                      </p>
                    </div>
                  )}

                  {order.payment_notes && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Payment Notes</p>
                      <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg p-2.5">"{order.payment_notes}"</p>
                    </div>
                  )}

                  {order.notes && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Order Notes</p>
                      <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg p-2.5">"{order.notes}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Status Actions + Payment Panel */}
              <div className="col-span-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Layers size={12} /> Status Actions
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                  {Object.entries(statusConfig).map(([status, cfg]) => {
                    const SIcon = cfg.icon
                    const isCurrent = order.status === status
                    return (
                      <button
                        key={status}
                        onClick={() => !isCurrent && onStatusChange(order.id, status)}
                        disabled={isCurrent}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          isCurrent
                            ? `${cfg.bg} ${cfg.text} border ${cfg.border} cursor-default`
                            : 'text-gray-600 hover:bg-gray-50 border border-transparent hover:border-gray-100'
                        }`}
                      >
                        <SIcon size={14} />
                        <span className="flex-1 text-left">{cfg.label}</span>
                        {isCurrent && <CheckCircle2 size={14} />}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <DollarSign size={12} /> Payment
                  </h4>
                  
                  {showPaymentPanel ? (
                    <PaymentPanel
                      order={order}
                      onClose={() => setShowPaymentPanel(false)}
                      onMarkAsPaid={onMarkAsPaid}
                      onRecordPartial={onRecordPartial}
                      onRefund={onRefund}
                    />
                  ) : (
                    <button
                      onClick={() => setShowPaymentPanel(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                    >
                      <Wallet size={14} /> Manage Payment
                    </button>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  <button onClick={() => onViewReceipt(order)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors">
                    <Printer size={14} /> Print Receipt
                  </button>
                  <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cream text-gray-700 text-sm font-semibold hover:bg-cream-dark transition-colors border border-gray-200">
                    <Download size={14} /> Export PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatsBar({ stats }) {
  const statItems = [
    { label: 'Total Orders', value: stats.total, icon: Hash, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Today', value: stats.today, icon: Calendar, color: 'text-teal', bg: 'bg-teal/10' },
    { label: 'Revenue', value: `${stats.totalRevenue.toLocaleString('fr-FR')} DA`, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Outstanding', value: `${stats.outstanding.toLocaleString('fr-FR')} DA`, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Paid', value: stats.paid, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Unpaid', value: stats.unpaid, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  ]

  return (
    <div className="grid grid-cols-6 gap-3">
      {statItems.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center shrink-0`}>
              <Icon size={18} className={s.color} />
            </div>
            <div>
              <p className="text-lg font-black text-gray-900">{s.value}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Orders() {
  const {
    orders,
    allOrders,
    loading,
    statusFilter, setStatusFilter,
    paymentFilter, setPaymentFilter,
    dateRange, setDateRange,
    searchQuery, setSearchQuery,
    sortBy, sortDir,
    stats,
    statusCounts,
    paymentCounts,
    updateStatus,
    markAsPaid,
    recordPartialPayment,
    recordRefund,
    updatePaymentStatus,
    deleteOrder,
    updateOrder,
    refresh,
    toggleSort,
  } = useOrders()

  const { addNotification } = useNotification()
  const navigate = useNavigate()
  const [expandedOrder, setExpandedOrder] = useState(null)

  const handleStatusChange = async (orderId, newStatus) => {
    const success = await updateStatus(orderId, newStatus)
    if (success) addNotification(`Order status updated to ${statusConfig[newStatus]?.label || newStatus}`, 'success')
  }

  const handleMarkAsPaid = async (orderId) => {
    const success = await markAsPaid(orderId)
    if (success) addNotification('Order marked as fully paid', 'success')
  }

  const handleRecordPartial = async (orderId, amount, notes) => {
    const success = await recordPartialPayment(orderId, amount, notes)
    if (success) addNotification(`Recorded ${amount} DA payment`, 'success')
  }

  const handleRefund = async (orderId, amount, notes) => {
    const success = await recordRefund(orderId, amount, notes)
    if (success) addNotification('Refund recorded', 'success')
  }

  const handleDelete = async (order) => {
    const success = await deleteOrder(order.id)
    if (success) {
      addNotification(`Order #${order.order_number} deleted`, 'success')
      if (expandedOrder === order.id) setExpandedOrder(null)
    } else {
      addNotification(`Failed to delete order #${order.order_number}`, 'error')
    }
  }

  const handleViewReceipt = (order) => {
    navigate(`/orders/receipt?id=${order.id}`)
  }

  const handleUpdateOrder = async (orderId, updates) => {
    const success = await updateOrder(orderId, updates)
    if (success) {
      addNotification('Order updated successfully', 'success')
    } else {
      addNotification('Failed to update order', 'error')
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Orders</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage and track all your orders</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream text-gray-700 text-sm font-medium hover:bg-cream-dark transition-colors border border-gray-200">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={() => navigate('/cart')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors">
              <ShoppingBag size={14} /> New Order
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <StatsBar stats={stats} />

        {/* Filters & Search Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, order #, phone..."
                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-gray-50 border-0 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary/20 outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
              {['all', 'today', 'week', 'month'].map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateRange === range ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {range === 'all' ? 'All Time' : range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {[{ field: 'date', label: 'Date' }, { field: 'amount', label: 'Amount' }].map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === field ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {label}
                  {sortBy === field && <ArrowUpDown size={11} className={sortDir === 'asc' ? 'rotate-180' : ''} />}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Status:</span>
            {['all', 'new', 'processing', 'done', 'cancelled'].map((status) => {
              const isActive = statusFilter === status
              const cfg = status !== 'all' ? statusConfig[status] : null
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? status === 'all' ? 'bg-gray-900 text-white' : `${cfg.bg} ${cfg.text} border ${cfg.border}`
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {status === 'all' ? 'All Orders' : cfg.label}
                  {status !== 'all' && <span className="ml-1.5 opacity-60">({statusCounts[status]})</span>}
                </button>
              )
            })}
          </div>

          {/* Payment Status Filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Payment:</span>
            {['all', 'paid', 'partial', 'unpaid', 'refunded'].map((status) => {
              const isActive = paymentFilter === status
              const cfg = status !== 'all' ? paymentStatusConfig[status] : null
              return (
                <button
                  key={status}
                  onClick={() => setPaymentFilter(status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? status === 'all' ? 'bg-gray-900 text-white' : `${cfg.bg} ${cfg.text} border ${cfg.border}`
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {status === 'all' ? 'All Payments' : cfg.label}
                  {status !== 'all' && <span className="ml-1.5 opacity-60">({paymentCounts[status]})</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing <span className="font-bold text-gray-900">{orders.length}</span> of <span className="font-bold text-gray-900">{allOrders.length}</span> orders
          </p>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-cream rounded-2xl border border-gray-100 p-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package size={28} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-semibold text-lg">No orders found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or search</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table Header */}
            <div className="px-5 py-2 flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <div className="w-5 shrink-0" />
              <div className="w-24 shrink-0">Order #</div>
              <div className="w-44 shrink-0">Client</div>
              <div className="w-28 shrink-0">Date</div>
              <div className="w-16 shrink-0 text-center">Items</div>
              <div className="w-28 shrink-0 text-right">Total</div>
              <div className="w-28 shrink-0">Status</div>
              <div className="w-24 shrink-0">Payment</div>
              <div className="ml-auto shrink-0 w-24">Actions</div>
            </div>

            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                isExpanded={expandedOrder === order.id}
                onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onViewReceipt={handleViewReceipt}
                onMarkAsPaid={handleMarkAsPaid}
                onRecordPartial={handleRecordPartial}
                onRefund={handleRefund}
                onUpdateOrder={handleUpdateOrder}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Orders