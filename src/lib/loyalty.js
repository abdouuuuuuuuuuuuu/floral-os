export const LOYALTY_EARN_DA_PER_POINT = 100
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
