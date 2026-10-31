// src/context/UndoContext.jsx
//
// Undo instead of "Are you sure?".
//
// A confirm dialog costs a click on every single action and stops
// preventing mistakes within about a week — people learn the shape of
// the button and click through it without reading. It's a tax on the
// 99% of actions that were intentional, paid to protect the 1% that
// weren't, and it doesn't even do that well.
//
// Undo is strictly better: nothing interrupts, and when a mistake does
// happen it's actually recoverable. This is only honest because the
// reversals genuinely exist — void_order, adjust_stock and
// void_supplier_entry all restore stock and money properly.
//
// The one thing this DOESN'T replace: actions that can't be undone.
// Those still deserve a confirm. See ConfirmContext.

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { Undo2, X } from 'lucide-react'

const UndoContext = createContext(null)

const WINDOW_MS = 6000

export function UndoProvider({ children }) {
  const [pending, setPending] = useState(null)
  const pendingRef = useRef(null)
  const timerRef = useRef(null)
  const undoInProgressRef = useRef(false)
  const undoRequestRef = useRef(0)
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoError, setUndoError] = useState('')
  const [remaining, setRemaining] = useState(WINDOW_MS)

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = null
    setPending(null)
    setUndoError('')
    setIsUndoing(false)
    undoInProgressRef.current = false
    undoRequestRef.current += 1
  }, [])

  /**
   * Runs an action immediately and offers a window to reverse it.
   *
   * @param {object}   opts
   * @param {string}   opts.message  what happened, past tense
   * @param {Function} opts.onUndo   reverses it; may be async
   * @param {Function} [opts.onCommit] runs if the window expires
   */
  const offerUndo = useCallback(
    ({ message, onUndo, onCommit }) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null

      // A second action commits the first one instead of silently losing
      // its undo window. Keep the active record in a ref so timers and
      // keyboard handlers always act on the latest operation.
      if (pendingRef.current && !undoInProgressRef.current) {
        pendingRef.current.onCommit?.()
      }

      const next = { message, onUndo, onCommit, at: Date.now() }
      pendingRef.current = next
      setPending(next)
      setUndoError('')
      setIsUndoing(undoInProgressRef.current)
      setRemaining(WINDOW_MS)

      timerRef.current = setTimeout(() => {
        const current = pendingRef.current
        current?.onCommit?.()
        pendingRef.current = null
        setPending(null)
        timerRef.current = null
      }, WINDOW_MS)
    },
    []
  )

  const undo = useCallback(async () => {
    const current = pendingRef.current
    if (!current || undoInProgressRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const requestId = ++undoRequestRef.current
    undoInProgressRef.current = true
    setIsUndoing(true)
    setUndoError('')
    try {
      await current.onUndo?.()
      if (pendingRef.current === current) clear()
    } catch (err) {
      console.error('Undo failed:', err)
      if (pendingRef.current === current) {
        setUndoError(err?.message || 'Undo failed. You can try again.')
        setRemaining(0)
      }
    } finally {
      if (undoRequestRef.current === requestId) {
        undoInProgressRef.current = false
        setIsUndoing(false)
      }
    }
  }, [clear])

  // Countdown for the ring. 100ms is smooth enough and cheap.
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => {
      setRemaining(Math.max(0, WINDOW_MS - (Date.now() - pending.at)))
    }, 100)
    return () => clearInterval(t)
  }, [pending])

  // Ctrl+Z while the window is open. The shortcut people already try.
  useEffect(() => {
    if (!pending) return
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, undo])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const progress = remaining / WINDOW_MS

  return (
    <UndoContext.Provider value={{ offerUndo, undo, dismissUndo: clear, hasPending: Boolean(pending) }}>
      {children}

      {pending && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[75] sheet-enter"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-xl pl-4 pr-2 py-2.5 shadow-2xl max-w-[calc(100vw-1.5rem)]">
            <span className="text-sm">{isUndoing ? 'Undoing…' : undoError || pending.message}</span>

            <button
              onClick={undo}
              disabled={isUndoing}
              aria-busy={isUndoing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 press text-sm font-semibold disabled:opacity-60 disabled:cursor-wait"
            >
              {/* The ring drains, so the window is visible rather than
                  something you have to guess at. */}
              <span className="relative w-4 h-4 shrink-0">
                <svg viewBox="0 0 16 16" className="absolute inset-0 -rotate-90">
                  <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
                  <circle
                    cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5"
                    strokeDasharray={2 * Math.PI * 6.5}
                    strokeDashoffset={2 * Math.PI * 6.5 * (1 - progress)}
                    strokeLinecap="round"
                  />
                </svg>
                {isUndoing
                  ? <span className="absolute inset-0 m-auto w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin" />
                  : <Undo2 size={9} className="absolute inset-0 m-auto" />}
              </span>
              {isUndoing ? 'Working' : undoError ? 'Retry' : 'Undo'}
            </button>

            <button
              onClick={() => {
                pending.onCommit?.()
                clear()
              }}
              disabled={isUndoing}
              aria-label="Dismiss"
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 press disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </UndoContext.Provider>
  )
}

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}
