import { CalendarCheck2, CheckCircle2, Clock3, Route, Truck } from 'lucide-react'
import { formatBusinessDate } from '../lib/businessDate.js'
import { formatDistance } from '../lib/shippingPlan'

function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return null
  const minutes = Math.round(value / 60)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return hours ? `${hours}h ${remainingMinutes}m` : `${minutes} min`
}

export default function ShippingRouteSummary({ distanceKm, transitDays, shipDate, durationSeconds, destination }) {
  const transitLabel = transitDays === 0 ? 'Same-day band' : transitDays === 1 ? '1 day' : 'Up to 2 days'
  const durationLabel = formatDuration(durationSeconds)

  return (
    <section className="shipping-route-summary overflow-hidden rounded-2xl shadow-sm" aria-label="Verified delivery route" aria-live="polite">
      <div className="shipping-route-summary__header flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shipping-route-summary__icon grid h-9 w-9 shrink-0 place-items-center rounded-xl">
            <CheckCircle2 size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h4 className="shipping-route-summary__title text-sm font-semibold">Route verified</h4>
            <p className="shipping-route-summary__muted mt-0.5 truncate text-xs">{destination || 'Selected delivery destination'}</p>
          </div>
        </div>
        <span className="shipping-route-summary__badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold">
          <Route size={13} aria-hidden="true" /> Road estimate
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4">
        <div className="shipping-route-summary__metric rounded-xl border p-3">
          <p className="shipping-route-summary__muted flex items-center gap-1.5 text-[11px] font-medium"><Route size={13} aria-hidden="true" /> Driving distance</p>
          <p className="shipping-route-summary__title mt-1 text-lg font-semibold tracking-tight">{formatDistance(distanceKm)}</p>
        </div>
        <div className="shipping-route-summary__metric rounded-xl border p-3">
          <p className="shipping-route-summary__muted flex items-center gap-1.5 text-[11px] font-medium"><Truck size={13} aria-hidden="true" /> Transit band</p>
          <p className="shipping-route-summary__title mt-1 text-lg font-semibold tracking-tight">{transitLabel}</p>
        </div>
        <div className="shipping-route-summary__metric col-span-2 rounded-xl border p-3 sm:col-span-1">
          <p className="shipping-route-summary__muted flex items-center gap-1.5 text-[11px] font-medium"><CalendarCheck2 size={13} aria-hidden="true" /> Prepare for carrier</p>
          <p className="shipping-route-summary__title mt-1 text-lg font-semibold tracking-tight">{formatBusinessDate(shipDate, 'en-GB') || 'Choose delivery date'}</p>
        </div>
      </div>

      {durationLabel && <p className="shipping-route-summary__muted flex items-center gap-1.5 px-4 pb-3 text-xs sm:px-5">
        <Clock3 size={13} aria-hidden="true" /> Estimated driving time {durationLabel}; actual carrier timing can vary.
      </p>}
    </section>
  )
}
