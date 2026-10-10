import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { PaperCapital, type PaperAsset, type PaperPlan, type PaperReceipt } from "./paper-capital";

const asset: PaperAsset = { chainId: "196", token: "native", decimals: 18, venue: "synthetic" };
const makeAccount = (initialAtoms = "1000", maxCommittedAtoms = initialAtoms) => new PaperCapital({
  asset,
  initialAtoms,
  maxCommittedAtoms,
  maxDrawdownAtoms: "1000",
});
const plan = (id: string, inputAtoms = "100", costBudgetAtoms = "5"): PaperPlan => ({
  id,
  asset: { ...asset },
  inputAtoms,
  costBudgetAtoms,
});

test("constructs an isolated synthetic paper capital account", () => {
  const initialAtoms = "900719925474099312345";
  const account = new PaperCapital({
    asset: { chainId: "196", token: "native", decimals: 18, venue: "synthetic" },
    initialAtoms,
    maxCommittedAtoms: initialAtoms,
    maxDrawdownAtoms: "1000",
  });

  const snapshot = account.snapshot();
  expect(snapshot.balanceAtoms).toBe(initialAtoms);
  expect(snapshot.availableAtoms).toBe(initialAtoms);
  expect(snapshot.mode).toBe("synthetic-paper");
  expect(snapshot.strategyQualified).toBe(false);
  expect(snapshot.financiallyAuthorized).toBe(false);
});

test("reserves principal plus budget and enforces available and total commitment caps", () => {
  const account = makeAccount("1000", "150");
  const first = account.reserve(plan("one", "100", "5"));
  expect(first.committedAtoms).toBe("105");
  expect(first.availableAtoms).toBe("895");
  expect(first.plans).toEqual([{ ...plan("one"), status: "reserved" }]);

  account.reserve(plan("two", "40", "5"));
  expect(account.snapshot().committedAtoms).toBe("150");
  const before = account.snapshot();
  expect(() => account.reserve(plan("three", "1", "0"))).toThrow();
  expect(account.snapshot()).toEqual(before);
});

test("starts and cancels only valid lifecycle states and makes identical plan IDs idempotent", () => {
  const account = makeAccount();
  const samePlan = plan("cycle");
  account.reserve(samePlan);
  const firstReservation = account.snapshot();
  expect(account.reserve({ ...samePlan, asset: { ...samePlan.asset } })).toEqual(firstReservation);

  account.start("cycle");
  expect(account.start("cycle").plans[0]?.status).toBe("inflight");
  expect(() => account.cancel("cycle")).toThrow();
  expect(() => account.start("missing")).toThrow();
  expect(() => account.cancel("missing")).toThrow();

  const other = makeAccount();
  other.reserve(plan("cancelled"));
  expect(other.cancel("cancelled").committedAtoms).toBe("0");
  expect(other.cancel("cancelled").plans[0]?.status).toBe("cancelled");
  expect(() => other.start("cancelled")).toThrow();
});

test("latches plan conflicts and blocks new reservations and starts", () => {
  const account = makeAccount();
  account.reserve(plan("same"));
  expect(() => account.reserve(plan("same", "101", "5"))).toThrow();
  expect(account.snapshot().stopReason).toBe("plan_conflict");
  expect(() => account.reserve(plan("new"))).toThrow();
  expect(() => account.start("same")).toThrow();
});

test("rejects noncanonical money, mismatched assets, malformed records and hostile accessors without mutation", () => {
  const account = makeAccount();
  const before = account.snapshot();
  for (const invalid of ["01", "+1", "1.0", "1e2", 1, -1, "-1"]) {
    expect(() => account.reserve(plan("bad-money", invalid as string, "0"))).toThrow();
  }
  expect(() => account.reserve({ ...plan("bad-chain"), asset: { ...asset, chainId: "0196" } })).toThrow();
  expect(() => account.reserve({ ...plan("bad-token"), asset: { ...asset, token: "0xABCDEF" } })).toThrow();
  expect(() => account.reserve({ ...plan("bad-decimals"), asset: { ...asset, decimals: 37 } })).toThrow();
  expect(() => account.reserve({ ...plan("bad-venue"), asset: { ...asset, venue: " other" } })).toThrow();
  expect(() => account.reserve({ ...plan("wrong-asset"), asset: { ...asset, chainId: "1" } })).toThrow();

  let getterReads = 0;
  const accessorPlan = Object.defineProperties({}, {
    id: { enumerable: true, get() { getterReads += 1; return "hostile"; } },
    asset: { enumerable: true, value: asset },
    inputAtoms: { enumerable: true, value: "1" },
    costBudgetAtoms: { enumerable: true, value: "0" },
  });
  expect(() => account.reserve(accessorPlan as PaperPlan)).toThrow();
  expect(getterReads).toBe(0);

  const symbolPlan = { ...plan("symbol") } as PaperPlan & { [key: symbol]: unknown };
  symbolPlan[Symbol("hidden")] = "x";
  expect(() => account.reserve(symbolPlan)).toThrow();
  const extraPlan = { ...plan("extra"), extra: true };
  expect(() => account.reserve(extraPlan as PaperPlan)).toThrow();
  const nonenumerablePlan = plan("hidden");
  Object.defineProperty(nonenumerablePlan, "extra", { value: true });
  expect(() => account.reserve(nonenumerablePlan)).toThrow();
  expect(account.snapshot()).toEqual(before);
});

