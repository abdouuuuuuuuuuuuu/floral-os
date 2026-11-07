import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Minus, Plus, Printer, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { createOrder, delayOrder, recordOrderPayment, saveOrderEdits, voidOrder } from '../../lib/orders'
import { orderActionsFor } from '../../lib/permissions'
import { orderStatusTargets } from '../../lib/orderStatus'
import { supabase } from '../../lib/supabase'
import { printThermalReceipt } from '../../utils/printThermal'
import { orderBarcodeHtml } from '../../lib/orderBarcode'
import { petalsReceiptHtml, receiptLocation, receiptDelivery, deliveryReceiptHtml } from '../../utils/orderReceipt'
import { useShopName } from '../../hooks/useShopName'
import { fetchAllRows, localDate, addCalendarDays } from '../../lib/assistant/dataAccess'
import { normalize } from '../../lib/assistant/intentEngine'

const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-800 outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/10'

function announceOrdersChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('blossom:orders-changed'))
}

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export function AssistantOrderEditor({ mode, order, role, initialPrompt = '', initialDraft = null, cartItems = [], usdExchangeRate = 0, onDraftChange, onCancel, onSuccess }) {
  const shopName = useShopName()
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [productCategory, setProductCategory] = useState('all')
  const [visibleProductCount, setVisibleProductCount] = useState(12)
  const [productLoadError, setProductLoadError] = useState('')
  const [productLoadAttempt, setProductLoadAttempt] = useState(0)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [createdOrder, setCreatedOrder] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState('')
  const [stockWarning, setStockWarning] = useState('')
  const [error, setError] = useState('')
  const [replacementSourceKey, setReplacementSourceKey] = useState(null)
  const [review, setReview] = useState(false)
  const savingRef = useRef(false)
  const createRequestRef = useRef({ signature: '', id: '' })
  const editRequestRef = useRef({ signature: '', id: '' })
  const autoPrintedOrderRef = useRef(null)
  const [createStep, setCreateStep] = useState(() => initialDraft ? 3 : 0)
  const starterDetailsApplied = useRef(false)
  const customerFromPrompt = initialPrompt.match(/\bfor\s+(.+?)(?=\s+(?:with|on|at|today|tomorrow)\b|[?.!,]|$)/i)?.[1]?.trim() || ''
  const dateFromPrompt = initialPrompt.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1]
  const relativeDay = /\btomorrow\b/i.test(initialPrompt) ? 1 : /\btoday\b/i.test(initialPrompt) ? 0 : null
  const suggestedDate = dateFromPrompt || (relativeDay === null ? '' : addCalendarDays(localDate(), relativeDay))
  const timeMatch = initialPrompt.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  const suggestedHour = timeMatch ? ((Number(timeMatch[1]) % 12) + (timeMatch[3]?.toLowerCase() === 'pm' ? 12 : 0)) : null
  const [form, setForm] = useState(() => ({
    ...initialDraft?.editorDraft?.form,
    client_name: initialDraft?.editorDraft?.form?.client_name ?? order?.client_name ?? initialDraft?.client_name ?? customerFromPrompt,
    client_phone: initialDraft?.editorDraft?.form?.client_phone ?? order?.client_phone ?? initialDraft?.client_phone ?? '',
    customer_id: initialDraft?.editorDraft?.form?.customer_id ?? order?.customer_id ?? initialDraft?.customer_id ?? null,
    is_walk_in: Boolean(initialDraft?.editorDraft?.form?.is_walk_in ?? initialDraft?.is_walk_in),
    delivery_date: initialDraft?.editorDraft?.form?.delivery_date ?? order?.delivery_date?.split('T')[0] ?? initialDraft?.delivery_date ?? suggestedDate,
    delivery_time: initialDraft?.editorDraft?.form?.delivery_time ?? order?.delivery_time?.slice(0, 5) ?? initialDraft?.delivery_time ?? (timeMatch ? `${String(suggestedHour).padStart(2, '0')}:${timeMatch[2] || '00'}` : ''),
    delivery_method: initialDraft?.editorDraft?.form?.delivery_method ?? order?.delivery_method ?? initialDraft?.delivery_method ?? 'motorcycle',
    payment_method: initialDraft?.editorDraft?.form?.payment_method ?? order?.payment_method ?? initialDraft?.payment_method ?? 'cash',
    client_source: initialDraft?.editorDraft?.form?.client_source ?? order?.client_source ?? initialDraft?.client_source ?? 'inhouse',
    notes: initialDraft?.editorDraft?.form?.notes ?? order?.notes ?? initialDraft?.notes ?? '',
    payment_notes: initialDraft?.editorDraft?.form?.payment_notes ?? initialDraft?.payment_notes ?? '',
    amount_paid: Number(initialDraft?.editorDraft?.form?.amount_paid ?? initialDraft?.amount_paid ?? 0),
    amount_paid_usd: initialDraft?.editorDraft?.form?.amount_paid_usd ?? initialDraft?.amount_paid_usd ?? (usdExchangeRate ? (Number(initialDraft?.amount_paid || 0) / usdExchangeRate).toFixed(2) : ''),
    price_adjustment: Number(initialDraft?.editorDraft?.form?.price_adjustment ?? order?.price_adjustment ?? initialDraft?.price_adjustment ?? 0),
    status: initialDraft?.editorDraft?.form?.status ?? order?.status ?? 'new',
  }))
  const [lines, setLines] = useState(() => order
    ? (initialDraft?.editorDraft?.lines || (order.order_items || []).map((item) => ({
      key: item.id,
      id: item.id,
      product_id: item.product_id,
      name: item.product_name || item.products?.item_name || `Product ${item.product_id}`,
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price || 0),
      isNew: false,
      deleted: false,
    })))
    : (initialDraft?.editorDraft?.lines || initialDraft?.items || []).map((item, index) => ({
      key: item.key || `draft-${item.product_id}-${index}`,
      id: item.id || null,
      product_id: item.product_id,
      name: item.name,
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price || 0),
      image_url: item.image_url || '',
      color: item.color || '',
      flower_type: item.flower_type || '',
      category: item.category || '',
      isNew: true,
      deleted: Boolean(item.deleted),
    })))

  useEffect(() => {
    let active = true
    setLoadingProducts(true)
    setProductLoadError('')
    fetchAllRows((from, to) => supabase.from('products')
      .select('product_id, item_name, retail_price, stock_level, color, flower_type, category, image_url')
      .eq('is_active', true).order('item_name').order('product_id').range(from, to), 500)
      .then((data) => {
        if (!active) return
        setProducts(data || [])
      })
      .catch((queryError) => {
        if (!active) return
        setProducts([])
        setProductLoadError(queryError?.message || 'Could not load the product catalog.')
      })
      .finally(() => active && setLoadingProducts(false))
    return () => { active = false }
  }, [productLoadAttempt])

  useEffect(() => {
    if (!initialPrompt || loadingProducts || starterDetailsApplied.current) return
    starterDetailsApplied.current = true
    if (mode === 'edit') {
      if (/\b(delivery|deliver|delay|reschedule)\b/i.test(initialPrompt) && suggestedDate) updateForm('delivery_date', suggestedDate)
      if (/\b(delivery|deliver|reschedule)\b/i.test(initialPrompt) && timeMatch) updateForm('delivery_time', `${String(suggestedHour).padStart(2, '0')}:${timeMatch[2] || '00'}`)
      const statusMatch = initialPrompt.match(/\b(?:status\s+(?:to\s+)?|(?:mark|set)\s+(?:the\s+)?order\s+(?:#?\d+\s+)?(?:as\s+)?|to\s+)(new|processing|ready|complete|completed|done)\b/i)
      if (statusMatch) updateForm('status', ['completed', 'complete', 'ready'].includes(statusMatch[1].toLowerCase()) ? 'done' : statusMatch[1].toLowerCase())
      else if (/\b(complete|finish)\s+(?:the\s+)?order\b/i.test(initialPrompt)) updateForm('status', 'done')
      const customerMatch = initialPrompt.match(/\b(?:customer|client|name)\s+to\s+(.+?)(?=\s+(?:phone|delivery|payment|notes|status|with)\b|[?.!,]|$)/i)
      if (customerMatch) { updateForm('client_name', customerMatch[1].trim()); updateForm('customer_id', null) }
      const phoneMatch = initialPrompt.match(/\bphone\s+to\s+([+\d()\s-]+)/i)
      if (phoneMatch) updateForm('client_phone', phoneMatch[1].trim())
      if (/\b(?:delivery|deliver)\s+to\s+pickup\b/i.test(initialPrompt)) updateForm('delivery_method', 'pickup')
      else if (/\b(?:delivery|deliver)\s+to\s+(?:motorcycle|bike)\b/i.test(initialPrompt)) updateForm('delivery_method', 'motorcycle')
      else if (/\b(?:delivery|deliver)\s+to\s+dhd\b/i.test(initialPrompt)) updateForm('delivery_method', 'dhd')
      const methodMatch = initialPrompt.match(/\bpayment method\s+to\s+(cash|baridimob|usd)\b/i)
      if (methodMatch) updateForm('payment_method', methodMatch[1].toLowerCase())
      const adjustmentMatch = initialPrompt.match(/\b(?:price )?adjustment\s+to\s+(-?\d+)\b/i)
      if (adjustmentMatch) updateForm('price_adjustment', Number(adjustmentMatch[1]))
      const noteMatch = initialPrompt.match(/\bnotes?\s+to\s+(.+?)(?:[?.!]|$)/i)
      if (noteMatch) updateForm('notes', noteMatch[1].trim())
    }
    const replacementMatch = mode === 'edit' ? initialPrompt.match(/\b(?:replace|change|swap)\s+(?:(\d+)\s*[x×]\s*)?(.+?)\s+(?:with|into|to)\s+(.+?)[?.!,]*$/i) : null
    const quantityMatch = initialPrompt.match(mode === 'create'
      ? /\b(?:with|add|including)\s+(\d+)\s+(.+?)(?=\s+(?:today|tomorrow|on|at)\b|[?.!,]|$)/i
      : /\badd\s+(\d+)\s+(.+?)\s+(?:to|into)\s+(?:the\s+)?order\b/i)
    const removeMatch = mode === 'edit' ? initialPrompt.match(/\b(?:remove|delete)\s+(?:(\d+)\s+)?(.+?)\s+from\s+(?:the\s+)?order\b/i) : null
    const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1
    const productTerm = replacementMatch?.[3] || quantityMatch?.[2] || removeMatch?.[2]
    if (!productTerm) return
    const terms = productTerm.toLowerCase().split(/\s+/).filter((word) => !['of', 'the', 'a', 'an', 'product', 'products', 'item', 'items'].includes(word))
    const candidates = products.filter((product) => {
      const searchable = `${product.item_name} ${product.color || ''} ${product.flower_type || ''} ${product.category || ''}`.toLowerCase()
      return terms.every((term) => searchable.includes(term) || (term.endsWith('s') && searchable.includes(term.slice(0, -1))))
    })
    if (replacementMatch) {
      const sourceTokens = normalize(replacementMatch[2]).split(/\s+/).filter(Boolean)
      const sourceMatches = lines.filter((line) => {
        const searchable = normalize([line.name, line.color, line.flower_type, line.category].filter(Boolean).join(' ')).split(/\s+/)
        return sourceTokens.length && sourceTokens.every((token) => searchable.some((word) => word === token || word.startsWith(token)))
      })
      if (sourceMatches.length !== 1) {
        setError(sourceMatches.length ? `Several order items match “${replacementMatch[2]}”. Identify the exact item before saving.` : `“${replacementMatch[2]}” is not on this order. Review the existing lines before saving.`)
        return
      }
      const source = sourceMatches[0]
      if (!candidates.length) { setError(`“${productTerm.trim()}” is not in the active product catalog.`); return }
      if (candidates.length > 1) {
        setReplacementSourceKey(source.key)
        setProductSearch(productTerm.trim())
        setError(`Choose the exact catalog product to replace “${source.name}”.`)
        return
      }
      const product = candidates[0]
      const replaceLine = (line, target) => ({ ...line, product_id: target.product_id, name: target.item_name, unit_price: Math.round(Number(target.retail_price || 0)), image_url: target.image_url || '', color: target.color || '', flower_type: target.flower_type || '', category: target.category || '' })
      if (replacementMatch[1] && Number(replacementMatch[1]) > Number(source.quantity || 0)) {
        setError(`This order only has ${source.quantity} × ${source.name}. Reduce the replacement quantity or review the order lines.`)
        return
      }
      if (replacementMatch[1] && Number(replacementMatch[1]) < Number(source.quantity || 0)) {
        const replaceQuantity = Number(replacementMatch[1])
        const retained = { ...source, quantity: Number(source.quantity) - replaceQuantity }
        const replacement = { ...replaceLine(source, product), key: `replacement-${product.product_id}-${Date.now()}`, id: null, quantity: replaceQuantity, isNew: true, deleted: false }
        setLines((current) => current.flatMap((line) => line.key === source.key ? [retained, replacement] : [line]))
      } else {
        setLines((current) => current.map((line) => line.key === source.key ? replaceLine(line, product) : line))
      }
      return
    }
    if (candidates.length !== 1) { setProductSearch(productTerm.trim()); return }
    const product = candidates[0]
    if (removeMatch) {
      const existing = lines.find((line) => !line.deleted && String(line.product_id) === String(product.product_id))
      if (existing) setLines((current) => current.map((line) => line.key !== existing.key ? line : (removeMatch[1] && Number(removeMatch[1]) < line.quantity ? { ...line, quantity: line.quantity - Number(removeMatch[1]) } : { ...line, deleted: true })))
      return
    }
    const newLine = { key: `prompt-${product.product_id}-${Date.now()}`, id: null, product_id: product.product_id, name: product.item_name, quantity, unit_price: Math.round(Number(product.retail_price || 0)), image_url: product.image_url || '', color: product.color || '', flower_type: product.flower_type || '', category: product.category || '', isNew: true, deleted: false }
    if (mode === 'create') setLines([newLine])
    else setLines((current) => {
      const existing = current.find((line) => !line.deleted && String(line.product_id) === String(product.product_id))
      return existing ? current.map((line) => line === existing ? { ...line, quantity: line.quantity + quantity } : line) : [...current, newLine]
    })
  }, [initialPrompt, loadingProducts, mode, products])

  const subtotal = useMemo(() => lines.filter((line) => !line.deleted)
    .reduce((sum, line) => sum + line.quantity * line.unit_price, 0), [lines])
  const total = Math.max(0, subtotal + Number(form.price_adjustment || 0) + (mode === 'edit' ? Number(order?.tax_amount || 0) : 0))
  const amountPaidInDzd = Math.round(Number(form.amount_paid || 0))
  const paymentNotes = form.payment_method === 'usd' && amountPaidInDzd > 0
    ? `${Number(form.amount_paid_usd || 0).toFixed(2)} USDT at ${usdExchangeRate} DA/USDT = ${amountPaidInDzd} DA`
    : form.payment_notes.trim()
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const matchingProductResults = products.filter((product) => {
    const query = normalize(productSearch)
    const matchesCategory = productCategory === 'all' || product.category === productCategory
    if (!matchesCategory) return false
    if (!query) return productCategory !== 'all'
    return normalize(`${product.item_name} ${product.color || ''} ${product.flower_type || ''} ${product.category || ''}`).includes(query)
  })
  const matchingProducts = matchingProductResults.slice(0, visibleProductCount)
  useEffect(() => { setVisibleProductCount(12) }, [productSearch, productCategory])

  const lastDraftSignature = useRef('')
  useEffect(() => {
    if (!onDraftChange || saved) return
    const snapshot = { form, lines }
    const signature = JSON.stringify(snapshot)
    if (signature === lastDraftSignature.current) return
    lastDraftSignature.current = signature
    onDraftChange(snapshot)
  }, [form, lines, onDraftChange, saved])

  const editChanges = useMemo(() => {
    if (mode !== 'edit' || !order) return []
    const changes = []
    const fields = [
      ['Customer', order.client_name || '', form.client_name.trim()],
      ['Phone', order.client_phone || '', form.client_phone.trim()],
      ['Delivery date', order.delivery_date || '', form.delivery_date || ''],
      ['Delivery time', (order.delivery_time || '').slice(0, 5), form.delivery_time || ''],
      ['Fulfillment', order.delivery_method || '', form.delivery_method],
      ['Order source', order.client_source || 'inhouse', form.client_source],
      ['Notes', order.notes || '', form.notes],
      ['Price adjustment', Number(order.price_adjustment || 0), Number(form.price_adjustment || 0)],
      ...(orderActionsFor(role).status ? [['Status', order.status || '', form.status]] : []),
    ]
    for (const [label, before, after] of fields) if (String(before) !== String(after)) changes.push(`${label}: ${before || 'Not set'} → ${after || 'Not set'}`)
    for (const line of lines) {
      if (line.isNew && !line.deleted) changes.push(`Add ${line.quantity} × ${line.name} at ${Number(line.unit_price || 0).toLocaleString('fr-FR')} DA each`)
      else if (line.deleted) changes.push(`Remove ${line.name} (${line.quantity})`)
      else {
        const original = order.order_items?.find((item) => item.id === line.id)
        if (!original) continue
        if (Number(original.quantity) !== Number(line.quantity)) changes.push(`${line.name}: quantity ${original.quantity} → ${line.quantity}`)
        if (String(original.product_id) !== String(line.product_id)) changes.push(`Replace ${original.product_name || original.products?.item_name || 'order item'} with ${line.name}`)
        if (Number(original.unit_price) !== Number(line.unit_price)) changes.push(`${line.name}: unit price ${Number(original.unit_price).toLocaleString('fr-FR')} → ${Number(line.unit_price).toLocaleString('fr-FR')} DA`)
      }
    }
    return changes
  }, [form, lines, mode, order, role])

  const productCatalog = <div className="space-y-1.5">
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" /><input aria-label="Search products to add" className={`${fieldClass} pl-8`} placeholder={loadingProducts ? 'Loading products…' : 'Search all products'} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></div>
      <select aria-label="Filter products by category" className={`${fieldClass} max-w-32`} value={productCategory} onChange={(event) => setProductCategory(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
    </div>
    {productLoadError && <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700"><span className="min-w-0">{productLoadError}</span><button type="button" onClick={() => setProductLoadAttempt((attempt) => attempt + 1)} className="shrink-0 font-semibold underline">Retry</button></div>}
    {loadingProducts && <p className="px-1 py-2 text-[11px] text-gray-500">Loading the full product catalog…</p>}
    {!loadingProducts && !productLoadError && productSearch.trim() && matchingProductResults.length === 0 && <p className="rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-500">No products match “{productSearch.trim()}”. Try another name or category.</p>}
    {!loadingProducts && !productLoadError && !productSearch.trim() && productCategory !== 'all' && matchingProductResults.length === 0 && <p className="rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-500">No active products in this category.</p>}
    {!loadingProducts && !productLoadError && !productSearch.trim() && productCategory === 'all' && <p className="px-1 text-[10px] text-gray-400">Type a name, color, flower type, or category to search the full catalog.</p>}
    {matchingProducts.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">{matchingProducts.map((product) => <button key={product.product_id} type="button" onClick={() => addProduct(product)} className="flex w-full items-center justify-between gap-2 border-b border-gray-100 px-2.5 py-2 text-left last:border-0 hover:bg-accent-subtle/40"><span className="min-w-0"><span className="block truncate text-[11px] font-medium text-gray-700">{product.item_name}<span className="ml-1 font-normal text-gray-400">{product.color || product.flower_type || ''}</span></span><span className="text-[10px] text-gray-400">Stock: {Number(product.stock_level || 0).toLocaleString('fr-FR')}</span></span><span className="shrink-0 text-[10px] font-semibold text-primary">{Number(product.retail_price || 0).toLocaleString('fr-FR')} DA <Plus size={12} className="ml-1 inline" /></span></button>)}</div>}
    {matchingProductResults.length > matchingProducts.length && <button type="button" onClick={() => setVisibleProductCount((count) => count + 12)} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-[11px] font-semibold text-primary hover:bg-accent-subtle/40">Show {Math.min(12, matchingProductResults.length - matchingProducts.length)} more · {matchingProductResults.length - matchingProducts.length} remaining</button>}
  </div>

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const addProduct = (product) => {
    setLines((current) => {
      if (replacementSourceKey) {
        return current.map((line) => line.key === replacementSourceKey
          ? { ...line, product_id: product.product_id, name: product.item_name, unit_price: Math.round(Number(product.retail_price || 0)), image_url: product.image_url || '', color: product.color || '', flower_type: product.flower_type || '', category: product.category || '' }
          : line)
      }
      const existing = current.find((line) => !line.deleted && String(line.product_id) === String(product.product_id))
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line)
      return [...current, {
        key: `new-${product.product_id}-${Date.now()}`,
        id: null,
        product_id: product.product_id,
        name: product.item_name,
        quantity: 1,
        unit_price: Math.round(Number(product.retail_price || 0)),
        image_url: product.image_url || '',
        color: product.color || '',
        flower_type: product.flower_type || '',
        category: product.category || '',
        isNew: true,
        deleted: false,
      }]
    })
    if (replacementSourceKey) {
      setReplacementSourceKey(null)
      setError('')
    }
    setProductSearch('')
  }
  const addCartItems = () => {
    setLines((current) => {
      let next = [...current]
      for (const cartItem of cartItems) {
        const productId = cartItem.id ?? cartItem.product_id
        if (!productId) continue
        const quantity = Math.max(1, Math.floor(Number(cartItem.quantity) || 1))
        const existing = next.find((line) => !line.deleted && String(line.product_id) === String(productId))
        if (existing) {
          next = next.map((line) => line === existing ? { ...line, quantity: line.quantity + quantity } : line)
        } else {
          next.push({
            key: `cart-${productId}-${Date.now()}-${next.length}`,
            id: null,
            product_id: productId,
            name: cartItem.name || cartItem.item_name || 'Product',
            quantity,
            unit_price: Math.round(Number(cartItem.price ?? cartItem.unit_price ?? 0)),
            image_url: cartItem.image_url || '',
            color: cartItem.color || '',
            flower_type: cartItem.flower_type || '',
            category: cartItem.category || '',
            isNew: true,
            deleted: false,
          })
        }
      }
      return next
    })
  }

  const saveOrder = async () => {
    if (savingRef.current) return
    if (!form.client_name.trim()) { setError('Add the customer name before saving.'); return }
    if (!lines.some((line) => !line.deleted)) { setError('An order needs at least one product.'); return }
    const amountPaid = amountPaidInDzd
    if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > total) { setError(`Amount collected must be between 0 and ${total.toLocaleString('fr-FR')} DA.`); return }
    if (form.payment_method === 'usd' && !usdExchangeRate) { setError('Set the USDT exchange rate in Settings before recording a USDT payment.'); return }
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const createPayload = {
          clientName: form.client_name.trim(),
          customerId: form.customer_id,
          clientPhone: form.client_phone.trim(),
          deliveryDate: form.is_walk_in ? '' : form.delivery_date,
          deliveryTime: form.is_walk_in ? '' : form.delivery_time,
          deliveryMethod: form.is_walk_in ? 'pickup' : form.delivery_method,
          paymentMethod: form.payment_method,
          clientSource: form.client_source,
          notes: form.notes,
          items: lines.filter((line) => !line.deleted).map((line) => ({ id: line.product_id, name: line.name, image_url: line.image_url, color: line.color, flower_type: line.flower_type, category: line.category, quantity: line.quantity, price: line.unit_price, totalPrice: line.quantity * line.unit_price })),
          subtotal,
          total,
          priceAdjustment: Number(form.price_adjustment || 0),
          paymentStatus: amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
          amountPaid,
          amountDue: Math.max(0, total - amountPaid),
          paymentNotes,
        }
        const createSignature = JSON.stringify(createPayload)
        if (createRequestRef.current.signature !== createSignature) {
          createRequestRef.current = { signature: createSignature, id: makeRequestId() }
        }
        const result = await createOrder({ ...createPayload, requestId: createRequestRef.current.id })
        // Offline: the sale is queued and will finalize on reconnect.
        if (result.queued) {
          setStockWarning('')
          setSaved(true)
          setError('No internet — the order is saved and will finalize automatically when you reconnect. It will appear in Orders then.')
          onSuccess?.()
          return result
        }
        announceOrdersChanged()
        setCreatedOrder({
          ...result.order,
          client_name: form.client_name.trim(),
          client_phone: form.client_phone.trim(),
          delivery_date: form.is_walk_in ? '' : form.delivery_date,
          delivery_time: form.is_walk_in ? '' : form.delivery_time,
          delivery_method: form.is_walk_in ? 'pickup' : form.delivery_method,
          payment_method: form.payment_method,
          payment_status: amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
          payment_notes: paymentNotes,
          amount_paid: amountPaid,
          amount_due: Math.max(0, total - amountPaid),
          subtotal_amount: subtotal,
          total_amount: total,
          notes: form.notes,
          created_at: result.order?.created_at || new Date().toISOString(),
          order_items: lines.filter((line) => !line.deleted).map((line) => ({
            product_id: line.product_id,
            quantity: line.quantity,
            unit_price: line.unit_price,
            total_price: line.quantity * line.unit_price,
            product: { item_name: line.name },
          })),
        })
        if (result.warnings?.negative_stock?.length) setStockWarning(`Stock needs a recount: ${result.warnings.negative_stock.map((item) => item.product_name).join(', ')}.`)
        setSaved(true)
        onSuccess?.()
        return result
      }

      const updates = []
      const additions = lines.filter((line) => line.isNew && !line.deleted).map((line) => ({ product_id: line.product_id, quantity: line.quantity, unit_price: line.unit_price }))
      for (const line of lines.filter((item) => !item.isNew)) {
        const original = order.order_items.find((item) => item.id === line.id)
        if (!original) continue
        const productChanged = String(line.product_id) !== String(original.product_id)
        const priceChanged = Number(line.unit_price) !== Number(original.unit_price)
        if (line.deleted || productChanged || priceChanged) {
          updates.push({ id: line.id, quantity: line.quantity, deleted: true })
          if (!line.deleted) additions.push({ product_id: line.product_id, quantity: line.quantity, unit_price: line.unit_price })
        } else if (line.quantity !== Number(original.quantity)) {
          updates.push({ id: line.id, quantity: line.quantity, deleted: false })
        }
      }
      const orderData = {
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim(),
        customer_id: form.customer_id,
        delivery_date: form.delivery_date,
        delivery_time: form.delivery_time,
        delivery_method: form.delivery_method,
        payment_method: form.payment_method,
        client_source: form.client_source,
        notes: form.notes,
        price_adjustment: Number(form.price_adjustment || 0),
      }
      const requestSignature = JSON.stringify({ orderId: order.id, additions, updates })
      if (additions.length && editRequestRef.current.signature !== requestSignature) {
        editRequestRef.current = { signature: requestSignature, id: makeRequestId() }
      }
      await saveOrderEdits({
        orderId: order.id,
        items: updates,
        orderData,
        additions,
        requestId: additions.length ? editRequestRef.current.id : null,
        status: orderActionsFor(role).status && form.status !== order.status ? form.status : null,
      })
      announceOrdersChanged()
      setSaved(true)
      onSuccess?.()
      return { order }
    } catch (saveError) {
      setError(saveError.message || 'Could not save the order. Check your access and try again.')
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handlePrintCreatedOrder = async () => {
    if (!createdOrder || printing) return
    setPrinting(true)
    setPrintError('')
    try {
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
      const fmtMoney = (value) => Number(value || 0).toLocaleString('fr-FR')
      const linesHtml = (createdOrder.order_items || []).map((item) => `<tr><td style="text-align:left;padding:1px 0">${escapeHtml(item.product?.item_name || `Product #${item.product_id}`)}</td><td style="text-align:center;padding:1px 0;width:30px">x${Number(item.quantity || 0)}</td><td style="text-align:right;padding:1px 0;width:60px">${fmtMoney(item.total_price)} DA</td></tr>`).join('')
      const createdDate = new Date(createdOrder.created_at)
      const paymentLabel = { cash: 'Cash', baridimob: 'BaridiMob', usd: 'USDT' }[createdOrder.payment_method] || createdOrder.payment_method || 'Cash'
      const paid = Number(createdOrder.amount_paid || 0)
      const due = Number(createdOrder.amount_due ?? Math.max(0, Number(createdOrder.total_amount || 0) - paid))
      const petalsHtml = await petalsReceiptHtml(createdOrder.customer_id)
      const html = `<div style="text-align:center;margin-bottom:8px"><div style="font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:2px">${escapeHtml(shopName)}</div><div style="font-size:10px;color:#555">Flower Shop POS</div><div style="font-size:13px;font-weight:bold;margin-top:6px">Order #${escapeHtml(createdOrder.order_number)}</div><div style="font-size:10px;color:#555;margin-bottom:8px">${Number.isNaN(createdDate.getTime()) ? '' : `${createdDate.toLocaleDateString('fr-FR')} ${createdDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}</div></div><div class="divider"></div><div style="margin-bottom:8px"><div class="section">Client</div><div style="font-size:12px">${escapeHtml(createdOrder.client_name)}</div>${createdOrder.client_phone ? `<div style="font-size:12px">${escapeHtml(createdOrder.client_phone)}</div>` : ''}${receiptLocation(createdOrder) && !receiptDelivery(createdOrder) ? `<div style="font-size:12px">Location: ${escapeHtml(receiptLocation(createdOrder))}</div>` : ''}${createdOrder.notes ? `<div style="font-size:10px;color:#555;margin-top:4px;font-style:italic">${escapeHtml(createdOrder.notes)}</div>` : ''}</div>${deliveryReceiptHtml(createdOrder)}<div class="divider"></div><div style="margin-bottom:8px"><div class="section">Details</div><div class="row"><span>Payment</span><span>${escapeHtml(paymentLabel)}</span></div><div class="row"><span>Payment status</span><span>${escapeHtml(createdOrder.payment_status)}</span></div></div><div class="divider"></div><div style="margin-bottom:8px"><div class="section">Items</div><table style="width:100%;border-collapse:collapse"><tbody>${linesHtml}</tbody></table></div><div class="divider"></div><div style="margin-bottom:8px"><div class="row"><span>Subtotal</span><span>${fmtMoney(createdOrder.subtotal_amount)} DA</span></div><div class="row"><span>Amount paid</span><span>${fmtMoney(paid)} DA</span></div>${due > 0 ? `<div class="row"><span>Amount due</span><span>${fmtMoney(due)} DA</span></div>` : ''}<div class="total-row"><span>TOTAL</span><span>${fmtMoney(createdOrder.total_amount)} DA</span></div></div>${petalsHtml}${orderBarcodeHtml(createdOrder.order_number)}<div class="footer">Thank you for your order!<br>${escapeHtml(shopName)} — Blossom Workspace</div>`
      const didPrint = await printThermalReceipt(html, `FLORAL-OS-Receipt-${createdOrder.order_number}`, './logo-Black.png')
      if (!didPrint) throw new Error('The print dialog did not open. Check browser printing support, then retry.')
    } catch (printException) {
      setPrintError(printException?.message || 'Could not open the print dialog. Please try again.')
    } finally {
      setPrinting(false)
    }
  }

  useEffect(() => {
    if (mode !== 'create' || !saved || !createdOrder) return
    if (autoPrintedOrderRef.current === createdOrder.id) return
    autoPrintedOrderRef.current = createdOrder.id
    void handlePrintCreatedOrder()
  }, [mode, saved, createdOrder, handlePrintCreatedOrder])

  if (saved) return <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800"><p className="flex items-center gap-2"><Check size={15} />{mode === 'create' ? `Order #${createdOrder?.order_number ?? ''} created successfully.` : `Order #${order.order_number} updated.`}</p>{mode === 'create' && createdOrder && <button type="button" onClick={handlePrintCreatedOrder} disabled={printing} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">{printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}{printing ? 'Preparing receipt…' : 'Print receipt'}</button>}{printError && <p role="alert" className="text-[11px] font-medium text-rose-700">{printError}</p>}{stockWarning && <p className="font-medium text-amber-800">{stockWarning}</p>}</div>

  if (mode === 'create') {
    const steps = ['Products', 'Customer', form.is_walk_in ? 'Payment' : 'Delivery', 'Review']
    const activeLines = lines.filter((line) => !line.deleted)
    const stepError = () => {
      if (createStep === 0 && !activeLines.length) return 'Add at least one product to continue.'
      if (createStep === 1 && !form.client_name.trim()) return 'Add a customer name to continue.'
      return ''
    }
    const nextStep = () => {
      const message = stepError()
      if (message) { setError(message); return }
      setError('')
      setCreateStep((step) => Math.min(steps.length - 1, step + 1))
    }
    const productLines = <div className="space-y-2">
      {activeLines.map((line) => <div key={line.key} className="flex items-center gap-2 rounded-xl border border-[#F2E6EC] bg-white px-2.5 py-2">
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#403540]">{line.name}</p><p className="text-[10px] text-[#958791]">{line.unit_price.toLocaleString('fr-FR')} DA each</p></div>
        <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))} className="grid h-7 w-7 place-items-center rounded-lg bg-[#F8F3F6] text-[#665663]"><Minus size={12} /></button>
        <span className="w-5 text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
        <button type="button" aria-label={`Increase ${line.name}`} onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))} className="grid h-7 w-7 place-items-center rounded-lg bg-[#F8F3F6] text-[#665663]"><Plus size={12} /></button>
        <button type="button" aria-label={`Remove ${line.name}`} onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, deleted: true } : item))} className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
      </div>)}
      {productCatalog}
    </div>
    return <div className="mt-3 overflow-hidden rounded-2xl border border-[#EEDDE6] bg-[#FFFCFE] shadow-[0_8px_24px_rgba(78,43,62,0.07)]">
      <div className="border-b border-[#F1E5EB] bg-white px-3.5 pb-3 pt-3">
        <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold tracking-[-0.02em] text-[#392B36]">Create an order</p><p className="mt-0.5 text-[10px] text-[#8F818B]">A few quick steps, then review before saving.</p></div><button type="button" onClick={onCancel} aria-label="Cancel order creation" className="rounded-lg p-1.5 text-[#958791] hover:bg-[#F8F1F5]"><X size={15}/></button></div>
        <div className="grid grid-cols-4 gap-1.5">{steps.map((label, index) => <button key={label} type="button" onClick={() => { if (index <= createStep || (index === 1 && activeLines.length) || (index === 2 && activeLines.length && form.client_name.trim()) || (index === 3 && activeLines.length && form.client_name.trim())) { setError(''); setCreateStep(index) } }} className="min-w-0 text-left"><span className={`mb-1 block h-1 rounded-full ${index <= createStep ? 'bg-gradient-to-r from-[#B52C64] to-[#D99364]' : 'bg-[#EEE6EB]'}`}/><span className={`truncate text-[9px] font-semibold ${index === createStep ? 'text-[#8F315B]' : 'text-[#9A8D95]'}`}>{label}</span></button>)}</div>
      </div>
      <div className="max-h-[min(52vh,390px)] space-y-3 overflow-y-auto p-3.5">
        {createStep === 0 && <><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold text-[#453842]">What’s in the order?</h3><p className="mt-0.5 text-[10px] text-[#91838D]">Search the catalog or bring items from your cart.</p></div><span className="rounded-full bg-[#F8EEF3] px-2 py-1 text-[10px] font-semibold text-[#87385A]">{activeLines.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
          {cartItems.length > 0 && <button type="button" onClick={addCartItems} className="flex w-full items-center gap-2 rounded-xl border border-[#EBD7E1] bg-white px-3 py-2.5 text-left text-xs font-semibold text-[#75405A] hover:bg-[#FFF7FA]"><ShoppingBag size={15} className="text-[#B52C64]"/><span className="flex-1">Add items from cart</span><span className="text-[10px] text-[#9A7E8C]">{cartItems.length} lines <ChevronRight size={13} className="ml-1 inline"/></span></button>}
          {productLines}<div className="flex justify-between border-t border-dashed border-[#E8DDE3] pt-2 text-xs"><span className="text-[#827580]">Current total</span><strong className="text-[#633252]">{subtotal.toLocaleString('fr-FR')} DA</strong></div>
        </>}
        {createStep === 1 && <><div><h3 className="text-xs font-semibold text-[#453842]">Who is this order for?</h3><p className="mt-0.5 text-[10px] text-[#91838D]">Add a name; a phone number helps with delivery.</p></div><label className="block text-[10px] font-semibold text-[#756873]">CUSTOMER NAME<input autoFocus aria-label="Customer name" className={`${fieldClass} mt-1.5 rounded-xl px-3 py-2.5 text-sm`} placeholder="e.g. Amel Benali" value={form.client_name} onChange={(event) => { updateForm('client_name', event.target.value); if (form.is_walk_in) { updateForm('is_walk_in', false); updateForm('delivery_method', 'motorcycle') } }} /></label><label className="block text-[10px] font-semibold text-[#756873]">PHONE NUMBER <span className="font-normal text-[#AA9DA5]">· optional</span><input aria-label="Customer phone" className={`${fieldClass} mt-1.5 rounded-xl px-3 py-2.5 text-sm`} placeholder="05…" value={form.client_phone} onChange={(event) => updateForm('client_phone', event.target.value)} /></label><label className="block text-[10px] font-semibold text-[#756873]">ORDER SOURCE<select aria-label="Order source" className={`${fieldClass} mt-1.5 rounded-xl px-3 py-2.5`} value={form.client_source} onChange={(event) => updateForm('client_source', event.target.value)}><option value="inhouse">In-house</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="facebook">Facebook</option></select></label></>}
        {createStep === 2 && <><div><h3 className="text-xs font-semibold text-[#453842]">{form.is_walk_in ? 'Take payment' : 'When, how, and payment?'}</h3><p className="mt-0.5 text-[10px] text-[#91838D]">{form.is_walk_in ? 'Walk-in customer · pickup now. Choose payment and record money collected.' : 'Add delivery details, record money collected now, and leave instructions for the florist.'}</p></div>{!form.is_walk_in && <><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold text-[#756873]">DATE<input aria-label="Delivery date" className={`${fieldClass} mt-1.5 rounded-xl px-2.5 py-2.5`} type="date" value={form.delivery_date} onChange={(event) => updateForm('delivery_date', event.target.value)} /></label><label className="text-[10px] font-semibold text-[#756873]">TIME<input aria-label="Delivery time" className={`${fieldClass} mt-1.5 rounded-xl px-2.5 py-2.5`} type="time" value={form.delivery_time} onChange={(event) => updateForm('delivery_time', event.target.value)} /></label></div><label className="block text-[10px] font-semibold text-[#756873]">FULFILLMENT<select aria-label="Delivery method" className={`${fieldClass} mt-1.5 rounded-xl px-2.5 py-2.5`} value={form.delivery_method} onChange={(event) => updateForm('delivery_method', event.target.value)}><option value="motorcycle">Motorcycle</option><option value="dhd">DHD</option><option value="pickup">Pickup</option></select></label></>}<label className="block text-[10px] font-semibold text-[#756873]">PAYMENT METHOD<select aria-label="Payment method" className={`${fieldClass} mt-1.5 rounded-xl px-2.5 py-2.5`} value={form.payment_method} onChange={(event) => { const method = event.target.value; updateForm('payment_method', method); if (method === 'usd' && usdExchangeRate > 0) updateForm('amount_paid_usd', (Number(form.amount_paid || 0) / usdExchangeRate).toFixed(2)) }}><option value="cash">Cash</option><option value="baridimob">BaridiMob</option><option value="usd" disabled={!usdExchangeRate}>USDT{usdExchangeRate ? '' : ' · set rate in Settings'}</option></select></label><div className="rounded-xl border border-[#F0E3E9] bg-white p-3"><label className="block text-[10px] font-semibold text-[#756873]">AMOUNT COLLECTED NOW · {form.payment_method === 'usd' ? 'USDT' : 'DA'}<input aria-label={`Amount collected now in ${form.payment_method === 'usd' ? 'USDT' : 'DA'}`} className={`${fieldClass} mt-1.5 rounded-xl px-2.5 py-2.5`} type="number" min="0" step={form.payment_method === 'usd' ? '0.01' : '1'} max={form.payment_method === 'usd' && usdExchangeRate ? total / usdExchangeRate : total} value={form.payment_method === 'usd' ? (form.amount_paid_usd ?? '') : form.amount_paid} onChange={(event) => { const value = event.target.value; if (form.payment_method === 'usd') { updateForm('amount_paid_usd', value); updateForm('amount_paid', usdExchangeRate ? Math.round(Number(value || 0) * usdExchangeRate) : 0) } else updateForm('amount_paid', value) }} /></label><p className="mt-1.5 text-[10px] text-[#91838D]">{Math.max(0, total - Number(form.amount_paid || 0)).toLocaleString('fr-FR')} DA remains. Collected payments are recorded as cash-in with the order.</p>{form.payment_method === 'usd' && <p className="mt-2 text-[10px] text-[#91838D]">Rate: 1 USDT = {usdExchangeRate.toLocaleString('fr-FR')} DA · equivalent: {Number(form.amount_paid || 0).toLocaleString('fr-FR')} DA{Number(form.amount_paid || 0) > total ? ' · exceeds the order total' : ''}</p>}</div>{!form.is_walk_in && <><label className="block text-[10px] font-semibold text-[#756873]">ORDER NOTES <span className="font-normal text-[#AA9DA5]">· optional</span><textarea aria-label="Order notes" className={`${fieldClass} mt-1.5 resize-y rounded-xl`} rows={2} maxLength={1000} placeholder="Delivery address, card message, bouquet preferences…" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label><label className="block text-[10px] font-semibold text-[#756873]">PRICE ADJUSTMENT · DA<input aria-label="Price adjustment" className={`${fieldClass} mt-1.5 rounded-xl px-2.5 py-2.5`} type="number" value={form.price_adjustment} onChange={(event) => updateForm('price_adjustment', event.target.value)} /></label></>}</>}
        {createStep === 3 && <><div><h3 className="text-xs font-semibold text-[#453842]">Ready to place it?</h3><p className="mt-0.5 text-[10px] text-[#91838D]">Check the details before creating the order.</p></div><div className="rounded-xl border border-[#F0E3E9] bg-white p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[#403540]">{form.client_name || 'Customer not set'}</p><p className="mt-0.5 text-[10px] text-[#91838D]">{form.client_phone || 'No phone number'} · {form.is_walk_in ? 'Walk-in · pickup now' : `${form.delivery_method} · ${form.client_source}`}</p></div><button type="button" onClick={() => setCreateStep(1)} className="text-[10px] font-semibold text-[#96335D]">Edit customer</button></div><div className="my-2.5 space-y-1.5 border-y border-dashed border-[#EEE4E9] py-2.5">{activeLines.map((line) => <div key={line.key} className="flex justify-between gap-2 text-[11px]"><span className="min-w-0 truncate text-[#655964]">{line.quantity} × {line.name}</span><span className="shrink-0 font-medium text-[#55414F]">{(line.quantity * line.unit_price).toLocaleString('fr-FR')} DA</span></div>)}</div>{!form.is_walk_in && <div className="flex justify-between text-[10px] text-[#827580]"><span>Delivery</span><span>{form.delivery_date || 'Date not set'}{form.delivery_time ? ` · ${form.delivery_time}` : ''}</span></div>}<div className="mt-1 flex justify-between text-[10px] text-[#827580]"><span>Payment</span><span>{form.payment_method} · {form.payment_method === 'usd' ? `${Number(form.amount_paid_usd || 0).toFixed(2)} USDT (${Number(form.amount_paid || 0).toLocaleString('fr-FR')} DA)` : `${Number(form.amount_paid || 0).toLocaleString('fr-FR')} DA`} collected</span></div>{form.notes && <p className="mt-2 border-t border-[#F1E7EC] pt-2 text-[10px] text-[#827580]">Note: {form.notes}</p>}<div className="mt-2 flex justify-between border-t border-[#F1E7EC] pt-2 text-xs"><strong className="text-[#4A3B47]">Total · {Math.max(0, total - Number(form.amount_paid || 0)).toLocaleString('fr-FR')} DA due</strong><strong className="text-sm text-[#762E57]">{total.toLocaleString('fr-FR')} DA</strong></div><button type="button" onClick={() => setCreateStep(2)} className="mt-2 text-[10px] font-semibold text-[#96335D]">Edit {form.is_walk_in ? 'payment' : 'delivery and payment'}</button></div><p className="text-[10px] leading-relaxed text-[#968993]">Creating the order updates stock and records collected money in the cash register.</p></>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-medium text-rose-700">{error}</p>}
      </div>
      <div className="flex gap-2 border-t border-[#F0E4EA] bg-white p-3"><button type="button" onClick={() => createStep === 0 ? onCancel?.() : (setError(''), setCreateStep((step) => step - 1))} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#EAE1E6] px-3 text-xs font-semibold text-[#645660] hover:bg-[#FAF6F8]">{createStep === 0 ? 'Cancel' : <><ChevronLeft size={14}/>Back</>}</button>{createStep < 3 ? <button type="button" onClick={nextStep} className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-[#A92D61] to-[#BF4779] px-3 text-xs font-semibold text-white shadow-sm hover:brightness-105">Continue<ChevronRight size={14}/></button> : <button type="button" disabled={saving} onClick={saveOrder} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#A92D61] to-[#BF4779] px-3 text-xs font-semibold text-white shadow-sm disabled:opacity-60">{saving ? <><Loader2 size={14} className="animate-spin"/>Creating…</> : <><Check size={14}/>Create order</>}</button>}</div>
    </div>
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-[#FFFCFE] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">{mode === 'create' ? 'New order details' : `Edit order #${order.order_number}`}</p>
        <button type="button" onClick={onCancel} aria-label="Cancel order editor" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={15} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Customer name" className={fieldClass} placeholder="Customer name *" value={form.client_name} onChange={(event) => { updateForm('client_name', event.target.value); updateForm('customer_id', null) }} />
        <input aria-label="Customer phone" className={fieldClass} placeholder="Phone" value={form.client_phone} onChange={(event) => { updateForm('client_phone', event.target.value); updateForm('customer_id', null) }} />
        <input aria-label="Delivery date" className={fieldClass} type="date" value={form.delivery_date} onChange={(event) => updateForm('delivery_date', event.target.value)} />
        <input aria-label="Delivery time" className={fieldClass} type="time" value={form.delivery_time} onChange={(event) => updateForm('delivery_time', event.target.value)} />
        <select aria-label="Delivery method" className={fieldClass} value={form.delivery_method} onChange={(event) => updateForm('delivery_method', event.target.value)}>
          <option value="motorcycle">Motorcycle</option><option value="dhd">DHD</option><option value="pickup">Pickup</option>
        </select>
        <div className={`${fieldClass} flex items-center justify-between`} aria-label="Recorded payment method"><span className="text-gray-400">Payment method</span><strong className="font-semibold capitalize text-gray-700">{order.payment_method || 'cash'}</strong></div>
        <select aria-label="Order source" className={fieldClass} value={form.client_source} onChange={(event) => updateForm('client_source', event.target.value)}>
          <option value="inhouse">In-house</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="facebook">Facebook</option>
        </select>
        {mode === 'edit' && orderActionsFor(role).status && order?.status !== 'cancelled' && <select aria-label="Order status" className={fieldClass} value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
          {[order.status, ...orderStatusTargets(order.status).filter((status) => status !== 'cancelled')].map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
        </select>}
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Products</p>
        {lines.filter((line) => !line.deleted).length === 0 && <p className="text-xs text-gray-400">No products yet. Search below to add one.</p>}
        {cartItems.length > 0 && <button type="button" onClick={addCartItems} className="w-full rounded-lg border border-accent/20 bg-accent-subtle/50 px-2.5 py-2 text-left text-[11px] font-semibold text-primary transition hover:bg-accent-subtle">Add {cartItems.length} cart line{cartItems.length === 1 ? '' : 's'} to this order</button>}
        {lines.map((line) => !line.deleted && <div key={line.key} className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-700">{line.name}</span>
          {mode === 'edit' ? <label className="flex shrink-0 items-center gap-1 text-[10px] text-gray-400"><input aria-label={`${line.name} unit price in DA`} className="w-20 rounded-md border border-gray-200 px-1.5 py-1 text-right text-[11px] font-semibold text-gray-700 outline-none focus:border-accent/50" type="number" min="0" step="1" value={line.unit_price} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, unit_price: Math.max(0, Number(event.target.value) || 0) } : item))} />DA</label> : <span className="shrink-0 text-[10px] text-gray-400">{Number(line.unit_price || 0).toLocaleString('fr-FR')} DA</span>}
          <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))} className="grid h-6 w-6 place-items-center rounded-md bg-gray-100 text-gray-600"><Minus size={12} /></button>
          <span className="w-5 text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
          <button type="button" aria-label={`Increase ${line.name}`} onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))} className="grid h-6 w-6 place-items-center rounded-md bg-gray-100 text-gray-600"><Plus size={12} /></button>
          <button type="button" aria-label={`Remove ${line.name}`} onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, deleted: true } : item))} className="grid h-6 w-6 place-items-center rounded-md text-rose-500 hover:bg-rose-50"><Trash2 size={12} /></button>
        </div>)}
        {productCatalog}
      </div>
      <textarea aria-label="Order notes" className={`${fieldClass} resize-y`} rows={2} placeholder="Order notes" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-gray-500">Price adjustment (DA)<input aria-label="Price adjustment" className={`${fieldClass} mt-1`} type="number" value={form.price_adjustment} onChange={(event) => updateForm('price_adjustment', event.target.value)} /></label>
        <div className="flex flex-col justify-center text-right text-[10px] text-gray-500">Recorded paid stays <strong className="font-semibold text-gray-700">{Number(order?.amount_paid || 0).toLocaleString('fr-FR')} DA</strong><span className="mt-1">New total <strong className="text-sm text-primary">{total.toLocaleString('fr-FR')} DA</strong></span></div>
      </div>
      {mode === 'edit' && !review && <button type="button" disabled={!editChanges.length} onClick={() => setReview(true)} className="w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"><Check size={14} className="mr-1.5 inline" />{editChanges.length ? 'Review changes' : 'No changes to review'}</button>}
      {(mode === 'create' || review) && <div className="space-y-2 rounded-lg border border-accent-subtle bg-white p-2.5">
        <p className="text-[11px] font-semibold text-gray-700">{mode === 'create' ? 'Review before creating' : 'Confirm these order changes'}</p>
        {mode === 'edit' ? <><ul className="max-h-36 space-y-1 overflow-y-auto rounded-md bg-gray-50 p-2 text-[10px] leading-relaxed text-gray-600">{editChanges.map((change, index) => <li key={`${index}-${change}`} className="flex gap-1.5"><span className="text-primary">•</span><span>{change}</span></li>)}</ul><div className="space-y-1 border-t border-gray-100 pt-2 text-[10px] text-gray-600"><p className="flex justify-between"><span>Original total</span><span>{Number(order?.total_amount || 0).toLocaleString('fr-FR')} DA</span></p><p className="flex justify-between font-semibold text-gray-800"><span>New total</span><span>{total.toLocaleString('fr-FR')} DA</span></p><p className="flex justify-between"><span>Already paid · unchanged</span><span>{Number(order?.amount_paid || 0).toLocaleString('fr-FR')} DA</span></p><p className="flex justify-between"><span>New balance due</span><span>{Math.max(0, total - Number(order?.amount_paid || 0)).toLocaleString('fr-FR')} DA</span></p></div></> : <p className="text-[10px] leading-relaxed text-gray-500">{form.client_name || 'Customer not set'} · {lines.filter((line) => !line.deleted).reduce((sum, line) => sum + line.quantity, 0)} units · {form.delivery_date || 'No delivery date'} · {total.toLocaleString('fr-FR')} DA. Stock and order totals update when saved.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setReview(false)} className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">Back to edit</button>
          <button type="button" disabled={saving || (mode === 'edit' && !editChanges.length)} onClick={saveOrder} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? <><Loader2 size={13} className="mr-1 inline animate-spin" />Saving…</> : mode === 'create' ? 'Create order' : 'Save changes'}</button>
        </div>
      </div>}
      {error && <p role="alert" className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  )
}

