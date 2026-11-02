// src/components/common/FlowerColour.jsx
//
// Colour as data, not decoration.
//
// A florist doesn't think "order 121, 4 line items". They think "the red
// and white one for the Belkacem wedding". Colour is how arrangements are
// identified, discussed, and remembered — and it's the one product
// attribute a general-purpose POS has no reason to model.
//
// Your schema already carries it: products.color, order_items.color, and
// flower_type as a fallback. None of it was ever shown.

// Real flower colours, not web colours. `red` in a shop is a rose red,
// not #FF0000; `green` is foliage. These are picked to read correctly at
// 10px against white.
const PALETTE = {
  red: '#C1272D', crimson: '#A81E28', ruby: '#9B1B30', wine: '#722F37',
  burgundy: '#6E1423', maroon: '#7B2D26', cherry: '#B33A3A',
  pink: '#E88AAE', blush: '#F0C0CB', rose: '#E27396', fuchsia: '#D63A87',
  magenta: '#C42B78', coral: '#F08A75', salmon: '#F1927E', peach: '#F5B896',
  white: '#F7F5F2', ivory: '#F2EBDD', cream: '#F5EBD8', snow: '#FAFAF8',
  yellow: '#EFC94C', gold: '#D4A72C', lemon: '#EBD65A', mustard: '#C9A227',
  amber: '#D99A2B', honey: '#DFAE5A', champagne: '#E8DCC4',
  orange: '#E2803C', tangerine: '#E8833A', rust: '#A6491F', copper: '#A9714B',
  purple: '#7B4B94', violet: '#6F4E9C', lavender: '#B7A3D6', lilac: '#C3AED6',
  mauve: '#B08BA5', plum: '#71375A', indigo: '#4B3F86',
  blue: '#4A72B0', navy: '#2C3E63', sky: '#8FB8DE', turquoise: '#48A9A6',
  aqua: '#7FC8C4', teal: '#3E8E8B',
  green: '#4F7942', sage: '#9CAF88', mint: '#A8D5BA', olive: '#7A8450',
  forest: '#33553D', jade: '#4B8B6F', moss: '#7B8B5A',
  brown: '#8B6F52', chocolate: '#6B4A32', caramel: '#B07C4F', tan: '#C2A278',
  beige: '#D9C7A8', taupe: '#B8A48C', sand: '#DCCBA9',
  black: '#2B2B2B', charcoal: '#3F4045', slate: '#6B7280',
  silver: '#C0C4C9', grey: '#9CA3AF', gray: '#9CA3AF',
}

// Words that describe a mix rather than a colour get a gradient chip, so
// "assorted" doesn't render as an arbitrary single swatch.
const MIXED = new Set(['mixed', 'assorted', 'multicolor', 'rainbow', 'ombre', 'variegated', 'pastel'])

/**
 * Resolves a colour name to a hex value.
 * Handles compound names — "dark red", "baby pink", "hot pink" — by
 * finding the base colour and shifting it.
 */
export function resolveColour(name) {
  if (!name) return null
  const lower = String(name).toLowerCase().trim()

  if (MIXED.has(lower)) return 'mixed'
  if (PALETTE[lower]) return PALETTE[lower]

  // Compound: find any known colour word inside the string.
  const base = Object.keys(PALETTE).find((k) => lower.includes(k))
  if (!base) return null

  const hex = PALETTE[base]
  if (/\b(dark|deep|midnight)\b/.test(lower)) return shade(hex, -0.22)
  if (/\b(light|pale|baby|powder|soft)\b/.test(lower)) return shade(hex, 0.28)
  if (/\b(hot|bright|neon)\b/.test(lower)) return shade(hex, -0.08)
  return hex
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount))))
  )
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('')
}

/** A single swatch. Ringed, because white and ivory vanish otherwise. */
export function Swatch({ colour, size = 10, title }) {
  const hex = resolveColour(colour)
  if (!hex) return null

  const style =
    hex === 'mixed'
      ? { background: 'conic-gradient(#E88AAE, #EFC94C, #4F7942, #7B4B94, #E88AAE)' }
      : { background: hex }

  return (
    <span
      title={title || colour}
      aria-label={colour}
      className="inline-block rounded-full shrink-0 ring-1 ring-black/10"
      style={{ width: size, height: size, ...style }}
    />
  )
}

/**
 * The colour signature of an order — how you recognise it across a bench.
 * Overlapping dots, most-used colour first, like a palette chip.
 */
export function ColourSignature({ items, size = 12, max = 5 }) {
  const counts = new Map()

  for (const item of items || []) {
    const raw = item.color || item.products?.color || item.flower_type
    const hex = resolveColour(raw)
    if (!hex) continue
    counts.set(hex, (counts.get(hex) || 0) + (item.quantity || 1))
  }

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max)
  if (ordered.length === 0) return null

  return (
    <span className="inline-flex items-center" aria-label="Colours in this order">
      {ordered.map(([hex], i) => (
        <span
          key={hex}
          className="inline-block rounded-full ring-2 ring-white shrink-0"
          style={{
            width: size,
            height: size,
            // Overlap so it reads as one object, not a row of dots.
            marginLeft: i === 0 ? 0 : -size * 0.32,
            zIndex: ordered.length - i,
            background:
              hex === 'mixed'
                ? 'conic-gradient(#E88AAE, #EFC94C, #4F7942, #7B4B94, #E88AAE)'
                : hex,
          }}
        />
      ))}
    </span>
  )
}

/** Named chip, for product rows where the word matters too. */
export function ColourChip({ colour }) {
  const hex = resolveColour(colour)
  if (!hex) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-gray-500">
      <Swatch colour={colour} size={9} />
      <span className="capitalize">{colour}</span>
    </span>
  )
}

export default Swatch