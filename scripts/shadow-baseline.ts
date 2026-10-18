/**
 * The descriptive baseline the four shadow hypotheses are registered against (ADENDO-G). READ ONLY: it reads the agent's own journals from a folder (default: the installed agent's data folder), writes nothing, calls no
 * model and no network, and prints one JSON object. It describes what the version in force did; it does not evaluate any hypothesis and it proves no gain. Usage: bun scripts/shadow-baseline.ts [dataDir]
 */
import { medianOf } from "../src/agent/shadow/variants";

const dir = (process.argv[2] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
const read = async (file: string): Promise<any[]> => {
  const f = Bun.file(dir + file);
  if (!(await f.exists())) return [];
  return (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
};

const [ledger, fills, equity, briefs] = await Promise.all([read("ledger.jsonl"), read("fills.jsonl"), read("equity.jsonl"), read("briefs.jsonl")]);

// ---- the looks: how often the version in force chose to buy anything
const looks = ledger.filter((r) => r.kind === "cycle" && r.mode === "limitado" && r.outcome === "decidido");
const withBuy = looks.filter((c) => Object.entries(c.stances as Record<string, string>).some(([k, v]) => k.startsWith("buy:") && v !== "skip")).length;
const buyShown = looks.map((c) => Object.keys(c.stances).filter((k) => k.startsWith("buy:")).length);

// ---- the orders: last stage per order key, who asked, and how long a bought token was kept
const last = new Map<string, any>();
for (const o of ledger.filter((r) => r.kind === "order")) last.set(o.orderKey, o);
const executed = [...last.values()].filter((o) => o.stage === "executada").sort((a, b) => a.atMs - b.atMs);
const stages: Record<string, number> = {};
for (const o of last.values()) stages[o.stage] = (stages[o.stage] ?? 0) + 1;
const holds: number[] = [];
const exitBy: Record<string, number> = {};
const open = new Map<string, any>();
for (const o of executed) {
  if (o.side === "buy") open.set(o.address, open.get(o.address) ?? o);
  else if (open.has(o.address)) {
    holds.push(Math.round((o.atMs - open.get(o.address).atMs) / 60_000));
    exitBy[`${o.source}/${o.stance}`] = (exitBy[`${o.source}/${o.stance}`] ?? 0) + 1;
    open.delete(o.address);
  }
}

// ---- the round trips on the fills, in the dollar coin: what came back less what went out, per token and in order
const trips: number[] = [];
const outstanding = new Map<string, number>();
for (const f of fills) {
  if (f.side === "buy") outstanding.set(f.mint, (outstanding.get(f.mint) ?? 0) + f.cashUnits);
  else if (outstanding.has(f.mint)) {
    trips.push(Math.round((f.cashUnits - outstanding.get(f.mint)!) * 1e4) / 1e4);
    outstanding.delete(f.mint);
  }
}

// ---- the account of a token never held: the first buy of a mint against the later ones, as native outflow
const solPriceUsd: number | null = (() => {
  const priced = equity.filter((r) => r.usd != null).at(-1)?.holdings?.find((h: any) => h.id === "501:native");
  return priced?.priceUsd ?? null;
})();
const seen = new Set<string>();
const firstSol: number[] = [];
const repeatSol: number[] = [];
for (const f of fills) {
  const sol = Math.abs(Number(f.nativeDeltaLamports)) / 1e9;
  if (f.side === "buy") (seen.has(f.mint) ? repeatSol : firstSol).push(sol);
  seen.add(f.mint);
}
const firstMedianSol = medianOf(firstSol);
const repeatMedianSol = medianOf(repeatSol);

// ---- the attempts: how many purchases were aimed at a token the wallet had never held
const heldBefore = new Set<string>();
let attemptsFirst = 0;
let attemptsRepeat = 0;
const fillsByTime = [...fills].sort((a, b) => a.atMs - b.atMs);
let fi = 0;
for (const o of [...last.values()].filter((x) => x.side === "buy" && x.stage !== "preparada").sort((a, b) => a.atMs - b.atMs)) {
  while (fi < fillsByTime.length && fillsByTime[fi].atMs <= o.atMs) heldBefore.add(fillsByTime[fi++].mint);
  if (heldBefore.has(o.address)) attemptsRepeat++;
  else attemptsFirst++;
}

// ---- the preference of the Jev (H2): the highest probability its answer gave to an option that buys, for the purchases it SKIPPED. `briefs.jsonl` keeps the last 120 consultations only, so this is a window, not a history
const FLOOR = 0.2;
const skippedPrefs: number[] = [];
let looksWithSkippedAtOrAboveFloor = 0;
for (const b of briefs) {
  let any = false;
  for (const c of b.candidates ?? []) {
    if (c.kind !== "buy" || b.requested?.[c.id] !== "skip") continue;
    const probs = b.verdicts?.[c.id] as Record<string, number> | undefined;
    if (!probs) continue;
    const pref = Math.max(0, ...Object.entries(probs).filter(([k]) => k.startsWith("buy")).map(([, v]) => v));
    skippedPrefs.push(pref);
    if (pref >= FLOOR) any = true;
  }
  if (any) looksWithSkippedAtOrAboveFloor++;
}
skippedPrefs.sort((a, b) => a - b);
const quantile = (q: number): number | null => (skippedPrefs.length === 0 ? null : skippedPrefs[Math.min(skippedPrefs.length - 1, Math.floor(q * skippedPrefs.length))]!);

const usd = (sol: number | null): number | null => (sol === null || solPriceUsd === null ? null : Math.round(sol * solPriceUsd * 1e4) / 1e4);
console.log(
  JSON.stringify(
    {
      dataDir: dir,
      note: "descriptive only; no hypothesis is evaluated here and nothing in it is a gain",
      looks: { decidedLive: looks.length, withAnyBuyStance: withBuy, shareWithBuy: looks.length === 0 ? null : Math.round((withBuy / looks.length) * 100) / 100, avgBuyCandidatesShown: buyShown.length === 0 ? null : Math.round((buyShown.reduce((a, b) => a + b, 0) / buyShown.length) * 10) / 10 },
      orders: { byLastStage: stages, executed: executed.length },
      keptMinutesBuyToFirstSale: holds,
      exitsOfBoughtTokensBySourceAndStance: exitBy,
      roundTripsDollarCoin: { n: trips.length, perTrip: trips, sum: Math.round(trips.reduce((a, b) => a + b, 0) * 1e4) / 1e4, note: "before the network fee, which is in the native coin" },
      accountCost: { solPriceUsd, firstBuyOutflowSol: firstSol, repeatBuyOutflowSol: repeatSol, firstBuyMedianUsd: usd(firstMedianSol), repeatBuyMedianUsd: usd(repeatMedianSol), note: "native outflow of a first buy beyond a repeat one is CONSISTENT with opening a token account; not confirmed from a receipt" },
      buyAttempts: { aimedAtATokenNeverHeld: attemptsFirst, aimedAtATokenAlreadyHeld: attemptsRepeat },
      preferenceOfTheJev: {
        consultationsRead: briefs.length,
        windowFromAtMs: briefs[0]?.atMs ?? null,
        windowToAtMs: briefs.at(-1)?.atMs ?? null,
        skippedPurchases: skippedPrefs.length,
        floor: FLOOR,
        skippedAtOrAboveFloor: skippedPrefs.filter((p) => p >= FLOOR).length,
        looksWithASkippedPurchaseAtOrAboveFloor: looksWithSkippedAtOrAboveFloor,
        quantilesOfSkipped: { p50: quantile(0.5), p90: quantile(0.9), max: quantile(1) },
        note: "from `briefs.jsonl`, which keeps only the last 120 consultations (about four hours) and overwrites the rest; the durable `answers.jsonl` of the producer keeps them from the next release on",
      },
    },
    null,
    2,
  ),
);
