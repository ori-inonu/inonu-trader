import { describe, expect, test } from "bun:test";
import { candleRow, instrumentRow, tickerRow, tradeRow } from "./desk-test-kit";
import {
  barOfChannel,
  baseOf,
  candleChannel,
  indexInstIdFor,
  instTypeOf,
  parseCandleRow,
  parseCountText,
  parseFundingRow,
  parseIndexTickerRow,
  parseInstrumentRow,
  parseJsonInt,
  parseMarkPriceRow,
  parseMs,
  parseNonNegative,
  parseNum,
  parseOpenInterestRow,
  parsePositive,
  parseTicker,
  parseTradeRow,
  swapInstIdFor,
} from "./okx-parse";

describe("strict number parsing", () => {
  test("accepts plain and scientific decimal strings", () => {
    expect(parseNum("0.02713")).toBe(0.02713);
    expect(parseNum("-0.0000207225554811")).toBe(-0.0000207225554811);
    expect(parseNum("1e-7")).toBe(1e-7);
    expect(parseNum("12041267.5")).toBe(12041267.5);
    expect(parseNum("0")).toBe(0);
  });

  test("rejects everything that is not a finite decimal string, never coercing it to a number", () => {
    const garbage: unknown[] = ["", " ", " 1", "1 ", "NaN", "Infinity", "-Infinity", "0x10", "1_000", "1,5", ".5", "5.", "--1", "1e400", "abc", null, undefined, 1, true, {}, [], ["1"]];
    for (const value of garbage) expect(parseNum(value)).toBeNull();
  });

  test("positive and non negative variants", () => {
    expect(parsePositive("0")).toBeNull();
    expect(parsePositive("-1")).toBeNull();
    expect(parsePositive("2")).toBe(2);
    expect(parseNonNegative("0")).toBe(0);
    expect(parseNonNegative("-0.1")).toBeNull();
  });

  test("normalizes negative zero", () => {
    expect(Object.is(parseNum("-0"), 0)).toBe(true);
  });

  test("timestamps, counts and JSON integers", () => {
    expect(parseMs("1791738000000")).toBe(1791738000000);
    expect(parseMs("0")).toBeNull();
    expect(parseMs("")).toBeNull();
    expect(parseMs("12.5")).toBeNull();
    expect(parseMs("-5")).toBeNull();
    expect(parseMs(1791738000000)).toBeNull();
    expect(parseCountText("0")).toBe(0);
    expect(parseCountText("x")).toBeNull();
    expect(parseJsonInt(-1723793515)).toBe(-1723793515);
    expect(parseJsonInt(1.5)).toBeNull();
    expect(parseJsonInt("5")).toBeNull();
  });
});

describe("instrument helpers", () => {
  test("types, bases and the swap and index of a pair", () => {
    expect(instTypeOf("BTC-USDT")).toBe("SPOT");
    expect(instTypeOf("BTC-USDT-SWAP")).toBe("SWAP");
    expect(baseOf("MON-USDT")).toBe("MON");
    expect(swapInstIdFor("MON-USDT")).toBe("MON-USDT-SWAP");
    expect(swapInstIdFor("BTC-USDT-SWAP")).toBe("BTC-USDT-SWAP");
    expect(indexInstIdFor("OKB-USDT")).toBe("OKB-USDT");
  });

  test("candle channels round trip", () => {
    expect(candleChannel("1H")).toBe("candle1H");
    expect(barOfChannel("candle1m")).toBe("1m");
    expect(barOfChannel("candle1D")).toBe("1D");
    expect(barOfChannel("candle3m")).toBeNull();
    expect(barOfChannel("trades")).toBeNull();
  });
});

describe("ticker rows", () => {
  test("maps a spot ticker with its volumes", () => {
    const t = parseTicker(tickerRow("MON-USDT", "0.02704", 1791742105674, { vol24h: "139234709.4", volCcy24h: "3587089.675907" }));
    expect(t).not.toBeNull();
    expect(t?.last).toBe(0.02704);
    expect(t?.volBase24h).toBe(139234709.4);
    expect(t?.volQuote24h).toBe(3587089.675907);
    expect(t?.tsMs).toBe(1791742105674);
  });

  test("a swap ticker has no quote volume: volCcy24h is a base amount there", () => {
    const t = parseTicker(tickerRow("MON-USDT-SWAP", "0.02697", 1791742105674, { vol24h: "22565359", volCcy24h: "225653590" }));
    expect(t?.volBase24h).toBe(22565359);
    expect(t?.volQuote24h).toBeNull();
  });

  test("optional fields become null, required ones reject the row", () => {
    const t = parseTicker(tickerRow("X-USDT", "1", 5, { bidPx: "", askSz: "oops", open24h: "NaN" }));
    expect(t?.bidPx).toBeNull();
    expect(t?.askSz).toBeNull();
    expect(t?.open24h).toBeNull();
    expect(parseTicker(tickerRow("X-USDT", "", 5))).toBeNull();
    expect(parseTicker(tickerRow("X-USDT", "0", 5))).toBeNull();
    expect(parseTicker(tickerRow("X-USDT", "1", 0))).toBeNull();
    expect(parseTicker({ instId: "", last: "1", ts: "5" })).toBeNull();
    expect(parseTicker("not a row")).toBeNull();
    expect(parseTicker(null)).toBeNull();
  });
});

