import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { supabase } from '../lib/supabase'
import { createOrderRequestId } from '../lib/orders'

const COLLAPSED_ROWS = 5

// A customer's petal history, and the owner's way of correcting their balance.
export default function PetalHistory({ customer, transactions, onChanged }) {
  const { role } = useAuth()
  const { addNotification } = useNotification()
  const [showAll, setShowAll] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // Kept across retries, so a lost connection can't apply the correction twice.
  const requestId = useRef(createOrderRequestId())

  const visible = showAll ? transactions : transactions.slice(0, COLLAPSED_ROWS)
  const amount = Number(points)
  const valid = Number.isInteger(amount) && amount !== 0 && reason.trim()

  const save = async (event) => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('blossom_adjust_customer_petals', {
      p_customer_id: customer.customer_id,
      p_points: amount,
      p_reason: reason.trim(),
      p_request_id: requestId.current,
    })
    setBusy(false)
    if (error) { setMessage(error.message); return }
    requestId.current = createOrderRequestId()
    setCorrecting(false)
    setPoints('')
    setReason('')
    addNotification(`Petals corrected for ${customer.full_name}`, 'success')
    onChanged()
  }

  return (
    <div className="mt-3 border-t border-fuchsia-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-semibold text-fuchsia-950">Petal history</h5>
        {role === 'owner' && !correcting && (
          <button type="button" onClick={() => setCorrecting(true)} className="text-xs font-semibold text-fuchsia-800 underline underline-offset-2">Correct balance</button>
        )}
      </div>

      {correcting && (
        <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            step="1"
            aria-label="Petals to add or remove"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder="+10 or -10"
            className="w-28 rounded-lg border border-fuchsia-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-fuchsia-200"
          />
          <input
            aria-label="Reason for the correction"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason"
            maxLength={500}
            className="min-w-40 flex-1 rounded-lg border border-fuchsia-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-fuchsia-200"
          />
          <button type="submit" disabled={busy || !valid} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 text-xs font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />} Save
          </button>
          <button type="button" disabled={busy} onClick={() => { setCorrecting(false); setMessage('') }} className="text-xs font-semibold text-gray-600 underline underline-offset-2">Cancel</button>
          {message && <p role="alert" className="w-full text-xs text-rose-700">{message}</p>}
        </form>
      )}

      {transactions.length === 0 ? (
        <p className="mt-2 text-xs text-fuchsia-800">No petals yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {visible.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 text-gray-700">
                <span className="text-gray-500">{new Date(row.created_at).toLocaleDateString('fr-FR')}</span> · {row.note}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${row.points_delta > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {row.points_delta > 0 ? '+' : '−'}{Math.abs(row.points_delta).toLocaleString('fr-FR')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {transactions.length > COLLAPSED_ROWS && (
        <button type="button" onClick={() => setShowAll((current) => !current)} className="mt-2 text-xs font-semibold text-fuchsia-800 underline underline-offset-2">
          {showAll ? 'Show less' : `Show all ${transactions.length}`}
        </button>
      )}
    </div>
  )
}
