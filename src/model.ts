import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { config } from "./config";

/** Model probabilities are decision weights, not calibrated win rates. */
export type Action = "buy" | "sell" | "hold";

/** What the model sees. Compact, relative, human-readable. */
export interface TradeState {
  market: "MON-USDC";
  block: number;
  horizonBlocks: number; // the question is about the move over this many blocks
  blockMs: number;
  mid: number;
  spreadBps: number;
  bookImbalance: number; // -1 (all asks) .. 1 (all bids), within 1% of mid
  /** Cumulative resting MON within 10/25/50 bps of mid, per side. */
  depth: { [band: string]: { bid: number; ask: number } };
  /** Top 5 levels each side, best first, as "price x size". */
  book: { bids: string[]; asks: string[] };
  returnsBps: { last1: number; last5: number; last20: number; last100: number };
  recentMids: string; // oldest..newest, sampled every 5 blocks over the horizon, space separated
  /** Taker prints over the last `horizonBlocks`. cvdMon = taker buy volume - taker sell volume. */
  trades: { count: number; buyMon: number; sellMon: number; cvdMon: number; vwap: number | null; lastPrice: number | null; lastSide: "buy" | "sell" | null };
  recentTrades: string[]; // newest last, "block side size @ price"
  allowed: { buy: boolean; sell: boolean };
}

export interface Decision {
  action: Action;
  probabilities: Record<Action, number>;
  upIn10: number;
  latencyMs: number;
  /** null means the provider did not supply valid usage; it is not a zero-cost result. */
  inputTokens: number | null;
}

export interface Model {
  readonly name: string;
  decide(state: TradeState): Promise<Decision>;
}

export function validateDecision(d: Decision): Decision {
  if (!["buy", "sell", "hold"].includes(d.action) ||
      (d.inputTokens !== null && (!Number.isSafeInteger(d.inputTokens) || d.inputTokens < 0)) ||
      ![d.latencyMs, d.upIn10].every(Number.isFinite) || d.latencyMs < 0 || d.upIn10 < 0 || d.upIn10 > 1) throw new Error("Invalid model decision");
  const p = [d.probabilities.buy, d.probabilities.sell, d.probabilities.hold];
  if (!p.every(x => Number.isFinite(x) && x >= 0 && x <= 1) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 0.01) throw new Error("Invalid model probabilities");
  return d;
}

const QUESTIONS = {
  direction: {
    type: "choice",
    instructions: {
      question: "Should a funded spot maker post a buy, post a sell, or hold over the horizon?",
      goal: "Trade MON-USDC with funded inventory, gas and maker fees. Preserve capital; no borrowing. Prefer hold when estimated edge is uncertain or inadequate after costs and adverse selection.",
      timing: "Execution is a post-only resting limit order near the touch. It may not fill; a fill can occur after the prediction horizon. Cancellation and replacement cost gas. It is not immediate-or-cancel.",
      inputs: "Flow, depth and recent returns are noisy observations, not guarantees. An unavailable allowed side cannot execute. A sell spends existing MON inventory. Probabilities are uncalibrated decision weights.",
    },
    criteria: {
      buy: "Buy MON now: mid more likely to be higher after `horizonBlocks` blocks, by more than the spread.",
      sell: "Sell MON now: mid more likely to be lower after `horizonBlocks` blocks, by more than the spread.",
      hold: "Do not place an order: edge is uncertain, costs exceed opportunity, or neither funded side is allowed.",
    },
  },
} as const;

/** Real Jev via the AI SDK. Swap-in is the MODEL env var. */
export class JevModel implements Model {
  readonly name = config.jevModelId;
  private model = typeSafeAi.evaluationModel(config.jevModelId);

  async decide(state: TradeState): Promise<Decision> {
    const t0 = performance.now();
    const r = await experimental_evaluate({ model: this.model, state: state as any, questions: QUESTIONS, maxRetries: 0 });
    const a = r.answers.direction;
    const p = a.probabilities ?? { buy: 0, sell: 0, [a.choice]: 1 };
    const buy = p.buy ?? 0, sell = p.sell ?? 0;
    const inputTokens = r.usage?.inputTokens;
    return validateDecision({
      action: a.choice as Action,
      probabilities: { buy, sell, hold: p.hold ?? 0 },
      upIn10: buy,
      latencyMs: performance.now() - t0,
      inputTokens: typeof inputTokens === "number" && Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? inputTokens : null,
    });
  }
}

/** Deterministic stand-in: momentum + imbalance + mean reversion toward flat. */
export class MockModel implements Model {
  readonly name = "mock";

  async decide(state: TradeState): Promise<Decision> {
    const t0 = performance.now();
    // momentum + book imbalance + noise, pulled back toward flat so it trades both ways
    const flow = state.trades.buyMon + state.trades.sellMon ? state.trades.cvdMon / (state.trades.buyMon + state.trades.sellMon) : 0;
    const signal = state.returnsBps.last20 / 8 + state.bookImbalance * 1.5 + flow * 2 + this.noise(state.block);
    const buy = 1 / (1 + Math.exp(-signal)); // binary softmax
    const probabilities = { buy, sell: 1 - buy, hold: 0 };
    const action: Action = buy >= 0.5 ? "buy" : "sell";
    await Bun.sleep(80); // stand in for inference time so the pipeline behaves like production
    return {
      action, probabilities,
      upIn10: buy,
      latencyMs: performance.now() - t0,
      inputTokens: Math.round(JSON.stringify(state).length / 4),
    };
  }

  private noise(block: number) {
    let h = block * 2654435761 >>> 0;
    h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
    return ((h % 1000) / 1000 - 0.5) * 3;
  }
}

export const createModel = (): Model => (config.model === "jev" ? new JevModel() : new MockModel());
