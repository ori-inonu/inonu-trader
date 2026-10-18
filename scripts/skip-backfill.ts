/**
 * What the price did after the purchases the Jev SKIPPED, with the price path read from a PUBLIC history instead of the agent's own settlements, which cover only about 6 percent of the skipped purchases. READ ONLY for the
 * project: it reads the agent's journals from a folder, asks the public GeckoTerminal API (no key, no account) for the pools and the minute candles of each token, writes nothing, calls no model, sends no order and
 * touches nothing of the live agent. It prints one JSON object. The return is gross (before cost, impact and the cost of opening an account), so it is a counterfactual and never a result; the friction is an ASSUMPTION.
 * The sample is the window of `briefs.jsonl` (the last 120 consultations), the same token shows up in many looks, so the observations are NOT independent: `firstLookPerToken` keeps one look per token.
 * Only public mint addresses leave the machine. Usage: bun --no-env-file run scripts/skip-backfill.ts [dataDir] [--max-tokens 60] [--friction 2]
 */
export type Candle = readonly [number, number, number, number, number, number];

export const WINDOWS_MIN: Readonly<Record<string, number>> = { "15m": 15, "1h": 60, "4h": 240 };
/** A price older than this many minutes before the moment asked is not a price for that moment (thin tokens skip minutes with no trade). */
export const STALE_MIN = 10;

/** Close of the latest candle that starts at or before `tsSec`, or null when there is none within STALE_MIN. `asc` must be sorted by time ascending. */
export const closeAtOrBefore = (asc: readonly Candle[], tsSec: number): number | null => {
  let found: Candle | undefined;
  for (const c of asc) {
    if (c[0] > tsSec) break;
    found = c;
  }
  return found !== undefined && tsSec - found[0] <= STALE_MIN * 60 ? found[4] : null;
};

/**
 * Gross return after each window for a skip at `atMs`. The base is the open of the minute that holds the skip (or the last close before it); the exit is the close at or before the minute that holds `atMs + window`,
 * and only when that minute has already closed by `nowMs`. A missing price gives null: the function never invents one.
 */
export const baseOf = (asc: readonly Candle[], atMs: number): number | null => {
  const minute = Math.floor(atMs / 60000) * 60;
  const own = asc.find((c) => c[0] === minute);
  return own !== undefined ? own[1] : closeAtOrBefore(asc, minute - 60);
};

export const returnsFor = (candles: readonly Candle[], atMs: number, nowMs: number): Record<string, number | null> => {
  const asc = [...candles].sort((a, b) => a[0] - b[0]);
  const base = baseOf(asc, atMs);
  const out: Record<string, number | null> = {};
  for (const [name, min] of Object.entries(WINDOWS_MIN)) {
    const exitMs = atMs + min * 60000;
    const exitMinute = Math.floor(exitMs / 60000) * 60;
    const closed = (exitMinute + 60) * 1000 <= nowMs;
    const exit = closed ? closeAtOrBefore(asc, exitMinute) : null;
    out[name] = base !== null && base > 0 && exit !== null ? exit / base - 1 : null;
  }
  return out;
};

/** The history is trusted for a token only when its price at the skip is about the price the agent itself recorded then: the median ratio must be inside [RATIO_LOW, RATIO_HIGH]. Outside means the wrong token or pool, or skewed timestamps. */
export const RATIO_LOW = 0.8;
export const RATIO_HIGH = 1.25;
export const medianOf = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
/** Fewer comparisons than this cannot show that a series is wrong: a volatile token moves between the agent's price and the minute candle, so one or two off ratios are only `weak`. */
export const MIN_RATIO_OBS = 3;
export const ratioVerdict = (ratios: readonly number[]): { readonly median: number | null; readonly status: "ok" | "off" | "weak" | "unchecked" } => {
  const median = medianOf(ratios);
  if (median === null) return { median, status: "unchecked" };
  if (median >= RATIO_LOW && median <= RATIO_HIGH) return { median, status: "ok" };
  return { median, status: ratios.length >= MIN_RATIO_OBS ? "off" : "weak" };
};

export const bucketOf =(pref: number): string => (pref < 0.1 ? "preferencia ate 0,10" : pref < 0.2 ? "preferencia de 0,10 a 0,20" : "preferencia 0,20 ou mais");

