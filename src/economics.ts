/** Hypothetical full fills at an unchanged book; a cost screen, never a forecast. */
export function makerEconomics(x: { buy: number; sell: number; size: number; gasMonPerQuote: number; mid: number; feeBps: number; inferenceUsd: number; bufferUsd: number }) {
  if (!Object.values(x).every(Number.isFinite) || x.buy <= 0 || x.sell <= x.buy || x.size <= 0 || x.mid <= 0 || x.gasMonPerQuote < 0 || x.feeBps < 0 || x.inferenceUsd < 0 || x.bufferUsd < 0) return { eligible: false, grossUsd: 0, costUsd: 0, netUsd: 0 };
  const grossUsd = (x.sell - x.buy) * x.size;
  const costUsd = 2 * x.gasMonPerQuote * x.mid + (x.buy + x.sell) * x.size * x.feeBps / 10000 + x.inferenceUsd;
  const netUsd = grossUsd - costUsd;
  return { eligible: Number.isFinite(netUsd) && netUsd > x.bufferUsd, grossUsd, costUsd, netUsd };
}
