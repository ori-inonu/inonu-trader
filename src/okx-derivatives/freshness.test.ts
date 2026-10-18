import { expect, test } from "bun:test";
import { assessFreshness, freshnessReasons } from "./freshness.ts";
import { SYNTHETIC_NOW_MS, syntheticInput } from "./fixture.ts";
import { parseDerivativesInput } from "./snapshot.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function parsed(mutate: (value: Json) => void = () => {}) {
  const raw = syntheticInput() as Json;
  mutate(raw);
  return parseDerivativesInput(raw);
}

test("OKX-DERIV D11: each component is fresh, stale or future against the injected clock", () => {
  const { snapshot, evaluation } = parsed();
  const fresh = assessFreshness(snapshot, SYNTHETIC_NOW_MS, evaluation.policy);
  expect(fresh.spotBook).toEqual({ tsMs: SYNTHETIC_NOW_MS - 2000, ageMs: 2000, status: "fresh" });
  expect(fresh.perpBook).toEqual({ tsMs: SYNTHETIC_NOW_MS - 1500, ageMs: 1500, status: "fresh" });
  expect(fresh.mark).toEqual({ tsMs: SYNTHETIC_NOW_MS - 1200, ageMs: 1200, status: "fresh" });
  expect(fresh.funding).toEqual({ tsMs: SYNTHETIC_NOW_MS - 3000, ageMs: 3000, status: "fresh" });
  expect(fresh.booksSkewMs).toBe(500);
  expect(fresh.skewExceeded).toBe(false);
});

test("OKX-DERIV D11: an age equal to the maximum is fresh and one millisecond more is stale", () => {
  const { snapshot, evaluation } = parsed();
  const max = evaluation.policy.maxSnapshotAgeMs;
  // the funding capture is the oldest component: 3000 ms old at SYNTHETIC_NOW_MS
  const atLimit = assessFreshness(snapshot, SYNTHETIC_NOW_MS + max - 3000, evaluation.policy);
  expect(atLimit.funding.status).toBe("fresh");
  expect(atLimit.funding.ageMs).toBe(max);
  const beyond = assessFreshness(snapshot, SYNTHETIC_NOW_MS + max - 3000 + 1, evaluation.policy);
  expect(beyond.funding.status).toBe("stale");
  expect(beyond.funding.ageMs).toBe(max + 1);
  expect(beyond.spotBook.status).toBe("fresh");
});

test("OKX-DERIV D11: a timestamp after the clock is future and has no age", () => {
  const { snapshot, evaluation } = parsed();
  const result = assessFreshness(snapshot, SYNTHETIC_NOW_MS - 2500, evaluation.policy);
  expect(result.spotBook).toEqual({ tsMs: SYNTHETIC_NOW_MS - 2000, ageMs: null, status: "future" });
  expect(result.perpBook.status).toBe("future");
  expect(result.mark.status).toBe("future");
  expect(result.funding.status).toBe("fresh");
  // a capture exactly at the clock is fresh with zero age
  const exact = assessFreshness(snapshot, SYNTHETIC_NOW_MS - 1500, evaluation.policy);
  expect(exact.perpBook).toEqual({ tsMs: SYNTHETIC_NOW_MS - 1500, ageMs: 0, status: "fresh" });
});

test("OKX-DERIV D11: book skew is the absolute difference of the two book captures against the limit", () => {
  const atLimit = parsed((value) => { value.snapshot.books.perp.tsMs = value.snapshot.books.spot.tsMs + 5000; });
  const exact = assessFreshness(atLimit.snapshot, SYNTHETIC_NOW_MS, atLimit.evaluation.policy);
  expect(exact.booksSkewMs).toBe(5000);
  expect(exact.skewExceeded).toBe(false);
  const beyond = parsed((value) => { value.snapshot.books.perp.tsMs = value.snapshot.books.spot.tsMs - 5001; });
  const result = assessFreshness(beyond.snapshot, SYNTHETIC_NOW_MS, beyond.evaluation.policy);
  expect(result.booksSkewMs).toBe(5001);
  expect(result.skewExceeded).toBe(true);
});

test("OKX-DERIV D11: reasons only cover the components an evaluation actually uses", () => {
  const { snapshot, evaluation } = parsed();
  const stale = assessFreshness(snapshot, SYNTHETIC_NOW_MS + 120_000, evaluation.policy);
  expect(freshnessReasons(stale, ["spot_book", "perp_book", "mark", "funding"], true)).toEqual(["stale:spot_book", "stale:perp_book", "stale:mark", "stale:funding"]);
  expect(freshnessReasons(stale, ["perp_book", "mark", "funding"], false)).toEqual(["stale:perp_book", "stale:mark", "stale:funding"]);
  const future = assessFreshness(snapshot, SYNTHETIC_NOW_MS - 2500, evaluation.policy);
  expect(freshnessReasons(future, ["spot_book", "perp_book", "mark", "funding"], true)).toEqual(["future:spot_book", "future:perp_book", "future:mark"]);
  const skewed = parsed((value) => { value.snapshot.books.perp.tsMs = value.snapshot.books.spot.tsMs - 9000; });
  const skew = assessFreshness(skewed.snapshot, SYNTHETIC_NOW_MS, skewed.evaluation.policy);
  expect(freshnessReasons(skew, ["spot_book", "perp_book"], true)).toEqual(["skew:books"]);
  expect(freshnessReasons(skew, ["perp_book"], false)).toEqual([]);
});

test("OKX-DERIV D11: the clock must be a safe non-negative integer", () => {
  const { snapshot, evaluation } = parsed();
  for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => assessFreshness(snapshot, bad, evaluation.policy)).toThrow(RangeError);
  }
});
