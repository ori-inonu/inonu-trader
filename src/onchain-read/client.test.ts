import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOkxBudget, createOnchainClient, type OkxCredentials } from "./client";
import { signRequest } from "./sign";

const CREDS: OkxCredentials = { apiKey: "TEST-KEY-a77z", secret: "TEST-SECRET-s3cr", passphrase: "TEST PASS 1" };
const REQ = { method: "GET" as const, path: "/api/v6/dex/market/supported/chain" };

function okBody(data: unknown = []) {
  return new Response(JSON.stringify({ code: "0", data, msg: "" }), { status: 200 });
}
function errBody(code: string, msg = "provider internal message") {
  return new Response(JSON.stringify({ code, data: [], msg }), { status: 200 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function within<T>(promise: Promise<T>): Promise<T | "still_pending"> {
  let timer!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<"still_pending">((resolve) => {
      timer = setTimeout(() => resolve("still_pending"), 200);
    })]);
  } finally { clearTimeout(timer); }
}

type FetchCall = { url: string; init: RequestInit | undefined };
function fakeFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(calls[calls.length - 1]!);
  }) as typeof fetch;
  return { calls, f };
}

function testBudget(now: () => number) {
  const dir = mkdtempSync(join(tmpdir(), "okx-budget-"));
  return createOkxBudget({ ledgerPath: join(dir, "ledger.json"), now, random: () => 0.5 });
}

