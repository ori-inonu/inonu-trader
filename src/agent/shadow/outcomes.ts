/**
 * The outcome of every purchase the Jev was asked about, skipped or not, measured from the two durable journals of the producer (`answers.jsonl` and `prices.jsonl`, `src/agent/recording.ts`). Until now the Placar followed
 * only a handful of the skipped purchases (3 or 4 of the 49 with a preference of 0.20 or more, in the window read on 2026-10-15), so there was nothing to judge a policy like H2 or H5 of ADENDO-G with. This closes that gap
 * for the next release: every purchase offered gets a forward return at 15 minutes, 1 hour and 4 hours, from the prices the cycle really read.
 *
 * The rules are the honest ones: the entry is the last price read at or before the decision (within a few minutes), the exit is the first price read at or after the window (within a tolerance), and where either is
 * missing the return is UNKNOWN (null), counted apart and never averaged in as if the price had not moved. The lag of the exit read is reported, because the sources give no observation time and a cache can be older than its
 * row (recording.ts). The return is gross, before cost and impact: a counterfactual, never a result. Pure and read only.
 */
import { choiceConfidence } from "../conviction";
import { planKey } from "../plans";
import type { AnswerRecord, PriceRow } from "../recording";

/** 1 and 5 minutes are the scale of the cycle (the goal is a return per 1 minute cycle); 15 minutes, 1 hour and 4 hours are the older windows. */
export const WINDOWS_MS = { "1m": 60_000, "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000 } as const;
export type WindowName = keyof typeof WINDOWS_MS;
const WINDOW_NAMES = Object.keys(WINDOWS_MS) as WindowName[];

/** Windows shorter than this are read close to the two instants: a price read 5 minutes away is not a 1 minute return. */
const SHORT_WINDOW_MS = 15 * 60_000;
/** For a short window the entry and the exit reads may be at most this far from the instants: about one cycle. A CHOICE of this code, not calibrated. */
export const SHORT_TOLERANCE_MS = 2 * 60_000;
/** How far from the decision the entry price may have been read, in ms, for the windows of 15 minutes or more. A CHOICE of this code, not calibrated. */
const ENTRY_TOLERANCE_MS = 5 * 60_000;
export const entryToleranceMs = (windowMs: number): number => (windowMs < SHORT_WINDOW_MS ? SHORT_TOLERANCE_MS : ENTRY_TOLERANCE_MS);
/** How late after the end of a window the exit price may have been read: one cycle for a short window, else a quarter of the window, at least five minutes. */
const exitToleranceMs = (windowMs: number): number => (windowMs < SHORT_WINDOW_MS ? SHORT_TOLERANCE_MS : Math.max(5 * 60_000, Math.floor(windowMs / 4)));

export interface PricePoint {
  readonly atMs: number;
  readonly price: number;
}
export type PathIndex = ReadonlyMap<string, readonly PricePoint[]>;

/** The prices of each token, by plan key, in time order, from the rows of `prices.jsonl`. */
export function buildPathIndex(rows: readonly PriceRow[]): PathIndex {
  const by = new Map<string, PricePoint[]>();
  for (const r of rows) {
    for (const [key, price] of Object.entries(r.prices)) {
      if (!Number.isFinite(price) || !(price > 0)) continue;
      const list = by.get(key) ?? [];
      list.push({ atMs: r.atMs, price });
      by.set(key, list);
    }
  }
  for (const list of by.values()) list.sort((a, b) => a.atMs - b.atMs);
  return by;
}

export interface ForwardReturn {
  /** Exit price over entry price minus one; null when either price is missing. */
  readonly ret: number | null;
  /** How long after the end of the window the exit price was read; null when unknown. */
  readonly lagMs: number | null;
}

/** The return of a token from a decision to the end of a window, or unknown. */
export function forwardReturn(path: readonly PricePoint[] | undefined, decisionAtMs: number, windowMs: number): ForwardReturn {
  if (path === undefined || path.length === 0) return { ret: null, lagMs: null };
  let entry: PricePoint | null = null;
  for (const p of path) {
    if (p.atMs > decisionAtMs) break;
    entry = p;
  }
  if (entry === null || decisionAtMs - entry.atMs > entryToleranceMs(windowMs)) return { ret: null, lagMs: null };
  const due = decisionAtMs + windowMs;
  const exit = path.find((p) => p.atMs >= due);
  if (exit === undefined || exit.atMs - due > exitToleranceMs(windowMs)) return { ret: null, lagMs: null };
  const ret = exit.price / entry.price - 1;
  if (!Number.isFinite(ret)) return { ret: null, lagMs: null };
  return { ret, lagMs: exit.atMs - due };
}

export interface AnswerOutcome {
  readonly cycleId: string;
  readonly id: string;
  /** What the Jev asked for before any rule of the code. */
  readonly requested: string | null;
  readonly applied: string | null;
  /** The highest Choice weight of an offered buy option; null for absent or invalid vectors. Not a calibrated probability of profit. */
  readonly preference: number | null;
  readonly returns: Readonly<Record<WindowName, number | null>>;
}

const keyOfCandidate = (id: string): string | null => {
  const m = /^buy:token:(\d+):(.+)$/.exec(id);
  return m === null ? null : planKey(m[1]!, m[2]!);
};

/** One outcome per purchase of every answer. A holding, or an id that is not a purchase of a token, gets none. */
export function outcomesOf(answers: readonly AnswerRecord[], index: PathIndex): AnswerOutcome[] {
  const out: AnswerOutcome[] = [];
  for (const a of answers) {
    const decisionAtMs = a.askedAtMs ?? a.atMs;
    for (const item of a.items) {
      if (item.kind !== "buy") continue;
      const key = keyOfCandidate(item.id);
      if (key === null) continue;
      const path = index.get(key);
      const probs = item.probs;
      const validProbs = probs !== null && Object.keys(probs).length === item.offered.length && new Set(item.offered).size === item.offered.length && item.offered.every((option) => Object.hasOwn(probs, option)) && choiceConfidence(probs) !== null;
      const buyProbs = !validProbs ? [] : Object.entries(probs).filter(([option]) => option.startsWith("buy")).map(([, p]) => p);
      const preference = probs === null || buyProbs.length === 0 ? null : Math.max(...buyProbs);
      const returns = Object.fromEntries(WINDOW_NAMES.map((w) => [w, forwardReturn(path, decisionAtMs, WINDOWS_MS[w]).ret])) as Record<WindowName, number | null>;
      out.push({ cycleId: a.cycleId, id: item.id, requested: item.requested, applied: item.applied, preference, returns });
    }
  }
  return out;
}

export interface Group {
  readonly name: string;
  readonly pick: (o: AnswerOutcome) => boolean;
}

export interface GroupSummary {
  readonly name: string;
  readonly known: number;
  /** Purchases of the group whose return could not be measured in this window: kept apart, never averaged in. */
  readonly unknown: number;
  readonly meanPct: number | null;
  readonly medianPct: number | null;
  readonly shareUpPct: number | null;
}

const pct = (v: number): number => Math.round(v * 1000) / 10;

/** The gross return of each group at one window, over the KNOWN returns only, with the unknown counted apart. */
export function summarize(outcomes: readonly AnswerOutcome[], groups: readonly Group[], window: WindowName): GroupSummary[] {
  return groups.map((g) => {
    const mine = outcomes.filter(g.pick);
    const known = mine.map((o) => o.returns[window]).filter((r): r is number => r !== null).sort((a, b) => a - b);
    const n = known.length;
    if (n === 0) return { name: g.name, known: 0, unknown: mine.length, meanPct: null, medianPct: null, shareUpPct: null };
    const mean = known.reduce((s, v) => s + v, 0) / n;
    const median = n % 2 === 1 ? known[(n - 1) / 2]! : (known[n / 2 - 1]! + known[n / 2]!) / 2;
    return { name: g.name, known: n, unknown: mine.length - n, meanPct: pct(mean), medianPct: pct(median), shareUpPct: Math.round((known.filter((v) => v > 0).length / n) * 100) };
  });
}
