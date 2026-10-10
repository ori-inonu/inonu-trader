import { expect, test } from "bun:test";
import {
  add, ceilInt, cmp, div, floorInt, formatMicro, formatRat, formatScaled, isZero, max, min, mul, neg,
  parseDecimal, ppmOf, rat, ratFromMicro, ratFromPpm, ratInt, safeNumber, scaled, sign, sub, toMicro,
} from "./decimal.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

test("OKX-DERIV D1: rationals are normalized and exact", () => {
  expect(rat(2n, -4n)).toEqual({ n: -1n, d: 2n });
  expect(rat(0n, 7n)).toEqual({ n: 0n, d: 1n });
  expect(add(rat(1n, 3n), rat(1n, 6n))).toEqual(rat(1n, 2n));
  expect(sub(rat(1n, 10n), rat(3n, 10n))).toEqual(rat(-1n, 5n));
  expect(mul(rat(3n, 4n), rat(8n, 3n))).toEqual(ratInt(2));
  expect(div(rat(1n), rat(3n))).toEqual(rat(1n, 3n));
  expect(neg(rat(5n, 2n))).toEqual(rat(-5n, 2n));
  expect(() => rat(1n, 0n)).toThrow();
  expect(() => div(rat(1n), rat(0n))).toThrow();
  // binary floating point fails this identity; exact rationals must not
  expect(add(dec("0.1"), dec("0.2"))).toEqual(dec("0.3"));
  expect(0.1 + 0.2).not.toBe(0.3);
});

test("OKX-DERIV D1: comparison helpers agree with the exact order", () => {
  expect(cmp(rat(1n, 3n), rat(2n, 6n))).toBe(0);
  expect(cmp(rat(1n, 3n), rat(1n, 2n))).toBe(-1);
  expect(cmp(rat(-1n, 3n), rat(-1n, 2n))).toBe(1);
  expect(min(rat(1n, 3n), rat(1n, 2n))).toEqual(rat(1n, 3n));
  expect(max(rat(1n, 3n), rat(1n, 2n))).toEqual(rat(1n, 2n));
  expect(sign(rat(-1n, 9n))).toBe(-1);
  expect(sign(rat(0n))).toBe(0);
  expect(sign(rat(9n))).toBe(1);
  expect(isZero(rat(0n, 5n))).toBe(true);
  expect(isZero(rat(1n, 99999999999999999999n))).toBe(false);
});

test("OKX-DERIV D1: floor goes toward minus infinity and ceil toward plus infinity, including negatives", () => {
  expect(floorInt(rat(7n, 2n))).toBe(3n);
  expect(ceilInt(rat(7n, 2n))).toBe(4n);
  expect(floorInt(rat(-7n, 2n))).toBe(-4n);
  expect(ceilInt(rat(-7n, 2n))).toBe(-3n);
  expect(floorInt(rat(-4n, 2n))).toBe(-2n);
  expect(ceilInt(rat(-4n, 2n))).toBe(-2n);
  expect(floorInt(rat(0n))).toBe(0n);
  expect(ceilInt(rat(0n))).toBe(0n);
});

test("OKX-DERIV D1: micro and ppm conversion round against the trader in both directions", () => {
  expect(toMicro(rat(1n, 3n), "floor")).toBe(333333n);
  expect(toMicro(rat(1n, 3n), "ceil")).toBe(333334n);
  expect(toMicro(rat(-1n, 3n), "floor")).toBe(-333334n);
  expect(toMicro(rat(-1n, 3n), "ceil")).toBe(-333333n);
  expect(toMicro(dec("62.21"), "floor")).toBe(62210000n);
  expect(toMicro(dec("62.21"), "ceil")).toBe(62210000n);
  expect(ppmOf(rat(1n, 3n), "floor")).toBe(333333n);
  expect(ppmOf(rat(1n, 3n), "ceil")).toBe(333334n);
  expect(ppmOf(rat(-1n, 3n), "floor")).toBe(-333334n);
  expect(scaled(rat(1n, 8n), 100n, "floor")).toBe(12n);
  expect(scaled(rat(1n, 8n), 100n, "ceil")).toBe(13n);
  expect(ratFromPpm(1500n)).toEqual(rat(3n, 2000n));
  expect(ratFromPpm(-20)).toEqual(rat(-1n, 50000n));
  expect(ratFromMicro(62210000n)).toEqual(dec("62.21"));
});

test("OKX-DERIV D1: decimal grammar is strict and canonical", () => {
  for (const good of ["0", "1", "0.5", "0.000001", "62.21", "40044", "-1.5", "-0.25", "100.0000", "0.10", "123456789012345678901234567890", "1.123456789012345678"]) {
    expect(parseDecimal(good)).not.toBeNull();
  }
  for (const bad of ["", " 1", "1 ", "+1", "1e3", "1E3", "1.", ".5", "01", "00.5", "-", "-0", "-0.0", "1_0", "0x10", "NaN", "Infinity", "1,5", "1.1234567890123456789", "1".repeat(41), "--1", "1-", "١٢٣", "1\n", "\t1"]) {
    expect(parseDecimal(bad)).toBeNull();
  }
  for (const notText of [1, 1.5, null, undefined, {}, [], true, 10n]) {
    expect(parseDecimal(notText as unknown)).toBeNull();
  }
  expect(parseDecimal("0.5")).toEqual(rat(1n, 2n));
  expect(parseDecimal("-1.25")).toEqual(rat(-5n, 4n));
  expect(parseDecimal("100.0000")).toEqual(rat(100n));
});

test("OKX-DERIV D1: formatting is exact and fixed or trimmed as documented", () => {
  expect(formatMicro(0n)).toBe("0.000000");
  expect(formatMicro(1n)).toBe("0.000001");
  expect(formatMicro(-1n)).toBe("-0.000001");
  expect(formatMicro(62210000n)).toBe("62.210000");
  expect(formatMicro(-250360800n)).toBe("-250.360800");
  expect(formatMicro(123456789012345678n)).toBe("123456789012.345678");
  expect(formatScaled(12345n, 2, true)).toBe("123.45");
  expect(formatScaled(12300n, 2, true)).toBe("123");
  expect(formatScaled(12300n, 2, false)).toBe("123.00");
  expect(formatScaled(-5n, 3, true)).toBe("-0.005");
  expect(formatRat(rat(1n, 3n), 4, "floor")).toBe("0.3333");
  expect(formatRat(rat(1n, 3n), 4, "ceil")).toBe("0.3334");
  expect(formatRat(rat(-1n, 3n), 4, "floor")).toBe("-0.3334");
  expect(formatRat(dec("1000.125"), 10, "floor")).toBe("1000.125");
  expect(formatRat(rat(0n), 10, "floor")).toBe("0");
});

test("OKX-DERIV D1: converting a bigint to a JSON number refuses unsafe magnitudes", () => {
  expect(safeNumber(0n)).toBe(0);
  expect(safeNumber(-1553n)).toBe(-1553);
  expect(safeNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => safeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
  expect(() => safeNumber(-BigInt(Number.MAX_SAFE_INTEGER) - 1n)).toThrow(RangeError);
});
