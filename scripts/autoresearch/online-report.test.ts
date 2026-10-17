import { describe, expect, test } from "bun:test";
import type { AnalysisView } from "../../src/agent/analysis.ts";
import type { OnlineObservation, OnlineSource } from "./contracts.ts";
import type { PanelReport } from "./panel-metrics.ts";
import { buildOnlineReport } from "./online-report.ts";

interface ReportView {
  readonly runtimeIdentity: { readonly app: string | null; readonly version: string | null; readonly startedAtMs: number | null };
  readonly decisionObservation: {
    readonly analysisProjectionAtMs: number | null;
    readonly latestConsultAtMs: number | null;
    readonly latestConsultAgeMs: number | null;
    readonly projectionTimeIsDecisionTime: false;
    readonly actorAttribution: string;
  };
  readonly ledgerObservation: {
    readonly coverage: string;
    readonly tailRecords: number | null;
    readonly tailOrderRecords: number | null;
    readonly tailCycleRecords: number | null;
    readonly completeLedger: string;
  };
  readonly market: { readonly availability: string; readonly last: number | null };
  readonly financialPrimary: {
    readonly status: string;
    readonly value: number | null;
    readonly optimizationEligible: boolean;
  };
  readonly panel: PanelReport;
}

const timestamp = 1_792_077_348_955;
const emptyWindow = { n: 0, up: 0, mean: null, vals: [] } as const;

const sourcePaths = {
  runtime_health: "/health",
  runtime_analysis: "/agent/analysis",
  runtime_ledger: "/agent/ledger?n=200",
  okx_time: "/api/v5/public/time",
  okx_ticker: "/api/v5/market/ticker?instId=SOL-USDT",
} as const;

function onlineSource(
  id: keyof typeof sourcePaths,
  classification: OnlineSource["classification"],
  transport: OnlineSource["transport"],
): OnlineSource {
  return {
    id,
    path: sourcePaths[id],
    sha256: "a".repeat(64),
    asOfMs: id === "runtime_health" ? null : timestamp,
    classification,
    limitations: [],
    requestedAtMs: timestamp,
    receivedAtMs: timestamp + 10,
    transport,
  };
}

function analysisView(overrides: Partial<AnalysisView> = {}): AnalysisView {
  const base: AnalysisView = {
    atMs: timestamp + 100,
    funnel: { consults: 1, items: 0, closed: 0, open: 0, asked: 0, applied: 0, executed: 0, failed: 0 },
    asks: [{ t: timestamp, s: null, p: 0, ok: false }],
    hist: { all: new Array<number>(20).fill(0), fresh: new Array<number>(20).fill(0) },
    timeline: [{ t: timestamp, open: 0, asked: 0, applied: 0 }],
    trips: [],
    fees: { lamports: 0, fills: 0, unmatchedSells: 0 },
    placar: {
      skipped: { "15m": emptyWindow, "1h": emptyWindow },
      closed: { "15m": emptyWindow, "1h": emptyWindow },
      gated: { "15m": emptyWindow, "1h": emptyWindow },
    },
    recent: [],
    orders: { outcomes: {}, reasons: {}, spentToday: { buy: 0, sell: 0 } },
    runtime: { tokensToday: null, riskPct: null },
  };
  return { ...base, ...overrides };
}

function observation(overrides: Partial<OnlineObservation> = {}): OnlineObservation {
  return {
    startedAtMs: timestamp + 1,
    completedAtMs: timestamp + 200,
    sources: [
      onlineSource("runtime_health", "local_process", "http_loopback"),
      onlineSource("runtime_analysis", "local_process", "http_loopback"),
      onlineSource("runtime_ledger", "local_process", "http_loopback"),
      onlineSource("okx_time", "public_market", "https_public"),
      onlineSource("okx_ticker", "public_market", "https_public"),
    ],
    health: { app: "inonu-trader", version: "0.0.2", startedAt: timestamp - 10_000 },
    analysis: { ok: true, analysis: analysisView() },
    ledger: [],
    market: { instrument: "SOL-USDT", last: 104.56, bid: 104.55, ask: 104.57, quoteAtMs: timestamp + 20, serverAtMs: timestamp + 25 },
    ...overrides,
  };
}

