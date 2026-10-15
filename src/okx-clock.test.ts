// T3.2 / API-2: every signed OKX client can stamp requests with the exchange-corrected clock, so a Windows clock that
// never synced (about 77 s behind on this machine; OKX accepts 30 s) cannot make the signatures fail with 50102.
// The libraries keep the system clock by default (their isolation tests forbid importing this module and its network
// call); the entry points (desktop core, CLI scripts) inject okxNow / okxNowMs through the clients' `now` option.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createOkxReadOnlyClient as createMemePumpClient } from "./okx-api";
import { createOkxReadOnlyClient as createMarketClient } from "./okx-market/okx-api";
import { createOkxDexReadOnlyClient } from "./okx-market/okx-dex";
import { createSignalsClient } from "./okx-signals/client";
import { createOkxPortfolioClient } from "./okx-wallet/portfolio";
import { createOkxTradeClient, TRADE_PATHS } from "./okx-wallet/trade";
import { okxClockStatus, okxNow, okxNowMs, resetOkxClockForTests, syncOkxClock } from "./okx-clock";

const T0 = 1_800_000_000_000;

function serverTimeFetch(serverMs: () => number) {
  return async () => ({ ok: true, status: 200, json: async () => ({ code: "0", data: [{ ts: String(serverMs()) }], msg: "" }) });
}

describe("syncOkxClock", () => {
  beforeEach(resetOkxClockForTests);
  afterEach(resetOkxClockForTests);

  test("corrects a local clock that is 77 s behind and keeps advancing with the monotonic clock", async () => {
    let wall = T0;
    let mono = 0;
    const sample = await syncOkxClock({ fetch: serverTimeFetch(() => wall + 77_000), now: () => wall, mono: () => mono, samples: 1 });
    expect(sample?.offsetMs).toBe(77_000);
    expect(okxClockStatus()).toMatchObject({ applied: true, offsetMs: 77_000 });
    expect(okxNowMs()).toBe(T0 + 77_000);
    wall += 5_000;
    mono += 5_000;
    expect(okxNowMs()).toBe(T0 + 82_000);
    expect(okxNow().getTime()).toBe(T0 + 82_000);
  });

  test("also corrects a local clock that is ahead of the exchange", async () => {
    await syncOkxClock({ fetch: serverTimeFetch(() => T0 - 45_000), now: () => T0, mono: () => 0, samples: 1 });
    expect(okxClockStatus().applied).toBe(true);
    expect(okxNowMs()).toBe(T0 - 45_000);
  });

  test("does not touch the clock when the skew is under 10 s", async () => {
    const sample = await syncOkxClock({ fetch: serverTimeFetch(() => Date.now() + 4_000), samples: 1 });
    expect(sample).not.toBeNull();
    expect(okxClockStatus()).toMatchObject({ applied: false });
    expect(Math.abs(okxNowMs() - Date.now())).toBeLessThan(100);
  });

  test("a later in-tolerance measurement removes an earlier correction (the user fixed the Windows clock)", async () => {
    await syncOkxClock({ fetch: serverTimeFetch(() => Date.now() + 77_000), samples: 1 });
    expect(okxClockStatus().applied).toBe(true);
    await syncOkxClock({ fetch: serverTimeFetch(() => Date.now() + 1_000), samples: 1 });
    expect(okxClockStatus().applied).toBe(false);
    expect(Math.abs(okxNowMs() - Date.now())).toBeLessThan(100);
  });

  test("never throws and keeps the previous state on a network failure, an HTTP error or a malformed body", async () => {
    await syncOkxClock({ fetch: serverTimeFetch(() => Date.now() + 77_000), samples: 1 });
    const before = okxClockStatus();
    const failures = [
      async () => { throw new Error("offline"); },
      async () => ({ ok: false, status: 503, json: async () => ({}) }),
      async () => ({ ok: true, status: 200, json: async () => ({ code: "1", data: [] }) }),
      async () => ({ ok: true, status: 200, json: async () => ({ code: "0", data: [{ ts: "not-a-number" }] }) }),
    ];
    for (const fetch of failures) {
      expect(await syncOkxClock({ fetch, samples: 1 })).toBeNull();
      expect(okxClockStatus()).toEqual(before);
    }
  });

  test("before any measurement the clock is the local clock", () => {
    expect(okxClockStatus()).toMatchObject({ applied: false, offsetMs: null });
    expect(Math.abs(okxNowMs() - Date.now())).toBeLessThan(100);
  });
});

