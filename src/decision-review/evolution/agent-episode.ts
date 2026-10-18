import { createHash } from "node:crypto";
import { auditConsult, type CandidateAudit, type ConsultAudit } from "../audit";
import { chainByIndex, isAddressForChain } from "../../okx-wallet/chains";
import type { ExperienceContext, ExperienceEpisode, ExperienceEpisodeV2 } from "./memory";

export type CapturedJson = null | boolean | number | string | readonly CapturedJson[] | { readonly [key: string]: CapturedJson };
export type CapturedObject = { readonly [key: string]: CapturedJson };

/** Optional ORIGINAL producer reports, bound to this exact record and full Brief.
 * Matching hashes/clocks establishes consistency only, never authentication,
 * execution, financial performance or the truth of market facts. */
export interface ProducerDecisionMetadata {
  readonly schemaVersion: 1;
  readonly sourceRecordHash: string;
  readonly snapshotHash: string;
  readonly decisionVersion: string;
  readonly evaluatorHash: string;
  readonly askedAtMs: number;
  readonly answeredAtMs: number;
  /** Reported construction/write clock of the METADATA, which may follow the
   * first raw-record observation. It is not raw publication or local availability. */
  readonly recordedAtMs: number;
  readonly factAvailableAtMs: number;
  readonly arm: "A" | "B";
}
export interface AgentCaptureOptions {
  /** First local availability of this immutable source record, supplied by a
   * durable capture journal. Rereads must retain the original value. */
  readonly firstObservedAtMs: number;
  readonly prospective?: {
    readonly metadata: ProducerDecisionMetadata;
    /** Separate first availability of metadata. Later metadata may not backdate
     * the memory revision to its earlier, self-reported origin clock. */
    readonly firstObservedAtMs: number;
  };
}
type QualificationGap = "producer_metadata_missing" | "producer_metadata_invalid" | "producer_clock_invalid" | "source_record_mismatch" | "source_snapshot_mismatch" | "shadow_mode_mismatch";
export interface CapturedAgentEpisode {
  readonly candidateId: string;
  readonly assetKey: string;
  readonly walletOrigin: "agente" | "principal" | null;
  readonly kind: "buy" | "holding";
  readonly requested: string | null;
  /** Validated selection in a consultation record, never an execution receipt. */
  readonly applied: string | null;
  readonly offered: readonly string[];
  readonly profile: string | null;
  readonly marks: readonly string[];
  readonly families: readonly string[];
  readonly triggers: readonly string[];
  readonly cap: CapturedObject | null;
  readonly audit: CandidateAudit;
  readonly experience: ExperienceEpisode | null;
  readonly memoryGap: "producer_metadata_missing" | "producer_metadata_rejected" | "choice_trace_incomplete" | "decision_item_duplicate" | null;
}
export interface CapturedAgentConsult {
  readonly schemaVersion: 1;
  readonly evidence: "captured_decision_journal";
  /** Local content hash binding sourceRecordHash and supplied producer metadata.
   * Observation clocks are deliberately excluded for stable rereads. */
  readonly captureHash: string;
  /** Local exact JSON serialized source hash, not proof of source authority. */
  readonly sourceRecordHash: string;
  readonly sourceRecord: CapturedObject;
  readonly firstObservedAtMs: number;
  readonly cycleId: string;
  readonly cycleStartedAtMs: number;
  readonly decisionAtMs: number | null;
  readonly sourceBriefHash: string | null;
  readonly sourceSnapshotHash: string | null;
  readonly physicalRequests: number | null;
  readonly producerMetadata: ProducerDecisionMetadata | null;
  readonly metadataFirstObservedAtMs: number | null;
  readonly qualification: {
    readonly status: "legacy" | "prospective_bound" | "metadata_rejected";
    readonly sourceAuthenticated: false;
    readonly gaps: readonly QualificationGap[];
  };
  readonly audit: ConsultAudit;
  readonly episodes: readonly CapturedAgentEpisode[];
}
export type AgentCaptureResult = { readonly ok: true; readonly capture: CapturedAgentConsult } | { readonly ok: false; readonly code: "source_invalid" | "observation_invalid" };

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const digest = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 40 && v.every(s => typeof s === "string" && s.length > 0 && s.length <= 160);
const exact = (r: Record<string, unknown>, keys: readonly string[]) => Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k));

