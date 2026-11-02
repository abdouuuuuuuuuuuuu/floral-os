import { qrDataUrl } from './qr.js'

// Receipt QR codes hold "ORD-<order id>". Letters, digits and hyphens only,
// because a USB scanner "types" the code and punctuation such as ":" or "/"
// comes out wrong on an AZERTY keyboard layout.
const PREFIX = 'ORD-'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function orderQrPayload(orderId) {
  const id = String(orderId ?? '').trim().toLowerCase()
  return UUID.test(id) ? `${PREFIX}${id.toUpperCase()}` : null
}

/** Returns the order id from a scanned code, or null if it is not an order QR. */
export function parseOrderQrPayload(scanned) {
  const text = String(scanned ?? '').trim().toLowerCase()
  if (!text.startsWith(PREFIX.toLowerCase())) return null
  const id = text.slice(PREFIX.length)
  return UUID.test(id) ? id : null
}

/** Receipt block for printThermalReceipt. Empty if the order has no saved id yet. */
export function orderQrHtml(orderId) {
  const payload = orderQrPayload(orderId)
  if (!payload) return ''
  return `<div style="text-align:center;margin-top:8px;page-break-inside:avoid;">
    <img src="${qrDataUrl(payload)}" alt="Order QR code" style="display:block;width:32mm;height:32mm;margin:0 auto;" />
    <div style="font-size:10px;font-weight:700;">Scan to open this order</div>
  </div>`
}
