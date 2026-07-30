import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useShopName } from '../hooks/useShopName'

function UpdatePassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const shopName = useShopName()

  // Check if we have a recovery session
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Invalid or expired reset link. Please request a new one.')
      }
    }
    checkSession()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully!')
      setTimeout(() => navigate('/auth/login'), 2000)
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/splash-bg.png')` }}
      />
      <div className="absolute inset-0 bg-white/30" />
      
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-10">
          <h1 className="font-serif text-4xl text-center text-primary mb-8 tracking-wide">
            {shopName}
          </h1>

          <h2 className="text-xl font-semibold text-gray-900 mb-2">Set New Password</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your new password below.</p>

          {message && (
            <div className="mb-4 p-4 rounded-lg bg-primary/10 text-primary text-sm flex items-center gap-2">
              <Check size={18} />
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-light text-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!message}
              className="w-full py-3 rounded-lg bg-teal text-white font-medium flex items-center justify-center gap-2 hover:bg-teal-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating...' : message ? 'Updated!' : 'Update Password'}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default UpdatePassword