import type { AnalysisView } from "../../src/agent/analysis.ts";
import type { EvidenceMeasurement, EvidenceSnapshot, EvidenceSource, OnlineObservation, OnlineSource, WorkloadResult } from "./contracts.ts";
import { buildPanelReport, type PanelReport, type PanelWeakness } from "./panel-metrics.ts";

type UnknownRecord = Record<string, unknown>;
type SafeOnlineSourceId = "runtime_health" | "runtime_analysis" | "runtime_ledger" | "okx_time" | "okx_ticker";
type OnlinePriority = "blocking" | "high" | "medium";

interface OnlineWeakness extends PanelWeakness {
  readonly priority: OnlinePriority;
}

interface OnlineReport {
  readonly schemaVersion: 1;
  readonly runtimeIdentity: {
    readonly app: string | null;
    readonly version: string | null;
    readonly startedAtMs: number | null;
  };
  readonly observationWindow: {
    readonly startedAtMs: number | null;
    readonly completedAtMs: number | null;
    readonly durationMs: number | null;
  };
  readonly decisionObservation: {
    readonly analysisProjectionAtMs: number | null;
    readonly latestConsultAtMs: number | null;
    readonly latestConsultAgeMs: number | null;
    readonly timelineFactsAvailable: number | null;
    readonly latestConsultTimeBasis: "analysis.timeline[].t" | null;
    readonly projectionTimeIsDecisionTime: false;
    readonly actorAttribution: "runtime_registered_unverified" | "unknown";
  };
  readonly ledgerObservation: {
    readonly coverage: "bounded_tail_only" | "unknown";
    readonly tailRecords: number | null;
    readonly tailOrderRecords: number | null;
    readonly tailCycleRecords: number | null;
    readonly completeLedger: "unknown";
  };
  readonly market: {
    readonly instrument: "SOL-USDT";
    readonly availability: "available" | "unknown";
    readonly last: number | null;
    readonly bid: number | null;
    readonly ask: number | null;
    readonly spreadPct: number | null;
    readonly quoteAtMs: number | null;
    readonly serverAtMs: number | null;
    readonly quoteAgeMs: number | null;
    readonly interpretation: "public_cex_context_not_execution_price_or_wallet_mark";
  };
  readonly financialPrimary: {
    readonly status: "unknown";
    readonly unit: "USD";
    readonly value: null;
    readonly optimizationEligible: false;
    readonly reason: string;
  };
  readonly panel: PanelReport;
  readonly limitations: readonly string[];
  readonly prioritizedWeaknesses: readonly OnlineWeakness[];
}

interface NormalizedSources {
  readonly evidence: readonly EvidenceSource[];
  readonly onlineById: ReadonlyMap<SafeOnlineSourceId, OnlineSource>;
}

const SAFE_SOURCE_DEFINITIONS: Readonly<Record<SafeOnlineSourceId, {
  readonly classification: EvidenceSource["classification"];
  readonly transport: OnlineSource["transport"];
  readonly path: string;
  readonly limitations: readonly string[];
}>> = {
  runtime_health: {
    classification: "local_process",
    transport: "http_loopback",
    path: "/health",
    limitations: ["Process identity only; does not establish decision freshness or actor attribution."],
  },
  runtime_analysis: {
    classification: "local_process",
    transport: "http_loopback",
    path: "/agent/analysis",
    limitations: ["Analysis is a bounded projection; it is not a complete decision history or financial reconciliation."],
  },
  runtime_ledger: {
    classification: "local_process",
    transport: "http_loopback",
    path: "/agent/ledger?n=200",
    limitations: ["The endpoint returns a bounded tail, not proof of complete-ledger coverage."],
  },
  okx_time: {
    classification: "public_market",
    transport: "https_public",
    path: "/api/v5/public/time",
    limitations: ["Public exchange server time is not a wallet or execution record."],
  },
  okx_ticker: {
    classification: "public_market",
    transport: "https_public",
    path: "/api/v5/market/ticker?instId=SOL-USDT",
    limitations: ["Public CEX quote only; not a DEX execution price, wallet mark, or realized return."],
  },
};

const ANALYSIS_SOURCE: SafeOnlineSourceId = "runtime_analysis";
const LEDGER_SOURCE: SafeOnlineSourceId = "runtime_ledger";
const HEALTH_SOURCE: SafeOnlineSourceId = "runtime_health";
const MARKET_SOURCES: readonly SafeOnlineSourceId[] = ["okx_time", "okx_ticker"];

