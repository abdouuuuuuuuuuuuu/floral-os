import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTeam() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const addMember = async (memberData) => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .insert([memberData])
        .select()
        .single()
      
      if (error) throw error
      setMembers(prev => [data, ...prev])
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const updateMember = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      setMembers(prev => prev.map(m => m.id === id ? data : m))
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const deleteMember = async (id) => {
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      setMembers(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

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
    deleteMember
  }
}