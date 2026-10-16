import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { buildAnalysis } from "../../src/agent/analysis";
import { createScoreboard } from "../../src/agent/scoreboard";
import { createFillStore } from "../../src/agent/fills";
import { createAgentLedger } from "../../src/agent/ledger";
import { parseBudgetState } from "../../src/agent/budget";
import { equitySeries, parseSnapshotLine } from "../../src/agent/equity-log";
import { resolveHome } from "../../src/desktop/paths";
import type { EvidenceMeasurement, EvidenceSnapshot, EvidenceSource } from "./contracts";

const ROOT = resolve(import.meta.dir, "../..");
const OUTPUT = resolve(import.meta.dir, "fixtures", "evidence.json");
const QUANT_BAR_MS = 900_000;
const QUANT_SCHEMA = "quant_candles_v1";
const QUANT_SOURCE = "okx_public_v5_history_candles";
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const FEE_MINOR = /^(0|[1-9]\d{0,79})$/;

type JsonRecord = Record<string, unknown>;
type SourceIssue = "source_file_missing" | "source_not_regular_file" | "source_outside_repository" | "source_unreadable" | "source_json_invalid";

interface LoadedSource {
  readonly id: string;
  readonly path: string;
  readonly classification: EvidenceSource["classification"];
  readonly limitations: readonly string[];
  readonly sha256: string | null;
  readonly payload: unknown;
  readonly issue: SourceIssue | null;
  asOfMs: number | null;
}

interface SourceSpec {
  readonly id: string;
  readonly path: string;
  readonly classification: EvidenceSource["classification"];
  readonly limitations: readonly string[];
}

interface QuantSpec extends SourceSpec {
  readonly measurementPrefix: string;
  readonly instrument: string;
}

const quantLimitations = [
  "The producer declares the public OKX candle source; origin is not independently authenticated.",
  "The source SHA-256 is an exact-byte fingerprint, not proof of authenticity.",
  "Public 15m market candles are not wallet positions, DEX execution prices, or wallet PnL.",
] as const;

const quantSources: readonly QuantSpec[] = [
  { id: "quant90_btc", path: "data/quant/BTC-USDT-SWAP-15m.json", classification: "public_market", instrument: "BTC-USDT-SWAP", measurementPrefix: "market.quant90.BTC", limitations: quantLimitations },
  { id: "quant90_eth", path: "data/quant/ETH-USDT-SWAP-15m.json", classification: "public_market", instrument: "ETH-USDT-SWAP", measurementPrefix: "market.quant90.ETH", limitations: quantLimitations },
  { id: "quant90_sol", path: "data/quant/SOL-USDT-SWAP-15m.json", classification: "public_market", instrument: "SOL-USDT-SWAP", measurementPrefix: "market.quant90.SOL", limitations: quantLimitations },
  { id: "quant90_doge", path: "data/quant/DOGE-USDT-SWAP-15m.json", classification: "public_market", instrument: "DOGE-USDT-SWAP", measurementPrefix: "market.quant90.DOGE", limitations: quantLimitations },
  { id: "quant90_mon", path: "data/quant/MON-USDT-SWAP-15m.json", classification: "public_market", instrument: "MON-USDT-SWAP", measurementPrefix: "market.quant90.MON", limitations: quantLimitations },
  { id: "quant365_btc", path: "data/quant-365/BTC-USDT-SWAP-15m.json", classification: "public_market", instrument: "BTC-USDT-SWAP", measurementPrefix: "market.quant365.BTC", limitations: quantLimitations },
  { id: "quant365_eth", path: "data/quant-365/ETH-USDT-SWAP-15m.json", classification: "public_market", instrument: "ETH-USDT-SWAP", measurementPrefix: "market.quant365.ETH", limitations: quantLimitations },
];

const executionSpec: SourceSpec = {
  id: "audit_execution",
  path: "data/decision-review/execution-latest.json",
  classification: "local_process",
  limitations: [
    "This is a local audit projection, not a whole-wallet ledger.",
    "Receipt cash movements do not establish net USD PnL; native fees lack contemporaneous USD conversion.",
    "The source SHA-256 is an exact-byte fingerprint, not proof of authenticity.",
  ],
};
const reviewSpec: SourceSpec = {
  id: "audit_review",
  path: "data/decision-review/latest.json",
  classification: "local_process",
  limitations: [
    "This is a local review projection, not an independent account-wide performance history.",
    "Only safe counts and source availability time are retained; review text and identifiers are excluded.",
    "The source SHA-256 is an exact-byte fingerprint, not proof of authenticity.",
  ],
};
const evolutionSpec: SourceSpec = {
  id: "audit_evolution",
  path: "data/decision-review/evolution/latest.json",
  classification: "local_process",
  limitations: [
    "Prospective references and pending experiments are process diagnostics, not financial outcomes.",
    "Only safe counts and source availability time are retained; identifiers and experience content are excluded.",
    "The source SHA-256 is an exact-byte fingerprint, not proof of authenticity.",
  ],
};
const agentJournalsSpec: SourceSpec = {
  id: "agent_analysis",
  path: "runtime-home/data/agent/",
  classification: "local_process",
  limitations: [
    "Aggregate projections use only the fixed briefs, ledger, fills, and scoreboard journals.",
    "Per-file exact-byte fingerprints are recorded separately; this aggregate has no single source hash.",
    "Only approved numeric/boolean summaries, histograms, and bounded display ranks are emitted; no raw journal text, symbols, addresses, event identifiers, or row values are included.",
    "Malformed JSONL records are counted and make every dependent aggregate unknown; supported analysis is limited to the existing pure buildAnalysis projection.",
  ],
};
const equitySpec: SourceSpec = {
  id: "agent_equity",
  path: "runtime-home/data/agent/equity.jsonl",
  classification: "local_process",
  limitations: [
    "Only pure parsed snapshot summaries and equitySeries aggregates are retained; asset IDs and holding-level rows are never emitted.",
    "USD values are partial price-marked snapshots; missing/inexact holdings, external flows, and complete-wallet coverage are not reconciled.",
    "Raw balance changes include deposits, withdrawals, and market movement; they are not flow-adjusted returns or net PnL.",
  ],
};
const agentBudgetSpec: SourceSpec = {
  id: "agent_budget",
  path: "runtime-home/data/agent/budget.json",
  classification: "local_process",
  limitations: [
    "Only strict parseBudgetState counters are retained; no budget constructor, persistence, caps, or settings resolver is invoked.",
    "Committed tokens include estimates for unmeasured/running calls; measured tokens remain a separate counter.",
  ],
};

const runtimeAgentSpecs: readonly SourceSpec[] = [
  { id: "agent_briefs", path: "runtime-home/data/agent/briefs.jsonl", classification: "local_process", limitations: ["JSONL bytes are fingerprinted exactly; only allowlisted aggregate analysis is emitted.", "Malformed schema rows are counted; dependent metrics remain unknown.", "No raw briefs, symbols, addresses, IDs, or text are retained."] },
  { id: "agent_ledger", path: "runtime-home/data/agent/ledger.jsonl", classification: "local_process", limitations: ["Read through the in-memory ledger parser; append is never called.", "Only order outcome and spend aggregates are emitted; row values and identifiers are excluded."] },
  { id: "agent_fills", path: "runtime-home/data/agent/fills.jsonl", classification: "local_process", limitations: ["Read through the in-memory fill parser; append is never called.", "Only aggregate fill, fee, trip, and bounded numeric display metrics are emitted; symbols, addresses, and transaction identifiers are excluded."] },
  { id: "agent_scoreboard", path: "runtime-home/data/agent/scoreboard.jsonl", classification: "local_process", limitations: ["Malformed schema rows are counted; dependent markout metrics remain unknown.", "Only allowlisted numeric Placar aggregates and bounded numeric display ranks are emitted; decisions, symbols, IDs, and free text are excluded."] },
];
const usageLedgerSpec: SourceSpec = {
  id: "usage_ledger",
  path: "runtime-home/data/inonu/ledger.jsonl",
  classification: "local_process",
  limitations: ["Only measured USD (`usd`), measured token/call counters, and latency are included; estimated USD is excluded.", "Only daily and monthly totals are retained; the source may be bounded by the application ledger.", "No prompt, answer, key, model name, row ID, or result text is emitted."],
};
const providerBudgetSpec: SourceSpec = {
  id: "onchain_budget",
  path: "runtime-home/data/onchain/usage-2026-10.json",
  classification: "local_process",
  limitations: ["Counters are projected from the exact bytes fingerprinted for this source; no budget constructor, write, or flush is invoked.", "The JSON month is an accounting period, not an event timestamp; today and projection require a timestamp from another runtime source."],
};
const settingsCapsSpec: SourceSpec = {
  id: "settings_caps",
  path: "runtime-home/data/settings/user.json",
  classification: "local_process",
  limitations: ["Only schema-checked numeric onchain basic and premium caps are retained.", "Other preferences and any unknown fields are excluded; no settings store or secret resolver is instantiated."],
};

