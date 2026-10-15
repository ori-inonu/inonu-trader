import { describe, expect, test } from "bun:test";
import type { JudgeQuestion } from "./engine";
import { createJevJudge, JEV_JUDGE_HARD_MAX_CALLS, type EvaluateFn } from "./jev-judge";

const q = (over: Partial<JudgeQuestion> = {}): JudgeQuestion => ({
  kind: "pick", id: "pick:r1:f0", keys: ["A", "B", "none_fits"], state: { goal: "g", facts: {}, rails: [], options: [] },
  instructions: { question: "which?", goal: "choose", inputs: "state" }, criteria: { A: "a", B: "b", none_fits: "none" }, ...over,
});
const ok = (probs: Record<string, number>, tokens: number | null = 900): EvaluateFn => async (args) => {
  const id = Object.keys(args.questions as Record<string, unknown>)[0]!;
  return { answers: { [id]: { choice: "A", probabilities: probs } }, ...(tokens === null ? {} : { usage: { inputTokens: tokens } }) };
};
const SECRET = "sk-THIS-MUST-NEVER-APPEAR-ANYWHERE-123456";

describe("the Jev is the judge through one narrow Choice question per call, with a hard cap and no guesses", () => {
  test("the question goes to the SDK as a choice keyed by its id, with its state, instructions and criteria, and no retries", async () => {
    let seen: Parameters<EvaluateFn>[0] | null = null;
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 5, model: {}, evaluate: async (a) => ((seen = a), { answers: { "pick:r1:f0": { probabilities: { A: 0.6, B: 0.3, none_fits: 0.1 } } } }) });
    await judge.ask(q());
    expect([Object.keys(seen!.questions as object), (seen!.questions as any)["pick:r1:f0"].type, seen!.maxRetries]).toEqual([["pick:r1:f0"], "choice", 0]);
  });

  test("the probabilities the provider gave come back as the answer", async () => {
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 5, model: {}, evaluate: ok({ A: 0.6, B: 0.3, none_fits: 0.1 }) });
    expect((await judge.ask(q()))!.probabilities).toEqual({ A: 0.6, B: 0.3, none_fits: 0.1 });
  });

  test("past the cap no question is sent: the answer is null and the refusal is counted", async () => {
    let calls = 0;
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 1, model: {}, evaluate: async (a) => (calls++, ok({ A: 1, B: 0, none_fits: 0 })(a)) });
    await judge.ask(q());
    const second = await judge.ask(q());
    expect([second, calls, judge.meter().refusedByCap]).toEqual([null, 1, 1]);
  });

  test("an exception of the provider is a null answer, counted, never thrown", async () => {
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 2, model: {}, evaluate: async () => { throw new Error("provider down"); } });
    expect([await judge.ask(q()), judge.meter().failed]).toEqual([null, 1]);
  });

  test("an answer with no probabilities is null, not a guess", async () => {
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 2, model: {}, evaluate: async () => ({ answers: {} }) });
    expect(await judge.ask(q())).toBeNull();
  });

  test("a call the provider does not report usage for is counted apart, not as zero tokens", async () => {
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 2, model: {}, evaluate: ok({ A: 0.5, B: 0.4, none_fits: 0.1 }, null) });
    await judge.ask(q());
    expect([judge.meter().inputTokens, judge.meter().callsWithoutUsage]).toEqual([0, 1]);
  });

  test("the key is in nothing the judge returns or reports", async () => {
    const judge = createJevJudge({ apiKey: SECRET, maxCalls: 2, model: {}, evaluate: ok({ A: 0.5, B: 0.4, none_fits: 0.1 }) });
    const answer = await judge.ask(q());
    expect(JSON.stringify([answer, judge.meter()])).not.toContain(SECRET);
  });

  test("a cap above the hard maximum, or below one, is refused when the judge is built", () => {
    expect([() => createJevJudge({ apiKey: SECRET, maxCalls: JEV_JUDGE_HARD_MAX_CALLS + 1 }), () => createJevJudge({ apiKey: SECRET, maxCalls: 0 })].map((f) => { try { f(); return "ok"; } catch { return "refused"; } })).toEqual(["refused", "refused"]);
  });
});
