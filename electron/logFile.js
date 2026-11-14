// Keeps a log file on the shop PC, so a failure at the till leaves a trace.
//
// Everything the main process writes with console.log/warn/error, and every
// error the page logs, is also appended to:
//   %APPDATA%\Blossom POS\logs\blossom.log
// When the file passes 5 MB at startup it becomes blossom.old.log (one
// previous file is kept), so it never grows without limit.

import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'

const MAX_BYTES = 5 * 1024 * 1024
let logPath = null

// The log is a plain file on the till. Page errors can quote server replies,
// so mask anything secret or personal before it is written:
// tokens, keys and passwords entirely; emails and phone numbers mostly.
export function sanitize(text) {
  return String(text)
    // JWTs (Supabase session / anon keys)
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[token]')
    // Authorization headers and API tokens
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [token]')
    .replace(/\b(ghp|github_pat|gho|sk|pk|sbp|sb_secret|sb_publishable)_[A-Za-z0-9_]{8,}/g, '[token]')
    // key=value or "key": "value" for secret-looking keys
    .replace(/(["']?\b(?:password|passwd|pwd|secret|token|access_token|refresh_token|apikey|api_key|authorization|service_role)\b["']?\s*[:=]\s*)(["']?)[^"'\s,}&]+\2/gi, '$1$2[hidden]$2')
    // Emails: keep the first letter and the domain
    .replace(/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
    // Phone numbers (Algerian 0X/+213 and other long digit runs): keep last 2 digits
    .replace(/(?<![\w.])(?:\+?213[\s.-]?|0)[5-7](?:[\s.-]?\d){8}(?![\w.])/g, (m) => `***${m.replace(/\D/g, '').slice(-2)}`)
}

function write(level, args) {
  if (!logPath) return
  try {
    appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${sanitize(format(...args))}\n`)
  } catch {
    /* a full or locked disk must never crash the till */
  }
}

export function startLogFile() {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    logPath = path.join(dir, 'blossom.log')
    try {
      if (statSync(logPath).size > MAX_BYTES) {
        const old = path.join(dir, 'blossom.old.log')
        rmSync(old, { force: true })
        renameSync(logPath, old)
      }
    } catch {
      /* no log yet */
    }
  } catch {
    logPath = null
    return
  }

  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console)
    console[level] = (...args) => {
      original(...args)
      write(level.toUpperCase(), args)
    }
  }

  process.on('uncaughtException', (error) => write('FATAL', [error?.stack || error]))
  process.on('unhandledRejection', (reason) => write('ERROR', ['Unhandled rejection:', reason?.stack || reason]))
  write('INFO', [`Blossom ${app.getVersion()} started (Electron ${process.versions.electron}, ${process.platform})`])

  // Soak record: memory every 30 minutes. After a day or two on a real till,
  // a steady climb here means a leak; a flat line means memory is collected.
  const logMemory = () => {
    try {
      const metrics = app.getAppMetrics()
      const totalMb = Math.round(metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize || 0), 0) / 1024)
      const byType = metrics
        .map((m) => `${m.type}:${Math.round((m.memory?.workingSetSize || 0) / 1024)}MB`)
        .join(' ')
      write('MEMORY', [`total ${totalMb}MB | ${byType} | uptime ${Math.round(process.uptime() / 60)}min`])
    } catch {
      /* metrics unavailable */
    }
  }
  setTimeout(logMemory, 60_000).unref?.()
  setInterval(logMemory, 30 * 60 * 1000).unref?.()
}

// Errors and warnings from the page (renderer). Electron 44 passes one event
// object with level/message/lineNumber/sourceId; the listener takes only that
// argument, since declaring the old positional ones logs a deprecation warning.
export function logRendererMessages(webContents) {
  webContents.on('console-message', (event) => {
    const isError = event.level === 'error'
    const isWarning = event.level === 'warning'
    if (!isError && !isWarning) return
    const source = event.sourceId ? ` (${path.basename(String(event.sourceId))}:${event.lineNumber})` : ''
    write(isError ? 'PAGE-ERROR' : 'PAGE-WARN', [`${event.message}${source}`])
  })
}
