import { createHash } from "node:crypto";
import { chainByIndex, isAddressForChain } from "../../okx-wallet/chains";

/** Deterministic retrieval of REPORTED experiences, not a financial evaluator,
 * causal explanation, trade recommendation or training of model weights.
 * recordedAtMs is when this immutable revision became available. Pending ->
 * final requires a NEW episodeVersion; conflicting latest revisions quarantine
 * the decision. An explicit later revision may resolve an older conflict. */
const CODES = ["price_unknown", "source_stale", "risk_unchecked", "quote_missing", "quote_stale", "route_failed", "model_failed", "execution_failed", "receipt_pending", "receipt_confirmed", "costs_unknown", "valuation_unknown", "cashflows_unknown", "size_changed", "amount_unrepresentable", "data_conflict"] as const;
export type ExperienceCode = typeof CODES[number];
type Action = "buy" | "hold" | "sell" | "skip" | "unknown";
type Source = "decision_journal" | "execution_journal" | "evaluation_journal" | "shadow_journal";
export interface ExperienceContext {
  readonly regime: "rising" | "falling" | "range" | "unknown";
  readonly riskCheck: "checked" | "unchecked" | "unknown";
  readonly liquidityBand: "deep" | "thin" | "unknown";
  readonly codes: readonly ExperienceCode[];
}
interface ReturnEvidence {
  readonly endAtMs: number;
  readonly availableAtMs: number | null;
  readonly horizonMs: number;
  readonly numeraireKey: string | null;
  readonly evidenceHash: string | null;
  /** All finite reported returns, including negative equity below -100%. */
  readonly returnPct: number | null;
  readonly costs: "complete" | "unknown";
  readonly valuation: "complete" | "partial" | "unknown";
  readonly cashFlows: "adjusted" | "unknown";
}
export interface ExperienceOutcome extends ReturnEvidence {
  readonly kind: "realized_A" | "estimated_B";
  readonly source: "realized_evaluation" | "shadow_evaluation";
}
export interface MeasuredAlternative extends ReturnEvidence {
  readonly alternativeId: string;
  readonly action: Action;
  readonly measurement: "measured_estimate";
  readonly source: "measured_counterfactual";
  readonly availableAtMs: number;
  readonly evidenceHash: string;
}
export interface ExperienceObservation {
  readonly code: ExperienceCode;
  readonly availableAtMs: number;
  readonly source: Source;
  readonly evidenceHash: string | null;
}
interface ExperienceEpisodeFields {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly snapshotHash: string | null;
  readonly decisionVersion: string | null;
  readonly evaluatorHash: string | null;
  readonly episodeVersion: number;
  readonly decidedAtMs: number;
  readonly recordedAtMs: number;
  /** Availability of the original decision CONTEXT, not later outcomes. */
  readonly factAvailableAtMs: number | null;
  readonly arm: "A" | "B";
  readonly action: Action;
  readonly source: Source;
  readonly context: ExperienceContext;
  readonly observations: readonly ExperienceObservation[];
  readonly outcome: ExperienceOutcome | null;
  readonly counterfactuals: readonly MeasuredAlternative[];
}
/** Item roles are reported labels only. This schema has no physical wallet
 * address, ownership proof or inference from arm, mode or execution capability. */
