import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopHandlers, type DesktopHandlers } from "../desktop/handlers";
import { localSelftestStore } from "./core-entry";
import { startLocalService } from "./service";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "inonu-local-service-synthetic-"));
  return {
    dir, async setup() { await Bun.write(join(dir, "web", "index.html"), "<html><body>synthetic_fixture</body></html>"); }, cleanup() {
      const exact = resolve(dir);
      if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith("inonu-local-service-synthetic-")) throw new Error("unsafe_fixture_cleanup");
      rmSync(exact, { recursive: true, force: true });
    }
  };
}

function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }

function createHandlers(options: Parameters<typeof createDesktopHandlers>[0], beforeAgentClose?: (close: () => Promise<void>) => Promise<void>, afterClose: () => void = () => { }): DesktopHandlers {
  const handlers = createDesktopHandlers({ ...options, pulse: false, liveFeed: false, agent: false });
  const closeAgent = handlers.agentService.close.bind(handlers.agentService);
  handlers.agentService.close = () => beforeAgentClose ? beforeAgentClose(closeAgent) : closeAgent();
  const closeServices = handlers.close.bind(handlers);
  handlers.close = () => { afterClose(); closeServices(); };
  return handlers;
}

for (const options of [{}, { pulse: false }, { pulse: true }, { pulse: true, selftest: true }] as const) {
  test(`local service always binds pulse explicitly and selftest keeps it off: ${JSON.stringify(options)}`, async () => {
    const f = fixture(); await f.setup();
    let received: Parameters<NonNullable<Parameters<typeof startLocalService>[0]["createHandlers"]>>[0] | undefined;
    const service = startLocalService({
      dataDir: join(f.dir, "data"), webDir: join(f.dir, "web"), version: "synthetic", port: 0, store: localSelftestStore(join(f.dir, "data")), ...options,
      createHandlers: (opts) => { received = opts; return createHandlers(opts); },
    });
    try {
      expect(received?.pulse).toBe("pulse" in options && options.pulse === true && !("selftest" in options && options.selftest === true));
      expect(received?.liveFeed).toBe(!("selftest" in options && options.selftest === true));
      expect(received).not.toHaveProperty("url");
      expect(received).not.toHaveProperty("webSocket");
    } finally { await service.stop(); f.cleanup(); }
  });
}

test("shutdown keeps the HTTP process alive while the agent drains; then closes the other services and socket", async () => {
  const f = fixture(); await f.setup();
  const gate = deferred(); let closed = 0;
  const service = startLocalService({ dataDir: join(f.dir, "data"), webDir: join(f.dir, "web"), version: "synthetic", port: 0, store: localSelftestStore(join(f.dir, "data")), createHandlers: (opts) => createHandlers(opts, async (closeAgent) => { await gate.promise; await closeAgent(); }, () => { closed++; }) });
  try {
    let done = false; service.done.then(() => { done = true; });
    const stopping = service.stop();
    expect(await (await fetch(service.core.origin + "/health")).json()).toMatchObject({ app: "inonu-trader", ok: true });
    expect(closed).toBe(0); expect(done).toBe(false);
    expect(service.stop()).toBe(stopping);
    gate.resolve(); await stopping; await service.done;
    expect(closed).toBe(1); expect(done).toBe(true);
  } finally { gate.resolve(); await service.stop(); f.cleanup(); }
});

test("a drain timeout retains the service and lock; a later successful drain can close it", async () => {
  const f = fixture(); await f.setup();
  let held = true; let attempt = 0; let closed = 0;
  const service = startLocalService({ dataDir: join(f.dir, "data"), webDir: join(f.dir, "web"), version: "synthetic", port: 0, store: localSelftestStore(join(f.dir, "data")), createHandlers: (opts) => createHandlers(opts, async (closeAgent) => { if (++attempt === 1) throw new Error("close_timeout"); held = false; await closeAgent(); }, () => { closed++; }) });
  try {
    await expect(service.stop()).rejects.toThrow("close_timeout");
    expect(held).toBe(true); expect(closed).toBe(0);
    expect((await fetch(service.core.origin + "/health")).status).toBe(200);
    await service.stop();
    expect(held).toBe(false); expect(closed).toBe(1);
  } finally { await service.stop(); f.cleanup(); }
});

test("the real handler composition in selftest has no ambient key, live feed, scheduler or network", async () => {
  const f = fixture(); await f.setup();
  const previous = process.env.TYPESAFE_AI_API_KEY;
  process.env.TYPESAFE_AI_API_KEY = "synthetic-key-that-must-not-be-discovered";
  let external = 0;
  const send = Object.assign(async () => { external++; throw new Error("network_forbidden"); }, { preconnect: () => { external++; throw new Error("network_forbidden"); } });
  const store = localSelftestStore(join(f.dir, "data"));
  const service = startLocalService({ dataDir: join(f.dir, "data"), webDir: join(f.dir, "web"), version: "synthetic", port: 0, store, selftest: true, fetch: send });
  try {
    const request = { headers: { "sec-fetch-site": "same-origin" } };
    const s = await (await fetch(service.core.origin + "/agent/status", request)).json() as any;
    expect(s.status).toMatchObject({ mode: "desligado", modelConfigured: false, credentialsConfigured: false, state: { connected: false }, scheduler: { started: false } });
    expect(store.credentials()).toEqual({ okx: null, typesafeAiApiKey: null });
    expect((await fetch(service.core.origin + "/agent/status")).status).toBe(403);
    expect((await fetch(service.core.origin + "/")).status).toBe(200);
    await service.stop(); expect(external).toBe(0);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_AI_API_KEY; else process.env.TYPESAFE_AI_API_KEY = previous;
    await service.stop(); f.cleanup();
  }
});
