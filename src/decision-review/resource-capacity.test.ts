import { expect, test } from "bun:test";
import { projectResourceCapacity, type ResourceCapacityInput, type CollectionSchedule } from "./resource-capacity";

const OCT = Date.parse("2026-10-15T00:00:00Z"), DAY = 86_400_000;
function input(atMs = OCT): ResourceCapacityInput {
  return { asOfMs: atMs, local: { month: "2026-10", observedAtMs: atMs, integrity: "valid", tiers: {
    free: { used: 195, monthlyCap: null }, basic: { used: 1992, monthlyCap: 100_000 }, premium: { used: 1500, monthlyCap: 100_000 },
  } }, account: null, schedules: [] };
}
function value(i = input()) {
  const result = projectResourceCapacity(i);
  if (!result.ok) throw Error(result.reason);
  return result.value;
}
function schedule(patch: Partial<CollectionSchedule> = {}): CollectionSchedule {
  return { id: "marks", tier: "basic", endpoint: "/gateway/price", firstRunAtMs: Date.parse("2026-10-01T00:00:00Z"), intervalMs: 60_000, itemsPerRun: 1, batchSize: 1, adapterBatching: "not_enabled", maxRetriesPerRequest: 0, ...patch };
}

test("local counters do not become account totals or an entitlement", () => {
  const v = value();
  expect(v.month).toMatchObject({ key: "2026-10", days: 31, localNextMonthUtcMs: Date.parse("2026-11-01T00:00:00Z"), remainingMs: 17 * DAY });
  expect(v.calendarBasis).toBe("utc_local_meter");
  expect(v.providerResetAtMs).toBeNull();
  expect(v.tiers.basic.local).toMatchObject({ status: "valid", used: 1992, monthlyCap: 100_000, remainingAtObservation: 98_008, scope: "local_gateway", capEvidence: "local_configuration" });
  expect(v.tiers.basic.account).toMatchObject({ status: "unreported", used: null, monthlyCap: null, remainingAtObservation: null, scope: "account_reported", capEvidence: "unknown" });
  expect(v.accountRateLimits).toEqual({ requestsPerSecond: null, tokensPerSecond: null });
  expect(v.admissionOrTradingPolicy).toBe(false);
});

test("rates use the actual month and elapsed UTC duration, not day number or thirty days", () => {
  const r = value().tiers.basic.local;
  expect(r.usedPerElapsedDay).toBeCloseTo(1992 / 14, 10);
  expect(r.usedPerElapsedMinute).toBeCloseTo(1992 / (14 * 1440), 10);
  expect(r.capPerCalendarDay).toBeCloseTo(100_000 / 31, 10);
  expect(r.remainingPerDayAtObservation).toBeCloseTo(98_008 / 17, 10);
  expect(r.extrapolatedMonthUse).toBeCloseTo(1992 * 31 / 14, 10);
});

test("February, leap February, April and December have their own reset boundary", () => {
  for (const [date, days, reset] of [
    ["2027-02-15T00:00:00Z", 28, "2027-03-01T00:00:00Z"], ["2028-02-15T00:00:00Z", 29, "2028-03-01T00:00:00Z"],
    ["2026-04-15T00:00:00Z", 30, "2026-05-01T00:00:00Z"], ["2026-12-15T00:00:00Z", 31, "2027-01-01T00:00:00Z"],
  ] as const) {
    const i = input(Date.parse(date)); i.local = null;
    expect(value(i).month).toMatchObject({ key: date.slice(0, 7), days, localNextMonthUtcMs: Date.parse(reset) });
  }
});

test("the rollover never reuses the prior month's counter or implies a full known balance", () => {
  const i = input(Date.parse("2026-11-01T00:00:00Z"));
  expect(value(i).tiers.basic.local).toMatchObject({ status: "month_mismatch", used: null, remainingAtObservation: null });
  i.local!.month = "2026-11"; i.local!.tiers.basic!.used = 0;
  const r = value(i).tiers.basic.local;
  expect(r).toMatchObject({ status: "valid", used: 0, remainingAtObservation: 100_000, usedPerElapsedDay: null, extrapolatedMonthUse: null });
  expect(value(i).tiers.basic.account.remainingAtObservation).toBeNull();
});