export interface DecisionItemScope {
  readonly sourceItemId: string;
  readonly kind: "buy" | "holding";
  readonly assetKey: string;
  readonly walletRole: "agente" | "principal" | null;
  readonly physicalWalletIdentity: "unknown";
  readonly walletAddress: null;
}
export interface ExperienceEpisodeV1 extends ExperienceEpisodeFields { readonly schemaVersion: 1 }
export interface ExperienceEpisodeV2 extends ExperienceEpisodeFields { readonly schemaVersion: 2; readonly itemScope: DecisionItemScope }
export type ExperienceEpisode = ExperienceEpisodeV1 | ExperienceEpisodeV2;
interface MemoryQueryFields {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly snapshotHash: string | null;
  readonly decisionVersion: string | null;
  readonly evaluatorHash: string | null;
  readonly decidedAtMs: number;
  readonly context: ExperienceContext;
  /** At least three slots allow positive/negative/inconclusive coverage. This
   * controls memory representation only, never operations or financial risk. */
  readonly maxExperiences: number;
}
export interface MemoryQueryV1 extends MemoryQueryFields {}
export interface MemoryQueryV2 extends MemoryQueryFields { readonly schemaVersion: 2; readonly itemScope: DecisionItemScope }
export type MemoryQuery = MemoryQueryV1 | MemoryQueryV2;
type Classification = "positive" | "negative" | "inconclusive";
type OutcomeStatus = "usable" | "pending" | "identity_unknown" | "facts_time_unknown" | "incomplete";
export interface RetrievedExperience {
  readonly sourceSchemaVersion: 1 | 2;
  readonly itemScope: DecisionItemScope | null;
  readonly episodeKey: string;
  readonly episodeVersion: number;
  readonly cycleId: string;
  readonly candidateId: string;
  readonly snapshotHash: string | null;
  readonly decisionVersion: string | null;
  readonly evaluatorHash: string | null;
  readonly decidedAtMs: number;
  readonly recordedAtMs: number;
  readonly ageMs: number;
  readonly arm: "A" | "B";
  readonly action: Action;
  readonly source: Source;
  readonly context: ExperienceContext | null;
  readonly observations: readonly ExperienceObservation[];
  readonly classification: Classification;
  readonly outcome: {
    readonly status: OutcomeStatus;
    readonly kind: ExperienceOutcome["kind"] | null;
    readonly source: ExperienceOutcome["source"] | null;
    readonly endAtMs: number | null;
    readonly availableAtMs: number | null;
    readonly horizonMs: number | null;
    readonly numeraireKey: string | null;
    readonly evidenceHash: string | null;
    readonly returnPct: number | null;
    readonly costs: ReturnEvidence["costs"];
    readonly valuation: ReturnEvidence["valuation"];
    readonly cashFlows: ReturnEvidence["cashFlows"];
  };
  readonly counterfactuals: readonly {
    readonly alternativeId: string;
    readonly action: Action;
    readonly source: "measured_counterfactual";
    readonly measurement: "measured_estimate";
    readonly evidenceHash: string;
    readonly availableAtMs: number;
    readonly status: "comparable" | "incomplete" | "comparison_unavailable" | "context_mismatch" | "numeric_overflow";
    readonly returnPct: number | null;
    readonly deltaPp: number | null;
  }[];
  /** Allowlisted facts and arithmetic statuses only. No inferred motivation. */
  readonly reflectionCodes: readonly string[];
  /** sameWalletRole never means same physical wallet. Unknown/buy/V1 is null. */
  readonly similarity: { readonly sameAsset: boolean; readonly sameDecisionItem: boolean | null; readonly sameWalletRole: boolean | null; readonly contextMatches: number; readonly matchingCodes: number };
}
export interface ExperienceMemory {
  readonly schemaVersion: 1 | 2;
  readonly evidence: "reported_experiences";
  readonly query: MemoryQuery;
  readonly datasetHash: string;
  readonly snapshotHash: string;
  readonly experiences: readonly RetrievedExperience[];
  readonly coverage: {
    readonly available: Readonly<Record<Classification, number>>;
    readonly selected: Readonly<Record<Classification, number>>;
    readonly quarantined: number;
  };
}

