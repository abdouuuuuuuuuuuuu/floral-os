const PRIVATE_PREFIXES = ['blossom.cart:', 'blossom.quick-cart:', 'starredProducts:', 'reports_cache:']
const LEGACY_KEYS = ['blossom.cart', 'blossom.quick-cart', 'starredProducts']

// Clear workstation-local data when a worker signs out. Keep the saved
// sign-in identifier and Supabase's own auth storage intact.
export function clearPrivateSessionData() {
  for (const storageName of ['sessionStorage', 'localStorage']) {
    try {
      const storage = window[storageName]
      const keys = []
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key && (LEGACY_KEYS.includes(key) || PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix)))) {
          keys.push(key)
        }
      }
      keys.forEach((key) => storage.removeItem(key))
    } catch {
      // Storage can be disabled by the browser; in-memory state still clears.
    }
  }
}
