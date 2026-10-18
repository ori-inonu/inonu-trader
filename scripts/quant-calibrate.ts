/**
 * Paired walk forward calibration of touch probability forecasters on captured candles
 * (docs/sdd/dados-quant/SPEC.md, Q-05 and Q-09). Offline: it reads data/quant/*-15m.json written by
 * scripts/quant-capture.ts and makes no request.
 *
 *   bun --no-env-file run scripts/quant-calibrate.ts [--dir data/quant] [--horizons 1,3,7] [--ks 1,1.5,2,2.5,3,4]
 *                                                    [--paths 3000] [--train-days 7] [--stride-days 1] [--seed 20261013]
 *                                                    [--out docs/sdd/dados-quant/evidence/calibration-latest.json]
 *
 * For each instrument and horizon the forecasters see only the bars up to each start time and answer for a fixed
 * list of adverse moves. The adverse moves are k times the horizon sigma of the whole sample (k = 1, 1.5, ...): that
 * only decides which questions are asked, identically for every forecaster, so each asset has enough events; no
 * forecast uses it. The event is "the low (long) or the high (short) of the bars after the start reaches the barrier".
 *
 * Uncertainty. Assets that move together are not independent evidence, so the headline interval is a moving block
 * bootstrap over DATES: the paired loss difference of every asset is averaged per start day first. The older
 * "independent" interval (all asset days stacked) is printed beside it for comparison and is the narrower one. The
 * report also shows how concentrated the gain is in a few days, the sensitivity to the log loss floor, and each asset
 * left out in turn. Around fifty intervals are produced and no multiplicity correction is applied: only the pre named
 * comparison (fhs against envelope, log loss, at the three horizons) is a primary result, the rest is exploratory.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { auditCandles } from "../src/quant/candles";
import { pairedBlockBootstrap, perStartMeanLoss, pooledByKey, walkForward, type ForecasterResult, type PairedDifference, type WalkRecord } from "../src/quant/calibration";
import { envelopeForecaster, filteredSimulationForecaster, sideAwareForecaster } from "../src/quant/forecasters";
import { sigmaBand } from "../src/quant/volatility";
import type { Candle } from "../src/quant/types";

const ROOT = resolve(import.meta.dir, "..");
const DAY = 86_400_000;
const FLOORS = [1e-4, 1e-3, 1e-2] as const;
const RESAMPLES = 4000;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}
const nums = (s: string): number[] => s.split(",").map(Number);

const dir = resolve(ROOT, arg("--dir", "data/quant"));
const horizons = nums(arg("--horizons", "1,3,7"));
const ks = nums(arg("--ks", "1,1.5,2,2.5,3,4"));
const paths = Number(arg("--paths", "3000"));
const trainDays = Number(arg("--train-days", "7"));
const strideDays = Number(arg("--stride-days", "1"));
const seed = Number(arg("--seed", "20261013"));
const outFile = resolve(ROOT, arg("--out", "docs/sdd/dados-quant/evidence/calibration-latest.json"));
if (![...horizons, ...ks, paths, trainDays, strideDays, seed].every(Number.isFinite)) throw new Error("numeric options must be numbers");

interface CaptureFile {
  schema: string; source: string; instId: string; bar: string; barMs: number; capturedAtMs: number; count: number; sha256: string; candles: Candle[];
}

const files = readdirSync(dir).filter((f) => f.endsWith("-15m.json")).sort();
if (files.length === 0) throw new Error(`no captures in ${dir}`);

const forecasters = () => [envelopeForecaster(), sideAwareForecaster("central"), sideAwareForecaster("high"), filteredSimulationForecaster(paths), filteredSimulationForecaster(paths, "evt")];
const NAMES = forecasters().map((f) => f.name);
const REFERENCE = "envelope";
const OTHERS = NAMES.filter((n) => n !== REFERENCE);
const METRICS = ["log1e-4", "log1e-3", "log1e-2", "brier"] as const;
type Metric = (typeof METRICS)[number];
type Keyed = { keys: number[]; values: number[] };

interface AssetCell {
  instId: string;
  /** Per forecaster and metric, the mean loss per start day (keys are UTC day numbers). */
  series: Record<string, Record<Metric, Keyed>>;
  records: Record<string, WalkRecord[]>;
  starts: number;
}
const byHorizon = new Map<number, AssetCell[]>();
const instrumentRows = new Map<number, Record<string, unknown>[]>();
const provenance: Record<string, unknown>[] = [];

