import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Minus, ShoppingCart, ImageIcon, Package, Trash2, Search, X, ArrowRight,
  Box, Check, SlidersHorizontal,
  Flower2, Candy, Gift,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import RecentQuickSales from '../components/RecentQuickSales'
import { useProducts } from '../hooks/useProducts'
import { useCartContext } from '../context/CartContext'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { useUndo } from '../context/UndoContext'

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIG (mirrors Products & QuickSale pages)
// ═══════════════════════════════════════════════════════════════════════════════
const CATEGORY_CONFIG = {
  'Flowers': {
    icon: Flower2,
    color: '#C41E63',
    bg: 'bg-accent-subtle',
    text: 'text-accent',
    border: 'border-accent/15',
  },
  'Chocolates': {
    icon: Candy,
    color: '#8A5300',
    bg: 'bg-warning-subtle',
    text: 'text-warning',
    border: 'border-warning/15',
  },
  'Gifts': {
    icon: Gift,
    color: '#462C7D',
    bg: 'bg-primary-subtle',
    text: 'text-primary',
    border: 'border-primary/15',
  },
}

const getCategoryConfig = (catName) =>
  CATEGORY_CONFIG[catName] || {
    icon: Package,
    color: '#6B6478',
    bg: 'bg-sage',
    text: 'text-gray-600',
    border: 'border-sage-dark',
  }

const FLOWER_SUBFILTERS = [
  { id: 'chrysanthemums', label: 'Chrysanthemums', terms: ['chrysanthemum', 'chrysanthmum'] },
  { id: 'lilies', label: 'Lilies', terms: ['lily', 'lilies'] },
  { id: 'branches', label: 'Branches', terms: ['branch', 'branches'] },
  { id: 'alstroemeria', label: 'Alstroemeria', terms: ['alstroemeria', 'alstromeria', 'alstromerya'] },
  { id: 'roses', label: 'Roses', terms: ['rose', 'roses'] },
]

const normalizeFilterValue = (value) => String(value || '').trim().toLocaleLowerCase()
const normalizeSearchValue = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()

const getFlowerSubfilterFromValue = (value) => {
  const normalized = normalizeFilterValue(value)
  return FLOWER_SUBFILTERS.find(({ terms }) => terms.some((term) => normalized === term || normalized.includes(term)))?.id || null
}

const getFlowerSubfilter = (product) => {
  const explicitType = getFlowerSubfilterFromValue(product.flower_type)
  if (explicitType) return explicitType

  const categoryType = getFlowerSubfilterFromValue(product.category)
  if (categoryType) return categoryType

  // Product names are a fallback for items kept in the general Flowers category.
  return product.category?.toLocaleLowerCase() === 'flowers'
    ? getFlowerSubfilterFromValue(product.name)
    : null
}

