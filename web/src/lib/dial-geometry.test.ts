import { describe, expect, test } from "bun:test";
import { arcDash, needleAngle } from "./dial-geometry";
import type { Action } from "./types";

const ACTIONS: Action[] = ["buy", "sell", "hold"];

describe("arcDash", () => {
  test("pins the required boundaries", () => {
    expect(arcDash(0)).toBe("0 100");
    expect(arcDash(1)).toBe("1 99");
    expect(arcDash(Number.NaN)).toBe("0 100");
  });

  test("clamps out-of-range and non-finite input", () => {
    expect(arcDash(-4)).toBe("0 100");
    expect(arcDash(7)).toBe("1 99");
    expect(arcDash(Number.POSITIVE_INFINITY)).toBe("1 99");
    expect(arcDash(Number.NEGATIVE_INFINITY)).toBe("0 100");
  });

  test("always splits the full 100 unit track", () => {
    for (const p of [0, 0.13, 0.5, 0.87, 1]) {
      const [drawn, rest] = arcDash(p).split(" ").map(Number);
      expect(drawn + rest).toBe(100);
      expect(drawn).toBeGreaterThanOrEqual(0);
      expect(rest).toBeGreaterThanOrEqual(0);
    }
  });

  test("grows monotonically with the probability", () => {
    const drawn = [0.1, 0.2, 0.3].map((p) => Number(arcDash(p).split(" ")[0]));
    expect(drawn[1]).toBeGreaterThan(drawn[0]);
    expect(drawn[2]).toBeGreaterThan(drawn[1]);
  });
});

describe("needleAngle", () => {
  test("returns the identical angle for equal probabilities whatever the action", () => {
    const equal = { buy: 1 / 3, sell: 1 / 3, hold: 1 / 3 };
    const angles = ACTIONS.map((action) => needleAngle(equal, action));
    expect(new Set(angles).size).toBe(1);
  });

  test("ignores the action entirely, so a confident buy and a confident sell place the same needle", () => {
    const confidentBuy = { buy: 0.9, sell: 0.05, hold: 0.05 };
    expect(needleAngle(confidentBuy, "buy")).toBe(needleAngle(confidentBuy, "sell"));
    expect(needleAngle(confidentBuy, "buy")).toBe(needleAngle(confidentBuy, "hold"));
  });

  test("moves the needle as the buy weight grows", () => {
    const low = needleAngle({ buy: 0.1, sell: 0.8, hold: 0.1 }, "buy");
    const high = needleAngle({ buy: 0.8, sell: 0.1, hold: 0.1 }, "buy");
    expect(high).toBeGreaterThan(low);
  });

  test("stays finite and inside the gauge sweep for every action", () => {
    const cases = [
      { buy: 0, sell: 0, hold: 0 },
      { buy: -1, sell: 0, hold: 0 },
      { buy: Number.NaN, sell: 1, hold: 1 },
      { buy: Number.POSITIVE_INFINITY, sell: 0, hold: 0 },
    ];
    for (const probabilities of cases) {
      for (const action of ACTIONS) {
        const angle = needleAngle(probabilities, action);
        expect(Number.isFinite(angle)).toBe(true);
        expect(angle).toBeGreaterThanOrEqual(-120);
        expect(angle).toBeLessThanOrEqual(120);
      }
    }
  });

  test("returns the gauge start when no probability is usable", () => {
    expect(needleAngle({ buy: 0, sell: 0, hold: 0 }, "buy")).toBe(-120);
    expect(needleAngle({ buy: -5, sell: Number.NaN, hold: 0 }, "sell")).toBe(-120);
  });
});