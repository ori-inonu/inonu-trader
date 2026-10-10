declare const require: (moduleName: "bun:test") => typeof import("bun:test");

const { expect, it } = require("bun:test");
import { createDexReportController } from "./dex-report-import";
import { SYNTHETIC_DEX_REPORT } from "./dex-report-example";

const FIXED_NOW = 1_791_504_001_000;

function validReport() {
  return {
    source: "synthetic",
    chainIndex: "1",
    tokenA: { address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", decimals: 6, metadataSource: "declared fixture" },
    tokenB: { address: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", decimals: 6, metadataSource: "declared fixture" },
    inputAtomic: "1000000",
    outputAtomic: "995000",
    quotedGrossDeltaAtomic: "-5000",
    status: "quoted_gross_delta",
    reasons: ["quoted_output_unit_inferred", "total_cost_coverage_unknown", "token_tax_fraction_unknown"],
    legs: [
      { inputAtomic: "1000000", outputAtomic: "1010000", priceImpactPercent: 0.1, fromTaxFraction: null, toTaxFraction: 0, networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null }, requestedAt: 1_791_504_000_001, receivedAt: 1_791_504_000_002 },
      { inputAtomic: "1010000", outputAtomic: "995000", priceImpactPercent: 0.1, fromTaxFraction: 0, toTaxFraction: 0, networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null }, requestedAt: 1_791_504_000_003, receivedAt: 1_791_504_000_004 },
    ],
    execution: "not_qualified",
    liveQualified: false,
    netAtomic: null,
    netStatus: "net_not_evaluated",
    costsCoverage: "unknown",
    costUsd: null,
    quotaRemaining: null,
    timing: { startedAt: 1_791_504_000_000, completedAt: 1_791_504_000_005, elapsedMs: 5, coverageRequestedAt: 1_791_504_000_000, coverageReceivedAt: 1_791_504_000_000 },
    policy: { maxElapsedMs: 5_000, maxImpactMagnitudePercent: 1 },
  };
}

it("rejects an oversized file before reading and publishes only a generic error", async () => {
  let textCalls = 0;
  const controller = createDexReportController();
  await controller.selectFile({
    size: 65_537,
    text: async () => {
      textCalls += 1;
      return "private-file-content";
    },
  });
  const snapshot = controller.getSnapshot();
  expect(textCalls).toBe(0);
  expect(snapshot.report).toBeNull();
  expect(snapshot.loading).toBe(false);
  expect(snapshot.error).toBe("Não foi possível validar o relatório DEX.");
  expect(snapshot.error).not.toContain("private-file-content");
});

it("accepts an exactly 65,536-byte UTF-8 report and rejects oversized encoded text", async () => {
  const controller = createDexReportController({ nowWallMs: () => FIXED_NOW });
  const initial = JSON.stringify({ ...validReport(), extra: "" });
  const padding = 65_536 - new TextEncoder().encode(initial).byteLength;
  expect(padding).toBeGreaterThan(0);
  const atLimit = JSON.stringify({ ...validReport(), extra: "x".repeat(padding) });
  expect(new TextEncoder().encode(atLimit).byteLength).toBe(65_536);
  await controller.selectFile({ size: 65_536, text: async () => atLimit });
  expect(controller.getSnapshot().report?.quotedGrossDeltaAtomic).toBe("-5000");
  expect(controller.getSnapshot().error).toBeNull();

  const oversizedController = createDexReportController({ nowWallMs: () => FIXED_NOW });
  let textCalls = 0;
  const oversizedText = JSON.stringify({ ...validReport(), extra: "é".repeat(32_768) });
  expect(new TextEncoder().encode(oversizedText).byteLength).toBeGreaterThan(65_536);
  await oversizedController.selectFile({
    size: 1,
    text: async () => {
      textCalls += 1;
      return oversizedText;
    },
  });
  expect(textCalls).toBe(1);
  expect(oversizedController.getSnapshot().report).toBeNull();
  expect(oversizedController.getSnapshot().error).toBe("Não foi possível validar o relatório DEX.");
});

it("uses monotonic elapsed time and makes clock regression sticky-unknown", async () => {
  let wallNow = FIXED_NOW;
  let monotonicNow = 800;
  const controller = createDexReportController({ nowWallMs: () => wallNow, nowMonotonicMs: () => monotonicNow });
  await controller.selectFile({ size: 1, text: async () => JSON.stringify(validReport()) });
  expect(controller.getSnapshot().ageSinceImportMs).toBe(0);

  monotonicNow = 1_300;
  wallNow = FIXED_NOW - 50_000;
  controller.tick();
  expect(controller.getSnapshot().ageSinceImportMs).toBe(500);

  monotonicNow = 1_299;
  controller.tick();
  expect(controller.getSnapshot().ageSinceImportMs).toBeNull();
  monotonicNow = 9_000;
  controller.tick();
  expect(controller.getSnapshot().ageSinceImportMs).toBeNull();
});

