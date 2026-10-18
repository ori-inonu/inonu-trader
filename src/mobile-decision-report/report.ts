import { createHash } from "node:crypto";
import { parseDexReport, type NormalizedDexReport } from "../../web/src/lib/dex-report";

export interface MobileDecisionOptions {
  now_ms: number;
  current_binding_sha256?: string;
}
export interface MobileDecisionReport {
  schema: "mobile_human_decision_report_v1";
  snapshot: { id: string; revision: string; origin: "synthetic_fixture" | "local_import"; synthetic: boolean; generated_at_ms: number; facts_sha256: string; provenance: "unverified" };
  identity: { chain_index: string; token_a: string; token_b: string };
  observed: { dex: NormalizedDexReport };
  clock: { source_time_ms: number | null; fetched_at_ms: number | null; source_age_ms: number | null; freshness: "unknown" | "fresh" | "stale" | "future"; max_age_ms: number };
  costs: { api: ReportedCost; jev: ReportedCost; total_coverage: "unknown"; quota_remaining: null };
  evaluation: {
    status: "not_evaluated" | "provided_context" | "invalidated";
    provenance: "provided_unverified" | "unavailable";
    id: string | null; model: string | null; version: string | null; evaluated_at_ms: number | null; bound_facts_sha256: string | null;
    observations: string[]; limitations: string[];
    usage: { input_tokens: number | null; output_tokens: number | null };
  };
  alerts: string[];
  sources: { kind: "dex_report" | "source_clock" | "jev_context"; claim: string; verification: "unverified" | "unavailable" }[];
  validity: { status: "snapshot_only" | "requires_review" | "invalidated"; checked_at_ms: number; valid_until_ms: number | null; execution: "not_qualified"; invalidated_by: string[] };
  human_decision: { status: "pending"; grants_execution: false };
}
interface ReportedCost { amount_usd: string | null; status: "reported_unverified" | "unknown" }
type RecordValue = Record<string, unknown>;
const INVALID = "Invalid mobile decision report.";
const MAX_TIME = 8.64e15;

