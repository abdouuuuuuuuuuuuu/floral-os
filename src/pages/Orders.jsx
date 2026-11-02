import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search, ChevronDown, ChevronUp, Package, Phone, Calendar, Clock, Archive, Zap,
  DollarSign, Trash2, AlertTriangle, Eye, Printer, FileText,
  CheckCircle2, XCircle, Loader2, Bike, Truck, Store,
  RefreshCw, X, Hash, CreditCard,
  ShoppingBag, Layers, RotateCcw, Wallet, Banknote,
  Pencil, Flower2
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { CustomerSearch } from '../components/CustomerSearch'
import { useOrders, ordersViewState } from '../hooks/useOrders'
import { useNotification } from '../context/NotificationContext'
import { ListSkeleton } from '../components/common/Skeleton'
import { ColourSignature, Swatch } from '../components/common/FlowerColour'
import { useSettings } from '../hooks/useSettings'
import { useAuth } from '../context/AuthContext'
import { useCartContext } from '../context/CartContext'
import { useProducts } from '../hooks/useProducts'
import { orderActionsFor } from '../lib/permissions'
import { useConfirm } from '../context/ConfirmContext'
import { useUndo } from '../context/UndoContext'
import { orderStatusTargets } from '../lib/orderStatus'
import { archiveOrder } from '../lib/orders'
import AlgerianPlaceSearch from '../components/AlgerianPlaceSearch'
import { getShippingPlan, localDateString, shipByDate } from '../lib/shippingPlan'
import { addCalendarDays, formatBusinessDate, formatBusinessDateTime } from '../lib/businessDate.js'
import { supabase } from '../lib/supabase'
import { getFunctionErrorMessage } from '../lib/functionError'

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

const getPaymentStatusLabel = (order, fallback) =>
  order.payment_status === 'unpaid' && Number(order.amount_paid || 0) === 0 && Number(order.amount_due ?? order.total_amount ?? 0) > 0
    ? 'Pay Later'
    : fallback

const paymentConfig = {
  cash:      { label: 'Cash',      icon: DollarSign },
  baridimob: { label: 'BaridiMob', icon: CreditCard },
  usd:       { label: 'USDT',       icon: DollarSign },
}

const deliveryConfig = {
  motorcycle: { label: 'Motorcycle', icon: Bike,  color: 'text-blue-500',  bg: 'bg-blue-50' },
  dhd:        { label: 'DHD',        icon: Truck, color: 'text-purple-500', bg: 'bg-purple-50' },
  pickup:     { label: 'Pickup',     icon: Store, color: 'text-teal-500',  bg: 'bg-teal-50' },
}

function createEditRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

const sourceConfig = {
  instagram: { label: 'Instagram', color: 'text-pink-500' },
  whatsapp:  { label: 'WhatsApp',  color: 'text-green-500' },
  phone:     { label: 'Phone',     color: 'text-blue-500' },
  facebook:  { label: 'Facebook',  color: 'text-blue-600' },
  inhouse:   { label: 'In-House',  color: 'text-gray-500' },
}

