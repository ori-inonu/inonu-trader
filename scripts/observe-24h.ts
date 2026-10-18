/**
 * READ-ONLY measurement of the 24 h observation of the qualified artifact (docs/sdd/agente-autonomo/PASSAGEM-ARTEFATO-QUALIFICADO-20261015.md, section 6).
 * It measures availability, recovery, receipts, decisions and the brief contract. It never writes inside the agent home, calls no POST route and
 * touches no process. The only file it can write is --save, and only OUTSIDE the home. It measures no gain: that is a different question.
 *
 *   bun --no-env-file run scripts/observe-24h.ts --home <absolute agent data dir> [--since <epoch ms or ISO>] [--gap-min 15] [--forgotten-min 10] [--port 3000] [--save report.json]
 *
 * How to read it:
 *  - Availability is NOT taken from /health (that is one sample at run time) nor from the core log alone (a crash or a reboot writes no `stopped` line).
 *    It comes from heartbeats the files leave behind: the gaps between consecutive ledger cycles and between equity writes. A gap is explained only
 *    when a known disconnected or paused interval of the agent covers it.
 *  - A `local_core_started` with no `stopped` before it is an UNCLEAN restart whose downtime is unknown.
 *  - The duplicate that matters is a new `enviando` on the same asset and side while an earlier order on it is still unresolved
 *    (`overlappingSends`); the same orderKey sent twice (`sameKeyResends`) is the narrower case and is reported apart.
 *  - What the files do not record is listed under `notMeasured`, never dropped silently.
 * Exit 0 when there are no findings, 1 otherwise. A clean run is not news; a finding is.
 */
import { isAbsolute, join, relative, resolve } from "node:path";
import { HEALTH_APP, parseLedger } from "./handover-precheck";

const MIN = 60_000;
/** The start of the 24 h observation: the first health of the artifact run by the scheduled task (2026-10-15 11:27:53 local). */
export const OBSERVATION_START_MS = 1_792_074_473_637;

export interface OrderRow {
  readonly kind?: string;
  readonly orderKey?: string;
  readonly stage?: string;
  readonly atMs?: number;
  readonly side?: string;
  readonly chainIndex?: string;
  readonly address?: string;
}
export interface Gap { readonly fromMs: number; readonly toMs: number; readonly gapMs: number }
export interface ExplainedGap extends Gap { readonly explained: boolean }
export interface Interval { readonly fromMs: number; readonly toMs: number; readonly why: string }
export interface StateEvent { readonly atMs: number; readonly kind: string }
export interface Finding { readonly id: string; readonly detail: string }

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tally = (values: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
};

/** Restarts of the core inside the window. The predecessor of a start is looked up in the whole log, so a window that begins mid-way is not misread. */
export function coreLifecycle(logText: string, sinceMs: number): {
  cleanRestarts: { stoppedAtMs: number; startedAtMs: number; downMs: number }[];
  uncleanRestarts: { startedAtMs: number }[];
} {
  const cleanRestarts: { stoppedAtMs: number; startedAtMs: number; downMs: number }[] = [];
  const uncleanRestarts: { startedAtMs: number }[] = [];
  let prev: { kind: "started" | "stopped"; atMs: number } | null = null;
  for (const line of logText.split("\n")) {
    const m = /^(\S+)\s+local_core_(started|stopped)\b/.exec(line.trim());
    if (m === null) continue;
    const atMs = Date.parse(m[1]!);
    if (!Number.isFinite(atMs)) continue;
    const kind = m[2] as "started" | "stopped";
    if (kind === "started" && atMs >= sinceMs && prev !== null) {
      if (prev.kind === "stopped") cleanRestarts.push({ stoppedAtMs: prev.atMs, startedAtMs: atMs, downMs: atMs - prev.atMs });
      else uncleanRestarts.push({ startedAtMs: atMs });
    }
    prev = { kind, atMs };
  }
  return { cleanRestarts, uncleanRestarts };
}

/** Starts of the logon watchdog, from its own log. The log writes seven fractional digits; only the milliseconds are kept. */
export function watchdogStarts(logText: string): number[] {
  const out: number[] = [];
  for (const line of logText.split("\n")) {
    const m = /^(\S+)\s+local watchdog started\b/.exec(line.trim());
    if (m === null) continue;
    const at = Date.parse(m[1]!);
    if (Number.isFinite(at)) out.push(at);
  }
  return out;
}

export interface RecoveryChain {
  coreStartedAtMs: number;
  unclean: boolean;
  /** the watchdog start that launched this core (a fresh watchdog just before it), or null when the core was restarted under a watchdog that was already alive */
  watchdogStartedAtMs: number | null;
  firstCycleAtMs: number | null;
  firstCycleOutcome: string | null;
  /** the first cycle that was decided: a first one that was only kept (a model error) must not hide it */
  firstDecidedAtMs: number | null;
  secondsToFirstCycle: number | null;
}

/**
 * The chain that proves the machine brings the agent back without anyone: a core start nobody asked for (no `stopped` line before it, so a crash,
 * a power cut or a Windows restart), launched by a FRESH watchdog start (the logon task running again), followed by a decided cycle. A clean
 * restart is listed but is never the proof. `logonProven` is a reading of the files, not a promise: use Restart in Windows (not Shut down with
 * Fast Startup, which keeps the kernel up) so the boot is also real.
 */
export function recoveryChains(
  coreStarts: readonly { startedAtMs: number; unclean: boolean }[],
  watchdogStartsMs: readonly number[],
  cycles: readonly { atMs: number; outcome?: string }[],
  watchdogLeadMs = 3 * MIN,
): { chains: RecoveryChain[]; logonProven: boolean } {
  const sorted = [...cycles].sort((a, b) => a.atMs - b.atMs);
  const chains = coreStarts.map((c): RecoveryChain => {
    const dog = watchdogStartsMs.filter((w) => w <= c.startedAtMs && c.startedAtMs - w <= watchdogLeadMs).sort((a, b) => b - a)[0] ?? null;
    const after = sorted.filter((y) => y.atMs >= c.startedAtMs);
    const first = after[0] ?? null;
    const decided = after.find((y) => y.outcome === "decidido") ?? null;
    return {
      coreStartedAtMs: c.startedAtMs, unclean: c.unclean, watchdogStartedAtMs: dog,
      firstCycleAtMs: first?.atMs ?? null, firstCycleOutcome: first === null ? null : (first.outcome ?? null), firstDecidedAtMs: decided?.atMs ?? null,
      secondsToFirstCycle: first === null ? null : Math.round((first.atMs - c.startedAtMs) / 1000),
    };
  });
  return { chains, logonProven: chains.some((c) => c.unclean && c.watchdogStartedAtMs !== null && c.firstDecidedAtMs !== null) };
}

