import { expect, mock, test } from "bun:test";

let evaluatorResult: any;
const evaluatorCalls: unknown[] = [];
mock.module("ai", () => ({
  experimental_evaluate: async (input: unknown) => {
    evaluatorCalls.push(input);
    return evaluatorResult;
  },
}));

const { JevModel } = await import("./model.ts");
const state = { block: 1 } as any;

function result(usage: unknown) {
  return {
    answers: { direction: { choice: "buy", probabilities: { buy: 0.9, sell: 0.1, hold: 0 } } },
    usage,
  };
}

test("Jev adapter preserves missing provider usage as unknown", async () => {
  evaluatorResult = result(undefined);
  const decision = await new JevModel().decide(state);

  expect(evaluatorCalls).toHaveLength(1);
  expect(decision.action).toBe("buy");
  expect(decision.inputTokens).toBeNull();
});

test("Jev adapter preserves malformed provider usage as unknown", async () => {
  evaluatorResult = result({ inputTokens: "not-a-token-count" });
  const decision = await new JevModel().decide(state);

  expect(decision.inputTokens).toBeNull();
});

test("Jev adapter keeps explicitly reported zero usage known", async () => {
  evaluatorResult = result({ inputTokens: 0 });
  const decision = await new JevModel().decide(state);

  expect(decision.inputTokens).toBe(0);
});