function fail(): never { throw new Error(INVALID); }
function requireValue(condition: unknown): asserts condition { if (!condition) fail(); }
function record(value: unknown): RecordValue {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  return value as RecordValue;
}
// Only own data properties in the allowlist are read; unknown properties/accessors are not invoked.
function field(value: RecordValue, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  requireValue(descriptor !== undefined && "value" in descriptor);
  return descriptor.value;
}
function pick(value: unknown, keys: readonly string[]): RecordValue {
  const source = record(value), result: RecordValue = {};
  for (const key of keys) if (Object.hasOwn(source, key)) result[key] = field(source, key);
  return result;
}
function list(value: unknown, max: number): unknown[] {
  requireValue(Array.isArray(value) && value.length <= max);
  return Array.from({ length: value.length }, (_, i) => field(value as unknown as RecordValue, String(i)));
}
function text(value: unknown, max: number): string {
  requireValue(typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
  return value;
}
function identifier(value: unknown): string {
  const result = text(value, 96);
  requireValue(/^[A-Za-z0-9_:.-]+$/.test(result));
  return result;
}
function time(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_TIME);
  return value;
}
function usd(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value, 100);
  requireValue(/^[0-9]+(?:\.[0-9]+)?$/.test(result));
  return result;
}
function cost(value: string | null): ReportedCost { return { amount_usd: value, status: value === null ? "unknown" : "reported_unverified" }; }
function freshness(value: number | null, now: number, age: number): MobileDecisionReport["clock"]["freshness"] {
  return value === null ? "unknown" : value > now ? "future" : now - value > age ? "stale" : "fresh";
}
function sha(value: unknown): string {
  const result = text(value, 64);
  requireValue(/^[a-f0-9]{64}$/.test(result));
  return result;
}
function tokens(value: unknown): number | null {
  if (value === null) return null;
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  return value;
}
function contextualEvaluation(value: unknown, binding: string, now: number, maxAge: number, fetched: number | null, unusableSnapshot: boolean, alerts: string[]): { evaluation: MobileDecisionReport["evaluation"]; cost: ReportedCost } {
  if (value === null) {
    alerts.push("jev_not_evaluated", "jev_cost_unknown");
    return { evaluation: { status: "not_evaluated", provenance: "unavailable", id: null, model: null, version: null, evaluated_at_ms: null, bound_facts_sha256: null, observations: [], limitations: [], usage: { input_tokens: null, output_tokens: null } }, cost: cost(null) };
  }
  const raw = record(value);
  const evaluated = time(field(raw, "evaluated_at_ms")) as number, bound = sha(field(raw, "bound_facts_sha256"));
  const id = identifier(field(raw, "id")), model = identifier(field(raw, "model")), version = identifier(field(raw, "version"));
  const observations = list(field(raw, "observations"), 8).map(value => text(value, 600));
  const limitations = list(field(raw, "limitations"), 8).map(value => text(value, 600));
  const usage = { input_tokens: tokens(field(raw, "input_tokens")), output_tokens: tokens(field(raw, "output_tokens")) };
  const reportedCost = cost(usd(field(raw, "cost_usd")));
  const issues: string[] = [];
  if (bound !== binding) issues.push("jev_binding_mismatch");
  if (evaluated > now) issues.push("jev_future");
  if (now - evaluated > maxAge) issues.push("jev_stale");
  if (fetched !== null && evaluated < fetched) issues.push("jev_before_fetch");
  if (unusableSnapshot) issues.push("jev_snapshot_requires_review");
  alerts.push(...issues);
  if (reportedCost.amount_usd === null) alerts.push("jev_cost_unknown");
  return {
    evaluation: { status: issues.length > 0 ? "invalidated" : "provided_context", provenance: "provided_unverified", id, model, version, evaluated_at_ms: evaluated, bound_facts_sha256: bound, observations: issues.length > 0 ? [] : observations, limitations, usage },
    cost: reportedCost,
  };
}
function dexInput(value: unknown): RecordValue {
  const raw = record(value);
  const dex = pick(raw, ["source", "chainIndex", "inputAtomic", "outputAtomic", "quotedGrossDeltaAtomic", "status", "reasons", "execution", "liveQualified", "netAtomic", "netStatus", "costsCoverage", "costUsd", "quotaRemaining"]);
  dex.tokenA = pick(field(raw, "tokenA"), ["address", "decimals", "metadataSource"]);
  dex.tokenB = pick(field(raw, "tokenB"), ["address", "decimals", "metadataSource"]);
  dex.policy = pick(field(raw, "policy"), ["maxElapsedMs", "maxImpactMagnitudePercent"]);
  dex.reasons = list(field(raw, "reasons"), 32);
  dex.legs = list(field(raw, "legs"), 2).map(value => {
    const rawLeg = record(value);
    const leg = pick(rawLeg, ["inputAtomic", "outputAtomic", "priceImpactPercent", "fromTaxFraction", "toTaxFraction", "requestedAt", "receivedAt"]);
    leg.networkEstimates = pick(field(rawLeg, "networkEstimates"), ["tradeFeeUsd", "estimateGasFeeNativeAtomic"]);
    return leg;
  });
  if (Object.hasOwn(raw, "timing")) dex.timing = pick(field(raw, "timing"), ["startedAt", "completedAt", "elapsedMs", "coverageRequestedAt", "coverageReceivedAt"]);
  return dex;
}

