import { describe, expect, test } from "bun:test";
import { CONSENSUS_POLICY, decide, plannedCalls, sanitizeSpec, type DecisionSpec, type Judge, type JudgeQuestion } from "./engine";

const spec = (over: Partial<DecisionSpec> = {}): DecisionSpec => ({
  id: "d1",
  goal: "Make the agent decide faster without raising the risk of the capital.",
  facts: { clockMinutes: 2, skipShare: 0.93, poolLiquidityKnown: true },
  rails: ["Never place an order from here.", "Never turn a skip of the model into a purchase."],
  options: [
    { id: "A", label: "Shorten the clock", what: "Look every minute while the daily capacity pays for it." },
    { id: "B", label: "Record every outcome", what: "Keep the price path of every purchase offered, to learn from it." },
    { id: "C", label: "Force entries", what: "Enter the best candidates whatever the model answered." },
  ],
  unknowns: [
    { id: "quota", ask: "What is the real daily quota of the model on this account?" },
    { id: "latency", ask: "What is the end to end latency from a market event to an order?" },
  ],
  ...over,
});

type Probs = Record<string, number>;
const judge = (answer: (q: JudgeQuestion) => Probs | null, log: JudgeQuestion[] = []): Judge => ({
  async ask(q) {
    log.push(q);
    const p = answer(q);
    return p === null ? null : { probabilities: p };
  },
});
/** A judge that prefers one option with the given strength, finds no rail crossed and no missing fact. */
const prefers = (id: string, strength = 0.8, railOf: Record<string, number> = {}) => (q: JudgeQuestion): Probs => {
  if (q.kind === "pick") {
    const others = q.keys.filter((k) => k !== id);
    return Object.fromEntries(q.keys.map((k) => [k, k === id ? strength : (1 - strength) / others.length]));
  }
  if (q.kind === "rail") {
    const v = railOf[q.optionId ?? ""] ?? 0.05;
    return { violates: v, compatible: 1 - v };
  }
  return Object.fromEntries(q.keys.map((k) => [k, k === "none" ? 1 : 0]));
};