for (const file of files) {
  const capture = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as CaptureFile;
  if (capture.schema !== "quant_candles_v1") throw new Error(`${file}: unknown schema`);
  const canonical = JSON.stringify(capture.candles.map((c) => [c.startMs, c.open, c.high, c.low, c.close, c.volume, c.confirmed]));
  const sha = createHash("sha256").update(canonical).digest("hex");
  if (sha !== capture.sha256) throw new Error(`${file}: sha256 mismatch, the capture was altered`);
  const audit = auditCandles(capture.candles, capture.barMs, capture.capturedAtMs);
  provenance.push({ file, instId: capture.instId, source: capture.source, capturedAtMs: capture.capturedAtMs, sha256: sha, input: capture.count, usable: audit.usable.length, grade: audit.grade, coverage: audit.coverage, fresh: audit.fresh, issueCounts: Object.fromEntries(Object.entries(audit.counts).filter(([, v]) => v > 0)), firstMs: audit.usable[0]?.startMs ?? null, lastMs: audit.usable.at(-1)?.startMs ?? null });
  if (audit.grade === "F") { console.error(`${capture.instId}: grade F, skipped`); continue; }
  const sigmaRef = sigmaBand(audit.usable, capture.barMs).central;
  if (sigmaRef === null) continue;

  for (const horizon of horizons) {
    const distances = ks.map((k) => Math.exp(k * sigmaRef * Math.sqrt(horizon)) - 1).filter((d) => d > 0 && d < 0.9);
    if (distances.length === 0) continue;
    const result = walkForward({
      candles: audit.usable, barMs: capture.barMs, horizonDays: horizon, trainBars: Math.round((trainDays * DAY) / capture.barMs),
      strideBars: Math.round((strideDays * DAY) / capture.barMs), distances, forecasters: forecasters(), seed,
    });
    const dayOf = (startIndex: number) => Math.floor((audit.usable[startIndex] as Candle).startMs / DAY);
    const series: AssetCell["series"] = {};
    const records: AssetCell["records"] = {};
    for (const name of NAMES) {
      const r = result.perForecaster[name] as ForecasterResult;
      records[name] = [...r.records];
      const keyed = (loss: "brier" | "logloss", floor?: number): Keyed => {
        const s = perStartMeanLoss(r.records, loss, floor);
        return { keys: s.keys.map(dayOf), values: s.values };
      };
      series[name] = { "log1e-4": keyed("logloss", 1e-4), "log1e-3": keyed("logloss", 1e-3), "log1e-2": keyed("logloss", 1e-2), brier: keyed("brier") };
    }
    const cells = byHorizon.get(horizon) ?? [];
    cells.push({ instId: capture.instId, series, records, starts: result.starts });
    byHorizon.set(horizon, cells);
    const rows = instrumentRows.get(horizon) ?? [];
    rows.push({ instId: capture.instId, horizonDays: horizon, sigmaRefDaily: sigmaRef, distances: distances.map((d) => Math.round(d * 1e4) / 1e4), starts: result.starts, skipped: result.skipped, baseRate: result.baseRate, logLoss: Object.fromEntries(NAMES.map((n) => [n, result.perForecaster[n]!.logLoss])), brier: Object.fromEntries(NAMES.map((n) => [n, result.perForecaster[n]!.brier])) });
    instrumentRows.set(horizon, rows);
    console.error(`${capture.instId} h=${horizon}d starts=${result.starts} base=${result.baseRate?.toFixed(3)} logloss ${NAMES.map((n) => `${n}=${result.perForecaster[n]!.logLoss?.toFixed(4)}`).join(" ")}`);
  }
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Gain = loss of the reference minus loss of the forecaster, per day, averaged over the assets present that day. */
function dailyGain(cells: readonly AssetCell[], name: string, metric: Metric, reference: string = REFERENCE): { keys: number[]; values: number[] } {
  const gains = cells.map((cell) => {
    const ref = cell.series[reference]![metric];
    const other = cell.series[name]![metric];
    return { keys: ref.keys, values: ref.values.map((v, i) => v - (other.values[i] as number)) };
  });
  return pooledByKey(gains);
}

function ci(values: readonly number[], blockLength: number, horizon: number): PairedDifference | null {
  return pairedBlockBootstrap(values, values.map(() => 0), { blockLength, resamples: RESAMPLES, seed: seed + horizon, level: 0.95 });
}

const summary = [...byHorizon.entries()].sort((a, b) => a[0] - b[0]).map(([horizon, cells]) => {
  const dateBlock = Math.max(3, Math.round(horizon * 2));
  const stackedBlock = Math.max(1, Math.round(horizon / strideDays));
  const allRecords = (name: string) => cells.flatMap((c) => c.records[name]!);
  const starts = cells.reduce((s, c) => s + c.starts, 0);
  const events = allRecords(REFERENCE).length;
  const stackedLoss = (name: string, metric: Metric) => cells.flatMap((c) => c.series[name]![metric].values);
  const stackedGain = (name: string, metric: Metric) => cells.flatMap((c) => c.series[REFERENCE]![metric].values.map((v, i) => v - (c.series[name]![metric].values[i] as number)));

  const vsEnvelope: Record<string, Record<string, unknown>> = {};
  for (const name of OTHERS) {
    const entry: Record<string, unknown> = {};
    for (const metric of ["log1e-4", "brier"] as const) {
      const daily = dailyGain(cells, name, metric);
      entry[metric] = {
        meanGain: mean(daily.values),
        byDate: ci(daily.values, dateBlock, horizon),
        independentAssets: ci(stackedGain(name, metric), stackedBlock, horizon),
        days: daily.keys.length,
      };
    }
    // concentration and floor sensitivity are for the log loss at the default floor
    const daily = dailyGain(cells, name, "log1e-4");
    const total = daily.values.reduce((s, v) => s + v, 0);
    const sorted = [...daily.values].sort((a, b) => b - a);
    const top3 = sorted.slice(0, 3).reduce((s, v) => s + v, 0);
    entry.concentration = {
      top3DaysShareOfTotalGain: total > 0 ? top3 / total : null,
      meanGainWithoutTop3Days: sorted.length > 3 ? (total - top3) / (sorted.length - 3) : null,
      daysWorseThanEnvelope: daily.values.filter((v) => v < 0).length,
      days: daily.values.length,
    };
    entry.floorSensitivity = Object.fromEntries(FLOORS.map((floor) => [String(floor), mean(dailyGain(cells, name, `log${floor.toExponential(0)}` as Metric).values)]));
    entry.leaveOneAssetOut = Object.fromEntries(cells.map((left) => {
      const rest = cells.filter((c) => c.instId !== left.instId);
      const d = dailyGain(rest, name, "log1e-4");
      return [left.instId, { meanGain: mean(d.values), byDate: ci(d.values, dateBlock, horizon) }];
    }));
    vsEnvelope[name] = entry;
  }

  // head to head: does the extreme value tail improve on the plain empirical residual pool?
  const evtVersusFhs: Record<string, unknown> = {};
  for (const metric of ["log1e-4", "brier"] as const) {
    const daily = dailyGain(cells, "fhs-evt", metric, "fhs");
    const total = daily.values.reduce((a, b) => a + b, 0);
    const sorted = [...daily.values].sort((a, b) => b - a);
    evtVersusFhs[metric] = { meanGain: mean(daily.values), byDate: ci(daily.values, dateBlock, horizon), days: daily.keys.length, daysWorse: daily.values.filter((v) => v < 0).length, top3DaysShareOfTotalGain: total > 0 ? sorted.slice(0, 3).reduce((a, b) => a + b, 0) / total : null };
  }

  const reliabilityFor = (name: string) => {
    const edges = [0, 0.01, 0.03, 0.1, 0.3, 0.6, 1];
    const recs = allRecords(name);
    return edges.slice(1).map((hi, i) => {
      const lo = edges[i]!;
      const inBin = recs.filter((r) => r.p >= lo && (r.p < hi || (hi === 1 && r.p <= 1)));
      return { lo, hi, n: inBin.length, meanForecast: inBin.length ? mean(inBin.map((r) => r.p)) : null, hitRate: inBin.length ? mean(inBin.map((r) => r.hit)) : null };
    });
  };
  return {
    horizonDays: horizon, starts, events, dateBlockDays: dateBlock, independentBlock: stackedBlock,
    baseRate: mean(allRecords(REFERENCE).map((r) => r.hit)),
    logLoss: Object.fromEntries(NAMES.map((n) => [n, mean(stackedLoss(n, "log1e-4"))])),
    brier: Object.fromEntries(NAMES.map((n) => [n, mean(stackedLoss(n, "brier"))])),
    // gain = loss(envelope) - loss(forecaster): positive means the forecaster is better
    vsEnvelope,
    evtVersusFhs,
    reliability: Object.fromEntries(NAMES.map((n) => [n, reliabilityFor(n)])),
    instruments: instrumentRows.get(horizon),
  };
});

const payload = {
  schema: "quant_calibration_v2", generatedAtMs: Date.now(),
  config: {
    horizons, ks, paths, trainDays, strideDays, seed, forecasters: NAMES, floors: FLOORS, resamples: RESAMPLES,
    truth: "low or high of confirmed last-price bars after the start bar",
    note: "adverse moves are k horizon sigmas of the whole sample, chosen identically for all forecasters; headline intervals are date level block bootstraps; no multiplicity correction, only fhs against envelope in log loss at the three horizons is a primary comparison",
  },
  provenance, summary,
};
mkdirSync(dirname(outFile), { recursive: true });
const tmp = `${outFile}.tmp-${process.pid}`;
writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n");
renameSync(tmp, outFile);
console.error(`wrote ${outFile}`);

const f4 = (x: number | null | undefined) => (x === null || x === undefined ? "n/d" : x.toFixed(4));
const fmt = (d: PairedDifference | null | undefined) => (d ? `${d.meanDiff.toFixed(4)} [${d.ciLow.toFixed(4)}, ${d.ciHigh.toFixed(4)}]` : "n/d");
for (const s of summary) {
  console.log(`\nhorizon ${s.horizonDays}d: ${s.starts} starts over ${Object.keys(s.vsEnvelope).length + 1} forecasters, ${s.events} events, base rate ${((s.baseRate ?? 0) * 100).toFixed(1)}%, date bootstrap block ${s.dateBlockDays} days`);
  console.log("forecaster".padEnd(16), "logloss".padStart(8), "brier".padStart(8));
  for (const n of NAMES) console.log(n.padEnd(16), f4((s.logLoss as Record<string, number | null>)[n]).padStart(8), f4((s.brier as Record<string, number | null>)[n]).padStart(8));
  for (const n of OTHERS) {
    const v = s.vsEnvelope[n]!;
    const ll = v["log1e-4"] as { byDate: PairedDifference | null; independentAssets: PairedDifference | null };
    const br = v["brier"] as { byDate: PairedDifference | null; independentAssets: PairedDifference | null };
    const c = v.concentration as { top3DaysShareOfTotalGain: number | null; meanGainWithoutTop3Days: number | null; daysWorseThanEnvelope: number; days: number };
    console.log(`  ${n} vs envelope, log loss gain by date ${fmt(ll.byDate)}, assets stacked ${fmt(ll.independentAssets)}; brier gain by date ${fmt(br.byDate)}`);
    console.log(`    top 3 days carry ${c.top3DaysShareOfTotalGain === null ? "n/d" : (c.top3DaysShareOfTotalGain * 100).toFixed(0) + "%"} of the gain, without them the mean gain is ${f4(c.meanGainWithoutTop3Days)}, worse than envelope on ${c.daysWorseThanEnvelope} of ${c.days} days`);
    console.log(`    gain by log floor ${Object.entries(v.floorSensitivity as Record<string, number | null>).map(([k, x]) => `${k}: ${f4(x)}`).join(", ")}`);
  }
}

for (const s of summary) {
  const e = s.evtVersusFhs as Record<string, { meanGain: number | null; byDate: PairedDifference | null; daysWorse: number; days: number; top3DaysShareOfTotalGain: number | null }>;
  console.log(`\nhorizon ${s.horizonDays}d: fhs-evt against fhs (gain = loss(fhs) - loss(fhs-evt)): log loss ${fmt(e["log1e-4"]!.byDate)}, brier ${fmt(e["brier"]!.byDate)}; worse than fhs on ${e["log1e-4"]!.daysWorse} of ${e["log1e-4"]!.days} days`);
}
