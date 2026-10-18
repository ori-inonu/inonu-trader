import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { PROMPTS } from "../generated/prompts";
import type { InventorySnapshot } from "../okx-wallet/portfolio";
import { safeText } from "./candidates";
import type { OperatorDecision, OpportunityCandidate } from "./types";

/**
 * Jev chooses one eligible candidate or hold. The state Jev sees is a sanitized
 * summary: no address, no credentials, no raw quotes, only typed numbers and
 * short labels. The answer is a choice key that must already exist; free text
 * never becomes an instruction.
 */
export interface OperatorState {
  observedAtMs: number;
  inventory: { knownValueUsd: number; valueComplete: boolean; chains: { chain: string; knownValueUsd: number; nativeBalance: number | null; assets: number }[] };
  candidates: {
    id: string;
    kind: string;
    chain: string;
    pair: string;
    sizeUsd: number | null;
    netUsd: number | null;
    netBps: number | null;
    priceImpactPercent: number | null;
    costsUsd: number | null;
    quoteAgeMs: number | null;
    notes: string[];
  }[];
}

export interface OperatorModel {
  readonly name: string;
  choose(state: OperatorState, eligible: OpportunityCandidate[], options?: { signal?: AbortSignal }): Promise<OperatorDecision>;
}

export function buildOperatorState(inventory: InventorySnapshot, eligible: OpportunityCandidate[]): OperatorState {
  return {
    observedAtMs: inventory.observedAtMs,
    inventory: {
      knownValueUsd: round(inventory.knownValueUsd, 2),
      valueComplete: inventory.valueComplete,
      chains: inventory.chains.map((chain) => ({ chain: chain.chainName, knownValueUsd: round(chain.knownValueUsd, 2), nativeBalance: chain.nativeBalance, assets: chain.assets.length })),
    },
    candidates: eligible.map((candidate) => {
      const costsUsd = candidate.costs.complete
        ? (candidate.costs.networkFeeUsd ?? 0) + (candidate.costs.tradingFeeUsd ?? 0) + candidate.costs.inferenceUsd
        : null;
      return {
        id: candidate.id,
        kind: candidate.kind,
        chain: candidate.toChainIndex ? `${candidate.chainIndex}->${candidate.toChainIndex}` : candidate.chainIndex,
        pair: `${candidate.from.symbol}->${candidate.to.symbol}`,
        sizeUsd: candidate.sizeUsd,
        netUsd: candidate.netUsd === null ? null : round(candidate.netUsd, 6),
        netBps: candidate.netUsd !== null && candidate.sizeUsd ? round((candidate.netUsd / candidate.sizeUsd) * 10_000, 2) : null,
        priceImpactPercent: candidate.priceImpactPercent,
        costsUsd: costsUsd === null ? null : round(costsUsd, 6),
        quoteAgeMs: candidate.quoteAgeMs,
        notes: candidate.notes.slice(0, 4).map((note) => safeText(note)),
      };
    }),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateOperatorDecision(decision: unknown, eligible: OpportunityCandidate[]): OperatorDecision {
  if (!isRecord(decision)) throw new Error("Invalid operator decision");
  const { choice, probabilities: source, latencyMs, inputTokens, confidence, model } = decision;
  const keys = ["hold", ...eligible.map((candidate) => candidate.id)];
  if (typeof choice !== "string" || !keys.includes(choice)) throw new Error("Operator decision names an unknown candidate");
  if (!isRecord(source) || Reflect.ownKeys(source).length !== keys.length || !keys.every((key) => Object.hasOwn(source, key))) throw new Error("Invalid operator probabilities");
  const values = keys.map((key) => source[key]);
  if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("Invalid operator probabilities");
  const total = values.reduce<number>((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 0.02) throw new Error("Operator probabilities do not sum to one");
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0) throw new Error("Invalid operator latency");
  if (inputTokens !== null && (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0)) throw new Error("Invalid operator usage");
  if (confidence !== null && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error("Invalid operator confidence");
  if (typeof model !== "string" || !model) throw new Error("Invalid operator model");
  return {
    choice,
    probabilities: Object.fromEntries(keys.map((key, index) => [key, values[index] as number])),
    confidence,
    latencyMs,
    inputTokens,
    model,
  };
}

/** Parse an evaluation without turning omitted decision weights into certainty. */
export function decisionFromEvaluation(result: unknown, eligible: OpportunityCandidate[], latencyMs: number, model: string): OperatorDecision {
  if (!isRecord(result)) throw new Error("Invalid operator evaluation");
  const { answers, usage: usageRecord, providerMetadata } = result;
  const answer = isRecord(answers) ? answers.allocation : null;
  if (!isRecord(answer)) throw new Error("Invalid operator evaluation");
  const usage = isRecord(usageRecord) ? usageRecord.inputTokens : undefined;
  const metadata = isRecord(providerMetadata) ? providerMetadata.typesafe : null;
  const confidenceRecord = isRecord(metadata) ? metadata.confidence : null;
  const confidence = isRecord(confidenceRecord) ? confidenceRecord.allocation : undefined;
  return validateOperatorDecision({
    choice: answer.choice,
    probabilities: answer.probabilities,
    confidence: confidence ?? null,
    latencyMs,
    inputTokens: typeof usage === "number" && Number.isSafeInteger(usage) && usage >= 0 ? usage : null,
    model,
  }, eligible);
}

export function operatorQuestions(eligible: OpportunityCandidate[]) {
  const { instructions, criteria: promptCriteria } = PROMPTS["p-operator"];
  const criteria: Record<string, string> = { hold: promptCriteria.hold };
  const byKind: Record<string, string> = promptCriteria.byKind;
  for (const candidate of eligible) {
    const kindText = byKind[candidate.kind] ?? promptCriteria.fallback;
    criteria[candidate.id] = `${promptCriteria.candidateFormat.replace("{kindText}", kindText).replace("{from}", safeText(candidate.from.symbol, 12)).replace("{to}", safeText(candidate.to.symbol, 12)).replace("{chain}", candidate.chainIndex)}${promptCriteria.candidateSuffix}`;
  }
  return {
    allocation: {
      type: "choice" as const,
      instructions,
      criteria,
    },
  };
}

/** Real Jev through the AI SDK TypeSafe provider; one choice question per cycle. */
export class JevOperatorModel implements OperatorModel {
  readonly name: string;
  private model;

  constructor(modelId = "jev-latest") {
    this.name = modelId;
    this.model = typeSafeAi.evaluationModel(modelId);
  }

  async choose(state: OperatorState, eligible: OpportunityCandidate[], options?: { signal?: AbortSignal }): Promise<OperatorDecision> {
    if (eligible.length > 254) throw new Error("Too many candidates for one choice question");
    const t0 = performance.now();
    const questions = operatorQuestions(eligible);
    const result = await experimental_evaluate({ model: this.model, state: state as any, questions: questions as any, maxRetries: 0, abortSignal: options?.signal });
    return decisionFromEvaluation(result, eligible, performance.now() - t0, this.name);
  }
}


/** Deterministic stand-in: largest conservative net among eligible candidates, else hold. */
export class MockOperatorModel implements OperatorModel {
  readonly name = "mock";

  async choose(state: OperatorState, eligible: OpportunityCandidate[]): Promise<OperatorDecision> {
    const t0 = performance.now();
    const ranked = eligible.filter((candidate) => candidate.netUsd !== null && candidate.netUsd > 0)
      .sort((a, b) => (b.netUsd ?? 0) - (a.netUsd ?? 0));
    const keys = ["hold", ...eligible.map((candidate) => candidate.id)];
    const probabilities: Record<string, number> = {};
    const choice = ranked[0]?.id ?? "hold";
    const weight = ranked.length ? 0.7 : 1;
    for (const key of keys) probabilities[key] = key === choice ? weight : (keys.length > 1 ? (1 - weight) / (keys.length - 1) : 0);
    return validateOperatorDecision({
      choice,
      probabilities,
      confidence: null,
      latencyMs: performance.now() - t0,
      inputTokens: Math.round(JSON.stringify(state).length / 4),
      model: this.name,
    }, eligible);
  }
}
