export const BUSINESS_TIME_ZONE = 'Africa/Algiers'

export function addCalendarDays(day, amount) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) || !Number.isInteger(amount)) return null
  const date = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null
  date.setUTCDate(date.getUTCDate() + amount)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}

export function formatBusinessDate(value, locale = 'fr-FR', options = {}) {
  const day = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const date = new Date(`${day}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return ''
  return date.toLocaleDateString(locale, { ...options, timeZone: BUSINESS_TIME_ZONE })
}

/** Exact moment something happened, in shop time: "31/10/2026 14:32". */
export function formatBusinessDateTime(value, locale = 'fr-FR', options = {}) {
  const date = value ? new Date(value) : null
  if (!date || !Number.isFinite(date.getTime())) return ''
  return date.toLocaleString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...options,
    timeZone: BUSINESS_TIME_ZONE,
  })
}
