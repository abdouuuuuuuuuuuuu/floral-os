// src/components/auth/SignInForm.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, User, Lock, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { REMEMBERED_USERNAME, isRememberMe } from '../../lib/supabase'
import { postLoginPath } from '../../lib/permissions'
import BlossomGlyph from '../brand/BlossomGlyph'

function SignInForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordRef = useRef(null)

  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from || null

  // Prefill from the last remembered sign-in, then jump the cursor
  // straight to the password field. One less keystroke per shift.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_USERNAME)
      if (saved && isRememberMe()) {
        setUsername(saved)
        setRememberMe(true)
        passwordRef.current?.focus()
      }
    } catch {
      /* noop */
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signInError } = await signIn(
        username,
        password,
        rememberMe
      )

      if (signInError) {
        setError(
          signInError.code === 'NETWORK'
            ? 'Cannot reach the server. Check your connection and try again.'
            : signInError.message || 'Username or password is incorrect.'
        )
        setPassword('')
        passwordRef.current?.focus()
        return
      }

      if (data?.user) {
        navigate(postLoginPath(data.profile?.role, from), { replace: true })
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-form-enter">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Welcome back</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.035em] text-[#29213B]">Sign in to Blossom</h2>
        <p className="mt-2 text-sm leading-6 text-[#716A7E]">
          Your shop is ready when you are.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="auth-error mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate aria-busy={loading}>
        {/* Username */}
        <div>
          <label
            htmlFor="username"
            className="mb-2 block text-[13px] font-semibold text-[#494254]"
          >
            Username
          </label>
          <div className="relative">
            <User
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B91A6]"
            />
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              disabled={loading}
              className="auth-input w-full rounded-[14px] border border-[#E7E1EC] bg-[#FBFAFD] py-[15px] pl-11 pr-4 text-sm text-[#29213B] placeholder:text-[#AAA2B2] outline-none transition-all focus:border-[#C76A99] focus:bg-white focus:ring-4 focus:ring-[#C76A99]/10 disabled:bg-gray-50"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-[13px] font-semibold text-[#494254]"
          >
            Password
          </label>
          <div className="relative">
            <Lock
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B91A6]"
            />
            <input
              id="password"
              name="password"
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
              className="auth-input w-full rounded-[14px] border border-[#E7E1EC] bg-[#FBFAFD] py-[15px] pl-11 pr-12 text-sm text-[#29213B] placeholder:text-[#AAA2B2] outline-none transition-all focus:border-[#C76A99] focus:bg-white focus:ring-4 focus:ring-[#C76A99]/10 disabled:bg-gray-50"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="press absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#9B91A6] transition-colors hover:bg-[#F4EEF7] hover:text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
        </div>

        {/* Remember me + forgot */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          <label
            htmlFor="remember"
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <span className="relative flex items-center justify-center">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="h-[18px] w-[18px] rounded-[5px] border border-[#D9D1E0] bg-white
                           transition-all duration-150
                           peer-checked:border-primary peer-checked:bg-primary
                           peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-focus-visible:ring-offset-1
                           group-hover:border-primary/60"
              />
              <Check
                size={12}
                strokeWidth={3.5}
                aria-hidden="true"
                className="absolute text-white opacity-0 scale-50 transition-all duration-150 peer-checked:opacity-100 peer-checked:scale-100"
              />
            </span>
            <span className="text-[13px] text-[#716A7E] transition-colors group-hover:text-primary">
              Keep me signed in
            </span>
          </label>

          <Link
            to="/auth/reset-password"
            className="text-[13px] font-semibold text-primary transition-colors hover:text-accent"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          className="auth-submit group mt-1 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? (
            <>
              <BlossomGlyph title="Signing in" className="auth-loading-glyph" />
              <span>Opening your workspace…</span>
            </>
          ) : (
            <>
              <span>Sign in</span>
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      <p className="mt-7 text-center text-[13px] text-[#716A7E]">
        Need an account?{' '}
        <Link to="/auth/signup" className="font-semibold text-primary transition-colors hover:text-accent">
          Ask your shop owner for an invite
        </Link>
      </p>

      <p className="mt-4 text-center text-xs leading-5 text-[#928A9A]">
        {rememberMe
          ? 'You’ll stay signed in on this computer.'
          : 'You’ll be signed out when you close Blossom.'}
      </p>
    </div>
  )
}

export default SignInForm