export function projectMobileDecisionReport(value: unknown, options: MobileDecisionOptions): MobileDecisionReport {
  try {
    const raw = record(value);
    requireValue(field(raw, "schema") === "mobile_decision_input_v1");
    const id = identifier(field(raw, "snapshot_id")), revision = text(field(raw, "revision"), 32);
    requireValue(/^(?:0|[1-9][0-9]*)$/.test(revision));
    const origin = field(raw, "origin");
    requireValue(origin === "synthetic_fixture" || origin === "local_import");
    const now = time(field(record(options), "now_ms")) as number;
    const dex = parseDexReport(dexInput(field(raw, "dex_report")), { nowWallMs: now });
    requireValue(origin !== "synthetic_fixture" || dex.source === "synthetic");
    const sourceTime = time(field(raw, "source_time_ms"), true), fetched = time(field(raw, "fetched_at_ms"), true);
    const maxAge = field(raw, "max_age_ms");
    requireValue(typeof maxAge === "number" && Number.isSafeInteger(maxAge) && maxAge >= 1 && maxAge <= 3_600_000);
    const apiCost = usd(field(raw, "api_cost_usd"));
    const identity = { chain_index: dex.chainIndex, token_a: dex.tokenA.address, token_b: dex.tokenB.address };
    const binding = createHash("sha256").update(JSON.stringify({ schema: "mobile_human_decision_report_v1", id, revision, origin, dex, source_time_ms: sourceTime, fetched_at_ms: fetched, max_age_ms: maxAge, api_cost_usd: apiCost })).digest("hex");
    const sourceFreshness = freshness(sourceTime, now, maxAge), fetchFreshness = freshness(fetched, now, maxAge);
    const alerts: string[] = [];
    if (sourceFreshness === "unknown") alerts.push("source_time_missing");
    if (sourceFreshness === "stale" || sourceFreshness === "future") alerts.push(`source_${sourceFreshness}`);
    if (fetchFreshness === "unknown") alerts.push("fetch_time_missing");
    if (fetchFreshness === "stale" || fetchFreshness === "future") alerts.push(`fetch_${fetchFreshness}`);
    if (sourceTime !== null && fetched !== null && sourceTime > fetched) alerts.push("source_after_fetch");
    if (dex.timing?.completedAt != null && fetched !== null && dex.timing.completedAt > fetched) alerts.push("report_after_fetch");
    if (dex.status !== "quoted_gross_delta") alerts.push("report_not_quoted");
    const clockNeedsReview = alerts.length > 0;
    const currentBinding = Object.hasOwn(record(options), "current_binding_sha256") ? sha(field(record(options), "current_binding_sha256")) : null;
    const replaced = currentBinding !== null && currentBinding !== binding;
    if (replaced) alerts.push("snapshot_replaced");
    alerts.push("total_cost_coverage_unknown", "quota_unknown");
    if (apiCost === null) alerts.push("api_cost_unknown");
    const context = contextualEvaluation(field(raw, "jev"), binding, now, maxAge, fetched, clockNeedsReview || replaced, alerts);
    const validUntil = sourceTime === null || fetched === null || sourceFreshness === "future" || fetchFreshness === "future" ? null : Math.min(sourceTime + maxAge, fetched + maxAge);
    requireValue(validUntil === null || (Number.isSafeInteger(validUntil) && validUntil <= MAX_TIME));
    return {
      schema: "mobile_human_decision_report_v1",
      snapshot: { id, revision, origin, synthetic: dex.source === "synthetic", generated_at_ms: now, facts_sha256: binding, provenance: "unverified" },
      identity,
      observed: { dex },
      clock: { source_time_ms: sourceTime, fetched_at_ms: fetched, source_age_ms: sourceTime === null || sourceTime > now ? null : now - sourceTime, freshness: sourceFreshness, max_age_ms: maxAge },
      costs: { api: cost(apiCost), jev: context.cost, total_coverage: "unknown", quota_remaining: null },
      evaluation: context.evaluation,
      alerts,
      sources: [{ kind: "dex_report", claim: dex.source, verification: "unverified" }, { kind: "source_clock", claim: sourceTime === null ? "unknown" : "producer_supplied", verification: sourceTime === null ? "unavailable" : "unverified" }, { kind: "jev_context", claim: context.evaluation.status, verification: context.evaluation.provenance === "unavailable" ? "unavailable" : "unverified" }],
      validity: { status: replaced || context.evaluation.status === "invalidated" ? "invalidated" : clockNeedsReview ? "requires_review" : "snapshot_only", checked_at_ms: now, valid_until_ms: validUntil, execution: "not_qualified", invalidated_by: ["time_expired", "identity_changed", "revision_changed", "content_changed"] },
      human_decision: { status: "pending", grants_execution: false },
    };
  } catch { fail(); }
}
