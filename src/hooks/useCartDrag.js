// src/hooks/useCartDrag.js
//
// Drag and drop for the cart, on pointer events so it works with the mouse,
// a touch screen and a pen, with no library:
//
//   - drag a catalog card into the cart to add it where it is dropped
//   - drag a cart line by its handle to reorder the cart
//   - drop a catalog card on the mobile "Review cart" bar to add it last
//
// A press that moves less than the threshold is still an ordinary click, so
// tapping a card keeps adding one unit as before. The drop target is found
// with elementFromPoint, so the same code serves the desktop panel and the
// mobile sheet. Escape cancels a drag.

import { useCallback, useEffect, useRef, useState } from 'react'

export const CART_DROP_ZONE_ATTR = 'data-cart-drop-zone'
export const CART_LINE_ATTR = 'data-cart-line'

const PRODUCT_THRESHOLD_PX = 7
const LINE_THRESHOLD_PX = 3
const EDGE_SCROLL_PX = 44
const EDGE_SCROLL_STEP = 14

function zoneAt(x, y) {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest?.(`[${CART_DROP_ZONE_ATTR}]`)
  if (!zone) return null
  return { element: zone, kind: zone.getAttribute(CART_DROP_ZONE_ATTR) }
}

/** Index a dropped line takes: before the first line whose middle is below the pointer. */
function insertIndexAt(zoneElement, y) {
  const lines = zoneElement.querySelectorAll(`[${CART_LINE_ATTR}]`)
  for (let index = 0; index < lines.length; index += 1) {
    const rect = lines[index].getBoundingClientRect()
    if (y < rect.top + rect.height / 2) return index
  }
  return lines.length
}

function edgeScroll(zoneElement, y) {
  const rect = zoneElement.getBoundingClientRect()
  if (y < rect.top + EDGE_SCROLL_PX) zoneElement.scrollTop -= EDGE_SCROLL_STEP
  else if (y > rect.bottom - EDGE_SCROLL_PX) zoneElement.scrollTop += EDGE_SCROLL_STEP
}

export function useCartDrag({ itemCount, onDropProduct, onReorder }) {
  // Render state: null when idle. Only changes when something visible changes.
  const [drag, setDrag] = useState(null)
  // Pointer bookkeeping lives in a ref so moves do not re-render the page.
  const sessionRef = useRef(null)
  const ghostRef = useRef(null)
  const suppressClickRef = useRef(false)
  const itemCountRef = useRef(itemCount)
  itemCountRef.current = itemCount

  const positionGhost = useCallback((x, y) => {
    const node = ghostRef.current
    if (node) node.style.transform = `translate3d(${x + 14}px, ${y + 10}px, 0) rotate(-2deg)`
  }, [])

  const track = useCallback((session, x, y) => {
    positionGhost(x, y)
    const zone = zoneAt(x, y)
    const kind = zone?.kind || null
    let overIndex = null
    if (kind === 'list') {
      edgeScroll(zone.element, y)
      overIndex = insertIndexAt(zone.element, y)
    } else if (kind === 'bar') {
      overIndex = itemCountRef.current
    }
    if (session.overZone !== kind || session.overIndex !== overIndex) {
      session.overZone = kind
      session.overIndex = overIndex
      setDrag((previous) => (previous ? { ...previous, overZone: kind, overIndex } : previous))
    }
  }, [positionGhost])

  const finish = useCallback((commit) => {
    const session = sessionRef.current
    sessionRef.current = null
    if (!session?.active) return
    document.body.classList.remove('cart-dragging')
    setDrag(null)
    if (!commit || session.overZone == null) return
    if (session.kind === 'product') {
      onDropProduct(session.product, session.overIndex)
      return
    }
    let target = session.overIndex
    if (target > session.fromIndex) target -= 1
    if (target !== session.fromIndex) onReorder(session.itemId, target)
  }, [onDropProduct, onReorder])

  useEffect(() => {
    if (!drag) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') finish(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('cart-dragging')
    }
  }, [drag, finish])

  const begin = useCallback((event, session) => {
    if (event.button != null && event.button !== 0) return
    suppressClickRef.current = false
    // Capture from the press so the release always reaches this element,
    // even when the pointer leaves it before the drag threshold is crossed.
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is a nicety */ }
    sessionRef.current = {
      ...session,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      overZone: null,
      overIndex: null,
    }
  }, [])

  const onPointerMove = useCallback((event) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    // The button was released somewhere this element never heard about.
    if (event.buttons === 0) { finish(false); return }
    if (!session.active) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
      if (distance < (session.kind === 'line' ? LINE_THRESHOLD_PX : PRODUCT_THRESHOLD_PX)) return
      session.active = true
      suppressClickRef.current = true
      document.body.classList.add('cart-dragging')
      setDrag({
        kind: session.kind,
        product: session.product || null,
        itemId: session.itemId ?? null,
        fromIndex: session.fromIndex ?? null,
        overZone: null,
        overIndex: null,
        x: event.clientX,
        y: event.clientY,
      })
    }
    event.preventDefault()
    track(session, event.clientX, event.clientY)
  }, [finish, track])

  const onPointerUp = useCallback((event) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    if (!session.active) { sessionRef.current = null; return }
    track(session, event.clientX, event.clientY)
    finish(true)
  }, [finish, track])

  const onPointerCancel = useCallback(() => finish(false), [finish])

  /** Spread on a catalog card. The card's own onClick keeps working for taps. */
  const productHandleProps = useCallback((product) => ({
    onPointerDown: (event) => begin(event, { kind: 'product', product }),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }), [begin, onPointerCancel, onPointerMove, onPointerUp])

  /** Spread on a cart line's grip handle. */
  const lineHandleProps = useCallback((item, index) => ({
    onPointerDown: (event) => begin(event, { kind: 'line', itemId: item.id, product: item, fromIndex: index }),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    style: { touchAction: 'none' },
  }), [begin, onPointerCancel, onPointerMove, onPointerUp])

  /** True once per drag: the click that follows a drag must not add a unit. */
  const consumeSuppressedClick = useCallback(() => {
    const suppressed = suppressClickRef.current
    suppressClickRef.current = false
    return suppressed
  }, [])

  return { drag, ghostRef, productHandleProps, lineHandleProps, consumeSuppressedClick }
}
