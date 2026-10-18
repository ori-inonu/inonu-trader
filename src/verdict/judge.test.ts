import { describe, expect, test } from "bun:test";
import { ORDER_CHECK_ID, consistencyOf, createInsightBox, orderCheckQuestion, readInsight, type ChoiceQuestion } from "./judge";

const base: ChoiceQuestion = { type: "choice", instructions: { question: "q", goal: "g", inputs: "i" }, criteria: { hold: "wait", "buy:zona:a": "buy it", "sell:zona:a": "sell it" } };

describe("the second asking of the decision question", () => {
  test("is the same question with the options in the opposite order, and nothing else changed", () => {
    const b = orderCheckQuestion(base);
    expect(Object.keys(b.criteria)).toEqual(["sell:zona:a", "buy:zona:a", "hold"]);
    expect(b.instructions).toBe(base.instructions);
    expect(b.type).toBe("choice");
    expect(b.criteria["hold"]).toBe("wait");
    expect(Object.keys(base.criteria)).toEqual(["hold", "buy:zona:a", "sell:zona:a"]); // the original is untouched
    expect(Object.keys(orderCheckQuestion(b).criteria)).toEqual(Object.keys(base.criteria));
  });
});

describe("consistency from the concentration of the probabilities", () => {
  test("worked on paper: three options, (3 x peak - 1) / 2", () => {
    expect(consistencyOf({ hold: 1, "buy:a": 0, "sell:a": 0 }, 3)).toBe(1);
    expect(consistencyOf({ hold: 1 / 3, "buy:a": 1 / 3, "sell:a": 1 / 3 }, 3)).toBeCloseTo(0, 12);
    expect(consistencyOf({ hold: 0.6, "buy:a": 0.3, "sell:a": 0.1 }, 3)).toBeCloseTo(0.4, 12); // (1.8 - 1) / 2
    expect(consistencyOf({ hold: 0.8, "buy:a": 0.15, "sell:a": 0.05 }, 3)).toBeCloseTo(0.7, 12);
  });
  test("probabilities that do not add to one are normalised, and one option listed is not enough", () => {
    expect(consistencyOf({ a: 6, b: 3, c: 1 }, 3)).toBeCloseTo(0.4, 12);
    expect(consistencyOf({ a: 1 }, 1)).toBeNull();
  });
  test("anything that is not usable is null, never a number made up", () => {
    for (const bad of [undefined, null, 3, "x", [], {}, { a: -1, b: 2 }, { a: Number.NaN }, { a: 0, b: 0 }, { a: "1" }]) expect(consistencyOf(bad, 3), JSON.stringify(bad)).toBeNull();
  });
  test("never outside 0 and 1", () => {
    expect(consistencyOf({ a: 1, b: 0 }, 2)).toBe(1);
    expect(consistencyOf({ a: 0.5, b: 0.5 }, 2)).toBe(0);
  });
});

describe("reading the two answers", () => {
  const answers = (a: unknown, b: unknown) => ({ decision: a, [ORDER_CHECK_ID]: b });
  test("both orderings agree and are decided: the consistency is the lower of the two", () => {
    const i = readInsight(answers({ choice: "hold", probabilities: { hold: 0.8, x: 0.1, y: 0.1 } }, { choice: "hold", probabilities: { hold: 0.6, x: 0.3, y: 0.1 } }), 3);
    expect(i).toEqual({ consistency: 0.4, orderingsAgree: true });
  });
  test("the two orderings chose differently: the model leaned on the order", () => {
    const i = readInsight(answers({ choice: "buy:a", probabilities: { "buy:a": 0.5, hold: 0.5 } }, { choice: "hold", probabilities: { "buy:a": 0.4, hold: 0.6 } }), 2);
    expect(i.orderingsAgree).toBe(false);
  });
  test("an answer with no probabilities has no consistency, and a missing second answer has no agreement", () => {
    expect(readInsight(answers({ choice: "hold" }, { choice: "hold" }), 3)).toEqual({ consistency: null, orderingsAgree: true });
    expect(readInsight({ decision: { choice: "hold", probabilities: { hold: 1, a: 0 } } }, 2)).toEqual({ consistency: 1, orderingsAgree: null });
  });
  test("garbage in every shape is two nulls", () => {
    for (const bad of [undefined, null, 3, "x", [], {}, { decision: 3 }, { decision: { choice: 3 } }]) expect(readInsight(bad, 3), JSON.stringify(bad)).toEqual({ consistency: null, orderingsAgree: null });
  });
});

describe("the bench between the call and the card", () => {
  test("what is put under a hash is taken once, and only by that hash", () => {
    let now = 0;
    const box = createInsightBox({ now: () => now });
    box.put("h1", { consistency: 0.5, orderingsAgree: true });
    expect(box.take("other")).toBeNull();
    expect(box.take(null)).toBeNull();
    expect(box.take("h1")).toEqual({ consistency: 0.5, orderingsAgree: true });
    expect(box.take("h1")).toBeNull();
    expect(box.size()).toBe(0);
  });
  test("an entry that waited too long is gone, and the bench never grows past its limit", () => {
    let now = 0;
    const box = createInsightBox({ now: () => now, ttlMs: 1000, max: 3 });
    box.put("old", { consistency: 1, orderingsAgree: true });
    now = 1001;
    expect(box.take("old")).toBeNull();
    for (const h of ["a", "b", "c", "d"]) box.put(h, { consistency: 0.1, orderingsAgree: null });
    expect(box.size()).toBe(3);
    expect(box.take("a")).toBeNull();
    expect(box.take("d")).not.toBeNull();
  });
});
