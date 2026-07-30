import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_SETTINGS = {
  shop_name: 'FLORAL OS',
  shop_phone: '',
  shop_address: '',
  shop_email: '',
  open_time: '08:00',
  close_time: '18:00',
  currency: 'DA',
  email_notifications: true,
  low_stock_alert: true,
  new_order_sound: true,
  daily_target: 56000,
}

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .single()

    if (error) {
      console.error('Error fetching settings:', error)
      setError(error.message)
    } else if (data) {
      setSettings({ ...DEFAULT_SETTINGS, ...data })
    }

    setLoading(false)
  }, [])

  const updateSettings = useCallback(async (updates) => {
    setSaving(true)
    setError(null)

    const { data, error } = await supabase
      .from('settings')
      .update(updates)
      .eq('id', SETTINGS_ID)
      .select()
      .single()

    if (error) {
      console.error('Error updating settings:', error)
      setError(error.message)
      setSaving(false)
      return { success: false, error: error.message }
    }

    setSettings((prev) => ({ ...prev, ...data }))
    setSaving(false)
    return { success: true, data }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  return {
    settings,
    loading,
    saving,
    error,
    refresh: fetchSettings,
    updateSettings,
  }
}