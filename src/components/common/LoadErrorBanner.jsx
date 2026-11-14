import { AlertTriangle, RefreshCw } from 'lucide-react'
import { friendlyMessage } from '../../lib/friendlyError'

// Shown when a page could not load its data. Without it the page showed an
// empty list (or 0 DA on the register) as if that were real.
// `hasData`: older data is still on screen; say it may be out of date.
export default function LoadErrorBanner({ what, error, onRetry, hasData = false, retrying = false }) {
  if (!error) return null
  const detail = typeof error === 'string' ? error : error?.message
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <span className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <strong className="block font-semibold">
            {hasData ? `Couldn't refresh ${what}. Showing what was loaded before.` : `Couldn't load ${what}. What you see here may be incomplete.`}
          </strong>
          {detail && <span className="mt-0.5 block text-xs text-red-800">{friendlyMessage(detail)}</span>}
        </span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={() => onRetry()}
          disabled={retrying}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
        >
          <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  )
}
