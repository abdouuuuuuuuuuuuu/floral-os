// src/components/auth/SignUpForm.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 1. Create auth user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }
        }
      })

      if (signUpError) throw signUpError

      // 2. Create team_members record (linked to auth user)
      if (data.user) {
        const { error: memberError } = await supabase
          .from('team_members')
          .insert([{
            email,
            full_name: fullName,
            auth_user_id: data.user.id,
            role: 'admin',        // First user = owner/admin
            is_active: true,
            hire_date: new Date().toISOString().split('T')[0]
          }])

        if (memberError) {
          console.error('Team member insert failed:', memberError)
          // Don't throw here — auth user is already created
          // You may want to show a warning instead
        }
      }

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Toggle tabs */}
      <div className="flex gap-2 mb-8">
        <Link 
          to="/auth/login"
          className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium text-sm text-center hover:border-teal hover:text-teal transition-colors"
        >
          Sign in
        </Link>
        <button className="flex-1 py-2.5 rounded-lg bg-teal text-white font-medium text-sm transition-colors">
          Sign up
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Create account</h2>
        <p className="text-sm text-gray-500 mt-1">Set up your Blossom workspace.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none text-sm"
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
              className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none text-sm"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-teal text-white font-medium flex items-center justify-center gap-2 hover:bg-teal-dark transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create account'}
          <ArrowRight size={18} />
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{' '}
        <Link to="/auth/login" className="text-teal font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default SignUpForm