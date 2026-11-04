// Prints receipts as an image sent straight to the printer (ESC/POS over a RAW
// spooler job). Going through the Windows driver cuts long receipts at its paper
// length (POS-80 defaults to 80 x 210 mm). Raw printing has no page length: the
// printer feeds until the image ends, then cuts once.

import { BrowserWindow, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PRINTER_DOTS = 576 // 72 mm printable width at 203 dpi, on 80 mm paper
const PAGE_CSS_WIDTH = 302 // the 80 mm receipt layout, in CSS pixels
const MAX_HEIGHT_DOTS = 16_000 // about 2 metres
const DARK_BELOW = 165
const BAND_LINES = 256 // the image goes in small bands so the printer's buffer keeps up
const FEED_LINES = 4

const RECEIPT_PRINTER = /pos[-\s_]?\d|receipt|thermal|xprinter|tm-?[a-z]?\d|rp-?\d|80\s?mm/i

// Prefers the Windows default when it is a receipt printer, then any receipt
// printer. Returns null rather than sending receipt data to an office printer.
export function pickReceiptPrinter(printers) {
  const receiptPrinters = printers.filter((printer) => RECEIPT_PRINTER.test(printer.name))
  return (receiptPrinters.find((printer) => printer.isDefault) || receiptPrinters[0])?.name ?? null
}

// Draws the receipt in a hidden window. Returns one row of pixels per printer dot,
// each pixel true when dark.
export async function renderReceiptBitmap(html, tempDir) {
  const filePath = path.join(tempDir, `blossom-receipt-${randomUUID()}.html`)
  const window = new BrowserWindow({
    show: false,
    width: PAGE_CSS_WIDTH,
    height: 800,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  try {
    await writeFile(filePath, html, 'utf8')
    await window.loadFile(filePath)
    const debug = window.webContents.debugger
    debug.attach('1.3')
    const scale = PRINTER_DOTS / PAGE_CSS_WIDTH
    await debug.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
    await debug.sendCommand('Emulation.setDeviceMetricsOverride', { width: PAGE_CSS_WIDTH, height: 800, deviceScaleFactor: scale, mobile: false })
    const contentHeight = await window.webContents.executeJavaScript(`(async () => {
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      return Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    })()`)
    if (contentHeight * scale > MAX_HEIGHT_DOTS) throw new Error('The receipt is too long to print as one image.')
    const shot = await debug.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { x: 0, y: 0, width: PAGE_CSS_WIDTH, height: contentHeight, scale: 1 },
    })
    debug.detach()
    const image = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64'))
    const { width, height } = image.getSize()
    const pixels = image.toBitmap() // BGRA
    const rows = []
    for (let y = 0; y < height; y += 1) {
      const row = Array.from({ length: PRINTER_DOTS }, () => false)
      for (let x = 0; x < Math.min(width, PRINTER_DOTS); x += 1) {
        const i = (y * width + x) * 4
        const luma = 0.114 * pixels[i] + 0.587 * pixels[i + 1] + 0.299 * pixels[i + 2]
        row[x] = luma < DARK_BELOW
      }
      rows.push(row)
    }
    return rows
  } finally {
    window.destroy()
    await rm(filePath, { force: true }).catch(() => {})
  }
}

// ESC @ resets the printer, GS v 0 prints each band, ESC d feeds, GS V 66 0 cuts.
export function buildEscPos(rows) {
  const bytesPerLine = Math.ceil(PRINTER_DOTS / 8)
  const parts = [Buffer.from([0x1b, 0x40])]
  for (let start = 0; start < rows.length; start += BAND_LINES) {
    const band = rows.slice(start, start + BAND_LINES)
    parts.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerLine & 0xff, bytesPerLine >> 8, band.length & 0xff, band.length >> 8]))
    const data = Buffer.alloc(bytesPerLine * band.length)
    band.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) data[y * bytesPerLine + (x >> 3)] |= 0x80 >> (x & 7)
    }))
    parts.push(data)
  }
  parts.push(Buffer.from([0x1b, 0x64, FEED_LINES, 0x1d, 0x56, 0x42, 0x00]))
  return Buffer.concat(parts)
}

const RAW_PRINT_SCRIPT = `$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public class BlossomReceiptDocInfo {
  [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
  [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
  [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
}
public static class BlossomReceiptPrinter {
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr handle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] BlossomReceiptDocInfo info);
  [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] data, int length, out int written);
}
'@
Add-Type -TypeDefinition $source
[byte[]]$bytes = [System.IO.File]::ReadAllBytes($env:BLOSSOM_RAW_FILE)
$handle = [IntPtr]::Zero
if (-not [BlossomReceiptPrinter]::OpenPrinter($env:BLOSSOM_RAW_PRINTER, [ref]$handle, [IntPtr]::Zero)) { throw 'Could not open the receipt printer.' }
try {
  $info = New-Object BlossomReceiptDocInfo
  $info.pDocName = 'Blossom receipt'
  $info.pDataType = 'RAW'
  if ([BlossomReceiptPrinter]::StartDocPrinter($handle, 1, $info) -eq 0) { throw 'Could not start the receipt job.' }
  try {
    if (-not [BlossomReceiptPrinter]::StartPagePrinter($handle)) { throw 'Could not start the receipt.' }
    [int]$written = 0
    if (-not [BlossomReceiptPrinter]::WritePrinter($handle, $bytes, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) { throw 'Could not send the whole receipt.' }
    [void][BlossomReceiptPrinter]::EndPagePrinter($handle)
  } finally {
    [void][BlossomReceiptPrinter]::EndDocPrinter($handle)
  }
} finally {
  [void][BlossomReceiptPrinter]::ClosePrinter($handle)
}
Write-Output 'RECEIPT_SENT'`

async function sendRaw(bytes, printerName, tempDir) {
  const filePath = path.join(tempDir, `blossom-receipt-${randomUUID()}.bin`)
  try {
    await writeFile(filePath, bytes)
    const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', RAW_PRINT_SCRIPT], {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 10_000,
      env: { ...process.env, BLOSSOM_RAW_FILE: filePath, BLOSSOM_RAW_PRINTER: printerName },
    })
    if (!stdout.includes('RECEIPT_SENT')) throw new Error('The printer did not accept the receipt.')
  } finally {
    await rm(filePath, { force: true }).catch(() => {})
  }
}

export async function printReceipt(html, printerName, tempDir) {
  if (process.platform !== 'win32') return { printed: false, reason: 'Direct printing needs Windows.' }
  try {
    const rows = await renderReceiptBitmap(html, tempDir)
    await sendRaw(buildEscPos(rows), printerName, tempDir)
    return { printed: true, printer: printerName, lengthMm: Math.round(rows.length / 8) }
  } catch (error) {
    console.error('Direct receipt printing failed:', error)
    return { printed: false, reason: error?.message || 'Direct printing failed.' }
  }
}
