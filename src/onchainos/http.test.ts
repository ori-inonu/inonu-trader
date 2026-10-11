import { inspect } from "node:util";
import { describe, expect, test } from "bun:test";
import { OnchainosError } from "./errors.ts";
import { envelope, makeClock, makeFakeFetch, FAKE_START_MS, type FakeReply } from "./fakes.ts";
import {
  createOnchainosHttp,
  QuotaCounters,
  signRequest,
  TokenBucket,
  type CallEvent,
  type EndpointRef,
  type OnchainosHttpOptions,
} from "./http.ts";

// Canary credentials: shaped like real ones but obviously fake. They must never appear in any error, event or output.
const KEY = "canary-key-3f2a9c1d-77aa-4d1e-9bb0-aaaaaaaaaaaa";
const SECRET = "canary-secret-KAT-0123456789abcdef";
const PASS = "canary-pass-Zq9!x";
const CREDENTIALS = { apiKey: KEY, secretKey: SECRET, passphrase: PASS };

const CANDLES: EndpointRef = { path: "/api/v6/dex/market/candles", tier: "basic" };
const PRICE: EndpointRef = { path: "/api/v6/dex/market/price", tier: "basic" };
const GAS: EndpointRef = { path: "/api/v6/dex/pre-transaction/gas-price", tier: "unknown" };
const FREE: EndpointRef = { path: "/api/v6/dex/index/current-price", tier: "free" };

const ADDRESS = "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72";

function stack(script: FakeReply[] | ((call: import("./fakes.ts").FakeCall, index: number) => FakeReply), extra: Partial<OnchainosHttpOptions> = {}) {
  const clock = makeClock();
  const fake = makeFakeFetch(script, clock);
  const http = createOnchainosHttp({
    fetch: fake.fetch,
    now: clock.now,
    sleep: clock.sleep,
    credentials: CREDENTIALS,
    allowNetwork: true,
    ...extra,
  });
  return { clock, fake, http };
}

const OK = (data: unknown = []): FakeReply => ({ body: envelope(data) });

// ---------------------------------------------------------------------------