function buildAnalysisUnknownMetrics(): readonly (readonly [id: string, unit: string])[] {
  const metrics: (readonly [string, string])[] = [
    ["analysis.at_ms", "ms"],
    ["analysis.source.invalid_brief_rows", "invalid rows"],
    ["analysis.source.invalid_ledger_rows", "invalid rows"],
    ["analysis.source.invalid_fill_rows", "invalid rows"],
    ["analysis.source.invalid_scoreboard_rows", "invalid rows"],
    ["analysis.source.missing_open_candidate_choice_scores", "open buy candidates without a raw Choice score"],
    ["analysis.funnel.consults", "consults"], ["analysis.funnel.items", "items"], ["analysis.funnel.closed", "items"], ["analysis.funnel.open", "items"],
    ["analysis.funnel.asked", "items"], ["analysis.funnel.applied", "items"], ["analysis.funnel.executed", "orders"], ["analysis.funnel.failed", "orders"],
    ["analysis.asks.count", "asks"], ["analysis.timeline.count", "consults"],
    ["analysis.trips.count", "trips"], ["analysis.trips.gross_in_usdc", "USDC gross entry cash before network fee"],
    ["analysis.trips.gross_out_usdc", "USDC gross exit cash before network fee"], ["analysis.trips.gross_delta_usdc", "USDC gross cash delta before network fee"],
    ["analysis.trips.gross_return_pct_mean", "% gross cash return before network fee; not wallet performance"],
    ["analysis.trips.negative_count", "trips"],
    ["analysis.fees.lamports", "lamports"], ["analysis.fees.native_sol", "SOL"], ["analysis.fees.usd_fx", "USD per SOL"],
    ["analysis.fees.fills", "fills"], ["analysis.fees.unmatched_sells", "sells"],
    ["analysis.orders.outcomes.executed", "orders"], ["analysis.orders.outcomes.failed", "orders"], ["analysis.orders.outcomes.uncertain", "orders"],
    ["analysis.orders.reasons.by_code.count", "distinct reason codes; raw codes excluded"],
    ["analysis.orders.spent_today.buy_usd", "USD recorded order spend"], ["analysis.orders.spent_today.sell_usd", "USD recorded order spend"],
    ["analysis.recent.count", "events"], ["analysis.runtime.tokens_today", "tokens"], ["analysis.runtime.risk_pct", "%"],
    ["hud.results.cumulative_trip_cash.points_count", "numeric cumulative series points including origin"],
    ["hud.results.cumulative_trip_cash.few_trips_warning", "boolean; fewer than five matched trips"],
  ];
  metrics.push(
    ["hud.preference_buy_histogram.total", "raw scored-choice observations"],
    ["hud.preference_buy_histogram.fresh", "raw scored-choice observations; rank-v1 consultations"],
  );
  for (const section of ["all", "fresh"] as const) {
    for (let bin = 0; bin < 20; bin += 1) metrics.push([`analysis.hist.${section}.bin_${String(bin).padStart(2, "0")}`, "raw preference count; not calibrated probability"]);
  }
  for (let rank = 0; rank < 10; rank += 1) {
    const prefix = `analysis.asks.rank_${String(rank).padStart(2, "0")}`;
    metrics.push([`${prefix}.timestamp_ms`, "ms"], [`${prefix}.p_buy_score`, "raw Choice score 0-1; not calibrated probability"], [`${prefix}.order_applied`, "boolean"]);
  }
  for (let rank = 0; rank < 30; rank += 1) {
    const prefix = `analysis.timeline.rank_${String(rank).padStart(2, "0")}`;
    metrics.push([`${prefix}.timestamp_ms`, "ms"], [`${prefix}.open_candidates`, "items"], [`${prefix}.asked_candidates`, "items"], [`${prefix}.applied_candidates`, "items"]);
  }
  for (let rank = 0; rank < 2; rank += 1) {
    const prefix = `analysis.trips.display.rank_${String(rank).padStart(2, "0")}`;
    metrics.push(
      [`${prefix}.gross_entry_usdc`, "USDC gross entry cash before network fee"],
      [`${prefix}.gross_exit_usdc`, "USDC gross exit cash before network fee"],
      [`${prefix}.gross_return_pct`, "% per-trip gross cash return before network fee; not wallet performance"],
      [`${prefix}.buy_at_ms`, "ms"], [`${prefix}.sell_at_ms`, "ms"], [`${prefix}.duration_min`, "minutes"],
    );
  }
  for (const group of ["skipped", "closed", "gated"] as const) {
    for (const window of ["15m", "1h"] as const) {
      const prefix = `analysis.placar.${group}.${window}`;
      metrics.push(
        [`${prefix}.n`, "CEX proxy markout observations"],
        [`${prefix}.up`, "positive CEX proxy markout observations"],
        [`${prefix}.mean_pct`, "% CEX proxy price move before costs"],
        [`${prefix}.up_pct`, "% positive CEX proxy markouts"],
      );
      for (let bin = 0; bin < 10; bin += 1) metrics.push([`${prefix}.hist.bin_${String(bin).padStart(2, "0")}`, "CEX proxy markout count"]);
      for (const field of ["n", "up", "up_pct", "mean_pct"] as const) {
        metrics.push([`hud.command.markout.${group}.${window}.${field}`, field === "up_pct" || field === "mean_pct" ? "%" : "CEX proxy markout observations"]);
      }
    }
  }
  for (let rank = 0; rank < 14; rank += 1) {
    const prefix = `analysis.recent.rank_${String(rank).padStart(2, "0")}`;
    metrics.push([`${prefix}.timestamp_ms`, "ms"], [`${prefix}.markout_15m_pct`, "% CEX proxy price move before costs"], [`${prefix}.markout_1h_pct`, "% CEX proxy price move before costs"]);
  }
  for (let rank = 0; rank < 6; rank += 1) metrics.push([`analysis.orders.reasons.rank_${String(rank).padStart(2, "0")}.count`, "orders"]);
  for (const [id, unit] of [
    ["hud.funnel.items_to_open_pct", "% rounded to whole percent"], ["hud.funnel.open_to_asked_pct", "% rounded to whole percent"],
    ["hud.funnel.asked_to_applied_pct", "% rounded to whole percent"], ["hud.funnel.applied_to_executed_pct", "% rounded to whole percent"],
    ["hud.funnel.closed_by_code_count", "items"], ["hud.funnel.skipped_by_jev_count", "items"],
    ["hud.funnel.blocked_by_code_count", "items"], ["hud.funnel.not_executed_count", "orders"],
  ] as const) metrics.push([id, unit]);
  return metrics;
}

const analysisUnknownMetrics = buildAnalysisUnknownMetrics();

const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const isSafeCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isTimestamp = (value: unknown): value is number => isSafeCount(value) && value <= 8_640_000_000_000_000;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