test("copies constructor, plan, snapshot and returned plan data", () => {
  const sourceAsset = { ...asset };
  const account = makeAccount();
  const sourcePlan = plan("copy");
  account.reserve(sourcePlan);
  sourcePlan.asset.venue = "changed";
  sourceAsset.venue = "changed";
  const first = account.snapshot();
  first.asset.venue = "mutated";
  first.plans[0]!.asset.venue = "mutated";
  expect(account.snapshot().asset.venue).toBe("synthetic");
  expect(account.snapshot().plans[0]?.asset.venue).toBe("synthetic");
});

const receipt = (receiptId: string, planId: string, inputAtoms: string, returnedAtoms: string, externalCostAtoms: string | null, outcome: "completed" | "reverted" = "completed"): PaperReceipt => ({
  receiptId,
  planId,
  asset: { ...asset },
  inputAtoms,
  returnedAtoms,
  externalCostAtoms,
  costsComplete: true,
  outcome,
});

test("books complete net costs once, then latches cost overrun after settlement", () => {
  const account = makeAccount("1000", "1000");
  account.reserve(plan("loss", "100", "5"));
  account.start("loss");
  const result = account.settle(receipt("loss-receipt", "loss", "100", "100", "10"));
  expect(result.balanceAtoms).toBe("990");
  expect(result.realizedNetAtoms).toBe("-10");
  expect(result.stopReason).toBe("cost_overrun");
  expect(result.plans[0]?.status).toBe("settled");
  expect(account.settle(receipt("loss-receipt", "loss", "100", "100", "10"))).toEqual(result);
});

test("books reverted external costs, rejects a reverted partial principal return, and reinvests settled gains", () => {
  const reverted = makeAccount("1000", "2000");
  reverted.reserve(plan("reverted", "100", "3"));
  reverted.start("reverted");
  expect(reverted.settle(receipt("reverted-r", "reverted", "100", "100", "3", "reverted")).balanceAtoms).toBe("997");

  const partial = makeAccount();
  partial.reserve(plan("partial", "100", "5"));
  partial.start("partial");
  expect(() => partial.settle(receipt("partial-r", "partial", "100", "99", "1", "reverted"))).toThrow();
  expect(partial.snapshot().stopReason).toBe("invalid_receipt");
  expect(partial.snapshot().balanceAtoms).toBe("1000");

  const gain = makeAccount("1000", "2000");
  gain.reserve(plan("gain", "100", "5"));
  gain.start("gain");
  expect(gain.settle(receipt("gain-r", "gain", "100", "140", "5")).balanceAtoms).toBe("1035");
  expect(gain.reserve(plan("reinvest", "1035", "0")).availableAtoms).toBe("0");
});

test("rejects an unfunded receipt atomically and accepts a corrected receipt while stopped", () => {
  const account = makeAccount("100", "100");
  account.reserve(plan("all", "100", "0"));
  account.start("all");
  expect(() => account.settle(receipt("r", "all", "100", "0", "1"))).toThrow();
  const held = account.snapshot();
  expect(held.balanceAtoms).toBe("100");
  expect(held.committedAtoms).toBe("100");
  expect(held.plans[0]?.status).toBe("inflight");
  expect(held.stopReason).toBe("unfunded_receipt");

  const corrected = account.settle(receipt("r", "all", "100", "100", "0"));
  expect(corrected.balanceAtoms).toBe("100");
  expect(corrected.committedAtoms).toBe("0");
  expect(corrected.stopReason).toBe("unfunded_receipt");
  expect(account.settle(receipt("r", "all", "100", "100", "0"))).toEqual(corrected);
});

