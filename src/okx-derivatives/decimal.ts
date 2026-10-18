// Exact arithmetic for the offline OKX derivatives evaluator.
//
// Every value is a normalized rational of two bigints, so decimal inputs such as
// "0.1" are represented exactly. Rounding happens only when a result is converted to
// an integer unit (micro of the quote currency, or ppm), and each caller chooses the
// direction explicitly: "floor" (toward minus infinity) or "ceil" (toward plus
// infinity), always the one that is unfavorable to the trader for that quantity.

export type Rat = { readonly n: bigint; readonly d: bigint };
export type Rounding = "floor" | "ceil";

/** 1e6 micro units per unit of the quote currency. */
const MICRO = 1_000_000n;
/** 1e6 parts per million per unit ratio. */
export const PPM = 1_000_000n;

export const ZERO: Rat = { n: 0n, d: 1n };
export const ONE: Rat = { n: 1n, d: 1n };

const MAX_DECIMAL_TEXT = 40;
const MAX_FRACTION_DIGITS = 18;
const DECIMAL_GRAMMAR = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

/** Normalized rational: positive denominator, lowest terms, zero as 0/1. */
export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) throw new RangeError("rational with zero denominator");
  let numerator = n;
  let denominator = d;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0n) return { n: 0n, d: 1n };
  const divisor = gcd(numerator, denominator);
  return divisor === 1n ? { n: numerator, d: denominator } : { n: numerator / divisor, d: denominator / divisor };
}

export function ratInt(n: number | bigint): Rat {
  if (typeof n === "number") {
    if (!Number.isSafeInteger(n)) throw new RangeError("not a safe integer");
    return rat(BigInt(n));
  }
  return rat(n);
}

export function add(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rat, b: Rat): Rat {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new RangeError("division by zero");
  return rat(a.n * b.d, a.d * b.n);
}

export function neg(a: Rat): Rat {
  return a.n === 0n ? a : { n: -a.n, d: a.d };
}

export function abs(a: Rat): Rat {
  return a.n < 0n ? { n: -a.n, d: a.d } : a;
}

export function cmp(a: Rat, b: Rat): -1 | 0 | 1 {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function min(a: Rat, b: Rat): Rat {
  return cmp(a, b) <= 0 ? a : b;
}

export function max(a: Rat, b: Rat): Rat {
  return cmp(a, b) >= 0 ? a : b;
}

export function sign(a: Rat): -1 | 0 | 1 {
  return a.n > 0n ? 1 : a.n < 0n ? -1 : 0;
}

export function isZero(a: Rat): boolean {
  return a.n === 0n;
}

function divRound(n: bigint, d: bigint, mode: Rounding): bigint {
  // d is always positive here.
  const quotient = n / d;
  const remainder = n % d;
  if (remainder === 0n) return quotient;
  if (mode === "floor") return n < 0n ? quotient - 1n : quotient;
  return n > 0n ? quotient + 1n : quotient;
}

export function floorInt(a: Rat): bigint {
  return divRound(a.n, a.d, "floor");
}

export function ceilInt(a: Rat): bigint {
  return divRound(a.n, a.d, "ceil");
}

/** round(a * scale) in the given direction. */
export function scaled(a: Rat, scale: bigint, mode: Rounding): bigint {
  return divRound(a.n * scale, a.d, mode);
}

export function toMicro(a: Rat, mode: Rounding): bigint {
  return scaled(a, MICRO, mode);
}

export function ppmOf(a: Rat, mode: Rounding): bigint {
  return scaled(a, PPM, mode);
}

export function ratFromPpm(p: bigint | number): Rat {
  if (typeof p === "number" && !Number.isSafeInteger(p)) throw new RangeError("not a safe integer");
  return rat(BigInt(p), PPM);
}

export function ratFromMicro(m: bigint): Rat {
  return rat(m, MICRO);
}

/**
 * Strict decimal text: optional minus, no plus sign, no exponent, no leading zeros, no
 * surrounding space, at most 18 fractional digits, at most 40 characters. Negative zero
 * is rejected. Anything else (including non-strings) yields null.
 */
export function parseDecimal(text: unknown): Rat | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_DECIMAL_TEXT) return null;
  const match = DECIMAL_GRAMMAR.exec(text);
  if (!match) return null;
  const negative = match[1] === "-";
  const integerDigits = match[2] as string;
  const fractionDigits = match[3] ?? "";
  if (fractionDigits.length > MAX_FRACTION_DIGITS) return null;
  const numerator = BigInt(integerDigits + fractionDigits);
  if (negative && numerator === 0n) return null;
  return rat(negative ? -numerator : numerator, 10n ** BigInt(fractionDigits.length));
}

/** Exact fixed or trimmed rendering of an integer count of 10^-decimals units. */
export function formatScaled(v: bigint, decimals: number, trim = false): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new RangeError("invalid decimals");
  const negative = v < 0n;
  const absolute = negative ? -v : v;
  const base = 10n ** BigInt(decimals);
  const integerPart = absolute / base;
  const fractionPart = absolute % base;
  let fraction = decimals === 0 ? "" : fractionPart.toString().padStart(decimals, "0");
  if (trim) fraction = fraction.replace(/0+$/, "");
  const body = fraction === "" ? integerPart.toString() : `${integerPart}.${fraction}`;
  return negative && absolute !== 0n ? `-${body}` : body;
}

/** Money: always exactly six fractional digits. */
export function formatMicro(m: bigint): string {
  return formatScaled(m, 6, false);
}

/** Prices and sizes: rounded once in the stated direction, trailing zeros trimmed. */
export function formatRat(a: Rat, decimals: number, mode: Rounding): string {
  return formatScaled(scaled(a, 10n ** BigInt(decimals), mode), decimals, true);
}

/** Converts an integer result to a JSON number, refusing anything not exactly representable. */
export function safeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("integer outside the safe JSON range");
  return Number(v);
}
