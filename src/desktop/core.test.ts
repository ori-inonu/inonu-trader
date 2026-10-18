// T1.4 / WIN-3, WIN-6: the single local core that serves the static desk and its APIs on loopback, same origin.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortInUseError, startCore, type Core, type CoreHandlers } from "./core";

let root = "";
let webDir = "";
let started: Core[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inonu-core-"));
  webDir = join(root, "web");
  mkdirSync(join(webDir, "_next", "static"), { recursive: true });
  writeFileSync(join(webDir, "index.html"), "<html><head><title>x</title></head><body><h1>hi</h1></body></html>");
  writeFileSync(join(webDir, "console.html"), "<html><body>console page</body></html>");
  writeFileSync(join(webDir, "doctor.html"), "<html><body>doctor page</body></html>");
  writeFileSync(join(webDir, "404.html"), "<html><body>custom not found</body></html>");
  writeFileSync(join(webDir, "_next", "static", "app.js"), "console.log(1);");
  writeFileSync(join(root, "secret-outside.txt"), "not served"); // a sibling of the web dir, outside it
});

afterEach(() => {
  for (const core of started) core.stop();
  started = [];
  rmSync(root, { recursive: true, force: true });
});

function start(handlers: CoreHandlers | ((origin: string) => CoreHandlers) = {}, extra: Partial<Parameters<typeof startCore>[0]> = {}): Core {
  const core = startCore({ port: 0, webDir, version: "9.9.9", handlers, idleMs: 0, ...extra });
  started.push(core);
  return core;
}

/** A recording handler: remembers the Origin and the remote ip it was given. */
function recorder() {
  const seen: { origin: string | null; ip: string | null; path: string; method: string }[] = [];
  const handler = async (req: Request, ip: string | null = null) => {
    seen.push({ origin: req.headers.get("origin"), ip, path: new URL(req.url).pathname, method: req.method });
    return Response.json({ ok: true, from: "handler" });
  };
  return { seen, handler };
}

const get = (core: Core, path: string, headers: Record<string, string> = {}) => fetch(`${core.origin}${path}`, { headers });

