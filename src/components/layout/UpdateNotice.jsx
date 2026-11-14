import { useEffect, useRef, useState } from 'react'
import { useNotification } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'

// Desktop app only. The updater downloads new versions in the background and
// installs them when the app quits. When one is ready, this puts an alert in
// the bell with a "Restart now" button, so staff restart at a moment that
// suits them (never mid-sale). Renders nothing itself: no floating card.
// The bell is emptied at sign-in, so the alert is posted once someone is
// signed in, and again for the next person who signs in on this till.
export default function UpdateNotice() {
  const { addNotification } = useNotification()
  const { user } = useAuth()
  const [readyVersion, setReadyVersion] = useState(null)
  const announced = useRef(new Set())

  useEffect(() => {
    const api = window.electronAPI
    if (typeof api?.onUpdateDownloaded !== 'function') return undefined
    const unsubscribe = api.onUpdateDownloaded((info) => setReadyVersion(info?.version || 'new'))
    return typeof unsubscribe === 'function' ? unsubscribe : undefined
  }, [])

  useEffect(() => {
    if (!readyVersion || !user?.id) return
    const key = `${user.id}|${readyVersion}`
    if (announced.current.has(key)) return
    announced.current.add(key)
    addNotification(
      `Update ready${readyVersion !== 'new' ? ` (v${readyVersion})` : ''}. It installs when Blossom closes. Finish any sale first, then restart.`,
      'info',
      { action: { label: 'Restart now', onClick: () => window.electronAPI?.quitAndInstall?.() } },
    )
  }, [readyVersion, user?.id, addNotification])

  return null
}
