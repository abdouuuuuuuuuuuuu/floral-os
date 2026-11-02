// src/lib/orders.js
//
// Thin wrapper over the create_order RPC. All the sequencing that used
// to live here — order numbering, item insert, stock decrement — now
// happens inside one Postgres transaction. If any part fails, the whole
// sale rolls back. Previously a failure at step 3 left a paid order with
// no items and stock already decremented.

import { supabase } from './supabase'
import { translateOrderError } from './orderErrors'
import { normalizeRedeemedPoints } from './loyalty'
import { enqueueSale, isNetworkError } from './offlineQueue'
export { translateOrderError } from './orderErrors'

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export function createOrderRequestId() {
  return makeRequestId()
}

/**
 * @returns {Promise<{order: object, warnings: {negative_stock: Array}}>}
 */
export async function createOrder({
  clientName,
  customerId,
  clientPhone,
  deliveryDate,
  deliveryTime,
  deliveryMethod,
  deliveryCity,
  deliveryWilaya,
  deliveryLatitude,
  deliveryLongitude,
  shippingDistanceKm,
  deliveryFeeAmount = 0,
  deliveryFeeCollected = false,
  deliveryFeePaymentMethod = 'cash',
  paymentMethod,
  clientSource,
  notes,
  items,
  requestId = null,
  subtotal,
  total,
  priceAdjustment,
  status = 'new',
  orderType = 'standard',
  taxAmount = 0,
  paymentStatus = 'unpaid',
  amountPaid = 0,
  paymentNotes = '',
  loyaltyPointsToRedeem = 0,
}) {
  if (!items?.length) {
    throw new Error('Cannot create an order with no items')
  }

  const paidAmount = Math.round(Number(amountPaid) || 0)
  // Match create_order's server-side rule: the due is total minus the amount
  // actually collected, regardless of a stale UI-provided due value.
  const dueAmount = Math.max(0, Math.round(Number(total || 0) - paidAmount))
  const linkedCustomerId = customerId ?? null
  if (dueAmount > 0 && !linkedCustomerId && !String(clientPhone || '').trim()) {
    throw new Error('A customer phone number is required to link a Pay Later order to the right profile.')
  }
  if (orderType !== 'quick_sale' && !linkedCustomerId && !String(clientPhone || '').trim()) {
    throw new Error('Add the customer phone number so the POS can find or create the correct profile.')
  }

  const payload = {
    client_name: clientName || 'Walk-in Customer',
    client_phone: clientPhone || '',
    customer_id: linkedCustomerId,
    delivery_date: deliveryDate || '',
    delivery_time: deliveryTime || '',
    delivery_method: deliveryMethod || 'pickup',
    delivery_city: deliveryCity || '',
    delivery_wilaya: deliveryWilaya || '',
    delivery_latitude: deliveryLatitude ?? '',
    delivery_longitude: deliveryLongitude ?? '',
    shipping_distance_km: shippingDistanceKm ?? '',
    delivery_fee_amount: deliveryFeeCollected ? Math.round(Number(deliveryFeeAmount) || 0) : 0,
    delivery_fee_collected: Boolean(deliveryFeeCollected),
    delivery_fee_payment_method: deliveryFeeCollected ? deliveryFeePaymentMethod : '',
    payment_method: paymentMethod || 'cash',
    client_source: clientSource || 'inhouse',
    status,
    order_type: orderType,
    notes: notes || '',
    subtotal_amount: Math.round(subtotal ?? 0),
    tax_amount: Math.round(taxAmount ?? 0),
    total_amount: Math.round(total ?? 0),
    price_adjustment: priceAdjustment ?? 0,
    amount_paid: paidAmount,
    amount_due: dueAmount,
    payment_status: paymentStatus,
    payment_notes: paymentNotes || '',
  }

  const itemPayload = items.map((item) => ({
    product_id: item.id ?? item.product_id,
    quantity: item.quantity,
    unit_price: Math.round(item.price ?? item.unit_price ?? 0),
    total_price: Math.round(item.totalPrice ?? item.total_price ?? 0),
    product_name: item.name || item.item_name || '',
    product_image: item.image_url || '',
    color: item.color || '',
    flower_type: item.flower_type || '',
    category: item.category || '',
  }))

  const safeRequestId = requestId || makeRequestId()
  const redeemPoints = normalizeRedeemedPoints(loyaltyPointsToRedeem)
  const call = redeemPoints > 0
    ? { fn: 'blossom_create_loyalty_order', params: { p_order: payload, p_items: itemPayload, p_request_id: safeRequestId, p_points_to_redeem: redeemPoints } }
    : { fn: 'blossom_create_order', params: { p_order: payload, p_items: itemPayload, p_request_id: safeRequestId } }

  // Offline or mid-blip: queue the exact server call and let it replay when
  // the connection returns. The server still assigns the order number and
  // stock, so nothing is faked on the device. Idempotent on the request id.
  if (!navigator.onLine) {
    await enqueueSale({
      requestId: safeRequestId, kind: 'create_order', fn: call.fn, params: call.params,
      meta: { total: payload.total_amount, clientName: payload.client_name, orderType },
    })
    return { queued: true, requestId: safeRequestId, order: null, warnings: { negative_stock: [] } }
  }

  try {
    const { data, error } = await supabase.rpc(call.fn, call.params)
    if (error) throw new Error(translateOrderError(error))
    return { order: data.order, warnings: data.warnings ?? { negative_stock: [] } }
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueSale({
        requestId: safeRequestId, kind: 'create_order', fn: call.fn, params: call.params,
        meta: { total: payload.total_amount, clientName: payload.client_name, orderType },
      })
      return { queued: true, requestId: safeRequestId, order: null, warnings: { negative_stock: [] } }
    }
    throw err instanceof Error ? err : new Error(translateOrderError(err))
  }
}

