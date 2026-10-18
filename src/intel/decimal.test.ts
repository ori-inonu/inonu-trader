// T5.1 / ING, FLX-1, FLX-11: exact decimal arithmetic on the text prices and sizes the exchange sends. Volumes and levels
// are integers computed without floating point, so a footprint reproduces the hand calculation to the last unit.
import { describe, expect, test } from "bun:test";
import { addDec, cmpDec, decToString, divExactDec, floorDivDec, mulDec, parseDec, subDec, type Dec } from "./decimal";

const d = (text: string): Dec => {
  const parsed = parseDec(text);
  if (parsed === null) throw new Error(`not a decimal: ${text}`);
  return parsed;
};

describe("parseDec", () => {
  test("reads plain decimals with an optional sign and keeps the places", () => {
    expect(parseDec("100")).toEqual({ int: 100n, scale: 0 });
    expect(parseDec("100.50")).toEqual({ int: 10050n, scale: 2 });
    expect(parseDec("0.00000012")).toEqual({ int: 12n, scale: 8 });
    expect(parseDec("-3.5")).toEqual({ int: -35n, scale: 1 });
    expect(parseDec("007.10")).toEqual({ int: 710n, scale: 2 });
  });

  test("anything that is not a plain decimal is null, never a guess", () => {
    for (const bad of ["", " ", "1e5", "1,5", ".5", "5.", "--1", "1.2.3", "0x10", "NaN", "Infinity", "1 000", "1_0"]) expect(parseDec(bad)).toBeNull();
    expect(parseDec(undefined as never)).toBeNull();
    expect(parseDec(5 as never)).toBeNull();
  });
});

describe("arithmetic", () => {
  test("add aligns the places exactly (no 0.1 + 0.2 surprise)", () => {
    expect(decToString(addDec(d("0.1"), d("0.2")))).toBe("0.3");
    expect(decToString(addDec(d("100"), d("0.0001")))).toBe("100.0001");
    expect(decToString(addDec(d("-1.5"), d("1.5")))).toBe("0");
  });

  test("sub is exact and may go negative", () => {
    expect(decToString(subDec(d("163.0"), d("100.0")))).toBe("63");
    expect(decToString(subDec(d("0.3"), d("0.1")))).toBe("0.2");
    expect(decToString(subDec(d("1"), d("1.5")))).toBe("-0.5");
  });

  test("mul is exact", () => {
    expect(decToString(mulDec(d("0.01"), d("1")))).toBe("0.01");
    expect(decToString(mulDec(d("5"), d("0.01")))).toBe("0.05");
    expect(decToString(mulDec(d("3"), d("0.5")))).toBe("1.5");
  });

  test("compare ignores the number of trailing zeros", () => {
    expect(cmpDec(d("1.50"), d("1.5"))).toBe(0);
    expect(cmpDec(d("1.49"), d("1.5"))).toBe(-1);
    expect(cmpDec(d("2"), d("1.999999"))).toBe(1);
  });

  test("decToString trims the zeros and never uses an exponent", () => {
    expect(decToString(d("100.500"))).toBe("100.5");
    expect(decToString(d("100.000"))).toBe("100");
    expect(decToString(d("0.00000012"))).toBe("0.00000012");
    expect(decToString(d("-0.050"))).toBe("-0.05");
  });
});

describe("floorDivDec and divExactDec", () => {
  test("the price level of V-FOOT-1: price over tick, floored, in exact arithmetic", () => {
    expect(floorDivDec(d("100.0"), d("0.5"))).toBe(200n);
    expect(floorDivDec(d("100.5"), d("0.5"))).toBe(201n);
    expect(floorDivDec(d("101.0"), d("0.5"))).toBe(202n);
    // binTicks = 2 -> a step of 1.0
    expect(floorDivDec(d("100.0"), d("1.0"))).toBe(100n);
    expect(floorDivDec(d("100.5"), d("1.0"))).toBe(100n);
    expect(floorDivDec(d("101.0"), d("1.0"))).toBe(101n);
  });

  test("a tiny price over a tiny tick has no float rounding error", () => {
    // 0.3 / 0.1 is 2.9999999999999996 in floating point, 3 exactly here
    expect(floorDivDec(d("0.3"), d("0.1"))).toBe(3n);
    expect(floorDivDec(d("0.00000036"), d("0.00000012"))).toBe(3n);
  });

  test("the divisor must be positive", () => {
    expect(() => floorDivDec(d("1"), d("0"))).toThrow();
    expect(() => floorDivDec(d("1"), d("-1"))).toThrow();
  });

  test("divExact returns the integer quotient, or null when the size is not a whole number of units", () => {
    // V-PERP-1: 5 contracts * 0.01 BTC = 0.05 BTC, unit 0.0001 BTC -> 500
    expect(divExactDec(mulDec(d("5"), d("0.01")), mulDec(d("0.01"), d("0.01")))).toBe(500n);
    expect(divExactDec(mulDec(d("3"), d("0.01")), mulDec(d("0.01"), d("0.01")))).toBe(300n);
    expect(divExactDec(d("0.00015"), d("0.0001"))).toBeNull();
    expect(divExactDec(d("1"), d("0"))).toBeNull();
  });
});
