// Client-side status options mirror the transition checks in the database.
// The RPC remains authoritative; this only avoids presenting invalid actions.
const ORDER_STATUS_TRANSITIONS = {
  new: ['processing', 'done', 'cancelled'],
  processing: ['new', 'done', 'cancelled'],
  ready: ['processing', 'done', 'cancelled'],
  done: ['cancelled'],
  cancelled: ['new', 'processing', 'done'],
}

export function orderStatusTargets(status, { canCancel = false } = {}) {
  const targets = ORDER_STATUS_TRANSITIONS[status] || []
  return targets.filter((target) => target !== 'cancelled' || canCancel)
}
