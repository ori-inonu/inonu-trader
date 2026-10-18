/** Descriptive capacity arithmetic only: no calls, admission, spending or trading
 * rules. Counters and account entitlements are caller-reported, not authenticated
 * here. Calendar calculations use the LOCAL meter's UTC month. A provider's day-1
 * renewal does not establish its timezone, so its reset timestamp stays unknown. */
export type ResourceTier = "free" | "basic" | "premium";
export interface UsageCounter { used: number | null; monthlyCap: number | null }
export interface ResourceMeter {
  month: string;
  observedAtMs: number;
  integrity: "valid" | "corrupt" | "unreadable";
  tiers: Partial<Record<ResourceTier, UsageCounter>>;
}
export interface AccountMeter extends ResourceMeter {
  rateLimits: { requestsPerSecond: number | null; tokensPerSecond: number | null };
}
export interface CollectionSchedule {
  id: string;
  tier: ResourceTier;
  /** Exact provider or adapter path. A batch-capable provider does not mean the
   * installed adapter supports batching. No token identities are needed here. */
  endpoint: string;
  firstRunAtMs: number;
  intervalMs: number;
  itemsPerRun: number;
  batchSize: number;
  adapterBatching: "enabled" | "not_enabled";
  /** Maximum EXTRA physical attempts per logical request, not a retry policy. */
  maxRetriesPerRequest: number;
}
export interface ResourceCapacityInput {
  asOfMs: number;
  local: ResourceMeter | null;
  account: AccountMeter | null;
  schedules: readonly CollectionSchedule[];
}
type MeterStatus = "valid" | "unreported" | "corrupt" | "unreadable" | "month_mismatch" | "invalid";
export interface MeterProjection {
  scope: "local_gateway" | "account_reported";
  status: MeterStatus;
  capEvidence: "local_configuration" | "provider_reported" | "unknown";
  observedAtMs: number | null;
  ageMs: number | null;
  used: number | null;
  monthlyCap: number | null;
  remainingAtObservation: number | null;
  overageAtObservation: number | null;
  usedPerElapsedDay: number | null;
  usedPerElapsedMinute: number | null;
  extrapolatedMonthUse: number | null;
  capPerCalendarDay: number | null;
  capPerCalendarMinute: number | null;
  remainingPerDayAtObservation: number | null;
  remainingPerMinuteAtObservation: number | null;
}
export interface ScheduleDemand {
  id: string;
  tier: ResourceTier;
  endpoint: string;
  integrationEvidence: "caller_reported";
  itemsPerRun: number;
  batchSize: number;
  requestsPerRun: number;
  attemptsPerRunUpperBound: number;
  monthRuns: number;
  remainingRuns: number;
  monthRequests: number;
  remainingRequests: number;
  monthAttemptsUpperBound: number;
  remainingAttemptsUpperBound: number;
}
type DemandTotals = Pick<ScheduleDemand, "monthRequests" | "remainingRequests" | "monthAttemptsUpperBound" | "remainingAttemptsUpperBound">;
export interface ResourceCapacity {
  asOfMs: number;
  evidence: "reported_counters_and_hypothetical_schedule";
  /** Cache hits, coalescing, pagination and event-triggered calls are not inferred.
   * Add every planned request stream explicitly; actual traffic is separate. */
  networkAssumption: "all_scheduled_requests_sent";
  admissionOrTradingPolicy: false;
  calendarBasis: "utc_local_meter";
  providerResetAtMs: null;
  month: { key: string; startAtMs: number; localNextMonthUtcMs: number; days: number; elapsedMs: number; remainingMs: number };
  accountRateLimits: { requestsPerSecond: number | null; tokensPerSecond: number | null };
  tiers: Record<ResourceTier, { local: MeterProjection; account: MeterProjection; planned: DemandTotals }>;
  schedules: readonly ScheduleDemand[];
}

