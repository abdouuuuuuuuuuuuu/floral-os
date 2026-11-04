import { useState, useEffect, useRef, useId } from 'react'
import { Search, User, UserPlus, X, Loader2, QrCode } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePageActive } from '../context/PageActiveContext'
import { parseCardCode } from '../lib/scanDecode'

export function CustomerSearch({ selectedCustomer, onSelect, onClear, placeholder = "Search customer...", query: controlledQuery, onQueryChange, showCardScanner = true }) {
  const id = useId()
  const listId = `${id}-customer-options`
  const [internalQuery, setInternalQuery] = useState('')
  const query = controlledQuery ?? internalQuery
  const setQuery = (value) => onQueryChange ? onQueryChange(value) : setInternalQuery(value)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isOpen, setIsOpen] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cardCode, setCardCode] = useState('')
  const [cardMessage, setCardMessage] = useState('')
  const [cardLoading, setCardLoading] = useState(false)
  const [pendingCard, setPendingCard] = useState(null)
  const [confirmCard, setConfirmCard] = useState(null)
  const pageActive = usePageActive()
  const handleCardScanRef = useRef(null)
  const inputRef = useRef(null)
  const selectedCardRef = useRef(null)
  const focusSelectedRef = useRef(false)
  const requestRef = useRef(0)

  useEffect(() => {
    if (selectedCustomer && focusSelectedRef.current) {
      selectedCardRef.current?.focus()
      focusSelectedRef.current = false
    }
  }, [selectedCustomer])

  useEffect(() => {
    const q = query.trim()
    if (!q || selectedCustomer) {
      setResults([])
      setLoading(false)
      setSearchError('')
      return
    }
    const requestId = ++requestRef.current
    let cancelled = false
    setLoading(true)
    setResults([])
    setSearchError('')
    setActiveIndex(-1)

    const timer = setTimeout(async () => {
      const safe = q.replace(/[,()%]/g, ' ').trim()
      const digits = q.replace(/\D/g, '')
      try {
        const [searchResult, exactPhoneResult] = await Promise.all([
          supabase.from('customers')
            .select('customer_id, full_name, phone, email')
            .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
            .limit(6),
          digits.length >= 9
            ? supabase.rpc('blossom_resolve_customer', { p_phone: q, p_create_if_missing: false })
            : Promise.resolve({ data: null }),
        ])
        if (searchResult.error) throw searchResult.error
        if (cancelled || requestRef.current !== requestId) return
        const exactData = exactPhoneResult?.data
        const exact = exactData ? (Array.isArray(exactData) ? exactData : [exactData]) : []
        setResults([...new Map([...exact, ...(searchResult.data || [])].map((customer) => [customer.customer_id, customer])).values()])
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          setResults([])
          setSearchError(err?.message || 'Could not search customers. Check your connection and try again.')
        }
      } finally {
        if (!cancelled && requestRef.current === requestId) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, selectedCustomer, searchAttempt])

  useEffect(() => {
    if (!showCardScanner || !pageActive) return undefined
    const onScan = (event) => {
      event.preventDefault()
      handleCardScanRef.current?.(null, event.detail.code)
    }
    window.addEventListener('blossom:card-scanned', onScan)
    return () => window.removeEventListener('blossom:card-scanned', onScan)
  }, [showCardScanner, pageActive])

  // Every link goes through the same recorded server step.
  const linkCard = async (code, customer) => {
    const { error: assignError } = await supabase.rpc('blossom_assign_loyalty_card', {
      p_code: code, p_customer_id: customer.customer_id,
    })
    if (assignError) throw assignError
    window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', { detail: { code, customer } }))
    setCardMessage(`Card ${code} linked to ${customer.full_name}.`)
  }

  const confirmLink = async () => {
    if (!confirmCard || !selectedCustomer || cardLoading) return
    setCardLoading(true)
    try {
      await linkCard(confirmCard, selectedCustomer)
    } catch (err) {
      console.error('Could not link card:', err)
      setCardMessage('Could not link this card. It may already be linked, or this customer already has one.')
    } finally {
      setConfirmCard(null)
      setCardLoading(false)
    }
  }

  const handleSelect = async (customer) => {
    if (pendingCard) {
      try {
        await linkCard(pendingCard.code, customer)
      } catch (err) {
        console.error('Could not link card:', err)
        setCardMessage('Could not link this card. It may already be linked, or this customer already has one.')
        setPendingCard(null)
        return
      }
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', {
        detail: { code: pendingCard.code, customer },
      }))
      setCardMessage(`Card ${pendingCard.code} linked to ${customer.full_name}.`)
      setPendingCard(null)
    }
    focusSelectedRef.current = true
    onSelect(customer)
    setQuery('')
    setResults([])
    setIsOpen(false)
    setActiveIndex(-1)
    setShowAdd(false)
    setError('')
    setSearchError('')
  }

  const handleCardScan = async (event, scannedCode) => {
    event?.preventDefault?.()
    const code = parseCardCode(scannedCode ?? cardCode)
    setCardMessage('')
    setConfirmCard(null)
    if (!code) {
      setCardMessage('That is not a Blossom card ID. Scan the card again.')
      return
    }
    setCardLoading(true)
    try {
      const { data: card, error: cardError } = await supabase.from('customer_loyalty_cards')
        .select('code, customer_id, customers(customer_id, full_name, phone)')
        .eq('code', code).maybeSingle()
      if (cardError) throw cardError
      if (!card) { setCardMessage(`Card ${code} was not found.`); return }
      setCardCode('')
      if (card.customer_id && card.customers) {
        setPendingCard(null)
        setCardMessage(`Card recognized · ${card.customers.full_name}`)
        onSelect(card.customers)
      } else if (selectedCustomer) {
        setConfirmCard(code)
      } else {
        setPendingCard(card)
        setCardMessage(`Card ${code} is blank. Select the customer to link it.`)
      }
    } catch (err) {
      console.error('Card lookup failed:', err)
      setCardMessage('Could not look up this card. Check the connection and try again.')
    } finally { setCardLoading(false) }
  }

  handleCardScanRef.current = handleCardScan

  const cardScanner = <div className="mb-2">
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1"><QrCode className="absolute left-3 top-1/2 -translate-y-1/2 text-fuchsia-600" size={16} /><input aria-label="Scan loyalty card QR code" value={cardCode} onChange={(event) => setCardCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleCardScan(event) }} placeholder="Scan card QR or enter card code" autoComplete="off" className="w-full rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100" /></div>
      <button type="button" onClick={handleCardScan} disabled={cardLoading || !cardCode.trim()} className="rounded-xl border border-fuchsia-200 bg-white px-3 text-xs font-semibold text-fuchsia-800 disabled:opacity-50">{cardLoading ? <Loader2 size={16} className="animate-spin" /> : 'Scan'}</button>
    </div>
    {cardMessage && <p role="status" className="mt-1.5 text-xs text-fuchsia-800">{cardMessage}</p>}
    {confirmCard && selectedCustomer && <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-fuchsia-50 p-2.5 text-xs text-fuchsia-900"><span>Link card <b>{confirmCard}</b> to <b>{selectedCustomer.full_name}</b>?</span><span className="flex shrink-0 gap-2"><button type="button" onClick={confirmLink} disabled={cardLoading} className="rounded-lg bg-fuchsia-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Link card</button><button type="button" onClick={() => setConfirmCard(null)} className="px-1 font-semibold text-gray-600">Cancel</button></span></div>}
  </div>

  const clearSelectedCustomer = () => {
    onClear?.()
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleQueryChange = (value) => {
    setQuery(value)
    setIsOpen(true)
    setShowAdd(false)
    setActiveIndex(-1)
    setError('')
  }

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }
    if (event.key === 'ArrowDown' && query.trim() && results.length > 0) {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setActiveIndex(0)
      } else {
        setActiveIndex((index) => (index + 1) % results.length)
      }
    }
    if (event.key === 'ArrowUp' && isOpen && results.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1))
    }
    if (event.key === 'Enter' && query.trim()) {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else if (activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex])
      } else if (!loading && results.length === 1) {
        handleSelect(results[0])
      }
    }
  }

  const handleAddNew = async () => {
    const name = query.trim()
    if (!name || !newPhone.trim()) {
      setError('A phone number is required so Blossom can find or create one profile for this customer.')
      return
    }
    setSaving(true)
    try {
      const { data, error: insertError } = await supabase.rpc('blossom_resolve_customer', {
        p_full_name: name,
        p_phone: newPhone.trim(),
      })
      if (!insertError && data) {
        handleSelect(data)
        setNewPhone('')
      } else {
        setError(insertError?.message || 'Could not save this customer. Please try again.')
      }
    } catch (err) {
      setError(err?.message || 'Could not save this customer. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (selectedCustomer) {
    return (
      <div><div ref={selectedCardRef} role="group" tabIndex={-1} aria-label={`Selected customer: ${selectedCustomer.full_name}`} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
            <User size={17} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{selectedCustomer.full_name}</p>
            {selectedCustomer.phone && <p className="truncate text-xs text-slate-600">{selectedCustomer.phone}</p>}
          </div>
        </div>
        <button type="button" onClick={clearSelectedCustomer} aria-label="Remove selected customer" className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <X size={16} aria-hidden="true" />
        </button>
      </div>{showCardScanner && cardScanner}</div>
    )
  }

  return (
    <div><div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        role="combobox"
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={Boolean(isOpen && query.trim())}
        aria-busy={loading}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
      {query && (
        <button type="button" onClick={() => { handleQueryChange(''); setResults([]); inputRef.current?.focus() }} aria-label="Clear customer search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 rounded p-1">
          <X size={14} aria-hidden="true" />
        </button>
      )}

      {query.trim() && isOpen && (
        <div id={listId} className="absolute left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl popover-enter">
          {loading ? (
            <div className="p-3 flex items-center gap-2 text-sm text-gray-500" role="status">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Searching customers…
            </div>
          ) : searchError ? (
            <div className="p-3 space-y-2" role="alert">
              <p className="text-sm text-rose-700">{searchError}</p>
              <button type="button" onClick={() => setSearchAttempt((attempt) => attempt + 1)} className="text-sm font-semibold text-primary hover:underline rounded">
                Try search again
              </button>
            </div>
          ) : (
            <>
              {results.length > 0 ? (
                <div role="listbox" aria-label="Customer search results">
                  {results.map((c, index) => (
                  <div
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={activeIndex === index}
                    key={c.customer_id}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(c)}
                    className={`w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-slate-100 cursor-pointer ${activeIndex === index ? 'bg-primary/5' : 'hover:bg-slate-50'}`}
                  >
                    <User size={14} className="text-gray-400 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.full_name}</p>
                      {c.phone && <p className="text-xs text-gray-500 truncate">{c.phone}</p>}
                    </div>
                  </div>
                  ))}
                </div>
              ) : (
                <p className="px-3 pt-3 text-sm text-gray-500" role="status">No matching customer found.</p>
              )}

              {!showAdd ? (
                <button type="button" onClick={() => { setError(''); setShowAdd(true) }} className="w-full flex items-center gap-2 p-3 hover:bg-cream transition-colors text-left text-primary">
                  <UserPlus size={14} aria-hidden="true" />
                  <span className="text-sm font-medium">{results.length ? `Not the right customer? Add “${query.trim()}”` : `Add “${query.trim()}” as a customer`}</span>
                </button>
              ) : (
                <div className="p-3 space-y-2 bg-cream/50">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => { setNewPhone(e.target.value); setError('') }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleAddNew()
                      }
                    }}
                    aria-label="New customer phone number"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-add-error` : undefined}
                    autoComplete="tel"
                    required
                    placeholder="Phone number (required)"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                  />
                  <button type="button" onClick={handleAddNew} disabled={saving} aria-busy={saving} className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-wait">
                    {saving ? <><Loader2 size={15} className="inline mr-2 animate-spin" aria-hidden="true" />Finding or saving…</> : `Find or save “${query.trim()}”`}
                  </button>
                </div>
              )}
              {error && <p id={`${id}-add-error`} role="alert" className="px-3 pb-3 text-sm text-rose-700">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>{showCardScanner && cardScanner}</div>
  )
}
