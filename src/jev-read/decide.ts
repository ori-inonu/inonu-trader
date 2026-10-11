/**
 * Jev's answer to "buy, sell or hold" on the tape. The adapter is thin and the validation is strict: only the three
 * actions exist, weights must be finite and non negative, and the chosen action must carry weight. Anything else is a
 * hold with a status that says why, never an action, so free text from a provider cannot become an instruction.
 */

import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
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
    if (!(total > 0) || !(weights[action] > 0)) return holdOnly(model, latency, "malformed");
    probabilities = { buy: weights.buy / total, sell: weights.sell / total, hold: weights.hold / total };
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

export function compactTapeState(value: unknown): unknown {
  if (typeof value === "number") return significant(value);
  if (Array.isArray(value)) return value.map(compactTapeState);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactTapeState(item)]));
  return value;
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
    const questions = {
      direction: {
        type: "choice",
        instructions: {
          question: `Over the next ${state.horizonMinutes} minutes, should a spot trader on ${state.instId} buy, sell or hold?`,
          goal: "Read the tape of one market. Capital is preserved first: costs are the spread plus taker fees (assume about 20 bps for a round trip), so a move that does not clearly exceed them is not an edge. Prefer hold when the evidence is mixed, thin or contradictory.",
          inputs: "Spread and depth describe the book. Returns are in basis points over the last 1, 5, 15 and 30 minutes. volBpsPerMinute is realized volatility. flow60s is taker flow over the last 60 seconds, cvdBase is taker buys minus taker sells in base units. Funding is of the matching perpetual when known. Every figure is a noisy observation and the probabilities you give are uncalibrated decision weights, not win rates.",
        },
        criteria: {
          buy: "Buy: the mid is more likely to be higher after the horizon by clearly more than the costs.",
          sell: "Sell: the mid is more likely to be lower after the horizon by clearly more than the costs.",
          hold: "Hold: the edge is uncertain, smaller than the costs, or the signals disagree.",
        },
      },
    } as const;
    const result = await experimental_evaluate({
      model: this.model,
      state: compactTapeState(state) as never,
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
