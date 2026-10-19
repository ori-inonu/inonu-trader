/**
 * Jev's answer to "buy, sell or hold" on the tape. The adapter is thin and the validation is strict: only the three
 * actions exist, weights must be finite and non negative, and the chosen action must carry weight. Anything else is a
 * hold with a status that says why, never an action, so free text from a provider cannot become an instruction.
 */

import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { PROMPTS } from "../generated/prompts";
import type { AnalysisStructure, TapeAnalysis } from "./analytics";
import { TAPE_ACTIONS, type TapeAction, type TapeDecision, type TapeState } from "./types";

export interface RawTapeAnswer {
  readonly choice?: unknown;
  readonly probabilities?: unknown;
  readonly latencyMs?: unknown;
  readonly inputTokens?: unknown;
}

export interface TapeModel {
  readonly name: string;
  decide(state: TapeState, options?: { readonly signal?: AbortSignal }): Promise<RawTapeAnswer>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isAction = (value: unknown): value is TapeAction => typeof value === "string" && (TAPE_ACTIONS as readonly string[]).includes(value);

function holdOnly(model: string, latencyMs: number, status: TapeDecision["status"]): TapeDecision {
  return { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs, model, status, inputTokens: null };
}

export function validateTapeDecision(raw: unknown, model: string): TapeDecision {
  const latency = isRecord(raw) && typeof raw.latencyMs === "number" && Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0 ? raw.latencyMs : 0;
  if (!isRecord(raw) || !isAction(raw.choice)) return holdOnly(model, latency, "malformed");
  const action = raw.choice;

  let probabilities: Record<TapeAction, number>;
  if (raw.probabilities === undefined) {
    probabilities = { buy: 0, sell: 0, hold: 0, [action]: 1 } as Record<TapeAction, number>;
  } else {
    if (!isRecord(raw.probabilities)) return holdOnly(model, latency, "malformed");
    const weights = {} as Record<TapeAction, number>;
    let total = 0;
    for (const key of TAPE_ACTIONS) {
      const value = raw.probabilities[key] ?? 0;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return holdOnly(model, latency, "malformed");
      weights[key] = value;
      total += value;
    }
    if (!Number.isFinite(total) || !(total > 0) || !(weights[action] > 0)) return holdOnly(model, latency, "malformed");
    probabilities = { buy: weights.buy / total, sell: weights.sell / total, hold: weights.hold / total };
    if (!TAPE_ACTIONS.every((key) => Number.isFinite(probabilities[key])) || !(probabilities[action] > 0)) return holdOnly(model, latency, "malformed");
  }

  const tokens = raw.inputTokens;
  return {
    action,
    probabilities,
    confidence: probabilities[action],
    latencyMs: latency,
    model,
    status: "ok",
    inputTokens: typeof tokens === "number" && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null,
  };
}


/** Five significant digits: keeps the prompt small without flattening a price like 0.02715. */
function significant(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(5)) : value;
}

/** The state as the model sees it: every field of TapeState except the chart-only `analysis.structure.levels`. */
export type ModelTapeState = Omit<TapeState, "analysis"> & {
  readonly analysis?: Omit<TapeAnalysis, "structure"> & { readonly structure?: Omit<AnalysisStructure, "levels"> };
};

/**
 * The levels under structure are pixel data for the chart, not model input: strip just them and leave every other
 * number and word of the analysis exactly as the tape state carries it. The input is never mutated.
 */
export function stateForModel(state: TapeState): ModelTapeState {
  const analysis = state.analysis;
  if (analysis?.structure === undefined) return state;
  const { levels: _levels, ...structure } = analysis.structure;
  return { ...state, analysis: { ...analysis, structure } };
}

export function compactTapeState(value: unknown): unknown {
  if (typeof value === "number") return significant(value);
  if (Array.isArray(value)) return value.map(compactTapeState);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactTapeState(item)]));
  return value;
}

const JEV_READ_PROMPT = PROMPTS["p-jev-read"];
export const ANALYSIS_INPUTS_TEXT = JEV_READ_PROMPT.analysisInputsText;
const INPUTS_PLAIN = JEV_READ_PROMPT.direction.instructions.inputsPlain;
const INPUTS_WITH_ANALYSIS = JEV_READ_PROMPT.direction.instructions.inputsWithAnalysis;

type TapeQuestionState = Pick<TapeState, "horizonMinutes" | "instId"> & { readonly analysis?: unknown };

/** The effective questions sent to Jev, extracted so the full serialized payload can be regression-tested. */
export function buildTapeQuestions(state: TapeQuestionState) {
  const prompt = JEV_READ_PROMPT.direction;
  return {
    direction: {
      type: prompt.type,
      instructions: {
        question: prompt.instructions.question.replace(
          /\{horizonMinutes\}|\{instId\}/g,
          (placeholder) => placeholder === "{horizonMinutes}" ? String(state.horizonMinutes) : state.instId,
        ),
        goal: prompt.instructions.goal,
        inputs: state.analysis === undefined ? INPUTS_PLAIN : INPUTS_WITH_ANALYSIS,
      },
      criteria: prompt.criteria,
    },
  } as const;
}

/** Real Jev through the AI SDK TypeSafe provider; one choice question per read. */
export class JevTapeModel implements TapeModel {
  readonly name: string;
  private readonly model;

  constructor(modelId: string) {
    this.name = modelId;
    this.model = typeSafeAi.evaluationModel(modelId);
  }

  async decide(state: TapeState, options?: { readonly signal?: AbortSignal }): Promise<RawTapeAnswer> {
    const t0 = performance.now();
    const questions = buildTapeQuestions(state);
    const result = await experimental_evaluate({
      model: this.model,
      state: compactTapeState(stateForModel(state)) as never,
      questions: questions as never,
      maxRetries: 0,
      abortSignal: options?.signal,
    });
    const answers = (result as { answers?: Record<string, unknown>; usage?: { inputTokens?: unknown } }).answers;
    const answer = isRecord(answers) && isRecord(answers.direction) ? answers.direction : {};
    return {
      choice: answer.choice,
      probabilities: answer.probabilities,
      latencyMs: performance.now() - t0,
      inputTokens: (result as { usage?: { inputTokens?: unknown } }).usage?.inputTokens,
    };
  }
}
