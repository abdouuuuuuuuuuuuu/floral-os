import { lazy, Suspense, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import animationData from '../../assets/sale-complete.json'

const Lottie = lazy(() => import('lottie-react'))

function StaticSuccessMark({ className }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-emerald-600 ${className}`}>
      <Check className="h-1/2 w-1/2 text-white" strokeWidth={3} />
    </span>
  )
}

export default function OrderSuccessAnimation({ className = 'h-14 w-14' }) {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setReducedMotion(query.matches)
    syncPreference()
    query.addEventListener?.('change', syncPreference)
    return () => query.removeEventListener?.('change', syncPreference)
  }, [])

  if (reducedMotion) return <StaticSuccessMark className={className} />

  return (
    <Suspense fallback={<StaticSuccessMark className={className} />}>
      <Lottie
        animationData={animationData}
        autoplay
        loop={false}
        aria-hidden="true"
        className={`shrink-0 ${className}`}
      />
    </Suspense>
  )
}