test("preserves other reservations through known losses and tracks cash drawdown from peak", () => {
  const overrun = new PaperCapital({ asset, initialAtoms: "1000", maxCommittedAtoms: "1000", maxDrawdownAtoms: "10000" });
  overrun.reserve(plan("A", "100", "0"));
  overrun.reserve(plan("B", "900", "0"));
  overrun.start("A");
  const state = overrun.settle(receipt("A-r", "A", "100", "0", "10"));
  expect(state.balanceAtoms).toBe("890");
  expect(state.committedAtoms).toBe("900");
  expect(state.availableAtoms).toBe("0");
  expect(state.deficitAtoms).toBe("10");
  expect(state.stopReason).toBe("cost_overrun");
  expect(state.plans[1]?.status).toBe("reserved");

  const drawdown = new PaperCapital({ asset, initialAtoms: "1000", maxCommittedAtoms: "2000", maxDrawdownAtoms: "50" });
  drawdown.reserve(plan("rise", "100", "5"));
  drawdown.start("rise");
  drawdown.settle(receipt("rise-r", "rise", "100", "205", "5"));
  drawdown.reserve(plan("fall", "100", "5"));
  drawdown.start("fall");
  const fallen = drawdown.settle(receipt("fall-r", "fall", "100", "45", "5"));
  expect(fallen.peakBalanceAtoms).toBe("1100");
  expect(fallen.balanceAtoms).toBe("1040");
  expect(fallen.maxObservedDrawdownAtoms).toBe("60");
  expect(fallen.stopReason).toBe("drawdown_limit");
});

test("classifies unknown costs, preserves the inflight hold, then reconciles a corrected receipt ID", () => {
  const unknownAmount = makeAccount();
  unknownAmount.reserve(plan("unknown-cost"));
  unknownAmount.start("unknown-cost");
  expect(() => unknownAmount.settle(receipt("unknown-r", "unknown-cost", "100", "100", null))).toThrow();
  expect(unknownAmount.snapshot().stopReason).toBe("unknown_cost");
  expect(unknownAmount.snapshot().committedAtoms).toBe("105");
  expect(unknownAmount.settle(receipt("unknown-r", "unknown-cost", "100", "100", "0")).committedAtoms).toBe("0");
  expect(unknownAmount.snapshot().stopReason).toBe("unknown_cost");

  const incomplete = makeAccount();
  incomplete.reserve(plan("incomplete"));
  incomplete.start("incomplete");
  expect(() => incomplete.settle({ ...receipt("incomplete-r", "incomplete", "100", "100", "0"), costsComplete: false })).toThrow();
  expect(incomplete.snapshot().stopReason).toBe("unknown_cost");
  expect(incomplete.settle(receipt("incomplete-r", "incomplete", "100", "100", "0")).plans[0]?.status).toBe("settled");
});

test("rejects malformed receipts before status checks and lets corrected receipts reconcile", () => {
  const account = makeAccount();
  account.reserve(plan("shape"));
  account.start("shape");
  const correct = receipt("shape-r", "shape", "100", "100", "0");
  const missing = { ...correct } as Record<string, unknown>;
  delete missing.costsComplete;
  expect(() => account.settle(missing as unknown as PaperReceipt)).toThrow();
  expect(account.snapshot().stopReason).toBe("invalid_receipt");
  expect(account.snapshot().balanceAtoms).toBe("1000");
  expect(account.settle(correct).plans[0]?.status).toBe("settled");
  expect(account.snapshot().stopReason).toBe("invalid_receipt");

  const extraAccount = makeAccount();
  extraAccount.reserve(plan("extra-shape"));
  extraAccount.start("extra-shape");
  expect(() => extraAccount.settle({ ...receipt("extra-r", "extra-shape", "100", "100", "0"), unexpected: 1 } as PaperReceipt)).toThrow();
  expect(extraAccount.snapshot().stopReason).toBe("invalid_receipt");
});

