import { useState, useEffect } from 'react'
import { Save, Store, Clock, Percent, Bell, Shield, Palette, Mail } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useNotification } from '../context/NotificationContext'
import { useSettings } from '../hooks/useSettings'

function Settings() {
  const { addNotification } = useNotification()
  const { settings, loading, saving, updateSettings } = useSettings()

  // Local form state
  const [shopName, setShopName] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopEmail, setShopEmail] = useState('')
  const [openTime, setOpenTime] = useState('08:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [currency, setCurrency] = useState('DA')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [lowStockAlert, setLowStockAlert] = useState(true)
  const [newOrderSound, setNewOrderSound] = useState(true)
  const [dailyTarget, setDailyTarget] = useState(56000)

  // Sync local state when settings load from DB
  useEffect(() => {
    if (!loading && settings) {
      setShopName(settings.shop_name || '')
      setShopPhone(settings.shop_phone || '')
      setShopAddress(settings.shop_address || '')
      setShopEmail(settings.shop_email || '')
      setOpenTime(settings.open_time || '08:00')
      setCloseTime(settings.close_time || '18:00')
      setCurrency(settings.currency || 'DA')
      setEmailNotifications(settings.email_notifications ?? true)
      setLowStockAlert(settings.low_stock_alert ?? true)
      setNewOrderSound(settings.new_order_sound ?? true)
      setDailyTarget(settings.daily_target || 56000)
    }
  }, [loading, settings])

  const handleSave = async (e) => {
    e.preventDefault()

    const updates = {
      shop_name: shopName,
      shop_phone: shopPhone,
      shop_address: shopAddress,
      shop_email: shopEmail,
      open_time: openTime,
      close_time: closeTime,
      currency: currency,
      email_notifications: emailNotifications,
      low_stock_alert: lowStockAlert,
      new_order_sound: newOrderSound,
      daily_target: dailyTarget,
    }

    const result = await updateSettings(updates)

    if (result.success) {
      addNotification('Settings saved successfully!', 'success')
    } else {
      addNotification(`Failed to save settings: ${result.error}`, 'error')
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
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Palette size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Regional Settings</h2>
                <p className="text-sm text-gray-500">Currency and localization</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm appearance-none bg-white"
              >
                <option value="DA">Algerian Dinar (DA)</option>
                <option value="USD">US Dollar ($)</option>
                <option value="EUR">Euro (€)</option>
                <option value="GBP">British Pound (£)</option>
              </select>
            </div>
          </div>

          {/* Daily Target */}
          <div className="bg-cream rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Percent size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Sales Target</h2>
                <p className="text-sm text-gray-500">Daily revenue goal for the dashboard</p>
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
                  <div className="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center">
                    <Mail size={16} className="text-teal" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email Notifications</p>
                    <p className="text-xs text-gray-500">Receive daily summary emails</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-teal focus:ring-teal"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg hover:bg-white/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <Store size={16} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Low Stock Alerts</p>
                    <p className="text-xs text-gray-500">Warn when inventory is running low</p>
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
                    <p className="text-xs text-gray-500">Play a sound when order comes in</p>
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