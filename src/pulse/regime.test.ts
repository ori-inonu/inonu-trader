import { expect, test } from "bun:test";
import { MINUTE, STALE_AFTER_MS, regimeOf, type MinuteBar } from "./regime";

// E1 of ADENDO-E: the short-horizon regime of a market from its closed one-minute bars. Pure: the time comes as a parameter.
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % MINUTE);
const bar = (i: number, close: number, buyVolume = 1, sellVolume = 1): MinuteBar => ({ start: T0 + i * MINUTE, close, buyVolume, sellVolume });
/** 16 minutes: ten flat at 100, then a climb to 106, with buyers three times the sellers in the last five. */
const climb = (): MinuteBar[] =>
  [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 101, 102, 103, 104, 105, 106].map((close, i) => (i >= 11 ? bar(i, close, 3, 1) : bar(i, close)));
const justAfter = (bars: readonly MinuteBar[], ms = 1_000) => bars[bars.length - 1]!.start + MINUTE + ms;

test("returns, flow and realized volatility from consecutive minutes (hand computed)", () => {
  const bars = climb();
  expect(regimeOf(bars, justAfter(bars))).toEqual({
    ret1m: 0.95, // 106 / 105 - 1
    ret5m: 4.95, // 106 / 101 - 1, the bar five minutes before the last
    flow5m: 0.5, // (15 - 5) / 20 over the last five minutes
    rv15m: 0.499, // sample standard deviation of the fourteen one-minute log returns, in percent
  });
});

test("a falling market with sellers on top reads negative", () => {
  const bars = [200, 199, 198, 197, 196, 195, 190].map((close, i) => bar(i, close, 1, 4));
  const r = regimeOf(bars, justAfter(bars))!;
  expect(r.ret1m).toBe(-2.56); // 190 / 195 - 1
  expect(r.ret5m).toBe(-4.52); // 190 / 199 - 1
  expect(r.flow5m).toBe(-0.6); // (5 - 20) / 25
  expect(r.rv15m).toBeNull(); // six returns are too few to call a volatility
});

test("a missing minute is unknown, never bridged: the measure that needs it is null and the others stay", () => {
  const bars = climb().filter((b) => b.start !== T0 + 13 * MINUTE);
  const r = regimeOf(bars, justAfter(bars))!;
  expect(r.ret1m).toBe(0.95); // minutes 14 and 15 are both there
  expect(r.ret5m).toBe(4.95); // minutes 10 and 15 are both there
  expect(r.flow5m).toBeNull(); // the five-minute window has a hole
  expect(r.rv15m).not.toBeNull(); // thirteen returns remain, more than the ten needed
  const hole = climb().filter((b) => b.start !== T0 + 14 * MINUTE);
  expect(regimeOf(hole, justAfter(hole))!.ret1m).toBeNull();
});

test("a stale series says nothing: after the last bar closed more than the limit, the answer is null, not calm", () => {
  const bars = climb();
  const closedAt = bars[bars.length - 1]!.start + MINUTE;
  expect(regimeOf(bars, closedAt + STALE_AFTER_MS)).not.toBeNull();
  expect(regimeOf(bars, closedAt + STALE_AFTER_MS + 1)).toBeNull();
  expect(regimeOf([], closedAt)).toBeNull();
});

test("bad bars are dropped, a repeated minute keeps the last one, and the order of the input does not matter", () => {
  const bars = climb();
  const noisy: MinuteBar[] = [
    { start: T0 + 5, close: 100, buyVolume: 1, sellVolume: 1 }, // not aligned to a minute
    { start: T0 + 20 * MINUTE, close: Number.NaN, buyVolume: 1, sellVolume: 1 }, // not a price
    { start: T0 + 21 * MINUTE, close: -3, buyVolume: 1, sellVolume: 1 },
    { start: T0 + 22 * MINUTE, close: 100, buyVolume: -1, sellVolume: 1 }, // a negative volume
    ...bars.slice().reverse(),
    bar(15, 999), // an earlier line for minute 15 comes first in time order of arrival below; the LAST one given wins
  ];
  const clean = regimeOf(bars, justAfter(bars))!;
  const r = regimeOf(noisy.slice(0, -1), justAfter(bars))!;
  expect(r).toEqual(clean);
  expect(regimeOf(noisy, justAfter(bars))!.ret1m).toBe(Math.round(((999 / 105 - 1) * 100) * 100) / 100);
});

test("zero volume in the window is unknown flow, not a neutral zero", () => {
  const bars = climb().map((b, i) => (i >= 11 ? { ...b, buyVolume: 0, sellVolume: 0 } : b));
  expect(regimeOf(bars, justAfter(bars))!.flow5m).toBeNull();
});

test("the input is not touched", () => {
  const bars = Object.freeze(climb().map((b) => Object.freeze({ ...b })));
  expect(() => regimeOf(bars, justAfter(bars))).not.toThrow();
});

test("RED3 of the review: bars that have not closed yet at 'now' are not used; only closed minutes count", () => {
  const bars = climb(); // minutes 0 to 15
  // 'now' is inside minute 15: that bar is still open, so the last closed minute is 14 and its moves are those of 14 against 13 and 9
  const r = regimeOf(bars, T0 + 15 * MINUTE + 5_000)!;
  expect(r.ret1m).toBe(0.96); // 105 / 104 - 1
  expect(r.ret5m).toBe(5); // 105 / 100 - 1: five minutes before minute 14 is minute 9, which closed at 100
});

test("RED3b: when every bar is still in the future, there is no regime", () => {
  const bars = climb();
  expect(regimeOf(bars, T0 - MINUTE)).toBeNull();
  expect(regimeOf(bars, T0 + 1)).toBeNull(); // minute 0 is still open
});