function isInside(base: string, path: string): boolean {
  const rel = relative(base, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}


function loadPath(spec: SourceSpec, fullPath: string, lexicalRoot: string, actualRoot: string, parseJson: boolean): LoadedSource {
  if (!isInside(lexicalRoot, fullPath)) {
    return { ...spec, sha256: null, asOfMs: null, payload: null, issue: "source_outside_repository" };
  }

  let bytes: Uint8Array;
  try {
    const info = lstatSync(fullPath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      return { ...spec, sha256: null, asOfMs: null, payload: null, issue: "source_not_regular_file" };
    }
    const actualPath = realpathSync.native(fullPath);
    if (!isInside(actualRoot, actualPath)) {
      return { ...spec, sha256: null, asOfMs: null, payload: null, issue: "source_outside_repository" };
    }
    bytes = readFileSync(fullPath);
  } catch (error) {
    const code = isRecord(error) ? error.code : null;
    return { ...spec, sha256: null, asOfMs: null, payload: null, issue: code === "ENOENT" ? "source_file_missing" : "source_unreadable" };
  }

  const fingerprint = sha256(bytes);
  const text = Buffer.from(bytes).toString("utf8");
  if (!parseJson) return { ...spec, sha256: fingerprint, asOfMs: null, payload: text, issue: null };
  try {
    return { ...spec, sha256: fingerprint, asOfMs: null, payload: JSON.parse(text) as unknown, issue: null };
  } catch {
    return { ...spec, sha256: fingerprint, asOfMs: null, payload: null, issue: "source_json_invalid" };
  }
}

function loadSource(spec: SourceSpec): LoadedSource {
  const fullPath = resolve(ROOT, spec.path);
  return loadPath(spec, fullPath, ROOT, ROOT, true);
}

function loadRuntimeSource(spec: SourceSpec, runtimeHome: string, parseJson: boolean): LoadedSource {
  const relativePath = spec.path.slice("runtime-home/".length);
  const lexicalRoot = resolve(runtimeHome);
  const fullPath = resolve(lexicalRoot, relativePath);
  let actualRoot = lexicalRoot;
  try {
    actualRoot = realpathSync.native(lexicalRoot);
  } catch {
    // A missing runtime home remains a missing source; no absolute path is included in output.
  }
  return loadPath(spec, fullPath, lexicalRoot, actualRoot, parseJson);
}

function setAsOf(bundle: LoadedSource, value: unknown): void {
  bundle.asOfMs = isTimestamp(value) ? value : null;
}

function issueReason(bundle: LoadedSource): string {
  switch (bundle.issue) {
    case "source_file_missing": return "source_file_missing";
    case "source_not_regular_file": return "source_not_regular_file";
    case "source_outside_repository": return "source_outside_repository";
    case "source_unreadable": return "source_unreadable";
    case "source_json_invalid": return "source_json_invalid";
    case null: return "source_projection_unavailable";
  }
}

function sourceRecord(bundle: LoadedSource): EvidenceSource {
  const limitations = [...bundle.limitations];
  if (bundle.issue !== null) limitations.push(`Availability limitation: ${bundle.issue}.`);
  return {
    id: bundle.id,
    path: bundle.path,
    sha256: bundle.sha256,
    asOfMs: bundle.asOfMs,
    classification: bundle.classification,
    limitations,
  };
}

function addMeasurement(
  measurements: EvidenceMeasurement[],
  id: string,
  value: number | string | boolean | null,
  unit: string,
  status: EvidenceMeasurement["status"],
  reason: string | null,
  sourceId: string,
): void {
  if (value === null) {
    if (status !== "unknown" || reason === null) throw new Error("unknown_measurement_contract_invalid");
  } else if (status === "unknown" || reason !== null || (typeof value === "number" && !Number.isFinite(value))) {
    throw new Error("known_measurement_contract_invalid");
  }
  measurements.push({ id, value, unit, status, reason, sourceId });
}

function addUnknown(measurements: EvidenceMeasurement[], id: string, unit: string, sourceId: string, reason: string): void {
  addMeasurement(measurements, id, null, unit, "unknown", reason, sourceId);
}

function canonicalCandlesDigest(candles: readonly unknown[]): string | null {
  if (!candles.every(isRecord)) return null;
  const canonical = JSON.stringify(candles.map((raw) => {
    const candle = raw as JsonRecord;
    return [candle.startMs, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.confirmed];
  }));
  return sha256(canonical);
}

function validCandle(raw: unknown): raw is JsonRecord {
  if (!isRecord(raw)) return false;
  return isTimestamp(raw.startMs)
    && isFiniteNumber(raw.open) && isFiniteNumber(raw.high) && isFiniteNumber(raw.low) && isFiniteNumber(raw.close)
    && (raw.volume === null || isFiniteNumber(raw.volume))
    && typeof raw.confirmed === "boolean";
}

function quantFailureReason(bundle: LoadedSource, schemaValid: boolean, digestMatches: boolean | null): string {
  if (bundle.issue !== null) return issueReason(bundle);
  if (!schemaValid) return "quant_schema_invalid";
  if (digestMatches === false) return "canonical_digest_mismatch";
  return "canonical_digest_unavailable";
}

function processQuant(spec: QuantSpec, bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const raw = isRecord(bundle.payload) ? bundle.payload : null;
  if (raw !== null) setAsOf(bundle, raw.capturedAtMs);

  const candlesValue = raw?.candles;
  const candles = Array.isArray(candlesValue) ? candlesValue : null;
  const candlesShapeValid = candles !== null && candles.every(validCandle);
  const schemaValid = raw !== null
    && raw.schema === QUANT_SCHEMA
    && raw.instId === spec.instrument
    && raw.bar === "15m"
    && raw.barMs === QUANT_BAR_MS
    && candlesShapeValid;
  const schemaDeclared = raw !== null && typeof raw.schema === "string" ? raw.schema === QUANT_SCHEMA : null;
  const declaredSource = raw !== null && typeof raw.source === "string" ? raw.source === QUANT_SOURCE : null;
  const declaredCountMatches = raw !== null && candles !== null && isSafeCount(raw.count) ? raw.count === candles.length : null;
  const canonicalDigest = candles === null ? null : canonicalCandlesDigest(candles);
  const digestMatches = raw !== null && canonicalDigest !== null && typeof raw.sha256 === "string" && HEX_SHA256.test(raw.sha256)
    ? canonicalDigest === raw.sha256 : null;

  if (raw === null || bundle.issue !== null) {
    const reason = issueReason(bundle);
    addUnknown(measurements, `${spec.measurementPrefix}.schema_declared`, "boolean", spec.id, reason);
    addUnknown(measurements, `${spec.measurementPrefix}.schema_valid`, "boolean", spec.id, reason);
    addUnknown(measurements, `${spec.measurementPrefix}.source_declared`, "boolean", spec.id, reason);
    addUnknown(measurements, `${spec.measurementPrefix}.declared_count_matches`, "boolean", spec.id, reason);
    addUnknown(measurements, `${spec.measurementPrefix}.canonical_digest_matches`, "boolean", spec.id, reason);
  } else {
    if (schemaDeclared === null) addUnknown(measurements, `${spec.measurementPrefix}.schema_declared`, "boolean", spec.id, "quant_schema_declaration_missing");
    else addMeasurement(measurements, `${spec.measurementPrefix}.schema_declared`, schemaDeclared, "boolean", "observed", null, spec.id);
    addMeasurement(measurements, `${spec.measurementPrefix}.schema_valid`, schemaValid, "boolean", "observed", null, spec.id);
    if (declaredSource === null) addUnknown(measurements, `${spec.measurementPrefix}.source_declared`, "boolean", spec.id, "quant_source_declaration_missing");
    else addMeasurement(measurements, `${spec.measurementPrefix}.source_declared`, declaredSource, "boolean", "observed", null, spec.id);
    if (declaredCountMatches === null) addUnknown(measurements, `${spec.measurementPrefix}.declared_count_matches`, "boolean", spec.id, "declared_count_unavailable");
    else addMeasurement(measurements, `${spec.measurementPrefix}.declared_count_matches`, declaredCountMatches, "boolean", "derived", null, spec.id);
    if (digestMatches === null) addUnknown(measurements, `${spec.measurementPrefix}.canonical_digest_matches`, "boolean", spec.id, "canonical_digest_unavailable");
    else addMeasurement(measurements, `${spec.measurementPrefix}.canonical_digest_matches`, digestMatches, "boolean", "derived", null, spec.id);
  }

  const statsUsable = bundle.issue === null && schemaValid && digestMatches === true && candles !== null;
  const statsReason = quantFailureReason(bundle, schemaValid, digestMatches);
  const valueOrUnknown = (id: string, value: number | null, unit: string): void => {
    if (!statsUsable || value === null) addUnknown(measurements, `${spec.measurementPrefix}.${id}`, unit, spec.id, !statsUsable ? statsReason : "no_confirmed_timestamp");
    else addMeasurement(measurements, `${spec.measurementPrefix}.${id}`, value, unit, "derived", null, spec.id);
  };

  if (!statsUsable || candles === null) {
    for (const [id, unit] of [
      ["bars_total", "candles"], ["bars_confirmed", "candles"], ["complete_ohlc_bars", "candles"], ["confirmed_complete_ohlc_bars", "candles"],
      ["duplicate_confirmed_timestamps", "candles"], ["first_confirmed_at_ms", "ms"], ["last_confirmed_at_ms", "ms"], ["temporal_span_ms", "ms"],
      ["max_gap_ms", "ms"], ["gaps_gt_15m", "gaps"],
    ] as const) addUnknown(measurements, `${spec.measurementPrefix}.${id}`, unit, spec.id, statsReason);
    return;
  }

  const confirmed = candles.filter((candle) => (candle as JsonRecord).confirmed === true) as JsonRecord[];
  const completeOhlc = candles.reduce((count, candle) => {
    const c = candle as JsonRecord;
    return count + (isFiniteNumber(c.open) && isFiniteNumber(c.high) && isFiniteNumber(c.low) && isFiniteNumber(c.close) ? 1 : 0);
  }, 0);
  const confirmedCompleteOhlc = confirmed.reduce((count, c) => count + (isFiniteNumber(c.open) && isFiniteNumber(c.high) && isFiniteNumber(c.low) && isFiniteNumber(c.close) ? 1 : 0), 0);
  const timestamps = confirmed.map((c) => c.startMs as number).sort((a, b) => a - b);
  const uniqueTimestamps = timestamps.filter((timestamp, index) => index === 0 || timestamp !== timestamps[index - 1]);
  let maxGap: number | null = null;
  let gapsOver15m: number | null = uniqueTimestamps.length === 0 ? null : 0;
  for (let index = 1; index < uniqueTimestamps.length; index += 1) {
    const gap = uniqueTimestamps[index]! - uniqueTimestamps[index - 1]!;
    maxGap = maxGap === null || gap > maxGap ? gap : maxGap;
    if (gap > QUANT_BAR_MS) gapsOver15m = (gapsOver15m ?? 0) + 1;
  }

  addMeasurement(measurements, `${spec.measurementPrefix}.bars_total`, candles.length, "candles", "derived", null, spec.id);
  addMeasurement(measurements, `${spec.measurementPrefix}.bars_confirmed`, confirmed.length, "candles", "derived", null, spec.id);
  addMeasurement(measurements, `${spec.measurementPrefix}.complete_ohlc_bars`, completeOhlc, "candles", "derived", null, spec.id);
  addMeasurement(measurements, `${spec.measurementPrefix}.confirmed_complete_ohlc_bars`, confirmedCompleteOhlc, "candles", "derived", null, spec.id);
  addMeasurement(measurements, `${spec.measurementPrefix}.duplicate_confirmed_timestamps`, timestamps.length - uniqueTimestamps.length, "candles", "derived", null, spec.id);
  valueOrUnknown("first_confirmed_at_ms", uniqueTimestamps[0] ?? null, "ms");
  valueOrUnknown("last_confirmed_at_ms", uniqueTimestamps.at(-1) ?? null, "ms");
  valueOrUnknown("temporal_span_ms", uniqueTimestamps.length === 0 ? null : uniqueTimestamps.at(-1)! - uniqueTimestamps[0]!, "ms");
  valueOrUnknown("max_gap_ms", maxGap, "ms");
  valueOrUnknown("gaps_gt_15m", gapsOver15m, "gaps");
}

function addScalar(
  measurements: EvidenceMeasurement[],
  id: string,
  value: number | boolean | null,
  unit: string,
  sourceId: string,
  status: "observed" | "derived" = "observed",
  reason = "projection_field_invalid",
): void {
  if (value === null) addUnknown(measurements, id, unit, sourceId, reason);
  else addMeasurement(measurements, id, value, unit, status, null, sourceId);
}

function processExecution(bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const root = isRecord(bundle.payload) ? bundle.payload : null;
  if (root !== null) setAsOf(bundle, root.observedAtMs);
  const schemaValid = bundle.issue === null && root !== null && root.version === 1;
  const sourceReason = bundle.issue === null ? "projection_schema_invalid" : issueReason(bundle);
  const orders = root !== null && Array.isArray(root.orders) && root.orders.every(isRecord) ? root.orders : null;
  const roundTrips = root !== null && Array.isArray(root.roundTrips) && root.roundTrips.every(isRecord) ? root.roundTrips : null;
  const addFromRoot = (key: string, id: string, unit: string): void => {
    const value = root?.[key];
    addScalar(measurements, id, schemaValid && isSafeCount(value) ? value : null, unit, bundle.id, "observed", sourceReason);
  };

  addScalar(measurements, "audit.execution.observed_at_ms", schemaValid && isTimestamp(root?.observedAtMs) ? root.observedAtMs : null, "ms", bundle.id, "observed", sourceReason);
  addFromRoot("invalidLines", "audit.execution.invalid_lines", "lines");
  const incompleteFinalLine = schemaValid && typeof root?.incompleteFinalLine === "boolean" ? root.incompleteFinalLine : null;
  addScalar(measurements, "audit.execution.incomplete_final_line", incompleteFinalLine, "boolean", bundle.id, "observed", sourceReason);
  addFromRoot("invalidOrderRows", "audit.execution.invalid_order_rows", "orders");
  const completeLedger = schemaValid && typeof root?.completeLedger === "boolean" ? root.completeLedger : null;
  addScalar(measurements, "audit.execution.complete_ledger", completeLedger, "boolean", bundle.id, "observed", sourceReason);
  addScalar(measurements, "audit.execution.orders_total", schemaValid && orders !== null ? orders.length : null, "orders", bundle.id, "observed", sourceReason);
  addScalar(measurements, "audit.execution.round_trips", schemaValid && roundTrips !== null ? roundTrips.length : null, "round trips", bundle.id, "observed", sourceReason);

  const fillsValid = orders !== null && orders.every((order) => order.fill === null || isRecord(order.fill));
  addScalar(measurements, "audit.execution.fills_exact", schemaValid && fillsValid ? orders.reduce((count, order) => count + (order.fill === null ? 0 : 1), 0) : null, "fills", bundle.id, "derived", sourceReason);
  const feeFieldsValid = orders !== null && orders.every((order) => order.walletFeeLamports === null || (typeof order.walletFeeLamports === "string" && FEE_MINOR.test(order.walletFeeLamports)));
  addScalar(measurements, "audit.execution.fee_known_orders", schemaValid && feeFieldsValid ? orders.reduce((count, order) => count + (order.walletFeeLamports === null ? 0 : 1), 0) : null, "orders", bundle.id, "derived", sourceReason);
  const orderNetValid = orders !== null && orders.every((order) => order.netUsd === null || isFiniteNumber(order.netUsd));
  addScalar(measurements, "audit.execution.net_usd_known_orders", schemaValid && orderNetValid ? orders.reduce((count, order) => count + (order.netUsd === null ? 0 : 1), 0) : null, "orders", bundle.id, "derived", sourceReason);
  const tripNetValid = roundTrips !== null && roundTrips.every((trip) => trip.netUsd === null || isFiniteNumber(trip.netUsd));
  addScalar(measurements, "audit.execution.round_trips_net_usd_known", schemaValid && tripNetValid ? roundTrips.reduce((count, trip) => count + (trip.netUsd === null ? 0 : 1), 0) : null, "round trips", bundle.id, "derived", sourceReason);
  addUnknown(measurements, "audit.execution.fee_cost_usd_known_orders", "orders", bundle.id, "contemporaneous_fee_usd_conversion_unavailable");
  addUnknown(measurements, "audit.portfolio.external_flows_reconciled", "boolean", bundle.id, "whole_wallet_reconciliation_unavailable");
}

function timestampFromIso(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return isTimestamp(parsed) ? parsed : null;
}

function processReview(bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const root = isRecord(bundle.payload) ? bundle.payload : null;
  const observedAtMs = timestampFromIso(root?.observedAt);
  if (observedAtMs !== null) setAsOf(bundle, observedAtMs);
  const schemaValid = bundle.issue === null && root !== null && root.version === 1;
  const reviews = root !== null && Array.isArray(root.reviews) && root.reviews.every(isRecord) ? root.reviews : null;
  const reason = bundle.issue === null ? "projection_schema_invalid" : issueReason(bundle);
  addScalar(measurements, "audit.review.observed_at_ms", schemaValid ? observedAtMs : null, "ms", bundle.id, "observed", reason);
  addScalar(measurements, "audit.review.review_count", schemaValid && reviews !== null ? reviews.length : null, "reviews", bundle.id, "observed", reason);
  for (const [field, id, unit] of [
    ["invalidLines", "audit.review.invalid_lines", "lines"],
    ["sourceGap", "audit.review.source_gap", "boolean"],
    ["sourceIncompleteFinalLine", "audit.review.source_incomplete_final_line", "boolean"],
    ["sourceWindowTruncated", "audit.review.source_window_truncated", "boolean"],
  ] as const) {
    const value = root?.[field];
    const valid = field === "sourceGap" || field === "sourceIncompleteFinalLine" || field === "sourceWindowTruncated" ? typeof value === "boolean" : isSafeCount(value);
    addScalar(measurements, id, schemaValid && valid ? value as number | boolean : null, unit, bundle.id, "observed", reason);
  }
}

function processEvolution(bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const root = isRecord(bundle.payload) ? bundle.payload : null;
  if (root !== null) setAsOf(bundle, root.recordedAtMs);
  const prospective = isRecord(root?.prospective) ? root.prospective : null;
  const report = isRecord(prospective?.report) ? prospective.report : null;
  const schemaValid = bundle.issue === null && root !== null && prospective?.ok === true && report?.schemaVersion === 1;
  const reason = bundle.issue === null ? "projection_schema_invalid" : issueReason(bundle);
  addScalar(measurements, "evolution.recorded_at_ms", schemaValid && isTimestamp(root?.recordedAtMs) ? root.recordedAtMs : null, "ms", bundle.id, "observed", reason);
  for (const [field, id] of [
    ["uniqueReferences", "evolution.references_valid"],
    ["validReferenceLines", "evolution.valid_reference_lines"],
    ["boundReferences", "evolution.references_bound"],
    ["awaitingSourceReferences", "evolution.references_awaiting_source"],
    ["pendingExperienceCount", "evolution.experiments_pending"],
    ["matureOutcomes", "evolution.outcomes_mature"],
    ["uniqueEnvelopes", "evolution.envelopes_unique"],
    ["validEnvelopeLines", "evolution.valid_envelope_lines"],
  ] as const) {
    const value = report?.[field];
    addScalar(measurements, id, schemaValid && isSafeCount(value) ? value : null, "records", bundle.id, "observed", reason);
  }
}

interface JsonLineData {
  readonly lines: readonly string[];
  readonly rows: readonly unknown[];
  readonly invalidJson: boolean;
  readonly invalidJsonCount: number;
  readonly incompleteFinalLine: boolean;
}

function readJsonLines(bundle: LoadedSource): JsonLineData {
  if (bundle.issue !== null || typeof bundle.payload !== "string") {
    return { lines: [], rows: [], invalidJson: false, invalidJsonCount: 0, incompleteFinalLine: false };
  }
  const text = bundle.payload;
  const completeEnd = text.lastIndexOf("\n") + 1;
  const incompleteFinalLine = completeEnd < text.length && text.slice(completeEnd).trim().length > 0;
  const completeText = incompleteFinalLine ? text.slice(0, completeEnd) : text;
  const lines = completeText.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows: unknown[] = [];
  let invalidJsonCount = 0;
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as unknown);
    } catch {
      rows.push(null);
      invalidJsonCount += 1;
    }
  }
  return { lines, rows, invalidJson: invalidJsonCount > 0, invalidJsonCount, incompleteFinalLine };
}