/** Supervisor starts inside the window (the log keeps the whole history). */
export function startsSince(logText: string, event: string, sinceMs: number): number {
  return logText.split("\n").filter((line) => {
    const m = /^(\S+)\s+(\S+)/.exec(line.trim());
    return m !== null && m[2] === event && Date.parse(m[1]!) >= sinceMs;
  }).length;
}

/** Silences longer than the threshold between consecutive beats, from the start of the window to its end. */
export function heartbeatGaps(beatsMs: readonly number[], sinceMs: number, nowMs: number, thresholdMs: number): Gap[] {
  const points = [sinceMs, ...beatsMs.filter((t) => t >= sinceMs && t <= nowMs).sort((a, b) => a - b), nowMs];
  const gaps: Gap[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const gapMs = points[i]! - points[i - 1]!;
    if (gapMs > thresholdMs) gaps.push({ fromMs: points[i - 1]!, toMs: points[i]!, gapMs });
  }
  return gaps;
}

/** The intervals in which the agent was off on purpose or by its own guard: disconnected, or paused (for example by the loss breaker). */
export function offIntervals(events: readonly StateEvent[], nowMs: number): Interval[] {
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
  const raw: Interval[] = [];
  const open: Record<string, number | undefined> = {};
  const pairs: Record<string, string> = { desconectou: "conectou", pausou: "retomou" };
  for (const e of sorted) {
    if (pairs[e.kind] !== undefined && open[e.kind] === undefined) open[e.kind] = e.atMs;
    for (const [start, end] of Object.entries(pairs)) {
      if (e.kind === end && open[start] !== undefined) {
        raw.push({ fromMs: open[start]!, toMs: e.atMs, why: start });
        open[start] = undefined;
      }
    }
  }
  for (const [start, at] of Object.entries(open)) if (at !== undefined) raw.push({ fromMs: at, toMs: nowMs, why: start });
  raw.sort((a, b) => a.fromMs - b.fromMs);
  const merged: Interval[] = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last !== undefined && iv.fromMs <= last.toMs) merged[merged.length - 1] = { ...last, toMs: Math.max(last.toMs, iv.toMs) };
    else merged.push(iv);
  }
  return merged;
}

/** A gap is explained when the known off intervals cover all of it but a short remainder (a restart, one cadence step). */
export function explainGaps(gaps: readonly Gap[], off: readonly Interval[], toleranceMs = 5 * MIN): ExplainedGap[] {
  return gaps.map((g) => {
    const covered = off.reduce((sum, iv) => sum + Math.max(0, Math.min(iv.toMs, g.toMs) - Math.max(iv.fromMs, g.fromMs)), 0);
    return { ...g, explained: g.gapMs - covered <= toleranceMs };
  });
}

/** What the Windows event log says about the machine itself, read-only. */
export interface HostEvents { sleeps: { fromMs: number; toMs: number }[]; unexpectedShutdowns: number[]; bootMs: number | null }
export type GapCause = "host_sleep" | "host_power_loss";
export interface CausedGap extends ExplainedGap { cause: GapCause | null }

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** The JSON the shell hands over (a lone element may arrive as an object, not a list). Anything malformed is dropped; unreadable as a whole is null. */
export function parseHostEvents(json: string): HostEvents | null {
  try {
    const v = obj(JSON.parse(json));
    if (v === null) return null;
    const sleeps: HostEvents["sleeps"] = [];
    for (const s of listOf(v.sleeps)) {
      const o = obj(s);
      const from = typeof o?.sleep === "string" ? Date.parse(o.sleep) : Number.NaN;
      const to = typeof o?.wake === "string" ? Date.parse(o.wake) : Number.NaN;
      if (Number.isFinite(from) && Number.isFinite(to) && to >= from) sleeps.push({ fromMs: from, toMs: to });
    }
    const unexpectedShutdowns = listOf(v.unexpected).flatMap((x) => (typeof x === "string" && Number.isFinite(Date.parse(x)) ? [Date.parse(x)] : []));
    const boot = typeof v.boot === "string" ? Date.parse(v.boot) : Number.NaN;
    return { sleeps, unexpectedShutdowns, bootMs: Number.isFinite(boot) ? boot : null };
  } catch {
    return null;
  }
}

/**
 * Names the cause of a silence the agent's own state does not explain: an unexpected shutdown (Kernel-Power 41) at or just before its start is a power
 * loss, even if the machine slept afterwards; otherwise a sleep covering at least half of it. The silence stays a problem either way, now with a cause:
 * after a power loss the logon task only brings the agent back once someone signs in.
 */
export function classifyGaps(gaps: readonly ExplainedGap[], host: HostEvents | null, shutdownLeadMs = 10 * MIN): CausedGap[] {
  return gaps.map((g): CausedGap => {
    if (g.explained || host === null) return { ...g, cause: null };
    if (host.unexpectedShutdowns.some((at) => at >= g.fromMs - shutdownLeadMs && at <= g.toMs)) return { ...g, cause: "host_power_loss" };
    const asleep = host.sleeps.reduce((sum, s) => sum + Math.max(0, Math.min(s.toMs, g.toMs) - Math.max(s.fromMs, g.fromMs)), 0);
    return { ...g, cause: asleep * 2 >= g.gapMs ? "host_sleep" : null };
  });
}

export interface OrderAudit {
  readonly sent: number;
  readonly executed: number;
  readonly failed: number;
  readonly recoveredFromUncertain: number;
  /** `sendRecorded: false` means the last row is unresolved but the ledger holds no send row it recognizes: the order is not gone, its origin is unknown */
  readonly unsettled: { orderKey: string; stage: string; lastAtMs: number; sendRecorded: boolean }[];
  readonly forgotten: { orderKey: string; stage: string; lastAtMs: number; sendRecorded: boolean }[];
  readonly sameKeyResends: string[];
  readonly overlappingSends: { first: string; second: string }[];
  /** order rows stamped after now: left out of every count above */
  readonly future: number;
}

