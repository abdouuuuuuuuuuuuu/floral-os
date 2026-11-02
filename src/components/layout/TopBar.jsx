import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Plus, User, LogOut, Settings, Moon, Sun,
  Package, ShoppingCart, Users, FileText, ArrowRight,
  LayoutDashboard, X, ArrowDownCircle, Menu, DoorOpen, ScanLine
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
// TopBar used to inline its own bell dropdown, duplicating this
// component. This one handles the 'warning' type and supports dismiss.
import NotificationPanel from '../common/NotificationPanel'
import ConnectionStatus from './ConnectionStatus'
import { canAccessRoute } from '../../lib/permissions'
import { useTheme } from '../../context/ThemeContext'
import { useNotification } from '../../context/NotificationContext'
import LoyaltyCardScanModal from '../LoyaltyCardScanModal'
import { usePageActive } from '../../context/PageActiveContext'

function TopBar({ onMenuClick = () => {}, isNavigationOpen = false }) {
  const { profile, signOut, role } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { addNotification } = useNotification()
  const isAdmin = role === 'owner' || role === 'manager'
  const [showProfile, setShowProfile] = useState(false)
  const [openingDrawer, setOpeningDrawer] = useState(false)
  const [showLoyaltyScanner, setShowLoyaltyScanner] = useState(false)
  const navigate = useNavigate()
  const closeLoyaltyScanner = useCallback(() => setShowLoyaltyScanner(false), [])
  const openLoyaltyCustomer = useCallback((customerId) => {
    setShowLoyaltyScanner(false)
    navigate('/customers', { state: { topBarSearch: { type: 'customer', id: customerId } } })
  }, [navigate])

  const handleOpenCashDrawer = async () => {
    if (openingDrawer) return
    setOpeningDrawer(true)
    try {
      const drawerBridge = window.electronAPI?.cashDrawer
      if (!drawerBridge?.open) throw new Error('Direct cash drawer control requires the Blossom Windows desktop app.')
      const result = await drawerBridge.open()
      addNotification(`Cash drawer pulse sent to ${result?.printerName || 'the default receipt printer'}.`, 'success')
    } catch (error) {
      addNotification(error?.message || 'Could not open the cash drawer print dialog.', 'error')
    } finally {
      setOpeningDrawer(false)
    }
  }

  // ---- SEARCH STATE ----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRef = useRef(null)
  const searchInputRef = useRef(null)
  const searchRequestRef = useRef(0)

  // ---- SEARCH LOGIC ----
  const performSearch = useCallback(async (query) => {
    const trimmedQuery = query.trim()
    const requestId = ++searchRequestRef.current
    if (trimmedQuery.length < 2) {
      setSearchResults([])
      setSearchError('')
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    setSearchError('')
    const safeQuery = trimmedQuery.toLowerCase()
    const pattern = `%${trimmedQuery.replace(/[\\%_]/g, '\\$&')}%`
    const canSearchProducts = canAccessRoute(role, '/products')
    const canSearchOrders = canAccessRoute(role, '/orders')
    const canSearchCustomers = canAccessRoute(role, '/customers')

    try {
      // Keep each filter separate so punctuation in a name cannot break the
      // PostgREST .or() expression. Search people by both name and phone.
      const [productsRes, orderNumberRes, orderClientRes, customerNameRes, customerPhoneRes, customerExactPhoneRes] = await Promise.all([
        canSearchProducts
          ? supabase.from('products').select('product_id, item_name, retail_price, stock_level')
            .ilike('item_name', pattern).eq('is_active', true).limit(5)
          : Promise.resolve({ data: [], error: null }),
        canSearchOrders
          ? supabase.from('orders').select('id, order_number, client_name, total_amount, status, created_at')
            .is('deleted_at', null).ilike('order_number', pattern).order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [], error: null }),
        canSearchOrders
          ? supabase.from('orders').select('id, order_number, client_name, total_amount, status, created_at')
            .is('deleted_at', null).ilike('client_name', pattern).order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [], error: null }),
        canSearchCustomers
          ? supabase.from('customers').select('customer_id, full_name, phone, email')
            .ilike('full_name', pattern).limit(5)
          : Promise.resolve({ data: [], error: null }),
        canSearchCustomers
          ? supabase.from('customers').select('customer_id, full_name, phone, email')
            .ilike('phone', pattern).limit(5)
          : Promise.resolve({ data: [], error: null }),
        canSearchCustomers && trimmedQuery.replace(/\D/g, '').length >= 9
          ? supabase.rpc('blossom_resolve_customer', { p_phone: trimmedQuery, p_create_if_missing: false })
          : Promise.resolve({ data: null, error: null }),
      ])
      if (requestId !== searchRequestRef.current) return

      const responses = [productsRes, orderNumberRes, orderClientRes, customerNameRes, customerPhoneRes, customerExactPhoneRes]
      const failures = responses.filter((response) => response.error)
      const orders = [...new Map([...(orderNumberRes.data || []), ...(orderClientRes.data || [])].map((order) => [order.id, order])).values()]
      const customers = [...new Map([...(customerNameRes.data || []), ...(customerPhoneRes.data || []), ...(customerExactPhoneRes.data ? [customerExactPhoneRes.data] : [])].map((customer) => [customer.customer_id, customer])).values()]
      const results = []

      if (canSearchProducts && productsRes.data?.length) results.push({
        category: 'Products', icon: Package,
        items: productsRes.data.map((product) => ({
          id: product.product_id, title: product.item_name,
          subtitle: `${product.retail_price} DA — Stock: ${product.stock_level}`,
          path: '/products', state: { topBarSearch: { type: 'product', id: product.product_id } },
        })),
      })
      if (canSearchOrders && orders.length) results.push({
        category: 'Orders', icon: ShoppingCart,
        items: orders.map((order) => ({
          id: order.id, title: `Order #${order.order_number}`,
          subtitle: `${order.client_name || 'No name'} — ${order.total_amount} DA (${order.status})`,
          path: `/orders/${order.id}`,
        })),
      })
      if (canSearchCustomers && customers.length) results.push({
        category: 'Customers', icon: Users,
        items: customers.map((customer) => ({
          id: customer.customer_id, title: customer.full_name,
          subtitle: customer.phone || customer.email || 'No contact info',
          path: '/customers', state: { topBarSearch: { type: 'customer', id: customer.customer_id } },
        })),
      })

      const pages = [
        { name: 'dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'products', path: '/products', icon: Package },
        { name: 'orders', path: '/orders', icon: ShoppingCart },
        { name: 'cart', path: '/cart', icon: ShoppingCart },
        { name: 'checkout', path: '/checkout', icon: ArrowRight },
        { name: 'customers', path: '/customers', icon: Users },
        { name: 'delivery', path: '/delivery', icon: ArrowRight },
        { name: 'team', path: '/team', icon: Users },
        { name: 'reports', path: '/reports', icon: FileText },
        { name: 'settings', path: '/settings', icon: Settings },
        { name: 'coffre forte', path: '/coffre-forte', icon: FileText },
      ]
      const matchedPages = pages.filter((page) => canAccessRoute(role, page.path) && page.name.includes(safeQuery))
      if (matchedPages.length) results.push({
        category: 'Pages', icon: ArrowRight,
        items: matchedPages.map((page) => ({
          id: page.path, title: page.name.charAt(0).toUpperCase() + page.name.slice(1),
          subtitle: 'Go to page', path: page.path,
        })),
      })

      setSearchResults(results)
      if (failures.length === responses.length) setSearchError('Search is temporarily unavailable. Check your connection and try again.')
      else if (failures.length) setSearchError('Some search results could not be loaded.')
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        console.error('Top-bar search failed:', error)
        setSearchResults([])
        setSearchError('Search is temporarily unavailable. Check your connection and try again.')
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearchLoading(false)
    }
  }, [role])

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

  // Hidden (kept-alive) pages also have a TopBar; only the visible one may
  // react to keyboard shortcuts.
  const pageActive = usePageActive()
  useEffect(() => {
    if (!pageActive) return undefined
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        searchRequestRef.current += 1
        setSearchLoading(false)
        setShowSearchResults(false)
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pageActive])

  const handleSelectResult = (item) => {
    searchRequestRef.current += 1
    setSearchLoading(false)
    setShowSearchResults(false)
    setSearchQuery('')
    setSearchResults([])
    navigate(item.path, { state: item.state })
  }

  const handleLogout = async () => {
    await signOut()
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[var(--layout-topbar-height)] items-center justify-between gap-3 border-b border-sage-dark/70 bg-white/95 px-3 shadow-sm backdrop-blur-md sm:gap-5 sm:px-5 lg:left-[var(--layout-sidebar-width)] lg:gap-8 lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={isNavigationOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-controls="main-navigation"
        aria-expanded={isNavigationOpen}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
      >
        {isNavigationOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {/* Search */}
      <div className="relative min-w-0 w-full max-w-[44rem] flex-1 lg:mr-auto" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={searchInputRef}
            aria-label="Search products, orders, customers, and accessible pages"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              searchRequestRef.current += 1
              setSearchLoading(false)
              setSearchResults([])
              setSearchError('')
              setSearchQuery(e.target.value)
              setShowSearchResults(true)
            }}
            onFocus={() => setShowSearchResults(true)}
            placeholder="Search Blossom…"
            className="w-full rounded-xl border border-transparent bg-sage/70 py-2.5 pl-10 pr-10 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-500 focus:border-accent/30 focus:bg-white focus:ring-2 focus:ring-accent/10"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                searchRequestRef.current += 1
                setSearchLoading(false)
                setSearchQuery('')
                setSearchResults([])
                setSearchError('')
                searchInputRef.current?.focus()
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
          {!searchQuery && (
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] text-gray-400 lg:flex" aria-hidden="true">
              <kbd className="rounded border border-sage-dark bg-white px-1.5 py-0.5 font-sans">Ctrl</kbd>
              <kbd className="rounded border border-sage-dark bg-white px-1.5 py-0.5 font-sans">K</kbd>
            </span>
          )}
        </div>

        {showSearchResults && searchQuery.trim().length >= 2 && (
          <div className="popover-enter absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-sage-dark bg-white shadow-xl">
            {searchLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                Searching...
              </div>
            ) : searchError && searchResults.length === 0 ? (
              <div role="status" className="p-6 text-center text-rose-600 text-sm">{searchError}</div>
            ) : searchResults.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                No results found for "{searchQuery}"
              </div>
            ) : (
              searchResults.map((category, catIndex) => {
                const CategoryIcon = category.icon
                return (
                  <div key={catIndex}>
                    <div className="flex items-center gap-2 bg-sage/70 px-4 py-2">
                      <CategoryIcon size={14} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {category.category}
                      </span>
                    </div>
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectResult(item)}
                        className="w-full border-b border-sage/80 px-4 py-3 text-left transition-colors hover:bg-sage last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                      </button>
                    ))}
                  </div>
                )
              })
            )}
            {!searchLoading && searchError && searchResults.length > 0 && (
              <p role="status" className="px-4 py-2 text-xs text-amber-700">{searchError}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        {canAccessRoute(role, '/customers') && (
          <button
            type="button"
            onClick={() => setShowLoyaltyScanner(true)}
            title="Scan or assign a loyalty card"
            aria-label="Scan loyalty card"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 transition hover:bg-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 md:w-auto md:gap-2 md:px-3"
          >
            <ScanLine size={17} />
            <span className="hidden text-sm font-semibold md:inline">Scan card</span>
          </button>
        )}

        {canAccessRoute(role, '/cart') && (
          <button
            type="button"
            onClick={handleOpenCashDrawer}
            disabled={openingDrawer}
            title={openingDrawer ? 'Opening cash drawer…' : 'Open cash drawer'}
            aria-label="Open cash drawer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-primary transition hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
          >
            <DoorOpen size={18} className={openingDrawer ? 'animate-pulse' : ''} />
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => navigate('/coffre-forte?panel=cashout')}
            title="Record money leaving the register"
            aria-label="Cash out"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-danger hover:bg-danger-subtle md:w-auto md:gap-2 md:px-3"
          >
            <ArrowDownCircle size={17} />
            <span className="hidden md:inline">Cash Out</span>
          </button>
        )}

        {canAccessRoute(role, '/cart') && (
          <Link to="/cart" aria-label="Add order" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm hover:bg-primary-dark md:w-auto md:gap-2 md:px-4">
            <Plus size={18} />
            <span className="hidden md:inline">Add Order</span>
          </Link>
        )}

        <div className="mx-0.5 h-6 w-px bg-sage-dark sm:mx-1" aria-hidden="true" />

        <ConnectionStatus />
        <NotificationPanel />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={isDark}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="hidden h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-sage hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:inline-flex"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="relative">
          <button
            type="button"
            aria-label={`Open profile menu for ${profile?.full_name || 'user'}`}
            onClick={() => {
              setShowProfile(!showProfile)
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-primary transition-colors hover:bg-sage-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent font-semibold text-sm"
          >
            {profile?.full_name?.charAt(0).toUpperCase() || <User size={20} />}
          </button>

          {showProfile && (
            <div className="popover-enter absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-sage-dark bg-white shadow-xl">
              <div className="border-b border-sage-dark/70 p-4">
                <p className="font-semibold text-gray-900">{profile?.full_name || 'User'}</p>
                <p className="text-sm text-gray-500 truncate font-mono">
                  {profile?.username ? `@${profile.username}` : profile?.email}
                </p>
              </div>

              <div className="p-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="press w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sage transition-colors text-left text-sm text-gray-700"
                >
                  {isDark ? <Sun size={18} className="text-gray-400" /> : <Moon size={18} className="text-gray-400" />}
                  {isDark ? 'Light mode' : 'Dark mode'}
                </button>

                {canAccessRoute(role, '/settings') && (
                  <button
                    onClick={() => {
                      setShowProfile(false)
                      navigate('/settings')
                    }}
                    className="press w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sage transition-colors text-left text-sm text-gray-700"
                  >
                    <Settings size={18} className="text-gray-400" />
                    Settings
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowProfile(false)
                    handleLogout()
                  }}
                  className="press w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-danger-light transition-colors text-left text-sm text-danger"
                >
                  <LogOut size={18} />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showLoyaltyScanner && (
        <LoyaltyCardScanModal
          onClose={closeLoyaltyScanner}
          onOpenCustomer={openLoyaltyCustomer}
        />
      )}
    </header>
  )
}

export default TopBar
