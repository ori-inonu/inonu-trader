/**
 * Standard normal helpers. The cdf is the repository's single implementation (src/policy/envelope.ts,
 * erfc by Kummer series and Laplace continued fraction, read only here); the quantile inverts it by
 * bisection on the monotone cdf, which keeps one source of numerical truth.
 */

import { normalCdf } from "../policy/envelope";
import { isFiniteNumber, QuantError } from "./types";

export { normalCdf };

/** Inverse of the standard normal cdf for p strictly inside (0, 1). */
export function normalQuantile(p: number): number {
  if (!isFiniteNumber(p) || !(p > 0) || !(p < 1)) throw new QuantError("probability_invalid");
  if (p === 0.5) return 0;
  // Work on the lower half so the cdf keeps its relative accuracy; the upper half is the mirror image.
  if (p > 0.5) return -normalQuantile(1 - p);
  let lo = -40;
  let hi = 0;
  for (let i = 0; i < 200 && lo < hi; i += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