export function AssistantDeleteOrder({ order, onDelete, onCancel }) {
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [error, setError] = useState('')
  const confirmDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await onDelete(order.id)
      announceOrdersChanged()
      setDeleted(true)
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this order.')
    } finally {
      setDeleting(false)
    }
  }
  if (deleted) return <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">Order #{order.order_number} was deleted.</div>
  return <div className="mt-3 space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
    <div className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600" /><div><p className="text-xs font-semibold text-rose-800">Permanently delete order #{order.order_number}?</p><p className="mt-0.5 text-[11px] leading-relaxed text-rose-700">{order.client_name || 'Customer'} · {Number(order.total_amount || 0).toLocaleString('fr-FR')} DA. This is a permanent action. Confirm only if this is the correct order.</p></div></div>
    <div className="flex gap-2 pl-6"><button type="button" disabled={deleting} onClick={onCancel} className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700">Keep order</button><button type="button" disabled={deleting} onClick={confirmDelete} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{deleting ? <><Loader2 size={13} className="mr-1 inline animate-spin" />Deleting…</> : 'Delete permanently'}</button></div>
    {error && <p role="alert" className="pl-6 text-[11px] text-rose-700">{error}</p>}
  </div>
}

export function AssistantVoidOrder({ order, initialReason = 'Cancelled from Blossom assistant', onDraftChange, onCancel, onDone, onSuccess }) {
  const [reason, setReason] = useState(initialReason)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => { onDraftChange?.({ reason }) }, [reason, onDraftChange])
  const confirm = async () => {
    setSaving(true)
    setError('')
    try {
      await voidOrder(order.id, reason.trim())
    } catch (rpcError) {
      setSaving(false)
      setError(rpcError.message || 'Could not cancel this order.')
      return
    }
    setSaving(false)
    window.dispatchEvent(new Event('blossom:orders-changed'))
    setDone(true)
    onSuccess?.()
  }
  if (done) return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" role="status"><p className="font-semibold">Order #{order.order_number} cancelled and its record preserved.</p><button type="button" onClick={onDone} className="mt-2 rounded-lg bg-white px-2.5 py-1.5 font-semibold ring-1 ring-emerald-200">Done</button></div>
  return <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
    <p className="text-xs font-semibold text-amber-900">Cancel order #{order.order_number}?</p>
    <p className="text-[11px] leading-relaxed text-amber-800">{order.client_name || 'Customer'} · {Number(order.total_amount || 0).toLocaleString('fr-FR')} DA. This preserves the order record and applies Blossom’s cancellation and stock rules.</p>
    <label className="block text-[10px] font-medium text-amber-900">Reason<input className={fieldClass} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
    <div className="flex gap-2"><button type="button" disabled={saving} onClick={onCancel} className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700">Keep order</button><button type="button" disabled={saving || !reason.trim()} onClick={confirm} className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
  </div>
}

