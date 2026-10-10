import { add, cmp, div, formatRat, mul, neg, ONE, PPM, ppmOf, rat, ratFromPpm, ratInt, sub, toMicro, type Rat } from "./decimal.ts";
import type { PositionSide } from "./types.ts";

// Simplified isolated-margin liquidation model. This is an APPROXIMATION, not the OKX engine.
//
// With entry price E, leverage L, maintenance margin rate m and closing fee f (the OKX Help Center
// states that liquidation charges the taker fee), and an initial margin of E x q / L:
//   short: P_liq = E (1 + 1/L) / (1 + m + f)
//   long:  P_liq = E (1 - 1/L) / (1 - m - f)
// The short formula equals the "Est. liquidation price" published by OKX for isolated USDT margin
// when the margin balance equals the initial margin. The OKX page itself warns that the estimate
// changes with margin, positions and funding fees and cannot be the only basis for judging risk.
// Not modeled: fee and funding deducted from the isolated margin, tier changes as the position
// value moves, divergence of mark and last price, and other account modes.

export const MAX_LEVERAGE = 125;

export interface StressRow {
  movePpm: bigint;
  gap: boolean;
  liquidated: boolean;
  remainingMarginMicro: bigint;
  perpLegPnlMicro: bigint;
  perpUncappedPnlMicro: bigint;
  lossBeyondMarginMicro: bigint;
}

function assertLeverage(leverage: number): void {
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > MAX_LEVERAGE) throw new RangeError("leverage must be an integer from 1 to 125");
}

/** P_liq / E: above 1 for a short, below 1 for a long. */
export function liquidationRatio(side: PositionSide, leverage: number, mmrPpm: bigint, feePpm: bigint): Rat {
  assertLeverage(leverage);
  if (mmrPpm < 0n || feePpm < 0n) throw new RangeError("maintenance margin rate and fee must not be negative");
  const costs = ratFromPpm(mmrPpm + feePpm);
  const inverseLeverage = rat(1n, BigInt(leverage));
  if (side === "short") return div(add(ONE, inverseLeverage), add(ONE, costs));
  if (mmrPpm + feePpm >= PPM) throw new RangeError("maintenance margin rate plus fee must stay below 100% for a long");
  return div(sub(ONE, inverseLeverage), sub(ONE, costs));
}

/** Relative distance from the entry price to the liquidation price, exact. */
function exactDistance(side: PositionSide, leverage: number, mmrPpm: bigint, feePpm: bigint): Rat {
  const ratio = liquidationRatio(side, leverage, mmrPpm, feePpm);
  return side === "short" ? sub(ratio, ONE) : sub(ONE, ratio);
}

export function liquidationPrice(side: PositionSide, entry: Rat, leverage: number, mmrPpm: bigint, feePpm: bigint): Rat {
  return mul(entry, liquidationRatio(side, leverage, mmrPpm, feePpm));
}

/** Liquidation price as text: rounded down for a short and up for a long, so it is never farther than the model says. */
export function liquidationPriceText(side: PositionSide, entry: Rat, leverage: number, mmrPpm: bigint, feePpm: bigint, decimals: number): string {
  return formatRat(liquidationPrice(side, entry, leverage, mmrPpm, feePpm), decimals, side === "short" ? "floor" : "ceil");
}

/** Distance to liquidation in ppm of the entry price, rounded down. */
export function liquidationDistancePpm(side: PositionSide, leverage: number, mmrPpm: bigint, feePpm: bigint): bigint {
  return ppmOf(exactDistance(side, leverage, mmrPpm, feePpm), "floor");
}

/** True exactly when the adverse move (ppm of the entry price) reaches the exact liquidation distance. */
export function isLiquidatedAtMove(side: PositionSide, leverage: number, mmrPpm: bigint, feePpm: bigint, adverseMovePpm: bigint): boolean {
  return cmp(ratFromPpm(adverseMovePpm), exactDistance(side, leverage, mmrPpm, feePpm)) >= 0;
}

/** Initial margin = entry notional / leverage, rounded up to the next micro unit. */
export function initialMarginMicro(entryNotional: Rat, leverage: number): bigint {
  assertLeverage(leverage);
  return toMicro(div(entryNotional, ratInt(leverage)), "ceil");
}

/**
 * One stress row for the perpetual leg. movePpm is the adverse price move from the entry price
 * (up for a short, down for a long). When liquidated the whole initial margin is lost; in a gap
 * row the amount the uncapped loss exceeds the margin is reported separately (the OKX Help Center
 * says shortfalls are covered by the security fund; that is not guaranteed).
 */
export function stressRow(input: {
  side: PositionSide;
  entryNotional: Rat;
  initialMarginMicro: bigint;
  leverage: number;
  mmrPpm: bigint;
  feePpm: bigint;
  movePpm: bigint;
  gap: boolean;
}): StressRow {
  if (input.movePpm < 0n) throw new RangeError("the adverse move must not be negative");
  const uncapped = toMicro(neg(mul(input.entryNotional, ratFromPpm(input.movePpm))), "floor");
  const liquidated = isLiquidatedAtMove(input.side, input.leverage, input.mmrPpm, input.feePpm, input.movePpm);
  const shortfall = -(input.initialMarginMicro + uncapped);
  return {
    movePpm: input.movePpm,
    gap: input.gap,
    liquidated,
    remainingMarginMicro: liquidated ? 0n : input.initialMarginMicro + uncapped,
    perpLegPnlMicro: liquidated ? -input.initialMarginMicro : uncapped,
    perpUncappedPnlMicro: uncapped,
    lossBeyondMarginMicro: input.gap && liquidated && shortfall > 0n ? shortfall : 0n,
  };
}
