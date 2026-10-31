// Shared client-side role rules. Database policies and Edge Functions must
// enforce the same matrix; this file only controls the visible app surface.
export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  florist: 'Florist',
  cashier: 'Cashier',
  delivery: 'Delivery',
}

const FRONT_COUNTER = ['owner', 'manager', 'florist', 'cashier']
const SHOP_OPERATIONS = ['owner', 'manager', 'florist']
const DELIVERY_OPERATIONS = ['owner', 'manager', 'florist', 'delivery']
const MANAGEMENT = ['owner', 'manager']

export const ROUTE_PERMISSIONS = {
  '/orders/receipt': FRONT_COUNTER,
  '/coffre-forte': ['owner'],
  '/activity': ['owner'],
  '/suppliers': MANAGEMENT,
  '/reports': MANAGEMENT,
  '/settings': ['owner'],
  '/team': MANAGEMENT,
  '/dashboard': FRONT_COUNTER,
  '/customers': FRONT_COUNTER,
  '/loyalty-cards': MANAGEMENT,
  '/checkout': FRONT_COUNTER,
  '/products': SHOP_OPERATIONS,
  '/delivery': DELIVERY_OPERATIONS,
  '/orders': FRONT_COUNTER,
  '/cart': FRONT_COUNTER,
}

export const ORDER_ACTIONS = {
  owner:   { edit: true, status: true, cancel: true, payment: true, refund: true, delete: true, archive: true },
  manager: { edit: true, status: true, cancel: true, payment: true, refund: false, delete: false, archive: true },
  florist: { edit: true, status: true, cancel: false, payment: true, refund: false, delete: false, archive: true },
  cashier: { edit: false, status: false, cancel: false, payment: true, refund: false, delete: false, archive: true },
  delivery:{ edit: false, status: false, cancel: false, payment: false, refund: false, delete: false, archive: true },
}

export function orderActionsFor(role) {
  return ORDER_ACTIONS[role] || ORDER_ACTIONS.delivery
}

export function allowedRolesForPath(pathname) {
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname]

  const match = Object.keys(ROUTE_PERMISSIONS)
    .filter((base) => pathname.startsWith(base + '/'))
    .sort((a, b) => b.length - a.length)[0]

  return match ? ROUTE_PERMISSIONS[match] : null
}

export function canAccessRoute(role, pathname) {
  return allowedRolesForPath(pathname)?.includes(role) ?? false
}

// Where each role starts after sign-in. Delivery staff cannot open the
// dashboard, so sending everyone there landed them on /forbidden.
export function landingPathFor(role) {
  if (role === 'delivery') return '/delivery'
  return canAccessRoute(role, '/dashboard') ? '/dashboard' : '/forbidden'
}

// Use the page the worker was heading to only if their role may open it.
export function postLoginPath(role, requestedPath) {
  if (requestedPath && requestedPath !== '/forbidden' && canAccessRoute(role, requestedPath)) return requestedPath
  return landingPathFor(role)
}

export function assignableRolesFor(actorRole) {
  if (actorRole === 'owner') return Object.keys(ROLE_LABELS)
  // Role changes are owner-only in the database. Managers can still edit
  // contact details and deactivate staff, but the UI must not offer roles.
  return []
}

export function canManageMember(actorRole, targetRole) {
  if (actorRole === 'owner') return Boolean(ROLE_LABELS[targetRole])
  return actorRole === 'manager' && ['florist', 'cashier', 'delivery'].includes(targetRole)
}