describe("D1: K4 signing", () => {
  // Vectors computed independently with openssl (dgst -sha256 -hmac) and python hmac; they are NOT documented vectors:
  // the OKX page publishes none. Secret: canary-secret-KAT-0123456789abcdef.
  const VECTORS = [
    {
      timestamp: "2023-11-14T22:13:20.000Z",
      method: "GET" as const,
      requestPath: `/api/v6/dex/market/candles?chainIndex=1&tokenContractAddress=${ADDRESS}&bar=1m&limit=2`,
      body: "",
      sign: "X0sERtnbWoZVAulN/13IIRGBZ+oY52QlRBTlrIX6+8s=",
    },
    {
      timestamp: "2023-11-14T22:13:21.000Z",
      method: "POST" as const,
      requestPath: "/api/v6/dex/market/price",
      body: `[{"chainIndex":"1","tokenContractAddress":"${ADDRESS}"}]`,
      sign: "+R93VEE+/ne26XokSZGnBheBE82ZZoJ3+5AK7dY8BxE=",
    },
    {
      timestamp: "2023-11-14T22:13:22.500Z",
      method: "GET" as const,
      requestPath: "/api/v6/dex/pre-transaction/gas-price?chainIndex=1",
      body: "",
      sign: "9iLaGmsCiwvlfAEaSpzpfKumlgd8UHCwY6WUrc7Lyss=",
    },
  ];

  test("D1: signRequest matches independently computed known answers", () => {
    for (const vector of VECTORS) {
      expect(signRequest({ secretKey: SECRET, timestamp: vector.timestamp, method: vector.method, requestPath: vector.requestPath, body: vector.body })).toBe(vector.sign);
    }
  });

  test("D1: every component of timestamp + METHOD + requestPath + body changes the signature", () => {
    const base = VECTORS[1]!;
    const sign = (patch: Partial<{ secretKey: string; timestamp: string; method: "GET" | "POST"; requestPath: string; body: string }>) =>
      signRequest({ secretKey: SECRET, timestamp: base.timestamp, method: base.method, requestPath: base.requestPath, body: base.body, ...patch });
    const reference = sign({});
    expect(reference).toBe(base.sign);
    expect(sign({ secretKey: `${SECRET}x` })).not.toBe(reference);
    expect(sign({ timestamp: "2023-11-14T22:13:21.001Z" })).not.toBe(reference);
    expect(sign({ method: "GET" })).not.toBe(reference);
    expect(sign({ requestPath: `${base.requestPath}?a=1` })).not.toBe(reference);
    expect(sign({ body: `${base.body} ` })).not.toBe(reference);
  });

  test("D1: a GET sends the query inside requestPath and signs exactly the string that is sent, with an empty body", async () => {
    const { clock, fake, http } = stack([OK()]);
    clock.set(1_700_000_000_000);
    await http.get(CANDLES, { chainIndex: "1", tokenContractAddress: ADDRESS, bar: "1m", limit: 2 });
    const call = fake.calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`https://web3.okx.com/api/v6/dex/market/candles?chainIndex=1&tokenContractAddress=${ADDRESS}&bar=1m&limit=2`);
    expect(call.body).toBeUndefined();
    expect(call.headers["OK-ACCESS-KEY"]).toBe(KEY);
    expect(call.headers["OK-ACCESS-PASSPHRASE"]).toBe(PASS);
    expect(call.headers["OK-ACCESS-TIMESTAMP"]).toBe("2023-11-14T22:13:20.000Z");
    expect(call.headers["OK-ACCESS-SIGN"]).toBe(VECTORS[0]!.sign);
    expect(call.headers["Content-Type"]).toBeUndefined();
    expect(Object.keys(call.headers).sort()).toEqual(["OK-ACCESS-KEY", "OK-ACCESS-PASSPHRASE", "OK-ACCESS-SIGN", "OK-ACCESS-TIMESTAMP"]);
  });

  test("D1: a POST signs the raw body and sends it unchanged with a JSON content type", async () => {
    const { clock, fake, http } = stack([OK()]);
    clock.set(1_700_000_001_000);
    await http.post(PRICE, [{ chainIndex: "1", tokenContractAddress: ADDRESS }]);
    const call = fake.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://web3.okx.com/api/v6/dex/market/price");
    expect(call.body).toBe(VECTORS[1]!.body);
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.headers["OK-ACCESS-SIGN"]).toBe(VECTORS[1]!.sign);
  });

  test("D1: the timestamp is ISO 8601 with milliseconds from the injected clock, and no project header is sent", async () => {
    const { clock, fake, http } = stack([OK()]);
    clock.set(1_700_000_002_500);
    await http.get(GAS, { chainIndex: "1" });
    const call = fake.calls[0]!;
    expect(call.headers["OK-ACCESS-TIMESTAMP"]).toBe("2023-11-14T22:13:22.500Z");
    expect(call.headers["OK-ACCESS-SIGN"]).toBe(VECTORS[2]!.sign);
    expect(call.headers["OK-ACCESS-PROJECT"]).toBeUndefined();
  });

  test("D1: query values are percent encoded, undefined is omitted and the order is the insertion order", async () => {
    const { fake, http } = stack([OK()]);
    await http.get(CANDLES, { b: "a b,c", a: undefined, c: true, d: 5, e: "ç" });
    expect(fake.calls[0]!.query).toBe("b=a%20b%2Cc&c=true&d=5&e=%C3%A7");
  });

  test("D1: unsafe paths and values are refused before anything is sent", async () => {
    const { fake, http } = stack([OK()]);
    const bad: EndpointRef[] = [
      { path: "/api/v6/dex/../trade", tier: "basic" },
      { path: "/api/v6//dex/market", tier: "basic" },
      { path: "/api/v5/account/balance", tier: "basic" },
      { path: "https://evil.example/api/v6/x", tier: "basic" },
      { path: "/api/v6/dex/market/candles?x=1", tier: "basic" },
      { path: "/api/v6/dex/market/candles/", tier: "basic" },
      { path: "", tier: "basic" },
    ];
    for (const endpoint of bad) {
      await expect(http.get(endpoint)).rejects.toMatchObject({ kind: "invalid_request" });
    }
    await expect(http.get(CANDLES, { x: "bad\nvalue" })).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(http.get(CANDLES, { x: "v".repeat(3000) })).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(http.post(PRICE, undefined)).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(http.post(PRICE, { n: 1n })).rejects.toMatchObject({ kind: "invalid_request" });
    expect(fake.calls.length).toBe(0);
  });
});

