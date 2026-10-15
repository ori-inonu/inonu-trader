import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { EQUITY, EQUITY_LIMITS, buildSeries, dailyReturns, judgeEquity, summarize, windowChangePct, type Holding, type Snapshot, type Trade } from "./equity";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 14, 12, 0, 0);

const h = (id: string, units: number, priceUsd: number | null): Holding => ({ id, units, priceUsd });
const usdOf = (hs: readonly Holding[]): number => hs.reduce((s, x) => s + x.units * (x.priceUsd ?? 0), 0);
const snap = (atMs: number, holdings: readonly Holding[], usd: number | null = usdOf(holdings)): Snapshot => ({ atMs, usd, holdings });
const cash = (units: number): Holding => h("cash", units, 1);
const aaa = (units: number, price: number): Holding => h("aaa", units, price);

describe("the growth of the wallet is measured by an index that deposits and withdrawals do not move", () => {
  test("a wallet that only moves with prices has an index that moves the same way", () => {
    const series = buildSeries([snap(T0, [cash(100), aaa(10, 10)]), snap(T0 + HOUR, [cash(100), aaa(10, 11)])], []);
    const s = summarize(series)!;
    expect(s.twrPct).toBeCloseTo(5, 6);
    expect(s.pnlUsd).toBeCloseTo(10, 6);
    expect(s.flowsUsd).toBe(0);
    expect(s.gaps).toBe(0);
    expect(s.coverage).toBe(1);
  });

  test("a deposit is not growth", () => {
    const s = summarize(buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(150)])], []))!;
    expect(s.twrPct).toBeCloseTo(0, 6);
    expect(s.pnlUsd).toBeCloseTo(0, 6);
    expect(s.flowsUsd).toBeCloseTo(50, 6);
  });

  test("a withdrawal is not a loss, and does not open the circuit breaker", () => {
    const series = buildSeries([snap(T0, [cash(200)]), snap(T0 + HOUR, [cash(120)])], []);
    const s = summarize(series)!;
    expect(s.twrPct).toBeCloseTo(0, 6);
    expect(s.flowsUsd).toBeCloseTo(-80, 6);
    expect(judgeEquity(series, T0 + HOUR)).toBeNull();
  });

  test("the first funding of an empty wallet is a deposit and starts the index", () => {
    const s = summarize(buildSeries([snap(T0, []), snap(T0 + HOUR, [cash(80)]), snap(T0 + 2 * HOUR, [cash(80)])], []))!;
    expect(s.twrPct).toBeCloseTo(0, 6);
    expect(s.flowsUsd).toBeCloseTo(80, 6);
  });

  test("what a trade costs is performance, not a flow", () => {
    // 50 dollars bought, 1.5 lost to impact and fees: 98.5 left of 100
    const trades: Trade[] = [{ atMs: T0 + 10 * MIN, usd: 50 }];
    const s = summarize(buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(50), aaa(4.85, 10)])], trades))!;
    expect(s.flowsUsd).toBe(0);
    expect(s.pnlUsd).toBeCloseTo(-1.5, 6);
    expect(s.twrPct).toBeCloseTo(-1.5, 6);
  });

  test("an order that is still settling into the balance is still a trade, not a flow", () => {
    // sent 20 minutes before the first snapshot, visible only in the second
    const trades: Trade[] = [{ atMs: T0 - 20 * MIN, usd: 50 }];
    const s = summarize(buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(50), aaa(4.85, 10)])], trades))!;
    expect(EQUITY.settleLagMs).toBeGreaterThan(20 * MIN);
    expect(s.flowsUsd).toBe(0);
    expect(s.pnlUsd).toBeCloseTo(-1.5, 6);
  });

  test("a change of quantity with nothing traded is a flow once it is above the dust", () => {
    expect(summarize(buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(101)])], []))!.flowsUsd).toBeCloseTo(1, 6);
    const dust = summarize(buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(100 + EQUITY.dustUsd / 2)])], []))!;
    expect(dust.flowsUsd).toBe(0);
  });

  test("a loss is not hidden by a deposit made at the same time", () => {
    // the only holding falls 6 percent while 100 dollars arrive: the raw balance went from 100 to 194
    const series = buildSeries([snap(T0, [aaa(100, 1)]), snap(T0 + 2 * HOUR, [aaa(100, 0.94), cash(100)])], []);
    const s = summarize(series)!;
    expect(s.valueUsd).toBeCloseTo(194, 6);
    expect(s.flowsUsd).toBeCloseTo(100, 6);
    expect(s.twrPct).toBeCloseTo(-6, 6);
    expect(judgeEquity(series, T0 + 2 * HOUR)).toBe("queda_do_dia");
  });
});

