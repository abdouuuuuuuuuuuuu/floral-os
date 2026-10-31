import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { startOutboxSync } from '../../lib/offlineSync'
import { countQueuedSales } from '../../lib/offlineQueue'
import { useNotification } from '../../context/NotificationContext'

// Starts the offline sale replay engine, surfaces a small "held offline"
// badge while sales are queued, and announces when each one finalizes.
export default function OfflineSyncManager() {
  const { addNotification } = useNotification()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    startOutboxSync()
    countQueuedSales().then(setPending)

    const onChange = (event) => setPending(event.detail?.pending ?? 0)
    const onSynced = (event) => {
      const number = event.detail?.orderNumber
      addNotification(number ? `Offline sale synced · Order #${number}` : 'Offline sale synced', 'success')
      // Let order/register screens refresh themselves.
      window.dispatchEvent(new CustomEvent('blossom:orders-changed'))
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated'))
      countQueuedSales().then(setPending)
    }
    const onFailed = (event) => {
      addNotification(`A held sale could not be completed: ${event.detail?.message || 'please re-enter it.'}`, 'error')
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

  if (pending <= 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[60] inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 shadow-lg"
      style={{ paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))' }}
      title={online ? 'Syncing held sales…' : 'Sales held until the connection returns'}
    >
      {online
        ? <RefreshCw size={14} className="animate-spin" />
        : <CloudOff size={14} />}
      {pending} {pending === 1 ? 'sale' : 'sales'} held offline
    </div>
  )
}
