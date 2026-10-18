import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { utils } from "ethers";
import { createRpcReadAdapter, type RpcReadInput } from "./rpc-read.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";
const HASH = `0x${"ab".repeat(32)}`;
const MAX = (2n ** 256n - 1n).toString();
const word = (value: string | number | bigint) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const input = (patch: Partial<RpcReadInput> = {}): RpcReadInput => ({ address: WALLET, chainIndex: "196",
  identityKey: createHash("sha256").update(`196:${WALLET}`).digest("hex"), revision: 7,
  correlationId: "read-7", tokens: [TOKEN], spender: SPENDER, ...patch });
type Request = { jsonrpc: string; id: number; method: string; params: unknown[] };
function transport(override?: (request: Request, index: number) => unknown) {
  const requests: Request[] = [];
  const fetch = async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as Request;
    requests.push(request);
    const result = override?.(request, requests.length - 1) ?? ({
      eth_chainId: "0xc4", eth_getBlockByNumber: { number: "0x10", hash: HASH },
      eth_getBalance: "0x20000000000001", eth_getCode: "0x6001600055",
      eth_call: (request.params[0] as { data?: string })?.data?.startsWith("0x313ce567") ? word(6) : word(MAX),
    } as Record<string, unknown>)[request.method];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { status: 200 });
  };
  return { fetch, requests };
}

