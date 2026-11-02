import { useEffect, useLayoutEffect, useRef } from 'react'
import { Routes, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PageActiveContext } from '../../context/PageActiveContext'

// Main pages people move between all day. Once visited, each stays mounted
// in the background, so returning to it (from a receipt, a customer, another
// section…) shows it exactly as it was: same data, filters, open rows,
// tabs and scroll, with no reload.
//
// Left out on purpose: one-off flows (cart, checkout, receipt, a single
// order's detail page) and the sign-in screens, which should start fresh.
export const KEEP_ALIVE_PATHS = new Set([
  '/dashboard',
  '/products',
  '/orders',
  '/orders/archived',
  '/orders/quick-sales',
  '/delivery',
  '/team',
  '/settings',
  '/customers',
  '/loyalty-cards',
  '/reports',
  '/suppliers',
  '/coffre-forte',
  '/activity',
])

export default function KeepAliveRoutes({ children }) {
  const location = useLocation()
  const { user } = useAuth()
  // pathname → the location that page last saw. Each kept page renders its
  // own <Routes> with its own location, so a hidden page never reacts to
  // another page's URL.
  const keptPages = useRef(new Map())
  const scrollByPath = useRef(new Map())
  const currentPath = useRef(location.pathname)

  // Signing out must drop every kept page, so the next person who signs in
  // never sees the previous user's screens.
  if (!user) keptPages.current.clear()

  const keepCurrent = Boolean(user) && KEEP_ALIVE_PATHS.has(location.pathname)
  if (keepCurrent) keptPages.current.set(location.pathname, location)

  // The window scroll is shared by all pages: remember it per page and put
  // it back when that page is shown again (new pages start at the top).
  useEffect(() => {
    const save = () => { scrollByPath.current.set(currentPath.current, window.scrollY) }
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])
  useLayoutEffect(() => {
    currentPath.current = location.pathname
    const saved = keepCurrent ? scrollByPath.current.get(location.pathname) : 0
    window.scrollTo(0, saved || 0)
  }, [location.pathname, keepCurrent])

  return (
    <>
      {[...keptPages.current].map(([path, pageLocation]) => {
        const active = keepCurrent && path === location.pathname
        return (
          <div key={path} style={active ? undefined : { display: 'none' }} aria-hidden={active ? undefined : true}>
            <PageActiveContext.Provider value={active}>
              <Routes location={pageLocation}>{children}</Routes>
            </PageActiveContext.Provider>
          </div>
        )
      })}
      {!keepCurrent && (
        <PageActiveContext.Provider value>
          <Routes location={location}>{children}</Routes>
        </PageActiveContext.Provider>
      )}
    </>
  )
}
