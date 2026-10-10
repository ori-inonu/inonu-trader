import { cmp, div, mul, sign, type Rat } from "./decimal.ts";

// Contract arithmetic for a linear SWAP (settled in the quote currency).
// OKX documents ctVal as "Contract value", ctMult as "Contract multiplier", ctValCcy as
// "Contract value currency" and states that lotSz and minSz are numbers of contracts for
// derivatives. The Help Center position value is
// contracts x contract size x contract multiplier x price (see docs/OKX-DERIVATIVES-SPEC.md).

export type SizeCheck = "ok" | "invalid" | "lot" | "min";

/** Coins (in ctValCcy) represented by a number of contracts. */
export function coinQuantity(ctVal: Rat, ctMult: Rat, contracts: Rat): Rat {
  return mul(mul(contracts, ctVal), ctMult);
}

/** Quote-currency value of a coin quantity at a price quoted per coin. */
export function notionalOf(coin: Rat, price: Rat): Rat {
  return mul(coin, price);
}

/** True when value is an exact whole multiple of a positive step. */
export function isMultipleOf(value: Rat, step: Rat): boolean {
  return div(value, step).d === 1n;
}

/** Order of checks: non-positive size, then lot multiple, then minimum size. */
export function checkSize(size: Rat, lotSz: Rat, minSz: Rat): SizeCheck {
  if (sign(size) <= 0) return "invalid";
  if (!isMultipleOf(size, lotSz)) return "lot";
  if (cmp(size, minSz) < 0) return "min";
  return "ok";
}
