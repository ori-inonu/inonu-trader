import { describe, expect, test } from "bun:test";
import { FakeClock } from "./desk-test-kit";
import { createResyncGuard } from "./resync-guard";

function setup() {
  const clock = new FakeClock();
  const guard = createResyncGuard({ now: clock.now, timers: clock });
  const runs: number[] = [];
  const request = (key = "books|A"): void => guard.request(key, () => runs.push(clock.nowMs));
  return { clock, guard, runs, request };
}

describe("resync guard", () => {
  test("the first resync of a quiet period runs at once", () => {
    const { runs, request } = setup();
    request();
    expect(runs).toHaveLength(1);
  });

  test("a fault that repeats all the time is spaced 5 s, 10 s, 20 s, 40 s and then 60 s apart", () => {
    const { clock, runs, request } = setup();
    const start = clock.nowMs;
    while (runs.length < 7) {
      request();
      clock.advance(1_000);
    }
    const gaps = runs.map((at, i) => at - (i === 0 ? start : (runs[i - 1] ?? 0)));
    expect(gaps).toEqual([0, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  test("while one is waiting, more requests for the same key are absorbed", () => {
    const { clock, runs, request } = setup();
    request();
    request();
    request();
    request();
    expect(runs).toHaveLength(1);
    clock.advance(5_000);
    expect(runs).toHaveLength(2);
    clock.advance(60_000);
    expect(runs).toHaveLength(2);
  });

  test("keys are independent and a long quiet period resets the delay", () => {
    const { clock, runs, request } = setup();
    request("a");
    request("b");
    expect(runs).toHaveLength(2);
    request("a");
    expect(runs).toHaveLength(2);
    clock.advance(5_000);
    expect(runs).toHaveLength(3);
    clock.advance(200_000);
    request("a");
    expect(runs).toHaveLength(4);
  });

  test("clear cancels what is waiting", () => {
    const { clock, guard, runs, request } = setup();
    request();
    request();
    guard.clear();
    clock.advance(120_000);
    expect(runs).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
  });
});
