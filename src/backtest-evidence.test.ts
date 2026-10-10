import { describe, expect, test } from "bun:test";
import { analyzeReplayJournal } from "./backtest-evidence.ts";

const session = {
  kind: "session",
  ts: 1_000,
  sessionId: "hand-worked-mark-only",
  dataSource: "synthetic",
  model: "mock",
  bankrollUsd: 100,
  initialMon: 2,
  initialMid: 10,
  makerFeeBps: 0,
} as const;
const journal = [
  session,
  { kind: "block", block: 1, ts: 2_000, mid: 11 },
].map((event) => JSON.stringify(event)).join("\n");
const journalSha256 = "74eb37b33919c291be49fb42454ddcd889da92b9c1794642213ad11360bd95e4";
const engineSha256 = "a".repeat(64);
const declaredHash = "c".repeat(64);
const completeManifest = {
  schemaVersion: 1,
  journalSha256,
  engineSha256,
  data: {
    source: "synthetic-fixture",
    venue: "fixture-venue",
    instrument: "MON/USD",
    network: "none",
    units: { time: "ms", price: "USD/MON", size: "MON", cash: "USD" },
    resolutionMs: 1_000,
    startTs: 1_000,
    endTs: 2_000,
  },
  strategy: {
    version: "fixture-v1",
    model: "mock",
    promptSha256: declaredHash,
    parametersSha256: declaredHash,
  },
  coverage: {
    maxGapMs: 1_000,
    horizons: { shortMs: 500, mediumMs: 1_000, longMs: 2_000 },
  },
  evaluation: {
    selection: { startTs: 1_000, endTs: 1_200 },
    heldOut: { startTs: 1_200, endTs: 2_000 },
    parametersFrozen: true,
    holdoutNeverTuned: true,
    availabilityPolicy: "fixture-policy",
    availabilityEvidenceSha256: declaredHash,
  },
  baselines: ["cash", "hold-initial-inventory", "simple-maker"].map((kind) => ({
    kind,
    journalSha256,
    startTs: 1_000,
    endTs: 2_000,
    initialEquityUsd: 100,
    initialMid: 10,
    initialMon: kind === "cash" ? 0 : 2,
    netPnlUsd: 0,
    maxDrawdownUsd: 0,
    turnoverUsd: 0,
  })),
  costs: Object.fromEntries(
    ["fees", "gas", "model", "slippage", "latency", "fills", "taxes", "liquidation"].map((kind) => [
      kind,
      { status: "known", assumption: "fixture-recorded", evidenceSha256: declaredHash },
    ]),
  ),
  scenarios: ["higher-costs", "slower-fills", "adverse-prices"].map((kind) => ({
    kind,
    assumption: "fixture-declared",
    resultSha256: declaredHash,
  })),
} as const;

