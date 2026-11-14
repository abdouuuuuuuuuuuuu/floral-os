import { useEffect, useRef } from 'react'
import { usePageActive } from '../context/PageActiveContext'

// Pages people move between stay mounted in the background (KeepAliveRoutes),
// so a page that loads its data once kept showing it unchanged until the app
// restarted: stock from before today's sales, old customer balances, missing
// new entries. This reloads the page's data each time it comes back on screen.
// `refresh` is called with { quiet: true }, so the list stays on screen (no
// loading skeleton, scroll kept) while it updates.
export function useRefreshWhenShown(refresh) {
  const active = usePageActive()
  const wasActive = useRef(active)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (active && !wasActive.current) void refreshRef.current?.({ quiet: true })
    wasActive.current = active
  }, [active])
}