describe("static desk", () => {
  test("serves the index with the heartbeat script injected and hardening headers", async () => {
    const core = start();
    const res = await get(core, "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await res.text();
    expect(html).toContain("<h1>hi</h1>");
    expect(html).toContain('<script src="/__inonu/heartbeat.js"></script></body>');
  });

  test("resolves a route to its exported .html file", async () => {
    const core = start();
    expect(await (await get(core, "/doctor")).text()).toContain("doctor page");
  });

  test("the old observation console is not part of the installed app: every /console path is the 404 page (WIN-13, T1.11)", async () => {
    const core = start();
    for (const path of ["/console", "/console/", "/console.html", "/console/pipeline", "/console?x=1"]) {
      const res = await get(core, path);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("custom not found");
      expect(html).not.toContain("console page");
    }
    // a path that merely starts with the same letters is a different path
    expect((await get(core, "/consolidated")).status).toBe(404);
    expect(await (await get(core, "/doctor")).text()).toContain("doctor page");
  });

  test("hashed assets are immutable, html is not cached", async () => {
    const core = start();
    const asset = await get(core, "/_next/static/app.js");
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect((await get(core, "/")).headers.get("cache-control")).toBe("no-cache");
  });

  test("unknown paths get the exported 404 page with status 404", async () => {
    const core = start();
    const res = await get(core, "/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("custom not found");
  });

  test("path traversal and malformed paths are refused", async () => {
    const core = start();
    for (const bad of ["/..%2fsecret-outside.txt", "/%2e%2e%2fsecret-outside.txt", "/a%00b", "/a%5cb"]) {
      const res = await get(core, bad);
      expect(res.status).toBe(400);
    }
    // the URL parser itself folds /%2e%2e/x to /x before it is sent: that lands inside the web dir and is a plain 404
    const folded = await get(core, "/%2e%2e/secret-outside.txt");
    expect(folded.status).toBe(404);
    expect(await folded.text()).not.toContain("not served");
  });

  test("/health reports the version and is JSON", async () => {
    const core = start();
    const body = (await (await get(core, "/health")).json()) as { ok: boolean; app: string; version: string; startedAt: number };
    expect(body.ok).toBe(true);
    expect(body.app).toBe("inonu-trader"); // how a second launch recognises a running instance
    expect(body.version).toBe("9.9.9");
    expect(Number.isFinite(body.startedAt)).toBe(true);
  });
});

describe("loopback only", () => {
  test("binds to 127.0.0.1", () => {
    const core = start();
    expect(core.hostname).toBe("127.0.0.1");
    expect(core.origin).toBe(`http://127.0.0.1:${core.port}`);
  });

  test("a request whose Host is not loopback is refused, even for static files (DNS rebinding)", async () => {
    const core = start();
    const res = await core.handle(new Request("http://evil.example/", { headers: { host: "evil.example" } }), "127.0.0.1");
    expect(res.status).toBe(403);
  });

  test("a non-loopback peer is refused", async () => {
    const core = start();
    const res = await core.handle(new Request("http://127.0.0.1/", { headers: { host: "127.0.0.1" } }), "192.168.0.8");
    expect(res.status).toBe(403);
  });
});

describe("same origin API routing", () => {
  test("the browser's same-origin GET (no Origin header) reaches the handler with the core's own origin", async () => {
    const onchain = recorder();
    const core = start({ onchain: onchain.handler });
    const res = await get(core, "/onchain/status", { "sec-fetch-site": "same-origin" });
    expect(await res.json()).toEqual({ ok: true, from: "handler" });
    expect(onchain.seen).toHaveLength(1);
    expect(onchain.seen[0]!.origin).toBe(core.origin);
    expect(onchain.seen[0]!.ip).toMatch(/^(127\.|::1|::ffff:127\.)/);
  });

  test("a cross-site or navigation request without Origin is passed through without one (the handler's guard denies it)", async () => {
    const onchain = recorder();
    const core = start({ onchain: onchain.handler });
    await get(core, "/onchain/status", { "sec-fetch-site": "cross-site" });
    await get(core, "/onchain/status", { "sec-fetch-site": "none" });
    await get(core, "/onchain/status");
    expect(onchain.seen.map((s) => s.origin)).toEqual([null, null, null]);
  });

  test("an explicit foreign Origin is never overwritten", async () => {
    const onchain = recorder();
    const core = start({ onchain: onchain.handler });
    await get(core, "/onchain/status", { "sec-fetch-site": "same-origin", origin: "http://evil.example" });
    expect(onchain.seen[0]!.origin).toBe("http://evil.example");
  });

  test("each API prefix reaches its own handler and nothing else", async () => {
    const settings = recorder();
    const onchain = recorder();
    const jevRead = recorder();
    const systemOne = recorder();
    const core = start({ settings: settings.handler, onchain: onchain.handler, jevRead: jevRead.handler, systemOne: systemOne.handler });
    for (const path of ["/settings", "/settings/secrets/okx_key", "/onchain/search", "/jev-read", "/system-one"]) await get(core, path, { "sec-fetch-site": "same-origin" });
    expect(settings.seen.map((s) => s.path)).toEqual(["/settings", "/settings/secrets/okx_key"]);
    expect(onchain.seen.map((s) => s.path)).toEqual(["/onchain/search"]);
    expect(jevRead.seen.map((s) => s.path)).toEqual(["/jev-read"]);
    expect(systemOne.seen.map((s) => s.path)).toEqual(["/system-one"]);
  });

  test("handlers may be a factory that receives the bound origin", async () => {
    let received = "";
    const onchain = recorder();
    const core = start((origin) => { received = origin; return { onchain: onchain.handler }; });
    expect(received).toBe(core.origin);
    await get(core, "/onchain/status", { "sec-fetch-site": "same-origin" });
    expect(onchain.seen).toHaveLength(1);
  });

  test("a factory that throws does not leave the port bound", () => {
    // an ephemeral port of its own, reserved and released here: no fixed port outside the test
    const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    const port = probe.port as number;
    probe.stop(true);
    expect(() => start(() => { throw new Error("boom"); }, { port })).toThrow("boom");
    const again = start({}, { port });
    expect(again.port).toBe(port);
  });

  test("write methods keep their method and body path to the settings handler", async () => {
    const settings = recorder();
    const core = start({ settings: settings.handler });
    await fetch(`${core.origin}/settings/secrets`, { method: "PUT", headers: { origin: core.origin, "content-type": "application/json" }, body: "{}" });
    expect(settings.seen[0]).toMatchObject({ method: "PUT", origin: core.origin });
  });

  test("an API prefix with no handler is a JSON 404, never the static 404 page", async () => {
    const core = start({});
    for (const path of ["/onchain/status", "/settings", "/operator/latest", "/jev-read"]) {
      const res = await get(core, path, { "sec-fetch-site": "same-origin" });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });
});

describe("live connection and idle shutdown (WIN-6)", () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const sameOrigin = { "sec-fetch-site": "same-origin" };

  /** What a page does: opens the stream and keeps it. Aborting is what closing the window does. */
  async function openPage(core: Core, headers: Record<string, string> = sameOrigin) {
    const controller = new AbortController();
    const res = await fetch(`${core.origin}/__inonu/live`, { headers, signal: controller.signal });
    return { res, close: () => controller.abort() };
  }

  test("serves a script that holds one EventSource open, so a throttled or minimized page cannot look dead", async () => {
    const core = start();
    const res = await get(core, "/__inonu/heartbeat.js");
    expect(res.headers.get("content-type")).toContain("javascript");
    const script = await res.text();
    expect(script).toContain("EventSource");
    expect(script).toContain("/__inonu/live");
    expect(script).not.toContain("setInterval"); // no timer the browser could throttle
  });

  test("the stream is event-stream, answers at once and keeps itself alive under Bun's 10 s idle timeout", async () => {
    const core = start({}, { keepaliveMs: 30 });
    const page = await openPage(core);
    expect(page.res.status).toBe(200);
    expect(page.res.headers.get("content-type")).toContain("text/event-stream");
    expect(page.res.headers.get("cache-control")).toBe("no-store");
    const reader = page.res.body!.getReader();
    const chunks: string[] = [];
    const deadline = Date.now() + 1_000;
    while (chunks.join("").split("\n\n").length < 4 && Date.now() < deadline) chunks.push(new TextDecoder().decode((await reader.read()).value));
    page.close();
    expect(chunks.join("")).toContain("retry:"); // first frame
    expect(chunks.join("").split(":").length).toBeGreaterThan(3); // later keepalive comments
  });

  test("shuts down by itself when no page ever connects, after the startup grace", async () => {
    let idle = 0;
    start({}, { idleMs: 5_000, startupGraceMs: 120, pollMs: 20, onIdle: () => { idle += 1; } });
    await wait(450);
    expect(idle).toBe(1);
  });

  test("an open page keeps the core alive for as long as it is open; closing it starts the countdown", async () => {
    let idle = 0;
    const core = start({}, { idleMs: 150, startupGraceMs: 150, pollMs: 20, keepaliveMs: 30, onIdle: () => { idle += 1; } });
    const page = await openPage(core);
    await wait(500); // far longer than idleMs and the startup grace
    expect(idle).toBe(0);
    page.close();
    await wait(450);
    expect(idle).toBe(1);
  });

  test("a reload (close, then open again within the grace) cancels the countdown", async () => {
    let idle = 0;
    const core = start({}, { idleMs: 300, startupGraceMs: 300, pollMs: 20, keepaliveMs: 30, onIdle: () => { idle += 1; } });
    const first = await openPage(core);
    first.close();
    await wait(100);
    const second = await openPage(core);
    await wait(500);
    expect(idle).toBe(0);
    second.close();
  });

  test("two windows: the core waits for the last one", async () => {
    let idle = 0;
    const core = start({}, { idleMs: 120, startupGraceMs: 120, pollMs: 20, keepaliveMs: 30, onIdle: () => { idle += 1; } });
    const a = await openPage(core);
    const b = await openPage(core);
    a.close();
    await wait(350);
    expect(idle).toBe(0);
    b.close();
    await wait(400);
    expect(idle).toBe(1);
  });

  test("a cross-site page cannot hold the core open", async () => {
    let idle = 0;
    const core = start({}, { idleMs: 100, startupGraceMs: 100, pollMs: 20, onIdle: () => { idle += 1; } });
    const forged = await fetch(`${core.origin}/__inonu/live`, { headers: { "sec-fetch-site": "cross-site" } });
    expect(forged.status).toBe(403);
    await wait(400);
    expect(idle).toBe(1);
  });

  test("a client that does not send Sec-Fetch-Site (not a browser) may connect", async () => {
    const core = start({}, { keepaliveMs: 30 });
    const page = await openPage(core, {});
    expect(page.res.status).toBe(200);
    page.close();
  });

  test("idleMs 0 never shuts down", async () => {
    let idle = 0;
    start({}, { idleMs: 0, pollMs: 20, onIdle: () => { idle += 1; } });
    await wait(200);
    expect(idle).toBe(0);
  });
});

describe("port handling (WIN-3)", () => {
  test("a busy port is a named error, not a silent fallback", () => {
    const first = start();
    expect(() => startCore({ port: first.port, webDir, version: "1", handlers: {}, idleMs: 0 })).toThrow(PortInUseError);
  });

  test("stop releases the port", () => {
    const first = start();
    const { port } = first;
    first.stop();
    const again = startCore({ port, webDir, version: "1", handlers: {}, idleMs: 0 });
    started.push(again);
    expect(again.port).toBe(port);
  });
});
