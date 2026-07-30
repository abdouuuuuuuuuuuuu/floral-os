import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, ShoppingBag, Users, DollarSign, BarChart3,
  Calendar, ArrowUpRight, ArrowDownRight, Download, RefreshCw, Filter,
  ChevronDown, ChevronUp, Package, Target, PieChart, Activity, Clock,
  Hash, CreditCard, Smartphone, Store, Bike, Truck, Eye, Printer,
  FileText, Layers, MoreHorizontal, X, Sparkles, Zap, Award, Crown,
  ChevronLeft, ChevronRight, Search, AlertCircle, CheckCircle2
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useReports } from '../hooks/useReports'
import { useNotification } from '../context/NotificationContext'
import { supabase } from '../lib/supabase'

// ─── COLOR SYSTEM ──────────────────────────────────────────────────
const CHART_COLORS = ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7']
const STATUS_COLORS = { new: '#EF4444', processing: '#F59E0B', done: '#10B981', cancelled: '#9CA3AF', pending: '#6366F1' }
const SOURCE_COLORS = { instagram: '#E4405F', whatsapp: '#25D366', phone: '#3B82F6', facebook: '#1877F2', inhouse: '#6B7280', website: '#8B5CF6' }
const PAYMENT_COLORS = { cash: '#10B981', baridimob: '#8B5CF6', usd: '#F59E0B', card: '#3B82F6', transfer: '#F97316' }

// ─── UTILITY: Format Currency ──────────────────────────────────────
const formatDA = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '0 DA'
  return `${Math.round(amount).toLocaleString('fr-FR')} DA`
}

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0'
  return num.toLocaleString('fr-FR')
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  } catch { return dateStr }
}

const formatMonth = (monthStr) => {
  if (!monthStr) return ''
  try {
    const [year, month] = monthStr.split('-')
    const d = new Date(parseInt(year), parseInt(month) - 1, 1)
    return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
  } catch { return monthStr }
}

