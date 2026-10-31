import { addCalendarDays, localDate } from './businessDate.js'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function localDateString(date = new Date()) {
  return localDate(date)
}

export function transitDaysForRoadDistance(distanceKm) {
  const distance = Number(distanceKm)
  if (!Number.isFinite(distance) || distance < 0) return null
  if (distance < 80) return 0
  if (distance <= 600) return 1
  return 2
}

export function shipByDate(deliveryDate, transitDays) {
  if (!DATE_ONLY.test(String(deliveryDate || ''))) return null
  const days = Number(transitDays)
  if (!Number.isInteger(days) || days < 0 || days > 2) return null
  return addCalendarDays(deliveryDate, -days)
}

export function getShippingPlan(order, today = localDateString()) {
  if (!order || order.delivery_method === 'pickup' || order.order_type === 'quick_sale') return null
  const status = String(order.status || '').toLowerCase()
  if (['done', 'cancelled', 'archived'].includes(status) || order.deleted_at) return null

  const hasTown = Boolean(String(order.delivery_city || '').trim() && order.delivery_latitude != null && order.delivery_longitude != null)
  if (!hasTown) return { state: 'needs-location', label: 'Destination needed', urgency: 'attention' }

  if (!order.delivery_date) return { state: 'needs-date', label: 'Delivery date needed', urgency: 'attention' }

  const distanceKm = order.shipping_distance_km == null || order.shipping_distance_km === ''
    ? null
    : Number(order.shipping_distance_km)
  const transitDays = order.shipping_transit_days == null
    ? (distanceKm == null ? null : transitDaysForRoadDistance(distanceKm))
    : Number(order.shipping_transit_days)
  const shipDate = shipByDate(String(order.delivery_date).slice(0, 10), transitDays)
  if (!shipDate) return { state: 'needs-route', label: 'Route estimate needed', urgency: 'attention' }

  if (shipDate <= today) {
    return {
      state: shipDate < today ? 'overdue' : 'ship-today',
      label: shipDate < today ? 'Ship prep overdue' : 'Ship today',
      urgency: shipDate < today ? 'overdue' : 'today',
      shipDate,
      distanceKm,
      transitDays,
    }
  }

  return { state: 'scheduled', label: `Prepare ${shipDate}`, urgency: 'scheduled', shipDate, distanceKm, transitDays }
}

export function formatDistance(distanceKm) {
  const distance = Number(distanceKm)
  return Number.isFinite(distance) ? `${distance.toLocaleString('en', { maximumFractionDigits: 1 })} km` : 'Distance pending'
}