test("replays successful receipt IDs idempotently across key reordering and conflicts on changed known IDs", () => {
  const account = makeAccount();
  account.reserve(plan("replay"));
  account.start("replay");
  const original = receipt("replay-r", "replay", "100", "100", "0");
  const settled = account.settle(original);
  const reordered = {
    outcome: "completed",
    costsComplete: true,
    externalCostAtoms: "0",
    returnedAtoms: "100",
    inputAtoms: "100",
    asset: { venue: "synthetic", decimals: 18, token: "native", chainId: "196" },
    planId: "replay",
    receiptId: "replay-r",
  } as PaperReceipt;
  expect(account.settle(reordered)).toEqual(settled);
  expect(() => account.settle({ ...original, returnedAtoms: "101" })).toThrow();
  expect(account.snapshot().stopReason).toBe("receipt_conflict");
  expect(account.snapshot().balanceAtoms).toBe("1000");
  expect(() => account.settle({ ...original, unexpected: true } as PaperReceipt)).toThrow();
  expect(account.snapshot().stopReason).toBe("receipt_conflict");
});

test("classifies new IDs against settled, unknown, reserved and cancelled plans by status", () => {
  const settled = makeAccount();
  settled.reserve(plan("settled-status"));
  settled.start("settled-status");
  settled.settle(receipt("settled-first", "settled-status", "100", "100", "0"));
  expect(() => settled.settle({ ...receipt("settled-new", "settled-status", "101", "100", null), asset: { ...asset, chainId: "1" } })).toThrow();
  expect(settled.snapshot().stopReason).toBe("receipt_conflict");

  const malformedSettled = makeAccount();
  malformedSettled.reserve(plan("malformed-settled"));
  malformedSettled.start("malformed-settled");
  malformedSettled.settle(receipt("malformed-first", "malformed-settled", "100", "100", "0"));
  expect(() => malformedSettled.settle({ ...receipt("malformed-new", "malformed-settled", "100", "100", "0"), costsComplete: "true" } as unknown as PaperReceipt)).toThrow();
  expect(malformedSettled.snapshot().stopReason).toBe("invalid_receipt");

  const unknown = makeAccount();
  expect(() => unknown.settle(receipt("unknown-plan-r", "missing", "100", "100", "0"))).toThrow();
  expect(unknown.snapshot().stopReason).toBe("invalid_receipt");
  const reserved = makeAccount();
  reserved.reserve(plan("reserved"));
  expect(() => reserved.settle(receipt("reserved-r", "reserved", "100", "100", "0"))).toThrow();
  expect(reserved.snapshot().stopReason).toBe("invalid_receipt");
  const cancelled = makeAccount();
  cancelled.reserve(plan("cancelled"));
  cancelled.cancel("cancelled");
  expect(() => cancelled.settle(receipt("cancelled-r", "cancelled", "100", "100", "0"))).toThrow();
  expect(cancelled.snapshot().stopReason).toBe("invalid_receipt");
});

test("treats malformed payloads for a recognized successful receipt ID as a receipt conflict", () => {
  const account = makeAccount();
  account.reserve(plan("malformed-known"));
  account.start("malformed-known");
  const successful = receipt("known-id", "malformed-known", "100", "100", "0");
  account.settle(successful);
  expect(() => account.settle({ ...successful, extra: true } as PaperReceipt)).toThrow();
  expect(account.snapshot().stopReason).toBe("receipt_conflict");
  expect(account.snapshot().balanceAtoms).toBe("1000");
});

type CheckpointLike = {
  version: unknown;
  mode: unknown;
  strategyQualified: unknown;
  financiallyAuthorized: unknown;
  config: unknown;
  events: unknown;
  sha256: unknown;
  [key: string]: unknown;
};

function cloneCheckpoint(account: PaperCapital): CheckpointLike {
  return JSON.parse(JSON.stringify(account.checkpoint())) as CheckpointLike;
}

function rehash(checkpoint: CheckpointLike): CheckpointLike {
  const body = {
    version: checkpoint.version,
    mode: checkpoint.mode,
    strategyQualified: checkpoint.strategyQualified,
    financiallyAuthorized: checkpoint.financiallyAuthorized,
    config: checkpoint.config,
    events: checkpoint.events,
  };
  const json = JSON.stringify(body);
  if (json === undefined) throw new Error("Cannot checksum fixture");
  return { ...checkpoint, sha256: createHash("sha256").update(json).digest("hex") };
}

test("roundtrips canonical accounting and successful receipt idempotency through JSON checkpoints", () => {
  const account = makeAccount("1000", "2000");
  account.reserve(plan("roundtrip", "100", "5"));
  account.start("roundtrip");
  const settled = account.settle(receipt("roundtrip-r", "roundtrip", "100", "140", "5"));
  const checkpoint = cloneCheckpoint(account);
  const restored = PaperCapital.restore(JSON.parse(JSON.stringify(checkpoint)));
  expect(restored.snapshot()).toEqual(settled);
  expect(restored.settle(receipt("roundtrip-r", "roundtrip", "100", "140", "5"))).toEqual(settled);
  expect(restored.checkpoint().events).toEqual(account.checkpoint().events);
});

