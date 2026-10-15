/**
 * Progressao and Exaustao on a footprint (T5.8, FLX-4, FLX-5). Operational definitions of our own, see flow-engine.md
 * 2.3 and 2.4; the Profit Pro help gives examples, not formulas.
 *
 *  - Progressao: a maximal run of X or more adjacent levels whose volume of ONE aggressor side is strictly increasing
 *    in the scan direction (buying upwards in price, selling downwards), every level reaching `minVol`.
 *  - Exaustao: at an extreme of the candle, X or more adjacent levels ending at the extreme where the net volume of the
 *    dominant side (A_v - A_c at the low, A_c - A_v at the high) is positive and strictly DECREASING towards the
 *    extreme. It describes a weakening aggression; it predicts nothing.
 *
 * A gap in the levels breaks any chain. The chain reported is the maximal one.
 */
import { checkFloor, type LevelRow } from "./factors";

export interface TrendParams {
  /** Number of adjacent levels, a whole number of at least 2. */
  readonly x: number;
  readonly minVol: number;
}

export interface Progression {
  readonly lado: "c" | "v";
  /** In scan order: ascending for buying, descending for selling. */
  readonly niveis: number[];
  readonly comprimento: number;
}

export interface Exhaustion {
  readonly extremo: "baixo" | "alto";
  /** From the innermost level to the extreme. */
  readonly niveis: number[];
  /** The net volume at each of those levels. */
  readonly valores: number[];
}

function checkParams(params: TrendParams): void {
  if (!Number.isSafeInteger(params.x) || params.x < 2) throw new RangeError("X must be a whole number of at least 2");
  checkFloor(params.minVol);
}

function chains(rows: readonly LevelRow[], pick: (row: LevelRow) => number, step: 1 | -1, minVol: number): number[][] {
  const ordered = [...rows].sort((a, b) => step * (a.level - b.level));
  const out: number[][] = [];
  let current: LevelRow[] = [];
  for (const row of ordered) {
    const own = pick(row);
    if (own < minVol) {
      if (current.length > 0) out.push(current.map((r) => r.level));
      current = [];
      continue;
    }
    const last = current[current.length - 1];
    if (last !== undefined && row.level === last.level + step && own > pick(last)) {
      current.push(row);
    } else {
      if (current.length > 0) out.push(current.map((r) => r.level));
      current = [row];
    }
  }
  if (current.length > 0) out.push(current.map((r) => r.level));
  return out;
}

export function progressions(rows: readonly LevelRow[], params: TrendParams): Progression[] {
  checkParams(params);
  const result: Progression[] = [];
  for (const niveis of chains(rows, (r) => r.c, 1, params.minVol)) if (niveis.length >= params.x) result.push({ lado: "c", niveis, comprimento: niveis.length });
  for (const niveis of chains(rows, (r) => r.v, -1, params.minVol)) if (niveis.length >= params.x) result.push({ lado: "v", niveis, comprimento: niveis.length });
  return result;
}

/** Walks inwards from an extreme while the net volume is positive, adjacent and strictly increasing away from it. */
function fromExtreme(ordered: readonly LevelRow[], net: (row: LevelRow) => number, step: 1 | -1, minVol: number): { niveis: number[]; valores: number[] } {
  const chain: LevelRow[] = [];
  for (const row of ordered) {
    const value = net(row);
    if (value < minVol) break;
    const previous = chain[chain.length - 1];
    if (previous !== undefined && (row.level !== previous.level + step || value <= net(previous))) break;
    chain.push(row);
  }
  chain.reverse();
  return { niveis: chain.map((r) => r.level), valores: chain.map(net) };
}

export function exhaustions(rows: readonly LevelRow[], params: TrendParams): Exhaustion[] {
  checkParams(params);
  if (rows.length === 0) return [];
  const ascending = [...rows].sort((a, b) => a.level - b.level);
  const result: Exhaustion[] = [];
  const low = fromExtreme(ascending, (r) => r.v - r.c, 1, params.minVol);
  if (low.niveis.length >= params.x) result.push({ extremo: "baixo", ...low });
  const high = fromExtreme([...ascending].reverse(), (r) => r.c - r.v, -1, params.minVol);
  if (high.niveis.length >= params.x) result.push({ extremo: "alto", ...high });
  return result;
}