describe("analyzeReplayJournal", () => {
  test("preserves the replay and labels an unfilled mark gain as accounting only", () => {
    const { result, assessment } = analyzeReplayJournal({
      journal,
      engineSha256: "a".repeat(64),
    });

    expect(result.finalEquityUsd).toBe(102);
    expect(result.netPnlUsd).toBe(2);
    expect(result.fillCount).toBe(0);
    expect(assessment.schemaVersion).toBe(1);
    expect(assessment.evidenceKind).toBe("accounting-replay-only");
    expect(assessment.strategyQualified).toBe(false);
    expect(assessment.financiallyAuthorized).toBe(false);
    expect(assessment.metadataStatus).toBe("missing");
    expect(assessment.reasons).toEqual([
      "declarations-not-independently-verified",
      "future-returns-not-established",
      "manifest-missing",
      "no-trade-mark-gain",
      "operation-continuity-unverified",
      "realized-gains-not-reconciled",
      "strategy-not-reexecuted",
    ].sort());
    expect(assessment.observed.durationMs).toBe(1_000);
    expect(assessment.observed.marketSampleCount).toBe(1);
  });

  test("reports malformed manifest input as invalid without discarding replay accounting", () => {
    const { result, assessment } = analyzeReplayJournal({
      journal,
      engineSha256: "a".repeat(64),
      manifest: {},
      manifestError: "malformed-json",
    });

    expect(result.netPnlUsd).toBe(2);
    expect(assessment.metadataStatus).toBe("invalid");
    expect(assessment.reasons).toContain("manifest-json-invalid");
    expect(assessment.strategyQualified).toBe(false);
    expect(assessment.financiallyAuthorized).toBe(false);
  });

  test("rejects a manifest that names a different observed journal hash", () => {
    const { result, assessment } = analyzeReplayJournal({
      journal,
      engineSha256: "a".repeat(64),
      manifest: {
        schemaVersion: 1,
        journalSha256: "0".repeat(64),
        engineSha256: "a".repeat(64),
      },
    });

    expect(result.netPnlUsd).toBe(2);
    expect(assessment.metadataStatus).toBe("invalid");
    expect(assessment.reasons).toContain("manifest-journal-hash-mismatch");
  });

  test("classifies declared horizons against observed duration and market gap", () => {
    const { assessment } = analyzeReplayJournal({
      journal,
      engineSha256: "a".repeat(64),
      manifest: {
        coverage: {
          maxGapMs: 1_000,
          horizons: { shortMs: 500, mediumMs: 1_000, longMs: 2_000 },
        },
      },
    });

    expect(assessment.horizons).toEqual({
      short: { requiredMs: 500, observedMs: 1_000, status: "covered" },
      medium: { requiredMs: 1_000, observedMs: 1_000, status: "covered" },
      long: { requiredMs: 2_000, observedMs: 1_000, status: "insufficient" },
    });
  });

  test("accepts a structurally complete declaration without granting qualification", () => {
    const { result, assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: completeManifest,
    });

    expect(result.netPnlUsd).toBe(2);
    expect(assessment.metadataStatus).toBe("declared");
    expect(assessment.strategyQualified).toBe(false);
    expect(assessment.financiallyAuthorized).toBe(false);
    expect(assessment.reasons).toEqual([
      "declarations-not-independently-verified",
      "future-returns-not-established",
      "no-trade-mark-gain",
      "operation-continuity-unverified",
      "realized-gains-not-reconciled",
      "strategy-not-reexecuted",
    ].sort());
  });

  test("marks declared price units mismatch invalid with stable accounting-only reasons", () => {
    const { result, assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        data: {
          ...completeManifest.data,
          units: { ...completeManifest.data.units, price: "MON/USD" },
        },
      },
    });

    expect(result.netPnlUsd).toBe(2);
    expect(assessment.metadataStatus).toBe("invalid");
    expect(assessment.reasons).toEqual([
      "declarations-not-independently-verified",
      "future-returns-not-established",
      "manifest-data-units-price-mismatch",
      "no-trade-mark-gain",
      "operation-continuity-unverified",
      "realized-gains-not-reconciled",
      "strategy-not-reexecuted",
    ].sort());
    expect(assessment.strategyQualified).toBe(false);
    expect(assessment.financiallyAuthorized).toBe(false);
  });

  test("returns identical assessments for repeated inputs without mutating the manifest", () => {
    const manifest = structuredClone(completeManifest);
    const originalManifest = structuredClone(manifest);
    const input = { journal, engineSha256, manifest };

    const first = analyzeReplayJournal(input);
    const second = analyzeReplayJournal(input);

    expect(first.result.netPnlUsd).toBe(2);
    expect(first.assessment.metadataStatus).toBe("declared");
    expect(second).toEqual(first);
    expect(manifest).toEqual(originalManifest);
    expect(first.assessment.strategyQualified).toBe(false);
    expect(first.assessment.financiallyAuthorized).toBe(false);
  });

  test("diagnoses selection and held-out intervals outside observation independently of overlap", () => {
    const { result, assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        evaluation: {
          ...completeManifest.evaluation,
          selection: { startTs: 900, endTs: 950 },
          heldOut: { startTs: 2_050, endTs: 2_100 },
        },
      },
    });

    expect(result.netPnlUsd).toBe(2);
    expect(assessment.metadataStatus).toBe("invalid");
    expect(assessment.reasons).toEqual([
      "declarations-not-independently-verified",
      "future-returns-not-established",
      "manifest-evaluation-heldOut-outside-observation",
      "manifest-evaluation-selection-outside-observation",
      "no-trade-mark-gain",
      "operation-continuity-unverified",
      "realized-gains-not-reconciled",
      "strategy-not-reexecuted",
    ].sort());
    expect(assessment.reasons).not.toContain("manifest-evaluation-overlap");
    expect(assessment.strategyQualified).toBe(false);
    expect(assessment.financiallyAuthorized).toBe(false);
  });

  test("marks a non-boolean evaluation flag invalid instead of treating it as a false declaration", () => {
    const { assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        evaluation: { ...completeManifest.evaluation, parametersFrozen: "true" },
      },
    });

    expect(assessment.metadataStatus).toBe("invalid");
    expect(assessment.reasons).toContain("manifest-parameters-not-frozen-flag-invalid");
  });

  test("preserves the replay journal error before validating the caller-supplied engine digest", () => {
    expect(() => analyzeReplayJournal({ journal: "not-json", engineSha256: "invalid" }))
      .toThrow("journal line 1 is malformed JSON");
  });

  test("keeps all source labels accounting-only even when the replay marks a gain", () => {
    for (const dataSource of ["synthetic", "real-market-paper", "live"] as const) {
      const sourceJournal = [
        { ...session, dataSource },
        { kind: "block", block: 1, ts: 2_000, mid: 11 },
      ].map((event) => JSON.stringify(event)).join("\n");
      const { result, assessment } = analyzeReplayJournal({ journal: sourceJournal, engineSha256 });

      expect(result.netPnlUsd).toBe(2);
      expect(assessment.evidenceKind).toBe("accounting-replay-only");
      expect(assessment.strategyQualified).toBe(false);
      expect(assessment.financiallyAuthorized).toBe(false);
    }
  });

  test("preserves a hand-calculated negative paper replay without upgrading it to authority", () => {
    const paperJournal = [
      { ...session, sessionId: "paper-negative-pnl", dataSource: "real-market-paper" },
      { kind: "block", block: 1, ts: 2_000, mid: 9 },
    ].map((event) => JSON.stringify(event)).join("\n");
    const { result, assessment } = analyzeReplayJournal({ journal: paperJournal, engineSha256 });

    expect(result).toEqual({
      sessionId: "paper-negative-pnl",
      dataSource: "real-market-paper",
      model: "mock",
      durationMs: 1_000,
      decisionCount: 0,
      quoteCount: 0,
      receiptCount: 0,
      fillCount: 0,
      fillCountsByProvenance: { paper: 0, synthetic: 0, live: 0 },
      initialEquityUsd: 100,
      finalEquityUsd: 98,
      netPnlUsd: -2,
      returnPct: -2,
      maxDrawdownUsd: 2,
      maxDrawdownPct: 2,
      turnoverUsd: 0,
      endingCashUsd: 80,
      endingMon: 2,
      costs: { gasUsd: 0, jevUsd: 0, makerFeeUsd: 0, totalUsd: 0 },
      assumptions: [
        "Initial equity is the funded bankroll: uncommitted USD cash plus seeded MON marked at initialMid.",
        "MON buy/sell fills use recorded prices; configured makerFeeBps is charged on every fill.",
        "Simulated quote gasMon is an estimate converted to USD at the quote mid; it is not an observed chain receipt.",
        "Confirmed quote and cancellation receipt gas is charged once per transaction hash; sent quotes have no realized gas charge.",
        "Gas and Jev expenses are paid from journal cash after conversion to USD; this replay does not maintain a separate native-gas wallet.",
        "Recorded Jev USD costs are deducted from cash at their journaled values; mock sessions should record zero.",
        "Aggregate block totals are ignored; individual quote, fill, and cost records are authoritative.",
        "Equity is cash plus MON marked at each event's recorded mid; drawdown is measured from the running equity peak.",
      ],
      caveats: [
        "Replay only: this result describes the supplied journal and does not forecast future returns.",
        "No leverage, annualization, or daily/weekly profit inference is applied.",
        "Paper fills do not model queue priority, competing latency, adverse selection, transfer fees, or taxes.",
      ],
    });
    expect(assessment.reasons).toEqual([
      "declarations-not-independently-verified",
      "future-returns-not-established",
      "manifest-missing",
      "operation-continuity-unverified",
      "realized-gains-not-reconciled",
      "strategy-not-reexecuted",
    ].sort());
    expect(assessment.evidenceKind).toBe("accounting-replay-only");
    expect(assessment.strategyQualified).toBe(false);
    expect(assessment.financiallyAuthorized).toBe(false);
  });

  test("counts only block events as market samples and includes the trailing gap", () => {
    const sparseJournal = [
      session,
      { kind: "block", block: 1, ts: 2_000, mid: 11 },
      { kind: "cost", block: 2, ts: 3_000, mid: 11, jevUsd: 0 },
      { kind: "cost", block: 3, ts: 5_000, mid: 11, jevUsd: 0 },
      { kind: "cost", block: 4, ts: 6_000, mid: 11, jevUsd: 0 },
    ].map((event) => JSON.stringify(event)).join("\n");
    const { assessment } = analyzeReplayJournal({
      journal: sparseJournal,
      engineSha256,
      manifest: {
        coverage: {
          maxGapMs: 1_000,
          horizons: { shortMs: 1_000, mediumMs: 2_000, longMs: 3_000 },
        },
      },
    });

    expect(assessment.observed.marketSampleCount).toBe(1);
    expect(assessment.observed.maxMarketGapMs).toBe(4_000);
    expect(Object.values(assessment.horizons).map((horizon) => horizon.status)).toEqual([
      "insufficient", "insufficient", "insufficient",
    ]);
  });

  test("keeps horizons unknown when the journal has no market samples", () => {
    const noBlockJournal = [
      session,
      { kind: "cost", block: 1, ts: 2_000, mid: 10, jevUsd: 0 },
    ].map((event) => JSON.stringify(event)).join("\n");
    const { assessment } = analyzeReplayJournal({
      journal: noBlockJournal,
      engineSha256,
      manifest: {
        coverage: {
          maxGapMs: 1_000,
          horizons: { shortMs: 500, mediumMs: 1_000, longMs: 2_000 },
        },
      },
    });

    expect(assessment.observed.marketSampleCount).toBe(0);
    expect(assessment.observed.maxMarketGapMs).toBeNull();
    expect(Object.values(assessment.horizons).map((horizon) => horizon.status)).toEqual([
      "unknown", "unknown", "unknown",
    ]);
  });

  test("marks an unknown cost category incomplete instead of treating zero as known", () => {
    const { assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        costs: {
          ...completeManifest.costs,
          fees: { status: "unknown", assumption: "not observed" },
        },
      },
    });

    expect(assessment.metadataStatus).toBe("incomplete");
    expect(assessment.reasons).toContain("manifest-cost-fees-unknown");
  });

  test("distinguishes overlapping evaluation intervals from explicitly false evaluation flags", () => {
    const overlap = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        evaluation: {
          ...completeManifest.evaluation,
          selection: { startTs: 1_000, endTs: 1_500 },
          heldOut: { startTs: 1_400, endTs: 2_000 },
        },
      },
    });
    const falseFlag = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        evaluation: { ...completeManifest.evaluation, parametersFrozen: false },
      },
    });

    expect(overlap.assessment.metadataStatus).toBe("invalid");
    expect(overlap.assessment.reasons).toContain("manifest-evaluation-overlap");
    expect(falseFlag.assessment.metadataStatus).toBe("incomplete");
    expect(falseFlag.assessment.reasons).toContain("manifest-parameters-not-frozen");
  });

  test("reports absent availability evidence, baseline kinds, and scenarios as incomplete", () => {
    const { availabilityPolicy: _policy, availabilityEvidenceSha256: _hash, ...withoutAvailability } =
      completeManifest.evaluation;
    const { assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        evaluation: withoutAvailability,
        baselines: completeManifest.baselines.slice(1),
        scenarios: completeManifest.scenarios.slice(1),
      },
    });

    expect(assessment.metadataStatus).toBe("incomplete");
    expect(assessment.reasons).toContain("manifest-availability-policy-missing");
    expect(assessment.reasons).toContain("manifest-availability-evidence-hash-missing");
    expect(assessment.reasons).toContain("manifest-baseline-cash-missing");
    expect(assessment.reasons).toContain("manifest-scenario-higher-costs-missing");
    expect(assessment.reasons).toEqual([...new Set(assessment.reasons)].sort());
  });

  test("accepts a well-formed baseline journal hash that differs from the strategy journal", () => {
    const baselineJournalHash = "d".repeat(64);
    const { assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        baselines: completeManifest.baselines.map((baseline) => ({
          ...baseline,
          journalSha256: baselineJournalHash,
        })),
      },
    });

    expect(assessment.metadataStatus).toBe("declared");
    expect(assessment.reasons).not.toContain("manifest-baseline-cash-journal-hash-mismatch");
  });

  test("requires a non-empty assumption even for an unknown cost", () => {
    const { assessment } = analyzeReplayJournal({
      journal,
      engineSha256,
      manifest: {
        ...completeManifest,
        costs: {
          ...completeManifest.costs,
          fees: { status: "unknown", assumption: "" },
        },
      },
    });

    expect(assessment.metadataStatus).toBe("invalid");
    expect(assessment.reasons).toContain("manifest-cost-fees-assumption-invalid");
  });

  test("computes the maximum market gap for long journals without spreading an unbounded argument list", () => {
    const blockCount = 150_000;
    const longJournal = [
      JSON.stringify({
        kind: "session",
        ts: 0,
        sessionId: "hand-worked-long-synthetic",
        dataSource: "synthetic",
        model: "mock",
        bankrollUsd: 100,
        initialMon: 0,
        initialMid: 10,
        makerFeeBps: 0,
      }),
      ...Array.from({ length: blockCount }, (_, index) => JSON.stringify({
        kind: "block",
        block: index + 1,
        ts: index + 1,
        mid: 10,
      })),
    ].join("\n");
    const { assessment } = analyzeReplayJournal({ journal: longJournal, engineSha256 });

    expect(assessment.observed.marketSampleCount).toBe(blockCount);
    expect(assessment.observed.maxMarketGapMs).toBe(1);
  });
});
