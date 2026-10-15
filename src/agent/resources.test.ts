import { describe, expect, test } from "bun:test";
import type { BudgetSnapshot } from "../onchain-read/budget";
import { resourceView } from "./resources";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const snapshot = (over: Partial<BudgetSnapshot> = {}): BudgetSnapshot => ({
  month: "2026-10",
  restartedFromCorruptFile: false,
  tiers: {
    free: { used: 40, cap: null, today: 4, projection: 80 },
    basic: { used: 1200, cap: 100_000, today: 100, projection: 2400 },
    premium: { used: 300, cap: 100_000, today: 30, projection: 600 },
  },
  ...over,
});

describe("what the SISTEMA screen is told about the quota of the data provider (the projection of the Codex module, computed by the core)", () => {
  test("the local counters of the gateway are projected with the hour they were observed, a cap that is the local configuration, and no account reading: the account is unknown, never zero", () => {
    const view = resourceView({ budget: () => snapshot(), now: () => NOW });
    expect(view).not.toBeNull();
    expect(view!.asOfMs).toBe(NOW);
    expect(view!.month.key).toBe("2026-10");
    expect(view!.providerResetAtMs).toBeNull();
    expect(view!.tiers.basic.local).toMatchObject({ scope: "local_gateway", status: "valid", capEvidence: "local_configuration", observedAtMs: NOW, ageMs: 0, used: 1200, monthlyCap: 100_000 });
    expect(view!.tiers.free.local).toMatchObject({ used: 40, monthlyCap: null });
    expect(view!.tiers.basic.account).toMatchObject({ status: "unreported", used: null, monthlyCap: null, observedAtMs: null });
    expect(view!.accountRateLimits).toEqual({ requestsPerSecond: null, tokensPerSecond: null });
  });

  test("no scheduled demand is invented: the planned totals are zero requests because NO scenario was reported, and the schedules are an empty list", () => {
    const view = resourceView({ budget: () => snapshot(), now: () => NOW })!;
    expect(view.schedules).toEqual([]);
    expect(view.tiers.premium.planned).toEqual({ monthRequests: 0, remainingRequests: 0, monthAttemptsUpperBound: 0, remainingAttemptsUpperBound: 0 });
  });

  test("a counter file the gateway had to restart from zero is reported as corrupt, not as an empty month", () => {
    const view = resourceView({ budget: () => snapshot({ restartedFromCorruptFile: true }), now: () => NOW })!;
    expect(view.tiers.basic.local.status).toBe("corrupt");
    expect(view.tiers.basic.local.used).toBeNull();
  });

  test("a gateway that does not count (a stand-in), a snapshot that throws or one with an invalid month has no projection at all: null, with nothing made up", () => {
    expect(resourceView({ budget: undefined, now: () => NOW })).toBeNull();
    expect(resourceView({ budget: () => { throw new Error("x"); }, now: () => NOW })).toBeNull();
    expect(resourceView({ budget: () => snapshot({ month: "oops" }), now: () => NOW })).toBeNull();
    expect(resourceView({ budget: () => snapshot(), now: () => Number.NaN })).toBeNull();
  });

  test("the projection is plain data: it survives a JSON round trip unchanged, which is how the screen gets it", () => {
    const view = resourceView({ budget: () => snapshot(), now: () => NOW })!;
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
