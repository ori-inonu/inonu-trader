import { createHash } from "node:crypto";
import { captureSourceObject, type CapturedObject } from "./agent-episode";
import { buildExperienceMemory } from "./memory";
import type { CapturedMemoryResult, CapturedMemoryDiagnostic } from "./captured-memory";

export const BRIEF_MEMORY_SCHEMA_VERSION = 1;
/** Representation/resource bounds only, never operation or position limits. */
export const BRIEF_MEMORY_LIMITS = Object.freeze({ items: 64, experiencesPerItem: 3, payloadBytes: 32 * 1024 });
export const BRIEF_MEMORY_LEGEND = "memoria v1: t is the current as-of time, c the current cycle, b the reported A/B arm. Coverage is requested_cycles_only, never the full history. Every x row is an inconclusive past choice with an unmeasured pending outcome; past choices and unmeasured outcomes are not evidence of profit or success. A repeated choice does not recommend an action; current facts decide. Item st is available/empty/unavailable, reason is a diagnostic, h its memory snapshot hash, k a shared index into cohorts AND gaps (null means unknown). Item q reports cohort quality: complete, partial, unavailable or unknown. gaps[k] maps each unavailable cycle to an allowlisted diagnostic; a partial item retains useful rows while those missing decisions remain unknown. Empty means no relevant rows in a complete known cohort, never missing or rejected history. Row c is the original cycle, action the original choice, dt the original decision time, rt the original local availability time, r the episode revision. Row d/e/s index shared versions for decision/evaluator/source Brief hashes. Absent i means exactly the item's source id; present i indexes origins for a different reported item/role. Roles do not prove a physical wallet or ownership. Global b applies to all rows. Global h hashes the payload without h; hashes establish local consistency, not authentication. At most three rows per item are represented; overflow is unavailable, never silently sliced. No return, success probability or calibrated confidence is supplied.";
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** Contract/legend identity only; this is not an authenticated runtime build. */
export const BRIEF_MEMORY_VERSION_HASH = sha({ v: BRIEF_MEMORY_SCHEMA_VERSION, legend: BRIEF_MEMORY_LEGEND, limits: BRIEF_MEMORY_LIMITS,
  fields: ["v", "t", "c", "b", "sourceAuthenticated", "financialExecution", "evaluation", "coverage", "versions", "cohorts", "gaps", "origins", "items", "h"], item: ["st", "reason", "q", "h", "k", "x"], row: ["c", "action", "dt", "rt", "r", "d", "e", "s", "i?"], diagnostics: "exact_cohort_and_pending_items_not_less_than_retrieved_rows" });
