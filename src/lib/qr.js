import qrcode from 'qrcode-generator'

// Renders text as a QR code SVG data URL, so it stays sharp on thermal paper
// and works without a network connection. `version` 0 picks the smallest size
// that fits; set a larger one to leave room for a logo in the centre.
export function qrDataUrl(text, { errorCorrection = 'M', version = 0, margin = 4 } = {}) {
  const qr = qrcode(version, errorCorrection)
  qr.addData(String(text), 'Byte')
  qr.make()

  const size = qr.getModuleCount()
  const full = size + margin * 2
  let path = ''
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (qr.isDark(y, x)) path += `M${x + margin} ${y + margin}h1v1h-1z`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="#fff"/><path fill="#000" d="${path}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Loyalty cards have a logo over the centre, so they use the highest error
// correction and a size with enough modules to survive it. The content is
// still only the card code, so cards already printed keep scanning as before.
export function loyaltyCardQrDataUrl(code) {
  return qrDataUrl(code, { errorCorrection: 'H', version: 4, margin: 0 })
}