function object(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function list(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value as readonly unknown[] : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegative(value: unknown): number | null {
  const valueNumber = finite(value);
  return valueNumber !== null && valueNumber >= 0 ? valueNumber : null;
}

function count(value: unknown): number | null {
  const valueNumber = nonnegative(value);
  return valueNumber !== null && Number.isSafeInteger(valueNumber) ? valueNumber : null;
}

function timestamp(value: unknown): number | null {
  return count(value);
}

function safeToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/.test(value) ? value : null;
}

function sha256(value: unknown): string | null {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null;
}

function normalizeSources(rawSources: unknown): NormalizedSources {
  const sourceList = list(rawSources) ?? [];
  const idCounts = new Map<string, number>();
  for (const raw of sourceList) {
    const source = object(raw);
    if (typeof source?.id === "string") idCounts.set(source.id, (idCounts.get(source.id) ?? 0) + 1);
  }

  const onlineById = new Map<SafeOnlineSourceId, OnlineSource>();
  const evidence: EvidenceSource[] = [];
  for (const raw of sourceList) {
    const source = object(raw);
    if (source === null) continue;
    const id = source.id;
    if (typeof id !== "string" || !Object.hasOwn(SAFE_SOURCE_DEFINITIONS, id) || idCounts.get(id) !== 1) continue;
    const sourceId = id as SafeOnlineSourceId;
    const definition = SAFE_SOURCE_DEFINITIONS[sourceId];
    if (source.path !== definition.path || source.classification !== definition.classification || source.transport !== definition.transport) continue;
    const requestedAtMs = timestamp(source.requestedAtMs);
    const receivedAtMs = timestamp(source.receivedAtMs);
    const sourceHash = sha256(source.sha256);
    const asOfMs = source.asOfMs === null ? null : timestamp(source.asOfMs);
    if (requestedAtMs === null || receivedAtMs === null || receivedAtMs < requestedAtMs || sourceHash === null
      || (source.asOfMs !== null && asOfMs === null)) continue;
    const normalized: OnlineSource = {
      id: sourceId,
      path: definition.path,
      sha256: sourceHash,
      asOfMs,
      classification: definition.classification as OnlineSource["classification"],
      limitations: definition.limitations,
      requestedAtMs,
      receivedAtMs,
      transport: definition.transport,
    };
    onlineById.set(sourceId, normalized);
    evidence.push(normalized);
  }
  return { evidence, onlineById };
}

function readAnalysis(payload: unknown): Partial<AnalysisView> | null {
  const root = object(payload);
  if (root === null) return null;
  if (root.ok === false) return null;
  if (root.ok === true) {
    const wrapped = object(root.analysis);
    return wrapped === null ? null : wrapped as unknown as Partial<AnalysisView>;
  }
  return root as unknown as Partial<AnalysisView>;
}

function validLedgerRecord(raw: unknown): "cycle" | "order" | null {
  const record = object(raw);
  if (record === null || timestamp(record.atMs) === null || typeof record.cycleId !== "string" || record.cycleId.length === 0 || record.cycleId.length > 400) return null;
  if (record.kind === "cycle") {
    const validOutcome = record.outcome === "mantido" || record.outcome === "decidido" || record.outcome === "bloqueado" || record.outcome === "erro";
    return validOutcome && count(record.planned) !== null ? "cycle" : null;
  }
  if (record.kind === "order") {
    const validStage = record.stage === "preparada" || record.stage === "enviando" || record.stage === "executada" || record.stage === "falhou" || record.stage === "incerta";
    return validStage && (record.side === "buy" || record.side === "sell") && nonnegative(record.usd) !== null ? "order" : null;
  }
  return null;
}

function addMeasurement(
  measurements: EvidenceMeasurement[],
  sourceIds: ReadonlyMap<SafeOnlineSourceId, OnlineSource>,
  id: string,
  value: number | boolean | null,
  unit: string,
  sourceId: SafeOnlineSourceId = ANALYSIS_SOURCE,
  status: EvidenceMeasurement["status"] = "observed",
): void {
  if (!sourceIds.has(sourceId) || value === null) return;
  if (typeof value === "number" && !Number.isFinite(value)) return;
  measurements.push({ id, value, unit, status, reason: null, sourceId });
}

function addNumber(
  measurements: EvidenceMeasurement[], sourceIds: ReadonlyMap<SafeOnlineSourceId, OnlineSource>,
  id: string, value: unknown, unit: string, sourceId: SafeOnlineSourceId = ANALYSIS_SOURCE, status: EvidenceMeasurement["status"] = "observed",
): number | null {
  const valueNumber = finite(value);
  addMeasurement(measurements, sourceIds, id, valueNumber, unit, sourceId, status);
  return valueNumber;
}

function addCount(
  measurements: EvidenceMeasurement[], sourceIds: ReadonlyMap<SafeOnlineSourceId, OnlineSource>,
  id: string, value: unknown, sourceId: SafeOnlineSourceId = ANALYSIS_SOURCE,
): number | null {
  const valueCount = count(value);
  addMeasurement(measurements, sourceIds, id, valueCount, "count", sourceId);
  return valueCount;
}

function addTimestamp(
  measurements: EvidenceMeasurement[], sourceIds: ReadonlyMap<SafeOnlineSourceId, OnlineSource>,
  id: string, value: unknown, sourceId: SafeOnlineSourceId = ANALYSIS_SOURCE,
): number | null {
  const valueTimestamp = timestamp(value);
  addMeasurement(measurements, sourceIds, id, valueTimestamp, "Unix milliseconds", sourceId);
  return valueTimestamp;
}

function addBoolean(
  measurements: EvidenceMeasurement[], sourceIds: ReadonlyMap<SafeOnlineSourceId, OnlineSource>,
  id: string, value: unknown, sourceId: SafeOnlineSourceId = ANALYSIS_SOURCE,
): boolean | null {
  const valueBoolean = typeof value === "boolean" ? value : null;
  addMeasurement(measurements, sourceIds, id, valueBoolean, "boolean", sourceId, "derived");
  return valueBoolean;
}

function derivePercentage(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 && numerator >= 0 && numerator <= denominator
    ? Math.round((numerator / denominator) * 100)
    : null;
}

function mapFunnel(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const funnel = object(analysis.funnel);
  if (funnel === null) return;
  addCount(measurements, sources, "analysis.funnel.consults", funnel.consults);
  const items = addCount(measurements, sources, "analysis.funnel.items", funnel.items);
  addCount(measurements, sources, "analysis.funnel.closed", funnel.closed);
  const open = addCount(measurements, sources, "analysis.funnel.open", funnel.open);
  const asked = addCount(measurements, sources, "analysis.funnel.asked", funnel.asked);
  const applied = addCount(measurements, sources, "analysis.funnel.applied", funnel.applied);
  addCount(measurements, sources, "analysis.funnel.executed", funnel.executed);
  addCount(measurements, sources, "analysis.funnel.failed", funnel.failed);
  const ratios = [
    ["items_to_open_pct", open, items],
    ["open_to_asked_pct", asked, open],
    ["asked_to_applied_pct", applied, asked],
  ] as const;
  for (const [field, numerator, denominator] of ratios) {
    addMeasurement(measurements, sources, `hud.funnel.${field}`, derivePercentage(numerator, denominator), "% rounded to whole percent", ANALYSIS_SOURCE, "derived");
  }
  const funnelDifferences = [
    ["closed_by_code_count", items, open],
    ["skipped_by_jev_count", open, asked],
    ["blocked_by_code_count", asked, applied],
  ] as const;
  for (const [field, minuend, subtrahend] of funnelDifferences) {
    const difference = minuend !== null && subtrahend !== null && minuend >= subtrahend ? minuend - subtrahend : null;
    addMeasurement(measurements, sources, `hud.funnel.${field}`, difference, "count", ANALYSIS_SOURCE, "derived");
  }
}

function mapAsks(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const asks = list(analysis.asks);
  if (asks === null) return;
  for (const raw of asks) {
    const ask = object(raw);
    if (ask === null || timestamp(ask.t) === null || (ask.s !== null && typeof ask.s !== "string") || typeof ask.ok !== "boolean") return;
  }
  addCount(measurements, sources, "analysis.asks.count", asks.length);
  const displayCount = Math.min(10, asks.length);
  for (let index = 0; index < displayCount; index++) {
    const ask = object(asks[asks.length - index - 1])!;
    const rank = `rank_${String(index).padStart(2, "0")}`;
    addTimestamp(measurements, sources, `analysis.asks.${rank}.timestamp_ms`, ask.t);
    addBoolean(measurements, sources, `analysis.asks.${rank}.order_applied`, ask.ok);
    // AnalysisView.asks[].p defaults missing source pBuy to 0; the source value is ambiguous and is intentionally not projected.
  }
}

function mapHistogram(
  analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>,
): void {
  const histogram = object(analysis.hist);
  if (histogram === null) return;
  for (const cohort of ["all", "fresh"] as const) {
    const bins = list(histogram[cohort]);
    if (bins === null || bins.length !== 20) continue;
    let total = 0;
    let valid = true;
    for (let index = 0; index < bins.length; index++) {
      const value = count(bins[index]);
      if (value === null) { valid = false; break; }
      total += value;
      if (!Number.isSafeInteger(total)) { valid = false; break; }
    }
    if (!valid) continue;
    for (let index = 0; index < bins.length; index++) {
      addCount(measurements, sources, `analysis.hist.${cohort}.bin_${String(index).padStart(2, "0")}`, count(bins[index])!);
    }
    addCount(measurements, sources, `hud.preference_buy_histogram.${cohort === "all" ? "total" : "fresh"}`, total);
  }
}

function mapTimeline(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): { count: number | null; latestAtMs: number | null } {
  const rows = list(analysis.timeline);
  if (rows === null || rows.length > 30) return { count: null, latestAtMs: null };
  let latestAtMs: number | null = null;
  for (const raw of rows) {
    const row = object(raw);
    const t = timestamp(row?.t);
    const open = count(row?.open);
    const asked = count(row?.asked);
    const applied = count(row?.applied);
    if (t === null || open === null || asked === null || applied === null) return { count: null, latestAtMs: null };
    if (latestAtMs === null || t > latestAtMs) latestAtMs = t;
  }
  addCount(measurements, sources, "analysis.timeline.count", rows.length);
  for (let index = 0; index < rows.length; index++) {
    const row = object(rows[index])!;
    const rank = `rank_${String(index).padStart(2, "0")}`;
    addTimestamp(measurements, sources, `analysis.timeline.${rank}.timestamp_ms`, row.t);
    addCount(measurements, sources, `analysis.timeline.${rank}.open_candidates`, row.open);
    addCount(measurements, sources, `analysis.timeline.${rank}.asked_candidates`, row.asked);
    addCount(measurements, sources, `analysis.timeline.${rank}.applied_candidates`, row.applied);
  }
  if (latestAtMs !== null) addTimestamp(measurements, sources, "hud.last_consult.timestamp_ms", latestAtMs);
  return { count: rows.length, latestAtMs };
}

function mapTrips(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): number | null {
  const trips = list(analysis.trips);
  if (trips === null) return null;
  for (const raw of trips) {
    const trip = object(raw);
    const buyAt = timestamp(trip?.buyAt);
    const sellAt = timestamp(trip?.sellAt);
    if (trip === null || typeof trip.s !== "string" || finite(trip.in) === null || finite(trip.out) === null || finite(trip.pct) === null
      || buyAt === null || sellAt === null || sellAt < buyAt) return null;
  }
  addCount(measurements, sources, "analysis.trips.count", trips.length);
  addCount(measurements, sources, "hud.results.cumulative_trip_cash.points_count", trips.length + 1);
  addBoolean(measurements, sources, "hud.results.cumulative_trip_cash.few_trips_warning", trips.length < 5);

  const displayCount = Math.min(2, trips.length);
  const firstIndex = trips.length - displayCount;
  const firstRank = 2 - displayCount;
  for (let offset = 0; offset < displayCount; offset++) {
    const trip = object(trips[firstIndex + offset])!;
    const rank = `rank_${String(firstRank + offset).padStart(2, "0")}`;
    const buyAt = addTimestamp(measurements, sources, `analysis.trips.display.${rank}.buy_at_ms`, trip.buyAt);
    const sellAt = addTimestamp(measurements, sources, `analysis.trips.display.${rank}.sell_at_ms`, trip.sellAt);
    if (buyAt !== null && sellAt !== null) {
      addNumber(measurements, sources, `analysis.trips.display.${rank}.duration_min`, (sellAt - buyAt) / 60_000, "minutes", ANALYSIS_SOURCE, "derived");
    }
  }
  for (let index = 0; index < trips.length; index++) {
    const trip = object(trips[index])!;
    addTimestamp(measurements, sources, `analysis.trips.cumulative.rank_${String(index).padStart(5, "0")}.sale_timestamp_ms`, trip.sellAt);
  }
  return trips.length;
}

function mapFees(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const fees = object(analysis.fees);
  if (fees === null) return;
  addCount(measurements, sources, "analysis.fees.fills", fees.fills);
  addCount(measurements, sources, "analysis.fees.unmatched_sells", fees.unmatchedSells);
  // AnalysisView.fees.lamports treats an unavailable per-fill fee as zero, so it is not a trustworthy total.
}

function mapPlacar(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const placar = object(analysis.placar);
  if (placar === null) return;
  for (const groupName of ["skipped", "closed", "gated"] as const) {
    const group = object(placar[groupName]);
    if (group === null) continue;
    for (const windowName of ["15m", "1h"] as const) {
      const stats = object(group[windowName]);
      if (stats === null) continue;
      const n = addCount(measurements, sources, `analysis.placar.${groupName}.${windowName}.n`, stats.n);
      const up = addCount(measurements, sources, `analysis.placar.${groupName}.${windowName}.up`, stats.up);
      const mean = finite(stats.mean);
      if (mean !== null && n !== null && n > 0) {
        addNumber(measurements, sources, `analysis.placar.${groupName}.${windowName}.mean_pct`, mean, "% price move");
      }
      addMeasurement(measurements, sources, `analysis.placar.${groupName}.${windowName}.up_pct`, derivePercentage(up, n), "% of positive markouts", ANALYSIS_SOURCE, "derived");

      const values = list(stats.vals);
      if (n === null || values === null || values.length !== n || values.length === 0) continue;
      let allFinite = true;
      for (const rawValue of values) {
        if (finite(rawValue) === null) { allFinite = false; break; }
      }
      if (!allFinite) continue;
      for (let index = 0; index < values.length; index++) {
        const value = finite(values[index])!;
        addNumber(measurements, sources, `analysis.placar.${groupName}.${windowName}.rank_${String(index).padStart(5, "0")}.markout_pct`, value, "% price markout");
      }
      if (n < 5) continue;
      const bins = new Array<number>(10).fill(0);
      for (const rawValue of values) {
        const value = finite(rawValue)!;
        const bin = Math.max(0, Math.min(9, Math.floor((value + 20) / 4)));
        bins[bin]!++;
      }
      for (let index = 0; index < bins.length; index++) {
        addCount(measurements, sources, `analysis.placar.${groupName}.${windowName}.hist.bin_${String(index).padStart(2, "0")}`, bins[index]!);
      }
    }
  }
}

function mapRecent(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const rows = list(analysis.recent);
  if (rows === null || rows.length > 40) return;
  const safeRows: { readonly t: number; readonly m15: number | null; readonly m1h: number | null }[] = [];
  for (const raw of rows) {
    const row = object(raw);
    const t = timestamp(row?.t);
    if (row === null || t === null || (row.s !== null && typeof row.s !== "string") || typeof row.kind !== "string"
      || (row.m15 !== null && finite(row.m15) === null) || (row.m1h !== null && finite(row.m1h) === null)) return;
    safeRows.push({ t, m15: row.m15 === null ? null : finite(row.m15), m1h: row.m1h === null ? null : finite(row.m1h) });
  }
  addCount(measurements, sources, "analysis.recent.count", safeRows.length);
  safeRows.sort((left, right) => {
    const leftMeasured = left.m15 !== null || left.m1h !== null;
    const rightMeasured = right.m15 !== null || right.m1h !== null;
    return Number(rightMeasured) - Number(leftMeasured) || right.t - left.t;
  });
  for (let index = 0; index < Math.min(14, safeRows.length); index++) {
    const row = safeRows[index]!;
    const rank = `rank_${String(index).padStart(2, "0")}`;
    addTimestamp(measurements, sources, `analysis.recent.${rank}.timestamp_ms`, row.t);
    if (row.m15 !== null) addNumber(measurements, sources, `analysis.recent.${rank}.markout_15m_pct`, row.m15, "% price move");
    if (row.m1h !== null) addNumber(measurements, sources, `analysis.recent.${rank}.markout_1h_pct`, row.m1h, "% price move");
  }
}

function mapOrderAggregates(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const orders = object(analysis.orders);
  if (orders === null) return;
  const outcomes = object(orders.outcomes);
  if (outcomes !== null) {
    for (const [field, key] of [["executed", "executada"], ["failed", "falhou"], ["uncertain", "incerta"]] as const) {
      const rawValue = Object.hasOwn(outcomes, key) ? outcomes[key] : 0;
      addCount(measurements, sources, `analysis.orders.outcomes.${field}`, rawValue);
    }
  }
  const reasons = object(orders.reasons);
  if (reasons !== null) {
    const reasonCounts = Object.values(reasons).map((value) => count(value));
    if (reasonCounts.every((value): value is number => value !== null)) {
      addCount(measurements, sources, "analysis.orders.reasons.by_code.count", reasonCounts.length);
      reasonCounts.sort((left, right) => right - left);
      for (let index = 0; index < Math.min(6, reasonCounts.length); index++) {
        addCount(measurements, sources, `analysis.orders.reasons.rank_${String(index).padStart(2, "0")}.count`, reasonCounts[index]!);
      }
    }
  }
  const spentToday = object(orders.spentToday);
  if (spentToday !== null) {
    for (const side of ["buy", "sell"] as const) {
      const value = nonnegative(spentToday[side]);
      addMeasurement(measurements, sources, `analysis.orders.spent_today.${side}_usd`, value, "USD gross order amount", ANALYSIS_SOURCE, "observed");
    }
  }
}

function mapRuntimeAggregates(analysis: Partial<AnalysisView>, measurements: EvidenceMeasurement[], sources: ReadonlyMap<SafeOnlineSourceId, OnlineSource>): void {
  const runtime = object(analysis.runtime);
  if (runtime === null) return;
  const tokens = count(runtime.tokensToday);
  if (tokens !== null) addCount(measurements, sources, "analysis.runtime.tokens_today", tokens);
  const riskPct = nonnegative(runtime.riskPct);
  if (riskPct !== null) addNumber(measurements, sources, "analysis.runtime.risk_pct", riskPct, "%");
}

function safeLedgerTail(rawLedger: unknown): { readonly total: number; readonly orders: number; readonly cycles: number } | null {
  const rows = list(rawLedger);
  if (rows === null || rows.length > 200) return null;
  let orders = 0;
  let cycles = 0;
  for (const raw of rows) {
    const kind = validLedgerRecord(raw);
    if (kind === null) return null;
    if (kind === "order") orders++;
    else cycles++;
  }
  return { total: rows.length, orders, cycles };
}

function buildSnapshot(observation: OnlineObservation, sources: NormalizedSources): {
  readonly snapshot: EvidenceSnapshot;
  readonly timeline: { readonly count: number | null; readonly latestAtMs: number | null };
  readonly tail: { readonly total: number; readonly orders: number; readonly cycles: number } | null;
  readonly analysisProjectionAtMs: number | null;
  readonly market: OnlineReport["market"];
} {
  const measurements: EvidenceMeasurement[] = [];
  const analysis = sources.onlineById.has(ANALYSIS_SOURCE) ? readAnalysis(observation.analysis) : null;
  let timeline: { count: number | null; latestAtMs: number | null } = { count: null, latestAtMs: null };
  let analysisProjectionAtMs: number | null = null;
  if (analysis !== null) {
    analysisProjectionAtMs = addTimestamp(measurements, sources.onlineById, "analysis.at_ms", analysis.atMs);
    mapFunnel(analysis, measurements, sources.onlineById);
    mapAsks(analysis, measurements, sources.onlineById);
    mapHistogram(analysis, measurements, sources.onlineById);
    timeline = mapTimeline(analysis, measurements, sources.onlineById);
    mapTrips(analysis, measurements, sources.onlineById);
    mapFees(analysis, measurements, sources.onlineById);
    mapPlacar(analysis, measurements, sources.onlineById);
    mapRecent(analysis, measurements, sources.onlineById);
    mapOrderAggregates(analysis, measurements, sources.onlineById);
    mapRuntimeAggregates(analysis, measurements, sources.onlineById);
  }

  const tail = sources.onlineById.has(LEDGER_SOURCE) ? safeLedgerTail(observation.ledger) : null;
  if (tail !== null) {
    addCount(measurements, sources.onlineById, "online.ledger.tail_records", tail.total, LEDGER_SOURCE);
    addCount(measurements, sources.onlineById, "online.ledger.tail_order_records", tail.orders, LEDGER_SOURCE);
    addCount(measurements, sources.onlineById, "online.ledger.tail_cycle_records", tail.cycles, LEDGER_SOURCE);
  }

  const marketSourceAvailable = MARKET_SOURCES.every((id) => sources.onlineById.has(id));
  const rawMarket = object(observation.market);
  const instrumentValid = rawMarket?.instrument === "SOL-USDT";
  const last = nonnegative(rawMarket?.last);
  const bid = nonnegative(rawMarket?.bid);
  const ask = nonnegative(rawMarket?.ask);
  const quoteAtMs = timestamp(rawMarket?.quoteAtMs);
  const serverAtMs = timestamp(rawMarket?.serverAtMs);
  const spreadPct = bid !== null && bid > 0 && ask !== null ? ((ask / bid) - 1) * 100 : null;
  const quoteValid = marketSourceAvailable && instrumentValid && last !== null && last > 0 && bid !== null && bid > 0
    && ask !== null && ask >= bid && quoteAtMs !== null && serverAtMs !== null
    && spreadPct !== null && Number.isFinite(spreadPct);
  const quoteAgeMs = quoteValid && timestamp(observation.completedAtMs) !== null && observation.completedAtMs >= quoteAtMs
    ? observation.completedAtMs - quoteAtMs
    : null;
  const market: OnlineReport["market"] = {
    instrument: "SOL-USDT",
    availability: quoteValid ? "available" : "unknown",
    last: quoteValid ? last : null,
    bid: quoteValid ? bid : null,
    ask: quoteValid ? ask : null,
    spreadPct: quoteValid ? spreadPct : null,
    quoteAtMs: quoteValid ? quoteAtMs : null,
    serverAtMs: quoteValid ? serverAtMs : null,
    quoteAgeMs,
    interpretation: "public_cex_context_not_execution_price_or_wallet_mark",
  };
  if (quoteValid && last !== null && bid !== null && ask !== null) {
    addNumber(measurements, sources.onlineById, "market.sol_usdt.last", last, "USDT per SOL", "okx_ticker");
    addNumber(measurements, sources.onlineById, "market.sol_usdt.bid", bid, "USDT per SOL", "okx_ticker");
    addNumber(measurements, sources.onlineById, "market.sol_usdt.ask", ask, "USDT per SOL", "okx_ticker");
    addNumber(measurements, sources.onlineById, "market.sol_usdt.spread_pct", market.spreadPct, "%", "okx_ticker", "derived");
  }

  let sourceAsOfMs: number | null = null;
  for (const source of sources.evidence) {
    if (source.asOfMs !== null && (sourceAsOfMs === null || source.asOfMs > sourceAsOfMs)) sourceAsOfMs = source.asOfMs;
  }
  const fallbackCompletedAt = timestamp(observation.completedAtMs);
  const fallbackStartedAt = timestamp(observation.startedAtMs);
  const capturedAtMs = sourceAsOfMs ?? fallbackCompletedAt ?? fallbackStartedAt ?? 0;
  return {
    snapshot: { schemaVersion: 1, capturedAtMs, sources: sources.evidence, measurements },
    timeline,
    tail,
    analysisProjectionAtMs,
    market,
  };
}

function panelMetrics(panel: PanelReport, market: OnlineReport["market"]): Readonly<Record<string, number>> {
  const metrics: Record<string, number> = {};
  for (const metric of panel.metrics) {
    if (metric.semantic !== "operational" || typeof metric.value !== "number" || !Number.isFinite(metric.value)) continue;
    metrics[metric.id] = metric.value;
  }
  metrics.evidence_panel_coverage_pct = panel.coverage.coveragePct;
  if (market.availability === "available") {
    if (market.last !== null) metrics.market_sol_usdt_last = market.last;
    if (market.bid !== null) metrics.market_sol_usdt_bid = market.bid;
    if (market.ask !== null) metrics.market_sol_usdt_ask = market.ask;
    if (market.spreadPct !== null && Number.isFinite(market.spreadPct)) metrics.market_sol_usdt_spread_pct = market.spreadPct;
  }
  return Object.fromEntries(Object.entries(metrics).sort(([left], [right]) => left.localeCompare(right)));
}

function prioritizedWeaknesses(tail: ReturnType<typeof safeLedgerTail>, latestConsultAtMs: number | null): readonly OnlineWeakness[] {
  const weaknesses: OnlineWeakness[] = [
    {
      priority: "blocking",
      id: "financial_primary_unknown",
      status: "structural",
      reason: "No complete reconciled fills, USD-denominated costs, and external-flow reconciliation are evidenced; gross totals, order counts, counterfactual markouts, and a public quote do not establish net profit.",
      metricIds: ["panel_hud_wallet_net_return_usd"],
      sourceIds: [],
    },
    {
      priority: "high",
      id: "ledger_coverage_bounded",
      status: tail === null ? "structural" : "observed",
      reason: "The online ledger observation is limited to a bounded tail; it cannot establish whole-ledger completeness or complete fill/cost coverage.",
      metricIds: [],
      sourceIds: tail === null ? [] : [LEDGER_SOURCE],
    },
    {
      priority: "high",
      id: "decision_actor_unverified",
      status: latestConsultAtMs === null ? "structural" : "observed",
      reason: "A local timeline fact is not uniquely linked to a ledger cycle model; runtime identity and timestamps do not prove JEV authorship.",
      metricIds: latestConsultAtMs === null ? [] : ["panel_analysis_timeline_count"],
      sourceIds: latestConsultAtMs === null ? [] : [ANALYSIS_SOURCE],
    },
    {
      priority: "medium",
      id: "decision_history_windowed",
      status: "observed",
      reason: "Analysis retains only the latest 25 consultations in its funnel and latest 30 consultation facts in its timeline; these are not full-history counts or new decisions from polling.",
      metricIds: ["panel_analysis_funnel_consults", "panel_analysis_timeline_count"],
      sourceIds: [ANALYSIS_SOURCE],
    },
    {
      priority: "medium",
      id: "public_market_not_execution_mark",
      status: "observed",
      reason: "The SOL-USDT ticker is public CEX context only and is not a DEX execution price, wallet mark, or realized return.",
      metricIds: [],
      sourceIds: ["okx_ticker"],
    },
  ];
  return weaknesses;
}

export function buildOnlineReport(observation: OnlineObservation): WorkloadResult {
  const sources = normalizeSources(observation.sources);
  const built = buildSnapshot(observation, sources);
  const panel = buildPanelReport(built.snapshot).report as PanelReport;
  const startedAtMs = timestamp(observation.startedAtMs);
  const completedAtMs = timestamp(observation.completedAtMs);
  const durationMs = startedAtMs !== null && completedAtMs !== null && completedAtMs >= startedAtMs
    ? completedAtMs - startedAtMs
    : null;
  const health = object(observation.health);
  const healthAvailable = sources.onlineById.has(HEALTH_SOURCE) && health !== null;
  const identity = {
    app: healthAvailable ? safeToken(health.app) : null,
    version: healthAvailable ? safeToken(health.version) : null,
    startedAtMs: healthAvailable ? timestamp(health.startedAt) : null,
  };
  const latestConsultAgeMs = built.timeline.latestAtMs !== null && completedAtMs !== null && completedAtMs >= built.timeline.latestAtMs
    ? completedAtMs - built.timeline.latestAtMs
    : null;
  const decisionObservation: OnlineReport["decisionObservation"] = {
    analysisProjectionAtMs: built.analysisProjectionAtMs,
    latestConsultAtMs: built.timeline.latestAtMs,
    latestConsultAgeMs,
    timelineFactsAvailable: built.timeline.count,
    latestConsultTimeBasis: built.timeline.latestAtMs === null ? null : "analysis.timeline[].t",
    projectionTimeIsDecisionTime: false,
    actorAttribution: built.timeline.latestAtMs === null ? "unknown" : "runtime_registered_unverified",
  };
  const ledgerObservation: OnlineReport["ledgerObservation"] = {
    coverage: built.tail === null ? "unknown" : "bounded_tail_only",
    tailRecords: built.tail?.total ?? null,
    tailOrderRecords: built.tail?.orders ?? null,
    tailCycleRecords: built.tail?.cycles ?? null,
    completeLedger: "unknown",
  };
  const financialPrimary: OnlineReport["financialPrimary"] = {
    status: "unknown",
    unit: "USD",
    value: null,
    optimizationEligible: false,
    reason: "Complete reconciled fills, USD-denominated costs, and external-flow reconciliation are unavailable; operational aggregates and gross/counterfactual values do not prove net profit.",
  };
  const limitations = [
    "AnalysisView.atMs is the projection time; the latest retained timeline t is the latest available consult fact, not proof of a new decision.",
    "The funnel covers at most 25 consultations and the timeline at most 30 facts; polling counts are not new decisions and neither view is complete history.",
    "AnalysisView.hist.fresh labels criteria=rank-v1; it is not a recency measure.",
    "AnalysisView.asks[].p defaults a missing source pBuy to 0, so ask preference scores are omitted as ambiguous.",
    "The runtime ledger response is a bounded tail; record counts are not complete-ledger, unique-decision, or complete-fill counts.",
    "Timeline facts are runtime-registered observations; JEV attribution requires a unique linked CycleRecord.modelo and is not established here.",
    "Trip cash, scoreboard outcomes, order totals, native fees, and the public SOL-USDT quote do not establish reconciled net USD profit.",
    "The SOL-USDT market context is a public CEX quote, not a DEX execution price or wallet mark.",
    "Source SHA-256 values cover sanitized projections and metadata, not raw response bytes or source authenticity.",
    "Raw text, symbols, order/cycle identifiers, references, addresses, wallet data, reasons, and provider messages are excluded.",
  ] as const;
  const report: OnlineReport = {
    schemaVersion: 1,
    runtimeIdentity: identity,
    observationWindow: { startedAtMs, completedAtMs, durationMs },
    decisionObservation,
    ledgerObservation,
    market: built.market,
    financialPrimary,
    panel,
    limitations,
    prioritizedWeaknesses: prioritizedWeaknesses(built.tail, built.timeline.latestAtMs),
  };
  return { metrics: panelMetrics(panel, built.market), report };
}
