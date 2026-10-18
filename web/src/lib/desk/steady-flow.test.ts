// One steady hand for the whole page: the same reading wherever it is shown, fed once a second while anyone is looking, forgotten when nobody is. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createSteadyFlow } from "./steady-flow";

function harness() {
  let clock = 1_000_000;
  const timers = new Map<number, () => void>();
  let next = 1;
  const store = createSteadyFlow({
    now: () => clock,
    setTimer: (tick) => {
      timers.set(next, tick);
      return next++;
    },
    clearTimer: (h) => void timers.delete(h as number),
  });
  const advance = (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      clock += 1000;
      for (const tick of [...timers.values()]) tick();
    }
  };
  return { store, advance, timers, now: () => clock };
}

describe("one hand for the page", () => {
  test("two panels that look at the same instrument share one reading and one timer", () => {
    const h = harness();
    const a = h.store.attach("BTC-USDT", () => 0.6);
    const b = h.store.attach("BTC-USDT", () => 0.6);
    expect(h.timers.size).toBe(1);
    h.advance(3);
    expect(h.store.read("BTC-USDT")).toMatchObject({ band: "buy2" });
    expect(h.store.read("ETH-USDT")).toBeNull();
    a();
    // one still looks: the reading and the timer stay
    expect(h.timers.size).toBe(1);
    expect(h.store.read("BTC-USDT")).not.toBeNull();
    b();
    expect(h.timers.size).toBe(0);
  });

  test("when nobody looks any more the past is forgotten: the next look starts from nothing", () => {
    const h = harness();
    const stop = h.store.attach("BTC-USDT", () => 0.6);
    h.advance(5);
    stop();
    expect(h.store.read("BTC-USDT")).toBeNull();
    const again = h.store.attach("BTC-USDT", () => -0.6);
    expect(h.store.read("BTC-USDT")).toMatchObject({ band: "sell2" });
    again();
  });

  test("listeners hear only when what the screen shows changes, not every second", () => {
    const h = harness();
    let heard = 0;
    h.store.subscribe(() => void (heard += 1));
    const stop = h.store.attach("BTC-USDT", () => 0.6);
    const afterFirst = heard;
    h.advance(30);
    // a steady market: the band and the number are the same, so no second reading went out
    expect(heard - afterFirst).toBeLessThanOrEqual(2);
    stop();
  });

  test("the band has a start and it moves only when the band does", () => {
    const h = harness();
    const stop = h.store.attach("BTC-USDT", () => 0.6);
    const first = h.store.read("BTC-USDT")!;
    h.advance(20);
    expect(h.store.read("BTC-USDT")!.sinceMs).toBe(first.sinceMs);
    stop();
  });

  test("a raw reading that is not a number shows nothing yet", () => {
    const h = harness();
    const stop = h.store.attach("BTC-USDT", () => null);
    h.advance(3);
    expect(h.store.read("BTC-USDT")).toBeNull();
    stop();
  });
});