/** Reject live/non-JSON objects before reading property values. Preserve insertion
 * order because the producer's Brief fingerprint uses JSON.stringify, not sorted
 * keys. A changed order can therefore never deduplicate a changed fingerprint. */
function sourceJson(raw: unknown): CapturedObject | null {
  let nodes = 0;
  const ancestors = new Set<object>();
  function clone(v: unknown, depth: number): CapturedJson {
    if (++nodes > 50_000 || depth > 32) throw new Error("invalid");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || v === null || ancestors.has(v)) throw new Error("invalid");
    const proto = Object.getPrototypeOf(v);
    if (Array.isArray(v) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error("invalid");
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(v).some(k => typeof k !== "string")) throw new Error("invalid");
    const keys = Object.keys(descriptors).filter(k => !(Array.isArray(v) && k === "length"));
    if (keys.some(k => !descriptors[k]!.enumerable || !Object.hasOwn(descriptors[k]!, "value"))) throw new Error("invalid");
    if (Array.isArray(v) && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) throw new Error("invalid");
    ancestors.add(v);
    const result: CapturedJson = Array.isArray(v)
      ? keys.map(k => clone(descriptors[k]!.value, depth + 1))
      : Object.fromEntries(keys.map(k => [k, clone(descriptors[k]!.value, depth + 1)]));
    ancestors.delete(v);
    return result;
  }
  try {
    if (obj(raw) === null) return null;
    const value = clone(raw, 0) as CapturedObject;
    return JSON.stringify(value).length <= 1_000_000 ? value : null;
  } catch { return null; }
}

/** Bounded, descriptor-validated and detached plain JSON object. Hosts must
 * serialize THIS clone, never re-read or stringify the original live object.
 * This validates JSON shape only, not ConsultRecord semantics or authority. */
export function captureSourceObject(raw: unknown): CapturedObject | null {
  return sourceJson(raw);
}

/** Exact JSON.stringify hash after strict, bounded JSON validation. Does not
 * validate ConsultRecord semantics. No sorting and no local clock in the hash. */
export function sourceConsultDigest(raw: unknown): string | null {
  const value = sourceJson(raw);
  return value === null ? null : digest(value);
}

function identity(id: string, kind: CandidateAudit["kind"]): { assetKey: string; walletOrigin: CapturedAgentEpisode["walletOrigin"] } | null {
  const holding = /^hold:(token:[^:]+:.+)@(agente|principal)$/.exec(id);
  const buying = /^buy:(token:[^:]+:.+)$/.exec(id);
  const token = kind === "holding" ? holding?.[1] : buying?.[1];
  if (kind === "buy" && holding !== null || token === undefined) return null;
  const match = /^token:([^:]+):(.+)$/.exec(token);
  // The actual book/holding producer emits token:<chain>:native, preserving
  // native as its own canonical asset rather than a wrapped-token alias.
  if (!match || !chainByIndex(match[1]!) || match[2] !== "native" && !isAddressForChain(match[1]!, match[2]!)) return null;
  return { assetKey: `token:${match[1]}:${chainByIndex(match[1]!)?.kind === "evm" ? match[2]!.toLowerCase() : match[2]}`,
    walletOrigin: kind === "holding" ? holding![2] as "agente" | "principal" : null };
}

function fullBriefHash(r: CapturedObject): string | null {
  const b = obj(r.brief);
  if (!b || r.briefVersion !== 1 || !["carteira", "chaves", "posicoes", "compras"].every(k => obj(b[k]) !== null) || !Object.hasOwn(b, "mandato") || !Object.hasOwn(r, "contexto") || !Object.hasOwn(r, "historico")) return null;
  return digest({ v: 1, carteira: b.carteira, chaves: b.chaves, posicoes: b.posicoes, compras: b.compras, contexto: r.contexto, historico: r.historico,
    ...(Object.hasOwn(b, "execucoes") ? { execucoes: b.execucoes } : {}), ...(Object.hasOwn(b, "memoria") ? { memoria: b.memoria } : {}), mandato: b.mandato });
}