describe("the circuit breaker reads the wallet, not a hypothetical", () => {
  const prices = (ps: readonly number[], stepMs: number) => buildSeries(ps.map((p, i) => snap(T0 + i * stepMs, [aaa(100, p)])), []);

  test("a loss of the day beyond the limit opens it, a smaller one does not", () => {
    const limit = EQUITY_LIMITS.dayLossPct;
    expect(judgeEquity(prices([1, 1 - (limit + 1) / 100], 2 * HOUR), T0 + 2 * HOUR)).toBe("queda_do_dia");
    expect(judgeEquity(prices([1, 1 - (limit - 1) / 100], 2 * HOUR), T0 + 2 * HOUR)).toBeNull();
  });

  test("a slow slide that never loses much in a day still opens it, from the peak of the week", () => {
    const series = prices([1, 1.2, 1.17, 1.14, 1.11, 1.08, 1.05, 1.02], DAY);
    expect(windowChangePct(series, T0 + 7 * DAY, DAY)!).toBeGreaterThan(-EQUITY_LIMITS.dayLossPct);
    expect(judgeEquity(series, T0 + 7 * DAY)).toBe("queda_do_pico");
  });

  test("a peak older than the window no longer counts", () => {
    const series = prices([1, 2, 1.8, 1.7, 1.69, 1.68, 1.67, 1.66, 1.66, 1.66, 1.66], DAY);
    expect(judgeEquity(series, T0 + 10 * DAY)).toBeNull();
  });

  test("a series that stopped long ago does not speak about now", () => {
    const series = prices([1, 0.8], HOUR);
    expect(judgeEquity(series, T0 + HOUR)).toBe("queda_do_dia");
    expect(judgeEquity(series, T0 + HOUR + EQUITY_LIMITS.maxAgeMs + MIN)).toBeNull();
  });

  test("fewer than two valued readings say nothing", () => {
    expect(summarize(buildSeries([], []))).toBeNull();
    expect(summarize(buildSeries([snap(T0, [cash(100)])], []))).toBeNull();
    expect(judgeEquity(buildSeries([snap(T0, [cash(100)])], []), T0)).toBeNull();
  });
});

describe("unknown stays unknown", () => {
  test("a reading that could not be valued is skipped, never read as zero", () => {
    const series = buildSeries([snap(T0, [aaa(100, 1)]), snap(T0 + HOUR, [aaa(100, 1)], null), snap(T0 + 2 * HOUR, [aaa(100, 1)])], []);
    const s = summarize(series)!;
    expect(s.unknown).toBe(1);
    expect(s.twrPct).toBeCloseTo(0, 6);
    expect(judgeEquity(series, T0 + 2 * HOUR)).toBeNull();
  });

  test("a change of quantity that cannot be priced is a gap, not a guess", () => {
    const series = buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(100), h("xyz", 500, null)], 100), snap(T0 + 2 * HOUR, [cash(100), h("xyz", 500, null)], 100)], []);
    const s = summarize(series)!;
    expect(s.gaps).toBe(1);
    expect(s.coverage).toBeLessThan(1);
    expect(s.twrPct).toBeCloseTo(0, 6);
  });

  test("readings out of order or repeated are refused, not reordered", () => {
    const series = buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(100)]), snap(T0 + HOUR, [cash(100)]), snap(T0 - MIN, [cash(100)]), snap(Number.NaN, [cash(100)])], []);
    expect(summarize(series)!.rejected).toBe(3);
  });

  test("a value that is not a number is a gap of knowledge, never a number", () => {
    const series = buildSeries([snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(100)], Number.POSITIVE_INFINITY), snap(T0 + 2 * HOUR, [cash(100)], -5), snap(T0 + 3 * HOUR, [cash(100)])], []);
    const s = summarize(series)!;
    expect(s.unknown).toBe(2);
    expect(s.twrPct).toBeCloseTo(0, 6);
  });

  test("the inputs are not changed", () => {
    const snaps = [snap(T0, [cash(100)]), snap(T0 + HOUR, [cash(150)])];
    const trades: Trade[] = [{ atMs: T0, usd: 5 }];
    const before = JSON.stringify({ snaps, trades });
    buildSeries(snaps, trades);
    expect(JSON.stringify({ snaps, trades })).toBe(before);
  });
});

describe("the module has no way to act", () => {
  test("it reads, computes and returns: no network, disk, clock, process or model, and nothing imported", () => {
    const source = readFileSync(new URL("./equity.ts", import.meta.url), "utf8");
    for (const token of ["node:", "fetch(", "Bun.", "process.", "Date.now", "Math.random", "setTimeout", "import(", "require("]) expect(source.includes(token)).toBe(false);
    expect(/^import /m.test(source)).toBe(false);
  });
});

describe("the day is the person's day", () => {
  const series = buildSeries(
    [
      snap(T0, [aaa(100, 1.0)]),
      snap(T0 + 10 * HOUR, [aaa(100, 1.02)]),
      snap(T0 + 22 * HOUR, [aaa(100, 1.0098)]),
      snap(T0 + 34 * HOUR, [aaa(100, 1.0098)]),
      snap(T0 + 46 * HOUR, [aaa(100, 1.04)]),
    ],
    [],
  );

  test("each day closes against the close of the one before", () => {
    const days = dailyReturns(series, 0);
    expect(days.map((d) => d.day)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(days[0]!.partial).toBe(true);
    expect(days[1]!.partial).toBe(false);
    expect(days[0]!.returnPct).toBeCloseTo(2, 4);
    expect(days[1]!.returnPct).toBeCloseTo(-1, 4);
    expect(days[2]!.returnPct).toBeCloseTo(2.99, 1);
  });

  test("a reading just after midnight in UTC still belongs to the night before in Brazil", () => {
    const night = buildSeries([snap(Date.UTC(2026, 9, 14, 15, 0), [aaa(100, 1)]), snap(Date.UTC(2026, 9, 15, 1, 0), [aaa(100, 1.05)])], []);
    expect(dailyReturns(night, 0).map((d) => d.day)).toEqual(["2026-10-14", "2026-10-15"]);
    expect(dailyReturns(night, -180).map((d) => d.day)).toEqual(["2026-10-14"]);
  });

  test("no readings, no days", () => {
    expect(dailyReturns(buildSeries([], []), 0)).toEqual([]);
  });
});
