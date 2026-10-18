import { describe, expect, test } from "bun:test";
import type { PaperAsset, PaperCapitalConfig, PaperPlan, PaperReceipt } from "./paper-capital";
import { replayPaperDecisions, type PaperDecisionFrame, type PaperDecisionReplayInput } from "./paper-decision-replay";

const asset: PaperAsset = { chainId: "196", token: "native", decimals: 2, venue: "synthetic" };
const config: PaperCapitalConfig = { asset, initialAtoms: "10000", maxCommittedAtoms: "20000", maxDrawdownAtoms: "10000" };
const plan = (id: string, inputAtoms: string, costBudgetAtoms = "0"): PaperPlan => ({ id, asset: { ...asset }, inputAtoms, costBudgetAtoms });
const receipt = (p: PaperPlan, returnedAtoms: string, externalCostAtoms: string | null = "0"): PaperReceipt => ({ receiptId: `receipt:${p.id}`, planId: p.id, asset: { ...asset }, inputAtoms: p.inputAtoms, returnedAtoms, externalCostAtoms, costsComplete: externalCostAtoms !== null, outcome: "completed" });
const frame = (id: string, atMs: number, p: PaperPlan, fill: PaperReceipt | null): PaperDecisionFrame => ({ id, atMs, model: "jev-fixture", isMock: true, candidates: [p], choice: p.id, receipt: fill });
const input = (frames: PaperDecisionFrame[], over: Partial<PaperDecisionReplayInput> = {}): PaperDecisionReplayInput => ({ origin: "synthetic_fixture", config, frames, ...over });

