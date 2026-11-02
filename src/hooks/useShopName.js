import { useSyncExternalStore, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_NAME = 'Blossom'

// ── Singleton store ───────────────────────────────────────────
let currentShopName = DEFAULT_NAME
let listeners = new Set()
let realtimeInitialized = false

function emit() {
  listeners.forEach((cb) => cb(currentShopName))
}

function subscribeStore(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot() {
  return currentShopName
}

function initRealtime() {
  if (realtimeInitialized) return
  realtimeInitialized = true

  // 1. Fetch initial value.
  //
  // Goes through the get_shop_name() RPC rather than reading `settings`
  // directly. This hook runs on the login and splash screens, before
  // anyone is signed in, and RLS (correctly) blocks anonymous reads of
  // the settings table — which holds tax rates and contact details.
  // The RPC is SECURITY DEFINER and returns only the name.
  supabase
    .rpc('get_shop_name')
    .then(({ data, error }) => {
      if (error) {
        console.error('fetchShopName error:', error.message)
        return
      }
      if (data && data !== currentShopName) {
        currentShopName = data
        document.title = data
        emit()
      }
    })

  // 2. Subscribe to changes — ONCE
  supabase
    .channel('shop-name-singleton')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'settings',
        filter: `id=eq.${SETTINGS_ID}`,
      },
      (payload) => {
        if (payload.new?.shop_name && payload.new.shop_name !== currentShopName) {
          currentShopName = payload.new.shop_name
          document.title = payload.new.shop_name
          emit()
        }
      }
    )
    .subscribe()
}

// ── Hook ──────────────────────────────────────────────────────
export function useShopName() {
  const shopName = useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot)

  useEffect(() => {
    initRealtime()
  }, [])

  return shopName
}