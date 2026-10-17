import { describe, expect, test } from "bun:test";
import { ONLINE_LIMITS } from "./contracts.ts";
import { collectOnlineObservation } from "./online-source.ts";

const OPTIONS = {
  runtimeBaseUrl: "http://127.0.0.1:8080",
  runtimeOrigin: "http://127.0.0.1:8080",
} as const;

describe("online source transport boundaries", () => {
  test("rejects malformed, non-loopback, and credentialed runtime sources before network access", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network must not be reached");
    }) as unknown as typeof fetch;

    try {
      const invalidOptions = [
        { runtimeBaseUrl: "not a URL", runtimeOrigin: "not a URL" },
        { runtimeBaseUrl: "http://localhost:8080", runtimeOrigin: "http://localhost:8080" },
        { runtimeBaseUrl: "http://user:secret@127.0.0.1:8080", runtimeOrigin: "http://user:secret@127.0.0.1:8080" },
      ];
      for (const options of invalidOptions) {
        await expect(collectOnlineObservation(options)).rejects.toThrow("online_runtime_options_invalid");
      }
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects oversized streaming responses with a constant error and no body disclosure", async () => {
    const originalFetch = globalThis.fetch;
    const privateMarker = "private-response-do-not-disclose";
    const bytes = new Uint8Array(ONLINE_LIMITS.maxResponseBytes + 1);
    bytes.set(new TextEncoder().encode(privateMarker));
    globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    try {
      let failure: unknown;
      try {
        await collectOnlineObservation(OPTIONS);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe("online_runtime_health_response_too_large");
      expect((failure as Error).message).not.toContain(privateMarker);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects stale and future timestamps in an otherwise valid analysis view", async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    const receivedAtMs = 1_700_000_000_000;
    Date.now = () => receivedAtMs;

    try {
      const validAnalysis = {
        funnel: { consults: 0, items: 0, closed: 0, open: 0, asked: 0, applied: 0, executed: 0, failed: 0 },
        asks: [],
        hist: { all: [], fresh: [] },
        timeline: [],
        trips: [],
        fees: { lamports: 0, fills: 0, unmatchedSells: 0 },
        placar: Object.fromEntries(["skipped", "closed", "gated"].map((group) => [
          group,
          Object.fromEntries(["15m", "1h"].map((window) => [window, { n: 0, up: 0, mean: null, vals: [] }])),
        ])),
        recent: [],
        orders: { outcomes: {}, reasons: {}, spentToday: { buy: 0, sell: 0 } },
        runtime: { tokensToday: null, riskPct: null },
      };
      for (const atMs of [receivedAtMs - ONLINE_LIMITS.runtimeMaxAgeMs - 1, receivedAtMs + ONLINE_LIMITS.clockSkewMs + 1]) {
        let fetchCalls = 0;
        globalThis.fetch = (async () => {
          fetchCalls += 1;
          const body = fetchCalls === 1
            ? { ok: true, app: "inonu-trader", version: "test", startedAt: receivedAtMs }
            : { ok: true, analysis: { ...validAnalysis, atMs } };
          return Response.json(body);
        }) as unknown as typeof fetch;

        await expect(collectOnlineObservation(OPTIONS)).rejects.toThrow("online_runtime_analysis_invalid");
        expect(fetchCalls).toBe(2);
      }
    } finally {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
    }
  });

  test("does not turn a required runtime HTTP error into a report or fallback request", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return Response.json({ privateDetail: "upstream failure" }, { status: 503 });
    }) as unknown as typeof fetch;

    try {
      await expect(collectOnlineObservation(OPTIONS)).rejects.toThrow("online_runtime_health_http");
      expect(fetchCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

