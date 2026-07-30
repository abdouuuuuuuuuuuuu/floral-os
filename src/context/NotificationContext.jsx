import { createContext, useContext, useState, useCallback } from 'react'

const NotificationContext = createContext(null)

// Simple counter for unique IDs
let notificationCounter = 0

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const addNotification = useCallback((message, type = 'info') => {
    notificationCounter += 1
    const id = `${Date.now()}-${notificationCounter}`
    const notification = { id, message, type, read: false, time: new Date() }
    
    setNotifications((prev) => [notification, ...prev])
    setUnreadCount((prev) => prev + 1)

    setTimeout(() => {
      dismissNotification(id)
    }, 4000)
  }, [])

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    setUnreadCount(0)
  }, [])

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, dismissNotification, markAllRead, clearAll }}
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