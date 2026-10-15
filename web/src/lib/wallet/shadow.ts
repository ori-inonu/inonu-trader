import type { PortfolioAction, PortfolioAnswer } from "../inonu/portfolio";
import type { BalanceRow } from "./holdings";

/** Local analytical marks only. No account, wallet, storage, signer or order client. */
export interface ShadowMark {
  readonly id: string;
  readonly chainIndex: string;
  readonly contract: string;
  readonly symbol: string;
  readonly action: PortfolioAction;
  readonly atMs: number;
  readonly priceUsd: number | null;
  readonly exposureUsd: number | null;
}
export interface ShadowCost {
  readonly outputUnitVerified: boolean;
  /** Includes route loss/taxes/impact once, never a second impact subtraction. */
  readonly executionDragUsd: number | null;
  /** Route network fee in USD; native gas is not added again. */
  readonly networkFeeUsd: number | null;
}
const positive = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;
const same = (chain: string, a: string, b: string) => chain === "501" ? a === b : a.toLowerCase() === b.toLowerCase();

export function reconcileValue(rows: readonly BalanceRow[], total: number, providerUsd: number | null) {
  const knownUsd = rows.reduce((sum, r) => sum + (r.valueUsd !== null && Number.isFinite(r.valueUsd) && r.valueUsd >= 0 ? r.valueUsd : 0), 0);
  return { knownUsd, unpriced: rows.filter(r => r.valueUsd === null).length, omitted: Math.max(0, total - rows.length), providerUsd, differenceUsd: providerUsd === null ? null : providerUsd - knownUsd };
}

export function markShadow(plan: PortfolioAnswer, dollars: number, nowMs: number): readonly ShadowMark[] {
  if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 1_000_000 || !Number.isSafeInteger(nowMs) || nowMs < plan.observedAtMs) return [];
  return plan.assets.map(asset => {
    const m = asset.evidence.market;
    const priceUsd = m && !m.stale && m.ageMs !== null && m.ageMs >= 0 && m.ageMs + nowMs - plan.observedAtMs <= 60_000 && positive(m.priceUsd) ? m.priceUsd : null;
    const held = asset.balance === null ? null : Number(asset.balance);
    const exposureUsd = asset.action === "sell" ? priceUsd !== null && held !== null && positive(held) ? Math.min(dollars, held * priceUsd) : null : dollars;
    return { id: asset.candidateId, chainIndex: plan.chainIndex, contract: asset.contract, symbol: asset.symbol, action: asset.action, atMs: nowMs, priceUsd, exposureUsd };
  });
}

/** BUY comparator keeps the same USD cash; SELL comparator keeps the same token units. */
export function compareShadow(mark: ShadowMark, rows: readonly BalanceRow[], receivedAtMs: number, ageMs: number, nowMs: number, cost: ShadowCost | null, cachedAtMs: number | null) {
  // Transport may increase receipt time, never the time of the cached observation.
  const observed = cachedAtMs === null ? NaN : Math.min(cachedAtMs, receivedAtMs - Math.max(0, ageMs));
  const row = rows.find(r => r.chainIndex === mark.chainIndex && same(mark.chainIndex, r.tokenAddress ?? "native", mark.contract));
  const fresh = cachedAtMs !== null && Number.isFinite(cachedAtMs) && cachedAtMs >= 0 && Number.isFinite(receivedAtMs) && receivedAtMs >= cachedAtMs && Number.isFinite(nowMs) && nowMs >= receivedAtMs
    && Number.isFinite(observed) && Number.isFinite(ageMs) && ageMs >= 0 && nowMs - observed <= 60_000 && observed > mark.atMs;
  if (mark.action === "abstain") return { grossVsHoldUsd: null, netVsHoldUsd: null };
  if (!fresh || !row || !positive(row.priceUsd) || !positive(mark.priceUsd) || !positive(mark.exposureUsd)) return { grossVsHoldUsd: null, netVsHoldUsd: null };
  if (mark.action === "hold") return { grossVsHoldUsd: 0, netVsHoldUsd: 0 };
  const grossVsHoldUsd = mark.exposureUsd * (row.priceUsd / mark.priceUsd - 1) * (mark.action === "sell" ? -1 : 1);
  const qualified = cost?.outputUnitVerified && cost.executionDragUsd !== null && Number.isFinite(cost.executionDragUsd) && cost.networkFeeUsd !== null && Number.isFinite(cost.networkFeeUsd) && cost.networkFeeUsd >= 0;
  return { grossVsHoldUsd, netVsHoldUsd: qualified ? grossVsHoldUsd - cost!.executionDragUsd! - cost!.networkFeeUsd! : null };
}
