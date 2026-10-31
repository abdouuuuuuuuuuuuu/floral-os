// src/context/NotificationContext.jsx
//
// Two lists, not one.
//
//   toasts        — transient FIFO queue. Up to four are visible at once.
//   notifications — in-session history. Durable order alerts come from the DB.
//
// Previously there was a single array capped at 50, which meant mounting
// ToastContainer would have rendered 50 stacked toasts that never went
// away. One addNotification() call now feeds both lists.

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const NotificationContext = createContext(null)

const MAX_TOAST_QUEUE = 50
const MAX_HISTORY = 50

const DEFAULT_DURATION = {
  success: 3000,
  info: 4000,
  warning: 6000,
  error: 0, // 0 = sticky. An error the cashier didn't read is an error
            // they'll hit again.
}

let counter = 0

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [orderNotifications, setOrderNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const [authUserId, setAuthUserId] = useState(null)

  const authUserRef = useRef(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null
      if (authUserRef.current !== nextUserId) {
        authUserRef.current = nextUserId
        setNotifications([])
        setOrderNotifications([])
        setToasts([])
      }
      setAuthUserId(nextUserId)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authUserId) return undefined
    let active = true
    let reloadTimer
    const loadOrderNotifications = async () => {
      const { data, error } = await supabase
        .from('order_notifications')
        .select('id, created_at, read_at, order_events!inner(order_id, order_number, summary, actor_name)')
        .eq('recipient_id', authUserId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!active) return
      if (error) {
        console.error('Could not load order notifications:', error.message)
        return
      }
      setOrderNotifications((data || []).map((row) => {
        const event = row.order_events
        return {
          id: `order-${row.id}`,
          dbId: row.id,
          orderId: event.order_id,
          orderNumber: event.order_number,
          message: `Order #${event.order_number} updated${event.actor_name ? ` by ${event.actor_name}` : ''}: ${event.summary}`,
          type: 'info',
          read: Boolean(row.read_at),
          time: new Date(row.created_at),
        }
      }))
    }
    void loadOrderNotifications()
    const channel = supabase
      .channel(`order-notifications-${authUserId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_notifications', filter: `recipient_id=eq.${authUserId}`,
      }, (payload) => {
        if (!active) return
        const row = payload.new
        const eventId = row.order_event_id
        void supabase.from('order_events')
          .select('order_number, summary, actor_name')
          .eq('id', eventId)
          .maybeSingle()
          .then(({ data }) => {
            if (active && data) addNotification(`Order #${data.order_number} updated${data.actor_name ? ` by ${data.actor_name}` : ''}: ${data.summary}`, 'info', { history: false })
          })
        clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => { if (active) void loadOrderNotifications() }, 250)
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void loadOrderNotifications() })
    return () => {
      active = false
      clearTimeout(reloadTimer)
      void supabase.removeChannel(channel)
    }
  }, [authUserId])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /**
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {{ toast?: boolean, history?: boolean, duration?: number }} options
   *   toast: false → history only, no popup. Use for background events
   *   the cashier doesn't need interrupting for.
   *   history: false → toast only, without adding another bell entry.
   */
  const addNotification = useCallback(
    (message, type = 'info', options = {}) => {
      counter += 1
      const id = `${Date.now()}-${counter}`
      const duration = options.duration ?? DEFAULT_DURATION[type] ?? 4000
      const entry = { id, message, type, read: false, time: new Date(), duration }

      if (options.history !== false) {
        setNotifications((prev) => {
          const duplicate = prev.some((notification) => notification.type === type && notification.message === message && Date.now() - new Date(notification.time).getTime() < 1500)
          return duplicate ? prev : [entry, ...prev].slice(0, MAX_HISTORY)
        })
      }

      if (options.toast === false) return id

      setToasts((prev) => {
        // Collapse bursts of identical messages while keeping the original
        // toast visible and its dismissal timer intact.
        const duplicate = prev.some((toast) => toast.type === type && toast.message === message && Date.now() - new Date(toast.time).getTime() < 1500)
        if (duplicate) return prev

        const next = [...prev, entry]
        if (next.length <= MAX_TOAST_QUEUE) return next

        // Never let a success/info burst evict an unread error toast.
        const expendableIndex = next.findIndex((toast) => toast.type !== 'error')
        if (expendableIndex >= 0) next.splice(expendableIndex, 1)
        else next.pop()
        return next
      })

      return id
    },
    [dismissToast]
  )

  const dismissNotification = useCallback(
    (id) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      const persistent = orderNotifications.find((n) => n.id === id)
      if (persistent) {
        setOrderNotifications((prev) => prev.filter((n) => n.id !== id))
        void supabase.from('order_notifications').delete().eq('id', persistent.dbId)
      }
      dismissToast(id)
    },
    [dismissToast, orderNotifications]
  )

  const markNotificationRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    const persistent = orderNotifications.find((n) => n.id === id)
    if (persistent && !persistent.read) {
      const readAt = new Date().toISOString()
      setOrderNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
      void supabase.from('order_notifications').update({ read_at: readAt }).eq('id', persistent.dbId)
    }
  }, [orderNotifications])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    const readAt = new Date().toISOString()
    setOrderNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    if (authUserRef.current) {
      void supabase.from('order_notifications').update({ read_at: readAt })
        .eq('recipient_id', authUserRef.current).is('read_at', null)
    }
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    setOrderNotifications([])
    setToasts([])
    if (authUserRef.current) {
      void supabase.from('order_notifications').delete().eq('recipient_id', authUserRef.current)
    }
  }, [])

  const mergedNotifications = [...notifications, ...orderNotifications]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  const unreadCount = mergedNotifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications: mergedNotifications,
        toasts,
        unreadCount,
        addNotification,
        dismissToast,
        dismissNotification,
        markNotificationRead,
        markAllRead,
        clearAll,
        // Convenience wrappers — shorter at the call site.
        notifySuccess: (m, o) => addNotification(m, 'success', o),
        notifyError: (m, o) => addNotification(m, 'error', o),
        notifyWarning: (m, o) => addNotification(m, 'warning', o),
        notifyInfo: (m, o) => addNotification(m, 'info', o),
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}
