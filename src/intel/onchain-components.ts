/**
 * The trail components that need more than a helper of `trail.ts` (fase-2 SPEC tabela 4.1): liquidity, flow, sentiment, and
 * the inputs taken from the gateway's signal rows. Pure; a number that cannot be computed is `null`, never zero.
 */
import { percentile } from "./thresholds";

const LIQUIDITY_PERCENTILE = 75;

/** `min(1, liquidity / P75 of the set)`; the set holds the same measure of the other tokens of the chain. */
export function liquidityComponent(liquidityUsd: number | null, set: readonly number[]): number | null {
  if (liquidityUsd === null || !Number.isFinite(liquidityUsd) || liquidityUsd < 0) return null;
  const reference = percentile(set.filter((v) => Number.isFinite(v) && v >= 0), LIQUIDITY_PERCENTILE);
  if (reference === null || !(reference > 0)) return null;
  return Math.min(1, liquidityUsd / reference);
}

/** Buy and sell volume in USD from trade rows; a negative or non finite volume is ignored. */
export function buySellUsd(trades: readonly { readonly side: "buy" | "sell"; readonly volumeUsd: number }[]): { buyUsd: number; sellUsd: number } {
  let buyUsd = 0;
  let sellUsd = 0;
  for (const t of trades) {
    if (!Number.isFinite(t.volumeUsd) || t.volumeUsd < 0) continue;
    if (t.side === "buy") buyUsd += t.volumeUsd;
    else sellUsd += t.volumeUsd;
  }
  return { buyUsd, sellUsd };
}

/** The buy share by volume, from 0 to 1. Null without trades or without volume. */
export function flowComponent(flow: { readonly buyUsd: number; readonly sellUsd: number } | null): number | null {
  if (flow === null) return null;
  const total = flow.buyUsd + flow.sellUsd;
  return total > 0 ? flow.buyUsd / total : null;
}

export type SymbolKind =
  | { readonly origin: "okx_instrument" }
  | { readonly origin: "onchain_token"; readonly communityRecognized: boolean | null; readonly sameSymbolMatches: number };

export interface SentimentComponent {
  readonly value: number | null;
  readonly nulo: "simbolo_ambiguo" | "vazio_valido" | "nao_consultado" | "fora_da_escala" | "sem_dado" | null;
}

/**
 * Sentiment is by symbol, not by contract: it counts only when the symbol is unambiguous (an OKX instrument, or a community
 * recognised token that is the only one of its symbol in the search result). The bullish ratio is a fraction from 0 to 1.
 */
export function sentimentComponent(input: { readonly kind: SymbolKind; readonly coverage: "coberto" | "vazio" | "nao_consultado"; readonly bullishRatio: number | null }): SentimentComponent {
  const unambiguous = input.kind.origin === "okx_instrument" || (input.kind.communityRecognized === true && input.kind.sameSymbolMatches === 1);
  if (!unambiguous) return { value: null, nulo: "simbolo_ambiguo" };
  if (input.coverage === "nao_consultado") return { value: null, nulo: "nao_consultado" };
  if (input.coverage === "vazio") return { value: null, nulo: "vazio_valido" };
  const ratio = input.bullishRatio;
  if (ratio === null || !Number.isFinite(ratio)) return { value: null, nulo: "sem_dado" };
  if (ratio < 0 || ratio > 1) return { value: null, nulo: "fora_da_escala" };
  return { value: ratio, nulo: null };
}

export interface SignalLike {
  readonly amountUsd: number;
  readonly soldRatioPct: number | null;
  readonly walletCount: number;
}

export interface SignalInputs {
  /** Sum of `amountUsd x (1 - soldRatioPct / 100)` over the usable rows; null with none. */
  readonly netUnsoldUsd: number | null;
  readonly soldPercents: number[];
  /** Sum of the wallet counts: an upper bound, because one wallet can appear in several signals. */
  readonly walletCount: number;
  readonly used: number;
  readonly dropped: number;
}

export function signalsInputs(rows: readonly SignalLike[]): SignalInputs {
  let net = 0;
  let walletCount = 0;
  let used = 0;
  let dropped = 0;
  const soldPercents: number[] = [];
  for (const row of rows) {
    if (Number.isFinite(row.walletCount) && row.walletCount >= 0) walletCount += row.walletCount;
    const sold = row.soldRatioPct;
    if (!(row.amountUsd > 0) || sold === null || !Number.isFinite(sold) || sold < 0 || sold > 100) {
      dropped += 1;
      continue;
    }
    net += row.amountUsd * (1 - sold / 100);
    soldPercents.push(sold);
    used += 1;
  }
  return { netUnsoldUsd: used === 0 ? null : net, soldPercents, walletCount, used, dropped };
}
