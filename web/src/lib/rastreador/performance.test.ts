// RAS-3: the Desempenho view shows the change of the last hour and of the last four hours of the rows the person can see, from
// the exchange's own one minute candles. A row with fewer candles than the window needs has no such change (null), never a
// shorter window passed off as the full one. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { DeskCandle } from "../desk/types";
import type { OkxRest, RestResult } from "../desk/okx-rest";
import { MAX_ROWS_PER_PERFORMANCE_READ, createPerformanceReader, performanceOf } from "./performance";

const candles = (n: number, close: (i: number) => number): DeskCandle[] =>
  Array.from({ length: n }, (_, i) => ({ tsMs: 1_800_000_000_000 + i * 60_000, open: close(i), high: close(i), low: close(i), close: close(i), volBase: 1, volQuote: 1, confirmed: true }));

describe("performanceOf", () => {
  test("the hour compares the last close with the close sixty minutes before it", () => {
    const list = candles(300, (i) => 100 + i); // closes 100..399
    const p = performanceOf(list);
    expect(p.var1h).toBeCloseTo(((399 - 339) / 339) * 100, 9);
    expect(p.var4h).toBeCloseTo(((399 - 159) / 159) * 100, 9);
  });

  test("with fewer candles than a window needs that window is unknown, and the other one still is read", () => {
    const p = performanceOf(candles(100, (i) => 100 + i));
    expect(p.var1h).not.toBeNull();
    expect(p.var4h).toBeNull();
    expect(performanceOf(candles(60, () => 1))).toEqual({ var1h: null, var4h: null });
    expect(performanceOf([])).toEqual({ var1h: null, var4h: null });
  });

  test("a base of zero or a candle that is not a number is no change", () => {
    expect(performanceOf(candles(300, (i) => (i === 100 ? 0 : 100))).var1h).toBe(0); // a zero that is not the base: 100 against 100
    expect(performanceOf(candles(300, (i) => (i === 59 ? 0 : 100))).var4h).toBeNull(); // the four hour base is zero
    expect(performanceOf(candles(300, (i) => (i === 239 ? Number.NaN : 100))).var1h).toBeNull();
  });
});

describe("the reader", () => {
  const rest = (answers: Record<string, RestResult<readonly DeskCandle[]>>, calls: string[] = []): OkxRest =>
    ({
      candles: async (instId: string, bar: string, query?: { limit?: number }) => {
        calls.push(`${instId}:${bar}:${query?.limit}`);
        return answers[instId] ?? { ok: false, error: { code: "not_found", message: "x" } };
      },
    }) as unknown as OkxRest;

  test("one read of 300 one minute candles per row, and the change of each", async () => {
    const calls: string[] = [];
    const reader = createPerformanceReader({ rest: rest({ "BTC-USDT": { ok: true, value: candles(300, (i) => 100 + i), atMs: 1, rejected: 0 } }, calls) });
    const out = await reader.read(["BTC-USDT"]);
    expect(calls).toEqual(["BTC-USDT:1m:300"]);
    expect(out.get("BTC-USDT")).toMatchObject({ ok: true });
  });

  test("a row the exchange refused says so and the others are still read", async () => {
    const reader = createPerformanceReader({ rest: rest({ "B-USDT": { ok: true, value: candles(300, () => 5), atMs: 1, rejected: 0 } }) });
    const out = await reader.read(["A-USDT", "B-USDT"]);
    expect(out.get("A-USDT")).toEqual({ ok: false, reason: "falhou" });
    expect(out.get("B-USDT")).toMatchObject({ ok: true, var1h: 0, var4h: 0 });
  });

  test("the list is bounded and an id that is not an instrument is not asked", async () => {
    const calls: string[] = [];
    const reader = createPerformanceReader({ rest: rest({}, calls) });
    await reader.read(["bad id", ...Array.from({ length: MAX_ROWS_PER_PERFORMANCE_READ + 10 }, (_, i) => `T${i}-USDT`)]);
    expect(calls).toHaveLength(MAX_ROWS_PER_PERFORMANCE_READ);
    expect(calls.some((c) => c.includes("bad"))).toBe(false);
  });

  test("an aborted read stops at once", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const reader = createPerformanceReader({
      rest: {
        candles: async (instId: string) => {
          calls.push(instId);
          controller.abort();
          return { ok: true, value: candles(300, () => 1), atMs: 1, rejected: 0 };
        },
      } as unknown as OkxRest,
    });
    const out = await reader.read(["A-USDT", "B-USDT", "C-USDT"], controller.signal);
    expect(calls).toEqual(["A-USDT"]);
    expect(out.size).toBe(1);
  });
});
