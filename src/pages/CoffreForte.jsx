import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Vault,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  X,
  ChevronRight,
  Calendar,
  AlertCircle,
  ShoppingBag
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useCashRegister } from '../hooks/useCashRegister'

const transactionTypes = {
  opening: { label: 'Opening Balance', icon: Unlock, color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  cash_in: { label: 'Cash In', icon: ArrowUpCircle, color: 'text-teal-700', bg: 'bg-teal-100', border: 'border-teal-200' },
  cash_out: { label: 'Cash Out', icon: ArrowDownCircle, color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-200' },
  closing: { label: 'Closing Balance', icon: Lock, color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
}

// ═══════════════════════════════════════════════════════════════════════════════
// CENTERED MODAL — a11y + scroll lock + ESC close
// ═══════════════════════════════════════════════════════════════════════════════
function CenteredModal({ isOpen, onClose, children, maxWidth = 'max-w-xl' }) {
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className={`relative w-full ${maxWidth} bg-white rounded-2xl shadow-2xl transform transition-all duration-200 ease-out max-h-[90vh] overflow-hidden flex flex-col`}>
        {children}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD TRANSACTION MODAL — resets only after success
// ═══════════════════════════════════════════════════════════════════════════════
function AddTransactionModal({ isOpen, onClose, onSubmit, submitting }) {
  const [formType, setFormType] = useState('cash_in')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')

  const categories = {
    cash_in: ['Sales', 'Deposit', 'Refund', 'Other'],
    cash_out: ['Supplies', 'Salary', 'Rent', 'Utilities', 'Other'],
    opening: ['Opening'],
    closing: ['Closing'],
  }

  // Reset form whenever modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFormType('cash_in')
      setAmount('')
      setDescription('')
      setCategory('')
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!amount || !Number.isFinite(numAmount) || numAmount <= 0) return

    try {
      await onSubmit(formType, numAmount, description, category)
      // Parent closes modal on success; effect above resets form
    } catch {
      // Error handled by parent; form stays intact so user can retry
    }
  }

  const config = transactionTypes[formType]
  const Icon = config.icon

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center`}>
            <Icon size={20} className={config.color} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Add Transaction</h3>
            <p className="text-xs text-gray-500">Record a manual entry</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Transaction Type Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Transaction Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(transactionTypes).map(([key, cfg]) => {
                const TypeIcon = cfg.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setFormType(key); setCategory('') }}
                    className={`py-3 px-2 rounded-xl border-2 font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                      formType === key
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <TypeIcon size={18} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="tx-amount" className="block text-sm font-medium text-gray-700 mb-1.5">Amount (DA)</label>
            <input
              id="tx-amount"
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-lg font-semibold text-center"
              required
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="tx-category" className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select
              id="tx-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
            >
              <option value="">Select category</option>
              {(categories[formType] || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="tx-desc" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input
              id="tx-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </CenteredModal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASH IN MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function CashInModal({ isOpen, onClose, linkedOrders, todayCashIn }) {
  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
            <TrendingUp size={20} className="text-teal-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cash In — Today</h3>
            <p className="text-xs text-gray-500">Auto from completed orders</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        {/* Summary Card */}
        <div className="bg-teal-50 rounded-xl p-5 border border-teal-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-teal-700 font-medium">Total Cash In Today</p>
              <p className="text-3xl font-bold text-teal-800 mt-1">{todayCashIn.toLocaleString('fr-FR')} DA</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center">
              <TrendingUp size={28} className="text-teal-700" />
            </div>
          </div>
          <p className="text-xs text-teal-600 mt-2">Auto-generated from completed orders</p>
        </div>

        {/* Orders List */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingBag size={16} className="text-gray-400" />
            Linked Orders
          </h4>

          {(!linkedOrders || linkedOrders.length === 0) ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-400 text-sm border border-gray-100">
              <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No completed orders today</p>
              <p className="text-xs mt-1">Orders marked as done will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {linkedOrders.map((order) => (
                <div key={order.id} className="bg-gray-50 rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold bg-teal-100 text-teal-700 px-2.5 py-1 rounded-lg">
                        Order #{order.order_number || order.id?.slice(0, 8)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {order.created_at ? new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </span>
                    </div>
                    <span className="font-bold text-teal-700 text-xl">+{Number(order.total_amount || 0).toLocaleString('fr-FR')} DA</span>
                  </div>

                  {order.order_items && order.order_items.length > 0 && (
                    <div className="pl-3 space-y-2 border-l-2 border-teal-100">
                      {order.order_items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                            <span className="font-medium">{item.product_name || 'Unknown'}</span>
                            <span className="text-xs text-gray-400">× {item.quantity || 1}</span>
                          </div>
                          <span className="font-medium text-gray-700">
                            {Number((item.unit_price || 0) * (item.quantity || 1)).toLocaleString('fr-FR')} DA
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {order.client_name && (
                    <div className="mt-3 pt-2 border-t border-gray-50 text-xs text-gray-400">
                      Client: <span className="text-gray-600 font-medium">{order.client_name}</span>
                    </div>
                  )}

                  {order.payment_method && (
                    <div className="mt-1 text-xs text-gray-400">
                      Payment: <span className="text-gray-600 font-medium">{order.payment_method}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </CenteredModal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASH OUT MODAL — resets only after success
// ═══════════════════════════════════════════════════════════════════════════════
function CashOutModal({ isOpen, onClose, transactions, addExpense, refresh }) {
  const [expenseItem, setExpenseItem] = useState('')
  const [expenseQty, setExpenseQty] = useState('')
  const [expensePrice, setExpensePrice] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('Supplies')
  const [submitting, setSubmitting] = useState(false)

  const expenseCategories = ['Supplies', 'Salary', 'Rent', 'Utilities', 'Marketing', 'Other']

  const todayCashOut = useMemo(() =>
    transactions
      .filter(t => t.transaction_type === 'cash_out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  , [transactions])

  const todayExpenses = useMemo(() =>
    transactions.filter(t => t.transaction_type === 'cash_out')
  , [transactions])

  useEffect(() => {
    if (!isOpen) {
      setExpenseItem('')
      setExpenseQty('')
      setExpensePrice('')
      setExpenseCategory('Supplies')
      setSubmitting(false)
    }
  }, [isOpen])

  const handleExpenseSubmit = async (e) => {
    e.preventDefault()
    const qty = Math.max(1, Math.round(Number(expenseQty)) || 1)
    const price = Math.round(Number(expensePrice)) || 0
    const total = qty * price
    if (!total || !expenseItem.trim()) return

    setSubmitting(true)
    try {
      await addExpense(expenseItem.trim(), qty, price, expenseCategory)
      setExpenseItem('')
      setExpenseQty('')
      setExpensePrice('')
      setExpenseCategory('Supplies')
      await refresh()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to add expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <TrendingDown size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cash Out / Expenses</h3>
            <p className="text-xs text-gray-500">Record a new expense</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        <div className="bg-red-50 rounded-xl p-5 border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 font-medium">Total Cash Out Today</p>
              <p className="text-3xl font-bold text-red-800 mt-1">{todayCashOut.toLocaleString('fr-FR')} DA</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <TrendingDown size={28} className="text-red-700" />
            </div>
          </div>
          <p className="text-xs text-red-600 mt-2">Manually recorded expenses</p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Plus size={16} /> Add New Expense
          </h4>
          <form onSubmit={handleExpenseSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="exp-item" className="block text-xs font-medium text-gray-600 mb-1">Item / Description</label>
                <input id="exp-item" type="text" value={expenseItem} onChange={(e) => setExpenseItem(e.target.value)}
                  placeholder="e.g. Fresh Roses Supply" required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none" />
              </div>
              <div>
                <label htmlFor="exp-qty" className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input id="exp-qty" type="number" value={expenseQty} onChange={(e) => setExpenseQty(e.target.value)}
                  placeholder="0" min="1" required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none" />
              </div>
              <div>
                <label htmlFor="exp-price" className="block text-xs font-medium text-gray-600 mb-1">Unit Price (DA)</label>
                <input id="exp-price" type="number" value={expensePrice} onChange={(e) => setExpensePrice(e.target.value)}
                  placeholder="0" min="0" required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="exp-cat" className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select id="exp-cat" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none">
                  {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={submitting}
                  className="px-6 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </div>
            {(expenseQty && expensePrice) && (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                Total: <span className="font-bold text-red-700 text-lg">{Math.round(Number(expenseQty)) * Math.round(Number(expensePrice))} DA</span>
                <span className="text-gray-400 text-xs ml-2">({expenseQty} × {expensePrice} DA)</span>
              </div>
            )}
          </form>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Today&apos;s Expenses</h4>
          <div className="space-y-2">
            {todayExpenses.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <ArrowDownCircle size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.description || 'Expense'}</p>
                    <p className="text-xs text-gray-500">
                      {tx.category || 'Other'}
                      {tx.quantity && tx.unit_price && <span className="ml-2 text-gray-400">{tx.quantity} × {tx.unit_price} DA</span>}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-red-700 text-lg">-{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span>
              </div>
            ))}
            {todayExpenses.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm border border-gray-100">
                <TrendingDown size={32} className="mx-auto mb-2 opacity-30" />
                <p>No expenses recorded today</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </CenteredModal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOSING BALANCE MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function ClosingBalanceModal({ isOpen, onClose, computedBalance, openingBalance, todayCashIn, todayCashOut, setClosingBalance, refresh }) {
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen && computedBalance > 0) {
      setAmount(computedBalance.toString())
    }
    if (!isOpen) {
      setAmount('')
      setSubmitting(false)
    }
  }, [isOpen, computedBalance])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const val = Math.round(Number(amount))
    if (!val || val <= 0) return

    setSubmitting(true)
    try {
      await setClosingBalance(val)
      setAmount('')
      await refresh()
      onClose()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to set closing balance')
    } finally {
      setSubmitting(false)
    }
  }

  const diff = Math.round(Number(amount || 0)) - computedBalance
  const hasDiff = Math.abs(diff) > 0

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Lock size={20} className="text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Set Closing Balance</h3>
            <p className="text-xs text-gray-500">End of day cash count</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="p-6 space-y-5">
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Opening Balance</span>
            <span className="font-medium text-emerald-800">{openingBalance.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Cash In</span>
            <span className="font-medium text-teal-700">+{todayCashIn.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Cash Out</span>
            <span className="font-medium text-red-700">-{todayCashOut.toLocaleString('fr-FR')} DA</span>
          </div>
          <div className="pt-2 border-t border-amber-200 flex justify-between text-sm font-semibold">
            <span className="text-gray-800">Computed Balance</span>
            <span className="text-amber-800">{computedBalance.toLocaleString('fr-FR')} DA</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="closing-amount" className="block text-sm font-medium text-gray-700 mb-1.5">Actual Cash Count (DA)</label>
            <input
              id="closing-amount"
              type="number"
              step="1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none text-lg font-semibold text-center"
              required
              autoFocus
            />
          </div>

          {hasDiff && (
            <div className={`p-3 rounded-lg text-sm text-center font-medium ${
              diff > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              diff < 0 ? 'bg-red-50 text-red-700 border border-red-200' : ''
            }`}>
              {diff > 0 ? `+${diff.toLocaleString('fr-FR')} DA surplus` :
               diff < 0 ? `${diff.toLocaleString('fr-FR')} DA shortage` : 'Exact match'}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-3 rounded-lg bg-amber-700 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : 'Close Register'}
            </button>
          </div>
        </form>
      </div>
    </CenteredModal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function CoffreForte() {
  const {
    transactions,
    calendarDays = [],
    linkedOrders,
    dayTransactions,
    dayOrders,
    loading,
    addTransaction,
    addExpense,
    setClosingBalance,
    refresh,
    loadDayDetails
  } = useCashRegister()

  const [searchParams, setSearchParams] = useSearchParams()

  // Modal states
  const [showCashInModal, setShowCashInModal] = useState(false)
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [showClosingModal, setShowClosingModal] = useState(false)
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false)

  // Day detail state
  const [activePanel, setActivePanel] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedDayData, setSelectedDayData] = useState(null)

  const [submitting, setSubmitting] = useState(false)

  // ─── Computed values (memoized) ─────────────────────────────────────────────
  const todayCashIn = useMemo(() =>
    transactions
      .filter(t => t.transaction_type === 'cash_in')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  , [transactions])

  const todayCashOut = useMemo(() =>
    transactions
      .filter(t => t.transaction_type === 'cash_out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  , [transactions])

  const closingTransaction = useMemo(() =>
    transactions.find(t => t.transaction_type === 'closing')
  , [transactions])

  const closingBalance = closingTransaction ? closingTransaction.amount : 0
  const hasClosing = !!closingTransaction

  const openingTransaction = useMemo(() =>
    transactions.find(t => t.transaction_type === 'opening')
  , [transactions])

  const openingBalance = openingTransaction ? openingTransaction.amount : 0
  const hasOpening = !!openingTransaction

  const computedBalance = openingBalance + todayCashIn - todayCashOut

  // ─── Auto-open Cash Out from URL param (safe cleanup) ──────────────────────
  useEffect(() => {
    const panel = searchParams.get('panel')
    if (panel === 'cashout') {
      setShowCashOutModal(true)
      // Only remove 'panel', preserve other params
      const next = new URLSearchParams(searchParams)
      next.delete('panel')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ─── Handle Add Transaction from Modal ───────────────────────────────────────
  const handleAddTransaction = useCallback(async (type, amount, description, category) => {
    setSubmitting(true)
    try {
      await addTransaction(type, amount, description, category)
      await refresh()
      setShowAddTransactionModal(false)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to save transaction')
    } finally {
      setSubmitting(false)
    }
  }, [addTransaction, refresh])

  const openDayDetail = useCallback(async (date, dayData) => {
    setSelectedDate(date)
    setSelectedDayData(dayData)
    setActivePanel('day-detail')
    try {
      await loadDayDetails(date)
    } catch (err) {
      console.error('Failed to load day details:', err)
    }
  }, [loadDayDetails])

  // ─── Calendar grid (memoized) ───────────────────────────────────────────────
  const weeks = useMemo(() => {
    const days = []
    const todayDate = new Date()

    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayDate)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayNum = d.getDate()
      const monthStr = d.toLocaleDateString('fr-FR', { month: 'short' })
      const isToday = i === 0

      const dayData = Array.isArray(calendarDays)
        ? calendarDays.find(cd => cd && cd.register_date === dateStr)
        : null

      days.push({ date: dateStr, dayNum, monthStr, isToday, data: dayData || null })
    }

    const result = []
    let currentWeek = []

    days.forEach((day, idx) => {
      const dayOfWeek = new Date(day.date).getDay()
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1

      if (idx === 0) {
        for (let i = 0; i < adjustedDay; i++) currentWeek.push(null)
      }

      currentWeek.push(day)

      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
      }
    })

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null)
      result.push(currentWeek)
    }

    return result
  }, [calendarDays])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-700" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-emerald-800 flex items-center gap-3">
              <Vault size={28} />
              Coffre Forte
            </h1>
            <p className="text-sm text-gray-500 mt-1">30-Day Calendar View</p>
          </div>
          <button
            onClick={() => setShowAddTransactionModal(true)}
            className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white font-medium flex items-center gap-2 hover:bg-emerald-600 transition-colors"
          >
            <Plus size={18} />
            Add Transaction
          </button>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Opening */}
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Unlock size={20} className="text-emerald-700" />
              </div>
              <span className="text-sm text-gray-500">Opening</span>
            </div>
            <p className="text-2xl font-bold text-emerald-800">{openingBalance.toLocaleString('fr-FR')} DA</p>
          </div>

          {/* Cash In */}
          <div
            onClick={() => setShowCashInModal(true)}
            className="bg-amber-50 rounded-xl p-5 border cursor-pointer transition-all hover:shadow-md relative group border-amber-100"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                <TrendingUp size={20} className="text-teal-700" />
              </div>
              <span className="text-sm text-gray-500">Cash In</span>
              <span className="ml-auto text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Auto</span>
            </div>
            <p className="text-2xl font-bold text-teal-700">{todayCashIn.toLocaleString('fr-FR')} DA</p>
            <div className="mt-2 flex items-center text-xs text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
              View daily breakdown <ChevronRight size={14} />
            </div>
          </div>

          {/* Cash Out */}
          <div
            onClick={() => setShowCashOutModal(true)}
            className="bg-amber-50 rounded-xl p-5 border cursor-pointer transition-all hover:shadow-md relative group border-amber-100"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <TrendingDown size={20} className="text-red-700" />
              </div>
              <span className="text-sm text-gray-500">Cash Out</span>
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Manual</span>
            </div>
            <p className="text-2xl font-bold text-red-700">{todayCashOut.toLocaleString('fr-FR')} DA</p>
            <div className="mt-2 flex items-center text-xs text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Add expenses <ChevronRight size={14} />
            </div>
          </div>

          {/* Closing */}
          <div className={`rounded-xl p-5 ${hasClosing ? 'bg-amber-700 text-white' : 'bg-gray-100 border border-gray-200'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasClosing ? 'bg-white/20' : 'bg-gray-200'}`}>
                <Lock size={20} className={hasClosing ? 'text-white' : 'text-gray-500'} />
              </div>
              <span className={`text-sm ${hasClosing ? 'text-white/80' : 'text-gray-500'}`}>Closing Balance</span>
              {!hasClosing && <span className="ml-auto text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">Open</span>}
            </div>
            {hasClosing ? (
              <p className="text-3xl font-bold">{closingBalance.toLocaleString('fr-FR')} DA</p>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-gray-400" />
                <p className="text-lg font-medium text-gray-400">Not closed yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Computed Balance Note */}
        {!hasClosing && hasOpening && (
          <div className="flex items-center justify-end gap-2 text-sm text-gray-500">
            <span>Computed balance:</span>
            <span className="font-semibold text-emerald-700">{computedBalance.toLocaleString('fr-FR')} DA</span>
            <span className="text-xs text-gray-400">(Opening + In − Out)</span>
          </div>
        )}

        {/* Quick Actions */}
        {!hasOpening && (
          <div className="bg-amber-100/50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Unlock size={20} className="text-amber-700" />
              <span className="text-sm text-amber-800 font-medium">No opening balance set for today</span>
            </div>
            <button
              onClick={() => setShowAddTransactionModal(true)}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
            >
              Set Opening Balance
            </button>
          </div>
        )}

        {!hasClosing && hasOpening && (
          <div className="bg-emerald-100/50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock size={20} className="text-emerald-700" />
              <span className="text-sm text-emerald-800 font-medium">End of day? Set your closing balance</span>
            </div>
            <button
              onClick={() => setShowClosingModal(true)}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
            >
              Set Closing Balance
            </button>
          </div>
        )}

        {/* 30-Day Calendar Grid */}
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900">Last 30 Days</h3>
            </div>
            <span className="text-xs text-gray-500">Click any day for full details</span>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-400 py-1">{day}</div>
            ))}
          </div>

          <div className="space-y-2">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="grid grid-cols-7 gap-2">
                {week.map((day, dayIdx) => {
                  if (!day) return <div key={dayIdx} className="h-28 rounded-lg" />

                  const hasData = !!day.data
                  const isToday = day.isToday

                  return (
                    <div
                      key={day.date}
                      onClick={() => openDayDetail(day.date, day.data)}
                      className={`h-28 rounded-lg p-2 cursor-pointer transition-all hover:shadow-md flex flex-col ${
                        isToday ? 'bg-emerald-50 border-2 border-emerald-300' :
                        hasData ? 'bg-white border border-gray-100 hover:border-emerald-200' :
                        'bg-gray-50/50 border border-gray-100/50 opacity-60'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-semibold ${isToday ? 'text-emerald-800' : 'text-gray-700'}`}>{day.dayNum}</span>
                        {isToday && <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.5 rounded font-medium">Today</span>}
                        {hasData && day.data?.is_closed && !isToday && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">Closed</span>
                        )}
                      </div>

                      {hasData ? (
                        <div className="mt-auto space-y-0.5 text-[10px]">
                          <div className="flex justify-between"><span className="text-gray-400">Op:</span><span className="font-medium text-gray-700">{(day.data.opening_balance || 0).toLocaleString('fr-FR')}</span></div>
                          <div className="flex justify-between"><span className="text-teal-600">In:</span><span className="font-medium text-teal-700">{(day.data.total_cash_in || 0).toLocaleString('fr-FR')}</span></div>
                          <div className="flex justify-between"><span className="text-red-600">Out:</span><span className="font-medium text-red-700">{(day.data.total_cash_out || 0).toLocaleString('fr-FR')}</span></div>
                          <div className="pt-0.5 border-t border-gray-100 flex justify-between font-medium">
                            <span className="text-gray-700">Cl:</span>
                            <span className="text-gray-900">{(day.data.closing_balance || 0).toLocaleString('fr-FR')}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-auto text-center text-[10px] text-gray-300">No data</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          CENTERED MODALS
          ════════════════════════════════════════════════════════════════════════ */}

      <AddTransactionModal
        isOpen={showAddTransactionModal}
        onClose={() => setShowAddTransactionModal(false)}
        onSubmit={handleAddTransaction}
        submitting={submitting}
      />

      <CashInModal
        isOpen={showCashInModal}
        onClose={() => setShowCashInModal(false)}
        linkedOrders={linkedOrders}
        todayCashIn={todayCashIn}
      />

      <CashOutModal
        isOpen={showCashOutModal}
        onClose={() => setShowCashOutModal(false)}
        transactions={transactions}
        addExpense={addExpense}
        refresh={refresh}
      />

      <ClosingBalanceModal
        isOpen={showClosingModal}
        onClose={() => setShowClosingModal(false)}
        computedBalance={computedBalance}
        openingBalance={openingBalance}
        todayCashIn={todayCashIn}
        todayCashOut={todayCashOut}
        setClosingBalance={setClosingBalance}
        refresh={refresh}
      />

      {/* Day Detail Slide-Over */}
      {activePanel === 'day-detail' && selectedDate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setActivePanel(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-gray-600" />
                <h3 className="font-semibold text-gray-900">
                  {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
                {selectedDayData?.is_closed ? (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Closed</span>
                ) : selectedDate === new Date().toISOString().split('T')[0] ? (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Open</span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Past</span>
                )}
              </div>
              <button onClick={() => setActivePanel(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                  <p className="text-xs text-gray-500 mb-1">Opening</p>
                  <p className="text-xl font-bold text-emerald-800">{(selectedDayData?.opening_balance || 0).toLocaleString('fr-FR')} DA</p>
                </div>
                <div className="bg-teal-50 rounded-lg p-4 border border-teal-100">
                  <p className="text-xs text-gray-500 mb-1">Cash In</p>
                  <p className="text-xl font-bold text-teal-700">{(selectedDayData?.total_cash_in || 0).toLocaleString('fr-FR')} DA</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                  <p className="text-xs text-gray-500 mb-1">Cash Out</p>
                  <p className="text-xl font-bold text-red-700">{(selectedDayData?.total_cash_out || 0).toLocaleString('fr-FR')} DA</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                  <p className="text-xs text-gray-500 mb-1">Closing</p>
                  <p className="text-xl font-bold text-gray-900">{(selectedDayData?.closing_balance || 0).toLocaleString('fr-FR')} DA</p>
                </div>
              </div>

              {/* Cash In — Orders */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={18} className="text-teal-600" />
                  <h4 className="text-sm font-semibold text-gray-700">Cash In — Orders</h4>
                  <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">Auto from Orders</span>
                </div>
                {(!dayOrders || dayOrders.length === 0) ? (
                  <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">No orders for this day</div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    {dayOrders.map((order) => (
                      <div key={order.id} className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold bg-teal-100 text-teal-700 px-2 py-1 rounded">Order #{order.order_number || order.id?.slice(0, 8)}</span>
                            <span className="text-xs text-gray-400">{order.created_at ? new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">{order.status}</span>
                          </div>
                          <span className="font-bold text-teal-700 text-lg">+{Number(order.total_amount || 0).toLocaleString('fr-FR')} DA</span>
                        </div>
                        {order.order_items && order.order_items.length > 0 && (
                          <div className="space-y-1.5 pl-2 border-l-2 border-teal-100">
                            {order.order_items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                  <span className="text-teal-500">•</span>
                                  <span>{item.product_name || 'Unknown'}</span>
                                  <span className="text-xs text-gray-400">× {item.quantity || 1}</span>
                                </div>
                                <span className="font-medium">{Number((item.unit_price || 0) * (item.quantity || 1)).toLocaleString('fr-FR')} DA</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {order.client_name && <div className="mt-2 text-xs text-gray-400">Client: {order.client_name}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cash Out — Expenses */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown size={18} className="text-red-600" />
                  <h4 className="text-sm font-semibold text-gray-700">Cash Out — Expenses</h4>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Manual Entry</span>
                </div>
                {(!dayTransactions || dayTransactions.filter(t => t.transaction_type === 'cash_out').length === 0) ? (
                  <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">No expenses for this day</div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    {dayTransactions.filter(t => t.transaction_type === 'cash_out').map((tx) => (
                      <div key={tx.id} className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><ArrowDownCircle size={18} /></div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{tx.description || 'Expense'}</p>
                              <p className="text-xs text-gray-500">{tx.category || 'Other'}</p>
                            </div>
                          </div>
                          <span className="font-bold text-red-700 text-lg">-{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span>
                        </div>
                        {(tx.quantity || tx.unit_price) && (
                          <div className="mt-2 ml-12 flex items-center gap-4 text-xs text-gray-500">
                            <span className="bg-gray-100 px-2 py-1 rounded">Item: <span className="font-medium text-gray-700">{tx.description}</span></span>
                            <span className="bg-gray-100 px-2 py-1 rounded">Qty: <span className="font-medium text-gray-700">{tx.quantity || 1}</span></span>
                            <span className="bg-gray-100 px-2 py-1 rounded">Unit: <span className="font-medium text-gray-700">{Number(tx.unit_price || 0).toLocaleString('fr-FR')} DA</span></span>
                            <span className="bg-red-50 px-2 py-1 rounded">Total: <span className="font-medium text-red-700">{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</span></span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Opening & Closing */}
              <div className="grid grid-cols-2 gap-4">
                {dayTransactions?.filter(t => t.transaction_type === 'opening').map(tx => (
                  <div key={tx.id} className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 flex items-center gap-3">
                    <Unlock size={16} className="text-emerald-600" />
                    <div>
                      <p className="text-xs text-gray-500">Opening Balance</p>
                      <p className="font-bold text-emerald-800">{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</p>
                    </div>
                  </div>
                ))}
                {dayTransactions?.filter(t => t.transaction_type === 'closing').map(tx => (
                  <div key={tx.id} className="bg-amber-50 rounded-lg p-3 border border-amber-100 flex items-center gap-3">
                    <Lock size={16} className="text-amber-600" />
                    <div>
                      <p className="text-xs text-gray-500">Closing Balance</p>
                      <p className="font-bold text-amber-800">{Number(tx.amount || 0).toLocaleString('fr-FR')} DA</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default CoffreForte