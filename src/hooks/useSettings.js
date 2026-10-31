// src/hooks/useSettings.js
//
// Changes:
//  * update with an insert fallback. The old version used plain update
//    and errored on .single() if the row was ever missing; a straight
//    upsert doesn't work either, because it triggers the INSERT policy
//    check on every save and settings has no INSERT policy.
//  * sets updated_at, which existed in the table and was never written.
//  * dropped currency and email_notifications. Both saved fine and were
//    then ignored: "DA" is hardcoded in ten files, and there is no email
//    code anywhere in the app. A setting that does nothing is worse than
//    no setting.
//  * tax_rate is not handled — the shop does not charge tax.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

const DEFAULT_SETTINGS = {
  shop_name: 'Blossom',
  shop_phone: '',
  shop_address: '',
  shop_location_name: '',
  shop_location_wilaya: '',
  shop_latitude: null,
  shop_longitude: null,
  routing_service_url: '',
  shop_email: '',
  open_time: '08:00',
  close_time: '18:00',
  low_stock_alert: true,
  new_order_sound: true,
  daily_target: 35000,
  usd_exchange_rate: 250,
}

// Only these are written. Anything else in the row is left alone.
const WRITABLE = [
  'shop_name', 'shop_phone', 'shop_address', 'shop_email',
  'shop_location_name', 'shop_location_wilaya', 'shop_latitude', 'shop_longitude', 'routing_service_url',
  'open_time', 'close_time', 'low_stock_alert', 'new_order_sound',
  'daily_target',
  'usd_exchange_rate',
]

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle()

    if (fetchError) {
      console.error('Error fetching settings:', fetchError)
      setError('Could not load settings.')
    } else if (data) {
      setSettings({ ...DEFAULT_SETTINGS, ...data, usd_exchange_rate: data.usd_exchange_rate ?? 250 })
    }
    // No row yet is fine — the first save creates it.

    setLoading(false)
  }, [])

  const updateSettings = useCallback(async (updates) => {
    setSaving(true)
    setError(null)

    // Whitelist, so a stray key can't try to write a column that
    // doesn't exist and fail the whole save.
    const payload = { id: SETTINGS_ID, updated_at: new Date().toISOString() }
    for (const key of WRITABLE) {
      if (key in updates) payload[key] = updates[key]
    }

    // update, not upsert.
    //
    // upsert issues INSERT ... ON CONFLICT, so Postgres checks the
    // INSERT policy even when the row already exists — and settings has
    // no INSERT policy, so every save was denied with 42501. The row is
    // created once and lives forever, so update is the right verb; the
    // insert below is a cold-start fallback only.
    let { data, error: saveError } = await supabase
      .from('settings')
      .update(payload)
      .eq('id', SETTINGS_ID)
      .select()
      .maybeSingle()

    // No row matched — first run. Try to create it.
    if (!saveError && !data) {
      const created = await supabase
        .from('settings')
        .insert(payload)
        .select()
        .single()
      data = created.data
      saveError = created.error
    }

    if (saveError) {
      console.error('Error updating settings:', saveError)

      const denied =
        saveError.code === '42501' ||
        saveError.message?.includes('row-level security')

      const message = denied
        ? 'You do not have permission to change settings.'
        : `Could not save settings: ${saveError.message}`

      setError(message)
      setSaving(false)
      return { success: false, error: message }
    }

    setSettings((prev) => ({ ...prev, ...data }))
    setSaving(false)
    return { success: true, data }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  return { settings, loading, saving, error, refresh: fetchSettings, updateSettings }
}
