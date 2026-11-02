import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, RefreshCw, Wifi } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

export default function ConnectionStatus() {
  const { user } = useAuth()
  const [state, setState] = useState(navigator.onLine ? 'checking' : 'offline')

  const checkService = useCallback(async () => {
    if (!navigator.onLine) {
      setState('offline')
      return
    }
    setState('checking')
    let timeout
    try {
      const probe = supabase.from('profiles').select('id').eq('id', user?.id || '').maybeSingle()
      const result = await Promise.race([
        probe,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 8000) }),
      ])
      setState(result.error ? 'unavailable' : 'online')
    } catch {
      setState('unavailable')
    } finally {
      clearTimeout(timeout)
    }
  }, [user?.id])

  useEffect(() => {
    const online = () => checkService()
    const offline = () => setState('offline')
    const focus = () => checkService()
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', focus)
    checkService()
    const timer = setInterval(checkService, 90000)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', focus)
      clearInterval(timer)
    }
  }, [checkService])

  const config = {
    checking: { label: 'Reconnecting…', Icon: RefreshCw, color: 'text-amber-700 bg-amber-50', message: 'Checking Blossom service connection.' },
    unavailable: { label: 'Service unavailable', Icon: CloudOff, color: 'text-rose-700 bg-rose-50', message: 'Could not reach Blossom. Before retrying a sale or payment, check Orders to see whether it was saved.' },
    offline: { label: 'Offline', Icon: Wifi, color: 'text-rose-700 bg-rose-50', message: 'Network connection unavailable. Sales and changes cannot be saved until you reconnect.' },
    online: { label: 'Connected', Icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50', message: 'Blossom service is reachable.' },
  }[state]
  const Icon = config.Icon

  return (
    <button
      type="button"
      onClick={checkService}
      title={`${config.message} Click to check again.`}
      aria-label={`Connection status: ${config.label}. ${config.message}`}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-2xs font-medium ${config.color}`}
    >
      <Icon size={13} className={state === 'checking' ? 'animate-spin' : ''} />
      <span className="hidden xl:inline">{config.label}</span>
    </button>
  )
}
