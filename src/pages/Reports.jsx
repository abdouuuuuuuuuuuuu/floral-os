import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useId,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  DollarSign,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  RefreshCw,
  Package,
  PieChart,
  Activity,
  CreditCard,
  Store,
  Bike,
  Truck,
  FileText,
  Layers,
  X,
  ChevronRight,
  Search,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useReports } from "../hooks/useReports";
import { useNotification } from "../context/NotificationContext";
import { addCalendarDays, localDate } from "../lib/assistant/dataAccess";
import { useFlowerWasteReport } from "../hooks/useFlowerWaste";
import MonthlyFlowerWasteCard from "../components/reports/MonthlyFlowerWasteCard";

// ─── COLOR SYSTEM ──────────────────────────────────────────────────
const CHART_COLORS = [
	"var(--report-series-1)",
	"var(--report-series-2)",
	"var(--report-series-3)",
	"var(--report-series-4)",
	"var(--report-series-5)",
	"var(--report-series-6)",
];
const STATUS_COLORS = {
  new: "#EF4444",
  processing: "#F59E0B",
  done: "#10B981",
  cancelled: "#9CA3AF",
  pending: "#6366F1",
};
const SOURCE_COLORS = {
  instagram: "#E4405F",
  whatsapp: "#25D366",
  phone: "#3B82F6",
  facebook: "#1877F2",
  inhouse: "#6B7280",
  website: "#8B5CF6",
};
const PAYMENT_COLORS = {
  cash: "#10B981",
  baridimob: "#8B5CF6",
  usd: "#F59E0B",
  card: "#3B82F6",
  transfer: "#F97316",
};

// ─── UTILITY: Format Currency ──────────────────────────────────────
const formatDA = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return "0 DA";
  return `${Math.round(amount).toLocaleString("fr-FR")} DA`;
};

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return num.toLocaleString("fr-FR");
};

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch {
    return dateStr;
  }
};


