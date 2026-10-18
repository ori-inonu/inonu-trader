import { EVM_CHAINS } from "../evm-multichain";
import { SOLANA_TOKENS } from "../okx-solana";
import { toMinorUnits } from "./ladder";
import type { QuoteParams, QuoteResult } from "./quote";
import type { ShadowCost, ShadowMark } from "./shadow";

interface Freshness { readonly ageMs: number; readonly stale: boolean; readonly cachedAtMs: number }
interface Metadata { readonly chainIndex: string | null; readonly address: string; readonly decimals: number | null }
interface Dependencies {
  search(chainIndex: string, contract: string): Promise<{ readonly data: readonly Metadata[]; readonly meta: Freshness }>;
  quote(params: QuoteParams, signal?: AbortSignal): Promise<QuoteResult>;
}
export interface ShadowQuoteCost {
  readonly markId: string;
  readonly cost: ShadowCost;
  readonly note: string;
  readonly impactPct: number | null;
  readonly atMs: number;
}
const fresh = (meta: Freshness, now: number) => !meta.stale && meta.ageMs >= 0 && meta.ageMs <= 30_000 && now >= meta.cachedAtMs && now - meta.cachedAtMs <= 30_000;
const same = (chain: string, a: string | null, b: string) => a !== null && (chain === "501" ? a === b : a.toLowerCase() === b.toLowerCase());
const unknownCost = (): ShadowCost => ({ outputUnitVerified: false, executionDragUsd: null, networkFeeUsd: null });

/** Bounded GET metadata/quotes only. Output amount units are not qualified by this gateway. */
export async function readShadowQuotes(marks: readonly ShadowMark[], deps: Dependencies, signal: AbortSignal, now: () => number = Date.now): Promise<readonly ShadowQuoteCost[]> {
  const results: ShadowQuoteCost[] = [];
  for (const mark of marks.slice(0, 6)) {
    if (signal.aborted) break;
    if (mark.action !== "buy" && mark.action !== "sell") continue;
    let result: ShadowQuoteCost = { markId: mark.id, cost: unknownCost(), note: "Metadados insuficientes para cotar", impactPct: null, atMs: now() };
    const stable = mark.chainIndex === "501" ? SOLANA_TOKENS.find(t => t.symbol === "USDC") : EVM_CHAINS.find(c => c.chainIndex === mark.chainIndex)?.tokens.find(t => t.symbol === "USDC");
    const stableAddress = stable && ("mint" in stable ? stable.mint : stable.contract);
    if (!stable || !stableAddress || !mark.exposureUsd || !mark.priceUsd || mark.contract === "native") { results.push(result); continue; }
    try {
      const metadata = await deps.search(mark.chainIndex, mark.contract);
      if (signal.aborted) break;
      const token = metadata.data.find(t => t.chainIndex === mark.chainIndex && same(mark.chainIndex, t.address, mark.contract));
      if (!fresh(metadata.meta, now()) || token?.decimals === null || token?.decimals === undefined || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36) { results.push(result); continue; }
      const decimals = mark.action === "buy" ? stable.decimals : token.decimals;
      const quantity = mark.action === "buy" ? mark.exposureUsd : mark.exposureUsd / mark.priceUsd;
      // Truncate the hypothetical amount, never round it above its exposure cap.
      const digits = Math.min(decimals, 12);
      const scale = 10 ** digits;
      const amount = Number.isFinite(quantity) && quantity > 0 && quantity * scale <= Number.MAX_SAFE_INTEGER ? toMinorUnits((Math.floor(quantity * scale) / scale).toFixed(digits), decimals) : null;
      if (!amount) { results.push(result); continue; }
      const params: QuoteParams = { chainIndex: mark.chainIndex, amount, fromToken: mark.action === "buy" ? stableAddress : mark.contract, toToken: mark.action === "buy" ? mark.contract : stableAddress };
      const answer = await deps.quote(params, signal);
      if (signal.aborted) break;
      if (!answer.ok) result = { ...result, note: `Cotacao indisponivel: ${answer.error}` };
      else if (!fresh(answer.meta, now()) || answer.data.chainIndex !== mark.chainIndex || answer.data.mode !== "exactIn" || !same(mark.chainIndex, answer.data.fromToken.address, params.fromToken) || !same(mark.chainIndex, answer.data.toToken.address, params.toToken)) result = { ...result, note: "Identidade ou frescor da cotacao nao confirmado" };
      else result = { ...result, atMs: now(), note: "Unidade de saida nao qualificada; liquido desconhecido", impactPct: answer.data.priceImpactPct, cost: { ...unknownCost(), networkFeeUsd: answer.data.tradeFee !== null && Number.isFinite(answer.data.tradeFee) && answer.data.tradeFee >= 0 ? answer.data.tradeFee : null } };
    } catch { result = { ...result, note: "Metadados ou cotacao indisponiveis" }; }
    if (!signal.aborted) results.push(result);
  }
  return results;
}