describe("trade rows", () => {
  test("parses a trade", () => {
    expect(parseTradeRow(tradeRow("BTC-USDT", "130639474", "42219.9", "0.12060306", "buy", 1630048897897))).toEqual({
      instId: "BTC-USDT",
      id: "130639474",
      px: 42219.9,
      sz: 0.12060306,
      side: "buy",
      tsMs: 1630048897897,
    });
  });

  test("rejects a bad side, size, price, id or timestamp", () => {
    const base = tradeRow("BTC-USDT", "1", "10", "1", "sell", 5);
    expect(parseTradeRow({ ...base, side: "BUY" })).toBeNull();
    expect(parseTradeRow({ ...base, side: undefined })).toBeNull();
    expect(parseTradeRow({ ...base, sz: "0" })).toBeNull();
    expect(parseTradeRow({ ...base, px: "x" })).toBeNull();
    expect(parseTradeRow({ ...base, tradeId: "" })).toBeNull();
    expect(parseTradeRow({ ...base, ts: "soon" })).toBeNull();
  });
});

describe("candle rows", () => {
  test("a spot bar takes vol as base and volCcyQuote as quote", () => {
    const c = parseCandleRow(["1791738000000", "0.02648", "0.02725", "0.02635", "0.02713", "12041267.5", "323561.741472", "323561.741472", "0"], "SPOT");
    expect(c).toEqual({ tsMs: 1791738000000, open: 0.02648, high: 0.02725, low: 0.02635, close: 0.02713, volBase: 12041267.5, volQuote: 323561.741472, confirmed: false });
  });

  test("a swap bar takes volCcy (base amount) as base because vol is contracts", () => {
    const c = parseCandleRow(["1791738000000", "1", "2", "1", "2", "5", "50", "100", "1"], "SWAP");
    expect(c?.volBase).toBe(50);
    expect(c?.volQuote).toBe(100);
    expect(c?.confirmed).toBe(true);
  });

  test("rejects wrong column counts, bad flags, bad numbers and impossible bars", () => {
    expect(parseCandleRow(["1", "1", "1", "1", "1", "1", "1", "1"], "SPOT")).toBeNull();
    expect(parseCandleRow(candleRow(5, 10).slice(0, 8), "SPOT")).toBeNull();
    const row = candleRow(1791738000000, 10);
    expect(parseCandleRow([...row.slice(0, 8), "2"], "SPOT")).toBeNull();
    expect(parseCandleRow([row[0], "abc", ...row.slice(2)], "SPOT")).toBeNull();
    expect(parseCandleRow([row[0], row[1], "5", "9", row[4], ...row.slice(5)], "SPOT")).toBeNull();
    expect(parseCandleRow([row[0], "20", "11", "9", "10", ...row.slice(5)], "SPOT")).toBeNull();
    expect(parseCandleRow("nope", "SPOT")).toBeNull();
  });
});

describe("instrument, funding, mark, open interest and index rows", () => {
  test("spot and swap instruments", () => {
    expect(parseInstrumentRow(instrumentRow("MON-USDT"))?.instrument).toEqual({ instId: "MON-USDT", instType: "SPOT", base: "MON", quote: "USDT", tickSz: "0.1", lotSz: "0.001" });
    const swap = parseInstrumentRow(instrumentRow("MON-USDT-SWAP"));
    expect(swap?.instrument.base).toBe("MON");
    expect(swap?.instrument.quote).toBe("USDT");
    expect(swap?.state).toBe("live");
    expect(parseInstrumentRow({ ...instrumentRow("MON-USDT"), tickSz: "0" })).toBeNull();
    expect(parseInstrumentRow({ ...instrumentRow("MON-USDT"), instType: "OPTION" })).toBeNull();
    expect(parseInstrumentRow({ ...instrumentRow("MON-USDT"), baseCcy: "" })).toBeNull();
  });

  test("funding keeps the next settlement and tolerates an unparsable rate as null", () => {
    expect(parseFundingRow({ instId: "MON-USDT-SWAP", fundingRate: "-0.0000259634121781", fundingTime: "1791748800000", nextFundingTime: "1791763200000", ts: "1791742098598" })).toEqual({
      instId: "MON-USDT-SWAP",
      fundingRate: -0.0000259634121781,
      nextFundingTimeMs: 1791748800000,
      tsMs: 1791742098598,
    });
    expect(parseFundingRow({ instId: "X-USDT-SWAP", fundingRate: "", fundingTime: "bad", ts: "" })?.fundingRate).toBeNull();
    expect(parseFundingRow({ fundingRate: "0.1" })).toBeNull();
  });

  test("mark price, open interest and index price", () => {
    expect(parseMarkPriceRow({ instId: "A-USDT-SWAP", markPx: "0.02697", ts: "5" })).toEqual({ instId: "A-USDT-SWAP", markPx: 0.02697, tsMs: 5 });
    expect(parseMarkPriceRow({ instId: "A-USDT-SWAP", markPx: "0", ts: "5" })?.markPx).toBeNull();
    expect(parseOpenInterestRow({ instId: "A-USDT-SWAP", oi: "24952463", oiCcy: "249524630", oiUsd: "6734669.7637", ts: "5" })).toEqual({ instId: "A-USDT-SWAP", openInterest: 24952463, openInterestUsd: 6734669.7637, tsMs: 5 });
    expect(parseIndexTickerRow({ instId: "BTC-USDT", idxPx: "83887.6", ts: "7" })).toEqual({ instId: "BTC-USDT", indexPx: 83887.6, tsMs: 7 });
    expect(parseIndexTickerRow({ instId: "BTC-USDT", idxPx: "x", ts: "7" })?.indexPx).toBeNull();
  });
});
