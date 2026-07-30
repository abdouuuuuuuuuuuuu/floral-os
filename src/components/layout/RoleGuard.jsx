import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Loader2 } from 'lucide-react'

const routePermissions = {
  '/dashboard': ['owner', 'manager', 'florist', 'cashier', 'delivery'],
  '/products': ['owner', 'manager', 'florist'],
  '/cart': ['owner', 'manager', 'florist', 'cashier'],
  '/checkout': ['owner', 'manager', 'florist', 'cashier'],
  '/orders': ['owner', 'manager', 'florist', 'cashier', 'delivery'],
  '/orders/receipt': ['owner', 'manager', 'florist', 'cashier', 'delivery'],
  '/delivery': ['owner', 'manager', 'delivery'],
  '/team': ['owner', 'manager'],
  '/settings': ['owner', 'manager'],
  '/customers': ['owner', 'manager', 'florist', 'cashier'],
  '/reports': ['owner', 'manager'],
  '/suppliers': ['owner', 'manager'],
  '/coffre-forte': ['owner', 'manager', 'cashier'],
  '/quick-sale': ['owner', 'manager', 'florist', 'cashier'],
}

export default function RoleGuard({ children }) {
  const { profile, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/auth/login" replace />
  }

  const currentPath = location.pathname
  const allowedRoles = routePermissions[currentPath]

  if (!allowedRoles) {
    return children
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/forbidden" replace />
  }

  return children
}