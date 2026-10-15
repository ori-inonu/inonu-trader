import { createHash } from "node:crypto";
import { captureEventReviewBrief } from "./event-evidence";
import { parseContextOpportunityEvent, type ContextOpportunityEvent, type ContextReviewAck } from "./context-events";

/** Macro CEX protocol, separate from token opportunities and wallet authority.
 * Provider origin time and local receipt/availability are different clocks. */
export interface ContextFact {
  readonly kind: "market_regime";
  readonly venue: "okx";
  readonly marketType: "SPOT" | "SWAP" | "FUTURES";
  readonly instrument: string;
  readonly source: "okx-public-trades";
  readonly units: { readonly returns: "percent"; readonly flow: "ratio_minus1_to_1"; readonly volatility: "percent_per_minute" };
  readonly originAtMs: number;
  readonly observedAtLocalMs: number;
  /** Present in the current producer: end of the last contributing CLOSED
   * minute, in the exchange clock. Absence is legacy, never reconstructed. */
  readonly windowEndMs?: number;
  readonly generation: number;
  readonly quality: { readonly bars: number; readonly gaps: number };
  readonly values: { readonly ret1m: number | null; readonly ret5m: number | null; readonly flow5m: number | null; readonly rv15m: number | null };
  readonly hash: string;
}
interface ContextSnapshotBase {
  readonly event: ContextOpportunityEvent;
  readonly availabilityBasis: "first_host_capture";
  /** First capture of this derived fact, not the next time its cache was read.
   * The host preserves this immutable snapshot by fact hash until consumed. */
  readonly availableAtMs: number;
  readonly snapshotHash: string;
}
export type ContextFactSnapshot = ContextSnapshotBase & (
  | { readonly schemaVersion: 1; readonly fact: Omit<ContextFact, "windowEndMs"> & { readonly windowEndMs?: never } }
  | { readonly schemaVersion: 2; readonly fact: ContextFact & { readonly windowEndMs: number } }
);
export interface ContextRegistryEntry { readonly contextKey: string; readonly prefix: string }
type Obj = Readonly<Record<string, unknown>>;
type Status = "ready" | "missing" | "not_available" | "stale";
type ContextState = { readonly contextKey: string; readonly factHash: string | null; readonly status: Status };
type Fields = Readonly<Record<string, number | string | null>>;
type CaptureResult = { readonly ok: true; readonly value: ContextFactSnapshot } | { readonly ok: false; readonly code: "snapshot_invalid" };
type ProjectionResult = { readonly ok: true; readonly context: Fields; readonly states: readonly ContextState[]; readonly registryHash: string; readonly contextAtMs: number } | { readonly ok: false; readonly code: "input_invalid" };
export interface ContextReviewProof {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly contextAtMs: number;
  readonly askedAtMs: number;
  readonly answeredAtMs: number;
  readonly maxAgeMs: number;
  readonly briefHash: string;
  readonly registryHash: string;
  readonly registry: readonly ContextRegistryEntry[];
  readonly events: readonly { readonly event: ContextOpportunityEvent; readonly snapshotHash: string | null; readonly status: "reviewed" | "snapshot_missing" | "not_available" | "stale" | "context_missing" }[];
  readonly sourceAuthenticated: false;
  readonly modelCallObserved: false;
  readonly executionProven: false;
  readonly seriesFreshness: "reported_by_producer";
  readonly hash: string;
}
type ReviewResult = { readonly ok: true; readonly ack: ContextReviewAck; readonly proof: ContextReviewProof } | { readonly ok: false; readonly code: "input_invalid" | "brief_hash_mismatch" };

const obj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (r: Obj, keys: readonly string[]) => Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k));
const natural = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const nullableNumber = (v: unknown): v is number | null => v === null || typeof v === "number" && Number.isFinite(v);
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
/** Called only on detached JSON, never on an original live object. */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => obj(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);
function detached(raw: unknown): Obj | null {
  const result = captureEventReviewBrief(raw);
  return result.ok ? result.brief : null;
}