export const stats = (xs: readonly number[], frictionPct: number): Record<string, number> => {
  if (xs.length === 0) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
  const pct = (v: number): number => Math.round(v * 1000) / 10;
  const friction = frictionPct / 100;
  return { n, meanPct: pct(mean), medianPct: pct(median), shareUpPct: Math.round((s.filter((x) => x > 0).length / n) * 100), medianAfterFrictionPct: pct(median - friction), bestPct: pct(s[n - 1]!), worstPct: pct(s[0]!) };
};

interface Obs {
  readonly mint: string;
  readonly atMs: number;
  readonly pref: number;
  readonly symbol: string;
  /** The entry price the agent itself recorded for this skipped purchase, when it did. */
  readonly entry: number | null;
}

const API = "https://api.geckoterminal.com/api/v2/networks/solana";
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
/** One call at most every 2.3 s (the public limit is about 30 a minute), with a wait and a retry on 429. */
const getJson = async (url: string): Promise<any | null> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastCall + 2300 - Date.now();
    if (wait > 0) await pause(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (res.status === 429) {
        await pause(20000);
        continue;
      }
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }
  return null;
};

export const candlesOf = async (mint: string, nowSec: number): Promise<Candle[] | null> => {
  const pools = await getJson(`${API}/tokens/${mint}/pools?page=1`);
  const list: any[] = pools?.data ?? [];
  const pick = list
    .filter((p) => p?.relationships?.base_token?.data?.id?.endsWith(mint) || p?.relationships?.quote_token?.data?.id?.endsWith(mint))
    .sort((a, b) => Number(b.attributes?.reserve_in_usd ?? 0) - Number(a.attributes?.reserve_in_usd ?? 0))[0];
  const address: string | undefined = pick?.attributes?.address;
  if (address === undefined) return null;
  const ohlcv = await getJson(`${API}/pools/${address}/ohlcv/minute?aggregate=1&limit=1000&currency=usd&token=${mint}&before_timestamp=${nowSec + 60}`);
  const rows: unknown = ohlcv?.data?.attributes?.ohlcv_list;
  return Array.isArray(rows) ? (rows as Candle[]) : null;
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: number): number => {
    const i = args.indexOf(name);
    return i >= 0 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : fallback;
  };
  const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const dir = (positional[0] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
  const maxTokens = flag("--max-tokens", 60);
  const frictionPct = flag("--friction", 2);
  const file = Bun.file(`${dir}briefs.jsonl`);
  const briefs: any[] = (await file.exists()) ? (await file.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const boardFile = Bun.file(`${dir}scoreboard.jsonl`);
  const board: any[] = (await boardFile.exists()) ? (await boardFile.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const entries = new Map<string, number>();
  for (const r of board) if (r.kind === "decision" && typeof r.entryPriceUsd === "number" && r.entryPriceUsd > 0) entries.set(r.key, r.entryPriceUsd);
  const observations: Obs[] = [];
  for (const b of briefs) {
    for (const c of b.candidates ?? []) {
      if (c.kind !== "buy" || b.requested?.[c.id] !== "skip") continue;
      const m = /^buy:token:501:(\S+)$/.exec(String(c.id));
      const probs = b.verdicts?.[c.id] as Record<string, number> | undefined;
      if (!m || !probs || typeof b.atMs !== "number") continue;
      const pref = Math.max(0, ...Object.entries(probs).filter(([k]) => k.startsWith("buy")).map(([, v]) => v));
      observations.push({ mint: m[1]!, atMs: b.atMs, pref, symbol: (b.brief?.compras?.[c.id]?.s as string | undefined) ?? m[1]!.slice(0, 6), entry: entries.get(`${b.cycleId}:${c.id}|inacao`) ?? null });
    }
  }
  const byMint = new Map<string, Obs[]>();
  for (const o of observations) byMint.set(o.mint, [...(byMint.get(o.mint) ?? []), o]);
  const chosen = [...byMint.entries()].sort((a, b) => Math.max(...b[1].map((o) => o.pref)) - Math.max(...a[1].map((o) => o.pref)) || b[1].length - a[1].length).slice(0, maxTokens);
  const nowMs = Date.now();
  /** `flagged` is a token whose history price was off the agent's own recorded entry price (weak or strong): it is kept in the main table and left out of the sensitivity table, so both readings show. */
  const rows: { obs: Obs; ret: Record<string, number | null>; flagged: boolean }[] = [];
  let tokensWithHistory = 0;
  const priceCheck: { symbol: string; mint: string; medianRatio: number | null; status: string; observationsWithEntry: number }[] = [];
  for (const [mint, obs] of chosen) {
    const candles = await candlesOf(mint, Math.floor(nowMs / 1000));
    if (candles === null || candles.length === 0) continue;
    tokensWithHistory++;
    const asc = [...candles].sort((a, b) => a[0] - b[0]);
    const ratios: number[] = [];
    for (const o of obs) {
      const base = baseOf(asc, o.atMs);
      if (o.entry !== null && base !== null && base > 0) ratios.push(base / o.entry);
    }
    const verdict = ratioVerdict(ratios);
    priceCheck.push({ symbol: obs[0]!.symbol, mint, medianRatio: verdict.median === null ? null : Math.round(verdict.median * 1000) / 1000, status: verdict.status, observationsWithEntry: ratios.length });
    for (const o of obs) rows.push({ obs: o, ret: returnsFor(candles, o.atMs, nowMs), flagged: verdict.status === "off" || verdict.status === "weak" });
  }
  const table = (subset: typeof rows): Record<string, unknown> => {
    const groups: Record<string, typeof rows> = {};
    for (const r of subset) (groups[bucketOf(r.obs.pref)] ??= []).push(r);
    return Object.fromEntries(Object.entries(groups).map(([name, sel]) => [name, Object.fromEntries(Object.keys(WINDOWS_MIN).map((w) => [w, stats(sel.map((r) => r.ret[w]).filter((x): x is number => x !== null), frictionPct)]))]));
  };
  const byBucket = table(rows);
  const byBucketWithoutFlagged = table(rows.filter((r) => !r.flagged));
  const flaggedTokens = priceCheck.filter((p) => p.status === "off" || p.status === "weak").map((p) => p.symbol);
  const firstLook = new Map<string, (typeof rows)[number]>();
  for (const r of [...rows].sort((a, b) => a.obs.atMs - b.obs.atMs)) if (!firstLook.has(r.obs.mint)) firstLook.set(r.obs.mint, r);
  const firstLookPerToken = Object.fromEntries(Object.keys(WINDOWS_MIN).map((w) => [w, stats([...firstLook.values()].map((r) => r.ret[w]).filter((x): x is number => x !== null), frictionPct)]));
  console.log(
    JSON.stringify(
      {
        note: `gross counterfactual before cost, impact and account opening; NOT a result and NOT advice; ${chosen.length < byMint.size ? "the sample favors tokens the Jev preferred most; " : "every token of the briefs window was asked; "}observations of one token are NOT independent; the price is the deepest pool price, not an executable quote; friction is an assumption; a token whose history price is off the entry price the agent recorded is FLAGGED in priceCheck and kept in byPreference; byPreferenceWithoutFlaggedTokens leaves the flagged ones out, read both (a flag from fewer than ${MIN_RATIO_OBS} comparisons is weak, and a real loser can look off)`,
        source: "GeckoTerminal public API, minute candles in USD, one pool per token (the deepest)",
        frictionAssumptionPct: frictionPct,
        skippedPurchasesInBriefs: observations.length,
        distinctTokensInBriefs: byMint.size,
        tokensAsked: chosen.length,
        tokensWithHistory,
        observationsUsed: rows.length,
        priceCheck: { bandLow: RATIO_LOW, bandHigh: RATIO_HIGH, minComparisons: MIN_RATIO_OBS, flaggedTokens, tokens: priceCheck },
        withReturn: Object.fromEntries(Object.keys(WINDOWS_MIN).map((w) => [w, rows.filter((r) => r.ret[w] !== null).length])),
        byPreference: byBucket,
        byPreferenceWithoutFlaggedTokens: byBucketWithoutFlagged,
        firstLookPerToken,
      },
      null,
      2,
    ),
  );
}
