import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { absoluteArg } from "../local-host/args";
import { MAX_BOOK_AGE_MS } from "../agent/gate";
import { SIZING } from "../opportunity/sizing";
import { dailyOpportunities } from "./cadence";

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const uint = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const code = (v: unknown): string | null => typeof v === "string" && /^[A-Za-z0-9_:./@-]{1,180}$/.test(v) ? v : null;
const bool = (v: unknown): boolean | null => typeof v === "boolean" ? v : null;
const hasRef = (r: Record<string, unknown>): boolean => typeof r.ref === "string" && (r.chainIndex === "501" ? /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(r.ref) : /^0x[0-9a-fA-F]{64}$/.test(r.ref));

export interface RuntimeProjection {
  readonly observedAtMs: number;
  readonly connected: boolean | null;
  readonly authority: string | null;
  readonly authorityBlocked: string | null;
  readonly lock: boolean | null;
  readonly purchases: { readonly paused: boolean | null; readonly reason: string | null; readonly untilMs: number | null };
  readonly scheduler: { readonly started: boolean | null; readonly intervalMin: number | null; readonly nextAtMs: number | null };
  readonly budget: { readonly day: string | null; readonly used: number | null; readonly maximum: number | null; readonly remaining: number | null; readonly nominalOpportunities: number | null; readonly resetsAtMs: number };
  readonly book: { readonly ageMs: number | null; readonly managedOk: boolean | null; readonly positions: number; readonly valuedHoldings: number; readonly holdingsAboveMinimum: number; readonly unknownHoldings: number } | null;
  readonly last: { readonly cycleId: string | null; readonly atMs: number | null; readonly durationMs: number | null; readonly consulted: boolean | null; readonly reason: string | null; readonly holdings: number | null; readonly buys: number | null; readonly notes: readonly string[] } | null;
  readonly inFlight: { readonly count: number; readonly withReference: number; readonly withoutReference: number };
  readonly findings: readonly string[];
}