function setAsOfFromRows(bundle: LoadedSource, rows: readonly unknown[], includeSettlements = false): number | null {
  let max: number | null = null;
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const atMs = isTimestamp(row.atMs) ? row.atMs : null;
    const settledAtMs = includeSettlements && row.kind === "settlement" && isTimestamp(row.settledAtMs) ? row.settledAtMs : null;
    for (const value of [atMs, settledAtMs]) if (value !== null && (max === null || value > max)) max = value;
  }
  bundle.asOfMs = max;
  return max;
}

function lineSourceProblem(bundle: LoadedSource, rows: JsonLineData): string | null {
  if (bundle.issue !== null) return issueReason(bundle);
  if (rows.invalidJson) return "source_jsonl_invalid_line";
  if (rows.incompleteFinalLine) return "source_jsonl_incomplete_final_line";
  return null;
}

const isText = (value: unknown, maxLength = 400): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maxLength;
const isNullableText = (value: unknown, maxLength = 400): value is string | null =>
  value === null || isText(value, maxLength);
const isStringMap = (value: unknown, allowedKeys?: ReadonlySet<string>): value is JsonRecord =>
  isRecord(value) && Object.entries(value).every(([key, entry]) =>
    (allowedKeys === undefined || allowedKeys.has(key)) && isText(entry, 80));

function isBriefAnalysisRow(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.cycleId, 80) || !isTimestamp(value.atMs) || !isText(value.criteria, 80)) return false;
  if (value.valid !== undefined && typeof value.valid !== "boolean") return false;
  if (value.invalidReason !== undefined && !isNullableText(value.invalidReason, 200)) return false;
  if (value.physicalRequests !== undefined && !isSafeCount(value.physicalRequests)) return false;
  if (!isRecord(value.brief) || !isRecord(value.brief.compras) || !Array.isArray(value.candidates)) return false;
  if (!isRecord(value.requested) || !isRecord(value.stances) || !isRecord(value.verdicts)) return false;
  const ids = new Set<string>();
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isText(candidate.id, 80) || (candidate.kind !== "buy" && candidate.kind !== "holding")) return false;
    if (!Array.isArray(candidate.stances) || candidate.stances.length === 0 || !candidate.stances.every((stance) => isText(stance, 80))) return false;
    if (ids.has(candidate.id)) return false;
    ids.add(candidate.id);
  }
  if (!isStringMap(value.requested, ids) || !isStringMap(value.stances, ids)) return false;
  if ([...ids].some((id) => !Object.hasOwn(value.requested as JsonRecord, id) || !Object.hasOwn(value.stances as JsonRecord, id))) return false;
  for (const [id, scores] of Object.entries(value.verdicts)) {
    if (!ids.has(id) || !isRecord(scores)) return false;
    if (Object.entries(scores).some(([name, score]) => !isText(name, 80) || !isFiniteNumber(score) || score < 0 || score > 1)) return false;
  }
  return true;
}

function isLedgerAnalysisRow(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.cycleId) || !isTimestamp(value.atMs)) return false;
  if (value.kind === "cycle") {
    return isText(value.mode, 80)
      && ["mantido", "decidido", "bloqueado", "erro"].includes(String(value.outcome))
      && isNullableText(value.reason)
      && isNullableText(value.modelo)
      && (value.posture === null || isText(value.posture, 80))
      && isStringMap(value.stances)
      && isSafeCount(value.planned)
      && Array.isArray(value.dropped)
      && value.dropped.every((entry) => isRecord(entry) && isText(entry.candidateId) && isText(entry.reason));
  }
  if (value.kind !== "order") return false;
  return isText(value.orderKey)
    && ["preparada", "enviando", "executada", "falhou", "incerta"].includes(String(value.stage))
    && isText(value.candidateId)
    && (value.side === "buy" || value.side === "sell")
    && isText(value.stance)
    && isText(value.chainIndex)
    && isText(value.symbol)
    && isText(value.address)
    && (value.wallet === "agente" || value.wallet === "principal")
    && isFiniteNumber(value.usd) && value.usd >= 0
    && isNullableText(value.amountMinor)
    && isNullableText(value.ref)
    && isNullableText(value.reason)
    && (value.profile === undefined || isNullableText(value.profile))
    && (value.source === undefined || value.source === "modelo" || value.source === "protecao")
    && (value.balanceBeforeMinor === undefined || isNullableText(value.balanceBeforeMinor))
    && (value.detail === undefined || (typeof value.detail === "string" && value.detail.length <= 200));
}

function isFillAnalysisRow(value: unknown): value is JsonRecord {
  if (!isRecord(value) || value.kind !== "fill" || !isText(value.orderKey) || !isTimestamp(value.atMs)) return false;
  return (value.atSource === "chain" || value.atSource === "ledger")
    && (value.side === "buy" || value.side === "sell")
    && isText(value.mint)
    && isText(value.symbol, 80)
    && isText(value.signature)
    && typeof value.tokenMinor === "string" && /^[1-9]\d{0,79}$/.test(value.tokenMinor)
    && isSafeCount(value.tokenDecimals) && value.tokenDecimals <= 255
    && isNullableText(value.cashMint)
    && (value.cashUnits === null || (isFiniteNumber(value.cashUnits) && value.cashUnits > 0))
    && (value.cashMint === null) === (value.cashUnits === null)
    && (value.feeLamports === null || (typeof value.feeLamports === "string" && FEE_MINOR.test(value.feeLamports)))
    && (value.walletFeeLamports === null || (typeof value.walletFeeLamports === "string" && FEE_MINOR.test(value.walletFeeLamports)))
    && (value.nativeDeltaLamports === null || (typeof value.nativeDeltaLamports === "string" && /^-?(0|[1-9]\d{0,79})$/.test(value.nativeDeltaLamports)));
}

function isScoreboardAnalysisRow(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.key, 80)) return false;
  if (value.kind === "decision") {
    if (!isText(value.cycleId) || !isTimestamp(value.atMs)
      || !isText(value.mode, 80) || (value.side !== "buy" && value.side !== "sell")
      || !isText(value.candidateId) || !isText(value.chainIndex) || !isText(value.address)
      || !isText(value.symbol, 80) || !isText(value.stance) || !isFiniteNumber(value.usd) || value.usd < 0
      || !(value.entryPriceUsd === null || (isFiniteNumber(value.entryPriceUsd) && value.entryPriceUsd > 0))
      || !(value.costUsd === null || (isFiniteNumber(value.costUsd) && value.costUsd >= 0))
      || !isText(value.posture, 80) || !isNullableText(value.profile)
      || (value.source !== "modelo" && value.source !== "protecao")
      || !Array.isArray(value.families) || !value.families.every((entry) => isText(entry, 80))
      || !Array.isArray(value.triggers) || !value.triggers.every((entry) => isText(entry, 80))
      || (value.wallet !== "agente" && value.wallet !== "principal")
      || (value.inaction !== undefined && typeof value.inaction !== "boolean")) return false;
    if (value.facets !== undefined && (!isRecord(value.facets) || Object.values(value.facets).some((score) => !isFiniteNumber(score) || score < 0 || score > 1))) return false;
    return true;
  }
  return value.kind === "settlement"
    && isText(value.key, 80)
    && ["15m", "1h", "4h", "24h"].includes(String(value.window))
    && isTimestamp(value.settledAtMs)
    && (value.priceUsd === null || (isFiniteNumber(value.priceUsd) && value.priceUsd >= 0))
    && isNullableText(value.reason);
}

export function inspectAgentAnalysisRows(
  briefs: readonly unknown[],
  ledger: readonly unknown[],
  fills: readonly unknown[],
  scoreboard: readonly unknown[],
): {
  readonly invalidBriefRows: number;
  readonly invalidLedgerRows: number;
  readonly invalidFillRows: number;
  readonly invalidScoreboardRows: number;
  readonly missingOpenCandidateChoiceScores: number;
} {
  const countInvalid = (rows: readonly unknown[], validate: (row: unknown) => boolean): number =>
    rows.reduce<number>((count, row) => count + (validate(row) ? 0 : 1), 0);
  return {
    invalidBriefRows: countInvalid(briefs, isBriefAnalysisRow),
    invalidLedgerRows: countInvalid(ledger, isLedgerAnalysisRow),
    invalidFillRows: countInvalid(fills, isFillAnalysisRow),
    invalidScoreboardRows: countInvalid(scoreboard, isScoreboardAnalysisRow),
    missingOpenCandidateChoiceScores: briefs.reduce<number>((count, row) => {
      if (!isBriefAnalysisRow(row)) return count;
      const brief = row as JsonRecord;
      const candidates = brief.candidates as readonly JsonRecord[];
      const verdicts = brief.verdicts as JsonRecord;
      return count + candidates.filter((candidate) => {
        if (candidate.kind !== "buy" || !Array.isArray(candidate.stances) || candidate.stances.length <= 1) return false;
        const scores = isRecord(verdicts[candidate.id as string]) ? verdicts[candidate.id as string] as JsonRecord : {};
        return !Object.entries(scores).some(([name, score]) => name.startsWith("buy") && isFiniteNumber(score));
      }).length;
    }, 0),
  };
}

function fillRowsComplete(rows: readonly unknown[], fills: readonly { readonly orderKey: string; readonly signature: string }[]): boolean {
  const orderKeys = new Set<string>();
  const signatures = new Set<string>();
  for (const row of rows) {
    if (!isFillAnalysisRow(row)) return false;
    if (orderKeys.has(row.orderKey as string) || signatures.has(row.signature as string)) return false;
    orderKeys.add(row.orderKey as string);
    signatures.add(row.signature as string);
  }
  return orderKeys.size === fills.length;
}

function firstProblem(...reasons: (string | null)[]): string | null {
  return reasons.find((reason) => reason !== null) ?? null;
}

