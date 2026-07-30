import { useState, useMemo, useEffect } from 'react'
import { 
  Plus, Search, Pencil, Trash2, Package, X, Check, 
  AlertCircle, TrendingDown, TrendingUp, Minus, Hash, 
  Flower2, Gift, Candy, Droplets, 
  Flower, Leaf, TreePine, Sprout, Sun, Sparkles,
  Cookie, Coffee, IceCreamCone, Cake, CakeSlice,
  Gem, Diamond, Crown, Star, Heart, Award, Medal,
  Box, ShoppingBag, Tag,
  Smartphone, Laptop, Monitor, Headphones, Camera,
  Shirt, Watch, Scissors,
  Home, Sofa, Lamp, Bed,
  Car, Bike, Plane, Train, Ship,
  Apple, Cherry, Grape, Citrus, Wine, Beer, GlassWater,
  Cat, Dog, Bird, Fish,
  Music, Radio, Tv, Gamepad2,
  Wrench,
  HeartPulse, Pill, Stethoscope, FlaskConical,
  Cloud, Moon, SunDim, Flame, Snowflake,
  BookOpen, PenTool, Puzzle, Map, Globe, Anchor, Compass, Zap, Battery, Plug, Trophy, Target,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useProductsAdmin } from '../hooks/useProductsAdmin'
import { useNotification } from '../context/NotificationContext'

const CATEGORY_CONFIG = {
  'Flowers': { 
    icon: Flower2, 
    productIcon: Flower,
    color: '#E91E63', 
    bg: 'bg-pink-50', 
    border: 'border-pink-200', 
    text: 'text-pink-600',
    cardBg: 'bg-gradient-to-br from-pink-50 to-rose-50',
    cardBorder: 'border-pink-200',
    headerBg: 'bg-pink-100',
  },
  'Chocolates': { 
    icon: Candy, 
    productIcon: Cookie,
    color: '#795548', 
    bg: 'bg-amber-50', 
    border: 'border-amber-200', 
    text: 'text-amber-700',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    cardBorder: 'border-amber-200',
    headerBg: 'bg-amber-100',
  },
  'Gifts': { 
    icon: Gift, 
    productIcon: Gem,
    color: '#9C27B0', 
    bg: 'bg-purple-50', 
    border: 'border-purple-200', 
    text: 'text-purple-600',
    cardBg: 'bg-gradient-to-br from-purple-50 to-violet-50',
    cardBorder: 'border-purple-200',
    headerBg: 'bg-purple-100',
  },
  'Uncategorized': { 
    icon: Package, 
    productIcon: Box,
    color: '#6B7280', 
    bg: 'bg-gray-50', 
    border: 'border-gray-200', 
    text: 'text-gray-500',
    cardBg: 'bg-gradient-to-br from-gray-50 to-slate-50',
    cardBorder: 'border-gray-200',
    headerBg: 'bg-gray-100',
  },
}