type ReaderFailure = Extract<CapturedMemoryResult, { ok: false }>["code"];
export type BriefMemoryGap = Exclude<CapturedMemoryDiagnostic["status"], "bound">;
export type BriefMemoryReason = ReaderFailure | BriefMemoryGap | "cohort_incomplete" | "diagnostics_invalid" | "reader_unavailable" | "frame_mismatch" | "memory_snapshot_mismatch" | "experience_invalid" | "unsupported_outcome" | "representation_limit";
export interface BriefMemoryRow {
  /** Original cycle, applied choice, decision and local availability clocks. */
  readonly c: string; readonly action: "buy" | "hold" | "sell" | "skip" | "unknown"; readonly dt: number; readonly rt: number;
  /** Original episode revision, never a fabricated policy version. */
  readonly r: number;
  /** Shared decision/evaluator/Brief version indices. */
  readonly d: number; readonly e: number; readonly s: number;
  /** Absent means exactly the parent item id; otherwise indexes origins. */
  readonly i?: number;
}
export interface BriefMemoryItem {
  readonly st: "available" | "empty" | "unavailable";
  readonly reason: BriefMemoryReason | null;
  /** Known cohort quality. Unknown covers invalid/unavailable reader frames. */
  readonly q: "complete" | "partial" | "unavailable" | "unknown";
  /** Exact verified ExperienceMemory.snapshotHash, or unknown. */
  readonly h: string | null;
  /** Shared cohort index, or unknown for unavailable frames. */
  readonly k: number | null;
  /** Every row is inconclusive/pending and belongs to the global reported arm. */
  readonly x: readonly BriefMemoryRow[];
}
export interface BriefMemory {
  readonly v: 1; readonly t: number; readonly c: string; readonly b: "A" | "B";
  readonly sourceAuthenticated: false; readonly financialExecution: false;
  readonly evaluation: "pending_only"; readonly coverage: "requested_cycles_only";
  readonly versions: { readonly d: readonly string[]; readonly e: readonly string[]; readonly s: readonly string[] };
  readonly cohorts: readonly (readonly string[])[];
  /** Parallel to cohorts; preserves every unavailable cycle and reported reason. */
  readonly gaps: readonly Readonly<Record<string, BriefMemoryGap>>[];
  readonly origins: readonly string[];
  readonly items: Readonly<Record<string, BriefMemoryItem>>;
  /** SHA256 of this payload with only the global h field omitted. */
  readonly h: string;
}
export interface BriefMemoryInput { readonly asOfMs: number; readonly cycleId: string; readonly arm: "A" | "B"; readonly items: readonly { readonly sourceItemId: string; readonly result: CapturedMemoryResult }[] }
export type BriefMemoryResult = { readonly ok: true; readonly value: BriefMemory } | { readonly ok: false; readonly code: "input_invalid" | "payload_limit" };
const object = (v: unknown): v is CapturedObject => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: CapturedObject, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const readerFailures: readonly string[] = ["query_invalid", "request_invalid", "read_cycle_unavailable", "storage_unavailable", "snapshot_changed", "payload_limit", "memory_invalid"] satisfies readonly ReaderFailure[];
const diagnosticStatuses: readonly string[] = ["bound", "awaiting_source", "awaiting_metadata", "quarantined", "source_invalid", "metadata_invalid", "metadata_rejected"] satisfies readonly CapturedMemoryDiagnostic["status"][];
const context = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] };
function validItemId(sourceItemId: unknown): sourceItemId is string {
  if (typeof sourceItemId !== "string") return false;
  const hold = /^hold:(token:[^@]+)@(agente|principal)$/.exec(sourceItemId);
  const assetKey = sourceItemId.startsWith("buy:") ? sourceItemId.slice(4) : hold?.[1];
  if (!assetKey) return false;
  return buildExperienceMemory([], { schemaVersion: 2, cycleId: "identity", candidateId: assetKey, snapshotHash: null, decisionVersion: null, evaluatorHash: null, decidedAtMs: 0, maxExperiences: 3, context,
    itemScope: { sourceItemId, kind: hold ? "holding" : "buy", assetKey, walletRole: hold?.[2] ?? null, physicalWalletIdentity: "unknown", walletAddress: null } }).ok;
}
function freeze<T>(v: T): T { if (v !== null && typeof v === "object" && !Object.isFrozen(v)) { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }

/** Pure, bounded projection of locally checked reader frames. The digest check
 * detects incoherent frames, not a self-consistent invented producer narrative.
 * This projector supplies no action recommendation, success rate or outcome. */
export function projectBriefMemory(raw: unknown): BriefMemoryResult {
  const input = captureSourceObject(raw);
  if (!input || !exact(input, ["asOfMs", "cycleId", "arm", "items"]) || !clock(input.asOfMs) || !code(input.cycleId) || input.arm !== "A" && input.arm !== "B" || !Array.isArray(input.items)) return { ok: false, code: "input_invalid" };
  if (input.items.length > BRIEF_MEMORY_LIMITS.items) return { ok: false, code: "payload_limit" };
  const d: string[] = [], e: string[] = [], s: string[] = [], origins: string[] = [], cohorts: string[][] = [], cohortKeys: string[] = [];
  const gaps: Record<string, BriefMemoryGap>[] = [];
  const entries: [string, BriefMemoryItem][] = [], seen = new Set<string>();
  const index = (values: string[], value: string) => { let at = values.indexOf(value); if (at < 0) { at = values.length; values.push(value); } return at; };
  const unavailable = (reason: BriefMemoryReason): BriefMemoryItem => ({ st: "unavailable", reason, q: "unknown", h: null, k: null, x: [] });
  for (const item of input.items) {
    if (!object(item) || !exact(item, ["sourceItemId", "result"]) || !validItemId(item.sourceItemId) || seen.has(item.sourceItemId)) return { ok: false, code: "input_invalid" };
    const itemId = item.sourceItemId; seen.add(itemId);
    const result = item.result;
    const accept = (value: BriefMemoryItem) => entries.push([itemId, value]);
    if (!object(result)) { accept(unavailable("frame_mismatch")); continue; }
    if (result.ok === false) { accept(unavailable(typeof result.code === "string" && readerFailures.includes(result.code) ? result.code as ReaderFailure : "reader_unavailable")); continue; }
    const memory = result.memory;
    if (result.ok !== true || result.coverage !== "requested_cycles_only" || result.arm !== input.arm || result.sourceAuthenticated !== false || result.financialExecution !== false || result.qualifiedABActive !== false || result.matureOutcomes !== 0 || result.consistency !== "eligible_snapshots_rechecked" || !object(memory)) { accept(unavailable("frame_mismatch")); continue; }
    if (!hash(memory.snapshotHash) || sha(Object.fromEntries(Object.entries(memory).filter(([k]) => k !== "snapshotHash"))) !== memory.snapshotHash) { accept(unavailable("memory_snapshot_mismatch")); continue; }
    const parsedQuery = buildExperienceMemory([], memory.query);
    if (!exact(memory, ["schemaVersion", "evidence", "query", "datasetHash", "experiences", "coverage", "snapshotHash"]) || memory.schemaVersion !== 2 || memory.evidence !== "reported_experiences" || !hash(memory.datasetHash) || !parsedQuery.ok || !("schemaVersion" in parsedQuery.value.query) || parsedQuery.value.query.schemaVersion !== 2 || parsedQuery.value.query.itemScope.sourceItemId !== itemId || parsedQuery.value.query.decidedAtMs !== input.asOfMs || parsedQuery.value.query.cycleId !== input.cycleId || !Array.isArray(result.requestedCycleIds) || result.requestedCycleIds.length > 512 || !result.requestedCycleIds.every(code) || new Set(result.requestedCycleIds).size !== result.requestedCycleIds.length || !Array.isArray(memory.experiences)) { accept(unavailable("frame_mismatch")); continue; }
    if (memory.experiences.length > BRIEF_MEMORY_LIMITS.experiencesPerItem) { accept(unavailable("representation_limit")); continue; }
    const query = parsedQuery.value.query;
    const diagnosticMap = new Map<string, CapturedMemoryDiagnostic["status"]>();
    const pendingCounts = new Map<string, number>(), retrievedCounts = new Map<string, number>();
    let diagnosticsValid = Array.isArray(result.diagnostics) && result.diagnostics.length === result.requestedCycleIds.length;
    if (Array.isArray(result.diagnostics)) for (const diagnostic of result.diagnostics) {
      if (!object(diagnostic) || !exact(diagnostic, ["cycleId", "status", "rawVariants", "metadataVariants", "referenceVariants", "pendingItems", "excludedQueryCycle"]) || !code(diagnostic.cycleId) || !result.requestedCycleIds.includes(diagnostic.cycleId) || diagnosticMap.has(diagnostic.cycleId) || typeof diagnostic.status !== "string" || !diagnosticStatuses.includes(diagnostic.status) || ![diagnostic.rawVariants, diagnostic.metadataVariants, diagnostic.referenceVariants, diagnostic.pendingItems].every(clock) || diagnostic.excludedQueryCycle !== (diagnostic.cycleId === input.cycleId) || diagnostic.status !== "bound" && diagnostic.pendingItems !== 0 || diagnostic.status === "bound" && (diagnostic.rawVariants !== 1 || diagnostic.metadataVariants !== 1 || (diagnostic.referenceVariants as number) > 1)) { diagnosticsValid = false; break; }
      diagnosticMap.set(diagnostic.cycleId, diagnostic.status as CapturedMemoryDiagnostic["status"]);
      pendingCounts.set(diagnostic.cycleId, diagnostic.pendingItems as number);
    }
    if (!diagnosticsValid) { accept(unavailable("diagnostics_invalid")); continue; }
    const valid: CapturedObject[] = []; let reason: BriefMemoryReason | null = null;
    for (const row of memory.experiences) {
      if (!object(row) || row.sourceSchemaVersion !== 2 || !object(row.itemScope) || !code(row.cycleId) || row.cycleId === input.cycleId || !result.requestedCycleIds.includes(row.cycleId) || row.arm !== input.arm || row.source !== (input.arm === "A" ? "decision_journal" : "shadow_journal") || !["buy", "hold", "sell", "skip", "unknown"].includes(row.action as string) || !clock(row.decidedAtMs) || row.decidedAtMs >= input.asOfMs || !clock(row.recordedAtMs) || row.recordedAtMs < row.decidedAtMs || row.recordedAtMs > input.asOfMs || row.ageMs !== input.asOfMs - row.decidedAtMs || !clock(row.episodeVersion) || row.episodeVersion < 1 || !hash(row.snapshotHash) || !hash(row.decisionVersion) || !hash(row.evaluatorHash)) { reason = "experience_invalid"; break; }
      if (diagnosticMap.get(row.cycleId) !== "bound") { reason = "diagnostics_invalid"; break; }
      // A source cycle may contain more items than retrieval selected. It may
      // never report fewer pending items than the rows represented from it.
      const retrieved = (retrievedCounts.get(row.cycleId) ?? 0) + 1;
      if (retrieved > pendingCounts.get(row.cycleId)!) { reason = "diagnostics_invalid"; break; }
      retrievedCounts.set(row.cycleId, retrieved);
      const scope = buildExperienceMemory([], { ...query, candidateId: row.candidateId, itemScope: row.itemScope });
      if (!scope.ok) { reason = "experience_invalid"; break; }
      const outcome = row.outcome;
      if (row.classification !== "inconclusive" || !object(outcome) || outcome.status !== "pending" || !["kind", "source", "endAtMs", "availableAtMs", "horizonMs", "numeraireKey", "evidenceHash", "returnPct"].every(k => outcome[k] === null) || outcome.costs !== "unknown" || outcome.valuation !== "unknown" || outcome.cashFlows !== "unknown") { reason = "unsupported_outcome"; break; }
      valid.push(row);
    }
    if (reason) { accept(unavailable(reason)); continue; }
    const cohort = [...result.requestedCycleIds as readonly string[]].sort();
    const missing = Object.fromEntries(cohort.flatMap(c => { const status = diagnosticMap.get(c)!; return status === "bound" ? [] : [[c, status as BriefMemoryGap]]; }));
    const cohortKey = JSON.stringify({ cohort, gaps: missing });
    let k = cohortKeys.indexOf(cohortKey); if (k < 0) { k = cohorts.length; cohorts.push(cohort); gaps.push(missing); cohortKeys.push(cohortKey); }
    const x: BriefMemoryRow[] = valid.map(row => { const originalId = (row.itemScope as CapturedObject).sourceItemId as string; return { c: row.cycleId as string, action: row.action as BriefMemoryRow["action"], dt: row.decidedAtMs as number, rt: row.recordedAtMs as number, r: row.episodeVersion as number,
      d: index(d, row.decisionVersion as string), e: index(e, row.evaluatorHash as string), s: index(s, row.snapshotHash as string), ...(originalId === itemId ? {} : { i: index(origins, originalId) }) }; });
    const missingStatuses = Object.values(missing), hasBound = cohort.some(c => c !== input.cycleId && diagnosticMap.get(c) === "bound");
    const quality = missingStatuses.length === 0 ? "complete" : hasBound ? "partial" : "unavailable";
    const gapReason = quality === "complete" ? null : quality === "partial" || new Set(missingStatuses).size > 1 ? "cohort_incomplete" : missingStatuses[0]!;
    accept({ st: x.length ? "available" : missingStatuses.length ? "unavailable" : "empty", reason: gapReason, q: quality, h: memory.snapshotHash, k, x });
  }
  const body = { v: BRIEF_MEMORY_SCHEMA_VERSION, t: input.asOfMs, c: input.cycleId, b: input.arm, sourceAuthenticated: false as const, financialExecution: false as const, evaluation: "pending_only" as const, coverage: "requested_cycles_only" as const,
    versions: { d, e, s }, cohorts, gaps, origins, items: Object.fromEntries(entries) } satisfies Omit<BriefMemory, "h">;
  const value = { ...body, h: sha(body) };
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > BRIEF_MEMORY_LIMITS.payloadBytes) return { ok: false, code: "payload_limit" };
  return { ok: true, value: freeze(value) };
}
