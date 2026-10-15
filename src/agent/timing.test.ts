import { describe, expect, test } from "bun:test";
import type { Candle } from "../quant/types";
import { entryBlocked, rsiOf, timingFacts, timingFamilies, timingMarks, TIMING } from "./timing";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);

/** Hourly bars from a list of closes; each bar spans a small range around its close. */
function bars(closes: readonly number[], wick = 0.004): Candle[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]!;
    return { startMs: T0 + i * HOUR, open, high: Math.max(open, close) * (1 + wick), low: Math.min(open, close) * (1 - wick), close, volume: 1000, confirmed: true };
  });
}
const series = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));

describe("RSI (Wilder)", () => {
  test("a flat series is neutral", () => {
    expect(rsiOf(series(30, () => 10), 14)).toBe(50);
  });

  test("only gains is 100, only losses is 0", () => {
    expect(rsiOf(series(30, (i) => 10 + i), 14)).toBe(100);
    expect(rsiOf(series(30, (i) => 100 - i), 14)).toBe(0);
  });

  test("a known case: alternating +1 and -0.5 stays well above 50", () => {
    const closes = series(40, (i) => 100 + Math.ceil(i / 2) * 1 - Math.floor(i / 2) * 0.5);
    const rsi = rsiOf(closes, 14)!;
    expect(rsi).toBeGreaterThan(60);
    expect(rsi).toBeLessThan(100);
  });

  test("too few closes is null, not 50", () => {
    expect(rsiOf(series(14, (i) => 10 + i), 14)).toBeNull();
  });
});

describe("the facts of the entry", () => {
  test("a token a few hours old has facts, from the hours it has, and says how many: a young token is not shut out only for being young", () => {
    expect(TIMING.minBars).toBe(6);
    expect(TIMING.fullBars).toBe(24);
    const young = timingFacts(bars(series(10, (i) => 100 * (1 + 0.003 * i))))!;
    expect(young.bars).toBe(10);
    // what needs a longer window is unknown, never invented: the 24 hour move, and the RSI (it needs fifteen closes)
    expect(young.ret24hPct).toBeNull();
    expect(young.rsi).toBeNull();
    expect(young.runUpPct).not.toBeNull();
    expect(young.sigmaHourPct).not.toBeNull();
    // five hours is still too little
    expect(timingFacts(bars(series(5, (i) => 100 + i)))).toBeNull();
  });

  test("a young token that already ran up is still marked: the caution is in the marks, not in the lack of history", () => {
    // 10 hours, doubling: parabolic from the low of the window
    const pumped = timingFacts(bars(series(10, (i) => 100 * 1.08 ** i)))!;
    expect(timingMarks(pumped)).toContain("parabolico");
    expect(entryBlocked(timingMarks(pumped))).toBe(true);
  });

  test("too short or unusable history is no facts: unknown is never calm", () => {
    expect(timingFacts(bars(series(4, () => 1)))).toBeNull();
    expect(timingFacts([])).toBeNull();
    const bad = bars(series(48, () => 1));
    bad[10] = { ...bad[10]!, close: Number.NaN };
    expect(timingFacts(bad)).toBeNull();
  });

  test("history that ends hours ago, or is out of order, does not describe the present", () => {
    const fresh = bars(series(48, (i) => 100 * (1 + 0.002 * i)));
    const lastStart = fresh[fresh.length - 1]!.startMs;
    // the open bar and a lagging provider: still the present
    expect(timingFacts(fresh, lastStart + HOUR)).not.toBeNull();
    expect(timingFacts(fresh, lastStart + 3 * HOUR)).not.toBeNull();
    // a day old: unknown, never calm
    expect(timingFacts(fresh, lastStart + 4 * HOUR)).toBeNull();
    expect(timingFacts(fresh, lastStart + 30 * HOUR)).toBeNull();
    // a clock that cannot be read leaves no facts
    expect(timingFacts(fresh, Number.NaN)).toBeNull();
    // bars repeated or going backwards: the ranges and returns would be wrong
    const shuffled = [...fresh];
    [shuffled[20], shuffled[21]] = [shuffled[21]!, shuffled[20]!];
    expect(timingFacts(shuffled)).toBeNull();
    expect(timingFacts([...fresh.slice(0, 30), fresh[29]!, ...fresh.slice(30)])).toBeNull();
  });

  test("a steady climb: the price is near the top of the range, up on the day", () => {
    const f = timingFacts(bars(series(48, (i) => 100 * (1 + 0.002 * i))))!;
    expect(f.rangePos).toBeGreaterThan(0.9);
    expect(f.ret24hPct).toBeGreaterThan(4);
    expect(f.ret24hPct).toBeLessThan(6);
    expect(f.runUpPct).toBeGreaterThan(9);
    expect(f.drawFromHighPct).toBeLessThan(1);
    expect(f.bars).toBe(48);
  });

  test("a drop from the high is measured below it", () => {
    const closes = [...series(40, (i) => 100 + i), ...series(8, (i) => 139 - i * 2)];
    const f = timingFacts(bars(closes))!;
    expect(f.drawFromHighPct).toBeGreaterThan(8);
    expect(f.ret4hPct).toBeLessThan(-4);
  });

  test("the size of a normal hour is the standard deviation of the hourly log returns", () => {
    // alternating +1 percent and -1 percent: the mean is ~0 and the deviation ~1 percent
    const closes = [100];
    for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 === 1 ? 1.01 : 1 / 1.01));
    expect(timingFacts(bars(closes))!.sigmaHourPct).toBeCloseTo(1, 1);
    // a series that does not move has no measurable hour: null, never zero
    expect(timingFacts(bars(series(48, () => 100)))!.sigmaHourPct).toBeNull();
  });

  test("only the last window is used", () => {
    const f = timingFacts(bars([...series(100, () => 1000), ...series(48, () => 10)]))!;
    expect(f.bars).toBe(TIMING.windowBars);
    expect(f.runUpPct).toBeLessThan(5);
  });
});