describe("RPC read public snapshot", () => {
  test.each([{ timeoutMs: 10_001 }, { maxTokens: 9 }, { maxTokens: -1 }, { maxResponseBytes: 32_769 },
    { maxTotalBytes: 262_145 }, { ttlMs: 60_001 }, { timeoutMs: 0 }, { maxResponseBytes: NaN }, { ttlMs: Infinity }])(
    "caller cannot relax finite budgets: %j", limits => {
      const http = transport();
      expect(() => createRpcReadAdapter({ fetch: http.fetch, ...limits })).toThrow("invalid-rpc-options");
      expect(http.requests).toEqual([]);
    });
  test("native sentinel is excluded from ERC20 requests", async () => {
    const http = transport();
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input({ tokens: [`0x${"ee".repeat(20)}`] }));
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.reasons).toContain("invalid-input");
    expect(http.requests).toEqual([]);
  });
  test("async input mutation cannot mix identity/revision/token observations", async () => {
    const requestInput = input();
    const expectedKey = requestInput.identityKey;
    const http = transport();
    const snapshot = await createRpcReadAdapter({ fetch: async (url, init) => {
      if (http.requests.length === 0) {
        requestInput.address = SPENDER; requestInput.revision = 9; requestInput.tokens = [SPENDER];
        requestInput.identityKey = createHash("sha256").update(`196:${SPENDER}`).digest("hex");
      }
      return http.fetch(url, init);
    } }).read(requestInput);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.context).toMatchObject({ identityKey: expectedKey, revision: 7 });
    expect(snapshot.tokens[0]?.token).toBe(TOKEN);
    expect(http.requests.find(r => r.method === "eth_getBalance")?.params[0]).toBe(WALLET);
    expect(http.requests.find(r => r.method === "eth_getCode")?.params[0]).toBe(TOKEN);
  });
  test("canonical chain quantities compare numerically", async () => {
    const http = transport(r => r.method === "eth_chainId" ? "0xC4" : undefined);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input());
    expect(snapshot.status).toBe("ready");
    expect(snapshot.blockConsistent).toBe(true);
  });
  test("Monad zero values remain known and unrequested allowance remains null", async () => {
    const http = transport(r => r.method === "eth_chainId" ? "0x8f" : r.method === "eth_getBalance" ? "0x0"
      : r.method === "eth_call" ? word(0) : undefined);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input({ chainIndex: "143", spender: undefined,
      identityKey: createHash("sha256").update(`143:${WALLET}`).digest("hex") }));
    expect(snapshot.status).toBe("ready");
    expect(snapshot.nativeBalanceRaw).toBe("0");
    expect(snapshot.nativeDecimals).toBe(18);
    expect(snapshot.tokens[0]).toMatchObject({ rawBalance: "0", decimals: 0, allowanceRaw: null, allowanceRequested: false });
    expect(http.requests.filter(r => r.method === "eth_call")).toHaveLength(2);
    expect(snapshot.receipts.every(r => r.endpoint === "rpc.monad.xyz")).toBe(true);
  });
  test.each([
    { selector: "0x70a08231", field: "rawBalance", reason: "token-balance-unavailable" },
    { selector: "0xdd62ed3e", field: "allowanceRaw", reason: "token-allowance-unavailable" },
  ])("missing token integer remains null after a consistent block reread: %j", async fixture => {
    const http = transport(r => r.method === "eth_call" && (r.params[0] as { data: string }).data.startsWith(fixture.selector) ? "0x" : undefined);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.blockConsistent).toBe(true);
    expect(snapshot.tokens[0]?.[fixture.field as "rawBalance" | "allowanceRaw"]).toBeNull();
    expect(snapshot.tokens[0]?.decimals).toBe(6);
    expect(snapshot.tokens[0]?.reasons).toContain(fixture.reason);
  });
  test("deadline is shared across successive small responses", async () => {
    const http = transport();
    let calls = 0;
    const snapshot = await createRpcReadAdapter({ timeoutMs: 30, fetch: async (url, init) => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return http.fetch(url, init);
    } }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.reasons).toContain("read-timeout");
    expect(calls).toBe(2);
    expect(snapshot.blockConsistent).toBe(false);
  });
  test("pre-aborted consent lifecycle performs no HTTP", async () => {
    const http = transport();
    const controller = new AbortController();
    controller.abort(`${WALLET} private-reason`);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input(), controller.signal);
    expect(snapshot.reasons).toContain("read-aborted");
    expect(http.requests).toEqual([]);
    expect(snapshot.nativeBalanceRaw).toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(/private-reason|1111111111111111111111111111111111111111/);
  });
  test("abort settles an ignoring transport and prevents every later RPC", async () => {
    const controller = new AbortController();
    let calls = 0;
    let transportSignal: AbortSignal | null | undefined;
    const pending = createRpcReadAdapter({ fetch: async (_url, init) => {
      calls++; transportSignal = init.signal;
      queueMicrotask(() => controller.abort(WALLET));
      return new Promise<Response>(() => {});
    } }).read(input(), controller.signal);
    let guard: ReturnType<typeof setTimeout>;
    const snapshot = await Promise.race([pending, new Promise<null>(resolve => { guard = setTimeout(() => resolve(null), 150); })]);
    clearTimeout(guard!);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.reasons).toContain("read-aborted");
    expect(transportSignal?.aborted).toBe(true);
    expect(calls).toBe(1);
    expect(snapshot?.receipts[0]).toMatchObject({ outcome: "blocked", reason: "read-aborted" });
  });
  test("total deadline covers a stalled response body and cancels its stream", async () => {
    const http = transport();
    let calls = 0;
    let cancelled = false;
    const pending = createRpcReadAdapter({ timeoutMs: 25, fetch: async (url, init) => {
      if (++calls !== 4) return http.fetch(url, init);
      return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
    } }).read(input());
    let guard: ReturnType<typeof setTimeout>;
    const snapshot = await Promise.race([pending, new Promise<null>(resolve => { guard = setTimeout(() => resolve(null), 150); })]);
    clearTimeout(guard!);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.reasons).toContain("read-timeout");
    expect(snapshot?.nativeBalanceRaw).toBeNull();
    expect(snapshot?.tokens[0]?.codeHash).toBeNull();
    expect(calls).toBe(4);
    expect(cancelled).toBe(true);
  });
  test.each([
    { limits: { maxResponseBytes: 128 }, reason: "response-too-large", calls: 1 },
    { limits: { maxTotalBytes: 100 }, reason: "total-response-too-large", calls: 2 },
  ])("stream byte budget is enforced before decoding and stops subsequent RPCs: %j", async fixture => {
    const http = transport();
    let calls = 0;
    let cancelled = false;
    const snapshot = await createRpcReadAdapter({ timeoutMs: 50, ...fixture.limits, fetch: async (url, init) => {
      calls++;
      if (fixture.calls === 2) return http.fetch(url, init);
      const request = JSON.parse(String(init.body)) as Request;
      const bytes = new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0xc4", extra: "é".repeat(40) }));
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(bytes.slice(0, 60)); controller.enqueue(bytes.slice(60));
      }, cancel() { cancelled = true; } }));
    } }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.reasons).toContain(fixture.reason);
    expect(snapshot.nativeBalanceRaw).toBeNull();
    expect(calls).toBe(fixture.calls);
    expect(snapshot.receipts.at(-1)).toMatchObject({ outcome: "blocked", reason: fixture.reason });
    if (fixture.calls === 1) expect(cancelled).toBe(true);
  });
  test.each([
    { body: { jsonrpc: "2.0", id: 999, result: "0xc4" }, status: 200, reason: "rpc-envelope-invalid" },
    { body: { jsonrpc: "1.0", id: 1, result: "0xc4" }, status: 200, reason: "rpc-envelope-invalid" },
    { body: { jsonrpc: "2.0", id: 1, result: "0xc4", error: { code: -1, message: WALLET } }, status: 200, reason: "rpc-envelope-invalid" },
    { body: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: `${WALLET} secret-query` } }, status: 200, reason: "rpc-error" },
    { body: { jsonrpc: "2.0", id: 1, result: "0xc4" }, status: 503, reason: "http-error" },
    { body: { jsonrpc: "2.0", id: 1 }, status: 200, reason: "rpc-envelope-invalid" },
  ])("HTTP/JSON-RPC correlation and errors are bounded and sanitized: %j", async fixture => {
    let calls = 0;
    const http = transport();
    const snapshot = await createRpcReadAdapter({ endpoints: { "196": "https://rpc.example/read?secret=hidden" },
      fetch: async (url, init) => ++calls === 1 ? new Response(JSON.stringify(fixture.body), { status: fixture.status }) : http.fetch(url, init)
    }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.reasons).toContain(fixture.reason);
    expect(calls).toBe(1);
    expect(snapshot.receipts[0]).toMatchObject({ endpoint: "rpc.example", httpStatus: fixture.status, outcome: "blocked", reason: fixture.reason });
    expect(JSON.stringify(snapshot)).not.toMatch(/secret-query|hidden|1111111111111111111111111111111111111111|"params":|"calldata":/);
  });
  test.each(["0x", "0x0", "0xzz"]) ("missing/malformed runtime code prevents ERC20 calls: %j", async code => {
    const http = transport(r => r.method === "eth_getCode" ? code : undefined);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.blockConsistent).toBe(true);
    expect(snapshot.tokens[0]).toMatchObject({ rawBalance: null, decimals: null, codeHash: null, allowanceRaw: null });
    expect(snapshot.tokens[0]?.reasons).toContain("token-code-unavailable");
    expect(http.requests.some(r => r.method === "eth_call")).toBe(false);
  });
  test.each(["0x", "0x01", word(256), `${word(6)}${"00".repeat(32)}`, null])(
    "invalid token unit stays null while preserving exact observed balance: %j", async unit => {
      const http = transport();
      const snapshot = await createRpcReadAdapter({ fetch: async (url, init) => {
        const r = JSON.parse(String(init.body)) as Request;
        return r.method === "eth_call" && (r.params[0] as { data: string }).data === "0x313ce567"
          ? new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: unit })) : http.fetch(url, init);
      } }).read(input());
      expect(snapshot.status).toBe("blocked");
      expect(snapshot.blockConsistent).toBe(true);
      expect(snapshot.tokens[0]?.rawBalance).toBe(MAX);
      expect(snapshot.tokens[0]?.decimals).toBeNull();
      expect(snapshot.tokens[0]?.allowanceRaw).toBe(MAX);
      expect(snapshot.tokens[0]?.reasons).toContain("token-unit-invalid");
      expect(snapshot.reasons).toContain("token-read-incomplete");
    });
  test.each([
    { identityKey: "0".repeat(64) }, { revision: -1 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { correlationId: WALLET }, { correlationId: "x".repeat(129) }, { correlationId: "bad\ncontext" },
    { address: "not-an-address" }, { chainIndex: "1" as "196" }, { tokens: [TOKEN, TOKEN.toUpperCase()] },
    { tokens: [WALLET] }, { tokens: ["bad"] }, { spender: "bad" },
    { tokens: Array.from({ length: 9 }, (_, i) => `0x${(i + 10).toString(16).padStart(40, "0")}`) },
  ])("invalid/private context is blocked before HTTP: %j", async patch => {
    const http = transport();
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input(patch));
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.reasons).toContain("invalid-input");
    expect(http.requests).toEqual([]);
    expect(snapshot.tokens).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain(WALLET);
  });
  test("missing endpoint blocks locally", async () => {
    const http = transport();
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch, endpoints: {} }).read(input());
    expect(snapshot.reasons).toContain("endpoint-unavailable");
    expect(http.requests).toEqual([]);
  });
  test.each(["0x", "0x01", `0x1${"0".repeat(64)}`, -1, null])("native invalid quantity stays unknown: %j", async raw => {
    const http = transport();
    const snapshot = await createRpcReadAdapter({ fetch: async (url, init) => {
      const r = JSON.parse(String(init.body)) as Request;
      return r.method === "eth_getBalance" ? new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: raw }))
        : http.fetch(url, init);
    } }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.nativeBalanceRaw).toBeNull();
    expect(snapshot.reasons).toContain("invalid-quantity");
  });
  test.each([null, { number: "0x00", hash: HASH }, { number: "0x10", hash: "bad" }])(
    "invalid block context prevents dependent reads: %j", async block => {
      const http = transport();
      const snapshot = await createRpcReadAdapter({ fetch: async (url, init) => {
        const r = JSON.parse(String(init.body)) as Request;
        return r.method === "eth_getBlockByNumber"
          ? new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: block })) : http.fetch(url, init);
      } }).read(input());
      expect(snapshot.reasons).toContain("invalid-block");
      expect(snapshot.nativeBalanceRaw).toBeNull();
      expect(snapshot.tokens).toEqual([]);
      expect(http.requests.map(r => r.method)).toEqual(["eth_chainId"]);
    });
  test("wrong chain blocks before sending any wallet or token read", async () => {
    const http = transport(r => r.method === "eth_chainId" ? "0x8f" : undefined);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.reasons).toContain("chain-mismatch");
    expect(snapshot.nativeBalanceRaw).toBeNull();
    expect(snapshot.tokens).toEqual([]);
    expect(http.requests.map(r => r.method)).toEqual(["eth_chainId"]);
  });
  test.each([
    { number: "0x10", hash: `0x${"cd".repeat(32)}` },
    { number: "0x11", hash: HASH },
  ])("final hash/number mismatch invalidates every block-dependent value: %j", async finalBlock => {
    const http = transport(r => r.method === "eth_getBlockByNumber" && r.params[0] !== "latest" ? finalBlock : undefined);
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch }).read(input());
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.blockConsistent).toBe(false);
    expect(snapshot.reasons).toContain("block-changed");
    expect(snapshot.nativeBalanceRaw).toBeNull();
    expect(snapshot.tokens[0]).toMatchObject({ rawBalance: null, decimals: null, codeHash: null, allowanceRaw: null });
    expect(snapshot.tokens[0]?.reasons).toContain("block-unverified");
  });
  test("keeps exact integers and every wallet/token read on one explicit block without signing", async () => {
    const http = transport();
    const snapshot = await createRpcReadAdapter({ fetch: http.fetch, now: () => 1000 }).read(input());
    expect(snapshot.status).toBe("ready");
    expect(snapshot.context).toMatchObject({ identityKey: input().identityKey, chainIndex: "196", revision: 7,
      correlationId: "read-7", blockNumber: "0x10", blockHash: HASH, observedAtMs: 1000, expiresAtMs: 61000 });
    expect(snapshot.nativeBalanceRaw).toBe("9007199254740993");
    expect(snapshot.nativeDecimals).toBe(18);
    expect(snapshot.tokens[0]).toMatchObject({ token: TOKEN, rawBalance: MAX, decimals: 6,
      codeHash: utils.keccak256("0x6001600055"), allowanceRaw: MAX });
    expect(snapshot).toMatchObject({ source: "evm-rpc-read", mode: "unverified", exercisedReal: false,
      financiallyQualified: false, executionEnabled: false, deployment: null, decoder: null });
    expect(http.requests.map(r => r.method)).toEqual(["eth_chainId", "eth_getBlockByNumber", "eth_getBalance",
      "eth_getCode", "eth_call", "eth_call", "eth_call", "eth_getBlockByNumber"]);
    expect(http.requests.slice(2, -1).every(r => r.params.at(-1) === "0x10")).toBe(true);
    expect(http.requests.at(-1)?.params).toEqual(["0x10", false]);
    expect(http.requests.filter(r => r.method === "eth_call").map(r =>
      (r.params[0] as { data: string }).data.slice(0, 10))).toEqual(["0x70a08231", "0x313ce567", "0xdd62ed3e"]);
    expect(JSON.stringify(snapshot)).not.toContain(WALLET);
    expect(snapshot.receipts.every(r => r.endpoint === "rpc.xlayer.tech" && r.httpMethod === "POST")).toBe(true);
  });
});
