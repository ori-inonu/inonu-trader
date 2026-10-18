/**
 * Exact decimal arithmetic on BigInt. A value is `units / 10^scale`. No JavaScript number ever enters a money computation.
 * Inputs are provider TEXT; anything that is not plain decimal text is refused (no exponent, no sign prefix, no separators).
 */

export interface Dec {
  /** Signed integer numerator. */
  readonly units: bigint;
  /** Number of fractional digits, 0..MAX_SCALE. */
  readonly scale: number;
}

export const MAX_TEXT_LENGTH = 80;
export const MAX_SCALE = 60;
export const MAX_DECIMALS = 36;

const UNSIGNED = /^\d+(?:\.\d+)?$/;
const SIGNED = /^-?\d+(?:\.\d+)?$/;

/** Parses strict decimal text. Returns null for anything else. `signed` allows a leading minus (PnL, deltas). */
export function parseDec(text: unknown, signed = false): Dec | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_LENGTH) return null;
  if (!(signed ? SIGNED : UNSIGNED).test(text)) return null;
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const dot = body.indexOf(".");
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fraction = dot === -1 ? "" : body.slice(dot + 1);
  if (fraction.length > MAX_SCALE) return null;
  const magnitude = BigInt(intPart + fraction);
  return { units: negative ? -magnitude : magnitude, scale: fraction.length };
}

/** Parses a non-negative integer text (atoms). */
export function parseAtoms(text: unknown): bigint | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_LENGTH || !/^\d+$/.test(text)) return null;
  return BigInt(text);
}

const pow10 = (exponent: number): bigint => 10n ** BigInt(exponent);

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * pow10(scale - a.scale), b.units * pow10(scale - b.scale), scale];
}

export function decAdd(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

export function decSub(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

export function decMul(a: Dec, b: Dec): Dec {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

export function decCmp(a: Dec, b: Dec): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
}

export function decIsZero(a: Dec): boolean {
  return a.units === 0n;
}

export function decAbs(a: Dec): Dec {
  return a.units < 0n ? { units: -a.units, scale: a.scale } : a;
}

export const DEC_ZERO: Dec = Object.freeze({ units: 0n, scale: 0 });

/** Canonical text: no trailing fractional zeros, no "-0", no leading "+". Exact: nothing is rounded. */
export function decToText(a: Dec): string {
  const negative = a.units < 0n;
  const digits = (negative ? -a.units : a.units).toString();
  let text: string;
  if (a.scale === 0) text = digits;
  else {
    const padded = digits.padStart(a.scale + 1, "0");
    const intPart = padded.slice(0, padded.length - a.scale);
    const fraction = padded.slice(padded.length - a.scale).replace(/0+$/, "");
    text = fraction === "" ? intPart : `${intPart}.${fraction}`;
  }
  return negative && text !== "0" ? `-${text}` : text;
}

/** integer atoms / 10^decimals */
export function atomsToDec(atoms: bigint, decimals: number): Dec {
  return { units: atoms, scale: decimals };
}

/** Converts a decimal to integer atoms at `decimals`. Null when the value has more significant fractional digits than `decimals` allows. */
export function decToAtoms(value: Dec, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS || value.units < 0n) return null;
  if (value.scale <= decimals) return value.units * pow10(decimals - value.scale);
  const divisor = pow10(value.scale - decimals);
  return value.units % divisor === 0n ? value.units / divisor : null;
}

/**
 * Finds `d` such that `atoms == value * 10^d` exactly, when the ratio is an exact power of ten. Null when the value is
 * zero (any `d` fits), when no power of ten fits, or when `d` is out of range. This VERIFIES a relation the provider
 * sends; it never invents decimals.
 */
export function deriveDecimals(value: Dec, atoms: bigint): number | null {
  if (value.units <= 0n || atoms <= 0n) return null;
  // atoms == units * 10^(d - scale)
  for (let d = 0; d <= MAX_DECIMALS; d += 1) {
    const exponent = d - value.scale;
    const scaled = exponent >= 0 ? value.units * pow10(exponent) : value.units % pow10(-exponent) === 0n ? value.units / pow10(-exponent) : null;
    if (scaled !== null && scaled === atoms) return d;
  }
  return null;
}

/** Rounds to `places` fractional digits. Display only: never feed the result back into a reconciliation. */
export function decRound(a: Dec, places: number, mode: "floor" | "half_even"): Dec {
  if (a.scale <= places) return a;
  const divisor = pow10(a.scale - places);
  let quotient = a.units / divisor;
  const remainder = a.units % divisor;
  if (remainder !== 0n) {
    if (mode === "floor") {
      if (a.units < 0n) quotient -= 1n;
    } else {
      const twice = (remainder < 0n ? -remainder : remainder) * 2n;
      const awayFromZero = twice > divisor || (twice === divisor && (quotient % 2n !== 0n));
      if (awayFromZero) quotient += a.units < 0n ? -1n : 1n;
    }
  }
  return { units: quotient, scale: places };
}

/** Sum of decimals; empty sum is null (unknown), never zero. */
export function decSum(values: readonly Dec[]): Dec | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => decAdd(sum, value));
}

/** Parts per ten thousand of `part` over `whole`, floored. Null when `whole` is not positive. */
export function ratioBps(part: Dec, whole: Dec): bigint | null {
  if (whole.units <= 0n || part.units < 0n) return null;
  const [x, y] = align(part, whole);
  return (x * 10_000n) / y;
}
