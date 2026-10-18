// T5.2 / FLX-1, FLX-11, AC-FLX-1, AC-FLX-5: the footprint of a candle by price level from the aggressor side of each trade,
// in exact units, with perpetual sizes converted from contracts to base currency. Vectors V-FOOT-1, V-PERP-1, V-BIN-1
// of docs/sdd/inonu-desktop-v1/flow-engine.md (origin: synthetic_fixture, tests only).
import { describe, expect, test } from "bun:test";
import { autoBinTicks, buildFootprint, candleStart, CANDLE_INTERVALS_MS, createFootprint, unitOf, type InstrumentMeta } from "./footprint";
import type { Trade } from "./ingest";

const SPOT: InstrumentMeta = { instId: "TEST-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };
const BTC_SWAP: InstrumentMeta = { instId: "BTC-USDT-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "0.01", ctVal: "0.01", ctMult: "1" };

const t = (px: string, sz: string, side: "buy" | "sell", ts = 0): Trade => ({ ts, px, sz, side });
const V_FOOT_1 = [t("100.0", "2", "buy"), t("100.0", "3", "sell"), t("100.5", "1", "buy"), t("100.5", "4", "buy"), t("101.0", "6", "sell")];

const rows = (fp: ReturnType<typeof buildFootprint>) => fp.levels.map((l) => [l.level, l.c, l.v]);

describe("V-FOOT-1: volume by level from the aggressor side", () => {
  test("binTicks 1: levels 200, 201, 202 and a delta of -2", () => {
    const fp = buildFootprint(SPOT, 1, V_FOOT_1);
    expect(rows(fp)).toEqual([[200, 2, 3], [201, 5, 0], [202, 0, 6]]);
    expect(fp.totals).toEqual({ c: 7, v: 9, delta: -2 });
    expect(fp.levels.map((l) => l.priceLow)).toEqual(["100", "100.5", "101"]);
  });

  test("binTicks 2 merges neighbours into 1.0 wide levels", () => {
    const fp = buildFootprint(SPOT, 2, V_FOOT_1);
    expect(rows(fp)).toEqual([[100, 7, 3], [101, 0, 6]]);
    expect(fp.totals).toEqual({ c: 7, v: 9, delta: -2 });
    expect(fp.levels.map((l) => l.priceLow)).toEqual(["100", "101"]);
  });

  test("levels are ascending whatever the arrival order, and the sums do not depend on it", () => {
    const reversed = buildFootprint(SPOT, 1, [...V_FOOT_1].reverse());
    expect(rows(reversed)).toEqual([[200, 2, 3], [201, 5, 0], [202, 0, 6]]);
  });

  test("the footprint reports its instrument, bin and unit so it can never be mixed with another by accident", () => {
    const fp = buildFootprint(SPOT, 2, V_FOOT_1);
    expect(fp).toMatchObject({ instId: "TEST-USDT", instType: "SPOT", binTicks: 2, tickSz: "0.5", unit: "1", trades: 5, rejected: 0 });
  });
});

describe("V-PERP-1: contracts become base currency before anything is summed (FLX-11)", () => {
  test("the unit of a perpetual is lotSz * ctVal * ctMult in base currency; spot is lotSz", () => {
    expect(unitOf(BTC_SWAP)).toEqual({ ok: true, unit: "0.0001" });
    expect(unitOf(SPOT)).toEqual({ ok: true, unit: "1" });
  });

  test("5 contracts bought and 3 sold at one price are 500 and 300 units of 0.0001 BTC, delta +200 (0.02 BTC)", () => {
    const fp = buildFootprint(BTC_SWAP, 1, [t("100.0", "5", "buy"), t("100.0", "3", "sell")]);
    expect(rows(fp)).toEqual([[1000, 500, 300]]);
    expect(fp.totals).toEqual({ c: 500, v: 300, delta: 200 });
    expect(fp.unit).toBe("0.0001");
    expect(fp.instType).toBe("SWAP");
  });

  test("the same quantity gives the same units on spot and on a perpetual once the contracts are converted", () => {
    const spotLike: InstrumentMeta = { instId: "BTC-USDT", instType: "SPOT", tickSz: "0.1", lotSz: "0.0001" };
    // 0.05 BTC bought on spot is the same quantity as 5 contracts of 0.01 BTC
    const spot = buildFootprint(spotLike, 1, [t("100.0", "0.05", "buy")]);
    const swap = buildFootprint(BTC_SWAP, 1, [t("100.0", "5", "buy")]);
    expect(spot.levels[0]!.c).toBe(swap.levels[0]!.c);
    expect(spot.unit).toBe(swap.unit);
  });

  test("a contract instrument without ctVal or ctMult cannot be built: no silent default", () => {
    expect(() => createFootprint({ instId: "X-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "1" }, 1)).toThrow(/ctVal|ctMult/);
    expect(() => createFootprint({ instId: "X-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "1", ctVal: "0.01" }, 1)).toThrow(/ctMult/);
  });
});

describe("rejections are counted, never absorbed", () => {
  test("a size that is not a whole number of lots, a bad decimal and a zero price are rejected and the rest still counts", () => {
    const fp = buildFootprint(SPOT, 1, [t("100.0", "1.5", "buy"), t("abc", "1", "buy"), t("0", "1", "sell"), t("100.0", "2", "sell"), t("100.0", "0", "buy")]);
    expect(rows(fp)).toEqual([[200, 0, 2]]);
    expect(fp).toMatchObject({ trades: 1, rejected: 4 });
  });

  test("an unknown side is rejected", () => {
    const fp = buildFootprint(SPOT, 1, [{ ts: 0, px: "100", sz: "1", side: "hold" as never }]);
    expect(fp).toMatchObject({ trades: 0, rejected: 1 });
    expect(fp.levels).toEqual([]);
  });

  test("binTicks must be a positive whole number", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => createFootprint(SPOT, bad)).toThrow();
  });

  test("a bad tickSz or lotSz in the instrument is an error at construction", () => {
    expect(() => createFootprint({ ...SPOT, tickSz: "0" }, 1)).toThrow();
    expect(() => createFootprint({ ...SPOT, lotSz: "abc" }, 1)).toThrow();
    expect(unitOf({ ...SPOT, lotSz: "-1" }).ok).toBe(false);
  });
});

describe("the builder accumulates trade by trade", () => {
  test("add() says whether the trade was kept and build() can be called at any time", () => {
    const b = createFootprint(SPOT, 1);
    expect(b.add(t("100.0", "2", "buy"))).toBe(true);
    expect(b.add(t("100.0", "1.5", "buy"))).toBe(false);
    expect(b.build().totals).toEqual({ c: 2, v: 0, delta: 2 });
    b.add(t("100.0", "3", "sell"));
    expect(b.build().totals).toEqual({ c: 2, v: 3, delta: -1 });
  });
});

describe("candles and the automatic bin (V-BIN-1)", () => {
  test("a candle is the UTC window aligned to its interval", () => {
    expect(candleStart(1_800_000_123_456, CANDLE_INTERVALS_MS["1m"])).toBe(1_800_000_120_000);
    expect(candleStart(1_800_000_000_000, CANDLE_INTERVALS_MS["1m"])).toBe(1_800_000_000_000);
    expect(candleStart(1_800_000_000_000 + 59_999, CANDLE_INTERVALS_MS["1m"])).toBe(1_800_000_000_000);
    expect(CANDLE_INTERVALS_MS).toEqual({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "1H": 3_600_000, "4H": 14_400_000, "1D": 86_400_000 });
  });

  test("binTicks = max(1, ceil(median amplitude in ticks / 30)): 90 ticks give 3, 25 ticks give 1", () => {
    const candles = (amplitudes: number[], tick: string) => amplitudes.map((a) => ({ high: String(a * Number(tick)), low: "0" }));
    expect(autoBinTicks(candles(Array.from({ length: 20 }, () => 90), "1"), "1")).toBe(3);
    expect(autoBinTicks(candles(Array.from({ length: 20 }, () => 25), "1"), "1")).toBe(1);
    expect(autoBinTicks([], "1")).toBe(1);
  });

  test("the median is the lower middle value of the sorted amplitudes, and only the last 20 candles count", () => {
    const amps = [1000, 1000, 1000, ...Array.from({ length: 20 }, (_, i) => 10 + i)]; // 3 old huge candles then 20 small: the huge ones fall out
    const candles = amps.map((a) => ({ high: String(a), low: "0" }));
    // last 20: 10..29, median (lower middle of 20 values) = 19 -> ceil(19/30) = 1
    expect(autoBinTicks(candles, "1")).toBe(1);
    const wide = amps.map((a) => ({ high: String(a * 10), low: "0" }));
    // last 20: 100..290 -> lower middle = 190 -> ceil(190/30) = 7
    expect(autoBinTicks(wide, "1")).toBe(7);
  });

  test("amplitude is measured in ticks with exact decimals", () => {
    expect(autoBinTicks(Array.from({ length: 20 }, () => ({ high: "163.0", low: "100.0" })), "0.1")).toBe(21); // 630 ticks -> ceil(630/30) = 21
  });
});
