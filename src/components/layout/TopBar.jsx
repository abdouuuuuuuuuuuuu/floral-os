import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Plus, Bell, User, LogOut, Settings, Trash2, Zap,
  Package, ShoppingCart, Users, FileText, ArrowRight,
  LayoutDashboard, X, ArrowDownCircle
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import { supabase } from '../../lib/supabase'

function TopBar() {
  const { user, signOut } = useAuth()
  const { notifications, unreadCount, markAllRead, clearAll } = useNotification()
  const [showPanel, setShowPanel] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const navigate = useNavigate()

  // ---- SEARCH STATE ----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRef = useRef(null)
  const searchInputRef = useRef(null)

  // ---- SEARCH LOGIC ----
  const performSearch = useCallback(async (query) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    const safeQuery = query.trim().toLowerCase()

    // Search all three tables in parallel
    const [productsRes, ordersRes, customersRes] = await Promise.all([
      supabase
        .from('products')
        .select('product_id, item_name, retail_price, stock_level')
        .ilike('item_name', `%${safeQuery}%`)
        .eq('is_active', true)
        .limit(5),

      supabase
        .from('orders')
        .select('id, order_number, client_name, total_amount, status')
        .or(`order_number.ilike.%${safeQuery}%,client_name.ilike.%${safeQuery}%`)
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('customers')
        .select('customer_id, full_name, phone, email')
        .or(`full_name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`)
        .limit(5),
    ])

    const results = []

    if (productsRes.data?.length) {
      results.push({
        category: 'Products',
        icon: Package,
        items: productsRes.data.map(p => ({
          id: p.product_id,
          title: p.item_name,
          subtitle: `${p.retail_price} DA — Stock: ${p.stock_level}`,
          path: '/products',
        }))
      })
    }

    if (ordersRes.data?.length) {
      results.push({
        category: 'Orders',
        icon: ShoppingCart,
        items: ordersRes.data.map(o => ({
          id: o.id,
          title: `Order #${o.order_number}`,
          subtitle: `${o.client_name || 'No name'} — ${o.total_amount} DA (${o.status})`,
          path: '/orders',
        }))
      })
    }

    if (customersRes.data?.length) {
      results.push({
        category: 'Customers',
        icon: Users,
        items: customersRes.data.map(c => ({
          id: c.customer_id,
          title: c.full_name,
          subtitle: c.phone || c.email || 'No contact info',
          path: '/customers',
        }))
      })
    }

    const pages = [
      { name: 'dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'products', path: '/products', icon: Package },
      { name: 'orders', path: '/orders', icon: ShoppingCart },
      { name: 'quick sale', path: '/quick-sale', icon: Zap },
      { name: 'cart', path: '/cart', icon: ShoppingCart },
      { name: 'checkout', path: '/checkout', icon: ArrowRight },
      { name: 'customers', path: '/customers', icon: Users },
      { name: 'delivery', path: '/delivery', icon: ArrowRight },
      { name: 'team', path: '/team', icon: Users },
      { name: 'reports', path: '/reports', icon: FileText },
      { name: 'settings', path: '/settings', icon: Settings },
      { name: 'coffre forte', path: '/coffre-forte', icon: FileText },
    ]

    const matchedPages = pages.filter(p => p.name.includes(safeQuery))
    if (matchedPages.length) {
      results.push({
        category: 'Pages',
        icon: ArrowRight,
        items: matchedPages.map(p => ({
          id: p.path,
          title: p.name.charAt(0).toUpperCase() + p.name.slice(1),
          subtitle: 'Go to page',
          path: p.path,
        }))
      })
    }

    setSearchResults(results)
    setSearchLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchQuery)
    }, 200)
    return () => clearTimeout(timer)
  }, [searchQuery, performSearch])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setShowSearchResults(false)
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSelectResult = (path) => {
    setShowSearchResults(false)
    setSearchQuery('')
    setSearchResults([])
    navigate(path)
  }

  const handleLogout = async () => {
    await signOut()
  }

  return (
    <header className="fixed top-0 right-0 left-64 h-16 bg-sage/80 backdrop-blur-sm flex items-center justify-between px-6 z-20">
      {/* Search */}
      <div className="flex-1 max-w-xl relative" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowSearchResults(true)
            }}
            onFocus={() => setShowSearchResults(true)}
            placeholder="Search products, orders, customers... (Ctrl+K)"
            className="w-full pl-10 pr-10 py-2.5 rounded-full bg-white/60 border border-gray-300/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSearchResults([])
                searchInputRef.current?.focus()
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {showSearchResults && searchQuery.length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-96 overflow-y-auto">
            {searchLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                No results found for "{searchQuery}"
              </div>
            ) : (
              searchResults.map((category, catIndex) => {
                const CategoryIcon = category.icon
                return (
                  <div key={catIndex}>
                    <div className="px-4 py-2 bg-gray-50 flex items-center gap-2">
                      <CategoryIcon size={14} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {category.category}
                      </span>
                    </div>
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectResult(item.path)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                      </button>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* ═══ CASH OUT BUTTON ═══ */}
        <button
          onClick={() => navigate('/coffre-forte?panel=cashout')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors shadow-sm"
        >
          <ArrowDownCircle size={16} />
          Cash Out
        </button>

        <Link
          to="/quick-sale"
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-white font-medium text-sm hover:bg-accent-dark transition-colors"
        >
          <Zap size={16} />
          Quick Sale
        </Link>

        <Link
          to="/cart"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white font-medium text-sm hover:bg-primary-light transition-colors"
        >
          <Plus size={18} />
          Add Order
        </Link>

        <div className="relative">
          <button
            onClick={() => {
              setShowPanel(!showPanel)
              setShowProfile(false)
            }}
            className="p-2.5 rounded-full bg-white/60 hover:bg-white transition-colors relative"
          >
            <Bell size={20} className="text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showPanel && (
            <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Notifications</h3>
                <div className="flex gap-2">
                  <button
                    onClick={markAllRead}
                    className="text-xs text-teal hover:underline"
                  >
                    Mark all read
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-xs text-gray-400 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <div className="w-2 h-2 bg-accent rounded-full mt-1.5 shrink-0" />}
                        <div className="flex-1">
                          <p className="text-sm text-gray-700">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {n.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile)
              setShowPanel(false)
            }}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-light transition-colors font-medium text-sm"
          >
            {user?.email?.charAt(0).toUpperCase() || <User size={20} />}
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <p className="font-semibold text-gray-900">{user?.user_metadata?.full_name || 'User'}</p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
              </div>

              <div className="p-2">
                <button
                  onClick={() => {
                    setShowProfile(false)
                    navigate('/settings')
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left text-sm text-gray-700"
                >
                  <Settings size={18} className="text-gray-400" />
                  Settings
                </button>

                <button
                  onClick={() => {
                    setShowProfile(false)
                    handleLogout()
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-danger-light transition-colors text-left text-sm text-danger"
                >
                  <LogOut size={18} />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default TopBar