test("journals only successful operations and records rejected-call stops once", () => {
  const overrun = makeAccount("1000", "1000");
  overrun.reserve(plan("overrun-journal", "100", "5"));
  overrun.start("overrun-journal");
  overrun.settle(receipt("overrun-r", "overrun-journal", "100", "100", "10"));
  expect(overrun.checkpoint().events.map((event) => event.type)).toEqual(["reserve", "start", "settle"]);

  const corrected = makeAccount();
  corrected.reserve(plan("corrected-journal"));
  corrected.start("corrected-journal");
  expect(() => corrected.settle({ ...receipt("corrected-r", "corrected-journal", "100", "100", "0"), costsComplete: "true" } as unknown as PaperReceipt)).toThrow();
  corrected.settle(receipt("corrected-r", "corrected-journal", "100", "100", "0"));
  expect(corrected.checkpoint().events.map((event) => event.type)).toEqual(["reserve", "start", "stop", "settle"]);
  expect(corrected.checkpoint().events[2]).toEqual({ type: "stop", reason: "invalid_receipt" });
});

test("replays multiple historical starts before requiring all pending plans to reconcile", () => {
  const account = makeAccount("1000", "1000");
  account.reserve(plan("pending-A"));
  account.reserve(plan("pending-B", "200", "0"));
  account.reserve(plan("reserved-C", "50", "0"));
  account.start("pending-A");
  account.start("pending-B");
  const restored = PaperCapital.restore(cloneCheckpoint(account));
  expect(restored.snapshot().recoveryRequired).toBe(true);
  expect(() => restored.reserve(plan("new-work", "1", "0"))).toThrow();
  expect(() => restored.start("reserved-C")).toThrow();

  expect(restored.settle(receipt("pending-A-r", "pending-A", "100", "100", "0")).recoveryRequired).toBe(true);
  expect(() => restored.reserve(plan("still-blocked", "1", "0"))).toThrow();
  const afterBoth = restored.settle(receipt("pending-B-r", "pending-B", "200", "200", "0"));
  expect(afterBoth.recoveryRequired).toBe(false);
  expect(restored.start("reserved-C").plans[2]?.status).toBe("inflight");

  const reservedOnly = makeAccount();
  reservedOnly.reserve(plan("reserved-only"));
  const afterRestart = PaperCapital.restore(cloneCheckpoint(reservedOnly));
  expect(afterRestart.snapshot().recoveryRequired).toBe(false);
  expect(afterRestart.start("reserved-only").plans[0]?.status).toBe("inflight");
});

test("rejects checksummed but semantically invalid checkpoint journals", () => {
  const base = makeAccount();
  base.reserve(plan("base-event"));
  const original = cloneCheckpoint(base);

  const extra = { ...original, extra: true };
  expect(() => PaperCapital.restore(rehash(extra))).toThrow();

  const unknownTag = cloneCheckpoint(base);
  (unknownTag.events as unknown[]).push({ type: "unknown" });
  expect(() => PaperCapital.restore(rehash(unknownTag))).toThrow();

  const duplicateNoop = cloneCheckpoint(base);
  (duplicateNoop.events as unknown[]).push((duplicateNoop.events as unknown[])[0]);
  expect(() => PaperCapital.restore(rehash(duplicateNoop))).toThrow();

  const stopped = makeAccount();
  stopped.reserve(plan("stopped"));
  stopped.start("stopped");
  expect(() => stopped.settle({ ...receipt("bad-r", "stopped", "100", "100", "0"), costsComplete: false })).toThrow();
  const blockedReserve = cloneCheckpoint(stopped);
  (blockedReserve.events as unknown[]).push({ type: "reserve", plan: plan("after-stop", "1", "0") });
  expect(() => PaperCapital.restore(rehash(blockedReserve))).toThrow();

  const overrun = makeAccount("1000", "1000");
  overrun.reserve(plan("derived-stop", "100", "5"));
  overrun.start("derived-stop");
  overrun.settle(receipt("derived-r", "derived-stop", "100", "100", "10"));
  const derivedStop = cloneCheckpoint(overrun);
  (derivedStop.events as unknown[]).push({ type: "stop", reason: "cost_overrun" });
  expect(() => PaperCapital.restore(rehash(derivedStop))).toThrow();

  const negative = new PaperCapital({ asset, initialAtoms: "100", maxCommittedAtoms: "100", maxDrawdownAtoms: "100" });
  const impossible = cloneCheckpoint(negative);
  (impossible.events as unknown[]).push({ type: "reserve", plan: plan("negative", "100", "0") });
  (impossible.events as unknown[]).push({ type: "start", planId: "negative" });
  (impossible.events as unknown[]).push({ type: "settle", receipt: receipt("negative-r", "negative", "100", "0", "1") });
  expect(() => PaperCapital.restore(rehash(impossible))).toThrow();
});

