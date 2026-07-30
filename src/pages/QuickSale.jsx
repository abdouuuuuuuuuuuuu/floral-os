import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, Minus, Trash2, ShoppingBag, CreditCard, Smartphone,
  DollarSign, X, Printer, Check, User, UserPlus, Phone, LayoutDashboard,
  Package, TrendingUp
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import PriceAdjuster from '../components/PriceAdjuster'
import { useQuickSale } from '../hooks/useQuickSale'
import { useShopName } from '../hooks/useShopName'
import { printThermalReceipt } from '../utils/printThermal'
import { supabase } from '../lib/supabase'

const paymentMethods = [
  { id: 'cash', label: 'Cash', icon: CreditCard },
  { id: 'baridimob', label: 'BaridiMob', icon: Smartphone },
  { id: 'usd', label: 'USD', icon: DollarSign },
]

function QuickSale() {
  const shopName = useShopName()
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
  const [lastOrder, setLastOrder] = useState(null)
  const searchRef = useRef(null)

  // ---- Customer lookup state ----
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearching, setCustomerSearching] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustPhone, setNewCustPhone] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Load products
  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select('product_id, item_name, retail_price, stock_level, image_url')
        .eq('is_active', true)
        .order('item_name')

      setProducts(data || [])
    }
    fetchProducts()
  }, [])

  // Load popular products (most ordered)
  useEffect(() => {
    const fetchPopular = async () => {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity')

      if (!orderItems || orderItems.length === 0) {
        // Fallback: show first 8 active products
        const { data } = await supabase
          .from('products')
          .select('product_id, item_name, retail_price, stock_level, image_url')
          .eq('is_active', true)
          .order('item_name')
          .limit(8)
        setPopularProducts(data || [])
        return
      }

      // Count by product_id
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
        .select('product_id, item_name, retail_price, stock_level, image_url')
        .in('product_id', sortedIds)
        .eq('is_active', true)

      const ordered = sortedIds
        .map(id => data?.find(p => p.product_id === id))
        .filter(Boolean)

      setPopularProducts(ordered)
    }

    fetchPopular()
  }, [])

  // Filter products
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

  // ---- Customer lookup: debounced search by name OR phone ----
  useEffect(() => {
    const q = customerQuery.trim()
    if (!q || selectedCustomer) {
      setCustomerResults([])
      return
    }

    const timer = setTimeout(async () => {
      setCustomerSearching(true)
      const safe = q.replace(/[,()%]/g, ' ').trim()
      const { data } = await supabase
        .from('customers')
        .select('customer_id, full_name, phone, email')
        .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(6)
      setCustomerResults(data || [])
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
    if (!name) return
    setSavingCustomer(true)
    const { data, error } = await supabase
      .from('customers')
      .insert({ full_name: name, phone: newCustPhone.trim() || null })
      .select('customer_id, full_name, phone, email')
      .single()
    setSavingCustomer(false)
    if (!error && data) {
      handleSelectCustomer(data)
      setNewCustPhone('')
    }
  }

  const handleComplete = async () => {
    const result = await completeQuickSale(selectedPayment, selectedSource, notes, selectedCustomer)
    if (result.success) {
      setLastOrder({
        ...result,
        paymentMethod: paymentMethods.find(p => p.id === selectedPayment)?.label,
        source: selectedSource,
        notes: notes.trim(),
      })
      setShowReceipt(true)
    }
  }

  const handleNewSale = () => {
    setShowReceipt(false)
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
      <div class="footer">Thank you!<br>${shopName} — Blossom Workspace</div>
    `

    await printThermalReceipt(html, `Receipt-${lastOrder.orderNumber}`, '/logo-Black.png')
  }, [lastOrder, shopName])

  const goToDashboard = () => {
    window.location.href = '/dashboard'
  }

  // ---- Receipt ----
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

          {/* On-screen preview only */}
          <div className="bg-white rounded-xl p-8 shadow-lg">
            <div className="text-center mb-6">
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

              <div className="flex justify-between text-lg font-bold text-primary">
                <span>TOTAL</span>
                <span>{lastOrder.total} DA</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-4 mt-4">
              <p className="text-sm text-gray-600">Payment: <span className="font-medium">{lastOrder.paymentMethod}</span></p>
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
      <div className="grid grid-cols-3 gap-6 h-[calc(100vh-120px)]">
        {/* Left: Product Search */}
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

          {/* Search results dropdown */}
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
                    })
                    setSearchQuery('')
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-white transition-colors border-b border-gray-200 last:border-0"
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{product.item_name}</p>
                    <p className="text-sm text-gray-500">Stock: {product.stock_level}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary">{product.retail_price} DA</span>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus size={16} className="text-primary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════
              POPULAR / MOST SELECTED PRODUCTS CARDS
             ═══════════════════════════════════════════════════ */}
          {!searchQuery.trim() && popularProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" />
                Popular Products
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {popularProducts.map((product) => (
                  <button
                    key={product.product_id}
                    onClick={() => {
                      addToQuickCart({
                        id: product.product_id,
                        name: product.item_name,
                        price: product.retail_price,
                      })
                    }}
                    className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.97] group"
                  >
                    <div className="w-full h-20 rounded-lg bg-gray-100 overflow-hidden mb-2.5 border border-gray-100">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.item_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={24} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 text-sm truncate leading-tight">
                      {product.item_name}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-bold text-primary text-sm">
                        {product.retail_price} DA
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
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
                ))}
              </div>
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
                {quickCart.map((item) => (
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

                      {/* ═══════════════════════════════════════
                          MANUAL QUANTITY INPUT
                         ═══════════════════════════════════════ */}
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
                        className="w-12 h-8 text-center font-bold text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />

                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                      >
                        <Plus size={14} className="text-primary" />
                      </button>
                      <span className="font-bold text-primary w-20 text-right text-sm">{item.totalPrice} DA</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Payment Panel */}
        <div className="bg-cream rounded-xl p-5 space-y-4 h-fit">

          {/* Customer Lookup */}
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
                              placeholder="Phone (optional)"
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                            />
                            <button
                              onClick={handleAddCustomer}
                              disabled={savingCustomer}
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

          {/* Totals */}
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

            <div className="border-t border-gray-200 pt-2 flex justify-between text-xl font-bold text-primary">
              <span>Total</span>
              <span>{adjustedTotal} DA</span>
            </div>
          </div>

          {/* Price Adjustment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Price Adjustment</label>
            <PriceAdjuster
              value={priceAdjustment}
              onChange={setPriceAdjustment}
              currency="DA"
              step={10}
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    className={`py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      selectedPayment === method.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 text-gray-600 hover:border-primary'
                    }`}
                  >
                    <Icon size={16} className="mx-auto mb-1" />
                    {method.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Client Source */}
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

          {/* Notes */}
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

          {/* Complete Button */}
          <button
            onClick={handleComplete}
            disabled={quickCart.length === 0 || loading}
            className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? 'Processing...' : (
              <>
                <Check size={18} />
                Complete Sale {adjustedTotal > 0 ? `(${adjustedTotal} DA)` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default QuickSale