test("corrupt, unreadable, malformed and absent counters cannot produce a zero-use quota", () => {
  for (const integrity of ["corrupt", "unreadable"] as const) {
    const i = input(); i.local!.integrity = integrity; i.local!.tiers.basic!.used = 0;
    expect(value(i).tiers.basic.local).toMatchObject({ status: integrity, used: null, remainingAtObservation: null, remainingPerDayAtObservation: null });
  }
  for (const bad of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const i = input(); i.local!.tiers.basic!.used = bad;
    expect(value(i).tiers.basic.local.status).toBe("invalid");
  }
  const i = input(); delete i.local!.tiers.basic;
  expect(value(i).tiers.basic.local).toMatchObject({ status: "unreported", remainingAtObservation: null });
});

test("old observations retain their measured scope and age without rejuvenating the balance", () => {
  const i = input(); i.asOfMs += DAY;
  const r = value(i).tiers.basic.local;
  expect(r.ageMs).toBe(DAY);
  expect(r.remainingPerDayAtObservation).toBeCloseTo(98_008 / 17, 10);
  expect(r.usedPerElapsedDay).toBeCloseTo(1992 / 14, 10);
  i.local!.observedAtMs = i.asOfMs + 1;
  expect(value(i).tiers.basic.local.status).toBe("invalid");
});

test("a provider-reported account snapshot remains distinct from local configuration", () => {
  const i = input(); i.account = { month: "2026-10", observedAtMs: OCT, integrity: "valid", tiers: {
    basic: { used: 8000, monthlyCap: 200_000 },
  }, rateLimits: { requestsPerSecond: 4, tokensPerSecond: null } };
  const v = value(i);
  expect(v.tiers.basic.local.remainingAtObservation).toBe(98_008);
  expect(v.tiers.basic.account).toMatchObject({ used: 8000, monthlyCap: 200_000, remainingAtObservation: 192_000, capEvidence: "provider_reported" });
  expect(v.accountRateLimits).toEqual({ requestsPerSecond: 4, tokensPerSecond: null });
  i.account.integrity = "corrupt";
  expect(value(i).accountRateLimits).toEqual({ requestsPerSecond: null, tokensPerSecond: null });
});

test("unknown cap is not unlimited and overage is explicit rather than negative remaining", () => {
  const i = input(); i.local!.tiers.basic = { used: 120_000, monthlyCap: 100_000 };
  const v = value(i);
  expect(v.tiers.basic.local).toMatchObject({ remainingAtObservation: 0, overageAtObservation: 20_000, remainingPerMinuteAtObservation: 0 });
  expect(v.tiers.free.local).toMatchObject({ used: 195, monthlyCap: null, remainingAtObservation: null, capPerCalendarDay: null });
});

test("one call per minute, thirty seconds and ten seconds consume calendar-month requests", () => {
  const i = input(); i.schedules = [schedule(), schedule({ id: "other", intervalMs: 30_000 }), schedule({ id: "fast", tier: "premium", intervalMs: 10_000 })];
  const v = value(i);
  expect(v.schedules.map(s => s.monthRequests)).toEqual([44_640, 89_280, 267_840]);
  expect(v.tiers.basic.planned.monthRequests).toBe(133_920);
  expect(v.tiers.premium.planned.monthRequests).toBe(267_840);
  expect(v.tiers.basic.planned.remainingRequests).toBe(17 * 1440 * 3);
  expect(v.tiers.basic.local.monthlyCap).toBe(100_000);
});

test("requests and retry attempts are separate and aggregate under their shared tier", () => {
  const i = input(); i.schedules = [schedule({ itemsPerRun: 3, maxRetriesPerRequest: 2 }), schedule({ id: "risk", itemsPerRun: 2 })];
  const v = value(i);
  expect(v.schedules[0]).toMatchObject({ requestsPerRun: 3, attemptsPerRunUpperBound: 9, monthRequests: 133_920, monthAttemptsUpperBound: 401_760 });
  expect(v.tiers.basic.planned).toMatchObject({ monthRequests: 223_200, monthAttemptsUpperBound: 491_040 });
  expect(v.tiers.premium.planned.monthRequests).toBe(0);
});

