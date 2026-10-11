/**
 * Policies of the Jev Decision Lab: simple baselines and the Jev policy behind an injected chooser.
 * Specification: docs/JEV-LABORATORIO-DE-DECISAO.md sections 3.2, 7 and 11.
 *
 * A policy sees ONLY `PolicyInput`: the epoch id, the instant and the eligible candidates, frozen. It never gets a
 * data source, so the future is out of reach by construction (the trap in source.ts catches a policy that smuggles one).
 *
 * The Jev policy follows decision D1: the chooser receives opaque keys (c1, c2, ...), closed vocabularies and
 * numbers, never free text or instrument names, and answers with a key or "hold". The answer is validated against the
 * known keys; abstention is a valid hold; timeout and errors become hold. This module NEVER imports the TypeSafe SDK:
 * the real Jev is injected by the caller as a `LabChooser`. `MockJevChooser` is the deterministic, offline stand-in
 * (a transparent rule, NOT Jev) and every output that uses it says so.
 *
 * Rules and the mock are pure functions of their input: no clock, no randomness, no I/O. Unknown (null) features are
 * skipped, never read as zero.
 */

import { Rng } from "./rng.ts";
import { HOLD, HOUR_MS, deepFreeze, type FeatureMap, type LabCandidate, type LabModality, type LabSide, type PolicyDecision } from "./types.ts";

export interface PolicyInput {
  readonly epochId: string;
  readonly t: number;
  /** Eligible candidates only, sorted by id by the orchestrator. */
  readonly eligible: readonly LabCandidate[];
}

export interface PolicyDescriptor {
  id: string;
  /** A reference the tested policies are compared with. */
  baseline: boolean;
  /** A policy whose edge the lab tests (Jev and the simple rules). */
  tested: boolean;
  /** Holds the exposure without turnover: the statistics charge no trading cost for it. */
  passive: boolean;
  chooser: { name: string; isMock: boolean } | null;
}

export interface LabPolicy extends PolicyDescriptor {
  decide(input: PolicyInput): PolicyDecision | Promise<PolicyDecision>;
}

export function describePolicy(policy: PolicyDescriptor): PolicyDescriptor {
  return { id: policy.id, baseline: policy.baseline, tested: policy.tested, passive: policy.passive, chooser: policy.chooser === null ? null : { name: policy.chooser.name, isMock: policy.chooser.isMock } };
}

const POLICY_ID = /^[a-z][a-z0-9-]{0,31}$/;

function checkPolicyId(id: string): string {
  if (!POLICY_ID.test(id)) throw new RangeError("policy id must be 1 to 32 characters of a-z, 0-9 and hyphen, starting with a letter");
  return id;
}

function byId(a: LabCandidate, b: LabCandidate): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sortedCandidates(input: PolicyInput): LabCandidate[] {
  return [...input.eligible].sort(byId);
}

function sortedIds(input: PolicyInput): string[] {
  return sortedCandidates(input).map((candidate) => candidate.id);
}

function oneHot(ids: readonly string[], choice: string): Record<string, number> {
  const probabilities: Record<string, number> = { [HOLD]: choice === HOLD ? 1 : 0 };
  for (const id of ids) probabilities[id] = id === choice ? 1 : 0;
  return probabilities;
}

/** Decision of a deterministic rule: no inference, so latency, tokens and cost are known zeros. */
function ruleDecision(policyId: string, input: PolicyInput, choice: string): PolicyDecision {
  return {
    policyId,
    epochId: input.epochId,
    choice,
    probabilities: oneHot(sortedIds(input), choice),
    latencyMs: 0,
    inputTokens: 0,
    costUsd: 0,
    status: "ok",
    note: null,
  };
}

function rule(descriptor: Omit<PolicyDescriptor, "chooser">, choose: (input: PolicyInput) => string): LabPolicy {
  checkPolicyId(descriptor.id);
  return { ...descriptor, chooser: null, decide: (input) => ruleDecision(descriptor.id, input, choose(input)) };
}

