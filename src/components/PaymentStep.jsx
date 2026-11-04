import { useState, useEffect, useRef, useCallback } from 'react'
import { Banknote, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { parseCardCode } from '../lib/scanDecode'
import { LOYALTY_REDEMPTION_POINTS, loyaltyDiscountForPoints, maxRedeemablePoints as getMaxRedeemablePoints, normalizeRedeemedPoints } from '../lib/loyalty'

export default function PaymentStep({ total, deliveryFee = 0, paymentMethod, exchangeRate = 0, customer = null, onConfirm, onCancel, isSubmitting }) {
  const [amountPaid, setAmountPaid] = useState('')
  const [amountError, setAmountError] = useState('')
  const [notes, setNotes] = useState('')
  const [loyaltyBalance, setLoyaltyBalance] = useState(0)
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(false)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  const { role } = useAuth()
  const canSkipCard = role === 'owner' || role === 'manager'
  const [loyaltyError, setLoyaltyError] = useState(false)
  const [loyaltyAttempt, setLoyaltyAttempt] = useState(0)
  // Spending petals needs the customer's card, or an owner or manager and a reason.
  const [checkingCard, setCheckingCard] = useState(false)
  const [cardInput, setCardInput] = useState('')
  const [noCardReason, setNoCardReason] = useState('')
  const [cardMessage, setCardMessage] = useState('')
  const [cardBusy, setCardBusy] = useState(false)
  const [rewardProof, setRewardProof] = useState(null)

  useEffect(() => {
    let active = true
    setLoyaltyBalance(0)
    setLoyaltyError(false)
    setPointsToRedeem(0)
    setCheckingCard(false)
    setRewardProof(null)
    setLoyaltyLoaded(!customer?.customer_id)
    if (!customer?.customer_id) return undefined

    supabase.from('customer_loyalty_transactions')
      .select('points_delta')
      .eq('customer_id', customer.customer_id)
      .then(({ data, error }) => {
        if (!active) return
        if (error) setLoyaltyError(true)
        else setLoyaltyBalance((data || []).reduce((sum, row) => sum + Number(row.points_delta || 0), 0))
        setLoyaltyLoaded(true)
      })
    return () => { active = false }
  }, [customer?.customer_id, loyaltyAttempt])

  const orderTotal = Math.max(0, total)
  const maxRedeemablePoints = getMaxRedeemablePoints(loyaltyBalance, orderTotal)
  const appliedPoints = Math.min(normalizeRedeemedPoints(pointsToRedeem), maxRedeemablePoints)
  const loyaltyDiscount = loyaltyDiscountForPoints(appliedPoints)
  const numericTotal = Math.max(0, orderTotal - loyaltyDiscount)
  const applyReward = useCallback((proof) => {
    setRewardProof(proof)
    setPointsToRedeem(maxRedeemablePoints)
    setCheckingCard(false)
    setCardInput('')
    setNoCardReason('')
    setCardMessage('')
    setAmountPaid('')
    setAmountError('')
  }, [maxRedeemablePoints])

  const removeReward = () => {
    setRewardProof(null)
    setPointsToRedeem(0)
    setAmountPaid('')
    setAmountError('')
  }

  const checkCard = useCallback(async (rawCode) => {
    const code = parseCardCode(rawCode)
    if (!code) { setCardMessage('That is not a Blossom card ID. Scan the card again.'); return }
    setCardBusy(true)
    setCardMessage('')
    const { data, error } = await supabase.from('customer_loyalty_cards')
      .select('customer_id').eq('code', code).maybeSingle()
    setCardBusy(false)
    if (error) setCardMessage('Could not check this card. Check the connection and try again.')
    else if (data?.customer_id !== customer?.customer_id) setCardMessage(`Card ${code} does not belong to ${customer?.full_name || 'this customer'}.`)
    else applyReward({ cardCode: code })
  }, [applyReward, customer?.customer_id, customer?.full_name])

  // Runs first and stops the event, so the customer search behind this window
  // can't switch to another customer because of this scan.
  useEffect(() => {
    if (!checkingCard) return undefined
    const onScan = (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      setCardInput(event.detail.code)
      void checkCard(event.detail.code)
    }
    window.addEventListener('blossom:card-scanned', onScan, true)
    return () => window.removeEventListener('blossom:card-scanned', onScan, true)
  }, [checkingCard, checkCard])

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
      loyaltyCardCode: appliedPoints > 0 ? rewardProof?.cardCode ?? null : null,
      loyaltyOverrideReason: appliedPoints > 0 ? rewardProof?.reason ?? null : null,
      notes: [fxNote, notes.trim()].filter(Boolean).join(' · '),
      change: Math.round(change),
    })
  }, [onConfirm, isSubmitting, isUsd, rateIsValid, amountError, numericReceived, rate, receivedInDzd, numericPaid, isPaid, isPartial, remaining, notes, change, appliedPoints, rewardProof])

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
            <div className={`rounded-xl border p-3 ${maxRedeemablePoints >= LOYALTY_REDEMPTION_POINTS ? 'border-fuchsia-400 bg-fuchsia-50' : 'border-fuchsia-100 bg-fuchsia-50/70'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-fuchsia-700"><Sparkles size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-fuchsia-900">{!loyaltyLoaded ? 'Loading petals…' : loyaltyError ? 'Petals could not be loaded' : maxRedeemablePoints >= LOYALTY_REDEMPTION_POINTS ? `Reward ready: ${loyaltyDiscountForPoints(maxRedeemablePoints).toLocaleString('fr-FR')} DA off` : `${Math.max(0, loyaltyBalance).toLocaleString('fr-FR')} petals`}</p>
                    {loyaltyError && <button type="button" onClick={() => setLoyaltyAttempt((attempt) => attempt + 1)} className="text-2xs font-semibold text-fuchsia-800 underline underline-offset-2">Try again</button>}
                    {loyaltyLoaded && !loyaltyError && <p className="text-2xs text-fuchsia-700">{maxRedeemablePoints >= LOYALTY_REDEMPTION_POINTS ? `Customer has ${Math.max(0, loyaltyBalance).toLocaleString('fr-FR')} petals. Offer it before payment.` : Math.max(0, loyaltyBalance) >= LOYALTY_REDEMPTION_POINTS ? 'This order is too small for a reward.' : `${LOYALTY_REDEMPTION_POINTS - (Math.max(0, loyaltyBalance) % LOYALTY_REDEMPTION_POINTS)} more petals to the next reward`}</p>}
                  </div>
                </div>
                {maxRedeemablePoints >= LOYALTY_REDEMPTION_POINTS && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (appliedPoints) removeReward()
                      else { setCheckingCard((current) => !current); setCardMessage('') }
                    }}
                    className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 ${appliedPoints ? 'border border-fuchsia-300 bg-white text-fuchsia-800' : 'bg-fuchsia-700 text-white hover:bg-fuchsia-800'}`}
                  >
                    {appliedPoints ? 'Remove reward' : checkingCard ? 'Back' : 'Use reward'}
                  </button>
                )}
              </div>
              {checkingCard && !appliedPoints && (
                <div className="mt-3 space-y-3 rounded-lg bg-white p-3">
                  <div>
                    <label htmlFor="reward-card" className="text-xs font-semibold text-gray-700">Scan the customer's card</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="reward-card"
                        autoFocus
                        value={cardInput}
                        onChange={(event) => setCardInput(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void checkCard(cardInput) } }}
                        placeholder="Scan or type the card ID"
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-lg border border-fuchsia-200 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-fuchsia-200"
                      />
                      <button type="button" disabled={cardBusy || !cardInput.trim()} onClick={() => checkCard(cardInput)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 text-sm font-semibold text-white disabled:opacity-50">
                        {cardBusy && <Loader2 size={14} className="animate-spin" />} Check
                      </button>
                    </div>
                  </div>
                  {canSkipCard ? (
                    <div>
                      <label htmlFor="reward-reason" className="text-xs font-semibold text-gray-700">No card? Give a reason</label>
                      <div className="mt-1 flex gap-2">
                        <input
                          id="reward-reason"
                          value={noCardReason}
                          onChange={(event) => setNoCardReason(event.target.value)}
                          placeholder="Shown in the activity log"
                          maxLength={500}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-200"
                        />
                        <button type="button" disabled={!noCardReason.trim()} onClick={() => applyReward({ reason: noCardReason.trim() })} className="min-h-10 rounded-lg border border-fuchsia-300 px-3 text-sm font-semibold text-fuchsia-800 disabled:opacity-50">Use without card</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No card with them? An owner or manager must apply this reward.</p>
                  )}
                  {cardMessage && <p role="alert" className="text-xs text-rose-700">{cardMessage}</p>}
                </div>
              )}
              {appliedPoints > 0 && rewardProof && (
                <p className="mt-2 text-2xs text-fuchsia-800">{rewardProof.cardCode ? `Card checked: ${rewardProof.cardCode}` : `Without card: ${rewardProof.reason}`}</p>
              )}
              {appliedPoints > 0 && maxRedeemablePoints > LOYALTY_REDEMPTION_POINTS ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <div role="group" aria-label="Petals to use" className="flex items-center gap-2">
                    <button type="button" aria-label="Use fewer petals" disabled={appliedPoints <= LOYALTY_REDEMPTION_POINTS} onClick={() => { setPointsToRedeem(appliedPoints - LOYALTY_REDEMPTION_POINTS); setAmountPaid(''); setAmountError('') }} className="h-8 w-8 rounded-lg border border-fuchsia-200 font-bold text-fuchsia-800 disabled:opacity-40">−</button>
                    <span className="min-w-20 text-center text-sm font-semibold text-gray-800">{appliedPoints.toLocaleString('fr-FR')} petals</span>
                    <button type="button" aria-label="Use more petals" disabled={appliedPoints >= maxRedeemablePoints} onClick={() => { setPointsToRedeem(appliedPoints + LOYALTY_REDEMPTION_POINTS); setAmountPaid(''); setAmountError('') }} className="h-8 w-8 rounded-lg border border-fuchsia-200 font-bold text-fuchsia-800 disabled:opacity-40">+</button>
                  </div>
                  <p className="text-sm font-bold text-emerald-700">−{loyaltyDiscount.toLocaleString('fr-FR')} DA</p>
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
