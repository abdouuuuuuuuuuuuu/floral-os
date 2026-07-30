import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, ShoppingBag, Target, Package,
  ArrowUpRight, ArrowDownRight, Clock, AlertTriangle, CheckCircle2,
  Bike, Truck, Store, X, ChevronDown, ChevronUp, Calendar,
  DollarSign, BarChart3, Users, Receipt, Bell, BellRing
} from 'lucide-react'
import { DndContext, useDraggable, useDroppable, DragOverlay } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useDashboard } from '../hooks/useDashboard'
import { useNotification } from '../context/NotificationContext'

// ─── EXPANDABLE ANALYTIC CARD ──────────────────────────────────────
function AnalyticCard({ title, value, subtitle, change, icon: Icon, color, detailView }) {
  const [expanded, setExpanded] = useState(false)

  const colorMap = {
    primary: { light: 'bg-primary/10', text: 'text-primary', ring: 'ring-primary/20' },
    teal:    { light: 'bg-teal/10',    text: 'text-teal',    ring: 'ring-teal/20' },
    accent:  { light: 'bg-accent/10',  text: 'text-accent',  ring: 'ring-accent/20' },
    danger:  { light: 'bg-danger/10',  text: 'text-danger',  ring: 'ring-danger/20' },
    sage:    { light: 'bg-sage/20',    text: 'text-sage-dark', ring: 'ring-sage/30' },
  }

  const c = colorMap[color] || colorMap.primary
  const isPositive = change >= 0

  return (
    <div
      className={`bg-cream rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-md ${
        expanded ? `ring-2 ${c.ring} shadow-lg` : ''
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 ${c.light} rounded-xl flex items-center justify-center`}>
            <Icon size={20} className={c.text} />
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
            isPositive ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'
          }`}>
            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {isPositive ? '+' : ''}{change}%
          </div>
        </div>

        <div className="mt-4">
          <p className="text-2xl font-black text-gray-900">{value}</p>
          <p className="text-sm font-medium text-gray-500 mt-0.5">{title}</p>
        </div>

        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-400">{subtitle}</p>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-200/60 bg-white/50 px-5 pb-5 pt-4">
          {detailView}
        </div>
      )}
    </div>
  )
}

// ─── DRAGGABLE ORDER CARD ────────────────────────────────────────────
function DraggableOrder({ order }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { order },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const statusConfig = {
    new:        { bg: 'bg-red-50',  border: 'border-red-200',  text: 'text-red-600',  label: 'New' },
    processing: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', label: 'Processing' },
    done:       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', label: 'Done' },
    cancelled:  { bg: 'bg-gray-50',  border: 'border-gray-200',  text: 'text-gray-500',  label: 'Cancelled' },
  }

  const config = statusConfig[order.status] || statusConfig.new

  const DeliveryIcon = order.delivery_method === 'motorcycle' ? Bike
                     : order.delivery_method === 'dhd' ? Truck
                     : Store

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-xl p-4 cursor-grab active:cursor-grabbing border transition-all ${
        isDragging ? 'opacity-40 rotate-2 shadow-xl scale-105' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-primary text-lg">#{order.order_number}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${config.bg} ${config.text} border ${config.border}`}>
            {config.label}
          </span>
        </div>
        <span className="font-bold text-primary">{order.total_amount?.toLocaleString('fr-FR')} DA</span>
      </div>

      <p className="font-semibold text-gray-800 text-sm">{order.client_name}</p>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {new Date(order.created_at).toLocaleDateString('fr-FR')}
        </span>
        {order.delivery_date && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {new Date(order.delivery_date).toLocaleDateString('fr-FR')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2.5 text-xs text-gray-500">
        <DeliveryIcon size={12} />
        <span className="capitalize">{order.delivery_method || 'Pickup'}</span>
      </div>
    </div>
  )
}

