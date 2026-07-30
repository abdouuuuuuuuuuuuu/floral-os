import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // Verify session against Supabase — hits the database
  const verifySession = useCallback(async () => {
    try {
      // getSession reads from localStorage + validates with server
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !currentSession) {
        setSession(null)
        setUser(null)
        return false
      }

      // getUser validates the JWT token with Supabase server (database hit)
      const { data: { user: validatedUser }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !validatedUser) {
        // Token invalid or expired — clear everything
        await supabase.auth.signOut()
        setSession(null)
        setUser(null)
        return false
      }
      
      setSession(currentSession)
      setUser(validatedUser)
      return true
    } catch (err) {
      console.error('Session verification failed:', err)
      setSession(null)
      setUser(null)
      return false
    }
  }, [])

  // Initialize auth on app load
  useEffect(() => {
    let mounted = true
    
    const initAuth = async () => {
      await verifySession()
      if (mounted) {
        setLoading(false)
        setInitialized(true)
      }
    }
    
    initAuth()

    // Listen for auth changes from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return
      
      if (event === 'SIGNED_IN' && newSession) {
        // Validate the new session immediately
        const { data: { user: validatedUser } } = await supabase.auth.getUser()
        setSession(newSession)
        setUser(validatedUser)
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
      } else if (event === 'TOKEN_REFRESHED' && newSession) {
        setSession(newSession)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [verifySession])

  // Sign in — validates credentials + immediately updates state
  const signIn = async (email, password) => {
    setLoading(true)
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) throw error
      
      // CRITICAL: Validate session with getUser() — hits Supabase database
      const { data: { user: validatedUser }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !validatedUser) {
        await supabase.auth.signOut()
        throw new Error('Session validation failed. Please try again.')
      }
      
      setSession(data.session)
      setUser(validatedUser)
      
      return { data: { ...data, user: validatedUser }, error: null }
    } catch (err) {
      setSession(null)
      setUser(null)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })
    return { data, error }
  }

  const signOut = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setLoading(false)
    return { error }
  }

  const value = {
    user,
    session,
    loading,
    initialized,
    signIn,
    signUp,
    signOut,
    verifySession,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}