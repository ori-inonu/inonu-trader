/**
 * The API budget of the free plan, in numbers per month, per day and per minute, and what a faster cadence of looks would cost. READ ONLY: it reads the local usage counter of the on-chain gateway
 * (`<data>/onchain/usage-YYYY-MM.json`, tier totals per UTC day), writes nothing, calls no network, no model, sends no order and touches nothing of the live agent. It states the plan limits that the provider PUBLISHES
 * and marks as unknown the ones it does not: the fee page (checked 2026-10-15) lists monthly quotas only; it lists no per second, per minute or per day limit.
 * Usage: bun --no-env-file run scripts/api-budget.ts [dataDir] [--interval-now 2.26] [--interval-new 1]
 */
export interface Plan {
  readonly name: string;
  readonly basicPerMonth: number;
  readonly premiumPerMonth: number;
  readonly websocket: boolean;
  readonly priceUsdPerMonth: number;
}

/** From the provider's fee page (web3.okx.com/onchainos/dev-docs/market/market-api-fee), read on 2026-10-15: quotas reset on the 1st of each month. No per second, per minute or per day limit is published there. */
export const FREE_PLAN: Plan = { name: "Free", basicPerMonth: 100_000, premiumPerMonth: 100_000, websocket: false, priceUsdPerMonth: 0 };
export const PAID_PLANS: readonly Plan[] = [
  { name: "Starter", basicPerMonth: 2_000_000, premiumPerMonth: 600_000, websocket: true, priceUsdPerMonth: 99 },
  { name: "Growth", basicPerMonth: 5_000_000, premiumPerMonth: 2_000_000, websocket: true, priceUsdPerMonth: 199 },
];
/** Pay per call (x402) after the free quota: dollars per request. It needs a payment signature per request, which this project does not do. */
export const X402_USD_PER_CALL = { basic: 0.0001, premium: 0.0002 } as const;

export const budgetOf = (perMonth: number, daysInMonth: number): { readonly perDay: number; readonly perHour: number; readonly perMinute: number } => {
  const perDay = perMonth / daysInMonth;
  return { perDay, perHour: perDay / 24, perMinute: perDay / 1440 };
};

/** What the use becomes when the interval between looks changes: the part that grows with the looks scales by the ratio of the intervals, the rest (time based reads) stays. `perLookShare` in [0, 1]. */
export const projectAtInterval = (i: { readonly usedPerDayNow: number; readonly intervalNowMin: number; readonly intervalNewMin: number; readonly perLookShare: number }): number =>
  i.usedPerDayNow * (1 - i.perLookShare) + i.usedPerDayNow * i.perLookShare * (i.intervalNowMin / i.intervalNewMin);

/** The most that can be used a day for the rest of the month: the quota left over the days left. */
export const sustainablePerDay = (i: { readonly capPerMonth: number; readonly usedSoFar: number; readonly daysLeft: number }): number => Math.max(0, i.capPerMonth - i.usedSoFar) / Math.max(1, i.daysLeft);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const num = (name: string, fallback: number): number => {
    const k = args.indexOf(name);
    return k >= 0 && Number.isFinite(Number(args[k + 1])) ? Number(args[k + 1]) : fallback;
  };
  const positional = args.filter((a, k) => !a.startsWith("--") && !args[k - 1]?.startsWith("--"));
  const dir = (positional[0] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data`).replaceAll("\\", "/").replace(/\/?$/, "/");
  const intervalNow = num("--interval-now", 2.26);
  const intervalNew = num("--interval-new", 1);
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const today = String(now.getUTCDate()).padStart(2, "0");
  const file = Bun.file(`${dir}onchain/usage-${month}.json`);
  const usage: { days: Record<string, { free?: number; basic?: number; premium?: number }> } = (await file.exists()) ? JSON.parse(await file.text()) : { days: {} };
  const hoursToday = now.getUTCHours() + now.getUTCMinutes() / 60;
  const tiers = (["basic", "premium"] as const).map((tier) => {
    const cap = tier === "basic" ? FREE_PLAN.basicPerMonth : FREE_PLAN.premiumPerMonth;
    const todaySoFar = usage.days[today]?.[tier] ?? 0;
    const projToday = hoursToday > 0.5 ? (todaySoFar / hoursToday) * 24 : todaySoFar;
    const usedBeforeToday = Object.entries(usage.days).filter(([d]) => d !== today).reduce((s, [, v]) => s + (v[tier] ?? 0), 0);
    const daysLeftAfterToday = daysInMonth - now.getUTCDate();
    const sustainable = sustainablePerDay({ capPerMonth: cap, usedSoFar: usedBeforeToday + projToday, daysLeft: daysLeftAfterToday });
    const bounds = Object.fromEntries([0, 0.5, 1].map((share) => [`perLookShare_${share}`, Math.round(projectAtInterval({ usedPerDayNow: projToday, intervalNowMin: intervalNow, intervalNewMin: intervalNew, perLookShare: share }))]));
    const fullMonthAtToday = projToday * daysInMonth;
    const overUsd = Math.max(0, fullMonthAtToday - cap) * X402_USD_PER_CALL[tier];
    return {
      tier,
      capPerMonth: cap,
      freePlanPerDay: Math.round(budgetOf(cap, daysInMonth).perDay),
      freePlanPerMinute: Math.round(budgetOf(cap, daysInMonth).perMinute * 100) / 100,
      usedBeforeToday,
      todaySoFar,
      projectedToday: Math.round(projToday),
      fullMonthAtTodayRate: Math.round(fullMonthAtToday),
      overCapAtTodayRate: Math.max(0, Math.round(fullMonthAtToday - cap)),
      x402CostOfOverageUsdPerMonth: Math.round(overUsd * 100) / 100,
      sustainablePerDayRestOfMonth: Math.round(sustainable),
      projectedPerDayAtNewInterval: bounds,
    };
  });
  console.log(
    JSON.stringify(
      {
        note: "descriptive; the plan numbers are the provider's published monthly quotas of the Free plan; per second, per minute and per day limits are NOT published on the fee page (null); the split between reads that grow with the looks and time based reads is NOT measured (the counter has tier totals only), so the projection is a range",
        month,
        daysInMonth,
        plan: FREE_PLAN,
        publishedRateLimits: { perSecond: null, perMinute: null, perDay: null },
        intervalNowMin: intervalNow,
        intervalNewMin: intervalNew,
        paidPlans: PAID_PLANS,
        x402UsdPerCall: X402_USD_PER_CALL,
        tiers,
      },
      null,
      2,
    ),
  );
}
