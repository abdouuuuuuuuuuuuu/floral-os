import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, Printer, QrCode, RefreshCw, Sparkles } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useNotification } from '../context/NotificationContext'
import { usePageActive } from '../context/PageActiveContext'
import { supabase } from '../lib/supabase'
import { LoyaltyCardFront, LoyaltyCardBack } from '../components/LoyaltyCardFace'
import { LOYALTY_EARN_DA_PER_POINT, LOYALTY_REDEMPTION_POINTS, LOYALTY_REDEMPTION_DA } from '../lib/loyalty'

const DEFAULT_COUNT = 24
const CARDS_PER_SHEET = 10

// A4 sheets of 10 cards: a page of fronts, then a page of backs. Each row of
// backs is reversed so the two sides line up when printed double-sided.
function printSheets(cards) {
  const sheets = []
  for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) sheets.push(cards.slice(i, i + CARDS_PER_SHEET))
  return sheets
}

function backOrder(sheet) {
  const slots = []
  for (let i = 0; i < sheet.length; i += 2) slots.push(sheet[i + 1] ?? null, sheet[i])
  return slots
}

function batchOrdinal(prefix) {
  return [...prefix].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0)
}

function batchPrefix(ordinal) {
  let value = ordinal
  let prefix = ''
  while (value > 0) {
    value -= 1
    prefix = String.fromCharCode(65 + (value % 26)) + prefix
    value = Math.floor(value / 26)
  }
  return prefix
}