const getProductIcon = (productName = '', category = '') => {
  const name = productName.toLowerCase()
  
  if (name.includes('rose')) return Flower
  if (name.includes('tulip')) return Flower2
  if (name.includes('lily') || name.includes('lys')) return Leaf
  if (name.includes('sunflower') || name.includes('tournesol')) return Sun
  if (name.includes('orchid') || name.includes('orchidée')) return Sparkles
  if (name.includes('sprout') || name.includes('germ')) return Sprout
  if (name.includes('tree') || name.includes('arbre')) return TreePine
  if (category === 'Flowers') return Flower2
  
  if (name.includes('truffle') || name.includes('truffe')) return Diamond
  if (name.includes('praline')) return Heart
  if (name.includes('dark') || name.includes('noir')) return Moon
  if (name.includes('milk') || name.includes('lait')) return Coffee
  if (name.includes('white') || name.includes('blanc')) return Snowflake
  if (name.includes('cake') || name.includes('gâteau')) return Cake
  if (name.includes('ice') || name.includes('glace')) return IceCreamCone
  if (name.includes('cookie') || name.includes('biscuit')) return Cookie
  if (category === 'Chocolates') return Candy
  
  if (name.includes('watch') || name.includes('montre')) return Watch
  if (name.includes('jewelry') || name.includes('bijou')) return Gem
  if (name.includes('ring') || name.includes('bague')) return Diamond
  if (name.includes('crown') || name.includes('couronne')) return Crown
  if (name.includes('toy') || name.includes('jouet')) return Gamepad2
  if (name.includes('book') || name.includes('livre')) return BookOpen
  if (name.includes('card') || name.includes('carte')) return Heart
  if (name.includes('pen') || name.includes('stylo')) return PenTool
  if (name.includes('star') || name.includes('étoile')) return Star
  if (name.includes('trophy') || name.includes('trophée')) return Trophy
  if (name.includes('medal') || name.includes('médaille')) return Medal
  if (name.includes('award') || name.includes('prix')) return Award
  if (name.includes('shirt') || name.includes('t-shirt') || name.includes('chemise')) return Shirt
  if (name.includes('scissors') || name.includes('ciseaux')) return Scissors
  if (name.includes('bag') || name.includes('sac')) return ShoppingBag
  if (name.includes('phone') || name.includes('téléphone')) return Smartphone
  if (name.includes('laptop') || name.includes('ordinateur')) return Laptop
  if (name.includes('camera') || name.includes('appareil')) return Camera
  if (name.includes('headphone') || name.includes('casque')) return Headphones
  if (name.includes('tv') || name.includes('télé')) return Tv
  if (name.includes('radio')) return Radio
  if (name.includes('music') || name.includes('musique')) return Music
  if (name.includes('map') || name.includes('carte')) return Map
  if (name.includes('globe') || name.includes('monde')) return Globe
  if (name.includes('anchor') || name.includes('ancre')) return Anchor
  if (name.includes('compass') || name.includes('boussole')) return Compass
  if (name.includes('puzzle')) return Puzzle
  if (name.includes('home') || name.includes('maison')) return Home
  if (name.includes('sofa') || name.includes('canapé')) return Sofa
  if (name.includes('lamp') || name.includes('lampe')) return Lamp
  if (name.includes('bed') || name.includes('lit')) return Bed
  if (name.includes('car') || name.includes('voiture')) return Car
  if (name.includes('bike') || name.includes('vélo')) return Bike
  if (name.includes('plane') || name.includes('avion')) return Plane
  if (name.includes('train')) return Train
  if (name.includes('ship') || name.includes('bateau')) return Ship
  if (name.includes('apple') || name.includes('pomme')) return Apple
  if (name.includes('cherry') || name.includes('cerise')) return Cherry
  if (name.includes('grape') || name.includes('raisin')) return Grape
  if (name.includes('orange') || name.includes('citron')) return Citrus
  if (name.includes('wine') || name.includes('vin')) return Wine
  if (name.includes('beer') || name.includes('bière')) return Beer
  if (name.includes('water') || name.includes('eau')) return GlassWater
  if (name.includes('cat') || name.includes('chat')) return Cat
  if (name.includes('dog') || name.includes('chien')) return Dog
  if (name.includes('bird') || name.includes('oiseau')) return Bird
  if (name.includes('fish') || name.includes('poisson')) return Fish
  if (name.includes('heart') || name.includes('cœur')) return HeartPulse
  if (name.includes('pill') || name.includes('médicament')) return Pill
  if (name.includes('health') || name.includes('santé')) return Stethoscope
  if (name.includes('lab') || name.includes('labo')) return FlaskConical
  if (name.includes('cloud')) return Cloud
  if (name.includes('flame') || name.includes('feu')) return Flame
  if (name.includes('zap') || name.includes('éclair')) return Zap
  if (name.includes('battery') || name.includes('batterie')) return Battery
  if (name.includes('plug') || name.includes('prise')) return Plug
  if (name.includes('target') || name.includes('cible')) return Target
  if (name.includes('wrench') || name.includes('clé')) return Wrench
  if (category === 'Gifts') return Gift
  
  return Package
}