// ─── STAT CARD ─────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  subtitle,
  change,
  icon: Icon,
  color,
  onClick,
  loading,
}) {
  const isPositive = change >= 0;
  const colorMap = {
    primary: {
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/20",
    },
    teal: { bg: "bg-teal/10", text: "text-teal", border: "border-teal/20" },
    accent: {
      bg: "bg-accent/10",
      text: "text-accent",
      border: "border-accent/20",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-600",
      border: "border-amber-200",
    },
    red: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      className={`group bg-white rounded-2xl border border-sage-dark/70 p-4 sm:p-5 transition-all duration-200 hover:shadow-md hover:border-accent/40 ${onClick ? "cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div
          className={`w-11 h-11 ${c.bg} rounded-xl flex items-center justify-center border ${c.border}`}
        >
          <Icon size={20} className={c.text} />
        </div>
        {change !== undefined && change !== null && !isNaN(change) && (
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-semibold ${isPositive ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}
          >
            {isPositive ? (
              <ArrowUpRight size={11} />
            ) : (
              <ArrowDownRight size={11} />
            )}
            {isPositive ? "+" : ""}
            {parseFloat(change).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
        {loading ? "..." : value}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        {onClick && <ArrowUpRight size={14} className="text-gray-300 transition-colors group-hover:text-accent" />}
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// ─── BAR CHART (SVG) ───────────────────────────────────────────────
// Round tick steps: 1, 2, 2.5, 5 x 10^n. The previous version rounded to
// half an order of magnitude, so a 104k peak produced a 150k axis with
// ticks at 113k and 38k — a third of the chart empty and no number anyone
// thinks in.
function niceScale(peak, tickCount = 5) {
  if (!peak || peak <= 0) return { max: 1, step: 1 };
  const rough = peak / tickCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) *
    mag;
  return { max: Math.ceil(peak / step) * step, step };
}

// Catmull-Rom through the points, converted to cubic beziers. A polyline
// between 15 daily figures reads as a jagged sawtooth; a curve reads as a
// trend, which is what the chart is for.
function smoothPath(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2)
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    // Tension kept low so the curve stays close to the data and doesn't
    // invent peaks that aren't there.
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;

    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function BarChart({ data, xKey, yKey, color, title, subtitle, emptyMessage }) {
  const [hover, setHover] = useState(null);

  const empty = (msg, sub) => (
    <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          )}
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <BarChart3 size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">{msg}</p>
        <p className="text-xs text-gray-300 mt-1">{sub}</p>
      </div>
    </div>
  );

  if (!data || data.length === 0) {
    return empty(
      emptyMessage || "No data available",
      "Data will appear once orders are recorded",
    );
  }

  const values = data.map((d) => Number(d[yKey]) || 0);
  if (!values.some((v) => v > 0)) {
    return empty(
      "No revenue recorded",
      "Orders in this period have no revenue data",
    );
  }

  const peak = Math.max(...values);
  const { max, step } = niceScale(peak, 4);

  const yTicks = [];
  for (let v = 0; v <= max + 0.0001; v += step) yTicks.push(v);

  const total = values.reduce((a, b) => a + b, 0);
  const barColor = color || "var(--report-series-2)";

  const compact = (v) =>
    v >= 1000000
      ? (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + "M"
      : v >= 1000
        ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k"
        : String(Math.round(v));

  const TRACK = 220;

  return (
    <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between mb-5">
        <div>
          {title && (
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          )}
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">
            Total
          </p>
          <p className="text-sm font-semibold text-gray-800">
            {formatDA(total)}
          </p>
        </div>
      </div>

      <div className="flex">
        {/* Y axis */}
        <div
          className="relative shrink-0 pr-3"
          style={{ height: TRACK, width: 46 }}
          aria-hidden="true"
        >
          {yTicks.map((v, i) => (
            <span
              key={i}
              className="absolute right-3 text-2xs text-gray-400 font-medium"
              style={{
                bottom: `${(v / max) * 100}%`,
                transform: "translateY(50%)",
              }}
            >
              {compact(v)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {/* Bar track. The height lives HERE and each bar column gets
              h-full, so the bars' percentage heights have a definite
              parent to resolve against. Previously the % was set on a
              child of an auto-height flex column, so every bar computed
              to zero and fell back to its 3px minimum — which is why they
              rendered as slivers. */}
          <div className="relative" style={{ height: TRACK }}>
            {/* Gridlines */}
            {yTicks.map((v, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t"
                style={{
                  bottom: `${(v / max) * 100}%`,
                  borderColor: v === 0 ? "var(--report-grid-strong)" : "var(--report-grid)",
                }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-1.5">
              {data.map((d, i) => {
                const val = Number(d[yKey]) || 0;
                const pct = (val / max) * 100;
                const isEmpty = val === 0;
                const active = hover === i;

                return (
                  <div
                    key={i}
                    className="flex-1 h-full flex flex-col justify-end min-w-[10px]"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className="w-full rounded-t transition-all duration-200"
                      style={{
                        height: isEmpty ? "2px" : `${Math.max(pct, 1)}%`,
                        backgroundColor: isEmpty
                          ? "var(--report-empty-bar)"
                          : active
                            ? barColor
                            : `color-mix(in srgb, ${barColor} 86%, transparent)`,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Tooltip */}
            {hover !== null && (Number(data[hover][yKey]) || 0) > 0 && (
              <div
                className="absolute pointer-events-none bg-gray-900 text-white rounded-lg px-2.5 py-1.5 shadow-xl z-10"
                style={{
                  left: `${((hover + 0.5) / data.length) * 100}%`,
                  bottom: `${((Number(data[hover][yKey]) || 0) / max) * 100}%`,
                  transform: "translate(-50%, -8px)",
                  whiteSpace: "nowrap",
                }}
              >
                <p className="text-2xs text-white/60 font-medium">
                  {formatDate(data[hover][xKey])}
                </p>
                <p className="text-xs font-semibold">
                  {formatDA(data[hover][yKey])}
                </p>
                {data[hover].orders != null && (
                  <p className="text-2xs text-white/60">
                    {data[hover].orders} orders
                  </p>
                )}
              </div>
            )}
          </div>

          {/* X labels, in their own row so they can't stretch the track.
              Every other label when the bars get tight. */}
          <div className="flex gap-1.5 mt-2">
            {data.map((d, i) => {
              const skip = data.length > 16 && i % 2 !== 0;
              return (
                <span
                  key={i}
                  className={`flex-1 min-w-[10px] text-2xs font-medium text-center truncate ${
                    hover === i ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {skip ? "" : formatDate(d[xKey])}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  colors,
  title,
  subtitle,
  formatValue,
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && (
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <BarChart3 size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No data available</p>
        </div>
      </div>
    );
  }

  const values = data.map((d) => d[valueKey] || 0);
  const max = Math.max(...values) || 1;

  return (
    <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-5">
          {title && (
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          )}
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {data.map((d, i) => {
          const val = d[valueKey] || 0;
          const pct = max > 0 ? (val / max) * 100 : 0;
          const label = d[labelKey];
          const displayValue = formatValue
            ? formatValue(val)
            : formatNumber(val);

          return (
            <div key={i} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700 truncate flex-1 capitalize">
                  {label}
                </span>
                <span className="text-sm font-semibold text-gray-900 ml-3">
                  {displayValue}
                </span>
              </div>
              <div className="w-full h-2.5 bg-sage rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out group-hover:opacity-80"
                  style={{
                    width: `${Math.max(pct, val > 0 ? 1 : 0)}%`,
                    backgroundColor:
                      colors?.[i] || CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DONUT CHART (SVG) ───────────────────────────────────────────
function DonutChart({ data, labelKey, valueKey, colors, title, subtitle }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && (
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <PieChart size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No data available</p>
        </div>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0) || 1;
  let cumulative = 0;

  return (
    <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-5">
          {title && (
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          )}
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative w-40 h-40 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            {data.map((d, i) => {
              const val = d[valueKey] || 0;
              const pct = val / total;
              if (pct === 0) return null;
              const dashArray = `${pct * 100} ${100 - pct * 100}`;
              const dashOffset = -cumulative * 100;
              cumulative += pct;
              return (
                <circle
                  key={i}
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke={colors?.[i] || CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth="3.5"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              );
            })}
            <circle cx="18" cy="18" r="15.9" fill="var(--color-cream)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-gray-900">
              {formatNumber(total)}
            </span>
            <span className="text-2xs text-gray-400 font-semibold uppercase tracking-wider">
              Total
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-3 min-w-[140px]">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    colors?.[i] || CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <span className="text-sm text-gray-600 flex-1 capitalize">
                {d[labelKey]}
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {d[valueKey]}
              </span>
              <span className="text-xs text-gray-400 w-10 text-right">
                {Math.round((d[valueKey] / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LINE CHART (SVG) ────────────────────────────────────────────
function LineChart({ data, xKey, yKey, color = "var(--report-series-2)", title, subtitle }) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && (
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Activity size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">No revenue data</p>
          <p className="text-xs text-gray-300 mt-1">
            Start recording orders to see trends
          </p>
        </div>
      </div>
    );
  }

  const W = 960;
  const H = 320;
  const pad = { top: 16, right: 20, bottom: 40, left: 58 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const values = data.map((d) => Number(d[yKey]) || 0);
  const peak = Math.max(...values, 0);
  const { max, step } = niceScale(peak);

  const getX = (i) =>
    pad.left +
    (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const getY = (v) => pad.top + plotH - ((Number(v) || 0) / max) * plotH;

  const pts = data.map((d, i) => ({ x: getX(i), y: getY(d[yKey]) }));
  const linePath = smoothPath(pts);
  const areaPath =
    `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${pad.top + plotH} ` +
    `L ${pts[0].x.toFixed(1)} ${pad.top + plotH} Z`;

  const yTicks = [];
  for (let v = 0; v <= max + 0.0001; v += step) yTicks.push(v);

  // Enough room per label that they can't collide.
  const maxLabels = Math.max(2, Math.floor(plotW / 110));
  const labelStep = Math.max(1, Math.ceil((data.length - 1) / maxLabels));
  const xTicks = [];
  for (let i = 0; i < data.length; i += labelStep) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== data.length - 1)
    xTicks.push(data.length - 1);

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const total = values.reduce((a, b) => a + b, 0);

  const compact = (v) =>
    v >= 1000000
      ? (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + "M"
      : v >= 1000
        ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k"
        : String(Math.round(v));

  return (
    <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between mb-5">
        <div>
          {title && (
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          )}
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">
              Total
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {formatDA(Math.round(total))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">
              Daily avg
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {formatDA(Math.round(avg))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">
              Best day
            </p>
            <p className="text-sm font-semibold" style={{ color }}>
              {formatDA(peak)}
            </p>
          </div>
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 320 }}
          preserveAspectRatio="none"
          role="img"
          aria-label={title || "Revenue trend"}
        >
          <defs>
            <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="60%" stopColor={color} stopOpacity="0.08" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((v, i) => {
            const y = getY(v);
            return (
              <g key={`y-${i}`}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke={v === 0 ? "var(--report-grid-strong)" : "var(--report-grid)"}
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--report-axis)"
                  fontWeight="500"
                >
                  {compact(v)}
                </text>
              </g>
            );
          })}

          {/* Faint verticals at the labelled points, so the eye can drop
              from a peak to its date. */}
          {xTicks.map((i) => (
            <line
              key={`v-${i}`}
              x1={getX(i)}
              y1={pad.top}
              x2={getX(i)}
              y2={pad.top + plotH}
              stroke="var(--report-grid-minor)"
              strokeWidth="1"
            />
          ))}

          <line
            x1={pad.left}
            y1={getY(avg)}
            x2={W - pad.right}
            y2={getY(avg)}
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="5 5"
            opacity="0.3"
          />

          <path d={areaPath} fill={`url(#grad-${uid})`} />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {xTicks.map((i) => (
            <text
              key={`x-${i}`}
              x={getX(i)}
              y={H - 12}
              textAnchor={
                i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
              }
              fontSize="11"
              fill="var(--report-axis)"
              fontWeight="500"
            >
              {formatDate(data[i]?.[xKey])}
            </text>
          ))}

          {data.map((d, i) => {
            const bandW = data.length > 1 ? plotW / (data.length - 1) : plotW;
            return (
              <rect
                key={`hit-${i}`}
                x={getX(i) - bandW / 2}
                y={pad.top}
                width={bandW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {hover !== null && (
            <>
              <line
                x1={getX(hover)}
                y1={pad.top}
                x2={getX(hover)}
                y2={pad.top + plotH}
                stroke={color}
                strokeWidth="1.5"
                opacity="0.35"
                style={{ pointerEvents: "none" }}
              />
              <circle
                cx={getX(hover)}
                cy={getY(data[hover][yKey])}
                r="6"
                fill="var(--color-cream)"
                stroke={color}
                strokeWidth="3"
                style={{ pointerEvents: "none" }}
              />
            </>
          )}

          {/* Only mark the peak. A dot on all 15 points is visual noise;
              the hover crosshair covers the rest. */}
          {(() => {
            const peakIdx = values.indexOf(peak);
            if (peakIdx < 0 || hover === peakIdx) return null;
            return (
              <circle
                cx={getX(peakIdx)}
                cy={getY(peak)}
                r="4"
                fill={color}
                style={{ pointerEvents: "none" }}
              />
            );
          })()}
        </svg>

        {hover !== null && (
          <div
            className="absolute pointer-events-none bg-gray-900 text-white rounded-lg px-3 py-2 shadow-xl"
            style={{
              left: `${(getX(hover) / W) * 100}%`,
              top: `${(getY(data[hover][yKey]) / H) * 100}%`,
              transform: `translate(${
                hover < data.length / 2 ? "-10%" : "-90%"
              }, calc(-100% - 14px))`,
              whiteSpace: "nowrap",
            }}
          >
            <p className="text-2xs text-white/60 font-medium">
              {formatDate(data[hover][xKey])}
            </p>
            <p className="text-sm font-semibold">
              {formatDA(data[hover][yKey])}
            </p>
            {data[hover].orders != null && (
              <p className="text-2xs text-white/60">
                {data[hover].orders} orders
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopProductCard({ product, index, onClick }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-sage-dark/70 hover:shadow-md transition-all duration-200 group cursor-pointer hover:border-accent/40 active:scale-[0.99]"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-semibold flex-shrink-0 transition-colors ${index < 3 ? "bg-primary text-white shadow-sm" : "bg-sage text-gray-600 group-hover:bg-accent/10"}`}
      >
        {index < 3 ? medals[index] : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">
          {product.name || "Unknown Product"}
        </p>
        <p className="text-xs text-gray-400">
          {formatNumber(product.quantity || 0)} units sold
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-primary text-sm">
          {formatDA(product.revenue)}
        </p>
        <p className="text-2xs text-gray-400">revenue</p>
      </div>
    </div>
  );
}

// ─── DELIVERY METHOD CARD ──────────────────────────────────────────
function DeliveryMethodCard({ method, count, total, icon: Icon, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-all duration-200 hover:border-gray-300">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900 capitalize">
          {method || "Unknown"}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-2 bg-sage rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-500 min-w-[20px] text-right">
            {count}
          </span>
        </div>
      </div>
      <span
        className="text-sm font-semibold min-w-[36px] text-right"
        style={{ color }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ─── EXPORT MODAL ─────────────────────────────────────────────────
function ExportModal({ isOpen, onClose, onExport }) {
  const [format, setFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setExporting(true);
    await onExport(format);
    setExporting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 scrim-enter">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 sheet-enter">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Export Report</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <p className="text-sm text-gray-500 mb-3">Choose export format:</p>
          {[
            {
              id: "csv",
              label: "CSV Spreadsheet",
              desc: "Compatible with Excel, Google Sheets",
              icon: FileText,
            },
            {
              id: "json",
              label: "JSON Data",
              desc: "Raw data for developers",
              icon: Layers,
            },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFormat(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${format === opt.id ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}
            >
              <opt.icon
                size={20}
                className={format === opt.id ? "text-primary" : "text-gray-400"}
              />
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">
                  {opt.label}
                </p>
                <p className="text-xs text-gray-400">{opt.desc}</p>
              </div>
              {format === opt.id && (
                <CheckCircle2 size={18} className="text-primary ml-auto" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download size={16} />
            {exporting ? "Exporting..." : `Export as ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN REPORTS PAGE ─────────────────────────────────────────────
function Reports() {
  const {
    dailyRevenue,
    weeklyRevenue,
    monthlyRevenue,
    topProducts,
    orderStatusBreakdown,
    totalStats,
    sourceBreakdown,
    paymentBreakdown,
    deliveryBreakdown,
    loading,
    error,
    refresh,
  } = useReports();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const {
    monthlyWaste,
    totals: wasteTotals,
    loading: wasteLoading,
    error: wasteError,
    refresh: refreshWaste,
  } = useFlowerWasteReport({ months: 12 });

  const [activeTab, setActiveTab] = useState("overview");

  // The highlight should reflect where you ARE, not where you last
  // clicked. Without this the nav lies the moment you scroll by hand.
  useEffect(() => {
    const ids = ["overview", "revenue", "products", "customers"];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setActiveTab(visible.target.id.replace("sec-", ""));
      },
      // Top third of the viewport: a section counts as "current" once
      // its heading reaches the upper area, which is where the eye is.
      { rootMargin: "-80px 0px -66% 0px" },
    );

    ids.forEach((id) => {
      const el = document.getElementById(`sec-${id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);
  const [dateRange, setDateRange] = useState("30d");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ─── FILTER DATA BY DATE RANGE ──────────────────────────────────
  const filteredData = useMemo(() => {
    const today = localDate();
    const daysBack = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;
    const cutoffStr = dateRange === "all"
      ? null
      : addCalendarDays(today, -(daysBack - 1));

    return {
      dailyRevenue:
        dateRange === "all"
          ? dailyRevenue
          : dailyRevenue.filter((d) => d.date >= cutoffStr && d.date <= today),
      weeklyRevenue:
        dateRange === "all"
          ? weeklyRevenue
          : weeklyRevenue.filter((w) => w.week >= cutoffStr && w.week <= today),
      monthlyRevenue:
        dateRange === "all"
          ? monthlyRevenue
          : monthlyRevenue.filter((m) => m.month >= cutoffStr.slice(0, 7) && m.month <= today.slice(0, 7)),
      topProducts: topProducts.filter(
        (p) =>
          !searchQuery ||
          p.name?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
      orderStatusBreakdown,
      sourceBreakdown,
      paymentBreakdown,
      deliveryBreakdown,
      totalStats,
    };
  }, [
    dailyRevenue,
    weeklyRevenue,
    monthlyRevenue,
    topProducts,
    orderStatusBreakdown,
    sourceBreakdown,
    paymentBreakdown,
    deliveryBreakdown,
    totalStats,
    dateRange,
    searchQuery,
  ]);

  // ─── COMPUTED STATS ─────────────────────────────────────────────
  const computedStats = useMemo(() => {
    const today = localDate();
    const yesterday = addCalendarDays(today, -1);
    const todayRev = dailyRevenue.find((d) => d.date === today)?.amount || 0;
    const yesterdayRev =
      dailyRevenue.find((d) => d.date === yesterday)?.amount || 0;
    const revChange =
      yesterdayRev > 0 ? ((todayRev - yesterdayRev) / yesterdayRev) * 100 : 0;

    const last7Start = addCalendarDays(today, -6);
    const previous7Start = addCalendarDays(today, -13);
    const last7 = dailyRevenue.filter((day) => day.date >= last7Start && day.date <= today);
    const last7Rev = last7.reduce((s, d) => s + (d.amount || 0), 0);
    const prev7 = dailyRevenue.filter((day) => day.date >= previous7Start && day.date < last7Start);
    const prev7Rev = prev7.reduce((s, d) => s + (d.amount || 0), 0);
    const weekChange =
      prev7Rev > 0 ? ((last7Rev - prev7Rev) / prev7Rev) * 100 : 0;

    return { todayRev, revChange, last7Rev, weekChange };
  }, [dailyRevenue]);

  // ─── HANDLE REFRESH ─────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refresh(), refreshWaste()]);
      addNotification("Data refreshed successfully", "success");
    } catch {
      addNotification("Failed to refresh data", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh, refreshWaste, addNotification]);

  // ─── HANDLE EXPORT ──────────────────────────────────────────────
  const handleExport = useCallback(
    async (format) => {
      try {
        let content, filename, mimeType;

        if (format === "csv") {
          // Build CSV from all data
          const rows = [
            ["Report Export", new Date().toLocaleString("fr-FR")],
            [],
            ["DAILY REVENUE"],
            ["Date", "Amount (DA)"],
            ...filteredData.dailyRevenue.map((d) => [d.date, d.amount]),
            [],
            ["TOP PRODUCTS"],
            ["Name", "Quantity Sold", "Revenue (DA)"],
            ...filteredData.topProducts.map((p) => [
              p.name,
              p.quantity,
              p.revenue,
            ]),
            [],
            ["ORDER STATUS BREAKDOWN"],
            ["Status", "Count"],
            ...filteredData.orderStatusBreakdown.map((s) => [
              s.status,
              s.count,
            ]),
            [],
            ["SUMMARY"],
            ["Total Revenue", totalStats.totalRevenue],
            ["Total Orders", totalStats.totalOrders],
            ["Average Order Value", totalStats.avgOrderValue],
            ["Total Customers", totalStats.totalCustomers],
          ];
          content = rows
            .map((r) => r.map((c) => `"${c}"`).join(","))
            .join("\n");
          filename = `report_${new Date().toISOString().split("T")[0]}.csv`;
          mimeType = "text/csv;charset=utf-8;";
        } else {
          content = JSON.stringify(
            {
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
              monthlyFlowerWaste: monthlyWaste,
              flowerWasteTotals: wasteTotals,
            },
            null,
            2,
          );
          filename = `report_${new Date().toISOString().split("T")[0]}.json`;
          mimeType = "application/json";
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        addNotification(
          `Report exported as ${format.toUpperCase()}`,
          "success",
        );
      } catch (err) {
        console.error("Export error:", err);
        addNotification("Export failed. Please try again.", "error");
      }
    },
    [
      filteredData,
      totalStats,
      dateRange,
      monthlyWaste,
      wasteTotals,
      addNotification,
    ],
  );

  // ─── TAB CONFIGURATION ──────────────────────────────────────────
  const tabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "revenue", label: "Revenue", icon: DollarSign },
    { id: "products", label: "Products", icon: Package },
    { id: "customers", label: "Customers", icon: Users },
  ];

  // ─── RENDER: ERROR STATE ────────────────────────────────────────
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Failed to load reports
            </h2>
            <p className="text-sm text-gray-500 max-w-md">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            <RefreshCw
              size={16}
              className={isRefreshing ? "animate-spin" : ""}
            />
            Try Again
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // ─── RENDER: LOADING STATE ──────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-48 bg-sage rounded-lg" />
              <div className="h-4 w-64 bg-sage/60 rounded mt-2" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-32 bg-sage rounded-xl" />
              <div className="h-10 w-24 bg-sage rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-sage/70 rounded-2xl" />
            ))}
          </div>
          <div className="h-80 bg-sage/70 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6 sm:space-y-7">
        {/* Report heading and shared controls */}
        <section className="rounded-2xl border border-sage-dark/70 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Business intelligence</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Reports</h1>
              <p className="mt-1 text-sm text-gray-500">Understand sales, products, and customer patterns at a glance.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Calendar size={13} /> Reporting period</p>
                <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-sage-dark/70 bg-sage/60 p-1 sm:w-auto">
              {["7d", "30d", "90d", "all"].map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  aria-pressed={dateRange === range}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${dateRange === range ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-white"}`}
                >
                  {range === "all"
                    ? "All Time"
                    : range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days"}
                </button>
              ))}
            </div>
              </div>

              <div className="flex items-center gap-2 sm:pt-5">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh reports"
                  title="Refresh reports"
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-sage-dark/70 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-sage disabled:opacity-50"
                >
                  <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">{isRefreshing ? "Refreshing" : "Refresh"}</span>
                </button>

                <button
                  onClick={() => setExportModalOpen(true)}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
                >
                  <Download size={15} /> Export
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* KPI Cards */}
        <section aria-label="Key performance indicators">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Business at a glance</h2>
              <p className="text-xs text-gray-500">Key figures with quick links to the related report.</p>
            </div>
          </div>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Total Revenue"
            value={formatDA(totalStats.totalRevenue)}
            subtitle="All-time order revenue · not cash collected"
            icon={DollarSign}
            color="primary"
            onClick={() => {
              setActiveTab("revenue");
              document
                .getElementById("sec-revenue")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <StatCard
            title="Total Orders"
            value={formatNumber(totalStats.totalOrders)}
            subtitle={`Avg: ${formatDA(totalStats.avgOrderValue)}`}
            icon={ShoppingBag}
            color="teal"
            onClick={() => {
              setActiveTab("overview");
              document
                .getElementById("sec-overview")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <StatCard
            title="Today's Order Revenue"
            value={formatDA(computedStats.todayRev)}
            subtitle="Not the same as cash collected · vs yesterday"
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
        </section>

        {/* Jump nav, not tabs.
            Sticky, so it stays available as you scroll — the whole point
            of one page is comparing sections, and losing the nav after
            the first screen would undo that. */}
        <nav aria-label="Report sections" className="sticky top-[72px] z-10 flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-sage-dark/70 bg-white/95 p-1 shadow-sm backdrop-blur-sm">
          {tabs.map((tab) => {
            const TIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  document
                    .getElementById(`sec-${tab.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                aria-current={activeTab === tab.id ? "location" : undefined}
                className={`flex shrink-0 items-center gap-2 px-3 sm:px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${activeTab === tab.id ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-sage"}`}
              >
                <TIcon size={15} /> {tab.label}
              </button>
            );
          })}
        </nav>

        {/* ── OVERVIEW TAB ── */}
        <div id="sec-overview" className="scroll-mt-24" aria-hidden="true" />
        {
          <div className="space-y-5">
            {/* Revenue Trend Line Chart */}
            <LineChart
              data={filteredData.dailyRevenue}
              xKey="date"
              yKey="amount"
              title="Revenue Trend"
              subtitle="Daily revenue over the selected period"
            />

            <MonthlyFlowerWasteCard
              data={monthlyWaste}
              totals={wasteTotals}
              loading={wasteLoading}
              error={wasteError}
              onRefresh={refreshWaste}
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
            <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Top Products
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Best performing products by revenue
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab("products");
                    document
                      .getElementById("sec-products")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
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
                    onClick={() =>
                      navigate(
                        `/products?search=${encodeURIComponent(p.name || "")}`,
                      )
                    }
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
        }

        {/* ── REVENUE TAB ── */}
        <div id="sec-revenue" className="scroll-mt-24" aria-hidden="true" />
        {
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <BarChart
                data={filteredData.dailyRevenue.slice(-14)}
                xKey="date"
                yKey="amount"
              color="var(--report-series-2)"
                title="Daily Revenue"
                subtitle="Revenue per day (last 14 days)"
              />
              <BarChart
                data={filteredData.weeklyRevenue}
                xKey="week"
                yKey="amount"
                color="var(--report-series-3)"
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

            <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                Payment Methods
              </h2>
              <p className="text-xs text-gray-400 mb-5">
                Revenue by payment type
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredData.paymentBreakdown.map((p, i) => {
                  const color = Object.values(PAYMENT_COLORS)[i] || "#6B7280";
                  return (
                    <div
                      key={p.method || i}
                      className="bg-sage/50 rounded-xl p-4 sm:p-5 text-center hover:bg-accent/5 transition-colors border border-sage-dark/50"
                    >
                      <div
                        className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        <DollarSign size={22} style={{ color }} />
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatDA(p.amount)}
                      </p>
                      <p className="text-sm text-gray-500 capitalize mt-1">
                        {p.method || "Unknown"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {p.count || 0} orders
                      </p>
                    </div>
                  );
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
        }

        {/* ── PRODUCTS TAB ── */}
        <div id="sec-products" className="scroll-mt-24" aria-hidden="true" />
        {
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
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                Top Selling Products
              </h2>
              <p className="text-xs text-gray-400 mb-5">
                Ranked by quantity sold and revenue
              </p>
              <div className="space-y-3">
                {filteredData.topProducts.map((p, i) => (
                  <TopProductCard
                    key={p.name || i}
                    product={p}
                    index={i}
                    onClick={() =>
                      navigate(
                        `/products?search=${encodeURIComponent(p.name || "")}`,
                      )
                    }
                  />
                ))}
                {filteredData.topProducts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Package size={40} className="mb-3 opacity-40" />
                    <p className="text-sm font-medium">
                      {searchQuery
                        ? `No products matching "${searchQuery}"`
                        : "No product data available"}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {searchQuery
                        ? "Try a different search term"
                        : "Start recording orders to see product performance"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        }

        {/* ── CUSTOMERS TAB ── */}
        <div id="sec-customers" className="scroll-mt-24" aria-hidden="true" />
        {
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

              <div className="bg-white rounded-2xl border border-sage-dark/70 p-5 sm:p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  Delivery Methods
                </h2>
                <p className="text-xs text-gray-400 mb-5">
                  How orders are fulfilled
                </p>
                <div className="space-y-3">
                  {filteredData.deliveryBreakdown.map((d) => {
                    const icons = {
                      motorcycle: Bike,
                      dhd: Truck,
                      pickup: Store,
                      delivery: Truck,
                    };
                    const colors = {
                      motorcycle: "#3B82F6",
                      dhd: "#8B5CF6",
                      pickup: "#10B981",
                      delivery: "#F97316",
                    };
                    const Icon = icons[d.method] || Store;
                    const totalDeliveries =
                      filteredData.deliveryBreakdown.reduce(
                        (s, x) => s + (x.count || 0),
                        0,
                      );
                    return (
                      <DeliveryMethodCard
                        key={d.method}
                        method={d.method}
                        count={d.count}
                        total={totalDeliveries}
                        icon={Icon}
                        color={colors[d.method] || "#6B7280"}
                      />
                    );
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
        }
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        data={filteredData}
        onExport={handleExport}
      />
    </DashboardLayout>
  );
}

export default Reports;
