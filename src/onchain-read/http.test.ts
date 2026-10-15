import { describe, expect, test } from "bun:test";
import type { GatewayResult, OnchainGateway } from "./gateway";
import { createOnchainHandler, isOnchainPath } from "./http";

const ORIGIN = "http://127.0.0.1:3041";

function fakeGateway(result: GatewayResult = { ok: true, data: [], meta: { tier: "free", cachedAtMs: 1, ageMs: 0, stale: false, budget: { tier: "free", used: 0, cap: null } } }) {
  const calls: Array<{ route: string; params: Record<string, string>; intent: string }> = [];
  const gateway: OnchainGateway = {
    call: async (route, params, intent) => {
      calls.push({ route, params, intent });
      return result;
    },
    budget: () => ({
      month: "2026-10",
      restartedFromCorruptFile: false,
      tiers: {
        free: { used: 3, cap: null, today: 1, projection: 8 },
        basic: { used: 10, cap: 50_000, today: 2, projection: 25 },
        premium: { used: 0, cap: 50_000, today: 0, projection: 0 },
      },
    }),
    status: () => ({ credential: "complete", lastCallMs: 123, lastCode: 0, cooldownUntilMs: null, clockOffsetMs: null }),
  };
  return { gateway, calls };
}

function call(handler: ReturnType<typeof createOnchainHandler>, path: string, init: { method?: string; headers?: Record<string, string>; ip?: string | null; host?: string } = {}) {
  const req = new Request(`http://127.0.0.1:3042${path}`, {
    method: init.method ?? "GET",
    headers: { origin: ORIGIN, host: init.host ?? "127.0.0.1:3042", ...(init.headers ?? {}) },
  });
  return handler(req, init.ip === undefined ? "127.0.0.1" : init.ip);
}

describe("isOnchainPath", () => {
  test("matches /onchain/ only", () => {
    expect(isOnchainPath("/onchain/chains")).toBe(true);
    expect(isOnchainPath("/settings")).toBe(false);
    expect(isOnchainPath("/onchain")).toBe(false);
  });
});

describe("guards", () => {
  test("remote IP, host and origin are enforced in order", async () => {
    const { gateway, calls } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    expect((await call(handler, "/onchain/chains", { ip: "10.0.0.5" })).status).toBe(403);
    expect((await call(handler, "/onchain/chains", { ip: null })).status).toBe(403);
    expect((await call(handler, "/onchain/chains", { host: "evil.example" })).status).toBe(403);
    const badOrigin = new Request("http://127.0.0.1:3042/onchain/chains", { headers: { origin: "https://evil.example", host: "127.0.0.1:3042" } });
    const res = await handler(badOrigin, "127.0.0.1");
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull(); // never echoes an unvalidated origin
    expect(calls).toHaveLength(0);
  });

  test("OPTIONS preflight exposes only GET and the intent header", async () => {
    const { gateway } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    const res = await call(handler, "/onchain/chains", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type, x-inonu-intent");
  });

  test("non-GET methods are 405", async () => {
    const { gateway, calls } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    for (const method of ["POST", "PUT", "DELETE"]) {
      expect((await call(handler, "/onchain/chains", { method })).status).toBe(405);
    }
    expect(calls).toHaveLength(0);
  });

  test("unknown route is a constant 404 before the gateway runs", async () => {
    const { gateway, calls } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    const res = await call(handler, "/onchain/secret-wallet");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
    expect(calls).toHaveLength(0);
  });
});

describe("routes", () => {
  test("budget and status are local", async () => {
    const { gateway, calls } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    const budget = await (await call(handler, "/onchain/budget")).json() as { month: string; tiers: { basic: { used: number; cap: number } } };
    expect(budget.month).toBe("2026-10");
    expect(budget.tiers.basic.used).toBe(10);
    const status = await (await call(handler, "/onchain/status")).json() as { credential: string; lastCode: number };
    expect(status.credential).toBe("complete");
    expect(status.lastCode).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test("provider route passes query params and intent through", async () => {
    const { gateway, calls } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    const res = await call(handler, "/onchain/hot-tokens?chainIndex=501&limit=10", { headers: { "x-inonu-intent": "user" } });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; meta: { stale: boolean } };
    expect(body.ok).toBe(true);
    expect(calls).toEqual([{ route: "/onchain/hot-tokens", params: { chainIndex: "501", limit: "10" }, intent: "user" }]);
  });

  test("absent intent header means background", async () => {
    const { gateway, calls } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    await call(handler, "/onchain/hot-tokens?chainIndex=501");
    expect(calls[0]!.intent).toBe("background");
  });

  test("gateway bad_request maps to 400, domain errors stay 200 envelope", async () => {
    const { gateway: g1 } = fakeGateway({ ok: false, error: "bad_request" });
    const h1 = createOnchainHandler({ gateway: g1, origins: [ORIGIN] });
    expect((await call(h1, "/onchain/chains")).status).toBe(400);

    const { gateway: g2 } = fakeGateway({ ok: false, error: "budget_exhausted" });
    const h2 = createOnchainHandler({ gateway: g2, origins: [ORIGIN] });
    const res = await call(h2, "/onchain/hot-tokens?chainIndex=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: "budget_exhausted" });
  });

  test("every answer is no-store with vary Origin", async () => {
    const { gateway } = fakeGateway();
    const handler = createOnchainHandler({ gateway, origins: [ORIGIN] });
    for (const res of [await call(handler, "/onchain/budget"), await call(handler, "/onchain/nope")]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("vary")).toBe("Origin");
    }
  });
});
