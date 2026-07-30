import { supabase } from './supabase'

export async function createOrder({
  clientName,
  clientPhone,
  deliveryDate,
  deliveryTime,
  deliveryMethod,
  paymentMethod,
  clientSource,
  notes,
  items,
  subtotal,
  total,
  priceAdjustment,
}) {
  // 1. Generate order number
  const { data: lastOrder } = await supabase
    .from('orders')
    .select('order_number')
    .order('created_at', { ascending: false })
    .limit(1)

  const lastNum = lastOrder?.[0]?.order_number ? parseInt(lastOrder[0].order_number) : 0
  const newOrderNumber = String(lastNum + 1).padStart(3, '0')

  // 2. Create order
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: newOrderNumber,
      client_name: clientName,
      client_phone: clientPhone || null,
      delivery_date: deliveryDate || null,
      delivery_time: deliveryTime || null,
      delivery_method: deliveryMethod || 'motorcycle',
      payment_method: paymentMethod || 'cash',
      client_source: clientSource || 'inhouse',
      status: 'new',
      notes: notes || null,
      total_amount: total,
      subtotal_amount: subtotal,
      tax_amount: 0,
      amount_paid: 0,
      amount_due: total,
      payment_status: 'unpaid',
      price_adjustment: priceAdjustment || 0,
    })
    .select()
    .single()

  if (orderError) throw orderError

  // 3. Insert items WITH product snapshot
  const orderItems = items.map(item => ({
    order_id: orderData.id,
    product_id: item.id,
    quantity: item.quantity,
    unit_price: item.price,
    total_price: item.totalPrice,
    product_name: item.name || item.item_name || null,
    product_image: item.image_url || null,
    color: item.color || null,
    flower_type: item.flower_type || null,
    category: item.category || null,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) throw itemsError

  // 4. Deduct stock
  for (const item of items) {
    const { data: product } = await supabase
      .from('products')
      .select('stock_level')
      .eq('product_id', item.id)
      .single()

    if (!product) continue

    const newStock = Math.max(0, product.stock_level - item.quantity)
    await supabase
      .from('products')
      .update({ stock_level: newStock })
      .eq('product_id', item.id)
  }

  return orderData
}