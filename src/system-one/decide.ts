/**
 * Jev chooses one eligible leverage candidate or hold. The state Jev sees is the brief with the
 * wallet address and provenance stripped: typed numbers and short labels only. The answer is a key
 * that must already exist among hold and the eligible ids; free text never becomes an instruction.
 */

import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { PROMPTS } from "../generated/prompts";
import type { QuantAnnex } from "../quant/annex";
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
 /** Present only when the brief carries a quant annex. Evidence about the data and the risk, never a choice. */
 quant?: SystemOneQuantState;
}

export type SystemOneQuantState =
 | { status: "unavailable"; reason: string; dataGrade: string }
 | {
  status: "ok";
  dataGrade: string;
  sigmaDaily: { low: number | null; central: number | null; high: number | null };
  regime: string | null;
  tailRatio: number | null;
  excessKurtosis: number | null;
  hillIndex: number | null;
  /** Null when the clustering fit sat on the edge of its search grid or did not run. */
  clusteringHalfLifeBars: number | null;
  /** Paths behind simulatedTouch, null when the simulation did not run. A simulatedTouch of 0 means fewer than 1 hit in this many. */
  simulationPaths: number | null;
  simulationSkipped: string | null;
  candidates: Array<{ id: string; sideAwareTouch: number | null; simulatedTouch: number | null; simulatedStdError: number | null }>;
 };

/** Compact quant view for the eligible candidates only. */
function quantState(annex: QuantAnnex, eligible: LeverageCandidate[]): SystemOneQuantState {
 if (annex.status !== "ok") return { status: "unavailable", reason: annex.reason, dataGrade: annex.quality.grade };
 const byId = new Map(annex.candidates.map((candidate) => [candidate.id, candidate]));
 return {
  status: "ok",
  dataGrade: annex.quality.grade,
  sigmaDaily: { low: annex.sigma.low, central: annex.sigma.central, high: annex.sigma.high },
  regime: annex.sigma.regime,
  tailRatio: annex.sigma.tailRatio,
  excessKurtosis: annex.tail.excessKurtosis,
  hillIndex: annex.tail.hillIndex,
  clusteringHalfLifeBars: annex.clustering?.halfLifeBars ?? null,
  simulationPaths: annex.simulation?.paths ?? null,
  simulationSkipped: annex.simulationSkipped,
  candidates: eligible.map((candidate) => ({
   id: candidate.id,
   sideAwareTouch: byId.get(candidate.id)?.sideAwareTouch ?? null,
   simulatedTouch: byId.get(candidate.id)?.simulatedTouch ?? null,
   simulatedStdError: byId.get(candidate.id)?.simulatedStdError ?? null,
  })),
 };
}

/** The sanitized view: no address, no source, no timestamps, only the eligible candidates. */
export function buildSystemOneState(brief: LeverageBrief, eligible: LeverageCandidate[]): SystemOneState {
 const mark = brief.market.markPrice;
 const index = brief.market.indexPrice;
 const basisBps = mark !== null && index !== null && index > 0 ? Math.round(((mark - index) / index) * 10_000 * 100) / 100 : null;
 const state: SystemOneState = {
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
 if (brief.quant !== undefined) state.quant = quantState(brief.quant, eligible);
 return state;
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


/** The inputs paragraph the model reads. Unchanged unless the brief carries a quant annex. */
export function inputsText(brief: LeverageBrief): string {
 const prompt = PROMPTS["p-system-one"];
 return brief.quant === undefined ? prompt.baseInputs : prompt.baseInputs + prompt.quantInputs;
}

function criteriaFor(eligible: LeverageCandidate[]): Record<string, string> {
 const prompt = PROMPTS["p-system-one"];
 const criteria: Record<string, string> = { hold: prompt.hold };
 for (const candidate of eligible) {
  criteria[candidate.id] = prompt.candidate.replace("{side}", candidate.side).replace("{leverage}", String(candidate.leverage)).replace("{marginUsd}", String(candidate.marginUsd)).replace("{notionalUsd}", String(candidate.notionalUsd));
 }
 return criteria;
}

export function systemOneQuestions(brief: LeverageBrief, eligible: LeverageCandidate[]) {
 return {
  leverage: {
   type: "choice" as const,
   instructions: {
    question: PROMPTS["p-system-one"].question,
    goal: PROMPTS["p-system-one"].goal,
    inputs: inputsText(brief),
   },
   criteria: criteriaFor(eligible),
  },
 } as const;
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
  const questions = systemOneQuestions(brief, eligible);
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
