import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronDown, FileDown, Flower2, Loader2, Plus, QrCode, ScanLine, Search } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import ProductPetalsCheck from '../components/ProductPetalsCheck'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { usePageActive } from '../context/PageActiveContext'
import { supabase } from '../lib/supabase'
import { LoyaltyCardFront, LoyaltyCardBack } from '../components/LoyaltyCardFace'
import LoyaltyCardPrintSheets, { LOYALTY_PRINT_CSS } from '../components/LoyaltyCardPrintSheets'
import { LOYALTY_EARN_RULE, LOYALTY_REDEMPTION_DA, LOYALTY_REDEMPTION_POINTS } from '../lib/loyalty'

const DEFAULT_COUNT = 24
const MAX_COUNT = 500
const FILTERS = [['all', 'All'], ['unused', 'Unused'], ['linked', 'Linked'], ['reward', 'Reward ready']]

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

const byCode = (a, b) => a.length - b.length || a.localeCompare(b)

async function loadPetalBalances() {
  const balances = new Map()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('customer_loyalty_transactions')
      .select('customer_id, points_delta')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    ;(data || []).forEach((row) => balances.set(row.customer_id, (balances.get(row.customer_id) || 0) + Number(row.points_delta || 0)))
    if (!data || data.length < pageSize) return balances
  }
}

