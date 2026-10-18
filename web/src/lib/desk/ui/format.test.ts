import { describe, expect, test } from "bun:test";
import {
  baseSymbol,
  basisBps,
  fmtBps,
  fmtBpsPlain,
  fmtClock,
  fmtCompact,
  fmtCountdown,
  fmtDayMonth,
  fmtFundingPct,
  fmtNumber,
  fmtPctSigned,
  fmtShare,
  fmtSignedNumber,
  fmtTimeMs,
  fundingToBps,
  groupDigits,
  isSwapId,
  priceDecimals,
  columnSizeDecimals,
  fmtSizeAt,
  fmtSizeSig,
  priceDecimalsForMagnitude,
  quoteSymbol,
  TINY_SIZE,
  UNAVAILABLE,
} from "./format";

describe("priceDecimals", () => {
  test("derives decimals from the tick string", () => {
    expect(priceDecimals("0.1")).toBe(1);
    expect(priceDecimals("0.01")).toBe(2);
    expect(priceDecimals("0.00001")).toBe(5);
    expect(priceDecimals("0.00000001")).toBe(8);
    expect(priceDecimals("1")).toBe(0);
    expect(priceDecimals("10")).toBe(0);
    expect(priceDecimals("0.5")).toBe(1);
  });

  test("ignores trailing zeros and reads exponent notation", () => {
    expect(priceDecimals("0.10")).toBe(1);
    expect(priceDecimals("1e-7")).toBe(7);
    expect(priceDecimals("1E-8")).toBe(8);
    expect(priceDecimals("5e-1")).toBe(1);
  });

  test("falls back for anything unreadable or not a positive tick", () => {
    expect(priceDecimals(null)).toBe(2);
    expect(priceDecimals(undefined, 3)).toBe(3);
    expect(priceDecimals("")).toBe(2);
    expect(priceDecimals("abc", 4)).toBe(4);
    expect(priceDecimals("0", 4)).toBe(4);
    expect(priceDecimals("-0.1", 4)).toBe(4);
  });

  test("magnitude fallback keeps five significant digits", () => {
    expect(priceDecimalsForMagnitude(67432.1)).toBe(0);
    expect(priceDecimalsForMagnitude(3250.5)).toBe(1);
    expect(priceDecimalsForMagnitude(150.25)).toBe(2);
    expect(priceDecimalsForMagnitude(1.2345)).toBe(4);
    expect(priceDecimalsForMagnitude(0.0123)).toBe(6);
    expect(priceDecimalsForMagnitude(0.000000001)).toBe(8);
    expect(priceDecimalsForMagnitude(null)).toBe(2);
  });
});

describe("fmtNumber", () => {
  test("groups thousands with dots and uses a decimal comma", () => {
    expect(fmtNumber(1234567.891, 2)).toBe("1.234.567,89");
    expect(fmtNumber(67432.1, 1)).toBe("67.432,1");
    expect(fmtNumber(999, 0)).toBe("999");
    expect(fmtNumber(0.00001234, 8)).toBe("0,00001234");
  });

  test("keeps the sign on negatives and never prints negative zero", () => {
    expect(fmtNumber(-1234.5, 1)).toBe("-1.234,5");
    expect(fmtNumber(-0.0001, 2)).toBe("0,00");
    expect(fmtNumber(-0, 0)).toBe("0");
  });

  test("unknown values are Indisponivel, never zero", () => {
    expect(fmtNumber(null, 2)).toBe(UNAVAILABLE);
    expect(fmtNumber(undefined, 2)).toBe(UNAVAILABLE);
    expect(fmtNumber(Number.NaN, 2)).toBe(UNAVAILABLE);
    expect(fmtNumber(Number.POSITIVE_INFINITY, 2)).toBe(UNAVAILABLE);
  });

  test("groupDigits handles short and exact multiples of three", () => {
    expect(groupDigits("1")).toBe("1");
    expect(groupDigits("123")).toBe("123");
    expect(groupDigits("1234")).toBe("1.234");
    expect(groupDigits("123456")).toBe("123.456");
    expect(groupDigits("1234567")).toBe("1.234.567");
  });

  test("signed numbers add a plus only when the value is non zero", () => {
    expect(fmtSignedNumber(1.5, 1)).toBe("+1,5");
    expect(fmtSignedNumber(-1.5, 1)).toBe("-1,5");
    expect(fmtSignedNumber(0, 2)).toBe("0,00");
    expect(fmtSignedNumber(0.0001, 2)).toBe("0,00");
    expect(fmtSignedNumber(null, 2)).toBe(UNAVAILABLE);
  });
});

