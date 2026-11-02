import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Bike, Truck, Store, CreditCard, Smartphone, DollarSign,
  Instagram, MessageCircle, Phone, Facebook, Home, Calendar, Clock,
  User, Receipt, ShoppingBag, ChevronRight,
  Loader2, Zap
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import PriceAdjuster from '../components/PriceAdjuster'
import { CustomerSearch } from '../components/CustomerSearch'
import PaymentStep from '../components/PaymentStep'
import { useCartContext } from '../context/CartContext'
import { useNotification } from '../context/NotificationContext'
import { createOrder, findCreatedOrder } from '../lib/orders'
import { useSettings } from '../hooks/useSettings'
import { supabase } from '../lib/supabase'
import AlgerianPlaceSearch from '../components/AlgerianPlaceSearch'
import { shipByDate, transitDaysForRoadDistance } from '../lib/shippingPlan'
import { getFunctionErrorMessage } from '../lib/functionError'
import { formatBusinessDate, localDate } from '../lib/businessDate.js'
import { loyaltyDiscountForPoints } from '../lib/loyalty'

const paymentMethods = [
  { id: 'cash', label: 'Cash', icon: CreditCard },
  { id: 'baridimob', label: 'BaridiMob', icon: Smartphone },
  { id: 'usd', label: 'USDT', icon: DollarSign },
]

const clientSources = [
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'inhouse', label: 'In-House', icon: Home },
]

function makeCheckoutRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function hasUsablePhone(value) {
  return String(value || '').replace(/\D/g, '').length >= 9
}

