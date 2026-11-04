import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { usePageActive } from '../context/PageActiveContext'
import { supabase } from '../lib/supabase'
import { parseCardCode } from '../lib/scanDecode'

// Shows a customer's card, and links a first card or replaces a lost one.
export default function CustomerCardLink({ customer, code }) {
  const { role } = useAuth()
  const { addNotification } = useNotification()
  const pageActive = usePageActive()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef(null)

  const canChange = code ? role === 'owner' : true

  const close = () => { setOpen(false); setValue(''); setMessage('') }

  const unlink = async () => {
    if (!window.confirm(`Unlink card ${code} from ${customer.full_name}? The card becomes blank and can be linked to someone else. Petals stay on the customer.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('blossom_unlink_loyalty_card', { p_code: code })
    setBusy(false)
    if (error) {
      console.error('Could not unlink card:', error)
      addNotification('Could not unlink this card. Check the connection and try again.', 'error')
      return
    }
    window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', { detail: { code: null, customer } }))
    addNotification(`Card ${code} unlinked`, 'success')
  }

  const save = useCallback(async (rawCode) => {
    const newCode = parseCardCode(rawCode)
    if (!newCode) { setMessage('That is not a Blossom card ID. Scan the card again.'); return }
    if (newCode === code) { setMessage('This customer already has that card.'); return }
    setBusy(true)
    setMessage('')
    try {
      // Check the new card first, so a bad scan never leaves the customer without a card.
      const { data: card, error: lookupError } = await supabase.from('customer_loyalty_cards')
        .select('code, customer_id').eq('code', newCode).maybeSingle()
      if (lookupError) throw lookupError
      if (!card) { setMessage(`Card ${newCode} was not found.`); return }
      if (card.customer_id) { setMessage(`Card ${newCode} already belongs to another customer.`); return }

      if (code) {
        const { error } = await supabase.rpc('blossom_unlink_loyalty_card', { p_code: code })
        if (error) throw error
      }
      const { error } = await supabase.rpc('blossom_assign_loyalty_card', {
        p_code: newCode, p_customer_id: customer.customer_id,
      })
      if (error) throw error
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', { detail: { code: newCode, customer } }))
      addNotification(`Card ${newCode} linked to ${customer.full_name}`, 'success')
      setOpen(false)
      setValue('')
    } catch (error) {
      console.error('Could not link card:', error)
      setMessage('Could not link this card. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }, [code, customer, addNotification])

  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    if (!pageActive) return undefined
    const onScan = (event) => {
      event.preventDefault()
      setValue(event.detail.code)
      void save(event.detail.code)
    }
    window.addEventListener('blossom:card-scanned', onScan)
    return () => window.removeEventListener('blossom:card-scanned', onScan)
  }, [open, pageActive, save])

  return (
    <div className="mt-1.5 text-xs text-fuchsia-900">
      <div className="flex flex-wrap items-center gap-2">
        <span>Card: <span className="font-mono font-bold">{code || 'None'}</span></span>
        {canChange && !open && (
          <button type="button" onClick={() => setOpen(true)} className="font-semibold underline underline-offset-2">
            {code ? 'Replace card' : 'Link a card'}
          </button>
        )}
        {code && role === 'owner' && !open && (
          <button type="button" disabled={busy} onClick={unlink} className="font-semibold text-rose-700 underline underline-offset-2 disabled:opacity-50">Unlink</button>
        )}
      </div>
      {open && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(event) => { event.preventDefault(); void save(value) }}
        >
          <input
            ref={inputRef}
            aria-label="New card ID"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Scan the new card"
            autoComplete="off"
            className="w-52 rounded-lg border border-fuchsia-200 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-fuchsia-200"
          />
          <button type="submit" disabled={busy || !value.trim()} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />} {code ? 'Replace' : 'Link'}
          </button>
          <button type="button" onClick={close} disabled={busy} className="font-semibold text-gray-600 underline underline-offset-2">Cancel</button>
          {code && <p className="w-full text-gray-600">The old card {code} stops working. Petals stay with the customer.</p>}
          {message && <p role="alert" className="w-full text-rose-700">{message}</p>}
        </form>
      )}
    </div>
  )
}
