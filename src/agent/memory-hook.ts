/**
 * The memory hook of the Brief (contract 121 of the shared coordination file), prepared and OFF. It asks the captured-experience reader for the past choices of the SAME items the model is about to see, projects them with the
 * approved projector and hands back the value for `AgentBrief.memoria` (after `execucoes?`, before `mandato`) plus a record of what it cost. Nothing here reads a store, a clock or the environment by itself: the reader, the
 * projector and the clock are injected, so the live cycle can bind them later and a test can bind fakes. It is NOT wired into `model.ts`, `cycle.ts` or `wire.ts`.
 *
 * What it promises: a failure of the reader or the projector never throws and never vetoes anything (a failed reader shows up as `unavailable` items with the reason; a failed projector leaves the key out and says why); the
 * value is exactly what the projector returned; past choices are pending and prove nothing (the projector's own legend says so); tokens and cost stay unknown (`null`), never zero, because no provider has been observed.
 */
import { createHash } from "node:crypto";
import { BRIEF_MEMORY_LEGEND, BRIEF_MEMORY_SCHEMA_VERSION, BRIEF_MEMORY_VERSION_HASH, projectBriefMemory, type BriefMemory, type BriefMemoryResult } from "../decision-review/evolution/brief-memory";
import type { CapturedMemoryBatchResult, CapturedMemoryResult } from "../decision-review/evolution/captured-memory";
import { buildExperienceMemory, type MemoryQueryV2 } from "../decision-review/evolution/memory";

export { BRIEF_MEMORY_LEGEND };
export type { BriefMemory };

/** The environment switch. Anything but "1" leaves the hook off. */
export const MEMORY_HOOK_ENV = "INONU_AGENT_MEMORY_HOOK";
export const memoryHookEnabled = (env: Readonly<Record<string, string | undefined>>): boolean => env[MEMORY_HOOK_ENV] === "1";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
/** What the effective decision version has to carry for this block: the contract hash and the hash of the legend the model was told. */
export const MEMORY_HOOK_VERSION = Object.freeze({ schema: BRIEF_MEMORY_SCHEMA_VERSION, versionHash: BRIEF_MEMORY_VERSION_HASH, legendHash: sha(BRIEF_MEMORY_LEGEND) });
/** The reader takes at most this many queries at once (a representation bound of the reader, not a financial limit). */
const MAX_QUERIES = 64;
const NO_CONTEXT = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] } as const;

export interface MemoryHookInput {
  /** The as-of time, captured BEFORE the model is asked. */
  readonly asOfMs: number;
  readonly cycleId: string;
  /** The reported arm; the hook never decides it. */
  readonly arm: "A" | "B";
  /** The explicit cohort of past cycles the host selected. The memory covers these cycles only, never the whole history. */
  readonly cohortCycleIds: readonly string[];
  /** The ids of the items the model is offered this cycle (`buy:token:...` and `hold:token:...@agente`). */
  readonly itemIds: readonly string[];
}
export interface MemoryReadRequest { readonly arm: "A" | "B"; readonly cycleIds: readonly string[]; readonly queries: readonly MemoryQueryV2[] }
export interface MemoryHookDeps {
  /** Reads the cohort for every query in one pass (the batch reader, bound to its read-only store by the host). */
  readonly read: (request: MemoryReadRequest) => CapturedMemoryBatchResult;
  /** The approved projector; the real one by default. */
  readonly project?: (raw: unknown) => BriefMemoryResult;
  /** A monotonic clock in milliseconds, called once before the read and once after the projection. */
  readonly clock: () => number;
}

export type MemoryHookStatus = "ok" | "reader_failed" | "projector_failed" | "over_budget" | "no_items";
export interface MemoryHookRecord {
  readonly status: MemoryHookStatus;
  readonly failure: string | null;
  /** Items asked and items that could not be asked (an id the memory cannot scope, a repeated id, or beyond the reader's bound). */
  readonly items: number;
  readonly skipped: number;
  /** Cycles in the cohort. */
  readonly cohort: number;
  readonly quality: { readonly complete: number; readonly partial: number; readonly unavailable: number; readonly unknown: number };
  /** Cycles reported as missing or not usable, summed over the cohorts. */
  readonly gaps: number;
  /** Bytes of the value as it would sit in the Brief. */
  readonly bytes: number;
  readonly hash: string | null;
  readonly version: string;
  readonly legendHash: string;
  readonly durationMs: number;
  /** Unknown until a provider is observed, never computed as zero for lack of use. */
  readonly tokens: null;
  readonly costUsd: null;
}
export type MemoryHookOutcome =
  | { readonly enabled: false }
  | { readonly enabled: true; /** The exact value for `AgentBrief.memoria` and for `ConsultRecord.brief.memoria`; absent when there is nothing honest to send. */ readonly memoria: BriefMemory | undefined; readonly record: MemoryHookRecord };

const BUY = /^buy:(token:.+)$/;
const HOLD = /^hold:(token:[^@]+)@(agente|principal)$/;