// ─── WHO MADE THIS ORDER ───────────────────────────────────────────
const staffColors = {
  owner:   'bg-amber-500',
  manager: 'bg-violet-500',
  florist: 'bg-teal-500',
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function relativeTime(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  if (days < 7) return days + 'd ago'
  return new Date(iso).toLocaleDateString('fr-FR')
}

function fullStamp(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Compact circle for the row. Hover gives the full name and timestamp. */
function StaffAvatar({ person, at, size = 28 }) {
  const name = person?.full_name || person?.username
  const tip = name
    ? name + (person.role ? ' (' + person.role + ')' : '') + ' — ' + fullStamp(at)
    : 'Not recorded — ' + fullStamp(at)

  return (
    <div
      title={tip}
      className={'rounded-full flex items-center justify-center font-semibold text-white shrink-0 ' + (
        name ? (staffColors[person?.role] || 'bg-gray-400') : 'bg-gray-200 text-gray-400'
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {name ? initials(name) : '—'}
    </div>
  )
}

function createPaymentRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function PaymentPanel({ order, exchangeRate, allowRefund, onClose, onMarkAsPaid, onRecordPartial, onRefund }) {
  const [activeTab, setActiveTab] = useState('partial')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(order.payment_method || 'cash')
  const [saving, setSaving] = useState(false)
  const requestIdRef = useRef(null)

  const remaining = order.total_amount - (order.amount_paid || 0)
  const maxRefund = order.amount_paid || 0
  const rate = Number(exchangeRate)
  const isUsd = paymentMethod === 'usd'
  const rateIsValid = Number.isFinite(rate) && rate > 0
  const enteredAmount = Number(amount) || 0
  const enteredInDzd = isUsd ? enteredAmount * (rateIsValid ? rate : 0) : enteredAmount
  const limit = activeTab === 'refund' ? maxRefund : remaining
  const appliedAmount = Math.min(Math.max(0, Math.round(enteredInDzd)), Math.max(0, limit))
  const changeInDzd = Math.max(0, enteredInDzd - appliedAmount)
  const refundExceedsLimit = activeTab === 'refund' && enteredInDzd > maxRefund

  const handleSubmit = async () => {
    if (saving || !amount || enteredAmount <= 0 || (isUsd && !rateIsValid) || refundExceedsLimit) return
    const fxNote = isUsd
      ? `${enteredAmount.toFixed(2)} USDT at ${rate} DA/USDT = ${Math.round(enteredInDzd)} DA equivalent${changeInDzd > 0 ? `; return ${(changeInDzd / rate).toFixed(2)} USDT change` : ''}`
      : changeInDzd > 0 ? `Return ${Math.round(changeInDzd)} DA change` : ''
    const paymentNote = [fxNote, notes.trim()].filter(Boolean).join(' · ')
    const requestId = requestIdRef.current || (requestIdRef.current = createPaymentRequestId())
    setSaving(true)
    try {
      let saved = false
      if (activeTab === 'paid') {
        saved = await onMarkAsPaid(order.id, paymentMethod, paymentNote, requestId)
      } else if (activeTab === 'partial') {
        saved = await onRecordPartial(order.id, appliedAmount, paymentNote || `Partial payment: ${appliedAmount} DA`, paymentMethod, requestId)
      } else if (activeTab === 'refund') {
        saved = await onRefund(order.id, appliedAmount, paymentNote || `Refund: ${appliedAmount} DA`, paymentMethod, requestId)
      }
      if (saved) { requestIdRef.current = null; onClose() }
    } finally {
      setSaving(false)
    }
  }

  const tabs = order.payment_status === 'paid'
    ? allowRefund ? [{ id: 'refund', label: 'Refund', icon: RotateCcw, color: 'text-gray-600', bg: 'bg-gray-50', activeBg: 'bg-gray-100' }] : []
    : [
        { id: 'partial', label: 'Partial', icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50', activeBg: 'bg-amber-100' },
        { id: 'paid', label: 'Full Pay', icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50', activeBg: 'bg-emerald-100' },
      ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
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
        <div className="flex justify-between text-xs font-semibold text-gray-900 pt-1 border-t border-gray-200">
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
              onClick={() => {
                requestIdRef.current = null
                setActiveTab(tab.id)
                setAmount(tab.id === 'paid'
                  ? paymentMethod === 'usd' && rateIsValid ? (remaining / rate).toFixed(2) : remaining.toString()
                  : '')
                setNotes('')
              }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-2xs font-semibold transition-all ${
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
        <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
          {activeTab === 'refund' ? 'Refund Amount' : 'Amount'} ({isUsd ? 'USDT' : 'DA'})
        </label>
        <div className="relative">
          <input
            type="number"
            min="0"
            step={isUsd ? '0.01' : '1'}
            value={amount}
            onChange={(e) => { requestIdRef.current = null; setAmount(e.target.value) }}
            placeholder={activeTab === 'paid' ? (isUsd && rateIsValid ? (remaining / rate).toFixed(2) : remaining.toString()) : '0'}
            disabled={activeTab === 'paid'}
            className="w-full pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs font-semibold text-gray-400">{isUsd ? 'USDT' : 'DA'}</span>
        </div>
        {isUsd && (
          <p className={`text-2xs mt-1 ${rateIsValid ? 'text-gray-500' : 'text-rose-600'}`}>
            {rateIsValid
              ? `1 USDT = ${rate.toLocaleString('fr-FR')} DA · ${enteredAmount.toLocaleString('fr-FR')} USDT = ${Math.round(enteredInDzd).toLocaleString('fr-FR')} DA`
              : 'USDT unavailable. Ask the owner to set the exchange rate in Settings.'}
          </p>
        )}
        {amount && enteredAmount > 0 && (
          <p className="text-2xs text-gray-500 mt-1">Applied to order: {appliedAmount.toLocaleString('fr-FR')} DA</p>
        )}
        {changeInDzd > 0 && activeTab === 'partial' && (
          <p className="text-2xs text-emerald-700 mt-1">
            Change{isUsd ? ' in USDT' : ''}: {isUsd && rateIsValid ? `${(changeInDzd / rate).toFixed(2)} USDT` : `${Math.round(changeInDzd).toLocaleString('fr-FR')} DA`}
          </p>
        )}
        {refundExceedsLimit && (
          <p className="text-2xs text-rose-600 mt-1">Refund cannot exceed {maxRefund.toLocaleString('fr-FR')} DA.</p>
        )}
        {activeTab === 'partial' && (
          <p className="text-2xs text-gray-400 mt-1">
            Remaining: <span className="font-semibold text-amber-600">{remaining.toLocaleString('fr-FR')} DA</span>
          </p>
        )}
        {activeTab === 'refund' && (
          <p className="text-2xs text-gray-400 mt-1">
            Max refund: <span className="font-semibold text-gray-600">{maxRefund.toLocaleString('fr-FR')} DA</span>
          </p>
        )}
      </div>
      <div>
        <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Paid with</label>
        <select
          value={paymentMethod}
          onChange={(e) => {
            const method = e.target.value
            requestIdRef.current = null
            setPaymentMethod(method)
            if (activeTab === 'paid') {
              setAmount(method === 'usd' && rateIsValid ? (remaining / rate).toFixed(2) : remaining.toString())
            }
          }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
        >
          <option value="cash">Cash</option>
          <option value="baridimob">BaridiMob</option>
          <option value="usd" disabled={!rateIsValid}>USDT</option>
        </select>
      </div>

      <div>
        <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => { requestIdRef.current = null; setNotes(e.target.value) }}
          placeholder="e.g. Deposit, versement..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 placeholder-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={saving || !amount || enteredAmount <= 0 || appliedAmount <= 0 || (isUsd && !rateIsValid) || refundExceedsLimit}
          className={`flex-1 py-2 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-40 ${
            activeTab === 'refund' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-primary hover:bg-primary-dark'
          }`}
        >
          {saving ? 'Saving…' : activeTab === 'paid' ? 'Confirm' : activeTab === 'refund' ? 'Refund' : 'Record'}
        </button>
      </div>
    </div>
  )
}

function OrderRow({ order, cartItems = [], products = [], isExpanded, onToggle, onStatusChange, onDelete, onViewReceipt, onMarkAsPaid, onRecordPartial, onRefund, onUpdateOrder, onDelayOrder, onSaveShippingRoute, exchangeRate, actions }) {
  const config = statusConfig[order.status] || statusConfig.new
  const StatusIcon = config.icon
  const delConfig = deliveryConfig[order.delivery_method] || deliveryConfig.pickup
  const DelIcon = delConfig.icon
  const fulfillmentLabel = order.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'
  const cannotReschedule = ['done', 'cancelled'].includes(order.status)
  const payStatusConfig = paymentStatusConfig[order.payment_status] || paymentStatusConfig.unpaid
  const allowedStatusTargets = orderStatusTargets(order.status, { canCancel: actions.cancel })

  const [showPaymentPanel, setShowPaymentPanel] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editRequestId, setEditRequestId] = useState(null)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showCartPicker, setShowCartPicker] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const [showDelayForm, setShowDelayForm] = useState(false)
  const [delayForm, setDelayForm] = useState({ deliveryDate: '', reason: '' })
  const [delayLoading, setDelayLoading] = useState(false)
  const [delayError, setDelayError] = useState('')
  const [showShippingRouteEditor, setShowShippingRouteEditor] = useState(false)
  const [shippingPlaceQuery, setShippingPlaceQuery] = useState([order.delivery_city, order.delivery_wilaya].filter(Boolean).join(', '))
  const [shippingPlace, setShippingPlace] = useState(order.delivery_latitude != null && order.delivery_longitude != null ? {
    label: order.delivery_city || '',
    wilaya: order.delivery_wilaya || '',
    latitude: Number(order.delivery_latitude),
    longitude: Number(order.delivery_longitude),
  } : null)
  const [shippingRouteLoading, setShippingRouteLoading] = useState(false)
  const [shippingRouteError, setShippingRouteError] = useState('')

  const nextDateAfter = (dateString) => {
    return addCalendarDays(dateString ? dateString.split('T')[0] : localDateString(), 1)
  }
  const todayDate = localDateString()
  const minimumDelayDate = [todayDate, nextDateAfter(order.delivery_date)].sort().at(-1)
  const shippingPlan = getShippingPlan(order)

  const calculateAndSaveShippingRoute = async () => {
    if (!shippingPlace) { setShippingRouteError('Select the correct destination town from the search results.'); return }
    setShippingRouteLoading(true)
    setShippingRouteError('')
    try {
      await onSaveShippingRoute(order.id, shippingPlace)
      setShowShippingRouteEditor(false)
    } catch (error) {
      setShippingRouteError(error.message || 'Could not save this route.')
    } finally {
      setShippingRouteLoading(false)
    }
  }

  const openDelayForm = (event) => {
    event?.stopPropagation()
    setDelayForm({ deliveryDate: minimumDelayDate, reason: '' })
    setDelayError('')
    setShowDelayForm(true)
    if (!isExpanded) onToggle()
  }

  const submitDelay = async (event) => {
    event.preventDefault()
    if (!delayForm.deliveryDate || delayLoading) return
    setDelayLoading(true)
    setDelayError('')
    const result = await onDelayOrder(order.id, delayForm.deliveryDate, delayForm.reason.trim())
    setDelayLoading(false)
    if (result === true) {
      setShowDelayForm(false)
      setDelayForm({ deliveryDate: '', reason: '' })
    } else {
      setDelayError(typeof result === 'string' ? result : 'Could not save the delivery delay. Please try again.')
    }
  }

  const startEditing = (e) => {
    e.stopPropagation()
    setEditForm({
      client_name: order.client_name || '',
      client_phone: order.client_phone || '',
      customer_id: order.customer_id || null,
      delivery_date: order.delivery_date ? order.delivery_date.split('T')[0] : '',
      delivery_time: order.delivery_time ? String(order.delivery_time).slice(0, 5) : '',
      delivery_method: order.delivery_method || 'pickup',
      payment_method: order.payment_method || 'cash',
      client_source: order.client_source || 'inhouse',
      notes: order.notes || '',
      price_adjustment: order.price_adjustment || 0,
    })
    setEditItems(order.order_items?.map(item => ({
      id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      product_name: item.product_name || item.products?.item_name || `Product #${item.product_id}`,
      deleted: false,
    })) || [])
    setEditRequestId(createEditRequestId())
    setShowProductPicker(false)
    setShowCartPicker(false)
    setProductQuery('')
    setIsEditing(true)
    if (!isExpanded) onToggle()
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm(null)
    setEditItems([])
    setEditRequestId(null)
    setShowProductPicker(false)
    setShowCartPicker(false)
    setProductQuery('')
  }

   const handleSave = async () => {
    if (!editItems.some(i => !i.deleted) || !editForm.client_name.trim()) return
    setEditLoading(true)
    const itemUpdates = editItems
      .filter(item => item.isNew || item.deleted || item.quantity !== (order.order_items.find(i => i.id === item.id)?.quantity))
      .map(item => ({
        id: item.isNew ? null : item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        deleted: item.deleted,
        is_new: Boolean(item.isNew),
        unit_price: item.unit_price,
        product_name: item.product_name,
        product_image: item.product_image,
        color: item.color,
        flower_type: item.flower_type,
        category: item.category,
      }))
    const previousEditForm = editForm
    const previousEditItems = editItems
    const previousRequestId = editRequestId
    const savePromise = onUpdateOrder(order.id, {
      orderData: editForm,
      itemUpdates: itemUpdates.length > 0 ? itemUpdates : undefined,
      requestId: editRequestId,
    })
    setSavePending(true)
    setIsEditing(false)
    setEditForm(null)
    setEditItems([])
    setEditRequestId(null)
    const success = await savePromise
    if (success) {
      setSavePending(false)
    } else {
      setIsEditing(true)
      setEditForm(previousEditForm)
      setEditItems(previousEditItems)
      setEditRequestId(previousRequestId)
      setSavePending(false)
    }
    setEditLoading(false)
  }

  const liveSubtotal = editItems
    .filter(i => !i.deleted)
    .reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  const liveAdjustment = Number(editForm?.price_adjustment) || 0
  const liveTotal = liveSubtotal + liveAdjustment

  const addCartItemToOrder = (cartItem) => {
    const productId = cartItem.id ?? cartItem.product_id
    if (!productId) return
    const quantity = Math.max(1, Math.floor(Number(cartItem.quantity) || 1))
    setEditItems((current) => {
      const matching = current.find((item) => !item.deleted && String(item.product_id) === String(productId))
      if (matching) {
        return current.map((item) => item === matching ? { ...item, quantity: item.quantity + quantity } : item)
      }
      return [...current, {
        id: `cart-${productId}-${Date.now()}`,
        product_id: productId,
        quantity,
        unit_price: Number(cartItem.price ?? cartItem.unit_price) || 0,
        product_name: cartItem.name || cartItem.item_name || 'Product',
        product_image: cartItem.image_url || '',
        color: cartItem.color || '',
        flower_type: cartItem.flower_type || '',
        category: cartItem.category || '',
        isNew: true,
        deleted: false,
      }]
    })
  }

  const matchingProducts = products
    .filter((product) => {
      const query = productQuery.trim().toLowerCase()
      return !query || `${product.name} ${product.category} ${product.color || ''} ${product.flower_type || ''}`.toLowerCase().includes(query)
    })
    .slice(0, 8)
  const visibleItems = editItems.filter((item) => !item.deleted)
  const editedUnitCount = visibleItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  return (
    <article id={`order-card-${order.id}`} className={`min-w-0 overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(31,41,55,0.04)] transition-all duration-200 ${
      isExpanded
        ? 'border-primary/30 shadow-md ring-1 ring-primary/10'
        : 'border-sage-dark/70 hover:-translate-y-px hover:border-primary/25 hover:shadow-md'
    }`}>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-4 sm:px-5 2xl:flex 2xl:items-center 2xl:gap-3 ${isEditing ? 'cursor-default' : 'cursor-pointer'}`} onClick={() => !isEditing && onToggle()}>
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 2xl:w-[132px] 2xl:shrink-0">
          <StaffAvatar person={order.cashier} at={order.created_at} />
          <span className="font-semibold text-primary text-sm">#{order.order_number}</span>
          <ColourSignature items={order.order_items} />
        </div>
        <div className="col-span-2 row-start-2 min-w-0 2xl:order-none 2xl:w-[150px] 2xl:shrink-0">
          <p className="truncate text-sm font-semibold text-gray-900">{order.client_name || 'Walk-in customer'}</p>
          {order.client_phone && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <Phone size={10} /> {order.client_phone}
            </p>
          )}
        </div>
        <div className="col-start-1 row-start-3 min-w-0 2xl:w-[132px] 2xl:shrink-0">
          <p className="flex items-center gap-1 text-xs text-gray-500"
            title={`Created ${fullStamp(order.created_at)} · ${relativeTime(order.created_at)}`}
          >
            <Calendar size={11} className="shrink-0" />
            <span className="tabular-nums whitespace-nowrap">{formatBusinessDateTime(order.created_at)}</span>
          </p>
          {order.delivery_date && (
            <p className="mt-0.5 flex items-center gap-1 text-2xs text-gray-400">
              <Clock size={10} />
              <span>Due {formatBusinessDate(order.delivery_date)}</span>
            </p>
          )}
          {order.delivery_fee_collected && <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">Delivery fee · {Number(order.delivery_fee_amount || 0).toLocaleString('fr-FR')} DA</p>}
          {shippingPlan && <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${shippingPlan.urgency === 'today' ? 'border-rose-200 bg-rose-50 text-rose-700' : shippingPlan.urgency === 'overdue' ? 'border-red-200 bg-red-100 text-red-800' : shippingPlan.urgency === 'scheduled' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {shippingPlan.label}
          </span>}
        </div>
        <div className="hidden w-16 shrink-0 text-center 2xl:block">
          <span className="rounded-full bg-sage px-2 py-1 text-xs font-medium text-gray-500">
            {order.order_items?.length || 0} items
          </span>
        </div>
        <div className="col-start-1 row-start-4 min-w-0 2xl:w-[112px] 2xl:shrink-0 2xl:text-right">
          <p className="text-sm font-bold tabular-nums text-gray-900">{order.total_amount?.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-gray-500">DA</span></p>
          <p className="mt-0.5 text-2xs text-gray-400 2xl:hidden">{order.order_items?.length || 0} item{order.order_items?.length === 1 ? '' : 's'}</p>
        </div>
        <div className="col-start-2 row-start-3 flex flex-col items-start gap-1 2xl:w-[112px] 2xl:shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
            <StatusIcon size={11} /> {config.label}
          </span>
          {order.delayed_at && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-2xs font-semibold text-amber-700 border border-amber-200"><Clock size={10} /> Delayed</span>}
        </div>
        <div className="col-start-2 row-start-4 2xl:w-[88px] 2xl:shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-semibold border ${payStatusConfig.bg} ${payStatusConfig.text} ${payStatusConfig.border}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${payStatusConfig.dot}`} />
            {getPaymentStatusLabel(order, payStatusConfig.label)}
          </span>
        </div>
        <div className="col-span-2 row-start-5 ml-auto flex items-center gap-1 border-t border-sage-dark/60 pt-2 2xl:ml-auto 2xl:shrink-0 2xl:border-0 2xl:pt-0">
          {savePending && <span className="mr-1 rounded-full bg-blue-50 px-2 py-1 text-2xs font-semibold text-blue-700">Saving…</span>}
          {isEditing && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-2xs font-semibold uppercase tracking-wide mr-1">Editing</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onViewReceipt(order) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors" title="View receipt">
            <Eye size={15} />
          </button>
          {!isEditing && !savePending && actions.edit && (
            <button onClick={(e) => { e.stopPropagation(); startEditing(e) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit order">
              <Pencil size={15} />
            </button>
          )}
          {!isEditing && !savePending && actions.edit && (
            <button onClick={openDelayForm} disabled={cannotReschedule} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-400" title={cannotReschedule ? `${fulfillmentLabel} cannot be rescheduled after an order is ${order.status}` : `Delay ${fulfillmentLabel.toLowerCase()}`} aria-label={`${cannotReschedule ? 'Rescheduling unavailable' : `Delay ${fulfillmentLabel.toLowerCase()}`} for order ${order.order_number}`}>
              <Clock size={15} />
            </button>
          )}
          {!isEditing && !savePending && actions.archive && (showDeleteConfirm ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { onDelete(order, 'archive'); setShowDeleteConfirm(false) }} className="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-2xs font-semibold hover:bg-amber-200 transition-colors">Archive</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-2xs font-semibold hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-danger hover:bg-red-50 transition-colors" title="Archive order">
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

      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/50">
          {order.voided_at && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            <span className="font-semibold">Cancelled</span> · {fullStamp(order.voided_at)}{order.void_reason && <span> · {order.void_reason}</span>}
          </div>}

          {order.delayed_at && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">{fulfillmentLabel} rescheduled</p>
              <p className="mt-1 text-xs">Original date: {formatBusinessDate(order.original_delivery_date) || 'Not recorded'} · New date: {formatBusinessDate(order.delivery_date) || 'Not set'}</p>
              {order.delay_reason && <p className="mt-1 text-xs">Reason: {order.delay_reason}</p>}
            </div>
          )}

          {order.delivery_method !== 'pickup' && order.order_type !== 'quick_sale' && ['new', 'processing'].includes(order.status) && (
            <section className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Shipping preparation plan">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Truck size={18} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900">Dispatch plan</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${shippingPlan?.shipDate ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                        {shippingPlan?.shipDate ? 'Date ready' : 'Date needed'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{order.delivery_city ? `${order.delivery_city}${order.delivery_wilaya ? ` · ${order.delivery_wilaya}` : ''}` : 'Set the delivery town to plan dispatch'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-expanded={showShippingRouteEditor}
                  onClick={() => setShowShippingRouteEditor((value) => !value)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {showShippingRouteEditor ? 'Close' : order.delivery_city ? 'Change destination' : 'Set destination'}
                </button>
              </div>

              {shippingPlan?.shipDate ? <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-emerald-950">
                <Calendar size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />
                <div><p className="text-xs font-medium text-emerald-800">Prepare by</p><p className="text-base font-semibold">{formatBusinessDate(shippingPlan.shipDate, 'en-GB')}</p></div>
              </div> : !showShippingRouteEditor && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold">Set a destination and delivery date to calculate the prepare-by date.</p>
                </div>
              </div>}

              {showShippingRouteEditor && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
                <AlgerianPlaceSearch
                  label="Delivery town / commune"
                  compact
                  query={shippingPlaceQuery}
                  onQueryChange={(value) => { setShippingPlaceQuery(value); setShippingPlace(null); setShippingRouteError('') }}
                  selectedPlace={shippingPlace}
                  onSelect={(place) => { setShippingPlace(place); setShippingPlaceQuery(`${place.label}${place.wilaya ? `, ${place.wilaya}` : ''}`); setShippingRouteError('') }}
                  hint="Choose the delivery town. Keep street address and delivery instructions in the order notes."
                />
                {shippingPlace ? <button type="button" onClick={calculateAndSaveShippingRoute} disabled={shippingRouteLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-70">
                  {shippingRouteLoading ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                  {shippingRouteLoading ? 'Calculating date…' : 'Update prepare-by date'}
                </button> : <p className="text-xs text-slate-500">Search and select a town to continue.</p>}
                {shippingRouteError && <div className="shipping-route-error flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-xs" role="alert"><span className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>Couldn’t calculate the prepare-by date. Check the routing connection and try again.</span></span><button type="button" onClick={calculateAndSaveShippingRoute} disabled={shippingRouteLoading} className="shrink-0 rounded-lg border border-current/20 bg-white/70 px-3 py-2 font-semibold hover:bg-white disabled:opacity-60">Try again</button></div>}
              </div>}
            </section>
          )}

          {showDelayForm && !isEditing && (
            <form onSubmit={submitDelay} className="mb-5 rounded-xl border border-amber-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Delay {fulfillmentLabel.toLowerCase()}</h4>
                  <p className="text-xs text-gray-500">Keep the order status and payment unchanged.</p>
                </div>
                <button type="button" aria-label="Close delay form" onClick={() => setShowDelayForm(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">New {fulfillmentLabel.toLowerCase()} date</label>
                  <input type="date" min={minimumDelayDate} value={delayForm.deliveryDate} onChange={(e) => setDelayForm((prev) => ({ ...prev, deliveryDate: e.target.value }))} required className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Reason <span className="font-normal text-gray-400">(optional)</span></label>
                  <input type="text" maxLength={500} value={delayForm.reason} onChange={(e) => setDelayForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Add a note, or leave blank" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
                </div>
              </div>
              {delayError && <p role="alert" className="mt-2 text-xs text-rose-700">{delayError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowDelayForm(false)} disabled={delayLoading} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={delayLoading || !delayForm.deliveryDate} className="btn btn-primary">{delayLoading ? 'Saving…' : 'Save delay'}</button>
              </div>
            </form>
          )}

          {isEditing ? (
            <div className="grid grid-cols-12 gap-5">
              <div className="col-span-12 xl:col-span-7">
                <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShoppingBag size={12} /> Order Items
                  <span className="ml-auto normal-case tracking-normal text-gray-500">{visibleItems.length} lines · {editedUnitCount} units</span>
                </h4>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setShowProductPicker((open) => !open); setShowCartPicker(false) }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark">
                    <span className="text-base leading-none">+</span> Add products
                  </button>
                  {cartItems.length > 0 && (
                    <button type="button" onClick={() => { setShowCartPicker((open) => !open); setShowProductPicker(false) }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      Add from cart <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-2xs">{cartItems.length}</span>
                    </button>
                  )}
                </div>
                {showProductPicker && (
                  <div className="mb-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input autoFocus type="search" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search products to add…" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {matchingProducts.length ? matchingProducts.map((product) => (
                        <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-2.5 py-2 transition-colors hover:border-primary/15">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                              {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package size={15} className="text-gray-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-gray-800">{product.name}</p>
                              <p className="truncate text-2xs text-gray-500">{product.category} · {Number(product.price || 0).toLocaleString('fr-FR')} DA each · Stock {product.stock_quantity ?? 0}</p>
                            </div>
                          </div>
                          <button type="button" aria-label={`Add ${product.name} to order`} onClick={() => addCartItemToOrder({ ...product, quantity: 1 })} className="shrink-0 rounded-lg border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white">+ Add</button>
                        </div>
                      )) : <p className="px-2 py-3 text-center text-xs text-gray-500">No matching active products.</p>}
                    </div>
                    {products.length > 8 && <p className="mt-2 text-center text-2xs text-gray-400">Showing up to 8 matches · type to narrow the list</p>}
                  </div>
                )}
                {showCartPicker && cartItems.length > 0 && (
                  <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">Items in your cart</p>
                        <p className="text-2xs text-gray-500">Adding products here leaves your cart unchanged.</p>
                      </div>
                      <button type="button" onClick={() => cartItems.forEach(addCartItemToOrder)} className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-white hover:bg-primary-dark">Add all</button>
                    </div>
                    <div className="space-y-1.5">
                      {cartItems.map((cartItem) => (
                        <div key={cartItem.id ?? cartItem.product_id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-gray-800">{cartItem.name || cartItem.item_name}</p>
                            <p className="text-2xs text-gray-500">Qty {cartItem.quantity} · {Number(cartItem.price ?? cartItem.unit_price ?? 0).toLocaleString('fr-FR')} DA each</p>
                          </div>
                          <button type="button" onClick={() => addCartItemToOrder(cartItem)} className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Add</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {visibleItems.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Package size={18} /></div>
                      <p className="text-sm font-semibold text-gray-800">No products in this order yet</p>
                      <p className="mt-1 text-xs text-gray-500">Add at least one product before saving.</p>
                    </div>
                  ) : <div className="divide-y divide-gray-50">
                    {editItems.filter(item => !item.deleted).map((item) => {
                      const originalItem = order.order_items.find(oi => oi.id === item.id)
                      const product = originalItem?.products
                      return (
                        <div key={item.id} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-gray-50/70 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                              {(product?.image_url || item.product_image) ? (
                                <img src={product?.image_url || item.product_image} alt={product?.item_name || item.product_name} className="w-full h-full object-cover" />
                              ) : (
                                <Package size={16} className="text-gray-400 m-auto" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                              <p className="text-2xs text-gray-400">{item.unit_price?.toLocaleString('fr-FR')} DA each{item.isNew ? ' · added' : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <button type="button" aria-label={`Decrease ${item.product_name} quantity`} onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it))} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors">
                                <span className="text-xs font-semibold">-</span>
                              </button>
                              <input
                                type="number" min="1" aria-label={`${item.product_name} quantity`} value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 1
                                  setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, quantity: Math.max(1, val) } : it))
                                }}
                                className="w-14 text-center py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                              />
                              <button type="button" aria-label={`Increase ${item.product_name} quantity`} onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, quantity: it.quantity + 1 } : it))} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors">
                                <span className="text-xs font-semibold">+</span>
                              </button>
                            </div>
                            <span className="text-sm font-semibold text-gray-700 w-20 text-right">{(item.quantity * item.unit_price).toLocaleString('fr-FR')} DA</span>
                            <button type="button" aria-label={`Remove ${item.product_name} from order`} onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, deleted: true } : it))} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove item">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {editItems.filter(i => i.deleted).length > 0 && (
                      <div className="px-4 py-2 bg-red-50/50">
                        <p className="text-2xs font-semibold text-red-400 uppercase tracking-wide mb-1">Removed Items</p>
                        {editItems.filter(i => i.deleted).map(item => (
                          <div key={item.id} className="flex items-center justify-between py-1">
                            <span className="text-xs text-gray-400 line-through">{item.product_name}</span>
                            <button onClick={() => setEditItems(prev => prev.map(it => it.id === item.id ? { ...it, deleted: false } : it))} className="text-2xs font-semibold text-primary hover:underline">Undo</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>}
                  {visibleItems.length > 0 && <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span><span>{liveSubtotal.toLocaleString('fr-FR')} DA</span>
                    </div>
                    {liveAdjustment !== 0 && (
                      <div className={`flex justify-between text-xs font-medium ${liveAdjustment < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <span>{liveAdjustment < 0 ? 'Discount' : 'Extra Charge'}</span>
                        <span>{liveAdjustment > 0 ? '+' : ''}{liveAdjustment.toLocaleString('fr-FR')} DA</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-dashed border-gray-200">
                      <span className="text-sm font-semibold text-gray-900">New Total</span>
                      <span className="text-sm font-semibold text-primary">{liveTotal.toLocaleString('fr-FR')} DA</span>
                    </div>
                    {order.total_amount !== liveTotal && (
                      <div className="flex justify-between text-2xs text-amber-600 font-medium">
                        <span>Original Total</span><span>{order.total_amount?.toLocaleString('fr-FR')} DA</span>
                      </div>
                    )}
                  </div>}
                </div>
              </div>

              <div className="col-span-12 xl:col-span-5 space-y-4">
                <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Order Details
                </h4>
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Link Customer</label>
                    <CustomerSearch
                      selectedCustomer={editForm.customer_id ? { customer_id: editForm.customer_id, full_name: editForm.client_name, phone: editForm.client_phone } : null}
                      onSelect={(c) => setEditForm(prev => ({ ...prev, customer_id: c.customer_id, client_name: c.full_name, client_phone: c.phone || '' }))}
                      onClear={() => setEditForm(prev => ({ ...prev, customer_id: null, client_name: '', client_phone: '' }))}
                      placeholder="Search existing customer..."
                    />
                  </div>
                  {!editForm.customer_id && (
                    <>
                      <div>
                        <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Client Name</label>
                        <input type="text" value={editForm.client_name} onChange={(e) => setEditForm(prev => ({ ...prev, client_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                      </div>
                      <div>
                        <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
                        <input type="tel" value={editForm.client_phone} onChange={(e) => setEditForm(prev => ({ ...prev, client_phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Delivery Date</label>
                    <input type="date" value={editForm.delivery_date} onChange={(e) => setEditForm(prev => ({ ...prev, delivery_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Delivery Time</label>
                    <input type="time" value={editForm.delivery_time} onChange={(e) => setEditForm(prev => ({ ...prev, delivery_time: e.target.value }))} disabled={editForm.delivery_method === 'pickup'} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Delivery Method</label>
                    <select value={editForm.delivery_method} onChange={(e) => setEditForm(prev => ({ ...prev, delivery_method: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                      {Object.entries(deliveryConfig).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Payment Method</label>
                    <select value={editForm.payment_method} onChange={(e) => setEditForm(prev => ({ ...prev, payment_method: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                      {Object.entries(paymentConfig).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Source</label>
                    <select value={editForm.client_source} onChange={(e) => setEditForm(prev => ({ ...prev, client_source: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                      {Object.entries(sourceConfig).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </div>
                                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                      Adjustment (Discount - / Extra +)
                    </label>
                                       <input
                      type="number"
                      step="50"
                      value={editForm.price_adjustment || 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        setEditForm(prev => ({ ...prev, price_adjustment: val }))
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    {liveAdjustment !== 0 && (
                      <p className={`text-2xs mt-1 font-medium ${liveAdjustment < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {liveAdjustment < 0
                          ? `Discount: ${Math.abs(liveAdjustment).toLocaleString('fr-FR')} DA`
                          : `Extra charge: ${liveAdjustment.toLocaleString('fr-FR')} DA`}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
                    <textarea value={editForm.notes} onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none" />
                  </div>
                </div>
              </div>

              <div className="col-span-12">
                <div className="sticky bottom-2 z-10 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-center rounded-xl border border-gray-100 bg-white/95 p-4 shadow-lg shadow-gray-900/5 backdrop-blur">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {order.status === 'done' && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-2xs font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={12} /> Stock will adjust automatically
                    </div>
                  )}
                  {!editItems.some(i => !i.deleted) && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle size={14} /> Order must have at least one item
                    </div>
                  )}
                  <div className="flex items-baseline gap-4 text-xs text-gray-500">
                    <span>Subtotal <strong className="text-gray-800">{liveSubtotal.toLocaleString('fr-FR')} DA</strong></span>
                    <span>Adjustment <strong className="text-gray-800">{liveAdjustment.toLocaleString('fr-FR')} DA</strong></span>
                    <span className="text-sm font-semibold text-gray-900">New total <strong className="text-primary">{liveTotal.toLocaleString('fr-FR')} DA</strong></span>
                    {order.total_amount !== liveTotal && <span className="text-amber-700">Difference {liveTotal - order.total_amount > 0 ? '+' : ''}{(liveTotal - order.total_amount).toLocaleString('fr-FR')} DA</span>}
                  </div>
                  </div>
                  <div className="flex justify-end gap-2">
                  <button onClick={cancelEditing} disabled={editLoading} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors">
                    <X size={14} /> Cancel
                  </button>
                  <button onClick={handleSave} disabled={editLoading || !editItems.some(i => !i.deleted) || !editForm.client_name.trim()} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-40">
                    {editLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save Changes
                  </button>
                  </div>
                </div>
              </div>
            </div>

          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(17rem,.8fr)]">
              <div className="space-y-4">
                <section className="rounded-xl border border-gray-100 bg-white p-4" aria-label="Fulfillment details">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${delConfig.bg}`}><DelIcon size={16} className={delConfig.color} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{delConfig.label} · {order.delivery_date ? formatBusinessDate(order.delivery_date, 'en-GB') : 'Date not set'}{order.delivery_time ? ` · ${String(order.delivery_time).slice(0, 5)}` : ''}</p>
                      {order.delivery_method !== 'pickup' && <p className="mt-0.5 truncate text-sm font-medium text-gray-800">{[order.delivery_city, order.delivery_wilaya].filter(Boolean).join(', ') || 'Delivery location not set'}</p>}
                    </div>
                  </div>
                  {Number(order.delivery_fee_amount || 0) > 0 && <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">Delivery fee <span className="font-semibold text-gray-800">{Number(order.delivery_fee_amount).toLocaleString('fr-FR')} DA</span>{order.delivery_fee_collected && <span className="ml-1 text-emerald-700">· collected</span>}</p>}
                </section>

                <section className="overflow-hidden rounded-xl border border-gray-100 bg-white" aria-label="Products in order">
                  <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800"><ShoppingBag size={15} className="text-primary" /> Products</h4>
                    <span className="text-xs text-gray-500">{order.order_items?.length || 0} lines</span>
                  </header>
                  <div className="divide-y divide-gray-50">
                    {order.order_items?.map((item, index) => {
                      const product = item.products
                      const lineTotal = Number(item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0))
                      return <div key={item.id || index} className="flex items-center gap-3 px-4 py-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-sage">
                          {product?.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package size={16} className="text-gray-400" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{item.product_name || product?.item_name || `Product #${item.product_id}`}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">{item.quantity} × {Number(item.unit_price || 0).toLocaleString('fr-FR')} DA{(item.color || product?.color) ? ` · ${item.color || product.color}` : ''}{(item.flower_type || product?.flower_type) ? ` · ${item.flower_type || product.flower_type}` : ''}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">{lineTotal.toLocaleString('fr-FR')} DA</span>
                      </div>
                    })}
                  </div>
                  <footer className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                    <span className="text-sm font-semibold text-gray-700">Order total</span>
                    <span className="text-base font-bold tabular-nums text-primary">{Number(order.total_amount || 0).toLocaleString('fr-FR')} DA</span>
                  </footer>
                </section>

                {order.notes && <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" aria-label="Customer note">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Customer note</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-950">{order.notes}</p>
                </section>}
              </div>

              <aside className="space-y-4" aria-label="Order actions">
                {actions.status && <section className="rounded-xl border border-gray-100 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-800">Preparation status</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusConfig).map(([status, cfg]) => {
                      const SIcon = cfg.icon
                      const isCurrent = order.status === status
                      if (!isCurrent && !allowedStatusTargets.includes(status)) return null
                      return <button key={status} type="button" onClick={() => !isCurrent && onStatusChange(order.id, status)} disabled={isCurrent} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${isCurrent ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'border-gray-200 bg-white text-gray-600 hover:border-primary/30 hover:bg-primary/5'}`}>
                        <SIcon size={13} /> {cfg.label}{isCurrent && <CheckCircle2 size={13} />}
                      </button>
                    })}
                  </div>
                </section>}

                <section className="rounded-xl border border-gray-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">Payment</h4>
                      <p className={`mt-1 text-xs font-semibold ${payStatusConfig.text}`}>{getPaymentStatusLabel(order, payStatusConfig.label)}</p>
                    </div>
                    {(order.payment_status === 'partial' || order.payment_status === 'unpaid') && <div className="text-right">
                      <p className="text-2xs text-gray-500">Remaining</p>
                      <p className="text-sm font-bold tabular-nums text-danger">{Number(order.amount_due ?? (order.total_amount - (order.amount_paid || 0))).toLocaleString('fr-FR')} DA</p>
                    </div>}
                  </div>
                  {Number(order.amount_paid || 0) > 0 && <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">Paid <span className="font-semibold tabular-nums text-gray-800">{Number(order.amount_paid).toLocaleString('fr-FR')} DA</span></p>}
                  {(actions.payment || (actions.refund && order.payment_status === 'paid')) && (showPaymentPanel ? (
                    <PaymentPanel order={order} exchangeRate={exchangeRate} allowRefund={actions.refund} onClose={() => setShowPaymentPanel(false)} onMarkAsPaid={onMarkAsPaid} onRecordPartial={onRecordPartial} onRefund={onRefund} />
                  ) : <button type="button" onClick={() => setShowPaymentPanel(true)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark">
                    <Wallet size={14} /> Manage payment
                  </button>)}
                </section>

                <button type="button" onClick={() => onViewReceipt(order)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
                  <Printer size={15} /> Print receipt
                </button>
              </aside>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function StatsBar({ stats }) {
  const statItems = [
    { label: 'Total orders', value: stats.total, icon: Hash, color: 'text-primary', bg: 'bg-primary-subtle' },
    { label: 'Today', value: stats.today, icon: Calendar, color: 'text-accent', bg: 'bg-accent-subtle' },
    { label: 'Payments Collected', value: `${stats.totalRevenue.toLocaleString('fr-FR')} DA`, icon: DollarSign, color: 'text-primary', bg: 'bg-primary-subtle' },
    { label: 'Outstanding', value: `${stats.outstanding.toLocaleString('fr-FR')} DA`, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning-subtle' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {statItems.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-3.5 shadow-sm sm:p-4">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${s.bg}`}>
              <Icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tabular-nums text-gray-900 sm:text-lg">{s.value}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Orders() {
  const PAGE_SIZE = 30
  const { items: cartItems } = useCartContext()
  const { products } = useProducts()
  const {
    orders, allOrders, loading,
    statusFilter, setStatusFilter,
    paymentFilter, setPaymentFilter,
    deliveryRange, setDeliveryRange,
    searchQuery, setSearchQuery,
    sortBy, sortDir,
    stats, statusCounts, paymentCounts,
    processingFlowersByColor,
    updateStatus, restoreVoidedOrder, markAsPaid, recordPartialPayment, recordRefund,
    updateOrder, delayOrder, refresh, refreshOrder, toggleSort,
  } = useOrders()

  const { addNotification } = useNotification()
  const confirm = useConfirm()
  const { offerUndo, dismissUndo } = useUndo()
  const { role } = useAuth()
  const actions = orderActionsFor(role)
  const { settings: shopSettings } = useSettings()
  const usdExchangeRate = Number(shopSettings.usd_exchange_rate) || 0
  const navigate = useNavigate()
  const location = useLocation()
  // Restored from the last visit so returning from a receipt (or any other
  // page) puts the user back exactly where they were.
  const [expandedOrder, setExpandedOrder] = useState(() => ordersViewState.expandedOrder ?? null)
  const [page, setPage] = useState(() => ordersViewState.page ?? 0)
  const [focusRequestedOrder, setFocusRequestedOrder] = useState(null)
  const [showFlowerPanel, setShowFlowerPanel] = useState(() => ordersViewState.showFlowerPanel ?? false)
  const [queueFilter, setQueueFilter] = useState(() => ordersViewState.queueFilter ?? 'all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => ordersViewState.showAdvancedFilters ?? false)

  useEffect(() => {
    Object.assign(ordersViewState, { expandedOrder, page, showFlowerPanel, queueFilter, showAdvancedFilters })
  }, [expandedOrder, page, showFlowerPanel, queueFilter, showAdvancedFilters])
  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(deliveryRange !== 'all') + Number(statusFilter !== 'all') + Number(paymentFilter !== 'all') + Number(queueFilter !== 'all')

  useEffect(() => {
    const dashboardFilter = location.state?.dashboardFilter
    const shippingOrderId = location.state?.shippingOrderId
    if (shippingOrderId) {
      setQueueFilter('all')
      setSearchQuery('')
      setDeliveryRange('all')
      setStatusFilter('all')
      setPaymentFilter('all')
      setFocusRequestedOrder(shippingOrderId)
    } else if (dashboardFilter === 'due') {
      setQueueFilter('all')
      setSearchQuery('')
      setDeliveryRange('all')
      setStatusFilter('all')
      setPaymentFilter('due')
    } else if (dashboardFilter === 'stale') {
      setQueueFilter('all')
      setSearchQuery('')
      setPaymentFilter('all')
      setStatusFilter('all')
      setDeliveryRange('stale')
    }
  }, [location.key])

  // Keep the DOM light: every order row owns edit, payment, and delay state.
  // Rendering the full history at once made even local clicks feel sluggish.
  const queueOrders = useMemo(() => {
    const today = localDateString()
    const weekEnd = addCalendarDays(today, 6)
    const prepareDateFor = (order) => {
      const plan = getShippingPlan(order, today)
      if (plan?.shipDate) return plan.shipDate
      return order.delivery_date ? String(order.delivery_date).slice(0, 10) : null
    }
    if (queueFilter === 'prep_week') return orders
      .filter((order) => {
        const prepareDate = prepareDateFor(order)
        return prepareDate && prepareDate >= today && prepareDate <= weekEnd
      })
      .sort((a, b) => String(prepareDateFor(a)).localeCompare(String(prepareDateFor(b))) || String(a.preferred_time || '').localeCompare(String(b.preferred_time || '')))
    if (queueFilter === 'dispatch_today') return orders.filter((order) => {
      if (['cancelled', 'done'].includes(order.status) || order.order_type === 'quick_sale') return false
      const prepareDate = prepareDateFor(order)
      return prepareDate && prepareDate <= today
    })
    if (queueFilter === 'needs_dispatch') return orders.filter((order) => {
      if (['cancelled', 'done'].includes(order.status) || order.order_type === 'quick_sale') return false
      return getShippingPlan(order)?.urgency === 'attention' || !order.delivery_date
    })
    return orders
  }, [orders, queueFilter])
  const pageCount = Math.max(1, Math.ceil(queueOrders.length / PAGE_SIZE))
  const visibleOrders = useMemo(
    () => queueOrders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [queueOrders, page]
  )
  const firstVisibleOrder = queueOrders.length === 0 ? 0 : page * PAGE_SIZE + 1
  const lastVisibleOrder = Math.min((page + 1) * PAGE_SIZE, queueOrders.length)

  const dispatchPlan = useMemo(() => {
    const today = localDateString()
    const weekEnd = addCalendarDays(today, 6)
    const activeOrders = allOrders.filter((order) => !['cancelled', 'done'].includes(order.status) && order.order_type !== 'quick_sale')
    const week = allOrders.filter((order) => {
      if (['cancelled', 'done'].includes(order.status) || order.order_type === 'quick_sale') return false
      const plan = getShippingPlan(order, today)
      const prepareDate = plan?.shipDate || (order.delivery_date ? String(order.delivery_date).slice(0, 10) : null)
      return prepareDate && prepareDate >= today && prepareDate <= weekEnd
    })
    return {
      today: activeOrders.filter((order) => {
        const plan = getShippingPlan(order, today)
        const prepareDate = plan?.shipDate || (order.delivery_date ? String(order.delivery_date).slice(0, 10) : null)
        return prepareDate && prepareDate <= today
      }),
      needsAttention: activeOrders.filter((order) => getShippingPlan(order, today)?.urgency === 'attention' || !order.delivery_date),
      week,
    }
  }, [allOrders])

  // Changing a filter goes back to page 1, but not on mount, where the page
  // number was just restored from the previous visit.
  const filtersMountedRef = useRef(false)
  useEffect(() => {
    if (!filtersMountedRef.current) { filtersMountedRef.current = true; return }
    setPage(0)
  }, [searchQuery, deliveryRange, statusFilter, paymentFilter, sortBy, sortDir])

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  useEffect(() => {
    if (!focusRequestedOrder) return
    const targetIndex = orders.findIndex((order) => order.id === focusRequestedOrder)
    if (targetIndex < 0) return
    setPage(Math.floor(targetIndex / PAGE_SIZE))
    setExpandedOrder(focusRequestedOrder)
    setFocusRequestedOrder(null)
    window.setTimeout(() => document.getElementById(`order-card-${focusRequestedOrder}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }, [orders, focusRequestedOrder])

  const clearOrderFilters = () => {
    setQueueFilter('all')
    setSearchQuery('')
    setDeliveryRange('all')
    setStatusFilter('all')
    setPaymentFilter('all')
    setPage(0)
    setShowAdvancedFilters(false)
  }

  const selectWorkQueue = (nextQueue) => {
    setQueueFilter((current) => current === nextQueue ? 'all' : nextQueue)
    setSearchQuery('')
    setDeliveryRange('all')
    setStatusFilter('all')
    setPaymentFilter('all')
    setPage(0)
  }

  const handleStatusChange = async (orderId, newStatus) => {
    const currentOrder = allOrders.find((order) => order.id === orderId)
    if (newStatus === 'cancelled' && !actions.cancel) return
    if (currentOrder?.status === 'cancelled' && newStatus !== 'cancelled') {
      const confirmed = await confirm({
        title: 'Reopen this cancelled order?',
        message: 'Stock will be reserved again. Any cash refund already issued stays recorded; check the payment panel before collecting again.',
        confirmLabel: 'Reopen order',
        cancelLabel: 'Keep cancelled',
        danger: false,
      })
      if (!confirmed) return
      dismissUndo()
    }

    if (newStatus === 'cancelled') {
      const confirmed = await confirm({
        title: 'Are you sure you want to cancel this order?',
        message: 'This will cancel the order and restore its reserved stock.',
        confirmLabel: 'Yes, cancel order',
        cancelLabel: 'Keep order',
        danger: true,
      })
      if (!confirmed) return
    }

    try {
      await updateStatus(orderId, newStatus)
      if (newStatus === 'cancelled') {
        offerUndo({
          message: 'Order cancelled.',
          onUndo: async () => {
            try {
              await restoreVoidedOrder(orderId)
              addNotification('Cancellation undone. Order, stock, and payment state restored.', 'success')
            } catch (err) {
              addNotification(err.message || 'Could not undo the cancellation.', 'error')
            }
          },
        })
        return
      }
      addNotification(
        `Order status updated to ${statusConfig[newStatus]?.label || newStatus}`,
        'success'
      )
    } catch (err) {
      addNotification(err.message || 'Could not update the order status.', 'error')
    }
  }

  const handleMarkAsPaid = async (orderId, paymentMethod = null, notes = '', requestId = null) => {
    try {
      await markAsPaid(orderId, paymentMethod, notes, requestId)
      addNotification('Order marked as fully paid', 'success')
      return true
    } catch (err) {
      addNotification(err.message || 'Could not record the payment.', 'error')
      return false
    }
  }

  const handleRecordPartial = async (orderId, amount, notes, paymentMethod = null, requestId = null) => {
    try {
      await recordPartialPayment(orderId, amount, notes, paymentMethod, requestId)
      addNotification(`Recorded ${Number(amount).toLocaleString('fr-FR')} DA payment`, 'success')
      return true
    } catch (err) {
      addNotification(err.message || 'Could not record the payment.', 'error')
      return false
    }
  }

  const handleRefund = async (orderId, amount, notes, paymentMethod = null, requestId = null) => {
    try {
      await recordRefund(orderId, amount, notes, paymentMethod, requestId)
      addNotification(
        `Refund of ${Number(amount).toLocaleString('fr-FR')} DA recorded`,
        'success'
      )
      return true
    } catch (err) {
      addNotification(err.message || 'Could not record the refund.', 'error')
      return false
    }
  }
  const handleDelete = async (order) => {
    try {
      await archiveOrder(order.id)
      await refreshOrder(order.id)
      addNotification(`Order #${order.order_number} archived with its history`, 'success')
      if (expandedOrder === order.id) setExpandedOrder(null)
    } catch (err) {
      addNotification(err.message || 'Could not delete the order.', 'error')
    }
  }

  const handleViewReceipt = (order) => {
    navigate(`/orders/receipt?id=${order.id}`)
  }
  const handleUpdateOrder = async (orderId, updates) => {
    try {
      await updateOrder(orderId, updates)
      addNotification('Order updated', 'success')
      return true
    } catch (err) {
      addNotification(err.message || 'Could not update the order.', 'error')
      return false
    }
  }

  const handleSaveShippingRoute = async (orderId, place) => {
    const { data, error } = await supabase.functions.invoke('calculate-shipping-route', {
      body: {
        order_id: orderId,
        delivery_city: place.label,
        delivery_wilaya: place.wilaya || '',
        delivery_latitude: place.latitude,
        delivery_longitude: place.longitude,
      },
    })
    if (error) throw new Error(await getFunctionErrorMessage(error, 'Could not save this route.'))
    if (data?.error) throw new Error(data.error)
    await refreshOrder(orderId)
    addNotification('Prepare-by date updated.', 'success')
  }

  const focusShippingOrder = (order) => {
    setQueueFilter('all')
    setDeliveryRange('all')
    setStatusFilter('all')
    setPaymentFilter('all')
    setSearchQuery(String(order.order_number))
    setPage(0)
    setFocusRequestedOrder(order.id)
  }

  const handleDelayOrder = async (orderId, deliveryDate, reason) => {
    try {
      await delayOrder(orderId, deliveryDate, reason)
      addNotification('Order date updated and reschedule recorded', 'success')
      return true
    } catch (err) {
      return err.message || 'Could not delay the order.'
    }
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1600px] space-y-5 pb-6">
        <header className="relative isolate flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-3xl border border-sage-dark/70 bg-gradient-to-br from-white via-white to-primary-subtle/50 px-5 py-5 shadow-sm sm:px-7 sm:py-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Sales workspace · {allOrders.length} orders</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Orders</h1>
            <p className="mt-1 text-sm text-gray-600">Search, prepare dispatch, and keep every order moving.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate('/orders/quick-sales')} className="flex min-h-11 items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3.5 text-sm font-semibold text-purple-800 transition hover:bg-purple-100">
              <Zap size={15} /> <span>Quick sales</span>
            </button>
            {actions.delete && <button type="button" onClick={() => navigate('/orders/archived')} className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
              <Archive size={15} /> <span>Archived</span>
            </button>}
            <button type="button" onClick={refresh} aria-label="Refresh orders" className="flex min-h-11 items-center gap-2 rounded-xl border border-sage-dark/80 bg-white/90 px-3.5 text-sm font-medium text-gray-700 transition hover:border-primary/25 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
              <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowFlowerPanel(v => !v)}
                className={`grid h-11 w-11 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                  showFlowerPanel ? 'border-accent bg-accent text-white shadow-sm' : 'border-sage-dark/80 bg-white text-accent hover:border-accent/30 hover:bg-accent-subtle'
                }`}
                title="Flowers required for processing"
              >
                <Flower2 size={16} />
              </button>
              <div className={`absolute right-0 top-12 z-50 w-72 rounded-2xl border border-sage-dark/80 bg-white p-4 shadow-xl origin-top-right transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                showFlowerPanel ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-900">Flowers Required</h4>
                  <span className="text-2xs text-gray-400 font-medium">Processing</span>
                </div>
                {processingFlowersByColor.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Nothing in processing</p>
                    <p className="text-2xs text-gray-400">
                      Colours appear here once products have one set
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {processingFlowersByColor.map(({ color, quantity }) => (
                      <div
                        key={color}
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <Swatch colour={color} size={11} />
                        <span className="text-2xs text-gray-700 capitalize">{color}</span>
                        <span className="text-2xs font-semibold text-accent tabular">{quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button type="button" onClick={() => navigate('/cart')} className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
              <ShoppingBag size={14} /> New Order
            </button>
          </div>
        </header>

        <section aria-label="Priority work queues" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Work queues</h2>
              <p className="mt-0.5 text-xs text-gray-500">Open the orders that need attention first.</p>
            </div>
            {queueFilter !== 'all' && <button type="button" onClick={() => selectWorkQueue(queueFilter)} className="text-xs font-semibold text-primary hover:underline">Show all orders</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { id: 'prep_week', label: 'Next 7 days', count: dispatchPlan.week.length, detail: 'Sorted by preparation day and time', tone: 'blue' },
              { id: 'dispatch_today', label: 'Prepare today', count: dispatchPlan.today.length, detail: 'Due today or overdue', tone: 'rose' },
              { id: 'needs_dispatch', label: 'Needs attention', count: dispatchPlan.needsAttention.length, detail: 'Date or destination needs review', tone: 'amber' },
            ].map((queue) => {
              const active = queueFilter === queue.id
              const tones = {
                rose: active ? 'border-rose-300 bg-rose-50 ring-2 ring-rose-100' : 'border-rose-200/80 bg-white hover:bg-rose-50/60',
                amber: active ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-100' : 'border-amber-200/80 bg-white hover:bg-amber-50/60',
                blue: active ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-blue-200/80 bg-white hover:bg-blue-50/60',
              }
              return <button key={queue.id} type="button" aria-pressed={active} onClick={() => selectWorkQueue(queue.id)} className={`flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${tones[queue.tone]}`}>
                <span className="min-w-0"><span className="block text-sm font-semibold text-gray-900">{queue.label}</span><span className="mt-0.5 block truncate text-xs text-gray-500">{queue.detail}</span></span>
                <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-white px-2 text-sm font-bold tabular-nums text-gray-900 shadow-sm">{queue.count}</span>
              </button>
            })}
          </div>
        </section>

        <StatsBar stats={stats} />

        <section aria-label="Search and filter orders" className="space-y-4 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="order-search" className="mb-1.5 block text-xs font-semibold text-gray-600">Find an order</label>
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                <input
                  id="order-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search order number, customer, phone, product, or note"
                  className="min-h-12 w-full rounded-xl border border-sage-dark bg-sage/30 py-3 pl-11 pr-10 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                />
                {searchQuery && <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={14} /></button>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-expanded={showAdvancedFilters} onClick={() => setShowAdvancedFilters((shown) => !shown)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-sage-dark px-3.5 text-sm font-semibold text-gray-700 transition hover:bg-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <Layers size={15} /> Filters{activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] text-white">{activeFilterCount}</span>}<ChevronDown size={14} className={`transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['all', 'new', 'processing', 'done', 'cancelled'].map((status) => {
              const isActive = statusFilter === status
              const cfg = status !== 'all' ? statusConfig[status] : null
              const label = status === 'all' ? 'All orders' : cfg.label
              return <button key={status} type="button" aria-pressed={isActive} onClick={() => setStatusFilter(status)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition ${isActive ? (status === 'all' ? 'border-primary bg-primary text-white' : `${cfg.bg} ${cfg.text} ${cfg.border}`) : 'border-sage-dark/70 bg-white text-gray-500 hover:border-primary/20 hover:text-gray-800'}`}>
                {label}<span className={`ml-1.5 tabular-nums ${isActive ? 'opacity-70' : 'text-gray-400'}`}>{statusCounts[status]}</span>
              </button>
            })}
          </div>

          {showAdvancedFilters && <div className="grid gap-3 border-t border-sage-dark/60 pt-4 xl:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-sage-dark/50 bg-sage/20 p-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700">Delivery date</p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-xl bg-sage/50 p-1">
                {[
                  ['all', 'Any date'], ['today', 'Today'], ['week', 'Next 7 days'],
                  ['month', 'This month'], ['unscheduled', 'No date'], ['stale', 'Needs review'],
                ].map(([range, label]) => (
                  <button key={range} type="button" aria-pressed={deliveryRange === range} onClick={() => setDeliveryRange(range)} className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all ${deliveryRange === range ? 'bg-white text-primary shadow-sm ring-1 ring-sage-dark/60' : 'text-gray-500 hover:text-gray-800'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 rounded-xl border border-sage-dark/50 bg-sage/20 p-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700">Payment</p>
                <span className="text-[10px] text-gray-400">Collection</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'due', 'paid', 'partial', 'unpaid', 'refunded'].map((status) => {
                  const isActive = paymentFilter === status
                  const cfg = !['all', 'due'].includes(status) ? paymentStatusConfig[status] : null
                  const label = status === 'all' ? 'All payments' : status === 'due' ? 'Balance due' : cfg.label
                  return <button key={status} type="button" aria-pressed={isActive} onClick={() => setPaymentFilter(status)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition ${isActive ? (status === 'all' ? 'border-primary bg-primary text-white' : status === 'due' ? 'border-danger/20 bg-danger-subtle text-danger' : `${cfg.bg} ${cfg.text} ${cfg.border}`) : 'border-sage-dark/70 bg-white text-gray-500 hover:border-primary/20 hover:text-gray-800'}`}>
                    {label}<span className={`ml-1.5 tabular-nums ${isActive ? 'opacity-70' : 'text-gray-400'}`}>{paymentCounts[status]}</span>
                  </button>
                })}
              </div>
            </div>
          </div>}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sage-dark/60 pt-3 text-xs">
            <p className="text-gray-500">Showing <span className="font-semibold text-gray-900">{firstVisibleOrder}–{lastVisibleOrder}</span> of {queueOrders.length} matching orders <span className="text-gray-400">({allOrders.length} total)</span></p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-sage/50 p-0.5">
                <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sort</span>
                {[{ field: 'date', label: 'Created' }, { field: 'amount', label: 'Amount' }, { field: 'status', label: 'Status' }].map(({ field, label }) => {
                  const ActiveSortIcon = sortDir === 'asc' ? ChevronUp : ChevronDown
                  return <button key={field} type="button" aria-pressed={sortBy === field} onClick={() => toggleSort(field)} className={`flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition ${sortBy === field ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{label}{sortBy === field && <ActiveSortIcon size={12} />}</button>
                })}
              </div>
              {activeFilterCount > 0 && <button type="button" onClick={clearOrderFilters} className="rounded-lg px-2.5 py-1.5 font-semibold text-primary hover:bg-primary-subtle">Clear <span className="ml-1 rounded-full bg-primary-subtle px-1.5 py-0.5">{activeFilterCount}</span></button>}
            </div>
          </div>
        </section>

        {loading ? (
          <ListSkeleton rows={7} avatar />
        ) : queueOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sage-dark bg-white px-6 py-14 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sage text-gray-400">
              <Package size={26} />
            </div>
            <p className="text-base font-semibold text-gray-800">{allOrders.length === 0 ? 'No orders yet' : queueFilter !== 'all' ? 'Nothing in this work queue' : 'No orders match these filters'}</p>
            <p className="mt-1 text-sm text-gray-500">{allOrders.length === 0 ? 'New orders will appear here.' : queueFilter !== 'all' ? 'Everything here is up to date. Choose another queue or return to all orders.' : 'Try changing your search or filter selection.'}</p>
            {activeFilterCount > 0 ? (
              <button type="button" onClick={clearOrderFilters} className="mt-4 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Clear filters</button>
            ) : allOrders.length === 0 ? (
              <button type="button" onClick={() => navigate('/cart')} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"><ShoppingBag size={15} /> Create an order</button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="hidden px-5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 2xl:flex 2xl:items-center 2xl:gap-3">
              <div className="w-[132px] shrink-0">Order</div>
              <div className="w-[150px] shrink-0">Client</div>
              <div className="w-[112px] shrink-0">Dates</div>
              <div className="w-[64px] shrink-0 text-center">Items</div>
              <div className="w-[112px] shrink-0 text-right">Total</div>
              <div className="w-[112px] shrink-0">Status</div>
              <div className="w-[88px] shrink-0">Payment</div>
              <div className="ml-auto shrink-0">Actions</div>
            </div>
            {visibleOrders.map((order, index) => {
              const plan = getShippingPlan(order)
              const prepDate = plan?.shipDate || (order.delivery_date ? String(order.delivery_date).slice(0, 10) : null)
              const previousOrder = visibleOrders[index - 1]
              const previousPlan = previousOrder ? getShippingPlan(previousOrder) : null
              const previousPrepDate = previousPlan?.shipDate || (previousOrder?.delivery_date ? String(previousOrder.delivery_date).slice(0, 10) : null)
              const startsDay = queueFilter === 'prep_week' && prepDate && prepDate !== previousPrepDate
              const dayLabel = prepDate === localDateString()
                ? 'Today'
                : prepDate === addCalendarDays(localDateString(), 1)
                  ? 'Tomorrow'
                  : formatBusinessDate(prepDate, 'en', { weekday: 'long', month: 'short', day: 'numeric' })
              const dayCount = startsDay ? queueOrders.filter((candidate) => {
                const candidatePlan = getShippingPlan(candidate)
                return (candidatePlan?.shipDate || (candidate.delivery_date ? String(candidate.delivery_date).slice(0, 10) : null)) === prepDate
              }).length : 0
              return (
                <div key={order.id} className="space-y-2">
                  {startsDay && <div className="flex items-center justify-between px-1 pt-2"><h3 className="text-xs font-bold uppercase tracking-wide text-gray-700">{dayLabel}</h3><span className="text-xs text-gray-400">{dayCount} {dayCount === 1 ? 'order' : 'orders'}</span></div>}
                  <OrderRow
                    order={order}
                    cartItems={cartItems}
                    products={products}
                    exchangeRate={usdExchangeRate}
                    actions={actions}
                    isExpanded={expandedOrder === order.id}
                    onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onViewReceipt={handleViewReceipt}
                    onMarkAsPaid={handleMarkAsPaid}
                    onRecordPartial={handleRecordPartial}
                    onRefund={handleRefund}
                    onUpdateOrder={handleUpdateOrder}
                    onDelayOrder={handleDelayOrder}
                    onSaveShippingRoute={handleSaveShippingRoute}
                  />
                </div>
              )
            })}
            {pageCount > 1 && (
              <div className="flex items-center justify-between rounded-2xl border border-sage-dark/70 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">Page <span className="font-semibold text-gray-800">{page + 1}</span> of {pageCount}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                  <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </DashboardLayout>
  )
}

export default Orders
