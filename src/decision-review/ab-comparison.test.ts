import { expect, test } from "bun:test";
import { compareShadowRound } from "./ab-comparison";

const at = 1_800_000_000_000;
const round = () => ({
  id: "round-1", createdAtMs: at, aVersion: "a".repeat(64),
  bVersion: "b".repeat(64), bParentVersion: "a".repeat(64),
  evaluatorHash: "e".repeat(64), baselineHash: "f".repeat(64),
  numeraireKey: "token:501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", horizonMs: 60_000,
});
const measurement = (arm: "A" | "B", overrides: Record<string, unknown> = {}) => ({
  roundId: "round-1", pairId: "window-1", arm,
  version: (arm === "A" ? "a" : "b").repeat(64),
  evaluatorHash: "e".repeat(64), baselineHash: "f".repeat(64),
  snapshotHash: "1".repeat(64), startAtMs: at, endAtMs: at + 60_000,
  availableAtMs: at + 61_000, metric: "unitized_net_return_pct",
  numeraireKey: "token:501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", evidence: arm === "A" ? "observed" : "simulated",
  returnPct: arm === "A" ? .4 : .9,
  costs: "complete", cashFlows: "adjusted", valuation: "complete",
  ...overrides,
});
const compare = (rows: unknown[], asOfMs = at + 120_000, manifest: unknown = round()) => {
  const result = compareShadowRound(manifest, rows, asOfMs);
  if (!result.ok) throw Error(result.reason);
  return result.comparison;
};

test("paired portfolio metrics preserve actual versus simulated evidence without proving promotion", () => {
  const r = compare([measurement("A"), measurement("B")]);
  expect(r.pairs[0]).toMatchObject({ pairId: "window-1", status: "comparable", aReturnPct: .4, bReturnPct: .9, deltaPp: .5 });
  expect(r.summary).toMatchObject({ comparable: 1, meanDeltaPp: .5, bHigher: 1, aHigher: 0, ties: 0, overlapping: 0 });
  expect(r).toMatchObject({ evidence: "reported_metrics_only", promotionProven: false, independentSampleCount: null });
});

test("future or unannounced outcome availability cannot become an early reward", () => {
  expect(compare([measurement("A"), measurement("B")], at + 60_500).pairs[0]?.status).toBe("pending");
  expect(compare([measurement("A"), measurement("B", { availableAtMs: null })]).pairs[0]?.status).toBe("pending");
  expect(compare([measurement("A"), measurement("B")], at + 30_000).summary.meanDeltaPp).toBeNull();
});

test("unknown costs never become zero or a profitable comparison", () => {
  const r = compare([measurement("A"), measurement("B", { costs: "unknown", returnPct: 99 })]);
  expect(r.pairs[0]?.status).toBe("costs_unknown");
  expect(r.pairs[0]?.deltaPp).toBeNull();
  expect(r.summary.comparable).toBe(0);
});

test("unadjusted external funding and incomplete marks are not returns", () => {
  expect(compare([measurement("A", { cashFlows: "unknown" }), measurement("B")]).pairs[0]?.status).toBe("cash_flows_unknown");
  expect(compare([measurement("A"), measurement("B", { valuation: "partial" })]).pairs[0]?.status).toBe("valuation_partial");
  expect(compare([measurement("A"), measurement("B", { returnPct: null })]).pairs[0]?.status).toBe("return_unknown");
});

test("a changing candidate cannot pool an old version's score", () => {
  const r = compare([measurement("A"), measurement("B", { version: "c".repeat(64) })]);
  expect(r.pairs[0]?.status).toBe("context_mismatch");
  expect(r.summary.meanDeltaPp).toBeNull();
});

test("round ancestry must point at the actual A and versions cannot be identical", () => {
  expect(compareShadowRound({ ...round(), bParentVersion: "c".repeat(64) }, [], at).ok).toBe(false);
  expect(compareShadowRound({ ...round(), bVersion: "a".repeat(64) }, [], at).ok).toBe(false);
});