function normalizedFact(raw: unknown): ContextFact | null {
  if (!obj(raw)) return null;
  const hasWindow = Object.hasOwn(raw, "windowEndMs");
  if (!exact(raw, ["kind", "venue", "marketType", "instrument", "source", "units", "originAtMs", "observedAtLocalMs", "generation", "quality", "values", "hash", ...(hasWindow ? ["windowEndMs"] : [])]) || raw.kind !== "market_regime" || raw.venue !== "okx" || raw.source !== "okx-public-trades" || !["SPOT", "SWAP", "FUTURES"].includes(raw.marketType as string) || typeof raw.instrument !== "string" || !natural(raw.originAtMs) || !natural(raw.observedAtLocalMs) || !natural(raw.generation) || !hash(raw.hash)) return null;
  // Both clocks below belong to the exchange. No local epoch is compared with
  // the bar window; this alone does not recompute the series' current freshness.
  if (hasWindow && (!natural(raw.windowEndMs) || raw.windowEndMs % 60_000 !== 0 || raw.originAtMs < raw.windowEndMs - 60_000 || raw.originAtMs >= raw.windowEndMs)) return null;
  const units = raw.units, quality = raw.quality, values = raw.values;
  if (!obj(units) || !exact(units, ["returns", "flow", "volatility"]) || units.returns !== "percent" || units.flow !== "ratio_minus1_to_1" || units.volatility !== "percent_per_minute" || !obj(quality) || !exact(quality, ["bars", "gaps"]) || !natural(quality.bars) || quality.bars < 1 || !natural(quality.gaps) || quality.gaps > 15 || !obj(values) || !exact(values, ["ret1m", "ret5m", "flow5m", "rv15m"]) || !Object.values(values).every(nullableNumber) || Object.values(values).every(v => v === null)) return null;
  if (values.ret1m !== null && (values.ret1m as number) < -100 || values.ret5m !== null && (values.ret5m as number) < -100 || values.flow5m !== null && Math.abs(values.flow5m as number) > 1 || values.rv15m !== null && (values.rv15m as number) < 0) return null;
  const event = parseContextOpportunityEvent({ contextKey: `okx:${raw.marketType}:${raw.instrument}`, source: raw.source, kind: raw.kind, observedAtMs: raw.observedAtLocalMs, factHash: raw.hash });
  if (event === null) return null;
  const body = { kind: raw.kind, venue: raw.venue, marketType: raw.marketType, instrument: raw.instrument, source: raw.source,
    units: { returns: units.returns, flow: units.flow, volatility: units.volatility }, originAtMs: raw.originAtMs, observedAtLocalMs: raw.observedAtLocalMs, ...(hasWindow ? { windowEndMs: raw.windowEndMs } : {}), generation: raw.generation,
    quality: { bars: quality.bars, gaps: quality.gaps }, values: { ret1m: values.ret1m, ret5m: values.ret5m, flow5m: values.flow5m, rv15m: values.rv15m } };
  return sha(canonical(body)) === raw.hash ? { ...body, hash: raw.hash } as ContextFact : null;
}

export function captureContextFacts(raw: unknown): CaptureResult {
  const input = detached(raw);
  if (!input || !exact(input, ["fact", "availableAtMs"]) || !natural(input.availableAtMs)) return { ok: false, code: "snapshot_invalid" };
  const fact = normalizedFact(input.fact);
  if (fact === null || input.availableAtMs < fact.observedAtLocalMs) return { ok: false, code: "snapshot_invalid" };
  const event = parseContextOpportunityEvent({ contextKey: `okx:${fact.marketType}:${fact.instrument}`, source: fact.source, kind: fact.kind, observedAtMs: fact.observedAtLocalMs, factHash: fact.hash })!;
  const capture = captureEventReviewBrief({ schemaVersion: Object.hasOwn(fact, "windowEndMs") ? 2 : 1, event, fact, availabilityBasis: "first_host_capture", availableAtMs: input.availableAtMs });
  if (!capture.ok) return { ok: false, code: "snapshot_invalid" };
  return { ok: true, value: Object.freeze({ ...capture.brief, snapshotHash: capture.hash }) as unknown as ContextFactSnapshot };
}

const eventId = (event: ContextOpportunityEvent) => JSON.stringify([event.contextKey, event.source, event.kind, event.observedAtMs, event.factHash]);
function snapshotOf(raw: unknown): ContextFactSnapshot | null {
  if (!obj(raw) || !exact(raw, ["schemaVersion", "event", "fact", "availabilityBasis", "availableAtMs", "snapshotHash"]) || raw.schemaVersion !== 1 && raw.schemaVersion !== 2 || raw.availabilityBasis !== "first_host_capture" || !hash(raw.snapshotHash)) return null;
  const event = parseContextOpportunityEvent(raw.event), built = captureContextFacts({ fact: raw.fact, availableAtMs: raw.availableAtMs });
  return event !== null && built.ok && built.value.schemaVersion === raw.schemaVersion && built.value.snapshotHash === raw.snapshotHash && eventId(event) === eventId(built.value.event) ? built.value : null;
}

