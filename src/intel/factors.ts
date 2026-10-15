/**
 * Imbalance and Sequencial on a footprint (T5.3, FLX-2, FLX-3).
 *
 * The definitions are OURS: the Profit Pro help describes each factor by example and gives no formula, so these are
 * operational definitions that resemble it without claiming to be identical (flow-engine.md 2.1 and 2.2). Every
 * threshold is a parameter, never a market constant; the adaptive values come from thresholds.ts.
 *
 *  - Imbalance, mode `diagonal`: buying at L when A_c(L) >= X * A_v(L-1), selling at L when A_v(L) >= X * A_c(L+1);
 *    mode `horizontal`: both against the same level. Both need the side's own volume to reach `minVol`. A missing
 *    neighbour counts as zero.
 *  - Sequencial: a maximal run of N or more ADJACENT levels with the same imbalance side. A level marked `cv` takes
 *    part in the runs of both sides; a gap in the levels breaks a run.
 *
 * Comparisons are made on integers (the ratio is held in thousandths), so equality counts and nothing rounds. The labels
 * `c` and `v` name the AGGRESSOR side that was measured; nothing here says what to do.
 */
import type { FootprintLevel } from "./footprint";

export type LevelRow = Pick<FootprintLevel, "level" | "c" | "v">;
export type ImbalanceMode = "diagonal" | "horizontal";

export interface ImbalanceParams {
  /** Ratio, greater than 1, up to three decimals. */
  readonly x: number;
  /** Floor of the side's own volume, in units; a positive whole number. */
  readonly minVol: number;
  readonly mode: ImbalanceMode;
}

export type ImbalanceSide = "c" | "v" | "cv";

export interface Imbalance {
  readonly level: number;
  readonly imb: ImbalanceSide;
}

export interface Run {
  readonly lado: "c" | "v";
  readonly nivelInicial: number;
  readonly nivelFinal: number;
  readonly comprimento: number;
}

/** The ratio in thousandths, or an error: more than three decimals would not compare exactly. */
export function ratioMilli(x: number): number {
  if (!Number.isFinite(x) || x <= 1) throw new RangeError("the ratio must be greater than 1");
  const milli = Math.round(x * 1000);
  if (Math.abs(milli - x * 1000) > 1e-6) throw new RangeError("the ratio takes at most three decimals");
  return milli;
}

export function checkFloor(minVol: number): number {
  if (!Number.isSafeInteger(minVol) || minVol < 1) throw new RangeError("minVol must be a positive whole number");
  return minVol;
}

export function imbalances(levels: readonly LevelRow[], params: ImbalanceParams): Imbalance[] {
  const milli = BigInt(ratioMilli(params.x));
  checkFloor(params.minVol);
  if (params.mode !== "diagonal" && params.mode !== "horizontal") throw new RangeError("mode is diagonal or horizontal");
  const byLevel = new Map<number, LevelRow>();
  for (const row of levels) byLevel.set(row.level, row);
  const buys = (level: number) => byLevel.get(level)?.c ?? 0;
  const sells = (level: number) => byLevel.get(level)?.v ?? 0;
  const diagonal = params.mode === "diagonal";

  const out: Imbalance[] = [];
  for (const row of [...levels].sort((a, b) => a.level - b.level)) {
    const buying = row.c >= params.minVol && BigInt(row.c) * 1000n >= milli * BigInt(sells(diagonal ? row.level - 1 : row.level));
    const selling = row.v >= params.minVol && BigInt(row.v) * 1000n >= milli * BigInt(buys(diagonal ? row.level + 1 : row.level));
    if (buying || selling) out.push({ level: row.level, imb: buying && selling ? "cv" : buying ? "c" : "v" });
  }
  return out;
}

export function sequences(list: readonly Imbalance[], n: number): Run[] {
  if (!Number.isSafeInteger(n) || n < 2) throw new RangeError("N must be a whole number of at least 2");
  const runs: Run[] = [];
  for (const lado of ["c", "v"] as const) {
    const levels = list.filter((entry) => entry.imb === lado || entry.imb === "cv").map((entry) => entry.level).sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= levels.length; i += 1) {
      if (i < levels.length && levels[i] === levels[i - 1]! + 1) continue;
      const length = i - start;
      if (length >= n) runs.push({ lado, nivelInicial: levels[start]!, nivelFinal: levels[i - 1]!, comprimento: length });
      start = i;
    }
  }
  return runs.sort((a, b) => a.nivelInicial - b.nivelInicial || (a.lado === b.lado ? 0 : a.lado === "c" ? -1 : 1));
}
