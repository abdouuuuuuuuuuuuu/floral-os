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

// A missing or expired login is not a refusal of the sale itself: keep it
// queued and try again once someone signs in, instead of sending it to review.
function isAuthError(error) {
  if (!error) return false
  if (error.status === 401 || error.code === 'PGRST301' || error.code === '28000') return true
  return /jwt|not authenticated|must be signed in|invalid claim|session/i.test(String(error.message || ''))
}

export async function flushOutbox() {
  if (running || !navigator.onLine) return
  running = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const currentUserId = sessionData?.session?.user?.id
    if (!currentUserId) return // nobody signed in — wait for a login

    // Only replay sales made by the person signed in now. The server's
    // idempotency key is per user, so sending someone else's held sale would
    // file it under the wrong person and could record it twice. Entries
    // queued before actorId existed have none and are replayed as before.
    const queued = (await listQueuedSales())
      .filter((sale) => !sale.actorId || sale.actorId === currentUserId)
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
        if (isAuthError(err)) break // login expired mid-run — retry after it refreshes
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
  // The staff member who made a held sale may sign back in on this till.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') trigger()
  })
  setInterval(trigger, 20000)
  trigger()
}
