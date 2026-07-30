// utils/printThermal.js

export async function printThermalReceipt(htmlContent, title = 'Receipt', logoPath = null) {
  const old = document.getElementById('thermal-print-iframe')
  if (old) old.remove()

  // ─── Load logo as Base64 ───────────────────────────────────────────────────
  let logoHtml = ''
  if (logoPath) {
    try {
      const absoluteUrl = new URL(logoPath, window.location.origin).href
      const res = await fetch(absoluteUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      // Simple img tag — no canvas processing that can fail
      logoHtml = `<div class="logo-wrap"><img src="${dataUrl}" class="logo" alt="logo" /></div>`
    } catch (err) {
      console.error('[printThermalReceipt] Logo failed to load:', err)
    }
  }

  const fontUrl = `${window.location.origin}/fonts/LibertinusMath-Regular.ttf`

  // ─── Create iframe ─────────────────────────────────────────────────────────
  const iframe = document.createElement('iframe')
  iframe.id = 'thermal-print-iframe'

  // ONLY pixels here — never mm
  iframe.style.position = 'fixed'
  iframe.style.top = '0px'
  iframe.style.left = '0px'
  iframe.style.width = '302px'      // 80mm ≈ 302px
  iframe.style.height = '1px'
  iframe.style.overflow = 'hidden'
  iframe.style.border = 'none'
  iframe.style.visibility = 'hidden'
  iframe.style.pointerEvents = 'none'

  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()

  doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      @page {
        margin: 0;
        size: 80mm auto;
      }

      @font-face {
        font-family: 'Libertinus Math';
        src: url('${fontUrl}') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      /* Force everything to pure black */
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        color: #000 !important;
        background-color: #fff !important;
        border-color: #000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        -webkit-font-smoothing: none !important;
        text-shadow: none !important;
        box-shadow: none !important;
        opacity: 1 !important;
      }

      html, body {
        width: 80mm;
        min-width: 80mm;
        max-width: 80mm;
        overflow-x: hidden;
        background: #fff;
      }

      body {
        font-family: 'Libertinus Math', 'Courier New', 'Segoe UI', monospace;
        font-size: 13px;
        line-height: 1.45;
        padding: 2mm 3mm 25mm 3mm;
        font-weight: 700;
      }

      /* ─── Logo ─── */
      .logo-wrap {
        width: 100%;
        text-align: center;
        margin-bottom: 6px;
        background: #fff !important;
      }
      .logo {
        width: 50%;
        max-width: 200px;
        height: auto;
        display: block;
        margin: 0 auto;
        /* Force logo to pure black — safe because it's only on the image */
        filter: grayscale(100%) contrast(200%) brightness(0.9) !important;
        image-rendering: crisp-edges;
      }

      .divider {
        border-top: 1.5px solid #000;
        margin: 6px 0;
      }
      .center { text-align: center; }
      .brand {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 1px;
        margin-bottom: 2px;
      }
      .sub {
        font-size: 11px;
        margin-bottom: 6px;
        font-weight: 700;
      }
      .order-num {
        font-size: 14px;
        font-weight: 900;
        margin-top: 4px;
      }
      .dt {
        font-size: 11px;
        margin-bottom: 6px;
        font-weight: 700;
      }
      .section {
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        margin-bottom: 3px;
        letter-spacing: 0.5px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 2px;
        font-weight: 700;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }
      td {
        padding: 1px 0;
        font-size: 13px;
        font-weight: 700;
      }

      .total-row {
        display: flex;
        justify-content: space-between;
        font-size: 15px;
        font-weight: 900;
        border-top: 2px solid #000;
        padding-top: 3px;
        margin-top: 3px;
      }
      .footer {
        text-align: center;
        font-size: 10px;
        margin-top: 10px;
        padding-top: 6px;
        border-top: 1.5px solid #000;
        font-weight: 700;
        page-break-inside: avoid;
      }

      .cutter-spacer {
        height: 20mm;
        width: 100%;
        page-break-inside: avoid;
      }

      a { color: #000 !important; text-decoration: none; }
    </style>
  </head>
  <body>
    ${logoHtml}
    ${htmlContent}
    <div class="cutter-spacer"></div>
  </body>
</html>`)

  doc.close()

  const win = iframe.contentWindow

  try {
    if (doc.fonts && doc.fonts.ready) {
      await doc.fonts.ready
    }
    await new Promise(r => setTimeout(r, 600))

    win.focus()
    win.print()

    const cleanup = () => {
      const el = document.getElementById('thermal-print-iframe')
      if (el) el.remove()
    }

    if (win.matchMedia) {
      win.addEventListener('afterprint', cleanup, { once: true })
    }
    setTimeout(cleanup, 4000)

  } catch (err) {
    console.error('[printThermalReceipt] Print failed:', err)
    const el = document.getElementById('thermal-print-iframe')
    if (el) el.remove()
  }
}