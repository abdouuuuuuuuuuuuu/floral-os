import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Search, User, Phone, Mail, MapPin, Calendar, DollarSign, Plus, X, Wallet,
  ChevronDown, ChevronUp, Loader2, ShoppingBag, Hash, Clock, Sparkles, Pencil, Trash2, AlertTriangle
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useCustomers } from '../hooks/useCustomers'
import { useNotification } from '../context/NotificationContext'
import { supabase } from '../lib/supabase'
import { ListSkeleton } from '../components/common/Skeleton'
import { LOYALTY_EARN_DA_PER_POINT, LOYALTY_REDEMPTION_POINTS, LOYALTY_REDEMPTION_DA } from '../lib/loyalty'

const deliveryMethods = [
  { id: 'pickup', label: 'Pickup' },
  { id: 'motorcycle', label: 'Motorcycle' },
  { id: 'dhd', label: 'DHD' },
]

const paymentMethods = [
  { id: 'cash', label: 'Cash' },
  { id: 'baridimob', label: 'BaridiMob' },
  { id: 'usd', label: 'USDT' },
]

const sources = [
  { id: 'inhouse', label: 'In-House' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'phone', label: 'Phone' },
  { id: 'facebook', label: 'Facebook' },
]

const orderStatusColors = {
  new:        'bg-red-50 text-red-600 border-red-200',
  processing: 'bg-amber-50 text-amber-600 border-amber-200',
  done:       'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled:  'bg-gray-50 text-gray-500 border-gray-200',
}

const payStatusColors = {
  paid:     'bg-emerald-50 text-emerald-600 border-emerald-200',
  partial:  'bg-amber-50 text-amber-600 border-amber-200',
  unpaid:   'bg-red-50 text-red-600 border-red-200',
  refunded: 'bg-gray-50 text-gray-500 border-gray-200',
}

