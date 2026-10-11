/**
 * Seeded pseudo random numbers for the lab: sfc32 seeded through an xmur3 text hash.
 *
 * PURE and DETERMINISTIC: no clock, no system randomness. Same seed and stream, same sequence. The lab uses this for
 * synthetic prices (source.ts), the seeded random policy (policies.ts) and the fixed-seed block bootstrap (stats.ts).
 * The standard uniform of the platform is never used, so the same seed gives the same bytes on the same runtime.
 */

const TWO_POW_32 = 4_294_967_296;
const TWO_POW_53 = 9_007_199_254_740_992;

/** xmur3: turns text into a stream of 32 bit words. */
function xmur3(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Four 32 bit state words from a seed and any number of text or number parts. Parts are kept apart. */
export function hashSeed(seed: number, ...parts: (string | number)[]): [number, number, number, number] {
  const text = [seed, ...parts].map((part) => `${String(part).length}:${String(part)}`).join("|");
  const next = xmur3(text);
  return [next(), next(), next(), next()];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spare: number | null = null;
  private readonly seed: number;
  private readonly stream: string;

  constructor(seed: number, stream = "") {
    if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_POW_32) throw new RangeError("seed must be an integer from 0 to 4294967295");
    this.seed = seed;
    this.stream = stream;
    [this.a, this.b, this.c, this.d] = hashSeed(seed, stream);
    for (let i = 0; i < 15; i += 1) this.next32();
  }

  /** sfc32. */
  private next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform on [0, 1) with 53 bits of resolution. */
  next(): number {
    const high = this.next32() >>> 5;
    const low = this.next32() >>> 6;
    return (high * 67_108_864 + low) / TWO_POW_53;
  }

  /** Uniform on (0, 1): never exactly zero, so it is safe inside a logarithm. */
  nextOpen(): number {
    let u = this.next();
    while (u === 0) u = this.next();
    return u;
  }

  /** Standard normal by Box-Muller; the second variate is cached. */
  normal(): number {
    if (this.spare !== null) {
      const cached = this.spare;
      this.spare = null;
      return cached;
    }
    const radius = Math.sqrt(-2 * Math.log(this.nextOpen()));
    const angle = 2 * Math.PI * this.next();
    this.spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }

  /** Uniform integer on 0..maxExclusive-1. */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_POW_32) throw new RangeError("maxExclusive must be an integer from 1 to 4294967296");
    return Math.floor(this.next() * maxExclusive);
  }

  /** An independent stream derived from the seed, this stream name and a label. It does not depend on what this stream consumed. */
  child(label: string): Rng {
    return new Rng(this.seed, `${this.stream}/${label}`);
  }
}
