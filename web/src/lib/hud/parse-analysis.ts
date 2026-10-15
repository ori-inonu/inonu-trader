/**
 * The reading of `GET /agent/analysis`. The core is not imported, so the shape is written in types.ts and checked here: a body that is not what is expected is no analysis at all (the screen then says it has none),
 * never a half-filled one. Texts that came from outside are cleaned once (`clean`): a token symbol is letters, digits and a few signs, never markup.
 */
import type { Analysis, GroupStats, WindowStats } from "./types";

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A symbol or a code from outside, cleaned: the characters a token symbol can really have, cut short. */
export function clean(v: unknown, max = 16): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[^A-Za-z0-9._-]/g, "").slice(0, max);
  return s.length > 0 ? s : null;
}

const windowStats = (v: unknown): WindowStats | null => {
  const r = rec(v);
  const n = num(r?.n), up = num(r?.up);
  if (r === null || n === null || up === null || !Array.isArray(r.vals)) return null;
  const vals = r.vals.map(num).filter((x): x is number => x !== null).slice(0, 400);
  return { n, up, mean: num(r.mean), vals };
};
const group = (v: unknown): GroupStats | null => {
  const r = rec(v);
  const a = windowStats(r?.["15m"]), b = windowStats(r?.["1h"]);
  return a === null || b === null ? null : { "15m": a, "1h": b };
};
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(rec(v) ?? {})) { const key = clean(k, 40); const n = num(x); if (key !== null && n !== null) out[key] = n; }
  return out;
};

export function parseAnalysis(body: unknown): Analysis | null {
  const root = rec(body);
  const a = rec(root?.analysis);
  if (root === null || root.ok !== true || a === null) return null;
  const f = rec(a.funnel);
  const keys = ["consults", "items", "closed", "open", "asked", "applied", "executed", "failed"] as const;
  if (f === null || keys.some((k) => num(f[k]) === null)) return null;
  const hist = rec(a.hist);
  const all = arr(hist?.all).map(num), fresh = arr(hist?.fresh).map(num);
  if (all.length !== 20 || fresh.length !== 20 || all.some((x) => x === null) || fresh.some((x) => x === null)) return null;
  const skipped = group(rec(a.placar)?.skipped), closed = group(rec(a.placar)?.closed), gated = group(rec(a.placar)?.gated);
  const fees = rec(a.fees), orders = rec(a.orders), spent = rec(orders?.spentToday), runtime = rec(a.runtime);
  if (skipped === null || closed === null || gated === null || fees === null || orders === null || spent === null || num(spent.buy) === null || num(spent.sell) === null) return null;
  return {
    atMs: num(a.atMs) ?? 0,
    funnel: Object.fromEntries(keys.map((k) => [k, num(f[k]) as number])) as Analysis["funnel"],
    asks: arr(a.asks).flatMap((x) => { const r = rec(x); const t = num(r?.t), p = num(r?.p); return r !== null && t !== null && p !== null && typeof r.ok === "boolean" ? [{ t, s: clean(r.s), p, ok: r.ok }] : []; }).slice(-40),
    hist: { all: all as number[], fresh: fresh as number[] },
    timeline: arr(a.timeline).flatMap((x) => { const r = rec(x); const t = num(r?.t), o = num(r?.open), q = num(r?.asked), p = num(r?.applied); return t !== null && o !== null && q !== null && p !== null ? [{ t, open: o, asked: q, applied: p }] : []; }).slice(-60),
    trips: arr(a.trips).flatMap((x) => { const r = rec(x); const s = clean(r?.s), i = num(r?.in), o = num(r?.out), p = num(r?.pct), b = num(r?.buyAt), e = num(r?.sellAt); return s !== null && i !== null && o !== null && p !== null && b !== null && e !== null ? [{ s, in: i, out: o, pct: p, buyAt: b, sellAt: e }] : []; }).slice(-20),
    fees: { lamports: num(fees.lamports) ?? 0, fills: num(fees.fills) ?? 0, unmatchedSells: num(fees.unmatchedSells) ?? 0 },
    placar: { skipped, closed, gated },
    recent: arr(a.recent).flatMap((x) => { const r = rec(x); const t = num(r?.t); const kind = clean(typeof r?.kind === "string" ? r.kind.replace(/ /g, "_") : null, 30); return r !== null && t !== null && kind !== null ? [{ t, s: clean(r.s), kind: kind.replace(/_/g, " "), m15: num(r.m15), m1h: num(r.m1h) }] : []; }).slice(-60),
    orders: { outcomes: counts(orders.outcomes), reasons: counts(orders.reasons), spentToday: { buy: num(spent.buy) as number, sell: num(spent.sell) as number } },
    runtime: { tokensToday: num(runtime?.tokensToday), riskPct: num(runtime?.riskPct) },
  };
}

/** The analysis of a core that has none, or that could not be read: everything empty, and the screen is told so by `analysisOk`. */
export const EMPTY_ANALYSIS: Analysis = {
  atMs: 0,
  funnel: { consults: 0, items: 0, closed: 0, open: 0, asked: 0, applied: 0, executed: 0, failed: 0 },
  asks: [], hist: { all: new Array<number>(20).fill(0), fresh: new Array<number>(20).fill(0) }, timeline: [], trips: [], fees: { lamports: 0, fills: 0, unmatchedSells: 0 },
  placar: { skipped: emptyGroup(), closed: emptyGroup(), gated: emptyGroup() }, recent: [], orders: { outcomes: {}, reasons: {}, spentToday: { buy: 0, sell: 0 } }, runtime: { tokensToday: null, riskPct: null },
};

function emptyGroup(): GroupStats {
  const w: WindowStats = { n: 0, up: 0, mean: null, vals: [] };
  return { "15m": w, "1h": w };
}