export function processAgentAnalysis(bundle: LoadedSource, sources: readonly LoadedSource[], measurements: EvidenceMeasurement[]): void {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const briefsSource = byId.get("agent_briefs")!;
  const ledgerSource = byId.get("agent_ledger")!;
  const fillsSource = byId.get("agent_fills")!;
  const scoreboardSource = byId.get("agent_scoreboard")!;
  const briefsLines = readJsonLines(briefsSource);
  const ledgerLines = readJsonLines(ledgerSource);
  const fillsLines = readJsonLines(fillsSource);
  const scoreboardLines = readJsonLines(scoreboardSource);
  const allSourceTimes = [
    setAsOfFromRows(briefsSource, briefsLines.rows),
    setAsOfFromRows(ledgerSource, ledgerLines.rows),
    setAsOfFromRows(fillsSource, fillsLines.rows),
    setAsOfFromRows(scoreboardSource, scoreboardLines.rows, true),
  ].filter((value): value is number => value !== null);
  bundle.asOfMs = allSourceTimes.length === 0 ? null : Math.max(...allSourceTimes);

  const ledger = createAgentLedger({
    read: () => ledgerLines.lines,
    append: () => { throw new Error("freeze_read_only"); },
  });
  const fillStore = createFillStore({
    read: () => fillsLines.lines,
    append: () => { throw new Error("freeze_read_only"); },
  });
  const fills = fillStore.all();
  const rowValidity = inspectAgentAnalysisRows(briefsLines.rows, ledgerLines.rows, fillsLines.rows, scoreboardLines.rows);
  const briefsProblem = firstProblem(
    lineSourceProblem(briefsSource, briefsLines),
    rowValidity.invalidBriefRows === 0 ? null : "agent_brief_schema_invalid",
  );
  const ledgerProblem = firstProblem(
    lineSourceProblem(ledgerSource, ledgerLines),
    rowValidity.invalidLedgerRows === 0 ? null : "agent_ledger_schema_invalid",
    ledger.health().ok ? null : "agent_ledger_corrupt",
  );
  const fillsProblem = firstProblem(
    lineSourceProblem(fillsSource, fillsLines),
    rowValidity.invalidFillRows === 0 ? null : "agent_fill_schema_invalid",
    fillRowsComplete(fillsLines.rows, fills) ? null : "agent_fill_rows_not_fully_accepted",
  );
  const scoreboardProblem = firstProblem(
    lineSourceProblem(scoreboardSource, scoreboardLines),
    rowValidity.invalidScoreboardRows === 0 ? null : "agent_scoreboard_schema_invalid",
  );
  const analysisNowMs = bundle.asOfMs;
  if (analysisNowMs !== null && scoreboardProblem === null) {
    const scoreboard = createScoreboard({
      read: () => scoreboardLines.lines,
      append: () => { throw new Error("freeze_read_only"); },
    });
    const summary = scoreboard.summary(analysisNowMs);
    const record = scoreboard.record("1h", analysisNowMs, analysisNowMs - 14 * 24 * 3_600_000);
    const emitScoreboard = (id: string, value: number | null, unit: string): void => {
      if (scoreboardProblem !== null) addUnknown(measurements, id, unit, scoreboardSource.id, scoreboardProblem);
      else if (value === null) addUnknown(measurements, id, unit, scoreboardSource.id, "scoreboard_metric_unavailable");
      else addMeasurement(measurements, id, value, unit, "observed", null, scoreboardSource.id);
    };
    for (const [window, windows] of Object.entries({
      all: summary.windows,
      inaction: summary.inaction.windows,
      "by_mode.desligado": summary.byMode.desligado,
      "by_mode.sombra": summary.byMode.sombra,
      "by_mode.limitado": summary.byMode.limitado,
    })) {
      for (const period of ["15m", "1h", "4h", "24h"] as const) {
        const row = windows?.[period];
        for (const field of ["n", "notional_usd", "overlapping", "settled", "pending", "unknown_price", "gross_usd", "net_usd", "hit_rate_ratio"] as const) {
          const value = row === undefined ? null : field === "n" ? row.n
            : field === "notional_usd" ? row.notionalUsd
              : field === "overlapping" ? row.overlapping
                : field === "settled" ? row.settled
                  : field === "pending" ? row.pending
                    : field === "unknown_price" ? row.unknownPrice
                      : field === "gross_usd" ? row.grossUsd
                        : field === "net_usd" ? row.netUsd
                          : row.hitRate;
          const unit = field.endsWith("_usd") ? "USD" : field === "hit_rate_ratio" ? "ratio" : "decisions";
          emitScoreboard(`status.scoreboard.${period}.${window}.${field}`, value, unit);
        }
      }
    }
    for (const [id, value] of [
      ["status.scoreboard.decisions", summary.decisions],
      ["status.scoreboard.protective", summary.protective],
      ["status.scoreboard.no_entry_price", summary.noEntryPrice],
      ["status.scoreboard.inaction_decisions", summary.inaction.decisions],
    ] as const) emitScoreboard(id, value, "decisions");
    const evidenceWindow = summary.windows["24h"];
    for (const [field, value, unit] of [
      ["settled", evidenceWindow.settled, "decisions"],
      ["net_usd", evidenceWindow.netUsd, "USD"],
      ["gross_usd", evidenceWindow.grossUsd, "USD"],
    ] as const) emitScoreboard(`status.evidence.24h.${field}`, value, unit);
    emitScoreboard("status.performance.record.14d_window_1h.groups.count", Object.keys(record).length, "groups");
    const groups = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
    for (let index = 0; index < groups.length; index += 1) {
      const rank = String(index + 1).padStart(5, "0");
      const [, group] = groups[index]!;
      for (const [field, value] of [
        ["n", group.n],
        ["acerto", group.acerto],
        ["medio", group.medio ?? null],
        ["melhor", group.melhor ?? null],
        ["pior", group.pior ?? null],
      ] as const) {
        emitScoreboard(`status.performance.record.14d_window_1h.groups.rank_${rank}.${field}`, value, field === "n" ? "decisions" : field === "acerto" ? "percent" : "percent");
      }
    }
  } else {
    const reason = scoreboardProblem ?? "status_timestamp_unavailable";
    for (const partition of ["all", "inaction", "by_mode.desligado", "by_mode.sombra", "by_mode.limitado"]) {
      for (const period of ["15m", "1h", "4h", "24h"] as const) {
        for (const field of ["n", "notional_usd", "overlapping", "settled", "pending", "unknown_price", "gross_usd", "net_usd", "hit_rate_ratio"] as const) {
          const unit = field.endsWith("_usd") ? "USD" : field === "hit_rate_ratio" ? "ratio" : "decisions";
          addUnknown(measurements, `status.scoreboard.${period}.${partition}.${field}`, unit, scoreboardSource.id, reason);
        }
      }
    }
    for (const [id, unit] of [
      ["status.scoreboard.decisions", "decisions"],
      ["status.scoreboard.protective", "decisions"],
      ["status.scoreboard.no_entry_price", "decisions"],
      ["status.scoreboard.inaction_decisions", "decisions"],
      ["status.evidence.24h.settled", "decisions"],
      ["status.evidence.24h.net_usd", "USD"],
      ["status.evidence.24h.gross_usd", "USD"],
      ["status.performance.record.14d_window_1h.groups.count", "groups"],
    ] as const) addUnknown(measurements, id, unit, scoreboardSource.id, reason);
  }
  const analysis = buildAnalysis({
    nowMs: analysisNowMs ?? 0,
    briefs: briefsLines.rows,
    orders: ledger.orderRecords(),
    fills,
    scoreboard: scoreboardLines.rows,
  });
  const briefRows = briefsLines.rows.filter(isBriefAnalysisRow) as JsonRecord[];
  const validRowsProblem = (source: LoadedSource): string | null =>
    source.issue === null ? null : issueReason(source);
  const invalidCountValues = new Map<string, number>([
    ["analysis.source.invalid_brief_rows", rowValidity.invalidBriefRows],
    ["analysis.source.invalid_ledger_rows", rowValidity.invalidLedgerRows],
    ["analysis.source.invalid_fill_rows", rowValidity.invalidFillRows],
    ["analysis.source.invalid_scoreboard_rows", rowValidity.invalidScoreboardRows],
    ["analysis.source.missing_open_candidate_choice_scores", rowValidity.missingOpenCandidateChoiceScores],
  ]);
  const invalidCountReasons = new Map<string, string | null>([
    ["analysis.source.invalid_brief_rows", validRowsProblem(briefsSource)],
    ["analysis.source.invalid_ledger_rows", validRowsProblem(ledgerSource)],
    ["analysis.source.invalid_fill_rows", validRowsProblem(fillsSource)],
    ["analysis.source.invalid_scoreboard_rows", validRowsProblem(scoreboardSource)],
    ["analysis.source.missing_open_candidate_choice_scores", briefsProblem],
  ]);

  const allFillsUsed = fillsProblem === null && fills.every((fill) =>
    typeof fill.symbol === "string" && isTimestamp(fill.atMs) && isFiniteNumber(fill.cashUnits),
  );
  const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const usdcCashKnown = allFillsUsed && (fills.length === 0 || fills.every((fill) =>
    fill.cashMint === usdcMint && isFiniteNumber(fill.cashUnits),
  ));
  let exactFeeTotal: number | null = 0;
  let feeTotalBig = 0n;
  for (const fill of fills) {
    const fee = fill.walletFeeLamports;
    if (typeof fee !== "string" || !/^\d{1,18}$/.test(fee)) {
      exactFeeTotal = null;
      break;
    }
    feeTotalBig += BigInt(fee);
    if (feeTotalBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      exactFeeTotal = null;
      break;
    }
  }
  if (exactFeeTotal !== null) exactFeeTotal = Number(feeTotalBig);
  if (exactFeeTotal !== null && exactFeeTotal !== analysis.fees.lamports) exactFeeTotal = null;

  const values = new Map<string, number | boolean>();
  const reasons = new Map<string, string>();
  const put = (id: string, value: number | boolean): void => {
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) values.set(id, value);
  };
  const setUnknownReason = (id: string, reason: string): void => { reasons.set(id, reason); };
  put("analysis.at_ms", analysisNowMs ?? Number.NaN);
  for (const [id, value] of invalidCountValues) put(id, value);
  for (const field of ["consults", "items", "closed", "open", "asked", "applied", "executed", "failed"] as const) {
    put(`analysis.funnel.${field}`, analysis.funnel[field]);
  }
  put("analysis.asks.count", analysis.asks.length);
  put("analysis.timeline.count", analysis.timeline.length);
  put("analysis.trips.count", analysis.trips.length);
  put("analysis.fees.fills", analysis.fees.fills);
  put("analysis.fees.unmatched_sells", analysis.fees.unmatchedSells);

  const askScores: (number | null)[] = [];
  for (const brief of briefRows.slice(-25)) {
    const requested = brief.requested as JsonRecord;
    const verdicts = brief.verdicts as JsonRecord;
    for (const candidate of brief.candidates as readonly JsonRecord[]) {
      if (candidate.kind !== "buy" || !Array.isArray(candidate.stances) || candidate.stances.length <= 1) continue;
      const request = requested[candidate.id as string];
      if (typeof request !== "string" || request === "skip") continue;
      const rawScores = isRecord(verdicts[candidate.id as string]) ? verdicts[candidate.id as string] as JsonRecord : {};
      const buyScores = Object.entries(rawScores)
        .filter(([name, score]) => name.startsWith("buy") && isFiniteNumber(score))
        .map(([, score]) => score as number);
      askScores.push(buyScores.length === 0 ? null : Math.max(...buyScores));
    }
  }
  const asks = analysis.asks.slice(-10).reverse();
  for (let rank = 0; rank < 10; rank += 1) {
    const ask = asks[rank];
    const prefix = `analysis.asks.rank_${String(rank).padStart(2, "0")}`;
    if (ask === undefined) continue;
    const score = askScores[analysis.asks.length - 1 - rank] ?? null;
    put(`${prefix}.timestamp_ms`, ask.t);
    put(`${prefix}.order_applied`, ask.ok);
    if (score === null) setUnknownReason(`${prefix}.p_buy_score`, "raw_choice_score_not_recorded");
    else put(`${prefix}.p_buy_score`, score);
  }
  for (let rank = 0; rank < analysis.timeline.length; rank += 1) {
    const point = analysis.timeline[rank]!;
    const prefix = `analysis.timeline.rank_${String(rank).padStart(2, "0")}`;
    put(`${prefix}.timestamp_ms`, point.t);
    put(`${prefix}.open_candidates`, point.open);
    put(`${prefix}.asked_candidates`, point.asked);
    put(`${prefix}.applied_candidates`, point.applied);
  }

  for (const section of ["all", "fresh"] as const) {
    const bins = analysis.hist[section];
    const total = bins.reduce((sum, value) => sum + value, 0);
    put(`hud.preference_buy_histogram.${section === "all" ? "total" : "fresh"}`, total);
    for (let bin = 0; bin < 20; bin += 1) put(`analysis.hist.${section}.bin_${String(bin).padStart(2, "0")}`, bins[bin] ?? 0);
  }

  const trips = analysis.trips;
  const tripInputsProblem = fillsProblem ?? (!allFillsUsed ? "fill_cash_input_incomplete" : !usdcCashKnown ? "cash_denomination_not_verified_usdc" : null);
  if (tripInputsProblem === null) {
    const grossIn = trips.reduce((sum, trip) => sum + trip.in, 0);
    const grossOut = trips.reduce((sum, trip) => sum + trip.out, 0);
    put("analysis.trips.negative_count", trips.filter((trip) => trip.pct < 0).length);
    put("analysis.trips.gross_in_usdc", Math.round(grossIn * 10_000) / 10_000);
    put("analysis.trips.gross_out_usdc", Math.round(grossOut * 10_000) / 10_000);
    put("analysis.trips.gross_delta_usdc", Math.round((grossOut - grossIn) * 10_000) / 10_000);
    if (trips.length > 0) put("analysis.trips.gross_return_pct_mean", Math.round(trips.reduce((sum, trip) => sum + trip.pct, 0) / trips.length * 100) / 100);
    else setUnknownReason("analysis.trips.gross_return_pct_mean", "no_closed_round_trips");
    put("hud.results.cumulative_trip_cash.points_count", trips.length + 1);
    put("hud.results.cumulative_trip_cash.few_trips_warning", trips.length < 5);
    let cumulative = 0;
    for (let rank = 0; rank < trips.length; rank += 1) {
      const trip = trips[rank]!;
      const delta = trip.out - trip.in;
      cumulative += delta;
      const prefix = `analysis.trips.cumulative.rank_${String(rank).padStart(5, "0")}`;
      put(`${prefix}.sale_timestamp_ms`, trip.sellAt);
      put(`${prefix}.gross_delta_usdc`, delta);
      put(`${prefix}.cumulative_gross_cash_delta_usdc`, cumulative);
    }
    for (const [rank, trip] of trips.slice(-2).entries()) {
      const prefix = `analysis.trips.display.rank_${String(rank).padStart(2, "0")}`;
      put(`${prefix}.gross_entry_usdc`, trip.in);
      put(`${prefix}.gross_exit_usdc`, trip.out);
      put(`${prefix}.gross_return_pct`, trip.pct);
      put(`${prefix}.buy_at_ms`, trip.buyAt);
      put(`${prefix}.sell_at_ms`, trip.sellAt);
      put(`${prefix}.duration_min`, Math.round((trip.sellAt - trip.buyAt) / 60_000));
    }
  } else {
    for (const id of [
      "analysis.trips.negative_count", "analysis.trips.gross_in_usdc", "analysis.trips.gross_out_usdc", "analysis.trips.gross_delta_usdc",
      "analysis.trips.gross_return_pct_mean", "hud.results.cumulative_trip_cash.points_count", "hud.results.cumulative_trip_cash.few_trips_warning",
    ]) setUnknownReason(id, tripInputsProblem);
  }

  for (const group of ["skipped", "closed", "gated"] as const) {
    for (const window of ["15m", "1h"] as const) {
      const stats = analysis.placar[group][window];
      const prefix = `analysis.placar.${group}.${window}`;
      put(`${prefix}.n`, stats.n);
      put(`${prefix}.up`, stats.up);
      if (stats.mean !== null) put(`${prefix}.mean_pct`, stats.mean);
      else setUnknownReason(`${prefix}.mean_pct`, "no_markout_observations");
      if (stats.n > 0) put(`${prefix}.up_pct`, Math.round((stats.up / stats.n) * 100));
      else setUnknownReason(`${prefix}.up_pct`, "no_markout_observations");
      for (const field of ["n", "up", "up_pct", "mean_pct"] as const) {
        const hudId = `hud.command.markout.${group}.${window}.${field}`;
        const value = values.get(`${prefix}.${field}`);
        if (value !== undefined) put(hudId, value);
        else setUnknownReason(hudId, reasons.get(`${prefix}.${field}`) ?? "markout_value_unavailable");
      }
      if (stats.n < 5) {
        for (let bin = 0; bin < 10; bin += 1) setUnknownReason(`${prefix}.hist.bin_${String(bin).padStart(2, "0")}`, "hud_histogram_hidden_below_five_observations");
      } else {
        const bins = new Array<number>(10).fill(0);
        for (const markout of stats.vals) {
          const clipped = Math.min(19.999, Math.max(-20, markout));
          const index = Math.min(9, Math.max(0, Math.floor((clipped + 20) / 4)));
          bins[index] = (bins[index] ?? 0) + 1;
        }
        for (let bin = 0; bin < 10; bin += 1) put(`${prefix}.hist.bin_${String(bin).padStart(2, "0")}`, bins[bin] ?? 0);
      }
      for (let rank = 0; rank < stats.vals.length; rank += 1) {
        put(`${prefix}.rank_${String(rank).padStart(5, "0")}.markout_pct`, stats.vals[rank]!);
      }
    }
  }

  put("analysis.orders.outcomes.executed", analysis.orders.outcomes.executada ?? 0);
  put("analysis.orders.outcomes.failed", analysis.orders.outcomes.falhou ?? 0);
  put("analysis.orders.outcomes.uncertain", analysis.orders.outcomes.incerta ?? 0);
  put("analysis.orders.reasons.by_code.count", Object.keys(analysis.orders.reasons).length);
  Object.values(analysis.orders.reasons).slice(0, 6).forEach((count, rank) => {
    const id = `analysis.orders.reasons.rank_${String(rank).padStart(2, "0")}.count`;
    if (typeof count === "number" && Number.isFinite(count)) put(id, count);
    else setUnknownReason(id, "order_reason_count_not_numeric");
  });
  put("analysis.orders.spent_today.buy_usd", analysis.orders.spentToday.buy);
  put("analysis.orders.spent_today.sell_usd", analysis.orders.spentToday.sell);
  put("analysis.recent.count", analysis.recent.length);
  const recent = [...analysis.recent]
    .sort((left, right) => Number((right.m15 !== null || right.m1h !== null)) - Number((left.m15 !== null || left.m1h !== null)) || right.t - left.t)
    .slice(0, 14);
  for (let rank = 0; rank < 14; rank += 1) {
    const event = recent[rank];
    if (event === undefined) continue;
    const prefix = `analysis.recent.rank_${String(rank).padStart(2, "0")}`;
    put(`${prefix}.timestamp_ms`, event.t);
    if (event.m15 === null) setUnknownReason(`${prefix}.markout_15m_pct`, "markout_window_pending_or_unpriced");
    else put(`${prefix}.markout_15m_pct`, event.m15);
    if (event.m1h === null) setUnknownReason(`${prefix}.markout_1h_pct`, "markout_window_pending_or_unpriced");
    else put(`${prefix}.markout_1h_pct`, event.m1h);
  }

  if (exactFeeTotal !== null) {
    put("analysis.fees.lamports", exactFeeTotal);
    put("analysis.fees.native_sol", exactFeeTotal / 1_000_000_000);
  }
  setUnknownReason("analysis.fees.usd_fx", "no_contemporaneous_sol_usd_fx_in_frozen_sources");

  const funnelPercent = (id: string, numerator: number, denominator: number): void => {
    if (denominator === 0) setUnknownReason(id, "funnel_denominator_zero");
    else if (numerator < 0 || numerator > denominator) setUnknownReason(id, "funnel_stage_counts_inconsistent");
    else put(id, Math.round((numerator / denominator) * 100));
  };
  funnelPercent("hud.funnel.items_to_open_pct", analysis.funnel.open, analysis.funnel.items);
  funnelPercent("hud.funnel.open_to_asked_pct", analysis.funnel.asked, analysis.funnel.open);
  funnelPercent("hud.funnel.asked_to_applied_pct", analysis.funnel.applied, analysis.funnel.asked);
  funnelPercent("hud.funnel.applied_to_executed_pct", analysis.funnel.executed, analysis.funnel.applied);
  const funnelDrops: readonly [string, number][] = [
    ["hud.funnel.closed_by_code_count", analysis.funnel.items - analysis.funnel.open],
    ["hud.funnel.skipped_by_jev_count", analysis.funnel.open - analysis.funnel.asked],
    ["hud.funnel.blocked_by_code_count", analysis.funnel.asked - analysis.funnel.applied],
    ["hud.funnel.not_executed_count", analysis.funnel.applied - analysis.funnel.executed],
  ];
  for (const [id, value] of funnelDrops) {
    if (value < 0) setUnknownReason(id, "funnel_stage_counts_inconsistent");
    else put(id, value);
  }

  const sourceProblemFor = (id: string): string | null => {
    if (id === "analysis.at_ms") return analysisNowMs === null ? "analysis_source_timestamp_unavailable" : null;
    if (id.startsWith("analysis.source.invalid_")) {
      if (id === "analysis.source.invalid_ledger_rows" && !ledger.health().ok && rowValidity.invalidLedgerRows === 0) return "invalid_ledger_row_count_unavailable";
      const countIssue = invalidCountReasons.get(id);
      return countIssue === undefined ? "analysis_source_unavailable" : countIssue;
    }
    if (id === "analysis.source.missing_open_candidate_choice_scores") return briefsProblem;
    if (id.startsWith("analysis.funnel.")) {
      if (id.endsWith(".executed") || id.endsWith(".failed")) {
        return firstProblem(briefsProblem, ledgerProblem) ?? (analysis.funnel.consults === 0 ? "analysis_funnel_without_consult_window" : null);
      }
      return briefsProblem;
    }
    if (id.startsWith("analysis.asks.") || id.startsWith("analysis.hist.") || id === "hud.preference_buy_histogram.total" || id === "hud.preference_buy_histogram.fresh" || id.startsWith("analysis.timeline.")) return briefsProblem;
    if (id.startsWith("analysis.placar.") || id.startsWith("hud.command.markout.") || id.startsWith("analysis.recent.")) return firstProblem(briefsProblem, scoreboardProblem);
    if (id.startsWith("analysis.orders.outcomes.") || id.startsWith("analysis.orders.reasons.")) return ledgerProblem;
    if (id.startsWith("analysis.orders.spent_today.")) return firstProblem(ledgerProblem, analysisNowMs === null ? "analysis_source_timestamp_unavailable" : null);
    if (id.startsWith("analysis.trips.") || id.startsWith("hud.results.cumulative_trip_cash.")) return tripInputsProblem;
    if (id.startsWith("analysis.fees.")) {
      if (id === "analysis.fees.usd_fx") return null;
      if (id === "analysis.fees.lamports" || id === "analysis.fees.native_sol") {
        return fillsProblem ?? (exactFeeTotal === null ? "wallet_fee_amount_unknown_or_unsafe" : null);
      }
      return fillsProblem ?? (!allFillsUsed ? "fill_cash_input_incomplete" : null);
    }
    if (id.startsWith("analysis.runtime.")) return "runtime_service_state_not_in_frozen_journals";
    if (id.startsWith("hud.funnel.")) return firstProblem(briefsProblem, id.endsWith("executed_pct") || id.endsWith("not_executed_count") ? ledgerProblem : null);
    return null;
  };

  for (const [id, unit] of analysisUnknownMetrics) {
    const sourceProblem = sourceProblemFor(id);
    const value = values.get(id);
    const reason = sourceProblem ?? reasons.get(id) ?? (value === undefined ? "analysis_projection_unavailable" : null);
    if (reason !== null || value === undefined) addUnknown(measurements, id, unit, bundle.id, reason ?? "analysis_projection_unavailable");
    else addMeasurement(measurements, id, value, unit, "derived", null, bundle.id);
  }
  for (const [id, value] of values) {
    if (analysisUnknownMetrics.some(([knownId]) => knownId === id)) continue;
    if (id.startsWith("analysis.trips.cumulative.") || /^analysis\.placar\.(?:skipped|closed|gated)\.(?:15m|1h)\.rank_\d{5}\.markout_pct$/.test(id)) {
      const sourceProblem = id.startsWith("analysis.trips.cumulative.") ? tripInputsProblem : firstProblem(briefsProblem, scoreboardProblem);
      if (sourceProblem !== null) continue;
      const unit = id.startsWith("analysis.trips.cumulative.")
        ? id.endsWith("sale_timestamp_ms") ? "ms" : "USDC gross cash before network fee"
        : "% CEX proxy price move before costs";
      addMeasurement(measurements, id, value, unit, "derived", null, bundle.id);
    }
  }
}
interface UsageEntryProjection {
  readonly atMs: number;
  readonly calls: number;
  readonly onchainosCalls: number | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly usd: number | null;
  readonly latencyMs: number | null;
}

