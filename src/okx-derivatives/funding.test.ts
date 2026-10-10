import { expect, test } from "bun:test";
import { breakEvenSettlements, FUNDING_SCENARIOS, fundingFlowMicro, fundingIntervalHours, scenarioRatePpm, settlementSchedule } from "./funding.ts";
import { parseDecimal, rat, ratInt } from "./decimal.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

const HOUR = 3_600_000;
const history = ["0.00009", "0.00010", "0.00007", "0.00011", "0.00013", "0.00010", "0.00008", "0.00012", "0.00010"].map(dec);

test("OKX-DERIV D5: the settlement interval comes from the two funding timestamps and only 1, 2, 4 or 8 hours are accepted", () => {
  expect(fundingIntervalHours(0, 8 * HOUR)).toBe(8);
  expect(fundingIntervalHours(5 * HOUR, 9 * HOUR)).toBe(4);
  expect(fundingIntervalHours(0, 2 * HOUR)).toBe(2);
  expect(fundingIntervalHours(0, HOUR)).toBe(1);
  for (const [current, next] of [[0, 3 * HOUR], [0, 0], [HOUR, 0], [0, 8 * HOUR + 1], [0, 12 * HOUR]] as const) {
    expect(fundingIntervalHours(current, next)).toBeNull();
  }
});

test("OKX-DERIV D5: scenario rates cover recent average, worst observed and zero", () => {
  expect(FUNDING_SCENARIOS).toEqual(["recent_average", "worst_observed", "zero"]);
  expect(scenarioRatePpm("recent_average", history, "short")).toBe(100n);
  expect(scenarioRatePpm("worst_observed", history, "short")).toBe(70n);
  expect(scenarioRatePpm("zero", history, "short")).toBe(0n);
  // the worst print for a long position is the highest rate it would have paid
  expect(scenarioRatePpm("worst_observed", history, "long")).toBe(130n);
  expect(scenarioRatePpm("recent_average", history, "long")).toBe(100n);
  expect(() => scenarioRatePpm("recent_average", [], "short")).toThrow(RangeError);
});

test("OKX-DERIV D5: a fractional ppm average is rounded against the side of the trader", () => {
  const positive = ["0.0000010", "0.0000025"].map(dec); // mean 1.75 ppm
  expect(scenarioRatePpm("recent_average", positive, "short")).toBe(1n);
  expect(scenarioRatePpm("recent_average", positive, "long")).toBe(2n);
  const negative = ["-0.0000010", "-0.0000025"].map(dec); // mean -1.75 ppm
  expect(scenarioRatePpm("recent_average", negative, "short")).toBe(-2n);
  expect(scenarioRatePpm("recent_average", negative, "long")).toBe(-1n);
  // a negative print makes the worst observed rate negative for a short
  const mixed = ["0.00010", "-0.00005", "0.00020"].map(dec);
  expect(scenarioRatePpm("worst_observed", mixed, "short")).toBe(-50n);
  expect(scenarioRatePpm("worst_observed", mixed, "long")).toBe(200n);
});

test("OKX-DERIV D5: funding flow has the documented sign and is rounded down in micro units", () => {
  const value = ratInt(40044);
  // positive funding: longs pay shorts, so the short receives
  expect(fundingFlowMicro("short", value, 70n, 90)).toBe(252_277_200n);
  expect(fundingFlowMicro("long", value, 70n, 90)).toBe(-252_277_200n);
  // negative funding: shorts pay longs
  expect(fundingFlowMicro("short", value, -30n, 90)).toBe(-108_118_800n);
  expect(fundingFlowMicro("long", value, -30n, 90)).toBe(108_118_800n);
  expect(fundingFlowMicro("short", value, 0n, 90)).toBe(0n);
  expect(fundingFlowMicro("short", value, 70n, 0)).toBe(0n);
  // 100/3 quote at 1 ppm for one settlement is 33.33 micro: income floors to 33, an expense floors to -34
  expect(fundingFlowMicro("short", rat(100n, 3n), 1n, 1)).toBe(33n);
  expect(fundingFlowMicro("long", rat(100n, 3n), 1n, 1)).toBe(-34n);
  expect(() => fundingFlowMicro("short", value, 70n, -1)).toThrow(RangeError);
  expect(() => fundingFlowMicro("short", value, 70n, 1.5)).toThrow(RangeError);
});

test("OKX-DERIV D5: the settlement schedule starts at the pending settlement and steps by the interval", () => {
  const first = 1_800_028_800_000;
  expect(settlementSchedule(first, 8, 90)).toEqual({ firstMs: first, lastMs: first + 89 * 8 * HOUR });
  expect(settlementSchedule(first, 1, 1)).toEqual({ firstMs: first, lastMs: first });
  expect(() => settlementSchedule(first, 8, 0)).toThrow(RangeError);
});

test("OKX-DERIV D10: break-even counts the settlements needed to repay the fixed costs", () => {
  const value = ratInt(40044);
  // 110.0352 quote of costs against 4.0044 quote per settlement at 100 ppm: 27.48 settlements, so 28
  expect(breakEvenSettlements(110_035_200n, value, 100n, "short")).toBe(28n);
  // 2.80308 quote per settlement at 70 ppm: 39.25 settlements, so 40
  expect(breakEvenSettlements(110_035_200n, value, 70n, "short")).toBe(40n);
  // exactly divisible does not add a settlement
  expect(breakEvenSettlements(4_004_400n * 5n, value, 100n, "short")).toBe(5n);
  // no income, no break-even
  expect(breakEvenSettlements(110_035_200n, value, 0n, "short")).toBeNull();
  expect(breakEvenSettlements(110_035_200n, value, -5n, "short")).toBeNull();
  // a long pays positive funding, so a positive market rate never repays its costs
  expect(breakEvenSettlements(110_035_200n, value, 100n, "long")).toBeNull();
  expect(breakEvenSettlements(110_035_200n, value, -100n, "long")).toBe(28n);
  // nothing to repay
  expect(breakEvenSettlements(0n, value, 100n, "short")).toBe(0n);
  expect(breakEvenSettlements(-5n, value, 100n, "short")).toBe(0n);
});
