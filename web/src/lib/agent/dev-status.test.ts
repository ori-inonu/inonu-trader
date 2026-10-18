import { describe, expect, test } from "bun:test";
import { parseDevStatus } from "./dev-status";

const book = {
 atMs: 1_700_000_001_000,
 observedAtMs: 1_700_000_000_000,
 quality: "current",
 totalUsd: 125.5,
 agentUsd: 100,
 cashUsd: 25.5,
};

const body = (status: unknown) => ({ ok: true, status });

describe("cached development status parser", () => {
 test("accepts a current finite book projection", () => {
  expect(parseDevStatus(body({ atMs: 1_700_000_002_000, connected: true, book }))).toEqual({
   atMs: 1_700_000_002_000,
   connected: true,
   book: { ...book },
  });
 });

 test("accepts stale projections and preserves unavailable amounts as null", () => {
  expect(parseDevStatus(body({
   atMs: 10,
   connected: false,
   book: { atMs: 9, observedAtMs: null, quality: "stale", totalUsd: null, agentUsd: null, cashUsd: null },
  }))).toEqual({
   atMs: 10,
   connected: false,
   book: { atMs: 9, observedAtMs: null, quality: "stale", totalUsd: null, agentUsd: null, cashUsd: null },
  });
 });

 test("accepts the unavailable quality only with valid nullable numeric fields", () => {
  expect(parseDevStatus(body({
   atMs: 1,
   connected: false,
   book: { atMs: 1, observedAtMs: null, quality: "unavailable", totalUsd: null, agentUsd: null, cashUsd: null },
  }))?.book?.quality).toBe("unavailable");
 });

 test("null book is unknown, while malformed or unknown values are rejected", () => {
  expect(parseDevStatus(body({ atMs: 1, connected: false, book: null }))).toEqual({ atMs: 1, connected: false, book: null });
  expect(parseDevStatus(body({ atMs: 1, connected: false, book: { ...book, quality: "unknown" } }))).toBeNull();
  expect(parseDevStatus(body({ atMs: Number.NaN, connected: true, book: null }))).toBeNull();
  expect(parseDevStatus(body({ atMs: 1, connected: true, book: { ...book, totalUsd: Infinity } }))).toBeNull();
  expect(parseDevStatus(body({ atMs: 1, connected: "yes", book: null }))).toBeNull();
  expect(parseDevStatus({ ok: true, status: { atMs: 1, connected: true, book: null, positions: [] } })).toBeNull();
 });
});
