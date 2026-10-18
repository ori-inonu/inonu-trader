/**
 * What the data allows in HINDSIGHT, and how much foresight a multiple would need. READ ONLY and offline: it reads the JSON file of minute candles that `scripts/brief-freshness.ts --cache <file>` writes (public
 * GeckoTerminal candles of the deepest pool, USD, for the tokens the Jev was shown), writes nothing, calls no network, no model, sends no order and touches nothing of the live agent.
 * For a decision cadence of `minutes`, in each interval it takes the best rise among the tokens that have a REAL candle at both ends of the interval (spot only: never a negative move, no short). A strategy that
 * captures a fraction `phi` of that best move pays the round trip friction each time and stays in cash when the capture does not beat it. `requiredCapture` is the smallest `phi` that reaches the target multiple over the window.
 * This is NOT a target and NOT a strategy: it uses the future. It shows that the opportunity is not the bottleneck and says how much of the best choice a real policy would have to capture. The window is the hours the
 * candles cover (printed), the friction is by class (an assumption per class, see the viability document), and the tokens are few and volatile.
 * Usage: bun --no-env-file run scripts/oracle-bound.ts <candles-cache.json> [--hours 16]
 */
import type { Candle } from "./skip-backfill";

/** Keeps only the candles of the last `hours` before the newest candle of any token: thin tokens have sparse candles whose last 1000 reach back for days, so without a common window the intervals mix very different periods. */
export const lastHours = (cache: Readonly<Record<string, readonly Candle[]>>, hours: number): Record<string, Candle[]> => {
  const newest = Math.max(0, ...Object.values(cache).flatMap((c) => c.map((x) => x[0])));
  const from = newest - hours * 3600;
  return Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, v.filter((x) => x[0] >= from)]));
};

/** Best positive return (as a fraction) per interval of `minutes`, over the minutes on the grid that have a real candle at both ends for at least one token. Intervals with no such token are skipped. */
export const bestMovesPerInterval = (cache: Readonly<Record<string, readonly Candle[]>>, minutes: number): number[] => {
  const step = minutes * 60;
  const series = Object.values(cache).map((c) => new Map(c.map((x) => [x[0], x[4]] as const)));
  const times = [...new Set(series.flatMap((s) => [...s.keys()]))].sort((a, b) => a - b);
  if (times.length === 0) return [];
  const start = times[0]! - (times[0]! % step);
  const end = times[times.length - 1]!;
  const out: number[] = [];
  for (let t = start; t + step <= end; t += step) {
    let best: number | null = null;
    for (const s of series) {
      const a = s.get(t);
      const b = s.get(t + step);
      if (a !== undefined && b !== undefined && a > 0) best = Math.max(best ?? 0, b / a - 1);
    }
    if (best !== null) out.push(Math.max(0, best));
  }
  return out;
};

/** Multiple after taking `phi` of each interval's best move, paying `friction` (fraction, round trip) each time the capture beats it; otherwise the interval is cash. */
export const multipleOf = (bests: readonly number[], phi: number, friction: number): number => {
  let m = 1;
  for (const b of bests) {
    const net = phi * b - friction;
    if (net > 0) m *= 1 + net;
  }
  return m;
};

/** Smallest capture fraction in (0, 1] that reaches `target`; null when even capturing the whole best move cannot. */
export const requiredCapture = (bests: readonly number[], friction: number, target: number): number | null => {
  if (multipleOf(bests, 1, friction) < target) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (multipleOf(bests, mid, friction) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
};

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) {
    console.error("uso: oracle-bound.ts <candles-cache.json>");
    process.exit(2);
  }
  const hi = process.argv.indexOf("--hours");
  const windowHoursArg = hi >= 0 && Number.isFinite(Number(process.argv[hi + 1])) ? Number(process.argv[hi + 1]) : 16;
  const cache = lastHours(JSON.parse(await Bun.file(path).text()) as Record<string, Candle[]>, windowHoursArg);
  const all = Object.values(cache).flat();
  const hours = all.length === 0 ? 0 : (Math.max(...all.map((c) => c[0])) - Math.min(...all.map((c) => c[0]))) / 3600;
  const frictions = [0.005, 0.01, 0.02];
  const rows = [1, 5, 15, 60].map((minutes) => {
    const bests = bestMovesPerInterval(cache, minutes);
    const sorted = [...bests].sort((a, b) => a - b);
    const q = (p: number): number | null => (sorted.length === 0 ? null : Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! * 10000) / 100);
    return {
      cadenceMin: minutes,
      intervals: bests.length,
      bestMovePctMedian: q(0.5),
      bestMovePctP90: q(0.9),
      byFriction: Object.fromEntries(
        frictions.map((f) => {
          const hindsight = multipleOf(bests, 1, f);
          const need = requiredCapture(bests, f, 10);
          return [`${f * 100}%`, { hindsightMultiple: hindsight < 1e6 ? Math.round(hindsight * 100) / 100 : ">1e6", requiredCaptureFor10x: need === null ? null : Math.round(need * 1000) / 1000 }];
        }),
      ),
    };
  });
  console.log(JSON.stringify({ note: "HINDSIGHT, not a target and not a strategy: it uses the future. Spot only (no short). Real candles at both ends of each interval. Few, volatile tokens that the Jev was shown. Friction classes are assumptions. requiredCaptureFor10x is the smallest fraction of the best move of every interval that a policy would have to take to reach 10x over the window", tokens: Object.keys(cache).length, windowHours: Math.round(hours * 10) / 10, rows }, null, 2));
}
