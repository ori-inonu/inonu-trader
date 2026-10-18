import { describe, expect, test } from "bun:test";
import { createOnchainCache } from "./cache";

describe("onchain cache", () => {
  test("fresh inside TTL, stale inside min(12 x TTL, 24h), gone afterwards", () => {
    let t = 1_000_000;
    const cache = createOnchainCache(() => t);
    cache.set("k", { v: 1 });
    expect(cache.get("k", 60_000)?.fresh).toBe(true);
    t += 59_999;
    expect(cache.get("k", 60_000)?.fresh).toBe(true);
    t += 2; // just past the TTL boundary
    const stale = cache.get("k", 60_000);
    expect(stale).not.toBeNull();
    expect(stale!.fresh).toBe(false);
    t += 12 * 60_000; // beyond the stale window
    expect(cache.get("k", 60_000)).toBeNull();
  });

  test("stale window is capped at 24h for long TTLs", () => {
    let t = 1_000_000;
    const cache = createOnchainCache(() => t);
    cache.set("chains", [1]);
    const day = 86_400_000;
    t += day - 1; // inside TTL: fresh
    expect(cache.get("chains", day)?.fresh).toBe(true);
    t += 2; // 1ms past the TTL: stale but capped at 24h, already out
    expect(cache.get("chains", day)).toBeNull();
  });

  test("coalesces concurrent identical requests into one call", async () => {
    const cache = createOnchainCache(() => 0);
    let calls = 0;
    const fn = async () => {
      calls += 1;
      await Bun.sleep(5);
      return 42;
    };
    const results = await Promise.all([0, 1, 2, 3, 4].map(() => cache.coalesce("same", fn)));
    expect(calls).toBe(1);
    expect(results).toEqual([42, 42, 42, 42, 42]);
    // after settle a new call runs again
    await cache.coalesce("same", fn);
    expect(calls).toBe(2);
  });
});
