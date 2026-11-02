import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'

function ProtectedRoute() {
  const { user, loading, initialized, verifySession } = useAuth()
  const location = useLocation()
  const [verifying, setVerifying] = useState(false)

  // Re-verify session on every route change — industry standard
  useEffect(() => {
    if (initialized && !verifying) {
      setVerifying(true)
      verifySession().finally(() => setVerifying(false))
    }
  }, [location.pathname, initialized])

  if (loading || !initialized || verifying) {
    return (
      <div className="min-h-screen bg-sage flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export default ProtectedRoute
