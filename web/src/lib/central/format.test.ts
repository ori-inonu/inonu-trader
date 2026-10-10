import { describe, expect, test } from "bun:test";
import { UNAVAILABLE, formatDecimal, formatLeverage, formatMultiple, formatPercent, formatProbability, formatUsd } from "./format";

// pt-BR number formatting without Intl, so the server and the browser always render the same text.
// Negative numbers use the ASCII hyphen-minus; the project forbids dashes in rendered text other than that sign.

describe("formatDecimal", () => {
  test("uses a comma for decimals and dots for thousands", () => {
    expect(formatDecimal(1234.5, 2)).toBe("1.234,50");
    expect(formatDecimal(0.5, 1)).toBe("0,5");
    expect(formatDecimal(1_000_000, 0)).toBe("1.000.000");
    expect(formatDecimal(999.999, 2)).toBe("1.000,00");
    expect(formatDecimal(12, 0)).toBe("12");
    expect(formatDecimal(0, 3)).toBe("0,000");
  });

  test("keeps the sign and never prints a negative zero", () => {
    expect(formatDecimal(-1234.567, 2)).toBe("-1.234,57");
    expect(formatDecimal(-0.001, 2)).toBe("0,00");
    expect(formatDecimal(-0, 2)).toBe("0,00");
  });

  test("reports non finite numbers as unavailable", () => {
    expect(UNAVAILABLE).toBe("indisponível");
    expect(formatDecimal(Number.NaN, 2)).toBe(UNAVAILABLE);
    expect(formatDecimal(Number.POSITIVE_INFINITY, 2)).toBe(UNAVAILABLE);
  });
});

describe("formatPercent", () => {
  test("multiplies by one hundred", () => {
    expect(formatPercent(0.0344, 1)).toBe("3,4%");
    expect(formatPercent(0.5, 0)).toBe("50%");
    expect(formatPercent(0.0667, 2)).toBe("6,67%");
    expect(formatPercent(-0.02, 1)).toBe("-2,0%");
  });
});

describe("formatProbability", () => {
  test("adapts the precision to the magnitude", () => {
    expect(formatProbability(0.3447)).toBe("34,5%");
    expect(formatProbability(0.0588)).toBe("5,9%");
    expect(formatProbability(0.01)).toBe("1,0%");
    expect(formatProbability(0.00234)).toBe("0,23%");
    expect(formatProbability(0.5)).toBe("50,0%");
  });

  test("shows bounds instead of false precision at the extremes", () => {
    expect(formatProbability(0.00005)).toBe("menos de 0,01%");
    expect(formatProbability(0.99995)).toBe("mais de 99,99%");
    expect(formatProbability(0)).toBe("0%");
    expect(formatProbability(1)).toBe("100%");
    expect(formatProbability(Number.NaN)).toBe(UNAVAILABLE);
  });
});

describe("formatMultiple", () => {
  test("prints wealth multiples with enough digits to be read", () => {
    expect(formatMultiple(0.8057)).toBe("0,81x");
    expect(formatMultiple(1)).toBe("1,00x");
    expect(formatMultiple(12.3456)).toBe("12,35x");
    expect(formatMultiple(1234.5)).toBe("1.234,50x");
    expect(formatMultiple(0.0000677)).toBe("0,00007x");
    expect(formatMultiple(0.00451)).toBe("0,0045x");
  });

  test("does not print a misleading zero for vanishing multiples", () => {
    expect(formatMultiple(3e-10)).toBe("menos de 0,00001x");
    expect(formatMultiple(0)).toBe("menos de 0,00001x");
    expect(formatMultiple(Number.NaN)).toBe(UNAVAILABLE);
  });
});

describe("formatLeverage", () => {
  test("prints leverage with the requested digits", () => {
    expect(formatLeverage(0.625, 3)).toBe("0,625x");
    expect(formatLeverage(5)).toBe("5x");
    expect(formatLeverage(2.5)).toBe("2,5x");
    expect(formatLeverage(4.821)).toBe("4,8x");
    expect(formatLeverage(0)).toBe("0x");
  });
});

describe("formatUsd", () => {
  test("uses US$ with two decimals and a space", () => {
    expect(formatUsd(1234.5)).toBe("US$ 1.234,50");
    expect(formatUsd(0)).toBe("US$ 0,00");
    expect(formatUsd(2)).toBe("US$ 2,00");
  });

  test("keeps tiny amounts visible and puts the sign before the currency", () => {
    expect(formatUsd(0.0068)).toBe("US$ 0,0068");
    expect(formatUsd(-2)).toBe("-US$ 2,00");
    expect(formatUsd(Number.NaN)).toBe(UNAVAILABLE);
  });
});
