import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, Route, Navigate, useLocation } from 'react-router-dom'
import KeepAliveRoutes from './components/layout/KeepAliveRoutes'
import Splash from './pages/Splash'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Receipt from './pages/Receipt'
import Orders from './pages/Orders'
const ArchivedOrders = lazy(() => import('./pages/ArchivedOrders'))
const QuickSalesHistory = lazy(() => import('./pages/QuickSalesHistory'))
const Delivery = lazy(() => import('./pages/Delivery'))
const Team = lazy(() => import('./pages/TeamMembers'))
import ResetPassword from './pages/ResetPassword'
import UpdatePassword from './pages/UpdatePassword'
import AuthLayout from './components/layout/AuthLayout'
import SignInForm from './components/auth/SignInForm'
import InviteOnly from './pages/InviteOnly'
const Settings = lazy(() => import('./pages/Settings'))
const Customers = lazy(() => import('./pages/Customers'))
const LoyaltyCards = lazy(() => import('./pages/LoyaltyCards'))
const Reports = lazy(() => import('./pages/Reports'))
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleGuard from './components/layout/RoleGuard'
const CoffreForte = lazy(() => import('./pages/CoffreForte'))
const ActivityLog = lazy(() => import('./pages/ActivityLog'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
import OrderDetail from './pages/OrderDetail'
import Forbidden from './pages/Forbidden'
import BlossomAssistant from './components/layout/BlossomAssistant'
import OfflineSyncManager from './components/layout/OfflineSyncManager'
import OrderQrScanner from './components/layout/OrderQrScanner'
import ErrorBoundary from './components/common/ErrorBoundary'
import UpdateNotice from './components/layout/UpdateNotice'

// Brand splash on launch. Kept short: staff reopen the till after every
// crash, update, or reboot. Keep SPLASH_MS in sync with the splash-progress
// animation in index.css. Password-recovery links skip it so the token in
// the URL is handled straight away.
const SPLASH_MS = 2000
const SPLASH_EXIT_MS = 300
const SKIP_SPLASH_PATHS = ['/auth/update-password', '/auth/reset-password']

// Pages used less often load on first visit instead of at startup, which
// keeps the main bundle smaller. Once loaded they stay loaded.
function Lazy({ children }) {
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen flex items-center justify-center" role="status">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <span className="sr-only">Loading…</span>
        </div>
      )}
    >
      {children}
    </Suspense>
  )
}

function StartupGate({ children }) {
  const location = useLocation()
  const [ready, setReady] = useState(() => SKIP_SPLASH_PATHS.includes(location.pathname))
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (ready) return undefined
    const exitTimer = window.setTimeout(() => setExiting(true), SPLASH_MS - SPLASH_EXIT_MS)
    const readyTimer = window.setTimeout(() => setReady(true), SPLASH_MS)
    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(readyTimer)
    }
  }, [ready])

  return ready ? children : <Splash isExiting={exiting} />
}

function AppRoutes() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <BlossomAssistant />
      <OfflineSyncManager />
      <OrderQrScanner />
      <UpdateNotice />
      <KeepAliveRoutes>
        <Route path="/" element={<Navigate to="/auth/login" replace />} />

        <Route element={<AuthLayout />}>
          <Route path="/auth/login" element={<SignInForm />} />
          <Route path="/auth/signup" element={<InviteOnly />} />
        </Route>

        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/auth/update-password" element={<UpdatePassword />} />

        <Route path="/forbidden" element={<Forbidden />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<RoleGuard><Dashboard /></RoleGuard>} />
          <Route path="/products" element={<RoleGuard><Products /></RoleGuard>} />
          <Route path="/cart" element={<RoleGuard><Cart /></RoleGuard>} />
          <Route path="/checkout" element={<RoleGuard><Checkout /></RoleGuard>} />
          <Route path="/orders/receipt" element={<RoleGuard><Receipt /></RoleGuard>} />
          <Route path="/orders/archived" element={<RoleGuard><Lazy><ArchivedOrders /></Lazy></RoleGuard>} />
          <Route path="/orders/quick-sales" element={<RoleGuard><Lazy><QuickSalesHistory /></Lazy></RoleGuard>} />
          <Route path="/orders" element={<RoleGuard><Orders /></RoleGuard>} />
          <Route path="/orders/:id" element={<RoleGuard><OrderDetail /></RoleGuard>} />
          <Route path="/delivery" element={<RoleGuard><Lazy><Delivery /></Lazy></RoleGuard>} />
          <Route path="/team" element={<RoleGuard><Lazy><Team /></Lazy></RoleGuard>} />
          <Route path="/settings" element={<RoleGuard><Lazy><Settings /></Lazy></RoleGuard>} />
          <Route path="/customers" element={<RoleGuard><Lazy><Customers /></Lazy></RoleGuard>} />
          <Route path="/loyalty-cards" element={<RoleGuard><Lazy><LoyaltyCards /></Lazy></RoleGuard>} />
          <Route path="/reports" element={<RoleGuard><Lazy><Reports /></Lazy></RoleGuard>} />
          <Route path="/suppliers" element={<RoleGuard><Lazy><Suppliers /></Lazy></RoleGuard>} />
          <Route path="/coffre-forte" element={<RoleGuard><Lazy><CoffreForte /></Lazy></RoleGuard>} />
          <Route path="/activity" element={<RoleGuard><Lazy><ActivityLog /></Lazy></RoleGuard>} />
          {/* Keep old bookmarks working while Quick Sale now lives in the shared cart/checkout flow. */}
          <Route path="/quick-sale" element={<Navigate to="/cart?mode=quick_sale" replace />} />
        </Route>
      </KeepAliveRoutes>
    </ErrorBoundary>
  )
}

function App() {
  return (
    <HashRouter>
      <StartupGate>
        <AppRoutes />
      </StartupGate>
    </HashRouter>
  )
}

export default App
