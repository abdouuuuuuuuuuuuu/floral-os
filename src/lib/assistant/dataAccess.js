import { normalize } from './intentEngine.js'
import { formatAssistantDate } from './preferences.js'
import { addCalendarDays, BUSINESS_TIME_ZONE, localDate } from '../businessDate.js'
export { addCalendarDays, BUSINESS_TIME_ZONE, localDate }
export const ACTIVE_STATUSES = ['new', 'processing']

export function businessDayStartIso(day) {
  const [year, month, date] = day.split('-').map(Number)
  const targetUtc = Date.UTC(year, month - 1, date)
  let guess = targetUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(guess))
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
    const representedUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
    guess += targetUtc - representedUtc
  }
  return new Date(guess).toISOString()
}

export function localDayBounds(offset = 0) {
  const startDate = addCalendarDays(localDate(), offset)
  const endDate = addCalendarDays(startDate, 1)
  return { start: businessDayStartIso(startDate), end: businessDayStartIso(endDate) }
}

export function dateKey(date) {
  return localDate(date)
}

export function money(value) {
  return `${Number(value || 0).toLocaleString('fr-FR')} DA`
}

export function applyNameTokens(query, column, value) {
  const tokens = normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean)
  return tokens.reduce((current, token) => current.ilike(column, `%${token}%`), query)
}

export function prettyTime(value) {
  return value && value !== '00:00:00' ? value.slice(0, 5) : 'Any time'
}

export function dateLabel(date, dateFormat = 'regional') {
  return formatAssistantDate(date, dateFormat, { weekday: true })
}

export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}