function producer(raw: unknown): ProducerDecisionMetadata | null {
  const r = obj(sourceJson(raw));
  if (!r || !exact(r, ["schemaVersion", "sourceRecordHash", "snapshotHash", "decisionVersion", "evaluatorHash", "askedAtMs", "answeredAtMs", "recordedAtMs", "factAvailableAtMs", "arm"]) || r.schemaVersion !== 1 || ![r.sourceRecordHash, r.snapshotHash, r.decisionVersion, r.evaluatorHash].every(hash) || ![r.askedAtMs, r.answeredAtMs, r.recordedAtMs, r.factAvailableAtMs].every(clock) || r.arm !== "A" && r.arm !== "B") return null;
  return r as unknown as ProducerDecisionMetadata;
}

function action(selected: string | null, valid: boolean | null): ExperienceEpisode["action"] {
  if (valid !== true) return "unknown";
  if (selected === "skip" || selected === "hold") return selected;
  if (["buy_tenth", "buy_third", "buy_two_thirds", "buy_full"].includes(selected ?? "")) return "buy";
  if (["trim_third", "trim_half", "exit_all"].includes(selected ?? "")) return "sell";
  return "unknown";
}

/** Read-only adaptation of the ACTUAL consultation and audit contracts. `atMs`
 * remains cycle start. Legacy records are diagnostic only. No text/facet/choice
 * concentration is converted into market facts, motive or financial reward. */
