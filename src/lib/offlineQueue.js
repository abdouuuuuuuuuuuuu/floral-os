// Offline outbox for sales.
//
// When the shop's connection blinks, a sale must not be lost. We queue the
// exact server call (with its idempotency request id) in the browser's
// IndexedDB and replay it when the connection returns. The SERVER still
// allocates the order number and decrements stock at replay time, so two
// tills selling offline can never grab the same number or oversell beyond
// what the database allows — nothing is invented on the device.
//
// Replay is safe because blossom_create_order is idempotent on the request
// id: if a queued call actually reached the server once, replaying it returns
// the same order instead of creating a second one.

const DB_NAME = 'blossom-offline'
const STORE = 'outbox'
const VERSION = 1

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    let request
    try {
      request = indexedDB.open(DB_NAME, VERSION)
    } catch (err) {
      reject(err)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'requestId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

async function tx(mode, run) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const store = transaction.objectStore(STORE)
    let result
    Promise.resolve(run(store)).then((value) => { result = value }).catch(reject)
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/** Add a sale to the outbox. `entry` holds the request id, RPC name, params and display meta. */
export async function enqueueSale(entry) {
  const record = { ...entry, status: 'pending', queuedAt: new Date().toISOString() }
  await tx('readwrite', (store) => store.put(record))
  notifyChange()
  return record
}

async function listAllSales() {
  const rows = await tx('readonly', (store) => new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  }))
  return rows.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)))
}

/** Every sale still waiting to be sent, oldest first. */
export async function listQueuedSales() {
  return (await listAllSales()).filter((sale) => sale.status !== 'failed')
}

/** Sales the server refused. The customer has already paid, so they wait here for a person. */
export async function listFailedSales() {
  return (await listAllSales()).filter((sale) => sale.status === 'failed')
}

export async function markSaleFailed(requestId, failure) {
  await tx('readwrite', (store) => {
    const req = store.get(requestId)
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, status: 'failed', failure, failedAt: new Date().toISOString() })
    }
  })
  notifyChange()
}

export async function removeQueuedSale(requestId) {
  await tx('readwrite', (store) => store.delete(requestId))
  notifyChange()
}

export async function countQueuedSales() {
  try {
    const rows = await listQueuedSales()
    return rows.length
  } catch {
    return 0
  }
}

// Tells apart a lost connection from a real server rejection. Only the former
// should be queued and retried; a validation error must surface to the user.
export function isNetworkError(error) {
  if (!navigator.onLine) return true
  if (!error) return false
  if (error.name === 'TypeError' || error.name === 'AbortError') return true
  const message = String(error.message || error).toLowerCase()
  return /failed to fetch|network ?request ?failed|networkerror|load failed|fetch failed|timeout|timed out|offline|err_internet|err_network|err_connection/.test(message)
}

function notifyChange() {
  try {
    countQueuedSales().then((pending) => {
      window.dispatchEvent(new CustomEvent('blossom:outbox-changed', { detail: { pending } }))
    })
  } catch { /* ignore */ }
}
