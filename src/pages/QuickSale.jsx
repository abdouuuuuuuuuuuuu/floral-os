import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Minus, Trash2, ShoppingBag, CreditCard, Smartphone,
  DollarSign, X, Printer, Check, User, UserPlus, Phone, LayoutDashboard,
  Package, TrendingUp, Star, Flower2, Candy, Gift
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import PriceAdjuster from '../components/PriceAdjuster'
import { useQuickSale } from '../hooks/useQuickSale'
import { useShopName } from '../hooks/useShopName'
import { useNotification } from '../context/NotificationContext'
import SaleComplete from '../components/common/SaleComplete'
import { printThermalReceipt } from '../utils/printThermal'
import { orderQrHtml } from '../lib/orderQr'
import { supabase } from '../lib/supabase'
import PaymentStep from '../components/PaymentStep'
import { useSettings } from '../hooks/useSettings'

const paymentMethods = [
  { id: 'cash', label: 'Cash', icon: CreditCard },
  { id: 'baridimob', label: 'BaridiMob', icon: Smartphone },
  { id: 'usd', label: 'USDT', icon: DollarSign },
]

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIG (mirrors Cart & Products pages)
// ═══════════════════════════════════════════════════════════════════════════════
const CATEGORY_CONFIG = {
  'Flowers': {
    icon: Flower2,
    color: '#E91E63',
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    border: 'border-pink-200',
    cardBorder: 'border-pink-200',
    cardBg: 'bg-gradient-to-br from-pink-50 to-rose-50',
    headerBg: 'bg-pink-100',
  },
  'Chocolates': {
    icon: Candy,
    color: '#795548',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    cardBorder: 'border-amber-200',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    headerBg: 'bg-amber-100',
  },
  'Gifts': {
    icon: Gift,
    color: '#9C27B0',
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-200',
    cardBorder: 'border-purple-200',
    cardBg: 'bg-gradient-to-br from-purple-50 to-violet-50',
    headerBg: 'bg-purple-100',
  },
}

const getCategoryConfig = (catName) =>
  CATEGORY_CONFIG[catName] || {
    icon: Package,
    color: '#6B7280',
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    border: 'border-gray-200',
    cardBorder: 'border-gray-200',
    cardBg: 'bg-gradient-to-br from-gray-50 to-slate-50',
    headerBg: 'bg-gray-100',
  }