describe("fmtSizeSig", () => {
  test("keeps the significant digits of a small base size", () => {
    expect(fmtSizeSig(0.00004)).toBe("0,00004");
    expect(fmtSizeSig(0.0012)).toBe("0,0012");
    expect(fmtSizeSig(0.000123456)).toBe("0,000123");
    expect(fmtSizeSig(0.5)).toBe("0,50");
    expect(fmtSizeSig(0.1234)).toBe("0,123");
    expect(fmtSizeSig(0.00000001)).toBe("0,00000001");
  });

  test("from 1 up it uses fewer decimals as the number grows", () => {
    expect(fmtSizeSig(1.2346)).toBe("1,235");
    expect(fmtSizeSig(12.5)).toBe("12,50");
    expect(fmtSizeSig(123.45)).toBe("123,5");
    expect(fmtSizeSig(1234.5)).toBe("1.234,5");
    expect(fmtSizeSig(123456.7)).toBe("123.457");
    expect(fmtSizeSig(90_000)).toBe("90.000,0");
  });

  test("negatives keep the sign and exact zero is a plain zero", () => {
    expect(fmtSizeSig(-0.00004)).toBe("-0,00004");
    expect(fmtSizeSig(-12.5)).toBe("-12,50");
    expect(fmtSizeSig(0)).toBe("0,00");
    expect(fmtSizeSig(null)).toBe(UNAVAILABLE);
    expect(fmtSizeSig(Number.NaN)).toBe(UNAVAILABLE);
  });

  test("a non-zero value never returns a zero string, across every magnitude", () => {
    const zero = /^-?0([,.]0+)?$/;
    for (let exp = -12; exp <= 9; exp += 1) {
      for (const mantissa of [1, 1.4, 2.5, 4.99, 5, 9.99, 9.9999]) {
        for (const sign of [1, -1]) {
          const v = sign * mantissa * 10 ** exp;
          const text = fmtSizeSig(v);
          expect(zero.test(text)).toBe(false);
          expect(text).not.toBe(UNAVAILABLE);
          expect(/[1-9<]/.test(text)).toBe(true);
        }
      }
    }
  });

  test("below the 8 decimal cap it says so instead of printing zero", () => {
    expect(fmtSizeSig(1e-9)).toBe(TINY_SIZE);
    expect(fmtSizeSig(4e-9)).toBe(TINY_SIZE);
    expect(fmtSizeSig(-1e-10)).toBe(`-${TINY_SIZE}`);
    expect(fmtSizeSig(5e-9)).toBe("0,00000001");
  });

  test("never exceeds 8 decimals", () => {
    for (const v of [1e-8, 2.3e-8, 0.000000123, 0.00000987]) {
      const text = fmtSizeSig(v);
      const frac = text.includes(",") ? text.length - text.indexOf(",") - 1 : 0;
      expect(frac).toBeLessThanOrEqual(8);
    }
  });
});

