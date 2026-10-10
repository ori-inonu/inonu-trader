import { describe, expect, test } from "bun:test";
import { parseMeta } from "./useFeed";

describe("feed metadata at the SSE boundary", () => {
  test("does not invent a market or start time for incomplete metadata", () => {
    expect(parseMeta({})?.market).toBe("");
    expect(parseMeta({})?.startedAt).toBeNull();
    for (const startedAt of ["123", NaN, Infinity, -1]) {
      expect(parseMeta({ startedAt })?.startedAt).toBeNull();
    }
    expect(parseMeta({ startedAt: 0 })?.startedAt).toBe(0);
  });
  test("only a literal boolean true declares simulation", () => {
    for (const dryRun of ["false", "true", 1, {}, null, undefined]) {
      expect(parseMeta({ dryRun })?.dryRun).toBe(false);
    }
    expect(parseMeta({ dryRun: true })?.dryRun).toBe(true);
    expect(parseMeta({ dryRun: false })?.dryRun).toBe(false);
  });

  test("preserves explicit source and mode for conservative presentation", () => {
    const meta = parseMeta({
      model: "fixture-model",
      market: "FIXTURE/USDC",
      startedAt: 123,
      dryRun: true,
      mode: "live",
      dataSource: "synthetic test feed",
    });
    expect(meta).toMatchObject({
      model: "fixture-model",
      market: "FIXTURE/USDC",
      startedAt: 123,
      dryRun: true,
      mode: "live",
      dataSource: "synthetic test feed",
    });
    expect(parseMeta({ mode: 1, dataSource: false })).not.toHaveProperty("mode");
    expect(parseMeta({ mode: 1, dataSource: false })).not.toHaveProperty("dataSource");
    expect(parseMeta(null)).toBeNull();
  });
});
