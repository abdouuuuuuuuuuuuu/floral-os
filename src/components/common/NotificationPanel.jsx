import { useState, useRef, useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotification } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'
import { canAccessRoute } from '../../lib/permissions'
import {
  Bell, X, CheckCheck, Trash2,
  AlertCircle, CheckCircle, AlertTriangle, Info
} from 'lucide-react'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const colors = {
  success: 'text-emerald-600 bg-emerald-50',
  error: 'text-red-600 bg-red-50',
  warning: 'text-amber-600 bg-amber-50',
  info: 'text-blue-600 bg-blue-50',
}

export default function NotificationPanel() {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { role } = useAuth()
  const panelRef = useRef(null)
  const buttonRef = useRef(null)
  const { notifications, unreadCount, unreadAlertCount, latestAlert, dismissNotification, markNotificationRead, markAllRead, clearAll } = useNotification()

  // Alerts no longer pop up on screen. When a new one arrives the bell gives a
  // short shake, and screen readers hear it through the live region below.
  const [ringing, setRinging] = useState(false)
  useEffect(() => {
    if (!latestAlert) return undefined
    setRinging(true)
    const timer = setTimeout(() => setRinging(false), 900)
    return () => clearTimeout(timer)
  }, [latestAlert])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    if (open) {
      document.addEventListener('pointerdown', handleClick)
      document.addEventListener('keydown', handleKey)
    }
    return () => {
      document.removeEventListener('pointerdown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell */}
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread${unreadAlertCount ? `, ${unreadAlertCount} need attention` : ''}` : 'Notifications'}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className={`relative p-2.5 rounded-full transition-colors press ${unreadAlertCount > 0 ? 'bg-red-50 hover:bg-red-100' : 'bg-white/60 hover:bg-white'}`}
      >
        <Bell size={20} className={`${unreadAlertCount > 0 ? 'text-red-600' : 'text-gray-700'} ${ringing ? 'bell-ring' : ''}`} aria-hidden="true" />
        {unreadCount > 0 && (
          // Red while an error or warning is unread; blue for routine updates.
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white ${unreadAlertCount > 0 ? 'bg-red-500' : 'bg-blue-500'}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Reads each new alert aloud for screen-reader users (no visual pop-up). */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {latestAlert ? latestAlert.message : ''}
      </div>

      {/* Dropdown */}
      {open && (
        <div id={panelId} role="dialog" aria-label="Notifications" className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50 popover-enter">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
              <p className="text-[11px] text-gray-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  aria-label="Mark all notifications as read"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  title="Mark all read"
                >
                  <CheckCheck size={14} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  aria-label="Clear all notifications"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center" role="status">
                <Bell size={24} className="mx-auto text-gray-300 mb-2" aria-hidden="true" />
                <p className="text-sm text-gray-400 font-medium">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map((n) => {
                  const Icon = icons[n.type] || icons.info
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                        n.read ? 'bg-white' : n.type === 'error' ? 'bg-red-50/60' : n.type === 'warning' ? 'bg-amber-50/60' : 'bg-blue-50/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors[n.type] || colors.info}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        {n.orderId ? <button
                          type="button"
                          onClick={() => {
                            markNotificationRead(n.id)
                            navigate(canAccessRoute(role, '/orders') ? `/orders/${n.orderId}` : '/delivery')
                            setOpen(false)
                          }}
                          className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <p className="text-sm leading-snug text-gray-800">{n.message}</p>
                          <p className="mt-1 text-[11px] font-semibold text-primary">Open order</p>
                          <p className="mt-1 text-[11px] text-gray-400">{new Date(n.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </button> : <button
                          type="button"
                          onClick={() => markNotificationRead(n.id)}
                          className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                          <p className="text-[11px] text-gray-400 mt-1">{new Date(n.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </button>}
                        {n.action && (
                          <button
                            type="button"
                            onClick={() => { markNotificationRead(n.id); setOpen(false); n.action.onClick() }}
                            className="mt-2 inline-flex min-h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-dark"
                          >
                            {n.action.label}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissNotification(n.id)}
                        aria-label={`Dismiss notification: ${n.message}`}
                        className="shrink-0 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