function numberOrNull(features: FeatureMap, name: string): number | null {
  const value = features[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function holdPolicy(): LabPolicy {
  return rule({ id: "hold", baseline: true, tested: false, passive: false }, () => HOLD);
}

/** Uniform over hold and the eligible candidates; a pure function of (seed, epoch id). */
export function randomPolicy(seed: number): LabPolicy {
  return rule({ id: "random", baseline: true, tested: false, passive: false }, (input) => {
    const options = [HOLD, ...sortedIds(input)];
    return options[new Rng(seed, `random:${input.epochId}`).int(options.length)] as string;
  });
}

/** Long spot, first instrument by id, every epoch. Passive: a benchmark with no turnover. */
export function buyAndHoldPolicy(): LabPolicy {
  return rule({ id: "buy-and-hold", baseline: true, tested: false, passive: true }, (input) => {
    const spot = sortedCandidates(input).find((c) => c.modality === "spot-momentum" && c.side === "long");
    return spot === undefined ? HOLD : spot.id;
  });
}

/** Lookback rule: long the best riser, short the worst faller, hold when no known move beats the threshold. */
export function momentumRulePolicy(options: { thresholdBps?: number } = {}): LabPolicy {
  const threshold = options.thresholdBps ?? 0;
  if (!Number.isFinite(threshold)) throw new RangeError("thresholdBps must be finite");
  return rule({ id: "momentum-rule", baseline: true, tested: true, passive: false }, (input) => {
    let best = HOLD;
    let bestScore = threshold;
    for (const candidate of sortedCandidates(input)) {
      if (candidate.modality !== "perp-directional") continue;
      const ret = numberOrNull(candidate.features, "retLookbackBps");
      if (ret === null) continue;
      const score = candidate.side === "short" ? -ret : ret;
      if (score > bestScore) {
        best = candidate.id;
        bestScore = score;
      }
    }
    return best;
  });
}

/** Takes the funding carry with the best strictly positive conservative net carry; hold otherwise. */
export function carryRulePolicy(): LabPolicy {
  return rule({ id: "carry-rule", baseline: true, tested: true, passive: false }, (input) => {
    let best = HOLD;
    let bestNet = 0;
    for (const candidate of sortedCandidates(input)) {
      if (candidate.modality !== "funding-carry") continue;
      const net = numberOrNull(candidate.features, "carryNetBps");
      if (net === null) continue;
      if (net > bestNet) {
        best = candidate.id;
        bestNet = net;
      }
    }
    return best;
  });
}

// ---------------------------------------------------------------------------
// Jev behind an injected chooser
// ---------------------------------------------------------------------------

export interface ChooserCandidateState {
  /** Opaque, epoch-local key: c1, c2, ... */
  key: string;
  modality: LabModality;
  side: LabSide;
  horizonHours: number;
  /** The numeric features of the candidate; null means unknown, never zero. */
  criteria: FeatureMap;
}

export interface ChooserState {
  horizonHours: number;
  candidates: ChooserCandidateState[];
}

export interface ChooserAnswer {
  /** A key of the state or "hold". */
  choice: string;
  /** Over the keys and "hold"; when absent the answer counts as certain on the choice. */
  probabilities?: Record<string, number>;
  confidence?: number | null;
  latencyMs: number;
  /** null: the provider did not supply valid usage. */
  inputTokens?: number | null;
}

export interface LabChooser {
  readonly name: string;
  readonly isMock: boolean;
  choose(state: ChooserState): Promise<ChooserAnswer> | ChooserAnswer;
}

export type ChooserCheck =
  | { ok: true; choice: string; probabilities: Record<string, number>; latencyMs: number; inputTokens: number | null; confidence: number | null }
  | { ok: false; status: "invalid-choice" | "malformed"; note: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an answer against the known keys ("hold" plus the state keys). Same spirit as validateOperatorDecision in
 * src/operator/jev-selector.ts: an unknown id is refused, probabilities must be in [0, 1] and sum to one within 0.02,
 * latency and usage must be valid. Notes never repeat the content of the answer.
 */
export function validateChooserAnswer(answer: unknown, known: readonly string[]): ChooserCheck {
  const malformed = (note: string): ChooserCheck => ({ ok: false, status: "malformed", note });
  if (!isPlainRecord(answer)) return malformed("resposta malformada: objeto esperado");
  if (typeof answer.choice !== "string") return malformed("resposta malformada: escolha ausente ou sem texto");
  if (!known.includes(answer.choice)) return { ok: false, status: "invalid-choice", note: "o seletor nomeou um id desconhecido" };
  const choice = answer.choice;

  const probabilities: Record<string, number> = {};
  if (answer.probabilities === undefined || answer.probabilities === null) {
    for (const key of known) probabilities[key] = key === choice ? 1 : 0;
  } else {
    if (!isPlainRecord(answer.probabilities)) return malformed("resposta malformada: probabilidades devem ser um objeto");
    let total = 0;
    for (const key of known) {
      const raw = Object.prototype.hasOwnProperty.call(answer.probabilities, key) ? answer.probabilities[key] : 0;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) return malformed("resposta malformada: probabilidade fora de [0, 1]");
      probabilities[key] = raw;
      total += raw;
    }
    if (Math.abs(total - 1) > 0.02) return malformed("resposta malformada: probabilidades não somam um");
  }
  const latencyMs = answer.latencyMs;
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0) return malformed("resposta malformada: latência inválida");
  let inputTokens: number | null = null;
  if (answer.inputTokens !== undefined && answer.inputTokens !== null) {
    if (typeof answer.inputTokens !== "number" || !Number.isSafeInteger(answer.inputTokens) || answer.inputTokens < 0) return malformed("resposta malformada: uso de tokens inválido");
    inputTokens = answer.inputTokens;
  }
  let confidence: number | null = null;
  if (answer.confidence !== undefined && answer.confidence !== null) {
    if (typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) return malformed("resposta malformada: confiança inválida");
    confidence = answer.confidence;
  }
  return { ok: true, choice, probabilities, latencyMs, inputTokens, confidence };
}

/** Default timeout of one consultation. Latency is recorded; qualification (maxDecisionMs 1500) is a separate matter. */
export const DEFAULT_JEV_TIMEOUT_MS = 15_000;

export interface JevPolicyOptions {
  chooser: LabChooser;
  id?: string;
  timeoutMs?: number;
  /** USD per million input tokens; null (default) keeps the inference cost unknown, never zero. */
  inferenceUsdPerMTok?: number | null;
}

class TimeoutSignal extends Error {}

export class JevPolicy implements LabPolicy {
  readonly id: string;
  readonly baseline = false;
  readonly tested = true;
  readonly passive = false;
  readonly chooser: { name: string; isMock: boolean };
  private readonly source: LabChooser;
  private readonly timeoutMs: number;
  private readonly usdPerMTok: number | null;

  constructor(options: JevPolicyOptions) {
    this.id = checkPolicyId(options.id ?? "jev");
    this.source = options.chooser;
    this.chooser = { name: options.chooser.name, isMock: options.chooser.isMock };
    const timeoutMs = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("timeoutMs must be a positive integer");
    this.timeoutMs = timeoutMs;
    const price = options.inferenceUsdPerMTok ?? null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) throw new RangeError("inferenceUsdPerMTok must be null or a finite number at or above zero");
    this.usdPerMTok = price;
  }

  private failure(input: PolicyInput, ids: readonly string[], status: PolicyDecision["status"], note: string, latencyMs: number): PolicyDecision {
    return { policyId: this.id, epochId: input.epochId, choice: HOLD, probabilities: oneHot(ids, HOLD), latencyMs, inputTokens: null, costUsd: null, status, note };
  }

  async decide(input: PolicyInput): Promise<PolicyDecision> {
    const ids = sortedIds(input);
    if (input.eligible.length === 0) return ruleDecision(this.id, input, HOLD);
    const keyToId = new Map<string, string>();
    const candidates: ChooserCandidateState[] = input.eligible.map((candidate, index) => {
      const key = `c${index + 1}`;
      keyToId.set(key, candidate.id);
      return { key, modality: candidate.modality, side: candidate.side, horizonHours: candidate.horizonMs / HOUR_MS, criteria: { ...candidate.features } };
    });
    const state: ChooserState = deepFreeze({ horizonHours: (input.eligible[0] as LabCandidate).horizonMs / HOUR_MS, candidates });
    const known = [HOLD, ...keyToId.keys()];

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutSignal()), this.timeoutMs);
    });
    const pending = Promise.resolve().then(() => this.source.choose(state));
    pending.catch(() => undefined);
    let raw: unknown;
    try {
      raw = await Promise.race([pending, timeout]);
    } catch (error) {
      if (error instanceof TimeoutSignal) return this.failure(input, ids, "timeout", `tempo esgotado (${this.timeoutMs} ms)`, this.timeoutMs);
      return this.failure(input, ids, "error", "o seletor lançou erro", 0);
    } finally {
      clearTimeout(timer);
    }

    const checked = validateChooserAnswer(raw, known);
    if (!checked.ok) return this.failure(input, ids, checked.status, checked.note, 0);
    const toId = (key: string): string => (key === HOLD ? HOLD : (keyToId.get(key) as string));
    const probabilities: Record<string, number> = {};
    for (const [key, value] of Object.entries(checked.probabilities)) probabilities[toId(key)] = value;
    const costUsd = checked.inputTokens === null || this.usdPerMTok === null ? null : (checked.inputTokens / 1_000_000) * this.usdPerMTok;
    return { policyId: this.id, epochId: input.epochId, choice: toId(checked.choice), probabilities, latencyMs: checked.latencyMs, inputTokens: checked.inputTokens, costUsd, status: "ok", note: null };
  }
}

