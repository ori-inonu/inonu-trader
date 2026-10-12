import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOkxTradeClient, TRADE_PATHS, type OkxTradeClientOptions, type TradeFetch } from "./trade";

// D-A7. trade.ts signs OKX API requests with an HMAC and can reach web3.okx.com, so the one switch that lets it do so
// (allowLiveRequests) needs a test of its own. Nothing here touches the network: the fetcher is a recorder, and for the
// cases that use the default fetcher the global fetch is replaced by a trap for the duration of the test.

const credentials = { apiKey: "key-synthetic-1", secretKey: "secret-synthetic-2", passphrase: "pass-synthetic-3" };

function recorder() {
  const calls: Array<{ url: string; method: string; headers: Headers; credentials: string; redirect: string }> = [];
  const fetcher: TradeFetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, credentials: init.credentials, redirect: init.redirect });
    return { ok: true, async text() { return JSON.stringify({ code: "0", msg: "", data: [] }); } };
  };
  return { calls, fetcher };
}

async function withTrappedFetch<T>(body: (calls: () => number) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  let hits = 0;
  globalThis.fetch = (() => { hits += 1; throw new Error("the network must not be reached"); }) as unknown as typeof fetch;
  try { return await body(() => hits); } finally { globalThis.fetch = original; }
}

describe("D-A7 the live switch of the OKX trade client", () => {
  test.each([
    ["omitted", {}],
    ["false", { allowLiveRequests: false }],
    ["undefined", { allowLiveRequests: undefined }],
    ["the number 1", { allowLiveRequests: 1 as unknown as boolean }],
    ["the string true", { allowLiveRequests: "true" as unknown as boolean }],
    ["an object", { allowLiveRequests: {} as unknown as boolean }],
  ] as Array<[string, Partial<OkxTradeClientOptions>]>)("allowLiveRequests %s: GET and POST are refused before anything is signed or sent", async (_name, extra) => {
    const { calls, fetcher } = recorder();
    const client = createOkxTradeClient({ credentials, fetcher, minRequestIntervalMs: 0, ...extra });
    await expect(client.get(TRADE_PATHS.quote, { chainIndex: "196" })).rejects.toThrow("OKX live requests are disabled");
    await expect(client.post(TRADE_PATHS.defiProductSearch, { chainIndex: "196" })).rejects.toThrow("OKX live requests are disabled");
    expect(calls).toHaveLength(0);
  });

  test("with no fetcher given, a closed switch never reaches the global fetch either", async () => {
    await withTrappedFetch(async (hits) => {
      const client = createOkxTradeClient({ credentials, minRequestIntervalMs: 0 });
      await expect(client.get(TRADE_PATHS.swap, { chainIndex: "196" })).rejects.toThrow("OKX live requests are disabled");
      expect(hits()).toBe(0);
    });
  });

  test("an open switch signs one allowed GET without credentials or redirects, and refuses a path outside the table", async () => {
    const { calls, fetcher } = recorder();
    const client = createOkxTradeClient({ credentials, fetcher, minRequestIntervalMs: 0, allowLiveRequests: true, now: () => new Date("2026-10-12T12:00:00.000Z") });
    await client.get(TRADE_PATHS.quote, { chainIndex: "196" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://web3.okx.com/api/v6/dex/aggregator/quote?chainIndex=196");
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.credentials).toBe("omit");
    expect(calls[0]!.redirect).toBe("error");
    expect(calls[0]!.headers.get("OK-ACCESS-KEY")).toBe(credentials.apiKey);
    expect(calls[0]!.headers.get("OK-ACCESS-SIGN")).toMatch(/^[A-Za-z0-9+/]+=*$/);
    await expect(client.get("/api/v6/dex/pre-transaction/broadcast-transaction" as never, {})).rejects.toThrow("Trade path not allowed");
    await expect(client.get(TRADE_PATHS.quote, { "chain Index": "196" })).rejects.toThrow("Invalid parameter");
    expect(calls).toHaveLength(1);
  });

  test("the table of paths holds no broadcast, simulation or send endpoint and the file never signs or sends a transaction", () => {
    expect(Object.values(TRADE_PATHS).filter((path) => /broadcast|simulate|send|sign|submit/i.test(path))).toEqual([]);
    const source = readFileSync(join(import.meta.dir, "trade.ts"), "utf8");
    // Comments are allowed to say that nothing here signs a transaction; the executable lines are what is scanned.
    const executable = source.split(/\r?\n/).filter((line) => !/^\s*(?:\/\/|\/?\*)/.test(line)).join("\n");
    expect(/\bsign(?:Transaction|Message|TypedData)\b|\bsend(?:Raw)?Transaction\b|\bWallet\b|process\.env|privateKey|PRIVATE_KEY/.test(executable)).toBe(false);
    // The single HMAC is the OKX request authentication of send(), after the allowLiveRequests check.
    expect(executable.match(/createHmac\(/g)?.length).toBe(1);
    expect(executable.indexOf('options.allowLiveRequests !== true')).toBeGreaterThan(-1);
    expect(executable.indexOf('options.allowLiveRequests !== true')).toBeLessThan(executable.indexOf("createHmac("));
  });
});