const DAY = 86_400_000, MINUTE = 60_000;
const TIERS = ["free", "basic", "premium"] as const;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const clock = (v: unknown): v is number => count(v) && v <= 8_640_000_000_000_000;
const rate = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const emptyDemand = (): DemandTotals => ({ monthRequests: 0, remainingRequests: 0, monthAttemptsUpperBound: 0, remainingAttemptsUpperBound: 0 });
// Documentation: market-index-price and market-token-price-info. These are
// capacities for explicitly enabled adapter SCENARIOS, not proof of integration.
const BATCH_ENDPOINTS: Readonly<Record<string, { tier: ResourceTier; max: number }>> = {
  "/api/v6/dex/index/current-price": { tier: "free", max: 100 },
  "/api/v6/dex/market/price-info": { tier: "premium", max: 100 },
};

function meterStatus(m: ResourceMeter | null, month: ResourceCapacity["month"], asOfMs: number): MeterStatus {
  if (m === null) return "unreported";
  if (!object(m)) return "invalid";
  if (m.integrity === "corrupt" || m.integrity === "unreadable") return m.integrity;
  if (m.integrity !== "valid" || !clock(m.observedAtMs) || m.observedAtMs > asOfMs || !object(m.tiers)) return "invalid";
  if (m.month !== month.key) return "month_mismatch";
  if (m.observedAtMs < month.startAtMs || m.observedAtMs >= month.localNextMonthUtcMs) return "invalid";
  return "valid";
}

function projectMeter(m: ResourceMeter | null, tier: ResourceTier, scope: MeterProjection["scope"], month: ResourceCapacity["month"], asOfMs: number): MeterProjection {
  let status = meterStatus(m, month, asOfMs);
  const row = status === "valid" ? m!.tiers[tier] : undefined;
  if (status === "valid") {
    if (row === undefined || row?.used === null) status = "unreported";
    else if (!object(row) || !count(row.used) || row.monthlyCap !== null && !count(row.monthlyCap)) status = "invalid";
  }
  const valid = status === "valid", used = valid ? row!.used! : null, cap = valid ? row!.monthlyCap : null;
  const at = valid ? m!.observedAtMs : null, elapsed = at === null ? 0 : at - month.startAtMs;
  const remaining = used === null || cap === null ? null : Math.max(0, cap - used);
  const observationRemaining = at === null ? 0 : month.localNextMonthUtcMs - at;
  return { scope, status, capEvidence: cap === null ? "unknown" : scope === "local_gateway" ? "local_configuration" : "provider_reported",
    observedAtMs: at, ageMs: at === null ? null : asOfMs - at, used, monthlyCap: cap,
    remainingAtObservation: remaining, overageAtObservation: used === null || cap === null ? null : Math.max(0, used - cap),
    usedPerElapsedDay: used === null || elapsed === 0 ? null : used / (elapsed / DAY),
    usedPerElapsedMinute: used === null || elapsed === 0 ? null : used / (elapsed / MINUTE),
    extrapolatedMonthUse: used === null || elapsed === 0 ? null : used / (elapsed / (month.days * DAY)),
    capPerCalendarDay: cap === null ? null : cap / month.days,
    capPerCalendarMinute: cap === null ? null : cap / (month.days * 1440),
    remainingPerDayAtObservation: remaining === null ? null : remaining / (observationRemaining / DAY),
    remainingPerMinuteAtObservation: remaining === null ? null : remaining / (observationRemaining / MINUTE) };
}

/** Number of runs in [start, end), never before firstRunAtMs. */
function runs(s: CollectionSchedule, start: number, end: number): number {
  const index = Math.max(0, Math.ceil((start - s.firstRunAtMs) / s.intervalMs));
  const next = s.firstRunAtMs + index * s.intervalMs;
  if (!count(next)) return NaN;
  return next >= end ? 0 : Math.ceil((end - next) / s.intervalMs);
}

