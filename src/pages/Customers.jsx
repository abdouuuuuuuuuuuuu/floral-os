import { useState } from 'react'
import { Search, User, Phone, Mail, MapPin, Calendar, DollarSign, Plus, X, Check } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useCustomers } from '../hooks/useCustomers'
import { useNotification } from '../context/NotificationContext'
import { supabase } from '../lib/supabase'

function Customers() {
  const { customers, loading, refresh } = useCustomers()
  const { addNotification } = useNotification()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)

  // Form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = customers.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    )
  })

  const resetForm = () => {
    setFullName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setNotes('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fullName.trim()) return

    setSaving(true)
    const { error } = await supabase
      .from('customers')
      .insert({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        billing_address: address.trim() || null,
        notes: notes.trim() || null,
      })

    setSaving(false)

    if (error) {
      addNotification(`Failed to add customer: ${error.message}`, 'error')
      return
    }

    addNotification(`${fullName} added to customers!`, 'success')
    resetForm()
    setShowModal(false)
    refresh()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-primary">Customers</h1>
            <p className="text-sm text-gray-500 mt-1">{customers.length} total customers</p>
          </div>
          <button
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-light transition-colors"
          >
            <Plus size={18} />
            Add Customer
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-cream border border-gray-300/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        {/* Customers Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-cream rounded-xl p-12 text-center">
            <User size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No customers found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((customer) => (
              <div key={customer.customer_id} className="bg-cream rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User size={24} className="text-primary" />
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent text-white">
                    {customer.total_orders || 0} orders
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1">{customer.full_name}</h3>
                
                <div className="space-y-2 mt-3">
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone size={14} />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail size={14} />
                      <span>{customer.email}</span>
                    </div>
                  )}
                  {customer.billing_address && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin size={14} />
                      <span className="truncate">{customer.billing_address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <DollarSign size={14} />
                    <span>{(customer.total_spent || 0).toLocaleString()} DA spent</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar size={14} />
                    <span>Last order: {customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString('fr-FR') : 'Never'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Add Customer</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmed Benali"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05xx xx xx xx"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ahmed@example.com"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Flower Street, Algiers"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergic to lilies, prefers roses..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all text-sm resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Saving...' : 'Add Customer'}
                <Plus size={18} />
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default Customers