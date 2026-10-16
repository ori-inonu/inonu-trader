import { describe, expect, test } from "bun:test";
import type { EvidenceMeasurement, EvidenceSource, EvidenceSnapshot } from "./contracts.ts";
import { buildPanelReport } from "./panel-metrics.ts";
import type { PanelReport } from "./panel-metrics.ts";

const FIXTURE_SOURCE: EvidenceSource = {
  id: "fixture-source",
  path: "fixture://sanitized-evidence",
  sha256: null,
  asOfMs: 123,
  classification: "local_process",
  limitations: ["test fixture only"],
};

const SCOREBOARD_SOURCE: EvidenceSource = { ...FIXTURE_SOURCE, id: "agent_scoreboard" };
const EQUITY_SOURCE: EvidenceSource = { ...FIXTURE_SOURCE, id: "agent_equity" };

function createSnapshot(measurements: readonly EvidenceMeasurement[], sources: readonly EvidenceSource[] = [FIXTURE_SOURCE]): EvidenceSnapshot {
  return { schemaVersion: 1, capturedAtMs: 123, sources, measurements };
}

describe("offline panel metric missingness", () => {
  test("does not turn absent HUD/analysis data or preferences into zero/calibrated outcomes", () => {
    const result = buildPanelReport(createSnapshot([]));
    const report = result.report as PanelReport;
    const consults = report.metrics.find((entry) => entry.schemaPath === "analysis.funnel.consults")!;
    const pBuy = report.metrics.find((entry) => entry.schemaPath === "analysis.asks.rank_00.p_buy_score")!;
    const brier = report.metrics.find((entry) => entry.schemaPath === "analysis.calibration.brier_score")!;

    expect(consults).toMatchObject({ availability: "unknown", status: "unknown", value: null });
    expect(pBuy).toMatchObject({ semantic: "preference", availability: "unknown", value: null });
    expect(brier).toMatchObject({ semantic: "preference", availability: "unknown", value: null });
    expect(result.metrics).toMatchObject({
      panel_metrics_total: report.metrics.length,
      panel_metrics_known: 0,
      panel_metrics_unknown: report.metrics.length,
      panel_metrics_coverage_pct: 0,
    });
  });

  test("projects status gross values and sanitized numeric ranks without treating nullable values as zero", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "status.scoreboard.24h.all.gross_usd", value: 12.5, unit: "USD", status: "observed", reason: null, sourceId: "agent_scoreboard" },
      { id: "status.scoreboard.24h.all.net_usd", value: null, unit: "USD", status: "unknown", reason: "agent_scoreboard_schema_invalid", sourceId: "agent_scoreboard" },
      { id: "status.scoreboard.24h.all.hit_rate_ratio", value: null, unit: "ratio", status: "unknown", reason: "hit_rate_unavailable", sourceId: "agent_scoreboard" },
      { id: "status.scoreboard.24h.all.settled", value: null, unit: "count", status: "unknown", reason: "raw private text", sourceId: "agent_scoreboard" },
      { id: "status.performance.series.count", value: 1, unit: "count", status: "observed", reason: null, sourceId: "agent_equity" },
      { id: "status.performance.series.rank_00001.timestamp_ms", value: 456, unit: "Unix milliseconds", status: "observed", reason: null, sourceId: "agent_equity" },
      { id: "status.performance.series.rank_00001.value_usd", value: 90, unit: "USD", status: "observed", reason: null, sourceId: "agent_equity" },
      { id: "status.performance.record.14d_window_1h.groups.count", value: 1, unit: "count", status: "observed", reason: null, sourceId: "agent_scoreboard" },
      { id: "status.performance.record.14d_window_1h.groups.rank_00001.n", value: 5, unit: "count", status: "observed", reason: null, sourceId: "agent_scoreboard" },
      { id: "status.performance.record.14d_window_1h.groups.rank_00001.acerto", value: 60, unit: "%", status: "observed", reason: null, sourceId: "agent_scoreboard" },
      { id: "status.performance.record.14d_window_1h.groups.rank_00001.medio", value: 1.2, unit: "%", status: "observed", reason: null, sourceId: "agent_scoreboard" },
      { id: "status.performance.record.14d_window_1h.groups.private_group_name.n", value: 99, unit: "count", status: "observed", reason: null, sourceId: "agent_scoreboard" },
    ], [SCOREBOARD_SOURCE, EQUITY_SOURCE]));
    const report = result.report as PanelReport;
    const gross = report.metrics.find((entry) => entry.measurementId === "status.scoreboard.24h.all.gross_usd")!;
    const net = report.metrics.find((entry) => entry.measurementId === "status.scoreboard.24h.all.net_usd")!;
    const settled = report.metrics.find((entry) => entry.measurementId === "status.scoreboard.24h.all.settled")!;
    const hitRate = report.metrics.find((entry) => entry.measurementId === "status.scoreboard.24h.all.hit_rate_ratio")!;
    const equity = report.metrics.find((entry) => entry.measurementId === "status.performance.series.rank_00001.value_usd")!;
    const recordRate = report.metrics.find((entry) => entry.measurementId === "status.performance.record.14d_window_1h.groups.rank_00001.acerto")!;

    expect(gross).toMatchObject({ availability: "available", value: 12.5, semantic: "gross" });
    expect(net).toMatchObject({ availability: "unknown", value: null, semantic: "net_estimated" });
    expect(settled).toMatchObject({ availability: "unknown", value: null });
    expect(hitRate).toMatchObject({ availability: "unknown", value: null, unit: "ratio [0,1] nullable; settled-hit fraction, not probability calibration" });
    expect(equity).toMatchObject({ availability: "available", value: 90, unit: "USD marked gross wallet value including flows", source: { sourceId: "agent_equity" } });
    expect(recordRate).toMatchObject({ availability: "available", value: 60, unit: "% hit rate [0,100]", source: { sourceId: "agent_scoreboard" } });
    expect(report.weaknesses.some((item) => item.id === "status_scoreboard_not_captured")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("raw private text");
    expect(JSON.stringify(result)).not.toContain("private_group_name");
  });

  test("reports invalid scoreboard coverage independently from a valid equity series", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "status.scoreboard.24h.all.gross_usd", value: null, unit: "USD", status: "unknown", reason: "agent_scoreboard_schema_invalid", sourceId: "agent_scoreboard" },
      { id: "status.performance.series.count", value: 1, unit: "count", status: "observed", reason: null, sourceId: "agent_equity" },
    ], [SCOREBOARD_SOURCE, EQUITY_SOURCE]));
    const issue = (result.report as PanelReport).weaknesses.find((item) => item.id === "status_scoreboard_not_captured")!;

    expect(issue).toMatchObject({ status: "structural", sourceIds: ["agent_scoreboard"] });
    expect(issue.metricIds).toContain("panel_status_scoreboard_24h_all_gross_usd");
  });


  test("preserves observed zero and emits explicit unknown entries for missing ranked rows", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "analysis.placar.skipped.15m.n", value: 2, unit: "count", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.placar.skipped.15m.rank_00000.markout_pct", value: 0, unit: "%", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.trips.count", value: 1, unit: "count", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.trips.cumulative.rank_00000.sale_timestamp_ms", value: 456, unit: "Unix milliseconds", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.trips.cumulative.rank_00000.gross_delta_usdc", value: 0, unit: "USDC", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.trips.cumulative.rank_00000.cumulative_gross_cash_delta_usdc", value: 0, unit: "USDC", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
    ]));
    const report = result.report as PanelReport;
    const markout = report.metrics.find((entry) => entry.schemaPath === "analysis.placar.skipped.15m.rank_00000.markout_pct")!;
    const absentMarkout = report.metrics.find((entry) => entry.schemaPath === "analysis.placar.skipped.15m.rank_00001.markout_pct")!;
    const tripDelta = report.metrics.find((entry) => entry.schemaPath === "analysis.trips.cumulative.rank_00000.gross_delta_usdc")!;

    expect(markout).toMatchObject({ availability: "available", value: 0, source: { measurementId: "analysis.placar.skipped.15m.rank_00000.markout_pct", sourceId: FIXTURE_SOURCE.id } });
    expect(absentMarkout).toMatchObject({ availability: "unknown", value: null, source: { measurementId: "analysis.placar.skipped.15m.rank_00001.markout_pct", sourceId: null } });
    expect(tripDelta).toMatchObject({ availability: "available", value: 0, unit: "USDC before network fee (verified cash mint required)" });
  });


  test("does not classify zero-price marks as priced wallet holdings", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "wallet.equity.unpriced_holdings_count", value: null, unit: "holdings", status: "unknown", reason: "zero_price_mark_may_encode_unpriced_asset", sourceId: FIXTURE_SOURCE.id },
      { id: "wallet.equity.latest_zero_price_marks", value: 1, unit: "recorded zero-price marks", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "wallet.equity.latest_null_price_marks", value: 2, unit: "recorded holdings with null price", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
    ]));
    const report = result.report as PanelReport;
    const unpriced = report.metrics.find((entry) => entry.schemaPath === "wallet.equity.unpriced_holdings_count")!;
    const zeroMarks = report.supplementalEvidence.find((entry) => entry.id === "wallet.equity.latest_zero_price_marks")!;
    const nullMarks = report.supplementalEvidence.find((entry) => entry.id === "wallet.equity.latest_null_price_marks")!;

    expect(unpriced).toMatchObject({ availability: "unknown", status: "unknown", value: null });
    expect(zeroMarks).toMatchObject({ unit: "recorded zero-price marks", availability: "available", value: 1 });
    expect(nullMarks).toMatchObject({ unit: "recorded holdings with null price", availability: "available", value: 2 });
  });

  test("preserves observed zero and keeps explicit null or missing provenance unknown", () => {
    const result = buildPanelReport(createSnapshot([
      { id: "analysis.funnel.consults", value: 0, unit: "count", status: "observed", reason: null, sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.funnel.items", value: null, unit: "count", status: "unknown", reason: "not captured", sourceId: FIXTURE_SOURCE.id },
      { id: "analysis.funnel.closed", value: 3, unit: "count", status: "observed", reason: null, sourceId: "missing-source" },
    ]));
    const report = result.report as PanelReport;
    const consults = report.metrics.find((entry) => entry.schemaPath === "analysis.funnel.consults")!;
    const items = report.metrics.find((entry) => entry.schemaPath === "analysis.funnel.items")!;
    const closed = report.metrics.find((entry) => entry.schemaPath === "analysis.funnel.closed")!;

    expect(consults).toMatchObject({ availability: "available", status: "observed", value: 0, source: { sourceId: FIXTURE_SOURCE.id, evidence: { id: FIXTURE_SOURCE.id, sha256: null, asOfMs: 123, classification: "local_process" } } });
    expect(items).toMatchObject({ availability: "unknown", status: "unknown", value: null });
    expect(closed).toMatchObject({ availability: "unknown", status: "unknown", value: null, source: { evidence: null } });
  });

  test("keeps non-panel market diagnostics supplemental, safe, and outside panel coverage", () => {
    const marketSource: EvidenceSource = { ...FIXTURE_SOURCE, id: "quant90_BTC-USDT", classification: "public_market" };
    const snapshot = createSnapshot([
      { id: "market.quant90.BTC-USDT.bars_total", value: 0, unit: "count", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "market.quant90.BTC-USDT.schema_valid", value: true, unit: "boolean", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "market.quant90.BTC-USDT.sha256", value: "a".repeat(64), unit: "SHA-256", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "analysis.source.invalid_brief_rows", value: 1, unit: "invalid rows", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "hud.command.markout.skipped.15m.n", value: 5, unit: "CEX proxy markout observations", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "audit.review.invalid_lines", value: 2, unit: "lines", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "audit.review.invalid_lines", value: 3, unit: "records", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "private.count", value: 999, unit: "count", status: "observed", reason: null, sourceId: marketSource.id },
      { id: "private.wallet", value: "raw private text", unit: "text", status: "observed", reason: "raw reason", sourceId: marketSource.id },
    ], [marketSource]);
    const result = buildPanelReport(snapshot);
    const report = result.report as PanelReport;
    const bars = report.supplementalEvidence.find((entry) => entry.id === "market.quant90.dataset_001.bars_total")!;
    const schema = report.supplementalEvidence.find((entry) => entry.id === "market.quant90.dataset_001.schema_valid")!;
    const digest = report.supplementalEvidence.find((entry) => entry.id === "market.quant90.dataset_001.sha256")!;
    const duplicateReview = report.supplementalEvidence.find((entry) => entry.id === "audit.review.invalid_lines")!;
    const sourceInvalidRows = report.supplementalEvidence.find((entry) => entry.id === "analysis.source.invalid_brief_rows")!;
    const commandMarkout = report.supplementalEvidence.find((entry) => entry.id === "hud.command.markout.skipped.15m.n")!;
    const privateNumber = report.supplementalEvidence.find((entry) => entry.id === "unmapped_measurement_001")!;
    const privateText = report.supplementalEvidence.find((entry) => entry.id === "unmapped_measurement_002")!;
    expect(duplicateReview).toMatchObject({ unit: "lines", availability: "unknown", value: null });
    expect(sourceInvalidRows).toMatchObject({ unit: "invalid rows", availability: "available", value: 1 });
    expect(commandMarkout).toMatchObject({ unit: "CEX proxy markout observations", availability: "available", value: 5 });
    expect(bars).toMatchObject({ unit: "count", availability: "available", value: 0 });
    expect(schema).toMatchObject({ unit: "boolean", availability: "available", value: true });
    expect(digest).toMatchObject({ availability: "available", value: "a".repeat(64) });
    expect(privateNumber).toMatchObject({ availability: "unknown", value: null });
    expect(privateText).toMatchObject({ availability: "unknown", value: null });
    expect(JSON.stringify(result)).not.toContain("BTC-USDT");
    expect(JSON.stringify(result)).not.toContain("raw private text");
    expect(JSON.stringify(result)).not.toContain("raw reason");
    expect(JSON.stringify(result)).not.toContain(FIXTURE_SOURCE.path);
  });
});
