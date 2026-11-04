import { useState, useEffect } from 'react'
import { Save, Store, Clock, Bell, Target, AlertTriangle } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useNotification } from '../context/NotificationContext'
import { useSettings } from '../hooks/useSettings'
import { printThermalReceipt } from '../utils/printThermal'
import AlgerianPlaceSearch from '../components/AlgerianPlaceSearch'

function Settings() {
  const { addNotification } = useNotification()
  const { settings, loading, saving, error, updateSettings } = useSettings()

  // Local form state
  const [shopName, setShopName] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopLocationQuery, setShopLocationQuery] = useState('')
  const [shopLocationName, setShopLocationName] = useState('')
  const [shopLocationWilaya, setShopLocationWilaya] = useState('')
  const [shopLatitude, setShopLatitude] = useState(null)
  const [shopLongitude, setShopLongitude] = useState(null)
  const [routingServiceUrl, setRoutingServiceUrl] = useState('')
  const [selectedShopPlace, setSelectedShopPlace] = useState(null)
  const [shopEmail, setShopEmail] = useState('')
  const [openTime, setOpenTime] = useState('08:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [lowStockAlert, setLowStockAlert] = useState(true)
  const [newOrderSound, setNewOrderSound] = useState(true)
  const [dailyTarget, setDailyTarget] = useState(56000)
  const [usdExchangeRate, setUsdExchangeRate] = useState('250')

  // Sync local state when settings load from DB
  useEffect(() => {
    if (!loading && settings) {
      setShopName(settings.shop_name || '')
      setShopPhone(settings.shop_phone || '')
      setShopAddress(settings.shop_address || '')
      setShopLocationName(settings.shop_location_name || '')
      setShopLocationQuery(settings.shop_location_name || settings.shop_address || '')
      setShopLocationWilaya(settings.shop_location_wilaya || '')
      setShopLatitude(settings.shop_latitude ?? null)
      setShopLongitude(settings.shop_longitude ?? null)
      setRoutingServiceUrl(settings.routing_service_url || '')
      setSelectedShopPlace(settings.shop_latitude != null && settings.shop_longitude != null ? {
        label: settings.shop_location_name || settings.shop_address || 'Saved shop location',
        wilaya: settings.shop_location_wilaya || '',
        latitude: Number(settings.shop_latitude),
        longitude: Number(settings.shop_longitude),
      } : null)
      setShopEmail(settings.shop_email || '')
      setOpenTime(settings.open_time || '08:00')
      setCloseTime(settings.close_time || '18:00')
      setLowStockAlert(settings.low_stock_alert ?? true)
      setNewOrderSound(settings.new_order_sound ?? true)
      setDailyTarget(settings.daily_target || 56000)
      setUsdExchangeRate(settings.usd_exchange_rate == null ? '250' : String(settings.usd_exchange_rate))
    }
  }, [loading, settings])

  const handleSave = async (e) => {
    e.preventDefault()

    if (!Number.isFinite(Number(usdExchangeRate)) || Number(usdExchangeRate) <= 0) {
      addNotification('USDT exchange rate must be a positive DA-per-USDT value.', 'error')
      return
    }

    const updates = {
      shop_name: shopName,
      shop_phone: shopPhone,
      shop_address: shopAddress,
      shop_location_name: shopLocationName,
      shop_location_wilaya: shopLocationWilaya,
      shop_latitude: shopLatitude,
      shop_longitude: shopLongitude,
      routing_service_url: routingServiceUrl.trim(),
      shop_email: shopEmail,
      open_time: openTime,
      close_time: closeTime,
      low_stock_alert: lowStockAlert,
      new_order_sound: newOrderSound,
      daily_target: dailyTarget,
      usd_exchange_rate: Number(usdExchangeRate),
    }

    const result = await updateSettings(updates)

    if (result.success) {
      addNotification('Settings saved', 'success')
    } else {
      addNotification(result.error, 'error')
    }
  }

  const handleTestPrint = async () => {
    try {
      const safeShopName = String(shopName || 'Blossom').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char])
      const result = await printThermalReceipt(
        `<div class="center brand">${safeShopName}</div><div class="center sub">Printer test</div><div class="divider"></div><div class="row"><span>Status</span><span>Ready to test</span></div><div class="footer">If this receipt is readable, printer setup is ready.</div>`,
        'Blossom Printer Test',
        '/logo-Black.png'
      )
      addNotification(
        result ? 'Test receipt sent to the printer. If a print window opened, choose the receipt printer.' : 'Could not open the print dialog. Check the printer connection and try again.',
        result ? 'info' : 'error'
      )
    } catch (error) {
      console.error('Printer test failed:', error)
      addNotification('Could not prepare the test receipt. Check the printer connection and try again.', 'error')
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif text-primary">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your shop preferences and business info</p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Shop Information */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Store size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Shop Information</h2>
                <p className="text-sm text-gray-500">Your business details</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Shop Name</label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  placeholder="05xx xx xx xx"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                <input
                  type="text"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  placeholder="123 Flower Street, City"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={shopEmail}
                  onChange={(e) => setShopEmail(e.target.value)}
                  placeholder="shop@floralos.com"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Shipping distance planning */}
          <div className="bg-cream rounded-xl p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Shipping distance planning</h2>
                <p className="mt-1 max-w-3xl text-sm text-gray-500">The shop location is shared by all staff and remains the origin for every road estimate. Dispatch timing uses your 80 km and 600 km distance bands.</p>
              </div>
              {routingServiceUrl.trim()
                ? <span className="pill pill-success">Route service configured</span>
                : <span className="pill pill-warning">Route service setup required</span>}
            </div>
            <div className="space-y-5">
              <AlgerianPlaceSearch
                label="Shop town / commune"
                allowAddressSearch
                query={shopLocationQuery}
                onQueryChange={(value) => { setShopLocationQuery(value); setShopLocationName(value); setSelectedShopPlace(null); setShopLatitude(null); setShopLongitude(null) }}
                selectedPlace={selectedShopPlace}
                onSelect={(place) => {
                  setSelectedShopPlace(place)
                  setShopLocationQuery(place.displayName || place.label)
                  setShopLocationName(place.displayName || place.label)
                  setShopLocationWilaya(place.wilaya || '')
                  setShopLatitude(place.latitude)
                  setShopLongitude(place.longitude)
                }}
                hint="Search the exact boutique address or town and select its map point. This shared location is used for every delivery route. Never enter a customer address here."
              />
              {shopLocationWilaya && <p className="-mt-4 text-xs text-gray-500">Wilaya: {shopLocationWilaya}</p>}
              <div>
                <label htmlFor="routing-service-url" className="mb-1.5 block text-sm font-medium text-gray-700">Driving-route service base URL</label>
                <input
                  id="routing-service-url"
                  type="url"
                  value={routingServiceUrl}
                  onChange={(event) => setRoutingServiceUrl(event.target.value)}
                  placeholder="https://your-router.example"
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <p className="mt-1.5 text-xs text-gray-500">Enter only the public HTTPS base URL, without <code>/route/v1/driving</code> or a trailing route path. A Cloudflare Quick Tunnel URL changes when its tunnel restarts; update and save this URL whenever it changes. Keep API credentials in the Supabase function secret, never in this field. When blank, orders stay in route follow-up instead of using a guessed distance.</p>
              </div>
              {(!selectedShopPlace || !routingServiceUrl.trim()) && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Dispatch dates need both a selected shop town and a configured route service.</p>}
            </div>
          </div>

          {/* Business Hours */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Business Hours</h2>
                <p className="text-sm text-gray-500">When your shop is open</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Open Time</label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Close Time</label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Regional Settings */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">$</div>
              <div>
                <h2 className="font-semibold text-gray-900">USDT cash conversion</h2>
                <p className="text-sm text-gray-500">DA remains the order currency. USDT tender is converted at this rate.</p>
              </div>
            </div>
            <label htmlFor="usd-exchange-rate" className="block text-sm font-medium text-gray-700 mb-1.5">DA per 1 USDT</label>
            <input
              id="usd-exchange-rate"
              type="number"
              required
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={usdExchangeRate}
              onChange={(e) => setUsdExchangeRate(e.target.value)}
              placeholder="250"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">Current rate: 1 USDT = 250 DA. Change it here when your shop’s rate changes.</p>
          </div>

          {/* Printer setup */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Receipt printer</h2>
                <p className="mt-1 text-sm text-gray-500">Use the system print dialog to select or change the connected printer, then print a test receipt.</p>
              </div>
              <button type="button" onClick={handleTestPrint} className="btn btn-secondary shrink-0">
                Print test receipt
              </button>
            </div>
          </div>

          {/* Regional Settings */}
          {/* Daily Target */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Target size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Daily Collection Target</h2>
                <p className="text-sm text-gray-500">Daily payment target based on money received</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Daily Target (DA)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
              />
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Notifications</h2>
                <p className="text-sm text-gray-500">Choose what alerts you receive</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-lg hover:bg-white/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <AlertTriangle size={16} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Low Stock Alerts</p>
                    <p className="text-xs text-gray-500">Show a warning on the dashboard when stock drops below a product’s threshold</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={lowStockAlert}
                  onChange={(e) => setLowStockAlert(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-teal focus:ring-teal"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg hover:bg-white/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bell size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">New Order Sound</p>
                    <p className="text-xs text-gray-500">Chime on this computer when a new order is created</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newOrderSound}
                  onChange={(e) => setNewOrderSound(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-teal focus:ring-teal"
                />
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Saving...' : 'Save Changes'}
              <Save size={18} />
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}

export default Settings
