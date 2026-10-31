// src/components/common/Skeleton.jsx
//
// A spinner says "wait". A skeleton says "here is the shape of what's
// coming" — the eye starts parsing the layout before the data lands, so
// the same delay reads as roughly half as long.
//
// The rule: a skeleton must match the real layout. One that doesn't is
// worse than a spinner, because the page visibly rearranges itself the
// moment content arrives.

export function Bar({ w = 'w-full', h = 'h-4', className = '' }) {
  return <div className={`skeleton ${w} ${h} ${className}`} aria-hidden="true" />
}

export function Circle({ size = 'w-9 h-9' }) {
  return <div className={`skeleton ${size} rounded-full`} aria-hidden="true" />
}

/** Rows in a list — Orders, Products, Customers. */
export function ListSkeleton({ rows = 6, avatar = false }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="panel px-4 py-3.5 flex items-center gap-4"
          // Each row starts a beat later, so the list reads top-to-bottom
          // like it's filling in rather than pulsing as one block.
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {avatar && <Circle size="w-8 h-8" />}
          <Bar w="w-16" h="h-4" />
          <Bar w="w-40" h="h-4" />
          <div className="flex-1" />
          <Bar w="w-20" h="h-4" />
          <Bar w="w-24" h="h-6" className="rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors the dashboard: stat strip, then the order queue and side panels. */
export function DashboardSkeleton({ tiles = 5 }) {
  return (
    <div role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading…</span>

      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Bar w="w-52" h="h-7" />
          <Bar w="w-64" h="h-4" />
        </div>
        <Bar w="w-28" h="h-4" />
      </div>

      <div className={`grid grid-cols-2 gap-3 sm:gap-4 mb-4 ${tiles === 5 ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="panel-flat p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="skeleton w-9 h-9 rounded-xl" />
              <Bar w="w-12" h="h-4" className="rounded-full" />
            </div>
            <Bar w="w-24" h="h-6" />
            <Bar w="w-16" h="h-3" className="mt-2" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4 items-start">
        <div className="col-span-12 lg:col-span-7">
          <PanelSkeleton rows={4} rowHeight="h-16" />
        </div>
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <PanelSkeleton rows={3} rowHeight="h-12" />
          <PanelSkeleton rows={2} rowHeight="h-12" />
        </div>
      </div>
    </div>
  )
}

export function PanelSkeleton({ rows = 3, rowHeight = 'h-12' }) {
  return (
    <div className="panel-flat p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="skeleton w-8 h-8 rounded-lg" />
        <Bar w="w-28" h="h-4" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`skeleton ${rowHeight} w-full rounded-xl`} />
        ))}
      </div>
    </div>
  )
}

export default ListSkeleton
