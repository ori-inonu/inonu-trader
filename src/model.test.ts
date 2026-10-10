import { expect, mock, test } from "bun:test";
import type { Action, TradeState } from "./model";

type Evaluation = {
  state: TradeState;
  maxRetries: number;
  questions: { direction: { instructions: { goal: string; timing: string; inputs: string } } };
};
let returnedChoice: "buy" | "sell" = "sell";
let captured: Evaluation | undefined;

// Replace configuration as well as both SDK entry points before loading the
// public model. This test neither reads genuine credentials nor calls inference.
mock.module("./config", () => ({ config: { model: "jev", jevModelId: "offline-test-model" } }));
mock.module("@ai-sdk/typesafe-ai", () => ({
  typeSafeAi: { evaluationModel: (id: string) => ({ id, offline: true }) },
}));
mock.module("ai", () => ({
  experimental_evaluate: async (request: Evaluation) => {
    captured = request;
    return {
      answers: { direction: {
        choice: returnedChoice,
        probabilities: { buy: returnedChoice === "buy" ? 0.9 : 0.1, sell: returnedChoice === "sell" ? 0.9 : 0.1 },
      } },
      usage: { inputTokens: 7 },
    };
  },
}));
const { JevModel } = await import("./model");

const priceFeed: TradeState = {
  market: "MON-USDC", block: 123, horizonBlocks: 100, blockMs: 300,
  mid: 0.0222354, spreadBps: 7, bookImbalance: 0.5,
  depth: { "10": { bid: 200, ask: 100 } },
  book: { bids: ["0.022234 x 200"], asks: ["0.022236 x 100"] },
  returnsBps: { last1: 1, last5: 2, last20: 3, last100: 4 },
  recentMids: "0.022230 0.0222354",
  trades: { count: 2, buyMon: 100, sellMon: 10, cvdMon: 90, vwap: 0.022235, lastPrice: 0.022235, lastSide: "buy" },
  recentTrades: ["123 buy 100 @ 0.022235"], allowed: { buy: true, sell: true },
};

test("Jev receives the price feed with every-block post-only instructions", async () => {
  const model = new JevModel();
  expect(model.name).toBe("offline-test-model");
  await model.decide(priceFeed);
  expect(captured?.state).toEqual(priceFeed);
  expect(captured?.maxRetries).toBe(0);
  const instructions = captured!.questions.direction.instructions;
  expect(instructions.goal).toMatch(/every Monad block/);
  expect(instructions.goal).not.toMatch(/every few blocks|held until the next|crosses the spread/);
  expect(instructions.timing).toMatch(/post-only limit.order/);
  expect(instructions.timing).not.toMatch(/immediate-or-cancel|market order/);
});

test("the evaluator, not a replacement price heuristic, selects either direction", async () => {
  const model = new JevModel();
  for (const action of ["sell", "buy"] as const satisfies readonly Action[]) {
    returnedChoice = action;
    const result = await model.decide(priceFeed);
    expect(captured?.state).toEqual(priceFeed);
    expect(result.action).toBe(action);
    expect(result.probabilities[action]).toBe(0.9);
    expect(result.inputTokens).toBe(7);
  }
});

test("direction guidance does not promise an opposite-side trade when the model's choice is blocked", async () => {
  returnedChoice = "buy";
  await new JevModel().decide(priceFeed);
  const inputs = captured!.questions.direction.instructions.inputs;
  expect(inputs).toContain("no opposite-side trade is substituted");
  expect(inputs).not.toMatch(/will be a sell regardless|vice versa/);
});
