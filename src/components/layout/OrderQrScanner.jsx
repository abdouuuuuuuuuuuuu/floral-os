import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { parseOrderQrPayload } from '../../lib/orderQr'

// A USB scanner acts as a very fast keyboard, ending each code with Enter or
// Tab. Slower keys reset the buffer, so normal typing is never treated as a scan.
const MAX_KEY_GAP_MS = 80
const MAX_LENGTH = 64

// Physical key positions, read as a US layout. This keeps a scan correct when
// Windows is set to AZERTY but the scanner sends US key positions.
function physicalCharacter(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1)
  if (code === 'Minus' || code === 'NumpadSubtract') return '-'
  return ''
}

// The scanned characters landed in whichever field had focus, so take them back out.
function removeScannedText(element, length) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setValue = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (!setValue || element.value.length < length) return
  setValue.call(element, element.value.slice(0, -length))
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

// Opens the order when its receipt QR code is scanned, from any screen.
export default function OrderQrScanner() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return undefined
    let typed = ''
    let physical = ''
    let lastKeyAt = 0

    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) return
      if (event.key === 'Shift') return

      if (event.key === 'Enter' || event.key === 'Tab') {
        const orderId = parseOrderQrPayload(typed) || parseOrderQrPayload(physical)
        const length = typed.length
        typed = ''
        physical = ''
        if (!orderId) return
        event.preventDefault()
        event.stopPropagation()
        removeScannedText(document.activeElement, length)
        navigate(`/orders/${orderId}`)
        return
      }

      const now = event.timeStamp
      if (now - lastKeyAt > MAX_KEY_GAP_MS) {
        typed = ''
        physical = ''
      }
      lastKeyAt = now
      if (event.key.length !== 1 || typed.length >= MAX_LENGTH) return
      typed += event.key
      physical += physicalCharacter(event.code)
    }

    // Capture phase, so an Enter from a scan can't also submit a form on screen.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [user, navigate])

  return null
}