export interface UsageTotalsProjection {
  readonly calls: number;
  readonly usd: number | null;
  readonly tokens: number | null;
  readonly onchainosCalls: number;
  readonly avgLatencyMs: number | null;
}

export interface UsagePeriodProjection {
  readonly totals: UsageTotalsProjection;
  readonly onchainosCallsComplete: boolean;
  readonly hasModelCalls: boolean;
  readonly modelLatencyComplete: boolean;
}

export interface UsageSummaryProjection {
  readonly complete: boolean;
  readonly today: UsagePeriodProjection;
  readonly month: UsagePeriodProjection;
}

function usageEntryProjection(raw: unknown): UsageEntryProjection | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.atMs !== "number" || !Number.isFinite(raw.atMs)) return null;
  const modes = ["ativo", "token", "descoberta", "filtro", "ranking", "carteira", "ecossistema"];
  if (typeof raw.modo !== "string" || !modes.includes(raw.modo) || typeof raw.razao !== "string" || typeof raw.resultado !== "string") return null;
  if (raw.chamadasModelo !== 0 && raw.chamadasModelo !== 1 && raw.chamadasModelo !== 2) return null;
  if (raw.chamadasModelo === 2 && raw.modo !== "ecossistema") return null;
  if (raw.avaliacoes !== undefined) {
    if (!Array.isArray(raw.avaliacoes) || raw.avaliacoes.length !== raw.chamadasModelo || raw.avaliacoes.length > 2) return null;
    for (const [index, evaluation] of raw.avaliacoes.entries()) {
      if (!isRecord(evaluation) || evaluation.indice !== index + 1) return null;
    }
  }
  const nonnegative = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  return {
    atMs: raw.atMs,
    calls: raw.chamadasModelo,
    onchainosCalls: nonnegative(raw.chamadasOnchainos),
    tokensIn: nonnegative(raw.tokensEntrada),
    tokensOut: nonnegative(raw.tokensSaida),
    usd: nonnegative(raw.usd),
    latencyMs: nonnegative(raw.latenciaMs),
  };
}