it("loads the fixed negative synthetic example through the same parser", () => {
  const controller = createDexReportController({ nowWallMs: () => FIXED_NOW, nowMonotonicMs: () => 700 });
  controller.showExample(SYNTHETIC_DEX_REPORT);
  const snapshot = controller.getSnapshot();
  expect(snapshot.error).toBeNull();
  expect(snapshot.isExample).toBe(true);
  expect(snapshot.report?.source).toBe("synthetic");
  expect(snapshot.report?.quotedGrossDeltaAtomic).toBe("-5000");
  expect(snapshot.report?.timing?.startedAt).toBe(1_791_504_000_000);
});

it("unmount invalidates and discards the accepted report without emitting another update", async () => {
  const updates: unknown[] = [];
  const controller = createDexReportController({
    nowWallMs: () => FIXED_NOW,
    nowMonotonicMs: () => 1,
    onChange: (state) => updates.push(state),
  });
  await controller.selectFile({ size: 1, text: async () => JSON.stringify(validReport()) });
  expect(controller.getSnapshot().report?.status).toBe("quoted_gross_delta");
  const previousUpdateCount = updates.length;
  controller.unmount();
  expect(controller.getSnapshot().report).toBeNull();
  expect(controller.getSnapshot().error).toBeNull();
  expect(updates).toHaveLength(previousUpdateCount);
});

it("keeps the newest selected file when an older read resolves later", async () => {
  let finishFirst!: (text: string) => void;
  const firstText = new Promise<string>((resolve) => { finishFirst = resolve; });
  const controller = createDexReportController({ nowWallMs: () => FIXED_NOW, nowMonotonicMs: () => 5 });
  const first = controller.selectFile({ size: 1, text: () => firstText });
  expect(controller.getSnapshot().loading).toBe(true);
  expect(controller.getSnapshot().report).toBeNull();

  const newerReport = { ...validReport(), reasons: [...validReport().reasons, "newest_selection"] };
  await controller.selectFile({ size: 1, text: async () => JSON.stringify(newerReport) });
  expect(controller.getSnapshot().report?.reasons).toContain("newest_selection");

  finishFirst(JSON.stringify({ ...validReport(), reasons: [...validReport().reasons, "stale_selection"] }));
  await first;
  expect(controller.getSnapshot().report?.reasons).toContain("newest_selection");
  expect(controller.getSnapshot().report?.reasons).not.toContain("stale_selection");
});

it("cancel leaves state alone and clear discards a pending file read", async () => {
  const controller = createDexReportController({ nowWallMs: () => FIXED_NOW, nowMonotonicMs: () => 5 });
  const file = { size: 1, text: async () => JSON.stringify(validReport()) };
  await controller.selectFile(file);
  const accepted = controller.getSnapshot().report;
  await controller.selectFile(undefined);
  expect(controller.getSnapshot().report).toBe(accepted);

  let finishPending!: (text: string) => void;
  const pending = controller.selectFile({ size: 1, text: () => new Promise((resolve) => { finishPending = resolve; }) });
  expect(controller.getSnapshot().loading).toBe(true);
  controller.clear();
  expect(controller.getSnapshot()).toEqual({ report: null, error: null, loading: false, isExample: false, ageSinceImportMs: null });
  finishPending(JSON.stringify(validReport()));
  await pending;
  expect(controller.getSnapshot().report).toBeNull();
});

it("allows the same file object to be retried after an error", async () => {
  let text = "{not-json";
  const sameFile = { size: 1, text: async () => text };
  const controller = createDexReportController({ nowWallMs: () => FIXED_NOW, nowMonotonicMs: () => 5 });
  await controller.selectFile(sameFile);
  expect(controller.getSnapshot().report).toBeNull();
  expect(controller.getSnapshot().error).toBe("Não foi possível validar o relatório DEX.");

  text = JSON.stringify(validReport());
  await controller.selectFile(sameFile);
  expect(controller.getSnapshot().report?.quotedGrossDeltaAtomic).toBe("-5000");
  expect(controller.getSnapshot().error).toBeNull();
});
