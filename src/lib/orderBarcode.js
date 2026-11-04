// Receipt barcodes use Code 128 and hold "ORD<order number>". The prefix uses
// letters that sit in the same place on QWERTY and AZERTY keyboards, because a
// USB scanner "types" what it reads.
const PREFIX = 'ORD'

// Bar and space widths for each Code 128 value.
const PATTERNS = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ')
const START_B = 104
const STOP = 106
const QUIET_MODULES = 10
const MODULE_MM = 5 / 12 // exactly 3 printer dots at 576 dots across 80 mm
const HEIGHT_MM = 12

function code128Values(text) {
  const values = [...text].map((character) => character.charCodeAt(0) - 32)
  const checksum = values.reduce((sum, value, index) => sum + value * (index + 1), START_B) % 103
  return [START_B, ...values, checksum, STOP]
}

export function code128DataUrl(text) {
  let x = QUIET_MODULES
  let bars = ''
  for (const value of code128Values(text)) {
    [...PATTERNS[value]].forEach((width, index) => {
      if (index % 2 === 0) bars += `M${x} 0h${width}v1h-${width}z`
      x += Number(width)
    })
  }
  const modules = x + QUIET_MODULES
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${modules}" height="1" fill="#fff"/><path fill="#000" d="${bars}"/></svg>`
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, modules }
}

export function orderBarcodePayload(orderNumber) {
  const number = String(orderNumber ?? '').trim()
  return /^[0-9A-Za-z]{1,8}$/.test(number) ? `${PREFIX}${number}` : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Reads a scanned code. Returns { orderNumber } for a receipt barcode,
 * { orderId } for the QR code on receipts printed by version 1.0.5, or null.
 */
export function parseOrderScan(scanned) {
  const text = String(scanned ?? '').trim()
  if (text.slice(0, PREFIX.length).toUpperCase() !== PREFIX) return null
  const rest = text.slice(PREFIX.length)
  if (rest.startsWith('-')) {
    const orderId = rest.slice(1).toLowerCase()
    return UUID.test(orderId) ? { orderId } : null
  }
  return /^[0-9A-Za-z]{1,9}$/.test(rest) && /[0-9]/.test(rest) ? { orderNumber: rest } : null
}

/** Receipt block for printThermalReceipt. Empty if the order has no number yet. */
export function orderBarcodeHtml(orderNumber) {
  const payload = orderBarcodePayload(orderNumber)
  if (!payload) return ''
  const { url, modules } = code128DataUrl(payload)
  return `<div style="margin-top:8px;page-break-inside:avoid;">
    <img src="${url}" alt="Order barcode" style="display:block;width:${(modules * MODULE_MM).toFixed(2)}mm;height:${HEIGHT_MM}mm;margin:0 auto;" />
  </div>`
}
