// src/components/reports/MonthlyFlowerWasteCard.jsx
import { Droplets, Flower2, RefreshCw, TrendingDown } from "lucide-react";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("fr-FR");
}

function formatMonth(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

export default function MonthlyFlowerWasteCard({
  data = [],
  totals,
  loading,
  error,
  onRefresh,
}) {
  const max = Math.max(...data.map((row) => row.totalQuantity), 1);

  return (
    <section className="bg-white rounded-2xl border border-rose-200 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
            <Flower2 size={21} className="text-rose-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Monthly Wasted Flowers
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Wilted, damaged and spoiled stock removed from inventory
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title="Refresh flower waste"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-10 bg-gray-100 rounded-lg" />
          <div className="h-10 bg-gray-100 rounded-lg" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-semibold">Could not load flower waste</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-gray-400">
          <Droplets size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No wasted flowers recorded</p>
          <p className="text-xs mt-1">
            Record damaged stock from the Products page.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
              <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                <TrendingDown size={14} /> Units wasted
              </div>
              <p className="text-xl font-bold text-rose-700 mt-1">
                {formatNumber(totals?.quantity)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-700 font-medium">
                Estimated cost
              </p>
              <p className="text-xl font-bold text-amber-800 mt-1">
                {formatNumber(totals?.cost)} DA
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {data.map((row) => (
              <div key={row.month}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {formatMonth(row.month)}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatNumber(row.totalQuantity)} units
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-rose-400 transition-all duration-500"
                    style={{
                      width: `${Math.max((row.totalQuantity / max) * 100, 2)}%`,
                    }}
                  />
                </div>
                <p className="text-2xs text-gray-400 mt-1">
                  {row.entryCount} record{row.entryCount === 1 ? "" : "s"} ·{" "}
                  {formatNumber(row.totalCost)} DA estimated cost
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
