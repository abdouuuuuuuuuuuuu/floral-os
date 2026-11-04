import { useEffect, useState } from 'react'
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react'
import { startOutboxSync } from '../../lib/offlineSync'
import { countQueuedSales, listFailedSales } from '../../lib/offlineQueue'
import { useNotification } from '../../context/NotificationContext'
import FailedSalesReview from './FailedSalesReview'

// Starts the offline sale replay engine, surfaces a small "held offline"
// badge while sales are queued, and announces when each one finalizes. Sales
// the server refused stay on a second badge until someone reviews them.
export default function OfflineSyncManager() {
  const { addNotification } = useNotification()
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState([])
  const [reviewing, setReviewing] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const refreshFailed = () => { listFailedSales().then(setFailed).catch(() => {}) }

    startOutboxSync()
    countQueuedSales().then(setPending)
    refreshFailed()

    const onChange = (event) => {
      setPending(event.detail?.pending ?? 0)
      refreshFailed()
    }
    const onSynced = (event) => {
      const number = event.detail?.orderNumber
      addNotification(number ? `Offline sale synced · Order #${number}` : 'Offline sale synced', 'success')
      // Let order/register screens refresh themselves.
      window.dispatchEvent(new CustomEvent('blossom:orders-changed'))
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated'))
      countQueuedSales().then(setPending)
    }
    const onFailed = (event) => {
      addNotification(`A held sale needs review: ${event.detail?.message || 'it was refused.'}`, 'error')
      countQueuedSales().then(setPending)
    }
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('blossom:outbox-changed', onChange)
    window.addEventListener('blossom:sale-synced', onSynced)
    window.addEventListener('blossom:sale-sync-failed', onFailed)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('blossom:outbox-changed', onChange)
      window.removeEventListener('blossom:sale-synced', onSynced)
      window.removeEventListener('blossom:sale-sync-failed', onFailed)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [addNotification])

  if (pending <= 0 && failed.length === 0) return null

  return (
    <>
      <div
        className="fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2"
        style={{ paddingLeft: 'env(safe-area-inset-left, 0px)' }}
      >
        {failed.length > 0 && (
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 shadow-lg"
          >
            <AlertTriangle size={14} />
            {failed.length} {failed.length === 1 ? 'sale needs' : 'sales need'} review
          </button>
        )}
        {pending > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 shadow-lg"
            title={online ? 'Syncing held sales…' : 'Sales held until the connection returns'}
          >
            {online
              ? <RefreshCw size={14} className="animate-spin" />
              : <CloudOff size={14} />}
            {pending} {pending === 1 ? 'sale' : 'sales'} held offline
          </div>
        )}
      </div>
      {reviewing && failed.length > 0 && (
        <FailedSalesReview sales={failed} onClose={() => setReviewing(false)} />
      )}
    </>
  )
}