// ─── STAT CARD ─────────────────────────────────────────────────────
function StatCard({ title, value, subtitle, change, icon: Icon, color, onClick, loading }) {
  const isPositive = change >= 0
  const colorMap = {
    primary: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
    teal:    { bg: 'bg-teal/10',    text: 'text-teal', border: 'border-teal/20' },
    accent:  { bg: 'bg-accent/10',  text: 'text-accent', border: 'border-accent/20' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600', border: 'border-amber-200' },
    red:     { bg: 'bg-red-50',     text: 'text-red-600', border: 'border-red-200' },
  }
  const c = colorMap[color] || colorMap.primary

  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-2xl border border-gray-200 p-5 transition-all duration-200 hover:shadow-lg hover:border-gray-300 ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 ${c.bg} rounded-xl flex items-center justify-center border ${c.border}`}>
          <Icon size={20} className={c.text} />
        </div>
        {change !== undefined && change !== null && !isNaN(change) && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${isPositive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            {isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {isPositive ? '+' : ''}{parseFloat(change).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-gray-900">{loading ? '...' : value}</p>
      <p className="text-sm font-medium text-gray-500 mt-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  )
}

// ─── BAR CHART (SVG) ───────────────────────────────────────────────
function BarChart({ data, xKey, yKey, color, title, subtitle, emptyMessage }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BarChart3 size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">{emptyMessage || 'No data available'}</p>
          <p className="text-xs text-gray-300 mt-1">Data will appear once orders are recorded</p>
        </div>
      </div>
    )
  }
  
  const values = data.map(d => d[yKey] || 0)
  const max = Math.max(...values) || 1
  const hasData = values.some(v => v > 0)
  
  if (!hasData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BarChart3 size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">No revenue recorded</p>
          <p className="text-xs text-gray-300 mt-1">Orders in this period have no revenue data</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="flex items-end gap-2 h-[220px] px-2 pt-6">
        {data.map((d, i) => {
          const val = d[yKey] || 0
          const h = max > 0 ? (val / max) * 100 : 0
          const isEmpty = val === 0
          const label = d[xKey]?.slice(5) || d[xKey]
          
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative min-w-[28px] max-w-[60px]">
              <div 
                className={`opacity-0 group-hover:opacity-100 absolute -top-10 bg-gray-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap z-10 transition-all duration-200 shadow-lg pointer-events-none ${isEmpty ? 'hidden' : ''}`}
              >
                {formatDA(val)}
              </div>
              <div 
                className={`w-full rounded-t-md transition-all duration-500 ease-out ${isEmpty ? 'bg-gray-100' : 'hover:opacity-80 hover:shadow-sm'}`}
                style={{ 
                  height: `${Math.max(h, isEmpty ? 4 : 3)}%`, 
                  backgroundColor: isEmpty ? '#f3f4f6' : (color || CHART_COLORS[i % CHART_COLORS.length]),
                  minHeight: isEmpty ? '4px' : '3px'
                }} 
              />
              <span className="text-[10px] text-gray-400 font-medium truncate w-full text-center leading-tight px-0.5">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── HORIZONTAL BAR CHART ────────────────────────────────────────
function HorizontalBarChart({ data, labelKey, valueKey, colors, title, subtitle, formatValue }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <BarChart3 size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }
  
  const values = data.map(d => d[valueKey] || 0)
  const max = Math.max(...values) || 1
  
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-5">
          {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="space-y-4">
        {data.map((d, i) => {
          const val = d[valueKey] || 0
          const pct = max > 0 ? (val / max) * 100 : 0
          const label = d[labelKey]
          const displayValue = formatValue ? formatValue(val) : formatNumber(val)
          
          return (
            <div key={i} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700 truncate flex-1 capitalize">{label}</span>
                <span className="text-sm font-bold text-gray-900 ml-3">{displayValue}</span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-700 ease-out group-hover:opacity-80"
                  style={{ 
                    width: `${Math.max(pct, val > 0 ? 1 : 0)}%`, 
                    backgroundColor: colors?.[i] || CHART_COLORS[i % CHART_COLORS.length] 
                  }} 
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── DONUT CHART (SVG) ───────────────────────────────────────────
function DonutChart({ data, labelKey, valueKey, colors, title, subtitle }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <PieChart size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }
  
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0) || 1
  let cumulative = 0
  
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-5">
          {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative w-40 h-40 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            {data.map((d, i) => {
              const val = d[valueKey] || 0
              const pct = val / total
              if (pct === 0) return null
              const dashArray = `${pct * 100} ${100 - pct * 100}`
              const dashOffset = -cumulative * 100
              cumulative += pct
              return (
                <circle key={i} cx="18" cy="18" r="15.9" fill="none"
                  stroke={colors?.[i] || CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth="3.5" strokeDasharray={dashArray} strokeDashoffset={dashOffset}
                  strokeLinecap="round" className="transition-all duration-500" />
              )
            })}
            <circle cx="18" cy="18" r="15.9" fill="white" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black text-gray-900">{formatNumber(total)}</span>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total</span>
          </div>
        </div>
        <div className="flex-1 space-y-3 min-w-[140px]">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors?.[i] || CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-sm text-gray-600 flex-1 capitalize">{d[labelKey]}</span>
              <span className="text-sm font-bold text-gray-900">{d[valueKey]}</span>
              <span className="text-xs text-gray-400 w-10 text-right">{Math.round((d[valueKey] / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── LINE CHART (SVG) ────────────────────────────────────────────
function LineChart({ data, xKey, yKey, color = '#2D6A4F', title, subtitle }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Activity size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">No revenue data</p>
          <p className="text-xs text-gray-300 mt-1">Start recording orders to see trends</p>
        </div>
      </div>
    )
  }
  
  const values = data.map(d => d[yKey] || 0)
  const max = Math.max(...values) || 1
  const min = Math.min(...values)
  const range = max - min || 1
  
  const padding = { top: 25, bottom: 35, left: 12, right: 12 }
  const width = 100
  const height = 100
  
  const getX = (i) => padding.left + (i / (data.length - 1 || 1)) * (width - padding.left - padding.right)
  const getY = (val) => padding.top + (1 - (val - min) / range) * (height - padding.top - padding.bottom)
  
  const points = data.map((d, i) => `${getX(i)},${getY(d[yKey] || 0)}`).join(' ')
  const areaPoints = `${getX(0)},${height - padding.bottom} ${points} ${getX(data.length - 1)},${height - padding.bottom}`
  
  const gradientId = `gradient-${color.replace('#', '')}-${Math.random().toString(36).slice(2, 8)}`
  
  // Generate Y-axis labels (5 ticks)
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    value: Math.round(min + range * p),
    y: getY(min + range * p)
  }))
  
  // X-axis labels - show first, last, and evenly spaced middle ones
  const xLabelIndices = []
  const totalPoints = data.length
  if (totalPoints <= 6) {
    for (let i = 0; i < totalPoints; i++) xLabelIndices.push(i)
  } else {
    xLabelIndices.push(0)
    const step = Math.max(1, Math.floor((totalPoints - 1) / 5))
    for (let i = step; i < totalPoints - 1; i += step) xLabelIndices.push(i)
    xLabelIndices.push(totalPoints - 1)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="relative h-[280px] w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Grid lines */}
          {yLabels.map((label, i) => (
            <g key={i}>
              <line 
                x1={padding.left} 
                y1={label.y} 
                x2={width - padding.right} 
                y2={label.y} 
                stroke="#f3f4f6" 
                strokeWidth="0.3" 
              />
              <text 
                x={padding.left - 2} 
                y={label.y + 1.5} 
                textAnchor="end" 
                fontSize="2.8" 
                fill="#9ca3af" 
                fontWeight="500"
                fontFamily="system-ui, sans-serif"
              >
                {label.value >= 1000 ? (label.value / 1000).toFixed(1) + 'k' : label.value}
              </text>
            </g>
          ))}
          
          {/* Area fill with gradient */}
          <polygon points={areaPoints} fill={`url(#${gradientId})`} />
          
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="0.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points with hover targets */}
          {data.map((d, i) => {
            const x = getX(i)
            const y = getY(d[yKey] || 0)
            return (
              <g key={i}>
                {/* Invisible hover target */}
                <circle cx={x} cy={y} r="3" fill="transparent" className="cursor-pointer">
                  <title>{formatDate(d[xKey])}: {formatDA(d[yKey])}</title>
                </circle>
                {/* Visible dot */}
                <circle cx={x} cy={y} r="1.1" fill="white" stroke={color} strokeWidth="0.5" />
                <circle cx={x} cy={y} r="0.5" fill={color} />
              </g>
            )
          })}
        </svg>
        
        {/* X-axis labels */}
        <div className="flex justify-between px-1 mt-1">
          {xLabelIndices.map(i => (
            <span key={i} className="text-[10px] text-gray-400 font-medium">
              {formatDate(data[i]?.[xKey])}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TOP PRODUCT CARD ──────────────────────────────────────────────
function TopProductCard({ product, index, onClick }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200 group cursor-pointer hover:border-gray-300 active:scale-[0.99]"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0 transition-colors ${index < 3 ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
        {index < 3 ? medals[index] : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{product.name || 'Unknown Product'}</p>
        <p className="text-xs text-gray-400">{formatNumber(product.quantity || 0)} units sold</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary text-sm">{formatDA(product.revenue)}</p>
        <p className="text-[10px] text-gray-400">revenue</p>
      </div>
    </div>
  )
}

// ─── DELIVERY METHOD CARD ──────────────────────────────────────────
function DeliveryMethodCard({ method, count, total, icon: Icon, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-all duration-200 hover:border-gray-300">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900 capitalize">{method || 'Unknown'}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
          <span className="text-xs font-bold text-gray-500 min-w-[20px] text-right">{count}</span>
        </div>
      </div>
      <span className="text-sm font-black min-w-[36px] text-right" style={{ color }}>{Math.round(pct)}%</span>
    </div>
  )
}

// ─── EXPORT MODAL ─────────────────────────────────────────────────
function ExportModal({ isOpen, onClose, data, onExport }) {
  const [format, setFormat] = useState('csv')
  const [exporting, setExporting] = useState(false)
  
  if (!isOpen) return null
  
  const handleExport = async () => {
    setExporting(true)
    await onExport(format)
    setExporting(false)
    onClose()
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">Export Report</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="space-y-3 mb-6">
          <p className="text-sm text-gray-500 mb-3">Choose export format:</p>
          {[
            { id: 'csv', label: 'CSV Spreadsheet', desc: 'Compatible with Excel, Google Sheets', icon: FileText },
            { id: 'json', label: 'JSON Data', desc: 'Raw data for developers', icon: Layers },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFormat(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${format === opt.id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <opt.icon size={20} className={format === opt.id ? 'text-primary' : 'text-gray-400'} />
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.desc}</p>
              </div>
              {format === opt.id && <CheckCircle2 size={18} className="text-primary ml-auto" />}
            </button>
          ))}
        </div>
        
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleExport} 
            disabled={exporting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN REPORTS PAGE ─────────────────────────────────────────────
function Reports() {
  const {
    dailyRevenue, weeklyRevenue, monthlyRevenue, topProducts,
    orderStatusBreakdown, totalStats, sourceBreakdown, paymentBreakdown,
    deliveryBreakdown, loading, error, refresh
  } = useReports()
  const { addNotification } = useNotification()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('overview')
  const [dateRange, setDateRange] = useState('30d')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // ─── FILTER DATA BY DATE RANGE ──────────────────────────────────
  const filteredData = useMemo(() => {
    const now = new Date()
    let daysBack = 30
    if (dateRange === '7d') daysBack = 7
    if (dateRange === '90d') daysBack = 90
    if (dateRange === 'all') daysBack = 365 * 10 // 10 years = effectively all
    
    const cutoff = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    
    return {
      dailyRevenue: dateRange === 'all' ? dailyRevenue : dailyRevenue.filter(d => d.date >= cutoffStr),
      weeklyRevenue: dateRange === 'all' ? weeklyRevenue : weeklyRevenue.filter(w => w.week >= cutoffStr),
      monthlyRevenue: dateRange === 'all' ? monthlyRevenue : monthlyRevenue.filter(m => m.month >= cutoffStr.slice(0, 7)),
      topProducts: topProducts.filter(p => 
        !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
      orderStatusBreakdown,
      sourceBreakdown,
      paymentBreakdown,
      deliveryBreakdown,
      totalStats
    }
  }, [dailyRevenue, weeklyRevenue, monthlyRevenue, topProducts, orderStatusBreakdown, sourceBreakdown, paymentBreakdown, deliveryBreakdown, totalStats, dateRange, searchQuery])

  // ─── COMPUTED STATS ─────────────────────────────────────────────
  const computedStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const todayRev = dailyRevenue.find(d => d.date === today)?.amount || 0
    const yesterdayRev = dailyRevenue.find(d => d.date === yesterday)?.amount || 0
    const revChange = yesterdayRev > 0 ? ((todayRev - yesterdayRev) / yesterdayRev * 100) : 0
    
    const last7 = dailyRevenue.slice(-7)
    const last7Rev = last7.reduce((s, d) => s + (d.amount || 0), 0)
    const prev7 = dailyRevenue.slice(-14, -7)
    const prev7Rev = prev7.reduce((s, d) => s + (d.amount || 0), 0)
    const weekChange = prev7Rev > 0 ? ((last7Rev - prev7Rev) / prev7Rev * 100) : 0
    
    return { todayRev, revChange, last7Rev, weekChange }
  }, [dailyRevenue])

  // ─── HANDLE REFRESH ─────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refresh()
      addNotification('Data refreshed successfully', 'success')
    } catch (err) {
      addNotification('Failed to refresh data', 'error')
    } finally {
      setIsRefreshing(false)
    }
  }, [refresh, addNotification])

  // ─── HANDLE EXPORT ──────────────────────────────────────────────
  const handleExport = useCallback(async (format) => {
    try {
      let content, filename, mimeType
      
      if (format === 'csv') {
        // Build CSV from all data
        const rows = [
          ['Report Export', new Date().toLocaleString('fr-FR')],
          [],
          ['DAILY REVENUE'],
          ['Date', 'Amount (DA)'],
          ...filteredData.dailyRevenue.map(d => [d.date, d.amount]),
          [],
          ['TOP PRODUCTS'],
          ['Name', 'Quantity Sold', 'Revenue (DA)'],
          ...filteredData.topProducts.map(p => [p.name, p.quantity, p.revenue]),
          [],
          ['ORDER STATUS BREAKDOWN'],
          ['Status', 'Count'],
          ...filteredData.orderStatusBreakdown.map(s => [s.status, s.count]),
          [],
          ['SUMMARY'],
          ['Total Revenue', totalStats.totalRevenue],
          ['Total Orders', totalStats.totalOrders],
          ['Average Order Value', totalStats.avgOrderValue],
          ['Total Customers', totalStats.totalCustomers],
        ]
        content = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
        filename = `report_${new Date().toISOString().split('T')[0]}.csv`
        mimeType = 'text/csv;charset=utf-8;'
      } else {
        content = JSON.stringify({
          exportedAt: new Date().toISOString(),
          dateRange,
          summary: totalStats,
          dailyRevenue: filteredData.dailyRevenue,
          weeklyRevenue: filteredData.weeklyRevenue,
          monthlyRevenue: filteredData.monthlyRevenue,
          topProducts: filteredData.topProducts,
          orderStatusBreakdown: filteredData.orderStatusBreakdown,
          sourceBreakdown: filteredData.sourceBreakdown,
          paymentBreakdown: filteredData.paymentBreakdown,
          deliveryBreakdown: filteredData.deliveryBreakdown,
        }, null, 2)
        filename = `report_${new Date().toISOString().split('T')[0]}.json`
        mimeType = 'application/json'
      }
      
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      addNotification(`Report exported as ${format.toUpperCase()}`, 'success')
    } catch (err) {
      console.error('Export error:', err)
      addNotification('Export failed. Please try again.', 'error')
    }
  }, [filteredData, totalStats, dateRange, addNotification])

  // ─── TAB CONFIGURATION ──────────────────────────────────────────
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'revenue', label: 'Revenue', icon: DollarSign },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'customers', label: 'Customers', icon: Users },
  ]

  // ─── RENDER: ERROR STATE ────────────────────────────────────────
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Failed to load reports</h2>
            <p className="text-sm text-gray-500 max-w-md">{error}</p>
          </div>
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Try Again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  // ─── RENDER: LOADING STATE ──────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-48 bg-gray-200 rounded-lg" />
              <div className="h-4 w-64 bg-gray-100 rounded mt-2" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-32 bg-gray-200 rounded-xl" />
              <div className="h-10 w-24 bg-gray-200 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
            ))}
          </div>
          <div className="h-80 bg-gray-100 rounded-2xl" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Reports & Analytics</h1>
            <p className="text-sm text-gray-400 mt-0.5">Deep insights into your business performance</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date Range Selector */}
            <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
              {['7d', '30d', '90d', 'all'].map((range) => (
                <button 
                  key={range} 
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateRange === range ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  {range === 'all' ? 'All Time' : `Last ${range.replace('d', ' days')}`}
                </button>
              ))}
            </div>
            
            {/* Refresh Button */}
            <button 
              onClick={handleRefresh} 
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            
            {/* Export Button */}
            <button 
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors shadow-sm"
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Revenue" 
            value={formatDA(totalStats.totalRevenue)} 
            subtitle="All time" 
            icon={DollarSign} 
            color="primary" 
            onClick={() => setActiveTab('revenue')}
          />
          <StatCard 
            title="Total Orders" 
            value={formatNumber(totalStats.totalOrders)} 
            subtitle={`Avg: ${formatDA(totalStats.avgOrderValue)}`} 
            icon={ShoppingBag} 
            color="teal" 
            onClick={() => setActiveTab('overview')}
          />
          <StatCard 
            title="Today's Revenue" 
            value={formatDA(computedStats.todayRev)} 
            subtitle="vs yesterday" 
            change={computedStats.revChange} 
            icon={TrendingUp} 
            color="accent" 
          />
          <StatCard 
            title="This Week" 
            value={formatDA(computedStats.last7Rev)} 
            subtitle="Last 7 days" 
            change={computedStats.weekChange} 
            icon={BarChart3} 
            color="amber" 
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 w-fit shadow-sm">
          {tabs.map((tab) => {
            const TIcon = tab.icon
            return (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                <TIcon size={15} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Revenue Trend Line Chart */}
            <LineChart 
              data={filteredData.dailyRevenue} 
              xKey="date" 
              yKey="amount" 
              title="Revenue Trend"
              subtitle="Daily revenue over the selected period"
            />

            {/* Two Column Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <DonutChart 
                data={filteredData.orderStatusBreakdown} 
                labelKey="status" 
                valueKey="count" 
                colors={Object.values(STATUS_COLORS)}
                title="Order Status"
                subtitle="Distribution by status"
              />
              <DonutChart 
                data={filteredData.sourceBreakdown} 
                labelKey="source" 
                valueKey="count" 
                colors={Object.values(SOURCE_COLORS)}
                title="Customer Sources"
                subtitle="Where your customers come from"
              />
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Top Products</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Best performing products by revenue</p>
                </div>
                <button 
                  onClick={() => setActiveTab('products')} 
                  className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  View All <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredData.topProducts.slice(0, 6).map((p, i) => (
                  <TopProductCard 
                    key={p.name || i} 
                    product={p} 
                    index={i}
                    onClick={() => navigate(`/products?search=${encodeURIComponent(p.name || '')}`)}
                  />
                ))}
                {filteredData.topProducts.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                    <Package size={32} className="mb-2 opacity-40" />
                    <p className="text-sm">No products found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── REVENUE TAB ── */}
        {activeTab === 'revenue' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <BarChart 
                data={filteredData.dailyRevenue.slice(-14)} 
                xKey="date" 
                yKey="amount" 
                color="#2D6A4F"
                title="Daily Revenue"
                subtitle="Revenue per day (last 14 days)"
              />
              <BarChart 
                data={filteredData.weeklyRevenue} 
                xKey="week" 
                yKey="amount" 
                color="#40916C"
                title="Weekly Revenue"
                subtitle="Revenue per week"
              />
            </div>
            
            <HorizontalBarChart 
              data={filteredData.monthlyRevenue} 
              labelKey="month" 
              valueKey="amount" 
              title="Monthly Revenue"
              subtitle="Revenue per month"
              formatValue={formatDA}
            />
            
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-1">Payment Methods</h2>
              <p className="text-xs text-gray-400 mb-5">Revenue by payment type</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredData.paymentBreakdown.map((p, i) => {
                  const color = Object.values(PAYMENT_COLORS)[i] || '#6B7280'
                  return (
                    <div key={p.method || i} className="bg-gray-50 rounded-xl p-5 text-center hover:bg-gray-100 transition-colors border border-gray-100">
                      <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                        <DollarSign size={22} style={{ color }} />
                      </div>
                      <p className="text-lg font-black text-gray-900">{formatDA(p.amount)}</p>
                      <p className="text-sm text-gray-500 capitalize mt-1">{p.method || 'Unknown'}</p>
                      <p className="text-xs text-gray-400 mt-1">{p.count || 0} orders</p>
                    </div>
                  )
                })}
                {filteredData.paymentBreakdown.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-400">
                    <CreditCard size={32} className="mb-2 opacity-40" />
                    <p className="text-sm">No payment data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCTS TAB ── */}
        {activeTab === 'products' && (
          <div className="space-y-5">
            {/* Search Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
              <Search size={18} className="text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={16} className="text-gray-400" />
                </button>
              )}
            </div>
            
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-1">Top Selling Products</h2>
              <p className="text-xs text-gray-400 mb-5">Ranked by quantity sold and revenue</p>
              <div className="space-y-3">
                {filteredData.topProducts.map((p, i) => (
                  <TopProductCard 
                    key={p.name || i} 
                    product={p} 
                    index={i}
                    onClick={() => navigate(`/products?search=${encodeURIComponent(p.name || '')}`)}
                  />
                ))}
                {filteredData.topProducts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Package size={40} className="mb-3 opacity-40" />
                    <p className="text-sm font-medium">
                      {searchQuery ? `No products matching "${searchQuery}"` : 'No product data available'}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {searchQuery ? 'Try a different search term' : 'Start recording orders to see product performance'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CUSTOMERS TAB ── */}
        {activeTab === 'customers' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <HorizontalBarChart 
                data={filteredData.sourceBreakdown} 
                labelKey="source" 
                valueKey="count" 
                colors={Object.values(SOURCE_COLORS)}
                title="Customer Sources"
                subtitle="Where customers discover you"
              />
              
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-base font-bold text-gray-900 mb-1">Delivery Methods</h2>
                <p className="text-xs text-gray-400 mb-5">How orders are fulfilled</p>
                <div className="space-y-3">
                  {filteredData.deliveryBreakdown.map((d) => {
                    const icons = { motorcycle: Bike, dhd: Truck, pickup: Store, delivery: Truck }
                    const colors = { motorcycle: '#3B82F6', dhd: '#8B5CF6', pickup: '#10B981', delivery: '#F97316' }
                    const Icon = icons[d.method] || Store
                    const totalDeliveries = filteredData.deliveryBreakdown.reduce((s, x) => s + (x.count || 0), 0)
                    return (
                      <DeliveryMethodCard 
                        key={d.method} 
                        method={d.method} 
                        count={d.count}
                        total={totalDeliveries} 
                        icon={Icon} 
                        color={colors[d.method] || '#6B7280'} 
                      />
                    )
                  })}
                  {filteredData.deliveryBreakdown.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Truck size={32} className="mb-2 opacity-40" />
                      <p className="text-sm">No delivery data available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportModal 
        isOpen={exportModalOpen} 
        onClose={() => setExportModalOpen(false)} 
        data={filteredData}
        onExport={handleExport}
      />
    </DashboardLayout>
  )
}

export default Reports