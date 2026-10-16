import { expect, test } from "bun:test";
import { RESEARCH_CANDIDATE_ID } from "./candidate.ts";
import { runWorkload, summarizePairedNetReturn } from "./workload.ts";
import type { Epoch, Outcome, PolicyDecision } from "../../src/lab/types.ts";

function fixtureEpoch(id: string, index: number): Epoch {
  return { id, index, t: index, candidates: [], eligibleIds: [], ineligible: [] };
}

function fixtureDecision(epochId: string, policyId: string, choice: string): PolicyDecision {
  return {
    policyId,
    epochId,
    choice,
    probabilities: { [choice]: 1 },
    latencyMs: 0,
    inputTokens: null,
    costUsd: null,
    status: "ok",
    note: null,
  };
}

function completeOutcome(epochId: string, candidateId: string, netReturn: number): Outcome {
  return {
    epochId,
    candidateId,
    entryMs: 1,
    horizonEndMs: 2,
    grossReturn: netReturn,
    fundingReturn: 0,
    costReturn: 0,
    opportunityCost: 0,
    netReturn,
    capitalPerNotional: 1,
    leverage: [],
    complete: true,
    incompleteReason: null,
  };
}

function unknownCostOutcome(epochId: string, candidateId: string): Outcome {
  return {
    epochId,
    candidateId,
    entryMs: null,
    horizonEndMs: 2,
    grossReturn: null,
    fundingReturn: null,
    costReturn: null,
    opportunityCost: null,
    netReturn: null,
    capitalPerNotional: null,
    leverage: [],
    complete: false,
    incompleteReason: "costs-unknown",
  };
}

test("paired net return excludes incomplete epochs on both sides", () => {
  const epochs = ["e1", "e2", "e3", "e4", "e5"].map((id, index) => fixtureEpoch(id, index));
  const decisions = [
    fixtureDecision("e1", RESEARCH_CANDIDATE_ID, "candidate-e1"),
    fixtureDecision("e1", "momentum-rule", "ancestor-e1"),
    fixtureDecision("e2", RESEARCH_CANDIDATE_ID, "candidate-e2"),
    fixtureDecision("e2", "momentum-rule", "ancestor-e2"),
    fixtureDecision("e3", RESEARCH_CANDIDATE_ID, "candidate-e3"),
    fixtureDecision("e3", "momentum-rule", "ancestor-e3"),
    fixtureDecision("e4", RESEARCH_CANDIDATE_ID, "hold"),
    fixtureDecision("e4", "momentum-rule", "hold"),
    fixtureDecision("e5", "momentum-rule", "ancestor-e5"),
  ];
  const outcomes = [
    completeOutcome("e1", "candidate-e1", 0.1),
    completeOutcome("e1", "ancestor-e1", 0.05),
    completeOutcome("e2", "candidate-e2", 0.2),
    unknownCostOutcome("e2", "ancestor-e2"),
    completeOutcome("e3", "ancestor-e3", 0.2),
    completeOutcome("e5", "ancestor-e5", 0.15),
  ];

  const summary = summarizePairedNetReturn({ epochs, decisions, outcomes });

  expect(summary).toEqual({
    meanBps: 250,
    completePairs: 2,
    candidateCompleteEpochs: 3,
    ancestorCompleteEpochs: 4,
    excludedEpochs: 3,
    candidateMeanBps: expect.closeTo(1_000, 10),
    ancestorMeanBps: 1_000,
  });
});

test("wallet stress applies known costs once and keeps missing inputs unknown", async () => {
  const { report } = await runWorkload();
  const result = report as {
    walletStress: {
      endingKnownScenario: {
        markedEquityUsd: number;
        cashUsd: number;
        knownFeesUsd: { networkFeeUsd: number; tradeFeeUsd: number; accountOpenUsd: number; totalUsd: number };
        appliedOrders: number;
        refusedOrders: number;
        partialSell: { remainingQty: number | null };
      };
      unknownCostCase: { unitizedReturnPct: number | null };
      missingMarkCase: { unitizedReturnPct: number | null };
    };
  };
  const wallet = result.walletStress.endingKnownScenario;
  expect(wallet.cashUsd).toBeCloseTo(56.57, 10);
  expect(wallet.markedEquityUsd).toBeCloseTo(122.57, 10);
  expect(wallet.knownFeesUsd.totalUsd).toBeCloseTo(2.43, 10);
  expect(wallet.knownFeesUsd.networkFeeUsd + wallet.knownFeesUsd.tradeFeeUsd + wallet.knownFeesUsd.accountOpenUsd).toBeCloseTo(2.43, 10);
  expect(wallet.appliedOrders).toBe(3);
  expect(wallet.refusedOrders).toBe(1);
  const remainingQty = wallet.partialSell.remainingQty;
  if (remainingQty === null) throw new Error("synthetic partial sell omitted the remaining quantity");
  expect(remainingQty).toBeCloseTo(0.4, 10);
  expect(result.walletStress.unknownCostCase.unitizedReturnPct).toBeNull();
  expect(result.walletStress.missingMarkCase.unitizedReturnPct).toBeNull();
}, 30_000);
