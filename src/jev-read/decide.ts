/**
 * Jev's answer to "buy, sell or hold" on the tape. The adapter is thin and the validation is strict: only the three
 * actions exist, weights must be finite and non negative, and the chosen action must carry weight. Anything else is a
 * hold with a status that says why, never an action, so free text from a provider cannot become an instruction.
 */

import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
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

/**
 * What the optional `analysis` block of the state means, for the model. The pack that produces it describes the market
 * and never carries an action; this text says the same. A test keeps every field of the block named here.
 */
export const ANALYSIS_INPUTS_TEXT =
  "Optional analysis is a pre-computed digest of CLOSED candles and public derivatives data for this market, ageSec seconds old. It can lag the tape by minutes, may be missing in whole or in part, is descriptive only and never overrides the tape. " +
  "trend: regime (up, down or range from ADX on 15 minute bars), adx15m (above 25 is a trend), efficiency15m (0 noise, 1 straight line), emaStack15m, emaStack1h and emaStack4h (+1 close above EMA20 above EMA50, -1 the opposite, 0 mixed), extensionAtr15m (signed distance of the price from EMA50 in ATR units, positive above). " +
  "momentum: rsi5m, rsi15m and rsi1h (RSI 14), macdHistAtr15m (MACD histogram in ATR units). " +
  "volatility: atrBps15m and atrBps1h, volRank24h (percentile 0 to 1 of the last hour's volatility among the last 24 hours) and bbWidthRank15m (percentile 0 to 1 of the 15 minute Bollinger band width against recent history, low is a squeeze), bbPercentB15m (0 lower band, 1 upper band), expectedAbsMove5mBps (typical absolute 5 minute move). " +
  "structure: donchianPos1h (0 low, 1 high of the last 24 hours, outside 0 to 1 means the price is beyond that range), supportBps and resistanceBps (distance to the nearest computed level below and above, null if none) with supportTouches and resistanceTouches (swing points that formed it), renkoRun15m (signed run of Renko bricks, positive up). " +
  "smc15m and smc1h inside structure are smart money digests of the closed 15 minute and 1 hour bars, null when there are too few bars: demandBlockBps and supplyBlockBps (distance from the price to the nearest untouched order block, a demand zone below or a supply zone above, 0 when the price is inside it, null if none), gapsUp and gapsDown (how many fair value gaps, price imbalances left by a fast move, are still open) with gapNearestBps (distance to the nearest open gap, 0 when inside), lastBreak (the latest break of structure, a close beyond the last swing point: kind BOS continues the previous direction and CHoCH reverses it, dir up or down, ageBars closed bars ago), rangePos (0 to 1 position of the price inside the last swing range, below 0.5 is discount and above 0.5 is premium) with rangeState (inside, above or below that range), poolAboveBps and poolBelowBps (distance to the nearest equal highs or equal lows, where stop orders tend to rest, not yet swept) and lastSweep (kind highs or lows, ageBars: the latest wick through such a pool that closed back inside). They describe where the price has been, not an entry or an exit. " +
  "derivatives: fundingZ and fundingPctile (current funding against the last 30 days), oiChange1hPct and oiPriceRegime (open interest change read with price: long_buildup, short_buildup, short_covering, long_unwind, mixed), longShortRatio and longShortZ (account positioning), takerBuyShare1h (share of taker volume that bought in the last hour, 0.5 balanced). " +
  "crossAsset: corrBtc48h, betaBtc48h, relStrengthVsBtc24hBps (24 hour move minus the BTC move). " +
  "cost: moveToCost is the typical 5 minute move divided by (assumedRoundTripFeeBps + spreadBps); well below 1 means a typical move does not pay for the cost.";

const INPUTS_BASE =
  "Spread and depth describe the book. Returns are in basis points over the last 1, 5, 15 and 30 minutes. volBpsPerMinute is realized volatility. flow60s is taker flow over the last 60 seconds, cvdBase is taker buys minus taker sells in base units. Funding is of the matching perpetual when known.";
const INPUTS_TAIL =
  "Every figure is a noisy observation and the probabilities you give are uncalibrated decision weights, not win rates.";
/** The pre-analysis inputs text, kept verbatim: a state without analysis is asked exactly as before. */
export const INPUTS_PLAIN = `${INPUTS_BASE} ${INPUTS_TAIL}`;
export const INPUTS_WITH_ANALYSIS = `${INPUTS_BASE} ${ANALYSIS_INPUTS_TEXT} ${INPUTS_TAIL}`;

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
          inputs: state.analysis === undefined ? INPUTS_PLAIN : INPUTS_WITH_ANALYSIS,
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
