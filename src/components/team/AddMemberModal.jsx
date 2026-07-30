import { useState } from 'react'
import { X, Crown, Briefcase, Flower2, DollarSign, MapPin, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const roleConfig = {
  owner: { label: 'Owner', icon: Crown, color: 'bg-emerald-600 text-white', border: 'border-emerald-600' },
  manager: { label: 'Manager', icon: Briefcase, color: 'bg-accent text-white', border: 'border-accent' },
  florist: { label: 'Florist', icon: Flower2, color: 'bg-teal text-white', border: 'border-teal' },
  cashier: { label: 'Cashier', icon: DollarSign, color: 'bg-amber-500 text-white', border: 'border-amber-500' },
  delivery: { label: 'Delivery', icon: MapPin, color: 'bg-blue-500 text-white', border: 'border-blue-500' },
}

export default function AddMemberModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'florist',
    temp_password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (form.temp_password.length < 6) {
      setError('Password must be at least 6 characters')
      setSaving(false)
      return
    }

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.temp_password,
        options: {
          data: {
            full_name: form.full_name.trim(),
            role: form.role,
          }
        }
      })

      if (signUpError) throw signUpError

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').update({
          full_name: form.full_name.trim(),
          phone: form.phone,
          role: form.role,
          is_active: true,
        }).eq('id', authData.user.id)

        if (profileError) console.warn('Profile update warning:', profileError)
      }

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Create member error:', err)
      setError(err.message || 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Team Member</h2>
            <p className="text-xs text-gray-400 mt-0.5">Create a new account</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="John Doe"
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="john@floralos.com"
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Temporary Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.temp_password}
                onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">User can change this after first login</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="05xx xx xx xx"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
          </div>

          {/* Role Cards */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(roleConfig).map(([key, cfg]) => {
                const RIcon = cfg.icon
                const isSelected = form.role === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, role: key })}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? `${cfg.color} ${cfg.border}`
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <RIcon size={18} />
                    <span className="text-sm font-semibold">{cfg.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}