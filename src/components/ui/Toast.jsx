import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const bgColors = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-950',
  error: 'bg-red-50 border-red-200 text-red-950',
  warning: 'bg-amber-50 border-amber-200 text-amber-950',
  info: 'bg-blue-50 border-blue-200 text-blue-950',
}

function Toast({ notification, onDismiss }) {
  const Icon = icons[notification.type] || icons.info

  useEffect(() => {
    if (!notification.duration) return undefined
    const timer = window.setTimeout(() => onDismiss(notification.id), notification.duration)
    return () => window.clearTimeout(timer)
  }, [notification.id, notification.duration, onDismiss])

  return (
    <div
      className={`toast-item flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${bgColors[notification.type] || bgColors.info}`}
      role={notification.type === 'error' ? 'alert' : 'status'}
      aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={19} className="shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm font-medium flex-1 min-w-0 break-words">{notification.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss notification"
        className="p-1 -mr-1 -mt-1 rounded-lg opacity-65 hover:opacity-100 hover:bg-black/5 press shrink-0"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

export default Toast
