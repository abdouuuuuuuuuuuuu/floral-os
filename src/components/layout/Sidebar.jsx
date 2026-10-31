// src/components/layout/Sidebar.jsx
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Building2,
  FileText, Truck, Users, Settings, Vault, BarChart3,
  Package, UserCircle, X, QrCode,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useShopName } from '../../hooks/useShopName'
import { canAccessRoute } from '../../lib/permissions'

// ─── DEFERENCE ─────────────────────────────────────────────────────
// This used to be 232px of saturated purple, floor to ceiling, on every
// screen — roughly 15% of a 1080p display spent shouting navigation the
// user already knows by heart. It was the loudest thing in the app and
// it never changed.
//
// Now it recedes. Near-white, muted labels, and purple used for exactly
// one thing: where you are. That hands the colour budget back to the
// content, which is where the actual information lives.
// ───────────────────────────────────────────────────────────────────

// Grouped. Twelve flat links is a list to read; three groups of four is
// a shape to recognise.
const navGroups = [
  {
    label: null, // the everyday work needs no heading
    items: [
      { path: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
      { path: '/cart',       label: 'Cart',       icon: ShoppingCart },
      { path: '/orders',     label: 'Orders',     icon: FileText },
      { path: '/delivery',   label: 'Delivery',   icon: Truck },
    ],
  },
  {
    label: 'Shop',
    items: [
      { path: '/products',  label: 'Products',  icon: Package },
      { path: '/customers', label: 'Customers', icon: UserCircle },
      { path: '/loyalty-cards', label: 'Loyalty cards', icon: QrCode },
      { path: '/suppliers', label: 'Suppliers', icon: Building2 },
    ],
  },
  {
    label: 'Business',
    items: [
      { path: '/coffre-forte', label: 'Coffre Forte', icon: Vault },
      { path: '/reports',      label: 'Reports',      icon: BarChart3 },
      { path: '/team',         label: 'Team',         icon: Users },
      { path: '/settings',     label: 'Settings',     icon: Settings },
    ],
  },
]

/**
 * A five-petal bloom, drawn rather than imported.
 *
 * An SVG rather than the PNG logo because it inherits currentColor,
 * stays crisp at any size, adds nothing to the bundle, and can respond
 * to hover. The PNG is still the app icon and the receipt header — this
 * is the in-app mark, which has different requirements.
 *
 * Petals are placed by rotation around a shared origin, so the shape
 * stays symmetric at any size without hand-tuned coordinates.
 */
function BlossomMark({ size = 26, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g>
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse
            key={angle}
            cx="16"
            cy="9.5"
            rx="4.6"
            ry="7"
            fill="currentColor"
            opacity="0.85"
            transform={`rotate(${angle} 16 16)`}
          />
        ))}
        {/* The centre sits above the petals and stays lighter, so the
            shape reads as a flower rather than a five-pointed blob. */}
        <circle cx="16" cy="16" r="3.4" fill="var(--color-cream)" />
        <circle cx="16" cy="16" r="1.6" fill="currentColor" opacity="0.55" />
      </g>
    </svg>
  )
}

function Sidebar({ isOpen = false, onClose = () => {} }) {
  const shopName = useShopName()
  const location = useLocation()
  const { role, loading } = useAuth()

  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessRoute(role, i.path)) }))
    .filter((g) => g.items.length > 0)

  return (
    <aside
      id="main-navigation"
      className={`fixed left-0 top-0 z-40 flex h-dvh w-[min(18rem,86vw)] flex-col border-r border-sage-dark bg-white shadow-xl transition-transform duration-200 ease-out lg:visible lg:w-[var(--layout-sidebar-width)] lg:translate-x-0 lg:shadow-none ${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
      aria-label="Main navigation"
    >
      {/* Wordmark at reading size, not display size. It's your own
          software — you don't need to be told whose it is 300 times a
          day. Small, quiet, and it doubles as a home link. */}
      <div className="flex h-[var(--layout-topbar-height)] shrink-0 items-center border-b border-sage-dark/60 px-5">
        <Link
          to="/dashboard"
          onClick={onClose}
          className="group flex min-w-0 flex-1 items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        >
        {/* The one place accent colour appears as identity rather than
            as an action. It turns slowly on hover — the only decorative
            motion in the app, and it's on the one element that's allowed
            to be decorative. */}
        <BlossomMark
          size={24}
          className="text-accent shrink-0 transition-transform duration-500 ease-out-soft
                     group-hover:rotate-[72deg]"
        />

        <span className="min-w-0">
          <span className="block font-display text-[19px] leading-none text-primary tracking-[0.01em] truncate">
            {shopName}
          </span>
          {/* Small caps beneath, letterspaced wide. Gives the lockup a
              baseline and stops the name floating in the header. */}
          <span className="block text-[9px] uppercase tracking-[0.22em] text-gray-400 mt-1">
            Fleuriste
          </span>
        </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="ml-auto rounded-lg p-2 text-gray-500 transition-colors hover:bg-sage hover:text-gray-900 lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Main">
        {loading ? (
          <div className="space-y-1.5 px-1" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-sage animate-pulse" />
            ))}
          </div>
        ) : (
          visibleGroups.map((group, gi) => (
            <div key={group.label || 'primary'} className={gi > 0 ? 'mt-6' : ''}>
              {group.label && (
                <p className="label-section px-3 mb-1.5">{group.label}</p>
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    location.pathname.startsWith(item.path + '/')
                  const Icon = item.icon

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg press
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isActive
                          ? 'bg-primary-subtle text-primary font-semibold'
                          : 'text-gray-500 hover:bg-sage hover:text-gray-900'
                      }`}
                    >
                      {/* One accent mark for "you are here". The only
                          coloured thing in the whole panel. */}
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-accent"
                        />
                      )}
                      <Icon
                        size={18}
                        strokeWidth={isActive ? 2.2 : 1.8}
                        aria-hidden="true"
                        className="shrink-0"
                      />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </nav>
    </aside>
  )
}

export default Sidebar
