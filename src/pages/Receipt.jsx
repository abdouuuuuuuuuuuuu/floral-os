import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { Printer, ShoppingCart, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNotification } from '../context/NotificationContext'
import { useShopName } from '../hooks/useShopName'
import { printThermalReceipt } from '../utils/printThermal'
import { orderBarcodeHtml } from '../lib/orderBarcode'
import { petalsReceiptHtml, receiptLocation } from '../utils/orderReceipt'
import { formatBusinessDateTime } from '../lib/businessDate.js'
import OrderSuccessAnimation from '../components/common/OrderSuccessAnimation'

const formatMoney = (value) => Number(value || 0).toLocaleString('fr-FR')
const paymentLabels = { cash: 'Cash', baridimob: 'BaridiMob', usd: 'USDT' }

function Receipt() {
  const shopName = useShopName()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { addNotification } = useNotification()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printError, setPrintError] = useState('')
  const [printNotice, setPrintNotice] = useState('')
  const [printing, setPrinting] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const autoPrintedOrderRef = useRef(null)

  const orderId = searchParams.get('id')

  useEffect(() => {
    if (!orderId) {
      navigate('/dashboard', { replace: true })
      return
    }

    const fetchOrder = async () => {
      try {
        setLoading(true)
        setError('')
        const [{ data, error }, { data: orderMeta }] = await Promise.all([
          supabase
            .from('order_receipt_view')
            .select('*')
            .eq('id', orderId),
          supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle(),
        ])

        if (error) throw error
        if (!data || data.length === 0) throw new Error('Order not found')

        const orderData = {
          id: data[0].id,
          order_number: data[0].order_number,
          created_at: orderMeta?.created_at || data[0].created_at || null,
          client_name: data[0].client_name,
          client_phone: data[0].client_phone,
          customer_id: orderMeta?.customer_id ?? null,
          delivery_method: data[0].delivery_method,
          delivery_city: orderMeta?.delivery_city || '',
          delivery_wilaya: orderMeta?.delivery_wilaya || '',
          delivery_fee_amount: Number(orderMeta?.delivery_fee_amount ?? data[0].delivery_fee_amount ?? 0),
          delivery_fee_collected: Boolean(orderMeta?.delivery_fee_collected ?? data[0].delivery_fee_collected),
          delivery_fee_payment_method: orderMeta?.delivery_fee_payment_method || data[0].delivery_fee_payment_method || null,
          delivery_origin_name: orderMeta?.delivery_origin_name || '',
          shipping_distance_km: orderMeta?.shipping_distance_km ?? null,
          shipping_transit_days: orderMeta?.shipping_transit_days ?? null,
          price_adjustment: Number(orderMeta?.price_adjustment || 0),
          tax_amount: Number(orderMeta?.tax_amount || 0),
          delivery_date: data[0].delivery_date,
          delivery_time: data[0].delivery_time,
          payment_method: data[0].payment_method,
          payment_status: data[0].payment_status,
          payment_notes: data[0].payment_notes || '',
          amount_paid: Number(data[0].amount_paid || 0),
          amount_due: Number(data[0].amount_due || 0),
          subtotal_amount: Number(data[0].subtotal_amount || 0),
          total_amount: Number(data[0].total_amount || 0),
          notes: data[0].notes,
          order_items: data
            .filter(row => row.order_item_id !== null)
            .map(row => ({
              id: row.order_item_id,
              quantity: row.quantity,
              unit_price: Number(row.item_unit_price || 0),
              total_price: Number(row.item_total_price || 0),
              product_id: row.product_id,
              color: row.item_color || row.color || '',
              flower_type: row.item_flower_type || row.flower_type || '',
              category: row.item_category || row.category || '',
              product: { item_name: row.product_item_name || row.product_name || `Product #${row.product_id}` }
            }))
        }

        setOrder(orderData)
      } catch (err) {
        setError(err.message)
        addNotification(`Failed to load receipt: ${err.message}`, 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [orderId, navigate, addNotification, retryKey])

  const handlePrint = useCallback(async () => {
    if (!order || printing) return false
    setPrinting(true)
    setPrintError('')

    try {
    const items = (order.order_items || []).map(item => `
      <tr>
        <td style="text-align:left;padding:4px 0;"><strong>${escapeHtml(item.quantity)} × ${escapeHtml(item.product?.item_name || `Product #${item.product_id}`)}</strong><br><span style="font-size:9px;color:#666;">${formatMoney(item.unit_price)} DA each${item.color ? ` · ${escapeHtml(item.color)}` : ''}${item.flower_type ? ` · ${escapeHtml(item.flower_type)}` : ''}${item.category ? ` · ${escapeHtml(item.category)}` : ''}</span></td>
        <td style="text-align:right;padding:4px 0 4px 6px;white-space:nowrap;">${formatMoney(item.total_price)} DA</td>
      </tr>
    `).join('')

    const location = receiptLocation(order)
    const feeAmount = Number(order.delivery_fee_amount || 0)
    const customerTotal = Number(order.total_amount || 0) + feeAmount
    const dueAmount = Number(order.amount_due || 0)
    const financialRows = `
      <div class="row"><span>Subtotal</span><span>${formatMoney(order.subtotal_amount)} DA</span></div>
      ${order.price_adjustment ? `<div class="row"><span>${order.price_adjustment < 0 ? 'Discount' : 'Extra charge'}</span><span>${order.price_adjustment > 0 ? '+' : ''}${formatMoney(order.price_adjustment)} DA</span></div>` : ''}
      ${order.tax_amount ? `<div class="row"><span>Tax</span><span>${formatMoney(order.tax_amount)} DA</span></div>` : ''}
      <div class="total-row"><span>FLOWER ORDER TOTAL</span><span>${formatMoney(order.total_amount)} DA</span></div>
      <div class="row"><span>Payment · ${escapeHtml(paymentLabels[order.payment_method] || order.payment_method || '—')} · ${escapeHtml(order.payment_status || '—')}</span><span>Received ${formatMoney(order.amount_paid)} DA</span></div>
      ${dueAmount > 0 ? `<div class="row"><strong>Balance due</strong><strong>${formatMoney(dueAmount)} DA</strong></div>` : ''}
      ${feeAmount > 0 ? `<div class="row"><span>Transport fee · ${escapeHtml(paymentLabels[order.delivery_fee_payment_method] || order.delivery_fee_payment_method || 'separate')}</span><span>+${formatMoney(feeAmount)} DA</span></div><div class="total-row"><span>ORDER TOTAL · INCL. TRANSPORT</span><span>${formatMoney(customerTotal)} DA</span></div><div class="row"><strong>Total collected</strong><strong>${formatMoney(Number(order.amount_paid || 0) + feeAmount)} DA</strong></div>` : ''}
      ${order.payment_notes ? `<div style="font-size:9px;color:#555;margin-top:4px;">Payment note: ${escapeHtml(order.payment_notes)}</div>` : ''}
    `

    const petalsHtml = await petalsReceiptHtml(order.customer_id)
    const html = `
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:2px;">${escapeHtml(shopName)}</div>
        <div style="font-size:14px;font-weight:bold;margin-top:6px;">ORDER #${order.order_number}</div>
        ${order.created_at ? `<div style="font-size:11px;margin-top:2px;">${escapeHtml(formatBusinessDateTime(order.created_at))}</div>` : ''}
      </div>
      <div class="divider"></div>
      <div style="margin:8px 0;">
        <div class="section">CUSTOMER</div>
        <div style="font-size:13px;font-weight:bold;">${escapeHtml(order.client_name || 'Walk-in customer')}</div>
        ${order.client_phone ? `<div style="font-size:12px;">${escapeHtml(order.client_phone)}</div>` : ''}
        ${location ? `<div style="font-size:12px;">Location: ${escapeHtml(location)}</div>` : ''}
        ${order.notes ? `<div style="font-size:12px;margin-top:4px;">Note: ${escapeHtml(order.notes)}</div>` : ''}
      </div>
      <div class="divider"></div>
      <div style="margin-bottom:8px;">
        <div class="section">ORDER ITEMS</div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${items}</tbody></table>
      </div>
      <div class="divider"></div>
      <div style="margin-bottom:8px;">${financialRows}</div>
      ${petalsHtml}
      ${orderBarcodeHtml(order.order_number)}
      <div class="footer">Blossom · Order #${order.order_number}</div>
    `

      const didPrint = await printThermalReceipt(html, `FLORAL-OS-Receipt-${order.order_number}`, './logo-Black.png')
      if (!didPrint) throw new Error('The browser did not open the print dialog.')
      setPrintNotice('Sent to the printer. If a print window opened, finish there. Your order is saved either way.')
      return true
    } catch (printException) {
      console.warn('[receipt] Could not open the print dialog.', printException)
      setPrintError('The print dialog did not open. Check browser printing support, then click Print to retry.')
      return false
    } finally {
      setPrinting(false)
    }
  }, [order, shopName, printing])

  useEffect(() => {
    if (!order || loading || error || searchParams.get('autoPrint') !== '1') return
    if (autoPrintedOrderRef.current === order.id) return
    autoPrintedOrderRef.current = order.id
    void handlePrint()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('autoPrint')
      return next
    }, { replace: true })
  }, [order, loading, error, searchParams, setSearchParams, handlePrint])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-slate-900" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error || 'Order not found'}</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => { setLoading(true); setRetryKey((key) => key + 1) }} className="px-4 py-2 bg-slate-900 text-white rounded-lg inline-flex items-center gap-2">
              <RefreshCw size={15} /> Retry
            </button>
            <button onClick={() => navigate('/orders')} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg">
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage/60 to-slate-50 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        <button onClick={() => navigate('/orders')} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900">
          <ArrowLeft size={16} /> Back to Orders
        </button>

        {(location.state?.savedOrder || location.state?.routeFollowUp) && <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <OrderSuccessAnimation className="h-14 w-14" />
          <div>
            <p className="text-sm font-bold text-emerald-950">Order #{order.order_number} is saved</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800">{location.state?.routeFollowUp ? 'The order is ready. Its delivery route is queued for follow-up.' : 'Your receipt is ready. Print it now or return to the order list.'}</p>
          </div>
        </div>}

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <button onClick={handlePrint} disabled={printing} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:col-span-1">
            <Printer size={18} /> {printing ? 'Opening print…' : printError ? 'Retry print' : 'Print receipt'}
          </button>
          <button onClick={() => navigate('/orders')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            <ArrowLeft size={17} /> Orders
          </button>
          <button onClick={() => navigate('/cart')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            <ShoppingCart size={17} /> New order
          </button>
        </div>
        {printError && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{printError}</p>}
        {printNotice && <p role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{printNotice}</p>}

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/[0.05]">
          <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Florist order ticket</p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <h1 className="font-serif text-2xl font-semibold text-slate-900">{shopName}</h1>
              <p className="shrink-0 text-sm font-bold text-slate-600">#{order.order_number}</p>
            </div>
            {order.created_at && (
              <p className="mt-1 text-xs tabular-nums text-slate-500">Created {formatBusinessDateTime(order.created_at)}</p>
            )}
          </header>

          <div className="space-y-4 p-4 sm:p-5">
            <section className="rounded-xl border border-primary/20 bg-primary-subtle/30 p-4" aria-label="Customer">
              <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Customer</h2>
              <p className="mt-2 text-lg font-bold leading-snug text-slate-950">{order.client_name || 'Walk-in customer'}</p>
              {order.client_phone && <p className="mt-0.5 text-sm text-slate-700">{order.client_phone}</p>}
              {receiptLocation(order) && <p className="mt-0.5 text-sm text-slate-700">Location: {receiptLocation(order)}</p>}
              {order.notes && <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-800"><span className="font-semibold">Note:</span> {order.notes}</p>}
            </section>

            <section aria-labelledby="receipt-items-heading">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="receipt-items-heading" className="text-xs font-bold uppercase tracking-wide text-slate-500">Order items</h2>
                <span className="text-xs text-slate-400">{(order.order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} units</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
                {(order.order_items || []).map((item, index) => <div key={item.id || index} className="flex items-start justify-between gap-4 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.product?.item_name || `Product #${item.product_id}`}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.quantity} × {formatMoney(item.unit_price)} DA{item.color ? ` · ${item.color}` : ''}{item.flower_type ? ` · ${item.flower_type}` : ''}{item.category ? ` · ${item.category}` : ''}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(item.total_price)} DA</p>
                </div>)}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4" aria-label="Order calculation and payment">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Order calculation</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4 text-slate-600"><span>Subtotal</span><span className="tabular-nums">{formatMoney(order.subtotal_amount)} DA</span></div>
                {order.price_adjustment !== 0 && <div className="flex justify-between gap-4 text-slate-600"><span>{order.price_adjustment < 0 ? 'Discount' : 'Extra charge'}</span><span className="tabular-nums">{order.price_adjustment > 0 ? '+' : ''}{formatMoney(order.price_adjustment)} DA</span></div>}
                {order.tax_amount !== 0 && <div className="flex justify-between gap-4 text-slate-600"><span>Tax</span><span className="tabular-nums">{formatMoney(order.tax_amount)} DA</span></div>}
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>Flower order total</span><span className="tabular-nums">{formatMoney(order.total_amount)} DA</span></div>
                <div className="flex justify-between gap-4 text-slate-600"><span>Payment · {paymentLabels[order.payment_method] || order.payment_method || '—'} · {order.payment_status || '—'}</span><span className="tabular-nums">Received {formatMoney(order.amount_paid)} DA</span></div>
                {order.amount_due > 0 && <div className="flex justify-between gap-4 font-semibold text-amber-800"><span>Balance due</span><span className="tabular-nums">{formatMoney(order.amount_due)} DA</span></div>}
                {Number(order.delivery_fee_amount) > 0 && <div className="flex justify-between gap-4 rounded-lg bg-blue-50 px-3 py-2 text-blue-950"><span>Transport fee · {paymentLabels[order.delivery_fee_payment_method] || order.delivery_fee_payment_method || 'separate'}</span><span className="tabular-nums">+{formatMoney(order.delivery_fee_amount)} DA</span></div>}
                {Number(order.delivery_fee_amount) > 0 && <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold text-slate-950"><span>Order total · incl. transport</span><span className="tabular-nums">{formatMoney(Number(order.total_amount || 0) + Number(order.delivery_fee_amount || 0))} DA</span></div>}
                {Number(order.delivery_fee_amount) > 0 && <div className="flex justify-between gap-4 font-semibold text-slate-700"><span>Total collected</span><span className="tabular-nums">{formatMoney(Number(order.amount_paid || 0) + Number(order.delivery_fee_amount || 0))} DA</span></div>}
              </div>
              {order.payment_notes && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600"><strong>Payment note:</strong> {order.payment_notes}</p>}
            </section>

          </div>
        </article>
      </div>
    </div>
  )
}

export default Receipt

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
