import { useCallback, useEffect, useRef, useState } from 'react'
import { startOutboxSync } from '../../lib/offlineSync'
import { countQueuedSales, listFailedSales } from '../../lib/offlineQueue'
import { useNotification } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'
import FailedSalesReview from './FailedSalesReview'

// Starts the offline sale replay engine and reports held sales in the bell
// (no floating badges): a warning while sales wait for the connection, a
// success when each one finalizes, and an error with a "Review" button for
// sales the server refused. Those stay on this PC until someone reviews them.
export default function OfflineSyncManager() {
  const { addNotification } = useNotification()
  const { user } = useAuth()
  const [failed, setFailed] = useState([])
  const [reviewing, setReviewing] = useState(false)
  const announcedFor = useRef(null)

  const refreshFailed = useCallback(() => listFailedSales().then((rows) => { setFailed(rows); return rows }).catch(() => []), [])
  const reviewAction = useCallback(() => ({
    label: 'Review held sales',
    onClick: () => { void refreshFailed().then((rows) => { if (rows.length) setReviewing(true) }) },
  }), [refreshFailed])

  useEffect(() => {
    startOutboxSync()
    void refreshFailed()

    const onChange = () => { void refreshFailed() }
    const onSynced = (event) => {
      const number = event.detail?.orderNumber
      addNotification(number ? `Offline sale synced · Order #${number}` : 'Offline sale synced', 'success')
      // Let order/register screens refresh themselves.
      window.dispatchEvent(new CustomEvent('blossom:orders-changed'))
      window.dispatchEvent(new CustomEvent('blossom:loyalty-card-updated'))
    }
    const onFailed = (event) => {
      void refreshFailed()
      addNotification(`A held sale needs review: ${event.detail?.message || 'it was refused.'}`, 'error', { action: reviewAction() })
    }
    const goOffline = () => {
      addNotification('Connection lost. New sales are held on this PC and sent automatically when it returns.', 'warning')
    }

    window.addEventListener('blossom:outbox-changed', onChange)
    window.addEventListener('blossom:sale-synced', onSynced)
    window.addEventListener('blossom:sale-sync-failed', onFailed)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('blossom:outbox-changed', onChange)
      window.removeEventListener('blossom:sale-synced', onSynced)
      window.removeEventListener('blossom:sale-sync-failed', onFailed)
      window.removeEventListener('offline', goOffline)
    }
  }, [addNotification, refreshFailed, reviewAction])

  // The bell is emptied when someone signs in, so report what is waiting on
  // this PC once per signed-in person, after sign-in.
  useEffect(() => {
    if (!user?.id || announcedFor.current === user.id) return
    announcedFor.current = user.id
    void (async () => {
      const [pending, rows] = await Promise.all([countQueuedSales(), refreshFailed()])
      if (rows.length) {
        addNotification(`${rows.length} held ${rows.length === 1 ? 'sale needs' : 'sales need'} review. They are saved only on this PC.`, 'error', { action: reviewAction() })
      }
      if (pending > 0) {
        addNotification(`${pending} ${pending === 1 ? 'sale is' : 'sales are'} held offline and will be sent automatically.`, 'warning')
      }
    })()
  }, [user?.id, addNotification, refreshFailed, reviewAction])

  if (!reviewing || failed.length === 0) return null
  return <FailedSalesReview sales={failed} onClose={() => setReviewing(false)} />
}
