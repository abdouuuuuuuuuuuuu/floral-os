import { Minus, Plus } from 'lucide-react'

export default function PriceAdjuster({ value = 0, onChange, currency = 'DA', step = 10 }) {
  if (typeof onChange !== 'function') {
    console.error('PriceAdjuster: onChange must be a function. Received:', onChange)
    return <div className="text-rose-500 text-xs">Error: onChange missing</div>
  }

  const isDiscount = value < 0
  const absVal = Math.abs(value)

  const setAbs = (v) => {
    const num = Math.max(0, parseFloat(v) || 0)
    onChange(isDiscount ? -num : num)
  }

  const toggleSign = () => onChange(-value)
  const nudge = (delta) => onChange(value + delta)

  return (
    // One control, not four coloured objects.
    //
    // This was a red circle, a green pill, a number, a currency label
    // and a green circle — five elements, three semantic colours, for
    // adjusting a single value. Red and green mean "money out" and
    // "money in" elsewhere in this app; spending them on a stepper
    // makes them mean nothing.
    //
    // Now: one field, quiet steppers, and colour used ONLY to show
    // whether the adjustment is a discount or a surcharge, which is the
    // one thing here that actually carries meaning.
    <div className={`flex items-center rounded-xl border overflow-hidden transition-colors ${
      value === 0
        ? 'border-slate-200 bg-white'
        : isDiscount
          ? 'border-danger/30 bg-danger-subtle'
          : 'border-success/30 bg-success-subtle'
    }`}>
      <button
        type="button"
        onClick={() => nudge(-step)}
        aria-label={`Decrease by ${step}`}
        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-black/[0.03] press shrink-0"
      >
        <Minus size={15} strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={toggleSign}
        title="Switch between discount and surcharge"
        className={`text-2xs font-semibold px-2 py-0.5 rounded-md shrink-0 press ${
          value === 0
            ? 'text-slate-400 hover:bg-black/[0.04]'
            : isDiscount
              ? 'text-danger hover:bg-danger/10'
              : 'text-success hover:bg-success/10'
        }`}
      >
        {isDiscount ? '−' : '+'}
      </button>

      <input
        type="number"
        min="0"
        step={step}
        value={absVal}
        onChange={(e) => setAbs(e.target.value)}
        aria-label={isDiscount ? 'Discount amount' : 'Surcharge amount'}
        className="flex-1 min-w-0 px-1 py-2.5 bg-transparent border-0 outline-none text-sm font-semibold text-right tabular text-slate-800"
      />

      <span className="text-2xs text-slate-400 pr-2 shrink-0">{currency}</span>

      <button
        type="button"
        onClick={() => nudge(step)}
        aria-label={`Increase by ${step}`}
        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-black/[0.03] press shrink-0"
      >
        <Plus size={15} strokeWidth={2.5} />
      </button>
    </div>
  )
}