/**
 * Reliability statistics for numeric route scores against binary route outcomes.
 * These metrics describe the supplied evaluation set; they do not calibrate or
 * transform the production route score into a probability.
 */
export function measureConfidenceCalibration(observations = [], binCount = 10) {
  const valid = observations.filter((item) => Number.isFinite(item.score) && (typeof item.correct === 'boolean' || Number.isFinite(item.correct)))
    .map(({ score, correct }) => ({ score: Math.max(0, Math.min(1, score)), correct: correct ? 1 : 0 }))
  if (!valid.length) return { sampleCount: 0, brierScore: null, expectedCalibrationError: null, maximumCalibrationError: null, bins: [] }

  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: index / binCount,
    upper: (index + 1) / binCount,
    count: 0,
    scoreSum: 0,
    correctSum: 0,
  }))
  let squaredErrorSum = 0
  for (const observation of valid) {
    const index = Math.min(binCount - 1, Math.floor(observation.score * binCount))
    const bin = bins[index]
    bin.count += 1
    bin.scoreSum += observation.score
    bin.correctSum += observation.correct
    squaredErrorSum += (observation.score - observation.correct) ** 2
  }

  const occupied = bins.filter((bin) => bin.count > 0).map((bin) => {
    const meanScore = bin.scoreSum / bin.count
    const accuracy = bin.correctSum / bin.count
    return {
      lower: Number(bin.lower.toFixed(1)),
      upper: Number(bin.upper.toFixed(1)),
      count: bin.count,
      meanScore: Number(meanScore.toFixed(4)),
      accuracy: Number(accuracy.toFixed(4)),
      gap: Number(Math.abs(meanScore - accuracy).toFixed(4)),
    }
  })
  const expectedCalibrationError = occupied.reduce((sum, bin) => sum + bin.count / valid.length * bin.gap, 0)
  const maximumCalibrationError = Math.max(...occupied.map((bin) => bin.gap))
  return {
    sampleCount: valid.length,
    brierScore: Number((squaredErrorSum / valid.length).toFixed(4)),
    expectedCalibrationError: Number(expectedCalibrationError.toFixed(4)),
    maximumCalibrationError: Number(maximumCalibrationError.toFixed(4)),
    bins: occupied,
  }
}

export function calibrationByGroup(observations = [], getGroup = (item) => item.language || 'unknown') {
  const groups = new Map()
  for (const observation of observations) {
    const group = getGroup(observation)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(observation)
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([group, values]) => [group, measureConfidenceCalibration(values)]))
}