/** Returns the order saved under this request id by the signed-in user, or null if none was saved. */
export async function findCreatedOrder(requestId) {
  if (!requestId) return null
  const { data, error } = await supabase.rpc('get_order_creation_result', { p_request_id: requestId })
  if (error) throw new Error(translateOrderError(error))
  return data?.order ?? null
}

/** Save order edits through the same atomic database workflow used by screens and the assistant. */
export async function saveOrderEdits({ orderId, items = [], orderData = {}, additions = [], requestId = null, status = null }) {
  if (!orderId) throw new Error('An order is required before saving changes.')
  if (!Array.isArray(items) || !Array.isArray(additions) || !orderData || typeof orderData !== 'object' || Array.isArray(orderData)) {
    throw new Error('The order changes are invalid.')
  }
  if (additions.length && !requestId) throw new Error('A request id is required when adding products to an order.')
  let resolvedOrderData = orderData
  if (orderData.customer_id || String(orderData.client_phone || '').trim()) {
    const { data: customer, error: customerError } = await supabase.rpc('blossom_resolve_customer', {
      p_full_name: orderData.client_name || null,
      p_phone: orderData.client_phone || null,
      p_customer_id: orderData.customer_id || null,
    })
    if (customerError) throw new Error(translateOrderError(customerError))
    if (customer) {
      resolvedOrderData = { ...orderData, customer_id: customer.customer_id, client_name: customer.full_name, client_phone: customer.phone || '' }
    }
  }
  const { data, error } = await supabase.rpc('blossom_edit_order', {
    p_order_id: orderId,
    p_items: items,
    p_order_data: resolvedOrderData,
    p_additions: additions,
    p_request_id: additions.length ? requestId : null,
    p_status: status,
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

/** Order mutations below use server-checked RPCs; role checks never rely on UI state. */
export async function setOrderStatus(orderId, status) {
  if (!orderId || !['new', 'processing', 'done'].includes(status)) throw new Error('A valid order status is required.')
  const { data, error } = await supabase.rpc('set_order_status', { p_order_id: orderId, p_status: status })
  if (error) throw new Error(translateOrderError(error))
  return data
}

/** Mark an active delivery complete using the narrow delivery workflow. */
export async function markOrderDelivered(orderId) {
  if (!orderId) throw new Error('An order is required before confirming delivery.')
  const { data, error } = await supabase.rpc('mark_order_delivered', { p_order_id: orderId })
  if (error) throw new Error(translateOrderError(error))
  return data
}

/** Record that an active delivery has physically left with the courier. */
export async function markOrderHandedOff(orderId) {
  if (!orderId) throw new Error('An order is required before recording courier handoff.')
  const { data, error } = await supabase.rpc('mark_order_handed_off', { p_order_id: orderId })
  if (error) throw new Error(translateOrderError(error))
  return data
}

/** Save a structured failed-delivery attempt with a retry-safe request ID. */
export async function recordDeliveryOutcome({ orderId, reason, actor = null, newDate = null, requestId = null }) {
  if (!orderId || !String(reason || '').trim()) throw new Error('Order and delivery attempt reason are required.')
  const safeRequestId = requestId || makeRequestId()
  const { data, error } = await supabase.rpc('record_delivery_outcome', {
    p_order_id: orderId,
    p_reason: String(reason).trim().slice(0, 200),
    p_actor: actor,
    p_new_date: newDate,
    p_request_id: safeRequestId,
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function voidOrder(orderId, reason = '') {
  if (!orderId) throw new Error('An order is required before cancellation.')
  const { data, error } = await supabase.rpc('blossom_void_order', { p_order_id: orderId, p_reason: reason })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function restoreVoidedOrder(orderId) {
  if (!orderId) throw new Error('An order is required before undoing cancellation.')
  const { data, error } = await supabase.rpc('blossom_restore_voided_order', { p_order_id: orderId })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function reopenVoidedOrder(orderId, status) {
  if (!orderId || !['new', 'processing', 'done'].includes(status)) {
    throw new Error('A valid order and status are required to reopen an order.')
  }
  const { data, error } = await supabase.rpc('blossom_reopen_voided_order', {
    p_order_id: orderId,
    p_status: status,
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function deleteOrder(orderId, commandPhrase) {
  if (!orderId) throw new Error('An order is required before deletion.')
  if (!/^pepepeace\s+#\d{1,20}$/i.test(String(commandPhrase || ''))) {
    throw new Error('Permanent deletion is only available through the exact Blossom Assistant command.')
  }
  const { data, error } = await supabase.rpc('blossom_delete_order', {
    p_order_id: orderId,
    p_command_phrase: commandPhrase,
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function archiveOrder(orderId, reason = '') {
  if (!orderId) throw new Error('An order is required before archiving.')
  const { data, error } = await supabase.rpc('blossom_archive_order', {
    p_order_id: orderId,
    p_reason: reason,
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function delayOrder(orderId, deliveryDate, reason = '') {
  if (!orderId || !deliveryDate) throw new Error('An order and new delivery date are required.')
  const { data, error } = await supabase.rpc('delay_order', {
    p_order_id: orderId,
    p_delivery_date: deliveryDate,
    p_reason: reason.trim() || 'Not specified',
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export async function recordOrderPayment({ orderId, requestId, amount, paymentMethod = 'cash', notes = '', action = 'payment' }) {
  const parsedAmount = Math.round(Number(amount))
  if (!orderId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('Order and a positive payment amount are required.')
  const safeRequestId = requestId || makeRequestId()
  const { data, error } = await supabase.rpc('record_order_payment', {
    p_order_id: orderId,
    p_request_id: safeRequestId,
    p_amount: parsedAmount,
    p_payment_method: paymentMethod,
    p_notes: notes,
    p_action: action,
  })
  if (error) throw new Error(translateOrderError(error))
  return data
}

export default createOrder
