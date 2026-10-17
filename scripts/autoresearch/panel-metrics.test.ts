import { describe, expect, test } from "bun:test";
import type { EvidenceMeasurement, EvidenceSource, EvidenceSnapshot } from "./contracts.ts";
import { buildPanelReport } from "./panel-metrics.ts";
import type { PanelReport } from "./panel-metrics.ts";

const SOURCE: EvidenceSource = {
  id: "fixture-source",
  path: "fixture://sanitized-evidence",
  sha256: null,
  asOfMs: 123,
  classification: "local_process",
  limitations: ["test fixture only"],
};

function createSnapshot(measurements: readonly EvidenceMeasurement[]): EvidenceSnapshot {
  return { schemaVersion: 1, capturedAtMs: 123, sources: [SOURCE], measurements };
}

function panelMetric(report: PanelReport, schemaPath: string) {
  return report.metrics.find((entry) => entry.schemaPath === schemaPath)!;
}

describe("panel evidence missingness", () => {
  test("keeps absent analysis and financial metrics unknown", () => {
    const result = buildPanelReport(createSnapshot([]));
    const report = result.report as PanelReport;

    expect(panelMetric(report, "analysis.funnel.consults")).toMatchObject({ availability: "unknown", status: "unknown", value: null });
    expect(panelMetric(report, "analysis.calibration.brier_score")).toMatchObject({ availability: "unknown", value: null });
    expect(panelMetric(report, "hud.wallet.net_return_usd")).toMatchObject({ availability: "unknown", value: null });
    expect(result.metrics.panel_metrics_known).toBe(0);
    expect(result.metrics.panel_metrics_unknown).toBe(report.metrics.length);
  });

  test("preserves a measured zero without treating it as missing", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "analysis.funnel.consults", value: 0, unit: "count", status: "observed", reason: null, sourceId: SOURCE.id },
      { id: "analysis.funnel.items", value: null, unit: "count", status: "unknown", reason: null, sourceId: SOURCE.id },
    ]));
    const report = result.report as PanelReport;

    expect(panelMetric(report, "analysis.funnel.consults")).toMatchObject({ availability: "available", value: 0 });
    expect(panelMetric(report, "analysis.funnel.items")).toMatchObject({ availability: "unknown", value: null });
  });

  test("does not echo unsupported raw values or reasons", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "private.wallet", value: "wallet-secret-address", unit: "text", status: "observed", reason: "provider-private-message", sourceId: SOURCE.id },
    ]));
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("wallet-secret-address");
    expect(serialized).not.toContain("provider-private-message");
  });
});
