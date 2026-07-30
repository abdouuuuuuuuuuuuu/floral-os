import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bike, Truck, Store, CreditCard, Smartphone, DollarSign,
  Instagram, MessageCircle, Phone, Facebook, Home, Calendar, Clock,
  User, Hash, StickyNote, Receipt, ShoppingBag, ChevronRight, Sparkles,
  Loader2
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import PriceAdjuster from '../components/PriceAdjuster'
import { useCartContext } from '../context/CartContext'
import { useNotification } from '../context/NotificationContext'
import { createOrder } from '../lib/orders'

const paymentMethods = [
  { id: 'cash', label: 'Cash', icon: CreditCard },
  { id: 'baridimob', label: 'BaridiMob', icon: Smartphone },
  { id: 'usd', label: 'USD', icon: DollarSign },
]

const clientSources = [
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'inhouse', label: 'In-House', icon: Home },
]

function Checkout() {
  const { items, subtotal, total, clearCart } = useCartContext()
  const { addNotification } = useNotification()
  const navigate = useNavigate()

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState('motorcycle')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [clientSource, setClientSource] = useState('inhouse')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [priceAdjustment, setPriceAdjustment] = useState(0)
  const adjustedTotal = Math.max(0, total + priceAdjustment)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting || items.length === 0) return

    setIsSubmitting(true)

    try {
      const order = await createOrder({
        clientName,
        clientPhone,
        deliveryDate,
        deliveryTime,
        deliveryMethod,
        paymentMethod,
        clientSource,
        notes,
        items: [...items],
        subtotal,
        total: adjustedTotal,
        priceAdjustment,
      })

      clearCart()
      navigate(`/orders/receipt?id=${order.id}`, { replace: true })

    } catch (err) {
      console.error('Order creation failed:', err)
      addNotification(`Failed to create order: ${err.message}`, 'error')
      setIsSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-5">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
            <ShoppingBag size={32} className="text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-slate-500 text-lg font-medium">Your cart is empty</p>
            <p className="text-slate-400 text-sm mt-1">Add some products first</p>
          </div>
          <button
            onClick={() => navigate('/cart')}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Cart
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <button
        onClick={() => navigate('/cart')}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium mb-4 transition-colors text-sm"
      >
        <ArrowLeft size={16} />
        Back to Cart
      </button>

      <div className="flex gap-5">
        {/* LEFT: Form */}
        <div className="flex-1 min-w-0">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Client Info */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <User size={16} className="text-slate-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Client Information</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Client Name *</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Full name"
                      required
                      className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="05xx xx xx xx"
                      className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Calendar size={16} className="text-blue-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Delivery</h3>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Delivery Date</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all text-sm text-slate-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Time Slot</label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="time"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all text-sm text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Delivery Method</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'motorcycle', label: 'Motorcycle', desc: 'Local delivery', icon: Bike },
                  { id: 'dhd', label: 'DHD', desc: 'Long distance', icon: Truck },
                  { id: 'pickup', label: 'Pickup', desc: 'Client collects', icon: Store },
                ].map((method) => {
                  const Icon = method.icon
                  const active = deliveryMethod === method.id
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setDeliveryMethod(method.id)}
                      className={`py-4 rounded-xl border-2 text-center transition-all ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={22} className={`mx-auto mb-1.5 ${active ? 'text-white' : 'text-slate-400'}`} />
                      <p className="font-semibold text-sm">{method.label}</p>
                      <p className={`text-[11px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>{method.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <Receipt size={16} className="text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Payment</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon
                  const active = paymentMethod === method.id
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`py-4 rounded-xl border-2 text-center transition-all ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={22} className={`mx-auto mb-1.5 ${active ? 'text-white' : 'text-slate-400'}`} />
                      <p className="font-semibold text-sm">{method.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Source */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                  <Hash size={16} className="text-violet-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Client Source</h3>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {clientSources.map((source) => {
                  const Icon = source.icon
                  const active = clientSource === source.id
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => setClientSource(source.id)}
                      className={`py-3 rounded-xl border-2 text-center transition-all ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={18} className={`mx-auto mb-1 ${active ? 'text-white' : 'text-slate-400'}`} />
                      <p className="font-semibold text-[11px]">{source.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <StickyNote size={16} className="text-slate-500" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Notes</h3>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions, delivery notes, etc..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all text-sm resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                isSubmitting 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-slate-900 text-white hover:bg-slate-800 hover:shadow-lg active:scale-[0.98]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Charge {adjustedTotal.toLocaleString()} DA
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT: Summary */}
        <div className="w-[360px] shrink-0">
          <div className="sticky top-4 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Receipt size={18} className="text-slate-700" />
                Order Summary
              </h2>
              <p className="text-xs text-slate-400 mt-1">{items.length} item{items.length !== 1 ? 's' : ''} in cart</p>
            </div>

            <div className="px-6 py-4 max-h-[320px] overflow-y-auto space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-slate-700">{item.quantity}x</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-400">{item.price.toLocaleString()} DA each</p>
                  </div>
                  <p className="text-sm font-bold text-slate-700 shrink-0">{item.totalPrice.toLocaleString()} DA</p>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 space-y-2 bg-slate-50/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">{subtotal.toLocaleString()} DA</span>
              </div>

              {priceAdjustment !== 0 && (
                <div className={`flex justify-between text-sm ${priceAdjustment < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                  <span>{priceAdjustment < 0 ? 'Discount' : 'Extra Charge'}</span>
                  <span className="font-medium">
                    {priceAdjustment > 0 ? '+' : ''}{priceAdjustment.toLocaleString()} DA
                  </span>
                </div>
              )}

              <div className="pt-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Adjust Price</label>
                <PriceAdjuster
                  value={priceAdjustment}
                  onChange={setPriceAdjustment}
                  currency="DA"
                  step={10}
                />
              </div>

              <div className="flex justify-between pt-3 border-t border-dashed border-slate-200">
                <span className="text-base font-bold text-slate-900">Total</span>
                <span className="text-xl font-black text-slate-900">{adjustedTotal.toLocaleString()} DA</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Checkout