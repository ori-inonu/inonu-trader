import { describe, expect, test } from "bun:test";
import { processAgentAnalysis, processAgentEquity, summarizeUsageRows } from "./freeze-evidence.ts";

type LoadedSource = Parameters<typeof processAgentAnalysis>[0];

function source(id: string, payload: string): LoadedSource {
  return {
    id,
    path: `runtime-home/data/agent/${id}.jsonl`,
    classification: "local_process",
    limitations: [],
    sha256: "a".repeat(64),
    payload,
    issue: null,
    asOfMs: null,
  };
}

function metric(measurements: Parameters<typeof processAgentAnalysis>[2], id: string) {
  const found = measurements.find((measurement) => measurement.id === id);
  expect(found).toBeDefined();
  return found!;
}

describe("freeze-evidence preserves incomplete and malformed source boundaries", () => {
  test("valid JSON with malformed brief and scoreboard rows is counted, not treated as empty data", () => {
    const briefs = source("agent_briefs", `${JSON.stringify({ unexpected: true })}\n`);
    const ledger = source("agent_ledger", "");
    const fills = source("agent_fills", "");
    const scoreboard = source("agent_scoreboard", `${JSON.stringify({ kind: "decision", key: "bad", atMs: 1_792_127_750_000, usd: 1, source: "modelo" })}\n`);
    const aggregate = source("agent_analysis", "");
    const measurements: Parameters<typeof processAgentAnalysis>[2] = [];

    processAgentAnalysis(aggregate, [briefs, ledger, fills, scoreboard], measurements);

    expect(metric(measurements, "analysis.source.invalid_brief_rows")).toMatchObject({ value: 1, status: "derived" });
    expect(metric(measurements, "analysis.source.invalid_scoreboard_rows")).toMatchObject({ value: 1, status: "derived" });
    expect(metric(measurements, "analysis.asks.count")).toMatchObject({ value: null, status: "unknown" });
    expect(metric(measurements, "analysis.placar.skipped.15m.n")).toMatchObject({ value: null, status: "unknown" });
    expect(metric(measurements, "status.scoreboard.15m.all.n")).toMatchObject({ value: null, status: "unknown", reason: "agent_scoreboard_schema_invalid", sourceId: "agent_scoreboard" });
  });

  test("missing measured USD never falls back to estimated USD or an empty-period zero", () => {
    const nowMs = Date.UTC(2026, 9, 20, 12);
    const summary = summarizeUsageRows([{
      id: "private-row-not-exported",
      atMs: nowMs,
      modo: "ativo",
      razao: "internal",
      resultado: "ok",
      chamadasModelo: 1,
      chamadasOnchainos: 0,
      tokensEntrada: 10,
      tokensSaida: 20,
      usdEstimado: 0.25,
      latenciaMs: 12,
    }], nowMs);
    const empty = summarizeUsageRows([], nowMs);

    expect(summary.complete).toBe(true);
    expect(summary.today.totals.calls).toBe(1);
    expect(summary.today.totals.tokens).toBe(30);
    expect(summary.today.totals.usd).toBeNull();
    expect(summary.month.totals.usd).toBeNull();
    expect(empty.today.totals.calls).toBe(0);
    expect(empty.today.totals.usd).toBeNull();
  });
});

describe("freeze-evidence status equity projection", () => {
  test("equity series exports positive holdings value and excludes zero-only marks", () => {
    const bundle = source("agent_equity", [
      JSON.stringify({ atMs: 1_000, usd: null, holdings: [{ id: "private-a", units: 2, priceUsd: 3.25 }] }),
      JSON.stringify({ atMs: 2_000, usd: 99, holdings: [{ id: "private-b", units: 1, priceUsd: 0 }] }),
      "",
    ].join("\n"));
    const measurements: Parameters<typeof processAgentEquity>[1] = [];

    processAgentEquity(bundle, measurements);

    expect(metric(measurements, "status.performance.series.count")).toMatchObject({ value: 1, sourceId: "agent_equity" });
    expect(metric(measurements, "status.performance.series.rank_00001.timestamp_ms")).toMatchObject({ value: 1_000, sourceId: "agent_equity" });
    expect(metric(measurements, "status.performance.series.rank_00001.value_usd")).toMatchObject({ value: 6.5, sourceId: "agent_equity" });
    expect(measurements.some((entry) => entry.id === "status.performance.series.rank_00002.value_usd")).toBe(false);
  });
});
