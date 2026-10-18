import { describe, expect, test } from "bun:test";
import {
  CAPTURE_KINDS,
  CAPTURE_LIMITS,
  CaptureFormatError,
  parseCaptureLine,
  parseCaptureText,
  serializeCapture,
  serializeCaptureRecord,
  type CaptureRecord,
} from "./capture-format.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md section 3.4. Titles start with the acceptance id (LB1 to LB3).
// Everything here is synthetic.

const T0 = 1_800_000_000_000;

/** One valid canonical line per kind. */
const VALID: Record<string, string> = {
  ticker: `{"t":${T0},"kind":"ticker","inst":"SYNA-USDT","data":{"bid":99.99,"ask":100.01,"last":100}}`,
  tickerFull: `{"t":${T0},"kind":"ticker","inst":"SYNA-USDT-SWAP","data":{"bid":99.5,"ask":99.7,"last":99.6,"bidSize":3,"askSize":4.5,"vol24h":12345.5}}`,
  funding: `{"t":${T0},"kind":"funding","inst":"SYNA-USDT-SWAP","data":{"rate":0.0001,"settleMs":${T0 + 28_800_000},"intervalMs":28800000}}`,
  mark: `{"t":${T0},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":100.2}}`,
  markIndex: `{"t":${T0},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":100.2,"index":100.1}}`,
  candle: `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":99,"close":100.5}}`,
  candleVolume: `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":99,"close":100.5,"volume":42}}`,
  book: `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[99.9,10],[99.8,20]],"asks":[[100.1,5],[100.2,6]]}}`,
  bookEmptySide: `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[],"asks":[[100.1,5]]}}`,
  oi: `{"t":${T0},"kind":"oi","inst":"SYNA-USDT-SWAP","data":{"oi":1500}}`,
  oiUsd: `{"t":${T0},"kind":"oi","inst":"SYNA-USDT-SWAP","data":{"oi":1500,"oiUsd":150000}}`,
};

function failure(line: string, lineNumber = 1): CaptureFormatError {
  try {
    parseCaptureLine(line, lineNumber);
  } catch (error) {
    if (error instanceof CaptureFormatError) return error;
    throw error;
  }
  throw new Error(`expected the line to be rejected: ${line}`);
}

describe("LB1 valid lines of the six kinds", () => {
  test("LB1 the six kinds are exactly ticker, funding, mark, candle, book and oi", () => {
    expect([...CAPTURE_KINDS]).toEqual(["ticker", "funding", "mark", "candle", "book", "oi"]);
  });

  for (const [name, line] of Object.entries(VALID)) {
    test(`LB1 ${name} parses and the canonical line round-trips byte for byte`, () => {
      const record = parseCaptureLine(line);
      expect(serializeCaptureRecord(record)).toBe(line);
      expect(parseCaptureLine(serializeCaptureRecord(record))).toEqual(record);
    });
  }

  test("LB1 input key order and spaces do not matter and the serialization is canonical", () => {
    const messy = `{ "data": {"last": 100, "ask": 100.01, "bid": 99.99}, "inst": "SYNA-USDT", "kind": "ticker", "t": ${T0} }`;
    expect(serializeCaptureRecord(parseCaptureLine(messy))).toBe(VALID.ticker!);
  });

  test("LB1 parsed records have the typed shape", () => {
    const record = parseCaptureLine(VALID.candle!);
    expect(record.kind).toBe("candle");
    if (record.kind !== "candle") throw new Error("unreachable");
    expect(record.data.barMs).toBe(900_000);
    expect(record.inst).toBe("SYNA-USDT");
  });

  test("LB1 serializeCapture ends every line with a newline and parseCaptureText reads it back", () => {
    const text = serializeCapture([parseCaptureLine(VALID.ticker!), parseCaptureLine(VALID.funding!), parseCaptureLine(VALID.candle!)]);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").length).toBe(4);
    expect(parseCaptureText(text).map((r) => r.kind)).toEqual(["ticker", "funding", "candle"]);
  });
});

