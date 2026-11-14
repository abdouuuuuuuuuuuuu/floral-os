// src/context/UndoContext.jsx
//
// Undo instead of "Are you sure?".
//
// A confirm dialog costs a click on every single action and stops
// preventing mistakes within about a week — people learn the shape of
// the button and click through it without reading. Undo is better: nothing
// interrupts, and when a mistake does happen it's actually recoverable. This
// is only honest because the reversals genuinely exist — void_order,
// adjust_stock and void_supplier_entry all restore stock and money properly.
//
// The one thing this DOESN'T replace: actions that can't be undone.
// Those still deserve a confirm. See ConfirmContext.
//
// Where it shows: in the notification bell, like every other alert (there are
// no floating bars). Each undoable action posts an alert with an "Undo"
// button that works for UNDO_WINDOW_MS; Ctrl+Z undoes the latest one. Once
// used or expired, the button is removed so nothing is undone twice. Where the
// server has its own limit (undoing a cancellation), it still applies.

import { createContext, useContext, useCallback, useRef, useEffect } from 'react'
import { useNotification } from './NotificationContext'

const UndoContext = createContext(null)

// Long enough to open the bell and press Undo; the bar used to give 6 s.
const UNDO_WINDOW_MS = 2 * 60 * 1000

export function UndoProvider({ children }) {
  const { addNotification, clearNotificationAction } = useNotification()
  // The latest undoable action: { notificationId, message, onUndo, at, state }
  // state: 'open' | 'running' | 'done' | 'expired'
  const latestRef = useRef(null)
  const timersRef = useRef(new Set())

  const runUndo = useCallback(async (record) => {
    if (!record || record.state === 'running' || record.state === 'done') return
    if (record.state === 'expired' || Date.now() - record.at > UNDO_WINDOW_MS) {
      record.state = 'expired'
      clearNotificationAction(record.notificationId)
      addNotification(`Too late to undo: ${record.message}`, 'warning')
      return
    }
    record.state = 'running'
    clearNotificationAction(record.notificationId)
    try {
      // The pages that offer Undo report the result themselves ("… restored",
      // "Cancellation undone…") or show it on screen, so no extra alert here.
      await record.onUndo?.()
      record.state = 'done'
      if (latestRef.current === record) latestRef.current = null
    } catch (err) {
      console.error('Undo failed:', err)
      record.state = 'open'
      addNotification(err?.message || 'Undo failed. You can try again.', 'error', {
        action: { label: 'Try again', onClick: () => { void runUndo(record) } },
      })
    }
  }, [addNotification, clearNotificationAction])

  /**
   * The action has already happened; this offers a way to reverse it.
   *
   * @param {object}   opts
   * @param {string}   opts.message  what happened, past tense
   * @param {Function} opts.onUndo   reverses it; may be async
   * @param {Function} [opts.onCommit] runs when the undo window closes
   */
  const offerUndo = useCallback(({ message, onUndo, onCommit }) => {
    const record = { message, onUndo, at: Date.now(), state: 'open', notificationId: null }
    record.notificationId = addNotification(message, 'success', {
      action: { label: 'Undo', onClick: () => { void runUndo(record) } },
    })
    latestRef.current = record

    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      if (record.state === 'open') {
        record.state = 'expired'
        clearNotificationAction(record.notificationId)
        onCommit?.()
      }
      if (latestRef.current === record) latestRef.current = null
    }, UNDO_WINDOW_MS)
    timersRef.current.add(timer)
  }, [addNotification, clearNotificationAction, runUndo])

  const undo = useCallback(() => runUndo(latestRef.current), [runUndo])

  // Stop offering Undo for the latest action (used when a later step makes
  // reversing it unsafe, e.g. reopening a cancelled order).
  const dismissUndo = useCallback(() => {
    const record = latestRef.current
    if (record && record.state === 'open') {
      record.state = 'expired'
      clearNotificationAction(record.notificationId)
    }
    latestRef.current = null
  }, [clearNotificationAction])

  // Ctrl+Z undoes the latest action while its window is open, unless the
  // person is typing (then Ctrl+Z belongs to the text field).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      const target = e.target
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return
      const record = latestRef.current
      if (!record || record.state !== 'open') return
      e.preventDefault()
      void runUndo(record)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runUndo])

  useEffect(() => {
    const timers = timersRef.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  return (
    <UndoContext.Provider value={{ offerUndo, undo, dismissUndo, hasPending: Boolean(latestRef.current) }}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}
