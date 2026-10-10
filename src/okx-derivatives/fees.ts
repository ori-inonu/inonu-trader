import { abs, ceilInt, cmp, mul, neg, ONE, parseDecimal, ppmOf, rat, type Rat } from "./decimal.ts";

// Trading fees. In this module a fee is a COST in ppm of notional: positive pays, negative is a
// rebate. The OKX API uses the opposite sign (Get fee rates: "positive number, which means the
// rate of rebate; negative number, which means the rate of commission"), so values copied from
// the API must pass through feeCostPpmFromOkxApiRate.

/** Fee in micro units of the quote currency, rounded up so a cost never vanishes and a rebate shrinks. */
export function feeMicro(feePpm: bigint, notional: Rat): bigint {
  // notional (quote) x ppm / 1e6 quote, which is notional x ppm micro units.
  return ceilInt(mul(notional, rat(feePpm)));
}

function fractionOfOne(text: unknown): Rat | null {
  const value = parseDecimal(text);
  if (value === null || cmp(abs(value), ONE) > 0) return null;
  return value;
}

/** Cost fraction ("0.0007") to integer ppm, rounded up. Invalid or beyond 100% yields null. */
export function costPpmFromDecimal(text: unknown): bigint | null {
  const value = fractionOfOne(text);
  return value === null ? null : ppmOf(value, "ceil");
}

/** OKX API fee rate (negative commission, positive rebate) to a cost in ppm, rounded up. */
export function feeCostPpmFromOkxApiRate(text: unknown): bigint | null {
  const value = fractionOfOne(text);
  return value === null ? null : ppmOf(neg(value), "ceil");
}
