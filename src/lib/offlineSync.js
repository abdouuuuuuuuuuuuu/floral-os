// Replays queued offline sales when the connection returns.
//
// Runs on the browser 'online' event, when the window regains focus, and on a
// slow interval as a backstop. Replays oldest-first, one at a time. A network
// failure stops the run and leaves the sale queued; a genuine server rejection
// (e.g. a product was deleted meanwhile) drops the sale from auto-retry and
// reports it, so it can never loop forever.

import { supabase } from './supabase'
import { listQueuedSales, removeQueuedSale, isNetworkError } from './offlineQueue'
import { translateOrderError } from './orderErrors'

let running = false
let started = false

export async function flushOutbox() {
  if (running || !navigator.onLine) return
  running = true
  try {
    const queued = await listQueuedSales()
    for (const sale of queued) {
      try {
        const { data, error } = await supabase.rpc(sale.fn, sale.params)
        if (error) throw error
        await removeQueuedSale(sale.requestId)
        const order = data?.order || null
        window.dispatchEvent(new CustomEvent('blossom:sale-synced', {
          detail: { requestId: sale.requestId, orderNumber: order?.order_number || null, order, meta: sale.meta || {} },
        }))
      } catch (err) {
        if (isNetworkError(err)) break // still offline — keep the rest queued
        // A real rejection: drop it from the queue and surface it once.
        await removeQueuedSale(sale.requestId)
        window.dispatchEvent(new CustomEvent('blossom:sale-sync-failed', {
          detail: { requestId: sale.requestId, message: translateOrderError(err), meta: sale.meta || {} },
        }))
      }
    }
  } finally {
    running = false
  }
}

export function startOutboxSync() {
  if (started) return
  started = true
  const trigger = () => { flushOutbox().catch(() => {}) }
  window.addEventListener('online', trigger)
  window.addEventListener('focus', trigger)
  setInterval(trigger, 20000)
  trigger()
}
