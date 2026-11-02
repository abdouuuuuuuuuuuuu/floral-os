import { useRef, useState } from 'react'
import { Loader2, MapPin, Search, Check } from 'lucide-react'
import { resolveAlgerianPlace, searchAlgerianPlaces } from '../lib/mapServices'

export default function AlgerianPlaceSearch({ label, query, onQueryChange, selectedPlace, onSelect, hint, allowAddressSearch = false, compact = false, inputId, ariaInvalid = false }) {
  const [results, setResults] = useState([])
  const [mapCandidates, setMapCandidates] = useState([])
  const [pendingGazetteerPlace, setPendingGazetteerPlace] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resolvingIndex, setResolvingIndex] = useState(null)
  const [error, setError] = useState('')
  const searchRequestRef = useRef(0)
  const resolveRequestRef = useRef(0)

  const search = async () => {
    const requestId = ++searchRequestRef.current
    setLoading(true)
    setError('')
    try {
      const places = await searchAlgerianPlaces(query, { allowAddress: allowAddressSearch })
      if (requestId !== searchRequestRef.current) return
      setResults(places)
      if (!places.length) setError('No Algerian town found. Try adding its wilaya to the search.')
    } catch (searchError) {
      if (requestId !== searchRequestRef.current) return
      setError(searchError.message || 'Could not search places right now.')
    } finally {
      if (requestId === searchRequestRef.current) setLoading(false)
    }
  }

  const choosePlace = async (place, index) => {
    const requestId = ++resolveRequestRef.current
    setError('')
    if (place.source !== '2026 commune gazetteer') {
      searchRequestRef.current += 1
      onSelect(place)
      setResults([])
      setMapCandidates([])
      setPendingGazetteerPlace(null)
      return
    }
    setResolvingIndex(index)
    try {
      const candidates = await resolveAlgerianPlace(place)
      if (requestId !== resolveRequestRef.current) return
      setPendingGazetteerPlace(place)
      setMapCandidates(candidates)
      setResults([])
    } catch (resolveError) {
      if (requestId !== resolveRequestRef.current) return
      setError(resolveError.message || 'Could not resolve this town on the map.')
    } finally {
      if (requestId === resolveRequestRef.current) setResolvingIndex(null)
    }
  }

  const confirmMapCandidate = (candidate) => {
    if (!pendingGazetteerPlace) return
    onSelect({
      ...candidate,
      label: pendingGazetteerPlace.label,
      wilaya: pendingGazetteerPlace.wilaya || candidate.wilaya,
    })
    setMapCandidates([])
    setPendingGazetteerPlace(null)
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-semibold text-slate-800">{label}</label>
        {!compact && <p className="mt-1 text-xs leading-relaxed text-slate-500">Search a town or commune, choose the right result, then confirm its map point. Route calculation starts after confirmation.</p>}
      </div>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => { searchRequestRef.current += 1; resolveRequestRef.current += 1; setLoading(false); setResolvingIndex(null); onQueryChange(event.target.value); setResults([]); setMapCandidates([]); setPendingGazetteerPlace(null); setError('') }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search() } }}
          placeholder="Town or commune, e.g. Tlemcen"
          aria-label={label}
          aria-invalid={ariaInvalid}
          className={`min-h-11 min-w-0 flex-1 rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 ${ariaInvalid ? 'border-rose-400' : 'border-slate-200'}`}
        />
        <button type="button" onClick={search} disabled={loading || query.trim().length < 2} aria-label="Search Algerian towns" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {loading ? 'Searching' : 'Search'}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
      {selectedPlace && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check size={12} /></span>
        <span><strong className="block">{compact ? 'Destination selected' : 'Destination confirmed'}</strong><span>{selectedPlace.label}{selectedPlace.wilaya ? ` · ${selectedPlace.wilaya}` : ''}</span>{!compact && <span className="block text-emerald-700">Map point selected for the route estimate.</span>}</span>
      </div>}
      {results.length > 0 && <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5" role="listbox" aria-label="Matching Algerian towns">
        {results.map((place, index) => <button type="button" key={`${place.label}-${place.wilaya}-${index}`} onClick={() => choosePlace(place, index)} disabled={resolvingIndex != null} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-primary/5 focus:bg-primary/5 focus:outline-none disabled:cursor-wait disabled:opacity-60">
          <MapPin size={14} className="mt-0.5 shrink-0 text-primary" />
          <span className="min-w-0"><span className="block text-sm font-semibold text-gray-800">{resolvingIndex === index ? 'Resolving map location…' : `${place.label}${place.wilaya ? ` · ${place.wilaya}` : ''}`}</span><span className="block truncate text-xs text-gray-500">{place.displayName}</span><span className="mt-0.5 block text-[10px] text-gray-400">{place.source || 'Place result'}</span></span>
        </button>)}
      </div>}
      {mapCandidates.length > 0 && pendingGazetteerPlace && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
        <p className="text-xs font-semibold text-amber-950">Confirm the map location for {pendingGazetteerPlace.label}{pendingGazetteerPlace.wilaya ? ` · ${pendingGazetteerPlace.wilaya}` : ''}</p>
        <p className="mt-1 text-[11px] text-amber-900">Review the map match before using it to estimate the road route.</p>
        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-white p-1.5" role="listbox" aria-label="Map matches for selected commune">
          {mapCandidates.map((candidate, index) => <div key={`${candidate.displayName}-${index}`} className="rounded-lg px-2.5 py-2 hover:bg-primary/5">
            <button type="button" onClick={() => confirmMapCandidate(candidate)} className="flex w-full items-start gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <MapPin size={14} className="mt-0.5 shrink-0 text-primary" />
              <span className="min-w-0"><span className="block text-sm font-semibold text-gray-800">{candidate.mapLabel || candidate.label}{candidate.wilaya ? ` · ${candidate.wilaya}` : ''}</span><span className="block truncate text-xs text-gray-500">{candidate.displayName}</span><span className="mt-0.5 block text-[10px] text-gray-400">{candidate.latitude.toFixed(5)}, {candidate.longitude.toFixed(5)}</span></span>
            </button>
            <a href={`https://www.openstreetmap.org/?mlat=${candidate.latitude}&mlon=${candidate.longitude}#map=12/${candidate.latitude}/${candidate.longitude}`} target="_blank" rel="noreferrer" className="ml-6 mt-1 inline-block text-[11px] font-medium text-primary underline underline-offset-2">Check this point on OpenStreetMap</a>
          </div>)}
        </div>
        <button type="button" onClick={() => { resolveRequestRef.current += 1; setMapCandidates([]); setPendingGazetteerPlace(null); setResolvingIndex(null) }} className="mt-2 text-xs font-medium text-amber-900 underline underline-offset-2">Choose a different result</button>
      </div>}
      {error && <p className="mt-2 text-xs text-amber-700" role="status">{error}</p>}
      <p className="text-[11px] text-slate-400">Place data: <a href="https://github.com/riadh2002/algeria-69-wilayas-1541-communes" target="_blank" rel="noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">Algerian commune list</a> · OpenStreetMap</p>
    </div>
  )
}