test("accepts reordered valid nested checkpoint keys after checksum recomputation", () => {
  const account = makeAccount("1000", "2000");
  account.reserve(plan("reorder", "100", "5"));
  account.start("reorder");
  const finalReceipt = receipt("reorder-r", "reorder", "100", "140", "5");
  const settled = account.settle(finalReceipt);
  const original = cloneCheckpoint(account);
  const originalEvents = original.events as Record<string, unknown>[];
  const reorderedEvents = originalEvents.map((event) => {
    if (event.type === "reserve") {
      const source = event.plan as Record<string, unknown>;
      const sourceAsset = source.asset as Record<string, unknown>;
      return { plan: { costBudgetAtoms: source.costBudgetAtoms, inputAtoms: source.inputAtoms, asset: { venue: sourceAsset.venue, decimals: sourceAsset.decimals, token: sourceAsset.token, chainId: sourceAsset.chainId }, id: source.id }, type: "reserve" };
    }
    if (event.type === "settle") {
      const source = event.receipt as Record<string, unknown>;
      const sourceAsset = source.asset as Record<string, unknown>;
      return { receipt: { outcome: source.outcome, costsComplete: source.costsComplete, externalCostAtoms: source.externalCostAtoms, returnedAtoms: source.returnedAtoms, inputAtoms: source.inputAtoms, asset: { venue: sourceAsset.venue, decimals: sourceAsset.decimals, token: sourceAsset.token, chainId: sourceAsset.chainId }, planId: source.planId, receiptId: source.receiptId }, type: "settle" };
    }
    return { planId: event.planId, type: event.type };
  });
  const sourceConfig = original.config as Record<string, unknown>;
  const sourceAsset = sourceConfig.asset as Record<string, unknown>;
  const reordered = rehash({
    ...original,
    config: { maxDrawdownAtoms: sourceConfig.maxDrawdownAtoms, maxCommittedAtoms: sourceConfig.maxCommittedAtoms, initialAtoms: sourceConfig.initialAtoms, asset: { venue: sourceAsset.venue, decimals: sourceAsset.decimals, token: sourceAsset.token, chainId: sourceAsset.chainId } },
    events: reorderedEvents,
  });
  const restored = PaperCapital.restore(reordered);
  expect(restored.snapshot()).toEqual(settled);
  expect(restored.settle(finalReceipt)).toEqual(settled);
});

test("rejects sparse arrays, accessors, cycles, undefined, bigint, classes and nonfinite checkpoint values", () => {
  const empty = makeAccount();
  const sparse = cloneCheckpoint(empty);
  sparse.events = new Array(1);
  expect(() => PaperCapital.restore(rehash(sparse))).toThrow();

  const withEvent = makeAccount();
  withEvent.reserve(plan("hostile-event"));
  const accessor = cloneCheckpoint(withEvent);
  let getterReads = 0;
  const firstEvent = (accessor.events as Record<string, unknown>[])[0]!;
  Object.defineProperty(firstEvent, "type", { enumerable: true, get() { getterReads += 1; return "reserve"; } });
  expect(() => PaperCapital.restore(accessor)).toThrow();
  expect(getterReads).toBe(0);

  const cyclic = cloneCheckpoint(empty);
  (cyclic.config as Record<string, unknown>).loop = cyclic;
  expect(() => PaperCapital.restore(cyclic)).toThrow();
  const undefinedValue = cloneCheckpoint(withEvent);
  (undefinedValue.config as Record<string, unknown>).extra = undefined;
  expect(() => PaperCapital.restore(undefinedValue)).toThrow();
  const big = cloneCheckpoint(withEvent);
  (big.config as Record<string, unknown>).extra = 1n;
  expect(() => PaperCapital.restore(big)).toThrow();
  class CustomConfig { asset = asset; initialAtoms = "1000"; maxCommittedAtoms = "1000"; maxDrawdownAtoms = "1000"; }
  const classValue = cloneCheckpoint(empty);
  classValue.config = new CustomConfig();
  expect(() => PaperCapital.restore(classValue)).toThrow();
  const nonfinite = cloneCheckpoint(empty);
  ((nonfinite.config as Record<string, unknown>).asset as Record<string, unknown>).decimals = Number.POSITIVE_INFINITY;
  expect(() => PaperCapital.restore(nonfinite)).toThrow();
});