describe("fmtSizeAt and columnSizeDecimals", () => {
  test("fixed decimals are used while they are enough", () => {
    expect(fmtSizeAt(0.0012, 5)).toBe("0,00120");
    expect(fmtSizeAt(12.5, 2)).toBe("12,50");
    expect(fmtSizeAt(0, 4)).toBe("0,0000");
  });

  test("a value that the fixed decimals would round to zero falls back to its significant digits", () => {
    expect(fmtSizeAt(0.00004, 4)).toBe("0,00004");
    expect(fmtSizeAt(-0.00004, 2)).toBe("-0,00004");
    expect(fmtSizeAt(null, 2)).toBe(UNAVAILABLE);
  });

  test("the column follows the lower quartile of the visible values", () => {
    expect(columnSizeDecimals([0.0004, 0.0012, 0.0007, 0.0009])).toBe(4);
    expect(columnSizeDecimals([0.00004, 0.0012, 0.0007, 0.0009, 0.002, 0.003, 0.004, 0.005])).toBe(4);
    expect(columnSizeDecimals([18.2, 22.5, 19.1])).toBe(2);
    expect(columnSizeDecimals([1234.5, 2000.5])).toBe(1);
    expect(columnSizeDecimals([90_000, 123_456])).toBe(1);
  });

  test("the lot step caps the column and an empty column has a default", () => {
    expect(columnSizeDecimals([0.4, 0.5, 0.6], "0.1")).toBe(1);
    expect(columnSizeDecimals([12.5, 14.5], "1")).toBe(0);
    expect(columnSizeDecimals([])).toBe(2);
    expect(columnSizeDecimals([0, 0])).toBe(2);
  });

  test("a column of tiny base sizes never shows a zero row", () => {
    const sizes = [0.00004, 0.0012, 0.0004, 0.00007, 0.0003, 0.000012];
    const dec = columnSizeDecimals(sizes, "0.00000001");
    for (const s of sizes) expect(/[1-9]/.test(fmtSizeAt(s, dec))).toBe(true);
  });
});

describe("fmtCompact keeps a small quantity visible", () => {
  test("a fraction is never compacted to zero", () => {
    expect(fmtCompact(0.00004)).toBe("0,00004");
    expect(fmtCompact(0.0012)).toBe("0,0012");
    expect(fmtCompact(-0.0012)).toBe("-0,0012");
    expect(fmtCompact(0.5)).toBe("0,50");
  });
});

describe("fmtCompact", () => {
  test("uses pt-BR units", () => {
    expect(fmtCompact(1_234)).toBe("1,2 mil");
    expect(fmtCompact(1_234_567)).toBe("1,2 mi");
    expect(fmtCompact(3_400_000_000)).toBe("3,4 bi");
    expect(fmtCompact(2_100_000_000_000)).toBe("2,1 tri");
  });

  test("drops the decimal at three digits and keeps it below", () => {
    expect(fmtCompact(12_345_678)).toBe("12,3 mi");
    expect(fmtCompact(123_456_789)).toBe("123 mi");
  });

  test("rounding up to 1000 promotes to the next unit", () => {
    expect(fmtCompact(999_960)).toBe("1,0 mi");
    expect(fmtCompact(999_999_999)).toBe("1,0 bi");
  });

  test("small values stay readable and negatives keep the sign", () => {
    expect(fmtCompact(0)).toBe("0,00");
    expect(fmtCompact(7.25)).toBe("7,25");
    expect(fmtCompact(42.5)).toBe("42,5");
    expect(fmtCompact(512.4)).toBe("512");
    expect(fmtCompact(-1_500_000)).toBe("-1,5 mi");
    expect(fmtCompact(null)).toBe(UNAVAILABLE);
  });
});

