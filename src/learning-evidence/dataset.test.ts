import { expect, test } from "bun:test";
import { FEATURE_NAMES, FEATURE_VERSION } from "../intel/features/types";
import type { Snapshot, Label } from "../outcomes/types";
import { buildLearningDataset } from "./dataset";

export function snapshot(id: string, asOfMs: number, instId = "BTC-USDT"): Snapshot {
  return {
    id, asOfMs, instId, market: "spot", price: 100, costRoundTripBps: 20, atr15m: null,
    zones: { demanda: null, oferta: null }, origem: "relogio",
    features: { v: FEATURE_VERSION, instId, asOfMs,
      values: Object.fromEntries(FEATURE_NAMES.map((name) => [name, name === "mom.rsi5m" ? 55 : null])),
      nulos: Object.fromEntries(FEATURE_NAMES.filter((name) => name !== "mom.rsi5m").map((name) => [name, "sem_dados"])),
      idades: { "5m": 0 } },
  };
}
export function label(id: string, net = 10): Label {
  return { snapshotId: id, horizonte: "15m", completo: true, motivoIncompleto: null,
    brutoLongBps: net + 20, liquidoLongBps: net, liquidoShortBps: -net - 40,
    maxAltaBps: 50, maxQuedaBps: 5, barreiraLong: null, barreiraShort: null,
    zonaDemanda: null, zonaOferta: null };
}
test("exports hypothetical net spot long target, preserving unknown features and input objects", () => {
  const snaps = [snapshot("loss", 0), snapshot("win", 300_000)];
  const labels = [label("loss", -5), label("win", 10)];
  const before = JSON.stringify({ snaps, labels });
  const result = buildLearningDataset(snaps, labels, { horizon: "15m", asOfMs: 1_200_000, minTrainGroups: 1, testGroups: 1 });
  expect(result.rows.map((row) => row.target)).toEqual([
    { hypotheticalNetLongBps: -5, positiveNetLong: false },
    { hypotheticalNetLongBps: 10, positiveNetLong: true },
  ]);
  expect(result.rows[0]!.features.values["mom.rsi5m"]).toBe(55);
  expect(result.rows[0]!.features.values["drv.fundingBps"]).toBeNull();
  expect(result.targetKind).toBe("hypothetical_spot_long_after_recorded_cost");
  expect(JSON.stringify({ snaps, labels })).toBe(before);
});

test("purges training outcomes at the cutoff and groups simultaneous instruments", () => {
  const snaps = [
    snapshot("a", 0), snapshot("b", 300_000), snapshot("c", 600_000),
    snapshot("d", 900_000), snapshot("e", 1_200_000), snapshot("f", 1_500_000),
    snapshot("eth", 1_500_000, "ETH-USDT"), snapshot("g", 1_800_000),
  ];
  const result = buildLearningDataset(snaps, snaps.map((s) => label(s.id)), {
    horizon: "15m", asOfMs: 2_700_000, minTrainGroups: 2, testGroups: 1,
  });
  expect(result.folds[0]).toEqual({
    train: [0, 1], test: [5, 6], testStartMs: 1_500_000, testEndMs: 1_500_000,
    trainLabelCutoffMs: 1_500_000, purgedRows: 3,
  });
  expect(result.folds[1]!.train).toEqual([0, 1, 2]);
  expect(result.folds[1]!.test).toEqual([7]);
  const embargo = buildLearningDataset(snaps, snaps.map((s) => label(s.id)), {
    horizon: "15m", asOfMs: 2_700_000, minTrainGroups: 2, testGroups: 1, embargoMs: 300_000,
  });
  expect(embargo.folds[0]!.train).toEqual([0, 1]);
  expect(embargo.folds[0]!.test).toEqual([7]);
  expect(embargo.folds[0]!.trainLabelCutoffMs).toBe(1_500_000);
});

test("excludes unknown costs, ineligible sampling and immature or inconsistent outcomes with counts", () => {
  const base = snapshot("ok", 0);
  const snaps = [
    base, { ...snapshot("cost", 1), costRoundTripBps: null },
    { ...snapshot("manual", 2), origem: "pedido" },
    { ...snapshot("perp", 3), market: "perp" },
    snapshot("immature", 300_000), snapshot("incomplete", 4), snapshot("badnet", 5),
  ];
  const labels = [
    label("ok", 0), label("cost"), label("manual"), label("perp"), label("immature"),
    { ...label("incomplete"), completo: false, motivoIncompleto: "lacuna_de_velas" },
    { ...label("badnet"), liquidoLongBps: 31 },
  ];
  const result = buildLearningDataset(snaps, labels, { horizon: "15m", asOfMs: 900_010 });
  expect(result.rows.map((r) => r.snapshotId)).toEqual(["ok"]);
  expect(result.rows[0]!.target.positiveNetLong).toBe(false);
  expect(result.diagnostics.excluded).toEqual({
    sampling: 2, cost: 1, features: 0, timestamp: 0, missingLabel: 0,
    incompleteLabel: 1, immatureLabel: 1, inconsistentReturn: 1,
  });
  expect(result.status).toBe("insufficient_data");
});

