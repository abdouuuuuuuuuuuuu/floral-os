// electron/main.js

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { pickReceiptPrinter, printReceipt } from './receiptPrint.js'
import { execFile } from 'node:child_process'
import pkg from 'electron-updater'
import path from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'node:util'

const { autoUpdater } = pkg
const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Trust boundary ─────────────────────────────────────────────────────────
// Only the Blossom page itself may use the privileged IPC bridge (cash drawer,
// local model). Any other page — a link opened in a new window, or a frame —
// must never reach it.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
let mainWindow = null

const isAppUrl = (url) => {
  try {
    const parsed = new URL(url)
    if (DEV_SERVER_URL) return parsed.origin === new URL(DEV_SERVER_URL).origin
    return parsed.protocol === 'file:' && path.normalize(fileURLToPath(parsed)) === path.join(__dirname, '..', 'dist', 'index.html')
  } catch {
    return false
  }
}

const trustedAppWindow = (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return null
  if (event.senderFrame?.parent || !isAppUrl(event.senderFrame?.url || event.sender.getURL())) return null
  return mainWindow
}

const openExternalSafely = (url) => {
  try {
    if (new URL(url).protocol === 'https:') void shell.openExternal(url)
  } catch {
    /* ignore malformed links */
  }
}

// Prints a receipt directly on the receipt printer, as one page of the right length.
ipcMain.handle('blossom-receipt:print', async (event, request) => {
  const appWindow = trustedAppWindow(event)
  if (!appWindow) throw new Error('Untrusted print request.')
  if (typeof request?.html !== 'string' || request.html.length > 5_000_000) throw new Error('Invalid receipt.')
  const printer = pickReceiptPrinter(await appWindow.webContents.getPrintersAsync())
  if (!printer) return { printed: false, reason: 'No receipt printer found.' }
  return printReceipt(request.html, printer, app.getPath('temp'))
})

