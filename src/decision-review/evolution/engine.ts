import { createHash } from "node:crypto";
import { compareShadowRound, type ShadowComparison, type ShadowRound } from "../ab-comparison";

/** Pure intelligence-version state machine. No wallet, executor, network, clock,
 * persistence or LLM is available here. Question/fact refs must additionally be
 * resolved against the application's closed, implemented registry by its adapter.
 * Hashes detect consistency, not source authenticity. Qualification statistics
 * are externally reported and are never independently certified by this module. */
export interface IntelligencePolicy {
  readonly factOrder: readonly string[];
  readonly memory: { readonly rankBy: "similarity" | "recency" | "outcome_balance"; readonly featureRefs: readonly string[] };
  readonly questionRefs: readonly string[];
}
export interface IntelligenceArtifact {
  readonly schema: 1;
  readonly version: string;
  readonly parentVersion: string | null;
  readonly hypothesisId: string | null;
  readonly createdAtMs: number;
  readonly policy: IntelligencePolicy;
}
export interface EvolutionProtocol {
  readonly evaluatorHash: string;
  readonly holdoutHash: string;
  readonly method: "fixed_holdout" | "sequential";
  readonly decisionAfterMs: number;
  readonly minComparablePairs: number;
  readonly uncertaintyMethodRef: string;
  readonly significanceLevel: number;
}
export interface EvolutionOutcome {
  readonly roundId: string;
  readonly pairId: string;
  readonly arm: "A" | "B";
  readonly version: string;
  readonly evaluatorHash: string;
  readonly baselineHash: string;
  readonly snapshotHash: string;
  readonly startAtMs: number;
  readonly endAtMs: number;
  readonly availableAtMs: number | null;
  readonly metric: "unitized_net_return_pct";
  readonly numeraireKey: string;
  readonly evidence: "observed" | "simulated";
  readonly returnPct: number | null;
  readonly costs: "complete" | "unknown";
  readonly cashFlows: "adjusted" | "unknown";
  readonly valuation: "complete" | "partial";
}
export interface EvolutionRound {
  readonly manifest: ShadowRound;
  readonly protocol: EvolutionProtocol;
  readonly hypothesis: { readonly id: string; readonly change: "fact_order" | "memory_selection" | "question_refs"; readonly evidenceRefs: readonly string[] };
  readonly candidate: IntelligenceArtifact;
  readonly observations: readonly EvolutionOutcome[];
  /** Sealing freezes the cohort. Existing pending keys may still mature. */
  readonly sealedAtMs: number | null;
}
export interface QualificationAssessment {
  readonly id: string;
  readonly roundId: string;
  readonly aVersion: string;
  readonly bVersion: string;
  readonly evaluatorHash: string;
  readonly baselineHash: string;
  readonly protocolHash: string;
  readonly holdoutHash: string;
  readonly observationsHash: string;
  readonly comparisonHash: string;
  readonly evaluatedAtMs: number;
  readonly determination: "qualified" | "insufficient" | "rejected";
  readonly pairIds: readonly string[];
  readonly netAdvantageLowerBoundPp: number | null;
  readonly significanceLevel: number;
  readonly temporalDependence: "accounted" | "unknown";
  readonly repeatedTesting: "accounted" | "unknown";
  readonly costs: "comparable" | "unknown";
  readonly operationalRegression: "absent" | "present" | "unknown";
  readonly holdoutUnseenByResearcher: boolean;
  readonly artifactQualificationHash: string | null;
  readonly sourceQualificationHash: string | null;
}
const EVOLUTION_CODES = [
  "created", "state_invalid", "clock_invalid", "policy_invalid", "round_proposed", "round_invalid", "round_active", "round_missing", "round_id_reused", "hypothesis_reused", "hypothesis_change_invalid", "outcome_invalid", "outcome_recorded", "outcome_matured", "outcome_duplicate", "outcome_pending_stale", "outcome_conflict", "observation_capacity", "round_sealed", "round_already_sealed", "round_unsealed", "sealed", "assessment_invalid", "assessment_context_mismatch", "assessment_stale", "assessment_not_qualified", "comparison_incomplete", "evaluation_not_ready", "qualification_unresolved", "qualified", "boundary_invalid", "version_conflict", "boundary_busy", "boundary_reused", "promoted", "rejected", "rejection_invalid",
] as const;
export type EvolutionCode = typeof EVOLUTION_CODES[number];
export interface EvolutionEvent { readonly revision: number; readonly atMs: number; readonly code: EvolutionCode; readonly roundId: string | null }
export interface ClosedEvolutionRound {
  readonly status: "promoted" | "rejected";
  readonly round: EvolutionRound;
  readonly closedAtMs: number;
  readonly reasonRef: string;
  readonly assessment: QualificationAssessment | null;
  readonly boundaryId: string | null;
}
export interface EvolutionState {
  readonly schema: 1;
  readonly revision: number;
  readonly initial: IntelligenceArtifact;
  readonly active: IntelligenceArtifact;
  readonly round: EvolutionRound | null;
  readonly history: readonly ClosedEvolutionRound[];
  readonly events: readonly EvolutionEvent[];
}
export interface EvolutionTransition { readonly ok: boolean; readonly code: EvolutionCode; readonly state: EvolutionState }
/** Kept local to avoid importing the persistence layer into this pure engine. */
export type EvolutionStoreReason = "initialize" | "observe" | "hypothesis" | "seal" | "assess" | "promote" | "reject" | "rollback";
export interface PromotionReadiness {
  readonly ok: boolean;
  readonly code: EvolutionCode;
  readonly evidence: "externally_reported_qualification";
  readonly sourceAuthenticated: false;
  readonly statisticsIndependentlyVerified: false;
  readonly comparison: ShadowComparison | null;
}

