import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import { parseOrderScan } from '../../lib/orderBarcode'
import { announceCardScan, parseCardCode, scanReadings } from '../../lib/scanDecode'
import { supabase } from '../../lib/supabase'

// A USB scanner acts as a very fast keyboard, ending each code with Enter or
// Tab. Slower keys reset the buffer, so normal typing is never treated as a scan.
const MAX_KEY_GAP_MS = 80
const MAX_LENGTH = 64

// The scanned characters landed in whichever field had focus, so take them back out.
function removeScannedText(element, length) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setValue = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (!setValue || element.value.length < length) return
  setValue.call(element, element.value.slice(0, -length))
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function firstMatch(readings, parse) {
  for (const reading of readings) {
    const result = parse(reading)
    if (result) return result
  }
  return null
}

// Handles receipt barcodes and loyalty cards from any screen, in any keyboard language.
export default function OrderQrScanner() {
  const { user } = useAuth()
  const { addNotification } = useNotification()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return undefined
    let keys = []
    let lastKeyAt = 0

    const openOrder = async ({ orderId, orderNumber }) => {
      if (orderId) {
        navigate(`/orders/${orderId}`)
        return
      }
      const { data, error } = await supabase.from('orders')
        .select('id')
        .ilike('order_number', orderNumber)
        .limit(1)
        .maybeSingle()
      if (error) addNotification(`Could not look up order #${orderNumber}. Check the connection and try again.`, 'error')
      else if (!data) addNotification(`Order #${orderNumber} was not found.`, 'error')
      else navigate(`/orders/${data.id}`)
    }

    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) return
      if (event.key === 'Shift') return

      if (event.key === 'Enter' || event.key === 'Tab') {
        const scanned = keys
        keys = []
        if (!scanned.length) return
        const readings = scanReadings(scanned)
        const order = firstMatch(readings, parseOrderScan)
        const card = order ? null : firstMatch(readings, parseCardCode)
        if (!order && !card) return
        event.preventDefault()
        event.stopPropagation()
        removeScannedText(document.activeElement, scanned.length)
        if (order) void openOrder(order)
        else announceCardScan(card)
        return
      }

      if (event.timeStamp - lastKeyAt > MAX_KEY_GAP_MS) keys = []
      lastKeyAt = event.timeStamp
      if (keys.length >= MAX_LENGTH) return
      keys.push({ key: event.key, code: event.code, shift: event.shiftKey })
    }

    // Capture phase, so an Enter from a scan can't also submit a form on screen.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [user, navigate, addNotification])

  return null
}
