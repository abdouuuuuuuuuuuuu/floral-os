// src/hooks/useCountUp.js
//
// Numbers that arrive rather than appear.
//
// A figure that snaps from 41 350 to 48 900 is a value changing. One
// that counts up is money coming in — the eye follows it, and you
// register the direction before you've read the digits. In a POS, where
// the numbers ARE the interface, that's the difference between a
// dashboard you check and one you watch.
//
// Deliberately NOT applied to inputs, prices being edited, or anything
// the user is actively controlling — animating those makes them feel
// laggy rather than alive.

import { useState, useEffect, useRef } from 'react'

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * @param {number} target      the value to reach
 * @param {number} duration    ms; scaled down for small changes
 * @returns {number}           the current animated value
 */
export function useCountUp(target, duration = 650) {
  const safeTarget = Number(target) || 0
  const [value, setValue] = useState(safeTarget)
  const fromRef = useRef(safeTarget)
  const frameRef = useRef(null)

  useEffect(() => {
    if (REDUCED) {
      setValue(safeTarget)
      fromRef.current = safeTarget
      return
    }

    const from = fromRef.current
    const delta = safeTarget - from

    if (delta === 0) return

    // A 2% change shouldn't take as long as a 200% one — otherwise small
    // updates feel sluggish and large ones feel abrupt.
    const magnitude = Math.min(1, Math.abs(delta) / Math.max(Math.abs(from), 1))
    const ms = Math.max(220, duration * (0.4 + magnitude * 0.6))

    const start = performance.now()

    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      // Same asymmetric curve as the rest of the app: fast, then settle.
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + delta * eased)

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = safeTarget
        setValue(safeTarget)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      // Land on the target if interrupted, so an unmount mid-count
      // doesn't leave the next mount starting from a partial value.
      fromRef.current = safeTarget
    }
  }, [safeTarget, duration])

  return value
}

export default useCountUp