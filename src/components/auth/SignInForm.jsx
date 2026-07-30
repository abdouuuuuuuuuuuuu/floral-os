import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  const from = location.state?.from || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await signIn(email, password)
      
      if (error) {
        const errorMap = {
          'Invalid login credentials': 'Email or password is incorrect.',
          'Email not confirmed': 'Please confirm your email first. Check your inbox.',
          'Session validation failed': 'Authentication failed. Please try again.',
        }
        setError(errorMap[error.message] || error.message)
        setLoading(false)
        return
      }

      if (data?.user) {
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError('An unexpected error occurred.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Toggle tabs */}
      <div className="flex gap-2 mb-8">
        <button className="flex-1 py-2.5 rounded-lg bg-teal text-white font-medium text-sm transition-colors">
          Sign in
        </button>
        <Link 
          to="/auth/signup"
          className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium text-sm text-center hover:border-teal hover:text-teal transition-colors"
        >
          Sign up
        </Link>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-1">Log in to your Blossom workspace.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger-light text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••••••••"
              className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link
            to="/auth/reset-password"
            className="text-sm text-teal font-medium hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-teal text-white font-medium flex items-center justify-center gap-2 hover:bg-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying...' : 'Log in'}
          <ArrowRight size={18} />
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        New to Blossom?{' '}
        <Link to="/auth/signup" className="text-teal font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export default SignInForm