describe("D2: offline by default", () => {
  test("D2: without credentials the client refuses with kind offline and touches nothing", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch([OK()], clock);
    const http = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, allowNetwork: true });
    await expect(http.get(CANDLES, { chainIndex: "1" })).rejects.toMatchObject({ kind: "offline" });
    expect(fake.calls.length).toBe(0);
    expect(clock.sleeps).toEqual([]);
    expect(http.quota.snapshot().totalAttempts).toBe(0);
    expect(http.quota.snapshot().calls.basic).toBe(0);
  });

  test("D2: with credentials but without allowNetwork true it also refuses, whatever the flag looks like", async () => {
    for (const allowNetwork of [undefined, false, 1 as unknown as boolean, "true" as unknown as boolean]) {
      const clock = makeClock();
      const fake = makeFakeFetch([OK()], clock);
      const http = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials: CREDENTIALS, ...(allowNetwork === undefined ? {} : { allowNetwork }) });
      await expect(http.post(PRICE, [])).rejects.toMatchObject({ kind: "offline" });
      expect(fake.calls.length).toBe(0);
    }
  });

  test("D2: with credentials and allowNetwork true it sends exactly one request", async () => {
    const { fake, http } = stack([OK()]);
    await http.get(GAS, { chainIndex: "1" });
    expect(fake.calls.length).toBe(1);
  });

  test("D2: malformed credentials are refused at construction without echoing them", () => {
    const clock = makeClock();
    const fake = makeFakeFetch([]);
    const secretLooking = "has space in it";
    const cases = [
      { apiKey: "", secretKey: SECRET, passphrase: PASS },
      { apiKey: KEY, secretKey: "", passphrase: PASS },
      { apiKey: KEY, secretKey: SECRET, passphrase: "" },
      { apiKey: KEY, secretKey: secretLooking, passphrase: PASS },
      { apiKey: "k".repeat(513), secretKey: SECRET, passphrase: PASS },
      { apiKey: KEY, secretKey: "çomplicado", passphrase: PASS },
      { apiKey: KEY, secretKey: "tab\there", passphrase: PASS },
    ];
    for (const credentials of cases) {
      try {
        createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials, allowNetwork: true });
        throw new Error("deveria recusar");
      } catch (error) {
        expect(error).toBeInstanceOf(OnchainosError);
        expect((error as OnchainosError).kind).toBe("invalid_request");
        expect((error as Error).message).not.toContain(secretLooking);
        expect((error as Error).message).not.toContain(KEY);
        expect((error as Error).message).not.toContain(SECRET);
      }
    }
  });

  test("D2: the global fetch is never used by the client", async () => {
    const original = globalThis.fetch;
    let touched = 0;
    globalThis.fetch = ((): never => {
      touched += 1;
      throw new Error("fetch global usado");
    }) as unknown as typeof fetch;
    try {
      const { http } = stack([OK(), { status: 500 }, { status: 500 }, { status: 500 }, { throws: new Error("rede") }]);
      await http.get(GAS, { chainIndex: "1" });
      await expect(http.get(GAS, { chainIndex: "1" })).rejects.toBeInstanceOf(OnchainosError);
      await expect(http.get(GAS, { chainIndex: "1" })).rejects.toBeInstanceOf(OnchainosError);
    } finally {
      globalThis.fetch = original;
    }
    expect(touched).toBe(0);
  });

  test("D2: only https origins of the form scheme and host are accepted", () => {
    const clock = makeClock();
    const fake = makeFakeFetch([]);
    for (const origin of ["http://web3.okx.com", "https://web3.okx.com/path", "web3.okx.com", "https://user:pw@web3.okx.com", "https://web3.okx.com?x=1"]) {
      expect(() => createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials: CREDENTIALS, allowNetwork: true, origin })).toThrow(OnchainosError);
    }
  });
});

