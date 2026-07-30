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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => nudge(-step)}
        className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:border-rose-300 flex items-center justify-center transition-all active:scale-95"
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>

      <div className="flex-1 relative">
        <button
          type="button"
          onClick={toggleSign}
          className={`absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
            isDiscount
              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          }`}
        >
          {isDiscount ? 'DISC' : 'ADD'}
        </button>

        <input
          type="number"
          min="0"
          step={step}
          value={absVal}
          onChange={(e) => setAbs(e.target.value)}
          className="w-full pl-[3.2rem] pr-8 py-2.5 text-center rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-bold text-gray-800 transition-all"
        />

        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
          {currency}
        </span>
      </div>

      <button
        type="button"
        onClick={() => nudge(step)}
        className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300 flex items-center justify-center transition-all active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  )
}