function Products() {
  const { products, categories, loading, saving, createProduct, updateProduct, removeStock, deleteProduct } = useProductsAdmin()
  const { addNotification } = useNotification()

  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [removingProduct, setRemovingProduct] = useState(null)
  const [stockFilter, setStockFilter] = useState('all')
  const [activeCategory, setActiveCategory] = useState('all')
  const [viewMode, setViewMode] = useState('grid')

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  const [removeQuantity, setRemoveQuantity] = useState('')
  const [removeReason, setRemoveReason] = useState('')

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowModal(false)
        setShowRemoveModal(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const getStockStatus = (level) => {
    if (level === 0) return { label: 'Out of Stock', variant: 'out', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle, dot: 'bg-red-500', barColor: 'bg-red-400' }
    if (level < 10) return { label: `${level} left`, variant: 'low', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: TrendingDown, dot: 'bg-amber-500', barColor: 'bg-amber-400' }
    if (level < 30) return { label: `${level} in stock`, variant: 'medium', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: Minus, dot: 'bg-blue-500', barColor: 'bg-blue-400' }
    return { label: `${level} in stock`, variant: 'good', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: TrendingUp, dot: 'bg-emerald-500', barColor: 'bg-emerald-400' }
  }

  const getCategoryConfig = (catName) => {
    return CATEGORY_CONFIG[catName] || CATEGORY_CONFIG['Uncategorized']
  }

  const filteredProducts = useMemo(() => {
    let result = products

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.item_name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      )
    }

    if (activeCategory !== 'all') {
      result = result.filter(p => p.category === activeCategory)
    }

    if (stockFilter !== 'all') {
      result = result.filter(p => {
        const level = p.stock_level || 0
        if (stockFilter === 'out') return level === 0
        if (stockFilter === 'low') return level > 0 && level < 10
        if (stockFilter === 'in-stock') return level >= 10
        return true
      })
    }

    return result
  }, [products, searchQuery, stockFilter, activeCategory])

  const productsByCategory = useMemo(() => {
    const grouped = {
      'Flowers': [],
      'Chocolates': [],
      'Gifts': [],
      'Uncategorized': [],
    }

    filteredProducts.forEach(p => {
      const cat = p.category || 'Uncategorized'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(p)
    })

    return grouped
  }, [filteredProducts])

  const stockStats = useMemo(() => {
    const total = products.length
    const out = products.filter(p => (p.stock_level || 0) === 0).length
    const low = products.filter(p => {
      const l = p.stock_level || 0
      return l > 0 && l < 10
    }).length
    const good = products.filter(p => (p.stock_level || 0) >= 10).length
    return { total, out, low, good }
  }, [products])

  const resetForm = () => {
    setName('')
    setPrice('')
    setStock('')
    setCategory('')
    setDescription('')
    setImageUrl('')
    setEditingProduct(null)
  }

  const resetRemoveForm = () => {
    setRemoveQuantity('')
    setRemoveReason('')
    setRemovingProduct(null)
  }

  const openAddModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setName(product.item_name || '')
    setPrice(product.retail_price || '')
    setStock(product.stock_level || '')
    setCategory(product.category || '')
    setDescription(product.description || '')
    setImageUrl(product.image_url || '')
    setShowModal(true)
  }

  const openRemoveModal = (product) => {
    setRemovingProduct(product)
    setRemoveQuantity('')
    setRemoveReason('')
    setShowRemoveModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const productData = {
      item_name: name.trim(),
      retail_price: parseInt(price) || 0,
      stock_level: parseInt(stock) || 0,
      category: category || 'Uncategorized',
      description: description.trim(),
      image_url: imageUrl.trim() || null,
    }

    let result
    if (editingProduct) {
      result = await updateProduct(editingProduct.product_id, productData)
      if (result.success) {
        addNotification(`"${name}" updated successfully!`, 'success')
      }
    } else {
      result = await createProduct(productData)
      if (result.success) {
        addNotification(`"${name}" added to catalog!`, 'success')
      }
    }

    if (!result.success) {
      addNotification(`Error: ${result.error}`, 'error')
      return
    }

    setShowModal(false)
    resetForm()
  }

  const handleRemoveStock = async (e) => {
    e.preventDefault()

    if (!removingProduct) return

    const qty = parseInt(removeQuantity) || 0
    if (qty <= 0) {
      addNotification('Please enter a valid quantity', 'error')
      return
    }

    if (qty > (removingProduct.stock_level || 0)) {
      addNotification(`Cannot remove more than ${removingProduct.stock_level} in stock`, 'error')
      return
    }

    const result = await removeStock(
      removingProduct.product_id,
      qty,
      removeReason.trim() || 'Damaged/Spoiled'
    )

    if (result.success) {
      addNotification(
        `Removed ${qty} ${removingProduct.item_name}(s). ${result.remaining} remaining in stock.`,
        'warning'
      )
      setShowRemoveModal(false)
      resetRemoveForm()
    } else {
      addNotification(`Error: ${result.error}`, 'error')
    }
  }

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.item_name}"? This cannot be undone.`)) return

    const result = await deleteProduct(product.product_id)
    if (result.success) {
      addNotification(`"${product.item_name}" deleted.`, 'success')
    } else {
      addNotification(`Error: ${result.error}`, 'error')
    }
  }

  const handleToggleActive = async (product) => {
    const result = await updateProduct(product.product_id, { is_active: !product.is_active })
    if (result.success) {
      addNotification(
        `"${product.item_name}" is now ${!product.is_active ? 'active' : 'inactive'}.`,
        'success'
      )
    } else {
      addNotification(`Error: ${result.error}`, 'error')
    }
  }

  const renderProductCard = (product, index, categoryName = '') => {
    const stockStatus = getStockStatus(product.stock_level || 0)
    const StockIcon = stockStatus.icon
    const catConfig = getCategoryConfig(product.category)
    const isFlower = product.category === 'Flowers'
    const ProductIcon = getProductIcon(product.item_name, product.category)
    
    const uniqueKey = `prod-${categoryName}-${product.product_id}-${index}`

    return (
      <div
        key={uniqueKey}
        className={`group relative rounded-2xl border-2 overflow-hidden hover:shadow-xl transition-all duration-300 ${
          !product.is_active ? 'opacity-50 grayscale' : ''
        } ${catConfig.cardBg} ${catConfig.cardBorder}`}
      >
        <div className={`${catConfig.headerBg} h-2 w-full`} />
        
        <div className="h-40 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-4 left-4 w-20 h-20 rounded-full bg-current" style={{ color: catConfig.color }} />
            <div className="absolute bottom-4 right-4 w-16 h-16 rounded-full bg-current" style={{ color: catConfig.color }} />
          </div>
          
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div 
              className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ 
                backgroundColor: catConfig.color + '15',
                border: `2px solid ${catConfig.color}30`
              }}
            >
              <ProductIcon size={40} style={{ color: catConfig.color }} />
            </div>
          </div>

          <div className="absolute top-4 left-4">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${stockStatus.bg} ${stockStatus.border} border shadow-sm backdrop-blur-sm`}>
              <div className={`w-2 h-2 rounded-full ${stockStatus.dot} animate-pulse`} />
              <StockIcon size={12} className={stockStatus.color} />
              <span className={`text-[11px] font-bold ${stockStatus.color}`}>
                {stockStatus.label}
              </span>
            </div>
          </div>

          {isFlower && (product.stock_level || 0) > 0 && (
            <button
              onClick={() => openRemoveModal(product)}
              className="absolute top-4 right-14 w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm bg-white text-rose-500 hover:bg-rose-50"
              title="Remove damaged/spoiled flowers"
            >
              <Droplets size={14} />
            </button>
          )}

          <button
            onClick={() => handleToggleActive(product)}
            className={`absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm ${
              product.is_active
                ? 'bg-white text-emerald-600 hover:bg-emerald-50'
                : 'bg-white text-gray-400 hover:bg-gray-50'
            }`}
            title={product.is_active ? 'Active' : 'Inactive'}
          >
            {product.is_active ? <Check size={14} /> : <X size={14} />}
          </button>

          <div className="absolute bottom-4 right-4">
            <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-gray-100">
              <span className="text-lg font-black" style={{ color: catConfig.color }}>
                {product.retail_price?.toLocaleString('fr-FR')} <span className="text-xs font-medium text-gray-400">DA</span>
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/60 backdrop-blur-sm">
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-900 text-sm truncate">{product.item_name}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <catConfig.icon size={10} style={{ color: catConfig.color }} />
                <p
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: catConfig.color }}
                >
                  {product.category || 'Uncategorized'}
                </p>
              </div>
            </div>
          </div>

          {product.description && (
            <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">{product.description}</p>
          )}

          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Stock Level</span>
              <span className="text-[10px] font-bold text-gray-600">{product.stock_level || 0} units</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${stockStatus.barColor}`}
                style={{ width: `${Math.min(((product.stock_level || 0) / 50) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-200/50">
            <button
              onClick={() => openEditModal(product)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/80 text-gray-700 text-xs font-semibold hover:bg-white hover:shadow-sm transition-all"
            >
              <Pencil size={13} />
              Edit
            </button>
            <button
              onClick={() => handleDelete(product)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/80 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderProductList = (product, index) => {
    const stockStatus = getStockStatus(product.stock_level || 0)
    const StockIcon = stockStatus.icon
    const catConfig = getCategoryConfig(product.category)
    const ProductIcon = getProductIcon(product.item_name, product.category)
    const isFlower = product.category === 'Flowers'

    return (
      <div
        key={`list-${product.product_id}-${index}`}
        className={`group flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md ${
          !product.is_active ? 'opacity-50 grayscale' : ''
        } ${catConfig.cardBg} ${catConfig.cardBorder}`}
      >
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ 
            backgroundColor: catConfig.color + '15',
            border: `2px solid ${catConfig.color}30`
          }}
        >
          <ProductIcon size={28} style={{ color: catConfig.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-bold text-gray-900 text-sm truncate">{product.item_name}</h3>
            <span 
              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: catConfig.color + '15', color: catConfig.color }}
            >
              {product.category}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{product.description || 'No description'}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`text-[11px] font-bold flex items-center gap-1 ${stockStatus.color}`}>
              <StockIcon size={12} />
              {stockStatus.label}
            </span>
            <span className="text-[11px] text-gray-400">|</span>
            <span className="text-[11px] font-bold" style={{ color: catConfig.color }}>
              {product.retail_price?.toLocaleString('fr-FR')} DA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isFlower && (product.stock_level || 0) > 0 && (
            <button
              onClick={() => openRemoveModal(product)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-rose-500 hover:bg-rose-50 transition-all"
              title="Remove damaged"
            >
              <Droplets size={14} />
            </button>
          )}
          <button
            onClick={() => handleToggleActive(product)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              product.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'
            }`}
          >
            {product.is_active ? <Check size={14} /> : <X size={14} />}
          </button>
          <button
            onClick={() => openEditModal(product)}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 transition-all"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => handleDelete(product)}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Products</h1>
            <p className="text-sm text-gray-400 mt-1">
              {products.length} products in catalog · 
              <span className="text-red-500 font-medium ml-1">{stockStats.out} out of stock</span>
              {stockStats.low > 0 && <span className="text-amber-500 font-medium ml-1">· {stockStats.low} low stock</span>}
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-dark transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <Plus size={18} />
            Add Product
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Products', value: stockStats.total, icon: Hash, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
            { label: 'In Stock', value: stockStats.good, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Low Stock', value: stockStats.low, icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
            { label: 'Out of Stock', value: stockStats.out, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
          ].map((stat) => (
            <div key={stat.label} className={`${stat.bg} ${stat.border} border rounded-xl p-4 flex items-center gap-3`}>
              <div className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm`}>
                <stat.icon size={18} className={stat.color} />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{stat.value}</p>
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                activeCategory === 'all'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              All Products
            </button>
            {Object.entries(CATEGORY_CONFIG).filter(([key]) => key !== 'Uncategorized').map(([key, config]) => {
              const CatIcon = config.icon
              const count = productsByCategory[key]?.length || 0
              return (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    activeCategory === key
                      ? `${config.bg} ${config.text} ${config.border} border shadow-sm`
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <CatIcon size={16} />
                  {key}
                  <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    activeCategory === key ? 'bg-white/60' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              ⊞ Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              ☰ List
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name or category..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { key: 'all', label: 'All' },
              { key: 'in-stock', label: 'In Stock' },
              { key: 'low', label: 'Low' },
              { key: 'out', label: 'Out' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStockFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  stockFilter === f.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {activeCategory === 'all' ? (
          <div className="space-y-8">
            {Object.entries(productsByCategory).map(([catName, catProducts]) => {
              if (catProducts.length === 0) return null
              const catConfig = getCategoryConfig(catName)
              const CatIcon = catConfig.icon

              return (
                <div key={`section-${catName}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl ${catConfig.bg} ${catConfig.border} border flex items-center justify-center`}>
                      <CatIcon size={20} style={{ color: catConfig.color }} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{catName}</h2>
                      <p className="text-xs text-gray-400">{catProducts.length} product{catProducts.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {catProducts.map((product, index) => renderProductCard(product, index, catName))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {catProducts.map((product, index) => renderProductList(product, index))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            {filteredProducts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                <Package size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-semibold text-lg">No products found</p>
                <p className="text-gray-400 text-sm mt-1">
                  {searchQuery || stockFilter !== 'all' ? 'Try adjusting your filters' : 'Add your first product to get started'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((product, index) => renderProductCard(product, index, activeCategory))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProducts.map((product, index) => renderProductList(product, index))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Product Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Red Rose Bouquet"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Price (DA) *</label>
                  <input
                    type="number"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="2500"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Stock *</label>
                  <input
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="20"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Category *</label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(CATEGORY_CONFIG).filter(([key]) => key !== 'Uncategorized').map(([key, config]) => {
                    const CatIcon = config.icon
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCategory(key)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                          category === key
                            ? `${config.bg} ${config.border} border-current`
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <CatIcon size={20} style={{ color: config.color }} />
                        <span className={`text-xs font-semibold ${category === key ? config.text : 'text-gray-500'}`}>
                          {key}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Image URL</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">Paste an image URL or upload via Supabase Storage</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A beautiful arrangement of 12 red roses..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
                <Plus size={18} />
              </button>
            </form>
          </div>
        </div>
      )}

      {showRemoveModal && removingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowRemoveModal(false)} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                  <Droplets size={20} className="text-rose-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Remove Damaged Stock</h2>
                  <p className="text-xs text-gray-400">{removingProduct.item_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRemoveModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-rose-500" />
                <span className="text-sm font-semibold text-rose-700">Current Stock: {removingProduct.stock_level || 0} units</span>
              </div>
              <p className="text-xs text-rose-600">
                Use this when flowers are wilted, damaged, or spoiled and need to be removed from inventory.
              </p>
            </div>

            <form onSubmit={handleRemoveStock} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                  Quantity to Remove *
                </label>
                <input
                  type="number"
                  min="1"
                  max={removingProduct.stock_level || 0}
                  value={removeQuantity}
                  onChange={(e) => setRemoveQuantity(e.target.value)}
                  placeholder="e.g. 5"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Max: {removingProduct.stock_level || 0} units
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                  Reason (optional)
                </label>
                <select
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all text-sm"
                >
                  <option value="">Select a reason...</option>
                  <option value="Wilted">Wilted / Dried out</option>
                  <option value="Damaged">Physically damaged</option>
                  <option value="Disease">Disease / Mold</option>
                  <option value="Expired">Past expiry date</option>
                  <option value="BrokenStem">Broken stems</option>
                  <option value="Pest">Pest infestation</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                {saving ? 'Removing...' : (
                  <>
                    <Droplets size={18} />
                    Remove from Stock
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default Products