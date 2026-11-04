// utils/printThermal.js

export async function printThermalReceipt(
  htmlContent,
  title = 'Receipt',
  logoPath = null
) {
  const oldIframe = document.getElementById('thermal-print-iframe')
  if (oldIframe) oldIframe.remove()

  let logoHtml = ''

  if (logoPath) {
    try {
      const absoluteUrl = new URL(logoPath, window.location.href).href
      const response = await fetch(absoluteUrl)

      if (!response.ok) {
        throw new Error(`Logo request failed: HTTP ${response.status}`)
      }

      const blob = await response.blob()

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      logoHtml = `
        <div class="logo-wrap">
          <img src="${dataUrl}" class="logo" alt="Logo" />
        </div>
      `
    } catch (error) {
      console.error('[printThermalReceipt] Logo failed to load:', error)
    }
  }

  const documentHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>

    <style>
      @page {
        size: 80mm auto;
        margin: 0;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        color: #000 !important;
        background: #fff !important;
        border-color: #000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        -webkit-font-smoothing: none !important;
        text-shadow: none !important;
        box-shadow: none !important;
        opacity: 1 !important;
      }

      html,
      body {
        width: 80mm;
        min-width: 80mm;
        max-width: 80mm;
        overflow-x: hidden;
        background: #fff !important;
      }

      body {
        font-family: 'Courier New', 'Segoe UI', monospace;
        font-size: 13px;
        line-height: 1.45;
        font-weight: 700;
        padding: 2mm 3mm 2mm 3mm;
      }

      .logo-wrap {
        width: 100%;
        text-align: center;
        margin-bottom: 6px;
      }

      .logo {
        display: block;
        width: 50%;
        max-width: 200px;
        height: auto;
        margin: 0 auto;
        filter: grayscale(100%) contrast(200%) brightness(0.9) !important;
        image-rendering: crisp-edges;
      }

      .divider {
        border-top: 1.5px solid #000;
        margin: 6px 0;
      }

      .center {
        text-align: center;
      }

      .brand {
        margin-bottom: 2px;
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 1px;
      }

      .sub {
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
      }

      .order-num {
        margin-top: 4px;
        font-size: 14px;
        font-weight: 900;
      }

      .dt {
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
      }

      .section {
        margin-bottom: 3px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.5px;
        text-transform: uppercase;
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
        margin-top: 3px;
        padding-top: 3px;
        border-top: 2px solid #000;
        font-size: 15px;
        font-weight: 900;
      }

      .footer {
        margin-top: 8px;
        padding-top: 5px;
        border-top: 1.5px solid #000;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        page-break-inside: avoid;
      }

      a {
        color: #000 !important;
        text-decoration: none;
      }
    </style>
  </head>

  <body>
    ${logoHtml}
    ${htmlContent}
  </body>
</html>`

  // The desktop app prints straight to the receipt printer as one page sized to
  // the receipt, so long receipts aren't cut at the driver's default page length.
  const printDirect = window.electronAPI?.receipt?.print
  if (printDirect) {
    try {
      const result = await printDirect({ html: documentHtml })
      if (result?.printed) return true
      console.warn('[printThermalReceipt] Direct print unavailable:', result?.reason)
    } catch (error) {
      console.warn('[printThermalReceipt] Direct print failed:', error)
    }
  }

  const iframe = document.createElement('iframe')
  iframe.id = 'thermal-print-iframe'

  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    width: '80mm',
    height: '1px',
    overflow: 'hidden',
    border: 'none',
    pointerEvents: 'none'
  })

  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(documentHtml)
  doc.close()

  const win = iframe.contentWindow

  try {
    await new Promise((resolve) => setTimeout(resolve, 600))

    let printStarted = false
    const markPrintStarted = () => { printStarted = true }
    win.addEventListener('beforeprint', markPrintStarted, { once: true })
    win.focus()
    win.print()
    win.removeEventListener('beforeprint', markPrintStarted)

    if (!printStarted) {
      throw new Error('The browser did not dispatch beforeprint; printing may be blocked in this embedded browser.')
    }

    const cleanup = () => {
      const element = document.getElementById('thermal-print-iframe')
      if (element) element.remove()
    }

    if (win.matchMedia) {
      win.addEventListener('afterprint', cleanup, { once: true })
    }

    setTimeout(cleanup, 4000)
    return true
  } catch (error) {
    console.error('[printThermalReceipt] Print failed:', error)

    const element = document.getElementById('thermal-print-iframe')
    if (element) element.remove()
    return false
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Example:
// await printThermalReceipt(receiptHtml, 'Receipt', '/logo.png')
