import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore, type SecretId } from "./store";
import { createSettingsHandler, isSettingsPath } from "./http";

/** Handlers are exercised in-process: no socket is opened and every store lives in a temp dir. */

const ORIGIN = "http://localhost:3041";
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jev-settings-http-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function setup(over: Partial<Parameters<typeof createSettingsHandler>[0]> = {}) {
  const store = createSettingsStore(tempDir(), { runtimeKey: () => null });
  const probed: { apiKey: string; secret: string; passphrase: string }[] = [];
  const handler = createSettingsHandler({
    store,
    origins: [ORIGIN, "http://127.0.0.1:3041"],
    probeOnchainos: async (c) => {
      probed.push(c);
      return { ok: true, code: "chains_listed" };
    },
    ...over,
  });
  return { store, handler, probed };
}

type Init = { method?: string; body?: string; headers?: Record<string, string>; ip?: string | null; host?: string; origin?: string | null };
function req(path: string, init: Init = {}) {
  const headers: Record<string, string> = {
    host: init.host ?? "127.0.0.1:3000",
    "x-inonu-settings": "1",
    ...(init.origin !== null ? { origin: init.origin ?? ORIGIN } : {}),
    ...(init.headers ?? {}),
  };
  return new Request(`http://127.0.0.1:3000${path}`, { method: init.method ?? "GET", headers, body: init.body });
}
const call = (handler: ReturnType<typeof createSettingsHandler>, path: string, init: Init = {}) =>
  handler(req(path, init), init.ip === undefined ? "127.0.0.1" : init.ip);

describe("isSettingsPath", () => {
  test("matches the root and subpaths only", () => {
    expect(isSettingsPath("/settings")).toBe(true);
    expect(isSettingsPath("/settings/secrets")).toBe(true);
    expect(isSettingsPath("/settingsX")).toBe(false);
    expect(isSettingsPath("/")).toBe(false);
  });
});

