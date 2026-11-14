import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEffect } from 'react'

function ProtectedRoute() {
  const { user, loading, initialized, verifySession } = useAuth()
  const location = useLocation()

  // Re-check the session in the background when the page changes.
  // verifySession is throttled (every 5 minutes) and clears `user` itself
  // when the session is really gone, which sends the person to sign-in below.
  // It must not swap the page for a spinner: that unmounted the page and
  // mounted it again, loading its data twice on every navigation.
  useEffect(() => {
    if (initialized) void verifySession()
  }, [location.pathname, initialized, verifySession])

  if (loading || !initialized) {
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
