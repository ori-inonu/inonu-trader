import { add, ceilInt, cmp, div, floorInt, mul, ppmOf, rat, ratInt, ZERO, type Rat } from "./decimal.ts";
import type { PositionSide } from "./types.ts";

// Funding. Convention confirmed by the OKX Help Center: a positive rate means traders with long
// positions pay traders with short positions, a negative rate the opposite. Funding is settled
// per settlement period (default every 8 hours, or every 1, 2 or 4 hours) on the position value
// computed with the mark price, and only for positions open at the settlement.

export type FundingScenarioId = "recent_average" | "worst_observed" | "zero";
export const FUNDING_SCENARIOS: readonly FundingScenarioId[] = ["recent_average", "worst_observed", "zero"];

const HOUR_MS = 3_600_000;

/** Interval from the pending and next settlement timestamps; only 1, 2, 4 and 8 hours are accepted. */
export function fundingIntervalHours(currentMs: number, nextMs: number): 1 | 2 | 4 | 8 | null {
  const difference = nextMs - currentMs;
  if (!Number.isSafeInteger(difference) || difference <= 0 || difference % HOUR_MS !== 0) return null;
  const hours = difference / HOUR_MS;
  return hours === 1 || hours === 2 || hours === 4 || hours === 8 ? hours : null;
}

/**
 * Market funding rate of a scenario in integer ppm (positive: longs pay shorts), rounded against the
 * side of the trader: down for a short (which receives) and up for a long (which pays).
 * recent_average is the arithmetic mean of the history, worst_observed is the lowest rate for a
 * short and the highest for a long, and zero is zero.
 */
export function scenarioRatePpm(id: FundingScenarioId, history: readonly Rat[], side: PositionSide): bigint {
  if (id === "zero") return 0n;
  const first = history[0];
  if (first === undefined) throw new RangeError("funding history is empty");
  const mode = side === "short" ? "floor" : "ceil";
  if (id === "recent_average") {
    let total = ZERO;
    for (const rate of history) total = add(total, rate);
    return ppmOf(div(total, ratInt(history.length)), mode);
  }
  let worst = first;
  for (const rate of history) {
    const replaces = side === "short" ? cmp(rate, worst) < 0 : cmp(rate, worst) > 0;
    if (replaces) worst = rate;
  }
  return ppmOf(worst, mode);
}

/**
 * Signed amount received by the trader over N settlements, in micro units, rounded down.
 * valuePerSettlement is the position value in quote at the mark price. A short receives the
 * market rate; a long pays it.
 */
export function fundingFlowMicro(side: PositionSide, valuePerSettlement: Rat, marketRatePpm: bigint, settlements: number): bigint {
  if (!Number.isSafeInteger(settlements) || settlements < 0) throw new RangeError("settlements must be a non-negative integer");
  const received = side === "short" ? marketRatePpm : -marketRatePpm;
  // value (quote) x ppm / 1e6 quote per settlement is value x ppm micro units per settlement.
  return floorInt(mul(mul(valuePerSettlement, rat(received)), ratInt(settlements)));
}

/** The pending settlement and the last of the N settlements held, in milliseconds. */
export function settlementSchedule(fundingTimeMs: number, intervalHours: number, settlements: number): { firstMs: number; lastMs: number } {
  if (!Number.isSafeInteger(settlements) || settlements < 1) throw new RangeError("settlements must be a positive integer");
  const lastMs = fundingTimeMs + (settlements - 1) * intervalHours * HOUR_MS;
  if (!Number.isSafeInteger(lastMs)) throw new RangeError("schedule outside the safe integer range");
  return { firstMs: fundingTimeMs, lastMs };
}

/**
 * Settlements needed for funding income to repay fixed costs (micro units), rounded up. Zero when
 * there is nothing to repay; null when the side does not receive funding at this rate.
 */
export function breakEvenSettlements(fixedCostMicro: bigint, valuePerSettlement: Rat, marketRatePpm: bigint, side: PositionSide): bigint | null {
  if (fixedCostMicro <= 0n) return 0n;
  const received = side === "short" ? marketRatePpm : -marketRatePpm;
  if (received <= 0n) return null;
  return ceilInt(div(rat(fixedCostMicro), mul(valuePerSettlement, rat(received))));
}