function demand(s: CollectionSchedule, month: ResourceCapacity["month"], asOfMs: number): ScheduleDemand | null {
  if (!object(s) || typeof s.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(s.id) || !TIERS.includes(s.tier) || typeof s.endpoint !== "string" || !/^\/[A-Za-z0-9/_-]{1,255}$/.test(s.endpoint) || !clock(s.firstRunAtMs) || !count(s.intervalMs) || s.intervalMs === 0 || !count(s.itemsPerRun) || !count(s.batchSize) || s.batchSize === 0 || !count(s.maxRetriesPerRequest) || s.adapterBatching !== "enabled" && s.adapterBatching !== "not_enabled") return null;
  const support = BATCH_ENDPOINTS[s.endpoint];
  if (support !== undefined && support.tier !== s.tier) return null;
  if (s.batchSize > 1 && (support === undefined || s.batchSize > support.max || s.adapterBatching !== "enabled")) return null;
  const requestsPerRun = Math.ceil(s.itemsPerRun / s.batchSize);
  const attemptsPerRunUpperBound = requestsPerRun * (1 + s.maxRetriesPerRequest);
  const monthRuns = runs(s, month.startAtMs, month.localNextMonthUtcMs), remainingRuns = runs(s, asOfMs, month.localNextMonthUtcMs);
  const counts = { requestsPerRun, attemptsPerRunUpperBound, monthRuns, remainingRuns,
    monthRequests: monthRuns * requestsPerRun, remainingRequests: remainingRuns * requestsPerRun,
    monthAttemptsUpperBound: monthRuns * attemptsPerRunUpperBound, remainingAttemptsUpperBound: remainingRuns * attemptsPerRunUpperBound };
  if (!Object.values(counts).every(count) || !count(1 + s.maxRetriesPerRequest)) return null;
  return { id: s.id, tier: s.tier, endpoint: s.endpoint, integrationEvidence: "caller_reported", itemsPerRun: s.itemsPerRun, batchSize: s.batchSize, ...counts };
}

export function projectResourceCapacity(input: ResourceCapacityInput): { ok: true; value: ResourceCapacity } | { ok: false; reason: "clock_invalid" | "input_invalid" | "schedule_invalid" } {
  if (!object(input) || !clock(input.asOfMs)) return { ok: false, reason: "clock_invalid" };
  if (!Array.isArray(input.schedules)) return { ok: false, reason: "input_invalid" };
  const date = new Date(input.asOfMs), year = date.getUTCFullYear(), monthIndex = date.getUTCMonth();
  const startAtMs = Date.UTC(year, monthIndex, 1), localNextMonthUtcMs = Date.UTC(year, monthIndex + 1, 1);
  if (!clock(startAtMs) || !clock(localNextMonthUtcMs)) return { ok: false, reason: "clock_invalid" };
  const month = { key: date.toISOString().slice(0, 7), startAtMs, localNextMonthUtcMs, days: (localNextMonthUtcMs - startAtMs) / DAY,
    elapsedMs: input.asOfMs - startAtMs, remainingMs: localNextMonthUtcMs - input.asOfMs };
  const tiers = {} as ResourceCapacity["tiers"];
  for (const tier of TIERS) tiers[tier] = { local: projectMeter(input.local, tier, "local_gateway", month, input.asOfMs),
    account: projectMeter(input.account, tier, "account_reported", month, input.asOfMs), planned: emptyDemand() };
  const schedules: ScheduleDemand[] = [], ids = new Set<string>();
  for (const schedule of input.schedules) {
    const d = demand(schedule, month, input.asOfMs);
    if (d === null || ids.has(d.id)) return { ok: false, reason: "schedule_invalid" };
    ids.add(d.id); schedules.push(d);
    const totals = tiers[d.tier].planned;
    for (const key of Object.keys(totals) as (keyof DemandTotals)[]) {
      totals[key] += d[key];
      if (!count(totals[key])) return { ok: false, reason: "schedule_invalid" };
    }
  }
  const limits = meterStatus(input.account, month, input.asOfMs) === "valid" ? input.account?.rateLimits : null;
  return { ok: true, value: { asOfMs: input.asOfMs, evidence: "reported_counters_and_hypothetical_schedule", networkAssumption: "all_scheduled_requests_sent", admissionOrTradingPolicy: false,
    calendarBasis: "utc_local_meter", providerResetAtMs: null, month, accountRateLimits: {
      requestsPerSecond: rate(limits?.requestsPerSecond), tokensPerSecond: rate(limits?.tokensPerSecond) }, tiers, schedules } };
}
