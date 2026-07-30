import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Building2,
  FileText, Truck, Users, Settings, Vault, BarChart3,
  Package, UserCircle
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useShopName } from '../../hooks/useShopName'
// navItems with role restrictions
const navItems = [
  { path: '/coffre-forte', label: 'Coffre Forte', icon: Vault, roles: ['owner', 'manager', 'cashier'] },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'florist', 'cashier', 'delivery'] },
  { path: '/quick-sale', label: 'Quick Sale', icon: ShoppingBag, roles: ['owner', 'manager', 'florist', 'cashier'] },
  { path: '/cart', label: 'Cart', icon: ShoppingCart, roles: ['owner', 'manager', 'florist', 'cashier'] },
  { path: '/orders', label: 'Orders', icon: FileText, roles: ['owner', 'manager', 'florist', 'cashier', 'delivery'] },
  { path: '/delivery', label: 'Delivery', icon: Truck, roles: ['owner', 'manager', 'delivery'] },
  { path: '/products', label: 'Products', icon: Package, roles: ['owner', 'manager', 'florist'] },
  { path: '/team', label: 'Team', icon: Users, roles: ['owner', 'manager'] },
  { path: '/customers', label: 'Customers', icon: UserCircle, roles: ['owner', 'manager', 'florist', 'cashier'] },
  { path: '/reports', label: 'Reports', icon: BarChart3, roles: ['owner', 'manager'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['owner', 'manager'] },
  { path: '/suppliers', label: 'Suppliers', icon: Building2, roles: ['owner', 'manager'] },
]

function Sidebar() {
  const shopName = useShopName()
  const location = useLocation()
  const { role, loading } = useAuth()

  // Filter nav items by role
  const visibleNav = navItems.filter(item =>
    item.roles.includes(role)
  )

  return (
    <aside className="fixed left-0 top-0 h-full w-58 bg-primary flex flex-col">
      {/* Logo */}
      <div className="p-8">
        <h1 className="font-serif text-3xl text-white tracking-wider">
          BLOSSOM
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1">
        {loading ? (
          <div className="px-4 py-3 text-white/50 text-sm">Loading...</div>
        ) : (
          visibleNav.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-light text-white'
                    : 'text-white/70 hover:bg-primary-light/50 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })
        )}
      </nav>
    </aside>
  )
}

export default Sidebar