// Saves the loyalty card sheets the page has prepared as an A4 PDF.
ipcMain.handle('blossom-loyalty-cards:export-pdf', async (event, request) => {
  const appWindow = trustedAppWindow(event)
  if (!appWindow) throw new Error('Untrusted PDF export request.')

  const label = /^[A-Za-z0-9-]{1,20}$/.test(String(request?.label)) ? request.label : 'cards'
  const { canceled, filePath } = await dialog.showSaveDialog(appWindow, {
    title: 'Save loyalty cards as PDF',
    defaultPath: path.join(app.getPath('documents'), `blossom-loyalty-${label}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { saved: false }

  const pdf = await appWindow.webContents.printToPDF({
    pageSize: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  })
  await writeFile(filePath, pdf)
  shell.showItemInFolder(filePath)
  return { saved: true, filePath }
})

// Send the ESC/POS drawer pulse as a RAW Windows spooler job. This avoids the
// browser print dialog and does not print/feed a receipt. The Windows default
// printer must be the receipt printer connected to the cash drawer.
ipcMain.handle('blossom-cash-drawer:open', async (event) => {
  const appWindow = trustedAppWindow(event)
  if (!appWindow) throw new Error('Untrusted cash drawer request.')
  if (process.platform !== 'win32') throw new Error('Direct cash drawer control is available in the Windows desktop app.')

  const printers = await appWindow.webContents.getPrintersAsync()
  const printer = printers.find((candidate) => candidate.isDefault)
  if (!printer?.name) throw new Error('Set the receipt printer as the Windows default printer first.')

  const escapedPrinterName = printer.name.replaceAll("'", "''")
  const script = `$ErrorActionPreference = 'Stop'
$printerName = '${escapedPrinterName}'
$source = @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public class BlossomDocInfo {
  [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
  [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
  [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
}
public static class BlossomRawPrinter {
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr handle, int level, [In] BlossomDocInfo info);
  [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
}
'@
Add-Type -TypeDefinition $source
$handle = [IntPtr]::Zero
if (-not [BlossomRawPrinter]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero)) { throw "Could not open printer '$printerName'." }
$jobStarted = $false
$pageStarted = $false
try {
  $info = New-Object BlossomDocInfo
  $info.pDocName = 'Blossom cash drawer'
  $info.pOutputFile = $null
  $info.pDataType = 'RAW'
  if ([BlossomRawPrinter]::StartDocPrinter($handle, 1, $info) -eq 0) { throw 'Could not start the raw printer job.' }
  $jobStarted = $true
  if (-not [BlossomRawPrinter]::StartPagePrinter($handle)) { throw 'Could not start the printer page.' }
  $pageStarted = $true
  [byte[]]$pulse = 27, 112, 0, 25, 250
  [int]$written = 0
  if (-not [BlossomRawPrinter]::WritePrinter($handle, $pulse, $pulse.Length, [ref]$written) -or $written -ne $pulse.Length) { throw 'The printer did not accept the drawer pulse.' }
  if (-not [BlossomRawPrinter]::EndPagePrinter($handle)) { throw 'Could not finish the raw printer page.' }
  $pageStarted = $false
  if (-not [BlossomRawPrinter]::EndDocPrinter($handle)) { throw 'Could not finish the raw printer job.' }
  $jobStarted = $false
} finally {
  if ($pageStarted) { [void][BlossomRawPrinter]::EndPagePrinter($handle) }
  if ($jobStarted) { [void][BlossomRawPrinter]::EndDocPrinter($handle) }
  [void][BlossomRawPrinter]::ClosePrinter($handle)
}
Write-Output 'CASH_DRAWER_PULSE_SENT'`

  await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 2000,
  })
  return { opened: true, printerName: printer.name }
})

// ─── Auto Updater ───────────────────────────────────────────────────────────
autoUpdater.logger = console
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

const sendToWindow = (channel, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data)
}

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for update...')
})

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info.version)
  sendToWindow('update-available', info)
})

autoUpdater.on('update-not-available', () => {
  console.log('[Updater] App is up to date')
})

autoUpdater.on('error', (err) => {
  // Without this the updater throws an unhandled rejection when GitHub is
  // unreachable — which on a shop's connection is a normal Tuesday.
  console.error('[Updater] Error:', err?.message || err)
})

autoUpdater.on('download-progress', (progress) => {
  console.log(`[Updater] Download: ${Math.round(progress.percent)}%`)
  sendToWindow('update-progress', progress)
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Update downloaded')
  sendToWindow('update-downloaded', info)
})

ipcMain.on('quit-and-install', (event) => {
  // Same trust check as every other bridge call: only the Blossom page itself.
  if (!trustedAppWindow(event)) return
  autoUpdater.quitAndInstall(false, true)
})

// Ollama is an optional, on-device language layer. Keep its destination fixed
// to loopback so renderer input can never turn this bridge into a proxy.
const LOCAL_MODEL_URL = 'http://127.0.0.1:11434'
const localModelRequest = async (endpoint, body, timeoutMs = body ? 45_000 : 2500) => {
  const options = { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeoutMs) }
  if (body) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const response = await fetch(`${LOCAL_MODEL_URL}${endpoint}`, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) throw new Error(payload.error || `Local model returned ${response.status}`)
  return payload
}

ipcMain.handle('blossom-local-model:status', async () => {
  try {
    const data = await localModelRequest('/api/tags')
    return { available: true, models: (data.models || []).map(({ name, size }) => ({ name, size })) }
  } catch {
    return { available: false, models: [], error: 'Ollama is not running on this computer.' }
  }
})

const LOCAL_ASSISTANT_TOOL_NAMES = new Set([
  'lookup_order', 'search_orders', 'list_orders', 'recent_order_creators', 'check_stock',
  'check_product_price', 'analyze_reports', 'create_order', 'edit_order', 'record_order_payment',
  'cancel_order', 'delay_order', 'delete_order', 'get_business_overview', 'find_customer', 'guide_workflow',
])

ipcMain.handle('blossom-local-model:chat', async (event, request) => {
  if (!trustedAppWindow(event)) throw new Error('Untrusted local assistant request.')
  const model = typeof request?.model === 'string' ? request.model : ''
  if (!/^[\w.-]+(?::[\w.-]+)?$/.test(model)) throw new Error('Choose a valid installed local model.')
  if (!Array.isArray(request?.messages) || request.messages.length > 12) throw new Error('Invalid local assistant conversation.')

  let totalMessageChars = 0
  const messages = request.messages.map((message) => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') throw new Error('Invalid local assistant message.')
    const content = message.content.slice(0, 6000)
    totalMessageChars += content.length
    return { role: message.role, content }
  })
  if (totalMessageChars > 24000) throw new Error('Local assistant conversation is too large.')
  if (request?.tools != null && !Array.isArray(request.tools)) throw new Error('Invalid local assistant tools.')
  const tools = (request.tools || []).slice(0, 20).map((tool) => {
    const definition = tool?.function
    if (tool?.type !== 'function' || !definition || !LOCAL_ASSISTANT_TOOL_NAMES.has(definition.name)) throw new Error('Unsupported local assistant tool.')
    return {
      type: 'function',
      function: {
        name: definition.name,
        description: typeof definition.description === 'string' ? definition.description.slice(0, 1200) : '',
        parameters: definition.parameters && typeof definition.parameters === 'object' ? definition.parameters : { type: 'object', properties: {} },
      },
    }
  })
  const requestedTimeout = Number(request.timeoutMs) || 45_000
  const timeoutMs = Math.max(1000, Math.min(45_000, requestedTimeout))
  return localModelRequest('/api/chat', { model, messages, tools, stream: false, options: { temperature: 0.1, num_ctx: 8192 } }, timeoutMs)
})

// The grounded-answer pass has no tools and streams only wording based on data
// already returned by Blossom. Keep this separate from the tool-routing IPC.
ipcMain.on('blossom-local-model:stream', async (event, payload) => {
  const { requestId, request } = payload || {}
  const send = (channel, data) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, { requestId, ...data })
  }
  try {
    if (!trustedAppWindow(event)) throw new Error('Untrusted local assistant request.')
    if (typeof requestId !== 'string' || !/^stream-[\w-]{8,100}$/.test(requestId)) throw new Error('Invalid local assistant request id.')
    const model = typeof request?.model === 'string' ? request.model : ''
    if (!/^[\w.-]+(?::[\w.-]+)?$/.test(model)) throw new Error('Choose a valid installed local model.')
    if (!Array.isArray(request?.messages) || request.messages.length > 12 || (request.tools || []).length) throw new Error('Invalid grounded assistant conversation.')
    let totalMessageChars = 0
    const messages = request.messages.map((message) => {
      if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') throw new Error('Invalid local assistant message.')
      const content = message.content.slice(0, 6000)
      totalMessageChars += content.length
      return { role: message.role, content }
    })
    if (totalMessageChars > 24000) throw new Error('Local assistant conversation is too large.')

    const requestedTimeout = Number(request.timeoutMs) || 12_000
    const timeoutMs = Math.max(1000, Math.min(45_000, requestedTimeout))
    const response = await fetch(`${LOCAL_MODEL_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: [], stream: true, options: { temperature: 0.1, num_ctx: 8192 } }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok || !response.body) throw new Error(`Local model returned ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let content = ''
    const processLine = (line) => {
      if (!line.trim()) return
      const part = JSON.parse(line)
      if (part.error) throw new Error(part.error)
      const token = String(part.message?.content || '')
      if (token) {
        content += token
        send('blossom-local-model:stream-chunk', { content: token })
      }
    }
    while (true) {
      const { value, done } = await reader.read()
      pending += decoder.decode(value || new Uint8Array(), { stream: !done })
      const lines = pending.split('\n')
      pending = lines.pop() || ''
      for (const line of lines) processLine(line)
      if (done) break
    }
    processLine(pending)
    send('blossom-local-model:stream-done', { result: { message: { role: 'assistant', content } } })
  } catch (error) {
    send('blossom-local-model:stream-done', { error: error?.name === 'TimeoutError' ? 'The local model took too long to respond.' : String(error?.message || 'The local model could not complete this request.').slice(0, 300) })
  }
})

// ─── Window ─────────────────────────────────────────────────────────────────
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    autoHideMenuBar: true,
    // Don't show a white rectangle while the renderer boots.
    show: false,
    backgroundColor: '#E8EDE7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // DevTools in development only. In a packaged build F12 and
      // Ctrl+Shift+I do nothing.
      devTools: !app.isPackaged,
    },
    // .ico rather than .png — Windows wants a real icon file, and the
    // previous path pointed at logo-Black.png which doesn't exist
    // (the file in public/ is logoBlack.png, no hyphen).
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
  })

  win.once('ready-to-show', () => win.show())
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // External links (OpenStreetMap, GitHub) open in the system browser. A new
  // Electron window would load the Blossom preload and hand that site the
  // cash-drawer bridge.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternalSafely(url)
  })

  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // If the renderer fails to load, say so instead of showing a blank
  // window with no explanation.
  win.webContents.on('did-fail-load', (_e, code, description) => {
    console.error(`[Window] Failed to load: ${code} ${description}`)
  })

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[Updater] Check failed:', err?.message || err)
      })
    }, 3000)
  }

  return win
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
//
// THIS WAS THE BUG. createWindow() was defined and never called — no
// whenReady handler, so Electron started, had no windows, and the
// window-all-closed handler quit immediately. The app "didn't start"
// because nothing ever asked it to open anything.

// One instance only. Launching a second copy focuses the existing window
// instead of opening a second till against the same register.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