export function AssistantPaymentAction({ order, role, initialAmount = '', initialAction = 'payment', initialMethod, initialDraft = null, onDraftChange, onCancel, onDone, onSuccess }) {
  const [action, setAction] = useState(initialDraft?.action ?? initialAction)
  const [amount, setAmount] = useState(initialDraft?.amount ?? initialAmount)
  const [method, setMethod] = useState(initialDraft?.method ?? initialMethod ?? order.payment_method ?? 'cash')
  const [notes, setNotes] = useState(initialDraft?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const requestIdRef = useRef(initialDraft?.requestId || null)
  const paid = Number(order.amount_paid || 0)
  const due = Math.max(0, Number(order.total_amount || 0) - paid)
  const parsedAmount = Math.round(Number(amount))
  const maximum = action === 'refund' ? paid : due
  const canRefund = role === 'owner' || role === 'manager'
  useEffect(() => { onDraftChange?.({ action, amount, method, notes, requestId: requestIdRef.current }) }, [action, amount, method, notes, onDraftChange])

  const submit = async (event) => {
    event.preventDefault()
    if (saving || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > maximum) return
    setSaving(true)
    setError('')
    requestIdRef.current ||= makeRequestId()
    onDraftChange?.({ action, amount, method, notes, requestId: requestIdRef.current })
    let data
    let rpcError
    try {
      data = await recordOrderPayment({
        orderId: order.id,
        requestId: requestIdRef.current,
        amount: parsedAmount,
        paymentMethod: method,
        notes: notes.trim() || `Recorded from assistant · Order #${order.order_number}`,
        action,
      })
    } catch (error) { rpcError = error }
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not save this payment. You can retry safely.')
      return
    }
    window.dispatchEvent(new Event('blossom:orders-changed'))
    setSaved(data)
    onSuccess?.(data)
  }

  if (saved) return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" role="status">
    <p className="font-semibold">{action === 'refund' ? 'Refund recorded' : 'Payment recorded'}</p>
    <p className="mt-1">{Number(saved.amount || parsedAmount).toLocaleString('fr-FR')} DA · {Number(saved.amount_due || 0).toLocaleString('fr-FR')} DA remaining on order #{order.order_number}.</p>
    <button type="button" onClick={onDone} className="mt-2 rounded-lg bg-white px-2.5 py-1.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">Done</button>
  </div>

  return <form onSubmit={submit} className="mt-3 space-y-2.5 rounded-xl border border-gray-200 bg-[#FFFCFE] p-3">
    <div className="flex items-start justify-between gap-2">
      <div><p className="text-xs font-semibold text-gray-800">Order #{order.order_number} · {order.client_name || 'Walk-in'}</p>
        <p className="mt-0.5 text-[10px] text-gray-500">Total {Number(order.total_amount || 0).toLocaleString('fr-FR')} DA · Paid {paid.toLocaleString('fr-FR')} DA · Due {due.toLocaleString('fr-FR')} DA</p></div>
      <button type="button" onClick={onCancel} aria-label="Cancel payment action" className="rounded-md p-1 text-gray-400 hover:bg-gray-100"><X size={14} /></button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] font-medium text-gray-500">Action<select className={fieldClass} value={action} onChange={(event) => { setAction(event.target.value); setAmount(event.target.value === 'payment' ? String(due) : ''); requestIdRef.current = null }}>
        <option value="payment">Collect payment</option>{canRefund && <option value="refund">Record refund</option>}
      </select></label>
      <label className="text-[10px] font-medium text-gray-500">Amount (DA)<input className={fieldClass} type="number" min="1" max={maximum} step="1" value={amount} onChange={(event) => { setAmount(event.target.value); requestIdRef.current = null }} /></label>
      <label className="text-[10px] font-medium text-gray-500">Paid with<select className={fieldClass} value={method} onChange={(event) => { setMethod(event.target.value); requestIdRef.current = null }}><option value="cash">Cash</option><option value="baridimob">BaridiMob</option><option value="usd">USDT · enter DA equivalent</option></select></label>
      <label className="text-[10px] font-medium text-gray-500">Note<input className={fieldClass} value={notes} maxLength={300} onChange={(event) => { setNotes(event.target.value); requestIdRef.current = null }} placeholder="Optional" /></label>
    </div>
    <p className="text-[10px] text-gray-500">This updates the order and cash register together. Maximum {maximum.toLocaleString('fr-FR')} DA.</p>
    {error && <p role="alert" className="text-[11px] font-medium text-rose-600">{error}</p>}
    <div className="flex gap-2"><button type="button" onClick={onCancel} disabled={saving} className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">Cancel</button>
      <button type="submit" disabled={saving || !amount || parsedAmount <= 0 || parsedAmount > maximum} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Recording…' : action === 'refund' ? 'Confirm refund' : 'Record payment'}</button>
    </div>
  </form>
}