function inputs(registryRaw: unknown, snapshotsRaw: unknown): { registry: readonly ContextRegistryEntry[]; snapshots: ReadonlyMap<string, ContextFactSnapshot>; registryHash: string } | null {
  if (!Array.isArray(registryRaw) || registryRaw.length > 64 || !Array.isArray(snapshotsRaw) || snapshotsRaw.length > registryRaw.length) return null;
  const registry: ContextRegistryEntry[] = [], keys = new Set<string>(), prefixes = new Set<string>();
  for (const entry of registryRaw) {
    if (!obj(entry) || !exact(entry, ["contextKey", "prefix"]) || typeof entry.contextKey !== "string" || typeof entry.prefix !== "string" || !/^[a-z][a-z0-9]{0,11}$/.test(entry.prefix) || keys.has(entry.contextKey) || prefixes.has(entry.prefix) || !parseContextOpportunityEvent({ contextKey: entry.contextKey, source: "okx-public-trades", kind: "market_regime", observedAtMs: 0, factHash: "0".repeat(64) })) return null;
    keys.add(entry.contextKey); prefixes.add(entry.prefix); registry.push(Object.freeze({ contextKey: entry.contextKey, prefix: entry.prefix }));
  }
  registry.sort((a, b) => a.contextKey < b.contextKey ? -1 : a.contextKey > b.contextKey ? 1 : 0);
  const snapshots = new Map<string, ContextFactSnapshot>();
  for (const raw of snapshotsRaw) {
    const snapshot = snapshotOf(raw);
    if (!snapshot || !keys.has(snapshot.event.contextKey) || snapshots.has(snapshot.event.contextKey)) return null;
    snapshots.set(snapshot.event.contextKey, snapshot);
  }
  return { registry: Object.freeze(registry), snapshots, registryHash: sha(JSON.stringify(registry)) };
}

const statusOf = (snapshot: ContextFactSnapshot | undefined, asOfMs: number, maxAgeMs: number): Status => snapshot === undefined ? "missing" : snapshot.availableAtMs > asOfMs ? "not_available" : asOfMs - snapshot.event.observedAtMs > maxAgeMs ? "stale" : "ready";
/** Fixed protocol fields. Hash and quality must actually be in the model's
 * active context, not merely attached to a journal the model never received. */
function fieldsOf(prefix: string, snapshot: ContextFactSnapshot | undefined, asOfMs: number, ready: boolean): Fields {
  return Object.freeze({
    [`${prefix}_1m`]: ready ? snapshot!.fact.values.ret1m : null,
    [`${prefix}_5m`]: ready ? snapshot!.fact.values.ret5m : null,
    [`${prefix}_fl`]: ready ? snapshot!.fact.values.flow5m : null,
    [`${prefix}_rv`]: ready ? snapshot!.fact.values.rv15m : null,
    [`${prefix}_fh`]: ready ? snapshot!.fact.hash : null,
    [`${prefix}_age_ms`]: ready ? asOfMs - snapshot!.event.observedAtMs : null,
    [`${prefix}_asof_ms`]: ready ? asOfMs : null,
    [`${prefix}_bars`]: ready ? snapshot!.fact.quality.bars : null,
    [`${prefix}_gaps`]: ready ? snapshot!.fact.quality.gaps : null,
    [`${prefix}_gen`]: ready ? snapshot!.fact.generation : null,
  });
}

/** Small selected context, not an instruction to send every observed market.
 * Missing/stale data explicitly clears its protocol keys to null. Existing
 * context must be merged with THIS projection, not stale pulse cache values. */
