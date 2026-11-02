// pages/Forbidden.jsx
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { landingPathFor } from '../lib/permissions'

export default function Forbidden() {
  const navigate = useNavigate()
  const { profile, role, signOut } = useAuth()
  const home = profile && profile.is_active !== false ? landingPathFor(role) : '/forbidden'
  const canGoHome = home !== '/forbidden'

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto p-6">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert size={40} className="text-red-500" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">403</h1>
        <h2 className="text-lg font-bold text-gray-700 mb-2">Access Denied</h2>
        <p className="text-sm text-gray-500 mb-6">
          {canGoHome
            ? "You don't have permission to access this page. Contact your administrator if you think this is a mistake."
            : 'This account has no active role. Ask the shop owner to check it in Team.'}
        </p>
        {canGoHome ? (
          <button
            onClick={() => navigate(home)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <LogOut size={16} /> Sign out
          </button>
        )}
      </div>
    </div>
  )
}