describe("marks: when buying now would be chasing", () => {
  test("a parabolic run is marked, and so is an extended one at the top of the range", () => {
    const parabola = timingFacts(bars(series(48, (i) => 100 * 1.025 ** i)))!;
    expect(timingMarks(parabola)).toContain("parabolico");
    expect(entryBlocked(timingMarks(parabola))).toBe(true);
    // up modestly, overbought and at the top of the range
    const top = timingFacts(bars([...series(36, (i) => 100 + (i % 3) * 0.2), ...series(12, (i) => 100.5 + i * 1.1)]))!;
    expect(timingMarks(top)).toContain("esticado");
    expect(entryBlocked(timingMarks(top))).toBe(true);
  });

  test("a falling knife is marked", () => {
    const f = timingFacts(bars([...series(40, () => 100), ...series(8, (i) => 100 - (i + 1) * 1.5)]))!;
    expect(timingMarks(f)).toContain("caindo");
    expect(entryBlocked(timingMarks(f))).toBe(true);
  });

  test("a calm, sideways market raises no mark and blocks nothing", () => {
    const f = timingFacts(bars(series(48, (i) => 100 + Math.sin(i / 4) * 1.5)))!;
    expect(timingMarks(f)).toEqual([]);
    expect(entryBlocked(timingMarks(f))).toBe(false);
  });

  test("volatility expansion is information, not a block", () => {
    const quiet = bars([...series(45, (i) => 100 + (i % 2) * 0.1), 103, 97, 104], 0.002);
    // the last three hours swing far wider than the usual hour
    for (const k of [45, 46, 47]) quiet[k] = { ...quiet[k]!, high: quiet[k]!.high * 1.02, low: quiet[k]!.low * 0.98 };
    const facts = timingFacts(quiet)!;
    expect(facts.volExpansion).toBeGreaterThan(TIMING.volatile.expansion);
    expect(timingMarks(facts)).toContain("volatil");
    expect(entryBlocked(["volatil"])).toBe(false);
  });

  test("unknown facts make no mark (the caller decides what unknown means)", () => {
    expect(timingMarks(null)).toEqual([]);
  });
});

describe("families of a better entry", () => {
  test("a pullback inside strength is a better entry than the top", () => {
    const closes = [...series(36, (i) => 100 + i * 0.5), ...series(12, (i) => 118 - i * 0.6 + (i % 2))];
    const f = timingFacts(bars(closes))!;
    expect(timingFamilies(f)).toContain("retracao");
  });

  test("a rise that took a breath and sits mid-range is a family; the top of a run is not", () => {
    // flat for a day, up about 8 percent over twelve hours, then a gentle three percent give-back
    const closes = [...series(24, (i) => 100 + (i % 2) * 0.2), ...series(12, (i) => 100.2 + (i + 1) * (7.8 / 12)), ...series(12, (i) => 108 - (i + 1) * 0.25)];
    const calm = timingFacts(bars(closes))!;
    expect(timingMarks(calm)).toEqual([]);
    expect(timingFamilies(calm)).toEqual(["retracao", "alta_com_folego"]);
    const top = timingFacts(bars(series(48, (i) => 100 * 1.025 ** i)))!;
    expect(timingFamilies(top)).toEqual([]);
  });
});
