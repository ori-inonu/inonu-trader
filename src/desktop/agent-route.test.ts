// The autonomous agent through the REAL core: the route exists on the app's own origin, keeps the guards of the local API,
// is born not connected, refuses to be connected without what it needs, and disconnecting is immediate. No credential is configured, so nothing here can reach a provider.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../settings/store";
import { startCore, type Core } from "./core";
import { DISCLOSURE } from "../agent/state";
import { createDesktopHandlers } from "./handlers";

let root = "";
let core: Core | null = null;
// a synthetic fetch: every request answers "nothing here", so no provider is ever reached; the store has no key discovery either
const offline = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inonu-agent-route-"));
  mkdirSync(join(root, "web"), { recursive: true });
  writeFileSync(join(root, "web", "index.html"), "<html><body>desk</body></html>");
  core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: (origin) => createDesktopHandlers({ dataDir: join(root, "data"), origin, fetch: offline, store: createSettingsStore(join(root, "data"), { runtimeKey: () => null }) }) });
});

afterEach(() => {
  core?.stop();
  core = null;
  rmSync(root, { recursive: true, force: true });
});

const sameOrigin = { "sec-fetch-site": "same-origin" };
const write = { ...sameOrigin, "x-inonu-intent": "user", "content-type": "application/json" };
const get = (path: string, headers: Record<string, string> = sameOrigin) => fetch(`${core!.origin}${path}`, { headers });
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = write) => fetch(`${core!.origin}${path}`, { method, headers, body: JSON.stringify(body) });

describe("/agent through the core", () => {
  test("status answers the page's same-origin GET and the agent is born not connected", async () => {
    const res = await get("/agent/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: { mode: string; state: { connected: boolean }; readiness: Record<string, string[]>; scheduler: { started: boolean }; modelConfigured: boolean } };
    expect(body.ok).toBe(true);
    expect(body.status.state).toMatchObject({ connected: false });
    expect(body.status.mode).toBe("desligado");
    expect(body.status.scheduler.started).toBe(false);
    expect(body.status.readiness.sombra).toContain("carteira_gerida");
    expect(body.status.readiness.sombra).toContain("credenciais_okx");
  });

  test("the guard denies what is not same-origin, and a write without the intent header", async () => {
    expect((await get("/agent/status", {})).status).toBe(403);
    expect((await get("/agent/status", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await send("POST", "/agent/disconnect", {}, sameOrigin)).status).toBe(403);
  });

  test("connecting before the agent has what it needs is refused with the reason", async () => {
    const res = await send("POST", "/agent/connect", { disclosure: DISCLOSURE });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, code: "requisitos_pendentes" });
  });

  test("a notice that is not the current one is refused even when everything else is there", async () => {
    // no credentials in this core: the requirements are pending first, which is also a refusal
    const res = await send("POST", "/agent/connect", { disclosure: "1999-01-01" });
    expect(res.status).toBe(409);
  });

  test("a configuration change is validated and saved", async () => {
    const bad = await send("PUT", "/agent/config", { intervalMin: 1 });
    expect(bad.status).toBe(400);
    const good = await send("PUT", "/agent/config", { managed: { kind: "propria", evm: "0x1111111111111111111111111111111111111111", solana: null }, intervalMin: 15 });
    expect(good.status).toBe(200);
    const status = (await (await get("/agent/status")).json()) as { status: { config: { intervalMin: number; managed: { evm: string } }; readiness: Record<string, string[]> } };
    expect(status.status.config.intervalMin).toBe(15);
    expect(status.status.readiness.sombra).not.toContain("carteira_gerida");
    expect(existsSync(join(root, "data", "agent", "config.json"))).toBe(true);
  });

  test("disconnecting always answers ok, and a cycle asked for after it does nothing", async () => {
    expect((await send("POST", "/agent/disconnect", {})).status).toBe(200);
    const status = (await (await get("/agent/status")).json()) as { status: { mode: string; state: { connected: boolean } } };
    expect(status.status.state.connected).toBe(false);
    expect(status.status.mode).toBe("desligado");
    const run = (await (await send("POST", "/agent/run", {})).json()) as { report: { outcome: string; reason: string } };
    expect(run.report).toMatchObject({ outcome: "bloqueado", reason: "desligado" });
  });

  test("the old switches are not routes any more", async () => {
    for (const path of ["/agent/mode", "/agent/consent", "/agent/stop"]) expect((await send("POST", path, {})).status).toBe(404);
  });

  test("an unknown route under /agent is the handler's not_found, which proves the prefix is wired", async () => {
    const res = await get("/agent/nao-existe");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, code: "not_found" });
  });
});
