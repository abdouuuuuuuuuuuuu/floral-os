/** Turns Postgres workflow errors into guidance staff can act on. */
export function translateOrderError(error) {
  const msg = error?.message || ''
  if ((error?.code === 'PGRST202' || /function public\.(set_order_status|mark_order_delivered|mark_order_handed_off|blossom_void_order|blossom_restore_voided_order|blossom_reopen_voided_order)\(.*\) does not exist|could not find the function.*(set_order_status|mark_order_delivered|mark_order_handed_off|blossom_void_order|blossom_restore_voided_order|blossom_reopen_voided_order)/i.test(msg))
      && /(set_order_status|mark_order_delivered|mark_order_handed_off|blossom_void_order|blossom_restore_voided_order|blossom_reopen_voided_order)/i.test(msg)) {
    return 'Order status changes are not installed in Supabase yet. Ask the administrator to apply the latest order workflow migration, then retry.'
  }
  if (/function public\.blossom_create_order\(jsonb, jsonb\) does not exist|could not find the function.*blossom_create_order/i.test(msg)) {
    return 'Order saving is not fully installed in Supabase yet. No order was saved. Ask the administrator to apply the latest order-creation migration, then retry.'
  }
  if ((error?.code === 'PGRST202' && /delay_order/i.test(msg)) || /column .*?(original_delivery_date|delay_reason|delayed_at|delay_history).* does not exist/i.test(msg)) {
    return 'Order rescheduling is not fully installed in Supabase yet. No changes were made. Ask the administrator to apply the latest order-delay migration, then retry.'
  }
  if (msg.includes('must be signed in')) return 'Your session expired. Sign in again.'
  if (msg.includes('not active')) return 'This account has been deactivated.'
  if (msg.includes('role cannot create orders')) return 'You do not have permission to create orders.'
  if (msg.includes('role cannot edit orders')) return 'You do not have permission to edit orders.'
  if (msg.includes('role cannot update order status')) return 'You do not have permission to update order status.'
  if (msg.includes('role cannot mark deliveries complete')) return 'You do not have permission to confirm delivery.'
  if (msg.includes('role cannot record courier handoff')) return 'You do not have permission to record courier handoff.'
  if (msg.includes('delivery date is required before courier handoff')) return 'Set the delivery date before handing this order to the courier.'
  if (msg.includes('pickup orders cannot be handed to a courier')) return 'Pickup orders cannot be handed to a courier.'
  if (msg.includes('order is not ready for courier handoff')) return 'This order is no longer in a handoff-ready status. Refresh and check its status.'
  if (msg.includes('order is not an active delivery')) return 'This order is no longer an active delivery. Refresh the delivery list.'
  if (msg.includes('can void orders')) return 'Only an owner or manager can cancel orders.'
  if (msg.includes('undo an order cancellation')) return 'Only an owner or manager can undo an order cancellation.'
  if (msg.includes('role cannot reopen orders')) return 'You do not have permission to reopen orders.'
  if (msg.includes('not enough stock to reopen')) return 'There is not enough stock to reopen this order. The order and inventory were left unchanged.'
  if (msg.includes('order is not cancelled')) return 'This order is no longer cancelled. Refresh the page and try again.'
  if (msg.includes('undo window has expired')) return 'The cancellation can only be undone for a short time after it happens.'
  if (msg.includes('can delete orders')) return 'Only an owner can delete orders.'
  if (msg.includes('role cannot record order payments')) return 'You do not have permission to record order payments.'
  if (msg.includes('role cannot refund order payments')) return 'Only an owner or manager can record refunds.'
  if (msg.includes('role cannot delay orders')) return 'You do not have permission to reschedule orders.'
  if (msg.includes('order not found')) return 'This order could not be found. Refresh the order list and try again.'
  if (msg.includes('completed or cancelled orders cannot be delayed')) return 'Completed or cancelled orders cannot be rescheduled.'
  if (msg.includes('pickup orders do not have a delivery date')) return 'Pickup orders do not have a delivery date to reschedule.'
  if (msg.includes('new delivery date must be in the future')) return 'Choose a delivery date after today.'
  if (msg.includes('new delivery date must be later than the current date')) return 'Choose a date later than the order’s current delivery date.'
  if (msg.includes('delay reason must be 500 characters or fewer')) return 'Keep the rescheduling note under 500 characters.'
  if (msg.includes('no longer exists')) return 'One of the products was removed. Refresh and try again.'
  if (msg.includes('no items')) return 'Add at least one item before completing the sale.'
  return msg || 'Could not complete the sale.'
}
