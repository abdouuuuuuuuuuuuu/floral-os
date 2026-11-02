// src/context/ConfirmContext.jsx
//
// Replaces window.confirm().
//
// window.confirm blocks the Electron main thread — the whole app freezes,
// including any in-flight print job or Supabase request. It's also
// unstyleable and, on some Electron versions, renders behind the window.
//
// Usage:
//   const confirm = useConfirm()
//   const ok = await confirm({
//     title: 'Delete this order?',
//     message: 'Order items will be removed too. This cannot be undone.',
//     confirmLabel: 'Delete',
//     danger: true,
//   })
//   if (!ok) return

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)
  const confirmButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  const confirm = useCallback((options) => {
    setDialog({
      title: 'Are you sure?',
      message: '',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      ...(typeof options === 'string' ? { message: options } : options),
    })
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = useCallback((result) => {
    resolver.current?.(result)
    resolver.current = null
    setDialog(null)
    window.requestAnimationFrame(() => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
      previousFocusRef.current = null
    })
  }, [])

  // Keep keyboard focus inside the modal and return it to the opening
  // control when the user closes it.
  useEffect(() => {
    if (!dialog) return
    previousFocusRef.current = document.activeElement
    confirmButtonRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable?.length) {
          e.preventDefault()
          dialogRef.current?.focus()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, close])

  const Icon = dialog?.danger ? AlertTriangle : HelpCircle

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4 scrim-enter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby={dialog.message ? 'confirm-message' : undefined}
          onClick={(e) => e.target === e.currentTarget && close(false)}
        >
          <div ref={dialogRef} tabIndex={-1} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 sheet-enter">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
                dialog.danger ? 'bg-red-50' : 'bg-blue-50'
              }`}
            >
              <Icon size={24} className={dialog.danger ? 'text-red-500' : 'text-blue-500'} />
            </div>

            <h2 id="confirm-title" className="text-lg font-bold text-gray-900 text-center mb-1">
              {dialog.title}
            </h2>

            {dialog.message && (
              <p id="confirm-message" className="text-sm text-gray-500 text-center mb-6 whitespace-pre-line">
                {dialog.message}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                {dialog.cancelLabel}
              </button>
              <button
                type="button"
                ref={confirmButtonRef}
                onClick={() => close(true)}
                className={`flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  dialog.danger
                    ? 'bg-red-500 hover:bg-red-600 focus-visible:ring-red-400'
                    : 'bg-primary hover:bg-primary-dark focus-visible:ring-primary'
                }`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider')
  return context
}