describe("D3: token bucket rate limiter", () => {
  test("D3: the default is one request per second with exact timing", async () => {
    const { clock, fake, http } = stack([OK(), OK(), OK()]);
    clock.set(FAKE_START_MS);
    await http.get(GAS, { chainIndex: "1" });
    await http.get(GAS, { chainIndex: "1" });
    await http.get(GAS, { chainIndex: "1" });
    expect(fake.calls.map((call) => call.atMs - FAKE_START_MS)).toEqual([0, 1000, 2000]);
    expect(clock.sleeps).toEqual([1000, 1000]);
  });

  test("D3: the rate is configurable", async () => {
    const { clock, fake, http } = stack([OK(), OK(), OK()], { requestsPerSecond: 4 });
    for (let index = 0; index < 3; index += 1) await http.get(GAS, { chainIndex: "1" });
    expect(clock.sleeps).toEqual([250, 250]);
    expect(fake.calls.map((call) => call.atMs - FAKE_START_MS)).toEqual([0, 250, 500]);
  });

  test("D3: a burst lets that many calls through at once and then waits", async () => {
    const { clock, fake, http } = stack([OK(), OK(), OK(), OK()], { requestsPerSecond: 1, burst: 3 });
    for (let index = 0; index < 4; index += 1) await http.get(GAS, { chainIndex: "1" });
    expect(fake.calls.map((call) => call.atMs - FAKE_START_MS)).toEqual([0, 0, 0, 1000]);
    expect(clock.sleeps).toEqual([1000]);
  });

  test("D3: idle time refills the bucket only up to the burst size", async () => {
    const { clock, fake, http } = stack([OK(), OK(), OK(), OK(), OK()], { requestsPerSecond: 1, burst: 2 });
    await http.get(GAS, { chainIndex: "1" });
    await http.get(GAS, { chainIndex: "1" });
    clock.advance(3_600_000);
    const afterIdle = clock.now();
    await http.get(GAS, { chainIndex: "1" });
    await http.get(GAS, { chainIndex: "1" });
    await http.get(GAS, { chainIndex: "1" });
    expect(fake.calls.slice(2).map((call) => call.atMs - afterIdle)).toEqual([0, 0, 1000]);
  });

  test("D3: concurrent calls are serialised and never exceed the rate", async () => {
    const { fake, http } = stack([OK(), OK(), OK(), OK()]);
    await Promise.all([1, 2, 3, 4].map(() => http.get(GAS, { chainIndex: "1" })));
    expect(fake.calls.map((call) => call.atMs - FAKE_START_MS)).toEqual([0, 1000, 2000, 3000]);
  });

  test("D3: a clock that goes backwards never grants extra tokens", async () => {
    const clock = makeClock();
    const bucket = new TokenBucket({ ratePerSecond: 1, burst: 1, now: clock.now, sleep: clock.sleep });
    await bucket.acquire();
    clock.set(FAKE_START_MS - 5000);
    await bucket.acquire();
    expect(clock.sleeps.length).toBe(1);
    expect(clock.sleeps[0]).toBe(1000);
  });

  test("D3: the bucket validates its configuration", () => {
    const clock = makeClock();
    for (const options of [
      { ratePerSecond: 0, burst: 1 },
      { ratePerSecond: -1, burst: 1 },
      { ratePerSecond: Number.NaN, burst: 1 },
      { ratePerSecond: 1, burst: 0 },
      { ratePerSecond: 1, burst: 1.5 },
      { ratePerSecond: 1, burst: 1000 },
    ]) {
      expect(() => new TokenBucket({ ...options, now: clock.now, sleep: clock.sleep })).toThrow(OnchainosError);
    }
    const fake = makeFakeFetch([]);
    for (const requestsPerSecond of [0, 0.01, 11, Number.NaN]) {
      expect(() => createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials: CREDENTIALS, allowNetwork: true, requestsPerSecond })).toThrow(OnchainosError);
    }
  });
});