describe("onchain client", () => {
  test("queued payment refusal blocks its endpoint until the next UTC month", async () => {
    let t = Date.UTC(2026, 0, 15);
    const { calls, f } = fakeFetch(() => calls.length === 1 ? new Response("x", { status: 402 }) : okBody());
    const client = createOnchainClient({ credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, budget: testBudget(() => t) });
    const results = await Promise.all([client.call(REQ, "premium"), client.call(REQ, "premium"), client.call(REQ, "free")]);
    expect(results).toEqual([
      { ok: false, error: "provider_payment_required", sent: true },
      { ok: false, error: "provider_payment_required", sent: false },
      { ok: false, error: "provider_payment_required", sent: false },
    ]);
    expect(calls).toHaveLength(1);
    t = Date.UTC(2026, 1, 1);
    expect((await client.call(REQ, "premium")).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test.each([true, false])("credentials are obtained after interval wait, removed=%s", async (removed) => {
    let cred: OkxCredentials | null = CREDS;
    const { calls, f } = fakeFetch(() => okBody());
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => cred, fetch: f, now: Date.now, minIntervalMs: 50 });
    await client.call(REQ, "free");
    const pending = client.call(REQ, "free");
    // Let dispatch enter the interval wait before changing credentials.
    await new Promise((resolve) => setTimeout(resolve, 0));
    cred = removed ? null : { ...CREDS, apiKey: "TEST-ROTATED" };
    const result = await pending;
    if (removed) {
      expect(result).toEqual({ ok: false, error: "no_credentials", sent: false });
      expect(calls).toHaveLength(1);
    } else {
      expect(result.ok).toBe(true);
      expect((calls[1]!.init!.headers as Record<string, string>)["OK-ACCESS-KEY"]).toBe("TEST-ROTATED");
    }
  });

  test.each(["429", "402", "success", "reject"])("ignored abort cannot apply late fetch %s", async (kind) => {
    const late = deferred<Response>();
    const { calls, f } = fakeFetch(() => calls.length === 1 ? late.promise : okBody());
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => CREDS, fetch: f, now: Date.now, minIntervalMs: 0, timeoutMs: 20 });
    const first = client.call(REQ, "premium");
    const second = client.call(REQ, "free");
    try {
      expect(await within(first)).toEqual({ ok: false, error: "provider_error", sent: true });
      expect((await within(second))).toEqual({ ok: true, data: [], sent: true });
      const settled = client.status();
      if (kind === "reject") late.reject(new Error("late test rejection"));
      else late.resolve(new Response(JSON.stringify({ code: "50011", data: ["late"] }), {
        status: kind === "success" ? 200 : Number(kind), headers: { date: new Date(Date.now() + 76_000).toUTCString() },
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(client.status()).toEqual(settled);
      expect((await client.call(REQ, "premium")).ok).toBe(true);
      expect(calls).toHaveLength(3);
    } finally {
      late.resolve(okBody());
      await Promise.all([first, second]);
    }
  });

  test.each([200, 401, 403])("late rejected HTTP %s body is handled after deadline", async (status) => {
    const body = deferred<string>();
    const response = new Response("", { status });
    Object.defineProperty(response, "text", { value: () => body.promise });
    const { calls, f } = fakeFetch(() => calls.length === 1 ? response : okBody());
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => CREDS, fetch: f, now: Date.now, minIntervalMs: 0, timeoutMs: 20 });
    const pending = client.call(REQ, "free");
    try {
      expect(await within(pending)).toEqual({ ok: false, error: "provider_error", sent: true });
      await client.call(REQ, "basic");
      const settled = client.status();
      body.reject(new Error("late body rejection"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(client.status()).toEqual(settled);
    } finally {
      body.resolve("{}");
      await pending;
    }
  });

  test("clock retry uses the same operation deadline and abort signal", async () => {
    const body = deferred<string>();
    const response = okBody();
    Object.defineProperty(response, "text", { value: () => body.promise });
    const t = 1_700_000_000_000;
    const { calls, f } = fakeFetch(() => calls.length === 1
      ? new Response(JSON.stringify({ code: "50102" }), { status: 401, headers: { date: new Date(t + 76_000).toUTCString() } })
      : response);
    const client = createOnchainClient({ budget: testBudget(() => t), credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, timeoutMs: 20 });
    const pending = client.call(REQ, "free");
    try {
      // two physical requests went out (the second is the clock retry), and the result says so: both count against the quota
      expect(await within(pending)).toEqual({ ok: false, error: "provider_error", sent: true, extraDispatches: 1 });
      expect(calls).toHaveLength(2);
      expect(calls[0]!.init!.signal).toBe(calls[1]!.init!.signal);
      expect(calls[1]!.init!.signal!.aborted).toBe(true);
      const settled = client.status();
      body.resolve(JSON.stringify({ code: "0", data: ["late"] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(client.status()).toEqual(settled);
    } finally { body.resolve("{}"); await pending; }
  });
  test.each([200, 401, 403])("deadline covers stalled HTTP %s body and releases queued calls", async (status) => {
    const body = deferred<string>();
    const response = new Response("", { status });
    Object.defineProperty(response, "text", { value: () => body.promise });
    const { calls, f } = fakeFetch(() => calls.length === 1 ? response : okBody());
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => CREDS, fetch: f, now: Date.now, minIntervalMs: 0, timeoutMs: 20 });
    const first = client.call(REQ, "free");
    const second = client.call(REQ, "basic");
    try {
      expect(await within(first)).toEqual({ ok: false, error: "provider_error", sent: true });
      expect(await within(second)).toEqual({ ok: true, data: [], sent: true });
      expect(calls[0]!.init!.signal!.aborted).toBe(true);
      const settled = client.status();
      body.resolve(JSON.stringify({ code: "50011", data: [] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(client.status()).toEqual(settled);
    } finally {
      body.resolve(JSON.stringify({ code: "0", data: [] }));
      await Promise.all([first, second]);
    }
  });
  test.each([429, 50011])("queued calls observe newly opened cooldown %s", async (code) => {
    let t = 1_000_000;
    const { calls, f } = fakeFetch(() => calls.length === 1
      ? code === 429 ? new Response("x", { status: 429 }) : errBody("50011")
      : okBody());
    const client = createOnchainClient({ credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, budget: testBudget(() => t) });
    const results = await Promise.all([client.call(REQ, "free"), client.call(REQ, "basic"), client.call(REQ, "premium")]);
    expect(calls).toHaveLength(1);
    expect(results).toEqual([
      { ok: false, error: "rate_limited", sent: true },
      { ok: false, error: "rate_limited", sent: false },
      { ok: false, error: "rate_limited", sent: false },
    ]);
    t += 1_000;
    expect((await client.call(REQ, "free")).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });
  test("sends OK-ACCESS headers with a signature computed over the exact request", async () => {
    const { calls, f } = fakeFetch(() => okBody([{ chainIndex: "1" }]));
    const client = createOnchainClient({ budget: testBudget(() => 1_700_000_000_000), credentials: () => CREDS, fetch: f, now: () => 1_700_000_000_000, minIntervalMs: 0 });
    const res = await client.call(REQ, "free");
    expect(res.ok).toBe(true);
    const h = calls[0]!.init!.headers as Record<string, string>;
    expect(calls[0]!.url).toBe("https://web3.okx.com/api/v6/dex/market/supported/chain");
    expect(h["OK-ACCESS-KEY"]).toBe("TEST-KEY-a77z");
    expect(h["OK-ACCESS-TIMESTAMP"]).toBe("2023-11-14T22:13:20.000Z");
    expect(h["OK-ACCESS-SIGN"]).toBe(signRequest("TEST-SECRET-s3cr", "2023-11-14T22:13:20.000Z", "GET", REQ.path, ""));
    expect(h["OK-ACCESS-PASSPHRASE"]).toBe("TEST PASS 1");
    expect(calls[0]!.init!.credentials).toBe("omit");
    expect(calls[0]!.init!.cache).toBe("no-store");
    expect(calls[0]!.init!.redirect).toBe("error");
  });

  test("global queue: at most one request per interval", async () => {
    const sentAt: number[] = [];
    const { calls, f } = fakeFetch(() => {
      sentAt.push(Date.now());
      return okBody();
    });
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => CREDS, fetch: f, now: Date.now, minIntervalMs: 40 });
    await Promise.all([client.call(REQ, "free"), client.call(REQ, "free"), client.call(REQ, "free")]);
    expect(calls).toHaveLength(3);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(38); // 2ms timer slack
    expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(38);
  });

  test.each(["secret", "apiKey", "passphrase"] as const)("queue interval starts at fetch after delayed %s preparation", async (field) => {
    let reads = 0;
    const credential = { ...CREDS };
    Object.defineProperty(credential, field, {
      get() {
        reads += 1;
        if (reads === 1) {
          const end = performance.now() + 80;
          while (performance.now() < end) { /* Simulate a synchronous pause during request preparation. */ }
        }
        return CREDS[field];
      }
    });
    const sentAt: number[] = [];
    const monotonic: number[] = [];
    const { calls, f } = fakeFetch(() => {
      sentAt.push(Date.now());
      monotonic.push(performance.now());
      return okBody();
    });
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => credential, fetch: f, now: Date.now, minIntervalMs: 40 });
    const results = await Promise.all([client.call(REQ, "free"), client.call(REQ, "free")]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(38);
    expect(monotonic[1]! - monotonic[0]!).toBeGreaterThanOrEqual(38);
  });

  test("queue interval starts at fetch after delayed URL preparation", async () => {
    let reads = 0;
    const request = {
      method: "GET" as const,
      get path() {
        reads += 1;
        if (reads === 2) {
          const end = performance.now() + 80;
          while (performance.now() < end) { /* Pause while preparing the URL, after signing. */ }
        }
        return REQ.path;
      },
    };
    const sentAt: number[] = [];
    const monotonic: number[] = [];
    const { calls, f } = fakeFetch(() => {
      sentAt.push(Date.now());
      monotonic.push(performance.now());
      return okBody();
    });
    const client = createOnchainClient({ budget: testBudget(Date.now), credentials: () => CREDS, fetch: f, now: Date.now, minIntervalMs: 40 });
    const results = await Promise.all([client.call(request, "free"), client.call(REQ, "free")]);
    expect(results.every((result) => result.ok && result.sent)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(38);
    expect(monotonic[1]! - monotonic[0]!).toBeGreaterThanOrEqual(38);
  });

  test("queue interval starts at transport entry after delayed fetch lookup", async () => {
    let reads = 0;
    const sentAt: number[] = [];
    const monotonic: number[] = [];
    const { calls, f } = fakeFetch(() => {
      sentAt.push(Date.now());
      monotonic.push(performance.now());
      return okBody();
    });
    const client = createOnchainClient({
      budget: testBudget(Date.now),
      credentials: () => CREDS,
      get fetch() {
        reads += 1;
        if (reads === 1) {
          const end = performance.now() + 80;
          while (performance.now() < end) { /* Pause while looking up the transport. */ }
        }
        return f;
      },
      now: Date.now,
      minIntervalMs: 40,
    });
    const results = await Promise.all([client.call(REQ, "free"), client.call(REQ, "free")]);
    expect(results.every((result) => result.ok && result.sent)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(38);
    expect(monotonic[1]! - monotonic[0]!).toBeGreaterThanOrEqual(38);
  });

  test("no credentials -> no_credentials, never touches fetch", async () => {
    const { calls, f } = fakeFetch(() => okBody());
    const client = createOnchainClient({ budget: testBudget(() => 0), credentials: () => null, fetch: f, now: () => 0, minIntervalMs: 0 });
    const res = await client.call(REQ, "basic");
    expect(res).toEqual({ ok: false, error: "no_credentials", sent: false });
    expect(calls).toHaveLength(0);
  });

  test.each([
    ["401", new Response("x", { status: 401 }), "provider_unauthorized"],
    ["403", new Response("x", { status: 403 }), "provider_unauthorized"],
    ["429", new Response("x", { status: 429 }), "rate_limited"],
    ["500", new Response("x", { status: 500 }), "provider_error"],
    ["code 50111", null, "provider_unauthorized"],
    ["code 50114", null, "provider_unauthorized"],
    ["code 50011", null, "rate_limited"],
    ["code 99999", null, "provider_error"],
  ])("maps %s to %s", async (_name, res, expected) => {
    const { f } = fakeFetch(() => (res instanceof Response ? res : errBody(String(_name).split(" ")[1]!)));
    const client = createOnchainClient({ budget: testBudget(() => Date.now()), credentials: () => CREDS, fetch: f, now: () => Date.now(), minIntervalMs: 0 });
    const out = await client.call(REQ, "basic");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error as string).toBe(expected);
  });

  test("network throw, timeout and invalid JSON are provider_error", async () => {
    const { f } = fakeFetch(() => { throw new Error("socket died"); });
    const client = createOnchainClient({ budget: testBudget(() => 0), credentials: () => CREDS, fetch: f, now: () => 0, minIntervalMs: 0 });
    const r1 = await client.call(REQ, "free");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe("provider_error");

    const slow = createOnchainClient({
      budget: testBudget(() => Date.now()),
      credentials: () => CREDS,
      // hangs until the client's AbortController fires, like a stalled socket
      fetch: ((...args: unknown[]) => new Promise<Response>((_res, rej) => {
        const init = args[1] as RequestInit | undefined;
        init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      })) as typeof fetch,
      now: () => Date.now(),
      minIntervalMs: 0,
      timeoutMs: 25,
    });
    const r2 = await slow.call(REQ, "free");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("provider_error");

    const badJson = createOnchainClient({ budget: testBudget(() => 0), credentials: () => CREDS, fetch: (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch, now: () => 0, minIntervalMs: 0 });
    const r3 = await badJson.call(REQ, "free");
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error).toBe("provider_error");
  });

  test("envelope without data -> schema; oversized body refused", async () => {
    const { f } = fakeFetch(() => new Response(JSON.stringify({ code: "0", msg: "x" }), { status: 200 }));
    const client = createOnchainClient({ budget: testBudget(() => 0), credentials: () => CREDS, fetch: f, now: () => 0, minIntervalMs: 0 });
    const r = await client.call(REQ, "free");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("schema");

    const big = createOnchainClient({ budget: testBudget(() => 0), credentials: () => CREDS, fetch: (async () => okBody("x".repeat(100))) as unknown as typeof fetch, now: () => 0, minIntervalMs: 0, maxBytes: 50 });
    const r2 = await big.call(REQ, "free");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("provider_error");
  });

  test("402 blocks the endpoint without a send, whatever the tier", async () => {
    let t = 1_000_000;
    const { calls, f } = fakeFetch(() => new Response("x", { status: 402 }));
    const client = createOnchainClient({ credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, budget: testBudget(() => t) });
    const r1 = await client.call(REQ, "premium");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe("provider_payment_required");
    const r2 = await client.call(REQ, "free");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("provider_payment_required");
    expect(r2.sent).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test("429 opens a jittered backoff cooldown (jitter 0.5 -> 500 ms) that short-circuits later calls", async () => {
    let t = 1_000_000;
    const { calls, f } = fakeFetch(() => new Response("x", { status: 429 }));
    const client = createOnchainClient({ credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, budget: testBudget(() => t) });
    await client.call(REQ, "free");
    t += 100;
    const r = await client.call(REQ, "free");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("rate_limited");
    expect(calls).toHaveLength(1);
    expect(client.status().cooldownUntilMs).toBe(1_000_500);
    t += 1_000;
    const r2 = await client.call(REQ, "free");
    expect(r2.ok).toBe(false);
    expect(calls).toHaveLength(2);
    const st = client.status();
    expect(st.lastCallMs).toBe(t);
    expect(st.lastCode).toBe(429);
  });

  test("402 persists in the ledger, so a restarted client is still blocked", async () => {
    let t = Date.UTC(2026, 0, 15);
    const dir = mkdtempSync(join(tmpdir(), "okx-budget-"));
    const ledgerPath = join(dir, "ledger.json");
    const { calls, f } = fakeFetch(() => calls.length === 1 ? new Response("x", { status: 402 }) : okBody());
    const first = createOnchainClient({ credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, budget: createOkxBudget({ ledgerPath, now: () => t }) });
    expect(await first.call(REQ, "free")).toEqual({ ok: false, error: "provider_payment_required", sent: true });
    const restarted = createOnchainClient({ credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0, budget: createOkxBudget({ ledgerPath, now: () => t }) });
    expect(await restarted.call(REQ, "free")).toEqual({ ok: false, error: "provider_payment_required", sent: false });
    expect(calls).toHaveLength(1);
    t = Date.UTC(2026, 1, 1);
    expect((await restarted.call(REQ, "free")).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("provider msg never propagates and credentials never appear in results", async () => {
    const { f } = fakeFetch(() => errBody("99001", "leaks TEST-SECRET-s3cr and TEST-KEY-a77z"));
    const client = createOnchainClient({ budget: testBudget(() => 0), credentials: () => CREDS, fetch: f, now: () => 0, minIntervalMs: 0 });
    const r = await client.call(REQ, "free");
    const s = JSON.stringify(r);
    expect(s).not.toContain("leaks");
    expect(s).not.toContain("TEST-SECRET");
    expect(s).not.toContain("TEST-KEY");
    expect(s).not.toContain("TEST PASS");
    if (!r.ok) expect(r.error).toBe("provider_error");
  });
});

describe("clock skew handling", () => {
  /**
    * A fake provider whose clock runs 76 s ahead of deps.now(): it answers 401/50102 to any
    * OK-ACCESS-TIMESTAMP farther than 30 s from its clock and always returns a Date header.
    */
  function skewedServer(localNow: () => number, alwaysFail = false) {
    const calls: FetchCall[] = [];
    const serverNow = () => localNow() + 76_000;
    const f = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(_url), init });
      const ts = Date.parse((init?.headers as Record<string, string>)["OK-ACCESS-TIMESTAMP"] ?? "");
      const headers = { date: new Date(serverNow()).toUTCString(), "content-type": "application/json" };
      if (alwaysFail || !Number.isFinite(ts) || Math.abs(ts - serverNow()) > 30_000) {
        return new Response(JSON.stringify({ code: "50102", msg: "Timestamp request expired" }), { status: 401, headers });
      }
      return new Response(JSON.stringify({ code: "0", data: [], msg: "" }), { status: 200, headers });
    }) as typeof fetch;
    return { calls, f };
  }

  test("learns the offset from the Date header and retries 50102 once in the same slot", async () => {
    let t = 1_700_000_000_000;
    const { calls, f } = skewedServer(() => t);
    const client = createOnchainClient({ budget: testBudget(() => t), credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0 });

    const r1 = await client.call(REQ, "free");
    expect(r1.ok).toBe(true);
    expect(calls).toHaveLength(2); // first signed with the wrong clock, retried with the learned offset
    const ts2 = Date.parse((calls[1]!.init!.headers as Record<string, string>)["OK-ACCESS-TIMESTAMP"]!);
    expect(Math.abs(ts2 - (t + 76_000))).toBeLessThanOrEqual(2_000);
    expect(client.status().clockOffsetMs).not.toBeNull();
    expect(Math.abs(client.status().clockOffsetMs! - 76_000)).toBeLessThanOrEqual(1_000);

    const r2 = await client.call(REQ, "free");
    expect(r2.ok).toBe(true);
    expect(calls).toHaveLength(3); // offset already learned: one request only
  });

  test("the call says when it took a second physical request (the 50102 retry), so the caller can count every one that went out", async () => {
    let t = 1_700_000_000_000;
    const { calls, f } = skewedServer(() => t);
    const client = createOnchainClient({ budget: testBudget(() => t), credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0 });
    const first = await client.call(REQ, "free");
    expect(calls).toHaveLength(2);
    expect(first).toMatchObject({ ok: true, sent: true, extraDispatches: 1 });
    // the offset is learned: one request only, and nothing extra is said
    const second = await client.call(REQ, "free");
    expect(calls).toHaveLength(3);
    expect(second).not.toHaveProperty("extraDispatches");
    // a retry that fails again still counts the second request
    const t2 = 1_700_000_000_000;
    const failing = skewedServer(() => t2, true);
    const stuck = createOnchainClient({ budget: testBudget(() => t2), credentials: () => CREDS, fetch: failing.f, now: () => t2, minIntervalMs: 0 });
    expect(await stuck.call(REQ, "free")).toMatchObject({ ok: false, error: "clock_skew", extraDispatches: 1 });
  });

  test("a second 50102 inside the same call reports clock_skew, not unauthorized", async () => {
    const t = 1_700_000_000_000;
    const { calls, f } = skewedServer(() => t, true);
    const client = createOnchainClient({ budget: testBudget(() => t), credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0 });
    const r = await client.call(REQ, "free");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("clock_skew");
    expect(calls).toHaveLength(2); // retried once, then gave up
  });

  test("50102 with a Date near the used offset reports clock_skew without retrying", async () => {
    const t = 1_700_000_000_000;
    const calls: FetchCall[] = [];
    const f = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(_url), init });
      return new Response(JSON.stringify({ code: "50102", msg: "x" }), { status: 401, headers: { date: new Date(t + 1_000).toUTCString() } });
    }) as typeof fetch;
    const client = createOnchainClient({ budget: testBudget(() => t), credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0 });
    const r = await client.call(REQ, "free");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("clock_skew");
    expect(calls).toHaveLength(1);
  });

  test("401 with an auth code stays provider_unauthorized", async () => {
    const { calls, f } = fakeFetch(() =>
      new Response(JSON.stringify({ code: "50111", msg: "Invalid OK-ACCESS-KEY" }), { status: 401 }));
    const client = createOnchainClient({ budget: testBudget(() => Date.now()), credentials: () => CREDS, fetch: f, now: () => Date.now(), minIntervalMs: 0 });
    const r = await client.call(REQ, "free");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("provider_unauthorized");
    expect(calls).toHaveLength(1);
  });

  test("401 with a non-JSON body stays provider_unauthorized", async () => {
    const { f } = fakeFetch(() => new Response("denied", { status: 401 }));
    const client = createOnchainClient({ budget: testBudget(() => Date.now()), credentials: () => CREDS, fetch: f, now: () => Date.now(), minIntervalMs: 0 });
    const r = await client.call(REQ, "free");
    if (!r.ok) expect(r.error).toBe("provider_unauthorized");
  });

  test.each(["50103", "50104", "50105", "50112", "50113"])("body code %s maps to provider_unauthorized", (code) => {
    return (async () => {
      const { f } = fakeFetch(() => errBody(code));
      const client = createOnchainClient({ budget: testBudget(() => Date.now()), credentials: () => CREDS, fetch: f, now: () => Date.now(), minIntervalMs: 0 });
      const r = await client.call(REQ, "basic");
      if (!r.ok) expect(r.error).toBe("provider_unauthorized");
    })();
  });

  test("body code 50038 maps to unsupported_chain", async () => {
    const { f } = fakeFetch(() => errBody("50038", "This chain does not currently support"));
    const client = createOnchainClient({ budget: testBudget(() => Date.now()), credentials: () => CREDS, fetch: f, now: () => Date.now(), minIntervalMs: 0 });
    const r = await client.call(REQ, "basic");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unsupported_chain");
  });

  test("a small measured skew is not applied and clockOffsetMs is still reported", async () => {
    const t = 1_700_000_000_000;
    const { calls, f } = fakeFetch(() =>
      new Response(JSON.stringify({ code: "0", data: [], msg: "" }), { status: 200, headers: { date: new Date(t + 3_000).toUTCString() } }));
    const client = createOnchainClient({ budget: testBudget(() => t), credentials: () => CREDS, fetch: f, now: () => t, minIntervalMs: 0 });
    await client.call(REQ, "free");
    const ts = Date.parse((calls[0]!.init!.headers as Record<string, string>)["OK-ACCESS-TIMESTAMP"]!);
    expect(ts).toBe(t); // 3 s skew stays below the 10 s threshold
    expect(client.status().clockOffsetMs).not.toBeNull();
  });
});
