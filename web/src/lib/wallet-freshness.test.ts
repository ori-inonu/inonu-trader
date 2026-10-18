import { describe, expect, it } from "bun:test";
import {
  getWalletBalanceFreshness,
  startWalletFreshnessTicker,
} from "./wallet-freshness";

describe("wallet balance freshness", () => {
  it("keeps the exact 60 second boundary fresh and ages the next millisecond to stale", () => {
    expect(getWalletBalanceFreshness(1_000, 61_000)).toEqual({
      status: "fresh",
      ageMs: 60_000,
    });
    expect(getWalletBalanceFreshness(1_000, 61_001)).toEqual({
      status: "stale",
      ageMs: 60_001,
    });
  });

  it("returns unknown for missing, invalid, and future clock values", () => {
    for (const [observedAtMs, nowMs] of [
      [undefined, 1_000],
      [null, 1_000],
      [Number.NaN, 1_000],
      [1_001, 1_000],
      [1_000, Number.POSITIVE_INFINITY],
      [1_000, undefined],
    ] as const) {
      expect(getWalletBalanceFreshness(observedAtMs, nowMs)).toEqual({
        status: "unknown",
        ageMs: null,
      });
    }
  });

  it("ticks while mounted and stops scheduled updates during cleanup", () => {
    let nowMs = 100;
    let nextHandle = 1;
    const active = new Map<number, () => void>();
    const scheduler = {
      setInterval(callback: () => void, delayMs: number) {
        expect(delayMs).toBe(1_000);
        const handle = nextHandle++;
        active.set(handle, callback);
        return handle as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval(handle: ReturnType<typeof setInterval>) {
        active.delete(handle as unknown as number);
      },
    };
    const observed: number[] = [];
    const stop = startWalletFreshnessTicker((value) => observed.push(value), () => nowMs, scheduler);
    const tick = [...active.values()][0]!;

    expect(observed).toEqual([100]);
    nowMs = 101;
    tick();
    expect(observed).toEqual([100, 101]);

    stop();
    nowMs = 102;
    active.get(1)?.();
    expect(active.size).toBe(0);
    expect(observed).toEqual([100, 101]);
  });
});
