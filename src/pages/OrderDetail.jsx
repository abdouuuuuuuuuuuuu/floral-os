import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Printer, Package, Truck, Bike, Store, Phone,
  Calendar, CreditCard, DollarSign, Smartphone, CheckCircle2,
  User, Hash, StickyNote, Edit3, Trash2, X, Save, MapPin,
  Clock3, CalendarCheck2, Route, BadgeCheck, History
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { supabase } from '../lib/supabase'
import { useNotification } from '../context/NotificationContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { orderActionsFor } from '../lib/permissions'
import { useShopName } from '../hooks/useShopName'
import { printOrderReceipt } from '../utils/orderReceipt'
import { archiveOrder, reopenVoidedOrder, restoreVoidedOrder, saveOrderEdits, setOrderStatus, voidOrder } from '../lib/orders'
import { useUndo } from '../context/UndoContext'
import { orderStatusTargets } from '../lib/orderStatus'
import { formatBusinessDate } from '../lib/businessDate.js'
import { formatDistance, shipByDate, transitDaysForRoadDistance } from '../lib/shippingPlan.js'

const statusConfig = {
  new:        { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    label: 'New',        dot: 'bg-rose-500' },
  processing: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'Processing', dot: 'bg-amber-500' },
  done:       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Done',  dot: 'bg-emerald-500' },
  cancelled:  { bg: 'bg-slate-100',  border: 'border-slate-200',   text: 'text-slate-600',   label: 'Cancelled',  dot: 'bg-slate-400' },
}

const paymentConfig = {
  cash: { label: 'Cash', icon: DollarSign },
  baridimob: { label: 'BaridiMob', icon: Smartphone },
  usd: { label: 'USDT', icon: DollarSign },
}

const methodIcons = {
  motorcycle: Bike,
  dhd: Truck,
  pickup: Store,
}

const activityFieldLabels = {
  status: 'Status',
  delivery_handed_off_at: 'Courier handoff',
  delivery_attempt_reason: 'Attempt reason',
  delivery_attempt_resolution: 'Outcome',
  delivery_date: 'Delivery date',
  delivery_time: 'Delivery time',
  delivery_method: 'Fulfillment',
  delivery_city: 'Town',
  delivery_wilaya: 'Wilaya',
  destination_map_point: 'Map location',
  shipping_distance_km: 'Road distance',
  shipping_transit_days: 'Transit time',
  shipping_route_calculated_at: 'Route estimate',
  shipping_route_provider: 'Route provider',
  shipping_route_duration_seconds: 'Route duration',
  original_delivery_date: 'Original delivery date',
  delayed_at: 'Delay record',
  delay_reason: 'Delay reason',
  payment_method: 'Payment method',
  payment_status: 'Payment status',
  subtotal_amount: 'Subtotal',
  tax_amount: 'Tax',
  total_amount: 'Order total',
  amount_paid: 'Paid',
  amount_due: 'Remaining',
  price_adjustment: 'Price adjustment',
  delivery_fee_amount: 'Delivery fee',
  delivery_fee_collected: 'Delivery fee collected',
  delivery_fee_payment_method: 'Delivery fee method',
  client_source: 'Customer source',
  order_type: 'Order type',
  deleted_at: 'Archive status',
  customer_details: 'Customer details',
  notes: 'Order notes',
  payment_notes: 'Payment note',
  quantity: 'Quantity',
  unit_price: 'Unit price',
  line_total: 'Line total',
}

function formatActivityValue(field, value) {
  if (value == null || value === '') return 'Not set'
  if (field === 'delivery_date' || field === 'deleted_at') {
    return formatBusinessDate(value, 'en-GB') || 'Not set'
  }
  if (field === 'delivery_handed_off_at') return new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Algiers', dateStyle: 'medium', timeStyle: 'short' })
  if (field === 'original_delivery_date') return formatBusinessDate(value, 'en-GB') || 'Not set'
  if (field === 'shipping_route_calculated_at') return value ? 'Updated' : 'Cleared'
  if (field === 'delayed_at') return value ? 'Recorded' : 'Cleared'
  if (['subtotal_amount', 'tax_amount', 'total_amount', 'amount_paid', 'amount_due', 'price_adjustment', 'delivery_fee_amount', 'unit_price', 'line_total'].includes(field)) {
    return `${Number(value).toLocaleString('fr-FR')} DA`
  }
  if (field === 'quantity') return String(value)
  if (field === 'shipping_distance_km') return formatDistance(value)
  if (field === 'shipping_route_duration_seconds') return `${Math.max(1, Math.round(Number(value) / 60))} min`
  if (field === 'shipping_transit_days') return `${value} day${Number(value) === 1 ? '' : 's'}`
  if (field === 'delivery_fee_collected') return value ? 'Yes' : 'No'
  if (field === 'destination_map_point') return value ? 'Changed' : 'Unchanged'
  if (field === 'status' || field === 'payment_status' || field === 'delivery_method' || field === 'payment_method' || field === 'delivery_fee_payment_method') {
    return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  }
  return String(value)
}

