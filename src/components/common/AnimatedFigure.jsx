// src/components/common/AnimatedFigure.jsx
import { useEffect, useRef, useState } from 'react'
import { useCountUp } from '../../hooks/useCountUp'

/**
 * A number that counts to its new value and gives a small bump on
 * arrival.
 *
 * Tabular numerals are essential here — without them the digits change
 * width as they tick and the whole figure jitters sideways.
 */
export default function AnimatedFigure({
  value,
  suffix = '',
  prefix = '',
  className = '',
  duration = 650,
  bump = true,
}) {
  const animated = useCountUp(value, duration)
  const [bumping, setBumping] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (!bump) return
    if (prev.current === value) return
    prev.current = value

    setBumping(true)
    const t = setTimeout(() => setBumping(false), 400)
    return () => clearTimeout(t)
  }, [value, bump])

  return (
    <span
      className={`inline-block tabular ${bumping ? 'figure-bump' : ''} ${className}`}
      // The live value for screen readers, not the intermediate ticks —
      // otherwise the count-up is read out digit by digit.
      aria-label={`${prefix}${Math.round(value).toLocaleString('fr-FR')}${suffix}`}
    >
      {prefix}
      {Math.round(animated).toLocaleString('fr-FR')}
      {suffix}
    </span>
  )
}