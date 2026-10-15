/**
 * Average cost and distribution of the tracked wallets (T6.2, SMT-3). Our own operational definition, see
 * flow-engine.md 4.
 *
 * Two estimates, in separate units, never mixed:
 *  - from the OnchainOS signals of a token: `custoSinais = sum(price * amountUsd) / sum(amountUsd)` and
 *    `distribuicao = sum(amountUsd * soldRatioPercent / 100) / sum(amountUsd)`;
 *  - from the top traders tagged as smart money: `custoTopTraders = sum(avgBuyPrice * boughtAmount) / sum(boughtAmount)`
 *    and `vendaTopTraders = sum(soldAmount) / sum(boughtAmount)`. They only corroborate: when their cost is within half an
 *    ATR of the signal cost, the strength rises by 10%, capped at 1.
 *
 * The cost is a reference, not a target. Rows that are not numbers, or out of range, are dropped and counted. Pure.
 */
import type { Proposal } from "./zones";

export interface SignalRow {
  readonly price: string | number;
  readonly amountUsd: string | number;
  readonly soldRatioPercent: string | number;
}

export interface TopTraderRow {
  readonly avgBuyPrice: string | number;
  readonly boughtAmount: string | number;
  readonly soldAmount: string | number;
}

export interface SmartCost {
  readonly custoSinais: number;
  /** Share of the position already sold, from 0 to 1. */
  readonly distribuicao: number;
  readonly custoTopTraders: number | null;
  readonly vendaTopTraders: number | null;
  /** Strength for family E6 from 0 to 1: what has not been sold, raised by a corroborating cost. */
  readonly forca: number;
  readonly corroborado: boolean;
  readonly sinaisUsados: number;
  readonly sinaisDescartados: number;
}

const CORROBORATION_ATR = 0.5;
const CORROBORATION_BOOST = 1.1;
const BAND_ATR = 0.5;

const num = (value: string | number): number => (typeof value === "number" ? value : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN);

export function smartCost(input: { readonly signals: readonly SignalRow[]; readonly topTraders: readonly TopTraderRow[]; readonly atr14?: number }): SmartCost | null {
  let weighted = 0;
  let amount = 0;
  let sold = 0;
  let used = 0;
  let dropped = 0;
  for (const row of input.signals) {
    const price = num(row.price);
    const usd = num(row.amountUsd);
    const ratio = num(row.soldRatioPercent);
    if (!(price > 0) || !(usd > 0) || !(ratio >= 0 && ratio <= 100) || !Number.isFinite(price + usd + ratio)) {
      dropped += 1;
      continue;
    }
    weighted += price * usd;
    amount += usd;
    sold += (usd * ratio) / 100;
    used += 1;
  }
  if (used === 0) return null;
  const custoSinais = weighted / amount;
  const distribuicao = sold / amount;

  let tradersCost = 0;
  let tradersBought = 0;
  let tradersSold = 0;
  for (const row of input.topTraders) {
    const avg = num(row.avgBuyPrice);
    const bought = num(row.boughtAmount);
    const soldAmount = num(row.soldAmount);
    if (!(avg > 0) || !(bought > 0) || !(soldAmount >= 0) || !Number.isFinite(avg + bought + soldAmount)) continue;
    tradersCost += avg * bought;
    tradersBought += bought;
    tradersSold += soldAmount;
  }
  const custoTopTraders = tradersBought > 0 ? tradersCost / tradersBought : null;
  const vendaTopTraders = tradersBought > 0 ? tradersSold / tradersBought : null;

  const base = Math.max(0, 1 - distribuicao);
  const atr = input.atr14;
  const corroborado = custoTopTraders !== null && atr !== undefined && atr > 0 && Math.abs(custoTopTraders - custoSinais) <= CORROBORATION_ATR * atr;
  return {
    custoSinais,
    distribuicao,
    custoTopTraders,
    vendaTopTraders,
    forca: corroborado ? Math.min(1, base * CORROBORATION_BOOST) : base,
    corroborado,
    sinaisUsados: used,
    sinaisDescartados: dropped,
  };
}

/** The proposal of family E6: a band of half an ATR around the cost, described as demand when it is under the price. */
export function smartCostProposal(cost: SmartCost, at: { readonly price: number; readonly atr14: number; readonly ts: number }): Proposal {
  return {
    family: "E6",
    baixo: cost.custoSinais - BAND_ATR * at.atr14,
    alto: cost.custoSinais + BAND_ATR * at.atr14,
    lado: cost.custoSinais <= at.price ? "demanda" : "oferta",
    forca: cost.forca,
    ts: at.ts,
  };
}