describe("D4: bounded retries", () => {
  test("D4: a 429 is retried once after the backoff, signed again with a new timestamp, and the result is returned", async () => {
    const { clock, fake, http } = stack([{ status: 429, body: envelope(null, "50011", "Rate limit reached") }, OK([{ ok: true }])]);
    const result = await http.get(GAS, { chainIndex: "1" });
    expect(result.data).toEqual([{ ok: true }]);
    expect(result.meta.attempts).toBe(2);
    expect(fake.calls.length).toBe(2);
    expect(fake.calls[0]!.headers["OK-ACCESS-TIMESTAMP"]).not.toBe(fake.calls[1]!.headers["OK-ACCESS-TIMESTAMP"]);
    expect(fake.calls[0]!.headers["OK-ACCESS-SIGN"]).not.toBe(fake.calls[1]!.headers["OK-ACCESS-SIGN"]);
    expect(clock.sleeps).toEqual([1000]);
    const quota = http.quota.snapshot();
    expect(quota.attempts.unknown).toBe(2);
    expect(quota.calls.unknown).toBe(1);
    expect(quota.retries).toBe(1);
  });

  test("D4: 500, 502 and 503 are retried; the budget is maxRetries and then the error carries the status and the attempts", async () => {
    const { fake, http } = stack([{ status: 500 }, { status: 502 }, { status: 503 }]);
    try {
      await http.get(GAS, { chainIndex: "1" });
      throw new Error("deveria falhar");
    } catch (error) {
      expect((error as OnchainosError).kind).toBe("http");
      expect((error as OnchainosError).httpStatus).toBe(503);
      expect((error as OnchainosError).attempts).toBe(3);
    }
    expect(fake.calls.length).toBe(3);
  });

  test("D4: an exhausted 429 is reported as rate_limited", async () => {
    const { http } = stack([{ status: 429 }, { status: 429 }, { status: 429 }]);
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "rate_limited", httpStatus: 429, attempts: 3 });
  });

  test("D4: the backoff doubles and is capped, with no randomness", async () => {
    const { clock, fake, http } = stack([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }], {
      maxRetries: 5,
      backoffBaseMs: 1000,
      backoffMaxMs: 3000,
      requestsPerSecond: 10,
      burst: 10,
    });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "http", attempts: 6 });
    expect(clock.sleeps).toEqual([1000, 2000, 3000, 3000, 3000]);
    expect(fake.calls.length).toBe(6);
  });

  test("D4: every retry takes a token from the limiter again", async () => {
    const { clock, http } = stack([{ status: 429 }, OK()], { backoffBaseMs: 100, requestsPerSecond: 1, burst: 1 });
    await http.get(GAS, { chainIndex: "1" });
    // attempt 0 at t0, backoff 100, then the limiter holds the second attempt for the remaining 900
    expect(clock.sleeps).toEqual([100, 900]);
  });

  test("D4: client errors, a payment demand, network errors and envelope errors are never retried", async () => {
    for (const reply of [
      { status: 400, body: envelope(null, "51000", "bad") },
      { status: 401, body: envelope(null, "50113", "bad sign") },
      { status: 403 },
      { status: 404 },
      { status: 402, body: "payment required" },
      { throws: new Error("falha de rede") },
      { status: 200, body: envelope(null, "50011", "too many") },
      { status: 200, body: envelope(null, "84032", "only v3") },
    ] as FakeReply[]) {
      const { fake, http } = stack([reply, OK()]);
      await expect(http.get(GAS, { chainIndex: "1" })).rejects.toBeInstanceOf(OnchainosError);
      expect(fake.calls.length).toBe(1);
    }
  });

  test("D4: an HTTP 402 is an error that says no payment is made, and nothing is signed for payment", async () => {
    const { fake, http } = stack([{ status: 402, body: "pay here" }, OK()]);
    try {
      await http.get(PRICE, { chainIndex: "1" });
      throw new Error("deveria falhar");
    } catch (error) {
      expect((error as OnchainosError).kind).toBe("http");
      expect((error as OnchainosError).httpStatus).toBe(402);
      expect((error as Error).message).toContain("nenhum pagamento");
    }
    expect(fake.calls.length).toBe(1);
    for (const name of Object.keys(fake.calls[0]!.headers)) expect(name.toLowerCase()).not.toContain("payment");
  });

  test("D4: maxRetries 0 disables retries and the ceiling of 5 is enforced", async () => {
    const { fake, http } = stack([{ status: 429 }, OK()], { maxRetries: 0 });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "rate_limited", attempts: 1 });
    expect(fake.calls.length).toBe(1);
    const clock = makeClock();
    const unused = makeFakeFetch([]);
    expect(() => createOnchainosHttp({ fetch: unused.fetch, now: clock.now, sleep: clock.sleep, credentials: CREDENTIALS, allowNetwork: true, maxRetries: 6 })).toThrow(OnchainosError);
  });
});

