import { describe, expect, test } from "bun:test";
import { agedMomentum, momentumFacts, MOMENTUM } from "./momentum";
import type { Candle } from "../quant/types";

const BAR = 5 * 60_000;
const NOW = 10_000_000_000;

/** `closes` oldest first, the last bar starting `lagBars` bars before now. Highs and lows are a fixed 0.2 percent around each close. */
const bars = (closes: readonly number[], over: { volume?: number | null; lagBars?: number; gapAt?: number } = {}): Candle[] => {
  const lastStart = NOW - (over.lagBars ?? 1) * BAR;
  return closes.map((close, i) => {
    const start = lastStart - (closes.length - 1 - i) * BAR - (over.gapAt !== undefined && i < over.gapAt ? 6 * BAR : 0);
    return { startMs: start, open: close, high: close * 1.002, low: close * 0.998, close, volume: over.volume === undefined ? 100 : over.volume, confirmed: true };
  });
};
const flat = (n: number, price = 100): number[] => Array.from({ length: n }, () => price);

describe("the last hour of a token in five-minute bars: what it is doing NOW, from facts and never a forecast", () => {
  test("it reads the move of the last bar, of the last fifteen minutes and of the last hour, and how fresh the data is", () => {
    // thirteen bars: 100 for an hour, then 101, 102, 104
    const closes = [...flat(10), 101, 102, 104];
    const f = momentumFacts(bars(closes), NOW)!;
    expect(f.ret5mPct).toBeCloseTo((104 / 102 - 1) * 100, 9);
    expect(f.ret15mPct).toBeCloseTo((104 / 100 - 1) * 100, 9);
    expect(f.ret1hPct).toBeCloseTo((104 / 100 - 1) * 100, 9);
    expect(f.barAgeMin).toBeCloseTo(5, 9);
    expect(f.bars).toBe(13);
  });

  test("the range of the hour and whether volume is picking up or dying", () => {
    const quiet = momentumFacts(bars([...flat(12), 100]), NOW)!;
    expect(quiet.rangeHourPct).toBeCloseTo(0.4, 6);
    const volumes = bars([...flat(12), 100]).map((c, i, all) => ({ ...c, volume: i >= all.length - 3 ? 300 : 100 }));
    expect(momentumFacts(volumes, NOW)!.volRatio).toBeCloseTo(3, 9);
    expect(momentumFacts(bars(flat(13), { volume: null }), NOW)!.volRatio).toBeNull();
  });

  test("a token that did not move all hour is marked stagnant, and one that moved is not; the mark is an observation", () => {
    expect(momentumFacts(bars(flat(13)), NOW)!.marks).toContain("estagnado");
    expect(momentumFacts(bars([...flat(10), 101, 103, 105]), NOW)!.marks).not.toContain("estagnado");
  });

  test("a token that is already racing or dropping in minutes is marked, so the model sees the moment and not only the hour", () => {
    expect(momentumFacts(bars([...flat(10), 101, 104, 109]), NOW)!.marks).toContain("disparando");
    expect(momentumFacts(bars([...flat(10), 99, 96, 91]), NOW)!.marks).toContain("caindo_agora");
  });

  test("data that is old, with holes, out of order, too short or not sound is no data (unknown, never guessed)", () => {
    expect(momentumFacts(bars(flat(13), { lagBars: 6 }), NOW)).toBeNull();
    expect(momentumFacts(bars(flat(13), { gapAt: 6 }), NOW)).toBeNull();
    expect(momentumFacts(bars(flat(MOMENTUM.minBars - 1)), NOW)).toBeNull();
    const shuffled = bars(flat(13));
    [shuffled[3], shuffled[4]] = [shuffled[4]!, shuffled[3]!];
    expect(momentumFacts(shuffled, NOW)).toBeNull();
    expect(momentumFacts(bars([...flat(12), Number.NaN]), NOW)).toBeNull();
    expect(momentumFacts(bars([...flat(12), 0]), NOW)).toBeNull();
    expect(momentumFacts([], NOW)).toBeNull();
  });
});

describe("the bars must be what they say: closed, consecutive, and consistent with themselves (the probes of the independent review)", () => {
  test("a bar that has not closed yet is not part of the history: the open bar is dropped, and a closed series that is left too short is no data", () => {
    const closes = [...flat(11), 101, 102, 104];
    const all = bars(closes);
    // the last bar is still open: it does not count, the one before it is the last close
    const open = all.map((c, i) => (i === all.length - 1 ? { ...c, confirmed: false } : c));
    const f = momentumFacts(open, NOW)!;
    expect(f.bars).toBe(13);
    expect(f.ret5mPct).toBeCloseTo((102 / 101 - 1) * 100, 9);
    // an open bar in the middle of the series is a series that cannot be trusted
    const hole = all.map((c, i) => (i === 5 ? { ...c, confirmed: false } : c));
    expect(momentumFacts(hole, NOW)).toBeNull();
    // exactly the minimum of closed bars is needed: one open bar on a minimum series leaves too few
    expect(momentumFacts(bars(flat(MOMENTUM.minBars)).map((c, i, a) => (i === a.length - 1 ? { ...c, confirmed: false } : c)), NOW)).toBeNull();
  });

  test("bars that are not on the five-minute grid are not a five-minute series: a 15 minute hole is not reported as five minutes", () => {
    const all = bars(flat(13));
    const gapped = all.map((c, i) => (i >= 6 ? { ...c, startMs: c.startMs - 0 } : { ...c, startMs: c.startMs - 2 * BAR }));
    expect(momentumFacts(gapped, NOW)).toBeNull();
    const irregular = all.map((c, i) => (i === 12 ? { ...c, startMs: c.startMs - 60_000 } : c));
    expect(momentumFacts(irregular, NOW)).toBeNull();
  });

  test("a close outside the high and low of its own bar is not a price", () => {
    const all = bars(flat(13));
    const broken = all.map((c, i) => (i === 12 ? { ...c, open: 100, high: 101, low: 99, close: 200 } : c));
    expect(momentumFacts(broken, NOW)).toBeNull();
    const openOut = all.map((c, i) => (i === 6 ? { ...c, open: 150 } : c));
    expect(momentumFacts(openOut, NOW)).toBeNull();
  });
});

describe("momentum read some minutes ago", () => {
  const read = () => momentumFacts(bars(Array.from({ length: 24 }, (_, i) => 100 + (i % 2))), NOW)!;

  test("grows older with the clock and changes nothing else: a cache hit is not a new fact", () => {
    const fresh = read();
    const aged = agedMomentum(fresh, 2 * 60_000)!;
    expect(aged.barAgeMin).toBe(fresh.barAgeMin + 2);
    expect({ ...aged, barAgeMin: 0 }).toEqual({ ...fresh, barAgeMin: 0 });
    expect(fresh.barAgeMin).toBe(5);
  });

  test("past the data window it is no longer momentum: unknown, never a stale fact that claims to be current", () => {
    const fresh = read();
    expect(agedMomentum(fresh, MOMENTUM.maxBarAgeMs - fresh.barAgeMin * 60_000)).not.toBeNull();
    expect(agedMomentum(fresh, MOMENTUM.maxBarAgeMs - fresh.barAgeMin * 60_000 + 1)).toBeNull();
  });

  test("a clock that went backwards does not make the bar younger than it was read", () => {
    const fresh = read();
    expect(agedMomentum(fresh, -60_000)!.barAgeMin).toBe(fresh.barAgeMin);
  });
});