export function projectContextFacts(raw: unknown): ProjectionResult {
  const r = detached(raw);
  if (!r || !exact(r, ["registry", "snapshots", "asOfMs", "maxAgeMs"]) || !natural(r.asOfMs) || !natural(r.maxAgeMs) || r.maxAgeMs < 1) return { ok: false, code: "input_invalid" };
  const frame = inputs(r.registry, r.snapshots);
  if (!frame) return { ok: false, code: "input_invalid" };
  const context: Record<string, number | string | null> = {}, states: ContextState[] = [];
  for (const entry of frame.registry) {
    const snapshot = frame.snapshots.get(entry.contextKey), status = statusOf(snapshot, r.asOfMs, r.maxAgeMs);
    Object.assign(context, fieldsOf(entry.prefix, snapshot, r.asOfMs, status === "ready"));
    states.push(Object.freeze({ contextKey: entry.contextKey, factHash: snapshot?.fact.hash ?? null, status }));
  }
  return { ok: true, context: Object.freeze(context), states: Object.freeze(states), registryHash: frame.registryHash, contextAtMs: r.asOfMs };
}

/** Local consistency only. The integration must capture the real call/answer
 * and send the frozen Brief before deriving this ACK, through the SAME flight.
 * Exchange originAtMs is preserved as metadata, never compared to local askedAt.
 * Ten matching context fields include the fact hash, age, context time and
 * measured quality. Preparation time is distinct from actual model-call time. */
export function proveContextReview(raw: unknown): ReviewResult {
  const r = detached(raw);
  if (!r || !exact(r, ["cycleId", "contextAtMs", "askedAtMs", "answeredAtMs", "maxAgeMs", "brief", "briefHash", "batch", "registry", "snapshots"]) || typeof r.cycleId !== "string" || !/^[A-Za-z0-9_:.-]{1,160}$/.test(r.cycleId) || !natural(r.contextAtMs) || !natural(r.askedAtMs) || r.contextAtMs > r.askedAtMs || !natural(r.answeredAtMs) || r.answeredAtMs < r.askedAtMs || !natural(r.maxAgeMs) || r.maxAgeMs < 1 || !obj(r.brief) || !hash(r.briefHash) || !Array.isArray(r.batch) || r.batch.length > 64) return { ok: false, code: "input_invalid" };
  const captured = captureEventReviewBrief(r.brief);
  if (!captured.ok || captured.hash !== r.briefHash) return { ok: false, code: "brief_hash_mismatch" };
  const frame = inputs(r.registry, r.snapshots);
  if (!frame) return { ok: false, code: "input_invalid" };
  const byKey = new Map(frame.registry.map(entry => [entry.contextKey, entry])), seen = new Set<string>();
  const reviewed: ContextOpportunityEvent[] = [], events: ContextReviewProof["events"][number][] = [];
  for (const rawEvent of r.batch) {
    const event = parseContextOpportunityEvent(rawEvent);
    if (!event || seen.has(event.contextKey) || !byKey.has(event.contextKey)) return { ok: false, code: "input_invalid" };
    seen.add(event.contextKey);
    const snapshot = frame.snapshots.get(event.contextKey);
    let status: ContextReviewProof["events"][number]["status"] = "snapshot_missing";
    if (snapshot && eventId(event) === eventId(snapshot.event)) {
      const ageStatus = statusOf(snapshot, r.contextAtMs, r.maxAgeMs);
      if (ageStatus === "not_available" || ageStatus === "stale") status = ageStatus;
      else if (r.askedAtMs - snapshot.event.observedAtMs > r.maxAgeMs) status = "stale";
      else {
        const expected = fieldsOf(byKey.get(event.contextKey)!.prefix, snapshot, r.contextAtMs, true), context = r.brief.contexto;
        status = obj(context) && Object.entries(expected).every(([key, value]) => Object.hasOwn(context, key) && context[key] === value) ? "reviewed" : "context_missing";
      }
    }
    if (status === "reviewed") reviewed.push(Object.freeze(event));
    events.push(Object.freeze({ event: Object.freeze(event), snapshotHash: snapshot && eventId(event) === eventId(snapshot.event) ? snapshot.snapshotHash : null, status }));
  }
  const body = { schemaVersion: 1 as const, cycleId: r.cycleId, contextAtMs: r.contextAtMs, askedAtMs: r.askedAtMs, answeredAtMs: r.answeredAtMs, maxAgeMs: r.maxAgeMs, briefHash: r.briefHash, registryHash: frame.registryHash, registry: frame.registry, events: Object.freeze(events), sourceAuthenticated: false as const, modelCallObserved: false as const, executionProven: false as const, seriesFreshness: "reported_by_producer" as const };
  return { ok: true, ack: Object.freeze({ reviewed: Object.freeze(reviewed) }), proof: Object.freeze({ ...body, hash: sha(JSON.stringify(body)) }) };
}