function QuickSale() {
  const shopName = useShopName()
  const navigate = useNavigate()
  const { addNotification } = useNotification()
  const { settings: shopSettings } = useSettings()
  const usdExchangeRate = Number(shopSettings.usd_exchange_rate) || 0

  const {
    quickCart,
    addToQuickCart,
    updateQuantity,
    clearQuickCart,
    quickSubtotal,
    adjustedTotal,
    priceAdjustment,
    setPriceAdjustment,
    completeQuickSale,
    loading,
  } = useQuickSale()

  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [popularProducts, setPopularProducts] = useState([])
  const [selectedPayment, setSelectedPayment] = useState('cash')
  const [selectedSource, setSelectedSource] = useState('inhouse')
  const [notes, setNotes] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [showPaymentStep, setShowPaymentStep] = useState(false)
  const [celebration, setCelebration] = useState(null)
  const [lastOrder, setLastOrder] = useState(null)
  const searchRef = useRef(null)
  const autoPrintedOrderRef = useRef(null)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearching, setCustomerSearching] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustPhone, setNewCustPhone] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)

  // ─── STARRED / FAST SELECTION ─────────────────────────────────
  const [starredIds, setStarredIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('starredProducts') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    const handleFocus = () => {
      try {
        const ids = JSON.parse(localStorage.getItem('starredProducts') || '[]')
        setStarredIds(ids)
      } catch {}
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  const starredProducts = products.filter(p => starredIds.includes(p.product_id))
  // ──────────────────────────────────────────────────────────────

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select('product_id, item_name, retail_price, stock_level, image_url, category')
        .eq('is_active', true)
        .order('item_name')

      setProducts(data || [])
    }
    fetchProducts()
  }, [])

  useEffect(() => {
    const fetchPopular = async () => {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity')

      if (!orderItems || orderItems.length === 0) {
        const { data } = await supabase
          .from('products')
          .select('product_id, item_name, retail_price, stock_level, image_url, category')
          .eq('is_active', true)
          .order('item_name')
          .limit(8)
        setPopularProducts(data || [])
        return
      }

      const counts = {}
      orderItems.forEach(item => {
        counts[item.product_id] = (counts[item.product_id] || 0) + (item.quantity || 1)
      })

      const sortedIds = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => parseInt(id))

      const { data } = await supabase
        .from('products')
        .select('product_id, item_name, retail_price, stock_level, image_url, category')
        .in('product_id', sortedIds)
        .eq('is_active', true)

      const ordered = sortedIds
        .map(id => data?.find(p => p.product_id === id))
        .filter(Boolean)

      setPopularProducts(ordered)
    }

    fetchPopular()
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts([])
      return
    }
    const query = searchQuery.toLowerCase()
    setFilteredProducts(
      products.filter(p =>
        p.item_name?.toLowerCase().includes(query) ||
        String(p.product_id).includes(query)
      ).slice(0, 8)
    )
  }, [searchQuery, products])

  useEffect(() => {
    const q = customerQuery.trim()
    if (!q || selectedCustomer) {
      setCustomerResults([])
      return
    }

    const timer = setTimeout(async () => {
      setCustomerSearching(true)
      const safe = q.replace(/[,()%]/g, ' ').trim()
      const phoneDigits = q.replace(/\D/g, '')
      const [searchResult, exactPhoneResult] = await Promise.all([supabase
        .from('customers')
        .select('customer_id, full_name, phone, email')
        .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(6), phoneDigits.length >= 9
          ? supabase.rpc('blossom_resolve_customer', { p_phone: q, p_create_if_missing: false })
          : Promise.resolve({ data: null, error: null })])
      const exact = exactPhoneResult.data ? [exactPhoneResult.data] : []
      setCustomerResults([...new Map([...(searchResult.data || []), ...exact].map((customer) => [customer.customer_id, customer])).values()].slice(0, 6))
      setCustomerSearching(false)
    }, 250)

    return () => clearTimeout(timer)
  }, [customerQuery, selectedCustomer])

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer)
    setCustomerQuery('')
    setCustomerResults([])
    setShowAddCustomer(false)
  }

  const handleClearCustomer = () => {
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
  }

  const handleAddCustomer = async () => {
    const name = customerQuery.trim()
    if (!name || !newCustPhone.trim()) {
      addNotification('Enter a customer name and phone number to prevent duplicate profiles.', 'error')
      return
    }
    setSavingCustomer(true)
    const { data, error } = await supabase.rpc('blossom_resolve_customer', {
      p_full_name: name,
      p_phone: newCustPhone.trim(),
    })
    setSavingCustomer(false)
    if (!error && data) {
      handleSelectCustomer(data)
      setNewCustPhone('')
    } else {
      addNotification(error?.message || 'Could not find or save this customer.', 'error')
    }
  }

  const handleComplete = useCallback(() => {
    if (quickCart.length > 0 && !loading) setShowPaymentStep(true)
  }, [quickCart.length, loading])

  const handlePaymentConfirm = useCallback(async (paymentData) => {
    const result = await completeQuickSale(selectedPayment, selectedSource, notes, selectedCustomer, paymentData)

    if (result.error) {
      // The whole sale rolled back server-side. The cart is intentionally
      // kept so the cashier can retry without re-scanning everything.
      addNotification(result.error, 'error')
      return
    }

    if (result.success && result.queued) {
      // No internet: the sale is held and will finalize on its own. Reset for
      // the next customer; the receipt prints from Orders once it syncs.
      setShowPaymentStep(false)
      addNotification(
        `No internet — sale saved (${Number(result.total || 0).toLocaleString('fr-FR')} DA). It will finalize automatically when you reconnect; print the receipt from Orders then.`,
        'warning'
      )
      return
    }

    if (result.success) {
      // The cash_in entry is written inside create_order(). The old
      // logQuickSalePayment() call here created a second row per sale.

      if (result.negativeStock?.length) {
        addNotification(
          `Stock is now negative for: ${result.negativeStock
            .map((p) => p.product_name)
            .join(', ')}`,
          'warning'
        )
      }

      setLastOrder({
        ...result,
        paymentMethod: paymentMethods.find(p => p.id === selectedPayment)?.label,
        source: selectedSource,
        notes: notes.trim(),
      })
      setShowPaymentStep(false)
      // The moment fires alongside the receipt, not instead of it — it
      // never blocks, so the next customer can be served through it.
      setCelebration({ amount: result.total, orderNumber: result.orderNumber })
      setShowReceipt(true)
    }
  }, [completeQuickSale, selectedPayment, selectedSource, notes, selectedCustomer, addNotification])

  // ─── KEYBOARD ─────────────────────────────────────────────────
  // A till is a keyboard machine. Every action here was mouse-only,
  // which makes a cashier permanently slower than they need to be.
  //
  // Deliberately NOT bound while typing in a field — otherwise "F" in a
  // product search would switch the payment method.
  useEffect(() => {
    const onKey = (e) => {
      if (showPaymentStep) return
      const el = document.activeElement
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      // Escape always works, even mid-typing: clear the field, then blur.
      if (e.key === 'Escape') {
        if (typing) {
          if (searchQuery) setSearchQuery('')
          else el.blur()
          return
        }
        if (showReceipt) return
        setSearchQuery('')
        return
      }

      // Focus search from anywhere.
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      // Complete the sale. Ctrl+Enter works even while typing, so the
      // cashier never has to leave the search box.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (quickCart.length > 0 && !loading) handleComplete()
        return
      }

      if (typing) return

      if (e.key === 'Enter') {
        e.preventDefault()
        if (quickCart.length > 0 && !loading) handleComplete()
        return
      }

      // F1..F3 pick the payment method, in the order they're displayed.
      const fnIndex = ['F1', 'F2', 'F3'].indexOf(e.key)
      if (fnIndex > -1 && paymentMethods[fnIndex]) {
        e.preventDefault()
        setSelectedPayment(paymentMethods[fnIndex].id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickCart.length, loading, showReceipt, showPaymentStep, searchQuery, handleComplete])

  const handleNewSale = () => {
    setShowReceipt(false)
    setShowPaymentStep(false)
    setLastOrder(null)
    clearQuickCart()
    setSelectedCustomer(null)
    setNotes('')
    setSelectedPayment('cash')
    setSelectedSource('inhouse')
    searchRef.current?.focus()
  }

  const handlePrint = useCallback(async () => {
    if (!lastOrder) return

    const items = (lastOrder.items || []).map(item => `
      <tr>
        <td style="text-align:left;padding:1px 0;">${item.name}</td>
        <td style="text-align:center;padding:1px 0;width:30px;">x${item.quantity}</td>
        <td style="text-align:right;padding:1px 0;width:60px;">${item.totalPrice} DA</td>
      </tr>
    `).join('')

    const adjustmentRow = lastOrder.priceAdjustment !== 0
      ? `<div class="row" style="color:${lastOrder.priceAdjustment < 0 ? '#d32f2f' : '#2e7d32'};">
           <span>${lastOrder.priceAdjustment < 0 ? 'Discount' : 'Extra Charge'}</span>
           <span>${lastOrder.priceAdjustment > 0 ? '+' : ''}${lastOrder.priceAdjustment} DA</span>
         </div>`
      : ''

    const html = `
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:2px;">${shopName}</div>
        <div style="font-size:10px;color:#555;">Quick Sale Receipt</div>
        <div style="font-size:13px;font-weight:bold;margin-top:6px;">Order #${lastOrder.orderNumber}</div>
        <div style="font-size:10px;color:#555;margin-bottom:8px;">${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <div class="divider"></div>
      <div style="margin-bottom:8px;">
        <div class="section">Client</div>
        <div style="font-size:12px;">${lastOrder.customerName}</div>
        ${lastOrder.customerPhone ? `<div style="font-size:12px;">${lastOrder.customerPhone}</div>` : ''}
      </div>
      <div class="divider"></div>
      <div style="margin-bottom:8px;">
        <div class="section">Items</div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${items}</tbody></table>
      </div>
      <div class="divider"></div>
      <div style="margin-bottom:8px;">
        <div class="row"><span>Subtotal</span><span>${lastOrder.subtotal} DA</span></div>
        ${adjustmentRow}
        <div class="total-row"><span>TOTAL</span><span>${lastOrder.total} DA</span></div>
      </div>
      <div class="divider"></div>
      <div class="row"><span>Payment</span><span>${lastOrder.paymentMethod}</span></div>
      <div class="row"><span>Source</span><span>${lastOrder.source}</span></div>
      ${lastOrder.notes ? `<div class="row"><span>Notes</span><span>${lastOrder.notes}</span></div>` : ''}
      ${orderQrHtml(lastOrder.orderId)}
      <div class="footer">Thank you!<br>${shopName} — Blossom Workspace</div>
    `

    await printThermalReceipt(html, `Receipt-${lastOrder.orderNumber}`, './logo-Black.png')
  }, [lastOrder, shopName])

  useEffect(() => {
    const orderNumber = lastOrder?.orderNumber
    if (!showReceipt || !orderNumber || autoPrintedOrderRef.current === orderNumber) return
    autoPrintedOrderRef.current = orderNumber
    void handlePrint()
  }, [showReceipt, lastOrder?.orderNumber, handlePrint])

  const goToDashboard = () => {
    navigate('/dashboard')
  }

  // ── Helper: render a product card with category styling ─────────────
  const renderProductCard = (product, isStarred = false) => {
    const cfg = getCategoryConfig(product.category)
    const PIcon = cfg.icon
    const isFlowers = product.category === 'Flowers'

    return (
      <button
        key={product.product_id}
        onClick={() => {
          addToQuickCart({
            id: product.product_id,
            name: product.item_name,
            price: product.retail_price,
            stock_level: product.stock_level,
          })
        }}
        className={`rounded-xl border-2 p-3 text-left transition-all active:scale-[0.97] group relative overflow-hidden ${
          isStarred
            ? 'bg-white border-amber-200 hover:shadow-md hover:border-amber-400'
            : `${cfg.cardBg} ${cfg.cardBorder} hover:shadow-md hover:border-gray-300`
        }`}
      >
        {/* Colored top bar */}
        <div className={`h-1 w-full absolute top-0 left-0 ${cfg.headerBg}`} />

        <div className="w-full h-20 rounded-lg bg-gray-100 overflow-hidden mb-2.5 border border-gray-100 relative">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.item_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center border-2"
                style={{
                  backgroundColor: cfg.color + '15',
                  borderColor: cfg.color + '30',
                }}
              >
                <PIcon size={24} style={{ color: cfg.color }} />
              </div>
            </div>
          )}

          {/* Category badge */}
          <div className="absolute top-1.5 right-1.5">
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center border shadow-sm ${cfg.bg} ${cfg.border}`}
              title={product.category || 'Uncategorized'}
            >
              <PIcon size={10} style={{ color: cfg.color }} />
            </div>
          </div>

          {/* Hot badge for flowers */}
          {isFlowers && (
            <div className="absolute top-1.5 left-1.5">
              <span className="px-1.5 py-0.5 rounded bg-pink-500 text-white text-2xs font-semibold shadow-sm">
                🔥
              </span>
            </div>
          )}
        </div>

        <p className="font-medium text-gray-900 text-sm truncate leading-tight">
          {product.item_name}
        </p>

        <div className="flex items-center justify-between mt-1.5">
          <span className="font-semibold text-primary text-sm">
            {product.retail_price} DA
          </span>
          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${
            product.stock_level > 5
              ? 'bg-emerald-50 text-emerald-600'
              : product.stock_level > 0
              ? 'bg-amber-50 text-amber-600'
              : 'bg-red-50 text-red-600'
          }`}>
            {product.stock_level}
          </span>
        </div>
      </button>
    )
  }

  // ── Group products by category, Flowers first ───────────────────────
  const groupByCategory = (list) => {
    const grouped = list.reduce((acc, p) => {
      const cat = p.category || 'Uncategorized'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(p)
      return acc
    }, {})

    // Sort keys so Flowers is always first
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === 'Flowers') return -1
      if (b === 'Flowers') return 1
      return a.localeCompare(b)
    })

    return sortedKeys.map(key => ({ catName: key, items: grouped[key] }))
  }

  if (showReceipt && lastOrder) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto">
          <div className="flex gap-3 mb-6">
            <button
              onClick={handlePrint}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium flex items-center justify-center gap-2 hover:bg-primary-light transition-colors"
            >
              <Printer size={18} /> Print
            </button>
            <button
              onClick={handleNewSale}
              className="flex-1 py-2.5 rounded-lg bg-teal text-white font-medium flex items-center justify-center gap-2 hover:bg-teal-dark transition-colors"
            >
              <ShoppingBag size={18} /> New Sale
            </button>
            <button
              onClick={goToDashboard}
              className="flex-1 py-2.5 rounded-lg bg-gray-700 text-white font-medium flex items-center justify-center gap-2 hover:bg-gray-600 transition-colors"
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-lg">
            <div className="text-center mb-6">
              <img
                src="./logo-Black.png"
                alt={shopName}
                className="h-16 mx-auto mb-3 object-contain"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <h1 className="font-serif text-3xl text-emerald-800 mb-1">{shopName}</h1>
              <p className="text-gray-500 text-sm">Quick Sale Receipt</p>
              <div className="mt-3 text-sm text-gray-600">
                <p>Order #{lastOrder.orderNumber}</p>
                <p>{new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-4 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-gray-400" />
                <span className="font-medium text-gray-900">{lastOrder.customerName}</span>
              </div>
              {lastOrder.customerPhone && (
                <div className="flex items-center gap-2 text-sm mt-1">
                  <Phone size={14} className="text-gray-400" />
                  <span className="text-gray-600">{lastOrder.customerPhone}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-gray-300 pt-4 mb-4">
              <h3 className="font-medium text-gray-900 mb-2">Items</h3>
              <div className="space-y-2">
                {lastOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.name} x{item.quantity}</span>
                    <span className="font-medium">{item.totalPrice} DA</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Subtotal</span>
                <span>{lastOrder.subtotal} DA</span>
              </div>

              {lastOrder.priceAdjustment !== 0 && (
                <div className={`flex justify-between text-sm mb-1 ${lastOrder.priceAdjustment < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  <span>{lastOrder.priceAdjustment < 0 ? 'Discount' : 'Extra Charge'}</span>
                  <span className="font-medium">
                    {lastOrder.priceAdjustment > 0 ? '+' : ''}{lastOrder.priceAdjustment} DA
                  </span>
                </div>
              )}

              <div className="flex justify-between text-lg font-semibold text-primary">
                <span>TOTAL</span>
                <span>{lastOrder.total} DA</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-4 mt-4">
              <p className="text-sm text-gray-600">Payment: <span className="font-medium">{lastOrder.paymentMethod}</span></p>
              <p className="text-sm text-gray-600">Status: <span className="font-medium capitalize">{lastOrder.paymentStatus || 'paid'}</span></p>
              <p className="text-sm text-gray-600">Paid: <span className="font-medium">{Number(lastOrder.amountPaid ?? lastOrder.total).toLocaleString('fr-FR')} DA</span></p>
              {Number(lastOrder.amountDue) > 0 && <p className="text-sm text-gray-600">Due: <span className="font-medium">{Number(lastOrder.amountDue).toLocaleString('fr-FR')} DA</span></p>}
              {lastOrder.paymentNotes && <p className="text-sm text-gray-600">Payment details: <span className="font-medium">{lastOrder.paymentNotes}</span></p>}
              <p className="text-sm text-gray-600">Source: <span className="font-medium capitalize">{lastOrder.source}</span></p>
              {lastOrder.notes && (
                <p className="text-sm text-gray-600">Notes: <span className="font-medium">{lastOrder.notes}</span></p>
              )}
            </div>

            <div className="text-center mt-6 pt-4 border-t border-dashed border-gray-300">
              <p className="text-gray-400 text-xs">Thank you!</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      {celebration && (
        <SaleComplete
          amount={celebration.amount}
          orderNumber={celebration.orderNumber}
          onDone={() => setCelebration(null)}
        />
      )}

      <div className="grid grid-cols-3 gap-6 h-[calc(100vh-120px)]">
        <div className="col-span-2 space-y-4 overflow-y-auto pr-2">
          <h1 className="text-2xl font-serif text-primary flex items-center gap-3">
            <ShoppingBag size={28} />
            Quick Sale
          </h1>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product by name or ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-cream border border-gray-300/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-lg"
            />
          </div>

          {filteredProducts.length > 0 && (
            <div className="bg-cream rounded-xl overflow-hidden shadow-lg">
              {filteredProducts.map((product) => (
                <button
                  key={product.product_id}
                  onClick={() => {
                    addToQuickCart({
                      id: product.product_id,
                      name: product.item_name,
                      price: product.retail_price,
                      stock_level: product.stock_level,
                    })
                    setSearchQuery('')
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-white press border-b border-gray-200 last:border-0"
                >
                  <div className="text-left flex items-center gap-3">
                    {(() => {
                      const cfg = getCategoryConfig(product.category)
                      const PIcon = cfg.icon
                      return (
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${cfg.bg} ${cfg.border}`}
                        >
                          <PIcon size={14} style={{ color: cfg.color }} />
                        </div>
                      )
                    })()}
                    <div>
                      <p className="font-medium text-gray-900">{product.item_name}</p>
                      <p className="text-sm text-gray-500">Stock: {product.stock_level}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">{product.retail_price} DA</span>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus size={16} className="text-primary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ─── FAST SELECTION (STARRED) ─────────────────────────── */}
          {!searchQuery.trim() && starredProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Star size={14} className="text-amber-500" fill="currentColor" />
                Fast Selection
              </h3>

              {groupByCategory(starredProducts).map(({ catName, items }) => {
                const cfg = getCategoryConfig(catName)
                const CatIcon = cfg.icon
                return (
                  <div key={`starred-${catName}`} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${cfg.bg} ${cfg.border}`}>
                        <CatIcon size={10} style={{ color: cfg.color }} />
                      </div>
                      <span className={`text-2xs font-semibold uppercase tracking-wider ${cfg.text}`}>
                        {catName}
                      </span>
                      <span className="text-2xs text-gray-400">{items.length}</span>
                      {catName === 'Flowers' && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-600 text-2xs font-semibold border border-pink-200">
                          🔥 Hot
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {items.map(p => renderProductCard(p, true))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── POPULAR PRODUCTS ─────────────────────────────────── */}
          {!searchQuery.trim() && popularProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" />
                Popular Products
              </h3>

              {groupByCategory(popularProducts).map(({ catName, items }) => {
                const cfg = getCategoryConfig(catName)
                const CatIcon = cfg.icon
                return (
                  <div key={`popular-${catName}`} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${cfg.bg} ${cfg.border}`}>
                        <CatIcon size={10} style={{ color: cfg.color }} />
                      </div>
                      <span className={`text-2xs font-semibold uppercase tracking-wider ${cfg.text}`}>
                        {catName}
                      </span>
                      <span className="text-2xs text-gray-400">{items.length}</span>
                      {catName === 'Flowers' && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-600 text-2xs font-semibold border border-pink-200">
                          🔥 Hot
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {items.map(p => renderProductCard(p, false))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="bg-cream rounded-xl p-4 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Current Sale ({quickCart.length} items)</h3>
              {quickCart.length > 0 && (
                <button onClick={clearQuickCart} className="text-sm text-danger hover:underline flex items-center gap-1">
                  <Trash2 size={14} /> Clear
                </button>
              )}
            </div>

            {quickCart.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ShoppingBag size={48} className="mx-auto mb-3 opacity-30" />
                <p>Search and add products to start</p>
              </div>
            ) : (
              <div className="space-y-2">
                {quickCart.map((item) => {
                  const deficit = item.stock_level !== undefined && item.quantity > item.stock_level
                    ? item.quantity - item.stock_level
                    : 0

                  return (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-sm text-gray-500">{item.price} DA each</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Minus size={14} />
                        </button>

                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value)
                            if (isNaN(val)) return
                            updateQuantity(item.id, val)
                          }}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value)
                            if (isNaN(val) || val < 1) {
                              updateQuantity(item.id, 1)
                            }
                          }}
                          className="w-12 h-8 text-center font-semibold text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                        >
                          <Plus size={14} className="text-primary" />
                        </button>
                        <span className="font-semibold text-primary w-20 text-right text-sm">{item.totalPrice} DA</span>

                        {deficit > 0 && (
                          <span className="text-2xs font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded shrink-0">
                            -{deficit}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-cream rounded-xl p-5 space-y-4 h-fit">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>

            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-primary/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{selectedCustomer.full_name}</p>
                    {selectedCustomer.phone && (
                      <p className="text-xs text-gray-500 truncate">{selectedCustomer.phone}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleClearCustomer}
                  className="text-gray-400 hover:text-danger transition-colors shrink-0"
                  title="Remove customer"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Walk-in — or search name / phone..."
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-300 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                />
                {customerQuery && (
                  <button
                    onClick={() => { setCustomerQuery(''); setCustomerResults([]); setShowAddCustomer(false) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}

                {customerQuery.trim() && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                    {customerSearching ? (
                      <p className="p-3 text-sm text-gray-400">Searching...</p>
                    ) : (
                      <>
                        {customerResults.map((c) => (
                          <button
                            key={c.customer_id}
                            onClick={() => handleSelectCustomer(c)}
                            className="w-full flex items-center gap-2 p-3 hover:bg-cream transition-colors text-left border-b border-gray-100"
                          >
                            <User size={14} className="text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{c.full_name}</p>
                              {c.phone && <p className="text-xs text-gray-500 truncate">{c.phone}</p>}
                            </div>
                          </button>
                        ))}

                        {!showAddCustomer ? (
                          <button
                            onClick={() => setShowAddCustomer(true)}
                            className="w-full flex items-center gap-2 p-3 hover:bg-cream transition-colors text-left text-primary"
                          >
                            <UserPlus size={14} />
                            <span className="text-sm font-medium">Add "{customerQuery.trim()}" as new customer</span>
                          </button>
                        ) : (
                          <div className="p-3 space-y-2 bg-cream/50">
                            <input
                              type="text"
                              value={newCustPhone}
                              onChange={(e) => setNewCustPhone(e.target.value)}
                              type="tel"
                              required
                              placeholder="Phone (required)"
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                            />
                            <button
                              onClick={handleAddCustomer}
                              disabled={savingCustomer || !newCustPhone.trim()}
                              className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50"
                            >
                              {savingCustomer ? 'Saving...' : `Save "${customerQuery.trim()}"`}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="font-semibold text-gray-900">Payment</h3>

          <div className="space-y-2 p-4 bg-white rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span>{quickSubtotal} DA</span>
            </div>

            {priceAdjustment !== 0 && (
              <div className={`flex justify-between text-sm ${priceAdjustment < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                <span>{priceAdjustment < 0 ? 'Discount' : 'Extra Charge'}</span>
                <span className="font-medium">
                  {priceAdjustment > 0 ? '+' : ''}{priceAdjustment} DA
                </span>
              </div>
            )}

            <div className="border-t border-gray-200 pt-2 flex justify-between text-xl font-semibold text-primary">
              <span>Total</span>
              <span>{adjustedTotal} DA</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Price Adjustment</label>
            <PriceAdjuster
              value={priceAdjustment}
              onChange={setPriceAdjustment}
              currency="DA"
              step={10}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {paymentMethods.map((method, methodIndex) => {
                const Icon = method.icon
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    disabled={method.id === 'usd' && usdExchangeRate <= 0}
                    title={`${method.label} (F${methodIndex + 1})`}
                    className={`relative py-2 rounded-lg border-2 text-xs font-medium press ${
                      selectedPayment === method.id
                        ? 'border-accent bg-accent-subtle text-accent'
                        : 'border-gray-300 text-gray-600 hover:border-accent'
                    } ${method.id === 'usd' && usdExchangeRate <= 0 ? 'opacity-45 cursor-not-allowed' : ''}`}
                  >
                    <span className="absolute top-1 right-1.5 text-2xs font-mono text-gray-400">
                      F{methodIndex + 1}
                    </span>
                    <Icon size={16} className="mx-auto mb-1" />
                    {method.label}
                  </button>
                )
              })}
            </div>
            {selectedPayment === 'usd' && usdExchangeRate > 0 && (
              <p className="mt-2 text-xs text-gray-500">1 USDT = {usdExchangeRate.toLocaleString('fr-FR')} DA</p>
            )}
            {usdExchangeRate <= 0 && (
              <p className="mt-2 text-xs text-amber-700">USDT is unavailable until an owner sets the exchange rate in Settings.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            >
              <option value="inhouse">In-House</option>
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
          </div>

          <button
            onClick={handleComplete}
            disabled={quickCart.length === 0 || loading}
            className="btn btn-primary w-full py-3.5 text-base"
          >
            {loading ? 'Processing…' : (
              <>
                <Check size={18} />
                Complete Sale
                {adjustedTotal > 0 && (
                  <span className="figure ml-1">
                    {adjustedTotal.toLocaleString('fr-FR')} DA
                  </span>
                )}
              </>
            )}
          </button>

          {/* Shortcuts, shown rather than explained. A cashier who never
              learns them loses nothing; one who glances down once gets
              noticeably faster. */}
          <div className="flex items-center justify-center gap-3 mt-3 text-2xs text-gray-400 select-none">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-mono text-2xs">/</kbd>
              search
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-mono text-2xs">F1–F3</kbd>
              payment
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-mono text-2xs">Ctrl↵</kbd>
              complete
            </span>
          </div>
        </div>
      </div>
      {showPaymentStep && (
        <PaymentStep
          total={adjustedTotal}
          paymentMethod={selectedPayment}
          exchangeRate={usdExchangeRate}
          customer={selectedCustomer}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentStep(false)}
          isSubmitting={loading}
        />
      )}
    </DashboardLayout>
  )
}

export default QuickSale