/** The V2 query for each offered item: exact source id, the as-of captured before the model, versions unknown (null) because the Brief being built depends on this very memory. */
export function memoryQueries(input: Pick<MemoryHookInput, "asOfMs" | "cycleId" | "itemIds">): { readonly queries: readonly MemoryQueryV2[]; readonly skipped: number } {
  const queries: MemoryQueryV2[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const id of input.itemIds) {
    if (seen.has(id)) { skipped += 1; continue; }
    seen.add(id);
    const buy = typeof id === "string" ? BUY.exec(id) : null;
    const hold = buy === null && typeof id === "string" ? HOLD.exec(id) : null;
    const assetKey = buy?.[1] ?? hold?.[1];
    if (assetKey === undefined) { skipped += 1; continue; }
    const query: MemoryQueryV2 = {
      schemaVersion: 2, cycleId: input.cycleId, candidateId: assetKey, snapshotHash: null, decisionVersion: null, evaluatorHash: null, decidedAtMs: input.asOfMs, context: NO_CONTEXT, maxExperiences: 3,
      itemScope: { sourceItemId: id, kind: buy !== null ? "buy" : "holding", assetKey, walletRole: buy !== null ? null : (hold![2] as "agente" | "principal"), physicalWalletIdentity: "unknown", walletAddress: null },
    };
    // the memory builder is the judge of a query: an id it will not scope is skipped here, not found out in a live cycle
    if (!buildExperienceMemory([], query).ok || queries.length >= MAX_QUERIES) { skipped += 1; continue; }
    queries.push(query);
  }
  return { queries, skipped };
}

const quality = (memoria: BriefMemory): MemoryHookRecord["quality"] => {
  const count = { complete: 0, partial: 0, unavailable: 0, unknown: 0 };
  for (const item of Object.values(memoria.items)) count[item.q] += 1;
  return count;
};
const gapsOf = (memoria: BriefMemory): number => memoria.gaps.reduce((total, g) => total + Object.keys(g).length, 0);
const bytesOf = (memoria: BriefMemory): number => Buffer.byteLength(JSON.stringify(memoria));

function record(status: MemoryHookStatus, failure: string | null, base: { items: number; skipped: number; cohort: number; durationMs: number }, memoria?: BriefMemory): MemoryHookRecord {
  return {
    status, failure, items: base.items, skipped: base.skipped, cohort: base.cohort,
    quality: memoria === undefined ? { complete: 0, partial: 0, unavailable: 0, unknown: 0 } : quality(memoria),
    gaps: memoria === undefined ? 0 : gapsOf(memoria), bytes: memoria === undefined ? 0 : bytesOf(memoria), hash: memoria?.h ?? null,
    version: MEMORY_HOOK_VERSION.versionHash, legendHash: MEMORY_HOOK_VERSION.legendHash, durationMs: base.durationMs, tokens: null, costUsd: null,
  };
}

/**
 * Builds the block for one cycle. Never throws. `maxBytes` is the room the Brief has left for it: a memory that does not fit is left out and the record says `over_budget` (it is never cut).
 */
export function buildMemoryBrief(input: MemoryHookInput & { readonly enabled: boolean; readonly maxBytes?: number }, deps: MemoryHookDeps): MemoryHookOutcome {
  if (!input.enabled) return { enabled: false };
  const { queries, skipped } = memoryQueries(input);
  const cohort = input.cohortCycleIds.length;
  if (queries.length === 0) return { enabled: true, memoria: undefined, record: record("no_items", null, { items: 0, skipped, cohort, durationMs: 0 }) };
  const started = deps.clock();
  let failure: string | null = null;
  let results: readonly CapturedMemoryResult[];
  try {
    const read = deps.read({ arm: input.arm, cycleIds: [...input.cohortCycleIds], queries });
    if (read.ok && read.results.length === queries.length) results = read.results;
    else {
      failure = read.ok ? "memory_invalid" : read.code;
      results = queries.map(() => ({ ok: false, code: (read.ok ? "memory_invalid" : read.code) as Extract<CapturedMemoryResult, { ok: false }>["code"] }));
    }
  } catch {
    failure = "storage_unavailable";
    results = queries.map(() => ({ ok: false, code: "storage_unavailable" }));
  }
  let projected: BriefMemoryResult;
  try {
    projected = (deps.project ?? projectBriefMemory)({ asOfMs: input.asOfMs, cycleId: input.cycleId, arm: input.arm, items: queries.map((q, i) => ({ sourceItemId: q.itemScope.sourceItemId, result: results[i]! })) });
  } catch {
    projected = { ok: false, code: "projector_threw" as never };
  }
  const durationMs = Math.max(0, deps.clock() - started);
  const base = { items: queries.length, skipped, cohort, durationMs };
  if (!projected.ok) return { enabled: true, memoria: undefined, record: record("projector_failed", projected.code, base) };
  const memoria = projected.value;
  if (input.maxBytes !== undefined && bytesOf(memoria) > input.maxBytes) return { enabled: true, memoria: undefined, record: record("over_budget", null, base, memoria) };
  return { enabled: true, memoria, record: record(failure === null ? "ok" : "reader_failed", failure, base, memoria) };
}

/** Puts the block where the contract says: after `execucoes` (when the Brief has it) and before `mandato`, keeping every other key in its place. Without a block the Brief comes back untouched. */
export function insertMemory<T extends Readonly<Record<string, unknown>>>(brief: T, memoria: BriefMemory | undefined): T & { readonly memoria?: BriefMemory } {
  if (memoria === undefined) return brief;
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [key, value] of Object.entries(brief)) {
    if (key === "mandato" && !placed) { out.memoria = memoria; placed = true; }
    out[key] = value;
  }
  if (!placed) out.memoria = memoria;
  return out as T & { readonly memoria?: BriefMemory };
}