const TERMINAL = new Set(["executada", "falhou"]);
const UNRESOLVED = new Set(["enviando", "incerta"]);

/** The agent and this tool share one clock; a few seconds of slack cover a file read that races a write. */
export const CLOCK_TOLERANCE_MS = 5_000;
const isFuture = (atMs: number, nowMs: number): boolean => atMs > nowMs + CLOCK_TOLERANCE_MS;
/** Rows stamped after now: a conflict to report, never a fact to use. */
export const futureCount = (rows: readonly { atMs?: unknown }[], nowMs: number): number => rows.filter((r) => num(r.atMs) && isFuture(r.atMs, nowMs)).length;

/** (time, position in the file): the ledger is append-only, so two rows of the same millisecond are ordered by where they were written. */
const before = (aMs: number, aSeq: number, bMs: number, bSeq: number): boolean => aMs < bMs || (aMs === bMs && aSeq < bSeq);

export function orderAudit(rows: readonly OrderRow[], sinceMs: number, nowMs: number, forgottenAfterMs: number): OrderAudit {
  type Seq = OrderRow & { seq: number };
  const byKey = new Map<string, Seq[]>();
  let future = 0;
  rows.forEach((r, seq) => {
    if (r.kind !== "order" || typeof r.orderKey !== "string" || typeof r.stage !== "string" || !num(r.atMs)) return;
    if (isFuture(r.atMs, nowMs)) { future += 1; return; }
    const list = byKey.get(r.orderKey) ?? [];
    list.push({ ...r, seq });
    byKey.set(r.orderKey, list);
  });
  let sent = 0, executed = 0, failed = 0, recoveredFromUncertain = 0;
  const unsettled: OrderAudit["unsettled"] = [];
  const forgotten: OrderAudit["forgotten"] = [];
  const sameKeyResends: string[] = [];
  const sends: { key: string; sentAtMs: number; sentSeq: number; resolvedAtMs: number | null; resolvedSeq: number | null; asset: string | null }[] = [];
  for (const [orderKey, list] of byKey) {
    list.sort((a, b) => a.atMs! - b.atMs! || a.seq - b.seq);
    const last = list[list.length - 1]!;
    const sendRows = list.filter((r) => r.stage === "enviando");
    const unresolved = UNRESOLVED.has(last.stage!);
    const track = (sendRecorded: boolean): void => {
      const item = { orderKey, stage: last.stage!, lastAtMs: last.atMs!, sendRecorded };
      unsettled.push(item);
      if (nowMs - last.atMs! > forgottenAfterMs) forgotten.push(item);
    };
    if (sendRows.length === 0) {
      // an incomplete ledger must not make a pending order disappear
      if (unresolved) track(false);
      continue;
    }
    const firstSend = sendRows[0]!;
    const terminal = list.find((r) => TERMINAL.has(r.stage!) && before(firstSend.atMs!, firstSend.seq, r.atMs!, r.seq));
    const asset = typeof firstSend.chainIndex === "string" && typeof firstSend.address === "string" && typeof firstSend.side === "string" ? `${firstSend.chainIndex}:${firstSend.address}:${firstSend.side}` : null;
    sends.push({ key: orderKey, sentAtMs: firstSend.atMs!, sentSeq: firstSend.seq, resolvedAtMs: terminal === undefined ? null : terminal.atMs!, resolvedSeq: terminal === undefined ? null : terminal.seq, asset });
    if (unresolved) track(true);
    if (!sendRows.some((r) => r.atMs! >= sinceMs)) continue;
    sent += 1;
    if (last.stage === "executada") executed += 1;
    if (last.stage === "falhou") failed += 1;
    if (TERMINAL.has(last.stage!) && list.some((r) => r.stage === "incerta")) recoveredFromUncertain += 1;
    if (sendRows.length > 1) sameKeyResends.push(orderKey);
  }
  const overlappingSends: OrderAudit["overlappingSends"] = [];
  for (const second of sends) {
    if (second.asset === null || second.sentAtMs < sinceMs) continue;
    for (const first of sends) {
      if (first.key === second.key || first.asset !== second.asset || !before(first.sentAtMs, first.sentSeq, second.sentAtMs, second.sentSeq)) continue;
      const settledBefore = first.resolvedAtMs !== null && first.resolvedSeq !== null && before(first.resolvedAtMs, first.resolvedSeq, second.sentAtMs, second.sentSeq);
      if (!settledBefore) overlappingSends.push({ first: first.key, second: second.key });
    }
  }
  return { sent, executed, failed, recoveredFromUncertain, unsettled, forgotten, sameKeyResends, overlappingSends, future };
}

export interface FillRow { readonly kind?: string; readonly atMs?: number; readonly side?: string; readonly mint?: string; readonly symbol?: string; readonly cashUnits?: number }
/** `cashFlowUsd` is cash received minus cash paid by the fills inside the window, in the stablecoin of the trade. It excludes fees and cost basis, can include a leg that began before the window, and is NOT a result or a realized PnL: never hand it on as one. */
export interface Churn { symbol: string; mint: string; buys: number; sells: number; cashFlowUsd: number; fastExits: number; reEntries: number }

/**
 * Round trips per token from the real fills: a sell soon after a buy of the same token (fast exit) and a buy soon after a sell (re-entry) are the
 * signature of a decision that flips from one cycle to the next. The predecessor of a fill is looked up in all fills, so a window that begins
 * mid-loop still sees it. Fills stamped after now are ignored (count them with `futureCount`).
 */
