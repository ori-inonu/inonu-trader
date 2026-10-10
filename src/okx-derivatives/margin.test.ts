import { expect, test } from "bun:test";
import {
  initialMarginMicro, isLiquidatedAtMove, liquidationDistancePpm, liquidationPrice, liquidationPriceText, liquidationRatio, stressRow,
} from "./margin.ts";
import { parseDecimal, rat, ratInt } from "./decimal.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

// Golden values come from an independent exact-fraction (Python) computation of the SPEC formulas.
const MMR = 4000n;
const FEE = 400n;
const LEVERAGES = [1, 2, 3, 5, 10, 20];
const SHORT_ENTRY = dec("1000.95"); // 40038 quote for 40 coins
const LONG_ENTRY = dec("1001.25"); // 40050 quote for 40 coins

test("OKX-DERIV D8: short liquidation distance and price follow P_liq = E(1+1/L)/(1+mmr+fee)", () => {
  const distances = [991238n, 493428n, 327492n, 194743n, 95181n, 45400n];
  const prices = ["1993.1302270011", "1494.8476702508", "1328.7534846674", "1195.8781362007", "1096.2216248506", "1046.3933691756"];
  LEVERAGES.forEach((leverage, index) => {
    expect(liquidationDistancePpm("short", leverage, MMR, FEE)).toBe(distances[index] as bigint);
    // rounded down so the liquidation price is never overstated
    expect(liquidationPriceText("short", SHORT_ENTRY, leverage, MMR, FEE, 10)).toBe(prices[index] as string);
  });
  // the exact value sits at or above the rounded text
  const exact = liquidationPrice("short", SHORT_ENTRY, 3, MMR, FEE);
  expect(exact.n * 10n ** 10n >= 13287534846674n * exact.d).toBe(true);
});

test("OKX-DERIV D8: long liquidation distance and price follow P_liq = E(1-1/L)/(1-mmr-fee)", () => {
  const distances = [1000000n, 497790n, 330387n, 196464n, 96022n, 45801n];
  const prices = ["0", "502.8374849338", "670.4499799117", "804.539975894", "905.1074728807", "955.3912213741"];
  LEVERAGES.forEach((leverage, index) => {
    expect(liquidationDistancePpm("long", leverage, MMR, FEE)).toBe(distances[index] as bigint);
    // rounded up so the liquidation price is never understated (closer to the entry from below)
    expect(liquidationPriceText("long", LONG_ENTRY, leverage, MMR, FEE, 10)).toBe(prices[index] as string);
  });
  // with 1x a long has no price-based liquidation in the simplified model
  expect(liquidationRatio("long", 1, MMR, FEE)).toEqual(ratInt(0));
});

test("OKX-DERIV D8: liquidation distance is strictly decreasing in leverage for both sides", () => {
  for (const [mmr, fee] of [[4000n, 400n], [0n, 0n], [10000n, 500n], [500n, 0n], [200000n, 5000n]] as const) {
    for (const side of ["short", "long"] as const) {
      let previous = liquidationDistancePpm(side, 1, mmr, fee);
      for (let leverage = 2; leverage <= 125; leverage += 1) {
        const current = liquidationDistancePpm(side, leverage, mmr, fee);
        expect(current < previous).toBe(true);
        previous = current;
      }
    }
  }
});

test("OKX-DERIV D8: a higher maintenance margin or fee brings liquidation closer", () => {
  for (const side of ["short", "long"] as const) {
    expect(liquidationDistancePpm(side, 3, 8000n, FEE) < liquidationDistancePpm(side, 3, 4000n, FEE)).toBe(true);
    expect(liquidationDistancePpm(side, 3, MMR, 800n) < liquidationDistancePpm(side, 3, MMR, 400n)).toBe(true);
  }
});

test("OKX-DERIV D8: invalid leverage or an impossible long denominator is rejected", () => {
  for (const leverage of [0, -1, 1.5, Number.NaN, 126, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => liquidationRatio("short", leverage, MMR, FEE)).toThrow(RangeError);
  }
  expect(() => liquidationRatio("long", 3, 900000n, 100000n)).toThrow(RangeError);
  expect(() => liquidationRatio("short", 3, -1n, FEE)).toThrow(RangeError);
  expect(() => liquidationRatio("short", 3, MMR, -1n)).toThrow(RangeError);
  expect(liquidationRatio("short", 3, 900000n, 100000n).n > 0n).toBe(true);
});

