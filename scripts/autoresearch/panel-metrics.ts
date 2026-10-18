import type { EvidenceMeasurement, EvidenceSnapshot, EvidenceSource, WorkloadResult } from "./contracts.ts";

export type PanelSemantic = "gross" | "preference" | "operational" | "config" | "counterfactual" | "net_estimated";
export type PanelAvailability = "available" | "unknown";

export interface PanelMetricDefinition {
  readonly id: string;
  /** Snapshot measurement ID. Null means this field is intentionally absent from collected evidence. */
  readonly measurementId: string | null;
  readonly unit: string;
  readonly sourceCode: string;
  readonly surface: readonly string[];
  readonly horizon: string;
  readonly semantic: PanelSemantic;
  readonly schemaPath: string;
  /** Explicit array element contract; raw row values stay unknown unless a safe numeric/boolean aggregate is collected. */
  readonly arrayPath: string | null;
  readonly fieldPath: string | null;
  readonly unknownReason: string | null;
}

export interface PanelEvidenceSource {
  readonly id: string;
  readonly sha256: string | null;
  readonly asOfMs: number | null;
  readonly classification: EvidenceSource["classification"];
}

export interface PanelMetricSource {
  readonly measurementId: string | null;
  readonly sourceId: string | null;
  readonly evidence: PanelEvidenceSource | null;
}

export interface PanelMetricEntry extends PanelMetricDefinition {
  readonly availability: PanelAvailability;
  readonly status: EvidenceMeasurement["status"];
  readonly value: EvidenceMeasurement["value"];
  readonly reason: string | null;
  readonly source: PanelMetricSource;
}

export interface PanelWeakness {
  readonly id: string;
  readonly status: "observed" | "structural";
  readonly reason: string;
  readonly metricIds: readonly string[];
  readonly sourceIds: readonly string[];
}

export interface PanelSupplementalEvidence {
  readonly id: string;
  readonly unit: string;
  readonly availability: PanelAvailability;
  readonly status: EvidenceMeasurement["status"];
  readonly value: number | string | boolean | null;
  readonly reason: string | null;
  readonly source: PanelMetricSource;
}

export interface PanelReport {
  readonly schemaVersion: 1;
  readonly capturedAtMs: number;
  readonly coverage: {
    readonly total: number;
    readonly known: number;
    readonly unknown: number;
    /** Availability coverage only; this is not a financial score or performance metric. */
    readonly coveragePct: number;
  };
  readonly metrics: readonly PanelMetricEntry[];
  readonly weaknesses: readonly PanelWeakness[];
  /** Safe scalar measurements not already represented by a catalog metric. */
  readonly supplementalEvidence: readonly PanelSupplementalEvidence[];
}

const definitions: PanelMetricDefinition[] = [];
const ids = new Set<string>();
const metricId = (path: string): string => `panel_${path.replace(/\[\]/g, ".item").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;

function addMetric(
  path: string,
  unit: string,
  sourceCode: string,
  surface: readonly string[],
  horizon: string,
  semantic: PanelSemantic,
  options: {
    readonly measurementId?: string;
    readonly arrayPath?: string;
    readonly fieldPath?: string;
    readonly unknownReason?: string;
  } = {},
): void {
  const id = metricId(path);
  if (ids.has(id)) throw new Error(`Duplicate panel metric id: ${id}`);
  ids.add(id);
  const definition: PanelMetricDefinition = {
    id,
    measurementId: options.measurementId ?? null,
    unit,
    sourceCode,
    surface,
    horizon,
    semantic,
    schemaPath: path,
    arrayPath: options.arrayPath ?? null,
    fieldPath: options.fieldPath ?? null,
    unknownReason: options.unknownReason ?? null,
  };
  definitions.push(definition);
}

const HUD_STATUS_UNKNOWN = "The online observation contains no current HUD/status reading; no status route is queried.";
const USAGE_UNKNOWN = "The online observation contains no Settings Usage record or configured token prices.";
const ROW_UNKNOWN = "Raw per-row data is not included in the report; only explicitly allowlisted numeric/boolean aggregates can be reported.";
const TEXT_UNKNOWN = "Raw symbols, model text, addresses, reasons, and provider messages are not copied into the report.";
const STATUS_SCOREBOARD_SCHEMA_INVALID_REASON = "Collected scoreboard rows failed safe-schema validation.";

const surfaces = {
  command: ["Comando"],
  decisions: ["Decisoes"],
  wallet: ["Comando", "Carteira", "Resultado"],
  results: ["Comando", "Resultado"],
  skipped: ["Comando", "Pulados"],
  system: ["Comando", "Sistema"],
  allHud: ["Comando", "Decisoes", "Carteira", "Resultado", "Pulados", "Sistema"],
  usage: ["Configuracoes / Usage"],
  status: ["Status exposto, nao desenhado no HUD"],
  hidden: ["HudModel exposto, nao desenhado"],
} as const;

function addHud(
  path: string,
  unit: string,
  sourceCode: string,
  surface: readonly string[],
  horizon: string,
  semantic: PanelSemantic,
  unknownReason = HUD_STATUS_UNKNOWN,
): void {
  addMetric(path, unit, sourceCode, surface, horizon, semantic, { unknownReason });
}

function addAnalysis(
  path: string,
  unit: string,
  surface: readonly string[],
  horizon: string,
  semantic: PanelSemantic,
  measurementId?: string,
  sourceCode = "src/agent/analysis.ts#AnalysisView",
  arrayPath?: string,
  fieldPath?: string,
  unknownReason?: string,
): void {
  addMetric(path, unit, sourceCode, surface, horizon, semantic, {
    ...(measurementId === undefined ? {} : { measurementId }),
    ...(arrayPath === undefined ? {} : { arrayPath, fieldPath }),
    ...(unknownReason === undefined ? {} : { unknownReason }),
  });
}

// The six Agent HUD tabs. The sourceCode names are the existing projections, not a parallel financial calculation.
addHud("hud.agent.mode", "code", "web/src/lib/hud/model.ts#buildHudModel.agent.mode", surfaces.system, "current status", "operational");
addHud("hud.agent.authority", "code", "web/src/lib/hud/model.ts#buildHudModel.agent.authority", surfaces.system, "current status", "config");
addHud("hud.agent.paused", "boolean", "web/src/lib/hud/model.ts#buildHudModel.agent.paused", surfaces.system, "current status", "operational");
addHud("hud.agent.pause_reason", "code (text suppressed)", "web/src/lib/hud/model.ts#buildHudModel.agent.pauseReason", surfaces.system, "current status", "operational", TEXT_UNKNOWN);
addHud("hud.agent.profile", "code (text suppressed)", "web/src/lib/hud/model.ts#buildHudModel.agent.profile", surfaces.system, "current status", "config", TEXT_UNKNOWN);
addHud("hud.agent.model_configured", "boolean", "web/src/lib/hud/model.ts#buildHudModel.health.modelOk", surfaces.system, "current status", "operational");
addHud("hud.agent.cycling", "boolean", "web/src/lib/hud/model.ts#buildHudModel.agent.cycling", surfaces.system, "current status", "operational");
for (const [field, unit] of [["max_buy_usd", "USD"], ["max_daily_buy_usd", "USD"], ["max_daily_sell_usd", "USD"]] as const) {
  addHud(`hud.agent.caps.${field}`, unit, `web/src/lib/hud/types.ts#HudModel.agent.caps.${field}`, surfaces.system, "current configured cap", "config");
}
addHud("hud.agent.risk_pct", "%", "web/src/lib/hud/types.ts#HudModel.agent.riskPct", surfaces.system, "current status", "config");
addHud("hud.agent.reserve_share_pct", "%", "web/src/lib/hud/types.ts#HudModel.agent.reserveShare", surfaces.system, "current configured reserve", "config");
addHud("hud.agent.leverage.granted", "boolean", "web/src/lib/hud/types.ts#HudModel.agent.leverage.granted", surfaces.system, "current authorization", "config");
addHud("hud.agent.leverage.instruments", "count", "web/src/lib/hud/types.ts#HudModel.agent.leverage.instruments", surfaces.system, "current authorization", "config");