test("rejects conflicting duplicates and makes replay independent of input order", () => {
  const a = snapshot("a", 0), b = snapshot("b", 300_000);
  const options = { horizon: "15m" as const, asOfMs: 1_200_000 };
  const result = buildLearningDataset([b, a, a], [label("b"), label("a"), label("a")], options);
  expect(result.rows.map((r) => r.snapshotId)).toEqual(["a", "b"]);
  expect(result.diagnostics.duplicateSnapshots).toBe(1);
  expect(result.diagnostics.duplicateLabels).toBe(1);
  expect(result).toEqual(buildLearningDataset([a, a, b], [label("a"), label("a"), label("b")], options));
  expect(() => buildLearningDataset([a, { ...a, price: 101 }], [], options)).toThrow("conflicting_snapshot");
  expect(() => buildLearningDataset([a], [label("a"), label("a", 11)], options)).toThrow("conflicting_label");
  expect(() => buildLearningDataset([a, { ...a, id: "another" }], [], options)).toThrow("duplicate_observation");
});

test("checks feature provenance and projects only the fixed schema", () => {
  const extra = snapshot("extra", 0);
  const future = snapshot("future", 1);
  const foreign = snapshot("foreign", 2);
  const negativeAge = snapshot("age", 3);
  const missing = snapshot("missing", 4);
  const missingValues = { ...missing.features.values };
  delete missingValues["mom.rsi5m"];
  const snaps = [
    { ...extra, features: { ...extra.features, values: { ...extra.features.values, futureProfit: 99 } } },
    { ...future, features: { ...future.features, asOfMs: 5 } },
    { ...foreign, features: { ...foreign.features, instId: "ETH-USDT" } },
    { ...negativeAge, features: { ...negativeAge.features, idades: { "5m": -1 } } },
    { ...missing, features: { ...missing.features, values: missingValues } },
    snapshot("timestamp", -1),
  ];
  const result = buildLearningDataset(snaps, snaps.map((s) => label(s.id)), { horizon: "15m", asOfMs: 900_010 });
  expect(result.rows.map((r) => r.snapshotId)).toEqual(["extra"]);
  expect(Object.keys(result.rows[0]!.features.values)).toEqual([...FEATURE_NAMES]);
  expect(result.diagnostics.excluded.features).toBe(4);
  expect(result.diagnostics.excluded.timestamp).toBe(1);
});

test("validates options and fails malformed records before producing a partial dataset", () => {
  const opts = { horizon: "15m" as const, asOfMs: 900_000 };
  for (const override of [{ asOfMs: NaN }, { asOfMs: -1 }, { asOfMs: 1.5 },
    { minTrainGroups: 0 }, { testGroups: 0 }, { testGroups: 1.5 }, { embargoMs: -1 }]) {
    expect(() => buildLearningDataset([], [], { ...opts, ...override })).toThrow("invalid_options");
  }
  expect(() => buildLearningDataset([], [], { ...opts, horizon: "bad" as "15m" })).toThrow("invalid_options");
  expect(() => buildLearningDataset([snapshot("a", 0), {}], [], opts)).toThrow("invalid_snapshot");
  expect(() => buildLearningDataset([], [{}], opts)).toThrow("invalid_label");
});

test("rejects explicit null options while keeping defaults for omitted or undefined options", () => {
  const opts = { horizon: "15m" as const, asOfMs: 900_000 };
  for (const field of ["minTrainGroups", "testGroups", "embargoMs"]) {
    expect(() => buildLearningDataset([], [], { ...opts, [field]: null })).toThrow("invalid_options");
  }
  expect(buildLearningDataset([], [], { ...opts, minTrainGroups: undefined, testGroups: undefined,
    embargoMs: undefined }).settings).toEqual({ minTrainGroups: 30, testGroups: 12, embargoMs: 0 });
});

test("accounts for skipped test blocks and incomplete tails with literal chronological boundaries", () => {
  const snaps = [0, 300_000, 600_000, 1_200_000, 1_500_000, 1_800_000, 2_100_000].map((at, i) => snapshot(String(i), at));
  const result = buildLearningDataset(snaps, snaps.map((s) => label(s.id)), {
    horizon: "15m", asOfMs: 3_000_000, minTrainGroups: 2, testGroups: 2,
  });
  expect(result.diagnostics.skippedBlocks).toBe(1);
  expect(result.diagnostics.tailGroups).toBe(1);
  expect(result.folds).toEqual([{
    train: [0, 1], test: [4, 5], testStartMs: 1_500_000, testEndMs: 1_800_000,
    trainLabelCutoffMs: 1_500_000, purgedRows: 2,
  }]);
});

test("enforces input and fold output resource limits", () => {
  const options = { horizon: "15m" as const, asOfMs: 3_000_000_000, minTrainGroups: 1, testGroups: 1 };
  expect(() => buildLearningDataset(new Array(100_001), [], options)).toThrow("record_limit");
  const snaps = Array.from({ length: 2_100 }, (_, i) => snapshot(String(i), i * 1_200_000));
  expect(() => buildLearningDataset(snaps, snaps.map((s) => label(s.id)), options)).toThrow("fold_index_limit");
});

test("excludes historical backfill supported by the updated recorder contract", () => {
  const result = buildLearningDataset([{ ...snapshot("historical", 0), origem: "historico" }], [label("historical")], {
    horizon: "15m", asOfMs: 900_000,
  });
  expect(result.rows).toHaveLength(0);
  expect(result.diagnostics.excluded.sampling).toBe(1);
});
