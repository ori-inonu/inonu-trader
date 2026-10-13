/**
 * Shared vocabulary of the quant data layer. Pure types and one constant-message error, no I/O.
 * See docs/sdd/dados-quant/SPEC.md.
 */

/** One OHLC bar. `startMs` is the open time, as in the OKX v5 candle rows. */
export interface Candle {
  readonly startMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Base volume, or null when the source does not give it. */
  readonly volume: number | null;
  /** True once the bar has closed on the exchange. */
  readonly confirmed: boolean;
}

export type Side = "long" | "short";

export const DAY_MS = 86_400_000;

/** A caller contract violation. The message is the code, so nothing user supplied is ever echoed. */
export class QuantError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "QuantError";
    this.code = code;
  }
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function requirePositive(value: unknown, code: string): number {
  if (!isFiniteNumber(value) || !(value > 0)) throw new QuantError(code);
  return value;
}

/** Deterministic uniform generator in [0, 1). The only source of randomness in this module. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw by Box Muller from two uniforms of the given generator. */
export function normalDraw(random: () => number): number {
  const u1 = Math.max(1e-12, random());
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
