// src/components/team/AddMemberModal.jsx
import { useState, useEffect } from 'react'
import { X, Crown, Briefcase, Flower2, Eye, EyeOff, RefreshCw, UserRound, Truck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { assignableRolesFor } from '../../lib/permissions'

const roleConfig = {
  owner:   { label: 'Owner',   icon: Crown,     color: 'bg-emerald-600 text-white', border: 'border-emerald-600' },
  manager: { label: 'Manager', icon: Briefcase, color: 'bg-accent text-white',      border: 'border-accent' },
  florist: { label: 'Florist', icon: Flower2,   color: 'bg-teal text-white',        border: 'border-teal' },
  cashier: { label: 'Cashier', icon: UserRound, color: 'bg-blue-600 text-white',    border: 'border-blue-600' },
  delivery:{ label: 'Delivery',icon: Truck,      color: 'bg-orange-600 text-white',  border: 'border-orange-600' },
}

// Unambiguous alphabet — no 0/O, no 1/l/I. These get read aloud and
// typed by hand on a shop floor.
const PW_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generatePassword(length = 12) {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join('')
}

function suggestUsername(fullName) {
  return fullName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents — Zoubîr → zoubir
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32)
}

export default function AddMemberModal({ onClose, onSuccess, addMember }) {
  const { role } = useAuth()

  const [form, setForm] = useState({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    role: 'florist',
    hire_date: new Date().toISOString().split('T')[0],
    password: generatePassword(),
  })
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Suggest a username from the name until the user edits it themselves.
  useEffect(() => {
    if (!usernameTouched) {
      setForm((f) => ({ ...f, username: suggestUsername(f.full_name) }))
    }
  }, [form.full_name, usernameTouched])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(form.username)) {
      setError('Username must be 3–32 characters, using letters, numbers, dot, underscore or dash.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSaving(true)
    try {
      // Goes through the create-team-member Edge Function.
      // Calling supabase.auth.signUp() here would replace YOUR session
      // with the new employee's — you'd be signed in as them.
      await addMember({
        full_name: form.full_name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        hire_date: form.hire_date || null,
        password: form.password,
      })

      onSuccess?.({ username: form.username, password: form.password })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not create the account.')
    } finally {
      setSaving(false)
    }
  }

  const availableRoles = assignableRolesFor(role)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 scrim-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto sheet-enter">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 id="add-member-title" className="text-lg font-semibold text-gray-900">
              Add team member
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              They sign in with the username below
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div role="alert" className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="m-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Full name
            </label>
            <input
              id="m-name"
              type="text"
              value={form.full_name}
              onChange={(e) => set({ full_name: e.target.value })}
              placeholder="Amina Belkacem"
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
          </div>

          <div>
            <label htmlFor="m-username" className="block text-sm font-medium text-gray-700 mb-1.5">
              Username
            </label>
            <input
              id="m-username"
              type="text"
              value={form.username}
              onChange={(e) => {
                setUsernameTouched(true)
                set({ username: e.target.value.toLowerCase() })
              }}
              placeholder="amina.b"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-mono transition-all"
            />
            <p className="text-2xs text-gray-400 mt-1">
              This is what they type to sign in. It can’t be changed later without an owner.
            </p>
          </div>

          <div>
            <label htmlFor="m-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              id="m-email"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="amina@blossom.dz"
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
            <p className="text-2xs text-gray-400 mt-1">
              Used for password resets only — they sign in with the username.
            </p>
          </div>

          <div>
            <label htmlFor="m-password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Temporary password
            </label>
            <div className="relative">
              <input
                id="m-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                required
                minLength={8}
                className="w-full px-4 py-3 pr-20 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-mono transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => set({ password: generatePassword() })}
                  aria-label="Generate a new password"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 transition-colors"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>
            <p className="text-2xs text-gray-400 mt-1">
              Write this down before you save — it isn’t shown again.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="m-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                Phone
              </label>
              <input
                id="m-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="05xx xx xx xx"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
              />
            </div>
            <div>
              <label htmlFor="m-hire" className="block text-sm font-medium text-gray-700 mb-1.5">
                Start date
              </label>
              <input
                id="m-hire"
                type="date"
                value={form.hire_date}
                onChange={(e) => set({ hire_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
              />
            </div>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Role</legend>
            <div className="grid grid-cols-2 gap-2">
              {availableRoles.map((key) => {
                const cfg = roleConfig[key]
                const RIcon = cfg.icon
                const isSelected = form.role === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set({ role: key })}
                    aria-pressed={isSelected}
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
            {role !== 'owner' && (
              <p className="text-2xs text-gray-400 mt-2">
                Managers can add florists, cashiers, and delivery staff. Only an owner can add owners or managers.
              </p>
            )}
          </fieldset>

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
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