describe("guards", () => {
  test.each([
    ["remote ip not loopback", { ip: "10.0.0.5" }],
    ["remote ip null", { ip: null }],
    ["host not loopback", { host: "example.com" }],
    ["host missing", { host: "" }],
    ["origin missing", { origin: null }],
    ["origin not allowed", { origin: "http://evil.example" }],
  ])("GET /settings fails closed: %s", async (_name, init) => {
    const { handler } = setup();
    const res = await call(handler, "/settings", init);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: "forbidden" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("accepts ipv6 and mapped loopback plus [::1] host", async () => {
    const { handler } = setup();
    expect((await call(handler, "/settings", { ip: "::1" })).status).toBe(200);
    expect((await call(handler, "/settings", { ip: "::ffff:127.0.0.1" })).status).toBe(200);
    expect((await call(handler, "/settings", { host: "[::1]:3000" })).status).toBe(200);
    expect((await call(handler, "/settings", { host: "localhost:3000" })).status).toBe(200);
  });

  test("missing or wrong x-inonu-settings header is 403", async () => {
    const { handler } = setup();
    const res = await handler(new Request("http://127.0.0.1:3000/settings", { headers: { host: "127.0.0.1:3000", origin: ORIGIN } }), "127.0.0.1");
    expect(res.status).toBe(403);
    const res2 = await call(handler, "/settings", { headers: { "x-inonu-settings": "0" } });
    expect(res2.status).toBe(403);
  });

  test("OPTIONS preflight skips the custom header but keeps IP, Host and Origin guards", async () => {
    const { handler } = setup();
    const res = await handler(
      new Request("http://127.0.0.1:3000/settings/secrets", { method: "OPTIONS", headers: { host: "127.0.0.1:3000", origin: ORIGIN } }),
      "127.0.0.1",
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, PUT, DELETE, POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type, x-inonu-settings");
    const bad = await handler(
      new Request("http://127.0.0.1:3000/settings", { method: "OPTIONS", headers: { host: "127.0.0.1:3000", origin: "http://evil.example" } }),
      "127.0.0.1",
    );
    expect(bad.status).toBe(403);
  });

  test("body rules: content-type, size, strict json, unknown keys", async () => {
    const { handler } = setup();
    const put = (body: string, headers: Record<string, string> = {}) =>
      call(handler, "/settings/secrets", { method: "PUT", body, headers: { "content-type": "application/json", ...headers } });
    const noType = await call(handler, "/settings/secrets", { method: "PUT", body: "{}" });
    expect(noType.status).toBe(415);
    expect((await put(JSON.stringify({ id: "okxWeb3ApiKey", value: "x".repeat(9000) }), { "content-length": "9000" })).status).toBe(413);
    expect((await put("{oops")).status).toBe(400);
    expect((await put(JSON.stringify({ id: "okxWeb3ApiKey", value: "valid-value-1", extra: 1 }))).status).toBe(400);
    expect((await put(JSON.stringify(["a"]))).status).toBe(400);
  });

  test("unknown path and method", async () => {
    const { handler } = setup();
    expect((await call(handler, "/settings/nope")).status).toBe(404);
    expect((await call(handler, "/settings", { method: "PATCH" })).status).toBe(405);
    expect((await call(handler, "/settings/secrets", { method: "GET" })).status).toBe(404);
  });
});

describe("routes", () => {
  test("GET returns statuses, okx state and prefs without any secret value", async () => {
    const { handler, store } = setup();
    store.set("okxWeb3ApiKey", "sensitive-zzz9");
    const res = await call(handler, "/settings");
    expect(res.status).toBe(200);
    const body = await res.json() as { secrets: Record<string, { configured: boolean; last4: string | null }>; okx: { state: string }; prefs: { version: number } };
    expect(body.secrets.okxWeb3ApiKey).toMatchObject({ configured: true, last4: "zzz9" });
    expect(body.okx).toEqual({ state: "incomplete" });
    expect(body.prefs.version).toBe(1);
    expect(JSON.stringify(body)).not.toContain("sensitive-zzz9");
  });

  test("PUT secrets validates and persists; DELETE clears", async () => {
    const { handler } = setup();
    const put = await call(handler, "/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: "keyvalue-777" }), headers: { "content-type": "application/json" } });
    expect(put.status).toBe(200);
    const body = await put.json() as { secrets: Record<string, { configured: boolean }> };
    expect(body.secrets.typesafeAiApiKey).toMatchObject({ configured: true, last4: null, origin: "local" });
    expect(JSON.stringify(body)).not.toContain("keyvalue-777");
    const bad = await call(handler, "/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "nope", value: "keyvalue-777" }), headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
    const badVal = await call(handler, "/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: "bad'value9" }), headers: { "content-type": "application/json" } });
    expect(badVal.status).toBe(400);
    const del = await call(handler, "/settings/secrets/typesafeAiApiKey", { method: "DELETE" });
    expect(((await del.json()) as { secrets: Record<string, { configured: boolean }> }).secrets.typesafeAiApiKey?.configured).toBe(false);
    expect((await call(handler, "/settings/secrets/unknown", { method: "DELETE" })).status).toBe(400);
  });

  test("PUT prefs validates partial patches", async () => {
    const { handler } = setup();
    const res = await call(handler, "/settings/prefs", { method: "PUT", body: JSON.stringify({ onchain: { capBasic: 10, background: true } }), headers: { "content-type": "application/json" } });
    expect(((await res.json()) as { prefs: { onchain: Record<string, unknown> } }).prefs.onchain).toMatchObject({ capBasic: 10, background: true, capPremium: 50_000 });
    const bad = await call(handler, "/settings/prefs", { method: "PUT", body: JSON.stringify({ onchain: { capBasic: -3 } }), headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
  });

  test("test/jev never calls a model and reports absent or format_ok", async () => {
    const { handler, store } = setup();
    expect(await (await call(handler, "/settings/test/jev", { method: "POST" })).json()).toEqual({ ok: false, code: "absent" });
    store.set("typesafeAiApiKey", "keyvalue-777");
    expect(await (await call(handler, "/settings/test/jev", { method: "POST" })).json()).toEqual({ ok: true, code: "format_ok", tested: false });
  });

  test("test/onchainos codes and probe wiring", async () => {
    const { handler, store, probed } = setup();
    expect(await (await call(handler, "/settings/test/onchainos", { method: "POST" })).json()).toEqual({ ok: false, code: "incomplete_credentials" });
    expect(probed.length).toBe(0);
    store.set("okxWeb3ApiKey", "key-aaaabbbb");
    store.set("okxWeb3ApiSecret", "sec-aaaabbbb");
    store.set("okxWeb3ApiPassphrase", "pass aaaabbb");
    const res = await call(handler, "/settings/test/onchainos", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, code: "chains_listed" });
    expect(probed).toEqual([{ apiKey: "key-aaaabbbb", secret: "sec-aaaabbbb", passphrase: "pass aaaabbb" }]);
    const unwired = setup({ probeOnchainos: undefined });
    unwired.store.set("okxWeb3ApiKey", "key-aaaabbbb");
    unwired.store.set("okxWeb3ApiSecret", "sec-aaaabbbb");
    unwired.store.set("okxWeb3ApiPassphrase", "pass aaaabbb");
    expect(await (await call(unwired.handler, "/settings/test/onchainos", { method: "POST" })).json()).toEqual({ ok: false, code: "not_wired" });
  });

  test("write rate limit allows twenty per minute then 429", async () => {
    let clock = 1_000_000;
    const { handler } = setup({ now: () => clock });
    for (let i = 0; i < 20; i++) {
      const res = await call(handler, "/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: `keyvalue-${i}` }), headers: { "content-type": "application/json" } });
      expect(res.status).toBe(200);
    }
    const over = await call(handler, "/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: "keyvalue-99" }), headers: { "content-type": "application/json" } });
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ ok: false, code: "rate_limited" });
    clock += 61_000;
    const after = await call(handler, "/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: "keyvalue-99" }), headers: { "content-type": "application/json" } });
    expect(after.status).toBe(200);
  });
});

describe("sentinel sweep", () => {
  test("no response or console output ever carries a stored value", async () => {
    const { handler, store } = setup();
    const sentinels = { typesafeAiApiKey: "SENTAI-7qk2", okxWeb3ApiKey: "SENTOKX-9zz4", okxWeb3ApiSecret: "SENTSEC-m3v8", okxWeb3ApiPassphrase: "SENTPASS w5t1" };
    for (const [id, value] of Object.entries(sentinels) as [SecretId, string][]) store.set(id, value);
    const lines: string[] = [];
    const originals = {} as Record<"log" | "warn" | "error" | "info", (...args: unknown[]) => void>;
    for (const level of ["log", "warn", "error", "info"] as const) {
      originals[level] = console[level];
      console[level] = (...args: unknown[]) => lines.push(args.map(String).join(" "));
    }
    const bodies: string[] = [];
    try {
      const calls: [string, Init][] = [
        ["/settings", {}],
        ["/settings", { ip: "8.8.8.8" }],
        ["/settings", { origin: null }],
        ["/settings/secrets", { method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: "bad'xxxxx" }), headers: { "content-type": "application/json" } }],
        ["/settings/secrets", { method: "PUT", body: "{broken", headers: { "content-type": "application/json" } }],
        ["/settings/secrets", { method: "PUT", body: "not json", headers: { "content-type": "text/plain" } }],
        ["/settings/secrets/typesafeAiApiKey", { method: "DELETE" }],
        ["/settings/test/onchainos", { method: "POST" }],
        ["/settings/test/jev", { method: "POST" }],
        ["/settings/prefs", { method: "PUT", body: JSON.stringify({ onchain: { capBasic: 5 } }), headers: { "content-type": "application/json" } }],
        ["/settings/anything", {}],
      ];
      for (const [path, init] of calls) {
        const res = await call(handler, path, init);
        bodies.push(JSON.stringify(await res.json().catch(() => null)));
        bodies.push([...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n"));
      }
    } finally {
      for (const level of ["log", "warn", "error", "info"] as const) console[level] = originals[level];
    }
    const output = `${bodies.join("\n")}\n${lines.join("\n")}`;
    // The full value never leaves the process in any response body, header or console line.
    for (const value of Object.values(sentinels)) expect(output.includes(value)).toBe(false);
    // The tail of the secret and the passphrase is never exposed either (last4 exists only for the two keys).
    for (const tail of [sentinels.okxWeb3ApiSecret.slice(-4), sentinels.okxWeb3ApiPassphrase.slice(-4)]) expect(output.includes(tail)).toBe(false);
    expect(store.credentials().okx?.secret).toBe(sentinels.okxWeb3ApiSecret);
  });
});

describe("preview server", () => {
  test("the read-only preview does not expose /settings", async () => {
    const dir = tempDir();
    const { startServer } = await import("../server");
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = reservation.port!;
    reservation.stop(true);
    const preview = startServer(
      { model: "none", wallet: null, dryRun: true, market: "preview", startedAt: 1 },
      () => [],
      { port, origins: [ORIGIN], stateDir: join(dir, "state") },
    );
    try {
      const res = await fetch(`http://127.0.0.1:${port}/settings`, {
        headers: { host: "127.0.0.1", origin: ORIGIN, "x-inonu-settings": "1" },
      });
      // The preview answers with its own generic 404, never with the settings handler.
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
      const put = await fetch(`http://127.0.0.1:${port}/settings/secrets`, {
        method: "PUT",
        headers: { host: "127.0.0.1", origin: ORIGIN, "x-inonu-settings": "1", "content-type": "application/json" },
        body: JSON.stringify({ id: "typesafeAiApiKey", value: "preview-0001" }),
      });
      expect(put.status).not.toBe(200);
      expect(existsSync(join(dir, "data"))).toBe(false);
    } finally {
      preview.close();
    }
  });
});
