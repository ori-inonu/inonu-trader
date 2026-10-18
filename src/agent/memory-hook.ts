/**
 * The memory hook of the Brief (contract 121 of the shared coordination file). It asks the captured-experience reader for the past choices of the SAME items the model is about to see, projects them with the approved
 * projector and hands back the value for `AgentBrief.memoria` (after `execucoes?`, before `mandato`) plus a record of what it cost. Nothing here reads a store, a clock or the environment by itself: the reader, the
 * projector and the clock are injected. It is integrated in `model.ts`, `cycle.ts` and `wire.ts` but OFF: it exists only when the host passes `memory` with `enabled: true`, and the production binding of the reader to
 * the read-only capture store does not exist yet. Configuration is not activation.
 *
 * What it promises: a failure of the reader or the projector, or an input that cannot be read, never throws and never vetoes anything (a failed reader shows up as `unavailable` items with the reason; a failed
 * projector or an unreadable input leaves the key out and says why); the value is exactly what the projector returned; every frame must answer the exact cohort and the exact query that were asked, or it is unknown;
 * what a reader is given is a copy, so it cannot contaminate the next consultation; past choices are pending and prove nothing (the projector's own legend says so); tokens and cost stay unknown (`null`), never zero.
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
/** The legend as it is recorded in the effective version of a decision: unchanged without a memory block, and with one it carries the contract hash and the hash of the legend the model was told, so a legend change changes the version. */
export const effectiveLegend = (legend: string, memoria: BriefMemory | undefined): string => (memoria === undefined ? legend : `${legend}+memoria:${MEMORY_HOOK_VERSION.versionHash}:${MEMORY_HOOK_VERSION.legendHash}`);

/** The reader takes at most this many queries at once (a representation bound of the reader, not a financial limit). */
const MAX_QUERIES = 64;
/** A fresh "no context" for every query: a shared object could be changed by a reader and would contaminate the next consultation. */
const noContext = (): MemoryQueryV2["context"] => ({ regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] });

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
  /** Reads the cohort for every query in one pass (the batch reader, bound to its read-only store by the host). It is handed COPIES of the cohort and the queries. */
  readonly read: (request: MemoryReadRequest) => CapturedMemoryBatchResult;
  /** The approved projector; the real one by default. This is a TRUSTED port: the qualified path is the default projector, and a replacement is not authenticated by this module (the check below only verifies a minimal shape, not the hash or the schema of what it returns). Keep the default in production. */
  readonly project?: (raw: unknown) => BriefMemoryResult;
  /** A monotonic clock in milliseconds, called once before the read and once after the projection. */
  readonly clock: () => number;
}

export type MemoryHookStatus = "ok" | "reader_failed" | "projector_failed" | "over_budget" | "no_items" | "input_invalid";
export interface MemoryHookRecord {
  readonly status: MemoryHookStatus;
  readonly failure: string | null;
  /** Items asked of the reader. */
  readonly items: number;
  /** Items NOT asked, split by cause so completeness is never read off a sum: `duplicates` (an id repeated), `invalid` (an id the memory cannot scope), `overflow` (valid ids beyond the reader's bound of 64, so the cover is cut); `skipped` is their sum. */
  readonly skipped: number;
  readonly duplicates: number;
  readonly invalid: number;
  readonly overflow: number;
  /** Cycles in the cohort (canonical: sorted, without repeats). */
  readonly cohort: number;
  readonly quality: { readonly complete: number; readonly partial: number; readonly unavailable: number; readonly unknown: number };
  /** Cycles reported as missing or not usable, summed over the cohorts. */
  readonly gaps: number;
  /** Bytes of the value alone, as JSON. */
  readonly bytes: number;
  /** Bytes the memory adds to the whole Brief: the key and the value in the body, the key and the legend in `chaves`. This is what `maxBytes` bounds. */
  readonly addedBytes: number;
  readonly hash: string | null;
  readonly version: string;
  readonly legendHash: string;
  /** Milliseconds between the read and the projection by the injected clock; null when it could not be measured (a clock that threw or lied, or nothing was read). Never an invented zero. */
  readonly durationMs: number | null;
  /** Unknown until a provider is observed, never computed as zero for lack of use. */
  readonly tokens: null;
  readonly costUsd: null;
}
export type MemoryHookOutcome =
  | { readonly enabled: false }
  | { readonly enabled: true; /** The exact value for `AgentBrief.memoria` and for `ConsultRecord.brief.memoria`; absent when there is nothing honest to send. */ readonly memoria: BriefMemory | undefined; readonly record: MemoryHookRecord };

