import { expect, test } from "bun:test";
import { syntheticInventory } from "../okx-wallet/portfolio";
import { buildCandidates } from "./candidates";
import { loadOperatorConfig } from "./config";
import { runOperatorCycle, type CycleDeps } from "./cycle";
import { createOperatorLedger, emptyLedger } from "./ledger";
import * as decisionAdapter from "./jev-selector";
import type { OperatorModel } from "./jev-selector";
import type { OperatorDecision } from "./types";

const { decisionFromEvaluation, validateOperatorDecision } = decisionAdapter;

const NOW = 1_760_000_000_000;
const policy = loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy;
const gate = { operatorExecute: false, operatorLiveAck: false, realModel: false, signerAvailable: false };
const inventory = syntheticInventory(NOW);
const candidates = await buildCandidates({ inventory, policy, nowMs: NOW });
const eligible = candidates.filter((candidate) => candidate.kind === "kuru_spot_maker");
const id = eligible[0]!.id;

function validDecision(choice = id): OperatorDecision {
  return { choice, probabilities: { hold: choice === "hold" ? 1 : 0, [id]: choice === id ? 1 : 0 }, confidence: null, latencyMs: 1, inputTokens: 10, model: "local-double" };
}

function deps(model: OperatorModel): CycleDeps {
  return { inventorySource: async () => inventory, model, policy, gate, now: () => NOW, jevUsdPerMTok: 0.1 };
}

function expectBlocked(cycle: Awaited<ReturnType<typeof runOperatorCycle>>, reason: string) {
  expect(cycle.decision).toBeNull();
  expect(cycle.plan).toBeNull();
  expect(cycle.execution).toEqual({ status: "blocked", reasons: [reason], txHash: null, orderId: null });
  expect(cycle.warnings).toContain(reason);
  expect(cycle.inferenceUsd).toBeNull();
}

test("D01 requires the exact own probability keys and rejects malformed decisions", () => {
  for (const probabilities of [
    { hold: 0 }, { hold: 0, [id]: 1, foreign: 0.2 }, [0, 1], null,
    Object.create({ hold: 0, [id]: 1 }), { hold: 0, [id]: NaN },
    { hold: 0, [id]: Infinity }, { hold: 0, [id]: -1 }, { hold: 0, [id]: "1" },
  ]) expect(() => validateOperatorDecision({ ...validDecision(), probabilities } as OperatorDecision, eligible)).toThrow();
  for (const decision of [null, [], {}, { ...validDecision(), choice: "foreign" },
    { ...validDecision(), latencyMs: -1 }, { ...validDecision(), latencyMs: NaN },
    { ...validDecision(), inputTokens: -1 }, { ...validDecision(), inputTokens: 1.5 },
    { ...validDecision(), confidence: 1.01 }, { ...validDecision(), confidence: NaN },
  ]) expect(() => validateOperatorDecision(decision as OperatorDecision, eligible)).toThrow();
  expect(() => validateOperatorDecision({ ...validDecision(), probabilities: { hold: 0.1, [id]: 1 } }, eligible)).toThrow("do not sum to one");
  for (const key of ["hidden", Symbol("hidden")]) {
    const probabilities = { ...validDecision().probabilities };
    Object.defineProperty(probabilities, key, { value: 0, enumerable: false });
    expect(() => validateOperatorDecision({ ...validDecision(), probabilities }, eligible)).toThrow();
  }
});

test("D01 accepted decisions do not retain mutable model probability references", () => {
  const fromModel = validDecision();
  const accepted = validateOperatorDecision(fromModel, eligible);
  fromModel.choice = "hold";
  fromModel.probabilities[id] = 0;
  expect(accepted.choice).toBe(id);
  expect(accepted.probabilities[id]).toBe(1);
});

test("D01 snapshots every decision field once before validating it", () => {
  const expected = validDecision("hold");
  const reads: Record<string, number> = {};
  const response = Object.fromEntries(Object.keys(expected).map((key) => [key, undefined]));
  for (const key of Object.keys(expected) as (keyof OperatorDecision)[]) {
    Object.defineProperty(response, key, { enumerable: true, get() {
      reads[key] = (reads[key] ?? 0) + 1;
      return reads[key] === 1 ? expected[key] : "foreign";
    } });
  }
  const accepted = validateOperatorDecision(response, eligible);
  expect(accepted).toEqual(expected);
  expect(Object.values(reads)).toEqual(Object.keys(expected).map(() => 1));
});