function reportView(value: unknown): ReportView {
  return value as ReportView;
}

function panelMetric(report: PanelReport, schemaPath: string) {
  return report.metrics.find((entry) => entry.schemaPath === schemaPath)!;
}

describe("online evidence report", () => {
  test("preserves valid raw markouts below the histogram threshold", () => {
    const analysis = analysisView({
      placar: {
        skipped: { "15m": { n: 1, up: 0, mean: 0, vals: [0] }, "1h": emptyWindow },
        closed: { "15m": emptyWindow, "1h": emptyWindow },
        gated: { "15m": emptyWindow, "1h": emptyWindow },
      },
    });
    const report = reportView(buildOnlineReport(observation({ analysis: { ok: true, analysis } })).report);

    expect(panelMetric(report.panel, "analysis.placar.skipped.15m.rank_00000.markout_pct"))
      .toMatchObject({ availability: "available", value: 0 });
    expect(panelMetric(report.panel, "analysis.placar.skipped.15m.hist.bin_00"))
      .toMatchObject({ availability: "unknown", value: null });
    expect(report.financialPrimary).toMatchObject({ status: "unknown", value: null, optimizationEligible: false });
  });
  test("preserves funnel ratios and derives drop counts only from nonnegative known differences", () => {
    const analysis = analysisView({
      funnel: { consults: 1, items: 5, closed: 0, open: 5, asked: 3, applied: 2, executed: 1, failed: 0 },
    });
    const report = reportView(buildOnlineReport(observation({ analysis: { ok: true, analysis } })).report);

    expect(panelMetric(report.panel, "hud.funnel.items_to_open_pct")).toMatchObject({ availability: "available", value: 100 });
    expect(panelMetric(report.panel, "hud.funnel.open_to_asked_pct")).toMatchObject({ availability: "available", value: 60 });
    expect(panelMetric(report.panel, "hud.funnel.asked_to_applied_pct")).toMatchObject({ availability: "available", value: 67 });
    expect(panelMetric(report.panel, "hud.funnel.closed_by_code_count")).toMatchObject({ availability: "available", value: 0 });
    expect(panelMetric(report.panel, "hud.funnel.skipped_by_jev_count")).toMatchObject({ availability: "available", value: 2 });
    expect(panelMetric(report.panel, "hud.funnel.blocked_by_code_count")).toMatchObject({ availability: "available", value: 1 });
    expect(report.financialPrimary).toMatchObject({ status: "unknown", value: null, optimizationEligible: false });

    const invalidFunnel = analysisView({
      funnel: { consults: 1, items: 5, closed: 0, open: 5, asked: 0, applied: 1, executed: 1, failed: 0 },
    });
    const invalidReport = reportView(buildOnlineReport(observation({ analysis: { ok: true, analysis: invalidFunnel } })).report);
    expect(panelMetric(invalidReport.panel, "hud.funnel.asked_to_applied_pct"))
      .toMatchObject({ availability: "unknown", value: null });
    expect(panelMetric(invalidReport.panel, "hud.funnel.blocked_by_code_count"))
      .toMatchObject({ availability: "unknown", value: null });
  });
  test("preserves observed zero, leaves ambiguous choice scores unknown, and has no financial primary", () => {
    const result = buildOnlineReport(observation());
    const report = reportView(result.report);

    expect(panelMetric(report.panel, "analysis.funnel.items")).toMatchObject({ availability: "available", value: 0 });
    expect(panelMetric(report.panel, "analysis.asks.rank_00.p_buy_score")).toMatchObject({ availability: "unknown", value: null });
    expect(panelMetric(report.panel, "hud.wallet.net_return_usd")).toMatchObject({ availability: "unknown", value: null });
    expect(report.financialPrimary).toMatchObject({ status: "unknown", value: null, optimizationEligible: false });
    expect(report.market).toMatchObject({ availability: "available", last: 104.56 });
    expect(result.metrics.panel_hud_wallet_net_return_usd).toBeUndefined();
  });

  test("keeps projection time distinct from the latest retained timeline fact and suppresses private text", () => {
    const projectionAtMs = timestamp + 2_000;
    const consultAtMs = timestamp + 1_600;
    const analysis = analysisView({
      atMs: projectionAtMs,
      asks: [{ t: consultAtMs, s: "PRIVATE-SYMBOL-SECRET", p: 0, ok: false }],
      timeline: [{ t: consultAtMs, open: 1, asked: 1, applied: 0 }],
      trips: [{ s: "PRIVATE-SYMBOL-SECRET", in: 12, out: 14, pct: 16, buyAt: consultAtMs - 60_000, sellAt: consultAtMs }],
      recent: [{ t: consultAtMs, s: "PRIVATE-SYMBOL-SECRET", kind: "PRIVATE-DECISION-TEXT", m15: null, m1h: null }],
    });
    const result = buildOnlineReport(observation({
      completedAtMs: timestamp + 2_200,
      analysis: { ok: true, analysis },
      ledger: [{
        kind: "order", cycleId: "PRIVATE-CYCLE-ID", atMs: timestamp + 1_700, orderKey: "PRIVATE-ORDER-KEY",
        stage: "executada", candidateId: "PRIVATE-CANDIDATE-ID", side: "buy", stance: "buy",
        chainIndex: "private-chain", symbol: "PRIVATE-SYMBOL-SECRET", address: "PRIVATE-ADDRESS-SECRET",
        wallet: "solana", usd: 12, amountMinor: "1200", ref: "PRIVATE-ORDER-REF", reason: "PRIVATE-REASON",
        profile: null, source: "modelo",
      }],
    }));
    const report = reportView(result.report);
    const serialized = JSON.stringify(result.report);

    expect(report.decisionObservation.analysisProjectionAtMs).toBe(projectionAtMs);
    expect(report.decisionObservation.latestConsultAtMs).toBe(consultAtMs);
    expect(report.decisionObservation.latestConsultAgeMs).toBe(600);
    expect(report.decisionObservation.projectionTimeIsDecisionTime).toBe(false);
    expect(serialized).not.toContain("PRIVATE-SYMBOL-SECRET");
    expect(serialized).not.toContain("PRIVATE-DECISION-TEXT");
    expect(serialized).not.toContain("PRIVATE-CYCLE-ID");
    expect(serialized).not.toContain("PRIVATE-ORDER-KEY");
    expect(serialized).not.toContain("PRIVATE-ADDRESS-SECRET");
    expect(serialized).not.toContain("PRIVATE-ORDER-REF");
    expect(serialized).not.toContain("PRIVATE-REASON");
  });

  test("reports bounded ledger tail counts without asserting whole-ledger or actor attribution", () => {
    const result = buildOnlineReport(observation({
      analysis: { ok: true, analysis: analysisView({ timeline: [{ t: timestamp + 50, open: 1, asked: 0, applied: 0 }] }) },
      ledger: [
        { kind: "cycle", cycleId: "CYCLE-SECRET", atMs: timestamp, mode: "sombra", outcome: "decidido", reason: null, posture: null, stances: {}, planned: 1, dropped: [], modelo: "unverified-model-name" },
        { kind: "order", cycleId: "CYCLE-SECRET", atMs: timestamp + 1, orderKey: "ORDER-SECRET", stage: "executada", candidateId: "CANDIDATE-SECRET", side: "buy", stance: "buy", chainIndex: "private-chain", symbol: "private-symbol", address: "private-address", wallet: "solana", usd: 10, amountMinor: "1000", ref: "private-ref", reason: null, profile: null, source: "modelo" },
      ],
    }));
    const report = reportView(result.report);

    expect(report.ledgerObservation).toMatchObject({
      coverage: "bounded_tail_only",
      tailRecords: 2,
      tailOrderRecords: 1,
      tailCycleRecords: 1,
      completeLedger: "unknown",
    });
    expect(report.decisionObservation.actorAttribution).toBe("runtime_registered_unverified");
    expect(report.financialPrimary).toMatchObject({ status: "unknown", value: null, optimizationEligible: false });
    expect(JSON.stringify(result.report)).not.toContain("unverified-model-name");
    expect(JSON.stringify(result.report)).not.toContain("ORDER-SECRET");
    expect(JSON.stringify(result.report)).not.toContain("private-address");
    expect(JSON.stringify(result.report)).not.toContain("private-ref");
  });
});