function activityChangeLines(changes = {}) {
  return Object.entries(changes).flatMap(([field, change]) => {
    const label = activityFieldLabels[field]
    if (!label) return []
    if (change?.changed) return [`${label} updated`]
    if (Object.hasOwn(change || {}, 'from') || Object.hasOwn(change || {}, 'to')) {
      return [`${label}: ${formatActivityValue(field, change.from)} → ${formatActivityValue(field, change.to)}`]
    }
    return []
  })
}

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { offerUndo, dismissUndo } = useUndo()
  const { addNotification } = useNotification()
  const { role, user } = useAuth()
  const shopName = useShopName()
  const actions = orderActionsFor(role)

  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showDeleteOptions, setShowDeleteOptions] = useState(false)
  const [activityEvents, setActivityEvents] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [externalUpdate, setExternalUpdate] = useState(null)

  useEffect(() => {
    fetchOrder()
  }, [id])

  const fetchOrder = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(
            *,
            products(
              product_id,
              item_name,
              image_url,
              color,
              flower_type,
              category,
              description
            )
          )
        `)
        .is('deleted_at', null)
        .eq('id', id)
        .maybeSingle()

      if (orderError) throw orderError
      if (!orderData) {
        addNotification('This order is unavailable. It may have been archived.', 'warning')
        navigate('/orders', { replace: true })
        return
      }

      setOrder(orderData)
      setItems(orderData.order_items || [])
      if (!silent) setActivityLoading(true)
      setActivityError('')
      const { data: events, error: eventsError } = await supabase
        .from('order_events')
        .select('id, event_type, summary, actor_id, actor_name, actor_role, actor_type, changes, occurred_at')
        .eq('order_id', id)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100)
      if (eventsError) {
        console.error('Fetch order activity error:', eventsError)
        setActivityEvents([])
        setActivityError('Order activity is unavailable. Apply the order activity migration, then refresh.')
      } else {
        setActivityEvents(events || [])
        setActivityError('')
      }
      setEditForm({
        client_name: orderData.client_name || '',
        client_phone: orderData.client_phone || '',
        delivery_date: orderData.delivery_date || '',
        delivery_method: orderData.delivery_method || 'motorcycle',
        payment_method: orderData.payment_method || 'cash',
        status: orderData.status || 'new',
        notes: orderData.notes || '',
      })
    } catch (err) {
      console.error('Fetch order error:', err)
      if (!silent) {
        addNotification('Could not load this order. Check your connection and try again.', 'error')
        navigate('/orders', { replace: true })
      }
    } finally {
      if (!silent) {
        setActivityLoading(false)
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!id) return undefined
    let active = true
    const refreshQuietly = () => { if (active) void fetchOrder({ silent: true }) }
    const channel = supabase
      .channel(`order-detail-live-${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_events', filter: `order_id=eq.${id}`,
      }, (payload) => {
        if (!active) return
        const event = payload.new
        if (event?.actor_type === 'user' && event.actor_id && event.actor_id !== user?.id) {
          setExternalUpdate({ summary: event.summary, actor: event.actor_name, id: event.id })
        }
        void fetchOrder({ silent: true })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refreshQuietly()
      })
    window.addEventListener('online', refreshQuietly)
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshQuietly() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      window.removeEventListener('online', refreshQuietly)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [id, user?.id])

  const handleStatusChange = async (newStatus) => {
    if (!actions.status) return
    const wasCancelled = order.status === 'cancelled'
    if (newStatus === 'cancelled' && !actions.cancel) return

    if (wasCancelled && newStatus !== 'cancelled') {
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

    setUpdating(true)
    try {
      if (newStatus === 'cancelled') {
        await voidOrder(id, 'Cancelled from order details')
        await fetchOrder()
        offerUndo({
          message: `Order #${order.order_number} cancelled.`,
          onUndo: async () => {
            try {
              await restoreVoidedOrder(id)
              await fetchOrder()
              addNotification('Cancellation undone. Order, stock, and payment state restored.', 'success')
            } catch (err) {
              addNotification(err.message || 'Could not undo the cancellation.', 'error')
            }
          },
        })
      } else if (wasCancelled) {
        await reopenVoidedOrder(id, newStatus)
        await fetchOrder()
      } else {
        await setOrderStatus(id, newStatus)
        await fetchOrder()
      }
      addNotification(`Order marked as ${statusConfig[newStatus]?.label || newStatus}`, 'success')
    } catch (err) {
      addNotification(err.message || 'Failed to update status', 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleArchive = async () => {
    if (!actions.archive) return
    const ok = await confirm({
      title: 'Archive this order?',
      message: 'It will disappear from active orders, while its items, payments, stock movements, and audit history remain available in the records. Permanent deletion is available only through the exact Blossom Assistant command.',
      confirmLabel: 'Archive with history',
      danger: false,
    })
    if (!ok) return

    try {
      setUpdating(true)

      await archiveOrder(id)
      addNotification('Order archived with its history', 'success')
      navigate('/orders')
    } catch (err) {
      console.error('Delete error:', err)
      addNotification(`Failed to delete: ${err.message}`, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleEditToggle = () => {
    if (!actions.edit) return
    if (isEditing) {
      setEditForm({
        client_name: order.client_name || '',
        client_phone: order.client_phone || '',
        delivery_date: order.delivery_date || '',
        delivery_method: order.delivery_method || 'motorcycle',
        payment_method: order.payment_method || 'cash',
        status: order.status || 'new',
        notes: order.notes || '',
      })
    }
    setIsEditing(!isEditing)
  }

  const handleSaveEdit = async () => {
    try {
      setUpdating(true)
      const orderData = {
          client_name: editForm.client_name,
          client_phone: editForm.client_phone || null,
          delivery_date: editForm.delivery_date || null,
          delivery_method: editForm.delivery_method,
          payment_method: editForm.payment_method,
          notes: editForm.notes || null,
        }
      await saveOrderEdits({ orderId: id, orderData, status: editForm.status !== order.status ? editForm.status : null })

      await fetchOrder()
      setIsEditing(false)
      addNotification('Order updated', 'success')
    } catch (err) {
      addNotification(`Failed to update: ${err.message}`, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handlePrint = async () => {
    if (!order || printing) return
    setPrinting(true)
    try {
      const opened = await printOrderReceipt({ ...order, order_items: items }, shopName)
      if (!opened) addNotification('Could not open the receipt print dialog. Check your printer and try again.', 'error')
    } catch (error) {
      console.error('Order receipt print error:', error)
      addNotification('Could not prepare this order receipt. Please try again.', 'error')
    } finally {
      setPrinting(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      </DashboardLayout>
    )
  }

  if (!order) return null

  const cfg = statusConfig[order.status] || statusConfig.new
  const PaymentIcon = paymentConfig[order.payment_method]?.icon || DollarSign
  const MethodIcon = methodIcons[order.delivery_method] || Truck
  const fulfillmentLabel = order.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'
  const hasRoadDistance = order.shipping_distance_km !== null && order.shipping_distance_km !== undefined && order.shipping_distance_km !== ''
  const transitDays = order.shipping_transit_days == null
    ? (hasRoadDistance ? transitDaysForRoadDistance(order.shipping_distance_km) : null)
    : Number(order.shipping_transit_days)
  const dispatchDate = order.delivery_date && transitDays != null
    ? shipByDate(String(order.delivery_date).slice(0, 10), transitDays)
    : null
  const deliveryDestination = [order.delivery_city, order.delivery_wilaya].filter(Boolean).join(', ')
  const isCancelled = order.status === 'cancelled'

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-all"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditing ? 'Edit Order' : `Order #${order.order_number}`}
              </h1>
              <p className="text-sm text-slate-400">
                {new Date(order.created_at).toLocaleDateString('fr-FR', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={handlePrint}
                  disabled={printing}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-all disabled:cursor-wait disabled:opacity-60"
                  title={printing ? 'Preparing receipt…' : 'Print receipt'}
                >
                  <Printer size={16} className={printing ? 'animate-pulse' : ''} />
                </button>
                {actions.edit && <button
                  onClick={handleEditToggle}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-all"
                  title="Edit"
                >
                  <Edit3 size={16} />
                </button>}
                {actions.archive && <div className="relative">
                  <button
                    onClick={() => setShowDeleteOptions((visible) => !visible)}
                    disabled={updating}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-all"
                    title="Archive order"
                  >
                    <Trash2 size={16} />
                  </button>
                  {showDeleteOptions && <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                    <button onClick={() => { setShowDeleteOptions(false); handleArchive() }} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-amber-800 hover:bg-amber-50">Archive · keep history</button>
                  </div>}
                </div>}
              </>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleEditToggle}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <X size={16} /> Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={updating}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all flex items-center gap-2"
                >
                  <Save size={16} /> Save
                </button>
              </>
            )}
          </div>
        </div>

        {externalUpdate && <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 print:hidden">
          <p><span className="font-semibold">Order updated by {externalUpdate.actor || 'another staff member'}.</span> {externalUpdate.summary || 'The order details have been refreshed.'}</p>
          <button type="button" onClick={() => setExternalUpdate(null)} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100" aria-label="Dismiss update notice">Dismiss</button>
        </div>}

        {/* ===== STATUS BANNER ===== */}
        {!isEditing && (
          <div className={`rounded-2xl border p-4 mb-6 flex items-center justify-between ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              <span className={`font-semibold ${cfg.text}`}>{cfg.label}</span>
            </div>
            {actions.status && orderStatusTargets(order.status, { canCancel: actions.cancel }).length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                {orderStatusTargets(order.status, { canCancel: actions.cancel }).map((target) => {
                  const label = target === 'cancelled'
                    ? 'Cancel order'
                    : isCancelled
                      ? `Reopen as ${statusConfig[target]?.label || target}`
                      : target === 'processing'
                        ? order.status === 'processing' ? 'Return to New' : 'Start Processing'
                        : target === 'new' ? 'Return to New' : 'Mark Done'
                  const cancelButton = target === 'cancelled'
                  return (
                    <button
                      key={target}
                      onClick={() => handleStatusChange(target)}
                      disabled={updating}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${cancelButton ? 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50' : target === 'done' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-5">
          {/* ===== LEFT: Items ===== */}
          <div className="col-span-2 space-y-5">
            {/* Items List */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Package size={16} className="text-slate-400" />
                Order Items
              </h3>
              <div className="space-y-3">
                {items.map((item) => {
                  const product = item.products
                  return (
                    <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="w-12 h-12 rounded-lg bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {product?.image_url ? (
                          <img src={product.image_url} alt={product.item_name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <Package size={20} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">
                          {item.product_name || product?.item_name || `Product #${item.product_id}`}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {(item.color || product?.color) && (
                            <span className="text-2xs font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                              {item.color || product?.color}
                            </span>
                          )}
                          {(item.flower_type || product?.flower_type) && (
                            <span className="text-2xs font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                              {item.flower_type || product?.flower_type}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {item.quantity} x {item.unit_price?.toLocaleString('fr-FR')} DA
                        </p>
                      </div>
                      <span className="font-semibold text-slate-900 text-sm">
                        {item.total_price?.toLocaleString('fr-FR')} DA
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-700">{order.subtotal_amount?.toLocaleString('fr-FR')} DA</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-dashed border-slate-200">
                  <span className="text-base font-semibold text-slate-900">Total</span>
                  <span className="text-xl font-semibold text-slate-900">{order.total_amount?.toLocaleString('fr-FR')} DA</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {order.notes && !isEditing && (
              <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
                <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <StickyNote size={16} />
                  Notes
                </h3>
                <p className="text-sm text-amber-700">{order.notes}</p>
              </div>
            )}

            {!isEditing && <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm" aria-labelledby="order-activity-title">
              <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h3 id="order-activity-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <History size={16} className="text-slate-400" /> Activity
                </h3>
                <span className="text-xs text-slate-400">Latest {activityEvents.length}{activityEvents.length === 100 ? '+' : ''}</span>
              </header>
              {activityLoading ? <p className="px-5 py-4 text-sm text-slate-500" role="status">Loading order history…</p>
                : activityError ? <p className="px-5 py-4 text-sm text-amber-800" role="alert">{activityError}</p>
                  : activityEvents.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No history is available yet. Activity tracking starts after this update.</p>
                    : <ol className="divide-y divide-slate-100">
                      {activityEvents.map((event) => {
                        const changes = activityChangeLines(event.changes)
                        const occurredAt = new Date(event.occurred_at)
                        const timestamp = Number.isNaN(occurredAt.getTime()) ? 'Time unavailable' : occurredAt.toLocaleString('en-GB', {
                          timeZone: 'Africa/Algiers', dateStyle: 'medium', timeStyle: 'short',
                        })
                        return <li key={event.id} className="flex gap-3 px-5 py-3.5">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800">{event.summary}</p>
                            {changes.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                              {changes.map((line, index) => <li key={`${event.id}-${index}`}>{line}</li>)}
                            </ul>}
                            <p className="mt-1 text-[11px] text-slate-400">{event.actor_name || (event.actor_type === 'system' ? 'System' : 'Staff')}{event.actor_role ? ` · ${event.actor_role}` : ''} · {timestamp}</p>
                          </div>
                        </li>
                      })}
                    </ol>}
            </section>}
          </div>

          {/* ===== RIGHT: Info Cards ===== */}
          <div className="space-y-5">
            {/* Client Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                Client
              </h3>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Name</label>
                    <input
                      type="text"
                      value={editForm.client_name}
                      onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Phone</label>
                    <input
                      type="tel"
                      value={editForm.client_phone}
                      onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-slate-600">{order.client_name?.charAt(0)?.toUpperCase()}</span>
                    </div>
                    <p className="font-semibold text-slate-900">{order.client_name}</p>
                  </div>
                  {order.client_phone && (
                    <a href={`tel:${order.client_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors">
                      <Phone size={14} />
                      {order.client_phone}
                    </a>
                  )}
                </>
              )}
            </div>

            {/* Delivery Card */}
            <div className="overflow-hidden rounded-2xl border border-sky-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-indigo-50/70 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700"><MethodIcon size={19} /></span>
                  <div><h3 className="text-sm font-bold text-slate-900">Delivery plan</h3><p className="mt-0.5 text-xs text-slate-500">Destination, timing and dispatch</p></div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800"><MethodIcon size={13} />{order.delivery_method === 'dhd' ? 'DHD' : order.delivery_method === 'motorcycle' ? 'Motorcycle' : 'Pickup'}</span>
              </div>

              {isEditing ? (
                <div className="space-y-4 p-5">
                  {order.delivery_method !== 'pickup' && <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><MapPin size={16} className="mt-0.5 shrink-0 text-sky-700" /><span>{deliveryDestination || 'Destination not set'}<span className="mt-0.5 block text-xs text-slate-500">Edit the verified destination from the order dispatch plan.</span></span></div>}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Date</label>
                    <input
                      type="date"
                      value={editForm.delivery_date}
                      onChange={(e) => setEditForm({ ...editForm, delivery_date: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Method</label>
                    <select
                      value={editForm.delivery_method}
                      onChange={(e) => setEditForm({ ...editForm, delivery_method: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    >
                      <option value="motorcycle">Motorcycle</option>
                      <option value="dhd">DHD</option>
                      <option value="pickup">Pickup</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-5">
                  {order.delivery_method !== 'pickup' && <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">Deliver to</p>
                    <p className="mt-1.5 flex items-start gap-2 text-base font-bold leading-snug text-slate-900"><MapPin size={17} className="mt-0.5 shrink-0 text-sky-700" />{deliveryDestination || 'Destination not set'}</p>
                    {order.delivery_fee_collected && Number(order.delivery_fee_amount) > 0 && <p className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-900">Transport fee · {Number(order.delivery_fee_amount).toLocaleString('fr-FR')} DA</p>}
                  </div>}

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Calendar size={13} /> Requested delivery</p>
                      <p className="mt-1.5 text-sm font-bold text-slate-900">{order.delivery_date ? formatBusinessDate(order.delivery_date, 'fr-FR', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set'}</p>
                      {order.delivery_time && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-600"><Clock3 size={12} />{String(order.delivery_time).slice(0, 5)}</p>}
                    </div>
                    <div className={`rounded-xl border p-3 ${dispatchDate ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                      <p className={`flex items-center gap-1.5 text-[11px] font-medium ${dispatchDate ? 'text-emerald-700' : 'text-amber-700'}`}><CalendarCheck2 size={13} /> Prepare / dispatch</p>
                      <p className={`mt-1.5 text-sm font-bold ${dispatchDate ? 'text-emerald-950' : 'text-amber-950'}`}>{dispatchDate ? formatBusinessDate(dispatchDate, 'fr-FR', { weekday: 'short', month: 'short', day: 'numeric' }) : order.delivery_method === 'pickup' ? 'Customer pickup' : 'Route needed'}</p>
                      {order.delivery_method !== 'pickup' && !dispatchDate && <p className="mt-1 text-[11px] text-amber-800">Confirm the town route to calculate.</p>}
                    </div>
                  </div>

                  {order.delivery_method !== 'pickup' && <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-slate-600"><Route size={15} className="shrink-0 text-slate-500" />{hasRoadDistance ? <><strong className="text-slate-900">{formatDistance(order.shipping_distance_km)}</strong><span>road</span><span className="text-slate-300">·</span><span>{transitDays === 0 ? 'same day' : transitDays === 1 ? '1 day transit' : 'up to 2 days'}</span></> : <span>Route estimate not confirmed</span>}</div>
                    {order.shipping_distance_km != null && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><BadgeCheck size={14} />Verified</span>}
                  </div>}

                  {order.delivery_handed_off_at && <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900">
                    <Truck size={15} className="shrink-0" />
                    <span><strong>Courier handoff</strong> · {new Date(order.delivery_handed_off_at).toLocaleString('en-GB', { timeZone: 'Africa/Algiers', dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>}
                  {order.status === 'done' && order.delivered_at && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span><strong>Delivered</strong> · {new Date(order.delivered_at).toLocaleString('en-GB', { timeZone: 'Africa/Algiers', dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>}

                  {order.delayed_at && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <p className="text-xs font-semibold">{fulfillmentLabel} rescheduled</p>
                      <p className="mt-1 text-xs">Original date: {formatBusinessDate(order.original_delivery_date) || 'Not recorded'} · Updated date: {formatBusinessDate(order.delivery_date) || 'Not set'}</p>
                      {order.delay_reason && <p className="mt-1 text-xs">Reason: {order.delay_reason}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CreditCard size={16} className="text-slate-400" />
                Payment
              </h3>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Method</label>
                    <select
                      value={editForm.payment_method}
                      onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    >
                      <option value="cash">Cash</option>
                      <option value="baridimob">BaridiMob</option>
                      <option value="usd">USDT</option>
                    </select>
                  </div>
                  <div>
                    {!isCancelled && <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Status</label>}
                    {!isCancelled && <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    >
                      {[order.status, ...orderStatusTargets(order.status).filter((status) => status !== 'cancelled')].map((status) => (
                        <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                      ))}
                    </select>}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <PaymentIcon size={14} className="text-slate-400" />
                    {paymentConfig[order.payment_method]?.label || order.payment_method || 'Cash'}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Status:</span>
                    <span className={`font-semibold ${order.payment_status === 'paid' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {order.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                  {order.amount_paid > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="text-slate-500">Paid:</span>
                      <span className="font-medium">{order.amount_paid?.toLocaleString('fr-FR')} DA</span>
                    </div>
                  )}
                  {order.amount_due > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500">Due:</span>
                      <span className="font-semibold text-rose-600">{order.amount_due?.toLocaleString('fr-FR')} DA</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes Edit */}
            {isEditing && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <StickyNote size={16} className="text-slate-400" />
                  Notes
                </h3>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none resize-none"
                />
              </div>
            )}

            {/* Source */}
            {!isEditing && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Hash size={16} className="text-slate-400" />
                  Source
                </h3>
                <p className="text-sm text-slate-600 capitalize">{order.client_source || 'In-House'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default OrderDetail