describe("synthetic_fixture: replay of recorded decisions, never live execution", () => {
  test("settled paper gains become available to the next recorded decision, with exact compound balances", () => {
    const first = plan("p1", "10000");
    const second = plan("p2", "11000");
    const data = input([frame("f1", 1000, first, receipt(first, "11000")), frame("f2", 2000, second, receipt(second, "12100"))]);
    const before = JSON.stringify(data);
    const result = replayPaperDecisions(data);
    expect(result.status).toBe("completed");
    expect(result.steps.map((s) => s.balanceAtoms)).toEqual(["11000", "12100"]);
    expect(result.capital.balanceAtoms).toBe("12100");
    expect(result.capital.realizedNetAtoms).toBe("2100");
    expect(result).toMatchObject({ origin: "synthetic_fixture", mode: "synthetic-paper", execution: "never", strategyQualified: false, financiallyAuthorized: false });
    expect(JSON.stringify(data)).toBe(before);
  });

  test("fees are deducted before later capital is reused; losses are not hidden", () => {
    const first = plan("p1", "500", "5");
    const second = plan("p2", "1000", "50");
    const third = plan("p3", "100", "0");
    const result = replayPaperDecisions(input([
      frame("f1", 1000, first, receipt(first, "555", "5")),
      frame("f2", 2000, second, receipt(second, "1100", "10")),
      frame("f3", 3000, third, receipt(third, "80")),
    ], { config: { ...config, initialAtoms: "1000" } }));
    expect(result.steps.map((s) => s.balanceAtoms)).toEqual(["1050", "1140", "1120"]);
    expect(result.capital.realizedNetAtoms).toBe("120");
  });

  test("hold is a recorded model choice, not a fabricated fill", () => {
    const p = plan("p1", "10");
    const hold: PaperDecisionFrame = { ...frame("f1", 1000, p, null), choice: "hold" };
    const result = replayPaperDecisions(input([hold]));
    expect(result.steps[0]).toMatchObject({ choice: "hold", outcome: "held", model: "jev-fixture", isMock: true });
    expect(result.capital.balanceAtoms).toBe("10000");
    expect(result.capital.plans).toEqual([]);
    expect(result.status).toBe("completed");
  });

  test("missing receipts stop the replay with paper capital still committed, never a zero-cost imaginary fill", () => {
    const p = plan("p1", "100", "5");
    const q = plan("p2", "100");
    const result = replayPaperDecisions(input([frame("f1", 1000, p, null), frame("f2", 2000, q, receipt(q, "200"))]));
    expect(result).toMatchObject({ status: "blocked", reason: "receipt_missing" });
    expect(result.steps).toHaveLength(1);
    expect(result.capital).toMatchObject({ balanceAtoms: "10000", committedAtoms: "105", realizedNetAtoms: "0" });
    expect(result.capital.plans[0]?.status).toBe("inflight");
  });

  test("unknown costs cannot settle and cannot finance a later paper decision", () => {
    const p = plan("p1", "100", "5");
    const q = plan("p2", "100");
    const result = replayPaperDecisions(input([frame("f1", 1000, p, receipt(p, "200", null)), frame("f2", 2000, q, receipt(q, "200"))]));
    expect(result).toMatchObject({ status: "blocked", reason: "settlement_refused" });
    expect(result.capital.stopReason).toBe("unknown_cost");
    expect(result.capital.balanceAtoms).toBe("10000");
    expect(result.steps).toHaveLength(1);
  });

  test("a choice outside the offered candidates never reserves capital", () => {
    const p = plan("p1", "100");
    const result = replayPaperDecisions(input([{ ...frame("f1", 1000, p, receipt(p, "110")), choice: "other" }]));
    expect(result).toMatchObject({ status: "blocked", reason: "choice_invalid" });
    expect(result.capital.plans).toEqual([]);
  });

  test("an unfunded candidate is refused before the decision is applied", () => {
    const p = plan("p1", "10000", "1");
    const result = replayPaperDecisions(input([frame("f1", 1000, p, receipt(p, "11000"))]));
    expect(result).toMatchObject({ status: "blocked", reason: "candidate_invalid" });
    expect(result.capital.plans).toEqual([]);
  });

  test("a hold with an unrelated receipt is refused rather than credited", () => {
    const p = plan("p1", "100");
    const result = replayPaperDecisions(input([{ ...frame("f1", 1000, p, receipt(p, "200")), choice: "hold" }]));
    expect(result).toMatchObject({ status: "blocked", reason: "receipt_unexpected" });
    expect(result.capital.balanceAtoms).toBe("10000");
  });

  test("a receipt for another plan is rejected by the existing capital contract", () => {
    const p = plan("p1", "100");
    const result = replayPaperDecisions(input([frame("f1", 1000, p, { ...receipt(p, "200"), planId: "foreign" })]));
    expect(result).toMatchObject({ status: "blocked", reason: "settlement_refused" });
    expect(result.capital.stopReason).toBe("invalid_receipt");
  });

  test("repeated frames, applied plan IDs and out-of-order observations cannot compound twice", () => {
    const p = plan("p1", "100");
    const f = frame("f1", 1000, p, receipt(p, "110"));
    expect(replayPaperDecisions(input([f, f]))).toMatchObject({ status: "blocked", reason: "frame_invalid" });
    expect(replayPaperDecisions(input([f, { ...f, id: "f2", atMs: 2000 }]))).toMatchObject({ status: "blocked", reason: "candidate_invalid" });
    const q = plan("p2", "100");
    const backwards = replayPaperDecisions(input([f, frame("f2", 999, q, receipt(q, "200"))]));
    expect(backwards).toMatchObject({ status: "blocked", reason: "frame_invalid" });
    expect(backwards.capital.balanceAtoms).toBe("10010");
  });

  test("synthetic decisions cannot masquerade as real Jev calls, and headers cannot grant financial authority", () => {
    const p = plan("p1", "100");
    const data = input([{ ...frame("f1", 1000, p, receipt(p, "110")), isMock: false }]);
    expect(replayPaperDecisions(data)).toMatchObject({ status: "blocked", reason: "frame_invalid" });
    expect(() => replayPaperDecisions({ ...input([]), execution: "live" } as PaperDecisionReplayInput)).toThrow("invalid_paper_replay");
    expect(() => replayPaperDecisions({ ...input([]), origin: "live" } as unknown as PaperDecisionReplayInput)).toThrow("invalid_paper_replay");
  });

  test("captured replay retains model provenance but is still only a simulation", () => {
    const p = plan("p1", "100");
    const result = replayPaperDecisions(input([{ ...frame("f1", 1000, p, receipt(p, "110")), model: "jev-recorded", isMock: false }], { origin: "captured_replay" }));
    expect(result).toMatchObject({ origin: "captured_replay", execution: "never", financiallyAuthorized: false, strategyQualified: false });
    expect(result.steps[0]).toMatchObject({ model: "jev-recorded", isMock: false });
  });

  test("large atomic amounts stay exact and an empty replay invents no decisions", () => {
    const initial = "900719925474099312345";
    const p = plan("p1", "100");
    const out = replayPaperDecisions(input([frame("f1", 1, p, receipt(p, "101"))], { config: { ...config, initialAtoms: initial } }));
    expect(out.capital.balanceAtoms).toBe("900719925474099312346");
    const empty = replayPaperDecisions(input([]));
    expect(empty.steps).toEqual([]);
    expect(empty.capital.balanceAtoms).toBe("10000");
  });

  test("a stopped capital account reports the known loss and does not continue", () => {
    const p = plan("p1", "1000");
    const q = plan("p2", "100");
    const result = replayPaperDecisions(input([frame("f1", 1, p, receipt(p, "900")), frame("f2", 2, q, receipt(q, "200"))], { config: { ...config, initialAtoms: "1000", maxDrawdownAtoms: "100" } }));
    expect(result).toMatchObject({ status: "blocked", reason: "capital_stopped" });
    expect(result.capital).toMatchObject({ balanceAtoms: "900", realizedNetAtoms: "-100", stopReason: "drawdown_limit" });
    expect(result.steps).toHaveLength(1);
  });

  test("untrusted accessors and duplicate candidate IDs are refused without invoking supplied code", () => {
    const p = plan("p1", "100");
    let calls = 0;
    const data = frame("f1", 1, p, receipt(p, "110"));
    Object.defineProperty(data, "choice", { enumerable: true, get() { calls++; return "p1"; } });
    expect(replayPaperDecisions(input([data]))).toMatchObject({ status: "blocked", reason: "frame_invalid" });
    expect(calls).toBe(0);
    const duplicate = { ...frame("f1", 1, p, receipt(p, "110")), candidates: [p, p] };
    expect(replayPaperDecisions(input([duplicate]))).toMatchObject({ status: "blocked", reason: "candidate_invalid" });
  });

  test("the replay import closure has no network, wallet, process runner or inference capability", async () => {
    const replay = await Bun.file(new URL("./paper-decision-replay.ts", import.meta.url)).text();
    const capital = await Bun.file(new URL("./paper-capital.ts", import.meta.url)).text();
    expect([...replay.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1])).toEqual(["./paper-capital"]);
    expect([...capital.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1])).toEqual(["node:crypto"]);
    for (const text of [replay, capital]) expect(text).not.toMatch(/\bfetch\s*\(|Bun\.(?:serve|spawn)|process\.env|child_process|setInterval\s*\(|@ai-sdk|ethers|privateKey/i);
  });
});