test("D03 rejects the first invalid accessor value without rereading or crashing", async () => {
  let reads = 0;
  const response = validDecision();
  Object.defineProperty(response, "choice", { get() { return ++reads === 1 ? "foreign" : id; } });
  const model: OperatorModel = { name: "local-double", choose: async () => response };
  const cycle = await runOperatorCycle(deps(model));
  expectBlocked(cycle, "decision_invalid");
  expect(reads).toBe(1);
});

test("D02 evaluation conversion never fills absent probabilities with certainty", () => {
  for (const answer of [{ choice: id }, { choice: id, probabilities: { [id]: 1 } },
    { choice: id, probabilities: { hold: 0, [id]: 1, foreign: 0 } }, null]) {
    expect(() => decisionFromEvaluation({ answers: { allocation: answer } }, eligible, 1, "local-double")).toThrow();
  }
  expect(() => decisionFromEvaluation({}, eligible, 1, "local-double")).toThrow();
  const answer = { choice: id, probabilities: { hold: 0, [id]: 1 } };
  for (const usage of [undefined, { inputTokens: -1 }, { inputTokens: 1.5 }, { inputTokens: "10" }]) {
    const result = decisionFromEvaluation({ answers: { allocation: answer }, usage }, eligible, 1, "local-double");
    expect(result.inputTokens).toBeNull();
    expect(result.confidence).toBeNull();
  }
  const valid = decisionFromEvaluation({ answers: { allocation: answer }, usage: { inputTokens: 12 }, providerMetadata: { typesafe: { confidence: { allocation: 0.8 } } } }, eligible, 2, "local-double");
  expect(valid).toMatchObject({ choice: id, inputTokens: 12, confidence: 0.8, latencyMs: 2 });
  expect(() => decisionFromEvaluation({ answers: { allocation: answer }, providerMetadata: { typesafe: { confidence: { allocation: 2 } } } }, eligible, 1, "local-double")).toThrow();
});

test("D03 every model is validated before plan construction or executor access", async () => {
  for (const decision of [null, { ...validDecision(), choice: "foreign" }, { ...validDecision(), probabilities: { hold: 0 } }]) {
    const model: OperatorModel = { name: "local-double", choose: async () => decision as OperatorDecision };
    let executorTouched = false;
    const executor = { ledger: createOperatorLedger(emptyLedger(), () => {}), policy, inventoryAddress: inventory.address, now: () => NOW, slippagePercent: 0.5,
      killSwitchExists: () => false,
      get evmSigner(): never { executorTouched = true; throw new Error("executor must not run"); },
    };
    const cycle = await runOperatorCycle({ ...deps(model), executor });
    expectBlocked(cycle, "decision_invalid");
    expect(executorTouched).toBe(false);
  }
});

test("D04 a rejected model yields a completed blocked cycle without leaking the exception", async () => {
  let calls = 0;
  const model: OperatorModel = { name: "local-double", async choose() { calls++; throw new Error("private-auth-header-SENTINEL"); } };
  const cycle = await runOperatorCycle(deps(model));
  expectBlocked(cycle, "decision_failed");
  expect(cycle.completedAtMs).toBe(NOW);
  expect(JSON.stringify(cycle)).not.toContain("SENTINEL");
  expect(calls).toBe(1);
});

test("D04 a synchronous model throw also completes one blocked cycle", async () => {
  let calls = 0;
  const model: OperatorModel = { name: "local-double", choose() { calls++; throw new Error("sync-private-SENTINEL"); } };
  const cycle = await runOperatorCycle(deps(model));
  expectBlocked(cycle, "decision_failed");
  expect(JSON.stringify(cycle)).not.toContain("SENTINEL");
  expect(calls).toBe(1);
});

test("D05 timeout aborts the signal and ignores a late decision from an uncooperative model", async () => {
  let resolveModel!: (decision: OperatorDecision) => void;
  let signal: AbortSignal | undefined;
  let calls = 0;
  const model: OperatorModel = { name: "local-double", choose(_state, _eligible, options) {
    calls++; signal = options?.signal;
    return new Promise((resolve) => { resolveModel = resolve; });
  } };
  const cycle = await runOperatorCycle({ ...deps(model), decisionTimeoutMs: 5 });
  expectBlocked(cycle, "decision_timeout");
  expect(signal?.aborted).toBe(true);
  const serialized = JSON.stringify(cycle);
  resolveModel(validDecision());
  await Promise.resolve();
  await Promise.resolve();
  expect(JSON.stringify(cycle)).toBe(serialized);
  expect(calls).toBe(1);
});

