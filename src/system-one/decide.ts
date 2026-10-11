/**
 * Jev chooses one eligible leverage candidate or hold. The state Jev sees is the brief with the
 * wallet address and provenance stripped: typed numbers and short labels only. The answer is a key
 * that must already exist among hold and the eligible ids; free text never becomes an instruction.
 */

import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { isRecord, finiteOrNull, type LeverageBrief, type LeverageCandidate, type LeverageDecision } from "./types";

export interface SystemOneModel {
  readonly name: string;
  choose(brief: LeverageBrief, eligible: LeverageCandidate[], options?: { signal?: AbortSignal }): Promise<LeverageDecision>;
}

export interface SystemOneState {
  phase: string;
  horizonDays: number;
  market: {
    instId: string;
    markPrice: number | null;
    indexPrice: number | null;
    basisBps: number | null;
    fundingRatePerSettlement: number | null;
    realizedSigmaDaily: number | null;
    candlesUsed: number;
  };
  wallet: { capitalUsd: number; knownValueUsd: number; valueComplete: boolean; openNotionalUsd: number; openSide: string | null };
  limits: { leverageCeiling: number; leverageCap: number | null; orderCapUsd: number; exposureCapUsd: number; liquidationDistanceFloor: number | null; dailyStopUsd: number | null };
  candidates: Array<{
    id: string;
    side: string;
    leverage: number;
    marginUsd: number;
    notionalUsd: number;
    liquidationDistance: number;
    touchProbability: number | null;
    medianMultipleNoEdge: number | null;
    fundingCarryUsd: number | null;
  }>;
  notes: string[];
}

/** The sanitized view: no address, no source, no timestamps, only the eligible candidates. */
export function buildSystemOneState(brief: LeverageBrief, eligible: LeverageCandidate[]): SystemOneState {
  const mark = brief.market.markPrice;
  const index = brief.market.indexPrice;
  const basisBps = mark !== null && index !== null && index > 0 ? Math.round(((mark - index) / index) * 10_000 * 100) / 100 : null;
  return {
    phase: brief.phase,
    horizonDays: brief.horizonDays,
    market: {
      instId: brief.market.instId,
      markPrice: mark,
      indexPrice: index,
      basisBps,
      fundingRatePerSettlement: brief.market.fundingRate,
      realizedSigmaDaily: brief.market.realizedSigmaDaily,
      candlesUsed: brief.market.candlesUsed,
    },
    wallet: {
      capitalUsd: brief.wallet.capitalUsd,
      knownValueUsd: brief.wallet.knownValueUsd,
      valueComplete: brief.wallet.valueComplete,
      openNotionalUsd: brief.wallet.openNotionalUsd,
      openSide: brief.wallet.openSide,
    },
    limits: {
      leverageCeiling: brief.limits.leverageCeiling,
      leverageCap: brief.limits.leverageCap,
      orderCapUsd: brief.limits.orderCapUsd,
      exposureCapUsd: brief.limits.exposureCapUsd,
      liquidationDistanceFloor: brief.limits.liquidationDistanceFloor,
      dailyStopUsd: brief.limits.dailyStopUsd,
    },
    candidates: eligible.map((candidate) => ({
      id: candidate.id,
      side: candidate.side,
      leverage: candidate.leverage,
      marginUsd: candidate.marginUsd,
      notionalUsd: candidate.notionalUsd,
      liquidationDistance: candidate.liquidationDistance,
      touchProbability: candidate.touchProbability,
      medianMultipleNoEdge: candidate.medianMultipleNoEdge,
      fundingCarryUsd: candidate.fundingCarryUsd,
    })),
    notes: brief.notes,
  };
}

function normalize(probabilities: Record<string, number>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const key of keys) {
    const value = probabilities[key];
    const clamped = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
    out[key] = clamped;
    total += clamped;
  }
  if (total <= 0) {
    for (const key of keys) out[key] = key === "hold" ? 1 : 0;
    return out;
  }
  for (const key of keys) out[key] = out[key]! / total;
  return out;
}

/** Accepts only a choice among hold and the eligible ids; anything else becomes hold with a status. */
export function validateLeverageDecision(decision: unknown, eligible: LeverageCandidate[]): LeverageDecision {
  const keys = ["hold", ...eligible.map((candidate) => candidate.id)];
  const fallback = (status: LeverageDecision["status"], model = "unknown", latencyMs = 0): LeverageDecision => ({
    choice: "hold",
    probabilities: normalize({}, keys),
    confidence: null,
    latencyMs,
    model,
    status,
  });
  if (!isRecord(decision)) return fallback("malformed");
  const model = typeof decision.model === "string" ? decision.model.slice(0, 64) : "unknown";
  const latencyMs = finiteOrNull(decision.latencyMs) ?? 0;
  if (decision.status !== undefined && decision.status !== "ok") {
    const status = ["error", "timeout", "malformed", "invalid-choice"].includes(String(decision.status))
      ? decision.status as LeverageDecision["status"] : "malformed";
    return fallback(status, model, latencyMs);
  }
  const choice = typeof decision.choice === "string" ? decision.choice : null;
  if (choice === null || !keys.includes(choice)) return fallback("invalid-choice", model, latencyMs);
  if (decision.probabilities !== undefined && (!isRecord(decision.probabilities) ||
      Object.values(decision.probabilities).some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0))) {
    return fallback("malformed", model, latencyMs);
  }
  if (isRecord(decision.probabilities)) {
    const weights = decision.probabilities as Record<string, number>;
    const total = keys.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
    if (!Number.isFinite(total) || (choice !== "hold" && !(weights[choice]! > 0))) return fallback("malformed", model, latencyMs);
  }
  const probabilities = isRecord(decision.probabilities) ? normalize(decision.probabilities as Record<string, number>, keys) : normalize({ [choice]: 1 }, keys);
  const confidence = finiteOrNull(decision.confidence);
  return {
    choice,
    probabilities,
    confidence: confidence === null ? null : Math.min(1, Math.max(0, confidence)),
    latencyMs: Math.max(0, latencyMs),
    model,
    status: "ok",
  };
}