// Wallet values are observed marks, not net return; every amount needing flow adjustment remains distinct/unknown.
addHud("hud.wallet.total_usd", "USD", "web/src/lib/hud/types.ts#HudModel.wallet.total", surfaces.wallet, "latest wallet read", "gross");
addHud("hud.wallet.cash_usd", "USD", "web/src/lib/hud/types.ts#HudModel.wallet.cash", surfaces.wallet, "latest wallet read", "gross");
addHud("hud.wallet.cash_share_pct", "% of priced total", "web/src/lib/hud/draw/analysis.ts#createAnalysis.allocation", surfaces.wallet, "latest wallet read", "gross");
addHud("hud.wallet.priced_assets_count", "count", "web/src/lib/hud/draw/analysis.ts#createAnalysis.allocation", surfaces.wallet, "latest wallet read", "operational");
addHud("hud.wallet.unpriced_assets_count", "count", "web/src/lib/hud/types.ts#HudModel.wallet.unpriced", surfaces.wallet, "latest wallet read", "operational");
addHud("hud.wallet.position_count", "count", "web/src/lib/hud/types.ts#HudModel.wallet.positions", surfaces.wallet, "latest wallet read", "operational");
addHud("hud.wallet.positions_with_exit_plan_count", "count", "web/src/lib/hud/draw/analysis.ts#createAnalysis.tripCards", surfaces.wallet, "latest wallet read", "operational");
addHud("hud.wallet.positions_without_exit_plan_count", "count", "web/src/lib/hud/draw/analysis.ts#createAnalysis.allocation", surfaces.wallet, "latest wallet read", "operational");
addHud("hud.wallet.read_at_ms", "Unix milliseconds", "web/src/lib/hud/types.ts#HudModel.wallet.readAtMs", surfaces.wallet, "latest wallet read", "operational");
addHud("hud.wallet.last_read_at_ms", "Unix milliseconds", "web/src/lib/hud/types.ts#HudModel.wallet.lastReadMs", surfaces.wallet, "latest wallet read", "operational");
for (const [field, unit, semantic, fieldPath] of [
  ["symbol", "text (suppressed)", "operational", "s"], ["usd", "USD", "gross", "usd"], ["share_pct", "% of total", "gross", "share"],
  ["is_cash", "boolean", "operational", "cash"], ["has_exit_plan", "boolean derived from plan != null", "operational", "plan"],
  ["plan_profile", "code (suppressed)", "config", "plan.profile"], ["plan_since_entry_pct", "%", "gross", "plan.sinceEntryPct"],
  ["plan_to_target_pct", "%", "gross", "plan.toTargetPct"], ["plan_to_stop_pct", "%", "gross", "plan.toStopPct"],
  ["plan_hours_held", "hours", "operational", "plan.hoursHeld"], ["plan_hours_left", "hours", "config", "plan.hoursLeft"],
] as const) {
  addMetric(`hud.wallet.positions[].${field}`, unit, `web/src/lib/hud/types.ts#HudPosition.${fieldPath}`, surfaces.wallet, "each currently read position", semantic, {
    arrayPath: "HudModel.wallet.positions[]", fieldPath,
    unknownReason: field === "symbol" || field === "plan_profile" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
addHud("hud.wallet.top_command.count", "count (max 4)", "web/src/lib/hud/draw/command.ts#createCommand.wallet", surfaces.command, "latest wallet read", "operational");
for (const [field, unit, semantic, fieldPath] of [
  ["symbol", "text (suppressed)", "operational", "s"], ["usd", "USD", "gross", "usd"], ["share_pct", "% of total", "gross", "share"],
  ["is_cash", "boolean", "operational", "cash"], ["has_exit_plan", "boolean derived from plan != null", "operational", "plan"],
  ["plan_profile", "code (suppressed)", "config", "plan.profile"],
] as const) {
  addMetric(`hud.wallet.top_command[].${field}`, unit, `web/src/lib/hud/types.ts#HudPosition.${fieldPath}`, surfaces.command, "top 4 command positions", semantic, {
    arrayPath: "command top positions[]", fieldPath, unknownReason: field === "symbol" || field === "plan_profile" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
for (const [field, unit] of [["cash_share_pct", "% of total",], ["with_plan_share_pct", "% of total",], ["without_plan_share_pct", "% of total",]] as const) {
  addHud(`hud.wallet.command_distribution.${field}`, unit, "web/src/lib/hud/draw/command.ts#createCommand.wallet distribution", surfaces.command, "latest wallet read", "gross", "The command wallet bar derives cash/with-plan/without-plan shares from the live wallet; no scalar projection is present in collected evidence.");
}
addHud("hud.wallet.top_allocation.count", "count (max 8)", "web/src/lib/hud/draw/analysis.ts#createAnalysis.allocation", surfaces.wallet, "latest wallet read", "operational");
for (const [field, unit, semantic, fieldPath] of [
  ["symbol", "text (suppressed)", "operational", "s"], ["usd", "USD", "gross", "usd"], ["share_pct", "% of priced total", "gross", "share"],
  ["is_cash", "boolean", "operational", "cash"], ["has_exit_plan", "boolean derived from plan != null", "operational", "plan"],
] as const) {
  addMetric(`hud.wallet.top_positions[].${field}`, unit, `web/src/lib/hud/types.ts#HudPosition.${fieldPath}`, surfaces.wallet, "top 8 by priced value", semantic, {
    arrayPath: "allocation.topPositions[]", fieldPath,
    unknownReason: field === "symbol" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
addHud("hud.equity.raw_series.count", "count", "src/agent/wire.ts#equitySeries -> web/src/lib/hud/model.ts#buildHudModel.equity", surfaces.results, "available raw equity points", "gross");
addHud("hud.equity.raw_series.first_value_usd", "USD", "web/src/lib/hud/types.ts#HudModel.equity[].v", surfaces.results, "first available raw equity point", "gross");
addHud("hud.equity.raw_series.last_value_usd", "USD", "web/src/lib/hud/types.ts#HudModel.equity[].v", surfaces.results, "last available raw equity point", "gross");
addHud("hud.equity.raw_window_change_pct", "% (includes external flows)", "web/src/lib/hud/draw/analysis.ts#createAnalysis.kpis", surfaces.results, "first-to-last raw equity point", "gross", "The HUD's raw equity change is not a flow-adjusted return and no equity series is present in the online observation.");
for (const [field, unit, fieldPath] of [["timestamp_ms", "Unix milliseconds", "t"], ["value_usd", "USD", "v"]] as const) {
  addMetric(`hud.equity.raw_series[].${field}`, unit, `web/src/lib/hud/types.ts#HudModel.equity[].${fieldPath}`, surfaces.results, "each raw equity point", "gross", {
    arrayPath: "HudModel.equity[]", fieldPath, unknownReason: ROW_UNKNOWN,
  });
}
addHud("hud.wallet.flow_adjusted_return_pct", "%", "src/agent/equity.ts#buildSeries", surfaces.wallet, "flow-adjusted series horizon", "gross", "No reconciled external-flow series is present in the online observation; raw HUD equity is not substituted.");
addHud("hud.wallet.external_flows_reconciled", "boolean", "src/agent/equity.ts#buildSeries", surfaces.wallet, "flow-adjusted series horizon", "operational", "The online observation contains no complete wallet balance and external-flow reconciliation.");
addHud("hud.wallet.net_return_usd", "USD", "src/agent/analysis.ts#buildAnalysis trips are gross only", surfaces.wallet, "portfolio observation period", "net_estimated", "No complete portfolio ledger, contemporaneous cost FX, marks, and reconciled flows are available in the online observation.");

// Existing analysis endpoint fields. Only explicitly observed scalar measurements are known; absent analysis is never replaced with EMPTY_ANALYSIS zeros.
const funnelFields = ["consults", "items", "closed", "open", "asked", "applied", "executed", "failed"] as const;
for (const field of funnelFields) {
  addAnalysis(`analysis.funnel.${field}`, "count", surfaces.decisions, "latest 25 valid consultations", "operational", `analysis.funnel.${field}`);
}
for (const [field, unit] of [
  ["items_to_open_pct", "% rounded to whole percent"], ["open_to_asked_pct", "% rounded to whole percent"],
  ["asked_to_applied_pct", "% rounded to whole percent"], ["applied_to_executed_pct", "% rounded to whole percent"],
  ["closed_by_code_count", "count"], ["skipped_by_jev_count", "count"], ["blocked_by_code_count", "count"], ["not_executed_count", "count"],
] as const) {
  const measurementId = `hud.funnel.${field}`;
  const reason = field.endsWith("_pct") ? "HUD conversion percentage is unknown when its denominator is zero or the online count projection is absent." : undefined;
  addMetric(`hud.funnel.${field}`, unit, "web/src/lib/hud/draw/analysis.ts#createAnalysis.funnel; online report projection", surfaces.decisions, "latest 25 valid consultations", "operational", {
    measurementId,
    ...(reason === undefined ? {} : { unknownReason: reason }),
  });
}
addHud("hud.analysis.available", "boolean", "web/src/lib/hud/types.ts#HudModel.analysisOk", surfaces.decisions, "current status", "operational");
addHud("hud.snapshot_at_ms", "Unix milliseconds", "web/src/lib/hud/types.ts#HudModel.snapshotAtMs", surfaces.command, "current status", "operational");

// Shared source entries below carry all overlapping KPI surfaces, avoiding duplicate financial metrics.
addHud("hud.results.kpis.raw_equity_window_change_pct", "% including external flows", "web/src/lib/hud/draw/analysis.ts#createAnalysis.kpis", surfaces.results, "first-to-last raw equity point", "gross", "No equity series is present in the online observation; this is not a flow-adjusted return.");
for (const [field, unit, semantic, measurementId, reason] of [
  ["points_count", "count including the synthetic origin point", "operational", "hud.results.cumulative_trip_cash.points_count", null],
  ["few_trips_warning", "boolean (<5 closed trips)", "operational", "hud.results.cumulative_trip_cash.few_trips_warning", null],
  ["gross_gap_to_break_even_usdc", "USDC before network fee", "gross", null, "The HUD derives a gross break-even gap; no numeric input is present in the online observation and this report does not recalculate it."],
  ["network_fee_cost_to_break_even_usd", "USD estimated network cost", "net_estimated", null, "No contemporaneous fee/USD conversion is present in the online observation; the HUD note does not provide a numeric USD cost."],
] as const) {
  addMetric(`hud.results.cumulative_trip_cash.${field}`, unit, "web/src/lib/hud/draw/analysis.ts#createAnalysis.cumulative", surfaces.results, "all closed round trips in available analysis", semantic, {
    ...(measurementId === null ? {} : { measurementId }),
    ...(reason === null ? {} : { unknownReason: reason }),
  });
}
addAnalysis("analysis.at_ms", "Unix milliseconds", surfaces.decisions, "analysis projection timestamp (not a decision time)", "operational", "analysis.at_ms", "src/agent/analysis.ts#AnalysisView.atMs");
addAnalysis("analysis.asks.count", "count", surfaces.decisions, "all valid consultations retained by buildAnalysis", "preference", "analysis.asks.count", "src/agent/analysis.ts#AnalysisView.asks.length");
addAnalysis("analysis.asks[].symbol", "text (suppressed)", surfaces.decisions, "up to 10 displayed requests", "preference", undefined, "src/agent/analysis.ts#AnalysisView.asks[].s", "AnalysisView.asks[]", "s", TEXT_UNKNOWN);
for (let rank = 0; rank < 10; rank++) {
  const rankKey = `rank_${String(rank).padStart(2, "0")}`;
  for (const [field, unit, sourceField, semantic, unknownReason] of [
    ["timestamp_ms", "Unix milliseconds", "t", "preference", ROW_UNKNOWN],
    ["p_buy_score", "preference score [0,1], not calibrated probability", "p", "preference", "AnalysisView.p defaults a missing source Choice score to zero; the underlying score is unavailable and must remain unknown."],
    ["order_applied", "boolean", "ok", "operational", ROW_UNKNOWN],
  ] as const) {
    const measurementId = `analysis.asks.${rankKey}.${field}`;
    addAnalysis(`analysis.asks.${rankKey}.${field}`, unit, surfaces.decisions, "latest 10 asks, rank_00 newest first", semantic, measurementId, `src/agent/analysis.ts#AnalysisView.asks[].${sourceField}`, "AnalysisView.asks[]", `${rankKey}.${sourceField}`, unknownReason);
  }
}
for (const cohort of ["all", "fresh"] as const) {
  for (let bin = 0; bin < 20; bin++) {
    const key = `bin_${String(bin).padStart(2, "0")}`;
    const lower = (bin / 20).toFixed(2);
    const upper = ((bin + 1) / 20).toFixed(2);
    addAnalysis(`analysis.hist.${cohort}.${key}`, "preference count", surfaces.decisions, `${cohort === "all" ? "all consultations" : "consultations tagged criteria=rank-v1"}; preference bin [${lower}, ${upper}${bin === 19 ? "]" : ")"}`, "preference", `analysis.hist.${cohort}.${key}`, "src/agent/analysis.ts#AnalysisView.hist", `AnalysisView.hist.${cohort}[]`, key);
  }
}
addAnalysis("analysis.timeline.count", "count", surfaces.decisions, "latest 30 valid consultations", "operational", "analysis.timeline.count");
for (let rank = 0; rank < 30; rank++) {
  const rankKey = `rank_${String(rank).padStart(2, "0")}`;
  for (const [field, unit, sourceField] of [["timestamp_ms", "Unix milliseconds", "t"], ["open_candidates", "count", "open"], ["asked_candidates", "count", "asked"], ["applied_candidates", "count", "applied"]] as const) {
    const measurementId = `analysis.timeline.${rankKey}.${field}`;
    addAnalysis(`analysis.timeline.${rankKey}.${field}`, unit, surfaces.decisions, "latest 30 timeline rows, rank_00 oldest displayed", "operational", measurementId, `src/agent/analysis.ts#AnalysisView.timeline[].${sourceField}`, "AnalysisView.timeline[]", `${rankKey}.${sourceField}`, ROW_UNKNOWN);
  }
}
addAnalysis("analysis.trips.count", "count", surfaces.results, "all closed round trips from available fills", "operational", "analysis.trips.count", "src/agent/analysis.ts#AnalysisView.trips.length");
for (const [field, measurementField, unit, semantic, horizon] of [
  ["gross_in", "gross_in_usdc", "USDC (verified cash mint required)", "gross", "all closed round trips"],
  ["gross_out", "gross_out_usdc", "USDC (verified cash mint required)", "gross", "all closed round trips"],
  ["gross_delta", "gross_delta_usdc", "USDC before network fee (verified cash mint required)", "gross", "all closed round trips"],
  ["gross_return_pct_mean", "gross_return_pct_mean", "% before network fee", "gross", "mean across all closed round trips"],
  ["negative_count", "negative_count", "count", "gross", "closed round trips with negative gross cash delta"],
] as const) {
  const measurementId = `analysis.trips.${measurementField}`;
  addAnalysis(`analysis.trips.${field}`, unit, surfaces.results, horizon, semantic, measurementId, "src/agent/analysis.ts#buildAnalysis trip aggregates; complete valid fills and verified USD cash denomination required", undefined, undefined, field.startsWith("gross_") ? "Trip cash amount or return is unknown unless all included fills are valid and the cash denomination is verified as USD." : undefined);
}
addAnalysis("analysis.trips.display[].symbol", "text (suppressed)", surfaces.results, "up to 2 latest displayed round trips", "gross", undefined, "src/agent/analysis.ts#AnalysisView.trips[].s", "AnalysisView.trips[]", "s", TEXT_UNKNOWN);
addAnalysis("analysis.trips[].quantity_base_units", "token base units", surfaces.results, "each closed round trip", "gross", undefined, "src/agent/analysis.ts#AnalysisView.trips does not project token quantity", "AnalysisView.trips[]", "quantity_base_units", "AnalysisView exposes trip cash and timestamps, not token quantity; do not infer quantity from USD.");
for (const [field, unit, semantic] of [
  ["sale_timestamp_ms", "Unix milliseconds", "operational"],
  ["gross_delta_usdc", "USDC before network fee (verified cash mint required)", "gross"],
  ["cumulative_gross_cash_delta_usdc", "USDC before network fee (verified cash mint required)", "gross"],
] as const) {
  addAnalysis(`analysis.trips.cumulative[].${field}`, unit, surfaces.results, "each chronological round-trip point; HUD chart includes a synthetic origin", semantic, undefined, "src/agent/analysis.ts#AnalysisView.trips[] -> web/src/lib/hud/draw/analysis.ts#createAnalysis.cumulative", "cumulative trip cash series[]", field, "This trip cash field is unknown unless all included fills are valid and the cash denomination is verified as USD; gross cash is not treated as net return.");
}
for (let rank = 0; rank < 2; rank++) {
  const rankKey = `rank_${String(rank).padStart(2, "0")}`;
  for (const [field, unit, sourceField, semantic] of [
    ["gross_entry_usdc", "USDC (verified cash mint required)", "in", "gross"],
    ["gross_exit_usdc", "USDC (verified cash mint required)", "out", "gross"],
    ["gross_return_pct", "% before network fee", "pct", "gross"],
    ["buy_at_ms", "Unix milliseconds", "buyAt", "operational"],
    ["sell_at_ms", "Unix milliseconds", "sellAt", "operational"],
    ["duration_min", "minutes", "sellAt - buyAt", "operational"],
  ] as const) {
    const measurementId = `analysis.trips.display.${rankKey}.${field}`;
    addAnalysis(`analysis.trips.display.${rankKey}.${field}`, unit, surfaces.results, "two latest displayed round trips; rank_00 penultimate/left and rank_01 newest/right", semantic, measurementId, `src/agent/analysis.ts#AnalysisView.trips[].${sourceField}`, "AnalysisView.trips[]", `${rankKey}.${sourceField}`, field.startsWith("gross_") ? "Trip cash amount or return is unknown unless all included fills are valid and the cash denomination is verified as USD." : ROW_UNKNOWN);
  }
}
for (const [field, unit, semantic] of [
  ["lamports", "lamports", "operational"], ["fills", "count", "operational"], ["unmatched_sells", "count", "operational"],
] as const) {
  addAnalysis(`analysis.fees.${field}`, unit, surfaces.results, "available fill history", semantic, `analysis.fees.${field}`, "src/agent/analysis.ts#AnalysisView.fees", undefined, undefined, field === "lamports" ? "AnalysisView sums available wallet fees without exposing whether any fee was missing; exact fee totals remain unknown." : undefined);
}
addAnalysis("analysis.fees.native_sol", "SOL", surfaces.results, "available fill history", "operational", "analysis.fees.native_sol", "web/src/lib/hud/draw/analysis.ts#createAnalysis.kpis; exact lamports-to-SOL display projection", undefined, undefined, "Fee cost in SOL is unknown if any included walletFee is missing or unsafe.");
addAnalysis("analysis.fees.usd_fx", "USD per native fee", surfaces.results, "fee observation time", "operational", "analysis.fees.usd_fx", "src/agent/fills.ts#fee conversion", undefined, undefined, "No contemporaneous native-token/USD conversion is present in the online observation.");
for (const group of ["skipped", "closed", "gated"] as const) {
  for (const window of ["15m", "1h"] as const) {
    for (const [field, unit, projectionField] of [["n", "count", "n"], ["up", "count with positive price markout", "up"], ["mean_pct", "% price move", "mean"], ["up_pct", "% of positive markouts", "up_pct"]] as const) {
      const measurementId = `analysis.placar.${group}.${window}.${field}`;
      addAnalysis(measurementId, unit, surfaces.skipped, `price markout ${window} after non-execution`, "counterfactual", measurementId, `src/agent/analysis.ts#AnalysisView.placar.${group}.${window}.${projectionField}`, undefined, undefined, field === "up_pct" ? "The markout positive fraction is unknown when its denominator n is zero or absent." : undefined);
    }
    addAnalysis(`analysis.placar.${group}.${window}.vals[].markout_pct`, "% price markout", surfaces.skipped, `all raw markout rows for ${window} after non-execution`, "counterfactual", undefined, `src/agent/analysis.ts#AnalysisView.placar.${group}.${window}.vals[]`, "WindowStats.vals[]", "markout_pct", "Per-row numeric markouts are represented by ranked scalar entries in the online report when available; no missing row is filled with zero.");
    for (let bin = 0; bin < 10; bin++) {
      const key = `bin_${String(bin).padStart(2, "0")}`;
      const measurementId = `analysis.placar.${group}.${window}.hist.${key}`;
      addAnalysis(measurementId, "markout count", surfaces.skipped, `price markout ${window}; HUD histogram bin ${bin} across [-20%, +20%) in 4pp widths with renderer clamping`, "counterfactual", measurementId, `src/agent/analysis.ts#AnalysisView.placar.${group}.${window}.vals[] -> web/src/lib/hud/draw/analysis.ts#createAnalysis.moves histogram`, "WindowStats.vals[]", key);
    }
  }
}
addAnalysis("analysis.recent.count", "count (latest 40 retained)", surfaces.skipped, "up to 14 displayed non-execution decisions", "counterfactual", "analysis.recent.count");
addAnalysis("analysis.recent[].symbol", "text (suppressed)", surfaces.skipped, "up to 14 displayed decisions from latest 40 retained", "counterfactual", undefined, "src/agent/analysis.ts#AnalysisView.recent[].s", "AnalysisView.recent[]", "s", TEXT_UNKNOWN);
addAnalysis("analysis.recent[].kind", "code (suppressed)", surfaces.skipped, "up to 14 displayed decisions from latest 40 retained", "counterfactual", undefined, "src/agent/analysis.ts#AnalysisView.recent[].kind", "AnalysisView.recent[]", "kind", TEXT_UNKNOWN);
for (let rank = 0; rank < 14; rank++) {
  const rankKey = `rank_${String(rank).padStart(2, "0")}`;
  for (const [field, unit, sourceField] of [["timestamp_ms", "Unix milliseconds", "t"], ["markout_15m_pct", "% price move", "m15"], ["markout_1h_pct", "% price move", "m1h"]] as const) {
    const measurementId = `analysis.recent.${rankKey}.${field}`;
    addAnalysis(`analysis.recent.${rankKey}.${field}`, unit, surfaces.skipped, "up to 14 displayed non-execution decisions; renderer order measured-first then newest", "counterfactual", measurementId, `src/agent/analysis.ts#AnalysisView.recent[].${sourceField}`, "AnalysisView.recent[]", `${rankKey}.${sourceField}`, ROW_UNKNOWN);
  }
}
for (const [field, key] of [["executed", "executada"], ["failed", "falhou"], ["uncertain", "incerta"]] as const) {
  addAnalysis(`analysis.orders.outcomes.${field}`, "count", surfaces.results, "available order ledger", "operational", `analysis.orders.outcomes.${field}`, `src/agent/analysis.ts#AnalysisView.orders.outcomes['${key}']`);
}
addAnalysis("analysis.orders.reasons.by_code.count", "count of distinct failure reason codes", surfaces.results, "available order ledger", "operational", "analysis.orders.reasons.by_code.count", "src/agent/analysis.ts#AnalysisView.orders.reasons");
addAnalysis("analysis.orders.reasons[].code", "code (suppressed)", surfaces.results, "up to 6 displayed failure codes", "operational", undefined, "src/agent/analysis.ts#AnalysisView.orders.reasons", "AnalysisView.orders.reasons[]", "code", TEXT_UNKNOWN);
for (let rank = 0; rank < 6; rank++) {
  const rankKey = `rank_${String(rank).padStart(2, "0")}`;
  const measurementId = `analysis.orders.reasons.${rankKey}.count`;
  addAnalysis(`analysis.orders.reasons.${rankKey}.count`, "count", surfaces.results, "up to 6 displayed failure codes; sorted by count", "operational", measurementId, "src/agent/analysis.ts#AnalysisView.orders.reasons", "AnalysisView.orders.reasons[]", `${rankKey}.count`, ROW_UNKNOWN);
}
for (const side of ["buy", "sell"] as const) {
  addAnalysis(`analysis.orders.spent_today.${side}_usd`, "USD", ["Comando", "Sistema", "Comando limites"], "current UTC day", "gross", `analysis.orders.spent_today.${side}_usd`, `src/agent/analysis.ts#AnalysisView.orders.spentToday.${side}`);
}
addAnalysis("analysis.runtime.tokens_today", "tokens", surfaces.allHud, "current UTC day", "operational", "analysis.runtime.tokens_today", "src/agent/analysis.ts#AnalysisView.runtime.tokensToday");
addAnalysis("analysis.runtime.risk_pct", "%", surfaces.system, "current runtime", "config", "analysis.runtime.risk_pct", "src/agent/analysis.ts#AnalysisView.runtime.riskPct");
addAnalysis("analysis.calibration.brier_score", "Brier score", surfaces.decisions, "registered outcome and horizon required", "preference", undefined, "web/src/lib/hud/model.ts#buildHudModel.candidates", undefined, undefined, "The HUD exposes pBuy as a Choice preference; no calibrated probability/outcome/horizon contract is supplied. Do not use Brier or logloss.");
addAnalysis("analysis.calibration.logloss", "log loss", surfaces.decisions, "registered outcome and horizon required", "preference", undefined, "web/src/lib/hud/model.ts#buildHudModel.candidates", undefined, undefined, "The HUD exposes pBuy as a Choice preference; no calibrated probability/outcome/horizon contract is supplied. Do not use Brier or logloss.");

// Comando/Decisoes projections that are not carried by buildAnalysis's sanitized aggregate.
addHud("hud.last_consult.timestamp_ms", "Unix milliseconds", "web/src/lib/hud/types.ts#HudModel.last.atMs", surfaces.decisions, "latest consultation", "operational");
addHud("hud.last_consult.posture", "code (suppressed)", "web/src/lib/hud/types.ts#HudModel.last.posture", surfaces.decisions, "latest consultation", "preference", TEXT_UNKNOWN);
addHud("hud.candidates.count", "count", "web/src/lib/hud/types.ts#HudModel.candidates", surfaces.decisions, "latest consultation", "operational");
addHud("hud.candidates.open_count", "count", "web/src/lib/hud/model.ts#candidates", surfaces.decisions, "latest consultation", "operational");
addHud("hud.candidates.closed_count", "count", "web/src/lib/hud/model.ts#candidates", surfaces.decisions, "latest consultation", "operational");
addHud("hud.candidates.blocked_count", "count", "web/src/lib/hud/model.ts#candidates", surfaces.decisions, "latest consultation", "operational");
for (const [field, unit, semantic, fieldPath] of [
  ["symbol", "text (suppressed)", "operational", "s"], ["p_buy", "preference 0-1; not probability of profit", "preference", "pbuy"], ["closed", "boolean", "operational", "closed"],
  ["facet_late_entry", "judgment 0-1; displayed 0-100%", "preference", "facets.late_entry"], ["facet_still_falling", "judgment 0-1; displayed 0-100%", "preference", "facets.still_falling"],
  ["facet_accumulating", "judgment 0-1; displayed 0-100%", "preference", "facets.accumulating"], ["facet_exit_easy", "judgment 0-1; displayed 0-100%", "preference", "facets.exit_easy"],
  ["facet_distribution", "judgment 0-1; displayed 0-100%", "preference", "facets.distribution"], ["facet_fading", "judgment 0-1; displayed 0-100%", "preference", "facets.fading"],
  ["marks", "list of suppressed codes", "operational", "marks"], ["requested", "code (suppressed)", "preference", "requested"], ["applied", "code (suppressed)", "operational", "applied"],
  ["blocked", "HudBlock|null (suppressed)", "operational", "blocked"], ["blocked_code", "code (suppressed)", "operational", "blocked.code"],
  ["blocked_text", "text (suppressed)", "operational", "blocked.text"], ["blocked_present", "boolean", "operational", "blocked"],
  ["status", "derived status code (suppressed)", "operational", "closed/blocked/applied"],
] as const) {
  const derived = field === "status";
  const code = field === "blocked_code" || field === "blocked_text" ? "web/src/lib/hud/types.ts#HudCandidate.blocked"
    : derived ? "web/src/lib/hud/draw/analysis.ts#createAnalysis.matrix status" : `web/src/lib/hud/types.ts#HudCandidate.${fieldPath.split(".")[0]}`;
  const suppressed = field === "symbol" || field === "marks" || field === "requested" || field === "applied" || field === "blocked_code" || field === "blocked_text" || field === "blocked";
  addMetric(`hud.candidates[].${field}`, unit, code, surfaces.decisions, "up to 9 displayed candidates", semantic, {
    arrayPath: "HudModel.candidates[]", fieldPath,
    unknownReason: derived ? "The HUD derives the status label from closed, blocked, and applied; the snapshot does not freeze that rendered label."
      : suppressed ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
addHud("hud.candidates.best_open_buy_preference", "preference 0-1; not probability of profit", "web/src/lib/hud/draw/command.ts#createCommand.decision best", surfaces.command, "highest-ranked open candidate", "preference", "The HUD selects the largest non-closed candidate pbuy; no best-candidate summary is present in the online observation.");
addHud("hud.candidates.best_open_buy_symbol", "text (suppressed)", "web/src/lib/hud/draw/command.ts#createCommand.decision best", surfaces.command, "highest-ranked open candidate", "preference", TEXT_UNKNOWN);
addHud("hud.candidates.total_displayed", "count (max 8)", "web/src/lib/hud/draw/command.ts#createCommand.decision list", surfaces.command, "latest consultation", "operational");
addHud("hud.candidates.open_displayed", "count", "web/src/lib/hud/draw/command.ts#createCommand.decision", surfaces.command, "latest consultation", "operational");
addHud("hud.candidates.closed_displayed", "count", "web/src/lib/hud/draw/command.ts#createCommand.decision", surfaces.command, "latest consultation", "operational");
addHud("hud.candidates.blocked_displayed", "count", "web/src/lib/hud/draw/command.ts#createCommand.decision", surfaces.command, "latest consultation", "operational");
addHud("hud.candidates.latest_decision_status", "code (suppressed)", "web/src/lib/hud/draw/command.ts#createCommand.decision", surfaces.command, "latest consultation", "preference", TEXT_UNKNOWN);
addHud("hud.blocked.latest_count", "count", "web/src/lib/hud/types.ts#HudModel.last.dropped", surfaces.command, "latest cycle", "operational");
addHud("hud.blocked.streak_cycles", "cycles", "web/src/lib/hud/types.ts#HudModel.last.streak.cycles", surfaces.command, "consecutive latest cycles", "operational");
addHud("hud.blocked.streak_exact", "boolean", "web/src/lib/hud/types.ts#HudModel.last.streak.exact", surfaces.command, "consecutive latest cycles", "operational");
for (const [field, unit, fieldPath] of [["symbol", "text (suppressed)", "s"], ["side", "code", "side"], ["reason_code", "code (suppressed)", "code"], ["reason_text", "text (suppressed)", "text"]] as const) {
  addMetric(`hud.blocked.latest[].${field}`, unit, `web/src/lib/hud/types.ts#HudDropped.${fieldPath}`, surfaces.command, "up to 8 latest dropped choices", "operational", {
    arrayPath: "HudModel.last.dropped[]", fieldPath, unknownReason: field === "side" ? ROW_UNKNOWN : TEXT_UNKNOWN,
  });
}
addHud("hud.cycles.count", "count", "web/src/lib/hud/model.ts#cycles", surfaces.command, "latest 48 cycles", "operational");
addHud("hud.cycles.by_outcome.count", "count by outcome", "web/src/lib/hud/model.ts#cycles", surfaces.command, "latest 48 cycles", "operational");
for (const [field, unit, fieldPath] of [["timestamp_ms", "Unix milliseconds", "t"], ["outcome_code", "code (suppressed)", "o"], ["order_sent", "boolean", "p"]] as const) {
  addMetric(`hud.cycles[].${field}`, unit, `web/src/lib/hud/types.ts#HudModel.cycles[].${fieldPath}`, surfaces.command, "latest 48 cycles", "operational", {
    arrayPath: "HudModel.cycles[]", fieldPath, unknownReason: field === "outcome_code" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
addHud("hud.cycles.outcome.decidido_count", "count", "web/src/lib/hud/draw/command.ts#createCommand.cyclesPanel", surfaces.command, "latest 48 cycles", "operational");
addHud("hud.cycles.outcome.mantido_count", "count", "web/src/lib/hud/draw/command.ts#createCommand.cyclesPanel", surfaces.command, "latest 48 cycles", "operational");
addHud("hud.cycles.outcome.other_count", "count", "web/src/lib/hud/draw/command.ts#createCommand.cyclesPanel", surfaces.command, "latest 48 cycles", "operational");
addHud("hud.cycles.with_order_count", "count", "web/src/lib/hud/draw/command.ts#createCommand.cyclesPanel", surfaces.command, "latest 48 cycles", "operational");
addHud("hud.cycles.last_timestamp_ms", "Unix milliseconds", "web/src/lib/hud/draw/command.ts#createCommand.cyclesPanel", surfaces.command, "latest 48 cycles", "operational");
addHud("hud.events.count", "count (max 8)", "web/src/lib/hud/model.ts#events", surfaces.command, "latest 8 visible events", "operational");
for (const [field, unit, fieldPath] of [["timestamp_ms", "Unix milliseconds", "t"], ["side", "code", "side"], ["symbol", "text (suppressed)", "s"], ["usd", "USD", "usd"], ["stage", "code", "stage"], ["source", "code", "src"], ["reason", "code (suppressed)", "reason"], ["receipt", "code (suppressed)", "receipt"]] as const) {
  addMetric(`hud.events[].${field}`, unit, `web/src/lib/hud/types.ts#HudEvent.${fieldPath}`, surfaces.command, "latest 8 visible events", field === "usd" ? "gross" : "operational", {
    arrayPath: "HudModel.events[]", fieldPath, unknownReason: field === "symbol" || field === "reason" || field === "receipt" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
addMetric("hud.activity.daily_consults", "count", "web/src/lib/hud/model.ts#status.budget.consults <- runtime agent budget", surfaces.allHud, "current UTC day", "operational", {
  measurementId: "runtime.agent_budget.consults",
  unknownReason: "The daily budget snapshot does not include a validated consult count.",
});
addHud("hud.activity.daily_consult_cap", "count", "web/src/lib/hud/types.ts#HudModel.budget.max", surfaces.allHud, "current UTC day", "config", "The daily consult cap depends on settings excluded from the online observation.");
for (const [field, unit] of [["items_evaluated", "count"], ["buy_requests", "count"], ["code_blocked", "count"], ["orders_executed", "count"], ["chain_failures", "count"]] as const) {
  addHud(`hud.activity.${field}`, unit, "web/src/lib/hud/draw/analysis.ts#createAnalysis.activity", surfaces.results, "latest 25 consultations", "operational");
}

// System status and wallet readiness. Health fields rendered in Comando are cataloged once below.
for (const [field, unit, semantic, source] of [
  ["mode", "code (suppressed)", "operational", "HudSystem.mode"], ["authority", "code (suppressed)", "config", "HudSystem.authority"], ["profile", "code (suppressed)", "config", "HudSystem.profile"],
  ["scheduler_started", "boolean", "operational", "HudModel.agent.cycling"], ["cycle_interval_min", "minutes", "config", "HudModel.rhythm.intervalMin"],
  ["last_cycle_at_ms", "Unix milliseconds", "operational", "HudModel.rhythm.lastAtMs"], ["next_cycle_at_ms", "Unix milliseconds", "operational", "HudModel.rhythm.nextAtMs"],
  ["paused", "boolean", "operational", "HudModel.agent.paused"], ["pause_reason", "code (suppressed)", "operational", "HudModel.agent.pauseReason"],
  ["model_name", "text (suppressed)", "config", "HudModel.agent.model"],
  ["wallet_next_step", "code", "operational", "HudSystem.wallet.next"], ["cli_installed", "boolean", "operational", "HudSystem.wallet.cli"],
  ["wallet_login_state", "code (suppressed)", "operational", "HudModel.health.login + HudSystem.wallet.login"], ["wallet_policy_state", "code (suppressed)", "config", "HudSystem.wallet.policy"],
  ["wallet_session_days_left", "days", "operational", "HudModel.health.sessionDays + HudSystem.wallet.sessionDays"], ["wallet_login_url_present", "boolean (URL value suppressed)", "operational", "HudSystem.wallet.loginUrl"],
  ["evm_address_present", "boolean (address value suppressed)", "operational", "HudSystem.wallet.evm"], ["solana_address_present", "boolean (address value suppressed)", "operational", "HudSystem.wallet.solana"],
] as const) {
  const suppressed = field.includes("state") || field === "mode" || field === "authority" || field === "profile" || field === "pause_reason" || field === "wallet_policy_state" || field === "model_name";
  const sensitive = field.includes("address") || field === "wallet_login_url_present";
  const sharedWalletField = field === "wallet_login_state" || field === "wallet_session_days_left";
  const sharedHeaderField = field === "mode" || field === "authority" || field === "profile" || field === "scheduler_started" || field === "paused" || field === "model_name";
  const systemOnlyField = field.startsWith("wallet_") || field === "cli_installed" || field === "evm_address_present" || field === "solana_address_present";
  const fieldSurfaces = sharedWalletField ? ["Comando", "Sistema"]
    : sharedHeaderField ? surfaces.allHud
      : field === "last_cycle_at_ms" ? surfaces.hidden
        : field === "next_cycle_at_ms" || field === "pause_reason" ? surfaces.command
          : systemOnlyField ? ["Sistema"]
            : surfaces.system;
  const sourceCode = field === "next_cycle_at_ms"
    ? "web/src/lib/hud/live.ts#countdownAt(HudModel.rhythm.nextAtMs)"
    : `web/src/lib/hud/types.ts#${source}`;
  addHud(`hud.system.${field}`, unit, sourceCode, fieldSurfaces, "current status", semantic, sensitive ? "The source may contain an address or URL; the report never includes it, and no current HUD reading is present in collected evidence." : suppressed ? TEXT_UNKNOWN : HUD_STATUS_UNKNOWN);
}
for (const [field, unit, semantic, source, path] of [
  ["stage", "code", "operational", "stage", "stage"], ["side", "code", "operational", "side", "side"],
  ["symbol", "text (suppressed)", "operational", "symbol", "symbol"], ["usd", "USD", "gross", "usd", "usd"],
  ["age_min", "minutes", "operational", "ageMin", "ageMin"], ["detail", "text (suppressed)", "operational", "said", "said"],
  ["needs_attestation", "boolean", "operational", "needsWord", "needsWord"], ["source", "code", "operational", "source", "source"],
] as const) {
  addMetric(`hud.system.in_flight[].${field}`, unit, `web/src/lib/hud/types.ts#HudInFlight.${source}`, ["Comando", "Sistema"], "up to 3 command lines / 2 system lines; each unresolved sent order", semantic, {
    arrayPath: "HudSystem.inFlight[]", fieldPath: path, unknownReason: field === "symbol" || field === "detail" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
addHud("hud.system.in_flight.count", "count", "web/src/lib/hud/model.ts#status.inFlight.length", ["Comando", "Sistema"], "all unresolved sent orders; current status", "operational");
addHud("hud.system.in_flight.awaiting_attestation_count", "count", "web/src/lib/hud/draw/scene.ts#status.waiting", surfaces.allHud, "all unresolved orders requiring user attestation; current status", "operational");
addHud("hud.system.logs.count", "count (max 8)", "web/src/lib/hud/model.ts#systemLog", ["Sistema"], "latest 8 log lines", "operational");
for (const [field, unit, source] of [["timestamp_ms", "Unix milliseconds", "t"], ["tone", "code", "tone"], ["line", "text (suppressed)", "text"]] as const) {
  addMetric(`hud.system.logs[].${field}`, unit, `web/src/lib/hud/types.ts#HudLogLine.${source}`, ["Sistema"], "latest 8 log lines", "operational", {
    arrayPath: "HudSystem.log[]", fieldPath: source, unknownReason: field === "line" ? TEXT_UNKNOWN : ROW_UNKNOWN,
  });
}
for (const [field, unit, semantic, source] of [
  ["model_status", "boolean", "operational", "modelOk"], ["ledger_status", "boolean", "operational", "ledgerOk"],
  ["plans_status", "boolean", "operational", "plansOk"], ["lock_status", "boolean", "operational", "lock"],
] as const) {
  addHud(`hud.health.${field}`, unit, `web/src/lib/hud/types.ts#HudModel.health.${source}`, surfaces.command, "current status", semantic);
}
addHud("hud.health.rows_count", "count (max 8)", "web/src/lib/hud/draw/command.ts#createCommand.healthRows", surfaces.command, "current status", "operational", "Health rows are conditionally composed from multiple status fields; no current HUD snapshot is supplied.");
addHud("hud.health.attention_state", "code", "web/src/lib/hud/draw/command.ts#createCommand.health", surfaces.command, "current status", "operational", "Attention state is derived from cycling, pause, lock, in-flight orders, and record health; no current HUD snapshot is supplied.");
for (const node of ["brief", "jev", "quote", "executor", "receipt"] as const) {
  addHud(`hud.core.nodes.${node}.status`, "display code", "web/src/lib/hud/draw/command.ts#createCommand.core nodes", surfaces.command, "derived from latest visible event", "operational", "These are renderer heuristics, not independent health probes; current event/HUD state is absent from the online observation.");
}
for (const [field, unit, semantic, source] of [
  ["busy", "code (suppressed)", "operational", "busy"], ["notice_tone", "code", "operational", "notice.tone"],
  ["notice_text", "text (suppressed)", "operational", "notice.text"], ["stop_confirmation_open", "boolean", "operational", "confirmStop"],
] as const) {
  addHud(`hud.ui.${field}`, unit, `web/src/lib/hud/types.ts#HudUi.${source}`, surfaces.system, "current UI state", semantic, field === "notice_text" || field === "busy" ? TEXT_UNKNOWN : HUD_STATUS_UNKNOWN);
}
for (const [field, unit, semantic, source] of [
  ["daily_buy_cap_usd", "USD", "config", "HudModel.agent.caps.maxDailyBuyUsd"],
  ["daily_sell_cap_usd", "USD", "config", "HudModel.agent.caps.maxDailySellUsd"],
  ["max_single_buy_usd", "USD", "config", "HudModel.agent.caps.maxBuyUsd"],
  ["cash_share_pct", "%", "gross", "HudModel.wallet.cash / HudModel.wallet.total"],
  ["reserve_share_pct", "%", "config", "HudModel.agent.reserveShare"],
  ["leverage_authorized", "boolean", "config", "HudModel.agent.leverage.granted"],
  ["authorized_instrument_count", "count", "config", "HudModel.agent.leverage.instruments"],
  ["impact_buy_pct", "%", "config", "HudModel.guards.impactPct.buy"],
  ["impact_sell_pct", "%", "config", "HudModel.guards.impactPct.sell"],
  ["impact_protection_pct", "%", "config", "HudModel.guards.impactPct.protecao"],
  ["tax_pct", "%", "config", "HudModel.guards.taxPct"],
  ["slippage_buy_pct", "%", "config", "HudModel.guards.slippagePct.buy"],
  ["slippage_sell_pct", "%", "config", "HudModel.guards.slippagePct.sell"],
  ["slippage_protection_pct", "%", "config", "HudModel.guards.slippagePct.protecao"],
  ["buy_cost_share_of_stop", "fraction of stop", "config", "HudModel.guards.buyCostShareOfStop"],
  ["native_fee_reserve_kind", "code", "config", "HudModel.guards.nativeReserve.kind"],
  ["native_fee_reserve_usd", "USD", "config", "HudModel.guards.nativeReserve.usd"],
  ["native_fee_measured_usd", "USD", "operational", "HudModel.guards.nativeReserve.usd"],
] as const) {
  addHud(`hud.limits.${field}`, unit, `web/src/lib/hud/types.ts#${source}`, [...surfaces.system, "Comando limites"], "current configured guard or current UTC day", semantic);
}
addHud("hud.limits.buy_spend_display_valid", "boolean", "web/src/lib/hud/draw/analysis.ts#createAnalysis.limits", surfaces.system, "current analysis availability", "operational", "The HUD can draw EMPTY_ANALYSIS.spentToday as zero if analysis is absent; no current status is supplied, so do not treat the UI zero as observed spend.");
addHud("hud.provider.month_key", "month code", "web/src/lib/hud/types.ts#HudResources.monthKey", surfaces.system, "provider quota month", "operational", TEXT_UNKNOWN);
addHud("hud.provider.month_days", "days", "web/src/lib/hud/types.ts#HudResources.days", surfaces.system, "provider quota month", "operational");
addHud("hud.provider.requests_per_second", "requests/second", "web/src/lib/hud/types.ts#HudResources.rate.requestsPerSecond", surfaces.system, "provider rate limit", "config");
addHud("hud.provider.tokens_per_second", "tokens/second", "web/src/lib/hud/types.ts#HudResources.rate.tokensPerSecond", surfaces.system, "provider rate limit", "config");
for (const tier of ["free", "basic", "premium"] as const) {
  for (const account of ["local", "account"] as const) {
    for (const [field, unit, source] of [
      ["status", "code", "status"], ["cap_evidence", "code", "capEvidence"], ["used", "count", "used"],
      ["monthly_cap", "count", "monthlyCap"], ["remaining", "count", "remaining"], ["age_ms", "milliseconds", "ageMs"],
    ] as const) {
      addHud(`hud.provider.${tier}.${account}.${field}`, unit, `web/src/lib/hud/types.ts#HudMeter.${source}`, surfaces.system, "provider quota observation", "operational", field === "status" || field === "cap_evidence" ? TEXT_UNKNOWN : HUD_STATUS_UNKNOWN);
    }
  }
}
addHud("hud.market_context.btc_24h_pct", "%", "web/src/lib/hud/types.ts#HudModel.context.btc", surfaces.allHud, "latest decision context; shared header", "operational");
addHud("hud.market_context.eth_24h_pct", "%", "web/src/lib/hud/types.ts#HudModel.context.eth", surfaces.allHud, "latest decision context; shared header", "operational");
addHud("hud.market_context.trend", "code (suppressed)", "web/src/lib/hud/types.ts#HudModel.context.trend", surfaces.allHud, "latest decision context; shared header", "operational", TEXT_UNKNOWN);

// Choice requests are preferences, and six facets are judgments; none is an outcome probability or calibrated score.
for (const [field, measurementId, horizon] of [
  ["total", "hud.preference_buy_histogram.total", "all consultations"],
  ["fresh", "hud.preference_buy_histogram.fresh", "consultations tagged criteria=rank-v1"],
] as const) {
  addMetric(`hud.preference_buy_histogram.${field}`, "count of valid preferences", "web/src/lib/hud/draw/analysis.ts#createAnalysis.hist", surfaces.decisions, horizon, "preference", {
    measurementId,
    unknownReason: "The displayed valid-preference count is not present in the online observation; bin absence or invalid pBuy values are not zero.",
  });
}
addHud("hud.preference_buy_pbuy", "preference 0-1; not calibrated probability", "web/src/lib/hud/model.ts#buyPreference", surfaces.decisions, "no calibrated event/horizon supplied", "preference", "pBuy is the largest Choice preference for a purchase option, not calibrated winProbability.");

// Usage page: calls reaching the model, provider-measured tokens, prices, and real/estimated costs are separate fields.
for (const period of ["today", "month"] as const) {
  for (const [field, unit, semantic, sourceField] of [
    ["calls", "count of model calls reached", "operational", "calls"], ["usd", "USD nullable", "net_estimated", "usd"],
    ["tokens", "tokens nullable", "operational", "tokens"], ["onchainos_calls", "count", "operational", "onchainosCalls"],
    ["avg_latency_ms", "milliseconds nullable", "operational", "avgLatencyMs"],
  ] as const) {
    addMetric(`usage.${period}.${field}`, unit, `src/inonu/ledger.ts#Totals -> web/src/lib/inonu/usage.ts#Totals.${sourceField}`, surfaces.usage, `current ${period}`, semantic, {
      measurementId: `usage.${period}.${field}`,
      unknownReason: USAGE_UNKNOWN,
    });
  }
}
for (const side of ["input", "output"] as const) {
  addMetric(`usage.configured_price_per_million.${side}_usd`, "USD per 1M tokens nullable", `web/src/lib/inonu/usage.ts#Prices.${side}`, surfaces.usage, "current configured pricing", "config", { unknownReason: USAGE_UNKNOWN });
}
addMetric("usage.recent.count", "count (max 12)", "web/src/lib/inonu/usage.ts#Usage.recent", surfaces.usage, "latest 12 calls", "operational", { unknownReason: USAGE_UNKNOWN });
for (const [field, unit, semantic, sourceField] of [
  ["timestamp_ms", "Unix milliseconds", "operational", "atMs"], ["mode", "code (suppressed)", "operational", "modo"],
  ["model", "text (suppressed)", "config", "modelo"], ["result", "code (suppressed)", "operational", "resultado"],
  ["tokens", "tokens nullable", "operational", "tokens"], ["usd", "USD nullable", "net_estimated", "usd"],
  ["latency_ms", "milliseconds nullable", "operational", "latenciaMs"], ["onchainos_calls", "count nullable", "operational", "chamadasOnchainos"],
  ["model_calls", "count 0-2", "operational", "chamadasModelo"],
] as const) {
  addMetric(`usage.recent[].${field}`, unit, `web/src/lib/inonu/usage.ts#RecentCall.${sourceField}`, surfaces.usage, "each of latest 12 calls", semantic, {
    arrayPath: "Usage.recent[]", fieldPath: sourceField, unknownReason: field === "model" || field === "result" ? TEXT_UNKNOWN : USAGE_UNKNOWN,
  });
}
addMetric("usage.recent[].evaluations.count", "count 0-2", "web/src/lib/inonu/usage.ts#RecentCall.avaliacoes", surfaces.usage, "each recent call", "operational", {
  arrayPath: "Usage.recent[]", fieldPath: "avaliacoes.length", unknownReason: USAGE_UNKNOWN,
});
for (const [field, unit, semantic, sourceField] of [
  ["stage", "1 or 2", "operational", "indice"], ["input_tokens", "tokens nullable", "operational", "tokensEntrada"],
  ["output_tokens", "tokens nullable", "operational", "tokensSaida"], ["usd", "USD nullable", "net_estimated", "usd"],
  ["estimated_usd", "USD nullable", "net_estimated", "usdEstimado"],
] as const) {
  addMetric(`usage.recent[].evaluations[].${field}`, unit, `web/src/lib/inonu/usage.ts#EvaluationUsage.${sourceField}`, surfaces.usage, "each model evaluation in recent calls", semantic, {
    arrayPath: "Usage.recent[].avaliacoes[]", fieldPath: sourceField, unknownReason: USAGE_UNKNOWN,
  });
}
addMetric("usage.providers.count", "count", "web/src/lib/inonu/usage.ts#parseProviders", surfaces.usage, "configured provider directory", "config", { unknownReason: USAGE_UNKNOWN });
for (const [field, sourceField] of [["id", "id"], ["label", "label"], ["url", "url"], ["usage", "uso"], ["cost", "custo"], ["speaker", "quemFala"]] as const) {
  addMetric(`usage.providers[].${field}`, "text (suppressed)", `web/src/lib/inonu/usage.ts#ProviderRow.${sourceField}`, surfaces.usage, "each configured provider", "config", {
    arrayPath: "ProviderRow[]", fieldPath: sourceField, unknownReason: TEXT_UNKNOWN,
  });
}
addHud("usage.price_save_feedback", "code/text (suppressed)", "web/src/components/Settings/InonuUsage.tsx#saved/formError", surfaces.usage, "latest price save attempt", "operational", "Save feedback and form errors are local UI state and are not part of the online observation.");

for (const window of ["15m", "1h", "4h", "24h"] as const) {
  for (const partition of ["all", "inaction", "by_mode.desligado", "by_mode.sombra", "by_mode.limitado"] as const) {
    const prefix = partition === "all" ? `scoreboard.windows.${window}`
      : partition === "inaction" ? `scoreboard.inaction.windows.${window}`
        : `scoreboard.byMode.${partition.slice("by_mode.".length)}.${window}`;
    for (const [field, unit, sourceField, semantic] of [
      ["n", "count", "n", "operational"], ["notional_usd", "USD", "notionalUsd", "gross"],
      ["overlapping", "count", "overlapping", "operational"], ["settled", "count", "settled", "operational"],
      ["pending", "count", "pending", "operational"], ["unknown_price", "count", "unknownPrice", "operational"],
      ["gross_usd", "USD before estimated cost", "grossUsd", "gross"], ["net_usd", "USD nullable; quote-cost estimate only", "netUsd", "net_estimated"],
      ["hit_rate_ratio", "ratio [0,1] nullable; settled-hit fraction, not probability calibration", "hitRate", "counterfactual"],
      ["claim", "code (suppressed)", "claim", "operational"], ["claim_basis", "code (suppressed)", "claimBasis", "operational"],
      ["claim_reason", "code (suppressed)", "claimReason", "operational"],
    ] as const) {
      const measurementId = field === "claim" || field === "claim_basis" || field === "claim_reason"
        ? undefined
        : `status.scoreboard.${window}.${partition}.${field}`;
      addMetric(`status.scoreboard.${window}.${partition}.${field}`, unit, `src/agent/scoreboard.ts#WindowSummary.${sourceField}`, surfaces.status, `scoreboard ${window} ${partition} window`, semantic, {
        ...(measurementId === undefined ? {} : { measurementId }),
        unknownReason: field === "claim" || field === "claim_basis" || field === "claim_reason" ? TEXT_UNKNOWN : "Scoreboard/performance status was not captured or failed schema validation; no status route is queried.",
      });
      const last = definitions[definitions.length - 1]!;
      definitions[definitions.length - 1] = { ...last, schemaPath: `status.${prefix}.${sourceField}` };
    }
  }
}
for (const [field, sourceField] of [["decisions", "decisions"], ["protective", "protective"], ["no_entry_price", "noEntryPrice"], ["inaction_decisions", "inaction.decisions"]] as const) {
  addMetric(`status.scoreboard.${field}`, "count", `src/agent/scoreboard.ts#ScoreboardSummary.${sourceField}`, surfaces.status, "current scoreboard totals", "operational", {
    measurementId: `status.scoreboard.${field}`,
    unknownReason: "Scoreboard/performance status was not captured or failed schema validation; no status route is queried.",
  });
}
for (const [field, sourceField, unit, semantic] of [
  ["settled", "settled", "count", "operational"], ["claim", "claim", "code (suppressed)", "operational"],
  ["claim_basis", "claimBasis", "code (suppressed)", "operational"], ["claim_reason", "claimReason", "code (suppressed)", "operational"],
  ["net_usd", "netUsd", "USD nullable; estimated cost basis", "net_estimated"], ["gross_usd", "grossUsd", "USD", "gross"],
] as const) {
  const measurementId = field === "claim" || field === "claim_basis" || field === "claim_reason"
    ? undefined
    : `status.scoreboard.24h.all.${field}`;
  addMetric(`status.evidence.24h.${field}`, unit, `src/agent/wire.ts#AgentStatus.evidence.${sourceField}`, surfaces.status, "evidence 24h", semantic, {
    ...(measurementId === undefined ? {} : { measurementId }),
    unknownReason: field === "claim" || field === "claim_basis" || field === "claim_reason" ? TEXT_UNKNOWN : "Scoreboard/evidence status was not captured or failed schema validation; no status route is queried.",
  });
}
addMetric("status.performance.series.count", "count", "src/agent/wire.ts#AgentStatus.performance.series", surfaces.status, "latest 4000 equity points", "gross", {
  measurementId: "status.performance.series.count",
  unknownReason: "Validated captured equity input is unavailable for the status series projection.",
});
for (const [field, unit, sourceField] of [["timestamp_ms", "Unix milliseconds", "t"], ["value_usd", "USD", "v"]] as const) {
  addMetric(`status.performance.series[].${field}`, unit, `src/agent/equity-log.ts#EquityPoint.${sourceField}`, surfaces.status, "each of latest 4000 equity points", "gross", {
    arrayPath: "AgentStatus.performance.series[]", fieldPath: sourceField, unknownReason: "Validated captured equity input is unavailable for the status series projection.",
  });
}
for (const [field, sourceField] of [["count", "n"], ["acerto", "acerto"], ["medio", "medio"], ["melhor", "melhor"], ["pior", "pior"]] as const) {
  addMetric(`status.performance.record.14d_window_1h.groups[].${field === "count" ? "n" : field}`, field === "count" ? "count" : "% nullable; raw group statistic", `src/agent/scoreboard.ts#Scoreboard.record[].${sourceField}`, surfaces.status, "records from last 14 days measured at the 1h horizon", "counterfactual", {
    arrayPath: "AgentStatus.performance.record[group]", fieldPath: sourceField, unknownReason: "Scoreboard/performance status was not captured or failed schema validation; no status route is queried.",
  });
}
addMetric("status.performance.record.14d_window_1h.groups.count", "count of dynamic record groups", "src/agent/scoreboard.ts#Scoreboard.record", surfaces.status, "records from last 14 days measured at the 1h horizon", "operational", {
  measurementId: "status.performance.record.14d_window_1h.groups.count",
  unknownReason: "Scoreboard/performance status was not captured or failed schema validation; no status route is queried.",
});
addHud("status.performance.record.14d_window_1h.groups[].group", "code (suppressed)", "src/agent/scoreboard.ts#Scoreboard.record keys", surfaces.status, "records from last 14 days measured at the 1h horizon", "operational", TEXT_UNKNOWN);
// Model fields exposed to the view contract but not drawn: they remain inventoried with their actual meaning.
addHud("hidden.agent.risk_pct", "%", "web/src/lib/hud/types.ts#HudModel.agent.riskPct", surfaces.hidden, "current analysis/runtime", "config");
addHud("hidden.position.share_pct", "% of portfolio", "web/src/lib/hud/types.ts#HudPosition.share", surfaces.hidden, "current position read", "gross");
for (const [field, unit] of [["since_entry_pct", "%",], ["to_target_pct", "%"], ["to_stop_pct", "%"], ["hours_held", "hours"], ["hours_left", "hours"]] as const) {
  addHud(`hidden.position.plan.${field}`, unit, `web/src/lib/hud/types.ts#HudPosition.plan.${field}`, surfaces.hidden, "current open position plan", "operational");
}

for (const [field, unit, semantic, horizon] of [
  ["latest_usd", "USD; partial price-marked snapshot", "gross", "latest validated local wallet snapshot"],
  ["latest_holdings_count", "count of holdings; identifiers suppressed", "operational", "latest validated local wallet snapshot"],
  ["unpriced_holdings_count", "count of latest recorded holdings with null price; identifiers suppressed", "operational", "latest validated local wallet snapshot"],
  ["history.snapshot_count", "count of snapshots", "operational", "all validated local equity history rows"],
  ["history.first_at_ms", "Unix milliseconds", "operational", "earliest validated local equity history row"],
  ["history.last_at_ms", "Unix milliseconds", "operational", "latest validated local equity history row"],
  ["history.first_usd", "USD; partial price-marked snapshot", "gross", "earliest validated local equity history row"],
  ["history.last_usd", "USD; partial price-marked snapshot", "gross", "latest validated local equity history row"],
  ["history.change_usd", "USD raw balance change including external flows; not net return", "gross", "first to latest validated local equity history row"],
  ["history.change_pct", "% raw balance change including external flows; not return", "gross", "first to latest validated local equity history row"],
] as const) {
  const id = `wallet.equity.${field}`;
  addMetric(id, unit, "src/agent/equity-log.ts#parseSnapshotLine -> src/agent/equity.ts#buildSeries/summarize", ["Collected local wallet equity; identifiers suppressed; not flow-adjusted return"], horizon, semantic, {
    measurementId: id,
    unknownReason: "No sanitized local wallet-equity projection for this field is available in collected online evidence.",
  });
}
for (const [field, unit, semantic] of [
  ["day", "UTC date", "operational"],
  ["committed_tokens", "tokens", "operational"],
  ["measured_tokens", "tokens", "operational"],
  ["unmeasured_calls", "count", "operational"],
] as const) {
  const id = `runtime.agent_budget.${field}`;
  addMetric(id, unit, "runtime/data/agent/budget.json#validated budget projection", ["Online runtime budget summary"], "current UTC day", semantic, {
    measurementId: id,
    unknownReason: "The validated local agent-budget projection is not present in the online observation.",
  });
}
// Collected online evidence is reduced to safe scalar diagnostics; it is deliberately not mixed with HUD values or synthetic workload metrics.
for (const [field, unit] of [
  ["orders_total", "orders"], ["fills_exact", "fills"], ["round_trips", "round trips"], ["complete_ledger", "boolean"],
  ["invalid_order_rows", "orders"], ["fee_known_orders", "orders"], ["net_usd_known_orders", "orders"], ["round_trips_net_usd_known", "round trips"],
] as const) {
  addMetric(`audit.execution.${field}`, unit, "scripts/autoresearch/online-report.ts#buildOnlineReport execution evidence", ["Collected online execution evidence; not HUD PnL"], "available online execution projection", "operational", {
    measurementId: `audit.execution.${field}`,
    unknownReason: "Execution coverage is not available in the online observation.",
  });
}
addMetric("audit.review.review_count", "reviews", "scripts/autoresearch/online-report.ts#buildOnlineReport review evidence", ["Collected online review evidence"], "available online review projection", "operational", { measurementId: "audit.review.review_count" });
for (const [field, unit] of [["references_valid", "records"], ["experiments_pending", "records"], ["outcomes_mature", "records"]] as const) {
  addMetric(`evolution.${field}`, unit, "scripts/autoresearch/online-report.ts#buildOnlineReport prospective evidence", ["Collected online prospective evidence; not realized PnL"], "available online prospective projection", "operational", { measurementId: `evolution.${field}` });
}
addMetric("audit.execution.fee_cost_usd_known_orders", "count", "scripts/autoresearch/online-report.ts#buildOnlineReport execution cost conversion", ["Collected online cost coverage"], "available online execution projection", "operational", {
  measurementId: "audit.execution.fee_cost_usd_known_orders",
  unknownReason: "The online observation does not provide contemporaneous native-fee/USD coverage.",
});
addMetric("audit.portfolio.external_flows_reconciled", "boolean", "scripts/autoresearch/online-report.ts#buildOnlineReport portfolio reconciliation", ["Collected online portfolio reconciliation"], "portfolio observation period", "operational", {
  measurementId: "audit.portfolio.external_flows_reconciled",
  unknownReason: "The online observation covers no complete wallet balance and external-flow reconciliation.",
});
addMetric("provider.onchain.month", "UTC month YYYY-MM", "src/onchain-read/budget.ts#BudgetSnapshot.month", ["Settings / Usage; collected provider budget"], "latest provider budget month", "operational", {
  measurementId: "provider.onchain.month", unknownReason: "Provider budget month is not present in the online observation.",
});
addMetric("provider.onchain.restarted_from_corrupt_file", "boolean", "src/onchain-read/budget.ts#BudgetSnapshot.restartedFromCorruptFile", ["Settings / Usage; collected provider budget"], "latest provider budget month", "operational", {
  measurementId: "provider.onchain.restarted_from_corrupt_file", unknownReason: "Provider budget integrity status is not present in the online observation.",
});
for (const tier of ["free", "basic", "premium"] as const) {
  for (const [field, unit] of [["used", "count of calls this month"], ["today", "count of calls today"], ["projection", "projected count for month"]] as const) {
    const id = `provider.onchain.tiers.${tier}.${field}`;
    addMetric(id, unit, `src/onchain-read/budget.ts#BudgetTierSnapshot.${field}`, ["Settings / Usage; collected provider budget"], "latest provider budget month", "operational", {
      measurementId: id, unknownReason: "Provider budget usage counters are not present in the online observation.",
    });
  }
  const measurementId = tier === "free" ? undefined : `provider.onchain.tiers.${tier}.cap`;
  addMetric(`provider.onchain.tiers.${tier}.cap`, "count of calls/month", "src/onchain-read/budget.ts#BudgetTierSnapshot.cap", ["Settings / Usage; collected provider budget"], "latest provider budget month", "config", {
    ...(measurementId === undefined ? {} : { measurementId }),
    unknownReason: tier === "free"
      ? "The free tier has no finite configured monthly cap (null/unbounded); it is not 0."
      : "Provider monthly cap depends on settings excluded from the online observation.",
  });
}

const marketPattern = /^market\.(quant90|quant365)\.([A-Za-z0-9-]{1,48})\.([a-z0-9_]+)$/;
function marketDatasetLabels(snapshot: EvidenceSnapshot): Map<string, string> {
  const datasetKeys = [...new Set(snapshot.measurements.flatMap((measurement) => {
    const match = marketPattern.exec(measurement.id);
    return match === null ? [] : [`${match[1]}.${match[2]}`];
  }))].sort(compareText);
  return new Map(datasetKeys.map((key, index) => [key, `dataset_${String(index + 1).padStart(3, "0")}`]));
}



export const PANEL_METRIC_CATALOG: readonly PanelMetricDefinition[] = definitions;

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
function sourceIndex(snapshot: EvidenceSnapshot): Map<string, EvidenceSource[]> {
  const result = new Map<string, EvidenceSource[]>();
  for (const source of snapshot.sources) result.set(source.id, [...(result.get(source.id) ?? []), source]);
  return result;
}
function measurementIndex(snapshot: EvidenceSnapshot): Map<string, EvidenceMeasurement[]> {
  const result = new Map<string, EvidenceMeasurement[]>();
  for (const measurement of snapshot.measurements) result.set(measurement.id, [...(result.get(measurement.id) ?? []), measurement]);
  return result;
}
function safeDigest(value: string | null): string | null {
  return value !== null && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}
function safeSourceLabels(snapshot: EvidenceSnapshot): Map<string, string> {
  const ids = [...new Set(snapshot.sources.map((source) => source.id))].sort(compareText);
  const redactedIds = new Set(snapshot.sources.filter((source) => source.classification !== "local_process").map((source) => source.id));
  const labels = new Map<string, string>();
  let anonymous = 1;
  for (const id of ids) {
    const safe = !redactedIds.has(id)
      && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id)
      && !/^(?:market|public_market|quant\d*)[._-]/i.test(id)
      && !/^(?:0x[a-f0-9]{40}|[a-f0-9]{64})$/i.test(id);
    labels.set(id, safe ? id : `source_${String(anonymous++).padStart(3, "0")}`);
  }
  return labels;
}
const safeAggregateMeasurementPatterns = [
  /^hud\.preference_buy_histogram\.(?:total|fresh)$/,
  /^online\.ledger\.tail_(?:records|order_records|cycle_records)$/,
  /^analysis\.source\.(?:invalid_(?:brief|ledger|fill|scoreboard)_rows|missing_open_candidate_choice_scores)$/,
  /^analysis\.funnel\.(?:consults|items|closed|open|asked|applied|executed|failed)$/,
  /^hud\.funnel\.(?:items_to_open_pct|open_to_asked_pct|asked_to_applied_pct|applied_to_executed_pct|closed_by_code_count|skipped_by_jev_count|blocked_by_code_count|not_executed_count)$/,
  /^analysis\.asks\.count$/,
  /^analysis\.asks\.rank_\d{2}\.(?:timestamp_ms|p_buy_score|order_applied)$/,
  /^analysis\.hist\.(?:all|fresh)\.bin_\d{2}$/,
  /^analysis\.timeline\.count$/,
  /^analysis\.timeline\.rank_\d{2}\.(?:timestamp_ms|open_candidates|asked_candidates|applied_candidates)$/,
  /^analysis\.trips\.(?:count|gross_in|gross_out|gross_delta|gross_in_usdc|gross_out_usdc|gross_delta_usdc|gross_return_pct_mean|negative_count)$/,
  /^analysis\.trips\.display\.rank_\d{2}\.(?:gross_entry_usdc|gross_exit_usdc|gross_return_pct|buy_at_ms|sell_at_ms|duration_min)$/,
  /^analysis\.trips\.cumulative\.rank_\d{5,}\.(?:sale_timestamp_ms|gross_delta_usdc|cumulative_gross_cash_delta_usdc)$/,
  /^hud\.results\.cumulative_trip_cash\.(?:points_count|few_trips_warning)$/,
  /^analysis\.fees\.(?:lamports|fills|unmatched_sells|native_sol|usd_fx)$/,
  /^analysis\.placar\.(?:skipped|closed|gated)\.(?:15m|1h)\.(?:n|up|mean_pct|up_pct|hist\.bin_\d{2}|rank_\d{5,}\.markout_pct)$/,
  /^hud\.command\.markout\.(?:skipped|closed|gated)\.(?:15m|1h)\.(?:n|up|mean_pct|up_pct)$/,
  /^analysis\.recent\.count$/,
  /^analysis\.recent\.rank_\d{2}\.(?:timestamp_ms|markout_15m_pct|markout_1h_pct)$/,
  /^analysis\.orders\.outcomes\.(?:executed|failed|uncertain)$/,
  /^analysis\.orders\.reasons\.(?:by_code\.count|rank_\d{2}\.count)$/,
  /^analysis\.orders\.spent_today\.(?:buy_usd|sell_usd)$/,
  /^analysis\.runtime\.(?:tokens_today|risk_pct)$/,
  /^audit\.execution\.(?:observed_at_ms|orders_total|fills_exact|round_trips|complete_ledger|invalid_order_rows|fee_known_orders|net_usd_known_orders|round_trips_net_usd_known|fee_cost_usd_known_orders)$/,
  /^audit\.review\.(?:observed_at_ms|review_count|invalid_lines|source_gap|source_incomplete_final_line|source_window_truncated)$/,
  /^audit\.portfolio\.external_flows_reconciled$/,
  /^evolution\.(?:recorded_at_ms|references_valid|valid_reference_lines|references_bound|references_awaiting_source|experiments_pending|outcomes_mature|envelopes_unique|valid_envelope_lines)$/,
  /^usage\.(?:today|month)\.(?:calls|usd|tokens|onchainos_calls|avg_latency_ms)$/,
  /^provider\.onchain\.(?:month|restarted_from_corrupt_file|tiers\.(?:free|basic|premium)\.(?:used|today|projection|cap))$/,
  /^wallet\.equity\.(?:latest_usd|latest_holdings_count|latest_zero_price_marks|latest_null_price_marks|unpriced_holdings_count|history\.(?:snapshot_count|first_at_ms|last_at_ms|first_usd|last_usd|change_usd|change_pct))$/,
  /^status\.scoreboard\.(?:15m|1h|4h|24h)\.(?:all|inaction|by_mode\.(?:desligado|sombra|limitado))\.(?:n|notional_usd|overlapping|settled|pending|unknown_price|gross_usd|net_usd|hit_rate_ratio)$/,
  /^status\.scoreboard\.(?:decisions|protective|no_entry_price|inaction_decisions)$/,
  /^status\.performance\.series\.(?:count|rank_\d{5,}\.(?:timestamp_ms|value_usd))$/,
  /^status\.performance\.record\.14d_window_1h\.groups\.(?:count|rank_\d{5,}\.(?:n|acerto|medio|melhor|pior))$/,
  /^runtime\.agent_budget\.(?:day|consults|committed_tokens|measured_tokens|unmeasured_calls)$/,
] as const;

function isSafeAggregateMeasurementId(id: string): boolean {
  return safeAggregateMeasurementPatterns.some((pattern) => pattern.test(id));
}

function safeMeasurementLabels(snapshot: EvidenceSnapshot): Map<string, string> {
  const datasets = marketDatasetLabels(snapshot);
  const ids = [...new Set(snapshot.measurements.map((measurement) => measurement.id))].sort(compareText);
  const labels = new Map<string, string>();
  let anonymous = 1;
  for (const id of ids) {
    const match = marketPattern.exec(id);
    if (match !== null) {
      const dataset = datasets.get(`${match[1]}.${match[2]}`)!;
      labels.set(id, `market.${match[1]}.${dataset}.${match[3]}`);
    } else if (isSafeAggregateMeasurementId(id)) {
      labels.set(id, id);
    } else {
      labels.set(id, `unmapped_measurement_${String(anonymous++).padStart(3, "0")}`);
    }
  }
  return labels;
}
function safeEvidenceSource(source: EvidenceSource | undefined, labels: ReadonlyMap<string, string>): PanelEvidenceSource | null {
  if (source === undefined) return null;
  return {
    id: labels.get(source.id) ?? "source_unknown",
    sha256: safeDigest(source.sha256),
    asOfMs: source.asOfMs !== null && Number.isFinite(source.asOfMs) ? source.asOfMs : null,
    classification: source.classification,
  };
}
function safeMeasurementValue(id: string, value: EvidenceMeasurement["value"]): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  if (id === "provider.onchain.month") return /^\d{4}-\d{2}$/.test(value);
  if (id === "runtime.agent_budget.day") return /^\d{4}-\d{2}-\d{2}$/.test(value);
  return /(?:^|\.)(?:sha256|digest|canonical_digest|canonical_sha256|file_sha256)$/.test(id) && /^[a-f0-9]{64}$/i.test(value);
}
const safeSupplementalUnits = new Set([
  "count", "boolean", "USD", "USDC", "SOL", "lamports", "tokens", "calls", "milliseconds", "Unix milliseconds", "SHA-256", "text", "%", "bps",
  "ms", "lines", "records", "candles", "gaps", "consults", "items", "orders", "fills", "trips", "asks", "observations", "preference_count", "events", "sells", "round trips", "reviews",
  "recorded zero-price marks", "recorded holdings with null price",
  "invalid rows", "open buy candidates without a raw Choice score", "CEX proxy markout observations",
  "count of calls this month", "count of calls today", "projected count for month", "count of calls/month",
]);
function safeUnit(unit: string): string {
  return safeSupplementalUnits.has(unit) ? unit : "unit suppressed";
}
function renderEntry(
  definition: PanelMetricDefinition,
  measurements: ReadonlyMap<string, readonly EvidenceMeasurement[]>,
  sources: ReadonlyMap<string, readonly EvidenceSource[]>,
  sourceLabels: ReadonlyMap<string, string>,
): PanelMetricEntry {
  const lookupId = definition.measurementId;
  const found = lookupId === null ? [] : measurements.get(lookupId) ?? [];
  const measurement = found.length === 1 ? found[0]! : undefined;
  const sourceMatches = measurement === undefined ? [] : sources.get(measurement.sourceId) ?? [];
  const source = sourceMatches.length === 1 ? sourceMatches[0]! : undefined;
  let reason: string | null = null;
  if (lookupId === null) reason = definition.unknownReason ?? "No sanitized scalar measurement is defined for this field.";
  else if (found.length === 0) reason = definition.unknownReason ?? "Snapshot did not supply this measurement.";
  else if (found.length > 1) reason = "Snapshot contains duplicate measurements for this field; ambiguous provenance is treated as unknown.";
  else if (measurement === undefined) reason = "Snapshot measurement could not be resolved.";
  else if (measurement.status === "unknown" || measurement.value === null) reason = lookupId?.startsWith("status.scoreboard.") || lookupId?.startsWith("status.performance.record.")
    ? measurement.reason === "agent_scoreboard_schema_invalid"
      ? STATUS_SCOREBOARD_SCHEMA_INVALID_REASON
      : definition.unknownReason ?? "Snapshot marks this measurement unknown; no value is substituted."
    : definition.unknownReason ?? "Snapshot marks this measurement unknown; no value is substituted.";
  else if (!safeMeasurementValue(lookupId, measurement.value)) reason = "Snapshot value is non-finite or unsafe text; it is treated as unknown.";
  else if (sourceMatches.length === 0) reason = "Measurement source is missing from the snapshot source catalog.";
  else if (sourceMatches.length > 1) reason = "Snapshot contains duplicate source identifiers; provenance is ambiguous.";
  const available = reason === null && measurement !== undefined && source !== undefined;
  return {
    ...definition,
    availability: available ? "available" : "unknown",
    status: available ? measurement!.status : "unknown",
    value: available ? measurement!.value : null,
    reason: available ? null : reason,
    source: {
      measurementId: definition.measurementId,
      sourceId: source === undefined ? null : sourceLabels.get(source.id) ?? "source_unknown",
      evidence: safeEvidenceSource(source, sourceLabels),
    },
  };
}

function weakness(
  id: string,
  status: PanelWeakness["status"],
  reason: string,
  entries: readonly PanelMetricEntry[],
): PanelWeakness {
  return {
    id,
    status,
    reason,
    metricIds: entries.map((entry) => entry.id),
    sourceIds: [...new Set(entries.map((entry) => entry.source.sourceId).filter((value): value is string => value !== null))].sort(compareText),
  };
}
function numeric(entry: PanelMetricEntry | undefined): number | null {
  return entry?.availability === "available" && typeof entry.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
}
function snapshotCount(snapshot: EvidenceSnapshot, id: string): number | null {
  const matches = snapshot.measurements.filter((measurement) => measurement.id === id);
  if (matches.length !== 1) return null;
  const measurement = matches[0]!;
  return measurement.status !== "unknown" && Number.isSafeInteger(measurement.value) && typeof measurement.value === "number" && measurement.value >= 0
    ? measurement.value
    : null;
}

function rankedValues(snapshot: EvidenceSnapshot, pattern: RegExp, countId: string): string[] {
  const ranks = new Set<string>();
  for (const measurement of snapshot.measurements) {
    const match = pattern.exec(measurement.id);
    if (match !== null && Number.isSafeInteger(Number(match[1]))) ranks.add(String(Number(match[1])).padStart(5, "0"));
  }
  const count = snapshotCount(snapshot, countId);
  if (count !== null) {
    for (let rank = 0; rank < count; rank++) ranks.add(String(rank).padStart(5, "0"));
  }
  return [...ranks].sort(compareText);
}

function rankedValuesOneBased(snapshot: EvidenceSnapshot, pattern: RegExp, countId: string): string[] {
  const ranks = new Set<string>();
  for (const measurement of snapshot.measurements) {
    const match = pattern.exec(measurement.id);
    if (match !== null && Number.isSafeInteger(Number(match[1]))) ranks.add(String(Number(match[1])).padStart(5, "0"));
  }
  const count = snapshotCount(snapshot, countId);
  if (count !== null) {
    for (let rank = 1; rank <= count; rank++) ranks.add(String(rank).padStart(5, "0"));
  }
  return [...ranks].sort(compareText);
}

function dynamicMetric(
  path: string,
  unit: string,
  sourceCode: string,
  surface: readonly string[],
  horizon: string,
  semantic: PanelSemantic,
  measurementId: string,
  arrayPath: string,
  fieldPath: string,
  unknownReason: string,
): PanelMetricDefinition {
  return {
    id: metricId(path),
    measurementId,
    unit,
    sourceCode,
    surface,
    horizon,
    semantic,
    schemaPath: path,
    arrayPath,
    fieldPath,
    unknownReason,
  };
}

function dynamicDefinitions(snapshot: EvidenceSnapshot): PanelMetricDefinition[] {
  const result: PanelMetricDefinition[] = [];
  for (const group of ["skipped", "closed", "gated"] as const) {
    for (const window of ["15m", "1h"] as const) {
      const rows = rankedValues(snapshot, new RegExp("^analysis\\.placar\\." + group + "\\." + window + "\\.rank_(\\d{5,})\\.markout_pct$"), `analysis.placar.${group}.${window}.n`);
      for (const rank of rows) {
        const path = `analysis.placar.${group}.${window}.rank_${rank}.markout_pct`;
        result.push(dynamicMetric(path, "% price markout", `src/agent/analysis.ts#AnalysisView.placar.${group}.${window}.vals[]`, surfaces.skipped, "all raw WindowStats.vals markout observations in source array order", "counterfactual", path, "WindowStats.vals[]", `rank_${rank}.markout_pct`, "This counterfactual markout row is unknown unless the validated source contains its numeric value."));
      }
    }
  }
  const tripRanks = rankedValues(snapshot, /^analysis\.trips\.cumulative\.rank_(\d{5,})\.(?:sale_timestamp_ms|gross_delta_usdc|cumulative_gross_cash_delta_usdc)$/, "analysis.trips.count");
  for (const rank of tripRanks) {
    for (const [field, unit] of [
      ["sale_timestamp_ms", "Unix milliseconds"],
      ["gross_delta_usdc", "USDC before network fee (verified cash mint required)"],
      ["cumulative_gross_cash_delta_usdc", "USDC before network fee (verified cash mint required)"],
    ] as const) {
      const path = `analysis.trips.cumulative.rank_${rank}.${field}`;
      result.push(dynamicMetric(path, unit, "src/agent/analysis.ts#AnalysisView.trips[] -> web/src/lib/hud/draw/analysis.ts#createAnalysis.cumulative", surfaces.results, "all trips in chronological order; rank_00000 oldest; HUD chart also includes a synthetic origin", field === "sale_timestamp_ms" ? "operational" : "gross", path, "AnalysisView.trips[]", `rank_${rank}.${field}`, field === "sale_timestamp_ms" ? "Trip sale timestamp is unknown unless the validated source provides it." : "Trip cash and cumulative values are unknown unless all included fills are valid and the cash mint is verified as USDC."));
    }
  }
  const seriesRanks = rankedValuesOneBased(snapshot, /^status\.performance\.series\.rank_(\d{5,})\.(?:timestamp_ms|value_usd)$/, "status.performance.series.count");
  for (const rank of seriesRanks) {
    for (const [field, unit] of [["timestamp_ms", "Unix milliseconds"], ["value_usd", "USD marked gross wallet value including flows"]] as const) {
      const path = `status.performance.series.rank_${rank}.${field}`;
      result.push(dynamicMetric(path, unit, "src/agent/equity-log.ts#EquityPoint", surfaces.status, "latest status equity series; raw marked gross wallet value including flows, not return", "gross", path, "AgentStatus.performance.series[]", `rank_${rank}.${field}`, "Validated captured equity input is unavailable for this status series point."));
    }
  }
  const recordRanks = rankedValuesOneBased(snapshot, /^status\.performance\.record\.14d_window_1h\.groups\.rank_(\d{5,})\.(?:n|acerto|medio|melhor|pior)$/, "status.performance.record.14d_window_1h.groups.count");
  for (const rank of recordRanks) {
    for (const [field, unit] of [
      ["n", "count"], ["acerto", "% hit rate [0,100]"], ["medio", "% mean underlying price move"],
      ["melhor", "% best underlying price move"], ["pior", "% worst underlying price move"],
    ] as const) {
      const path = `status.performance.record.14d_window_1h.groups.rank_${rank}.${field}`;
      result.push(dynamicMetric(path, unit, "src/agent/scoreboard.ts#Scoreboard.record[]", surfaces.status, "records from last 14 days measured at the 1h horizon; group names suppressed", field === "n" ? "operational" : "counterfactual", path, "AgentStatus.performance.record[group]", `rank_${rank}.${field}`, "Scoreboard/performance status was not captured or failed schema validation; no status route is queried."));
    }
  }
  return result;
}

function buildSupplementalEvidence(
  snapshot: EvidenceSnapshot,
  catalog: readonly PanelMetricDefinition[],
  measurements: ReadonlyMap<string, readonly EvidenceMeasurement[]>,
  sources: ReadonlyMap<string, readonly EvidenceSource[]>,
  sourceLabels: ReadonlyMap<string, string>,
  measurementLabels: ReadonlyMap<string, string>,
): PanelSupplementalEvidence[] {
  const mappedIds = new Set(catalog.flatMap((definition) => {
    const id = definition.measurementId;
    return id === null ? [] : [id];
  }));
  const ordered = [...snapshot.measurements].sort((a, b) => compareText(a.id, b.id) || compareText(a.sourceId, b.sourceId) || compareText(a.unit, b.unit) || compareText(a.status, b.status));
  const result: PanelSupplementalEvidence[] = [];
  for (const measurement of ordered) {
    if (mappedIds.has(measurement.id)) continue;
    const found = measurements.get(measurement.id) ?? [];
    const sourceMatches = sources.get(measurement.sourceId) ?? [];
    const source = sourceMatches.length === 1 ? sourceMatches[0] : undefined;
    let reason: string | null = null;
    if (found.length > 1) reason = "Snapshot contains duplicate measurements for this field; ambiguous provenance is treated as unknown.";
    else if (!isSafeAggregateMeasurementId(measurement.id) && marketPattern.exec(measurement.id) === null) reason = "Measurement ID is outside the approved safe aggregate allowlist; its value is suppressed.";
    else if (measurement.status === "unknown" || measurement.value === null) reason = "Snapshot marks this measurement unknown; its reason text is suppressed.";
    else if (!safeMeasurementValue(measurement.id, measurement.value)) reason = "Snapshot value is non-finite or unsafe text; it is treated as unknown.";
    else if (sourceMatches.length === 0) reason = "Measurement source is missing from the snapshot source catalog.";
    else if (sourceMatches.length > 1) reason = "Snapshot contains duplicate source identifiers; provenance is ambiguous.";
    const available = reason === null && source !== undefined;
    result.push({
      id: measurementLabels.get(measurement.id) ?? "unmapped_measurement",
      unit: safeUnit(measurement.unit),
      availability: available ? "available" : "unknown",
      status: available ? measurement.status : "unknown",
      value: available ? measurement.value : null,
      reason,
      source: {
        measurementId: measurementLabels.get(measurement.id) ?? "unmapped_measurement",
        sourceId: source === undefined ? null : sourceLabels.get(source.id) ?? "source_unknown",
        evidence: safeEvidenceSource(source, sourceLabels),
      },
    });
  }
  return result.sort((a, b) => compareText(a.id, b.id) || compareText(a.source.sourceId ?? "", b.source.sourceId ?? ""));
}

export function buildPanelReport(snapshot: EvidenceSnapshot): WorkloadResult {
  const currentDefinitions = [...definitions, ...dynamicDefinitions(snapshot)];
  const sourceMap = sourceIndex(snapshot);
  const measurementMap = measurementIndex(snapshot);
  const sourceLabels = safeSourceLabels(snapshot);
  const measurementLabels = safeMeasurementLabels(snapshot);
  const metrics = currentDefinitions.map((definition) => renderEntry(definition, measurementMap, sourceMap, sourceLabels));
  const supplemental = buildSupplementalEvidence(snapshot, currentDefinitions, measurementMap, sourceMap, sourceLabels, measurementLabels);
  const byId = new Map(metrics.map((entry) => [entry.id, entry] as const));
  const byMeasurement = new Map(metrics.flatMap((entry) => entry.measurementId === null ? [] : [[entry.measurementId, entry] as const]));
  const findMetric = (id: string): PanelMetricEntry | undefined => byId.get(id) ?? byMeasurement.get(id);
  const auditOrders = findMetric("audit.execution.orders_total");
  const knownNetOrders = findMetric("audit.execution.net_usd_known_orders");
  const roundTrips = findMetric("audit.execution.round_trips");
  const knownNetTrips = findMetric("audit.execution.round_trips_net_usd_known");
  const knownFeeUsd = findMetric("audit.execution.fee_cost_usd_known_orders");
  const feeKnownOrders = findMetric("audit.execution.fee_known_orders");
  const evolutionMature = findMetric("evolution.outcomes_mature");
  const externalFlows = findMetric("audit.portfolio.external_flows_reconciled");
  const weaknesses: PanelWeakness[] = [];

  const ordersTotal = numeric(auditOrders), netOrders = numeric(knownNetOrders);
  const tripsTotal = numeric(roundTrips), netTrips = numeric(knownNetTrips);
  const completeLedger = findMetric("audit.execution.complete_ledger");
  const ledgerIsComplete = completeLedger?.availability === "available" && completeLedger.value === true;
  const ledgerIsKnownIncomplete = completeLedger?.availability === "available" && completeLedger.value === false;
  if (!ledgerIsComplete || ordersTotal === null || netOrders === null || netOrders !== ordersTotal) {
    const countMismatch = ordersTotal !== null && netOrders !== null && netOrders !== ordersTotal;
    const actual = ledgerIsKnownIncomplete || countMismatch;
    const reason = ledgerIsKnownIncomplete
      ? "The collected evidence marks the execution ledger incomplete; known net USD counts cannot establish whole-ledger coverage."
      : countMismatch
        ? "The collected evidence reports a mismatch between total orders and orders with known net USD; unknown costs/results are not zero."
        : "A complete execution ledger or complete order-level net-USD coverage is not available in collected evidence.";
    weaknesses.push(weakness("net_usd_incomplete", actual ? "observed" : "structural", reason,
      [auditOrders, knownNetOrders, completeLedger].filter((entry): entry is PanelMetricEntry => entry !== undefined)));
  }
  if (!ledgerIsComplete || tripsTotal === null || netTrips === null || netTrips !== tripsTotal) {
    const countMismatch = tripsTotal !== null && netTrips !== null && netTrips !== tripsTotal;
    const actual = ledgerIsKnownIncomplete || countMismatch;
    const reason = ledgerIsKnownIncomplete
      ? "The collected evidence marks the execution ledger incomplete; known round-trip net USD counts cannot establish whole-ledger coverage."
      : countMismatch
        ? "The collected evidence reports a mismatch between closed round trips and trips with known net USD."
        : "A complete execution ledger or complete round-trip net-USD coverage is not available in collected evidence.";
    weaknesses.push(weakness("round_trip_net_usd_incomplete", actual ? "observed" : "structural", reason,
      [roundTrips, knownNetTrips, completeLedger].filter((entry): entry is PanelMetricEntry => entry !== undefined)));
  }
  const totalFeeOrders = numeric(feeKnownOrders);
  const usdFeeOrders = numeric(knownFeeUsd);
  if (usdFeeOrders === null || totalFeeOrders === null || usdFeeOrders < totalFeeOrders) {
    const actual = usdFeeOrders !== null && totalFeeOrders !== null;
    weaknesses.push(weakness("native_fee_cost_fx_missing", actual ? "observed" : "structural", actual
      ? "Some native-fee observations lack contemporaneous USD cost conversion."
      : "Collected evidence has no complete contemporaneous native-fee/USD conversion coverage field; native fee units are not USD zero.", [knownFeeUsd, feeKnownOrders].filter((entry): entry is PanelMetricEntry => entry !== undefined)));
  }
  const matureCount = numeric(evolutionMature);
  const pendingExperiments = findMetric("evolution.experiments_pending");
  const pendingCount = numeric(pendingExperiments);
  if (matureCount === null || matureCount === 0 || (pendingCount !== null && pendingCount > 0)) {
    const observedMissingness = matureCount === 0 || (pendingCount !== null && pendingCount > 0);
    const reason = matureCount === 0
      ? "The collected prospective-evidence projection has no mature outcomes."
      : pendingCount !== null && pendingCount > 0
        ? "The collected prospective-evidence projection reports pending experiments whose outcomes are not mature."
        : "Mature outcome coverage is not available in collected evidence.";
    weaknesses.push(weakness("mature_outcomes_missing", observedMissingness ? "observed" : "structural", reason,
      [evolutionMature, pendingExperiments].filter((entry): entry is PanelMetricEntry => entry !== undefined)));
  }
  if (externalFlows?.availability !== "available" || externalFlows.value !== true) {
    weaknesses.push(weakness("portfolio_flows_unreconciled", externalFlows?.availability === "available" ? "observed" : "structural", externalFlows?.availability === "available"
      ? "The collected portfolio reconciliation explicitly reports external flows as unreconciled."
      : "The online observation is not a complete wallet-balance and external-flow reconciliation.", externalFlows === undefined ? [] : [externalFlows]));
  }
  const calibration = metrics.filter((entry) => entry.schemaPath === "analysis.calibration.brier_score" || entry.schemaPath === "analysis.calibration.logloss");
  weaknesses.push(weakness("choice_preferences_not_calibrated", "structural", "Choice pBuy and facets are preferences/judgments, not calibrated outcome probabilities; no Brier/logloss claim is valid without defined events and horizons.", calibration));
  const scoreboardMetrics = metrics.filter((entry) =>
    entry.measurementId !== null
    && (entry.measurementId.startsWith("status.scoreboard.") || entry.measurementId.startsWith("status.performance.record.")));
  const seriesCount = metrics.find((entry) => entry.measurementId === "status.performance.series.count");
  if (scoreboardMetrics.length > 0 && scoreboardMetrics.every((entry) => entry.availability === "unknown")) {
    const invalidScoreboard = scoreboardMetrics.some((entry) => entry.reason === STATUS_SCOREBOARD_SCHEMA_INVALID_REASON);
    const equitySeriesAvailable = seriesCount?.availability === "available";
    weaknesses.push(weakness(
      "status_scoreboard_not_captured",
      "structural",
      invalidScoreboard
        ? `Collected scoreboard rows failed safe-schema validation, so dependent scoreboard/evidence/record metrics remain unknown; the independently validated equity series is ${equitySeriesAvailable ? "available" : "also unavailable"}.`
        : `No scoreboard source measurements were collected, so scoreboard/evidence/record metrics remain unknown; the independently validated equity series is ${equitySeriesAvailable ? "available" : "also unavailable"}.`,
      scoreboardMetrics,
    ));
  }

  const known = metrics.reduce((count, entry) => count + Number(entry.availability === "available"), 0);
  const total = metrics.length;
  const report: PanelReport = {
    schemaVersion: 1,
    capturedAtMs: snapshot.capturedAtMs,
    coverage: { total, known, unknown: total - known, coveragePct: total === 0 ? 0 : Math.round((known / total) * 10_000) / 100 },
    metrics,
    weaknesses,
    supplementalEvidence: supplemental,
  };
  return {
    metrics: {
      panel_metrics_total: total,
      panel_metrics_known: known,
      panel_metrics_unknown: total - known,
      panel_metrics_coverage_pct: report.coverage.coveragePct,
    },
    report,
  };
}