test("D05 late model rejection is consumed after the deadline", async () => {
  let rejectModel!: (error: Error) => void;
  const model: OperatorModel = { name: "local-double", choose() { return new Promise((_resolve, reject) => { rejectModel = reject; }); } };
  const cycle = await runOperatorCycle({ ...deps(model), decisionTimeoutMs: 5 });
  expectBlocked(cycle, "decision_timeout");
  rejectModel(new Error("late-private-SENTINEL"));
  await new Promise((resolve) => setTimeout(resolve, 1));
  expect(JSON.stringify(cycle)).not.toContain("SENTINEL");
});

test("D05 a response past the deadline cannot beat a delayed event-loop timer", async () => {
  let signal: AbortSignal | undefined;
  const model: OperatorModel = { name: "local-double", async choose(_state, _eligible, options) {
    signal = options?.signal;
    const finish = performance.now() + 10;
    while (performance.now() < finish) { /* Simulate a local synchronous stall. */ }
    return validDecision();
  } };
  const cycle = await runOperatorCycle({ ...deps(model), decisionTimeoutMs: 1 });
  expectBlocked(cycle, "decision_timeout");
  expect(signal?.aborted).toBe(true);
});

test("D05 a subsequent cycle succeeds after timeout and accepted weights stay detached", async () => {
  let calls = 0;
  const answer = validDecision("hold");
  const model: OperatorModel = { name: "local-double", choose() {
    calls++;
    return calls === 1 ? new Promise(() => {}) : Promise.resolve(answer);
  } };
  expectBlocked(await runOperatorCycle({ ...deps(model), decisionTimeoutMs: 5 }), "decision_timeout");
  const recovered = await runOperatorCycle({ ...deps(model), decisionTimeoutMs: 30_000 });
  expect(recovered.execution.reasons).toEqual(["jev_chose_hold"]);
  answer.choice = id;
  answer.probabilities.hold = 0;
  expect(recovered.decision?.choice).toBe("hold");
  expect(recovered.decision?.probabilities.hold).toBe(1);
  expect(calls).toBe(2);
});

test("D05 invalid decision deadline is rejected before inventory or model calls", async () => {
  let reads = 0;
  const model: OperatorModel = { name: "local-double", async choose() { throw new Error("must not call model"); } };
  for (const decisionTimeoutMs of [0, -1, 30_001, 1.5, NaN, Infinity, null, "5"]) {
    await expect(runOperatorCycle({ ...deps(model), inventorySource: async () => { reads++; return inventory; }, decisionTimeoutMs: decisionTimeoutMs as number })).rejects.toThrow("Invalid decision timeout");
  }
  expect(reads).toBe(0);
});

test("D06 holds, valid simulated plans, unknown costs and subsequent cycles retain their meanings", async () => {
  let calls = 0;
  const model: OperatorModel = { name: "local-double", async choose() { calls++; if (calls === 1) throw new Error("offline"); return validDecision("hold"); } };
  expectBlocked(await runOperatorCycle(deps(model)), "decision_failed");
  const held = await runOperatorCycle(deps(model));
  expect(held.decision?.choice).toBe("hold");
  expect(held.execution.reasons).toEqual(["jev_chose_hold"]);
  expect(held.inferenceUsd).toBeCloseTo(0.000001);
  const validModel: OperatorModel = { name: "local-double", choose: async () => validDecision() };
  const planned = await runOperatorCycle({ ...deps(validModel), jevUsdPerMTok: null });
  expect(planned.plan?.executionQualification).toBe("qualified_dry_run");
  expect(planned.execution.status).toBe("dry_run");
  expect(planned.inferenceUsd).toBeNull();
  const unknownUsage = await runOperatorCycle(deps({ name: "local-double", choose: async () => ({ ...validDecision(), inputTokens: null }) }));
  expect(unknownUsage.inferenceUsd).toBeNull();
  const quiet = await runOperatorCycle({ ...deps(model), inventorySource: async () => ({ ...inventory, chains: inventory.chains.filter((chain) => chain.chainIndex === "501") }) });
  expect(quiet.decision).toBeNull();
  expect(quiet.execution.reasons).toEqual(["no_eligible_candidate"]);
  expect(quiet.inferenceUsd).toBe(0);
  expect(calls).toBe(2);
});
