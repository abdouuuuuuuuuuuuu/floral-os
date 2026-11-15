// How petals are earned is decided in the database: see
// blossom_loyalty_points_per_unit (20261109110000: only the Flowers category earns).
export const LOYALTY_EARN_RULE = 'Flowers only: lily 3 petals · rose 2 · chrysanthemum, alstroemeria, branches and other flowers 1. Chocolates, gifts and decorations earn none'
export function bouquetPetals(lilies, roses, otherFlowers) {
  return 3 * (Number(lilies) || 0) + 2 * (Number(roses) || 0) + (Number(otherFlowers) || 0)
}
/**
 * Petals a customer has earned and kept. Counts only earnings and their own
 * adjustments ("Earned petals …"). An archived order is left out entirely:
 * its reversal row undoes earned and spent petals together, so counting it
 * would turn spent petals into "earned" ones.
 */
export function earnedPetals(transactions) {
  const archivedOrders = new Set(transactions
    .filter((row) => row.order_id && (row.note || '').startsWith('Petals reversed because the order was archived'))
    .map((row) => row.order_id))
  return transactions
    .filter((row) => !archivedOrders.has(row.order_id))
    .filter((row) => row.transaction_type === 'earn' || (row.note || '').startsWith('Earned petals'))
    .reduce((sum, row) => sum + Number(row.points_delta || 0), 0)
}
export const LOYALTY_REDEMPTION_POINTS = 50
export const LOYALTY_REDEMPTION_DA = 500

export function normalizeRedeemedPoints(points) {
  return Math.floor(Math.max(0, Number(points) || 0) / LOYALTY_REDEMPTION_POINTS) * LOYALTY_REDEMPTION_POINTS
}

export function loyaltyDiscountForPoints(points) {
  return (normalizeRedeemedPoints(points) / LOYALTY_REDEMPTION_POINTS) * LOYALTY_REDEMPTION_DA
}

export function maxRedeemablePoints(balance, orderTotal) {
  const balancePoints = normalizeRedeemedPoints(balance)
  const orderPoints = Math.floor(Math.max(0, Number(orderTotal) || 0) / LOYALTY_REDEMPTION_DA) * LOYALTY_REDEMPTION_POINTS
  return Math.min(balancePoints, orderPoints)
}
