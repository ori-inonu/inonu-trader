import { describe, expect, test } from "bun:test";
import type { OnchainMeta } from "./client";
import { initialResourceState, onchainResourceReducer, pollIntervalMs, shouldPollNow, type OnchainResourceState } from "./useOnchainResource";
import { ONCHAIN_TAPE_POLL_MS } from "@/components/Desk/Dock/OnchainDeskTabs";

const META: OnchainMeta = { tier: "premium", cachedAtMs: 1_000, ageMs: 5_000, stale: false, budget: { tier: "premium", used: 3, cap: 50_000 } };

describe("onchain resource reducer", () => {
  test("idle -> loading on start, keeping nothing", () => {
    const s = onchainResourceReducer<string[]>(initialResourceState(), { type: "start", key: "a" });
    expect(s).toEqual({ status: "loading", key: "a", data: null, meta: null, error: null });
  });

  test("success for the current key becomes ready with data and meta", () => {
    const s: OnchainResourceState<string[]> = { status: "loading", key: "a", data: null, meta: null, error: null };
    const next = onchainResourceReducer(s, { type: "success", key: "a", data: ["x"], meta: META });
    expect(next).toEqual({ status: "ready", key: "a", data: ["x"], meta: META, error: null });
  });

  test("a late success for an old key is discarded", () => {
    const s: OnchainResourceState<string[]> = { status: "loading", key: "b", data: ["old"], meta: META, error: null };
    const next = onchainResourceReducer(s, { type: "success", key: "a", data: ["stale-answer"], meta: META });
    expect(next).toBe(s);
  });

  test("a late failure for an old key is discarded", () => {
    const s: OnchainResourceState<string[]> = { status: "loading", key: "b", data: ["old"], meta: META, error: null };
    const next = onchainResourceReducer(s, { type: "failure", key: "a", error: "rate_limited" });
    expect(next).toBe(s);
  });

  test("failure keeps the previous data so a refresh error never blanks the table", () => {
    const s: OnchainResourceState<string[]> = { status: "ready", key: "a", data: ["x"], meta: META, error: null };
    const loading = onchainResourceReducer(s, { type: "start", key: "a" });
    expect(loading.data).toEqual(["x"]);
    const failed = onchainResourceReducer(loading, { type: "failure", key: "a", error: "provider_error" });
    expect(failed.status).toBe("error");
    expect(failed.data).toEqual(["x"]);
    expect(failed.error).toBe("provider_error");
  });

  test("start clears a previous error but keeps the data during the reload", () => {
    const s: OnchainResourceState<string[]> = { status: "error", key: "a", data: ["x"], meta: META, error: "network" };
    const next = onchainResourceReducer(s, { type: "start", key: "a" });
    expect(next).toEqual({ status: "loading", key: "a", data: ["x"], meta: META, error: null });
  });

  test("start for a different key clears the data: it belongs to another selection", () => {
    const s: OnchainResourceState<string[]> = { status: "ready", key: "a", data: ["x"], meta: META, error: null };
    const next = onchainResourceReducer(s, { type: "start", key: "b" });
    expect(next).toEqual({ status: "loading", key: "b", data: null, meta: null, error: null });
  });

  test("reset returns to idle", () => {
    const s: OnchainResourceState<string[]> = { status: "ready", key: "a", data: ["x"], meta: META, error: null };
    expect(onchainResourceReducer(s, { type: "reset" })).toEqual(initialResourceState());
  });
});

describe("onchain resource polling policy", () => {
  test("the DEX tape polls at 30 s (the only dock tab that polls)", () => {
    expect(ONCHAIN_TAPE_POLL_MS).toBe(30_000);
  });

  test("pollIntervalMs honours the caller but never ticks faster than 5 s", () => {
    expect(pollIntervalMs(30_000)).toBe(30_000);
    expect(pollIntervalMs(60_000)).toBe(60_000);
    expect(pollIntervalMs(500)).toBe(5_000);
  });

  test("a tick fires only while the page is visible", () => {
    expect(shouldPollNow("visible")).toBe(true);
    expect(shouldPollNow("hidden")).toBe(false);
    expect(shouldPollNow("prerender")).toBe(false);
    expect(shouldPollNow(undefined)).toBe(true);
  });
});