test("both arms need the same evaluator, initial portfolio, market snapshot, window and unit", () => {
  for (const overrides of [
    { evaluatorHash: "c".repeat(64) }, { baselineHash: "c".repeat(64) },
    { roundId: "other-round" }, { snapshotHash: "c".repeat(64) },
    { endAtMs: at + 59_000 }, { numeraireKey: "token:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  ]) expect(compare([measurement("A"), measurement("B", overrides)]).pairs[0]?.status).toBe("context_mismatch");
});

test("B cannot label its own outcome as an observed financial result", () => {
  expect(compare([measurement("A"), measurement("B", { evidence: "observed" })]).pairs[0]?.status).toBe("evidence_mismatch");
  expect(compare([measurement("A", { evidence: "simulated" }), measurement("B")]).pairs[0]?.status).toBe("evidence_mismatch");
});

test("identical records are idempotent, conflicting records invalidate the pair", () => {
  const a = measurement("A"), b = measurement("B");
  const r = compare([a, { ...a }, b, { ...b }]);
  expect(r.summary.comparable).toBe(1);
  expect(r.duplicates).toBe(2);
  const conflict = compare([a, b, measurement("B", { returnPct: 5 })]);
  expect(conflict.pairs[0]?.status).toBe("conflicting_records");
  expect(conflict.summary.meanDeltaPp).toBeNull();
});

test("missing arms remain missing instead of becoming zero-return control", () => {
  const r = compare([measurement("B")]);
  expect(r.pairs[0]?.status).toBe("missing_arm");
  expect(r.summary).toMatchObject({ comparable: 0, meanDeltaPp: null });
});

test("overlapping windows are exposed and never claimed to be independent samples", () => {
  const next = { pairId: "window-2", startAtMs: at + 30_000, endAtMs: at + 90_000, availableAtMs: at + 91_000 };
  const r = compare([measurement("A"), measurement("B"), measurement("A", next), measurement("B", next)]);
  expect(r.summary).toMatchObject({ comparable: 2, overlapping: 2 });
  expect(r.independentSampleCount).toBeNull();
  const disjoint = { ...next, startAtMs: at + 60_000, endAtMs: at + 120_000, availableAtMs: at + 121_000 };
  expect(compare([measurement("A"), measurement("B"), measurement("A", disjoint), measurement("B", disjoint)], at + 180_000).summary.overlapping).toBe(0);
});

test("malformed data and impossible clocks are explicit without external text leaking", () => {
  const r = compare([measurement("A"), measurement("B", { returnPct: NaN }), { text: "do something external" }]);
  expect(r.invalidMeasurements).toBe(2);
  expect(r.summary.comparable).toBe(0);
  expect(JSON.stringify(r)).not.toContain("do something external");
  expect(compareShadowRound(round(), [], at - 1).ok).toBe(false);
  expect(compare([measurement("A", { availableAtMs: at + 1 })]).invalidMeasurements).toBe(1);
});

test("new facts are never mutated and an empty round makes no performance claim", () => {
  const a = measurement("A"), b = measurement("B"), before = JSON.stringify([a, b]);
  compare([a, b]);
  expect(JSON.stringify([a, b])).toBe(before);
  expect(compare([]).summary).toMatchObject({ comparable: 0, meanDeltaPp: null });
  expect(compareShadowRound(round(), [], Infinity).ok).toBe(false);
});

test("a malformed duplicate quarantines its pair even when a valid-looking winner is present", () => {
  const r = compare([measurement("A"), measurement("B"), measurement("B", { returnPct: NaN })]);
  expect(r.pairs[0]?.status).toBe("invalid_record");
  expect(r.summary.comparable).toBe(0);
});

test("different units or horizons cannot be pooled within one round", () => {
  const other = { numeraireKey: "token:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" };
  expect(compare([measurement("A", other), measurement("B", other)]).pairs[0]?.status).toBe("context_mismatch");
  const long = { endAtMs: at + 90_000, availableAtMs: at + 91_000 };
  expect(compare([measurement("A", long), measurement("B", long)]).pairs[0]?.status).toBe("context_mismatch");
});

test("reported debt losses below minus one hundred percent are retained, not censored", () => {
  const r = compare([measurement("A", { returnPct: -125 }), measurement("B", { returnPct: -150 })]);
  expect(r.pairs[0]).toMatchObject({ status: "comparable", aReturnPct: -125, bReturnPct: -150, deltaPp: -25 });
  expect(r.invalidMeasurements).toBe(0);
  expect(r.summary).toMatchObject({ comparable: 1, aHigher: 1, bHigher: 0, meanDeltaPp: -25 });
});
