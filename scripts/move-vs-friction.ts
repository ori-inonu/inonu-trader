/**
 * How big are the price moves of the tokens the Jev looks at, over 1, 5, 15 and 60 minutes, next to the cost of getting in and out? READ ONLY and offline: it reads a JSON file of minute candles per token written by
 * `scripts/brief-freshness.ts --cache <file>` (public GeckoTerminal candles of the deepest pool, USD), writes nothing, calls no network, no model, sends no order and touches nothing of the live agent. A move is the
 * absolute close to close return over the window, sampled at every minute that has a candle; consecutive samples overlap, so they are NOT independent. The friction is an ASSUMPTION, not a measurement of each token.
 * Usage: bun --no-env-file run scripts/move-vs-friction.ts <candles-cache.json> [--friction 2]
 */
import { closeAtOrBefore, medianOf, type Candle } from "./skip-backfill";

export const WINDOWS = [1, 5, 15, 60] as const;

/** Absolute close to close moves (percent) over `minutes`, one per candle minute that has a price `minutes` earlier within the staleness bound. */
export const absMoves = (asc: readonly Candle[], minutes: number): number[] => {
  const out: number[] = [];
  for (const c of asc) {
    const before = closeAtOrBefore(asc, c[0] - minutes * 60);
    if (before !== null && before > 0 && c[4] > 0) out.push(Math.abs((c[4] / before - 1) * 100));
  }
  return out;
};

export const shareOver = (xs: readonly number[], thresholdPct: number): number | null => (xs.length === 0 ? null : xs.filter((x) => x > thresholdPct).length / xs.length);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const path = args.find((a, k) => !a.startsWith("--") && !args[k - 1]?.startsWith("--"));
  const fi = args.indexOf("--friction");
  const friction = fi >= 0 && Number.isFinite(Number(args[fi + 1])) ? Number(args[fi + 1]) : 2;
  if (path === undefined) {
    console.error("uso: move-vs-friction.ts <candles-cache.json> [--friction 2]");
    process.exit(2);
  }
  const cache: Record<string, Candle[]> = JSON.parse(await Bun.file(path).text());
  const byWindow = Object.fromEntries(
    WINDOWS.map((m) => {
      const perToken = Object.values(cache).map((c) => absMoves([...c].sort((a, b) => a[0] - b[0]), m));
      const all = perToken.flat();
      const med = medianOf(all);
      const share = shareOver(all, friction);
      const tokenShares = perToken.map((xs) => shareOver(xs, friction)).filter((x): x is number => x !== null);
      return [`${m}m`, { samples: all.length, medianAbsMovePct: med === null ? null : Math.round(med * 100) / 100, shareOverFriction: share === null ? null : Math.round(share * 1000) / 1000, medianTokenShareOverFriction: medianOf(tokenShares) === null ? null : Math.round(medianOf(tokenShares)! * 1000) / 1000 }];
    }),
  );
  console.log(JSON.stringify({ note: "descriptive; absolute close to close moves of public deepest-pool minute candles; overlapping samples; friction is an assumption; it proves no gain", tokens: Object.keys(cache).length, frictionAssumptionPct: friction, byWindow }, null, 2));
}
