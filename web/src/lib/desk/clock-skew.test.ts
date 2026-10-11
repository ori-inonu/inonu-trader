import { describe, expect, test } from "bun:test";
import {
  MAX_TRUSTED_ROUND_TRIP_MS,
  computeClockSample,
  createSkewMonitor,
  exchangeNow,
  measureClockSkew,
  parseOkxServerTime,
} from "./clock-skew";
import { FakeClock } from "./desk-test-kit";
import type { FetchLike } from "./okx-rest";

describe("midpoint sample", () => {
  test("server stamp minus the middle of the request", () => {
    // Local clock 70 s behind: request at 1000, answer at 1400, the server stamped 71200 at the middle (1200 + 70000).
    expect(computeClockSample(1000, 1400, 71_200)).toEqual({ offsetMs: 70_000, roundTripMs: 400, measuredAtMs: 1400 });
  });

  test("a clock ahead of the exchange gives a negative offset", () => {
    expect(computeClockSample(10_000, 10_200, 5_100)?.offsetMs).toBe(-5_000);
  });

  test("impossible or non finite inputs are not samples", () => {
    expect(computeClockSample(1400, 1000, 5)).toBeNull();
    expect(computeClockSample(Number.NaN, 1000, 5)).toBeNull();
    expect(computeClockSample(1, 2, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("server time envelope", () => {
  test("strict reader", () => {
    expect(parseOkxServerTime({ code: "0", data: [{ ts: "1791742105674" }] })).toBe(1791742105674);
    const bad: unknown[] = [
      null,
      "x",
      {},
      { code: "1", data: [{ ts: "5" }] },
      { code: "0", data: [] },
      { code: "0", data: [{}] },
      { code: "0", data: [{ ts: 5 }] },
      { code: "0", data: [{ ts: "" }] },
      { code: "0", data: [{ ts: "abc" }] },
      { code: "0", data: [{ ts: "0" }] },
      { code: "0", data: [{ ts: "-5" }] },
    ];
    for (const body of bad) expect(parseOkxServerTime(body)).toBeNull();
  });
});

const SKEW = 69_500;

/** A fetch whose round trip is scripted. The server stamps at `serverAt` of the trip (0.5 is the exact middle). */
function scripted(clock: FakeClock, trips: { rtt: number; at?: number; ok?: boolean; body?: unknown }[]): { fetch: FetchLike; calls: number[] } {
  const calls: number[] = [];
  let i = 0;
  const fetch: FetchLike = async (url) => {
    calls.push(clock.nowMs);
    expect(url).toBe("https://www.okx.com/api/v5/public/time");
    const trip = trips[Math.min(i, trips.length - 1)];
    i += 1;
    if (trip === undefined) throw new Error("no trip");
    const stampedAt = clock.nowMs + trip.rtt * (trip.at ?? 0.5);
    clock.nowMs += trip.rtt;
    const body = trip.body ?? { code: "0", msg: "", data: [{ ts: String(Math.round(stampedAt + SKEW)) }] };
    return { ok: trip.ok ?? true, status: trip.ok === false ? 500 : 200, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
  return { fetch, calls };
}

describe("measureClockSkew", () => {
  test("keeps the sample with the smallest round trip", async () => {
    const clock = new FakeClock();
    // The slow trips stamp late (asymmetric), so their offsets are off; the 120 ms trip is nearly exact.
    const { fetch, calls } = scripted(clock, [{ rtt: 900, at: 0.9 }, { rtt: 120 }, { rtt: 500, at: 0.1 }]);
    const sample = await measureClockSkew({ fetch, now: clock.now, timers: clock });
    expect(calls).toHaveLength(3);
    expect(sample?.roundTripMs).toBe(120);
    expect(sample?.offsetMs).toBe(SKEW);
  });

  test("discards samples above 2500 ms and returns null when nothing trustworthy is left", async () => {
    const clock = new FakeClock();
    const slow = scripted(clock, [{ rtt: MAX_TRUSTED_ROUND_TRIP_MS + 1 }]);
    expect(await measureClockSkew({ fetch: slow.fetch, now: clock.now, timers: clock })).toBeNull();
    const mixed = scripted(clock, [{ rtt: 3_000 }, { rtt: 2_500 }, { rtt: 4_000 }]);
    const sample = await measureClockSkew({ fetch: mixed.fetch, now: clock.now, timers: clock });
    expect(sample?.roundTripMs).toBe(2_500);
  });

  test("failed, refused and malformed answers are not samples", async () => {
    const clock = new FakeClock();
    const bad = scripted(clock, [{ rtt: 100, ok: false }, { rtt: 100, body: "not json" }, { rtt: 100, body: { code: "50000", data: [] } }]);
    expect(await measureClockSkew({ fetch: bad.fetch, now: clock.now, timers: clock })).toBeNull();
    const throwing: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await measureClockSkew({ fetch: throwing, now: clock.now, timers: clock })).toBeNull();
    const recovers = scripted(clock, [{ rtt: 100, ok: false }, { rtt: 200 }]);
    expect((await measureClockSkew({ fetch: recovers.fetch, now: clock.now, timers: clock }))?.offsetMs).toBe(SKEW);
  });

  test("honors the requested sample count and a custom url", async () => {
    const clock = new FakeClock();
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify({ code: "0", data: [{ ts: String(clock.nowMs + SKEW) }] }) };
    };
    await measureClockSkew({ fetch, now: clock.now, timers: clock, samples: 1, url: "https://example.test/time" });
    expect(urls).toEqual(["https://example.test/time"]);
  });

  test("an aborted measurement stops taking samples", async () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = scripted(clock, [{ rtt: 100 }]);
    expect(await measureClockSkew({ fetch, now: clock.now, timers: clock, signal: controller.signal })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("exchangeNow", () => {
  test("moves the local clock onto the exchange clock, or says it cannot", () => {
    expect(exchangeNow(70_000, 1_000)).toBe(71_000);
    expect(exchangeNow(-500, 1_000)).toBe(500);
    expect(exchangeNow(0, 1_000)).toBe(1_000);
    expect(exchangeNow(null, 1_000)).toBeNull();
  });
});

describe("skew monitor", () => {
  function monitorEnv() {
    const clock = new FakeClock();
    const flags = { down: false };
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      if (flags.down) throw new TypeError("Failed to fetch");
      return { ok: true, status: 200, text: async () => JSON.stringify({ code: "0", data: [{ ts: String(clock.nowMs + SKEW) }] }) };
    };
    const values: (number | null)[] = [];
    const monitor = createSkewMonitor({ fetch, now: clock.now, timers: clock, onSkew: (v) => values.push(v) });
    return { clock, flags, urls, values, monitor };
  }

  test("measures at start (three samples) and again every 10 minutes", async () => {
    const { clock, urls, values, monitor } = monitorEnv();
    monitor.start();
    await clock.advanceAsync(100, 50);
    expect(values).toEqual([SKEW]);
    expect(urls).toHaveLength(3);
    await clock.advanceAsync(599_000, 1_000);
    expect(urls).toHaveLength(3);
    await clock.advanceAsync(2_000, 500);
    expect(urls).toHaveLength(6);
    expect(values).toEqual([SKEW, SKEW]);
    monitor.stop();
    expect(clock.pendingCount()).toBe(0);
  });

  test("failures retry every 30 s, keep the last trustworthy value for 30 minutes, then fall back to unknown", async () => {
    const { clock, flags, values, monitor } = monitorEnv();
    flags.down = true;
    monitor.start();
    await clock.advanceAsync(100, 50);
    expect(values).toEqual([null]);
    flags.down = false;
    await clock.advanceAsync(31_000, 1_000);
    expect(values).toEqual([null, SKEW]);
    flags.down = true;
    await clock.advanceAsync(600_000, 5_000); // the re-measurement fails: the value is kept, no news
    expect(values).toEqual([null, SKEW]);
    await clock.advanceAsync(1_300_000, 10_000); // older than 30 minutes now
    expect(values[values.length - 1]).toBeNull();
    monitor.stop();
  });

  test("stop cancels the schedule and a late answer is ignored", async () => {
    const { clock, urls, values, monitor } = monitorEnv();
    monitor.start();
    monitor.stop();
    await clock.advanceAsync(700_000, 10_000);
    expect(values).toEqual([]);
    expect(urls.length).toBeLessThanOrEqual(1);
    expect(clock.pendingCount()).toBe(0);
  });
});