function Checkout() {
  const { items, subtotal, total, clearCart } = useCartContext()
  const { addNotification } = useNotification()
  const { settings: shopSettings } = useSettings()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isQuickSale = searchParams.get('mode') === 'quick_sale'
  const [step, setStep] = useState(2)

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [phoneLookupStatus, setPhoneLookupStatus] = useState('idle')
  const [fieldErrors, setFieldErrors] = useState({})
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState(isQuickSale ? 'pickup' : 'motorcycle')
  const [collectDeliveryFee, setCollectDeliveryFee] = useState(false)
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState('')
  const [deliveryPlaceQuery, setDeliveryPlaceQuery] = useState('')
  const [selectedDeliveryPlace, setSelectedDeliveryPlace] = useState(null)
  const [roadDistanceKm, setRoadDistanceKm] = useState(null)
  const [routeDurationSeconds, setRouteDurationSeconds] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const routeRequestRef = useRef(0)
  const autoRouteKeyRef = useRef('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [deliveryFeePaymentMethod, setDeliveryFeePaymentMethod] = useState('cash')
  const [clientSource, setClientSource] = useState('inhouse')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [priceAdjustment, setPriceAdjustment] = useState(0)
  const effectivePriceAdjustment = Math.max(Number(priceAdjustment) || 0, -Math.max(0, Number(total) || 0))
  const adjustedTotal = Math.max(0, total + effectivePriceAdjustment)
  const usdExchangeRate = Number(shopSettings.usd_exchange_rate) || 0

  // ── Payment step state ──
  const [orderPayload, setOrderPayload] = useState(null)
  const [paymentData, setPaymentData] = useState(null)
  const loyaltyDiscount = step === 2 ? 0 : loyaltyDiscountForPoints(paymentData?.loyaltyPointsToRedeem)
  const finalTotal = Math.max(0, adjustedTotal - loyaltyDiscount)
  const shouldCollectDeliveryFee = !isQuickSale && deliveryMethod !== 'pickup' && collectDeliveryFee
  const checkoutDeliveryFee = step === 2
    ? (shouldCollectDeliveryFee ? Number(deliveryFeeAmount || 0) : 0)
    : orderPayload?.deliveryFeeCollected
      ? Number(orderPayload.deliveryFeeAmount || 0)
      : 0
  const customerChargeTotal = finalTotal + checkoutDeliveryFee
  const applyPriceAdjustment = (value) => {
    setPriceAdjustment(Math.max(Number(value) || 0, -Math.max(0, Number(total) || 0)))
    setPaymentData(null)
  }
  const draftRestoredRef = useRef(false)
  const requestIdRef = useRef((() => {
    try {
      const saved = sessionStorage.getItem('blossom-checkout-request-id')
      if (saved) return saved
      const id = makeCheckoutRequestId()
      sessionStorage.setItem('blossom-checkout-request-id', id)
      return id
    } catch {
      return makeCheckoutRequestId()
    }
  })())

  useEffect(() => {
    const key = 'blossom-checkout-draft'
    draftRestoredRef.current = true
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.mode !== (isQuickSale ? 'quick_sale' : 'standard')) return
      setStep([2, 3, 4].includes(draft.step) ? draft.step : 2)
      setSelectedCustomer(draft.selectedCustomer || null)
      setClientName(draft.clientName || '')
      setClientPhone(draft.clientPhone || '')
      setDeliveryDate(draft.deliveryDate || '')
      setDeliveryTime(draft.deliveryTime || '')
      setDeliveryMethod(draft.deliveryMethod || (isQuickSale ? 'pickup' : 'motorcycle'))
      setCollectDeliveryFee(draft.deliveryMethod !== 'pickup' && !isQuickSale && Boolean(draft.collectDeliveryFee))
      setDeliveryFeeAmount(draft.deliveryMethod === 'pickup' || isQuickSale ? '' : (draft.deliveryFeeAmount || ''))
      setDeliveryPlaceQuery(draft.deliveryPlaceQuery || '')
      setSelectedDeliveryPlace(draft.selectedDeliveryPlace || null)
      setRoadDistanceKm(draft.roadDistanceKm != null && Number.isFinite(Number(draft.roadDistanceKm)) ? Number(draft.roadDistanceKm) : null)
      setRouteDurationSeconds(draft.routeDurationSeconds != null && Number.isFinite(Number(draft.routeDurationSeconds)) ? Number(draft.routeDurationSeconds) : null)
      setRouteError(draft.routeError || '')
      setPaymentMethod(draft.paymentMethod || 'cash')
      setDeliveryFeePaymentMethod(draft.deliveryMethod === 'pickup' || isQuickSale ? 'cash' : (draft.deliveryFeePaymentMethod || 'cash'))
      setClientSource(draft.clientSource || 'inhouse')
      setNotes(draft.notes || '')
      setPriceAdjustment(Number(draft.priceAdjustment) || 0)
      setOrderPayload(draft.orderPayload || null)
      setPaymentData(draft.paymentData || null)
      if (draft.requestId) {
        requestIdRef.current = draft.requestId
        sessionStorage.setItem('blossom-checkout-request-id', draft.requestId)
      }
    } catch {
      sessionStorage.removeItem(key)
    }
  // Restore once when the checkout page opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!draftRestoredRef.current) return
    try {
      sessionStorage.setItem('blossom-checkout-draft', JSON.stringify({
        mode: isQuickSale ? 'quick_sale' : 'standard', step, selectedCustomer, clientName, clientPhone,
        deliveryDate, deliveryTime, deliveryMethod, collectDeliveryFee, deliveryFeeAmount, deliveryPlaceQuery, selectedDeliveryPlace,
        roadDistanceKm, routeDurationSeconds, routeError,
        paymentMethod, deliveryFeePaymentMethod, clientSource, notes, priceAdjustment, orderPayload, paymentData,
        requestId: requestIdRef.current,
      }))
    } catch { /* The checkout still works when session storage is unavailable. */ }
  }, [isQuickSale, step, selectedCustomer, clientName, clientPhone, deliveryDate, deliveryTime, deliveryMethod, collectDeliveryFee, deliveryFeeAmount, deliveryPlaceQuery, selectedDeliveryPlace, roadDistanceKm, routeDurationSeconds, routeError, paymentMethod, deliveryFeePaymentMethod, clientSource, notes, priceAdjustment, orderPayload, paymentData])

  useEffect(() => {
    if (selectedCustomer) return undefined
    const phone = clientPhone.trim()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9) {
      setPhoneLookupStatus('idle')
      return undefined
    }

    let active = true
    setPhoneLookupStatus('checking')
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('blossom_resolve_customer', {
        p_phone: phone,
        p_create_if_missing: false,
      })
      if (!active) return
      if (error) {
        setPhoneLookupStatus('error')
      } else if (data) {
        setSelectedCustomer(data)
        setClientName(data.full_name || '')
        setClientPhone(data.phone || phone)
        setPhoneLookupStatus('matched')
      } else {
        setPhoneLookupStatus('not_found')
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [clientPhone, selectedCustomer])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting || items.length === 0) return

    const errors = {}
    if (!isQuickSale && !selectedCustomer) {
      if (!clientName.trim()) errors.clientName = 'Enter the customer name or select a profile.'
      if (!hasUsablePhone(clientPhone)) errors.clientPhone = 'Enter a valid phone number or select a profile.'
    }

    if (!isQuickSale && deliveryMethod !== 'pickup') {
      if (!deliveryDate) {
        errors.deliveryDate = 'Choose the requested delivery date.'
      } else if (deliveryDate < localDate()) {
        errors.deliveryDate = 'Choose today or a future date.'
      }
      if (!selectedDeliveryPlace) {
        errors.destination = 'Select a confirmed delivery town or commune.'
      }
    }
    if (shouldCollectDeliveryFee && (!Number.isInteger(Number(deliveryFeeAmount)) || Number(deliveryFeeAmount) <= 0 || Number(deliveryFeeAmount) > 2147483647)) {
      errors.deliveryFee = 'Enter a whole-number fee greater than zero.'
    }
    if (shouldCollectDeliveryFee && deliveryFeePaymentMethod === 'usd' && usdExchangeRate <= 0) {
      errors.deliveryFeeMethod = 'Set a USDT exchange rate or choose another transport payment method.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector('[aria-invalid="true"]')
        firstInvalid?.focus?.()
        firstInvalid?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    setOrderPayload({
      customerId: selectedCustomer?.customer_id || null,
      clientName: selectedCustomer?.full_name || clientName.trim() || (isQuickSale ? 'Walk-in Customer' : ''),
      clientPhone: selectedCustomer?.phone || clientPhone.trim() || null,
      deliveryDate: isQuickSale ? '' : deliveryDate,
      deliveryTime: isQuickSale ? '' : deliveryTime,
      deliveryMethod: isQuickSale ? 'pickup' : deliveryMethod,
      deliveryFeeAmount: shouldCollectDeliveryFee ? Math.round(Number(deliveryFeeAmount)) : 0,
      deliveryFeeCollected: shouldCollectDeliveryFee,
      deliveryFeePaymentMethod,
      deliveryCity: !isQuickSale && deliveryMethod !== 'pickup' ? (selectedDeliveryPlace?.label || deliveryPlaceQuery.trim()) : '',
      deliveryWilaya: !isQuickSale && deliveryMethod !== 'pickup' ? (selectedDeliveryPlace?.wilaya || '') : '',
      deliveryLatitude: !isQuickSale && deliveryMethod !== 'pickup' ? selectedDeliveryPlace?.latitude ?? null : null,
      deliveryLongitude: !isQuickSale && deliveryMethod !== 'pickup' ? selectedDeliveryPlace?.longitude ?? null : null,
      // This is only a checkout preview; the server recalculates the route
      // after order creation and is the only writer of saved route metrics.
      shippingDistanceKm: null,
      paymentMethod,
      clientSource,
      notes,
      items: [...items],
      subtotal,
      total: adjustedTotal,
      priceAdjustment: effectivePriceAdjustment,
      status: isQuickSale ? 'done' : 'new',
      orderType: isQuickSale ? 'quick_sale' : 'standard',
    })
    setPaymentData(null)
    setStep(3)
  }

  const calculateSelectedRoute = useCallback(async (place = selectedDeliveryPlace) => {
    if (!place) {
      setRouteError('Choose the matching destination town from the place-search results first.')
      return
    }
    const requestId = ++routeRequestRef.current
    setRouteLoading(true)
    setRouteError('')
    setRoadDistanceKm(null)
    setRouteDurationSeconds(null)
    try {
      if (!shopSettings.routing_service_url) throw new Error('Driving-route estimates are not configured. You can still save this delivery; it will be added to route follow-up.')
      const { data, error } = await supabase.functions.invoke('calculate-shipping-route', {
        body: {
          delivery_city: place.label,
          delivery_wilaya: place.wilaya || '',
          delivery_latitude: place.latitude,
          delivery_longitude: place.longitude,
        },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Could not calculate a route.'))
      if (data?.error) throw new Error(data.error)
      if (data?.distance_km == null || !Number.isFinite(Number(data.distance_km))) throw new Error('The route service returned an invalid distance.')
      if (requestId !== routeRequestRef.current) return
      setRoadDistanceKm(Number(data.distance_km))
      setRouteDurationSeconds(data.duration_seconds != null && Number.isFinite(Number(data.duration_seconds)) ? Number(data.duration_seconds) : null)
    } catch (error) {
      if (requestId !== routeRequestRef.current) return
      setRoadDistanceKm(null)
      setRouteDurationSeconds(null)
      setRouteError(error.message || 'Could not calculate a driving route.')
    } finally {
      if (requestId === routeRequestRef.current) setRouteLoading(false)
    }
  }, [selectedDeliveryPlace, shopSettings.routing_service_url])

  useEffect(() => {
    if (deliveryMethod === 'pickup' || !selectedDeliveryPlace) return
    const routeKey = `${selectedDeliveryPlace.latitude},${selectedDeliveryPlace.longitude}|${shopSettings.routing_service_url || ''}`
    if (autoRouteKeyRef.current === routeKey) return
    autoRouteKeyRef.current = routeKey
    void calculateSelectedRoute(selectedDeliveryPlace)
  }, [selectedDeliveryPlace, deliveryMethod, shopSettings.routing_service_url, calculateSelectedRoute])

  const transitDays = roadDistanceKm == null ? null : transitDaysForRoadDistance(roadDistanceKm)
  const suggestedShipDate = transitDays == null || !deliveryDate ? null : shipByDate(deliveryDate, transitDays)

  const handlePaymentConfirm = async (data) => {
    const due = Math.max(0, Number(data.amountDue || 0))
    if (due > 0 && !selectedCustomer && !hasUsablePhone(clientPhone)) {
      setFieldErrors({ clientPhone: 'Add a valid phone number to link the unpaid balance to the right customer.' })
      setStep(2)
      requestAnimationFrame(() => document.getElementById('checkout-client-phone')?.focus())
      return
    }
    setPaymentData(data)
    setStep(4)
  }

  const returnToCart = () => {
    if (isSubmitting) return
    try {
      const rawDraft = sessionStorage.getItem('blossom-checkout-draft')
      const draft = rawDraft ? JSON.parse(rawDraft) : {}
      sessionStorage.setItem('blossom-checkout-draft', JSON.stringify({
        ...draft,
        mode: isQuickSale ? 'quick_sale' : 'standard',
        step: 2,
        orderPayload: null,
        paymentData: null,
      }))
    } catch { /* The cart remains available when draft storage is unavailable. */ }
    navigate('/cart')
  }

  const commitOrder = async () => {
    if (!orderPayload || !paymentData || isSubmitting) return
    setIsSubmitting(true)
    try {
      const orderInput = {
        ...orderPayload,
        paymentMethod,
        loyaltyPointsToRedeem: paymentData.loyaltyPointsToRedeem,
        paymentStatus: paymentData.paymentStatus,
        amountPaid: paymentData.amountPaid,
        amountDue: paymentData.amountDue,
        paymentNotes: paymentData.notes,
        deliveryFeeAmount: orderPayload.deliveryFeeAmount || 0,
        deliveryFeeCollected: Boolean(orderPayload.deliveryFeeCollected),
        deliveryFeePaymentMethod: orderPayload.deliveryFeePaymentMethod || deliveryFeePaymentMethod || paymentMethod,
      }

      // The server rejects a reused request id with different details. If an
      // earlier attempt failed and the cart has changed since, check whether
      // that attempt was actually saved before starting a new request id —
      // otherwise the cashier would be stuck, or the sale recorded twice.
      const attemptKey = JSON.stringify(orderInput)
      let previousAttemptKey = null
      try { previousAttemptKey = sessionStorage.getItem('blossom-checkout-attempt') } catch { /* ignore */ }
      if (previousAttemptKey && previousAttemptKey !== attemptKey) {
        const savedOrder = await findCreatedOrder(requestIdRef.current)
        if (savedOrder) {
          clearCart()
          try {
            sessionStorage.removeItem('blossom-checkout-draft')
            sessionStorage.removeItem('blossom-checkout-request-id')
            sessionStorage.removeItem('blossom-checkout-attempt')
          } catch { /* ignore */ }
          addNotification(`This sale was already saved as order #${savedOrder.order_number}. Open it from Orders to change it.`, 'warning')
          navigate(`/orders/receipt?id=${savedOrder.id}`, { replace: true, state: { savedOrder: true } })
          return
        }
        requestIdRef.current = makeCheckoutRequestId()
        try { sessionStorage.setItem('blossom-checkout-request-id', requestIdRef.current) } catch { /* ignore */ }
      }
      try { sessionStorage.setItem('blossom-checkout-attempt', attemptKey) } catch { /* ignore */ }

      // createOrder returns { order, warnings } — the RPC wraps the order,
      // its items, the stock decrement AND the cash register entry in one
      // transaction.
      const createResult = await createOrder({ ...orderInput, requestId: requestIdRef.current })

      // No internet: the sale is queued and will finalize when the connection
      // returns. Clear the cart and send the cashier to Orders, where the
      // order (and its receipt) appear once it syncs.
      if (createResult.queued) {
        try {
          sessionStorage.removeItem('blossom-checkout-request-id')
          sessionStorage.removeItem('blossom-checkout-attempt')
        } catch { /* ignore */ }
        clearCart()
        addNotification('No internet — sale saved and will finalize automatically when you reconnect. It will appear in Orders then.', 'warning')
        navigate('/orders', { replace: true })
        return
      }

      const { order, warnings } = createResult

      let routeNeedsFollowUp = false
      if (!isQuickSale && deliveryMethod !== 'pickup' && selectedDeliveryPlace) {
        try {
          const { data: routeData, error: routeError } = await supabase.functions.invoke('calculate-shipping-route', {
            body: {
              order_id: order.id,
              delivery_city: selectedDeliveryPlace.label,
              delivery_wilaya: selectedDeliveryPlace.wilaya || '',
              delivery_latitude: selectedDeliveryPlace.latitude,
              delivery_longitude: selectedDeliveryPlace.longitude,
            },
          })
          if (routeError || routeData?.error) throw new Error(routeError ? await getFunctionErrorMessage(routeError, 'Route calculation failed.') : routeData.error)
        } catch (error) {
          routeNeedsFollowUp = true
          const routeMessage = error.message || 'Route calculation failed.'
          console.error('Order was created but its route could not be confirmed:', routeMessage)
          addNotification('Order created. Prepare-by date needs follow-up in Orders.', 'warning')
        }
      }

      // The cash_in entry is written inside create_order(). Calling
      // insertCashRegister here as well produced two rows per sale.

      // The sale is allowed to go through when stock is short, but the
      // florist should know the count needs correcting.
      if (warnings?.negative_stock?.length) {
        addNotification(
          `Stock is now negative for: ${warnings.negative_stock
            .map((p) => p.product_name)
            .join(', ')}`,
          'warning'
        )
      }

      clearCart()
      try {
        sessionStorage.removeItem('blossom-checkout-draft')
        sessionStorage.removeItem('blossom-checkout-request-id')
        sessionStorage.removeItem('blossom-checkout-attempt')
      } catch { /* ignore */ }
      navigate(`/orders/receipt?id=${order.id}`, { replace: true, state: { routeFollowUp: routeNeedsFollowUp, savedOrder: true } })
    } catch (err) {
      console.error('Order creation failed:', err)
      const message = err instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(err.message)
        ? 'Could not reach the Blossom database. Check the internet connection and retry. This checkout reuses its request ID, so retrying will not create a duplicate order if the first request reached the server.'
        : err.message
      addNotification(`Failed to create order: ${message}`, 'error')
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
            className="btn btn-primary px-6"
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
        onClick={returnToCart}
        disabled={isSubmitting}
        className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ArrowLeft size={16} />
        Back to Cart
      </button>

      <div className="mx-auto flex max-w-7xl flex-col gap-5 xl:flex-row">
        {/* LEFT: Form */}
        <div className="flex-1 min-w-0">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2 sm:gap-3">
              {['Details', 'Payment', 'Review'].map((label, index) => {
                const number = index + 2
                const active = number === step
                const complete = number < step
                return <div key={label} className="flex min-w-0 flex-1 items-center gap-2">
                <span aria-current={active ? 'step' : undefined} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${active ? 'bg-primary text-white ring-4 ring-primary/10' : complete ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{complete && !active ? '✓' : number}</span>
                  <span className={`hidden truncate text-xs font-semibold sm:block ${active ? 'text-slate-900' : complete ? 'text-emerald-800' : 'text-slate-500'}`}>{label}</span>
                  {index < 2 && <span className={`h-px min-w-2 flex-1 ${complete ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                </div>
              })}
            </div>
            <p className="text-sm font-semibold text-slate-900">{step === 2 ? (isQuickSale ? 'Customer details' : 'Customer & fulfillment') : step === 3 ? 'Payment' : 'Review and confirm'}</p>
            <p className="mt-1 text-xs text-slate-500">{step === 2 ? (isQuickSale ? 'Link a customer if you want this sale and any credit on their profile.' : 'Find the customer first, then add delivery details.') : step === 3 ? 'Choose how much the customer is paying now.' : 'Check the order details before saving.'}</p>
          </div>
          <div className={`panel mb-5 p-4 sm:p-5 ${step === 2 ? '' : 'hidden'}`}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Sale type</p>
                <p className="mt-1 text-xs text-slate-500">Choose a scheduled order or a quick walk-in sale.</p>
              </div>
              {isQuickSale && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-3 py-1 text-xs font-semibold">
                  <Zap size={13} /> Quick sale
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={!isQuickSale}
                onClick={() => { setSearchParams({}, { replace: true }); setDeliveryMethod('motorcycle'); setPaymentData(null) }}
                className={`rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${!isQuickSale ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className="block text-sm font-semibold text-slate-800">Order</span>
                <span className="block text-xs text-slate-500 mt-1">Customer and delivery details</span>
              </button>
              <button
                type="button"
                aria-pressed={isQuickSale}
                onClick={() => { setSearchParams({ mode: 'quick_sale' }, { replace: true }); setDeliveryMethod('pickup'); setCollectDeliveryFee(false); setDeliveryFeeAmount(''); setDeliveryFeePaymentMethod('cash'); setPaymentData(null) }}
                className={`rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 ${isQuickSale ? 'border-fuchsia-400 bg-fuchsia-50 ring-1 ring-fuchsia-200' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className="block text-sm font-semibold text-slate-800">Quick sale</span>
                <span className="block text-xs text-slate-500 mt-1">Walk-in, pickup now, no delivery setup</span>
              </button>
            </div>
          </div>
          <details className="panel mb-5 overflow-hidden xl:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-slate-800">
              <span>Order summary · {items.length} item{items.length === 1 ? '' : 's'}</span>
              <span className="text-base tabular-nums text-slate-950">{customerChargeTotal.toLocaleString('fr-FR')} DA</span>
            </summary>
            <div className="space-y-2 border-t border-slate-100 px-4 py-3">
              {items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 truncate text-slate-600">{item.quantity} × {item.name}</span><span className="shrink-0 font-medium tabular-nums text-slate-800">{item.totalPrice.toLocaleString('fr-FR')} DA</span></div>)}
              {step === 2 && <div className="border-t border-dashed border-slate-200 pt-2"><label className="mb-1.5 block text-xs font-medium text-slate-600">Adjust order price</label><PriceAdjuster value={effectivePriceAdjustment} onChange={applyPriceAdjustment} currency="DA" step={10} /><p className="mt-1 text-[11px] text-slate-500">Discounts cannot exceed the flower order value.</p></div>}
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-xs"><span className="text-slate-600">Flower order</span><strong>{finalTotal.toLocaleString('fr-FR')} DA</strong></div>
              {checkoutDeliveryFee > 0 && <div className="flex justify-between text-xs text-blue-900"><span>Transport fee · collected separately</span><strong>+{checkoutDeliveryFee.toLocaleString('fr-FR')} DA</strong></div>}
            </div>
          </details>
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <div className={step === 2 ? 'space-y-5' : 'hidden'}>
            {/* Client Info */}
            <section className="panel rounded-2xl p-4 sm:p-5" aria-labelledby="checkout-customer-heading">
              <div className="mb-4 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><User size={18} /></span>
                <div className="min-w-0">
                  <h2 id="checkout-customer-heading" className="text-sm font-semibold text-slate-900">{isQuickSale ? 'Customer' : 'Who is this order for?'}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Search by phone or name. The phone links repeat orders and any outstanding credit to the customer profile.</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Find a customer</label>
                <CustomerSearch
                  selectedCustomer={selectedCustomer}
                  onSelect={(customer) => { setSelectedCustomer(customer); setPaymentData(null); setFieldErrors({}) }}
                  onClear={() => {
                    setSelectedCustomer(null)
                    setClientName('')
                    setClientPhone('')
                    setPhoneLookupStatus('idle')
                    setPaymentData(null)
                    setFieldErrors({})
                  }}
                  placeholder="Type a customer name or phone number"
                />
              </div>

              {!selectedCustomer && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Customer name{!isQuickSale && <span className="text-rose-600"> *</span>}
                    </label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => { setClientName(e.target.value); setFieldErrors((current) => ({ ...current, clientName: '' })) }}
                        placeholder="Enter the name shown on the order"
                        required={!isQuickSale && !selectedCustomer}
                        aria-invalid={Boolean(fieldErrors.clientName)}
                        className={`w-full rounded-xl border bg-white py-3 pl-9 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 ${fieldErrors.clientName ? 'border-rose-400' : 'border-slate-200'}`}
                      />
                    </div>
                    {fieldErrors.clientName && <p className="mt-1 text-xs text-rose-700" role="alert">{fieldErrors.clientName}</p>}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Phone number{!isQuickSale && <span className="text-rose-600"> *</span>}
                    </label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="checkout-client-phone"
                        type="tel"
                        value={clientPhone}
                        onChange={(e) => { setClientPhone(e.target.value); setFieldErrors((current) => ({ ...current, clientPhone: '' })) }}
                        placeholder="05xx xx xx xx"
                        autoComplete="tel"
                        required={!isQuickSale && !selectedCustomer}
                        aria-invalid={Boolean(fieldErrors.clientPhone)}
                        className={`w-full rounded-xl border bg-white py-3 pl-9 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 ${fieldErrors.clientPhone ? 'border-rose-400' : 'border-slate-200'}`}
                      />
                    </div>
                    {fieldErrors.clientPhone && <p className="mt-1 text-xs text-rose-700" role="alert">{fieldErrors.clientPhone}</p>}
                    {!selectedCustomer && phoneLookupStatus !== 'idle' && (
                      <p aria-live="polite" className={`mt-2 rounded-lg px-3 py-2 text-xs ${phoneLookupStatus === 'error' ? 'bg-amber-50 text-amber-800' : phoneLookupStatus === 'not_found' ? 'bg-sky-50 text-sky-800' : phoneLookupStatus === 'matched' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
                        {phoneLookupStatus === 'checking' && 'Searching profiles for this number…'}
                        {phoneLookupStatus === 'not_found' && 'New customer: a profile will be linked when you save the order.'}
                        {phoneLookupStatus === 'error' && 'Could not search right now. The phone will still be matched when you save.'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedCustomer && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
                  <span><strong className="block">Customer linked</strong><span className="text-xs text-emerald-800">The order and any unpaid balance will be attached to this profile.</span></span>
                </div>
              )}
            </section>

            {/* Delivery is only relevant for scheduled orders. */}
            {!isQuickSale && <section className="panel rounded-2xl p-4 sm:p-5" aria-labelledby="checkout-delivery-heading">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-subtle text-accent"><Truck size={18} /></span>
                <div>
                  <h2 id="checkout-delivery-heading" className="text-sm font-semibold text-slate-900">How should this order reach them?</h2>
                  <p className="mt-1 text-xs text-slate-500">Choose collection or delivery, then set the timing and destination.</p>
                </div>
              </div>

              <label className="mb-2 block text-xs font-semibold text-slate-700">Fulfillment method</label>
              <div className="inline-flex w-full rounded-xl bg-sage p-1 gap-1">
                {[
                  { id: 'motorcycle', label: 'Motorcycle', desc: 'Local delivery', icon: Bike },
                  { id: 'dhd', label: 'DHD', desc: 'Long distance', icon: Truck },
                  { id: 'pickup', label: 'Shop pickup', desc: 'Customer collects', icon: Store },
                ].map((method) => {
                  const Icon = method.icon
                  const active = deliveryMethod === method.id
                  return <button key={method.id} type="button" onClick={() => {
                    setDeliveryMethod(method.id)
                    setPaymentData(null)
                    setFieldErrors((current) => ({ ...current, deliveryDate: '', destination: '', deliveryFee: '', deliveryFeeMethod: '' }))
                    if (method.id === 'pickup') {
                      setCollectDeliveryFee(false)
                      setDeliveryFeeAmount('')
                      setDeliveryFeePaymentMethod('cash')
                      routeRequestRef.current += 1
                      autoRouteKeyRef.current = ''
                      setRouteLoading(false)
                      setSelectedDeliveryPlace(null)
                      setDeliveryPlaceQuery('')
                      setDeliveryDate('')
                      setDeliveryTime('')
                      setRoadDistanceKm(null)
                      setRouteDurationSeconds(null)
                      setRouteError('')
                    }
                  }} title={method.desc} aria-pressed={active} className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    <span className="flex items-center gap-1.5"><Icon size={15} className={active ? 'text-accent' : 'text-slate-400'} /><span className="text-xs font-semibold sm:text-sm">{method.label}</span></span>
                  </button>
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">{deliveryMethod === 'pickup' ? <>Pickup date <span className="font-normal text-slate-400">(optional)</span></> : <>Delivery date <span className="text-rose-600">*</span></>}</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      min={deliveryMethod === 'pickup' ? undefined : localDate()}
                      value={deliveryDate}
                      onChange={(e) => { setDeliveryDate(e.target.value); setFieldErrors((current) => ({ ...current, deliveryDate: '' })); setPaymentData(null) }}
                      aria-invalid={Boolean(fieldErrors.deliveryDate)}
                      className={`w-full rounded-xl border bg-white py-3 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${fieldErrors.deliveryDate ? 'border-rose-400' : 'border-slate-200'}`}
                    />
                  </div>
                  {fieldErrors.deliveryDate && <p className="mt-1 text-xs text-rose-700" role="alert">{fieldErrors.deliveryDate}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Preferred time <span className="font-normal text-slate-400">(optional)</span></label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="time"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    />
                  </div>
                </div>
              </div>

              {deliveryMethod !== 'pickup' && <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
                <AlgerianPlaceSearch
                  compact
                  label="Destination town / commune"
                  inputId="checkout-delivery-destination"
                  ariaInvalid={Boolean(fieldErrors.destination)}
                  query={deliveryPlaceQuery}
                  onQueryChange={(value) => {
                    routeRequestRef.current += 1
                    autoRouteKeyRef.current = ''
                    setDeliveryPlaceQuery(value)
                    setSelectedDeliveryPlace(null)
                    setRoadDistanceKm(null)
                    setRouteDurationSeconds(null)
                    setRouteLoading(false)
                    setRouteError('')
                    setFieldErrors((current) => ({ ...current, destination: '' }))
                  }}
                  selectedPlace={selectedDeliveryPlace}
                  onSelect={(place) => {
                    autoRouteKeyRef.current = ''
                    setSelectedDeliveryPlace(place)
                    setDeliveryPlaceQuery(`${place.label}${place.wilaya ? `, ${place.wilaya}` : ''}`)
                    setRoadDistanceKm(null)
                    setRouteDurationSeconds(null)
                    setRouteError('')
                    setFieldErrors((current) => ({ ...current, destination: '' }))
                  }}
                  hint="Add the street address in the order note."
                />
                {fieldErrors.destination && <p className="text-xs text-rose-700" role="alert">{fieldErrors.destination}</p>}
                {selectedDeliveryPlace && <div className="overflow-hidden rounded-2xl border border-sage-dark/80 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-sage-dark/60 px-4 py-3">
                    <div className="min-w-0"><h4 className="text-sm font-semibold text-gray-900">Dispatch date</h4><p className="truncate text-xs text-gray-500">{[selectedDeliveryPlace.label, selectedDeliveryPlace.wilaya].filter(Boolean).join(' · ')}</p></div>
                  </div>
                  <div className="p-3 sm:p-4">
                    {routeLoading && <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-900" role="status" aria-live="polite"><Loader2 size={16} className="animate-spin" /> Checking prepare-by date…</div>}
                    {routeError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900" role="alert"><span><strong className="block">Prepare-by date unavailable</strong><span className="mt-0.5 block">The order can still be saved. You can retry here or update it later in Orders.</span></span><button type="button" onClick={() => calculateSelectedRoute(selectedDeliveryPlace)} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-amber-900 transition hover:bg-amber-100">Try again</button></div>}
                    {suggestedShipDate && <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-emerald-950" role="status"><Calendar size={18} className="shrink-0 text-emerald-700" /><div><p className="text-xs font-medium text-emerald-800">Prepare by</p><p className="text-base font-semibold">{formatBusinessDate(suggestedShipDate, 'en-GB')}</p></div></div>}
                  </div>
                </div>}
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={collectDeliveryFee} onChange={(event) => { setCollectDeliveryFee(event.target.checked); setPaymentData(null); if (!event.target.checked) setFieldErrors((current) => ({ ...current, deliveryFee: '', deliveryFeeMethod: '' })) }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30" />
                    <span><span className="block text-sm font-semibold text-slate-800">Collect delivery fee from customer</span><span className="mt-0.5 block text-xs text-slate-500">Tracked separately from flower sales.</span></span>
                  </label>
                  {collectDeliveryFee && <div className="mt-3 max-w-xs">
                    <label htmlFor="delivery-fee-amount" className="mb-1 block text-xs font-semibold text-slate-700">Delivery fee to collect (DA)</label>
                    <input id="delivery-fee-amount" type="number" min="1" max="2147483647" step="1" inputMode="numeric" value={deliveryFeeAmount} onChange={(event) => { setDeliveryFeeAmount(event.target.value); setFieldErrors((current) => ({ ...current, deliveryFee: '' })); setPaymentData(null) }} placeholder="e.g. 500" aria-invalid={Boolean(fieldErrors.deliveryFee)} className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${fieldErrors.deliveryFee ? 'border-rose-400' : 'border-slate-200'}`} />
                    {fieldErrors.deliveryFee ? <p className="mt-1 text-xs text-rose-700" role="alert">{fieldErrors.deliveryFee}</p> : <p className="mt-1 text-[11px] text-slate-500">Recorded separately from flower sales and customer credit.</p>}
                    <label htmlFor="delivery-fee-method" className="mt-3 block text-xs font-semibold text-slate-700">Transport fee payment method</label>
                    <select id="delivery-fee-method" value={deliveryFeePaymentMethod} aria-invalid={Boolean(fieldErrors.deliveryFeeMethod)} onChange={(event) => { setDeliveryFeePaymentMethod(event.target.value); setFieldErrors((current) => ({ ...current, deliveryFeeMethod: '' })) }} className={`mt-1 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 ${fieldErrors.deliveryFeeMethod ? 'border-rose-400' : 'border-slate-200'}`}>
                      <option value="cash">Cash</option>
                      <option value="baridimob">BaridiMob</option>
                      <option value="usd" disabled={!usdExchangeRate}>USDT{usdExchangeRate ? '' : ' · set rate in Settings'}</option>
                    </select>
                    {fieldErrors.deliveryFeeMethod && <p className="mt-1 text-xs text-rose-700" role="alert">{fieldErrors.deliveryFeeMethod}</p>}
                  </div>}
                </div>
              </div>}
            </section>}
            </div>

            {/* Payment method */}
            <div className={step === 3 ? 'space-y-4' : 'hidden'}>
            <div className="panel p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Payment</h3>

              <div className="grid grid-cols-3 gap-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon
                  const active = paymentMethod === method.id
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => { setPaymentMethod(method.id); setPaymentData(null) }}
                      disabled={method.id === 'usd' && usdExchangeRate <= 0}
                      title={method.id === 'usd' && usdExchangeRate <= 0 ? 'An owner must set the USDT exchange rate in Settings first.' : undefined}
                      className={`py-3 rounded-xl border text-center press ${
                        active
                          ? 'border-accent bg-accent-subtle text-accent font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      } ${method.id === 'usd' && usdExchangeRate <= 0 ? 'opacity-45 cursor-not-allowed' : ''}`}
                    >
                      <Icon size={20} className={`mx-auto mb-1 ${active ? 'text-accent' : 'text-slate-400'}`} />
                      <p className="text-sm">{method.label}</p>
                    </button>
                  )
                })}
              </div>
              {paymentMethod === 'usd' && usdExchangeRate > 0 && (
                <p className="mt-3 text-xs text-slate-500">1 USDT = {usdExchangeRate.toLocaleString('fr-FR')} DA</p>
              )}
              {usdExchangeRate <= 0 && (
                <p className="mt-3 text-xs text-amber-700">USDT tender is unavailable until an owner sets the exchange rate in Settings.</p>
              )}
              {orderPayload?.deliveryFeeCollected && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-950"><span><strong className="block">Transport fee recorded separately</strong><span className="text-xs text-blue-800">{deliveryFeePaymentMethod.toUpperCase()} · not included in the flower payment below.</span></span><strong className="shrink-0 tabular-nums">{Number(orderPayload.deliveryFeeAmount).toLocaleString('fr-FR')} DA</strong></div>}
              {paymentData && <div className="mt-4 rounded-xl bg-sage/50 p-3 text-sm">
                <div className="flex justify-between"><span>Amount received</span><strong>{Number(paymentData.amountPaid || 0).toLocaleString('fr-FR')} DA</strong></div>
                <div className="mt-1 flex justify-between"><span>Status</span><strong>{paymentData.paymentStatus === 'unpaid' ? 'Pay later' : paymentData.paymentStatus === 'partial' ? 'Partial payment' : 'Paid'}</strong></div>
                {Number(paymentData.amountDue) > 0 && <div className="mt-1 flex justify-between text-amber-800"><span>Remaining</span><strong>{Number(paymentData.amountDue).toLocaleString('fr-FR')} DA</strong></div>}
              </div>}
            {step === 3 && <PaymentStep
              total={adjustedTotal}
              deliveryFee={checkoutDeliveryFee}
              paymentMethod={paymentMethod}
              exchangeRate={usdExchangeRate}
              customer={selectedCustomer}
              onConfirm={handlePaymentConfirm}
              onCancel={() => { setPaymentData(null); setOrderPayload(null); setStep(2) }}
              isSubmitting={isSubmitting}
            />}
            </div>
            </div>

            {/* Source */}
            <div className={`grid gap-4 lg:grid-cols-2 ${step === 2 ? '' : 'hidden'}`}>
            <section className="panel p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">{isQuickSale ? 'Sale Source' : 'Client Source'}</h3>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {clientSources.map((source) => {
                  const Icon = source.icon
                  const active = clientSource === source.id
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => setClientSource(source.id)}
                      className={`py-2.5 rounded-xl border text-center press ${
                        active
                          ? 'border-accent bg-accent-subtle text-accent font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={16} className={`mx-auto mb-1 ${active ? 'text-accent' : 'text-slate-400'}`} />
                      <p className="text-2xs">{source.label}</p>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Notes */}
            <section className="panel p-5">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">Order notes <span className="font-normal text-slate-500">· optional</span></summary>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gift message, delivery address, or florist instructions…"
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </details>
            </section>
            </div>

            {step === 4 && <section className="panel space-y-4 p-5" aria-labelledby="review-title">
              <h2 id="review-title" className="text-base font-semibold text-slate-900">Order review</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Customer</p><p className="mt-1 font-semibold text-slate-900">{orderPayload?.clientName}</p><p className="text-sm text-slate-600">{orderPayload?.clientPhone || 'Walk-in'}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Fulfillment</p><p className="mt-1 font-semibold text-slate-900">{isQuickSale ? 'Quick sale · Pickup' : deliveryMethod === 'pickup' ? 'Shop pickup' : `${deliveryMethod.toUpperCase()} · ${orderPayload?.deliveryCity || 'Destination not set'}`}</p>{!isQuickSale && <p className="text-sm text-slate-600">{deliveryDate || 'No delivery date'} {deliveryTime && `· ${deliveryTime}`}</p>}</div>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {items.map((item) => <div key={item.id} className="flex justify-between gap-4 px-3 py-2.5 text-sm"><span className="min-w-0 text-slate-700"><span className="block">{item.quantity} × {item.name}</span><span className="text-xs text-slate-500">{Number(item.price || 0).toLocaleString('fr-FR')} DA each</span></span><span className="shrink-0 font-medium text-slate-900">{item.totalPrice.toLocaleString('fr-FR')} DA</span></div>)}
              </div>
              <div className="rounded-xl bg-sage/50 p-3 text-sm">
                {effectivePriceAdjustment !== 0 && <div className="mb-1 flex justify-between"><span>{effectivePriceAdjustment < 0 ? 'Discount' : 'Extra charge'}</span><strong>{effectivePriceAdjustment > 0 ? '+' : ''}{effectivePriceAdjustment.toLocaleString('fr-FR')} DA</strong></div>}
                {loyaltyDiscount > 0 && <div className="mb-1 flex justify-between text-emerald-800"><span>Petal reward</span><strong>−{loyaltyDiscount.toLocaleString('fr-FR')} DA</strong></div>}
                <div className="flex justify-between"><span>Flower order</span><strong>{finalTotal.toLocaleString('fr-FR')} DA</strong></div>
                {checkoutDeliveryFee > 0 && <div className="mt-1 flex justify-between text-blue-900"><span>Transport fee · {orderPayload?.deliveryFeePaymentMethod?.toUpperCase() || deliveryFeePaymentMethod.toUpperCase()}</span><strong>+{checkoutDeliveryFee.toLocaleString('fr-FR')} DA</strong></div>}
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-950"><span>Total customer charge</span><strong>{customerChargeTotal.toLocaleString('fr-FR')} DA</strong></div>
                <div className="mt-1 flex justify-between"><span>Payment</span><strong>{paymentMethod.toUpperCase()} · {paymentData?.paymentStatus === 'unpaid' ? 'Pay later' : paymentData?.paymentStatus === 'partial' ? 'Partial payment' : 'Paid'} · {paymentData?.amountPaid?.toLocaleString('fr-FR') || '0'} DA</strong></div>
                {Number(paymentData?.amountDue) > 0 && <div className="mt-1 flex justify-between text-amber-800"><span>Remaining</span><strong>{Number(paymentData.amountDue).toLocaleString('fr-FR')} DA</strong></div>}
              </div>
              {suggestedShipDate && deliveryMethod !== 'pickup' && <div className="rounded-xl border border-sage-dark/60 p-3 text-sm"><p className="font-semibold text-slate-900">Prepare by</p><p className="mt-1 text-slate-600">{formatBusinessDate(suggestedShipDate, 'en-GB')}</p></div>}
              {notes.trim() && <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold text-slate-500">Order notes</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{notes}</p></div>}
              {routeError && deliveryMethod !== 'pickup' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Prepare-by date is still pending. The order can be saved and updated later from Orders.</p>}
            </section>}

            {step !== 3 && <div className="sticky bottom-2 z-20 flex gap-3 rounded-xl border border-slate-100 bg-white/95 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur">
              {step > 2 && <button type="button" onClick={() => setStep(step - 1)} className="btn btn-secondary min-h-12 flex-1">Back</button>}
              {step === 2 && <button type="submit" disabled={isSubmitting} className="btn btn-primary min-h-12 flex-1">Continue · {customerChargeTotal.toLocaleString('fr-FR')} DA <ChevronRight size={16} /></button>}
              {step === 4 && <button type="button" onClick={commitOrder} disabled={isSubmitting} className="btn btn-primary min-h-12 flex-1">{isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Saving order…</> : <>Create order & receipt <Receipt size={16} /></>}</button>}
            </div>}
          </form>
        </div>

        {/* RIGHT: Summary */}
        <div className="hidden w-full shrink-0 xl:block xl:w-[360px]">
          <div className="sticky top-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-gray-900/[0.04]">
            <div className="border-b border-slate-100 bg-gradient-to-r from-white to-primary-subtle/40 px-5 py-4 sm:px-6 sm:py-5">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Receipt size={18} className="text-slate-700" />
                {isQuickSale ? 'Quick Sale Summary' : 'Order Summary'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">{items.length} item{items.length !== 1 ? 's' : ''} in cart</p>
            </div>

            <div className="px-6 py-4 max-h-[320px] overflow-y-auto space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-slate-700">{item.quantity}x</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-2xs text-slate-400">{item.price.toLocaleString()} DA each</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 shrink-0">{item.totalPrice.toLocaleString()} DA</p>
                </div>
              ))}
            </div>

          <div className="px-6 py-4 border-t border-slate-100 space-y-2 bg-slate-50/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">{subtotal.toLocaleString()} DA</span>
              </div>

              {effectivePriceAdjustment !== 0 && (
                <div className={`flex justify-between text-sm ${effectivePriceAdjustment < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                  <span>{effectivePriceAdjustment < 0 ? 'Discount' : 'Extra Charge'}</span>
                  <span className="font-medium">
                    {effectivePriceAdjustment > 0 ? '+' : ''}{effectivePriceAdjustment.toLocaleString()} DA
                  </span>
                </div>
              )}

              <div className={`pt-2 ${step === 2 ? '' : 'hidden'}`}>
                <label className="block text-2xs font-medium text-slate-500 mb-1.5">Adjust Price</label>
                <PriceAdjuster
                  value={effectivePriceAdjustment}
                  onChange={applyPriceAdjustment}
                  currency="DA"
                  step={10}
                />
              </div>

              <div className="flex justify-between pt-3 border-t border-dashed border-slate-200">
                <span className="text-base font-semibold text-slate-900">Flower order</span>
                <span className="text-xl font-semibold text-slate-900">{finalTotal.toLocaleString()} DA</span>
              </div>
              {checkoutDeliveryFee > 0 && <>
                <div className="flex justify-between text-sm text-blue-900"><span>Transport fee</span><span className="font-semibold">+{checkoutDeliveryFee.toLocaleString('fr-FR')} DA</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-950"><span>Order total · incl. transport</span><span className="text-xl">{customerChargeTotal.toLocaleString('fr-FR')} DA</span></div>
              </>}
            </div>
          </div>
        </div>
      </div>

    </DashboardLayout>
  )
}

export default Checkout
