// Replays queued offline sales when the connection returns.
//
// Runs on the browser 'online' event, when the window regains focus, and on a
// slow interval as a backstop. Replays oldest-first, one at a time. A network
// failure stops the run and leaves the sale queued; a genuine server rejection
// (e.g. a product was deleted meanwhile) stops auto-retry and keeps the sale for
// a person to review, because the customer has already paid.

import { supabase } from './supabase'
import { listQueuedSales, markSaleFailed, removeQueuedSale, isNetworkError } from './offlineQueue'
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
        // A real rejection: stop retrying, keep the sale, and surface it once.
        await markSaleFailed(sale.requestId, translateOrderError(err))
        window.dispatchEvent(new CustomEvent('blossom:sale-sync-failed', {
          detail: { requestId: sale.requestId, message: translateOrderError(err), meta: sale.meta || {} },
        }))
      }
    }
  } finally {
    running = false
  }
}

/**
 * Sends a refused sale again. With withoutPetals the customer keeps their petals
 * and the reward they were given shows as an amount still owed on the order.
 * Throws if the server refuses it, and the sale stays in the review list.
 */
export async function retryFailedSale(sale, { withoutPetals = false } = {}) {
  const { p_order, p_items, p_request_id } = sale.params
  const { data, error } = withoutPetals
    ? await supabase.rpc('blossom_create_order', { p_order, p_items, p_request_id })
    : await supabase.rpc(sale.fn, sale.params)
  if (error) throw new Error(translateOrderError(error))
  await removeQueuedSale(sale.requestId)
  const order = data?.order || null
  window.dispatchEvent(new CustomEvent('blossom:sale-synced', {
    detail: { requestId: sale.requestId, orderNumber: order?.order_number || null, order, meta: sale.meta || {} },
  }))
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