function Customers() {
  const location = useLocation()
  const { customers, loading, refresh, createCustomer, updateCustomer } = useCustomers()
  const { addNotification } = useNotification()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  // Expandable cards state
  const [expandedCustomer, setExpandedCustomer] = useState(null)
  const handledSearchLocation = useRef(null)
  const [customerOrders, setCustomerOrders] = useState({})
  const [loadingOrders, setLoadingOrders] = useState(new Set())
  const [lastOrders, setLastOrders] = useState({})
  const [customerBalances, setCustomerBalances] = useState({})
  const [customerLoyalty, setCustomerLoyalty] = useState({})
  const [customerLoyaltyCards, setCustomerLoyaltyCards] = useState({})
  const [loadingLoyalty, setLoadingLoyalty] = useState(new Set())

  // Form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [preferredDelivery, setPreferredDelivery] = useState('pickup')
  const [preferredPayment, setPreferredPayment] = useState('cash')
  const [customerSource, setCustomerSource] = useState('inhouse')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleCardUpdate = (event) => {
      const { code, customer } = event.detail || {}
      if (!code || !customer?.customer_id) return
      setCustomerLoyaltyCards((prev) => ({ ...prev, [customer.customer_id]: code }))
    }
    window.addEventListener('blossom:loyalty-card-updated', handleCardUpdate)
    return () => window.removeEventListener('blossom:loyalty-card-updated', handleCardUpdate)
  }, [])

  // Fetch last order (date + value) for all customers once
  useEffect(() => {
    const fetchLastOrders = async () => {
      if (customers.length === 0) return
      const ids = customers.map(c => c.customer_id).filter(Boolean)
      if (ids.length === 0) return

      const pageSize = 500
      let offset = 0
      const data = []
      let error = null
      while (true) {
        const page = await supabase
          .from('orders')
          .select('customer_id, created_at, total_amount, amount_paid, amount_due, status')
          .in('customer_id', ids)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (page.error) { error = page.error; break }
        const rows = page.data || []
        data.push(...rows)
        if (rows.length < pageSize) break
        offset += pageSize
      }
      if (error) {
        console.error('Error fetching customer order balances:', error)
        return
      }
      const map = {}
      const balances = {}
      data.forEach(order => {
        if (!map[order.customer_id]) {
          map[order.customer_id] = order
        }
        if (order.status !== 'cancelled') {
          const due = Math.max(0, Number(order.amount_due ?? (Number(order.total_amount || 0) - Number(order.amount_paid || 0))))
          if (due > 0) balances[order.customer_id] = (balances[order.customer_id] || 0) + due
        }
      })
      setLastOrders(map)
      setCustomerBalances(balances)
    }

    fetchLastOrders()
  }, [customers])

  const filtered = customers.filter((c) => {
    const q = searchQuery.trim().toLocaleLowerCase()
    if (!q) return true
    const phoneQuery = q.replace(/\D/g, '')
    const searchable = [c.full_name, c.phone, c.email, c.billing_address, c.notes]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
    return (
      searchable.includes(q) ||
      (phoneQuery.length > 0 && String(c.phone || '').replace(/\D/g, '').includes(phoneQuery))
    )
  })

  const repeatCustomerCount = customers.filter((customer) => Number(customer.total_orders) > 1).length
  const customerLifetimeValue = customers.reduce((sum, customer) => sum + (Number(customer.total_spent) || 0), 0)
  const totalOutstandingCredit = Object.values(customerBalances).reduce((sum, amount) => sum + amount, 0)

  const resetForm = () => {
    setFullName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setNotes('')
    setPreferredDelivery('pickup')
    setPreferredPayment('cash')
    setCustomerSource('inhouse')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fullName.trim()) return

    setSaving(true)
    const customerData = {
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      billing_address: address.trim(),
      notes: notes.trim(),
      preferred_delivery_method: preferredDelivery,
      preferred_payment_method: preferredPayment,
      customer_source: customerSource,
    }
    const result = editingCustomer
      ? await updateCustomer(editingCustomer.customer_id, customerData)
      : await createCustomer(customerData)
    setSaving(false)

    if (!result.success) {
      addNotification(`Failed to ${editingCustomer ? 'update' : 'add'} customer: ${result.error?.message}`, 'error')
      return
    }

    addNotification(editingCustomer ? `${fullName} updated.` : `${fullName} added to customers!`, 'success')
    resetForm()
    setShowModal(false)
    setEditingCustomer(null)
    refresh()
  }

  const openEditCustomer = (customer) => {
    setEditingCustomer(customer)
    setFullName(customer.full_name || '')
    setPhone(customer.phone || '')
    setEmail(customer.email || '')
    setAddress(customer.billing_address || '')
    setNotes(customer.notes || '')
    setPreferredDelivery(customer.preferred_delivery_method || 'pickup')
    setPreferredPayment(customer.preferred_payment_method || 'cash')
    setCustomerSource(customer.customer_source || 'inhouse')
    setShowModal(true)
  }

  const deleteCustomer = async (customer) => {
    if (pendingDelete !== customer.customer_id) {
      setPendingDelete(customer.customer_id)
      return
    }
    setSaving(true)
    const [orders, loyalty, cards] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customer.customer_id),
      supabase.from('customer_loyalty_transactions').select('id', { count: 'exact', head: true }).eq('customer_id', customer.customer_id),
      supabase.from('customer_loyalty_cards').select('code', { count: 'exact', head: true }).eq('customer_id', customer.customer_id),
    ])
    const failedCheck = [orders, loyalty, cards].find((result) => result.error)
    if (failedCheck) {
      setSaving(false)
      addNotification(`Could not verify linked customer records: ${failedCheck.error.message}`, 'error')
      return
    }
    const historyCount = (orders.count || 0) + (loyalty.count || 0) + (cards.count || 0)
    if (historyCount > 0) {
      setSaving(false)
      setPendingDelete(null)
      addNotification('This profile has orders, loyalty history, or a linked card. Its history is protected, so it cannot be deleted.', 'error')
      return
    }
    const { data: deletedCustomer, error } = await supabase.from('customers').delete().eq('customer_id', customer.customer_id).select('customer_id').maybeSingle()
    setSaving(false)
    if (error || !deletedCustomer) {
      addNotification(`Customer was not deleted: ${error?.message || 'The profile may be protected by linked records or your account permissions.'}`, 'error')
      return
    }
    setPendingDelete(null)
    if (expandedCustomer === customer.customer_id) setExpandedCustomer(null)
    addNotification(`${customer.full_name} deleted.`, 'success')
    refresh()
  }

  const toggleExpand = async (customerId) => {
    if (expandedCustomer === customerId) {
      setExpandedCustomer(null)
      return
    }
    setExpandedCustomer(customerId)

    setLoadingLoyalty(prev => new Set(prev).add(customerId))
    const [loyaltyResult, cardResult] = await Promise.all([
      supabase.from('customer_loyalty_transactions')
        .select('id, transaction_type, points_delta, note, created_at, order_id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_loyalty_cards')
        .select('code').eq('customer_id', customerId).maybeSingle(),
    ])
    const { data: loyaltyRows, error: loyaltyError } = loyaltyResult
    setCustomerLoyaltyCards((prev) => ({
      ...prev,
      [customerId]: cardResult.error ? null : cardResult.data?.code || '',
    }))
    if (!loyaltyError) {
      const rows = loyaltyRows || []
      setCustomerLoyalty(prev => ({
        ...prev,
        [customerId]: {
          balance: rows.reduce((sum, row) => sum + Number(row.points_delta || 0), 0),
          earned: rows.filter(row => row.transaction_type === 'earn').reduce((sum, row) => sum + Number(row.points_delta || 0), 0),
          transactions: rows.slice(0, 5),
          available: true,
        },
      }))
    } else {
      setCustomerLoyalty(prev => ({ ...prev, [customerId]: { available: false, transactions: [] } }))
    }
    setLoadingLoyalty(prev => {
      const next = new Set(prev)
      next.delete(customerId)
      return next
    })

    // Fetch full order history if not cached
    if (!customerOrders[customerId]) {
      setLoadingOrders(prev => {
        const next = new Set(prev)
        next.add(customerId)
        return next
      })

      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, created_at, total_amount, amount_due, amount_paid, status, payment_status, delivery_method, order_type, notes')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })

      if (!error) {
        setCustomerOrders(prev => ({ ...prev, [customerId]: data || [] }))
      }

      setLoadingOrders(prev => {
        const next = new Set(prev)
        next.delete(customerId)
        return next
      })
    }
  }

  useEffect(() => {
    const searchTarget = location.state?.topBarSearch
    if (searchTarget?.type !== 'customer' || loading || handledSearchLocation.current === location.key) return
    handledSearchLocation.current = location.key
    const customer = customers.find((entry) => String(entry.customer_id) === String(searchTarget.id))
    if (!customer) return
    setSearchQuery(customer.full_name || '')
    if (expandedCustomer !== customer.customer_id) void toggleExpand(customer.customer_id)
  }, [location.key, location.state, customers, loading, expandedCustomer, toggleExpand])

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const fmtTime = (d) => d
    ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1500px] space-y-5 pb-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Customer book</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Customers</h1>
            <p className="mt-1 text-sm text-gray-500">Find a customer and see their preferences and order history.</p>
          </div>
          <button type="button"
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <Plus size={17} /> Add customer
          </button>
        </header>

        <section aria-label="Customer overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-subtle text-primary"><User size={18} /></span><div><p className="text-lg font-semibold tabular-nums text-gray-900">{customers.length.toLocaleString('fr-FR')}</p><p className="text-xs text-gray-500">Total customers</p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-subtle text-accent"><ShoppingBag size={18} /></span><div><p className="text-lg font-semibold tabular-nums text-gray-900">{repeatCustomerCount.toLocaleString('fr-FR')}</p><p className="text-xs text-gray-500">Repeat customers</p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-warning-subtle text-warning"><DollarSign size={18} /></span><div><p className="text-lg font-semibold tabular-nums text-gray-900">{customerLifetimeValue.toLocaleString('fr-FR')} DA</p><p className="text-xs text-gray-500">Customer lifetime sales</p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-amber-700"><Wallet size={18} /></span><div><p className="text-lg font-semibold tabular-nums text-amber-800">{totalOutstandingCredit.toLocaleString('fr-FR')} DA</p><p className="text-xs text-amber-700">Outstanding client credit</p></div></div>
        </section>

        <section aria-label="Search customers" className="rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="customer-search" className="mb-1.5 block text-xs font-semibold text-gray-600">Search customers</label>
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                <input id="customer-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name, phone, email, address, or note" className="min-h-12 w-full rounded-xl border border-sage-dark bg-sage/30 py-3 pl-11 pr-10 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10" />
                {searchQuery && <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-700"><X size={15} /></button>}
              </div>
            </div>
            <p className="shrink-0 pb-1 text-xs text-gray-500"><span className="font-semibold text-gray-800">{filtered.length}</span> of {customers.length} customers</p>
          </div>
        </section>

        {/* Customers Grid */}
        {loading ? (
          <ListSkeleton rows={7} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sage-dark bg-white p-10 text-center sm:p-14">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sage text-gray-400"><User size={25} /></span>
            <p className="font-semibold text-gray-700">{customers.length === 0 ? 'No customers yet' : 'No customers match your search'}</p>
            <p className="mt-1 text-sm text-gray-500">{customers.length === 0 ? 'Add a customer to keep their details and order history together.' : 'Try a shorter name, phone number, email, or note.'}</p>
            {customers.length === 0 && <button type="button" onClick={() => { resetForm(); setShowModal(true) }} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-dark"><Plus size={16} /> Add customer</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((customer) => {
              const isExpanded = expandedCustomer === customer.customer_id
              const lastOrder = lastOrders[customer.customer_id]
              const orders = customerOrders[customer.customer_id] || []
              const isLoadingOrders = loadingOrders.has(customer.customer_id)
              const loyalty = customerLoyalty[customer.customer_id]

              return (
                <div
                  key={customer.customer_id}
                  className={`overflow-hidden rounded-2xl border bg-white transition-all duration-300 ${
                    isExpanded ? 'border-primary/25 shadow-sm ring-1 ring-primary/10' : 'border-sage-dark/70 hover:border-primary/20'
                  }`}
                >
                  {/* ── Collapsed Header (always visible) ── */}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpand(customer.customer_id)}
                    className="flex min-h-[92px] w-full items-center gap-3 p-4 text-left transition hover:bg-sage/20 sm:gap-4 sm:p-5"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-subtle text-primary ring-1 ring-primary/10">
                      <User size={21} aria-hidden="true" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="truncate text-sm font-semibold text-gray-900 sm:text-base">{customer.full_name}</h3>
                      {customer.phone ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 sm:text-sm"><Phone size={12} />{customer.phone}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No phone</p>
                      )}
                      {lastOrder ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                          <Clock size={11} />
                          Last: {fmtDate(lastOrder.created_at)} · {lastOrder.total_amount?.toLocaleString('fr-FR')} DA
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1 italic">No orders yet</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {customerBalances[customer.customer_id] > 0 && <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Due {customerBalances[customer.customer_id].toLocaleString('fr-FR')} DA</span>}
                      <span className="rounded-full border border-sage-dark/70 bg-sage/40 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        {customer.total_orders || 0} <span className="hidden sm:inline">orders</span>
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={18} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* ── Expanded Body ── */}
                  <div
                    aria-hidden={!isExpanded}
                    inert={!isExpanded}
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="min-h-0 overflow-hidden">
                    <div className="space-y-5 border-t border-sage-dark/60 bg-sage/10 px-4 pb-5 pt-4 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sage-dark/50 bg-white p-3">
                        <p className="text-xs text-gray-500">Manage this customer profile</p>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => openEditCustomer(customer)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sage-dark px-3 text-xs font-semibold text-gray-700 hover:bg-sage/40"><Pencil size={14} /> Edit</button>
                          <button type="button" onClick={() => deleteCustomer(customer)} disabled={saving} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${pendingDelete === customer.customer_id ? 'bg-rose-700 text-white' : 'border border-rose-200 text-rose-700 hover:bg-rose-50'}`}>
                            {pendingDelete === customer.customer_id ? <><AlertTriangle size={14} /> Confirm delete</> : <><Trash2 size={14} /> Delete</>}
                          </button>
                          {pendingDelete === customer.customer_id && <button type="button" onClick={() => setPendingDelete(null)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-gray-500 hover:bg-sage/50">Cancel</button>}
                        </div>
                      </div>
                      {pendingDelete === customer.customer_id && <p role="alert" className="-mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">Press <b>Confirm delete</b> to permanently remove this profile. Profiles with orders, loyalty activity, or linked cards are protected.</p>}
                      <section aria-label="Customer loyalty" className="customer-loyalty-panel rounded-xl border border-fuchsia-100 bg-gradient-to-br from-fuchsia-50 to-white p-4">
                        <div className="flex items-start gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-fuchsia-700 shadow-sm"><Sparkles size={18} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div><h4 className="text-sm font-bold text-fuchsia-950">Blossom Petals</h4><p className="mt-0.5 text-xs text-fuchsia-800">Earn 1 petal per {LOYALTY_EARN_DA_PER_POINT} DA paid · {LOYALTY_REDEMPTION_POINTS} petals = {LOYALTY_REDEMPTION_DA} DA off</p><p className="mt-1.5 text-xs text-fuchsia-900">Card ID: <span className="font-mono font-bold">{customerLoyaltyCards[customer.customer_id] || 'No card linked'}</span></p></div>
                              {loadingLoyalty.has(customer.customer_id) ? <Loader2 size={16} className="animate-spin text-fuchsia-600" /> : loyalty?.available && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-fuchsia-800">{Math.max(0, loyalty.balance).toLocaleString('fr-FR')} petals</span>}
                            </div>
                            {loyalty && !loyalty.available ? (
                              <p className="mt-3 rounded-lg bg-white/80 p-2 text-xs text-amber-800">Loyalty storage is not available yet. Apply the customer loyalty migration to Supabase.</p>
                            ) : loyalty?.available && (
                              <>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-fuchsia-100"><div className="h-full rounded-full bg-fuchsia-500 transition-all" style={{ width: `${((Math.max(0, loyalty.balance) % LOYALTY_REDEMPTION_POINTS) / LOYALTY_REDEMPTION_POINTS) * 100}%` }} /></div>
                                <p className="mt-1 text-2xs text-fuchsia-700">{Math.floor(Math.max(0, loyalty.balance) / LOYALTY_REDEMPTION_POINTS)} reward{Math.floor(Math.max(0, loyalty.balance) / LOYALTY_REDEMPTION_POINTS) === 1 ? '' : 's'} available · {Math.max(0, loyalty.balance) % LOYALTY_REDEMPTION_POINTS} petals toward the next one · {loyalty.earned.toLocaleString('fr-FR')} earned to date</p>
                              </>
                            )}
                          </div>
                        </div>
                      </section>

                      {/* Customer Details */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 sm:col-span-2">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-700"><Wallet size={17} /></span>
                          <div>
                            <p className="text-xs font-semibold text-amber-800">Outstanding credit</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-900">{(customerBalances[customer.customer_id] || 0).toLocaleString('fr-FR')} DA</p>
                            <p className="text-2xs text-amber-700">Total unpaid balance on this customer’s orders</p>
                          </div>
                        </div>
                        {customer.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail size={14} className="text-gray-400 shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.billing_address && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin size={14} className="text-gray-400 shrink-0" />
                            <span className="truncate">{customer.billing_address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <DollarSign size={14} className="text-gray-400 shrink-0" />
                          <span>{(customer.total_spent || 0).toLocaleString('fr-FR')} DA total spent</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar size={14} className="text-gray-400 shrink-0" />
                          <span>Last: {customer.last_order_date ? fmtDate(customer.last_order_date) : 'Never'}</span>
                        </div>
                        {(customer.preferred_delivery_method || customer.preferred_payment_method) && (
                          <div className="flex flex-wrap gap-2 pt-1 sm:col-span-2">
                            {customer.preferred_delivery_method && (
                              <span className="px-2 py-0.5 rounded bg-gray-100 text-2xs font-semibold text-gray-500 uppercase border border-gray-200">
                                {customer.preferred_delivery_method}
                              </span>
                            )}
                            {customer.preferred_payment_method && (
                              <span className="px-2 py-0.5 rounded bg-gray-100 text-2xs font-semibold text-gray-500 uppercase border border-gray-200">
                                {customer.preferred_payment_method}
                              </span>
                            )}
                            {customer.customer_source && customer.customer_source !== 'inhouse' && (
                              <span className="px-2 py-0.5 rounded bg-accent/10 text-2xs font-semibold text-accent uppercase border border-accent/20">
                                {customer.customer_source}
                              </span>
                            )}
                          </div>
                        )}
                        {customer.notes && (
                          <div className="rounded-xl border border-sage-dark/60 bg-white p-3 text-xs italic text-gray-500 sm:col-span-2">
                            "{customer.notes}"
                          </div>
                        )}
                      </div>

                      {/* Order History */}
                      <div>
                        <h4 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <ShoppingBag size={12} />
                          Order History ({orders.length})
                        </h4>

                        {isLoadingOrders ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 size={18} className="animate-spin text-gray-400" />
                          </div>
                        ) : orders.length === 0 ? (
                          <div className="text-center py-6 bg-white rounded-xl border border-gray-100">
                            <ShoppingBag size={24} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">No orders yet</p>
                          </div>
                        ) : (
                          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                            {orders.map((order) => (
                              <div key={order.id} className="flex items-center justify-between px-4 py-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Hash size={12} className="text-gray-400" />
                                    <span className="text-sm font-semibold text-primary">
                                      #{order.order_number}
                                    </span>
                                    {order.order_type === 'quick_sale' && (
                                      <span className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-teal/10 text-teal uppercase">
                                        QS
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-2xs text-gray-400 mt-0.5">
                                    {fmtDate(order.created_at)} {fmtTime(order.created_at)}
                                  </p>
                                </div>

                                <div className="text-right shrink-0 ml-3">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {order.total_amount?.toLocaleString('fr-FR')} DA
                                  </p>
                                  {Number(order.amount_due ?? (Number(order.total_amount || 0) - Number(order.amount_paid || 0))) > 0 && (
                                    <p className="mt-0.5 text-2xs font-semibold text-rose-600">
                                      Credit due: {Number(order.amount_due ?? (Number(order.total_amount || 0) - Number(order.amount_paid || 0))).toLocaleString('fr-FR')} DA
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1 justify-end mt-1">
                                    <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full border ${orderStatusColors[order.status] || orderStatusColors.new}`}>
                                      {order.status}
                                    </span>
                                    <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full border ${payStatusColors[order.payment_status] || payStatusColors.unpaid}`}>
                                      {order.payment_status === 'unpaid' && Number(order.amount_paid || 0) === 0 && Number(order.amount_due ?? order.total_amount ?? 0) > 0 ? 'Pay Later' : order.payment_status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Create/edit customer modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-customer-title">
              <button type="button" aria-label="Close customer form" className="absolute inset-0 cursor-default" onClick={() => { setShowModal(false); setEditingCustomer(null); resetForm() }} />
          
          <div className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-sage-dark/70 bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Customer book</p><h2 id="add-customer-title" className="mt-1 text-xl font-semibold text-gray-900">{editingCustomer ? 'Edit customer' : 'Add customer'}</h2></div>
              <button
                type="button"
                onClick={() => { setShowModal(false); setEditingCustomer(null); resetForm() }}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-xl text-gray-400 transition hover:bg-sage hover:text-gray-700"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Full name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmed Benali"
                  required
                  className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Phone *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05xx xx xx xx"
                    required
                    className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ahmed@example.com"
                    className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Flower Street, Algiers"
                  className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                />
              </div>

              <div className="border-t border-sage-dark/60 pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Order defaults</h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">Default delivery</label>
                    <select
                      value={preferredDelivery}
                      onChange={(e) => setPreferredDelivery(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3 text-sm outline-none focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                    >
                      {deliveryMethods.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">Default payment</label>
                    <select
                      value={preferredPayment}
                      onChange={(e) => setPreferredPayment(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-sage-dark bg-sage/25 px-3 text-sm outline-none focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                    >
                      {paymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Source</label>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCustomerSource(s.id)}
                        className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-all ${
                          customerSource === s.id
                            ? 'border-accent bg-accent text-white'
                            : 'border-sage-dark/70 bg-white text-gray-600 hover:bg-sage/50'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergic to lilies, prefers roses..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-sage-dark bg-sage/25 px-3.5 py-3 text-sm outline-none transition focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/10"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingCustomer ? 'Save changes' : 'Add Customer'}
                {editingCustomer ? <Pencil size={16} /> : <Plus size={18} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default Customers
