import { printThermalReceipt } from './printThermal'

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
  const deliveryLabels = { motorcycle: 'Motorcycle delivery', dhd: 'DHD delivery', pickup: 'Shop pickup' }
  const createdDate = formatDate(order.created_at)
  const createdTime = order.created_at && !Number.isNaN(new Date(order.created_at).getTime())
    ? new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

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
    ${order.delivery_date ? `<div class="row"><span>Delivery date</span><span>${escapeHtml(formatDate(order.delivery_date))}${order.delivery_time ? ` ${escapeHtml(order.delivery_time)}` : ''}</span></div>` : ''}
    ${order.delivery_method ? `<div class="row"><span>Method</span><span>${escapeHtml(deliveryLabels[order.delivery_method] || order.delivery_method)}</span></div>` : ''}
    ${order.notes ? `<div style="margin-top:4px;">Note: ${escapeHtml(order.notes)}</div>` : ''}
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
    <div class="footer">Thank you for your order!<br>${escapeHtml(shopName)} — Blossom Workspace</div>
  `

  return printThermalReceipt(html, `FLORAL-OS-Receipt-${order.order_number}`, '/logo-Black.png')
}