export function decisionFromEvaluation(result: unknown, eligible: LeverageCandidate[], latencyMs: number, model: string): LeverageDecision {
  if (!isRecord(result)) return { ...validateLeverageDecision(null, eligible), model, latencyMs: Math.max(0, latencyMs) };
  const answers = isRecord(result.answers) ? result.answers : result;
  const answer = isRecord(answers.leverage) ? answers.leverage : answers;
  const choice = typeof answer.choice === "string" ? answer.choice : typeof answer.answer === "string" ? answer.answer : null;
  const probabilities = isRecord(answer.probabilities) ? answer.probabilities : isRecord(answer.scores) ? answer.scores : {};
  return validateLeverageDecision({ choice, probabilities, confidence: answer.confidence, latencyMs, model }, eligible);
}

function criteriaFor(eligible: LeverageCandidate[]): Record<string, string> {
  const criteria: Record<string, string> = {
    hold: "Do not open or add to a position now. Choose this when the funding carry, the basis and the realized volatility do not justify the liquidation risk inside the horizon, or when any input is missing.",
  };
  for (const candidate of eligible) {
    criteria[candidate.id] = `Open a ${candidate.side} position at ${candidate.leverage}x with margin ${candidate.marginUsd} USD (notional ${candidate.notionalUsd} USD). Choose this only when the expected funding carry and basis over the horizon outweigh the volatility drag and the probability of touching liquidation listed for it.`;
  }
  return criteria;
}

/** Real Jev through the AI SDK TypeSafe provider; one choice question per cycle. */
export class JevSystemOneModel implements SystemOneModel {
  readonly name: string;
  private model;

  constructor(modelId = "jev-latest") {
    this.name = modelId;
    this.model = typeSafeAi.evaluationModel(modelId);
  }

  async choose(brief: LeverageBrief, eligible: LeverageCandidate[], options?: { signal?: AbortSignal }): Promise<LeverageDecision> {
    if (eligible.length > 254) throw new Error("Too many candidates for one choice question");
    const t0 = performance.now();
    const state = buildSystemOneState(brief, eligible);
    const questions = {
      leverage: {
        type: "choice",
        instructions: {
          question: "Which single leverage candidate should System One open now, or should it hold?",
          goal: "Act as the fast decision layer of the wallet. Grow median wealth over the horizon while keeping the probability of touching liquidation low. Never exceed the listed caps; prefer hold when carry and basis are small relative to drag and liquidation risk.",
          inputs: "Every candidate already passed the phase envelope: leverage cap, liquidation floor, order and exposure caps, complete inventory. Touch probabilities assume no drift. Funding carry is from the candidate side's point of view. Probabilities are decision weights, not win rates.",
        },
        criteria: criteriaFor(eligible),
      },
    } as const;
    const result = await experimental_evaluate({ model: this.model, state: state as any, questions: questions as any, maxRetries: 0, abortSignal: options?.signal });
    return decisionFromEvaluation(result, eligible, performance.now() - t0, this.name);
  }
}

/**
 * Deterministic stand-in for offline demos: the eligible candidate whose funding carry over the
 * horizon exceeds the drag implied by its median multiple and whose touch probability stays under
 * five percent; otherwise hold. Announced as mock in every output.
 */
export class MockSystemOneModel implements SystemOneModel {
  readonly name = "mock";

  async choose(brief: LeverageBrief, eligible: LeverageCandidate[]): Promise<LeverageDecision> {
    const t0 = performance.now();
    void brief;
    const ranked = eligible
      .filter((candidate) => candidate.fundingCarryUsd !== null && candidate.touchProbability !== null && candidate.medianMultipleNoEdge !== null)
      .map((candidate) => ({ candidate, score: (candidate.fundingCarryUsd as number) - (1 - (candidate.medianMultipleNoEdge as number)) * candidate.marginUsd }))
      .filter(({ candidate, score }) => score > 0 && (candidate.touchProbability as number) < 0.05)
      .sort((a, b) => b.score - a.score);
    const keys = ["hold", ...eligible.map((candidate) => candidate.id)];
    const choice = ranked[0]?.candidate.id ?? "hold";
    const weight = ranked.length ? 0.7 : 1;
    const probabilities: Record<string, number> = {};
    for (const key of keys) probabilities[key] = key === choice ? weight : keys.length > 1 ? (1 - weight) / (keys.length - 1) : 0;
    return validateLeverageDecision({ choice, probabilities, confidence: null, latencyMs: performance.now() - t0, model: this.name }, eligible);
  }
}