/** Only a projection of local status. It excludes addresses, values and secret-like free text and never starts, repairs or settles financial work. */
export function projectRuntime(raw: unknown, observedAtMs: number): RuntimeProjection | null {
  const envelope = obj(raw), s = obj(envelope?.status);
  if (envelope?.ok !== true || s === null || uint(observedAtMs) === null) return null;
  const state = obj(s.state), authority = obj(s.authority), scheduler = obj(s.scheduler), budget = obj(s.budget), limits = obj(budget?.limits);
  if (state === null || scheduler === null || budget === null || !Array.isArray(s.inFlight) || s.inFlight.length > 100) return null;
  const intervalMin = uint(scheduler.intervalMin);
  const nominalOpportunities = intervalMin !== null && intervalMin > 0 ? dailyOpportunities(intervalMin) : null;
  const maximum = uint(limits?.maxConsultsPerDay), used = uint(budget.consults);
  const b = obj(s.book), last = obj(s.last), considered = obj(last?.considered);
  const positions = b !== null && Array.isArray(b.positions) && b.positions.length <= 2000 ? b.positions.map(obj).filter((r): r is Record<string, unknown> => r !== null) : [];
  const holdings = positions.filter(p => p.isCash === false && p.wallet === "agente");
  const valuedHoldings = holdings.filter(p => typeof p.usd === "number" && Number.isFinite(p.usd) && p.usd > 0).length;
  const holdingsAboveMinimum = holdings.filter(p => typeof p.usd === "number" && Number.isFinite(p.usd) && p.usd >= SIZING.minOrderUsd).length;
  const bookAt = uint(b?.atMs), bookAgeMs = bookAt === null ? null : observedAtMs - bookAt;
  const pending = s.inFlight.map(obj).filter((r): r is Record<string, unknown> => r !== null);
  if (pending.length !== s.inFlight.length) return null;
  const withReference = pending.filter(hasRef).length;
  const findings = new Set<string>();
  const connected = bool(state.connected), started = bool(scheduler.started);
  const paused = bool(s.paused);
  const level = typeof authority?.level === "string" && ["desligado", "analise", "dinheiro"].includes(authority.level) ? authority.level : null;
  if (connected === false) findings.add("agent_disconnected");
  if (started === false) findings.add("scheduler_stopped");
  if (paused === true) findings.add("new_purchases_paused");
  if (s.lock === false) findings.add("financial_lock_not_owned");
  if (connected === true && level !== "dinheiro") findings.add("financial_authority_unavailable");
  if (maximum !== null && nominalOpportunities !== null && maximum < nominalOpportunities) findings.add("budget_below_nominal_cadence");
  if (maximum !== null && used !== null && used >= maximum) findings.add("model_budget_exhausted");
  if (pending.length > withReference) findings.add("in_flight_without_reference");
  if (b === null || b.managedOk === false) findings.add("managed_wallet_not_read");
  // The published book is a cache of the last completed cycle. It need not stay fresh between ticks; only a cycle that reports stale data is a runtime failure.
  if (last?.reason === "carteira_antiga" && bookAgeMs !== null && (bookAgeMs < -5000 || bookAgeMs > MAX_BOOK_AGE_MS)) findings.add("cycle_book_stale");
  if (holdingsAboveMinimum > 0 && considered?.holdings === 0) findings.add("holdings_not_offered");
  return { observedAtMs, connected, authority: level, authorityBlocked: code(authority?.blocked), lock: bool(s.lock),
    purchases: { paused, reason: code(state.pauseReason), untilMs: uint(state.pausedUntilMs) },
    scheduler: { started, intervalMin, nextAtMs: uint(scheduler.nextAtMs) },
    budget: { day: typeof budget.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(budget.day) ? budget.day : null, used, maximum,
      remaining: maximum !== null && used !== null ? Math.max(0, maximum - used) : null, nominalOpportunities, resetsAtMs: (Math.floor(observedAtMs / 86400000) + 1) * 86400000 },
    book: b === null ? null : { ageMs: bookAgeMs, managedOk: bool(b.managedOk), positions: positions.length, valuedHoldings, holdingsAboveMinimum,
      unknownHoldings: holdings.filter(p => p.usd === null).length },
    last: last === null ? null : { cycleId: code(last.cycleId), atMs: uint(last.atMs), durationMs: uint(last.durationMs), consulted: bool(last.consulted), reason: code(last.reason),
      holdings: uint(considered?.holdings), buys: uint(considered?.buys), notes: Array.isArray(last.notes) ? last.notes.map(code).filter((n): n is string => n !== null).slice(0, 32) : [] },
    inFlight: { count: pending.length, withReference, withoutReference: pending.length - withReference }, findings: [...findings] };
}

export async function observeRuntime(fetchImpl: typeof fetch, now: () => number): Promise<{ readonly available: true; readonly runtime: RuntimeProjection } | { readonly available: false; readonly observedAtMs: number; readonly reason: "transport_error" | "http_error" | "invalid_status" }> {
  const observedAtMs = now();
  try {
    const origin = "http://127.0.0.1:3000";
    const response = await fetchImpl(origin + "/agent/status", { method: "GET", redirect: "error", headers: { origin }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { available: false, observedAtMs, reason: "http_error" };
    const body = await response.text();
    if (body.length > 1_000_000) return { available: false, observedAtMs, reason: "invalid_status" };
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { return { available: false, observedAtMs, reason: "invalid_status" }; }
    const runtime = projectRuntime(raw, observedAtMs);
    return runtime === null ? { available: false, observedAtMs, reason: "invalid_status" } : { available: true, runtime };
  } catch { return { available: false, observedAtMs, reason: "transport_error" }; }
}

async function main(): Promise<void> {
  const out = absoluteArg(Bun.argv.slice(2), "--out") ?? resolve(import.meta.dir, "..", "..", "data", "decision-review");
  const result = await observeRuntime(fetch, Date.now);
  mkdirSync(out, { recursive: true });
  await Bun.write(join(out, "runtime-latest.json"), JSON.stringify(result, null, 2) + "\n");
  appendFileSync(join(out, "runtime-observations.jsonl"), JSON.stringify(result) + "\n");
  console.log(JSON.stringify(result));
}

if (import.meta.main) await main();
