/**
 * What the price did after the purchases the Jev SKIPPED, by how much it preferred each one (the evidence H2 and H5 of ADENDO-G rest on). READ ONLY: it reads the agent's own journals from a folder, writes nothing, calls no
 * model and no network, and prints one JSON object. The preference is the highest probability the answer gave to an option that buys (the definition of the Placar and of H2). The return is the price at the window
 * (15m, 1h, 4h) over the price recorded when the purchase was skipped: gross, before any cost and impact, so it is a counterfactual and never a result. The preferences come from `briefs.jsonl`, which keeps only the last
 * 120 consultations, so the sample is that window and not the whole history. Usage: bun scripts/skip-outcomes.ts [dataDir] [frictionPct=2]
 */
const dir = (process.argv[2] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
const frictionPct = Number(process.argv[3] ?? 2);
const read = async (file: string): Promise<any[]> => {
  const f = Bun.file(dir + file);
  if (!(await f.exists())) return [];
  return (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
};

const [briefs, board] = await Promise.all([read("briefs.jsonl"), read("scoreboard.jsonl")]);
const decisions = new Map<string, any>();
for (const r of board) if (r.kind === "decision") decisions.set(r.key, r);
const settled = new Map<string, Map<string, number>>();
for (const r of board) {
  if (r.kind !== "settlement" || typeof r.priceUsd !== "number") continue;
  const m = settled.get(r.key) ?? new Map<string, number>();
  m.set(r.window, r.priceUsd);
  settled.set(r.key, m);
}

interface Row { readonly pref: number; readonly symbol: string; readonly ret: Record<string, number | null> }
const rows: Row[] = [];
for (const b of briefs) {
  for (const c of b.candidates ?? []) {
    if (c.kind !== "buy" || b.requested?.[c.id] !== "skip") continue;
    const probs = b.verdicts?.[c.id] as Record<string, number> | undefined;
    if (!probs) continue;
    const pref = Math.max(0, ...Object.entries(probs).filter(([k]) => k.startsWith("buy")).map(([, v]) => v));
    const key = `${b.cycleId}:${c.id}|inacao`;
    const d = decisions.get(key);
    const entry: number | null = typeof d?.entryPriceUsd === "number" && d.entryPriceUsd > 0 ? d.entryPriceUsd : null;
    const ret: Record<string, number | null> = {};
    for (const w of ["15m", "1h", "4h"]) {
      const p = settled.get(key)?.get(w);
      ret[w] = entry !== null && p !== undefined ? p / entry - 1 : null;
    }
    rows.push({ pref, symbol: (b.brief?.compras?.[c.id]?.s as string | undefined) ?? c.id.slice(-6), ret });
  }
}

const stats = (xs: number[]) => {
  if (xs.length === 0) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
  const pct = (v: number): number => Math.round(v * 1000) / 10;
  const friction = frictionPct / 100;
  return {
    n,
    meanPct: pct(mean),
    medianPct: pct(median),
    shareUpPct: Math.round((s.filter((x) => x > 0).length / n) * 100),
    shareAboveFrictionPct: Math.round((s.filter((x) => x > friction).length / n) * 100),
    medianAfterFrictionPct: pct(median - friction),
    meanAfterFrictionPct: pct(mean - friction),
    bestPct: pct(s[n - 1]!),
    worstPct: pct(s[0]!),
  };
};
const groups: Record<string, (r: Row) => boolean> = {
  "preferencia ate 0,10": (r) => r.pref < 0.1,
  "preferencia de 0,10 a 0,20": (r) => r.pref >= 0.1 && r.pref < 0.2,
  "preferencia 0,20 ou mais": (r) => r.pref >= 0.2,
};
const out: Record<string, unknown> = {};
for (const [name, pick] of Object.entries(groups)) {
  const sel = rows.filter(pick);
  out[name] = Object.fromEntries(["15m", "1h", "4h"].map((w) => [w, stats(sel.map((r) => r.ret[w]).filter((x): x is number => x !== null))]));
}
const bySymbol = new Map<string, number>();
for (const r of rows.filter((x) => x.pref >= 0.2 && x.ret["1h"] !== null)) bySymbol.set(r.symbol, (bySymbol.get(r.symbol) ?? 0) + 1);
console.log(
  JSON.stringify(
    {
      dataDir: dir,
      note: "gross counterfactual before cost and impact; NOT a result and NOT advice; the sample is the window of briefs.jsonl (last 120 consultations), and the same token appears in many looks, so the observations are NOT independent",
      frictionAssumptionPct: frictionPct,
      frictionNote: "an ASSUMPTION for a round trip (account opening of about 1.7 percent on a 10 dollar entry plus fees and impact), not a measurement of each token",
      skippedPurchasesRead: rows.length,
      byPreference: out,
      distinctTokensAtOrAbove20Percent: bySymbol.size,
      looksPerTokenAtOrAbove20Percent: Object.fromEntries([...bySymbol].sort((a, b) => b[1] - a[1]).slice(0, 8)),
    },
    null,
    2,
  ),
);
