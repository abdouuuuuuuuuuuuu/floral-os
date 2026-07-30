import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Minus, ShoppingCart, ImageIcon, Package, Trash2, Search, X, Sparkles,
  Box, AlertTriangle, Hash
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useProducts } from '../hooks/useProducts'
import { useCartContext } from '../context/CartContext'
import { useNotification } from '../context/NotificationContext'

function Cart() {
  const { products, loading } = useProducts()
  const { items, addItem, updateQuantity, removeItem, subtotal, total, clearCart } = useCartContext()
  const { addNotification } = useNotification()
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [addedProductId, setAddedProductId] = useState(null)

  const getItemQuantity = (productId) => {
    const item = items.find((i) => i.id === productId)
    return item?.quantity || 0
  }

  const getStockStatus = (stock, inCart) => {
    const remaining = stock - inCart
    if (stock === 0) return { label: 'Out', color: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }
    if (remaining <= 0) return { label: 'Max', color: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
    if (stock < 5) return { label: `${remaining}`, color: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
    if (stock < 15) return { label: `${remaining}`, color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }
    return { label: `${remaining}`, color: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  }

  const handleAddItem = (product) => {
    const result = addItem(product)
    if (!result.success) {
      addNotification(result.error || `${product.name} is out of stock!`, 'error')
      return
    }
    setAddedProductId(product.id)
    setTimeout(() => setAddedProductId(null), 400)
  }

  const handleIncrement = (item) => {
    const product = products.find((p) => p.id === item.id)
    const maxStock = product?.stock_quantity ?? item.quantity
    if (item.quantity >= maxStock) {
      addNotification(`Only ${maxStock} available in stock!`, 'error')
      return
    }
    updateQuantity(item.id, item.quantity + 1, maxStock)
  }

  const handleDecrement = (item) => {
    if (item.quantity <= 1) {
      removeItem(item.id)
      return
    }
    updateQuantity(item.id, item.quantity - 1)
  }

  const handleManualQuantity = (item, val) => {
    if (isNaN(val)) return
    const product = products.find((p) => p.id === item.id)
    const maxStock = product?.stock_quantity ?? item.quantity

    if (val > maxStock) {
      addNotification(`Only ${maxStock} available in stock!`, 'error')
    }

    updateQuantity(item.id, val, maxStock)
  }

  const categories = ['all', ...new Set(products.map((p) => p.category).filter(Boolean))]

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

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
      <div className="flex gap-5 h-[calc(100vh-120px)] min-h-[500px]">
        {/* ===== LEFT: Product Area ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search + Category Bar */}
          <div className="flex flex-col gap-3 mb-4 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 bg-white rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {cat === 'all' ? 'All Products' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Package size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm font-medium">
                    {searchQuery ? 'No products match your search' : 'No products in this category'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {filteredProducts.map((product) => {
                  const qty = getItemQuantity(product.id)
                  const isOutOfStock = product.stock_quantity === 0
                  const isMaxed = qty >= product.stock_quantity && product.stock_quantity > 0
                  const justAdded = addedProductId === product.id
                  const stockStatus = getStockStatus(product.stock_quantity, qty)

                  return (
                    <button
                      key={product.id}
                      onClick={() => !isOutOfStock && !isMaxed && handleAddItem(product)}
                      disabled={isOutOfStock || isMaxed}
                      className={`group bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all duration-200 flex flex-col text-left relative ${
                        isOutOfStock || isMaxed
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]'
                      } ${justAdded ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}
                    >
                      <div className="aspect-square bg-gray-50 relative overflow-hidden">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        ) : null}
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-gray-50"
                          style={{ display: product.image_url ? 'none' : 'flex' }}
                        >
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                            <ImageIcon size={24} className="text-gray-300" />
                          </div>
                        </div>

                        <div className="absolute top-2 left-2">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${stockStatus.bg} ${stockStatus.border} border shadow-sm backdrop-blur-sm`}>
                            <Box size={10} className={stockStatus.text} />
                            <span className={`text-[10px] font-bold ${stockStatus.text}`}>
                              {isOutOfStock ? 'Out' : isMaxed ? 'Max' : `${stockStatus.label} left`}
                            </span>
                          </div>
                        </div>

                        {qty > 0 && (
                          <div className="absolute top-2 right-2">
                            <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md ring-2 ring-white">
                              {qty}
                            </div>
                          </div>
                        )}

                        {!isOutOfStock && !isMaxed && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200">
                            <div className="w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
                              <Plus size={20} className="text-primary" />
                            </div>
                          </div>
                        )}

                        {(isOutOfStock || isMaxed) && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                              isOutOfStock ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                            }`}>
                              {isOutOfStock ? 'Out of Stock' : 'Max in Cart'}
                            </span>
                          </div>
                        )}

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent pt-8 pb-2.5 px-3">
                          <p className="text-white font-black text-sm drop-shadow-md">
                            {product.price.toLocaleString('fr-FR')} <span className="text-[10px] font-medium opacity-80">DA</span>
                          </p>
                        </div>
                      </div>

                      <div className="p-3 flex flex-col gap-1">
                        <p className="font-bold text-gray-900 text-xs leading-tight line-clamp-2 min-h-[2rem]">
                          {product.name}
                        </p>
                        <div className="flex items-center justify-between mt-0.5">
                          <div className="flex items-center gap-1">
                            <Hash size={10} className="text-gray-400" />
                            <span className="text-[10px] text-gray-400 font-medium">Stock: {product.stock_quantity}</span>
                          </div>
                          {qty > 0 && (
                            <span className="text-[10px] font-bold text-primary">
                              {qty} in cart
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-gray-200/60 flex justify-between items-center text-xs text-gray-400 shrink-0">
            <span>{filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}</span>
            <span>{items.length} item{items.length !== 1 ? 's' : ''} in cart</span>
          </div>
        </div>

        {/* ===== RIGHT: Cart Panel ===== */}
        <div className="w-[340px] bg-white rounded-2xl border border-gray-100 flex flex-col shadow-sm overflow-hidden shrink-0">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart size={16} className="text-primary" />
              </div>
              <h2 className="text-sm font-bold text-gray-900">Cart</h2>
              {items.length > 0 && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[11px] font-bold">
                  {items.length}
                </span>
              )}
            </div>
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={12} />
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-3 border border-gray-100">
                  <ShoppingCart size={24} className="text-gray-300" />
                </div>
                <p className="text-gray-500 text-sm font-semibold">Your cart is empty</p>
                <p className="text-gray-400 text-xs mt-1">Click a product to add it</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex gap-3 items-start hover:border-primary/20 transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-gray-50 flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-100">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <ImageIcon size={16} className="text-gray-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-xs leading-tight truncate">{item.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{item.price.toLocaleString('fr-FR')} DA each</p>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleDecrement(item)}
                        className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95"
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
                          handleManualQuantity(item, val)
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value)
                          if (isNaN(val) || val < 1) {
                            handleManualQuantity(item, 1)
                          }
                        }}
                        className="w-10 h-7 text-center font-bold text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />

                      <button
                        onClick={() => handleIncrement(item)}
                        className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors active:scale-95 shadow-sm"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <p className="font-bold text-sm text-primary tabular-nums">{item.totalPrice.toLocaleString('fr-FR')} DA</p>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals + Checkout */}
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/30 shrink-0">
            <div className="space-y-1.5 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-700 tabular-nums">{subtotal.toLocaleString('fr-FR')} DA</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-dashed border-gray-200">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-xl font-black text-primary tabular-nums">{total.toLocaleString('fr-FR')} DA</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/checkout')}
              disabled={items.length === 0}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                items.length === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-200 active:scale-[0.98]'
              }`}
            >
              <Sparkles size={16} />
              Proceed to Checkout {total > 0 ? `(${total.toLocaleString('fr-FR')} DA)` : ''}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Cart