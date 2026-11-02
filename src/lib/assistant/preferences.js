const STORAGE_PREFIX = 'blossom.assistantPreferences.v1'

export const DEFAULT_ASSISTANT_PREFERENCES = Object.freeze({
  answerStyle: 'balanced',
  dateFormat: 'regional',
})

function preferenceKey(userId) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(String(userId || 'guest'))}`
}

function normalizePreferences(value = {}) {
  return {
    answerStyle: ['concise', 'balanced'].includes(value.answerStyle) ? value.answerStyle : DEFAULT_ASSISTANT_PREFERENCES.answerStyle,
    dateFormat: ['regional', 'us', 'iso'].includes(value.dateFormat) ? value.dateFormat : DEFAULT_ASSISTANT_PREFERENCES.dateFormat,
  }
}

export function loadAssistantPreferences(userId) {
  try {
    const saved = window.localStorage.getItem(preferenceKey(userId))
    return normalizePreferences(saved ? JSON.parse(saved) : DEFAULT_ASSISTANT_PREFERENCES)
  } catch {
    return { ...DEFAULT_ASSISTANT_PREFERENCES }
  }
}

export function saveAssistantPreferences(userId, preferences) {
  const normalized = normalizePreferences(preferences)
  try {
    window.localStorage.setItem(preferenceKey(userId), JSON.stringify(normalized))
  } catch { /* Preferences are optional; storage failures must not interrupt chat. */ }
  return normalized
}

export function resetAssistantPreferences(userId) {
  try { window.localStorage.removeItem(preferenceKey(userId)) } catch { /* Ignore unavailable storage. */ }
  return { ...DEFAULT_ASSISTANT_PREFERENCES }
}

export function formatAssistantDate(value, dateFormat = 'regional', { weekday = false } = {}) {
  if (!value) return value
  const text = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00Z`) : new Date(text)
  if (Number.isNaN(date.getTime())) return value
  if (dateFormat === 'iso') return text.slice(0, 10)
  const locale = dateFormat === 'us' ? 'en-US' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', ...(weekday ? { weekday: 'short' } : {}),
  }).format(date)
}

export function formatAssistantDateTime(value, dateFormat = 'regional') {
  if (!value) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  if (dateFormat === 'iso') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
  }
  return new Intl.DateTimeFormat(dateFormat === 'us' ? 'en-US' : 'en-GB', {
    timeZone: 'Africa/Algiers', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}
