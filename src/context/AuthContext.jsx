// src/context/AuthContext.jsx
//
// Single source of truth for identity. Session, profile, and role all
// come from here. hooks/useAuth.js is now a thin re-export of this, so
// there is exactly ONE profile fetch per session instead of one per
// guarded route.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  supabase,
  setRememberMe as persistRememberMe,
  isRememberMe,
  REMEMBERED_USERNAME,
} from '../lib/supabase'
import { clearPrivateSessionData } from '../lib/sessionData'

const AuthContext = createContext(null)

const GENERIC_CREDENTIALS_ERROR = 'Username or password is incorrect.'

// Re-verify at most this often instead of on every navigation.
// Supabase already refreshes tokens in the background.
const REVERIFY_INTERVAL_MS = 5 * 60 * 1000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const lastVerifiedAt = useRef(0)

  // ── Profile ──────────────────────────────────────────────────
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return null
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Could not load profile:', error.message)
      // A failed lookup is not the same as a missing profile. Let callers
      // preserve the authenticated session and retry instead of signing out.
      throw error
    }

    setProfile(data ?? null)
    return data ?? null
  }, [])

  // ── Session verification ─────────────────────────────────────
  const verifySession = useCallback(
    async ({ force = false } = {}) => {
      if (!force && Date.now() - lastVerifiedAt.current < REVERIFY_INTERVAL_MS) {
        return true
      }

      let currentSession = null
      try {
        const { data } = await supabase.auth.getSession()
        currentSession = data?.session ?? null

        if (!currentSession) {
          setSession(null)
          setUser(null)
          setProfile(null)
          return false
        }

        const {
          data: { user: validatedUser },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !validatedUser) {
          // Only revoke local auth state for a definitive token rejection.
          // Network failures and Supabase 5xx responses must not look like
          // a successful sign-out immediately after login.
          const rejectedToken = userError?.status === 400 || userError?.status === 401
          if (rejectedToken) {
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
            setProfile(null)
            lastVerifiedAt.current = 0
            return false
          }

          setSession(currentSession)
          setUser(currentSession.user)
          lastVerifiedAt.current = Date.now()
          return true
        }

        const loaded = await loadProfile(validatedUser.id)

        // A deactivated employee keeps a valid token until it expires.
        // Trust the profile flag, not just the token.
        if (loaded && loaded.is_active === false) {
          await supabase.auth.signOut()
          setSession(null)
          setUser(null)
          setProfile(null)
          return false
        }

        setSession(currentSession)
        setUser(validatedUser)
        lastVerifiedAt.current = Date.now()
        return true
      } catch (error) {
        console.warn('Session verification failed; preserving the current login:', error)
        if (currentSession) {
          setSession(currentSession)
          setUser(currentSession.user)
          lastVerifiedAt.current = Date.now()
          return true
        }
        // A failed check is not proof that the session was revoked. Keep
        // existing in-memory auth state; a later visibility check retries.
        return false
      }
    },
    [loadProfile]
  )

  // ── Bootstrap ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    ;(async () => {
      await verifySession({ force: true })
      if (mounted) {
        setLoading(false)
        setInitialized(true)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession)
        setUser(newSession.user)
        lastVerifiedAt.current = Date.now()
        // Do not await Supabase requests from inside its auth callback; that
        // can hold the auth lock while the profile request waits on the same
        // client. Schedule profile hydration after the callback returns.
        Promise.resolve().then(() => {
          if (mounted) return loadProfile(newSession.user.id)
          return null
        }).catch((error) => console.warn('Could not hydrate signed-in profile:', error))
      } else if (event === 'SIGNED_OUT') {
        clearPrivateSessionData()
        setSession(null)
        setUser(null)
        setProfile(null)
        lastVerifiedAt.current = 0
      } else if (event === 'TOKEN_REFRESHED' && newSession) {
        setSession(newSession)
      }
    })

    // Re-check when the till wakes from sleep.
    const onVisible = () => {
      // Supabase's autoRefreshToken handles wake-up refresh. A normal
      // verification is throttled and avoids racing its in-flight refresh.
      if (document.visibilityState === 'visible') verifySession()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [verifySession, loadProfile])

  // ── Username → email ─────────────────────────────────────────
  const resolveIdentifier = useCallback(async (identifier) => {
    const value = (identifier || '').trim()
    if (!value) return null
    if (value.includes('@')) return value

    const { data, error } = await supabase.rpc('email_for_username', {
      p_username: value,
    })

    if (error) {
      const err = new Error('Cannot reach the server. Check your connection.')
      err.code = 'NETWORK'
      throw err
    }

    return data || null
  }, [])

  // ── Sign in ──────────────────────────────────────────────────
  const signIn = async (identifier, password, rememberMe = false) => {
    setLoading(true)
    persistRememberMe(rememberMe) // must precede signInWithPassword
    let authenticatedSession = null

    try {
      const email = await resolveIdentifier(identifier)
      if (!email) throw new Error(GENERIC_CREDENTIALS_ERROR)

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        throw error.message === 'Invalid login credentials'
          ? new Error(GENERIC_CREDENTIALS_ERROR)
          : error
      }

      // signInWithPassword already returns the authenticated user and session.
      // Avoid a second auth request here: a transient getUser/network failure
      // used to sign out a session that Supabase had just accepted.
      const validatedUser = data?.user
      if (!data?.session || !validatedUser) {
        throw new Error('Could not establish your session. Try again.')
      }
      authenticatedSession = data.session

      // Reflect the valid Supabase session immediately. Loading a profile is
      // an authorization/setup step; a profile lookup failure must not erase
      // a session Supabase has already accepted.
      setSession(data.session)
      setUser(validatedUser)
      lastVerifiedAt.current = Date.now()

      let loadedProfile
      try {
        loadedProfile = await loadProfile(validatedUser.id)
      } catch {
        const profileError = new Error('You are signed in, but your profile could not be loaded. Check your connection and try again.')
        profileError.code = 'PROFILE_LOOKUP_FAILED'
        throw profileError
      }

      if (!loadedProfile) {
        const profileError = new Error('You are signed in, but this account has no profile yet. Ask an owner to set it up.')
        profileError.code = 'PROFILE_MISSING'
        throw profileError
      }

      if (loadedProfile.is_active === false) {
        await supabase.auth.signOut()
        authenticatedSession = null
        throw new Error('This account has been deactivated.')
      }

      try {
        if (rememberMe) localStorage.setItem(REMEMBERED_USERNAME, identifier.trim())
        else localStorage.removeItem(REMEMBERED_USERNAME)
      } catch {
        /* noop */
      }

      setProfile(loadedProfile)
      lastVerifiedAt.current = Date.now()

      return {
        data: { ...data, user: validatedUser, profile: loadedProfile },
        error: null,
      }
    } catch (err) {
      if (authenticatedSession) {
        // Keep the real auth state when profile loading failed. The sign-in
        // screen shows the actionable error and lets the user retry.
        setSession(authenticatedSession)
        setUser(authenticatedSession.user)
      } else {
        setSession(null)
        setUser(null)
        setProfile(null)
      }
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    clearPrivateSessionData()
    setSession(null)
    setUser(null)
    setProfile(null)
    lastVerifiedAt.current = 0
    setLoading(false)
    return { error }
  }

  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user?.id])

  const role = profile?.role ?? null

  const value = {
    user,
    session,
    profile,
    role,
    loading,
    initialized,
    rememberMe: isRememberMe(),
    isOwner: role === 'owner',
    isManager: role === 'owner' || role === 'manager',
    hasRole: (...roles) => roles.includes(role),
    signIn,
    signOut,
    verifySession,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