// ---------------------------------------------------------------------------
// The mock: a transparent, deterministic, offline stand-in. It is NOT Jev.
// ---------------------------------------------------------------------------

export interface MockJevOptions {
  /** Expected gross bps per unit of the planted score, in the direction of the side. */
  bpsPerZ?: number;
  /** Smallest absolute planted score the mock acts on. */
  minZ?: number;
}

export class MockJevChooser implements LabChooser {
  readonly name = "mock";
  readonly isMock = true;
  private readonly bpsPerZ: number;
  private readonly minZ: number;

  constructor(options: MockJevOptions = {}) {
    this.bpsPerZ = options.bpsPerZ ?? 10;
    this.minZ = options.minZ ?? 0.5;
    if (!Number.isFinite(this.bpsPerZ) || this.bpsPerZ <= 0 || !Number.isFinite(this.minZ) || this.minZ < 0) throw new RangeError("invalid mock options");
  }

  /**
   * Rule: a carry is scored by its conservative net carry; any other candidate by its planted score (when the source
   * provides one and it is at least minZ) in the direction of its side, times bpsPerZ, minus its known total cost.
   * The best strictly positive score wins; unknown (null) inputs are skipped, never read as zero; otherwise hold.
   */
  choose(state: ChooserState): ChooserAnswer {
    let best: string | null = null;
    let bestScore = 0;
    for (const candidate of state.candidates) {
      let score: number | null = null;
      const net = candidate.criteria.carryNetBps;
      const z = candidate.criteria.signalZ;
      const cost = candidate.criteria.costBps;
      if (candidate.modality === "funding-carry") {
        if (typeof net === "number") score = net;
      } else if (typeof z === "number" && Math.abs(z) >= this.minZ && typeof cost === "number") {
        const direction = candidate.side === "long" ? 1 : candidate.side === "short" ? -1 : 0;
        score = direction * z * this.bpsPerZ - cost;
      }
      if (score !== null && score > bestScore) {
        best = candidate.key;
        bestScore = score;
      }
    }
    const keys = [HOLD, ...state.candidates.map((candidate) => candidate.key)];
    const choice = best ?? HOLD;
    const weight = best === null ? 1 : 0.7;
    const probabilities: Record<string, number> = {};
    for (const key of keys) probabilities[key] = key === choice ? weight : keys.length > 1 ? (1 - weight) / (keys.length - 1) : 0;
    return { choice, probabilities, confidence: null, latencyMs: 0, inputTokens: Math.round(JSON.stringify(state).length / 4) };
  }
}

export interface RosterOptions {
  seed: number;
  /** The Jev chooser; the mock when omitted. */
  chooser?: LabChooser;
  timeoutMs?: number;
  inferenceUsdPerMTok?: number | null;
}

/** hold, random, buy-and-hold, momentum-rule, carry-rule and jev, in this order. */
export function defaultRoster(options: RosterOptions): LabPolicy[] {
  return [
    holdPolicy(),
    randomPolicy(options.seed),
    buyAndHoldPolicy(),
    momentumRulePolicy(),
    carryRulePolicy(),
    new JevPolicy({ chooser: options.chooser ?? new MockJevChooser(), timeoutMs: options.timeoutMs, inferenceUsdPerMTok: options.inferenceUsdPerMTok }),
  ];
}
