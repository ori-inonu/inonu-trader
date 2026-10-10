import { describe, expect, test } from "bun:test";
import { buildDepthLevels, levelGeometry } from "./ladder";
import { eventFixture } from "./test-fixtures";

describe("buildDepthLevels", () => {
  test("returns nothing for no events or a zero count", () => {
    expect(buildDepthLevels([], 8)).toEqual([]);
    expect(buildDepthLevels([eventFixture()], 0)).toEqual([]);
    expect(buildDepthLevels([eventFixture()], -3)).toEqual([]);
  });

  test("orders levels ascending by price", () => {
    const levels = buildDepthLevels(
      [eventFixture({ bestBid: 1.2345, bestAsk: 1.2346, mid: 1.23455 })],
      8,
    );

    const prices = levels.map((level) => level.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices).toHaveLength(3);
  });

  test("derives only the sides present in the event", () => {
    const levels = buildDepthLevels(
      [eventFixture({ bestBid: 1.2, bestAsk: Number.NaN, mid: 1.25, resting: { bidMon: 4, askMon: 0 } })],
      8,
    );

    const bid = levels.find((level) => level.arm === "bid");
    const mid = levels.find((level) => level.arm === "mid");
    expect(bid?.bidSize).toBe(4);
    expect(bid?.askSize).toBe(0);
    expect(mid?.bidSize).toBe(0);
    expect(mid?.askSize).toBe(0);
    expect(levels.some((level) => level.arm === "ask")).toBe(false);
  });

  test("never invents a resting size that is not in the data", () => {
    const levels = buildDepthLevels(
      [eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 0, askMon: 0 } })],
      8,
    );

    for (const level of levels) {
      expect(level.bidSize).toBe(0);
      expect(level.askSize).toBe(0);
    }
  });

  test("clamps negative and non-finite resting sizes to zero", () => {
    const levels = buildDepthLevels(
      [eventFixture({
        bestBid: 1.2,
        bestAsk: 1.3,
        mid: 1.25,
        resting: { bidMon: -5, askMon: Number.POSITIVE_INFINITY },
      })],
      8,
    );

    expect(levels.find((level) => level.arm === "bid")?.bidSize).toBe(0);
    expect(levels.find((level) => level.arm === "ask")?.askSize).toBe(0);
  });

  test("a single event yields at least the mid level", () => {
    const levels = buildDepthLevels(
      [eventFixture({ bestBid: Number.NaN, bestAsk: null as unknown as number, mid: 1.25 })],
      8,
    );

    expect(levels).toHaveLength(1);
    expect(levels[0].arm).toBe("mid");
    expect(levels[0].price).toBe(1.25);
  });

  test("skips a non-positive or missing mid rather than drawing a fake level", () => {
    expect(buildDepthLevels([eventFixture({ mid: 0, bestBid: Number.NaN, bestAsk: Number.NaN })], 8)).toEqual([]);
    expect(buildDepthLevels([eventFixture({ mid: null as unknown as number, bestBid: Number.NaN, bestAsk: Number.NaN })], 8)).toEqual([]);
  });

  test("respects the requested count and keeps the lowest prices", () => {
    const events = [
      eventFixture({ block: 1, bestBid: 1.0, bestAsk: 1.1, mid: 1.05 }),
      eventFixture({ block: 2, bestBid: 2.0, bestAsk: 2.1, mid: 2.05 }),
      eventFixture({ block: 3, bestBid: 3.0, bestAsk: 3.1, mid: 3.05 }),
    ];

    expect(buildDepthLevels(events, 3).map((level) => level.price)).toEqual([1, 1.05, 1.1]);
  });

  test("the newest block at a price wins and marks the level live", () => {
    const levels = buildDepthLevels(
      [
        eventFixture({ block: 1, bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 1, askMon: 1 } }),
        eventFixture({ block: 2, bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 9, askMon: 9 } }),
      ],
      8,
    );

    const bid = levels.find((level) => level.arm === "bid");
    expect(bid?.block).toBe(2);
    expect(bid?.isLive).toBe(true);
    expect(bid?.bidSize).toBe(9);
  });

  test("does not mutate the events it reads", () => {
    const event = eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 2, askMon: 3 } });
    const before = JSON.stringify(event);
    buildDepthLevels([event], 8);
    expect(JSON.stringify(event)).toBe(before);
  });
});

describe("levelGeometry", () => {
  const level = { price: 1, bidSize: 0, askSize: 0, block: 1, isLive: true, arm: "bid" as const };

  test("keeps every scale inside 0.35 to 1 for zero, tiny and enormous sizes", () => {
    for (const size of [0, 0.0001, 1, 50, 1e12, Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      const scale = levelGeometry(level, 100, size);
      expect(scale).toBeGreaterThanOrEqual(0.35);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  test("maps zero, the ceiling and a tiny fraction onto the expected ends", () => {
    expect(levelGeometry(level, 100, 0)).toBeCloseTo(0.35, 10);
    expect(levelGeometry(level, 100, 100)).toBeCloseTo(1, 10);
    expect(levelGeometry(level, 100, 1e9)).toBeCloseTo(1, 10);
  });

  test("falls back to the minimum scale when there is no ceiling to compare against", () => {
    expect(levelGeometry(level, 0, 50)).toBe(0.35);
    expect(levelGeometry(level, -1, 50)).toBe(0.35);
    expect(levelGeometry(level, Number.NaN, 50)).toBe(0.35);
  });

  test("reads the arm size when no explicit size is given", () => {
    expect(levelGeometry({ ...level, arm: "bid", bidSize: 100 }, 100)).toBeCloseTo(1, 10);
    expect(levelGeometry({ ...level, arm: "ask", askSize: 0 }, 100)).toBeCloseTo(0.35, 10);
    expect(levelGeometry({ ...level, arm: "mid" }, 100)).toBeCloseTo(0.35, 10);
  });
});