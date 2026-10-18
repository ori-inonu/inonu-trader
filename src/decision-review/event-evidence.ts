import { createHash } from "node:crypto";
import { parseOpportunityEvent, type OpportunityEvent, type OpportunityReviewAck } from "./events";

/** Local consistency evidence only. Hashes do not authenticate a provider, prove
 * that a model was called, authorize an order, or establish financial benefit. */
export const EVENT_EVIDENCE_SCHEMA = 1 as const;
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type Obj = { readonly [key: string]: Json };
type Scalar = null | boolean | number | string;
export interface OpportunityFactSnapshot {
  readonly schemaVersion: 1;
  readonly event: OpportunityEvent;
  /** First availability to this host, in the same clock domain as observedAtMs.
   * It is not replaced with the next cycle's start or cache-read time. */
  readonly availableAtMs: number;
  readonly facts: Readonly<Record<string, Scalar>>;
  readonly snapshotHash: string;
}
export type FactCaptureResult = { readonly ok: true; readonly value: OpportunityFactSnapshot } | { readonly ok: false; readonly code: "snapshot_invalid" };
export type BriefCaptureResult = { readonly ok: true; readonly brief: Obj; readonly hash: string } | { readonly ok: false; readonly code: "brief_invalid" };
type Status = "reviewed" | "binding_missing" | "binding_invalid" | "not_available" | "stale" | "facts_missing";
export interface OpportunityReviewProof {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly askedAtMs: number;
  readonly answeredAtMs: number;
  readonly maxAgeMs: number;
  /** Full SHA256 of the exact JSON key order of the captured Brief. */
  readonly briefHash: string;
  readonly events: readonly {
    readonly event: OpportunityEvent;
    readonly status: Status;
    readonly snapshotHash: string | null;
    readonly section: string | null;
    readonly itemId: string | null;
    readonly fields: Readonly<Record<string, string>> | null;
  }[];
  readonly sourceAuthenticated: false;
  readonly modelCallObserved: false;
  readonly executionProven: false;
  readonly hash: string;
}
export type OpportunityEvidenceResult = { readonly ok: true; readonly ack: OpportunityReviewAck; readonly proof: OpportunityReviewProof } | { readonly ok: false; readonly code: "input_invalid" | "brief_hash_mismatch" };

const obj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (o: Obj, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const field = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-zA-Z0-9_]{0,63}$/.test(v) && !["constructor", "prototype", "__proto__"].includes(v);
const sha = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Detach ordinary JSON without invoking getters/toJSON. Preserve key order for
 * the producer's actual serialization. Descriptor checks are not a sandbox for
 * arbitrary Proxy traps. Limits here bound representation, never trade size. */
function detached(raw: unknown): Json | undefined {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(v: unknown, depth: number): Json {
    if (++nodes > 50_000 || depth > 32) throw new Error("invalid");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return Object.is(v, -0) ? 0 : v;
    if (typeof v !== "object" || v === null || ancestors.has(v)) throw new Error("invalid");
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error("invalid");
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(v).some(k => typeof k !== "string")) throw new Error("invalid");
    const keys = Object.keys(descriptors).filter(k => !(array && k === "length"));
    if (keys.some(k => !descriptors[k]!.enumerable || !Object.hasOwn(descriptors[k]!, "value"))) throw new Error("invalid");
    if (array && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) throw new Error("invalid");
    ancestors.add(v);
    const out = array ? keys.map(k => visit(descriptors[k]!.value, depth + 1)) : Object.fromEntries(keys.map(k => [k, visit(descriptors[k]!.value, depth + 1)]));
    ancestors.delete(v);
    return Object.freeze(out);
  }
  try {
    const value = visit(raw, 0);
    return Buffer.byteLength(JSON.stringify(value)) <= 1_000_000 ? value : undefined;
  } catch { return undefined; }
}

