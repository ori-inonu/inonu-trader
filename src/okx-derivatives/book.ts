import { add, div, mul, min, ppmOf, ratInt, sign, sub, ZERO, type Rat } from "./decimal.ts";
import type { Level } from "./types.ts";

// Order book depth walk. Levels must be sorted best price first (snapshot validation
// guarantees this): asks ascending when buying, bids descending when selling.

export type Walk =
  | { filled: true; requested: Rat; cost: Rat; avgPrice: Rat; worstPrice: Rat; touchPrice: Rat; levelsUsed: number }
  | { filled: false; requested: Rat; available: Rat };

/**
 * Consumes levels in order until size is covered. cost is the sum of price x quantity taken.
 * When the total depth is smaller than size the walk is unfilled: it is never completed with
 * an extrapolated price.
 */
export function walkDepth(levels: readonly Level[], size: Rat): Walk {
  if (sign(size) <= 0) throw new RangeError("walk size must be positive");
  let remaining = size;
  let cost = ZERO;
  let worstPrice: Rat | null = null;
  let levelsUsed = 0;
  for (const level of levels) {
    if (sign(remaining) === 0) break;
    const take = min(remaining, level.size);
    cost = add(cost, mul(level.price, take));
    remaining = sub(remaining, take);
    worstPrice = level.price;
    levelsUsed += 1;
  }
  const first = levels[0];
  if (sign(remaining) > 0 || first === undefined || worstPrice === null) {
    let available = ZERO;
    for (const level of levels) available = add(available, level.size);
    return { filled: false, requested: size, available };
  }
  return { filled: true, requested: size, cost, avgPrice: div(cost, size), worstPrice, touchPrice: first.price, levelsUsed };
}

/** Distance of the average fill from the touch price in ppm, rounded up. A fill at or inside the touch is 0. */
export function slippagePpm(side: "buy" | "sell", avg: Rat, touch: Rat): bigint {
  if (sign(touch) <= 0) throw new RangeError("touch price must be positive");
  const worse = side === "buy" ? sub(avg, touch) : sub(touch, avg);
  if (sign(worse) <= 0) return 0n;
  return ppmOf(div(worse, touch), "ceil");
}

/** True when both sides exist and the best bid is at or above the best ask (a locked book counts). */
export function isCrossed(bids: readonly Level[], asks: readonly Level[]): boolean {
  const bid = bids[0];
  const ask = asks[0];
  if (bid === undefined || ask === undefined) return false;
  return bid.price.n * ask.price.d >= ask.price.n * bid.price.d;
}

/** Mid of the best bid and ask; null when a side is empty or the book is crossed or locked. */
export function midPrice(bids: readonly Level[], asks: readonly Level[]): Rat | null {
  const bid = bids[0];
  const ask = asks[0];
  if (bid === undefined || ask === undefined || isCrossed(bids, asks)) return null;
  return div(add(bid.price, ask.price), ratInt(2));
}