const getAutomaticCategoryGroup = (product) => {
  const words = String(product.name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const label = words.slice(0, 2).join(' ')
  return { id: `category:${normalizeFilterValue(label)}`, label }
}

function CartPanel({ items, unitCount, subtotal, total, startedAsQuickSale, onClear, onDecrement, onIncrement, onQuantityChange, onRemove, onCheckout, onClose, isMobile = false }) {
  return (
    <section aria-label="Cart summary" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-sage-dark/80 bg-white shadow-md shadow-gray-900/[0.04]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-sage-dark/70 bg-gradient-to-r from-white to-primary-subtle/40 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary"><ShoppingCart size={18} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-gray-900">{startedAsQuickSale ? 'Quick sale' : 'Order cart'}</h2>
              {startedAsQuickSale && <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-2xs font-semibold text-accent">Quick sale</span>}
            </div>
            <p className="mt-0.5 text-2xs text-gray-500">{items.length} line{items.length === 1 ? '' : 's'} · {unitCount} unit{unitCount === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {items.length > 0 && <button type="button" onClick={onClear} aria-label="Clear cart" title="Clear cart" className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-danger-subtle hover:text-danger"><Trash2 size={15} /></button>}
          {isMobile && <button type="button" onClick={onClose} aria-label="Close cart" className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-sage"><X size={18} /></button>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {items.length === 0 ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center px-4 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sage text-primary"><ShoppingCart size={24} /></div>
            <p className="text-sm font-semibold text-gray-800">Your cart is empty</p>
            <p className="mt-1 max-w-52 text-xs leading-relaxed text-gray-500">Choose a product from the catalog. It will appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-xl border border-sage-dark/70 bg-white p-3 transition-colors hover:border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-sage text-gray-400">
                    <ImageIcon size={17} />
                    {item.image_url && <img src={item.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => event.currentTarget.remove()} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-snug text-gray-900">{item.name}</p>
                    <p className="mt-1 text-2xs text-gray-500">{item.price.toLocaleString('fr-FR')} DA each</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-primary">{item.totalPrice.toLocaleString('fr-FR')} DA</p>
                    <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name} from cart`} title="Remove item" className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-medium text-gray-400 transition hover:bg-danger-subtle hover:text-danger"><Trash2 size={12} /> Remove</button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-sage-dark/60 pt-3">
                  <span className="text-xs text-gray-500">Quantity</span>
                  <div className="flex items-center rounded-lg border border-sage-dark bg-sage/50 p-0.5">
                    <button type="button" onClick={() => onDecrement(item)} disabled={item.quantity <= 1} aria-label={`Decrease ${item.name} quantity`} className="grid h-9 w-9 place-items-center rounded-md text-gray-600 transition hover:bg-white hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"><Minus size={15} /></button>
                    <input type="number" inputMode="numeric" min="1" step="1" value={item.quantity} onChange={(event) => onQuantityChange(item, Number.parseInt(event.target.value, 10))} onBlur={(event) => { const quantity = Number.parseInt(event.target.value, 10); if (!Number.isInteger(quantity) || quantity < 1) onQuantityChange(item, item.quantity) }} aria-label={`Quantity for ${item.name}`} className="h-9 w-12 border-x border-sage-dark/70 bg-transparent text-center text-sm font-semibold tabular-nums text-gray-900 outline-none focus:bg-white" />
                    <button type="button" onClick={() => onIncrement(item)} aria-label={`Increase ${item.name} quantity`} className="grid h-9 w-9 place-items-center rounded-md text-primary transition hover:bg-white"><Plus size={15} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-sage-dark/70 bg-white px-4 py-4 shadow-[0_-8px_24px_rgba(31,41,55,0.04)] sm:px-5">
        {Math.round(subtotal) !== Math.round(total) && <div className="mb-2 flex justify-between text-xs text-gray-500"><span>Subtotal</span><span className="tabular-nums">{subtotal.toLocaleString('fr-FR')} DA</span></div>}
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order total</p><p className="mt-1 text-2xl font-bold leading-none tabular-nums text-gray-900">{total.toLocaleString('fr-FR')} <span className="text-sm font-semibold text-gray-500">DA</span></p></div>
          {items.length > 0 && <p className="pb-0.5 text-right text-2xs text-gray-500">{unitCount} unit{unitCount === 1 ? '' : 's'}</p>}
        </div>
        <button type="button" onClick={onCheckout} disabled={items.length === 0} className="flex min-h-[52px] w-full items-center justify-between rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-md shadow-accent/20 transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none">
          <span>{startedAsQuickSale ? 'Continue quick sale' : 'Continue to checkout'}</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15"><ArrowRight size={16} /></span>
        </button>
      </footer>
    </section>
  )
}

function Cart() {
  const { user } = useAuth()
  const { products, loading } = useProducts()
  const { items, addItem, updateQuantity, removeItem, subtotal, total, clearCart, unitCount } = useCartContext()
  const { addNotification } = useNotification()
  const { offerUndo } = useUndo()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const startedAsQuickSale = searchParams.get('mode') === 'quick_sale'
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedFlowerType, setSelectedFlowerType] = useState('all')
  const [selectedFlowerColor, setSelectedFlowerColor] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)
  const [addedProductId, setAddedProductId] = useState(null)
  const [sortMode, setSortMode] = useState('recommended')
  const [showMobileCart, setShowMobileCart] = useState(false)
  const preferenceKey = `blossom.cart-product-clicks:${user?.id || 'guest'}`
  const [clickHistory, setClickHistory] = useState({})

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}')
      setClickHistory(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {})
    } catch {
      setClickHistory({})
    }
  }, [preferenceKey])

  const recordProductClick = (productId) => {
    const key = String(productId)
    setClickHistory((previous) => {
      const prior = previous[key] || { count: 0 }
      const next = {
        ...previous,
        [key]: { count: Math.min(100, Number(prior.count || 0) + 1), lastClickedAt: Date.now() },
      }
      try { localStorage.setItem(preferenceKey, JSON.stringify(next)) } catch { /* ranking is optional */ }
      return next
    })
  }

  const productAffinity = (product) => {
    const history = clickHistory[String(product.id)]
    if (!history?.lastClickedAt || !history.count) return 0
    const ageDays = Math.max(0, (Date.now() - history.lastClickedAt) / 86400000)
    const recency = Math.exp(-ageDays / 21)
    // Repeated choices get a gentle boost; old behavior fades over time.
    return Math.log2(Number(history.count) + 1) * recency
  }

  const productClass = (product) => {
    const history = clickHistory[String(product.id)]
    if (!history?.count) return 'catalog'
    const ageDays = Math.max(0, (Date.now() - history.lastClickedAt) / 86400000)
    if (history.count >= 3) return 'frequent'
    if (ageDays <= 14) return 'recent'
    return 'catalog'
  }

  const getItemQuantity = (productId) => {
    const item = items.find((i) => i.id === productId)
    return item?.quantity || 0
  }

  const getStockStatus = (stock, inCart) => {
    const remaining = stock - inCart
    if (remaining <= 0) return { label: '0 left', text: 'text-danger', bg: 'bg-danger-subtle', border: 'border-danger/15' }
    if (remaining < 5) return { label: `${remaining} left`, text: 'text-warning', bg: 'bg-warning-subtle', border: 'border-warning/15' }
    return { label: `${remaining} left`, text: 'text-gray-500', bg: 'bg-sage', border: 'border-sage-dark/70' }
  }

  const handleAddItem = (product) => {
    recordProductClick(product.id)
    const result = addItem(product)

    // The item is always added now — matching Quick Sale, where a
    // florist can sell what's physically on the bench regardless of a
    // stale count. A low count is a warning to recount, not a reason to
    // turn away a customer standing at the counter.
    if (result.warning) {
      addNotification(result.warning, 'warning')
    }

    setAddedProductId(product.id)
    setTimeout(() => setAddedProductId(null), 400)
  }

  const handleIncrement = (item) => {
    const product = products.find((p) => p.id === item.id)

    // useProducts maps stock_level -> stock_quantity, so that's the
    // field here. The old check blocked at stock; now it warns and lets
    // the sale through, matching Quick Sale.
    const stock = product?.stock_quantity ?? 0
    const next = item.quantity + 1

    updateQuantity(item.id, next)

    if (next > stock) {
      addNotification(
        stock <= 0
          ? `${item.name} shows 0 in stock — recount needed`
          : `Only ${stock} in stock — the count will go negative`,
        'warning'
      )
    }
  }

  const handleRemoveItem = (itemId) => {
    const snapshot = items.find((item) => item.id === itemId)
    if (!snapshot) return removeItem(itemId)
    removeItem(itemId)
    offerUndo({
      message: `${snapshot.name} removed from cart`,
      onUndo: async () => {
        addItem(snapshot)
        updateQuantity(snapshot.id, snapshot.quantity)
      },
    })
  }

  const handleDecrement = (item) => {
    if (item.quantity <= 1) {
      handleRemoveItem(item.id)
      return
    }
    updateQuantity(item.id, item.quantity - 1)
  }

  const handleManualQuantity = (item, val) => {
    if (!Number.isInteger(val) || val < 1) return
    const product = products.find((p) => p.id === item.id)
    const stock = product?.stock_quantity ?? 0

    // Warn, don't clamp. Typing 12 and silently getting 3 with no
    // explanation is worse than an inaccurate stock count.
    updateQuantity(item.id, val)

    if (val > stock) {
      addNotification(
        `Only ${stock} in stock — the count will go negative`,
        'warning'
      )
    }
  }

  const handleClearCart = () => {
    const snapshot = items.map((item) => ({ ...item }))
    clearCart()
    offerUndo({
      message: 'Cart cleared',
      onUndo: async () => {
        snapshot.forEach((item) => {
          addItem(item)
          updateQuantity(item.id, item.quantity)
        })
      },
    })
  }

  const productCategories = [...new Set(products.map((p) => p.category).filter(Boolean))]
  const categories = ['all', ...productCategories, ...(productCategories.some((category) => category.toLocaleLowerCase() === 'flowers') ? [] : ['Flowers'])]

  const selectedCategoryFlowerType = getFlowerSubfilterFromValue(selectedCategory)
  const flowerCategorySelected = selectedCategory.toLocaleLowerCase() === 'flowers'
  const showFlowerSubfilters = selectedCategory === 'all' || flowerCategorySelected || Boolean(selectedCategoryFlowerType)
  const flowerProducts = products.filter((product) => getFlowerSubfilter(product))
  const availableFlowerTypes = FLOWER_SUBFILTERS.filter(({ id }) => flowerProducts.some((product) => getFlowerSubfilter(product) === id))
  const categoryProducts = selectedCategory !== 'all' && !flowerCategorySelected && !selectedCategoryFlowerType
    ? products.filter((product) => product.category === selectedCategory)
    : []
  const automaticCategoryGroups = [...new Map(categoryProducts.map((product) => {
    const group = getAutomaticCategoryGroup(product)
    return group ? [group.id, group] : null
  }).filter(Boolean)).values()].sort((a, b) => a.label.localeCompare(b.label))
  const visibleSubfilters = showFlowerSubfilters
    ? [{ id: 'all', label: 'All flowers' }, ...availableFlowerTypes]
    : [{ id: 'all', label: `All ${selectedCategory.toLocaleLowerCase()}` }, ...automaticCategoryGroups]
  const availableFlowerColors = selectedFlowerType === 'all' ? [] : [...new Set(
    flowerProducts
      .filter((product) => getFlowerSubfilter(product) === selectedFlowerType)
      .map((product) => product.color)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b))
  const categorySubfilterProducts = selectedFlowerType.startsWith('category:')
    ? categoryProducts.filter((product) => getAutomaticCategoryGroup(product)?.id === selectedFlowerType)
    : []
  const categoryColors = categoryProducts.length > 0
    ? [...new Set((selectedFlowerType.startsWith('category:') ? categorySubfilterProducts : categoryProducts).map((product) => product.color).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    : []
  const availableFilterColors = selectedFlowerType !== 'all' ? availableFlowerColors : categoryColors

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all'
      || (flowerCategorySelected ? p.category?.toLocaleLowerCase() === 'flowers' || Boolean(getFlowerSubfilter(p)) : selectedCategoryFlowerType ? getFlowerSubfilter(p) === selectedCategoryFlowerType : p.category === selectedCategory)
    const searchableProduct = normalizeSearchValue(`${p.name} ${p.color} ${p.flower_type} ${p.category} ${p.description}`)
    const matchesSearch = !searchQuery || searchableProduct.includes(normalizeSearchValue(searchQuery))
    const activeFlowerType = selectedFlowerType !== 'all' ? selectedFlowerType : selectedCategoryFlowerType
    const matchesFlowerType = !activeFlowerType
      || (activeFlowerType.startsWith('category:') ? getAutomaticCategoryGroup(p)?.id === activeFlowerType : getFlowerSubfilter(p) === activeFlowerType)
    const matchesFlowerColor = selectedFlowerColor === 'all' || normalizeFilterValue(p.color) === normalizeFilterValue(selectedFlowerColor)
    return matchesCategory && matchesSearch && matchesFlowerType && matchesFlowerColor
  })

  // Recommended ordering learns from this staff member's recent product picks.
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (a.category === 'Flowers' && b.category !== 'Flowers') return -1
    if (a.category !== 'Flowers' && b.category === 'Flowers') return 1
    if (sortMode === 'name') return a.name.localeCompare(b.name)
    if (a.category === b.category) {
      const affinityDifference = productAffinity(b) - productAffinity(a)
      if (Math.abs(affinityDifference) > 0.001) return affinityDifference
      return a.name.localeCompare(b.name)
    }
    return 0
  })

  useEffect(() => {
    if (!showMobileCart) return undefined
    const handleKeyDown = (event) => { if (event.key === 'Escape') setShowMobileCart(false) }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showMobileCart])

  // ── Group by category for visual sections ─────────────────────────────────
  const productsByCategory = sortedProducts.reduce((acc, p) => {
    const cat = p.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})
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
      <main className="mx-auto max-w-[1600px] pb-24 xl:pb-0">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{startedAsQuickSale ? 'Quick sale' : 'Order workspace'}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{startedAsQuickSale ? 'Build a quick sale' : 'Build an order'}</h1>
            <p className="mt-1 text-sm text-gray-500">Search the catalog, add what you need, then review the cart.</p>
          </div>
          {startedAsQuickSale && <div className="flex flex-wrap items-center gap-2"><RecentQuickSales /><span className="rounded-full border border-accent/15 bg-accent-subtle px-3 py-1.5 text-xs font-semibold text-accent">Quick sale · no delivery</span></div>}
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-5 xl:h-[calc(100vh-12rem)] xl:min-h-[32rem] xl:grid-cols-[minmax(0,1fr)_350px]">
          <section aria-label="Product catalog" className="flex min-h-[60vh] min-w-0 flex-col rounded-2xl border border-sage-dark/70 bg-white p-4 shadow-sm sm:p-5 xl:min-h-0">
            <div className="mb-4 shrink-0 space-y-3">
              <label className="relative block">
                <Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input ref={searchInputRef} type="search" placeholder="Search flowers, gifts, or product name…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Search products" className="cart-search-field min-h-12 w-full rounded-xl border pl-11 pr-11 text-sm outline-none transition" />
                {searchQuery && <button type="button" onClick={() => { setSearchQuery(''); window.requestAnimationFrame(() => searchInputRef.current?.focus()) }} aria-label="Clear search" className="cart-search-clear absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg"><X size={16} /></button>}
              </label>
              <nav aria-label="Product categories" className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {categories.map((category) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => { setSelectedCategory(category); setSelectedFlowerType(getFlowerSubfilterFromValue(category) || 'all'); setSelectedFlowerColor('all') }} className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-semibold transition ${selectedCategory === category ? 'bg-primary text-white shadow-sm' : 'border border-sage-dark/80 bg-white text-gray-600 hover:border-primary/25 hover:text-primary'}`}>{category === 'all' ? 'All products' : category}</button>)}
              </nav>
              {visibleSubfilters.length > 1 && (
                <div className="space-y-2" aria-label="Flower type filters">
                  <nav aria-label="Flower types" className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {visibleSubfilters.map(({ id, label }) => (
                      <button key={id} type="button" aria-pressed={selectedFlowerType === id} onClick={() => { if (showFlowerSubfilters) setSelectedCategory('Flowers'); setSelectedFlowerType(id); setSelectedFlowerColor('all') }} className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold transition ${selectedFlowerType === id ? 'bg-accent text-white shadow-sm' : 'border border-accent/20 bg-accent-subtle/40 text-accent hover:bg-accent-subtle'}`}>
                        {label}
                      </button>
                    ))}
                  </nav>
                  {(selectedFlowerType !== 'all' || categoryColors.length > 0) && (selectedFlowerType.startsWith('category:') ? categoryColors : availableFilterColors).length > 0 && (
                    <nav aria-label="Product colors" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      <span className="shrink-0 text-xs font-medium text-gray-500">Color</span>
                      {[{ value: 'all', label: 'All colors' }, ...(selectedFlowerType.startsWith('category:') ? categoryColors : availableFilterColors).map((color) => ({ value: color, label: color }))].map(({ value, label }) => (
                        <button key={value} type="button" aria-pressed={selectedFlowerColor === value} onClick={() => setSelectedFlowerColor(value)} className={`min-h-8 shrink-0 rounded-full px-3 text-xs font-medium transition ${selectedFlowerColor === value ? 'bg-primary text-white' : 'border border-sage-dark/80 bg-white text-gray-600 hover:border-primary/25 hover:text-primary'}`}>
                          {label}
                        </button>
                      ))}
                    </nav>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sage-dark/60 pt-3">
                <p className="text-xs text-gray-500">{filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}{sortMode === 'recommended' && clickHistory && Object.keys(clickHistory).length > 0 ? ' · ordered from your recent picks' : ''}</p>
                <div role="group" aria-label="Product sort order" className="inline-flex rounded-lg border border-sage-dark/80 bg-sage/35 p-0.5">
                  <button type="button" aria-pressed={sortMode === 'recommended'} onClick={() => setSortMode('recommended')} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${sortMode === 'recommended' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><SlidersHorizontal size={13} className="mr-1 inline" />For you</button>
                  <button type="button" aria-pressed={sortMode === 'name'} onClick={() => setSortMode('name')} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${sortMode === 'name' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>A–Z</button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
              {sortedProducts.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sage text-gray-400"><Package size={22} /></div><p className="text-sm font-semibold text-gray-700">No products found</p><p className="mt-1 text-xs text-gray-500">Try another name or choose a different category.</p>{(searchQuery || selectedCategory !== 'all' || selectedFlowerType !== 'all' || selectedFlowerColor !== 'all') && <button type="button" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedFlowerType('all'); setSelectedFlowerColor('all') }} className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-subtle">Clear filters</button>}</div> : Object.entries(productsByCategory).map(([catName, catProducts]) => {
                const cfg = getCategoryConfig(catName)
                const CategoryIcon = cfg.icon
                return <section key={catName} aria-label={catName}>
                  <div className="mb-3 flex items-center gap-2 px-0.5"><span className={`grid h-8 w-8 place-items-center rounded-lg ${cfg.bg} ${cfg.border} border`}><CategoryIcon size={15} style={{ color: cfg.color }} /></span><h2 className="text-sm font-semibold text-gray-800">{catName}</h2><span className="text-xs text-gray-400">{catProducts.length}</span></div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 11rem), 1fr))' }}>
                    {catProducts.map((product) => {
                      const quantity = getItemQuantity(product.id)
                      const justAdded = addedProductId === product.id
                      const stock = product.stock_quantity ?? 0
                      const stockStatus = getStockStatus(stock, quantity)
                      const productConfig = getCategoryConfig(product.category)
                      const ProductIcon = productConfig.icon
                      const historyClass = productClass(product)
                      return <button key={product.id} type="button" onClick={() => handleAddItem(product)} aria-label={quantity > 0 ? `Add another ${product.name}; ${quantity} currently in cart` : `Add ${product.name} to cart`} className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-left transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.99] ${justAdded ? 'border-accent/50 ring-2 ring-accent/15' : 'border-sage-dark/80'}`}>
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-sage/50">
                          {product.image_url && <img src={product.image_url} alt={product.name} loading="lazy" className="absolute inset-0 z-10 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden') }} />}
                          <div className={`absolute inset-0 flex items-center justify-center ${product.image_url ? 'hidden' : ''}`}><span className="grid h-14 w-14 place-items-center rounded-2xl border" style={{ backgroundColor: `${productConfig.color}12`, borderColor: `${productConfig.color}25` }}><ProductIcon size={26} style={{ color: productConfig.color }} /></span></div>
                          <span className={`absolute left-2 top-2 rounded-md border px-2 py-1 text-[10px] font-medium ${stockStatus.bg} ${stockStatus.border} ${stockStatus.text}`}><Box size={11} className="mr-1 inline" />{stockStatus.label}</span>
                          {quantity > 0 && <span className="absolute right-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-primary shadow-sm">{quantity} in cart</span>}
                        </div>
                        <div className="flex min-h-[6rem] flex-1 flex-col p-3">
                          <div className="flex min-w-0 items-start justify-between gap-2"><p className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-gray-800" title={product.name}>{product.name}</p><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent transition group-hover:bg-accent group-hover:text-white">{justAdded ? <Check size={15} /> : <Plus size={15} />}</span></div>
                          {(product.flower_type || product.color) && <div className="mt-1.5 flex flex-wrap gap-1">{product.flower_type && <span className="rounded-md bg-sage px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-600">{product.flower_type}</span>}{product.color && <span className="rounded-md bg-accent-subtle/60 px-1.5 py-0.5 text-[10px] font-medium capitalize text-accent">{product.color}</span>}</div>}
                          <div className="mt-auto flex items-end justify-between gap-2 pt-3"><p className="text-sm font-semibold tabular-nums text-primary">{product.price.toLocaleString('fr-FR')} <span className="text-xs font-medium">DA</span></p>{historyClass === 'frequent' && <span className="text-[10px] font-medium text-gray-400">Often picked</span>}{historyClass === 'recent' && <span className="text-[10px] font-medium text-gray-400">Recent</span>}</div>
                          {stock - quantity <= 0 && <p className="mt-1 text-[10px] leading-snug text-danger">Stock count needs checking. You can still add it.</p>}
                        </div>
                      </button>
                    })}
                  </div>
                </section>
              })}
            </div>
          </section>

          <aside aria-label="Cart review" className="sticky top-20 hidden h-[calc(100vh-6rem)] min-h-[32rem] xl:block">
            <CartPanel items={items} unitCount={unitCount} subtotal={subtotal} total={total} startedAsQuickSale={startedAsQuickSale} onClear={handleClearCart} onDecrement={handleDecrement} onIncrement={handleIncrement} onQuantityChange={handleManualQuantity} onRemove={handleRemoveItem} onCheckout={() => navigate(startedAsQuickSale ? '/checkout?mode=quick_sale' : '/checkout')} />
          </aside>
        </div>

        {items.length > 0 && <div className="fixed inset-x-3 bottom-3 z-30 xl:hidden"><button type="button" onClick={() => setShowMobileCart(true)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-primary px-4 text-left text-white shadow-lg shadow-primary/20"><span className="flex min-w-0 items-center gap-2"><ShoppingCart size={18} /><span className="truncate text-sm font-semibold">Review cart · {items.length} line{items.length === 1 ? '' : 's'}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums">{total.toLocaleString('fr-FR')} DA <ArrowRight size={15} className="ml-1 inline" /></span></button></div>}

        {showMobileCart && <div className="fixed inset-0 z-50 bg-gray-950/40 xl:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMobileCart(false) }}><div role="dialog" aria-modal="true" aria-label="Review cart" className="absolute inset-x-0 bottom-0 h-[88dvh] max-h-[760px] sm:inset-y-4 sm:left-auto sm:right-4 sm:h-auto sm:w-full sm:max-w-md" onMouseDown={(event) => event.stopPropagation()}><CartPanel isMobile items={items} unitCount={unitCount} subtotal={subtotal} total={total} startedAsQuickSale={startedAsQuickSale} onClear={handleClearCart} onDecrement={handleDecrement} onIncrement={handleIncrement} onQuantityChange={handleManualQuantity} onRemove={handleRemoveItem} onCheckout={() => navigate(startedAsQuickSale ? '/checkout?mode=quick_sale' : '/checkout')} onClose={() => setShowMobileCart(false)} /></div></div>}
      </main>
    </DashboardLayout>
  )
}

export default Cart
