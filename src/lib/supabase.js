// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env file.'
  )
}

// ── Remember me ────────────────────────────────────────────────
// The flag itself always lives in localStorage — we need to read it
// on cold start, before any session exists, to know WHERE to look
// for that session.
const REMEMBER_FLAG = 'blossom.remember'
export const REMEMBERED_USERNAME = 'blossom.last-username'

export function isRememberMe() {
  try {
    return localStorage.getItem(REMEMBER_FLAG) === '1'
  } catch {
    return false
  }
}

export function setRememberMe(value) {
  try {
    if (value) localStorage.setItem(REMEMBER_FLAG, '1')
    else localStorage.removeItem(REMEMBER_FLAG)
  } catch {
    /* storage blocked — fall through to session-only behaviour */
  }
}

/**
 * Storage adapter that routes the auth session to localStorage when
 * "Remember me" is on, and sessionStorage when it is off.
 *
 * sessionStorage is cleared when the Electron BrowserWindow closes,
 * so an unchecked box genuinely means "log me out when I quit".
 *
 * setRememberMe() must be called BEFORE signInWithPassword(), so the
 * very first token write already lands in the right bucket.
 */
const hybridStorage = {
  getItem: (key) => {
    try {
      const primary = isRememberMe() ? localStorage : sessionStorage
      // Fall back to the other bucket once, so a session written before
      // the flag flipped is still found instead of silently dropped.
      return primary.getItem(key) ?? sessionStorage.getItem(key) ?? localStorage.getItem(key)
    } catch {
      return null
    }
  },

  setItem: (key, value) => {
    try {
      const remember = isRememberMe()
      // Never leave a stale copy in the other bucket.
      ;(remember ? sessionStorage : localStorage).removeItem(key)
      ;(remember ? localStorage : sessionStorage).setItem(key, value)
    } catch {
      /* noop */
    }
  },

  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      /* noop */
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: hybridStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Left ON: the password-recovery link puts its token in the URL
    // fragment, and UpdatePassword.jsx depends on it being parsed.
    detectSessionInUrl: true,
    // flowType deliberately NOT set — leaving it at the library default
    // keeps your existing ResetPassword/UpdatePassword flow working.
  },
})