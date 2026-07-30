import { HashRouter, Routes, Route } from 'react-router-dom'  // ← Changed from BrowserRouter
import ToastContainer from './components/ui/ToastContainer'
import Splash from './pages/Splash'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Receipt from './pages/Receipt'
import Orders from './pages/Orders'
import Delivery from './pages/Delivery'
import Team from './pages/TeamMembers'
import ResetPassword from './pages/ResetPassword'
import UpdatePassword from './pages/UpdatePassword'
import AuthLayout from './components/layout/AuthLayout'
import SignInForm from './components/auth/SignInForm'
import SignUpForm from './components/auth/SignUpForm'
import Settings from './pages/Settings'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleGuard from './components/layout/RoleGuard'
import CoffreForte from './pages/CoffreForte'
import QuickSale from './pages/QuickSale'
import Suppliers from './pages/Suppliers'
import OrderDetail from './pages/OrderDetail'
import Forbidden from './pages/Forbidden'

function App() {
  return (
    <HashRouter>  {/* ← Was BrowserRouter. HashRouter works with file:// protocol */}
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Splash />} />
        
        <Route element={<AuthLayout />}>
          <Route path="/auth/login" element={<SignInForm />} />
          <Route path="/auth/signup" element={<SignUpForm />} />
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
          <Route path="/orders" element={<RoleGuard><Orders /></RoleGuard>} />
          <Route path="/orders/:id" element={<RoleGuard><OrderDetail /></RoleGuard>} />
          <Route path="/delivery" element={<RoleGuard><Delivery /></RoleGuard>} />
          <Route path="/team" element={<RoleGuard><Team /></RoleGuard>} />
          <Route path="/settings" element={<RoleGuard><Settings /></RoleGuard>} />
          <Route path="/customers" element={<RoleGuard><Customers /></RoleGuard>} />
          <Route path="/reports" element={<RoleGuard><Reports /></RoleGuard>} />
          <Route path="/suppliers" element={<RoleGuard><Suppliers /></RoleGuard>} />
          <Route path="/coffre-forte" element={<RoleGuard><CoffreForte /></RoleGuard>} />
          <Route path="/quick-sale" element={<RoleGuard><QuickSale /></RoleGuard>} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App