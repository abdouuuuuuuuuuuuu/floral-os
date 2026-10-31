// src/components/common/SaleComplete.jsx
//
// The moment a sale lands.
//
// This happens a hundred times a day and was a grey toast. It's the one
// beat in a POS worth marking: the bloom opens, the total counts up, a
// few petals fall. Under a second, then it's gone and the next customer
// is served.
//
// The restraint that keeps it from being annoying: it never blocks. No
// dismiss button, no modal, no waiting. The florist can start the next
// sale mid-animation and nothing is in the way.

import { useEffect, useState } from 'react'
import AnimatedFigure from './AnimatedFigure'
import OrderSuccessAnimation from './OrderSuccessAnimation'

export default function SaleComplete({ amount, orderNumber, onDone, duration = 2200 }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), duration - 260)
    const done = setTimeout(() => onDone?.(), duration)
    return () => {
      clearTimeout(out)
      clearTimeout(done)
    }
  }, [duration, onDone])

  return (
    <div
      className={`fixed inset-0 z-[80] pointer-events-none flex items-center justify-center
                  transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      role="status"
      aria-live="polite"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl px-8 py-6 text-center sale-pop">
        <div className="relative w-14 h-14 mx-auto mb-3">
          <OrderSuccessAnimation className="absolute inset-[-10px]" />
        </div>

        <p className="label-section mb-1">Sale complete</p>

        <p className="figure figure-lg text-gray-900">
          <AnimatedFigure value={amount} suffix=" DA" duration={900} bump={false} />
        </p>

        {orderNumber && (
          <p className="text-2xs text-gray-400 mt-1.5">Order #{orderNumber}</p>
        )}
      </div>
    </div>
  )
}
