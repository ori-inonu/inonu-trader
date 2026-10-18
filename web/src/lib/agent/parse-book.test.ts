import { describe, expect, test } from "bun:test";
import { parseStatus } from "./parse";
import { rawStatus } from "./fixtures";

describe("the book amount parser", () => {
 const book = rawStatus().status.book as Record<string, unknown>;

 test("keeps real zero values and treats absent nullable amounts as unknown", () => {
  const zero = parseStatus(rawStatus({ book: { ...book, totalUsd: 0, agentUsd: 0, cashUsd: 0 } }))!;
  expect(zero.book).toMatchObject({ totalUsd: 0, agentUsd: 0, cashUsd: 0 });

  const withoutAgentUsd = { ...book };
  delete withoutAgentUsd.agentUsd;
  expect(parseStatus(rawStatus({ book: withoutAgentUsd }))!.book?.agentUsd).toBeNull();

  const withoutTotalUsd = { ...book };
  delete withoutTotalUsd.totalUsd;
  expect(parseStatus(rawStatus({ book: withoutTotalUsd }))!.book?.totalUsd).toBeNull();

  const withoutCashUsd = { ...book };
  delete withoutCashUsd.cashUsd;
  expect(parseStatus(rawStatus({ book: withoutCashUsd }))!.book?.cashUsd).toBeNull();
 });

 test("no successful book has no observation timestamp or financial zeroes", () => {
  const unavailable = parseStatus(rawStatus({
   book: {
    atMs: 500, observedAtMs: null, quality: "unavailable", managedOk: false,
    watchFailed: 0, flagged: 0, unpriced: 0, totalUsd: null, agentUsd: null, cashUsd: null, positions: [],
   }
  }))!;
  expect(unavailable.book).toMatchObject({ quality: "unavailable", observedAtMs: null, totalUsd: null, agentUsd: null, cashUsd: null });
 });

 test("a successful but unpriced managed position is partial", () => {
  const partial = parseStatus(rawStatus({
   book: {
    ...book, observedAtMs: book.atMs, quality: undefined, unpriced: 1,
    positions: [{ id: "token:1:unknown", symbol: "UNK", chainIndex: "1", wallet: "agente", usd: null, sharePct: null, isCash: false, plan: null }],
   }
  }))!;
  expect(partial.book?.quality).toBe("partial");
 });

 test("legacy successful book remains parseable but has unknown observation time and stale quality", () => {
  const old = { ...book };
  delete old.observedAtMs;
  delete old.quality;
  const parsed = parseStatus(rawStatus({ book: old }))!;
  expect(parsed.book).toMatchObject({ atMs: old.atMs, observedAtMs: null, quality: "stale", managedOk: true, agentUsd: 1010 });
 });
 test("a successful book preserves its explicit observation timestamp and current quality", () => {
  const observedAtMs = 1_700_000_000_123;
  const parsed = parseStatus(rawStatus({ book: { ...book, atMs: observedAtMs + 5_000, observedAtMs, quality: "current" } }))!;
  expect(parsed.book).toMatchObject({ observedAtMs, quality: "current", agentUsd: 1010 });
 });

 test("legacy global unpriced counts do not taint a fully priced managed wallet", () => {
  const managed = { ...(book.positions as Record<string, unknown>[])[0]!, wallet: "agente", usd: 800 };
  const principal = { ...(book.positions as Record<string, unknown>[])[1]!, wallet: "principal", usd: null };
  const legacy: Record<string, unknown> = { ...book, unpriced: 1, positions: [managed, principal] };
  delete legacy.observedAtMs;
  delete legacy.quality;
  expect(parseStatus(rawStatus({ book: legacy }))!.book).toMatchObject({ quality: "stale", observedAtMs: null, unpriced: 0 });
 });

 test("old failed core payloads are stale without presenting its ambiguous zeroes as observed values", () => {
  const old: Record<string, unknown> = { ...book, managedOk: false, totalUsd: 0, agentUsd: 0, cashUsd: 0 };
  delete old.observedAtMs;
  delete old.quality;
  expect(parseStatus(rawStatus({ book: old }))!.book).toMatchObject({ quality: "stale", observedAtMs: null, totalUsd: null, agentUsd: null, cashUsd: null });
 });
});