const BUY = /^buy:(token:.+)$/;
const HOLD = /^hold:(token:[^@]+)@(agente|principal)$/;

export interface MemoryQueries {
  /** The queries as they are handed to the reader (it gets copies). */
  readonly queries: readonly MemoryQueryV2[];
  /** The same queries as the memory builder normalizes them: what a frame has to carry in `memory.query` to count as the answer to the one that was asked. */
  readonly expected: readonly MemoryQueryV2[];
  readonly skipped: number;
  readonly duplicates: number;
  readonly invalid: number;
  readonly overflow: number;
}

/** The V2 query for each offered item: exact source id, the as-of captured before the model, versions unknown (null) because the Brief being built depends on this very memory. */
export function memoryQueries(input: Pick<MemoryHookInput, "asOfMs" | "cycleId" | "itemIds">): MemoryQueries {
  const queries: MemoryQueryV2[] = [];
  const expected: MemoryQueryV2[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  let overflow = 0;
  for (const id of input.itemIds) {
    if (seen.has(id)) { duplicates += 1; continue; }
    seen.add(id);
    const buy = typeof id === "string" ? BUY.exec(id) : null;
    const hold = buy === null && typeof id === "string" ? HOLD.exec(id) : null;
    const assetKey = buy?.[1] ?? hold?.[1];
    if (assetKey === undefined) { invalid += 1; continue; }
    const query: MemoryQueryV2 = {
      schemaVersion: 2, cycleId: input.cycleId, candidateId: assetKey, snapshotHash: null, decisionVersion: null, evaluatorHash: null, decidedAtMs: input.asOfMs, context: noContext(), maxExperiences: 3,
      itemScope: { sourceItemId: id, kind: buy !== null ? "buy" : "holding", assetKey, walletRole: buy !== null ? null : (hold![2] as "agente" | "principal"), physicalWalletIdentity: "unknown", walletAddress: null },
    };
    // the memory builder is the judge of a query: an id it will not scope is skipped here, not found out in a live cycle
    const built = buildExperienceMemory([], query);
    if (!built.ok) { invalid += 1; continue; }
    if (queries.length >= MAX_QUERIES) { overflow += 1; continue; }
    queries.push(query);
    expected.push(built.value.query as MemoryQueryV2);
  }
  return { queries, expected, skipped: duplicates + invalid + overflow, duplicates, invalid, overflow };
}

const quality = (memoria: BriefMemory): MemoryHookRecord["quality"] => {
  const count = { complete: 0, partial: 0, unavailable: 0, unknown: 0 };
  for (const item of Object.values(memoria.items)) count[item.q] += 1;
  return count;
};
const gapsOf = (memoria: BriefMemory): number => memoria.gaps.reduce((total, g) => total + Object.keys(g).length, 0);
const bytesOf = (memoria: BriefMemory): number => Buffer.byteLength(JSON.stringify(memoria));
/** `,"memoria":` is 11 bytes, in the body and again in `chaves`; the legend goes in `chaves` as JSON. */
const KEY_OVERHEAD_BYTES = 11;
const LEGEND_BYTES = Buffer.byteLength(JSON.stringify(BRIEF_MEMORY_LEGEND));
/** Everything the block adds to the Brief once it is in: the value and its key, and the legend and its key. */
export const addedBytesOf = (memoria: BriefMemory): number => 2 * KEY_OVERHEAD_BYTES + bytesOf(memoria) + LEGEND_BYTES;

interface Base { readonly items: number; readonly duplicates: number; readonly invalid: number; readonly overflow: number; readonly cohort: number; readonly durationMs: number | null }
const ZERO_BASE: Base = { items: 0, duplicates: 0, invalid: 0, overflow: 0, cohort: 0, durationMs: null };

function record(status: MemoryHookStatus, failure: string | null, base: Base, memoria?: BriefMemory): MemoryHookRecord {
  return {
    status, failure, items: base.items, skipped: base.duplicates + base.invalid + base.overflow, duplicates: base.duplicates, invalid: base.invalid, overflow: base.overflow, cohort: base.cohort,
    quality: memoria === undefined ? { complete: 0, partial: 0, unavailable: 0, unknown: 0 } : quality(memoria),
    gaps: memoria === undefined ? 0 : gapsOf(memoria), bytes: memoria === undefined ? 0 : bytesOf(memoria), addedBytes: memoria === undefined ? 0 : addedBytesOf(memoria), hash: memoria?.h ?? null,
    version: MEMORY_HOOK_VERSION.versionHash, legendHash: MEMORY_HOOK_VERSION.legendHash, durationMs: base.durationMs, tokens: null, costUsd: null,
  };
}

/** The codes that may reach the record. Anything else a reader or a projector hands back is a constant here, never echoed (an outside value must not escape into telemetry). */
const READER_CODES: ReadonlySet<string> = new Set(["query_invalid", "request_invalid", "read_cycle_unavailable", "storage_unavailable", "snapshot_changed", "payload_limit", "memory_invalid"]);
const PROJECTOR_CODES: ReadonlySet<string> = new Set(["input_invalid", "payload_limit", "projector_threw"]);
const readerFailureOf = (code: unknown): string => (typeof code === "string" && READER_CODES.has(code) ? code : "reader_unavailable");
const projectorFailureOf = (code: unknown): string => (typeof code === "string" && PROJECTOR_CODES.has(code) ? code : "projector_invalid");
const isObject = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);
/** A reading of a clock; null when it threw or said something that is not a finite number. */
const tick = (clock: () => number): number | null => {
  try {
    const value = clock();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};
/** Key-sorted JSON, so two objects with the same content compare equal whatever the order their keys were written in. */
const canonical = (v: unknown): string => JSON.stringify(v, (_key, value) => (isObject(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : value));
/** A frame answers what was asked only when it names exactly the cohort of the host AND carries exactly the query that was sent (as the memory builder normalizes it). */
const answers = (frame: Readonly<Record<string, unknown>>, cycleIds: readonly string[], expected: MemoryQueryV2): boolean => {
  try {
    const returned = frame.requestedCycleIds;
    if (!Array.isArray(returned) || returned.length !== cycleIds.length || ![...returned].sort().every((id, i) => id === cycleIds[i])) return false;
    return isObject(frame.memory) && canonical(frame.memory.query) === canonical(expected);
  } catch {
    return false;
  }
};
/** Enough of the shape of a projected memory for the record to be built from it; anything less is a projector that did not do its job. This is NOT a validator of the hash or the schema of the output: a substituted projector is a trusted input, and only the default one is qualified. */
const looksLikeMemory = (v: unknown): v is BriefMemory =>
  isObject(v) && typeof v.h === "string" && isObject(v.items) && Array.isArray(v.gaps) && Array.isArray(v.cohorts) && Object.values(v.items).every((item) => isObject(item) && typeof item.q === "string");

interface Snapshot { readonly asOfMs: number; readonly cycleId: string; readonly arm: "A" | "B"; readonly cohort: readonly string[]; readonly itemIds: readonly string[]; readonly maxBytes: number | undefined }
/** The input read ONCE into plain data. An input that throws when it is read (a getter) or is not what it says it is makes the whole consultation `input_invalid`. */
function snapshotOf(input: MemoryHookInput & { readonly maxBytes?: number }): Snapshot | null {
  try {
    const asOfMs = input.asOfMs;
    const cycleId = input.cycleId;
    const arm = input.arm;
    const maxBytes = input.maxBytes;
    const cohort = Array.from(input.cohortCycleIds);
    const itemIds = Array.from(input.itemIds);
    if (!Number.isSafeInteger(asOfMs) || asOfMs < 0 || typeof cycleId !== "string" || (arm !== "A" && arm !== "B")) return null;
    if (!cohort.every((c) => typeof c === "string") || (maxBytes !== undefined && !(typeof maxBytes === "number" && Number.isFinite(maxBytes) && maxBytes >= 0))) return null;
    return { asOfMs, cycleId, arm, cohort: cohort as string[], itemIds: itemIds as string[], maxBytes };
  } catch {
    return null;
  }
}

const inputInvalid = (): MemoryHookOutcome => ({ enabled: true, memoria: undefined, record: record("input_invalid", "input_invalid", ZERO_BASE) });

/**
 * Builds the block for one cycle. Never throws, whatever the input, the reader, the projector or the clock do. `maxBytes` is the room the Brief has left for EVERYTHING the memory adds (`addedBytesOf`: value, key and
 * legend): a memory that does not fit is left out and the record says `over_budget` (it is never cut). The cohort asked is the canonical one (sorted, without repeats); every frame must answer exactly that set and
 * exactly the query that was sent, or it is unknown, never the cohort or the question of this cycle.
 */
export function buildMemoryBrief(input: MemoryHookInput & { readonly enabled: boolean; readonly maxBytes?: number }, deps: MemoryHookDeps): MemoryHookOutcome {
  try {
    if (input.enabled !== true) return { enabled: false };
  } catch {
    return { enabled: false };
  }
  try {
    return build(input, deps);
  } catch {
    return inputInvalid();
  }
}

function build(input: MemoryHookInput & { readonly maxBytes?: number }, deps: MemoryHookDeps): MemoryHookOutcome {
  const snap = snapshotOf(input);
  if (snap === null) return inputInvalid();
  const asked = [...new Set(snap.cohort)].sort();
  const { queries, expected, duplicates, invalid, overflow } = memoryQueries({ asOfMs: snap.asOfMs, cycleId: snap.cycleId, itemIds: snap.itemIds });
  const counts = { duplicates, invalid, overflow, cohort: asked.length };
  if (queries.length === 0) return { enabled: true, memoria: undefined, record: record("no_items", null, { ...counts, items: 0, durationMs: null }) };
  const started = tick(deps.clock);
  let failure: string | null = null;
  let results: CapturedMemoryResult[];
  try {
    // the reader is handed copies: what it does to them cannot reach the next consultation or the comparison below
    const read = deps.read({ arm: snap.arm, cycleIds: [...asked], queries: queries.map((q) => structuredClone(q)) });
    if (read.ok && Array.isArray(read.results) && read.results.length === queries.length) {
      results = [];
      let at = 0;
      for (const frame of read.results as readonly unknown[]) {
        const wanted = expected[at++]!;
        if (isObject(frame) && frame.ok === true) {
          if (answers(frame, asked, wanted)) results.push(frame as unknown as CapturedMemoryResult);
          else {
            failure ??= "request_invalid";
            results.push({ ok: false, code: "request_invalid" });
          }
        } else {
          failure ??= readerFailureOf(isObject(frame) ? frame.code : undefined);
          results.push(frame as unknown as CapturedMemoryResult);
        }
      }
    } else {
      const code = read.ok ? "memory_invalid" : read.code;
      failure = readerFailureOf(code);
      results = queries.map(() => ({ ok: false, code }));
    }
  } catch {
    failure = "storage_unavailable";
    results = queries.map(() => ({ ok: false, code: "storage_unavailable" }));
  }
  let projected: BriefMemoryResult;
  try {
    projected = (deps.project ?? projectBriefMemory)({ asOfMs: snap.asOfMs, cycleId: snap.cycleId, arm: snap.arm, items: queries.map((q, i) => ({ sourceItemId: q.itemScope.sourceItemId, result: results[i]! })) });
    if (!isObject(projected) || typeof projected.ok !== "boolean") projected = { ok: false, code: "projector_invalid" as never };
  } catch {
    projected = { ok: false, code: "projector_threw" as never };
  }
  const ended = tick(deps.clock);
  const base: Base = { ...counts, items: queries.length, durationMs: started !== null && ended !== null && ended >= started ? ended - started : null };
  const projectorFailed = (code: unknown): MemoryHookOutcome => ({ enabled: true, memoria: undefined, record: record("projector_failed", projectorFailureOf(code), base) });
  if (!projected.ok) return projectorFailed(projected.code);
  try {
    const memoria = projected.value;
    if (!looksLikeMemory(memoria)) return projectorFailed("projector_invalid");
    if (snap.maxBytes !== undefined && addedBytesOf(memoria) > snap.maxBytes) return { enabled: true, memoria: undefined, record: record("over_budget", null, base, memoria) };
    return { enabled: true, memoria, record: record(failure === null ? "ok" : "reader_failed", failure, base, memoria) };
  } catch {
    // a value that cannot even be measured is not one to send
    return projectorFailed("projector_invalid");
  }
}

/**
 * Puts the block where the contract says: after `execucoes` (when the Brief has it) and before `mandato`, keeping every other key in its place. Without a block the Brief comes back untouched, with the type it had (a `memoria`
 * it already held, `null` included, stays what it was). With a block, any `memoria` the Brief held is replaced by the new one in the canonical place.
 */
export function insertMemory<T extends Readonly<Record<string, unknown>>>(brief: T, memoria: undefined): T;
export function insertMemory<T extends Readonly<Record<string, unknown>>>(brief: T, memoria: BriefMemory): Omit<T, "memoria"> & { readonly memoria: BriefMemory };
export function insertMemory<T extends Readonly<Record<string, unknown>>>(brief: T, memoria: BriefMemory | undefined): T | (Omit<T, "memoria"> & { readonly memoria: BriefMemory });
export function insertMemory(brief: Readonly<Record<string, unknown>>, memoria: BriefMemory | undefined): unknown {
  if (memoria === undefined) return brief;
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [key, value] of Object.entries(brief)) {
    // a memory the Brief already held (old or null) is replaced, never kept next to or over the new one
    if (key === "memoria") continue;
    if (key === "mandato" && !placed) { out.memoria = memoria; placed = true; }
    out[key] = value;
  }
  if (!placed) out.memoria = memoria;
  return out;
}
