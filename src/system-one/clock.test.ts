import { describe, expect, test } from "bun:test";
import { computeClockSample, correctedClock, measureServerClockOffset, parseOkxServerTime, type ClockFetch } from "./clock";
import { isFreshReading, MAX_READING_AGE_MS } from "./types";

describe("corrected clock with the strict freshness rule", () => {
  // The local clock is 70 s behind the exchange, the situation that blanked the cycle on this machine.
  const sample = { offsetMs: 70_000, roundTripMs: 400, measuredAtMs: 0 };
  const local = 1_000_000_000_000;
  const serverNow = local + 70_000 + 200;
  const now = correctedClock(sample, () => local);

  test("without the correction the exchange stamps look like the future and are rejected", () => {
    expect(isFreshReading(serverNow, local)).toBe(false);
  });

  test("with the correction a stamp the exchange just issued is fresh", () => {
    expect(isFreshReading(serverNow, now())).toBe(true);
    expect(isFreshReading(serverNow - 60_000, now())).toBe(true);
  });

  test("the corrected clock is never earlier than the exchange clock, so a real stamp cannot be future", () => {
    // Worst case of the estimate: the true server time is half a round trip ahead of the estimate.
    const trueServerNow = local + 70_000 + sample.roundTripMs / 2;
    expect(now()).toBeGreaterThanOrEqual(trueServerNow);
  });

  test("the rule itself is unchanged: future, stale and invalid stamps are still rejected", () => {
    expect(isFreshReading(now() + 1, now())).toBe(false);
    expect(isFreshReading(now() - MAX_READING_AGE_MS - 1, now())).toBe(false);
    expect(isFreshReading(null, now())).toBe(false);
    expect(isFreshReading(Number.NaN, now())).toBe(false);
  });
});

describe("computeClockSample", () => {
  test("offset is the server stamp minus the midpoint of the request", () => {
    // Local clock 70 s behind: request at 1000, answer at 1400, server says 71200 (midpoint 1200 + 70000).
    expect(computeClockSample(1_000, 1_400, 71_200)).toEqual({ offsetMs: 70_000, roundTripMs: 400, measuredAtMs: 1_400 });
  });

  test("a local clock ahead of the server gives a negative offset", () => {
    expect(computeClockSample(10_000, 10_200, 4_100)?.offsetMs).toBe(-6_000);
  });

  test("rejects non finite or inverted samples", () => {
    expect(computeClockSample(Number.NaN, 1, 1)).toBeNull();
    expect(computeClockSample(2_000, 1_000, 5_000)).toBeNull();
    expect(computeClockSample(1_000, 2_000, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("parseOkxServerTime", () => {
  test("reads the documented envelope", () => {
    expect(parseOkxServerTime({ code: "0", msg: "", data: [{ ts: "1791741602994" }] })).toBe(1_791_741_602_994);
  });

  test.each([
    [null],
    [{}],
    [{ code: "50011", data: [{ ts: "1791741602994" }] }],
    [{ code: "0", data: [] }],
    [{ code: "0", data: [{ ts: "" }] }],
    [{ code: "0", data: [{ ts: "abc" }] }],
    [{ code: "0", data: [{ ts: "-5" }] }],
    [{ code: "0", data: [{ ts: 1791741602994 }] }],
  ])("refuses a malformed envelope %#", (body) => {
    expect(parseOkxServerTime(body)).toBeNull();
  });
});

function scriptedFetch(rows: ReadonlyArray<{ serverAtMs: number; latencyMs: number; ok?: boolean; body?: unknown }>) {
  let clock = 5_000_000;
  let index = 0;
  const calls: string[] = [];
  const fetchFn: ClockFetch = async (url) => {
    calls.push(url);
    const row = rows[Math.min(index, rows.length - 1)]!;
    index += 1;
    clock += row.latencyMs;
    return {
      ok: row.ok ?? true,
      status: row.ok === false ? 503 : 200,
      json: async () => row.body ?? { code: "0", msg: "", data: [{ ts: String(row.serverAtMs) }] },
    };
  };
  return { fetchFn, now: () => clock, calls };
}

describe("measureServerClockOffset", () => {
  test("keeps the sample with the smallest round trip", async () => {
    // Local clock starts at 5_000_000 and each call advances it by its latency.
    // Sample 1: rtt 900, sample 2: rtt 200 (best), sample 3: rtt 600. The server is 70 s ahead.
    const { fetchFn, now } = scriptedFetch([
      { serverAtMs: 5_000_000 + 70_000 + 450, latencyMs: 900 },
      { serverAtMs: 5_000_900 + 70_000 + 100, latencyMs: 200 },
      { serverAtMs: 5_001_100 + 70_000 + 300, latencyMs: 600 },
    ]);
    const sample = await measureServerClockOffset({ fetch: fetchFn, now, samples: 3 });
    expect(sample).not.toBeNull();
    expect(sample!.roundTripMs).toBe(200);
    expect(sample!.offsetMs).toBe(70_000);
  });

  test("asks only the keyless public time endpoint", async () => {
    const { fetchFn, now, calls } = scriptedFetch([{ serverAtMs: 5_000_100, latencyMs: 200 }]);
    await measureServerClockOffset({ fetch: fetchFn, now, samples: 1 });
    expect(calls).toEqual(["https://www.okx.com/api/v5/public/time"]);
  });

  test("discards samples whose round trip is too slow to trust", async () => {
    const { fetchFn, now } = scriptedFetch([{ serverAtMs: 5_000_000 + 70_000, latencyMs: 9_000 }]);
    expect(await measureServerClockOffset({ fetch: fetchFn, now, samples: 2 })).toBeNull();
  });

  test("returns null, never a guess, when every request fails", async () => {
    const { fetchFn, now } = scriptedFetch([{ serverAtMs: 0, latencyMs: 100, ok: false }]);
    expect(await measureServerClockOffset({ fetch: fetchFn, now, samples: 2 })).toBeNull();
    const throwing: ClockFetch = async () => { throw new Error("network down"); };
    expect(await measureServerClockOffset({ fetch: throwing, now: () => 1, samples: 2 })).toBeNull();
  });

  test("a malformed body is ignored", async () => {
    const { fetchFn, now } = scriptedFetch([{ serverAtMs: 0, latencyMs: 100, body: { code: "0", data: [{ ts: "nope" }] } }]);
    expect(await measureServerClockOffset({ fetch: fetchFn, now, samples: 1 })).toBeNull();
  });
});