// ─── DELIVERY DROP ZONE ────────────────────────────────────────────
function DeliveryDropZone({ children, count }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'delivery-zone' })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 border-dashed transition-all ${
        isOver
          ? 'border-teal bg-teal/5 scale-[1.01] shadow-lg'
          : 'border-gray-200 bg-cream/30'
      }`}
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal/10 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={16} className="text-teal" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Today\'s Deliveries</h2>
          </div>
          <span className="px-3 py-1 bg-teal text-white rounded-full text-xs font-bold">
            {count}
          </span>
        </div>

        {count === 0 && !isOver && (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl bg-white/50">
            <Package size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400 font-medium">Drag orders here</p>
            <p className="text-xs text-gray-300 mt-0.5">to mark as delivered</p>
          </div>
        )}

        <div className="space-y-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── DELIVERY CARD ─────────────────────────────────────────────────
function DeliveryCard({ order }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-teal/10 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 size={16} className="text-teal" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-primary text-sm">#{order.order_number}</p>
        <p className="text-xs text-gray-500 truncate">{order.client_name}</p>
      </div>
      <span className="font-bold text-sm text-gray-700 shrink-0">
        {order.total_amount?.toLocaleString('fr-FR')} DA
      </span>
    </div>
  )
}

// ─── LOW STOCK ITEM ────────────────────────────────────────────────
function LowStockItem({ product }) {
  const stock = product.stock_level ?? 0
  const threshold = product.low_stock_threshold ?? 10
  const percent = Math.max(0, Math.min(100, (stock / threshold) * 100))

  const getSeverity = () => {
    if (stock <= 0) return {
      label: 'OUT OF STOCK',
      barColor: 'bg-gray-500',
      badgeColor: 'bg-gray-600 text-white',
      borderColor: 'border-gray-300',
      bgColor: 'bg-gray-50',
      message: 'Restock immediately',
      iconColor: 'text-gray-500',
      urgency: 'critical'
    }
    if (percent <= 20) return {
      label: 'CRITICAL',
      barColor: 'bg-red-500',
      badgeColor: 'bg-red-600 text-white',
      borderColor: 'border-red-200',
      bgColor: 'bg-red-50',
      message: 'Reorder now — almost empty',
      iconColor: 'text-red-500',
      urgency: 'critical'
    }
    if (percent <= 50) return {
      label: 'LOW',
      barColor: 'bg-amber-500',
      badgeColor: 'bg-amber-500 text-white',
      borderColor: 'border-amber-200',
      bgColor: 'bg-amber-50',
      message: 'Reorder soon',
      iconColor: 'text-amber-500',
      urgency: 'warning'
    }
    return {
      label: 'RUNNING LOW',
      barColor: 'bg-orange-400',
      badgeColor: 'bg-orange-400 text-white',
      borderColor: 'border-orange-200',
      bgColor: 'bg-orange-50',
      message: 'Monitor stock level',
      iconColor: 'text-orange-400',
      urgency: 'info'
    }
  }

  const severity = getSeverity()

  const productIdDisplay = product.product_id 
    ? String(product.product_id).slice(0, 8) 
    : '—'

  return (
    <div className={`${severity.bgColor} rounded-xl p-4 border ${severity.borderColor} transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center`}>
            <Package size={16} className={severity.iconColor} />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{product.item_name}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{productIdDisplay}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${severity.badgeColor}`}>
            {severity.label}
          </span>
          <span className="text-lg font-black text-gray-900">{stock}</span>
          <span className="text-xs text-gray-400">left</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 font-medium">Stock Level</span>
          <span className="text-gray-700 font-semibold">{stock} / {threshold}</span>
        </div>
        <div className="w-full h-2.5 bg-white/70 rounded-full overflow-hidden border border-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${severity.barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={12} className={severity.iconColor} />
          <p className="text-[11px] font-medium text-gray-600">{severity.message}</p>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN DASHBOARD ────────────────────────────────────────────────