export default function LoyaltyCards() {
  const pageActive = usePageActive()
  const { role } = useAuth()
  const { addNotification } = useNotification()
  const [cards, setCards] = useState([])
  const [balances, setBalances] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [previewCode, setPreviewCode] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportCodes, setExportCodes] = useState(null)
  const [showPetals, setShowPetals] = useState(false)
  const [unlinking, setUnlinking] = useState(null)
  const navigate = useNavigate()

  // The top bar owns the card window; this opens it, on a card when one is given.
  const openCardWindow = (code) => {
    window.dispatchEvent(new CustomEvent('blossom:card-scan-unclaimed', { detail: { code } }))
  }

  const unlinkCard = async (card) => {
    if (unlinking) return
    if (!window.confirm(`Unlink card ${card.code} from ${card.customers?.full_name || 'this customer'}? The card becomes blank and can be linked to someone else. Petals stay on the customer.`)) return
    setUnlinking(card.code)
    try {
      const { error: unlinkError } = await supabase.rpc('blossom_unlink_loyalty_card', { p_code: card.code })
      if (unlinkError) throw unlinkError
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated', { detail: { code: null, customer: card.customers } }))
      addNotification(`Card ${card.code} unlinked`, 'success')
    } catch (unlinkError) {
      console.error('Could not unlink card:', unlinkError)
      addNotification('Could not unlink this card. Check the connection and try again.', 'error')
    } finally {
      setUnlinking(null)
    }
  }

  const loadCards = async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('customer_loyalty_cards')
      .select('code, customer_id, created_at, assigned_at, customers(customer_id, full_name, phone)')
      .order('created_at', { ascending: false })
    if (queryError) {
      console.error('Could not load loyalty cards:', queryError)
      setError('Could not load the cards. Check the connection and try again.')
    } else {
      setCards(data || [])
      setError('')
    }
    try {
      setBalances(await loadPetalBalances())
    } catch (balanceError) {
      console.error('Could not load petal balances:', balanceError)
      setBalances(null)
    }
    setLoading(false)
  }

  useEffect(() => { loadCards() }, [])
  useEffect(() => {
    const refreshCards = () => loadCards()
    window.addEventListener('blossom:loyalty-card-updated', refreshCards)
    return () => window.removeEventListener('blossom:loyalty-card-updated', refreshCards)
  }, [])

  const unusedCodes = useMemo(() => cards.filter((card) => !card.customer_id).map((card) => card.code).sort(byCode), [cards])
  const allCodes = useMemo(() => cards.map((card) => card.code).sort(byCode), [cards])
  const rewardCustomers = useMemo(() => (balances ? [...balances.values()].filter((balance) => balance >= LOYALTY_REDEMPTION_POINTS).length : null), [balances])

  const visibleCards = useMemo(() => {
    const term = search.trim().toLowerCase()
    return cards
      .filter((card) => {
        if (filter === 'unused') return !card.customer_id
        if (filter === 'linked') return Boolean(card.customer_id)
        if (filter === 'reward') return Boolean(card.customer_id) && (balances?.get(card.customer_id) || 0) >= LOYALTY_REDEMPTION_POINTS
        return true
      })
      .filter((card) => !term
        || card.code.toLowerCase().includes(term)
        || card.customers?.full_name?.toLowerCase().includes(term)
        || card.customers?.phone?.includes(term))
      .sort((a, b) => byCode(a.code, b.code))
  }, [cards, filter, search, balances])

  const createCards = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const ids = new Set(cards.map((card) => card.code))
      const lastOrdinal = cards.reduce((maximum, card) => Math.max(maximum, batchOrdinal(card.code.split('-')[0])), 0)
      const prefix = batchPrefix(lastOrdinal + 1)
      if (prefix.length > 3) throw new Error('No more card ID letters are available.')
      const rows = []
      while (rows.length < Number(count)) {
        const bytes = crypto.getRandomValues(new Uint8Array(6))
        const code = `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
        if (!ids.has(code)) { ids.add(code); rows.push({ code, created_by: authData.user.id }) }
      }
      const { error: insertError } = await supabase.from('customer_loyalty_cards').insert(rows)
      if (insertError) throw insertError
      await loadCards()
      setFilter('unused')
      setShowCreate(false)
      addNotification(`${rows.length} new cards created`, 'success')
    } catch (createError) {
      console.error('Could not create cards:', createError)
      setError('Could not create the cards. Check the connection and try again.')
    } finally {
      setCreating(false)
    }
  }

  const exportPdf = async (codes, label) => {
    if (!codes.length || exporting) return
    const exporter = window.electronAPI?.loyaltyCards?.exportPdf
    if (!exporter) {
      addNotification('PDF export is available in the desktop app. Use Print and choose Save as PDF here.', 'info')
      return
    }
    setExporting(true)
    try {
      flushSync(() => setExportCodes(codes))
      const images = [...document.querySelectorAll('.loyalty-print-root img')]
      await Promise.all(images.map((image) => image.decode().catch(() => {})))
      const result = await exporter({ label })
      if (result?.saved) addNotification(`${codes.length} cards saved as PDF`, 'success')
    } catch (exportError) {
      console.error('Loyalty card PDF export failed:', exportError)
      addNotification('Could not create the PDF. Please try again.', 'error')
    } finally {
      setExportCodes(null)
      setExporting(false)
    }
  }

  const downloadCsv = () => {
    const rows = [['card_id', 'status', 'customer', 'phone'], ...visibleCards.map((card) => [card.code, card.customer_id ? 'linked' : 'unused', card.customers?.full_name || '', card.customers?.phone || ''])]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'blossom-loyalty-cards.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const deleteUnused = async () => {
    if (!unusedCodes.length || deleting) return
    if (!window.confirm(`Delete ${unusedCodes.length} unused cards? Any printed copies stop working. Linked cards and petals are not affected.`)) return
    setDeleting(true)
    try {
      const { data, error: deleteError } = await supabase.rpc('blossom_delete_unused_loyalty_cards')
      if (deleteError) throw deleteError
      await loadCards()
      addNotification(`${data?.deleted ?? unusedCodes.length} unused cards deleted`, 'success')
    } catch (deleteError) {
      console.error('Could not delete unused cards:', deleteError)
      addNotification('Could not delete the cards. This needs the latest database update, or check the connection.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const menuItem = 'block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-sage disabled:opacity-40'

  return <DashboardLayout>
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-primary">Loyalty</h1>
          <p className="mt-1 text-xs text-gray-500">{LOYALTY_EARN_RULE} · {LOYALTY_REDEMPTION_POINTS} petals = {LOYALTY_REDEMPTION_DA} DA off</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => openCardWindow()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-100"><ScanLine size={16} /> Scan card</button>
          <button type="button" aria-expanded={showPetals} onClick={() => setShowPetals((current) => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage-dark bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-sage"><Flower2 size={16} /> Petals per product</button>
          {role === 'owner' && <button type="button" onClick={() => navigate('/activity', { state: { activityKind: 'loyalty' } })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage-dark bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-sage"><Activity size={16} /> Petal activity</button>}
          <button type="button" onClick={() => setShowCreate((current) => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"><Plus size={16} /> Create cards</button>
        </div>
      </header>

      {showPetals && <ProductPetalsCheck />}

      {showCreate && (
        <form onSubmit={createCards} className="flex flex-wrap items-end gap-3 rounded-2xl border border-sage-dark bg-white p-4">
          <label className="text-sm font-medium text-gray-700">How many cards?
            <input type="number" min="1" max={MAX_COUNT} value={count} onChange={(event) => setCount(Math.max(1, Math.min(MAX_COUNT, Number(event.target.value) || 1)))} className="mt-1.5 block w-32 rounded-xl border border-sage-dark px-3 py-2.5 text-sm" />
          </label>
          <button type="submit" disabled={creating} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{creating && <Loader2 size={16} className="animate-spin" />} Create {count} cards</button>
          <button type="button" onClick={() => setShowCreate(false)} className="min-h-11 px-2 text-sm font-medium text-gray-600">Cancel</button>
        </form>
      )}

      <dl className="grid grid-cols-3 gap-3">
        {[['Cards available', unusedCodes.length], ['Linked', cards.length - unusedCodes.length], ['Customers with a reward', rewardCustomers ?? '—']].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-sage-dark bg-white px-4 py-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-0.5 text-xl font-bold text-gray-900">{value}</dd></div>
        ))}
      </dl>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      <section className="rounded-2xl border border-sage-dark bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-sage-dark p-4">
          <div className="relative min-w-52 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input aria-label="Search cards" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search card ID or customer" className="w-full rounded-lg border border-sage-dark py-2 pl-9 pr-3 text-sm" />
          </div>
          <div role="group" aria-label="Filter cards" className="flex rounded-lg border border-sage-dark p-0.5">
            {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-primary text-white' : 'text-gray-600'}`}>{label}</button>)}
          </div>
          <button type="button" onClick={() => exportPdf(unusedCodes, 'unused-cards')} disabled={!unusedCodes.length || exporting} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-fuchsia-700 px-3 text-sm font-semibold text-white disabled:opacity-40">{exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Export unused as PDF</button>
          <details className="relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-sage-dark px-3 text-sm font-medium text-gray-700">More <ChevronDown size={14} /></summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-sage-dark bg-white p-1 shadow-lg">
              <button type="button" onClick={() => exportPdf(allCodes, 'all-cards')} disabled={!allCodes.length || exporting} className={menuItem}>Export all as PDF</button>
              <button type="button" onClick={() => window.print()} disabled={!unusedCodes.length} className={menuItem}>Print unused cards</button>
              <button type="button" onClick={downloadCsv} disabled={!visibleCards.length} className={menuItem}>Download list (CSV)</button>
              {role === 'owner' && <button type="button" onClick={deleteUnused} disabled={!unusedCodes.length || deleting} className={`${menuItem} text-rose-700`}>Delete unused cards</button>}
            </div>
          </details>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500"><Loader2 size={20} className="mx-auto mb-2 animate-spin" />Loading cards…</div>
        ) : !cards.length ? (
          <div className="p-12 text-center"><QrCode size={30} className="mx-auto text-gray-300" /><p className="mt-3 font-medium text-gray-700">No cards yet</p><p className="mt-1 text-sm text-gray-500">Create cards, export the PDF, and take it to a print shop.</p></div>
        ) : !visibleCards.length ? (
          <p className="p-12 text-center text-sm text-gray-500">No cards match this search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-sage-dark text-xs text-gray-500"><tr><th className="px-4 py-2.5 font-medium">Card ID</th><th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Linked on</th><th className="px-4 py-2.5 text-right font-medium">Petals</th><th className="px-4 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {visibleCards.map((card) => (
                  <Fragment key={card.code}>
                    <tr className="border-b border-sage-dark/60">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-bold text-gray-800">{card.code}</td>
                      <td className="px-4 py-2.5 text-gray-700">{card.customers?.full_name || <span className="text-gray-400">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{card.assigned_at ? new Date(card.assigned_at).toLocaleDateString('fr-FR') : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{card.customer_id && balances ? Math.max(0, balances.get(card.customer_id) || 0).toLocaleString('fr-FR') : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap text-xs font-semibold">
                          <button type="button" aria-expanded={previewCode === card.code} onClick={() => setPreviewCode((current) => (current === card.code ? null : card.code))} className="text-fuchsia-700 underline underline-offset-2">{previewCode === card.code ? 'Hide' : 'View'}</button>
                          <button type="button" disabled={exporting} onClick={() => exportPdf([card.code], card.code)} className="text-fuchsia-700 underline underline-offset-2 disabled:opacity-40">PDF</button>
                          {card.customer_id ? (
                            <>
                              <button type="button" onClick={() => navigate('/customers', { state: { topBarSearch: { type: 'customer', id: card.customer_id } } })} className="text-fuchsia-700 underline underline-offset-2">Customer</button>
                              {role === 'owner' && <button type="button" disabled={unlinking === card.code} onClick={() => unlinkCard(card)} className="text-rose-700 underline underline-offset-2 disabled:opacity-40">Unlink</button>}
                            </>
                          ) : (
                            <button type="button" onClick={() => openCardWindow(card.code)} className="text-fuchsia-700 underline underline-offset-2">Link</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {previewCode === card.code && (
                      <tr className="border-b border-sage-dark/60 bg-sage/30"><td colSpan={5} className="p-4"><div className="grid gap-3 sm:grid-cols-2"><LoyaltyCardFront code={card.code} /><LoyaltyCardBack /></div></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    {pageActive && (exportCodes || unusedCodes.length > 0) && createPortal(<LoyaltyCardPrintSheets codes={exportCodes || unusedCodes} />, document.body)}
    {pageActive && <style>{LOYALTY_PRINT_CSS}</style>}
  </DashboardLayout>
}