const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const exact = (r: Record<string, unknown>, fields: readonly string[]) => Object.keys(r).length === fields.length && fields.every(k => Object.hasOwn(r, k));
const ref = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const refs = (v: unknown, nonempty = true, max = 256): v is string[] => Array.isArray(v) && v.length <= max && (!nonempty || v.length > 0) && Array.from(v).every(ref) && new Set(v).size === v.length;
const same = (a: unknown, b: unknown) => evolutionDigest(a) === evolutionDigest(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function freeze<T>(v: T): T { if (v !== null && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }

/** Canonical JSON SHA256. Only JSON-compatible finite primitives are accepted. */
export function evolutionDigest(value: unknown): string {
  function canonical(v: unknown): string {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (finite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return `[${Array.from(v).map(canonical).join(",")}]`;
    const r = object(v);
    if (r === null || Object.getPrototypeOf(r) !== Object.prototype && Object.getPrototypeOf(r) !== null) throw Error("non_json_value");
    return `{${Object.keys(r).sort().map(k => `${JSON.stringify(k)}:${canonical(r[k])}`).join(",")}}`;
  }
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function parsePolicy(raw: unknown): IntelligencePolicy | null {
  const r = object(raw), m = object(r?.memory);
  if (!r || !exact(r, ["factOrder", "memory", "questionRefs"]) || !refs(r.factOrder) || !refs(r.questionRefs) || !m || !exact(m, ["rankBy", "featureRefs"]) || !["similarity", "recency", "outcome_balance"].includes(m.rankBy as string) || !refs(m.featureRefs)) return null;
  return clone(raw) as IntelligencePolicy;
}
function artifact(policy: IntelligencePolicy, createdAtMs: number, parentVersion: string | null, hypothesisId: string | null): IntelligenceArtifact {
  const content = { schema: 1 as const, parentVersion, hypothesisId, createdAtMs, policy: clone(policy) };
  return { ...content, version: evolutionDigest(content) };
}
function parseArtifact(raw: unknown): IntelligenceArtifact | null {
  const r = object(raw);
  if (!r || !exact(r, ["schema", "version", "parentVersion", "hypothesisId", "createdAtMs", "policy"]) || r.schema !== 1 || !hash(r.version) || r.parentVersion !== null && !hash(r.parentVersion) || r.hypothesisId !== null && !ref(r.hypothesisId) || !clock(r.createdAtMs)) return null;
  const p = parsePolicy(r.policy);
  if (!p) return null;
  const expected = artifact(p, r.createdAtMs, r.parentVersion as string | null, r.hypothesisId as string | null);
  return expected.version === r.version ? expected : null;
}
function parseProtocol(raw: unknown, createdAtMs: number): EvolutionProtocol | null {
  const r = object(raw);
  if (!r || !exact(r, ["evaluatorHash", "holdoutHash", "method", "decisionAfterMs", "minComparablePairs", "uncertaintyMethodRef", "significanceLevel"]) || !hash(r.evaluatorHash) || !hash(r.holdoutHash) || r.method !== "fixed_holdout" && r.method !== "sequential" || !clock(r.decisionAfterMs) || r.decisionAfterMs <= createdAtMs || !clock(r.minComparablePairs) || r.minComparablePairs < 1 || r.minComparablePairs > 5_000 || !ref(r.uncertaintyMethodRef) || !finite(r.significanceLevel) || r.significanceLevel <= 0 || r.significanceLevel >= 1) return null;
  return clone(raw) as EvolutionProtocol;
}
function changes(a: IntelligencePolicy, b: IntelligencePolicy): string[] {
  return [!same(a.factOrder, b.factOrder) && "fact_order", !same(a.memory, b.memory) && "memory_selection", !same(a.questionRefs, b.questionRefs) && "question_refs"].filter((x): x is string => !!x);
}
const outcomeFields = ["roundId", "pairId", "arm", "version", "evaluatorHash", "baselineHash", "snapshotHash", "startAtMs", "endAtMs", "availableAtMs", "metric", "numeraireKey", "evidence", "returnPct", "costs", "cashFlows", "valuation"] as const;
function parseOutcome(raw: unknown, round: ShadowRound): EvolutionOutcome | null {
  const r = object(raw);
  if (!r || !exact(r, outcomeFields) || r.arm !== "A" && r.arm !== "B" || !ref(r.pairId) || !clock(r.startAtMs) || !clock(r.endAtMs)) return null;
  const mirror = { ...r, arm: r.arm === "A" ? "B" : "A", version: r.arm === "A" ? round.bVersion : round.aVersion, evidence: r.arm === "A" ? "simulated" : "observed" };
  const c = compareShadowRound(round, [r, mirror], Math.max(round.createdAtMs, r.endAtMs, clock(r.availableAtMs) ? r.availableAtMs : 0));
  if (!c.ok || c.comparison.invalidMeasurements !== 0 || c.comparison.pairs.length !== 1 || ["context_mismatch", "evidence_mismatch", "invalid_record", "conflicting_records"].includes(c.comparison.pairs[0]!.status)) return null;
  return Object.fromEntries(outcomeFields.map(k => [k, k === "numeraireKey" ? c.comparison.round.numeraireKey : r[k]])) as unknown as EvolutionOutcome;
}
function canMature(old: EvolutionOutcome, next: EvolutionOutcome): boolean {
  if (old.availableAtMs !== null || next.availableAtMs === null) return false;
  for (const key of outcomeFields) {
    if (key === "availableAtMs") continue;
    if (key === "returnPct" && old.returnPct === null) continue;
    if (key === "costs" && old.costs === "unknown") continue;
    if (key === "cashFlows" && old.cashFlows === "unknown") continue;
    if (key === "valuation" && old.valuation === "partial") continue;
    if (old[key] !== next[key]) return false;
  }
  return true;
}
function parseAssessment(raw: unknown): QualificationAssessment | null {
  const r = object(raw);
  const fields = ["id", "roundId", "aVersion", "bVersion", "evaluatorHash", "baselineHash", "protocolHash", "holdoutHash", "observationsHash", "comparisonHash", "evaluatedAtMs", "determination", "pairIds", "netAdvantageLowerBoundPp", "significanceLevel", "temporalDependence", "repeatedTesting", "costs", "operationalRegression", "holdoutUnseenByResearcher", "artifactQualificationHash", "sourceQualificationHash"];
  if (!r || !exact(r, fields) || !ref(r.id) || !ref(r.roundId) || ![r.aVersion, r.bVersion, r.evaluatorHash, r.baselineHash, r.protocolHash, r.holdoutHash, r.observationsHash, r.comparisonHash].every(hash) || !clock(r.evaluatedAtMs) || !["qualified", "insufficient", "rejected"].includes(r.determination as string) || !refs(r.pairIds, false, 5_000) || r.netAdvantageLowerBoundPp !== null && !finite(r.netAdvantageLowerBoundPp) || !finite(r.significanceLevel) || !["accounted", "unknown"].includes(r.temporalDependence as string) || !["accounted", "unknown"].includes(r.repeatedTesting as string) || !["comparable", "unknown"].includes(r.costs as string) || !["absent", "present", "unknown"].includes(r.operationalRegression as string) || typeof r.holdoutUnseenByResearcher !== "boolean" || r.artifactQualificationHash !== null && !hash(r.artifactQualificationHash) || r.sourceQualificationHash !== null && !hash(r.sourceQualificationHash)) return null;
  return clone(raw) as QualificationAssessment;
}
function readiness(code: EvolutionCode, comparison: ShadowComparison | null = null): PromotionReadiness {
  return { ok: code === "qualified", code, evidence: "externally_reported_qualification", sourceAuthenticated: false, statisticsIndependentlyVerified: false, comparison };
}
function qualify(round: EvolutionRound, raw: unknown, asOfMs: number): PromotionReadiness {
  if (round.sealedAtMs === null) return readiness("round_unsealed");
  const compared = compareShadowRound(round.manifest, round.observations, asOfMs);
  if (!compared.ok || compared.comparison.invalidMeasurements > 0 || compared.comparison.pairs.length === 0 || compared.comparison.pairs.some(p => p.status !== "comparable")) return readiness("comparison_incomplete", compared.ok ? compared.comparison : null);
  const report = parseAssessment(raw);
  if (!report) return readiness("assessment_invalid", compared.comparison);
  const m = round.manifest, p = round.protocol;
  if (report.roundId !== m.id || report.aVersion !== m.aVersion || report.bVersion !== m.bVersion || report.evaluatorHash !== m.evaluatorHash || report.baselineHash !== m.baselineHash || report.protocolHash !== evolutionDigest(p) || report.holdoutHash !== p.holdoutHash) return readiness("assessment_context_mismatch", compared.comparison);
  if (report.evaluatedAtMs > asOfMs || report.evaluatedAtMs < round.sealedAtMs || report.evaluatedAtMs < p.decisionAfterMs || compared.comparison.summary.comparable < p.minComparablePairs) return readiness("evaluation_not_ready", compared.comparison);
  const atReport = compareShadowRound(m, round.observations, report.evaluatedAtMs);
  if (!atReport.ok || atReport.comparison.pairs.some(pair => pair.status !== "comparable")) return readiness("comparison_incomplete", compared.comparison);
  if (report.observationsHash !== evolutionDigest(round.observations) || report.comparisonHash !== evolutionDigest(atReport.comparison) || !same([...report.pairIds].sort(), atReport.comparison.pairs.map(pair => pair.pairId).sort())) return readiness("assessment_stale", compared.comparison);
  if (report.determination !== "qualified") return readiness("assessment_not_qualified", compared.comparison);
  if (report.netAdvantageLowerBoundPp === null || report.netAdvantageLowerBoundPp <= 0 || report.significanceLevel !== p.significanceLevel || report.temporalDependence !== "accounted" || report.repeatedTesting !== "accounted" || report.costs !== "comparable" || report.operationalRegression !== "absent" || !report.holdoutUnseenByResearcher || report.artifactQualificationHash === null || report.sourceQualificationHash === null) return readiness("qualification_unresolved", compared.comparison);
  return readiness("qualified", compared.comparison);
}

function parseRound(raw: unknown, active: IntelligenceArtifact): EvolutionRound | null {
  const r = object(raw), h = object(r?.hypothesis);
  if (!r || !exact(r, ["manifest", "protocol", "hypothesis", "candidate", "observations", "sealedAtMs"]) || !h || !exact(h, ["id", "change", "evidenceRefs"]) || !ref(h.id) || !["fact_order", "memory_selection", "question_refs"].includes(h.change as string) || !refs(h.evidenceRefs) || !Array.isArray(r.observations) || r.observations.length > 10_000) return null;
  const c = compareShadowRound(r.manifest, [], object(r.manifest)?.createdAtMs as number);
  const candidate = parseArtifact(r.candidate);
  if (!c.ok || !candidate) return null;
  const m = c.comparison.round, p = parseProtocol(r.protocol, m.createdAtMs), changed = changes(active.policy, candidate.policy);
  if (!p || p.evaluatorHash !== m.evaluatorHash || m.aVersion !== active.version || m.bVersion !== candidate.version || candidate.parentVersion !== active.version || candidate.hypothesisId !== h.id || candidate.createdAtMs !== m.createdAtMs || m.createdAtMs < active.createdAtMs || changed.length !== 1 || changed[0] !== h.change || r.sealedAtMs !== null && (!clock(r.sealedAtMs) || r.sealedAtMs < m.createdAtMs)) return null;
  const observations: EvolutionOutcome[] = [];
  for (const row of r.observations) { const outcome = parseOutcome(row, m); if (!outcome) return null; observations.push(outcome); }
  return { manifest: m, protocol: p, hypothesis: clone(h) as unknown as EvolutionRound["hypothesis"], candidate, observations, sealedAtMs: r.sealedAtMs as number | null };
}
function roundClockValid(round: EvolutionRound, asOfMs: number): boolean {
  return (round.sealedAtMs === null || round.sealedAtMs <= asOfMs) && round.observations.every(m => m.startAtMs <= asOfMs && (m.availableAtMs === null || m.availableAtMs <= asOfMs));
}

/** Validates a persisted JSON snapshot including artifact hashes, A ancestry,
 * qualified promotion history and event order. This does not authenticate its
 * storage or evaluator. The store must additionally enforce transactional CAS. */
export function validateEvolutionState(raw: unknown): { readonly ok: true; readonly state: EvolutionState } | { readonly ok: false; readonly code: "state_invalid" } {
  try {
    const r = object(raw);
    if (!r || !exact(r, ["schema", "revision", "initial", "active", "round", "history", "events"]) || r.schema !== 1 || !clock(r.revision) || !Array.isArray(r.history) || !Array.isArray(r.events) || r.revision !== r.events.length) return { ok: false, code: "state_invalid" };
    const initial = parseArtifact(r.initial), active = parseArtifact(r.active);
    if (!initial || initial.parentVersion !== null || initial.hypothesisId !== null || !active) return { ok: false, code: "state_invalid" };
    let pointer = initial, lastClosed = initial.createdAtMs;
    const history: ClosedEvolutionRound[] = [], ids = new Set<string>(), hypotheses = new Set<string>(), boundaries = new Set<string>();
    for (const rawClosed of r.history) {
      const row = object(rawClosed);
      if (!row || !exact(row, ["status", "round", "closedAtMs", "reasonRef", "assessment", "boundaryId"]) || row.status !== "promoted" && row.status !== "rejected" || !clock(row.closedAtMs) || !ref(row.reasonRef)) return { ok: false, code: "state_invalid" };
      const round = parseRound(row.round, pointer);
      if (!round || !roundClockValid(round, row.closedAtMs) || round.manifest.createdAtMs < lastClosed || row.closedAtMs < round.manifest.createdAtMs || ids.has(round.manifest.id) || hypotheses.has(round.hypothesis.id)) return { ok: false, code: "state_invalid" };
      let report: QualificationAssessment | null = null;
      if (row.status === "promoted") {
        report = parseAssessment(row.assessment);
        if (!report || row.reasonRef !== report.id || !ref(row.boundaryId) || boundaries.has(row.boundaryId) || !qualify(round, report, row.closedAtMs).ok) return { ok: false, code: "state_invalid" };
        boundaries.add(row.boundaryId); pointer = round.candidate;
      } else if (row.assessment !== null || row.boundaryId !== null) return { ok: false, code: "state_invalid" };
      ids.add(round.manifest.id); hypotheses.add(round.hypothesis.id); lastClosed = row.closedAtMs;
      history.push({ status: row.status, round, closedAtMs: row.closedAtMs, reasonRef: row.reasonRef, assessment: report, boundaryId: row.boundaryId as string | null });
    }
    if (!same(pointer, active)) return { ok: false, code: "state_invalid" };
    const round = r.round === null ? null : parseRound(r.round, active);
    if (r.round !== null && (!round || round.manifest.createdAtMs < lastClosed || ids.has(round.manifest.id) || hypotheses.has(round.hypothesis.id))) return { ok: false, code: "state_invalid" };
    const events: EvolutionEvent[] = [];
    let lastAtMs = initial.createdAtMs;
    for (const [i, rawEvent] of r.events.entries()) {
      const e = object(rawEvent);
      if (!e || !exact(e, ["revision", "atMs", "code", "roundId"]) || e.revision !== i + 1 || !clock(e.atMs) || e.atMs < lastAtMs || !EVOLUTION_CODES.includes(e.code as EvolutionCode) || e.roundId !== null && !ref(e.roundId)) return { ok: false, code: "state_invalid" };
      lastAtMs = e.atMs; events.push(clone(e) as unknown as EvolutionEvent);
    }
    if (lastAtMs < lastClosed || round && (lastAtMs < round.manifest.createdAtMs || !roundClockValid(round, lastAtMs))) return { ok: false, code: "state_invalid" };
    return { ok: true, state: freeze({ schema: 1, revision: r.revision, initial, active, round, history, events }) };
  } catch { return { ok: false, code: "state_invalid" }; }
}

export function createEvolutionState(rawPolicy: unknown, atMs: number): { readonly ok: true; readonly code: "created"; readonly state: EvolutionState } | { readonly ok: false; readonly code: "clock_invalid" | "policy_invalid" } {
  if (!clock(atMs)) return { ok: false, code: "clock_invalid" };
  const policy = parsePolicy(rawPolicy);
  if (!policy) return { ok: false, code: "policy_invalid" };
  const initial = artifact(policy, atMs, null, null);
  return { ok: true, code: "created", state: freeze({ schema: 1, revision: 0, initial, active: initial, round: null, history: [], events: [] }) };
}
function checked(state: EvolutionState, atMs: number): EvolutionCode | null {
  if (!validateEvolutionState(state).ok) return "state_invalid";
  return !clock(atMs) || atMs < (state.events.at(-1)?.atMs ?? state.initial.createdAtMs) ? "clock_invalid" : null;
}
function unchanged(state: EvolutionState, code: EvolutionCode): EvolutionTransition { return { ok: false, code, state }; }
function transition(state: EvolutionState, atMs: number, code: EvolutionCode, ok: boolean, delta: Partial<Pick<EvolutionState, "active" | "round" | "history">> = {}): EvolutionTransition {
  const revision = state.revision + 1;
  return { ok, code, state: freeze({ ...state, ...clone(delta), revision, events: [...state.events, { revision, atMs, code, roundId: state.round?.manifest.id ?? delta.round?.manifest.id ?? null }] }) };
}
export function proposeEvolutionRound(state: EvolutionState, raw: unknown): EvolutionTransition {
  const r = object(raw), atMs = r?.createdAtMs as number, invalid = checked(state, atMs);
  if (invalid) return unchanged(state, invalid);
  if (state.round) return transition(state, atMs, "round_active", false);
  if (!r || !exact(r, ["id", "hypothesisId", "change", "evidenceRefs", "candidatePolicy", "protocol", "baselineHash", "numeraireKey", "horizonMs", "createdAtMs"]) || !ref(r.id) || !ref(r.hypothesisId) || !refs(r.evidenceRefs) || !hash(r.baselineHash)) return transition(state, atMs, "round_invalid", false);
  if (state.history.some(h => h.round.manifest.id === r.id)) return transition(state, atMs, "round_id_reused", false);
  if (state.history.some(h => h.round.hypothesis.id === r.hypothesisId)) return transition(state, atMs, "hypothesis_reused", false);
  const policy = parsePolicy(r.candidatePolicy), protocol = parseProtocol(r.protocol, atMs);
  if (!policy || !protocol) return transition(state, atMs, "round_invalid", false);
  const changed = changes(state.active.policy, policy);
  if (changed.length !== 1 || changed[0] !== r.change) return transition(state, atMs, "hypothesis_change_invalid", false);
  const candidate = artifact(policy, atMs, state.active.version, r.hypothesisId);
  const round = parseRound({ manifest: { id: r.id, createdAtMs: atMs, aVersion: state.active.version, bVersion: candidate.version, bParentVersion: state.active.version, evaluatorHash: protocol.evaluatorHash, baselineHash: r.baselineHash, numeraireKey: r.numeraireKey, horizonMs: r.horizonMs }, protocol, hypothesis: { id: r.hypothesisId, change: r.change, evidenceRefs: r.evidenceRefs }, candidate, observations: [], sealedAtMs: null }, state.active);
  return round ? transition(state, atMs, "round_proposed", true, { round }) : transition(state, atMs, "round_invalid", false);
}
export function observeEvolutionOutcome(state: EvolutionState, raw: unknown, atMs: number): EvolutionTransition {
  const invalid = checked(state, atMs);
  if (invalid) return unchanged(state, invalid);
  const round = state.round;
  if (!round) return transition(state, atMs, "round_missing", false);
  const m = parseOutcome(raw, round.manifest);
  if (!m || m.startAtMs > atMs || m.availableAtMs !== null && m.availableAtMs > atMs) return transition(state, atMs, "outcome_invalid", false);
  const indices = round.observations.flatMap((x, i) => x.pairId === m.pairId && x.arm === m.arm ? [i] : []);
  if (indices.some(i => same(round.observations[i], m))) return transition(state, atMs, "outcome_duplicate", true);
  if (indices.length === 0 && round.sealedAtMs !== null) return transition(state, atMs, "round_sealed", false);
  if (indices.length > 0 && m.availableAtMs === null && indices.every(i => round.observations[i]!.availableAtMs !== null) && indices.some(i => canMature(m, round.observations[i]!))) return transition(state, atMs, "outcome_pending_stale", true);
  const observations = [...round.observations];
  if (indices.length === 1 && canMature(observations[indices[0]!]!, m)) {
    observations[indices[0]!] = m;
    return transition(state, atMs, "outcome_matured", true, { round: { ...round, observations } });
  }
  if (observations.length >= 10_000) return transition(state, atMs, "observation_capacity", false);
  observations.push(m);
  return transition(state, atMs, indices.length > 0 ? "outcome_conflict" : "outcome_recorded", indices.length === 0, { round: { ...round, observations } });
}
export function sealEvolutionRound(state: EvolutionState, atMs: number): EvolutionTransition {
  const invalid = checked(state, atMs);
  if (invalid) return unchanged(state, invalid);
  if (!state.round) return transition(state, atMs, "round_missing", false);
  if (state.round.sealedAtMs !== null) return transition(state, atMs, "round_already_sealed", true);
  return transition(state, atMs, "sealed", true, { round: { ...state.round, sealedAtMs: atMs } });
}
export function compareEvolutionRound(state: EvolutionState, asOfMs: number): { readonly ok: true; readonly comparison: ShadowComparison } | { readonly ok: false; readonly code: EvolutionCode } {
  if (!validateEvolutionState(state).ok) return { ok: false, code: "state_invalid" };
  if (!state.round) return { ok: false, code: "round_missing" };
  const c = compareShadowRound(state.round.manifest, state.round.observations, asOfMs);
  return c.ok ? c : { ok: false, code: "clock_invalid" };
}
export function assessEvolutionPromotion(state: EvolutionState, report: unknown, asOfMs: number): PromotionReadiness {
  const invalid = checked(state, asOfMs);
  if (invalid) return readiness(invalid);
  return state.round ? qualify(state.round, report, asOfMs) : readiness("round_missing");
}
export function commitEvolutionPromotion(state: EvolutionState, rawAssessment: unknown, rawBoundary: unknown): EvolutionTransition {
  const b = object(rawBoundary), atMs = b?.atMs as number, invalid = checked(state, atMs);
  if (invalid) return unchanged(state, invalid);
  if (!state.round) return transition(state, atMs, "round_missing", false);
  if (!b || !exact(b, ["id", "atMs", "expectedRevision", "expectedActiveVersion", "cycleInFlight", "unresolvedOrders"]) || !ref(b.id) || !clock(b.expectedRevision) || !hash(b.expectedActiveVersion) || typeof b.cycleInFlight !== "boolean" || typeof b.unresolvedOrders !== "boolean") return transition(state, atMs, "boundary_invalid", false);
  if (b.expectedRevision !== state.revision || b.expectedActiveVersion !== state.active.version) return transition(state, atMs, "version_conflict", false);
  if (b.cycleInFlight || b.unresolvedOrders) return transition(state, atMs, "boundary_busy", false);
  if (state.history.some(h => h.boundaryId === b.id)) return transition(state, atMs, "boundary_reused", false);
  const ready = qualify(state.round, rawAssessment, atMs);
  if (!ready.ok) return transition(state, atMs, ready.code, false);
  const assessment = parseAssessment(rawAssessment)!;
  const closed: ClosedEvolutionRound = { status: "promoted", round: state.round, closedAtMs: atMs, reasonRef: assessment.id, assessment, boundaryId: b.id };
  return transition(state, atMs, "promoted", true, { active: state.round.candidate, round: null, history: [...state.history, closed] });
}
export function rejectEvolutionRound(state: EvolutionState, reasonRef: unknown, atMs: number): EvolutionTransition {
  const invalid = checked(state, atMs);
  if (invalid) return unchanged(state, invalid);
  if (!state.round) return transition(state, atMs, "round_missing", false);
  if (!ref(reasonRef)) return transition(state, atMs, "rejection_invalid", false);
  const closed: ClosedEvolutionRound = { status: "rejected", round: state.round, closedAtMs: atMs, reasonRef, assessment: null, boundaryId: null };
  return transition(state, atMs, "rejected", true, { round: null, history: [...state.history, closed] });
}

const noopCodes: Readonly<Record<EvolutionStoreReason, readonly EvolutionCode[]>> = {
  initialize: [],
  observe: ["round_missing", "outcome_invalid", "outcome_duplicate", "outcome_pending_stale", "observation_capacity", "round_sealed"],
  hypothesis: ["round_active", "round_invalid", "round_id_reused", "hypothesis_reused", "hypothesis_change_invalid"],
  seal: ["round_missing", "round_already_sealed"],
  assess: [], // Assessment is pure: it does not emit a persisted transition.
  promote: ["round_missing", "round_unsealed", "assessment_invalid", "assessment_context_mismatch", "assessment_stale", "assessment_not_qualified", "comparison_incomplete", "evaluation_not_ready", "qualification_unresolved", "boundary_invalid", "version_conflict", "boundary_busy", "boundary_reused"],
  reject: ["round_missing", "rejection_invalid"],
  rollback: [], // No rollback reducer exists yet. Historical versions alone do not authorize it.
};
function noopPossible(state: EvolutionState, code: EvolutionCode, atMs: number): boolean {
  if (code === "round_missing") return state.round === null;
  if (code === "round_active") return state.round !== null;
  if (["round_invalid", "round_id_reused", "hypothesis_reused", "hypothesis_change_invalid"].includes(code)) return state.round === null && (!["round_id_reused", "hypothesis_reused"].includes(code) || state.history.length > 0);
  const r = state.round;
  if (!r) return false;
  if (code === "round_already_sealed" || code === "round_sealed") return r.sealedAtMs !== null;
  if (code === "outcome_duplicate") return r.observations.length > 0;
  if (code === "outcome_pending_stale") return r.observations.some(m => m.availableAtMs !== null && !r.observations.some(n => n.pairId === m.pairId && n.arm === m.arm && n.availableAtMs === null));
  if (code === "observation_capacity") return r.observations.length === 10_000;
  if (code === "boundary_reused") return state.history.some(h => h.boundaryId !== null);
  if (code === "round_unsealed") return r.sealedAtMs === null;
  if (["assessment_invalid", "assessment_context_mismatch", "assessment_stale", "assessment_not_qualified", "comparison_incomplete", "evaluation_not_ready", "qualification_unresolved"].includes(code)) {
    if (r.sealedAtMs === null) return false;
    const c = compareShadowRound(r.manifest, r.observations, atMs);
    const complete = c.ok && c.comparison.invalidMeasurements === 0 && c.comparison.pairs.length > 0 && c.comparison.pairs.every(p => p.status === "comparable");
    if (code === "comparison_incomplete") return !complete;
    if (!complete) return false;
    if (["assessment_stale", "assessment_not_qualified", "qualification_unresolved"].includes(code)) return atMs >= r.protocol.decisionAfterMs && c.comparison.summary.comparable >= r.protocol.minComparablePairs;
  }
  return true;
}

/** Validates the RELATION between two snapshots, beyond their individual shape.
 * Changed data is replayed through the actual reducer, retaining A origin, B
 * immutability, existing observations, event prefix and closed-round history.
 * Refusals retain only codes; their no-data-change envelope can be validated,
 * not the discarded external command or authenticity of an attempted request.
 * Promotion replay proves consistency with the previous round and assessment,
 * not source authenticity, significance, or the host's real in-flight flags. */
export function validateEvolutionTransition(previous: EvolutionState | null, next: EvolutionState, reason: EvolutionStoreReason): boolean {
  try {
    if (!Object.hasOwn(noopCodes, reason)) return false;
    const nextParsed = validateEvolutionState(next);
    if (!nextParsed.ok) return false;
    const after = nextParsed.state;
    if (previous === null) {
      if (reason !== "initialize" || after.revision !== 0) return false;
      const created = createEvolutionState(after.initial.policy, after.initial.createdAtMs);
      return created.ok && same(created.state, after);
    }
    const previousParsed = validateEvolutionState(previous);
    if (!previousParsed.ok || reason === "initialize") return false;
    const before = previousParsed.state, event = after.events.at(-1);
    if (after.revision !== before.revision + 1 || !event || !same(before.initial, after.initial) || !same(before.events, after.events.slice(0, -1))) return false;
    const atMs = event.atMs, code = event.code;
    let replay: EvolutionTransition | null = null;
    if (reason === "hypothesis" && code === "round_proposed" && after.round) {
      const r = after.round;
      replay = proposeEvolutionRound(before, { id: r.manifest.id, hypothesisId: r.hypothesis.id, change: r.hypothesis.change, evidenceRefs: r.hypothesis.evidenceRefs, candidatePolicy: r.candidate.policy, protocol: r.protocol, baselineHash: r.manifest.baselineHash, numeraireKey: r.manifest.numeraireKey, horizonMs: r.manifest.horizonMs, createdAtMs: atMs });
    } else if (reason === "observe" && before.round && after.round && ["outcome_recorded", "outcome_conflict", "outcome_matured"].includes(code)) {
      const old = before.round.observations, updated = after.round.observations;
      let changed: EvolutionOutcome | undefined;
      if (code === "outcome_matured") {
        if (updated.length !== old.length) return false;
        const differences = updated.filter((m, i) => !same(m, old[i]));
        if (differences.length !== 1) return false;
        changed = differences[0];
      } else {
        if (updated.length !== old.length + 1 || !same(updated.slice(0, -1), old)) return false;
        changed = updated.at(-1);
      }
      replay = observeEvolutionOutcome(before, changed, atMs);
    } else if (reason === "seal" && code === "sealed") {
      replay = sealEvolutionRound(before, atMs);
    } else if (reason === "reject" && code === "rejected") {
      const closed = after.history.at(-1);
      if (!closed || closed.status !== "rejected") return false;
      replay = rejectEvolutionRound(before, closed.reasonRef, atMs);
    } else if (reason === "promote" && code === "promoted") {
      const closed = after.history.at(-1);
      if (!closed || closed.status !== "promoted") return false;
      replay = commitEvolutionPromotion(before, closed.assessment, { id: closed.boundaryId, atMs, expectedRevision: before.revision, expectedActiveVersion: before.active.version, cycleInFlight: false, unresolvedOrders: false });
    } else if (noopCodes[reason].includes(code) && noopPossible(before, code, atMs)) {
      // A refusal or idempotent observation can append only its fixed event.
      replay = transition(before, atMs, code, false);
    }
    return replay !== null && replay.code === code && same(replay.state, after);
  } catch { return false; }
}
