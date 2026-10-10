import { createHash } from "node:crypto";
import { replayJournal, type ReplayResult } from "./backtest.ts";

export type MetadataStatus = "missing" | "invalid" | "incomplete" | "declared";
export type HorizonStatus = "unknown" | "insufficient" | "covered";

export interface ReplayEvidenceInput {
  journal: string;
  engineSha256: string;
  manifest?: unknown;
  manifestError?: "unreadable" | "malformed-json";
}

export interface ReplayEvidenceAssessment {
  schemaVersion: 1;
  evidenceKind: "accounting-replay-only";
  strategyQualified: false;
  financiallyAuthorized: false;
  metadataStatus: MetadataStatus;
  reasons: string[];
  observed: {
    journalSha256: string;
    engineSha256: string;
    startedAtMs: number;
    endedAtMs: number;
    durationMs: number;
    marketSampleCount: number;
    maxMarketGapMs: number | null;
  };
  horizons: Record<"short" | "medium" | "long", {
    requiredMs: number | null;
    observedMs: number;
    status: HorizonStatus;
  }>;
}

export interface ReplayEvidenceAnalysis {
  result: ReplayResult;
  assessment: ReplayEvidenceAssessment;
}

const ALWAYS_LIMITED_REASONS = [
  "declarations-not-independently-verified",
  "future-returns-not-established",
  "operation-continuity-unverified",
  "realized-gains-not-reconciled",
  "strategy-not-reexecuted",
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJournalRows(journal: string): Record<string, unknown>[] {
  return journal.split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function unknownHorizons(observedMs: number): ReplayEvidenceAssessment["horizons"] {
  const horizon = () => ({ requiredMs: null, observedMs, status: "unknown" as const });
  return { short: horizon(), medium: horizon(), long: horizon() };
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assessHorizons(
  manifest: unknown,
  observedMs: number,
  marketSampleCount: number,
  maxMarketGapMs: number | null,
): ReplayEvidenceAssessment["horizons"] {
  const root = isRecord(manifest) ? manifest : undefined;
  const coverage = root && isRecord(root.coverage) ? root.coverage : undefined;
  const definitions = coverage && isRecord(coverage.horizons) ? coverage.horizons : undefined;
  const rawValues = {
    short: definitions?.shortMs,
    medium: definitions?.mediumMs,
    long: definitions?.longMs,
  };
  const required = {
    short: positiveSafeInteger(rawValues.short) ? rawValues.short : null,
    medium: positiveSafeInteger(rawValues.medium) ? rawValues.medium : null,
    long: positiveSafeInteger(rawValues.long) ? rawValues.long : null,
  };
  const maxGapMs = positiveSafeInteger(coverage?.maxGapMs) ? coverage.maxGapMs : null;
  const definitionsAreValid = required.short !== null && required.medium !== null && required.long !== null &&
    required.short <= required.medium && required.medium <= required.long;
  const canAssess = definitionsAreValid && maxGapMs !== null && marketSampleCount > 0 && maxMarketGapMs !== null;
  const build = (key: keyof typeof required) => {
    const requiredMs = required[key];
    if (!canAssess || requiredMs === null) return { requiredMs, observedMs, status: "unknown" as const };
    const covered = observedMs >= requiredMs && maxMarketGapMs! <= maxGapMs!;
    return { requiredMs, observedMs, status: covered ? "covered" as const : "insufficient" as const };
  };
  return { short: build("short"), medium: build("medium"), long: build("long") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inspectManifest(
  manifest: unknown,
  journalSha256: string,
  engineSha256: string,
  replay: ReplayResult,
  header: Record<string, unknown>,
  startedAtMs: number,
  endedAtMs: number,
): { status: MetadataStatus; reasons: string[] } {
  if (!isRecord(manifest)) return { status: "invalid", reasons: ["manifest-object-invalid"] };
  const reasons = new Set<string>();
  let invalid = false;
  let incomplete = false;
  const missing = (code: string) => { reasons.add(code); incomplete = true; };
  const bad = (code: string) => { reasons.add(code); invalid = true; };
  const readString = (
    row: Record<string, unknown>,
    field: string,
    code: string,
    nonEmpty = true,
  ): string | null => {
    if (!(field in row)) { missing(`${code}-missing`); return null; }
    const value = row[field];
    if (typeof value !== "string" || (nonEmpty && value.trim() === "")) {
      bad(`${code}-invalid`);
      return null;
    }
    return value;
  };
  const readInteger = (
    row: Record<string, unknown>,
    field: string,
    code: string,
    minimum: number,
  ): number | null => {
    if (!(field in row)) { missing(`${code}-missing`); return null; }
    const value = row[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
      bad(`${code}-invalid`);
      return null;
    }
    return value;
  };
  const readFinite = (
    row: Record<string, unknown>,
    field: string,
    code: string,
    minimum: number | null,
  ): number | null => {
    if (!(field in row)) { missing(`${code}-missing`); return null; }
    const value = row[field];
    if (typeof value !== "number" || !Number.isFinite(value) || (minimum !== null && value < minimum)) {
      bad(`${code}-invalid`);
      return null;
    }
    return value;
  };
  const readObject = (
    row: Record<string, unknown>,
    field: string,
    code: string,
  ): Record<string, unknown> | null => {
    if (!(field in row)) { missing(`${code}-missing`); return null; }
    const value = row[field];
    if (!isRecord(value)) { bad(`${code}-invalid`); return null; }
    return value;
  };
  const readHash = (
    row: Record<string, unknown>,
    field: string,
    code: string,
    expected?: string,
  ): string | null => {
    if (!(field in row)) { missing(`${code}-missing`); return null; }
    const value = row[field];
    if (typeof value !== "string" || !/^[a-f\d]{64}$/i.test(value)) {
      bad(`${code}-invalid`);
      return null;
    }
    if (expected !== undefined && value.toLowerCase() !== expected) bad(`${code}-mismatch`);
    return value.toLowerCase();
  };
  if (manifest.schemaVersion === undefined) missing("manifest-schema-version-missing");
  else if (manifest.schemaVersion !== 1) {
    bad("manifest-schema-version-invalid");
  }
  readHash(manifest, "journalSha256", "manifest-journal-hash", journalSha256);
  readHash(manifest, "engineSha256", "manifest-engine-hash", engineSha256);

  const data = readObject(manifest, "data", "manifest-data");
  if (data) {
    for (const field of ["source", "venue", "instrument", "network"] as const) {
      readString(data, field, `manifest-data-${field}`);
    }
    const units = readObject(data, "units", "manifest-data-units");
    if (units) {
      const expectedUnits = { time: "ms", price: "USD/MON", size: "MON", cash: "USD" } as const;
      for (const [field, expected] of Object.entries(expectedUnits)) {
        const value = readString(units, field, `manifest-data-units-${field}`);
        if (value !== null && value !== expected) bad(`manifest-data-units-${field}-mismatch`);
      }
      if (Object.keys(units).some((field) => !(field in expectedUnits))) bad("manifest-data-units-invalid");
    }
    readInteger(data, "resolutionMs", "manifest-data-resolution", 1);
    const dataStart = readInteger(data, "startTs", "manifest-data-start", 0);
    const dataEnd = readInteger(data, "endTs", "manifest-data-end", 0);
    if (dataStart !== null && dataStart !== startedAtMs) bad("manifest-data-start-mismatch");
    if (dataEnd !== null && dataEnd !== endedAtMs) bad("manifest-data-end-mismatch");
  }

  const strategy = readObject(manifest, "strategy", "manifest-strategy");
  if (strategy) {
    readString(strategy, "version", "manifest-strategy-version");
    const model = readString(strategy, "model", "manifest-strategy-model");
    if (model !== null && model !== header.model) bad("manifest-strategy-model-mismatch");
    readHash(strategy, "promptSha256", "manifest-strategy-prompt-hash");
    readHash(strategy, "parametersSha256", "manifest-strategy-parameters-hash");
  }

  const coverage = readObject(manifest, "coverage", "manifest-coverage");
  if (coverage) {
    readInteger(coverage, "maxGapMs", "manifest-coverage-max-gap", 1);
    const horizons = readObject(coverage, "horizons", "manifest-coverage-horizons");
    if (horizons) {
      const short = readInteger(horizons, "shortMs", "manifest-horizon-short", 1);
      const medium = readInteger(horizons, "mediumMs", "manifest-horizon-medium", 1);
      const long = readInteger(horizons, "longMs", "manifest-horizon-long", 1);
      if (short !== null && medium !== null && long !== null && (short > medium || medium > long)) {
        bad("manifest-horizon-order-invalid");
      }
    }
  }

  const evaluation = readObject(manifest, "evaluation", "manifest-evaluation");
  if (evaluation) {
    const readInterval = (field: "selection" | "heldOut") => {
      const interval = readObject(evaluation, field, `manifest-evaluation-${field}`);
      if (!interval) return null;
      const start = readInteger(interval, "startTs", `manifest-evaluation-${field}-start`, 0);
      const end = readInteger(interval, "endTs", `manifest-evaluation-${field}-end`, 0);
      if (start !== null && end !== null) {
        if (start >= end) bad(`manifest-evaluation-${field}-interval-invalid`);
        if (start < startedAtMs || end > endedAtMs) bad(`manifest-evaluation-${field}-outside-observation`);
      }
      return start !== null && end !== null ? { start, end } : null;
    };
    const selection = readInterval("selection");
    const heldOut = readInterval("heldOut");
    if (selection && heldOut && selection.end > heldOut.start) bad("manifest-evaluation-overlap");
    for (const [field, code] of [["parametersFrozen", "manifest-parameters-not-frozen"], ["holdoutNeverTuned", "manifest-heldout-tuned"]] as const) {
      if (!(field in evaluation)) missing(`${code}-flag-missing`);
      else if (evaluation[field] === false) missing(code);
      else if (evaluation[field] !== true) bad(`${code}-flag-invalid`);
    }
    readString(evaluation, "availabilityPolicy", "manifest-availability-policy");
    readHash(evaluation, "availabilityEvidenceSha256", "manifest-availability-evidence-hash");
  }

  const baselineKinds = ["cash", "hold-initial-inventory", "simple-maker"] as const;
  if (!("baselines" in manifest)) {
    for (const kind of baselineKinds) missing(`manifest-baseline-${kind}-missing`);
  } else if (!Array.isArray(manifest.baselines)) {
    bad("manifest-baselines-invalid");
  } else {
    const seen = new Set<string>();
    for (const rawBaseline of manifest.baselines) {
      if (!isRecord(rawBaseline)) { bad("manifest-baseline-invalid"); continue; }
      const kindValue = rawBaseline.kind;
      if (typeof kindValue !== "string" || !baselineKinds.includes(kindValue as typeof baselineKinds[number])) {
        bad("manifest-baseline-kind-invalid");
        continue;
      }
      const kind = kindValue as typeof baselineKinds[number];
      if (seen.has(kind)) bad("manifest-baseline-kind-repeated");
      seen.add(kind);
      const prefix = `manifest-baseline-${kind}`;
      readHash(rawBaseline, "journalSha256", `${prefix}-journal-hash`);
      const start = readInteger(rawBaseline, "startTs", `${prefix}-start`, 0);
      const end = readInteger(rawBaseline, "endTs", `${prefix}-end`, 0);
      if (start !== null && start !== startedAtMs) bad(`${prefix}-start-mismatch`);
      if (end !== null && end !== endedAtMs) bad(`${prefix}-end-mismatch`);
      const initialEquity = readFinite(rawBaseline, "initialEquityUsd", `${prefix}-initial-equity`, 0);
      if (initialEquity !== null && initialEquity !== replay.initialEquityUsd) bad(`${prefix}-initial-equity-mismatch`);
      const initialMid = readFinite(rawBaseline, "initialMid", `${prefix}-initial-mid`, 0);
      if (initialMid !== null && (initialMid <= 0 || initialMid !== header.initialMid)) bad(`${prefix}-initial-mid-mismatch`);
      const initialMon = readFinite(rawBaseline, "initialMon", `${prefix}-initial-mon`, 0);
      const expectedMon = kind === "cash" ? 0 : header.initialMon;
      if (initialMon !== null && initialMon !== expectedMon) bad(`${prefix}-initial-mon-mismatch`);
      readFinite(rawBaseline, "netPnlUsd", `${prefix}-net-pnl`, null);
      readFinite(rawBaseline, "maxDrawdownUsd", `${prefix}-max-drawdown`, 0);
      readFinite(rawBaseline, "turnoverUsd", `${prefix}-turnover`, 0);
    }
    for (const kind of baselineKinds) {
      if (!seen.has(kind)) missing(`manifest-baseline-${kind}-missing`);
    }
  }

  const costKinds = ["fees", "gas", "model", "slippage", "latency", "fills", "taxes", "liquidation"] as const;
  const costs = readObject(manifest, "costs", "manifest-costs");
  if (costs) {
    for (const kind of costKinds) {
      const code = `manifest-cost-${kind}`;
      const cost = readObject(costs, kind, code);
      if (!cost) continue;
      const status = readString(cost, "status", `${code}-status`);
      const assumption = readString(cost, "assumption", `${code}-assumption`);
      if (status !== null && status !== "known" && status !== "unknown" && status !== "not-applicable") {
        bad(`${code}-status-invalid`);
        continue;
      }
      if (status === "known") {
        if (assumption !== null && assumption.trim() === "") bad(`${code}-assumption-invalid`);
        readHash(cost, "evidenceSha256", `${code}-evidence-hash`);
      } else if (status === "unknown") {
        missing(`${code}-unknown`);
        if ("evidenceSha256" in cost) readHash(cost, "evidenceSha256", `${code}-evidence-hash`);
      } else if (status === "not-applicable") {
        if (assumption !== null && assumption.trim() === "") bad(`${code}-assumption-invalid`);
        if ("evidenceSha256" in cost) readHash(cost, "evidenceSha256", `${code}-evidence-hash`);
      }
    }
  }

  const scenarioKinds = ["higher-costs", "slower-fills", "adverse-prices"] as const;
  if (!("scenarios" in manifest)) {
    for (const kind of scenarioKinds) missing(`manifest-scenario-${kind}-missing`);
  } else if (!Array.isArray(manifest.scenarios)) {
    bad("manifest-scenarios-invalid");
  } else {
    const seen = new Set<string>();
    for (const rawScenario of manifest.scenarios) {
      if (!isRecord(rawScenario)) { bad("manifest-scenario-invalid"); continue; }
      const kindValue = rawScenario.kind;
      if (typeof kindValue !== "string" || !scenarioKinds.includes(kindValue as typeof scenarioKinds[number])) {
        bad("manifest-scenario-kind-invalid");
        continue;
      }
      const kind = kindValue as typeof scenarioKinds[number];
      if (seen.has(kind)) bad("manifest-scenario-kind-repeated");
      seen.add(kind);
      const prefix = `manifest-scenario-${kind}`;
      readString(rawScenario, "assumption", `${prefix}-assumption`);
      readHash(rawScenario, "resultSha256", `${prefix}-result-hash`);
    }
    for (const kind of scenarioKinds) {
      if (!seen.has(kind)) missing(`manifest-scenario-${kind}-missing`);
    }
  }

  return {
    status: invalid ? "invalid" : incomplete ? "incomplete" : "declared",
    reasons: [...reasons],
  };
}

/** Analyze a caller-supplied replay journal without accessing files or external state. */
export function analyzeReplayJournal(input: ReplayEvidenceInput): ReplayEvidenceAnalysis {
  const result = replayJournal(input.journal);
  if (!/^[a-f\d]{64}$/i.test(input.engineSha256)) {
    throw new Error("engineSha256 must be a 64-character hexadecimal SHA-256 digest");
  }

  const rows = parseJournalRows(input.journal);
  const header = rows[0]!;
  const lastEvent = rows[rows.length - 1]!;
  const startedAtMs = header.ts as number;
  const endedAtMs = lastEvent.ts as number;
  const marketRows = rows.slice(1).filter((row) => row.kind === "block");
  const marketTimes = marketRows.map((row) => row.ts as number);
  let maxMarketGapMs: number | null = null;
  if (marketTimes.length > 0) {
    maxMarketGapMs = marketTimes[0]! - startedAtMs;
    for (let index = 1; index < marketTimes.length; index += 1) {
      maxMarketGapMs = Math.max(maxMarketGapMs, marketTimes[index]! - marketTimes[index - 1]!);
    }
    maxMarketGapMs = Math.max(maxMarketGapMs, endedAtMs - marketTimes[marketTimes.length - 1]!);
  }

  const journalSha256 = sha256(input.journal);
  const engineSha256 = input.engineSha256.toLowerCase();
  const reasons: string[] = [...ALWAYS_LIMITED_REASONS];
  if (result.fillCount === 0 && result.netPnlUsd > 0) reasons.push("no-trade-mark-gain");
  const manifestErrorReason = input.manifestError === "unreadable"
    ? "manifest-unreadable"
    : input.manifestError === "malformed-json" ? "manifest-json-invalid" : undefined;
  let metadataStatus: MetadataStatus;
  if (manifestErrorReason) {
    reasons.push(manifestErrorReason);
    metadataStatus = "invalid";
  } else if (input.manifest === undefined) {
    reasons.push("manifest-missing");
    metadataStatus = "missing";
  } else {
    const manifestAudit = inspectManifest(
      input.manifest,
      journalSha256,
      engineSha256,
      result,
      header,
      startedAtMs,
      endedAtMs,
    );
    reasons.push(...manifestAudit.reasons);
    metadataStatus = manifestAudit.status;
  }

  return {
    result,
    assessment: {
      schemaVersion: 1,
      evidenceKind: "accounting-replay-only",
      strategyQualified: false,
      financiallyAuthorized: false,
      metadataStatus,
      reasons: [...new Set(reasons)].sort(),
      observed: {
        journalSha256,
        engineSha256,
        startedAtMs,
        endedAtMs,
        durationMs: result.durationMs,
        marketSampleCount: marketTimes.length,
        maxMarketGapMs,
      },
      horizons: assessHorizons(
        manifestErrorReason ? undefined : input.manifest,
        result.durationMs,
        marketTimes.length,
        maxMarketGapMs,
      ),
    },
  };
}