function usagePeriodProjection(entries: readonly UsageEntryProjection[]): UsagePeriodProjection {
  const calls = entries.filter((entry) => entry.calls > 0);
  const usd = calls.length > 0 && calls.every((entry) => entry.usd !== null) ? calls.reduce((sum, entry) => sum + entry.usd!, 0) : null;
  const tokens = calls.length > 0 && calls.every((entry) => entry.tokensIn !== null && entry.tokensOut !== null)
    ? calls.reduce((sum, entry) => sum + entry.tokensIn! + entry.tokensOut!, 0)
    : null;
  const latencies = calls.flatMap((entry) => entry.latencyMs === null ? [] : [entry.latencyMs]);
  return {
    totals: {
      calls: calls.reduce((sum, entry) => sum + entry.calls, 0),
      usd,
      tokens,
      onchainosCalls: entries.reduce((sum, entry) => sum + (entry.onchainosCalls ?? 0), 0),
      avgLatencyMs: latencies.length === 0 ? null : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    },
    onchainosCallsComplete: entries.every((entry) => entry.onchainosCalls !== null),
    hasModelCalls: calls.length > 0,
    modelLatencyComplete: calls.every((entry) => entry.latencyMs !== null),
  };
}

export function summarizeUsageRows(rows: readonly unknown[], nowMs: number): UsageSummaryProjection {
  const entries: UsageEntryProjection[] = [];
  let complete = true;
  for (const row of rows) {
    const entry = usageEntryProjection(row);
    if (entry === null) complete = false;
    else entries.push(entry);
  }
  const anchor = new Date(nowMs);
  const todayRows = entries.filter((entry) => Math.floor(entry.atMs / 86_400_000) === Math.floor(nowMs / 86_400_000));
  const monthRows = entries.filter((entry) => {
    const date = new Date(entry.atMs);
    return date.getUTCFullYear() === anchor.getUTCFullYear() && date.getUTCMonth() === anchor.getUTCMonth();
  });
  return { complete, today: usagePeriodProjection(todayRows), month: usagePeriodProjection(monthRows) };
}

function processUsage(bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const rows = readJsonLines(bundle);
  setAsOfFromRows(bundle, rows.rows);
  const sourceProblem = lineSourceProblem(bundle, rows);
  if (bundle.issue !== null) {
    for (const period of ["today", "month"] as const) {
      for (const [field, unit] of [
        ["calls", "calls"], ["usd", "USD measured"], ["tokens", "tokens"],
        ["onchainos_calls", "calls"], ["avg_latency_ms", "ms"],
      ] as const) addUnknown(measurements, `usage.${period}.${field}`, unit, bundle.id, issueReason(bundle));
    }
    return;
  }

  const rawTime = bundle.asOfMs;
  const summary = summarizeUsageRows(rows.rows, rawTime ?? 0);
  const timestampsValid = rows.rows.every((row) => isRecord(row) && isTimestamp(row.atMs));
  const problem = firstProblem(
    sourceProblem,
    summary.complete ? null : "usage_ledger_schema_invalid_row",
    timestampsValid ? null : "usage_timestamp_invalid",
    rawTime === null ? "usage_source_timestamp_unavailable" : null,
  );
  for (const period of ["today", "month"] as const) {
    const { totals } = summary[period];
    const projection = summary[period];
    const metrics: readonly [string, string, number | null, string | null][] = [
      ["calls", "calls", isSafeCount(totals.calls) ? totals.calls : null, "usage_call_count_invalid"],
      ["usd", "USD measured", isFiniteNumber(totals.usd) ? totals.usd : null, totals.usd === null ? "measured_usd_missing" : "usage_value_invalid"],
      ["tokens", "tokens", isFiniteNumber(totals.tokens) ? totals.tokens : null, totals.tokens === null ? "measured_tokens_missing" : "usage_value_invalid"],
      ["onchainos_calls", "calls", projection.onchainosCallsComplete && isSafeCount(totals.onchainosCalls) ? totals.onchainosCalls : null, "onchainos_call_counter_missing"],
      [
        "avg_latency_ms",
        "ms",
        projection.hasModelCalls && projection.modelLatencyComplete && isFiniteNumber(totals.avgLatencyMs) ? totals.avgLatencyMs : null,
        projection.hasModelCalls ? "model_call_latency_missing" : "no_model_call_latency_observations",
      ],
    ];
    for (const [field, unit, value, missingReason] of metrics) {
      const id = `usage.${period}.${field}`;
      if (problem !== null) addUnknown(measurements, id, unit, bundle.id, problem);
      else if (value === null) addUnknown(measurements, id, unit, bundle.id, missingReason ?? "usage_value_invalid");
      else addMeasurement(measurements, id, value, unit, "derived", null, bundle.id);
    }
  }
}

interface SettingsCaps {
  readonly basic: number | null;
  readonly premium: number | null;
  readonly problem: string | null;
}

function readSettingsCaps(bundle: LoadedSource): SettingsCaps {
  const root = isRecord(bundle.payload) ? bundle.payload : null;
  if (bundle.issue !== null) return { basic: null, premium: null, problem: issueReason(bundle) };
  if (root?.version !== 1 || !isRecord(root.onchain)) return { basic: null, premium: null, problem: "settings_caps_schema_invalid" };
  const capBasic = root.onchain.capBasic;
  const capPremium = root.onchain.capPremium;
  const validCap = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000;
  return {
    basic: validCap(capBasic) ? capBasic : null,
    premium: validCap(capPremium) ? capPremium : null,
    problem: null,
  };
}

function processSettingsCaps(bundle: LoadedSource, measurements: EvidenceMeasurement[]): SettingsCaps {
  const caps = readSettingsCaps(bundle);
  for (const [tier, value] of [["basic", caps.basic], ["premium", caps.premium]] as const) {
    const id = `provider.onchain.tiers.${tier}.cap`;
    if (value === null) addUnknown(measurements, id, "calls/month", bundle.id, caps.problem ?? "settings_cap_missing_or_invalid");
    else addMeasurement(measurements, id, value, "calls/month", "observed", null, bundle.id);
  }
  return caps;
}

type ProviderTier = "free" | "basic" | "premium";
type ProviderTierTotals = Record<ProviderTier, number>;

interface ProviderDaysProjection {
  readonly valid: boolean;
  readonly totals: ProviderTierTotals;
  readonly byDay: ReadonlyMap<string, ProviderTierTotals>;
}

function providerBudgetParserMarksCorrupt(root: Record<string, unknown> | null, expectedMonth: string): boolean {
  if (root?.version !== 1 || root.month !== expectedMonth || typeof root.days !== "object" || root.days === null) return true;
  for (const [day, use] of Object.entries(root.days)) {
    if (!/^\d{2}$/.test(day) || typeof use !== "object" || use === null) return true;
    for (const tier of ["free", "basic", "premium"] as const) {
      const value = (use as Record<string, unknown>)[tier];
      if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) return true;
    }
  }
  return false;
}

function providerDaysProjection(root: Record<string, unknown> | null, expectedMonth: string): ProviderDaysProjection {
  const empty: ProviderTierTotals = { free: 0, basic: 0, premium: 0 };
  const totals: ProviderTierTotals = { ...empty };
  const byDay = new Map<string, ProviderTierTotals>();
  const year = Number(expectedMonth.slice(0, 4));
  const monthNumber = Number(expectedMonth.slice(5, 7));
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  if (!isRecord(root?.days)) return { valid: false, totals, byDay };
  for (const [day, rawUse] of Object.entries(root.days)) {
    const dayNumber = Number(day);
    if (!/^\d{2}$/.test(day) || dayNumber < 1 || dayNumber > dayCount || !isRecord(rawUse)) return { valid: false, totals, byDay };
    if (Object.keys(rawUse).some((key) => !["free", "basic", "premium"].includes(key))) return { valid: false, totals, byDay };
    const dayTotals: ProviderTierTotals = { ...empty };
    for (const tier of ["free", "basic", "premium"] as const) {
      const value = rawUse[tier];
      if (value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) return { valid: false, totals, byDay };
      dayTotals[tier] = value ?? 0;
      totals[tier] += dayTotals[tier];
      if (!Number.isSafeInteger(totals[tier])) return { valid: false, totals, byDay };
    }
    byDay.set(day, dayTotals);
  }
  return { valid: true, totals, byDay };
}

function processProviderBudget(
  bundle: LoadedSource,
  runtimeAsOfMs: number | null,
  measurements: EvidenceMeasurement[],
): void {
  const monthMatch = /usage-(\d{4}-\d{2})\.json$/.exec(bundle.path);
  const expectedMonth = monthMatch?.[1] ?? null;
  const root = isRecord(bundle.payload) ? bundle.payload : null;
  if (expectedMonth === null) {
    for (const id of ["provider.onchain.month", "provider.onchain.restarted_from_corrupt_file"]) {
      addUnknown(measurements, id, id.endsWith(".month") ? "UTC month" : "boolean", bundle.id, "provider_source_allowlist_invalid");
    }
    for (const tier of ["free", "basic", "premium"] as const) {
      for (const field of ["used", "today", "projection"] as const) addUnknown(measurements, `provider.onchain.tiers.${tier}.${field}`, "calls", bundle.id, "provider_source_allowlist_invalid");
    }
    return;
  }

  const sourceMonthValid = bundle.issue === null && root?.version === 1 && root.month === expectedMonth;
  if (sourceMonthValid) addMeasurement(measurements, "provider.onchain.month", expectedMonth, "UTC month", "observed", null, bundle.id);
  else addUnknown(measurements, "provider.onchain.month", "UTC month", bundle.id, bundle.issue === null ? "provider_month_schema_invalid" : issueReason(bundle));

  let restarted: boolean | null = null;
  if (bundle.sha256 !== null && bundle.issue === "source_json_invalid") restarted = true;
  else if (bundle.issue === null && root !== null) restarted = providerBudgetParserMarksCorrupt(root, expectedMonth);
  if (restarted === null) addUnknown(measurements, "provider.onchain.restarted_from_corrupt_file", "boolean", bundle.id, bundle.issue === null ? "provider_budget_projection_unavailable" : issueReason(bundle));
  else addMeasurement(measurements, "provider.onchain.restarted_from_corrupt_file", restarted, "boolean", "observed", null, bundle.id);

  const days = bundle.issue === null ? providerDaysProjection(root, expectedMonth) : { valid: false, totals: { free: 0, basic: 0, premium: 0 }, byDay: new Map<string, ProviderTierTotals>() };
  const runtimeInBudgetMonth = runtimeAsOfMs !== null && new Date(runtimeAsOfMs).toISOString().slice(0, 7) === expectedMonth;
  const asOfDay = runtimeInBudgetMonth && runtimeAsOfMs !== null ? new Date(runtimeAsOfMs).toISOString().slice(8, 10) : null;
  const futureCounters = asOfDay !== null && [...days.byDay.entries()].some(([day, tiers]) => day > asOfDay && Object.values(tiers).some((value) => value > 0));
  const countersValid = bundle.issue === null && sourceMonthValid && days.valid;
  for (const tier of ["free", "basic", "premium"] as const) {
    const used = countersValid && isSafeCount(days.totals[tier]) ? days.totals[tier] : null;
    const todayRaw = asOfDay === null ? undefined : days.byDay.get(asOfDay)?.[tier] ?? 0;
    const today = countersValid && runtimeInBudgetMonth && !futureCounters && todayRaw !== undefined && isSafeCount(todayRaw) ? todayRaw : null;
    const daysInMonth = new Date(Date.UTC(Number(expectedMonth.slice(0, 4)), Number(expectedMonth.slice(5, 7)), 0)).getUTCDate();
    const projected = used !== null && runtimeInBudgetMonth && !futureCounters && asOfDay !== null
      ? Math.round((used / Number(asOfDay)) * daysInMonth)
      : null;
    for (const [field, value] of [["used", used], ["today", today], ["projection", projected]] as const) {
      const reason = bundle.issue !== null
        ? issueReason(bundle)
        : !sourceMonthValid ? "provider_month_schema_invalid"
          : !days.valid ? "provider_counter_schema_invalid"
            : field !== "used" && !runtimeInBudgetMonth ? "runtime_timestamp_month_mismatch"
              : field !== "used" && futureCounters ? "provider_counters_after_runtime_timestamp"
                : value === null ? "provider_counter_unavailable" : null;
      const id = `provider.onchain.tiers.${tier}.${field}`;
      if (value === null) addUnknown(measurements, id, "calls", bundle.id, reason ?? "provider_counter_unavailable");
      else addMeasurement(measurements, id, value, "calls", "derived", null, bundle.id);
    }
  }
}