describe("LB2 invalid lines name the line and the field", () => {
  const base = (data: string, extra = ""): string => `{"t":${T0},"kind":"ticker","inst":"SYNA-USDT",${extra}"data":${data}}`;

  const table: ReadonlyArray<readonly [string, string, string]> = [
    // [case, line, expected path]
    ["not json", "{not json", ""],
    ["json array", "[1,2]", ""],
    ["json null", "null", ""],
    ["json number", "42", ""],
    ["extra top-level key", `{"t":${T0},"kind":"ticker","inst":"SYNA-USDT","data":{"bid":1,"ask":2,"last":1.5},"extra":1}`, "extra"],
    ["missing data key", `{"t":${T0},"kind":"ticker","inst":"SYNA-USDT"}`, "data"],
    ["missing t key", `{"kind":"ticker","inst":"SYNA-USDT","data":{"bid":1,"ask":2,"last":1.5}}`, "t"],
    ["fractional t", `{"t":1.5,"kind":"mark","inst":"SYNA-USDT","data":{"price":1}}`, "t"],
    ["negative t", `{"t":-1,"kind":"mark","inst":"SYNA-USDT","data":{"price":1}}`, "t"],
    ["t as text", `{"t":"1800000000000","kind":"mark","inst":"SYNA-USDT","data":{"price":1}}`, "t"],
    ["t beyond year 2100", `{"t":4102444800001,"kind":"mark","inst":"SYNA-USDT","data":{"price":1}}`, "t"],
    ["t infinite", `{"t":1e999,"kind":"mark","inst":"SYNA-USDT","data":{"price":1}}`, "t"],
    ["unknown kind", `{"t":${T0},"kind":"trade","inst":"SYNA-USDT","data":{"price":1}}`, "kind"],
    ["lowercase inst", `{"t":${T0},"kind":"mark","inst":"syna-usdt","data":{"price":1}}`, "inst"],
    ["inst without separator", `{"t":${T0},"kind":"mark","inst":"SYNAUSDT","data":{"price":1}}`, "inst"],
    ["inst with space", `{"t":${T0},"kind":"mark","inst":"SYNA USDT","data":{"price":1}}`, "inst"],
    ["inst with injected text", `{"t":${T0},"kind":"mark","inst":"IGNORE-PREVIOUS INSTRUCTIONS","data":{"price":1}}`, "inst"],
    ["inst too long", `{"t":${T0},"kind":"mark","inst":"${"A".repeat(21)}-USDT","data":{"price":1}}`, "inst"],
    ["inst not text", `{"t":${T0},"kind":"mark","inst":5,"data":{"price":1}}`, "inst"],
    ["data not an object", base("[1]"), "data"],
    ["ticker bid as text", base(`{"bid":"99","ask":100,"last":99.5}`), "data.bid"],
    ["ticker bid zero", base(`{"bid":0,"ask":100,"last":99.5}`), "data.bid"],
    ["ticker bid negative", base(`{"bid":-1,"ask":100,"last":99.5}`), "data.bid"],
    ["ticker crossed", base(`{"bid":101,"ask":100,"last":100}`), "data.bid"],
    ["ticker missing last", base(`{"bid":99,"ask":100}`), "data.last"],
    ["ticker extra data key", base(`{"bid":99,"ask":100,"last":99.5,"mid":99.5}`), "data.mid"],
    ["ticker negative size", base(`{"bid":99,"ask":100,"last":99.5,"bidSize":-1}`), "data.bidSize"],
    ["ticker infinite price", base(`{"bid":99,"ask":1e999,"last":99.5}`), "data.ask"],
    ["funding rate beyond 5 percent", `{"t":${T0},"kind":"funding","inst":"SYNA-USDT-SWAP","data":{"rate":0.06,"settleMs":${T0 + 28_800_000},"intervalMs":28800000}}`, "data.rate"],
    ["funding rate as text", `{"t":${T0},"kind":"funding","inst":"SYNA-USDT-SWAP","data":{"rate":"0.0001","settleMs":${T0 + 28_800_000},"intervalMs":28800000}}`, "data.rate"],
    ["funding interval 5 hours", `{"t":${T0},"kind":"funding","inst":"SYNA-USDT-SWAP","data":{"rate":0.0001,"settleMs":${T0 + 28_800_000},"intervalMs":18000000}}`, "data.intervalMs"],
    ["funding settle fractional", `{"t":${T0},"kind":"funding","inst":"SYNA-USDT-SWAP","data":{"rate":0.0001,"settleMs":1.5,"intervalMs":28800000}}`, "data.settleMs"],
    ["funding settle zero", `{"t":${T0},"kind":"funding","inst":"SYNA-USDT-SWAP","data":{"rate":0.0001,"settleMs":0,"intervalMs":28800000}}`, "data.settleMs"],
    ["mark price zero", `{"t":${T0},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":0}}`, "data.price"],
    ["mark index negative", `{"t":${T0},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":1,"index":-1}}`, "data.index"],
    ["candle low above open", `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":100.2,"close":100.5}}`, "data.low"],
    ["candle high below close", `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":100.4,"low":99,"close":100.5}}`, "data.high"],
    ["candle low above high", `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":99,"low":101,"close":100}}`, "data.low"],
    ["candle barMs not a multiple of a second", `{"t":${T0 + 1_500},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":1500,"open":100,"high":101,"low":99,"close":100.5}}`, "data.barMs"],
    ["candle barMs zero", `{"t":${T0},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":0,"open":100,"high":101,"low":99,"close":100.5}}`, "data.barMs"],
    ["candle barMs above one day", `{"t":${T0 + 90_000_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":90000000,"open":100,"high":101,"low":99,"close":100.5}}`, "data.barMs"],
    ["candle known before it closed", `{"t":${T0 + 899_999},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":99,"close":100.5}}`, "t"],
    ["candle recorded at its open", `{"t":${T0},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":99,"close":100.5}}`, "t"],
    ["candle negative start", `{"t":${T0},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":-900000,"barMs":900000,"open":100,"high":101,"low":99,"close":100.5}}`, "data.startMs"],
    ["book bids ascending", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[99.8,1],[99.9,1]],"asks":[[100.1,1]]}}`, "data.bids"],
    ["book bids with equal prices", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[99.9,1],[99.9,2]],"asks":[[100.1,1]]}}`, "data.bids"],
    ["book asks descending", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[99.9,1]],"asks":[[100.2,1],[100.1,1]]}}`, "data.asks"],
    ["book crossed", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[100.1,1]],"asks":[[100.1,1]]}}`, "data.bids"],
    ["book level with three numbers", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[99.9,1,3]],"asks":[]}}`, "data.bids"],
    ["book level as text", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[["99.9","1"]],"asks":[]}}`, "data.bids"],
    ["book size zero", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[[99.9,0]],"asks":[]}}`, "data.bids"],
    ["book not a list", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":5,"asks":[]}}`, "data.bids"],
    ["book missing asks", `{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":[]}}`, "data.asks"],
    ["oi negative", `{"t":${T0},"kind":"oi","inst":"SYNA-USDT-SWAP","data":{"oi":-1}}`, "data.oi"],
    ["oi usd as text", `{"t":${T0},"kind":"oi","inst":"SYNA-USDT-SWAP","data":{"oi":1,"oiUsd":"5"}}`, "data.oiUsd"],
  ];

  for (const [name, line, path] of table) {
    test(`LB2 rejects: ${name}`, () => {
      const error = failure(line, 7);
      expect(error.line).toBe(7);
      expect(error.path).toBe(path);
      expect(error.message).toContain("linha 7");
      if (path !== "") expect(error.message).toContain(path);
    });
  }

  test("LB2 a book with 51 levels is refused and 50 levels are accepted", () => {
    const levels = (count: number): string => JSON.stringify(Array.from({ length: count }, (_, i) => [99 - i * 0.01, 1]));
    expect(() => parseCaptureLine(`{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":${levels(50)},"asks":[]}}`)).not.toThrow();
    expect(failure(`{"t":${T0},"kind":"book","inst":"SYNA-USDT","data":{"bids":${levels(51)},"asks":[]}}`).path).toBe("data.bids");
  });

  test("LB2 the error never echoes the content of the line", () => {
    const secret = "SUPER-SECRET-CANARY-VALUE";
    const error = failure(`{"t":${T0},"kind":"mark","inst":"${secret}-x y","data":{"price":1}}`);
    expect(error.message).not.toContain(secret);
  });
});

