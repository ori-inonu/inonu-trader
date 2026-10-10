import { expect, test } from "bun:test";
import { costPpmFromDecimal, feeCostPpmFromOkxApiRate, feeMicro } from "./fees.ts";
import { parseDecimal, rat, ratInt } from "./decimal.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

test("OKX-DERIV D4: a fee is rate in ppm times notional, rounded up to the next micro unit", () => {
  // 700 ppm of 40005 quote is exactly 28.0035
  expect(feeMicro(700n, ratInt(40005))).toBe(28_003_500n);
  expect(feeMicro(0n, ratInt(40005))).toBe(0n);
  // 400 ppm of 1/3 quote is 133.33... micro units of quote: costs never round down
  expect(feeMicro(400n, rat(1n, 3n))).toBe(134n);
  expect(feeMicro(1n, dec("0.0000004"))).toBe(1n);
});

test("OKX-DERIV D4: a maker rebate (negative cost) is rounded toward zero so the rebate shrinks", () => {
  expect(feeMicro(-20n, ratInt(1500))).toBe(-30_000n);
  // exact value -6.666... micro; the credited rebate is only 6 micro
  expect(feeMicro(-20n, rat(1n, 3n))).toBe(-6n);
});

test("OKX-DERIV D4: converting a decimal cost fraction to ppm rounds up", () => {
  expect(costPpmFromDecimal("0.0007")).toBe(700n);
  expect(costPpmFromDecimal("0.0000001")).toBe(1n);
  expect(costPpmFromDecimal("0")).toBe(0n);
  expect(costPpmFromDecimal("-0.00002")).toBe(-20n);
  // a rebate of 0.5 ppm is credited as 0
  expect(costPpmFromDecimal("-0.0000005")).toBe(0n);
  for (const bad of ["", "abc", "1e-3", "0.1 ", "1.5", "-1.5", "+0.1", null, 0.001]) {
    expect(costPpmFromDecimal(bad as unknown as string)).toBeNull();
  }
});

test("OKX-DERIV D4: OKX API fee rates use the opposite sign, so they are converted explicitly", () => {
  // The OKX docs: a negative number is a commission and a positive number is a rebate.
  expect(feeCostPpmFromOkxApiRate("-0.0005")).toBe(500n);
  expect(feeCostPpmFromOkxApiRate("0.00002")).toBe(-20n);
  expect(feeCostPpmFromOkxApiRate("0")).toBe(0n);
  expect(feeCostPpmFromOkxApiRate("-0.0000005")).toBe(1n);
  expect(feeCostPpmFromOkxApiRate("0.0000005")).toBe(0n);
  for (const bad of ["", "x", "-1.5", "1.5", "1e-4", null]) {
    expect(feeCostPpmFromOkxApiRate(bad as unknown as string)).toBeNull();
  }
});