describe("percent and basis points", () => {
  test("percent carries a sign", () => {
    expect(fmtPctSigned(1.234)).toBe("+1,23%");
    expect(fmtPctSigned(-0.4)).toBe("-0,40%");
    expect(fmtPctSigned(0)).toBe("0,00%");
    expect(fmtPctSigned(-0.001)).toBe("0,00%");
    expect(fmtPctSigned(null)).toBe(UNAVAILABLE);
  });

  test("share turns a fraction into a percent", () => {
    expect(fmtShare(0.615, 1)).toBe("61,5%");
    expect(fmtShare(0.5)).toBe("50%");
    expect(fmtShare(null)).toBe(UNAVAILABLE);
  });

  test("funding reads as percent and as bps", () => {
    expect(fmtFundingPct(0.0001)).toBe("+0,0100%");
    expect(fmtFundingPct(-0.00025)).toBe("-0,0250%");
    expect(fmtFundingPct(0)).toBe("0,0000%");
    expect(fmtFundingPct(null)).toBe(UNAVAILABLE);
    expect(fundingToBps(0.0001)).toBeCloseTo(1, 10);
    expect(fmtBps(fundingToBps(0.00025))).toBe("+2,5 bps");
    expect(fmtBps(-3.04)).toBe("-3,0 bps");
    expect(fmtBpsPlain(0.84)).toBe("0,8 bps");
    expect(fmtBps(null)).toBe(UNAVAILABLE);
  });

  test("basis is mark over index, null when either is missing", () => {
    expect(basisBps(100.1, 100)).toBeCloseTo(10, 6);
    expect(basisBps(99.9, 100)).toBeCloseTo(-10, 6);
    expect(basisBps(null, 100)).toBeNull();
    expect(basisBps(100, null)).toBeNull();
    expect(basisBps(100, 0)).toBeNull();
  });
});

describe("time", () => {
  test("time of day with milliseconds in UTC", () => {
    expect(fmtTimeMs(Date.UTC(2026, 9, 11, 13, 5, 9, 42))).toBe("13:05:09.042");
    expect(fmtTimeMs(Date.UTC(2026, 9, 11, 0, 0, 0, 7))).toBe("00:00:00.007");
    expect(fmtTimeMs(Date.UTC(2026, 9, 11, 23, 59, 59, 999))).toBe("23:59:59.999");
    expect(fmtTimeMs(null)).toBe(UNAVAILABLE);
  });

  test("clock and day month", () => {
    expect(fmtClock(Date.UTC(2026, 9, 11, 13, 5, 9, 42))).toBe("13:05");
    expect(fmtDayMonth(Date.UTC(2026, 9, 11, 13, 5))).toBe("11/10");
    expect(fmtDayMonth(Date.UTC(2026, 0, 3))).toBe("03/01");
  });

  test("countdown is mm:ss and switches to hh:mm:ss past an hour", () => {
    expect(fmtCountdown(65_000)).toBe("01:05");
    expect(fmtCountdown(0)).toBe("00:00");
    expect(fmtCountdown(-5_000)).toBe("00:00");
    expect(fmtCountdown(59_999)).toBe("00:59");
    expect(fmtCountdown(3_600_000)).toBe("01:00:00");
    expect(fmtCountdown(8 * 3_600_000 - 1_000)).toBe("07:59:59");
    expect(fmtCountdown(null)).toBe(UNAVAILABLE);
  });
});

describe("instrument ids", () => {
  test("splits base and quote and recognises swaps", () => {
    expect(baseSymbol("BTC-USDT")).toBe("BTC");
    expect(baseSymbol("BTC-USDT-SWAP")).toBe("BTC");
    expect(baseSymbol("BTC")).toBe("BTC");
    expect(quoteSymbol("ETH-USDC-SWAP")).toBe("USDC");
    expect(quoteSymbol("ETH")).toBe("");
    expect(isSwapId("BTC-USDT-SWAP")).toBe(true);
    expect(isSwapId("BTC-USDT")).toBe(false);
  });
});

describe("forbidden characters", () => {
  test("no formatter ever emits a middle dot, em dash or en dash", () => {
    const samples = [
      fmtNumber(-1234.5, 2), fmtCompact(-3_400_000_000), fmtPctSigned(-2), fmtFundingPct(-0.0003),
      fmtBps(-4), fmtCountdown(5_000), fmtTimeMs(0), fmtNumber(null, 1), fmtCompact(null),
    ].join(" ");
    expect(samples).not.toContain("\u00b7");
    expect(samples).not.toContain("\u2014");
    expect(samples).not.toContain("\u2013");
    expect(samples).not.toContain("\u2212");
  });
});
