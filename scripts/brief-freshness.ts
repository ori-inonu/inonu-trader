/**
 * Does what the Jev saw match the market at the moment of the look? For every look and candidate it compares the returns the Brief carried (`mo.r1` over an hour, `mo.r5` over a 5-minute bar, `mo.r15` over fifteen minutes, in percent) with the same returns computed
 * from the public minute candles at the look time. READ ONLY for the project: it reads `briefs.jsonl`, asks the public GeckoTerminal API (no key, no account) for minute candles of each Solana token, writes nothing,
 * calls no model, sends no order and touches nothing of the live agent. Only public mint addresses leave the machine. The candles are the deepest pool's, not an executable quote, and a thin token has gaps, so the
 * comparison is descriptive; it proves no gain. A difference is measured in percentage points of the return.
 * Usage: bun --no-env-file run scripts/brief-freshness.ts [dataDir] [--max-tokens 40]
 */
import { candlesOf, closeAtOrBefore, medianOf, type Candle } from "./skip-backfill";

/** What the Brief fields mean (src/agent/momentum.ts): r5 is the last 5-minute bar against the one before, r15 the last fifteen minutes, r1 the last HOUR. */
export const WINDOWS_MIN: Readonly<Record<string, number>> = { r1: 60, r5: 5, r15: 15 };

/** Return in percent over `minutes` ending at the minute of `atMs`, from candles sorted ascending; null when either price is missing within the staleness bound. */
export const returnOver = (asc: readonly Candle[], atMs: number, minutes: number): number | null => {
  const endSec = Math.floor(atMs / 60000) * 60;
  const end = closeAtOrBefore(asc, endSec - 60);
  const start = closeAtOrBefore(asc, endSec - 60 - minutes * 60);
  return end !== null && start !== null && start > 0 ? (end / start - 1) * 100 : null;
};

export interface Pair {
  readonly window: string;
  readonly briefPct: number;
  readonly marketPct: number;
}

export const summarizePairs = (pairs: readonly Pair[], bigPoints = 2) => {
  const out: Record<string, unknown> = {};
  for (const w of Object.keys(WINDOWS_MIN)) {
    const sel = pairs.filter((p) => p.window === w);
    const diffs = sel.map((p) => Math.abs(p.briefPct - p.marketPct));
    const signDiffers = sel.filter((p) => Math.sign(p.briefPct) !== 0 && Math.sign(p.marketPct) !== 0 && Math.sign(p.briefPct) !== Math.sign(p.marketPct)).length;
    out[w] = {
      n: sel.length,
      medianAbsDiffPoints: medianOf(diffs) === null ? null : Math.round(medianOf(diffs)! * 100) / 100,
      shareDiffOverPoints: sel.length === 0 ? null : Math.round((diffs.filter((d) => d > bigPoints).length / sel.length) * 1000) / 1000,
      shareSignDiffers: sel.length === 0 ? null : Math.round((signDiffers / sel.length) * 1000) / 1000,
    };
  }
  return out;
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--max-tokens");
  const maxTokens = i >= 0 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : 40;
  const positional = args.filter((a, k) => !a.startsWith("--") && !args[k - 1]?.startsWith("--"));
  const dir = (positional[0] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
  const file = Bun.file(`${dir}briefs.jsonl`);
  const briefs: any[] = (await file.exists()) ? (await file.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const obs: { mint: string; atMs: number; mo: Record<string, unknown> }[] = [];
  for (const b of briefs) {
    if (typeof b.atMs !== "number") continue;
    for (const c of b.candidates ?? []) {
      const m = /^buy:token:501:(\S+)$/.exec(String(c.id));
      const mo = b.brief?.compras?.[c.id]?.mo as Record<string, unknown> | undefined;
      if (m && mo) obs.push({ mint: m[1]!, atMs: b.atMs, mo });
    }
  }
  const byMint = new Map<string, typeof obs>();
  for (const o of obs) byMint.set(o.mint, [...(byMint.get(o.mint) ?? []), o]);
  const mints = [...byMint.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, maxTokens);
  const nowSec = Math.floor(Date.now() / 1000);
  const pairs: Pair[] = [];
  let tokensWithHistory = 0;
  // optional cache of the public candles in a file OUTSIDE the project and the agent data, so a second analysis of the same window does not ask the public API again
  const ci = args.indexOf("--cache");
  const cachePath = ci >= 0 ? args[ci + 1] : undefined;
  const cacheFile = cachePath === undefined ? null : Bun.file(cachePath);
  const cache: Record<string, Candle[]> = cacheFile !== null && (await cacheFile.exists()) ? JSON.parse(await cacheFile.text()) : {};
  for (const [mint, list] of mints) {
    const candles = cache[mint] ?? (await candlesOf(mint, nowSec));
    if (candles !== null && candles.length > 0) cache[mint] = candles;
    if (candles === null || candles.length === 0) continue;
    tokensWithHistory++;
    const asc = [...candles].sort((a, b) => a[0] - b[0]);
    for (const o of list) {
      for (const [w, min] of Object.entries(WINDOWS_MIN)) {
        const briefPct = o.mo[w];
        const marketPct = returnOver(asc, o.atMs, min);
        if (typeof briefPct === "number" && Number.isFinite(briefPct) && marketPct !== null) pairs.push({ window: w, briefPct, marketPct });
      }
    }
  }
  if (cachePath !== undefined) await Bun.write(cachePath, JSON.stringify(cache));
  console.log(
    JSON.stringify(
      {
        note: "descriptive only; the Brief return is the Jev's input, the market return is from the public deepest-pool minute candles at the look time (candle gaps and pool differences add noise); differences are in percentage points; it proves no gain",
        observationsRead: obs.length,
        tokensAsked: mints.length,
        tokensWithHistory,
        pairsCompared: pairs.length,
        byWindow: summarizePairs(pairs),
      },
      null,
      2,
    ),
  );
}
