import { useState, useEffect, useRef, useCallback } from 'react'
import { Banknote, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LOYALTY_REDEMPTION_POINTS, loyaltyDiscountForPoints, maxRedeemablePoints as getMaxRedeemablePoints, normalizeRedeemedPoints } from '../lib/loyalty'

export default function PaymentStep({ total, deliveryFee = 0, paymentMethod, exchangeRate = 0, customer = null, onConfirm, onCancel, isSubmitting }) {
  const [amountPaid, setAmountPaid] = useState('')
  const [amountError, setAmountError] = useState('')
  const [notes, setNotes] = useState('')
  const [loyaltyBalance, setLoyaltyBalance] = useState(0)
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(false)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)

  useEffect(() => {
    let active = true
    setLoyaltyBalance(0)
    setPointsToRedeem(0)
    setLoyaltyLoaded(!customer?.customer_id)
    if (!customer?.customer_id) return undefined

    supabase.from('customer_loyalty_transactions')
      .select('points_delta')
      .eq('customer_id', customer.customer_id)
      .then(({ data, error }) => {
        if (!active) return
        if (!error) setLoyaltyBalance((data || []).reduce((sum, row) => sum + Number(row.points_delta || 0), 0))
        setLoyaltyLoaded(true)
      })
    return () => { active = false }
  }, [customer?.customer_id])

  const orderTotal = Math.max(0, total)
  const maxRedeemablePoints = getMaxRedeemablePoints(loyaltyBalance, orderTotal)
  const appliedPoints = Math.min(normalizeRedeemedPoints(pointsToRedeem), maxRedeemablePoints)
  const loyaltyDiscount = loyaltyDiscountForPoints(appliedPoints)
  const numericTotal = Math.max(0, orderTotal - loyaltyDiscount)
  const numericDeliveryFee = Math.max(0, Number(deliveryFee) || 0)
  const customerChargeTotal = numericTotal + numericDeliveryFee
  const parsedReceived = Number(amountPaid)
  const numericReceived = Number.isFinite(parsedReceived) && parsedReceived > 0
    ? parsedReceived
    : 0
  const isUsd = paymentMethod === 'usd'
  const rate = Number(exchangeRate)
  const rateIsValid = Number.isFinite(rate) && rate > 0
  const receivedInDzd = isUsd ? numericReceived * (rateIsValid ? rate : 0) : numericReceived
  // Keep the order ledger at or below the amount due. Any extra tender is
  // change returned to the customer, not additional revenue/payment credit.
  const numericPaid = Math.min(numericTotal, receivedInDzd)
  const change = Math.max(0, receivedInDzd - numericTotal)
  const remaining = Math.max(0, numericTotal - numericPaid)

  const isPaid = numericTotal === 0 || numericPaid >= numericTotal
  const isPartial = numericPaid > 0 && numericPaid < numericTotal
  const tenderExact = isUsd && rateIsValid ? (numericTotal / rate).toFixed(2) : String(numericTotal)
  const tenderRounded = isUsd && rateIsValid
    ? (Math.ceil((numericTotal / rate) * 100) / 100).toFixed(2)
    : String(Math.ceil(numericTotal / 100) * 100)

  let statusText = numericTotal === 0 ? 'No payment due' : 'Pay Later'
  let statusColor = 'text-slate-400'
  if (numericTotal === 0) statusColor = 'text-emerald-600'
  else if (isPaid) { statusText = 'Fully Paid'; statusColor = 'text-emerald-600' }
  else if (isPartial) { statusText = 'Partial Payment'; statusColor = 'text-amber-600' }

  const amountRef = useRef(null)

  useEffect(() => {
    setAmountPaid('')
    setAmountError('')
  }, [paymentMethod, exchangeRate])

  const handleAmountChange = (value) => {
    setAmountPaid(value)
    const parsed = Number(value)
    if (value !== '' && (!Number.isFinite(parsed) || parsed < 0)) {
      setAmountError('Enter an amount of zero or more.')
    } else if (value !== '' && !isUsd && !Number.isInteger(parsed)) {
      setAmountError('Use whole dinars for cash and BaridiMob.')
    } else if (value !== '' && isUsd && value.includes('.') && value.split('.')[1].length > 2) {
      setAmountError('Enter no more than two decimal places for USDT.')
    } else {
      setAmountError('')
    }
  }

  const handleConfirm = useCallback(() => {
    if (isSubmitting || amountError || (isUsd && !rateIsValid)) return
    const fxNote = isUsd && numericReceived > 0
      ? `${numericReceived.toFixed(2)} USDT at ${rate} DA/USDT = ${Math.round(receivedInDzd).toLocaleString('fr-FR')} DA equivalent`
      : ''
    onConfirm({
      amountPaid: Math.round(numericPaid),
      paymentStatus: isPaid ? 'paid' : isPartial ? 'partial' : 'unpaid',
      amountDue: Math.round(remaining),
      loyaltyPointsToRedeem: appliedPoints,
      notes: [fxNote, notes.trim()].filter(Boolean).join(' · '),
      change: Math.round(change),
    })
  }, [onConfirm, isSubmitting, isUsd, rateIsValid, amountError, numericReceived, rate, receivedInDzd, numericPaid, isPaid, isPartial, remaining, notes, change, appliedPoints])

  // Cursor lands in the amount field. This is a modal with one job and
  // it opened with focus nowhere, so the first keystroke went to the
  // page behind it.
  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  // ─── KEYBOARD ─────────────────────────────────────────────────
  // This modal is the last step of every sale. Reaching for the mouse
  // three times to pick an amount and confirm is the slowest part of
  // the flow.
  useEffect(() => {
    const onKey = (e) => {
      if (isSubmitting) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }

      if (e.key === 'Enter') {
        const el = document.activeElement
        if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el !== amountRef.current))) return
        e.preventDefault()
        handleConfirm()
        return
      }

      // The three quick amounts, mirroring their on-screen order.
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')

      if (!typing || el === amountRef.current) {
        if (e.key === 'F1') { e.preventDefault(); setAmountPaid('') }
        if (e.key === 'F2') { e.preventDefault(); setAmountPaid(tenderExact) }
        if (e.key === 'F3') {
          e.preventDefault()
          setAmountPaid(tenderRounded)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleConfirm, onCancel, tenderExact, tenderRounded, isSubmitting])

  return (
    <section className="panel overflow-hidden" aria-labelledby="payment-step-title">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Banknote size={16} className="text-emerald-600" />
            </div>
            <div>
              <h3 id="payment-step-title" className="font-semibold text-slate-900 text-sm">Record payment</h3>
              <p className="text-xs text-slate-500">Enter the amount received for the flower order. Transport is recorded separately.</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 p-4 sm:p-5">
          {/* Total */}
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold text-slate-500">Total customer charge · including transport</p>
            <p className="text-3xl font-black text-slate-900">
              {customerChargeTotal.toLocaleString('fr-FR')} <span className="text-lg text-slate-500">DA</span>
            </p>
            {numericDeliveryFee > 0 && <p className="text-xs text-slate-500">Flower order balance: {numericTotal.toLocaleString('fr-FR')} DA</p>}
            {loyaltyDiscount > 0 && <p className="text-xs text-emerald-700">Petal reward −{loyaltyDiscount.toLocaleString('fr-FR')} DA</p>}
            <p className={`text-xs font-bold ${statusColor}`}>{statusText}</p>
          </div>

          {numericDeliveryFee > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            <div className="flex justify-between gap-3"><span>Flower order</span><strong>{numericTotal.toLocaleString('fr-FR')} DA</strong></div>
            <div className="mt-1 flex justify-between gap-3"><span>Transport fee</span><strong>+{numericDeliveryFee.toLocaleString('fr-FR')} DA</strong></div>
            <div className="mt-2 flex justify-between gap-3 border-t border-blue-200 pt-2 text-base font-bold"><span>Total to collect</span><strong>{customerChargeTotal.toLocaleString('fr-FR')} DA</strong></div>
            <p className="mt-1 text-xs text-blue-800">Enter the amount received for the flower order below. Transport is recorded as a separate cash entry.</p>
          </div>}

          {customer?.customer_id && (
            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-fuchsia-700"><Sparkles size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fuchsia-900">Customer points</p>
                    <p className="text-2xs text-fuchsia-700">{loyaltyLoaded ? `${Math.max(0, loyaltyBalance).toLocaleString('fr-FR')} points available` : 'Loading points…'}</p>
                    {loyaltyLoaded && maxRedeemablePoints > 0 && <p className="text-2xs font-semibold text-fuchsia-800">For this order: {maxRedeemablePoints.toLocaleString('fr-FR')} points = {loyaltyDiscountForPoints(maxRedeemablePoints).toLocaleString('fr-FR')} DA off</p>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!loyaltyLoaded || maxRedeemablePoints < LOYALTY_REDEMPTION_POINTS || isSubmitting}
                  onClick={() => { setPointsToRedeem((current) => current > 0 ? 0 : maxRedeemablePoints); setAmountPaid(''); setAmountError('') }}
                  className="shrink-0 rounded-lg border border-fuchsia-200 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-800 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {appliedPoints ? 'Remove reward' : 'Use reward'}
                </button>
              </div>
              {appliedPoints > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-2xs font-semibold text-fuchsia-800">Points to use
                    <input type="number" min={LOYALTY_REDEMPTION_POINTS} step={LOYALTY_REDEMPTION_POINTS} max={maxRedeemablePoints} value={appliedPoints} onChange={(event) => { setPointsToRedeem(Math.min(maxRedeemablePoints, normalizeRedeemedPoints(event.target.value))); setAmountPaid(''); setAmountError('') }} className="mt-1 w-full rounded-lg border border-fuchsia-200 bg-white px-2.5 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-fuchsia-200" />
                  </label>
                  <div className="self-end rounded-lg bg-white px-3 py-2 text-right">
                    <p className="text-2xs text-gray-500">Reward discount</p>
                    <p className="text-sm font-bold text-emerald-700">−{loyaltyDiscount.toLocaleString('fr-FR')} DA</p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Input */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Amount received for flowers ({isUsd ? 'USDT' : 'DA'})
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step={isUsd ? '0.01' : '1'}
                ref={amountRef}
                value={amountPaid}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-50 border border-slate-200 text-lg font-bold text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none text-center"
              />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{isUsd ? 'USDT' : 'DA'}</span>
              </div>
              {amountError && <p className="mt-2 text-xs text-rose-700" role="alert">{amountError}</p>}
              {isUsd && (
                <p className={`mt-2 text-xs ${rateIsValid ? 'text-slate-500' : 'text-rose-600'}`}>
                  {rateIsValid
                    ? `1 USDT = ${rate.toLocaleString('fr-FR')} DA · ${numericReceived.toLocaleString('fr-FR')} USDT = ${Math.round(receivedInDzd).toLocaleString('fr-FR')} DA`
                    : 'USDT is unavailable. Ask the owner to set the exchange rate in Settings.'}
                </p>
              )}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAmountPaid('')}
              title="Pay Later (F1)"
              className="relative py-2 rounded-lg bg-slate-100 text-slate-600 text-2xs font-semibold hover:bg-slate-200 transition-colors"
            >
              <span className="absolute top-0.5 right-1.5 text-2xs font-mono text-slate-400">F1</span>
              Pay Later
            </button>
            <button
              type="button"
              onClick={() => setAmountPaid(tenderExact)}
              title="Exact (F2)"
              className="relative py-2 rounded-lg bg-success-subtle text-success text-2xs font-semibold hover:brightness-95 transition-all border border-success/20"
            >
              <span className="absolute top-0.5 right-1.5 text-2xs font-mono opacity-50">F2</span>
              Exact
            </button>
            <button
              type="button"
              onClick={() => setAmountPaid(tenderRounded)}
              title="Round Up (F3)"
              className="relative py-2 rounded-lg bg-info-subtle text-info text-2xs font-semibold hover:brightness-95 transition-all border border-info/20"
            >
              <span className="absolute top-0.5 right-1.5 text-2xs font-mono opacity-50">F3</span>
              Round Up
            </button>
          </div>

          {/* Change / Remaining */}
          {numericReceived > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              {change > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Change{isUsd ? ' (return in USDT)' : ''}</span>
                  <span className="font-bold text-emerald-600 tabular-nums">
                    {isUsd && rateIsValid
                      ? `${(change / rate).toFixed(2)} USDT (${Math.round(change).toLocaleString('fr-FR')} DA equivalent)`
                      : `${Math.round(change).toLocaleString('fr-FR')} DA`}
                  </span>
                </div>
              )}
              {remaining > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Remaining</span>
                  <span className="font-bold text-amber-600 tabular-nums">{remaining.toLocaleString('fr-FR')} DA</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-1 border-t border-slate-200">
                <span className="text-slate-500">Method</span>
                <span className="font-bold text-slate-900 capitalize">{paymentMethod}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Payment Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Deposit, versement..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/30 p-4 sm:px-5">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn btn-secondary flex-1"
            >
              Back to details
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || Boolean(amountError) || (isUsd && !rateIsValid)}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <ArrowRight size={16} />
                  {numericPaid > 0 ? (
                    <>Record <span className="figure">{numericPaid.toLocaleString('fr-FR')} DA</span></>
                  ) : (
                    'Continue to review'
                  )}
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 mt-2.5 text-2xs text-slate-400 select-none">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-2xs">F1–F3</kbd>
              amount
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-2xs">↵</kbd>
              confirm
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-2xs">Esc</kbd>
              back
            </span>
          </div>
        </div>
    </section>
  )
}
