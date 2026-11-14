import { printThermalReceipt } from './printThermal'
import { orderBarcodeHtml } from '../lib/orderBarcode'
import { loyaltyDiscountForPoints } from '../lib/loyalty'
import { supabase } from '../lib/supabase'
import { formatBusinessDate } from '../lib/businessDate.js'

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const formatAmount = (value) => Number(value || 0).toLocaleString('fr-FR')
const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR')
}

/**
 * Petals this order is worth, worked out with the same per-line rule as the
 * database (bouquet contents first, then blossom_loyalty_points_per_unit).
 * Returns null for orders on the old money rule or when it can't be worked out.
 */
async function orderPetals(orderId) {
  const [{ data: order, error: orderError }, { data: lines, error: linesError }] = await Promise.all([
    supabase.from('orders').select('status, total_amount, amount_paid, loyalty_scheme').eq('id', orderId).maybeSingle(),
    supabase.from('order_items')
      .select('quantity, bouquet_petals_per_unit, category, flower_type, product_name, products(category, flower_type, item_name)')
      .eq('order_id', orderId),
  ])
  if (orderError) throw orderError
  if (linesError) throw linesError
  if (!order || order.loyalty_scheme !== 'per_flower') return null

  const rates = new Map()
  let petals = 0
  for (const line of lines || []) {
    let rate = line.bouquet_petals_per_unit
    if (rate == null) {
      const args = {
        p_category: line.category || line.products?.category || null,
        p_flower_type: line.flower_type || line.products?.flower_type || null,
        p_name: line.product_name || line.products?.item_name || null,
      }
      const key = JSON.stringify(args)
      if (!rates.has(key)) {
        const { data, error } = await supabase.rpc('blossom_loyalty_points_per_unit', args)
        if (error) throw error
        rates.set(key, Number(data) || 0)
      }
      rate = rates.get(key)
    }
    petals += Number(line.quantity || 0) * Number(rate || 0)
  }
  return {
    petals: Math.floor(petals),
    cancelled: order.status === 'cancelled',
    fullyPaid: Number(order.amount_paid || 0) >= Number(order.total_amount || 0),
  }
}

/**
 * The petals block of a receipt: what this order is worth from the moment it
 * is created, and the customer's balance. The order's petals only reach the
 * balance once it is fully paid (the database adds them then), so an unpaid
 * order shows them as waiting. A failed lookup never blocks printing.
 */
export async function petalsReceiptHtml(customerId, orderId = null) {
  if (!customerId) return ''
  const lines = []
  try {
    const { data, error } = await supabase.from('customer_loyalty_transactions')
      .select('points_delta').eq('customer_id', customerId)
    if (error) throw error
    const balance = Math.max(0, (data || []).reduce((sum, row) => sum + Number(row.points_delta || 0), 0))

    if (orderId) {
      try {
        const info = await orderPetals(orderId)
        if (info && !info.cancelled && info.petals > 0) {
          lines.push(info.fullyPaid
            ? `Petals from this order: +${info.petals.toLocaleString('fr-FR')}`
            : `Petals from this order: ${info.petals.toLocaleString('fr-FR')}<br><span style="font-size:10px">Added once the order is fully paid</span>`)
        }
      } catch (error) {
        console.warn('[receipt] Could not work out the order petals:', error)
      }
    }

    const reward = loyaltyDiscountForPoints(balance)
    lines.push(`Your petals: ${balance.toLocaleString('fr-FR')}${reward > 0 ? `<br>Reward ready: ${reward.toLocaleString('fr-FR')} DA off` : ''}`)
    return `<div class="divider"></div>
      <div class="center">${lines.join('<br>')}</div>`
  } catch (error) {
    console.warn('[receipt] Could not load petal balance:', error)
    return ''
  }
}

export function receiptLocation(order) {
  const place = [order.delivery_city, order.delivery_wilaya].filter(Boolean).join(', ')
  if (place) return place
  return order.delivery_method === 'pickup' ? 'Shop pickup' : ''
}

const deliveryMethodLabels = { pickup: 'Shop pickup', motorcycle: 'Motorcycle delivery', dhd: 'DHD shipping' }

