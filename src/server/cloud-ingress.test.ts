import { expect, test } from "bun:test";
import { createCloudIngress } from "./cloud-ingress";

const token = "a".repeat(64);
const origin = "https://trader.example.com";
const headers = { host: "trader.example.com", "x-inonu-gateway": token, "remote-user": "owner" };
const req = (path = "/", extra: Record<string, string> = {}, method = "GET", body?: string) =>
  new Request(`${origin}${path}`, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body }) });

test("H01: every path requires the gateway secret and the exact authenticated owner", async () => {
  let calls = 0;
  const handle = createCloudIngress({ publicOrigin: origin, gatewayToken: token, owner: "owner", internalOrigin: "http://127.0.0.1:47321", handle: async () => { calls++; return new Response("ok"); } });
  for (const path of ["/", "/_next/static/x.js", "/agent/status", "/settings", "/health"]) {
    for (const patch of [{ "x-inonu-gateway": "" }, { "remote-user": "" }, { "remote-user": "someone" }] as Record<string, string>[]) {
      expect((await handle(req(path, patch))).status).toBe(403);
    }
  }
  expect(calls).toBe(0);
});

test("H02: foreign Host, Origin, Fetch-Site and missing write intent never reach the core", async () => {
  let calls = 0;
  const handle = createCloudIngress({ publicOrigin: origin, gatewayToken: token, owner: "owner", internalOrigin: "http://127.0.0.1:47321", handle: async () => { calls++; return new Response("ok"); } });
  for (const patch of [{ host: "evil.test" }, { origin: "https://evil.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) expect((await handle(req("/agent/status", patch))).status).toBe(403);
  expect((await handle(req("/agent/connect", {}, "POST", "{}"))).status).toBe(403);
  expect((await handle(req("/agent/connect", { origin }, "POST", "{}"))).status).toBe(403);
  expect((await handle(req("/agent/connect", { "x-inonu-intent": "user" }, "POST", "{}"))).status).toBe(403);
  expect(calls).toBe(0);
});

test("H03: valid same-origin requests keep their method, body and query and drop ingress credentials", async () => {
  const seen: Request[] = [];
  const handle = createCloudIngress({ publicOrigin: origin, gatewayToken: token, owner: "owner", internalOrigin: "http://127.0.0.1:47321", handle: async (r, ip) => { expect(ip).toBe("127.0.0.1"); seen.push(r); return new Response("ok", { headers: { "access-control-allow-origin": "http://127.0.0.1:47321" } }); } });
  const get = await handle(req("/agent/ledger?n=2"));
  expect(get.headers.get("access-control-allow-origin")).toBe(origin);
  await handle(req("/agent/connect", { origin, "x-inonu-intent": "user", "content-type": "application/json", cookie: "secret-cookie" }, "POST", '{"disclosure":"test"}'));
  expect(seen[0]!.url).toBe("http://127.0.0.1:47321/agent/ledger?n=2");
  expect(seen[1]!.method).toBe("POST");
  expect(await seen[1]!.text()).toBe('{"disclosure":"test"}');
  expect(seen[1]!.headers.get("origin")).toBe("http://127.0.0.1:47321");
  for (const name of ["cookie", "x-inonu-gateway", "remote-user", "authorization"]) expect(seen[1]!.headers.get(name)).toBeNull();
});

test("ingress configuration rejects insecure origins, weak tokens and path-bearing origins", () => {
  for (const publicOrigin of ["http://trader.example.com", "https://trader.example.com/extra", "https://user:pass@trader.example.com", "https://trader.example.com?x=1"]) {
    expect(() => createCloudIngress({ publicOrigin, gatewayToken: token, owner: "owner", internalOrigin: "http://127.0.0.1:47321", handle: async () => new Response() })).toThrow("cloud_config_invalid");
  }
  expect(() => createCloudIngress({ publicOrigin: origin, gatewayToken: "short", owner: "owner", internalOrigin: "http://127.0.0.1:47321", handle: async () => new Response() })).toThrow("cloud_config_invalid");
});
