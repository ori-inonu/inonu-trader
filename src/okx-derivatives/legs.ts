import { isCrossed, slippagePpm, walkDepth } from "./book.ts";
import { max, mul, sub, toMicro, ZERO, type Rat } from "./decimal.ts";
import type { Level, Role } from "./types.ts";

// Pricing of one order leg against an order book.
//
// taker: the order crosses the book and walks the consumed side (asks to buy, bids to sell); the
//        effective price is the average of the walk.
// maker: the order rests and is ASSUMED filled at the mid price, with no credit for the half spread
//        and no queue or fill risk modeled. This is optimistic about execution, so it must be an
//        explicit choice and the report flags it.

export type LegSide = "buy" | "sell";

export interface PricedLeg {
  side: LegSide;
  role: Role;
  /** Effective price per coin: the walk average (taker) or the mid (maker). */
  avgPrice: Rat;
  /** Worst price touched by a taker walk; null for a maker leg. */
  worstPrice: Rat | null;
  /** Best price on the side a taker would consume. */
  touchPrice: Rat;
  /** Quote value of the coin quantity at the effective price. */
  notional: Rat;
  /** Average fill versus the touch in ppm, rounded up; 0 for a maker leg. */
  slippagePpm: bigint;
  /** Cost versus the mid in micro units, rounded up and never negative. */
  executionCostMicro: bigint;
}

export type LegPricing = { ok: true; leg: PricedLeg } | { ok: false; reason: "depth" | "mid" };

export function priceLeg(input: {
  side: LegSide;
  role: Role;
  bids: readonly Level[];
  asks: readonly Level[];
  mid: Rat | null;
  /** Size in the units of the book (coins for spot, contracts for the perpetual). */
  bookSize: Rat;
  /** The same quantity in coins, used for the quote value. */
  coin: Rat;
}): LegPricing {
  const { side, role, bids, asks, mid, bookSize, coin } = input;
  if (mid === null || isCrossed(bids, asks)) return { ok: false, reason: "mid" };
  const consumed = side === "buy" ? asks : bids;
  const touch = consumed[0];
  if (touch === undefined) return { ok: false, reason: "mid" };

  let avgPrice: Rat = mid;
  let worstPrice: Rat | null = null;
  let slippage = 0n;
  if (role === "taker") {
    const walk = walkDepth(consumed, bookSize);
    if (!walk.filled) return { ok: false, reason: "depth" };
    avgPrice = walk.avgPrice;
    worstPrice = walk.worstPrice;
    slippage = slippagePpm(side, walk.avgPrice, walk.touchPrice);
  }

  const worse = side === "buy" ? mul(coin, sub(avgPrice, mid)) : mul(coin, sub(mid, avgPrice));
  return {
    ok: true,
    leg: {
      side,
      role,
      avgPrice,
      worstPrice,
      touchPrice: touch.price,
      notional: mul(coin, avgPrice),
      slippagePpm: slippage,
      executionCostMicro: toMicro(max(ZERO, worse), "ceil"),
    },
  };
}