const rec = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const exact = (r: Record<string, unknown>, fields: readonly string[]) => Object.keys(r).length === fields.length && fields.every(k => Object.hasOwn(r, k));
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const maybeHash = (v: unknown): v is string | null => v === null || hash(v);
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const among = <T extends string>(v: unknown, options: readonly T[]): v is T => typeof v === "string" && options.includes(v as T);
const actions = ["buy", "hold", "sell", "skip", "unknown"] as const;
const sources = ["decision_journal", "execution_journal", "evaluation_journal", "shadow_journal"] as const;
const sha = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function asset(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^token:([^:]+):(.+)$/.exec(v);
  // bookFromAssets uses this EXACT sentinel for a native asset when the source
  // contract is empty. It is not a wrapped-token address or a chain alias.
  if (!m || !chainByIndex(m[1]!) || m[2] !== "native" && !isAddressForChain(m[1]!, m[2]!)) return null;
  return `token:${m[1]}:${chainByIndex(m[1]!)?.kind === "evm" ? m[2]!.toLowerCase() : m[2]}`;
}
function itemScope(raw: unknown, candidateId: string): DecisionItemScope | null {
  const r = rec(raw);
  if (!r || !exact(r, ["sourceItemId", "kind", "assetKey", "walletRole", "physicalWalletIdentity", "walletAddress"]) || typeof r.sourceItemId !== "string" || r.sourceItemId.length > 160 || r.physicalWalletIdentity !== "unknown" || r.walletAddress !== null || asset(r.assetKey) !== candidateId) return null;
  if (r.kind === "buy") {
    if (r.walletRole !== null || !r.sourceItemId.startsWith("buy:") || asset(r.sourceItemId.slice(4)) !== candidateId) return null;
  } else if (r.kind === "holding") {
    if (!among(r.walletRole, ["agente", "principal"])) return null;
    const suffix = `@${r.walletRole}`;
    if (!r.sourceItemId.startsWith("hold:") || !r.sourceItemId.endsWith(suffix) || asset(r.sourceItemId.slice(5, -suffix.length)) !== candidateId) return null;
  } else return null;
  return { sourceItemId: r.sourceItemId, kind: r.kind, assetKey: candidateId, walletRole: r.walletRole as DecisionItemScope["walletRole"], physicalWalletIdentity: "unknown", walletAddress: null };
}
const normalizedScope = (s: DecisionItemScope): DecisionItemScope => ({ ...s, sourceItemId: s.kind === "buy" ? `buy:${s.assetKey}` : `hold:${s.assetKey}@${s.walletRole}` });
const queryScope = (q: MemoryQuery): DecisionItemScope | null => "schemaVersion" in q && q.schemaVersion === 2 ? q.itemScope : null;
function context(raw: unknown): ExperienceContext | null {
  const r = rec(raw);
  if (!r || !exact(r, ["regime", "riskCheck", "liquidityBand", "codes"]) || !among(r.regime, ["rising", "falling", "range", "unknown"]) || !among(r.riskCheck, ["checked", "unchecked", "unknown"]) || !among(r.liquidityBand, ["deep", "thin", "unknown"]) || !Array.isArray(r.codes) || !r.codes.every(c => among(c, CODES))) return null;
  return { regime: r.regime, riskCheck: r.riskCheck, liquidityBand: r.liquidityBand, codes: [...new Set(r.codes as ExperienceCode[])].sort() };
}
const returnFields = ["endAtMs", "availableAtMs", "horizonMs", "numeraireKey", "evidenceHash", "returnPct", "costs", "valuation", "cashFlows"] as const;
function returnEvidence(r: Record<string, unknown>, decidedAtMs: number, recordedAtMs: number): ReturnEvidence | null {
  if (!clock(r.endAtMs) || r.endAtMs <= decidedAtMs || !clock(r.horizonMs) || r.endAtMs - decidedAtMs !== r.horizonMs || r.availableAtMs !== null && (!clock(r.availableAtMs) || r.availableAtMs < r.endAtMs || r.availableAtMs > recordedAtMs) || !maybeHash(r.evidenceHash) || r.returnPct !== null && !finite(r.returnPct) || !among(r.costs, ["complete", "unknown"]) || !among(r.valuation, ["complete", "partial", "unknown"]) || !among(r.cashFlows, ["adjusted", "unknown"])) return null;
  const unit = r.numeraireKey === null ? null : asset(r.numeraireKey);
  if (r.numeraireKey !== null && unit === null) return null;
  // Preserve reported claims for conflict detection. The retrieval projection
  // below hides values/coverage whose outcome availability is unknown.
  return { endAtMs: r.endAtMs, availableAtMs: r.availableAtMs as number | null, horizonMs: r.horizonMs, numeraireKey: unit,
    evidenceHash: r.evidenceHash, returnPct: r.returnPct as number | null, costs: r.costs, valuation: r.valuation, cashFlows: r.cashFlows };
}
function parseEpisode(raw: unknown): ExperienceEpisode | null {
  const r = rec(raw);
  if (!r || !exact(r, ["schemaVersion", "cycleId", "candidateId", "snapshotHash", "decisionVersion", "evaluatorHash", "episodeVersion", "decidedAtMs", "recordedAtMs", "factAvailableAtMs", "arm", "action", "source", "context", "observations", "outcome", "counterfactuals", ...(r.schemaVersion === 2 ? ["itemScope"] : [])]) || r.schemaVersion !== 1 && r.schemaVersion !== 2 || !code(r.cycleId) || !maybeHash(r.snapshotHash) || !maybeHash(r.decisionVersion) || !maybeHash(r.evaluatorHash) || !clock(r.episodeVersion) || r.episodeVersion < 1 || !clock(r.decidedAtMs) || !clock(r.recordedAtMs) || r.recordedAtMs < r.decidedAtMs || r.factAvailableAtMs !== null && (!clock(r.factAvailableAtMs) || r.factAvailableAtMs > r.decidedAtMs) || !among(r.arm, ["A", "B"]) || !among(r.action, actions) || !among(r.source, sources) || !Array.isArray(r.observations) || !Array.isArray(r.counterfactuals)) return null;
  const candidateId = asset(r.candidateId), ctx = context(r.context);
  if (!candidateId || !ctx) return null;
  const scope = r.schemaVersion === 2 ? itemScope(r.itemScope, candidateId) : null;
  if (r.schemaVersion === 2 && scope === null) return null;
  const observations: ExperienceObservation[] = [];
  for (const rawObservation of r.observations) {
    const o = rec(rawObservation);
    if (!o || !exact(o, ["code", "availableAtMs", "source", "evidenceHash"]) || !among(o.code, CODES) || !clock(o.availableAtMs) || o.availableAtMs > r.recordedAtMs || !among(o.source, sources) || !maybeHash(o.evidenceHash)) return null;
    observations.push({ code: o.code, availableAtMs: o.availableAtMs, source: o.source, evidenceHash: o.evidenceHash });
  }
  const uniqueObservations = [...new Map(observations.map(o => [JSON.stringify(o), o])).values()].sort((a, b) => lexical(JSON.stringify(a), JSON.stringify(b)));
  let outcome: ExperienceOutcome | null = null;
  if (r.outcome !== null) {
    const o = rec(r.outcome);
    if (!o || !exact(o, ["kind", "source", ...returnFields]) || o.kind !== (r.arm === "A" ? "realized_A" : "estimated_B") || o.source !== (r.arm === "A" ? "realized_evaluation" : "shadow_evaluation")) return null;
    const value = returnEvidence(o, r.decidedAtMs, r.recordedAtMs);
    if (!value) return null;
    outcome = { kind: o.kind as ExperienceOutcome["kind"], source: o.source as ExperienceOutcome["source"], ...value };
  }
  const alternatives = new Map<string, MeasuredAlternative>();
  for (const rawAlternative of r.counterfactuals) {
    const a = rec(rawAlternative);
    if (!a || !exact(a, ["alternativeId", "action", "measurement", "source", ...returnFields]) || !code(a.alternativeId) || !among(a.action, actions) || a.measurement !== "measured_estimate" || a.source !== "measured_counterfactual" || !clock(a.availableAtMs) || !hash(a.evidenceHash)) return null;
    const value = returnEvidence(a, r.decidedAtMs, r.recordedAtMs);
    if (!value) return null;
    const alternative: MeasuredAlternative = { alternativeId: a.alternativeId, action: a.action, measurement: "measured_estimate", source: "measured_counterfactual", ...value, availableAtMs: a.availableAtMs, evidenceHash: a.evidenceHash };
    const old = alternatives.get(a.alternativeId);
    if (old && JSON.stringify(old) !== JSON.stringify(alternative)) return null;
    alternatives.set(a.alternativeId, alternative);
  }
  const fields: ExperienceEpisodeFields = { cycleId: r.cycleId, candidateId, snapshotHash: r.snapshotHash, decisionVersion: r.decisionVersion, evaluatorHash: r.evaluatorHash, episodeVersion: r.episodeVersion,
    decidedAtMs: r.decidedAtMs, recordedAtMs: r.recordedAtMs, factAvailableAtMs: r.factAvailableAtMs as number | null, arm: r.arm, action: r.action, source: r.source, context: ctx,
    observations: uniqueObservations, outcome, counterfactuals: [...alternatives.values()].sort((a, b) => lexical(a.alternativeId, b.alternativeId)) };
  return r.schemaVersion === 2 ? { schemaVersion: 2, ...fields, itemScope: scope! } : { schemaVersion: 1, ...fields };
}
function parseQuery(raw: unknown): MemoryQuery | null {
  const r = rec(raw);
  if (!r || !exact(r, ["cycleId", "candidateId", "snapshotHash", "decisionVersion", "evaluatorHash", "decidedAtMs", "context", "maxExperiences", ...(r.schemaVersion === 2 ? ["schemaVersion", "itemScope"] : [])]) || !code(r.cycleId) || !maybeHash(r.snapshotHash) || !maybeHash(r.decisionVersion) || !maybeHash(r.evaluatorHash) || !clock(r.decidedAtMs) || !clock(r.maxExperiences) || r.maxExperiences < 3) return null;
  const candidateId = asset(r.candidateId), ctx = context(r.context);
  if (!candidateId || !ctx) return null;
  const fields: MemoryQueryFields = { cycleId: r.cycleId, candidateId, snapshotHash: r.snapshotHash, decisionVersion: r.decisionVersion, evaluatorHash: r.evaluatorHash, decidedAtMs: r.decidedAtMs, context: ctx, maxExperiences: r.maxExperiences };
  if (r.schemaVersion !== 2) return fields;
  const scope = itemScope(r.itemScope, candidateId);
  return scope === null ? null : { ...fields, schemaVersion: 2, itemScope: scope };
}
const identity = (e: ExperienceEpisode) => sha(e.schemaVersion === 1 ? [e.cycleId, e.candidateId, e.snapshotHash, e.decisionVersion, e.evaluatorHash, e.arm] : [2, e.cycleId, e.candidateId, normalizedScope(e.itemScope), e.snapshotHash, e.decisionVersion, e.evaluatorHash, e.arm]);
const anchor = (e: ExperienceEpisode) => sha(e.schemaVersion === 1 ? [e.decidedAtMs, e.factAvailableAtMs, e.arm, e.action, e.source, e.context] : [2, normalizedScope(e.itemScope), e.decidedAtMs, e.factAvailableAtMs, e.arm, e.action, e.source, e.context]);
const canonicalEpisode = (e: ExperienceEpisode) => JSON.stringify(e.schemaVersion === 1 ? e : { ...e, itemScope: normalizedScope(e.itemScope) });
const complete = (e: ReturnEvidence) => e.availableAtMs !== null && e.numeraireKey !== null && e.evidenceHash !== null && e.returnPct !== null && e.costs === "complete" && e.valuation === "complete" && e.cashFlows === "adjusted";
function retrieve(e: ExperienceEpisode, q: MemoryQuery): RetrievedExperience {
  const identityKnown = e.snapshotHash !== null && e.decisionVersion !== null && e.evaluatorHash !== null;
  const o = e.outcome;
  const status: OutcomeStatus = !identityKnown ? "identity_unknown" : e.factAvailableAtMs === null ? "facts_time_unknown" : !o || o.availableAtMs === null ? "pending" : complete(o) ? "usable" : "incomplete";
  const value = status === "usable" ? o!.returnPct : null;
  const classification: Classification = value === null || value === 0 ? "inconclusive" : value > 0 ? "positive" : "negative";
  const ctx = e.factAvailableAtMs === null ? null : e.context;
  const availableOutcome = o?.availableAtMs !== null ? o : null;
  const observations = e.observations.filter(o => o.availableAtMs <= q.decidedAtMs);
  const codes = new Set<string>([...(ctx?.codes ?? []), ...observations.map(o => o.code)]);
  if (status !== "usable") codes.add(status === "incomplete" ? "outcome_incomplete" : status === "pending" ? "outcome_pending" : status);
  if (availableOutcome?.costs !== "complete") codes.add("costs_unknown");
  if (availableOutcome?.valuation !== "complete") codes.add("valuation_unknown");
  if (availableOutcome?.cashFlows !== "adjusted") codes.add("cashflows_unknown");
  const counterfactuals = e.counterfactuals.filter(a => a.availableAtMs <= q.decidedAtMs).map(a => {
    let state: RetrievedExperience["counterfactuals"][number]["status"] = !identityKnown || e.factAvailableAtMs === null || !complete(a) ? "incomplete" : status !== "usable" ? "comparison_unavailable" : a.numeraireKey !== o!.numeraireKey || a.horizonMs !== o!.horizonMs || a.endAtMs !== o!.endAtMs ? "context_mismatch" : "comparable";
    const difference = state === "comparable" ? a.returnPct! - value! : null;
    if (difference !== null && !Number.isFinite(difference)) state = "numeric_overflow";
    const deltaPp = state === "comparable" ? difference : null;
    if (deltaPp !== null && deltaPp > 0) codes.add("measured_better_alternative");
    return { alternativeId: a.alternativeId, action: a.action, source: a.source, measurement: a.measurement, evidenceHash: a.evidenceHash, availableAtMs: a.availableAtMs,
      status: state, returnPct: state === "comparable" ? a.returnPct : null, deltaPp };
  });
  const keys = ["regime", "riskCheck", "liquidityBand"] as const;
  const contextMatches = ctx === null ? 0 : keys.filter(k => ctx[k] !== "unknown" && q.context[k] !== "unknown" && ctx[k] === q.context[k]).length;
  const scope = e.schemaVersion === 2 ? e.itemScope : null, askedScope = queryScope(q);
  const sameDecisionItem = scope !== null && askedScope !== null ? JSON.stringify(normalizedScope(scope)) === JSON.stringify(normalizedScope(askedScope)) : null;
  const sameWalletRole = scope?.walletRole != null && askedScope?.walletRole != null ? scope.walletRole === askedScope.walletRole : null;
  return { sourceSchemaVersion: e.schemaVersion, itemScope: scope, episodeKey: identity(e), episodeVersion: e.episodeVersion, cycleId: e.cycleId, candidateId: e.candidateId, snapshotHash: e.snapshotHash, decisionVersion: e.decisionVersion, evaluatorHash: e.evaluatorHash,
    decidedAtMs: e.decidedAtMs, recordedAtMs: e.recordedAtMs, ageMs: q.decidedAtMs - e.decidedAtMs, arm: e.arm, action: e.action, source: e.source, context: ctx, observations, classification,
    outcome: { status, kind: o?.kind ?? null, source: o?.source ?? null, endAtMs: o?.endAtMs ?? null, availableAtMs: o?.availableAtMs ?? null, horizonMs: o?.horizonMs ?? null,
      numeraireKey: o?.numeraireKey ?? null, evidenceHash: availableOutcome?.evidenceHash ?? null, returnPct: value, costs: availableOutcome?.costs ?? "unknown", valuation: availableOutcome?.valuation ?? "unknown", cashFlows: availableOutcome?.cashFlows ?? "unknown" },
    counterfactuals, reflectionCodes: [...codes].sort(), similarity: { sameAsset: e.candidateId === q.candidateId, sameDecisionItem, sameWalletRole, contextMatches, matchingCodes: q.context.codes.filter(c => codes.has(c)).length } };
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}