test("keeps exact cash invariants across a deterministic reserve, cancel, settlement and replay sequence", () => {
  const initial = 1000n;
  const account = makeAccount("1000", "1600");
  let expectedBalance = initial;

  const verify = (current: PaperCapital) => {
    const snapshot = current.snapshot();
    const balance = BigInt(snapshot.balanceAtoms);
    const committed = BigInt(snapshot.committedAtoms);
    expect(balance - initial).toBe(BigInt(snapshot.realizedNetAtoms));
    expect(BigInt(snapshot.availableAtoms)).toBe(balance > committed ? balance - committed : 0n);
    expect(BigInt(snapshot.deficitAtoms)).toBe(committed > balance ? committed - balance : 0n);
    expect(balance).toBe(expectedBalance);
    return snapshot;
  };

  verify(account);
  account.reserve(plan("sequence-a", "100", "5"));
  expect(verify(account).committedAtoms).toBe("105");
  account.reserve(plan("sequence-b", "200", "10"));
  expect(verify(account).committedAtoms).toBe("315");
  account.cancel("sequence-b");
  expect(verify(account).committedAtoms).toBe("105");

  account.start("sequence-a");
  verify(account);
  account.settle(receipt("sequence-r1", "sequence-a", "100", "140", "5"));
  expectedBalance += 35n;
  verify(account);

  let recovered = PaperCapital.restore(JSON.parse(JSON.stringify(account.checkpoint())));
  expect(verify(recovered)).toEqual(verify(account));
  recovered.reserve(plan("sequence-c", "300", "20"));
  verify(recovered);
  recovered.start("sequence-c");
  verify(recovered);
  recovered.settle(receipt("sequence-r2", "sequence-c", "300", "250", "3"));
  expectedBalance -= 53n;
  const finalSnapshot = verify(recovered);
  expect(finalSnapshot.balanceAtoms).toBe("982");
  expect(finalSnapshot.realizedNetAtoms).toBe("-18");
  expect(finalSnapshot.peakBalanceAtoms).toBe("1035");
  expect(finalSnapshot.maxObservedDrawdownAtoms).toBe("53");

  const replayed = PaperCapital.restore(JSON.parse(JSON.stringify(recovered.checkpoint())));
  expect(verify(replayed)).toEqual(finalSnapshot);
});

test("treats identical reservations as no-ops after cancellation and settlement", () => {
  const cancelled = makeAccount();
  const cancelledPlan = plan("reserve-after-cancel");
  cancelled.reserve(cancelledPlan);
  cancelled.cancel(cancelledPlan.id);
  const cancelledSnapshot = cancelled.snapshot();
  const cancelledCheckpoint = cancelled.checkpoint();
  expect(cancelled.reserve(cancelledPlan)).toEqual(cancelledSnapshot);
  expect(cancelled.snapshot()).toEqual(cancelledSnapshot);
  expect(cancelled.checkpoint()).toEqual(cancelledCheckpoint);

  const settled = makeAccount();
  const settledPlan = plan("reserve-after-settle");
  settled.reserve(settledPlan);
  settled.start(settledPlan.id);
  settled.settle(receipt("reserve-after-settle-r", settledPlan.id, "100", "100", "0"));
  const settledSnapshot = settled.snapshot();
  const settledCheckpoint = settled.checkpoint();
  expect(settled.reserve(settledPlan)).toEqual(settledSnapshot);
  expect(settled.snapshot()).toEqual(settledSnapshot);
  expect(settled.checkpoint()).toEqual(settledCheckpoint);
});

