import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Printer, Package, Truck, Bike, Store, Phone,
  Calendar, CreditCard, DollarSign, Smartphone, CheckCircle2,
  User, Hash, StickyNote, Edit3, Trash2, X, Save
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { supabase } from '../lib/supabase'
import { useNotification } from '../context/NotificationContext'

const statusConfig = {
  new:        { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    label: 'New',        dot: 'bg-rose-500' },
  processing: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'Processing', dot: 'bg-amber-500' },
  done:       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Delivered',  dot: 'bg-emerald-500' },
  cancelled:  { bg: 'bg-slate-100',  border: 'border-slate-200',   text: 'text-slate-600',   label: 'Cancelled',  dot: 'bg-slate-400' },
}

const paymentConfig = {
  cash: { label: 'Cash', icon: DollarSign },
  baridimob: { label: 'BaridiMob', icon: Smartphone },
  usd: { label: 'USD', icon: DollarSign },
}

const methodIcons = {
  motorcycle: Bike,
  dhd: Truck,
  pickup: Store,
}

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addNotification } = useNotification()

  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  useEffect(() => {
    fetchOrder()
  }, [id])

  const fetchOrder = async () => {
    setLoading(true)
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
        .eq('id', id)
        .single()

      if (orderError) throw orderError

      setOrder(orderData)
      setItems(orderData.order_items || [])
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
      addNotification('Failed to load order', 'error')
      navigate('/orders')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    setUpdating(true)
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) throw error

      setOrder(prev => ({ ...prev, status: newStatus }))
      addNotification(`Order marked as ${statusConfig[newStatus]?.label || newStatus}`, 'success')
    } catch (err) {
      addNotification('Failed to update status', 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this order permanently?\n\nThis will also remove all order items.')) return

    try {
      setUpdating(true)

      const { error: itemsError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', id)

      if (itemsError) console.error('Delete items error:', itemsError)

      const { error: orderError } = await supabase
        .from('orders')
        .delete()
        .eq('id', id)

      if (orderError) throw orderError

      addNotification('Order deleted', 'success')
      navigate('/orders')
    } catch (err) {
      console.error('Delete error:', err)
      addNotification(`Failed to delete: ${err.message}`, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleEditToggle = () => {
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
      const { error } = await supabase
        .from('orders')
        .update({
          client_name: editForm.client_name,
          client_phone: editForm.client_phone || null,
          delivery_date: editForm.delivery_date || null,
          delivery_method: editForm.delivery_method,
          payment_method: editForm.payment_method,
          status: editForm.status,
          notes: editForm.notes || null,
        })
        .eq('id', id)

      if (error) throw error

      setOrder(prev => ({ ...prev, ...editForm }))
      setIsEditing(false)
      addNotification('Order updated', 'success')
    } catch (err) {
      addNotification(`Failed to update: ${err.message}`, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handlePrint = () => window.print()

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
  const isDelivered = order.status === 'done'
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
                  className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-all"
                  title="Print"
                >
                  <Printer size={16} />
                </button>
                <button
                  onClick={handleEditToggle}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-all"
                  title="Edit"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={updating}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-all"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
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

        {/* ===== STATUS BANNER ===== */}
        {!isEditing && (
          <div className={`rounded-2xl border p-4 mb-6 flex items-center justify-between ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              <span className={`font-bold ${cfg.text}`}>{cfg.label}</span>
            </div>
            {!isDelivered && !isCancelled && (
              <div className="flex items-center gap-2">
                {order.status === 'new' && (
                  <button
                    onClick={() => handleStatusChange('processing')}
                    disabled={updating}
                    className="px-3 py-1.5 rounded-lg bg-white text-amber-700 text-xs font-bold border border-amber-200 hover:bg-amber-50 transition-colors"
                  >
                    Start Processing
                  </button>
                )}
                <button
                  onClick={() => handleStatusChange('done')}
                  disabled={updating}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                >
                  Mark Delivered
                </button>
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={updating}
                  className="px-3 py-1.5 rounded-lg bg-white text-slate-500 text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-5">
          {/* ===== LEFT: Items ===== */}
          <div className="col-span-2 space-y-5">
            {/* Items List */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
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
                            <span className="text-[10px] font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                              {item.color || product?.color}
                            </span>
                          )}
                          {(item.flower_type || product?.flower_type) && (
                            <span className="text-[10px] font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                              {item.flower_type || product?.flower_type}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {item.quantity} x {item.unit_price?.toLocaleString('fr-FR')} DA
                        </p>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
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
                  <span className="text-base font-bold text-slate-900">Total</span>
                  <span className="text-xl font-black text-slate-900">{order.total_amount?.toLocaleString('fr-FR')} DA</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {order.notes && !isEditing && (
              <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
                <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <StickyNote size={16} />
                  Notes
                </h3>
                <p className="text-sm text-amber-700">{order.notes}</p>
              </div>
            )}
          </div>

          {/* ===== RIGHT: Info Cards ===== */}
          <div className="space-y-5">
            {/* Client Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                Client
              </h3>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Name</label>
                    <input
                      type="text"
                      value={editForm.client_name}
                      onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Phone</label>
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
                      <span className="text-sm font-bold text-slate-600">{order.client_name?.charAt(0)?.toUpperCase()}</span>
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
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MethodIcon size={16} className="text-slate-400" />
                Delivery
              </h3>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Date</label>
                    <input
                      type="date"
                      value={editForm.delivery_date}
                      onChange={(e) => setEditForm({ ...editForm, delivery_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Method</label>
                    <select
                      value={editForm.delivery_method}
                      onChange={(e) => setEditForm({ ...editForm, delivery_method: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    >
                      <option value="motorcycle">Motorcycle</option>
                      <option value="dhd">DHD</option>
                      <option value="pickup">Pickup</option>
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  {order.delivery_date && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                      <Calendar size={14} className="text-slate-400" />
                      {new Date(order.delivery_date).toLocaleDateString('fr-FR', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Truck size={14} className="text-slate-400" />
                    <span className="capitalize">{order.delivery_method || 'Pickup'}</span>
                  </div>
                </>
              )}
            </div>

            {/* Payment Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CreditCard size={16} className="text-slate-400" />
                Payment
              </h3>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Method</label>
                    <select
                      value={editForm.payment_method}
                      onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    >
                      <option value="cash">Cash</option>
                      <option value="baridimob">BaridiMob</option>
                      <option value="usd">USD</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-slate-400 outline-none"
                    >
                      <option value="new">New</option>
                      <option value="processing">Processing</option>
                      <option value="done">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
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
                    <span className={`font-bold ${order.payment_status === 'paid' ? 'text-emerald-600' : 'text-rose-600'}`}>
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
                      <span className="font-bold text-rose-600">{order.amount_due?.toLocaleString('fr-FR')} DA</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes Edit */}
            {isEditing && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
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
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
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