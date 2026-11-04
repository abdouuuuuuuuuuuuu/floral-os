// How petals are earned is decided in the database: see
// blossom_loyalty_points_per_unit in the 20261103100000 migration.
export const LOYALTY_EARN_RULE = 'Lily 3 petals · rose 2 · chrysanthemum, alstroemeria and other flowers 1'
export function bouquetPetals(lilies, roses, otherFlowers) {
  return 3 * (Number(lilies) || 0) + 2 * (Number(roses) || 0) + (Number(otherFlowers) || 0)
}
/** Petals a customer has earned and kept: leaves out spending, its refunds and manual corrections. */
export function earnedPetals(transactions) {
  return transactions
    .filter((row) => row.transaction_type !== 'redeem' && !/^(Spent petals|Manual correction)/.test(row.note || ''))
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