export function buildExperienceMemory(rawEpisodes: readonly unknown[], rawQuery: unknown): { readonly ok: true; readonly value: ExperienceMemory } | { readonly ok: false; readonly reason: "query_invalid" | "episodes_invalid" | "episode_invalid" } {
  const q = parseQuery(rawQuery);
  if (!q) return { ok: false, reason: "query_invalid" };
  if (!Array.isArray(rawEpisodes)) return { ok: false, reason: "episodes_invalid" };
  const groups = new Map<string, Map<number, Map<string, ExperienceEpisode>>>();
  let hasScopedData = queryScope(q) !== null;
  for (const raw of rawEpisodes) {
    const r = rec(raw);
    // Available-at filtering precedes parsing so even a malformed future record
    // cannot change a historical snapshot or quarantine its older revision.
    if (r && (r.cycleId === q.cycleId || clock(r.recordedAtMs) && r.recordedAtMs > q.decidedAtMs || clock(r.decidedAtMs) && r.decidedAtMs >= q.decidedAtMs)) continue;
    const e = parseEpisode(raw);
    if (!e) return { ok: false, reason: "episode_invalid" };
    if (e.schemaVersion === 2) hasScopedData = true;
    const key = identity(e), revisions = groups.get(key) ?? new Map<number, Map<string, ExperienceEpisode>>();
    const variants = revisions.get(e.episodeVersion) ?? new Map<string, ExperienceEpisode>();
    const canonical = canonicalEpisode(e), prior = variants.get(canonical);
    // Equivalent EVM spelling aliases group by canonical identity. Retain an
    // ORIGINAL spelling deterministically, never fabricate a source item id.
    if (prior === undefined || lexical(JSON.stringify(e), JSON.stringify(prior)) < 0) variants.set(canonical, e);
    revisions.set(e.episodeVersion, variants); groups.set(key, revisions);
  }
  const dataset: string[] = [], relevant: RetrievedExperience[] = [];
  let quarantined = 0;
  for (const [key, revisions] of [...groups].sort(([a], [b]) => lexical(a, b))) {
    const versions = [...revisions].sort(([a], [b]) => a - b), anchors = new Set<string>();
    let priorAt = -1, badTimeline = false;
    for (const [version, variants] of versions) {
      const rows = [...variants].sort(([a], [b]) => lexical(a, b));
      let latestAt = priorAt;
      for (const [canonical, e] of rows) { dataset.push(JSON.stringify([key, version, canonical])); anchors.add(anchor(e)); if (e.recordedAtMs < priorAt) badTimeline = true; latestAt = Math.max(latestAt, e.recordedAtMs); }
      priorAt = latestAt;
    }
    const latest = versions[versions.length - 1]![1];
    if (latest.size !== 1 || anchors.size !== 1 || badTimeline) { quarantined++; continue; }
    const view = retrieve(latest.values().next().value!, q);
    if (view.similarity.sameAsset || view.similarity.contextMatches > 0 || view.similarity.matchingCodes > 0) relevant.push(view);
  }
  const order = (a: RetrievedExperience, b: RetrievedExperience) => Number(b.similarity.sameDecisionItem === true) - Number(a.similarity.sameDecisionItem === true) || Number(b.similarity.sameAsset) - Number(a.similarity.sameAsset) || b.similarity.contextMatches - a.similarity.contextMatches || b.similarity.matchingCodes - a.similarity.matchingCodes || a.ageMs - b.ageMs || lexical(a.episodeKey, b.episodeKey);
  const classes = ["positive", "negative", "inconclusive"] as const;
  const buckets = { positive: [] as RetrievedExperience[], negative: [] as RetrievedExperience[], inconclusive: [] as RetrievedExperience[] };
  for (const e of relevant.sort(order)) buckets[e.classification].push(e);
  const available = { positive: buckets.positive.length, negative: buckets.negative.length, inconclusive: buckets.inconclusive.length };
  const experiences: RetrievedExperience[] = [];
  for (let index = 0; experiences.length < q.maxExperiences; index++) {
    let added = false;
    for (const classification of classes) { const e = buckets[classification][index]; if (e && experiences.length < q.maxExperiences) { experiences.push(e); added = true; } }
    if (!added) break;
  }
  const selected = { positive: 0, negative: 0, inconclusive: 0 };
  for (const e of experiences) selected[e.classification]++;
  const body = { schemaVersion: (hasScopedData ? 2 : 1) as 1 | 2, evidence: "reported_experiences" as const, query: q, datasetHash: sha(dataset), experiences, coverage: { available, selected, quarantined } };
  return { ok: true, value: freeze({ ...body, snapshotHash: sha(body) }) };
}