describe("D5: per-call timeout", () => {
  test("D5: a fetch that honours the AbortSignal ends with kind timeout and the signal is aborted", async () => {
    const { fake, http } = stack([{ hang: true }], { timeoutMs: 30 });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "timeout" });
    expect(fake.calls[0]!.signal.aborted).toBe(true);
  });

  test("D5: a fetch that ignores the signal still ends by the deadline", async () => {
    const { http } = stack([{ hang: true, ignoreAbort: true }], { timeoutMs: 30 });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "timeout" });
  });

  test("D5: a body that never arrives also ends by the deadline", async () => {
    const { http } = stack([{ hangBody: true }], { timeoutMs: 30 });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "timeout" });
  });

  test("D5: a timeout is not retried", async () => {
    const { fake, http } = stack([{ hang: true }, OK()], { timeoutMs: 30 });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "timeout", attempts: 1 });
    expect(fake.calls.length).toBe(1);
  });

  test("D5: the timeout is validated", () => {
    const clock = makeClock();
    const fake = makeFakeFetch([]);
    for (const timeoutMs of [0, -5, 60_001, 1.5, Number.NaN]) {
      expect(() => createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials: CREDENTIALS, allowNetwork: true, timeoutMs })).toThrow(OnchainosError);
    }
  });

  test("D5: an unreadable body is a network error, not a crash", async () => {
    const { http } = stack([{ bodyThrows: true }]);
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "network" });
  });
});

describe("D6: envelope and strict JSON", () => {
  test("D6: code 0 as text returns the data and the provenance of the read", async () => {
    const { clock, http } = stack([OK([{ a: "1" }])]);
    const requested = clock.now();
    const result = await http.get(GAS, { chainIndex: "1" });
    expect(result.data).toEqual([{ a: "1" }]);
    expect(result.meta).toEqual({
      source: "onchainos-rest-v6",
      endpoint: "/api/v6/dex/pre-transaction/gas-price",
      tier: "unknown",
      httpStatus: 200,
      attempts: 1,
      requestedAtMs: requested,
      receivedAtMs: requested,
    });
  });

  test("D6: the numeric code 0 shown by some documentation examples is also success", async () => {
    const { http } = stack([{ body: { code: 0, msg: "success", data: { total: 1 } } }]);
    expect((await http.get(GAS, { chainIndex: "1" })).data).toEqual({ total: 1 });
  });

  test("D6: data null is passed on as null for the family parser to judge", async () => {
    const { http } = stack([{ body: { code: "0", msg: "", data: null } }]);
    expect((await http.get(GAS, { chainIndex: "1" })).data).toBeNull();
  });

  test("D6: any other code is a typed api error with the code and a sanitised provider message", async () => {
    const { http } = stack([{ body: { code: "50038", msg: "Chain not supported\nfor this endpoint", data: [] } }]);
    try {
      await http.get(GAS, { chainIndex: "1" });
      throw new Error("deveria falhar");
    } catch (error) {
      expect(error).toBeInstanceOf(OnchainosError);
      expect((error as OnchainosError).kind).toBe("api");
      expect((error as OnchainosError).apiCode).toBe("50038");
      expect((error as OnchainosError).providerMessage).toBe("Chain not supported for this endpoint");
      expect((error as OnchainosError).endpoint).toBe("/api/v6/dex/pre-transaction/gas-price");
      expect((error as Error).message).toContain("50038");
    }
  });

  test("D6: a numeric non success code is also an api error", async () => {
    const { http } = stack([{ body: { code: 84032, msg: "This api is only supported for V3 DEX Pool products", data: null } }]);
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "api", apiCode: "84032" });
  });

  test("D6: malformed envelopes are schema errors", async () => {
    const cases: unknown[] = ["", "not json at all", "[]", "null", '"text"', "12", '{"msg":"","data":[]}', '{"code":"0","msg":""}', '{"code":true,"data":[]}', '{"code":["0"],"data":[]}', "{", '{"code":"0","data":[],}'];
    for (const body of cases) {
      const { http } = stack([{ body }]);
      await expect(http.get(GAS, { chainIndex: "1" }), JSON.stringify(body)).rejects.toMatchObject({ kind: "schema" });
    }
  });

  test("D6: a response above the size cap is too_large and is not parsed", async () => {
    const { http } = stack([{ body: JSON.stringify(envelope(["x".repeat(500)])) }], { maxResponseChars: 100 });
    await expect(http.get(GAS, { chainIndex: "1" })).rejects.toMatchObject({ kind: "too_large" });
  });

  test("D6: a non 2xx answer exposes the provider code but never copies the body into the error", async () => {
    const marker = "PROVIDER-BODY-MARKER-should-not-be-copied";
    const { http } = stack([{ status: 400, body: { code: "51000", msg: "bad parameter", data: [], extra: marker } }]);
    try {
      await http.get(GAS, { chainIndex: "1" });
      throw new Error("deveria falhar");
    } catch (error) {
      expect((error as OnchainosError).kind).toBe("http");
      expect((error as OnchainosError).apiCode).toBe("51000");
      expect(JSON.stringify(error)).not.toContain(marker);
      expect((error as Error).message).not.toContain(marker);
    }
  });
});