export default function LoyaltyCards() {
  const pageActive = usePageActive()
  const { addNotification } = useNotification()
  const [cards, setCards] = useState([])
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [selectedBatch, setSelectedBatch] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadCards = async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('customer_loyalty_cards')
      .select('code, customer_id, created_at, customers(customer_id, full_name, phone)')
      .order('created_at', { ascending: false })
    if (queryError) setError(queryError.message)
    else { setCards(data || []); setError('') }
    setLoading(false)
  }

  useEffect(() => { loadCards() }, [])
  useEffect(() => {
    const refreshCards = () => loadCards()
    window.addEventListener('blossom:loyalty-card-updated', refreshCards)
    return () => window.removeEventListener('blossom:loyalty-card-updated', refreshCards)
  }, [])

  const batches = useMemo(() => {
    const map = new Map()
    cards.forEach((card) => {
      const prefix = card.code.split('-')[0]
      if (!map.has(prefix)) map.set(prefix, [])
      map.get(prefix).push(card)
    })
    return [...map.entries()].map(([prefix, batchCards]) => ({ id: prefix, cards: batchCards }))
  }, [cards])
  const batch = batches.find((item) => item.id === selectedBatch) || batches[0]
  const unassigned = cards.filter((card) => !card.customer_id).length

  const generate = async () => {
    setCreating(true)
    setError('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const ids = new Set(cards.map((card) => card.code))
      const lastOrdinal = cards.reduce((maximum, card) => Math.max(maximum, batchOrdinal(card.code.split('-')[0])), 0)
      const prefix = batchPrefix(lastOrdinal + 1)
      if (prefix.length > 3) throw new Error('Maximum batch letter range reached.')
      const rows = []
      while (rows.length < Number(count)) {
        const bytes = crypto.getRandomValues(new Uint8Array(6))
        const code = `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
        if (!ids.has(code)) { ids.add(code); rows.push({ code, created_by: authData.user.id }) }
      }
      const { error: insertError } = await supabase.from('customer_loyalty_cards').insert(rows)
      if (insertError) throw insertError
      await loadCards()
      setSelectedBatch(prefix)
      addNotification(`Batch ${prefix}: ${rows.length} unique loyalty cards generated`, 'success')
    } catch (err) {
      const message = err?.message || 'Could not generate card batch.'
      setError(message.includes('customer_loyalty_cards') ? 'Apply the customer loyalty cards migration in Supabase, then try again.' : message)
      addNotification('Could not generate the card batch', 'error')
    } finally { setCreating(false) }
  }

  const downloadCsv = () => {
    if (!batch) return
    const rows = [['card_code', 'status', 'customer_name', 'phone'], ...batch.cards.map((card) => [card.code, card.customer_id ? 'assigned' : 'unassigned', card.customers?.full_name || '', card.customers?.phone || ''])]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `blossom-loyalty-batch-${batch.id}.csv`; anchor.click()
    URL.revokeObjectURL(url)
  }

  return <DashboardLayout>
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-fuchsia-600">Customer rewards</p><h1 className="mt-1 font-display text-3xl text-primary">Loyalty cards</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Each batch gets a letter prefix: Batch A cards start A-, Batch B cards start B-, and so on. Scan a card in the POS to link it to a customer.</p></div>
        <div className="flex gap-2 rounded-xl border border-sage-dark bg-white px-4 py-2 text-sm"><b className="text-gray-900">{cards.length}</b><span className="text-gray-500">cards</span><span className="mx-1 text-gray-300">·</span><b className="text-emerald-700">{unassigned}</b><span className="text-gray-500">unassigned</span></div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-sage-dark bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-fuchsia-50 text-fuchsia-700"><QrCode size={20} /></span><div><h2 className="font-semibold text-gray-900">New card batch</h2><p className="text-xs text-gray-500">QR artwork is generated on this device.</p></div></div><label className="text-sm font-medium text-gray-700">Cards in batch<input type="number" min="1" max="500" value={count} onChange={(event) => setCount(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} className="mt-1.5 block w-40 rounded-xl border border-sage-dark px-3 py-2.5 text-sm" /></label><button type="button" onClick={generate} disabled={creating} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">{creating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate batch</button>{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}</div>
        <div className="rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-fuchsia-50 to-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700">Blossom Petals</p><p className="mt-2 font-display text-2xl text-primary">A little love, every visit.</p><p className="mt-2 text-sm text-gray-600">Earn 1 petal for each {LOYALTY_EARN_DA_PER_POINT} DA collected. Redeem {LOYALTY_REDEMPTION_POINTS} petals for {LOYALTY_REDEMPTION_DA} DA off.</p><div className="mt-5 flex items-center gap-2 text-xs text-gray-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Scan in the POS to assign and use a card</div></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-sage-dark bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-sage-dark px-5 py-4"><div><h2 className="font-semibold text-gray-900">Card batches</h2><p className="mt-0.5 text-xs text-gray-500">Batch letter is part of each card ID and remains consistent across runs.</p></div><div className="flex items-center gap-2"><select aria-label="Select card batch" value={batch?.id || ''} onChange={(event) => setSelectedBatch(event.target.value)} className="rounded-lg border border-sage-dark bg-white px-3 py-2 text-sm" disabled={!batches.length}><option value="" disabled>Select batch</option>{batches.map((item) => <option key={item.id} value={item.id}>Batch {item.id} · {item.cards.length} cards</option>)}</select><button type="button" onClick={loadCards} disabled={loading} aria-label="Refresh card batches" title="Refresh card batches" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sage-dark text-gray-600 hover:bg-sage disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button><button type="button" onClick={downloadCsv} disabled={!batch} className="inline-flex items-center gap-2 rounded-lg border border-sage-dark px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"><Download size={15} /> CSV</button><button type="button" onClick={() => window.print()} disabled={!batch} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Printer size={15} /> Print cards</button></div></div>
        {loading ? <div className="p-12 text-center text-sm text-gray-500"><Loader2 size={20} className="mx-auto mb-2 animate-spin" />Loading cards…</div> : !cards.length ? <div className="p-12 text-center"><QrCode size={30} className="mx-auto text-gray-300" /><p className="mt-3 font-medium text-gray-700">No cards yet</p><p className="mt-1 text-sm text-gray-500">Generate a batch to create unassigned cards for your customers.</p></div> : <div className="p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-gray-500">Batch {batch?.id} · {batch?.cards.length} cards · IDs begin with {batch?.id}-. Prints 10 cards per A4 sheet; use double-sided printing, flip on long edge.</p><div className="flex items-center gap-2"><span className="text-xs text-gray-500">Back of every card</span><LoyaltyCardBack className="w-32 rounded border border-sage-dark" /></div></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ">{batch?.cards.map((card) => <article key={card.code} className="overflow-hidden rounded-xl border border-sage-dark bg-white"><LoyaltyCardFront code={card.code} /><div className="flex items-center justify-between gap-2 border-t border-sage-dark px-3 py-2"><span className="truncate text-xs text-gray-600">{card.customers?.full_name || 'No customer yet'}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${card.customer_id ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{card.customer_id ? 'Assigned' : 'Unassigned'}</span></div></article>)}</div></div>}
      </section>
    </div>
    {pageActive && batch && createPortal(<div className="loyalty-print-root">{printSheets(batch.cards).map((sheet, index) => <div key={index}>
      <div className="loyalty-print-sheet">{sheet.map((card) => <LoyaltyCardFront key={card.code} code={card.code} className="loyalty-print-face" />)}</div>
      <div className="loyalty-print-sheet">{backOrder(sheet).map((card, slot) => card ? <LoyaltyCardBack key={card.code} className="loyalty-print-face" /> : <div key={`empty-${slot}`} className="loyalty-print-face" />)}</div>
    </div>)}</div>, document.body)}
    {pageActive && <style>{`.loyalty-print-root { display: none; }
      @media print {
        @page { size: A4; margin: 0; }
        html, body { background: #fff !important; }
        body > *:not(.loyalty-print-root) { display: none !important; }
        .loyalty-print-root { display: block; }
        .loyalty-print-sheet { display: grid; grid-template-columns: repeat(2, 88.9mm); grid-auto-rows: 50.8mm; justify-content: center; align-content: start; gap: 2mm; padding-top: 12mm; break-after: page; }
        .loyalty-print-face { width: 88.9mm; height: 50.8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }`}</style>}
  </DashboardLayout>
}