export function captureAgentConsult(raw: unknown, options: AgentCaptureOptions): AgentCaptureResult {
  const sourceRecord = sourceJson(raw);
  if (!sourceRecord) return { ok: false, code: "source_invalid" };
  const audit = auditConsult(sourceRecord);
  if (!audit || !/^[A-Za-z0-9_-]{1,128}$/.test(audit.cycleId)) return { ok: false, code: "source_invalid" };
  if (!clock(options?.firstObservedAtMs) || options.firstObservedAtMs < audit.atMs) return { ok: false, code: "observation_invalid" };
  const sourceRecordHash = digest(sourceRecord);
  const rawCandidates = sourceRecord.candidates as readonly CapturedObject[];
  const profiles = obj(sourceRecord.profiles);
  const episodes: CapturedAgentEpisode[] = [];
  for (let i = 0; i < audit.candidates.length; i++) {
    const a = audit.candidates[i]!, c = rawCandidates[i]!;
    const asset = identity(a.id, a.kind);
    if (!asset || c.families !== undefined && !strings(c.families) || c.triggers !== undefined && !strings(c.triggers) || c.cap !== undefined && obj(c.cap) === null) return { ok: false, code: "source_invalid" };
    episodes.push({ candidateId: a.id, ...asset, kind: a.kind, requested: a.requested,
      applied: audit.decisionValid === true && a.selected !== null && a.offered.includes(a.selected) ? a.selected : null,
      offered: [...a.offered], profile: typeof profiles?.[a.id] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(profiles[a.id] as string) ? profiles[a.id] as string : null,
      marks: [...c.marks as readonly string[]], families: [...(c.families as readonly string[] | undefined ?? [])], triggers: [...(c.triggers as readonly string[] | undefined ?? [])],
      cap: c.cap as CapturedObject | undefined ?? null, audit: a, experience: null, memoryGap: "producer_metadata_missing" });
  }
  const gaps: QualificationGap[] = [];
  let metadata: ProducerDecisionMetadata | null = null;
  let metadataFirstObservedAtMs: number | null = null;
  let status: CapturedAgentConsult["qualification"]["status"] = "legacy";
  const p = options.prospective;
  if (p === undefined) gaps.push("producer_metadata_missing");
  else {
    status = "metadata_rejected";
    metadata = producer(p?.metadata);
    if (!metadata) gaps.push("producer_metadata_invalid");
    else {
      if (!clock(p.firstObservedAtMs) || p.firstObservedAtMs < options.firstObservedAtMs || metadata.factAvailableAtMs > metadata.askedAtMs || metadata.askedAtMs < audit.atMs || metadata.askedAtMs > metadata.answeredAtMs || metadata.answeredAtMs > options.firstObservedAtMs || metadata.answeredAtMs > metadata.recordedAtMs || metadata.recordedAtMs > p.firstObservedAtMs) gaps.push("producer_clock_invalid");
      else metadataFirstObservedAtMs = p.firstObservedAtMs;
      if (metadata.sourceRecordHash !== sourceRecordHash) gaps.push("source_record_mismatch");
      if (audit.briefFingerprint !== "matched" || metadata.snapshotHash !== fullBriefHash(sourceRecord)) gaps.push("source_snapshot_mismatch");
      if (metadata.arm === "B" && audit.mode !== "sombra") gaps.push("shadow_mode_mismatch");
      if (gaps.length === 0) status = "prospective_bound";
    }
  }
  const logicalItem = (e: CapturedAgentEpisode) => JSON.stringify([e.kind, e.assetKey, e.walletOrigin]);
  const occurrences = new Map<string, number>();
  for (const e of episodes) occurrences.set(logicalItem(e), (occurrences.get(logicalItem(e)) ?? 0) + 1);
  const converted = episodes.map(e => {
    const trace = audit.decisionValid !== null && e.audit.requested !== null && !["inconsistent", "model_or_post_choice_guard"].includes(e.audit.source);
    // One consultation cannot assign two choices to the same logical item.
    // Preserve both diagnostic traces, including sizes, rather than collapse
    // their common buy/hold/sell label into apparently consistent memory.
    // Distinct item kinds and holding roles remain independent items.
    const memoryGap: CapturedAgentEpisode["memoryGap"] = occurrences.get(logicalItem(e))! > 1 ? "decision_item_duplicate" : status === "legacy" ? "producer_metadata_missing" : status !== "prospective_bound" ? "producer_metadata_rejected" : !trace ? "choice_trace_incomplete" : null;
    if (memoryGap !== null || metadata === null || metadataFirstObservedAtMs === null) return { ...e, memoryGap };
    const context: ExperienceContext = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] };
    const experience: ExperienceEpisodeV2 = { schemaVersion: 2, cycleId: audit.cycleId, candidateId: e.assetKey, itemScope: { sourceItemId: e.candidateId, kind: e.kind, assetKey: e.assetKey, walletRole: e.walletOrigin, physicalWalletIdentity: "unknown", walletAddress: null }, snapshotHash: metadata.snapshotHash, decisionVersion: metadata.decisionVersion, evaluatorHash: metadata.evaluatorHash,
      episodeVersion: 1, decidedAtMs: metadata.answeredAtMs, recordedAtMs: Math.max(options.firstObservedAtMs, metadataFirstObservedAtMs), factAvailableAtMs: metadata.factAvailableAtMs,
      arm: metadata.arm, action: action(e.applied, audit.decisionValid), source: metadata.arm === "A" ? "decision_journal" : "shadow_journal", context, observations: [], outcome: null, counterfactuals: [] };
    return { ...e, memoryGap: null, experience };
  });
  // The supplied metadata digest remains distinct from sourceRecordHash. Invalid
  // JSON metadata gets a constant marker and never becomes producer evidence.
  const metadataJson = p === undefined ? null : sourceJson(p.metadata);
  return { ok: true, capture: { schemaVersion: 1, evidence: "captured_decision_journal", captureHash: digest({ sourceRecordHash, producerMetadata: p === undefined ? null : metadataJson ?? "invalid_json_metadata" }),
    sourceRecordHash, sourceRecord, firstObservedAtMs: options.firstObservedAtMs, cycleId: audit.cycleId, cycleStartedAtMs: audit.atMs,
    decisionAtMs: status === "prospective_bound" ? metadata!.answeredAtMs : null, sourceBriefHash: audit.briefHash,
    sourceSnapshotHash: status === "prospective_bound" ? metadata!.snapshotHash : null,
    physicalRequests: clock(sourceRecord.physicalRequests) && sourceRecord.physicalRequests > 0 ? sourceRecord.physicalRequests : null,
    producerMetadata: metadata, metadataFirstObservedAtMs, qualification: { status, sourceAuthenticated: false, gaps }, audit, episodes: converted } };
}