describe("D7: secrets never leak", () => {
  function everyRendering(error: unknown): string[] {
    const typed = error as OnchainosError;
    return [typed.message, String(error), JSON.stringify(error), inspect(error, { depth: 8 }), typed.stack ?? "", typed.endpoint, typed.providerMessage ?? ""];
  }

  test("D7: canary credentials and signatures are absent from every error of every failure path", async () => {
    const echo = (text: string): FakeReply => ({ body: { code: "50113", msg: `Invalid ${text}`, data: [] } });
    const scenarios: Array<{ reply: (call: import("./fakes.ts").FakeCall) => FakeReply }> = [
      { reply: (call) => echo(call.headers["OK-ACCESS-KEY"] ?? "") },
      { reply: (call) => echo(`${call.headers["OK-ACCESS-SIGN"]} ${SECRET} ${PASS}`) },
      { reply: (call) => ({ throws: new Error(`connect failed ${call.url} key=${KEY} sign=${call.headers["OK-ACCESS-SIGN"]}`) }) },
      { reply: () => ({ status: 500, body: `server says ${KEY} ${SECRET} ${PASS}` }) },
      { reply: () => ({ status: 401, body: { code: "50111", msg: `bad key ${KEY}`, data: [] } }) },
      { reply: () => ({ status: 200, body: `garbage ${KEY} ${SECRET}` }) },
      { reply: () => ({ status: 200, body: JSON.stringify({ code: "0", msg: SECRET }).slice(0, -3) }) },
    ];
    for (const scenario of scenarios) {
      const clock = makeClock();
      const fake = makeFakeFetch((call) => scenario.reply(call), clock);
      const http = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials: CREDENTIALS, allowNetwork: true });
      let caught: unknown;
      try {
        await http.get(GAS, { chainIndex: "1", note: `secret-ish-query-${KEY}` });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(OnchainosError);
      const signatures = fake.calls.map((call) => call.headers["OK-ACCESS-SIGN"] ?? "").filter((value) => value.length > 0);
      expect(signatures.length).toBeGreaterThan(0);
      for (const rendering of everyRendering(caught)) {
        for (const forbidden of [KEY, SECRET, PASS, ...signatures, "OK-ACCESS", "?chainIndex", "note=", "secret-ish-query"]) {
          expect(rendering.includes(forbidden), `${forbidden} em ${rendering.slice(0, 120)}`).toBe(false);
        }
      }
      expect((caught as Error & { cause?: unknown }).cause).toBeUndefined();
    }
  });

  test("D7: the call events carry only the endpoint path, tier, attempt, status and elapsed time", async () => {
    const events: CallEvent[] = [];
    const { http } = stack([{ status: 429 }, OK()], { onCall: (event) => events.push(event) });
    await http.get(GAS, { chainIndex: "1", leak: KEY });
    expect(events.length).toBe(2);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["attempt", "elapsedMs", "endpoint", "outcome", "status", "tier"]);
      const rendered = JSON.stringify(event);
      for (const forbidden of [KEY, SECRET, PASS, "chainIndex"]) expect(rendered).not.toContain(forbidden);
    }
    expect(events.map((event) => event.outcome)).toEqual(["retry", "ok"]);
  });

  test("D7: the client object exposes no credential in any rendering", () => {
    const { http } = stack([]);
    for (const rendering of [JSON.stringify(http), inspect(http, { depth: 8, showHidden: true }), String(http)]) {
      for (const secret of [KEY, SECRET, PASS]) expect(rendering).not.toContain(secret);
    }
  });

  test("D7: a throwing onCall hook cannot break a read or leak", async () => {
    const { http } = stack([OK([1])], {
      onCall: () => {
        throw new Error(`hook failed ${KEY}`);
      },
    });
    const result = await http.get(GAS, { chainIndex: "1" });
    expect(result.data).toEqual([1]);
  });
});

