import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, QrCode, ScanLine, UserRound, X, Sparkles, Wallet } from 'lucide-react'
import { CustomerSearch } from './CustomerSearch'
import { supabase } from '../lib/supabase'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { loyaltyDiscountForPoints } from '../lib/loyalty'

export default function LoyaltyCardScanModal({ onClose, onOpenCustomer }) {
  const { role } = useAuth()
  const [code, setCode] = useState('')
  const [card, setCard] = useState(null)
  const [status, setStatus] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loyalty, setLoyalty] = useState({ loading: false, balance: 0, error: false })
  const inputRef = useRef(null)
  const { addNotification } = useNotification()

  const loadLoyalty = async (customerId) => {
    if (!customerId) { setLoyalty({ loading: false, balance: 0, error: false }); return }
    setLoyalty({ loading: true, balance: 0, error: false })
    const { data, error } = await supabase.from('customer_loyalty_transactions')
      .select('points_delta').eq('customer_id', customerId)
    if (error) setLoyalty({ loading: false, balance: 0, error: true })
    else setLoyalty({ loading: false, balance: (data || []).reduce((sum, row) => sum + Number(row.points_delta || 0), 0), error: false })
  }

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const findCard = async (event) => {
    event?.preventDefault?.()
    const cardCode = code.trim().toUpperCase()
    setStatus('')
    setCard(null)
    setSelectedCustomer(null)
    if (!/^[A-Z]{1,3}-[A-F0-9]{12}$/.test(cardCode)) {
      setStatus('Enter or scan a valid card ID.')
      return
    }
    setBusy(true)
    try {
      const { data, error } = await supabase.from('customer_loyalty_cards')
        .select('code, customer_id, customers(customer_id, full_name, phone)')
        .eq('code', cardCode).maybeSingle()
      if (error) throw error
      if (!data) { setStatus(`Card ${cardCode} was not found in the card register.`); return }
      const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers
      setCard({ ...data, customers: customer || null })
      setCode(cardCode)
      if (customer) await loadLoyalty(customer.customer_id)
      if (customer) setStatus(`This card is linked to ${customer.full_name}.`)
      else setStatus(`Batch ${cardCode.split('-')[0]} card found. Select the customer profile to assign it.`)
    } catch (error) {
      setStatus(error?.message || 'Could not look up this card. Check the connection and try again.')
    } finally { setBusy(false) }
  }

  const assignCard = async () => {
    if (!card || card.customer_id || !selectedCustomer || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('blossom_assign_loyalty_card', {
        p_code: card.code, p_customer_id: selectedCustomer.customer_id,
      })
      if (error) throw error
      setCard((current) => ({ ...current, customer_id: selectedCustomer.customer_id, customers: selectedCustomer }))
      await loadLoyalty(selectedCustomer.customer_id)
      setStatus(`${card.code} is now linked to ${selectedCustomer.full_name}.`)
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', {
        detail: { code: card.code, customer: selectedCustomer },
      }))
      addNotification(`Card ${card.code} linked to ${selectedCustomer.full_name}`, 'success')
    } catch (error) {
      setStatus(error?.message || 'Could not assign this card.')
    } finally { setBusy(false) }
  }

  const unlinkCard = async () => {
    if (!card || !card.customer_id || busy) return
    if (!window.confirm(`Unlink card ${card.code} from ${card.customers?.full_name || 'this customer'}? The card becomes blank and can be linked to someone else. Petals stay on the customer.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('blossom_unlink_loyalty_card', { p_code: card.code })
      if (error) throw error
      setCard((current) => ({ ...current, customer_id: null, customers: null }))
      setSelectedCustomer(null)
      setLoyalty({ loading: false, balance: 0, error: false })
      setStatus(`${card.code} is now blank. Select a customer to link it.`)
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', { detail: { code: card.code, customer: null } }))
      addNotification(`Card ${card.code} unlinked`, 'success')
    } catch (error) {
      setStatus(error?.message || 'Could not unlink this card.')
    } finally { setBusy(false) }
  }

  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/35 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="loyalty-scan-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-sage-dark bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-sage-dark px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-fuchsia-50 text-fuchsia-700"><ScanLine size={20} /></span><div><h2 id="loyalty-scan-title" className="font-semibold text-gray-900">Scan loyalty card</h2><p className="text-xs text-gray-500">Scan with a reader or type the printed ID.</p></div></div><button type="button" onClick={onClose} aria-label="Close card scanner" className="rounded-lg p-2 text-gray-400 hover:bg-sage hover:text-gray-700"><X size={18} /></button></header>
      <div className="space-y-4 p-5">
        <form onSubmit={findCard} className="flex gap-2"><div className="relative min-w-0 flex-1"><QrCode className="absolute left-3 top-1/2 -translate-y-1/2 text-fuchsia-600" size={16} /><input ref={inputRef} aria-label="Loyalty card ID" value={code} onChange={(event) => setCode(event.target.value)} placeholder="A-0123456789AB" autoComplete="off" className="w-full rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 py-3 pl-9 pr-3 font-mono text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100" /></div><button type="submit" disabled={busy || !code.trim()} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-xl bg-fuchsia-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />} Scan</button></form>
        {status && <p role="status" className={`rounded-xl p-3 text-sm ${card?.customers ? 'bg-emerald-50 text-emerald-800' : card ? 'bg-fuchsia-50 text-fuchsia-900' : 'bg-amber-50 text-amber-800'}`}>{status}</p>}
        {card?.customers && <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700"><UserRound size={18} /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-gray-900">{card.customers.full_name}</p><p className="text-xs text-gray-600">{card.customers.phone || 'No phone on profile'}</p></div><span className="rounded-full bg-white px-2.5 py-1 font-mono text-xs font-bold text-emerald-800">{card.code}</span></div><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-emerald-100 bg-white p-3"><div className="flex items-center gap-1.5 text-xs text-gray-500"><Sparkles size={14} className="text-fuchsia-600" /> Petal balance</div><p className="mt-1 text-lg font-bold text-fuchsia-800">{loyalty.loading ? 'Loading…' : loyalty.error ? 'Unavailable' : `${Math.max(0, loyalty.balance).toLocaleString('fr-FR')} petals`}</p><p className="mt-0.5 text-xs text-gray-500">{loyalty.loading ? 'Checking customer rewards' : loyalty.error ? 'Could not load rewards' : `${loyaltyDiscountForPoints(loyalty.balance).toLocaleString('fr-FR')} DA redeemable`}</p></div><div className="rounded-lg border border-emerald-100 bg-white p-3"><div className="flex items-center gap-1.5 text-xs text-gray-500"><Wallet size={14} className="text-amber-600" /> Card status</div><p className="mt-1 text-lg font-bold text-emerald-800">Linked</p><p className="mt-0.5 truncate text-xs text-gray-500">Customer account</p></div></div><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => onOpenCustomer(card.customers.customer_id)} className="text-xs font-semibold text-emerald-800 underline underline-offset-2">Open customer profile</button>{role === 'owner' && <button type="button" onClick={unlinkCard} disabled={busy} className="text-xs font-semibold text-rose-700 underline underline-offset-2 disabled:opacity-50">Unlink card</button>}</div></div>}
        {card && !card.customer_id && <div className="space-y-3"><CustomerSearch selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} onClear={() => setSelectedCustomer(null)} placeholder="Find customer to link this card" showCardScanner={false} />{selectedCustomer && <div className="flex items-center justify-between gap-3 rounded-xl bg-sage/50 p-3"><span className="truncate text-sm text-gray-700">Link <b>{card.code}</b> to <b>{selectedCustomer.full_name}</b>?</span><button type="button" onClick={assignCard} disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Link card</button></div>}</div>}
      </div>
    </section>
  </div>, document.body)
}