test("rejects each inflight receipt identity mismatch atomically and reconciles its corrected same ID", () => {
  const mismatches: Array<{ name: string; change: (value: PaperReceipt) => PaperReceipt }> = [
    { name: "chain", change: (value) => ({ ...value, asset: { ...value.asset, chainId: "197" } }) },
    { name: "token", change: (value) => ({ ...value, asset: { ...value.asset, token: `0x${"a".repeat(40)}` } }) },
    { name: "decimals", change: (value) => ({ ...value, asset: { ...value.asset, decimals: 17 } }) },
    { name: "venue", change: (value) => ({ ...value, asset: { ...value.asset, venue: "synthetic-alt" } }) },
    { name: "input", change: (value) => ({ ...value, inputAtoms: "99" }) },
  ];

  for (const mismatch of mismatches) {
    const account = makeAccount();
    const planId = `mismatch-${mismatch.name}`;
    account.reserve(plan(planId));
    account.start(planId);
    const corrected = receipt(`mismatch-r-${mismatch.name}`, planId, "100", "100", "0");
    const before = account.snapshot();

    expect(() => account.settle(mismatch.change(corrected))).toThrow();
    const rejected = account.snapshot();
    expect(rejected.balanceAtoms).toBe(before.balanceAtoms);
    expect(rejected.committedAtoms).toBe(before.committedAtoms);
    expect(rejected.plans[0]?.status).toBe("inflight");
    expect(rejected.stopReason).toBe("invalid_receipt");

    const reconciled = account.settle(corrected);
    expect(reconciled.balanceAtoms).toBe("1000");
    expect(reconciled.committedAtoms).toBe("0");
    expect(reconciled.plans[0]?.status).toBe("settled");
    expect(reconciled.stopReason).toBe("invalid_receipt");
  }
});

test("rejects a changed checkpoint checksum and changed config or event data without rehashing", () => {
  const account = makeAccount("1000", "2000");
  account.reserve(plan("checksum-plan"));
  account.start("checksum-plan");
  account.settle(receipt("checksum-r", "checksum-plan", "100", "100", "0"));
  const original = cloneCheckpoint(account);

  const changedHash = cloneCheckpoint(account);
  changedHash.sha256 = original.sha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64);
  expect(() => PaperCapital.restore(changedHash)).toThrow();

  const changedConfig = cloneCheckpoint(account);
  (changedConfig.config as Record<string, unknown>).initialAtoms = "1001";
  expect(() => PaperCapital.restore(changedConfig)).toThrow();

  const changedEvent = cloneCheckpoint(account);
  const events = changedEvent.events as Record<string, unknown>[];
  const reserveEvent = events[0]!;
  (reserveEvent.plan as Record<string, unknown>).inputAtoms = "101";
  expect(() => PaperCapital.restore(changedEvent)).toThrow();
});


test("does not require recovery for a fresh partial settlement", () => {
  const account = makeAccount("1000", "1000");
  account.reserve(plan("fresh-A", "100", "0"));
  account.reserve(plan("fresh-B", "200", "0"));
  account.reserve(plan("fresh-C", "50", "0"));
  account.start("fresh-A");
  account.start("fresh-B");

  const afterA = account.settle(receipt("fresh-A-r", "fresh-A", "100", "100", "0"));
  expect(afterA.recoveryRequired).toBe(false);
  expect(account.start("fresh-C").plans[2]?.status).toBe("inflight");
  const afterNewReservation = account.reserve(plan("fresh-D", "1", "0"));
  expect(afterNewReservation.recoveryRequired).toBe(false);
  expect(afterNewReservation.plans[3]?.status).toBe("reserved");
});

test("computes recovery only after replaying the full historical journal", () => {
  const earlier = makeAccount("1000", "1000");
  earlier.reserve(plan("history-A", "100", "0"));
  earlier.reserve(plan("history-B", "200", "0"));
  earlier.start("history-A");
  earlier.start("history-B");

  const historicalCheckpoint = cloneCheckpoint(earlier);
  const events = historicalCheckpoint.events as unknown[];
  events.push(
    { type: "settle", receipt: receipt("history-A-r", "history-A", "100", "100", "0") },
    { type: "reserve", plan: plan("history-C", "50", "0") },
    { type: "start", planId: "history-C" },
  );

  const restored = PaperCapital.restore(rehash(historicalCheckpoint));
  expect(restored.snapshot().recoveryRequired).toBe(true);
  expect(restored.snapshot().plans.map((entry) => entry.status)).toEqual(["settled", "inflight", "inflight"]);
  expect(() => restored.reserve(plan("history-blocked", "1", "0"))).toThrow();

  expect(restored.settle(receipt("history-B-r", "history-B", "200", "200", "0")).recoveryRequired).toBe(true);
  expect(() => restored.start("history-blocked")).toThrow();
  expect(restored.settle(receipt("history-C-r", "history-C", "50", "50", "0")).recoveryRequired).toBe(false);
  expect(restored.reserve(plan("after-recovery", "1", "0")).recoveryRequired).toBe(false);
});