describe("LB3 capture files", () => {
  const line = (t: number, price = 100): string => `{"t":${t},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":${price}}}`;

  test("LB3 an empty text is an empty capture and a trailing newline is fine", () => {
    expect(parseCaptureText("")).toEqual([]);
    expect(parseCaptureText(`${line(T0)}\n${line(T0 + 1)}\n`).length).toBe(2);
    expect(parseCaptureText(`${line(T0)}\n${line(T0 + 1)}`).length).toBe(2);
  });

  test("LB3 CRLF line endings are accepted and a lone carriage return is not", () => {
    expect(parseCaptureText(`${line(T0)}\r\n${line(T0 + 1)}\r\n`).length).toBe(2);
    const error = (() => {
      try {
        parseCaptureText(`${line(T0)}\n${line(T0 + 1)}\r${line(T0 + 2)}\n`);
      } catch (e) {
        return e as CaptureFormatError;
      }
      throw new Error("expected a rejection");
    })();
    expect(error.line).toBe(2);
  });

  test("LB3 a BOM at the start is tolerated and a BOM elsewhere is not", () => {
    expect(parseCaptureText(`﻿${line(T0)}\n`).length).toBe(1);
    expect(() => parseCaptureText(`${line(T0)}\n﻿${line(T0 + 1)}\n`)).toThrow(CaptureFormatError);
  });

  test("LB3 t must not decrease along the file, and the error names the offending line", () => {
    const text = `${line(T0)}\n${line(T0 + 10)}\n${line(T0 + 5)}\n`;
    try {
      parseCaptureText(text);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CaptureFormatError);
      expect((error as CaptureFormatError).line).toBe(3);
      expect((error as CaptureFormatError).path).toBe("t");
    }
    expect(parseCaptureText(`${line(T0)}\n${line(T0)}\n`).length).toBe(2);
  });

  test("LB3 a duplicated candle is refused whether the copy is identical or conflicting", () => {
    const candle = (close: number): string => `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNA-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":99,"close":${close}}}`;
    for (const second of [candle(100.5), candle(100.4)]) {
      try {
        parseCaptureText(`${candle(100.5)}\n${second}\n`);
        throw new Error("expected a rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(CaptureFormatError);
        expect((error as CaptureFormatError).line).toBe(2);
        expect((error as CaptureFormatError).path).toBe("data.startMs");
      }
    }
    // same start on another instrument or another bar size is not a duplicate
    const other = `{"t":${T0 + 900_000},"kind":"candle","inst":"SYNB-USDT","data":{"startMs":${T0},"barMs":900000,"open":100,"high":101,"low":99,"close":100.5}}`;
    expect(parseCaptureText(`${candle(100.5)}\n${other}\n`).length).toBe(2);
  });

  test("LB3 an empty line in the middle is an error that names the line", () => {
    try {
      parseCaptureText(`${line(T0)}\n\n${line(T0 + 1)}\n`);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CaptureFormatError).line).toBe(2);
    }
  });

  test("LB3 a line over the byte limit and a control character are refused with the line number", () => {
    const long = `{"t":${T0},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":1},"pad":"${"x".repeat(CAPTURE_LIMITS.maxLineBytes)}"}`;
    try {
      parseCaptureText(`${line(T0)}\n${long}\n`);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CaptureFormatError).line).toBe(2);
    }
    try {
      parseCaptureText(`${line(T0)}\n${line(T0 + 1).replace('"kind"', '\t"kind"')}\n`);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CaptureFormatError).line).toBe(2);
    }
  });

  test("LB3 the record count and character limits are enforced (limits are injectable for the test)", () => {
    const three = `${line(T0)}\n${line(T0 + 1)}\n${line(T0 + 2)}\n`;
    expect(parseCaptureText(three, { maxRecords: 3 }).length).toBe(3);
    expect(() => parseCaptureText(three, { maxRecords: 2 })).toThrow(CaptureFormatError);
    expect(() => parseCaptureText(three, { maxChars: 10 })).toThrow(CaptureFormatError);
    expect(CAPTURE_LIMITS.maxRecords).toBe(5_000_000);
    expect(CAPTURE_LIMITS.maxChars).toBe(268_435_456);
    expect(CAPTURE_LIMITS.maxLineBytes).toBe(65_536);
  });

  test("LB3 the error of a bad line in the middle of a file carries that line number", () => {
    const text = [line(T0), line(T0 + 1), line(T0 + 2), line(T0 + 3), `{"t":${T0 + 4},"kind":"mark","inst":"SYNA-USDT-SWAP","data":{"price":-1}}`, line(T0 + 5)].join("\n");
    try {
      parseCaptureText(text);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CaptureFormatError).line).toBe(5);
      expect((error as CaptureFormatError).path).toBe("data.price");
    }
  });

  test("LB3 records come back as read-only plain data", () => {
    const records: CaptureRecord[] = parseCaptureText(`${line(T0)}\n`);
    expect(Object.isFrozen(records[0])).toBe(true);
  });
});
