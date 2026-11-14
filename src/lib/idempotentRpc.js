import { supabase } from './supabase'

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

// One request id per intended action, reused while it is retried. If the
// connection drops after the server saved, the retry carries the same id and
// the server returns the saved result instead of doing it again.
const pendingIds = new Map()

const isMissingFunction = (error) => error?.code === 'PGRST202'
  || /could not find the function/i.test(String(error?.message || ''))

/**
 * Calls an RPC with p_request_id for duplicate protection. Until the matching
 * migration is applied (20261110100000), the function with p_request_id does
 * not exist yet; then it falls back to the call without it, as before.
 */
export async function rpcOnce(fn, params) {
  const key = `${fn}|${JSON.stringify(params)}`
  let requestId = pendingIds.get(key)
  if (!requestId) {
    requestId = newRequestId()
    pendingIds.set(key, requestId)
  }

  let result = await supabase.rpc(fn, { ...params, p_request_id: requestId })
  if (result.error && isMissingFunction(result.error)) {
    result = await supabase.rpc(fn, params)
  }
  // Done (saved, or refused for a real reason): the next action gets a new id.
  // A network failure keeps the id so the retry is recognised.
  if (!result.error || !/fetch|network|timeout|offline/i.test(String(result.error.message || ''))) {
    pendingIds.delete(key)
  }
  return result
}