test("OKX-DERIV D9: liquidation happens exactly when the adverse move reaches the exact distance", () => {
  // mmr = fee = 0 and 2x: the short is liquidated when the price rises 50%, exactly 500000 ppm
  expect(liquidationDistancePpm("short", 2, 0n, 0n)).toBe(500000n);
  expect(isLiquidatedAtMove("short", 2, 0n, 0n, 500000n)).toBe(true);
  expect(isLiquidatedAtMove("short", 2, 0n, 0n, 499999n)).toBe(false);
  // 3x with costs: the floored distance is 327492 ppm but the exact distance is slightly higher
  expect(isLiquidatedAtMove("short", 3, MMR, FEE, 327492n)).toBe(false);
  expect(isLiquidatedAtMove("short", 3, MMR, FEE, 327493n)).toBe(true);
  expect(isLiquidatedAtMove("long", 3, MMR, FEE, 330387n)).toBe(false);
  expect(isLiquidatedAtMove("long", 3, MMR, FEE, 330388n)).toBe(true);
  for (const leverage of LEVERAGES) {
    const distance = liquidationDistancePpm("short", leverage, MMR, FEE);
    expect(isLiquidatedAtMove("short", leverage, MMR, FEE, distance + 1n)).toBe(true);
  }
});

test("OKX-DERIV D7: initial margin is notional over leverage rounded up", () => {
  expect(initialMarginMicro(ratInt(40038), 3)).toBe(13_346_000_000n);
  expect(initialMarginMicro(ratInt(40038), 1)).toBe(40_038_000_000n);
  expect(initialMarginMicro(ratInt(40038), 20)).toBe(2_001_900_000n);
  // 1 quote at 3x is 0.3333... so rounds up to the next micro
  expect(initialMarginMicro(ratInt(1), 3)).toBe(333_334n);
  expect(initialMarginMicro(rat(1n, 1000000n), 1)).toBe(1n);
});

test("OKX-DERIV D9: a stress row keeps the margin on small moves and loses it all on liquidation", () => {
  const base = { side: "short" as const, entryNotional: ratInt(40038), initialMarginMicro: 13_346_000_000n, leverage: 3, mmrPpm: MMR, feePpm: FEE };

  const small = stressRow({ ...base, movePpm: 100000n, gap: false });
  expect(small).toEqual({ movePpm: 100000n, gap: false, liquidated: false, remainingMarginMicro: 9_342_200_000n, perpLegPnlMicro: -4_003_800_000n, perpUncappedPnlMicro: -4_003_800_000n, lossBeyondMarginMicro: 0n });

  const medium = stressRow({ ...base, movePpm: 250000n, gap: false });
  expect(medium.liquidated).toBe(false);
  expect(medium.remainingMarginMicro).toBe(3_336_500_000n);

  const gap = stressRow({ ...base, movePpm: 500000n, gap: true });
  expect(gap.liquidated).toBe(true);
  expect(gap.remainingMarginMicro).toBe(0n);
  expect(gap.perpLegPnlMicro).toBe(-13_346_000_000n);
  expect(gap.perpUncappedPnlMicro).toBe(-20_019_000_000n);
  expect(gap.lossBeyondMarginMicro).toBe(6_673_000_000n);

  // a continuous move through the liquidation price closes there: no loss beyond the margin
  const continuous = stressRow({ ...base, movePpm: 500000n, gap: false });
  expect(continuous.liquidated).toBe(true);
  expect(continuous.lossBeyondMarginMicro).toBe(0n);
  expect(continuous.perpLegPnlMicro).toBe(-13_346_000_000n);
});

test("OKX-DERIV D1/D9: a sub-micro price-path loss is rounded against the trader so the loss is never understated", () => {
  const entryNotional = rat(1n, 3n);
  const margin = initialMarginMicro(entryNotional, 3);
  expect(margin).toBe(111_112n);
  const row = stressRow({ side: "short", entryNotional, initialMarginMicro: margin, leverage: 3, mmrPpm: MMR, feePpm: FEE, movePpm: 100000n, gap: false });
  // the exact loss is 33333.33 micro units: it is reported as 33334, never as 33333
  expect(row.perpUncappedPnlMicro).toBe(-33_334n);
  expect(row.perpLegPnlMicro).toBe(-33_334n);
  expect(row.remainingMarginMicro).toBe(77_778n);
});

test("OKX-DERIV D9: stress rows for a long position use downward moves symmetrically", () => {
  const base = { side: "long" as const, entryNotional: ratInt(40050), initialMarginMicro: 13_350_000_000n, leverage: 3, mmrPpm: MMR, feePpm: FEE };
  expect(stressRow({ ...base, movePpm: 100000n, gap: false }).remainingMarginMicro).toBe(9_345_000_000n);
  expect(stressRow({ ...base, movePpm: 250000n, gap: false }).remainingMarginMicro).toBe(3_337_500_000n);
  const gap = stressRow({ ...base, movePpm: 500000n, gap: true });
  expect(gap.liquidated).toBe(true);
  expect(gap.lossBeyondMarginMicro).toBe(6_675_000_000n);
});

test("OKX-DERIV D9: the unlevered 1x short survives a gap and keeps a positive margin", () => {
  const row = stressRow({ side: "short", entryNotional: ratInt(40038), initialMarginMicro: 40_038_000_000n, leverage: 1, mmrPpm: MMR, feePpm: FEE, movePpm: 500000n, gap: true });
  expect(row.liquidated).toBe(false);
  expect(row.remainingMarginMicro).toBe(20_019_000_000n);
});