export function AssistantDelayOrder({ order, role, initialDraft = null, onDraftChange, onCancel, onSuccess }) {
  const dateKey = (date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
  const today = dateKey(new Date())
  const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
  const tomorrow = tomorrowDate.toISOString().slice(0, 10)
  const nextExistingDate = order.delivery_date ? new Date(`${order.delivery_date}T00:00:00Z`) : null
  if (nextExistingDate) nextExistingDate.setUTCDate(nextExistingDate.getUTCDate() + 1)
  const minimumDate = nextExistingDate ? [tomorrow, dateKey(nextExistingDate)].sort().at(-1) : tomorrow
  const [deliveryDate, setDeliveryDate] = useState(() => initialDraft?.deliveryDate || (order.requestedDeliveryDate >= minimumDate ? order.requestedDeliveryDate : minimumDate))
  const [reason, setReason] = useState(initialDraft?.reason ?? order.reason ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { onDraftChange?.({ deliveryDate, reason }) }, [deliveryDate, reason, onDraftChange])

  const saveDelay = async (event) => {
    event.preventDefault()
    if (!orderActionsFor(role).edit || deliveryDate < minimumDate || saving) return
    setSaving(true)
    setError('')
    try {
      await delayOrder(order.id, deliveryDate, reason)
      announceOrdersChanged()
      onSuccess?.()
    } catch (saveError) {
      setError(saveError.message || 'Could not reschedule this order. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={saveDelay} className="mt-3 rounded-xl border border-[#F0DCE5] bg-[#FFFBFD] p-3">
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[11px] font-semibold text-gray-600">New delivery date
        <input type="date" min={minimumDate} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className={`${fieldClass} mt-1`} />
      </label>
      <label className="text-[11px] font-semibold text-gray-600">Reason <span className="font-normal text-gray-400">optional</span>
        <input type="text" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add a note, or leave blank" className={`${fieldClass} mt-1`} />
      </label>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">Cancel</button>
      <button type="submit" disabled={saving || !deliveryDate || deliveryDate < minimumDate} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save delay'}</button>
    </div>
  </form>
}