export function churnAudit(fills: readonly FillRow[], sinceMs: number, nowMs: number, fastExitMs = 10 * MIN, reentryMs = 30 * MIN): Churn[] {
  const byMint = new Map<string, FillRow[]>();
  for (const f of fills) {
    if (f.kind !== "fill" || typeof f.mint !== "string" || !num(f.atMs) || isFuture(f.atMs, nowMs) || !num(f.cashUnits) || (f.side !== "buy" && f.side !== "sell")) continue;
    const list = byMint.get(f.mint) ?? [];
    list.push(f);
    byMint.set(f.mint, list);
  }
  const out: Churn[] = [];
  for (const [mint, list] of byMint) {
    list.sort((a, b) => a.atMs! - b.atMs!);
    const c: Churn = { symbol: list.find((f) => typeof f.symbol === "string")?.symbol ?? mint, mint, buys: 0, sells: 0, cashFlowUsd: 0, fastExits: 0, reEntries: 0 };
    list.forEach((f, i) => {
      if (f.atMs! < sinceMs) return;
      const prev = i > 0 ? list[i - 1]! : null;
      if (f.side === "buy") {
        c.buys += 1;
        c.cashFlowUsd -= f.cashUnits!;
        if (prev !== null && prev.side === "sell" && f.atMs! - prev.atMs! <= reentryMs) c.reEntries += 1;
      } else {
        c.sells += 1;
        c.cashFlowUsd += f.cashUnits!;
        if (prev !== null && prev.side === "buy" && f.atMs! - prev.atMs! <= fastExitMs) c.fastExits += 1;
      }
    });
    if (c.buys + c.sells > 0) out.push(c);
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** The same candidate refused for the same reason again and again: the model keeps choosing what the code keeps refusing. */
export function repeatedRefusals(rows: readonly { kind?: string; stage?: string; reason?: string | null; candidateId?: string; symbol?: string; atMs?: number }[], sinceMs: number, nowMs: number): { candidateId: string; symbol: string; reason: string; count: number }[] {
  const groups = new Map<string, { candidateId: string; symbol: string; reason: string; count: number }>();
  for (const r of rows) {
    if (r.kind !== "order" || r.stage !== "falhou" || typeof r.reason !== "string" || typeof r.candidateId !== "string" || !num(r.atMs) || r.atMs < sinceMs || isFuture(r.atMs, nowMs)) continue;
    const key = `${r.candidateId}|${r.reason}`;
    const g = groups.get(key) ?? { candidateId: r.candidateId, symbol: r.symbol ?? r.candidateId, reason: r.reason, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export interface CycleRow {
 readonly kind?: string;
 readonly cycleId?: string | null;
 readonly atMs?: number;
 readonly outcome?: string;
 readonly reason?: string | null;
 readonly dropped?: unknown;
}

export interface DedupedCycles {
 /** In-window rows not stamped in the future, one final phase per ID plus every legacy row without an ID. */
 readonly cycles: readonly CycleRow[];
 readonly rows: number;
 readonly uniqueIds: number;
 readonly duplicateRows: number;
 readonly legacyRows: number;
 /** Rows in the requested window but beyond the clock tolerance; excluded before deduplication. */
 readonly future: number;
}

/**
 * Keeps the last recorded phase per nonempty cycleId. Rows without an ID remain independent legacy cycles;
 * timestamps are never used as identity. Future rows are excluded before grouping so they cannot replace a past phase.
 */
export function dedupeCycles(rows: readonly CycleRow[], sinceMs: number, nowMs: number): DedupedCycles {
 const inWindow = rows.filter((r) => r.kind === "cycle" && num(r.atMs) && r.atMs >= sinceMs);
 const past = inWindow.filter((r) => !isFuture(r.atMs!, nowMs));
 const byId = new Map<string, CycleRow>();
 const legacy: CycleRow[] = [];
 for (const row of past) {
  if (typeof row.cycleId !== "string" || row.cycleId.length === 0) legacy.push(row);
  else byId.set(row.cycleId, row);
 }
 const uniqueCycles = [...byId.values()];
 const cycles = [...uniqueCycles, ...legacy].sort((a, b) => a.atMs! - b.atMs!);
 const rowsCount = past.length;
 return {
  cycles,
  rows: rowsCount,
  uniqueIds: uniqueCycles.length,
  duplicateRows: rowsCount - uniqueCycles.length - legacy.length,
  legacyRows: legacy.length,
  future: inWindow.length - past.length,
 };
}

export function cycleAudit(rows: readonly CycleRow[], sinceMs: number, nowMs: number): {
  total: number; outcomes: Record<string, number>; reasons: Record<string, number>; withDropped: number; future: number;
 rows: number; uniqueIds: number; duplicateRows: number; legacyRows: number;
} {
 const deduped = dedupeCycles(rows, sinceMs, nowMs);
 const cycles = deduped.cycles;
  return {
    total: cycles.length,
    outcomes: tally(cycles.map((c) => c.outcome ?? "sem_resultado")),
    reasons: tally(cycles.flatMap((c) => (typeof c.reason === "string" ? [c.reason] : []))),
    withDropped: cycles.filter((c) => Array.isArray(c.dropped) && c.dropped.length > 0).length,
  future: deduped.future,
  rows: deduped.rows,
  uniqueIds: deduped.uniqueIds,
  duplicateRows: deduped.duplicateRows,
  legacyRows: deduped.legacyRows,
  };
}

/** `maxLength` is the largest `briefBytes` the cycle recorded, which is `JSON.stringify(brief).length` (characters), not a measure of UTF-8 bytes. */
export function briefAudit(rows: readonly { atMs?: number; valid?: boolean; invalidReason?: string | null; briefBytes?: number }[], sinceMs: number, nowMs: number): {
  total: number; invalid: number; invalidReasons: Record<string, number>; maxLength: number; future: number;
} {
  const all = rows.filter((r) => num(r.atMs) && r.atMs >= sinceMs);
  const briefs = all.filter((r) => !isFuture(r.atMs!, nowMs));
  const invalid = briefs.filter((b) => b.valid === false);
  return {
    total: briefs.length,
    invalid: invalid.length,
    invalidReasons: tally(invalid.map((b) => b.invalidReason ?? "sem_motivo")),
    maxLength: briefs.reduce((m, b) => (num(b.briefBytes) ? Math.max(m, b.briefBytes) : m), 0),
    future: all.length - briefs.length,
  };
}

export function decisionLatency(rows: readonly { atMs?: number; metadata?: { askedAtMs?: number; answeredAtMs?: number } }[], sinceMs: number, nowMs: number): {
  total: number; p50Ms: number | null; maxMs: number | null; future: number; conflicts: number;
} {
  const all = rows.filter((r) => num(r.atMs) && r.atMs >= sinceMs && num(r.metadata?.askedAtMs) && num(r.metadata?.answeredAtMs));
  const inWindow = all.filter((r) => !isFuture(r.atMs!, nowMs));
  const diffs = inWindow.map((r) => r.metadata!.answeredAtMs! - r.metadata!.askedAtMs!);
  const lat = diffs.filter((d) => d >= 0).sort((a, b) => a - b);
  return {
    total: lat.length, p50Ms: lat.length === 0 ? null : lat[Math.floor((lat.length - 1) / 2)]!, maxMs: lat.length === 0 ? null : lat[lat.length - 1]!,
    future: all.length - inWindow.length, conflicts: diffs.length - lat.length,
  };
}

export interface FileCoverage { file: string; required: boolean; present: boolean; rows: number; malformed: number; inWindow: number }

/** A window whose evidence is missing, empty or truncated is unknown, never clean. A missing optional file (no fill ever recorded) is not a finding. */
export function coverageFindings(cov: readonly FileCoverage[]): Finding[] {
  const out: Finding[] = [];
  const missing = cov.filter((c) => c.required && (!c.present || c.rows === 0));
  if (missing.length > 0) out.push({ id: "file_missing", detail: `required evidence is missing or empty, so the window is unknown, not clean: ${missing.map((c) => c.file).join(", ")}` });
  const bad = cov.filter((c) => c.present && c.malformed > 0);
  if (bad.length > 0) out.push({ id: "malformed_lines", detail: `malformed lines (a truncated or damaged file): ${bad.map((c) => `${c.file} x${c.malformed}`).join(", ")}` });
  return out;
}

// ---- allocation and speed (ADENDO-H): measured, not asserted ----

/** Solana stablecoins as `501:<mint>` (USDC, USDT): what counts as cash. */
export const STABLE_IDS: ReadonlySet<string> = new Set(["501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "501:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const median = (sorted: readonly number[]): number => sorted[Math.floor((sorted.length - 1) / 2)]!;
const nearestRank = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;

export interface EquityRow { readonly atMs?: number; readonly holdings?: readonly { id?: string; units?: number; priceUsd?: number | null }[] }
export interface PortfolioSnapshot {
  atMs: number; totalUsd: number; cashUsd: number;
  /** null when nothing is priced: no shares to report, not a zero */
  cashShare: number | null; top1Share: number | null; hhi: number | null;
  /** priced holdings that are not stablecoins and are worth at least one dollar (gas and dust are not positions) */
  positions: number;
  /** holdings with units but no price: their value is unknown, never counted as zero value held */
  unpriced: number;
}

/** One look at the wallet from an `equity.jsonl` row. `hhi` is the sum of squared weights over the priced holdings (1 = everything in one asset, cash included). */
export function portfolioSnapshot(row: EquityRow): PortfolioSnapshot | null {
  if (!num(row.atMs) || !Array.isArray(row.holdings)) return null;
  let total = 0, cash = 0, positions = 0, unpriced = 0, top = 0;
  const values: number[] = [];
  for (const h of row.holdings) {
    const units = num(h.units) ? h.units : 0;
    const price = num(h.priceUsd) ? h.priceUsd : 0;
    if (units > 0 && !(price > 0)) { unpriced += 1; continue; }
    const value = units * price;
    if (!(value > 0)) continue;
    values.push(value);
    total += value;
    if (typeof h.id === "string" && STABLE_IDS.has(h.id)) cash += value;
    else {
      top = Math.max(top, value);
      if (value >= 1) positions += 1;
    }
  }
  if (total <= 0) return { atMs: row.atMs, totalUsd: 0, cashUsd: 0, cashShare: null, top1Share: null, hhi: null, positions: 0, unpriced };
  return {
    atMs: row.atMs, totalUsd: round6(total), cashUsd: round6(cash), cashShare: cash / total, top1Share: top / total,
    hhi: values.reduce((s, v) => s + (v / total) ** 2, 0), positions, unpriced,
  };
}

export interface AllocationAudit {
  samples: number; future: number; first: PortfolioSnapshot | null; last: PortfolioSnapshot | null;
  minCashShare: number | null; maxCashShare: number | null; meanCashShare: number | null;
  /** minutes of the window in which at least `mostlyCash` of the wallet was in stablecoins; a silence longer than the cap between two samples counts only the cap */
  minutesMostlyCash: number;
  /** last total minus first total: marks, trades and any deposit or withdrawal mixed together. Not a result. */
  markToMarketChangeUsd: number | null;
  markToMarketNote: string;
}

export function allocationAudit(rows: readonly EquityRow[], sinceMs: number, nowMs: number, mostlyCash = 0.8, capMs = 15 * MIN): AllocationAudit {
  const inRange = rows.filter((r) => num(r.atMs) && r.atMs >= sinceMs);
  const future = inRange.filter((r) => isFuture(r.atMs!, nowMs)).length;
  const snaps = inRange.filter((r) => !isFuture(r.atMs!, nowMs)).map(portfolioSnapshot).filter((s): s is PortfolioSnapshot => s !== null).sort((a, b) => a.atMs - b.atMs);
  const shares = snaps.flatMap((s) => (s.cashShare === null ? [] : [s.cashShare]));
  let mostlyMs = 0;
  for (let i = 0; i + 1 < snaps.length; i += 1) {
    if (snaps[i]!.cashShare !== null && snaps[i]!.cashShare! >= mostlyCash) mostlyMs += Math.min(snaps[i + 1]!.atMs - snaps[i]!.atMs, capMs);
  }
  const first = snaps[0] ?? null;
  const last = snaps[snaps.length - 1] ?? null;
  return {
    samples: snaps.length, future, first, last,
    minCashShare: shares.length === 0 ? null : Math.min(...shares), maxCashShare: shares.length === 0 ? null : Math.max(...shares),
    meanCashShare: shares.length === 0 ? null : shares.reduce((s, v) => s + v, 0) / shares.length,
    minutesMostlyCash: Math.round(mostlyMs / MIN),
    markToMarketChangeUsd: first === null || last === null ? null : round6(last.totalUsd - first.totalUsd),
    markToMarketNote: "last total minus first total: marks, trades and any external deposit or withdrawal mixed together; the agent files do not record flows, so this is not a result",
  };
}

/** Seconds between consecutive cycles: the floor of how fast the agent can react. A disconnected stretch inflates the worst gap, not the median. */
export function cadenceOf(timesMs: readonly number[]): { samples: number; p50Sec: number; p90Sec: number; maxSec: number } | null {
  const sorted = [...timesMs].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((t, i) => Math.round((t - sorted[i]!) / 1000)).sort((a, b) => a - b);
  return { samples: sorted.length, p50Sec: median(gaps), p90Sec: nearestRank(gaps, 0.9), maxSec: gaps[gaps.length - 1]! };
}

/** How many candidates the model is shown per cycle. It says nothing about the size of the market behind them. */
export function candidateCoverage(rows: readonly { atMs?: number; brief?: { compras?: unknown; posicoes?: unknown } }[], sinceMs: number, nowMs: number): {
  briefs: number; buyCandidatesP50: number | null; buyCandidatesMax: number | null; holdingsP50: number | null;
} {
  const briefs = rows.filter((r) => num(r.atMs) && r.atMs >= sinceMs && !isFuture(r.atMs, nowMs));
  const size = (v: unknown): number => Object.keys(obj(v) ?? {}).length;
  const buys = briefs.map((r) => size(r.brief?.compras)).sort((a, b) => a - b);
  const holds = briefs.map((r) => size(r.brief?.posicoes)).sort((a, b) => a - b);
  return { briefs: briefs.length, buyCandidatesP50: buys.length === 0 ? null : median(buys), buyCandidatesMax: buys.length === 0 ? null : buys[buys.length - 1]!, holdingsP50: holds.length === 0 ? null : median(holds) };
}

/** Network fees of the real fills in the window, in SOL. A cost to weigh against a result, not a result. */
export function networkFees(fills: readonly { kind?: string; atMs?: number; walletFeeLamports?: string; feeLamports?: string }[], sinceMs: number, nowMs: number): { fills: number; sol: number } {
  const mine = fills.filter((f) => f.kind === "fill" && num(f.atMs) && f.atMs >= sinceMs && !isFuture(f.atMs, nowMs));
  const lamports = mine.reduce((s, f) => s + (Number(f.walletFeeLamports ?? f.feeLamports ?? 0) || 0), 0);
  return { fills: mine.length, sol: lamports / 1e9 };
}

export interface FindingInputs {
  readonly healthNow: { ok?: unknown; app?: unknown } | null;
  readonly uncleanRestarts: readonly { startedAtMs: number }[];
  readonly gaps: readonly (ExplainedGap & { cause?: GapCause | null })[];
  readonly orders: { unsettled: readonly { orderKey: string }[]; forgotten: readonly { orderKey: string }[]; sameKeyResends: readonly string[]; overlappingSends: readonly { first: string; second: string }[] };
  readonly briefs: { total: number; invalid: number };
  readonly churn?: readonly { symbol: string; reEntries: number }[];
  readonly refusals?: readonly { symbol: string; count: number }[];
  /** rows stamped after now plus answers that came before their question, summed over all files */
  readonly temporalConflicts?: number;
}

/** Thresholds for the two behaviour findings: re-entries after a quick exit, and the same refusal repeated. */
export const CHURN_REENTRIES = 3;
export const REPEATED_REFUSALS = 3;

/** What is worth telling a person. An explained gap (the agent was disconnected on purpose or by its own breaker) is not a finding. */
export function deriveFindings(i: FindingInputs): Finding[] {
  const out: Finding[] = [];
  if (i.healthNow === null || i.healthNow.ok !== true || i.healthNow.app !== HEALTH_APP) out.push({ id: "health_down", detail: "/health did not answer as the Inonu core at run time (one sample, not availability)" });
  if (i.uncleanRestarts.length > 0) out.push({ id: "unclean_restart", detail: `${i.uncleanRestarts.length} core start(s) with no stop before them: a crash or a reboot, downtime unknown` });
  const hostDown = i.gaps.filter((g) => !g.explained && g.cause);
  if (hostDown.length > 0) {
    const names = [...new Set(hostDown.map((g) => (g.cause === "host_power_loss" ? "power loss" : "machine sleep")))].join(" and ");
    out.push({ id: "host_down", detail: `the machine, not the agent, was down: ${hostDown.length} silence(s) caused by ${names}, the longest ${Math.round(Math.max(...hostDown.map((g) => g.gapMs)) / MIN)} min` });
  }
  const open = i.gaps.filter((g) => !g.explained && !g.cause);
  if (open.length > 0) out.push({ id: "unexplained_gap", detail: `${open.length} silence(s) in the ledger or equity heartbeat that no disconnected or paused interval covers, the longest ${Math.round(Math.max(...open.map((g) => g.gapMs)) / MIN)} min` });
  if (i.orders.unsettled.length > 0) out.push({ id: "unsettled_order", detail: `${i.orders.unsettled.length} order(s) still sending or uncertain: ${i.orders.unsettled.map((o) => o.orderKey).join(", ")}` });
  if (i.orders.forgotten.length > 0) out.push({ id: "forgotten_order", detail: `${i.orders.forgotten.length} unresolved order(s) older than the limit` });
  if (i.orders.sameKeyResends.length > 0) out.push({ id: "same_key_resend", detail: `the same order key was sent more than once: ${i.orders.sameKeyResends.join(", ")}` });
  if (i.orders.overlappingSends.length > 0) out.push({ id: "overlapping_send", detail: `a new send on the same asset and side while an earlier order was unresolved: ${i.orders.overlappingSends.map((p) => `${p.first} then ${p.second}`).join("; ")}` });
  if (i.briefs.invalid > 0) out.push({ id: "invalid_brief", detail: `${i.briefs.invalid} of ${i.briefs.total} briefs were not valid under the contract` });
  const churners = (i.churn ?? []).filter((c) => c.reEntries >= CHURN_REENTRIES);
  if (churners.length > 0) out.push({ id: "churn", detail: `bought again right after selling: ${churners.map((c) => `${c.symbol} x${c.reEntries}`).join(", ")}` });
  const refused = (i.refusals ?? []).filter((r) => r.count >= REPEATED_REFUSALS);
  if (refused.length > 0) out.push({ id: "repeated_refusal", detail: `the same candidate refused again and again: ${refused.map((r) => `${r.symbol} x${r.count}`).join(", ")}` });
  if ((i.temporalConflicts ?? 0) > 0) out.push({ id: "temporal_conflict", detail: `${i.temporalConflicts} row(s) stamped after now or answered before asked: left out of every count, not used as fact` });
  return out;
}

// ---- the executable shell ----

/** Absent is not the same as empty: a missing file is never read as "zero observed". */
async function fileInfo(path: string): Promise<{ present: boolean; text: string }> {
  const f = Bun.file(path);
  return (await f.exists()) ? { present: true, text: await f.text().catch(() => "") } : { present: false, text: "" };
}

export interface Args { readonly home: string; readonly sinceMs: number; readonly gapMs: number; readonly forgottenMs: number; readonly port: number; readonly save: string | null }

export function parseArgs(argv: readonly string[]): { ok: true; args: Args } | { ok: false; error: string } {
  const get = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? null) : null; };
  const home = get("--home");
  if (home === null || !isAbsolute(home)) return { ok: false, error: "--home must be an absolute path to the agent data dir" };
  const sinceRaw = get("--since");
  const sinceMs = sinceRaw === null ? OBSERVATION_START_MS : /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : Date.parse(sinceRaw);
  if (!Number.isFinite(sinceMs)) return { ok: false, error: "--since must be epoch milliseconds or an ISO date" };
  const gapMin = Number(get("--gap-min") ?? 15);
  const forgottenMin = Number(get("--forgotten-min") ?? 10);
  const port = Number(get("--port") ?? 3000);
  if (![gapMin, forgottenMin, port].every((n) => Number.isFinite(n) && n > 0)) return { ok: false, error: "--gap-min, --forgotten-min and --port must be positive numbers" };
  const save = get("--save");
  if (save !== null) {
    if (!isAbsolute(save)) return { ok: false, error: "--save must be an absolute file path" };
    const rel = relative(resolve(home), resolve(save));
    if (!rel.startsWith("..") && !isAbsolute(rel)) return { ok: false, error: "--save must be OUTSIDE the agent home" };
  }
  return { ok: true, args: { home: resolve(home), sinceMs, gapMs: gapMin * MIN, forgottenMs: forgottenMin * MIN, port, save: save === null ? null : resolve(save) } };
}

/** The Windows event log, read-only, through PowerShell. Null when it cannot be read (then no silence gets a cause). */
async function readHostEvents(sinceMs: number): Promise<HostEvents | null> {
  const start = new Date(sinceMs - 12 * 3_600_000).toISOString();
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    `$st=([DateTime]::Parse('${start}')).ToUniversalTime().ToLocalTime()`,
    "$sl=@(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Power-Troubleshooter';Id=1;StartTime=$st} | ForEach-Object { $x=[xml]$_.ToXml(); $d=@{}; foreach($n in $x.Event.EventData.Data){$d[$n.Name]=$n.'#text'}; [pscustomobject]@{sleep=$d['SleepTime'];wake=$d['WakeTime']} })",
    "$un=@(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Kernel-Power';Id=41;StartTime=$st} | ForEach-Object { $_.TimeCreated.ToUniversalTime().ToString('o') })",
    "$boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')",
    "[pscustomobject]@{sleeps=$sl;unexpected=$un;boot=$boot} | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
  try {
    const proc = Bun.spawn(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], { stdout: "pipe", stderr: "ignore" });
    const timer = setTimeout(() => proc.kill(), 30_000);
    const text = await new Response(proc.stdout).text();
    clearTimeout(timer);
    return parseHostEvents(text.trim());
  } catch {
    return null;
  }
}

async function sampleHealth(port: number): Promise<{ ok?: unknown; app?: unknown; uptimeMs?: unknown } | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    return r.status === 200 ? ((await r.json()) as { ok?: unknown; app?: unknown; uptimeMs?: unknown }) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(Bun.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    return 2;
  }
  const a = parsed.args;
  const logs = resolve(a.home, "..", "..", "logs");
  const files = await Promise.all([
    fileInfo(join(a.home, "ledger.jsonl")), fileInfo(join(a.home, "equity.jsonl")), fileInfo(join(a.home, "briefs.jsonl")), fileInfo(join(a.home, "decisions-meta.jsonl")), fileInfo(join(a.home, "fills.jsonl")),
    fileInfo(join(a.home, "state.json")), fileInfo(join(a.home, "budget.json")), fileInfo(join(logs, "local-core.log")), fileInfo(join(logs, "local-supervisor.log")), fileInfo(join(logs, "autostart-local.log")),
  ]);
  const [ledgerF, equityF, briefsF, metaF, fillsF, stateF, budgetF, coreF, supervisorF, watchdogF] = files;
  const healthNow = await sampleHealth(a.port);
  // taken AFTER the reads: a row written while the files were being read is not "in the future"
  const nowMs = Date.now();
  const ledger = parseLedger(ledgerF!.text);
  const equity = parseLedger(equityF!.text);
  const briefsRows = parseLedger(briefsF!.text);
  const metaRows = parseLedger(metaF!.text);
  const fillsRows = parseLedger(fillsF!.text);
  const rows = ledger.rows as Record<string, any>[];
  const inWindow = (list: readonly { atMs?: unknown }[]): number => list.filter((r) => num(r.atMs) && r.atMs >= a.sinceMs && !isFuture(r.atMs, nowMs)).length;
  const coverage: FileCoverage[] = [
    { file: "ledger.jsonl", required: true, present: ledgerF!.present, rows: ledger.rows.length, malformed: ledger.malformed, inWindow: inWindow(ledger.rows) },
    { file: "equity.jsonl", required: true, present: equityF!.present, rows: equity.rows.length, malformed: equity.malformed, inWindow: inWindow(equity.rows) },
    { file: "briefs.jsonl", required: true, present: briefsF!.present, rows: briefsRows.rows.length, malformed: briefsRows.malformed, inWindow: inWindow(briefsRows.rows) },
    { file: "decisions-meta.jsonl", required: true, present: metaF!.present, rows: metaRows.rows.length, malformed: metaRows.malformed, inWindow: inWindow(metaRows.rows) },
    { file: "fills.jsonl", required: false, present: fillsF!.present, rows: fillsRows.rows.length, malformed: fillsRows.malformed, inWindow: inWindow(fillsRows.rows) },
    { file: "state.json", required: true, present: stateF!.present, rows: stateF!.text.trim() === "" ? 0 : 1, malformed: 0, inWindow: 0 },
    { file: "budget.json", required: false, present: budgetF!.present, rows: budgetF!.text.trim() === "" ? 0 : 1, malformed: 0, inWindow: 0 },
    { file: "logs/local-core.log", required: true, present: coreF!.present, rows: coreF!.text.split("\n").filter((l) => l.trim() !== "").length, malformed: 0, inWindow: 0 },
    { file: "logs/local-supervisor.log", required: false, present: supervisorF!.present, rows: supervisorF!.text.split("\n").filter((l) => l.trim() !== "").length, malformed: 0, inWindow: 0 },
    { file: "logs/autostart-local.log", required: false, present: watchdogF!.present, rows: watchdogF!.text.split("\n").filter((l) => l.trim() !== "").length, malformed: 0, inWindow: 0 },
  ];
  const state = (() => { try { return JSON.parse(stateF!.text) as { events?: StateEvent[] }; } catch { return {} as { events?: StateEvent[] }; } })();
  const budget = (() => { try { return JSON.parse(budgetF!.text) as Record<string, unknown>; } catch { return null; } })();
  const off = offIntervals((state.events ?? []).filter((e) => num(e.atMs) && typeof e.kind === "string"), nowMs).filter((iv) => iv.toMs >= a.sinceMs);
  const beats = (list: readonly { atMs?: unknown }[]): number[] => list.filter((r) => num(r.atMs) && !isFuture(r.atMs, nowMs)).map((r) => r.atMs as number);
 const cycleData = dedupeCycles(rows, a.sinceMs, nowMs);
 const cycleBeats = cycleData.cycles.map((r) => r.atMs!);
  const equityBeats = beats(equity.rows);
  const hostEvents = await readHostEvents(a.sinceMs);
  const cycleGaps = classifyGaps(explainGaps(heartbeatGaps(cycleBeats, a.sinceMs, nowMs, a.gapMs), off), hostEvents);
  const equityGaps = classifyGaps(explainGaps(heartbeatGaps(equityBeats, a.sinceMs, nowMs, a.gapMs), off), hostEvents);
  const core = coreLifecycle(coreF!.text, a.sinceMs);
  const recovery = recoveryChains(
    [...core.cleanRestarts.map((c) => ({ startedAtMs: c.startedAtMs, unclean: false })), ...core.uncleanRestarts.map((u) => ({ startedAtMs: u.startedAtMs, unclean: true }))],
    watchdogStarts(watchdogF!.text),
  cycleData.cycles.map((r) => ({ atMs: r.atMs!, outcome: typeof r.outcome === "string" ? r.outcome : undefined })),
  );
  const orders = orderAudit(rows as OrderRow[], a.sinceMs, nowMs, a.forgottenMs);
  const cycles = cycleAudit(rows, a.sinceMs, nowMs);
  const briefs = briefAudit(briefsRows.rows as never, a.sinceMs, nowMs);
  const decisions = decisionLatency(metaRows.rows as never, a.sinceMs, nowMs);
  const churn = churnAudit(fillsRows.rows as FillRow[], a.sinceMs, nowMs);
  const refusals = repeatedRefusals(rows, a.sinceMs, nowMs);
  const allocation = {
    portfolio: allocationAudit(equity.rows as EquityRow[], a.sinceMs, nowMs),
    cadence: cadenceOf(cycleBeats.filter((at) => at >= a.sinceMs)),
    coverage: candidateCoverage(briefsRows.rows as never, a.sinceMs, nowMs),
    networkFees: networkFees(fillsRows.rows as never, a.sinceMs, nowMs),
  };
  const temporalConflicts = orders.future + cycles.future + briefs.future + decisions.future + decisions.conflicts + futureCount(fillsRows.rows, nowMs) + futureCount(equity.rows, nowMs);
  const findings = [...deriveFindings({ healthNow, uncleanRestarts: core.uncleanRestarts, gaps: [...cycleGaps, ...equityGaps], orders, briefs, churn, refusals, temporalConflicts }), ...coverageFindings(coverage)];
  const report = {
    mode: "observe-24h",
    at: new Date(nowMs).toISOString(),
    window: { sinceMs: a.sinceMs, since: new Date(a.sinceMs).toISOString(), hours: Math.round(((nowMs - a.sinceMs) / 3_600_000) * 100) / 100 },
    availability: {
      healthSample: healthNow === null ? null : { ok: healthNow.ok, app: healthNow.app, uptimeMs: healthNow.uptimeMs, label: "one sample at run time, not availability" },
      core,
      supervisorStarts: startsSince(supervisorF!.text, "local_started", a.sinceMs),
      cycleGaps, equityGaps, offIntervals: off,
      hostEvents: hostEvents === null ? null : { sleepsInWindow: hostEvents.sleeps.filter((s) => s.toMs >= a.sinceMs).length, unexpectedShutdownsInWindow: hostEvents.unexpectedShutdowns.filter((u) => u >= a.sinceMs).length, bootAt: hostEvents.bootMs === null ? null : new Date(hostEvents.bootMs).toISOString() },
    },
    recovery,
    allocation,
    cycles,
    orders,
    behaviour: { churn, refusals },
    briefs,
    decisions,
    budget: budget === null ? null : { day: budget.day, consults: budget.consults, committedTokens: budget.committedTokens, measuredTokens: budget.measuredTokens, unmeasuredCalls: budget.unmeasuredCalls },
    coverage,
    temporalConflicts,
    notMeasured: [
      "source age: the brief records no per-source timestamps",
      "clock skew: no value is recorded in the agent files",
      "provider failures: only the reasons of non-decided cycles are visible (see cycles.reasons)",
      "reboot recovery: read from recovery.logonProven, which turns true only after a restart nobody asked for (see recoveryChains); until then it is not proven",
      "host sleep and power loss: read from the Windows event log; when that log cannot be read a silence has no cause, only the label unexplained",
      "external flows: deposits and withdrawals are not in the agent files, so allocation.portfolio.markToMarketChangeUsd mixes trading, marks and flows",
      "market coverage: the size of the universe behind the candidate list is not recorded, only how many candidates the model is shown (allocation.coverage)",
      "event-to-decision latency: no market-event timestamp is recorded, only the cycle cadence and the model answer time",
      "gain: this tool measures operation, not profit",
    ],
    findings,
  };
  if (a.save !== null) await Bun.write(a.save, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return findings.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