function Dashboard() {
  const { stats, pendingOrders, todayDeliveries, lowStock, loading, updateStatus, refresh } = useDashboard()
  const navigate = useNavigate()

  const { addNotification } = useNotification()

  const alertedStockRef = useRef(new Set())

  const [localPending, setLocalPending] = useState([])
  const [localDeliveries, setLocalDeliveries] = useState([])
  const [activeDrag, setActiveDrag] = useState(null)

  useEffect(() => {
    setLocalPending(pendingOrders)
    setLocalDeliveries(todayDeliveries)
  }, [pendingOrders, todayDeliveries])

  useEffect(() => {
    if (!lowStock || lowStock.length === 0) return

    lowStock.forEach(product => {
      const stock = product.stock_level ?? 0
      const threshold = product.low_stock_threshold ?? 10
      const percent = (stock / threshold) * 100
      const productKey = product.product_id || product.item_name

      if ((percent <= 20 || stock <= 0) && !alertedStockRef.current.has(productKey)) {
        alertedStockRef.current.add(productKey)

        const message = stock <= 0
          ? `${product.item_name} is completely out of stock. Restock immediately!`
          : `${product.item_name} only has ${stock} units left (${Math.round(percent)}% of threshold). Reorder now!`

        addNotification(message, 'error')
      }
    })
  }, [lowStock, addNotification])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    )
  }

  const formatDA = (amount) => amount.toLocaleString('fr-FR') + ' DA'

  const handleDragStart = (event) => {
    setActiveDrag(event.active.data.current.order)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveDrag(null)
    if (!over || over.id !== 'delivery-zone') return

    const draggedOrder = active.data.current.order
    setLocalPending(prev => prev.filter(o => o.id !== draggedOrder.id))
    setLocalDeliveries(prev => [{ ...draggedOrder, status: 'done' }, ...prev])
    await updateStatus(draggedOrder.id, 'done')

    addNotification(
      `Order #${draggedOrder.order_number} for ${draggedOrder.client_name} has been marked as delivered.`,
      'success'
    )
  }

  const salesDetail = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Yesterday</p>
          <p className="text-lg font-bold text-gray-800 mt-1">{formatDA(stats.yesterdaySales)}</p>
        </div>
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Difference</p>
          <p className={`text-lg font-bold mt-1 ${stats.todaySales >= stats.yesterdaySales ? 'text-primary' : 'text-danger'}`}>
            {stats.todaySales >= stats.yesterdaySales ? '+' : ''}{formatDA(stats.todaySales - stats.yesterdaySales)}
          </p>
        </div>
      </div>
      <div className="bg-cream rounded-xl p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Performance</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, stats.salesChange + 50))}%` }}
            />
          </div>
          <span className="text-xs font-bold text-primary">{stats.salesChange}%</span>
        </div>
      </div>
    </div>
  )

  const avgDetail = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Week</p>
          <p className="text-lg font-bold text-gray-800 mt-1">{formatDA(stats.lastWeekAvg)}</p>
        </div>
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Change</p>
          <p className={`text-lg font-bold mt-1 ${stats.avgChange >= 0 ? 'text-primary' : 'text-danger'}`}>
            {stats.avgChange >= 0 ? '+' : ''}{stats.avgChange}%
          </p>
        </div>
      </div>
      <div className="bg-cream rounded-xl p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Trend</p>
        <div className="flex items-end gap-1 h-12">
          {[40, 55, 45, 70, 60, 80, stats.avgOrderValue ? Math.min(100, (stats.avgOrderValue / stats.lastWeekAvg) * 60) : 50].map((h, i) => (
            <div
              key={`avg-bar-${i}`}
              className={`flex-1 rounded-t ${i === 6 ? 'bg-teal' : 'bg-gray-200'}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Today'].map((day, i) => (
            <span key={`day-label-${day}-${i}`}>{day}</span>
          ))}
        </div>
      </div>
    </div>
  )

  const ordersDetail = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Yesterday</p>
          <p className="text-lg font-bold text-gray-800 mt-1">{stats.ordersYesterday} orders</p>
        </div>
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Difference</p>
          <p className={`text-lg font-bold mt-1 ${stats.ordersChange >= 0 ? 'text-primary' : 'text-danger'}`}>
            {stats.ordersChange >= 0 ? '+' : ''}{stats.ordersChange}%
          </p>
        </div>
      </div>
      <div className="bg-cream rounded-xl p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Order Volume</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, stats.ordersChange + 50))}%` }}
            />
          </div>
          <span className="text-xs font-bold text-accent">{stats.ordersChange}%</span>
        </div>
      </div>
    </div>
  )

  const targetDetail = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Remaining</p>
          <p className="text-lg font-bold text-danger mt-1">{formatDA(stats.targetRemaining)}</p>
        </div>
        <div className="bg-cream rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hours Left</p>
          <p className="text-lg font-bold text-gray-800 mt-1">{stats.hoursRemaining}h</p>
        </div>
      </div>
      <div className="bg-cream rounded-xl p-3">
        <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          <span>Progress</span>
          <span>{stats.targetProgress}%</span>
        </div>
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              stats.targetProgress >= 80 ? 'bg-primary' : stats.targetProgress >= 50 ? 'bg-teal' : 'bg-accent'
            }`}
            style={{ width: `${Math.min(100, stats.targetProgress)}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          {stats.targetProgress >= 100
            ? '🎉 Target smashed!'
            : stats.targetProgress >= 75
            ? 'Almost there — keep pushing!'
            : stats.targetProgress >= 50
            ? 'Halfway there, stay focused'
            : 'Early day — plenty of time'}
        </p>
      </div>
    </div>
  )

  return (
    <DashboardLayout>
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-12 gap-5">
          {/* ── LEFT: Analytics Cards ── */}
          <div className="col-span-3 space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Analytics</h2>

            <AnalyticCard
              title="Today\'s Sales"
              value={formatDA(stats.todaySales)}
              subtitle={`vs ${formatDA(stats.yesterdaySales)} yesterday`}
              change={stats.salesChange}
              icon={TrendingUp}
              color="primary"
              detailView={salesDetail}
            />

            <AnalyticCard
              title="Avg. Order Value"
              value={formatDA(stats.avgOrderValue)}
              subtitle={`vs ${formatDA(stats.lastWeekAvg)} last week`}
              change={stats.avgChange}
              icon={BarChart3}
              color="teal"
              detailView={avgDetail}
            />

            <AnalyticCard
              title="Orders Today"
              value={`${stats.ordersToday} orders`}
              subtitle={`${stats.ordersYesterday} orders yesterday`}
              change={stats.ordersChange}
              icon={ShoppingBag}
              color="accent"
              detailView={ordersDetail}
            />

            <AnalyticCard
              title="Daily Target"
              value={`${stats.targetProgress}%`}
              subtitle={`${formatDA(stats.targetRemaining)} remaining · ${stats.hoursRemaining}h left`}
              change={stats.targetProgress}
              icon={Target}
              color="sage"
              detailView={targetDetail}
            />
          </div>

          {/* ── MIDDLE: Pending Orders ── */}
          <div className="col-span-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-danger/10 rounded-lg flex items-center justify-center">
                  <Clock size={16} className="text-danger" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Pending Orders</h2>
                  <p className="text-xs text-gray-400">Drag to deliveries to mark done</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-danger/10 text-danger rounded-full text-xs font-bold">
                {localPending.length}
              </span>
            </div>

            <div className="space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
              {localPending.length === 0 ? (
                <div className="bg-cream rounded-2xl p-10 text-center border border-gray-100">
                  <CheckCircle2 size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-semibold">All caught up!</p>
                  <p className="text-gray-400 text-sm mt-1">No pending orders right now</p>
                </div>
              ) : (
                localPending.map((order) => (
                  <DraggableOrder key={order.id} order={order} />
                ))
              )}
            </div>
          </div>

          {/* ── RIGHT: Deliveries + Low Stock ── */}
          <div className="col-span-4 space-y-5">
            <DeliveryDropZone count={localDeliveries.length}>
              {localDeliveries.map((order) => (
                <DeliveryCard key={order.id} order={order} />
              ))}
            </DeliveryDropZone>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle size={16} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Low Stock Alert</h2>
                  <p className="text-xs text-gray-400">Items below threshold</p>
                </div>
                {lowStock.length > 0 && (
                  <span className="ml-auto px-2.5 py-1 bg-red-600 text-white rounded-full text-[10px] font-bold animate-pulse">
                    {lowStock.length} ALERT{lowStock.length > 1 ? 'S' : ''}
                  </span>
                )}
              </div>

              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {lowStock.length === 0 ? (
                  <div className="bg-emerald-50 rounded-2xl p-6 text-center border border-emerald-100">
                    <Package size={28} className="mx-auto text-emerald-400 mb-2" />
                    <p className="text-emerald-700 text-sm font-medium">All stock levels good</p>
                    <p className="text-emerald-500 text-xs mt-1">No items below threshold</p>
                  </div>
                ) : (
                  lowStock.map((product, index) => (
                    <LowStockItem
                      key={`lowstock-${index}-${String(product.product_id || 'na').slice(0, 12)}`}
                      product={product}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDrag ? (
            <div className="bg-white rounded-xl p-4 shadow-2xl rotate-2 opacity-95 w-72 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="font-black text-primary">#{activeDrag.order_number}</span>
                <span className="font-bold text-sm">{activeDrag.total_amount?.toLocaleString('fr-FR')} DA</span>
              </div>
              <p className="text-sm text-gray-700">{activeDrag.client_name}</p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                <Package size={12} />
                <span>Drop to mark delivered</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DashboardLayout>
  )
}

export default Dashboard