function factsOf(raw: unknown): Readonly<Record<string, Scalar>> | null {
  if (!obj(raw)) return null;
  const keys = Object.keys(raw).sort();
  if (keys.length === 0 || keys.length > 64 || keys.some(k => !field(k))) return null;
  if (keys.some(k => { const value = raw[k]; return value !== null && typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string" || typeof value === "string" && value.length > 256; })) return null;
  return Object.freeze(Object.fromEntries(keys.map(k => [k, raw[k]]))) as Readonly<Record<string, Scalar>>;
}

/** The event fingerprint covers canonical material facts, not arrival times.
 * The snapshot hash additionally binds identity, observation and availability. */
export function captureOpportunityFacts(raw: unknown): FactCaptureResult {
  const r = detached(raw);
  if (!obj(r) || !exact(r, ["assetKey", "source", "kind", "observedAtMs", "availableAtMs", "facts"]) || !clock(r.observedAtMs) || !clock(r.availableAtMs) || r.availableAtMs < r.observedAtMs) return { ok: false, code: "snapshot_invalid" };
  const facts = factsOf(r.facts);
  if (facts === null) return { ok: false, code: "snapshot_invalid" };
  const event = parseOpportunityEvent({ assetKey: r.assetKey, source: r.source, kind: r.kind, observedAtMs: r.observedAtMs, fingerprint: sha(facts) });
  if (event === null) return { ok: false, code: "snapshot_invalid" };
  const body = { schemaVersion: EVENT_EVIDENCE_SCHEMA, event: Object.freeze(event), availableAtMs: r.availableAtMs, facts };
  return { ok: true, value: Object.freeze({ ...body, snapshotHash: sha(body) }) };
}

/** The host must send THIS detached, frozen Brief to the model and preserve its
 * hash, rather than serializing a mutable source again after capturing it. */
export function captureEventReviewBrief(raw: unknown): BriefCaptureResult {
  const brief = detached(raw);
  return obj(brief) ? { ok: true, brief, hash: sha(brief) } : { ok: false, code: "brief_invalid" };
}

function readSnapshot(raw: unknown): OpportunityFactSnapshot | null {
  if (!obj(raw) || !exact(raw, ["schemaVersion", "event", "availableAtMs", "facts", "snapshotHash"]) || raw.schemaVersion !== 1 || !obj(raw.event) || !hash(raw.snapshotHash)) return null;
  const event = parseOpportunityEvent(raw.event);
  if (event === null) return null;
  const built = captureOpportunityFacts({ assetKey: event.assetKey, source: event.source, kind: event.kind, observedAtMs: event.observedAtMs, availableAtMs: raw.availableAtMs, facts: raw.facts });
  return built.ok && built.value.snapshotHash === raw.snapshotHash && built.value.event.fingerprint === event.fingerprint ? built.value : null;
}

const eventId = (e: OpportunityEvent) => JSON.stringify([e.assetKey, e.source, e.kind, e.observedAtMs, e.fingerprint]);

/** Review a reported completed consultation against its exact captured Brief.
 * bindings map EVERY snapshot fact to one flat field of the matching active
 * buy/holding item. Matching values in legends, history or another token never
 * acknowledge this event. Macro CEX context needs its own future contract; no
 * fabricated token identity is accepted here. Missing evidence stays pending.
 *
 * This produces a local consistency ACK. The host still observes and journals
 * the real call/answer and passes the ACK to the same dispatcher/scheduler. */
export function proveOpportunityReview(raw: unknown): OpportunityEvidenceResult {
  const r = detached(raw);
  if (!obj(r) || !exact(r, ["cycleId", "askedAtMs", "answeredAtMs", "maxAgeMs", "brief", "briefHash", "batch", "bindings"]) || typeof r.cycleId !== "string" || !/^[A-Za-z0-9_:.-]{1,160}$/.test(r.cycleId) || !clock(r.askedAtMs) || !clock(r.answeredAtMs) || r.answeredAtMs < r.askedAtMs || !clock(r.maxAgeMs) || r.maxAgeMs < 1 || !obj(r.brief) || !hash(r.briefHash) || !Array.isArray(r.batch) || r.batch.length > 2048 || !Array.isArray(r.bindings) || r.bindings.length > r.batch.length) return { ok: false, code: "input_invalid" };
  if (sha(r.brief) !== r.briefHash) return { ok: false, code: "brief_hash_mismatch" };
  const batch: OpportunityEvent[] = [], ids = new Set<string>();
  for (const rawEvent of r.batch) {
    const event = parseOpportunityEvent(rawEvent);
    if (event === null || ids.has(eventId(event))) return { ok: false, code: "input_invalid" };
    ids.add(eventId(event)); batch.push(Object.freeze(event));
  }
  const bindings = new Map<string, Obj>();
  for (const rawBinding of r.bindings) {
    if (!obj(rawBinding) || !obj(rawBinding.snapshot)) return { ok: false, code: "input_invalid" };
    const event = parseOpportunityEvent(rawBinding.snapshot.event);
    if (event === null || !ids.has(eventId(event)) || bindings.has(eventId(event))) return { ok: false, code: "input_invalid" };
    bindings.set(eventId(event), rawBinding);
  }
  const reviewed: OpportunityEvent[] = [];
  const events: OpportunityReviewProof["events"][number][] = [];
  for (const event of batch) {
    const binding = bindings.get(eventId(event));
    let status: Status = "binding_missing", snapshot: OpportunityFactSnapshot | null = null;
    let section: string | null = null, itemId: string | null = null, fields: Readonly<Record<string, string>> | null = null;
    if (binding !== undefined) {
      status = "binding_invalid";
      snapshot = readSnapshot(binding.snapshot);
      const validItem = binding.section === "compras" ? binding.itemId === `buy:${event.assetKey}` : binding.section === "posicoes" && (binding.itemId === `hold:${event.assetKey}@agente` || binding.itemId === `hold:${event.assetKey}@principal`);
      if (exact(binding, ["snapshot", "section", "itemId", "fields"]) && snapshot !== null && validItem && typeof binding.section === "string" && typeof binding.itemId === "string" && obj(binding.fields)) {
        const keys = Object.keys(snapshot.facts), mapped = Object.values(binding.fields);
        if (Object.keys(binding.fields).length === keys.length && keys.every(k => Object.hasOwn(binding.fields as Obj, k)) && mapped.every(field) && new Set(mapped).size === keys.length) {
          section = binding.section; itemId = binding.itemId; fields = binding.fields as Readonly<Record<string, string>>;
          if (snapshot.availableAtMs > r.askedAtMs) status = "not_available";
          else if (r.askedAtMs - snapshot.event.observedAtMs > r.maxAgeMs) status = "stale";
          else {
            const group = r.brief[section], active = obj(group) ? group[itemId] : undefined;
            status = obj(active) && keys.every(k => Object.hasOwn(active, fields![k]!) && active[fields![k]!] === snapshot!.facts[k]) ? "reviewed" : "facts_missing";
          }
        }
      }
    }
    if (status === "reviewed") reviewed.push(event);
    events.push(Object.freeze({ event, status, snapshotHash: snapshot?.snapshotHash ?? null, section, itemId, fields }));
  }
  const body = { schemaVersion: EVENT_EVIDENCE_SCHEMA, cycleId: r.cycleId, askedAtMs: r.askedAtMs, answeredAtMs: r.answeredAtMs, maxAgeMs: r.maxAgeMs, briefHash: r.briefHash, events: Object.freeze(events), sourceAuthenticated: false as const, modelCallObserved: false as const, executionProven: false as const };
  return { ok: true, ack: Object.freeze({ reviewed: Object.freeze(reviewed) }), proof: Object.freeze({ ...body, hash: sha(body) }) };
}