describe("D8: quota counters by tier", () => {
  test("D8: logical calls and attempts are counted per tier and the cost is known only when no tier is unknown", async () => {
    const { http } = stack([OK(), OK(), { status: 500 }, OK(), OK()]);
    await http.get(CANDLES, { chainIndex: "1" });
    await http.post(FREE, [{ chainIndex: "1", tokenContractAddress: "" }]);
    await http.get({ path: "/api/v6/dex/market/token/holder", tier: "premium" }, { chainIndex: "1" });
    const knownOnly = http.quota.snapshot();
    expect(knownOnly.calls).toEqual({ free: 1, basic: 1, premium: 1, unknown: 0, public: 0 });
    expect(knownOnly.attempts).toEqual({ free: 1, basic: 1, premium: 2, unknown: 0, public: 0 });
    expect(knownOnly.retries).toBe(1);
    expect(knownOnly.totalAttempts).toBe(4);
    expect(knownOnly.costKnown).toBe(true);
    await http.get(GAS, { chainIndex: "1" });
    const withUnknown = http.quota.snapshot();
    expect(withUnknown.attempts.unknown).toBe(1);
    expect(withUnknown.costKnown).toBe(false);
  });

  test("D8: refused and invalid calls consume nothing", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch([OK()]);
    const offline = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep });
    await expect(offline.get(CANDLES)).rejects.toMatchObject({ kind: "offline" });
    const { http } = stack([OK()]);
    await expect(http.get({ path: "bad", tier: "basic" })).rejects.toMatchObject({ kind: "invalid_request" });
    expect(offline.quota.snapshot().totalAttempts).toBe(0);
    expect(http.quota.snapshot().totalAttempts).toBe(0);
  });

  test("D8: a counter can be shared between clients and reports a copy", async () => {
    const quota = new QuotaCounters();
    const first = stack([OK()], { quota });
    const second = stack([OK()], { quota });
    await first.http.get(CANDLES, { chainIndex: "1" });
    await second.http.get(CANDLES, { chainIndex: "1" });
    expect(quota.snapshot().attempts.basic).toBe(2);
    const snapshot = quota.snapshot();
    snapshot.attempts.basic = 99;
    expect(quota.snapshot().attempts.basic).toBe(2);
  });

  test("D8: a failed attempt still counts as consumed, the conservative hypothesis", async () => {
    const { http } = stack([{ status: 400 }]);
    await expect(http.get(CANDLES, { chainIndex: "1" })).rejects.toBeInstanceOf(OnchainosError);
    expect(http.quota.snapshot().attempts.basic).toBe(1);
  });
});
