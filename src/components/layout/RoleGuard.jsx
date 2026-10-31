// src/components/layout/RoleGuard.jsx
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { allowedRolesForPath } from '../../lib/permissions'

export default function RoleGuard({ children }) {
  const { profile, role, loading, initialized } = useAuth()
  const location = useLocation()

  if (loading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
        <span className="sr-only">Checking your access…</span>
      </div>
    )
  }

  // No profile means the account exists in auth but has no role. Sending
  // them to /auth/login while ProtectedRoute sees a valid session is how
  // you get an infinite redirect. Send them somewhere terminal instead.
  if (!profile) return <Navigate to="/forbidden" replace />
  if (profile.is_active === false) return <Navigate to="/forbidden" replace />

  const allowed = allowedRolesForPath(location.pathname)

  // Unknown route: deny. An unlisted page should not be open to everyone.
  if (!allowed) return <Navigate to="/forbidden" replace />
  if (!allowed.includes(role)) return <Navigate to="/forbidden" replace />

  return children
}
