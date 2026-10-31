const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const COMMUNE_DATA_URL = 'https://raw.githubusercontent.com/riadh2002/algeria-69-wilayas-1541-communes/main/data/communes.json'
const WILAYA_DATA_URL = 'https://raw.githubusercontent.com/riadh2002/algeria-69-wilayas-1541-communes/main/data/wilayas.json'
let lastPlaceSearchAt = 0
let communeDirectoryPromise = null

function isCompleteCommuneDirectory(directory) {
  if (!Array.isArray(directory?.communes) || !Array.isArray(directory?.wilayas)
    || directory.communes.length !== 1541 || directory.wilayas.length !== 69) return false
  const wilayaCodes = new Set(directory.wilayas.map((wilaya) => Number(wilaya.code)))
  return Array.from({ length: 69 }, (_, index) => index + 1).every((code) => wilayaCodes.has(code))
    && directory.communes.every((commune) => wilayaCodes.has(Number(commune.wilaya_code)))
}

function normalizePlaceText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

async function queryOpenStreetMap(query, limit = 6) {
  const requestAt = Math.max(Date.now(), lastPlaceSearchAt + 1100)
  lastPlaceSearchAt = requestAt
  const delay = requestAt - Date.now()
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

  const url = new URL(NOMINATIM_URL)
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'dz',
    limit: String(limit),
  }).toString()
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('OpenStreetMap place search is temporarily unavailable.')
  const rows = await response.json()
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const address = row.address || {}
    const town = address.city || address.town || address.village || address.municipality || address.county || row.name || ''
    const wilaya = address.state || address.province || address.region || ''
    return {
      label: town || row.display_name,
      wilaya,
      displayName: row.display_name,
      latitude: Number(row.lat),
      longitude: Number(row.lon),
      source: 'OpenStreetMap place search',
    }
  }).filter((place) => place.label && Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
}

async function loadCommuneDirectory() {
  if (communeDirectoryPromise) return communeDirectoryPromise
  communeDirectoryPromise = (async () => {
    const cacheKey = 'blossom:algeria-communes:2026'
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
      if (cached?.savedAt && Date.now() - cached.savedAt < 30 * 24 * 60 * 60 * 1000
        && isCompleteCommuneDirectory(cached)) return cached
    } catch { /* Ignore unavailable or malformed browser cache. */ }

    try {
      const [communesResponse, wilayasResponse] = await Promise.all([
        fetch(COMMUNE_DATA_URL, { headers: { Accept: 'application/json' } }),
        fetch(WILAYA_DATA_URL, { headers: { Accept: 'application/json' } }),
      ])
      if (!communesResponse.ok || !wilayasResponse.ok) return null
      const [communes, wilayas] = await Promise.all([communesResponse.json(), wilayasResponse.json()])
      if (!isCompleteCommuneDirectory({ communes, wilayas })) return null
      const result = { savedAt: Date.now(), communes, wilayas }
      try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* Storage is a performance optimization. */ }
      return result
    } catch {
      return null
    }
  })()
  return communeDirectoryPromise
}

async function searchCommuneDirectory(query) {
  const directory = await loadCommuneDirectory()
  if (!directory) {
    communeDirectoryPromise = null
    return []
  }
  const normalizedQuery = normalizePlaceText(query)
  const tokens = normalizedQuery.split(' ').filter(Boolean)
  if (!tokens.length) return []
  const wilayas = new Map(directory.wilayas.map((wilaya) => [Number(wilaya.code), wilaya]))
  const matches = directory.communes.map((commune) => {
    const wilaya = wilayas.get(Number(commune.wilaya_code))
    const fields = [commune.name, commune.name_ar, commune.daira, wilaya?.name, wilaya?.name_ar]
    const normalized = normalizePlaceText(fields.join(' '))
    const communeName = normalizePlaceText(commune.name)
    const isMatch = tokens.every((token) => normalized.includes(token))
      || normalizePlaceText(commune.name_ar).includes(normalizedQuery)
    const exact = communeName === normalizePlaceText(query) ? 0 : 1
    return { commune, wilaya, isMatch, exact }
  }).filter((entry) => entry.isMatch)
    .sort((a, b) => a.exact - b.exact || String(a.commune.name).localeCompare(String(b.commune.name)))
    .slice(0, 8)

  return matches.map(({ commune, wilaya }) => ({
    label: commune.name,
    wilaya: wilaya?.name || `Wilaya ${commune.wilaya_code}`,
    displayName: [commune.name, commune.daira, wilaya?.name].filter(Boolean).join(', '),
    source: '2026 commune gazetteer',
  }))
}

export async function searchAlgerianPlaces(query, { allowAddress = false } = {}) {
  const cleanQuery = String(query || '').trim()
  if (cleanQuery.length < 2) throw new Error('Enter a town or wilaya name first.')
  const digitsOnly = cleanQuery.replace(/\D/g, '')
  if (!allowAddress && (digitsOnly.length >= 9 || /\b(street|rue|avenue|boulevard|residence|apartment|building|bâtiment|batiment|شارع|رقم)\b/i.test(cleanQuery))) {
    throw new Error('Search by town or wilaya only. Keep customer street and contact details out of place search.')
  }

  const cacheKey = `blossom:place:${allowAddress ? 'public-address' : 'town'}:${cleanQuery.toLocaleLowerCase()}`
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (cached?.savedAt && Date.now() - cached.savedAt < 30 * 24 * 60 * 60 * 1000) return cached.results
  } catch { /* Ignore unavailable or malformed browser cache. */ }

  // Query only the Algerian town/wilaya entered in this field. Never append
  // the customer's street address or notes to a third-party map request.
  let mapResults = []
  try {
    mapResults = await queryOpenStreetMap(`${cleanQuery}, Algeria`)
  } catch { /* Use the cached/local commune gazetteer when online search is down. */ }

  const communeResults = await searchCommuneDirectory(cleanQuery)
  const seen = new Set()
  const results = [...mapResults, ...communeResults].filter((place) => {
    const key = `${normalizePlaceText(place.label)}:${normalizePlaceText(place.wilaya)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 10)

  if (results.length) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), results })) } catch { /* Cache is optional. */ }
  }
  return results
}

export async function resolveAlgerianPlace(place) {
  if (!place?.label) throw new Error('Select a named town before resolving its map location.')
  const cacheKey = `blossom:map-town-candidates:${normalizePlaceText(`${place.label}, ${place.wilaya || ''}`)}`
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (cached?.savedAt && Date.now() - cached.savedAt < 30 * 24 * 60 * 60 * 1000
      && Array.isArray(cached.candidates)) return cached.candidates
  } catch { /* Ignore unavailable or malformed browser cache. */ }

  const results = await queryOpenStreetMap(`${place.label}${place.wilaya ? `, ${place.wilaya}` : ''}, Algeria`, 3)
  if (!results.length) throw new Error('This commune is listed, but OpenStreetMap could not resolve a route location. Leave it pending and try again later.')
  const candidates = results.map((result) => ({
    ...result,
    label: place.label,
    wilaya: place.wilaya || result.wilaya,
    mapLabel: result.label,
    source: 'OpenStreetMap map match',
  }))
  try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), candidates })) } catch { /* Cache is optional. */ }
  return candidates
}

