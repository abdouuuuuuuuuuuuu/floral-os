// src/hooks/useTeam.js
//
// Reads and writes `profiles` — the single identity table.
// The returned shape is unchanged, so TeamMembers.jsx needs no edits.
//
// Note: creation does NOT happen here. Creating an auth user requires
// the service role key, so it goes through the create-team-member Edge
// Function. See AddMemberModal.jsx.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getFunctionErrorMessage } from '../lib/functionError'

const MEMBER_FIELDS =
  'id, full_name, email, username, phone, role, is_active, avatar_url, hire_date, notes, created_at, created_by'

export function useTeam() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(MEMBER_FIELDS)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setMembers(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Creates a staff account via the Edge Function.
   * @returns {Promise<object>} the new profile row
   */
  const addMember = async (memberData) => {
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'create-team-member',
        { body: memberData }
      )

      // supabase-js surfaces a non-2xx as FunctionsHttpError and puts the
      // JSON body on context — dig it out so the user sees the real reason
      // instead of "Edge Function returned a non-2xx status code".
      if (fnError) {
        let message = fnError.message
        try {
          const body = await fnError.context?.json()
          if (body?.error) message = body.error
        } catch {
          /* keep the generic message */
        }
        throw new Error(message)
      }

      if (data?.error) throw new Error(data.error)

      const created = data.profile
      setMembers((prev) => [created, ...prev])
      return created
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const updateMember = async (id, updates) => {
    setError(null)
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select(MEMBER_FIELDS)
        .single()

      if (updateError) throw updateError
      setMembers((prev) => prev.map((m) => (m.id === id ? data : m)))
      return data
    } catch (err) {
      // The DB trigger blocks role escalation. Translate it to plain words.
      const message = err.message?.includes('Only an owner can change a role')
        ? 'Only an owner can change someone’s role.'
        : err.message?.includes('last owner')
          ? 'You can’t remove the last owner.'
          : err.message
      setError(message)
      throw new Error(message)
    }
  }

  /**
   * Sets a member's password via the reset-member-password Edge Function.
   *
   * There is no client-side route to this: supabase.auth.updateUser()
   * only ever changes the CALLER's own password, and the admin API needs
   * the service role key, which must never reach the browser.
   *
   * @param {string} memberId  profiles.id (same as the auth user id)
   * @param {string} password  at least 8 characters
   */
  const resetPassword = async (memberId, password) => {
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'reset-member-password',
        { body: { user_id: memberId, password } }
      )

      if (fnError) {
        let message = fnError.message
        try {
          const body = await fnError.context?.json()
          if (body?.error) message = body.error
        } catch {
          /* keep the generic message */
        }
        throw new Error(message)
      }

      if (data?.error) throw new Error(data.error)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  /**
   * Deactivates rather than deletes.
   *
   * A hard delete would orphan every order, cash movement, and audit
   * entry that points at this person — you would lose the answer to
   * "who rang up this sale". Deactivating revokes access and keeps
   * the history intact.
   */
  // Goes through the set-member-status Edge Function so the person's sign-in
  // is blocked too. Flipping profiles.is_active alone left the account able
  // to sign in through the Supabase API.
  const setMemberActive = async (id, isActive) => {
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'set-member-status',
        { body: { user_id: id, is_active: isActive } }
      )
      if (fnError) throw new Error(await getFunctionErrorMessage(fnError, 'Could not change this member’s access.'))
      if (data?.error) throw new Error(data.error)

      const updated = data.profile
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)))
      return updated
    } catch (err) {
      const message = err.message?.includes('last active owner')
        ? 'You can’t remove the last owner.'
        : err.message
      setError(message)
      throw new Error(message)
    }
  }

  const deactivateMember = async (id) => setMemberActive(id, false)

  const reactivateMember = async (id) => setMemberActive(id, true)

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  return {
    members,
    loading,
    error,
    fetchMembers,
    refresh: fetchMembers,
    addMember,
    updateMember,
    resetPassword,
    deactivateMember,
    reactivateMember,
    // Kept so existing TeamMembers.jsx call sites keep working —
    // but it deactivates, it does not delete.
    deleteMember: deactivateMember,
  }
}