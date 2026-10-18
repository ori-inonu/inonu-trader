/**
 * Exact decimal arithmetic for the flow engine (T5.1, FLX-1, FLX-11).
 *
 * The exchange sends prices and sizes as decimal text. A footprint sums sizes by price level and compares them with
 * ratios, so floating point is out: `0.3 / 0.1` must floor to 3, and a volume must be a whole number of lots. A value is
 * `int / 10^scale` with a bigint `int`; every operation here is exact. Nothing in this module reads a clock, the
 * network or the disk.
 */
export interface Dec {
  readonly int: bigint;
  readonly scale: number;
}

const PLAIN = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Reads `12`, `-3.5`, `0.00000012`. Exponents, separators, empty text and anything else are null: never a guess. */
export function parseDec(text: string): Dec | null {
  if (typeof text !== "string") return null;
  const match = PLAIN.exec(text);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const int = BigInt(`${whole}${fraction}`);
  return { int: sign === "-" ? -int : int, scale: fraction.length };
}

const POW10 = new Map<number, bigint>();
function pow10(n: number): bigint {
  let value = POW10.get(n);
  if (value === undefined) {
    value = 10n ** BigInt(n);
    POW10.set(n, value);
  }
  return value;
}

/** Brings both values to the larger number of places; the values do not change. */
function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.int * pow10(scale - a.scale), b.int * pow10(scale - b.scale), scale];
}

export function addDec(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { int: x + y, scale };
}

export function subDec(a: Dec, b: Dec): Dec {
  return addDec(a, { int: -b.int, scale: b.scale });
}

export function mulDec(a: Dec, b: Dec): Dec {
  return { int: a.int * b.int, scale: a.scale + b.scale };
}

export function cmpDec(a: Dec, b: Dec): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Plain text without trailing zeros and without an exponent: `100.500` -> `100.5`, `100.000` -> `100`. */
export function decToString(value: Dec): string {
  const negative = value.int < 0n;
  const digits = (negative ? -value.int : value.int).toString().padStart(value.scale + 1, "0");
  const whole = digits.slice(0, digits.length - value.scale);
  const fraction = digits.slice(digits.length - value.scale).replace(/0+$/, "");
  const text = fraction === "" ? whole : `${whole}.${fraction}`;
  return negative && text !== "0" ? `-${text}` : text;
}

/** `floor(a / b)` for a positive `b`, exactly. The price level of a trade is `floorDivDec(price, binTicks * tick)`. */
export function floorDivDec(a: Dec, b: Dec): bigint {
  const [x, y] = align(a, b);
  if (y <= 0n) throw new RangeError("the divisor must be positive");
  const quotient = x / y;
  return x % y !== 0n && x < 0n ? quotient - 1n : quotient;
}

/** `a / b` when it is a whole number, else null (a size that is not a whole number of lots is a data anomaly). */
export function divExactDec(a: Dec, b: Dec): bigint | null {
  const [x, y] = align(a, b);
  if (y === 0n) return null;
  return x % y === 0n ? x / y : null;
}