test("batching is a declared integration scenario only for the supported index endpoint", () => {
  const i = input(); i.schedules = [schedule({ endpoint: "/api/v6/dex/index/current-price", tier: "free", itemsPerRun: 201, batchSize: 100, adapterBatching: "enabled" })];
  const r = value(i).schedules[0]!;
  expect(r).toMatchObject({ itemsPerRun: 201, batchSize: 100, requestsPerRun: 3, monthRequests: 133_920, integrationEvidence: "caller_reported" });
  for (const patch of [{ endpoint: "/gateway/price" }, { adapterBatching: "not_enabled" }, { batchSize: 101 }, { tier: "basic" }] as const) {
    i.schedules = [{ ...i.schedules[0]!, ...patch }];
    expect(projectResourceCapacity(i).ok).toBe(false);
    i.schedules = [schedule({ endpoint: "/api/v6/dex/index/current-price", tier: "free", itemsPerRun: 201, batchSize: 100, adapterBatching: "enabled" })];
  }
});

test("the documented Premium price-info batch is separate from today's single-token gateway", () => {
  const i = input(); i.schedules = [schedule({ endpoint: "/api/v6/dex/market/price-info", tier: "premium", itemsPerRun: 100, batchSize: 100, adapterBatching: "enabled" })];
  expect(value(i).schedules[0]).toMatchObject({ requestsPerRun: 1, monthRequests: 44_640 });
  i.schedules = [schedule({ endpoint: "/gateway/price-info", tier: "premium", itemsPerRun: 100 })];
  expect(value(i).schedules[0]).toMatchObject({ requestsPerRun: 100, monthRequests: 4_464_000 });
  i.schedules = [schedule({ endpoint: "/api/v6/dex/market/price-info", tier: "premium", itemsPerRun: 100, batchSize: 100 })];
  expect(projectResourceCapacity(i)).toEqual({ ok: false, reason: "schedule_invalid" });
});

test("known provider endpoints keep their documented tier even without batching", () => {
  for (const [endpoint, tier] of [["/api/v6/dex/index/current-price", "basic"], ["/api/v6/dex/market/price-info", "free"]] as const) {
    const i = input(); i.schedules = [schedule({ endpoint, tier })];
    expect(projectResourceCapacity(i)).toEqual({ ok: false, reason: "schedule_invalid" });
  }
});

test("a schedule's phase is respected and the reset instant belongs to the new month", () => {
  const i = input(); i.asOfMs = Date.parse("2026-10-31T23:58:30Z");
  i.schedules = [schedule({ firstRunAtMs: Date.parse("2026-10-31T23:59:00Z") }), schedule({ id: "next", firstRunAtMs: Date.parse("2026-11-01T00:00:00Z") })];
  const v = value(i);
  expect(v.schedules.map(s => s.remainingRuns)).toEqual([1, 0]);
  expect(v.schedules.map(s => s.monthRuns)).toEqual([1, 0]);
});

test("invalid schedules, duplicate ids and numeric overflow fail explicitly", () => {
  for (const patch of [{ intervalMs: 0 }, { itemsPerRun: -1 }, { batchSize: 0 }, { maxRetriesPerRequest: 0.5 }, { intervalMs: 0.5 }, { itemsPerRun: Number.MAX_SAFE_INTEGER }]) {
    const i = input(); i.schedules = [schedule(patch)];
    expect(projectResourceCapacity(i).ok).toBe(false);
  }
  const i = input(); i.schedules = [schedule(), schedule()];
  expect(projectResourceCapacity(i)).toEqual({ ok: false, reason: "schedule_invalid" });
  expect(projectResourceCapacity({ ...i, asOfMs: NaN })).toEqual({ ok: false, reason: "clock_invalid" });
});

test("projection does not mutate evidence, fabricate model costs or account balance", () => {
  const i = input(); i.schedules = [schedule()]; const before = JSON.stringify(i);
  const v = value(i);
  expect(JSON.stringify(i)).toBe(before);
  expect(JSON.stringify(v)).not.toContain("modelBalance");
  expect(JSON.stringify(v)).not.toContain("costUsd");
  expect(v.evidence).toBe("reported_counters_and_hypothetical_schedule");
});