export function processAgentEquity(bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const lineData = readJsonLines(bundle);
  let invalidRows = 0;
  let validRows = 0;
  let latest: ReturnType<typeof parseSnapshotLine> = null;
  let latestTimestamp: number | null = null;
  for (const line of lineData.lines) {
    const snapshot = parseSnapshotLine(line);
    if (snapshot === null || !isTimestamp(snapshot.atMs) || (snapshot.usd !== null && snapshot.usd < 0) ||
      snapshot.holdings.some((holding) => holding.priceUsd !== null && holding.priceUsd < 0)) {
      invalidRows += 1;
      continue;
    }
    validRows += 1;
    if (latestTimestamp === null || snapshot.atMs >= latestTimestamp) {
      latest = snapshot;
      latestTimestamp = snapshot.atMs;
    }
  }
  setAsOf(bundle, latestTimestamp);

  const invalidCountKnown = bundle.issue === null && !lineData.incompleteFinalLine;
  if (invalidCountKnown) addMeasurement(measurements, "wallet.equity.source.invalid_rows", invalidRows, "rows", "observed", null, bundle.id);
  else addUnknown(measurements, "wallet.equity.source.invalid_rows", "rows", bundle.id, bundle.issue === null ? "equity_incomplete_final_line" : issueReason(bundle));

  const sourceProblem = bundle.issue !== null ? issueReason(bundle)
    : lineData.invalidJson ? "equity_jsonl_invalid"
      : lineData.incompleteFinalLine ? "equity_incomplete_final_line"
        : invalidRows > 0 ? "equity_snapshot_schema_invalid"
          : null;
  const addValue = (id: string, value: number | null, unit: string, status: "observed" | "derived" = "observed", emptyReason = "equity_metric_unavailable"): void => {
    if (sourceProblem !== null) addUnknown(measurements, id, unit, bundle.id, sourceProblem);
    else if (value === null) addUnknown(measurements, id, unit, bundle.id, emptyReason);
    else addMeasurement(measurements, id, value, unit, status, null, bundle.id);
  };

  addValue("wallet.equity.latest_usd", latest?.usd ?? null, "USD; partial price-marked snapshot", "observed", latest === null ? "no_valid_equity_snapshot" : "latest_snapshot_usd_unavailable");
  addValue("wallet.equity.latest_holdings_count", latest?.holdings.length ?? null, "recorded holdings; identifiers suppressed");
  const zeroPriceMarks = latest?.holdings.filter((holding) => holding.priceUsd === 0).length ?? null;
  const nullPriceMarks = latest?.holdings.filter((holding) => holding.priceUsd === null).length ?? null;
  addValue("wallet.equity.latest_zero_price_marks", zeroPriceMarks, "recorded zero-price marks");
  addValue("wallet.equity.latest_null_price_marks", nullPriceMarks, "recorded holdings with null price");
  if (zeroPriceMarks !== null && zeroPriceMarks > 0) {
    addUnknown(measurements, "wallet.equity.unpriced_holdings_count", "holdings", bundle.id, sourceProblem ?? "zero_price_mark_may_encode_unpriced_asset");
  } else {
    addValue("wallet.equity.unpriced_holdings_count", nullPriceMarks, "recorded holdings with no price");
  }
  addValue("wallet.equity.history.snapshot_count", validRows, "validated snapshot rows");

  const points = sourceProblem === null && lineData.lines.length > 0 ? equitySeries(lineData.lines, 2) : [];
  const seriesLines = typeof bundle.payload === "string" ? bundle.payload.split("\n").slice(-4000) : [];
  const statusPoints = sourceProblem === null ? equitySeries(seriesLines) : [];
  const addSeries = (id: string, value: number | null, unit: string): void => {
    if (sourceProblem !== null) addUnknown(measurements, id, unit, bundle.id, sourceProblem);
    else if (value === null) addUnknown(measurements, id, unit, bundle.id, "equity_metric_unavailable");
    else addMeasurement(measurements, id, value, unit, "observed", null, bundle.id);
  };
  addSeries("status.performance.series.count", statusPoints.length, "points");
  for (let index = 0; index < statusPoints.length; index += 1) {
    const point = statusPoints[index]!;
    const rank = String(index + 1).padStart(5, "0");
    addSeries(`status.performance.series.rank_${rank}.timestamp_ms`, point.t, "ms");
    addSeries(`status.performance.series.rank_${rank}.value_usd`, point.v, "USD; partial price-marked wallet value including external flows, not return or net PnL");
  }
  const first = points[0] ?? null;
  const last = points.at(-1) ?? null;
  addValue("wallet.equity.history.first_at_ms", first?.t ?? null, "Unix milliseconds", "observed", "no_positive_price_marked_equity_points");
  addValue("wallet.equity.history.last_at_ms", last?.t ?? null, "Unix milliseconds", "observed", "no_positive_price_marked_equity_points");
  addValue("wallet.equity.history.first_usd", first?.v ?? null, "USD; partial price-marked snapshot", "observed", "no_positive_price_marked_equity_points");
  addValue("wallet.equity.history.last_usd", last?.v ?? null, "USD; partial price-marked snapshot", "observed", "no_positive_price_marked_equity_points");
  addValue("wallet.equity.history.change_usd", first !== null && last !== null ? Math.round((last.v - first.v) * 100) / 100 : null, "USD raw balance change including external flows; not net return", "derived", "no_positive_price_marked_equity_points");
  addValue("wallet.equity.history.change_pct", first !== null && last !== null && first.v > 0 ? Math.round(((last.v / first.v) - 1) * 10_000) / 100 : null, "% raw balance change including external flows; not return", "derived", first === null || last === null ? "no_positive_price_marked_equity_points" : "first_equity_value_not_positive");
}

export function processAgentBudget(bundle: LoadedSource, measurements: EvidenceMeasurement[]): void {
  const state = bundle.issue === null ? parseBudgetState(bundle.payload) : null;
  const problem = bundle.issue !== null ? issueReason(bundle)
    : state === null ? "agent_budget_schema_invalid"
      : null;
  const values: readonly [string, string | number | null, string][] = [
    ["runtime.agent_budget.day", state?.day ?? null, "UTC date"],
    ["runtime.agent_budget.consults", state?.consults ?? null, "consultations"],
    ["runtime.agent_budget.committed_tokens", state?.committedTokens ?? null, "tokens including estimates for unmeasured calls"],
    ["runtime.agent_budget.measured_tokens", state?.measuredTokens ?? null, "provider-measured tokens"],
    ["runtime.agent_budget.unmeasured_calls", state?.unmeasuredCalls ?? null, "calls"],
  ];
  for (const [id, value, unit] of values) {
    if (problem !== null) addUnknown(measurements, id, unit, bundle.id, problem);
    else addMeasurement(measurements, id, value, unit, "observed", null, bundle.id);
  }
}

function collectSnapshot(runtimeHome: string): EvidenceSnapshot {
  const measurements: EvidenceMeasurement[] = [];
  const quantBundles = quantSources.map((spec) => ({ spec, bundle: loadSource(spec) }));
  for (const { spec, bundle } of quantBundles) processQuant(spec, bundle, measurements);

  const execution = loadSource(executionSpec);
  processExecution(execution, measurements);
  const review = loadSource(reviewSpec);
  processReview(review, measurements);
  const evolution = loadSource(evolutionSpec);
  processEvolution(evolution, measurements);

  const runtimeAgentBundles = runtimeAgentSpecs.map((spec) => loadRuntimeSource(spec, runtimeHome, false));
  const agentJournals: LoadedSource = {
    ...agentJournalsSpec,
    sha256: null,
    payload: null,
    issue: null,
    asOfMs: null,
  };
  processAgentAnalysis(agentJournals, runtimeAgentBundles, measurements);

  const equity = loadRuntimeSource(equitySpec, runtimeHome, false);
  processAgentEquity(equity, measurements);
  const agentBudget = loadRuntimeSource(agentBudgetSpec, runtimeHome, true);
  processAgentBudget(agentBudget, measurements);
  const usage = loadRuntimeSource(usageLedgerSpec, runtimeHome, false);
  processUsage(usage, measurements);
  const providerBudget = loadRuntimeSource(providerBudgetSpec, runtimeHome, true);
  const settingsCaps = loadRuntimeSource(settingsCapsSpec, runtimeHome, true);
  const runtimeTimestampBundles = [...runtimeAgentBundles, equity, usage];
  const runtimeTimes = runtimeTimestampBundles.flatMap((bundle) => bundle.asOfMs === null ? [] : [bundle.asOfMs]);
  const runtimeAsOfMs = runtimeTimes.length === 0 ? null : Math.max(...runtimeTimes);
  processProviderBudget(providerBudget, runtimeAsOfMs, measurements);
  processSettingsCaps(settingsCaps, measurements);

  const bundles = [
    ...quantBundles.map(({ bundle }) => bundle),
    execution,
    review,
    evolution,
    agentJournals,
    ...runtimeAgentBundles,
    equity,
    agentBudget,
    usage,
    providerBudget,
    settingsCaps,
  ];
  const availabilityTimes = bundles.flatMap((bundle) => bundle.asOfMs === null ? [] : [bundle.asOfMs]);
  if (availabilityTimes.length === 0) throw new Error("source_availability_time_missing");
  const sources = bundles.map(sourceRecord).sort((a, b) => compareText(a.id, b.id));
  const orderedMeasurements = measurements.sort((a, b) => compareText(a.id, b.id));
  if (new Set(orderedMeasurements.map((measurement) => measurement.id)).size !== orderedMeasurements.length) throw new Error("duplicate_measurement_id");
  return { schemaVersion: 1, capturedAtMs: Math.max(...availabilityTimes), sources, measurements: orderedMeasurements };
}

function runtimeHomeArgument(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== "--runtime-home" || args[1] === undefined || args[1] === "") {
    throw new Error("runtime_home_argument_invalid");
  }
  try {
    return resolveHome({ INONU_HOME: args[1] });
  } catch {
    throw new Error("runtime_home_argument_invalid");
  }
}

function main(args: readonly string[]): void {
  const snapshot = collectSnapshot(runtimeHomeArgument(args));
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`freeze-evidence: wrote ${snapshot.sources.length} source records and ${snapshot.measurements.length} measurements`);
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error && error.message === "runtime_home_argument_invalid"
      ? "usage: bun --no-env-file run scripts/autoresearch/freeze-evidence.ts --runtime-home <absolute-path>"
      : "freeze_evidence_failed");
    process.exitCode = 1;
  }
}
