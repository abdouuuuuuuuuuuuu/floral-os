// src/context/NotificationContext.jsx
//
// Every alert goes to the bell (NotificationPanel). There are no floating
// pop-ups: they covered the screen and interrupted the cashier. The bell's
// badge turns red while an error or warning is unread, and the bell gives a
// short shake when a new alert arrives, so nothing important is missed.
//
//   notifications — in-session alerts (newest first).
//   orderNotifications — durable order alerts from the database.
//
// `toasts` and `dismissToast` stay in the API (always empty / no-op) so older
// call sites keep working.

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyMessage } from '../lib/friendlyError'

const NotificationContext = createContext(null)

const MAX_HISTORY = 50
const NO_TOASTS = []

let counter = 0

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [orderNotifications, setOrderNotifications] = useState([])
  // Bumped on every new alert; the bell watches it to shake and to announce.
  const [latestAlert, setLatestAlert] = useState(null)
  const recentAlertsRef = useRef(new Map())
  const [authUserId, setAuthUserId] = useState(null)

  const authUserRef = useRef(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null
      if (authUserRef.current !== nextUserId) {
        authUserRef.current = nextUserId
        setNotifications([])
        setOrderNotifications([])
        setLatestAlert(null)
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
      }, () => {
        if (!active) return
        // Order updates land in the bell (and its unread badge) silently.
        // They must not pop a toast: those fire from other people's routine
        // activity and interrupt the cashier at seemingly random moments.
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

  // Kept for older call sites; there are no toasts any more.
  const dismissToast = useCallback(() => {}, [])

  /**
   * Adds an alert to the bell.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {{ action?: { label: string, onClick: () => void } }} options
   *   action: an optional button shown on the alert in the bell
   *   (e.g. "Restart now" for an update). Older options (toast, history,
   *   duration) are accepted and ignored.
   */
  const addNotification = useCallback(
    (rawMessage, type = 'info', options = {}) => {
      // Problems are shown in plain words; the technical original goes to the
      // log file (blossom.log) so it can still be diagnosed.
      let message = rawMessage
      if (type === 'error' || type === 'warning') {
        message = friendlyMessage(rawMessage)
        if (message !== String(rawMessage ?? '').trim()) console.warn('[alert] original error:', rawMessage)
      }
      // Collapse bursts of the same message (e.g. a retry loop): within
      // 1.5 s, the same type + text returns the id of the alert already shown.
      const key = `${type}|${message}`
      const recent = recentAlertsRef.current.get(key)
      if (recent && Date.now() - recent.at < 1500) return recent.id

      counter += 1
      const id = `${Date.now()}-${counter}`
      recentAlertsRef.current.set(key, { id, at: Date.now() })
      if (recentAlertsRef.current.size > 100) recentAlertsRef.current.clear()

      const entry = { id, message, type, read: false, time: new Date(), action: options.action || null }
      setNotifications((prev) => [entry, ...prev].slice(0, MAX_HISTORY))
      setLatestAlert({ id, message, type, at: Date.now() })
      return id
    },
    []
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

  // Removes the button from an alert once it no longer applies (an Undo that
  // was used or has expired), so it cannot be pressed twice.
  const clearNotificationAction = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => n.id === id && n.action ? { ...n, action: null } : n))
  }, [])

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
    if (authUserRef.current) {
      void supabase.from('order_notifications').delete().eq('recipient_id', authUserRef.current)
    }
  }, [])

  const mergedNotifications = [...notifications, ...orderNotifications]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  const unreadCount = mergedNotifications.filter((n) => !n.read).length
  // Unread problems turn the bell badge red.
  const unreadAlertCount = mergedNotifications.filter((n) => !n.read && (n.type === 'error' || n.type === 'warning')).length

  return (
    <NotificationContext.Provider
      value={{
        notifications: mergedNotifications,
        toasts: NO_TOASTS,
        unreadCount,
        unreadAlertCount,
        latestAlert,
        addNotification,
        dismissToast,
        dismissNotification,
        clearNotificationAction,
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
