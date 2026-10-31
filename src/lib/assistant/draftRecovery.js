const DRAFT_VERSION = 1
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000

function storageKey(userId, role) {
  return `blossom.assistant.draft.v${DRAFT_VERSION}:${encodeURIComponent(userId || 'anonymous')}:${encodeURIComponent(role || 'unknown')}`
}

/** Session-only recovery for the single active order task. Never stores chat history or credentials. */
export function saveAssistantDraft(userId, role, draft) {
  if (typeof window === 'undefined' || !userId || !draft) return
  try {
    const serialized = JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), draft })
    if (serialized.length <= 300_000) window.sessionStorage.setItem(storageKey(userId, role), serialized)
  } catch { /* Storage may be disabled or full; the in-memory workflow still works. */ }
}

export function loadAssistantDraft(userId, role) {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const key = storageKey(userId, role)
    const value = JSON.parse(window.sessionStorage.getItem(key) || 'null')
    if (value?.version !== DRAFT_VERSION || !value.draft || Date.now() - value.savedAt > DRAFT_MAX_AGE_MS) {
      window.sessionStorage.removeItem(key)
      return null
    }
    return value.draft
  } catch { return null }
}

export function clearAssistantDraft(userId, role) {
  if (typeof window === 'undefined' || !userId) return
  try { window.sessionStorage.removeItem(storageKey(userId, role)) } catch { /* Ignore storage failures. */ }
}
