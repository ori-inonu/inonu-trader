/**
 * Synthetic tables for testing the learner and its gate (INT-3.8, ML-4). A random walk per instrument with a known cost, columns of
 * pure noise, and, when asked, ONE column that knows the future return with a chosen correlation (a look-ahead by construction, to
 * plant an edge of a known size). With no planted edge there is nothing to find, and the gate must say so; with one, it must find
 * it. This proves the machinery, not that any real market has an edge. origin: synthetic_fixture, tests and the null-control only.
 */
import { Rng } from "../../lab/rng";
import { FEATURE_NAMES } from "../features/types";
import type { Dataset, Sample, Side } from "./dataset";

export interface SyntheticOptions {
  /** Snapshot times per instrument. */
  readonly times: number;
  readonly instruments?: number;
  readonly stepMs?: number;
  /** Label window in steps. */
  readonly horizonSteps: number;
  /** Standard deviation of one step in bps. */
  readonly sigmaBps?: number;
  readonly costBps?: number;
  /** Correlation of the planted column with the future return; 0 for none. */
  readonly rho: number;
  /** The planted column. Default: `x.betaBtc48h`. */
  readonly planted?: string;
  readonly side?: Side;
  readonly seed: number;
  readonly startMs?: number;
}

export function syntheticDataset(o: SyntheticOptions): Dataset {
  const instruments = o.instruments ?? 3;
  const stepMs = o.stepMs ?? 300_000;
  const sigma = o.sigmaBps ?? 15;
  const cost = o.costBps ?? 22;
  const side: Side = o.side ?? "long";
  const planted = FEATURE_NAMES.indexOf((o.planted ?? "x.betaBtc48h") as (typeof FEATURE_NAMES)[number]);
  if (planted < 0) throw new RangeError("unknown planted column");
  const ema = FEATURE_NAMES.indexOf("trend.ema1h");
  const dir = FEATURE_NAMES.indexOf("smc15.breakDir");
  const age = FEATURE_NAMES.indexOf("smc15.breakAge");
  const start = o.startMs ?? 1_800_000_000_000;
  const samples: Sample[] = [];
  const sdWindow = sigma * Math.sqrt(o.horizonSteps);

  for (let k = 0; k < instruments; k += 1) {
    const rng = new Rng(o.seed * 1000 + k, "synthetic");
    const inc = Array.from({ length: o.times + o.horizonSteps }, () => rng.normal() * sigma);
    for (let i = 0; i < o.times; i += 1) {
      let r = 0;
      for (let j = 1; j <= o.horizonSteps; j += 1) r += inc[i + j]!;
      const x = new Float64Array(FEATURE_NAMES.length);
      for (let c = 0; c < x.length; c += 1) x[c] = rng.normal();
      // the columns the simple rules read are noise too, in the shape the rules expect
      x[ema] = Math.floor(rng.next() * 3) - 1;
      x[dir] = rng.next() < 0.5 ? 1 : -1;
      x[age] = Math.floor(rng.next() * 30);
      const future = side === "long" ? r : -r;
      x[planted] = o.rho * (future / sdWindow) + Math.sqrt(Math.max(0, 1 - o.rho * o.rho)) * rng.normal();
      const net = future - cost;
      samples.push({ id: `s${k}-${i}`, instId: `I${k}`, t: start + i * stepMs, x, net, y: net > 0 ? 1 : 0 });
    }
  }
  samples.sort((a, b) => a.t - b.t || (a.instId < b.instId ? -1 : 1));
  return { side, horizon: "1h", names: FEATURE_NAMES, samples, excluded: {} };
}