/** Delivery method, date, time and place for a receipt, or null for walk-in quick sales. */
export function receiptDelivery(order) {
  if (!order || order.order_type === 'quick_sale') return null
  const method = deliveryMethodLabels[order.delivery_method] || (order.delivery_method ? 'Delivery' : '')
  const date = formatBusinessDate(order.delivery_date, 'fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  // A null time is stored as 00:00:00 in some rows; treat it as "not set".
  const time = order.delivery_time && order.delivery_time !== '00:00:00' ? String(order.delivery_time).slice(0, 5) : ''
  if (!method && !date && !time) return null
  const place = [order.delivery_city, order.delivery_wilaya].filter(Boolean).join(', ')
  return { method, date, time, place, isPickup: order.delivery_method === 'pickup' }
}

/** Thermal-receipt HTML for the delivery block. */
export function deliveryReceiptHtml(order) {
  const delivery = receiptDelivery(order)
  if (!delivery) return ''
  const when = delivery.isPickup ? 'Pickup' : 'Delivery'
  return `<div class="divider"></div>
    <div class="section">${when}</div>
    ${delivery.method ? `<div class="row"><span>Method</span><span>${escapeHtml(delivery.method)}</span></div>` : ''}
    <div class="row" style="font-size:14px;font-weight:900;"><span>Date</span><span>${escapeHtml(delivery.date || 'Not set')}</span></div>
    <div class="row" style="font-size:14px;font-weight:900;"><span>Time</span><span>${escapeHtml(delivery.time || 'Any time')}</span></div>
    ${delivery.place ? `<div class="row"><span>Address</span><span style="text-align:right;">${escapeHtml(delivery.place)}</span></div>` : ''}`
}

export async function printOrderReceipt(order, shopName = 'Blossom') {
  if (!order) return false

  const rows = (order.order_items || []).map((item) => {
    const name = item.product_name || item.product?.item_name || item.products?.item_name || `Product #${item.product_id ?? ''}`
    const quantity = Number(item.quantity || 0)
    const total = item.total_price ?? quantity * Number(item.unit_price || 0)
    return `<tr>
      <td style="text-align:left;padding:2px 0;">${escapeHtml(name)}</td>
      <td style="text-align:center;padding:2px 0;width:34px;">×${quantity}</td>
      <td style="text-align:right;padding:2px 0;width:72px;white-space:nowrap;">${formatAmount(total)} DA</td>
    </tr>`
  }).join('')

  const paidAmount = Number(order.amount_paid || 0)
  const dueAmount = order.amount_due == null
    ? Math.max(0, Number(order.total_amount || 0) - paidAmount)
    : Number(order.amount_due)
  const paymentStatus = order.payment_status || (dueAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid')
  const paymentLabels = { cash: 'Cash', baridimob: 'BaridiMob', usd: 'USDT' }
  const location = receiptLocation(order)
  const createdDate = formatDate(order.created_at)
  const createdTime = order.created_at && !Number.isNaN(new Date(order.created_at).getTime())
    ? new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

  const petalsHtml = await petalsReceiptHtml(order.customer_id, order.id)
  const html = `
    <div class="center">
      <div class="brand">${escapeHtml(shopName)}</div>
      <div class="sub">Flower Shop POS</div>
      <div class="order-num">Order #${escapeHtml(order.order_number)}</div>
      ${order.order_type === 'quick_sale' ? '<div class="sub">QUICK SALE · WALK-IN</div>' : ''}
      <div class="dt">${escapeHtml(`${createdDate} ${createdTime}`.trim())}</div>
    </div>
    <div class="divider"></div>
    <div class="section">Customer</div>
    <div>${escapeHtml(order.client_name || 'Walk-in customer')}</div>
    ${order.client_phone ? `<div>${escapeHtml(order.client_phone)}</div>` : ''}
    ${location && !receiptDelivery(order) ? `<div>Location: ${escapeHtml(location)}</div>` : ''}
    ${order.notes ? `<div style="margin-top:4px;">Note: ${escapeHtml(order.notes)}</div>` : ''}
    ${deliveryReceiptHtml(order)}
    <div class="divider"></div>
    <div class="section">Items</div>
    <table><tbody>${rows || '<tr><td>No items</td></tr>'}</tbody></table>
    <div class="divider"></div>
    <div class="row"><span>Subtotal</span><span>${formatAmount(order.subtotal_amount ?? order.total_amount)} DA</span></div>
    <div class="row"><span>Payment</span><span>${escapeHtml(paymentLabels[order.payment_method] || order.payment_method || '—')}</span></div>
    <div class="row"><span>Status</span><span>${escapeHtml(paymentStatus)}</span></div>
    ${paidAmount > 0 ? `<div class="row"><span>Paid</span><span>${formatAmount(paidAmount)} DA</span></div>` : ''}
    ${dueAmount > 0 ? `<div class="row"><span>Due</span><span>${formatAmount(dueAmount)} DA</span></div>` : ''}
    <div class="total-row"><span>TOTAL</span><span>${formatAmount(order.total_amount)} DA</span></div>
    ${petalsHtml}
    ${orderBarcodeHtml(order.order_number)}
    <div class="footer">Thank you for your order!<br>${escapeHtml(shopName)} — Blossom Workspace</div>
  `

  return printThermalReceipt(html, `FLORAL-OS-Receipt-${order.order_number}`, './logo-Black.png')
}
