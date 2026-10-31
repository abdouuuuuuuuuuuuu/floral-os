import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Splash from './pages/Splash'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Receipt from './pages/Receipt'
import Orders from './pages/Orders'
import ArchivedOrders from './pages/ArchivedOrders'
import Delivery from './pages/Delivery'
import Team from './pages/TeamMembers'
import ResetPassword from './pages/ResetPassword'
import UpdatePassword from './pages/UpdatePassword'
import AuthLayout from './components/layout/AuthLayout'
import SignInForm from './components/auth/SignInForm'
import InviteOnly from './pages/InviteOnly'
import Settings from './pages/Settings'
import Customers from './pages/Customers'
import LoyaltyCards from './pages/LoyaltyCards'
import Reports from './pages/Reports'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleGuard from './components/layout/RoleGuard'
import CoffreForte from './pages/CoffreForte'
import ActivityLog from './pages/ActivityLog'
import Suppliers from './pages/Suppliers'
import OrderDetail from './pages/OrderDetail'
import Forbidden from './pages/Forbidden'
import BlossomAssistant from './components/layout/BlossomAssistant'
import OfflineSyncManager from './components/layout/OfflineSyncManager'
import ToastContainer from './components/ui/ToastContainer'
import ErrorBoundary from './components/common/ErrorBoundary'

// Brand splash on launch. Kept short: staff reopen the till after every
// crash, update, or reboot. Keep SPLASH_MS in sync with the splash-progress
// animation in index.css. Password-recovery links skip it so the token in
// the URL is handled straight away.
const SPLASH_MS = 2000
const SPLASH_EXIT_MS = 300
const SKIP_SPLASH_PATHS = ['/auth/update-password', '/auth/reset-password']

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
      <ToastContainer />
      <Routes>
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
          <Route path="/orders/archived" element={<RoleGuard><ArchivedOrders /></RoleGuard>} />
          <Route path="/orders" element={<RoleGuard><Orders /></RoleGuard>} />
          <Route path="/orders/:id" element={<RoleGuard><OrderDetail /></RoleGuard>} />
          <Route path="/delivery" element={<RoleGuard><Delivery /></RoleGuard>} />
          <Route path="/team" element={<RoleGuard><Team /></RoleGuard>} />
          <Route path="/settings" element={<RoleGuard><Settings /></RoleGuard>} />
          <Route path="/customers" element={<RoleGuard><Customers /></RoleGuard>} />
          <Route path="/loyalty-cards" element={<RoleGuard><LoyaltyCards /></RoleGuard>} />
          <Route path="/reports" element={<RoleGuard><Reports /></RoleGuard>} />
          <Route path="/suppliers" element={<RoleGuard><Suppliers /></RoleGuard>} />
          <Route path="/coffre-forte" element={<RoleGuard><CoffreForte /></RoleGuard>} />
          <Route path="/activity" element={<RoleGuard><ActivityLog /></RoleGuard>} />
          {/* Keep old bookmarks working while Quick Sale now lives in the shared cart/checkout flow. */}
          <Route path="/quick-sale" element={<Navigate to="/cart?mode=quick_sale" replace />} />
        </Route>
      </Routes>
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
