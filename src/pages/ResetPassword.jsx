import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useShopName } from '../hooks/useShopName'

function ResetPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const shopName = useShopName()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Password reset link sent! Check your email inbox.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('./splash-bg.png')` }}
      />
      <div className="absolute inset-0 bg-white/30" />
      
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-10">
          <h1 className="font-serif text-4xl text-center text-primary mb-8 tracking-wide">
            {shopName}
          </h1>

          <Link
            to="/auth/login"
            className="flex items-center gap-2 text-primary font-medium mb-6 hover:underline"
          >
            <ArrowLeft size={18} />
            Back to login
          </Link>

          <h2 className="text-xl font-semibold text-gray-900 mb-2">Reset Password</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send you a reset link.</p>

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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || message}
              className="w-full py-3 rounded-lg bg-teal text-white font-medium hover:bg-teal-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : message ? 'Email sent' : 'Send reset link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword