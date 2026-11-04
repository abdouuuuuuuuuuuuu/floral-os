import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import { removeQueuedSale } from '../../lib/offlineQueue'
import { retryFailedSale } from '../../lib/offlineSync'
import { loyaltyDiscountForPoints } from '../../lib/loyalty'

// Sales made offline that the server later refused. The customer has already
// paid, so a person decides what happens to each one.
export default function FailedSalesReview({ sales, onClose }) {
  const { role } = useAuth()
  const { addNotification } = useNotification()
  const [busyId, setBusyId] = useState(null)
  const canDiscard = role === 'owner' || role === 'manager'

  const run = async (sale, action) => {
    setBusyId(sale.requestId)
    try {
      await action()
    } catch (error) {
      addNotification(`The sale was not saved: ${error.message}`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const discard = (sale) => {
    if (!window.confirm(`Delete this sale for ${sale.meta?.clientName || 'this customer'}? It will not be recorded anywhere, and any money taken must be handled by hand.`)) return
    void run(sale, () => removeQueuedSale(sale.requestId))
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/35 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="failed-sales-title" className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sage-dark bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-sage-dark px-5 py-4">
          <div>
            <h2 id="failed-sales-title" className="font-semibold text-gray-900">Sales that need review</h2>
            <p className="text-xs text-gray-500">These were taken offline and refused when they were sent. They are only saved on this PC.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-gray-400 hover:bg-sage hover:text-gray-700"><X size={18} /></button>
        </header>
        <ul className="space-y-3 overflow-y-auto p-5">
          {sales.map((sale) => {
            const points = Number(sale.params?.p_points_to_redeem) || 0
            const discount = loyaltyDiscountForPoints(points)
            const total = Number(sale.meta?.total) || 0
            const busy = busyId === sale.requestId
            return (
              <li key={sale.requestId} className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                <p className="text-sm font-semibold text-gray-900">{sale.meta?.clientName || 'Customer'} · {Math.max(0, total - discount).toLocaleString('fr-FR')} DA</p>
                <p className="text-xs text-gray-500">{new Date(sale.queuedAt).toLocaleString('fr-FR')}{points > 0 ? ` · ${points} petals for ${discount.toLocaleString('fr-FR')} DA off` : ''}</p>
                <p className="mt-1 text-sm text-rose-800">{sale.failure}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy} onClick={() => run(sale, () => retryFailedSale(sale))} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" />} Try again
                  </button>
                  {points > 0 && (
                    <button type="button" disabled={busy} onClick={() => run(sale, () => retryFailedSale(sale, { withoutPetals: true }))} className="min-h-9 rounded-lg border border-fuchsia-300 px-3 text-sm font-semibold text-fuchsia-800 disabled:opacity-50">
                      Save without reward ({discount.toLocaleString('fr-FR')} DA owed)
                    </button>
                  )}
                  {canDiscard && (
                    <button type="button" disabled={busy} onClick={() => discard(sale)} className="min-h-9 px-2 text-sm font-semibold text-rose-700 underline underline-offset-2 disabled:opacity-50">Delete</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>,
    document.body,
  )
}