const credentials = { apiKey: "test-key-0001", secret: "test-secret-0001", secretKey: "test-secret-0001", passphrase: "test-pass-0001" };
const envelope = JSON.stringify({ code: "0", msg: "", data: [] });

/** The signed timestamp a client put on its first request, whatever the client does with the (empty) answer. */
async function stampOf(run: (capture: (init: unknown) => void) => Promise<unknown>): Promise<number> {
  let stamp = "";
  const capture = (init: unknown) => {
    const headers = (init as { headers?: unknown }).headers;
    stamp = headers instanceof Headers ? (headers.get("OK-ACCESS-TIMESTAMP") ?? "") : String((headers as Record<string, string>)["OK-ACCESS-TIMESTAMP"] ?? "");
  };
  try {
    await run(capture);
  } catch {
    // an empty answer may be rejected by the client; only the stamped request matters here
  }
  expect(stamp).not.toBe("");
  return Date.parse(stamp);
}

describe("signed clients stamp with the corrected clock when the entry point injects it", () => {
  beforeEach(async () => {
    resetOkxClockForTests();
    await syncOkxClock({ fetch: serverTimeFetch(() => Date.now() + 77_000), samples: 1 });
  });
  afterEach(resetOkxClockForTests);

  const ahead = (stamp: number) => {
    const delta = stamp - Date.now();
    expect(delta).toBeGreaterThan(70_000);
    expect(delta).toBeLessThan(80_000);
  };
  const response = () => new Response(envelope, { status: 200 });

  test("src/okx-api.ts", async () => {
    ahead(await stampOf((capture) => createMemePumpClient({ credentials, allowLiveRequests: true, now: okxNow, fetcher: async (_url, init) => { capture(init); return { ok: true, text: async () => envelope }; } }).getMemePumpSupportedChains()));
  });

  test("src/okx-market/okx-api.ts", async () => {
    ahead(await stampOf((capture) => createMarketClient({ credentials, now: okxNow, fetch: async (_url, init) => { capture(init); return response(); } }).protocols()));
  });

  test("src/okx-market/okx-dex.ts", async () => {
    ahead(await stampOf((capture) => createOkxDexReadOnlyClient({ credentials, now: okxNow, minRequestIntervalMs: 0, fetch: async (_url, init) => { capture(init); return response(); } }).supportedChain("1")));
  });

  test("src/okx-wallet/portfolio.ts", async () => {
    ahead(await stampOf((capture) => createOkxPortfolioClient({ credentials, allowLiveRequests: true, now: okxNow, fetcher: async (_url, init) => { capture(init); return { ok: true, text: async () => envelope }; } }).totalValue(`0x${"1".repeat(40)}`, ["1"])));
  });

  test("src/okx-wallet/trade.ts", async () => {
    ahead(await stampOf((capture) => createOkxTradeClient({ credentials, allowLiveRequests: true, now: okxNow, minRequestIntervalMs: 0, fetcher: async (_url, init) => { capture(init); return { ok: true, text: async () => envelope }; } }).get(TRADE_PATHS.gasPrice, { chainIndex: "1" })));
  });

  test("src/okx-signals/client.ts", async () => {
    ahead(await stampOf((capture) => createSignalsClient({ credentials, now: okxNowMs, fetch: async (_url, init) => { capture(init); return response(); } }).supportedChains()));
  });

  test("without an injected clock a library keeps the system clock (the corrected one is the entry point's choice)", async () => {
    const stamp = await stampOf((capture) => createMarketClient({ credentials, fetch: async (_url, init) => { capture(init); return response(); } }).protocols());
    expect(Math.abs(stamp - Date.now())).toBeLessThan(5_000);
  });

  test("a fixed injected clock is used as given", async () => {
    const fixed = new Date(T0);
    const stamp = await stampOf((capture) => createMarketClient({ credentials, now: () => fixed, fetch: async (_url, init) => { capture(init); return response(); } }).protocols());
    expect(stamp).toBe(T0);
  });
});