describe("a decision is not taken on one answer: the Jev is asked in rounds until its answers agree, and the code decides whether that is enough", () => {
  test("a judge that prefers one option with no rail crossed reaches consensus, with the leader named", async () => {
    const r = await decide(spec(), judge(prefers("A")));
    expect([r.status, r.leader, r.implement]).toEqual(["consenso", "A", true]);
  });

  test("a single round is not consensus: the same leader must hold in the next round, on the same facts", async () => {
    const r = await decide(spec(), judge(prefers("A")));
    expect(r.rounds.length).toBe(2);
  });

  test("the options are shown in a different order in each framing, so a bias for the first one cannot win", async () => {
    const log: JudgeQuestion[] = [];
    await decide(spec(), judge(prefers("A"), log));
    const firsts = log.filter((q) => q.id.startsWith("pick:r1")).map((q) => q.keys[0]);
    expect(new Set(firsts).size).toBe(CONSENSUS_POLICY.framings);
  });

  test("a judge that always picks the first option shown reaches no consensus", async () => {
    const r = await decide(spec(), judge((q) => (q.kind === "pick" ? Object.fromEntries(q.keys.map((k, i) => [k, i === 0 ? 0.7 : 0.1])) : prefers("A")(q))));
    expect(r.status).toBe("sem_consenso");
  });

  test("an option the judge says crosses a rail is never the consensus, however much it is preferred", async () => {
    const r = await decide(spec(), judge(prefers("C", 0.9, { C: 0.6 })));
    expect([r.status, r.implement]).toEqual(["sem_consenso", false]);
  });

  test("when the judge says that no option fits, there is no consensus", async () => {
    const r = await decide(spec(), judge((q) => (q.kind === "pick" ? Object.fromEntries(q.keys.map((k) => [k, k === "none_fits" ? 0.5 : 0.5 / (q.keys.length - 1)])) : prefers("A")(q))));
    expect(r.status).toBe("sem_consenso");
  });

  test("an option the code forbids is removed before the judge is asked and is listed in the receipt", async () => {
    const log: JudgeQuestion[] = [];
    const r = await decide(spec({ forbidden: ["C"] }), judge(prefers("A"), log));
    expect([r.removedByCode, log.some((q) => q.keys.includes("C"))]).toEqual([["C"], false]);
  });

  test("with fewer than two options left there is nothing to decide", async () => {
    const r = await decide(spec({ forbidden: ["B", "C"] }), judge(prefers("A")));
    expect([r.status, r.implement]).toEqual(["sem_opcoes", false]);
  });

  test("an option that is clearly behind is dropped for the next round, so the rounds narrow", async () => {
    const r = await decide(spec(), judge((q) => (q.kind === "pick" ? Object.fromEntries(q.keys.map((k) => [k, k === "A" || k === "C" ? 0.45 : k === "B" ? 0.04 : 0.06])) : prefers("A")(q))));
    expect(r.rounds[1]!.options).toEqual(["A", "C"]);
  });

  test("without consensus the Jev is asked which missing fact would change the choice, and that question goes to the person", async () => {
    const r = await decide(spec(), judge((q) => (q.kind === "unknown" ? { quota: 0.7, latency: 0.2, none: 0.1 } : q.kind === "pick" ? Object.fromEntries(q.keys.map((k, i) => [k, i === 0 ? 0.7 : 0.1])) : prefers("A")(q))));
    expect(r.askUser).toBe("What is the real daily quota of the model on this account?");
  });

  test("a judge that never answers gives no decision and says why, never a guess", async () => {
    const r = await decide(spec(), judge(() => null));
    expect([r.status, r.leader, r.implement]).toEqual(["juiz_falhou", null, false]);
  });

  test("the receipt counts the questions asked and never exceeds the plan", async () => {
    const r = await decide(spec(), judge(prefers("A")));
    expect(r.calls.asked).toBeLessThanOrEqual(plannedCalls(spec()));
  });

  test("the plan is a bound known before any question is asked: rounds times framings, one rail question per option and the question of the missing fact", () => {
    expect(plannedCalls(spec())).toBe(CONSENSUS_POLICY.rounds * CONSENSUS_POLICY.framings + 3 + 1);
  });

  test("the same decision and the same answers give the same receipt, byte for byte", async () => {
    const a = JSON.stringify(await decide(spec(), judge(prefers("A"))));
    const b = JSON.stringify(await decide(spec(), judge(prefers("A"))));
    expect(a).toBe(b);
  });

  test("the receipt says it is a recommendation of the judge and authorizes nothing", async () => {
    const r = await decide(spec(), judge(prefers("A")));
    expect(r.disclaimer).toContain("does not authorize");
  });
});

describe("what is sent to the Jev is sanitized: no address, key or secret ever leaves", () => {
  test("a wallet address in a fact is refused", () => {
    expect(() => sanitizeSpec(spec({ facts: { wallet: "BCdwQBAn8dYB5YjTsoB6TdHAWokxv28k2oZUodERpump" } }))).toThrow("dado_sensivel");
  });

  test("an EVM address is refused", () => {
    expect(() => sanitizeSpec(spec({ facts: { wallet: "0xb76960373c7309ca1d341bd65d9a78abb2395171" } }))).toThrow("dado_sensivel");
  });

  test("a key assignment in the goal is refused", () => {
    expect(() => sanitizeSpec(spec({ goal: "use TYPESAFE_AI_API_KEY=abc123 to call it" }))).toThrow("dado_sensivel");
  });

  test("an ordinary spec passes", () => {
    expect(() => sanitizeSpec(spec())).not.toThrow();
  });

  test("two options with the same id are refused", () => {
    expect(() => sanitizeSpec(spec({ options: [{ id: "A", label: "x", what: "x" }, { id: "A", label: "y", what: "y" }] }))).toThrow("opcoes_repetidas");
  });
});
