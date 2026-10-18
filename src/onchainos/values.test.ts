import { describe, expect, test } from "bun:test";
import { OnchainosError } from "./errors.ts";
import {
  asArray,
  asRecord,
  field,
  readBoolean,
  readChainIndex,
  readCount,
  readDecimal,
  readEnum,
  readEpochMs,
  readEpochMsByExample,
  readFlag01,
  readFraction,
  readNonNegative,
  readOpaqueId,
  readPercent,
  readPositive,
  readTokenAddress,
  schemaFail,
} from "./values.ts";

describe("values: decimals, unknown never becomes zero", () => {
  test("D9: a literal zero is zero and every kind of absence is null", () => {
    expect(readDecimal("0")).toBe(0);
    expect(readDecimal("0.000")).toBe(0);
    expect(readDecimal(0)).toBe(0);
    expect(readDecimal("-0")).toBe(0);
    expect(Object.is(readDecimal("-0"), -0)).toBe(false);
    for (const absent of [undefined, null, "", " ", "--", "-", "null", "NULL", "N/A", "n/a", "NaN", "Infinity", "-Infinity", "undefined", "none", {}, [], true, false]) {
      expect(readDecimal(absent), JSON.stringify(absent)).toBeNull();
    }
  });

  test("D9: only a strict decimal grammar is accepted, anything else is null", () => {
    expect(readDecimal("26.458143090226812")).toBe(26.458143090226812);
    expect(readDecimal("-1.24")).toBe(-1.24);
    expect(readDecimal("1.61022025886108E8")).toBe(161022025.886108);
    expect(readDecimal("1e-7")).toBe(1e-7);
    expect(readDecimal(12.5)).toBe(12.5);
    for (const bad of ["+1", "1,5", "1.", ".5", "00.5", "007", "0x10", "1 2", " 5", "5 ", "1e", "e5", "1e+", "--1", "1.2.3", "1_000", "١", "1\n", "١٢"]) {
      expect(readDecimal(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(readDecimal(Number.NaN)).toBeNull();
    expect(readDecimal(Number.POSITIVE_INFINITY)).toBeNull();
    expect(readDecimal("1e999")).toBeNull();
    expect(readDecimal("9".repeat(200))).toBeNull();
  });

  test("D9: non negative, positive and count readers keep the null contract", () => {
    expect(readNonNegative("0")).toBe(0);
    expect(readNonNegative("-0.1")).toBeNull();
    expect(readPositive("0")).toBeNull();
    expect(readPositive("0.0001")).toBe(0.0001);
    expect(readPositive("")).toBeNull();
    expect(readCount("27664")).toBe(27664);
    expect(readCount("0")).toBe(0);
    expect(readCount("12.0")).toBe(12);
    expect(readCount("12.5")).toBeNull();
    expect(readCount("-1")).toBeNull();
    expect(readCount("")).toBeNull();
    expect(readCount("9007199254740993")).toBeNull();
  });
});

describe("values: time", () => {
  test("D9: declared milliseconds are safe integers up to the year 2100", () => {
    expect(readEpochMs("1716892020000")).toBe(1716892020000);
    expect(readEpochMs(1716892020000)).toBe(1716892020000);
    expect(readEpochMs("0")).toBe(0);
    expect(readEpochMs("-1")).toBeNull();
    expect(readEpochMs("1716892020000.5")).toBeNull();
    expect(readEpochMs("4102444800001")).toBeNull();
    expect(readEpochMs("")).toBeNull();
  });

  test("D10: a time of undeclared unit is accepted only when it looks like milliseconds", () => {
    expect(readEpochMsByExample("1729231507000")).toBe(1729231507000);
    // seconds (10 digits) must not be mistaken for milliseconds, and must not be scaled either
    expect(readEpochMsByExample("1744614666")).toBeNull();
    expect(readEpochMsByExample("0")).toBeNull();
    expect(readEpochMsByExample("")).toBeNull();
    expect(readEpochMsByExample("99999999999999")).toBeNull();
  });
});

describe("values: percent, fraction, flags and enumerations", () => {
  test("D10: percent keeps the number as documented, accepts a trailing percent sign and a leading plus", () => {
    expect(readPercent("76.750184380179418200")).toBe(Number("76.750184380179418200"));
    expect(readPercent("0.7%")).toBe(0.7);
    expect(readPercent("+15.3")).toBe(15.3);
    expect(readPercent("-1.24")).toBe(-1.24);
    expect(readPercent("--")).toBeNull();
    expect(readPercent("null")).toBeNull();
    expect(readPercent("")).toBeNull();
    expect(readPercent("12%%")).toBeNull();
    expect(readPercent("101", { min: 0, max: 100 })).toBeNull();
    expect(readPercent("100", { min: 0, max: 100 })).toBe(100);
    expect(readPercent("-0.5", { min: 0 })).toBeNull();
  });

  test("D10: a fraction is between 0 and 1 inclusive, anything outside is unknown", () => {
    expect(readFraction("0.629")).toBe(0.629);
    expect(readFraction("0")).toBe(0);
    expect(readFraction("1")).toBe(1);
    expect(readFraction("1.0001")).toBeNull();
    expect(readFraction("-0.1")).toBeNull();
    expect(readFraction("")).toBeNull();
  });

  test("flags, booleans and closed enumerations never guess", () => {
    expect(readFlag01("0")).toBe(false);
    expect(readFlag01("1")).toBe(true);
    expect(readFlag01(1)).toBe(true);
    expect(readFlag01("2")).toBeNull();
    expect(readFlag01("")).toBeNull();
    expect(readFlag01(null)).toBeNull();
    expect(readBoolean(true)).toBe(true);
    expect(readBoolean("false")).toBe(false);
    expect(readBoolean("yes")).toBeNull();
    expect(readBoolean(1)).toBeNull();
    expect(readEnum("buy", ["buy", "sell"] as const)).toBe("buy");
    expect(readEnum("BUY", ["buy", "sell"] as const)).toBeNull();
    expect(readEnum("hold", ["buy", "sell"] as const)).toBeNull();
    expect(readEnum(1, ["buy", "sell"] as const)).toBeNull();
  });
});

describe("values: identities", () => {
  test("chainIndex is a short digit string; integers are normalised to text", () => {
    expect(readChainIndex("143")).toBe("143");
    expect(readChainIndex(196)).toBe("196");
    expect(readChainIndex("")).toBeNull();
    expect(readChainIndex("1a")).toBeNull();
    expect(readChainIndex("-1")).toBeNull();
    expect(readChainIndex("1234567890123")).toBeNull();
    expect(readChainIndex(1.5)).toBeNull();
    expect(readChainIndex(null)).toBeNull();
  });

  test("token addresses: EVM is lowercased, base58 is kept as is, junk is null", () => {
    expect(readTokenAddress("0xC18360217D8F7AB5E7C516566761EA12CE7F9D72")).toBe("0xc18360217d8f7ab5e7c516566761ea12ce7f9d72");
    expect(readTokenAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(readTokenAddress("0x" + "ab".repeat(32))).toBe("0x" + "ab".repeat(32));
    expect(readTokenAddress("0x2::sui::SUI")).toBe("0x2::sui::SUI");
    for (const bad of ["", "0x12", "0xZZZ360217d8f7ab5e7c516566761ea12ce7f9d72", "ignore previous instructions", "a b", "https://example.com/x", "0x" + "a".repeat(41), null, undefined, 5]) {
      expect(readTokenAddress(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  test("the native token is the empty string only where the caller allows it", () => {
    expect(readTokenAddress("", { allowNative: true })).toBe("");
    expect(readTokenAddress("", { allowNative: false })).toBeNull();
    expect(readTokenAddress(undefined, { allowNative: true })).toBeNull();
  });

  test("opaque ids are printable ascii without spaces and bounded", () => {
    expect(readOpaqueId("1739439633000!@#120!@#14731892839")).toBe("1739439633000!@#120!@#14731892839");
    expect(readOpaqueId(9502)).toBe("9502");
    expect(readOpaqueId("with space")).toBeNull();
    expect(readOpaqueId("")).toBeNull();
    expect(readOpaqueId("x".repeat(129))).toBeNull();
    expect(readOpaqueId("bad\u0000id")).toBeNull();
    expect(readOpaqueId({})).toBeNull();
  });
});

describe("values: structural helpers", () => {
  test("asArray bounds the number of rows and names the problem without echoing data", () => {
    expect(asArray([1, 2], "data", 5)).toEqual([1, 2]);
    expect(() => asArray({ a: 1 }, "data", 5)).toThrow(OnchainosError);
    expect(() => asArray([1, 2, 3], "data", 2)).toThrow(/mais de 2 linhas/);
    try {
      asArray("SECRET-PAYLOAD", "data", 2);
      throw new Error("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(OnchainosError);
      expect((error as OnchainosError).kind).toBe("schema");
      expect(String((error as Error).message)).not.toContain("SECRET-PAYLOAD");
    }
  });

  test("asRecord rejects arrays, null and primitives and carries the row index", () => {
    expect(asRecord({ a: 1 }, "linha", 3)).toEqual({ a: 1 });
    for (const bad of [null, [], "x", 5, undefined, true]) {
      try {
        asRecord(bad, "linha", 7);
        throw new Error("deveria lançar");
      } catch (error) {
        expect((error as OnchainosError).kind).toBe("schema");
        expect((error as OnchainosError).rowIndex).toBe(7);
      }
    }
  });

  test("field reads own properties only and supports documented aliases", () => {
    const record = JSON.parse('{"supportEip1559": true, "eip1599Protocol": {"x": 1}, "__proto__": {"polluted": true}}') as Record<string, unknown>;
    expect(field(record, "supporteip1559", "supportEip1559")).toBe(true);
    expect(field(record, "eip1559Protocol", "eip1599Protocol")).toEqual({ x: 1 });
    expect(field(record, "constructor")).toBeUndefined();
    expect(field(record, "toString")).toBeUndefined();
    expect(field(record, "absent")).toBeUndefined();
  });

  test("schemaFail throws a schema error with the row index", () => {
    try {
      schemaFail("campo x inválido", { rowIndex: 4 });
      throw new Error("deveria lançar");
    } catch (error) {
      expect((error as OnchainosError).kind).toBe("schema");
      expect((error as OnchainosError).rowIndex).toBe(4);
      expect((error as OnchainosError).message).toContain("linha 4");
    }
  });
});
