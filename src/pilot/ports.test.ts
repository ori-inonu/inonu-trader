import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPilotHandler } from "./http";
import { DEFAULT_PILOT_PORTS, parsePilotPort, resolvePilotPorts } from "./ports";

// D-A11 and C-A5. The pilot service and the page that calls it used to be fixed at 3020 and 3021, which other local servers
// already use. The defaults stay; PILOT_PORT and PILOT_UI_PORT replace them, and the page side reads NEXT_PUBLIC_PILOT_PORT.

const SCRIPTS = resolve(import.meta.dir, "..", "..", "scripts");
const now = 1_800_000_000_000;
const input = { sessionId: "session-0001", requestId: "request-0001", account: "0x" + "1".repeat(40), chainId: "0xc4", observedAtMs: now, block: "123" };
const deps = { now: () => now, journal: () => {} };
const post = (url: string, origin: string) => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input) });

describe("D-A11 the pilot ports", () => {
  test("the defaults are still 3020 for the service and 3021 for the page, with and without the resolver", async () => {
    expect(DEFAULT_PILOT_PORTS).toEqual({ port: 3020, uiPort: 3021 });
    expect(resolvePilotPorts({})).toEqual({ port: 3020, uiPort: 3021 });
    const handler = createPilotHandler(deps);
    const response = await handler(post("http://127.0.0.1:3020/pilot/cycles", "http://127.0.0.1:3021"));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3021");
    expect((await handler(post("http://127.0.0.1:3020/pilot/cycles", "http://127.0.0.1:3001"))).status).toBe(403);
    expect((await handler(post("http://127.0.0.1:4020/pilot/cycles", "http://127.0.0.1:3021"))).status).toBe(403);
    const resolved = createPilotHandler(deps, resolvePilotPorts({}));
    expect((await resolved(post("http://localhost:3020/pilot/cycles", "http://localhost:3021"))).status).toBe(200);
  });

  test("PILOT_PORT and PILOT_UI_PORT replace the defaults, and only those two names are read", () => {
    expect(resolvePilotPorts({ PILOT_PORT: "4020", PILOT_UI_PORT: "3001" })).toEqual({ port: 4020, uiPort: 3001 });
    expect(resolvePilotPorts({ PILOT_PORT: "4020" })).toEqual({ port: 4020, uiPort: 3021 });
    expect(resolvePilotPorts({ PILOT_UI_PORT: "3001" })).toEqual({ port: 3020, uiPort: 3001 });
    expect(resolvePilotPorts({ PILOT_PORT: "1", PILOT_UI_PORT: "65535", PRIVATE_KEY: "0xabc", OPERATOR_PRIVATE_KEY: "0xdef", PORT: "9999", REAL_PORT: "9998" })).toEqual({ port: 1, uiPort: 65535 });
  });

  test.each(["", " 3020", "3020 ", "0", "-1", "65536", "99999", "3020.5", "3e3", "0x10", "abc", "03020", "٣٠٢٠", "3020\n"])("an invalid port text %j is refused, not replaced by the default", (text) => {
    expect(parsePilotPort(text, 3020)).toBeNull();
    expect(() => resolvePilotPorts({ PILOT_PORT: text })).toThrow("Invalid PILOT_PORT");
    expect(() => resolvePilotPorts({ PILOT_UI_PORT: text })).toThrow("Invalid PILOT_UI_PORT");
  });

  test("an absent text is the default, a valid text is its number, and the two ports must differ", () => {
    expect(parsePilotPort(undefined, 3020)).toBe(3020);
    for (const [text, port] of [["1", 1], ["80", 80], ["3020", 3020], ["65535", 65535]] as const) expect(parsePilotPort(text, 3020)).toBe(port);
    expect(() => resolvePilotPorts({ PILOT_PORT: "3500", PILOT_UI_PORT: "3500" })).toThrow("must differ");
    expect(() => resolvePilotPorts({ PILOT_PORT: "3021" })).toThrow("must differ");
    expect(() => resolvePilotPorts({ PILOT_UI_PORT: "3020" })).toThrow("must differ");
  });

  test("with PILOT_UI_PORT=3001 the page of real:console is allowed and the old page port is not; the service answers on its own port only", async () => {
    const ports = resolvePilotPorts({ PILOT_PORT: "4020", PILOT_UI_PORT: "3001" });
    const handler = createPilotHandler(deps, ports);
    const allowed = await handler(post("http://127.0.0.1:4020/pilot/cycles", "http://127.0.0.1:3001"));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3001");
    const preflight = await handler(new Request("http://localhost:4020/pilot/cycles", { method: "OPTIONS", headers: { origin: "http://localhost:3001", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3001");
    const oldPage = await handler(post("http://127.0.0.1:4020/pilot/cycles", "http://127.0.0.1:3021"));
    expect(oldPage.status).toBe(403);
    expect(oldPage.headers.get("access-control-allow-origin")).toBeNull();
    expect((await handler(post("http://127.0.0.1:3020/pilot/cycles", "http://127.0.0.1:3001"))).status).toBe(403);
    const hostile = post("http://127.0.0.1:4020/pilot/cycles", "http://127.0.0.1:3001");
    hostile.headers.set("host", "unexpected.example:4020");
    expect((await handler(hostile)).status).toBe(403);
    const health = await handler(new Request("http://127.0.0.1:4020/health"));
    expect(await health.json()).toEqual({ mode: "simulation", execution: "disabled", protocol: "gev-wallet-pilot-v1" });
  });

  test("the handler refuses ports that could not be a loopback listener", () => {
    for (const bad of [{ port: 0, uiPort: 3021 }, { port: 3020, uiPort: 70000 }, { port: 3020.5, uiPort: 3021 }, { port: 3020, uiPort: 3020 }, { port: Number.NaN, uiPort: 3021 }]) {
      expect(() => createPilotHandler(deps, bad), JSON.stringify(bad)).toThrow();
    }
  });
});

/** Two free loopback ports: bind, read, release. */
async function freePorts(): Promise<[number, number]> {
  const servers = [Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") }), Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") })];
  const ports = servers.map((server) => server.port as number) as [number, number];
  for (const server of servers) await server.stop(true);
  return ports;
}

function bareEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"]) { const value = process.env[name]; if (value !== undefined) env[name] = value; }
  return { ...env, ...extra };
}

async function reachable(url: string, deadlineMs: number): Promise<Response> {
  const until = Date.now() + deadlineMs;
  let last: unknown = null;
  while (Date.now() < until) {
    try { return await fetch(url); } catch (error) { last = error; await Bun.sleep(100); }
  }
  throw new Error(`${url} did not answer: ${String(last)}`);
}

describe("D-A11 the entry scripts apply the variables", () => {
  test.each([["gev-wallet-pilot.ts", []], ["gev-wallet-pilot-fixture.ts", ["--fixture"]]] as Array<[string, string[]]>)("%s listens on PILOT_PORT and allows the page on PILOT_UI_PORT", async (script, args) => {
    const [port, uiPort] = await freePorts();
    const cwd = mkdtempSync(join(tmpdir(), "pilot-ports-"));
    const child = Bun.spawn([process.execPath, "--no-env-file", "run", join(SCRIPTS, script), ...args], { cwd, env: bareEnv({ PILOT_PORT: String(port), PILOT_UI_PORT: String(uiPort) }), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    try {
      const health = await reachable(`http://127.0.0.1:${port}/health`, 30_000);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ mode: "simulation", execution: "disabled", protocol: "gev-wallet-pilot-v1" });
      const preflight = (origin: string) => fetch(`http://127.0.0.1:${port}/pilot/cycles`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
      const allowed = await preflight(`http://127.0.0.1:${uiPort}`);
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe(`http://127.0.0.1:${uiPort}`);
      expect((await preflight("http://127.0.0.1:3021")).status).toBe(403);
    } finally {
      child.kill();
      await child.exited;
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  test("an invalid PILOT_PORT stops the script before it listens, naming the variable and nothing else", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-ports-"));
    try {
      const child = Bun.spawn([process.execPath, "--no-env-file", "run", join(SCRIPTS, "gev-wallet-pilot.ts")], { cwd, env: bareEnv({ PILOT_PORT: "not-a-port", PILOT_UI_PORT: "3500" }), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(code).not.toBe(0);
      expect(stderr).toContain("Invalid PILOT_PORT");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 60_000);
});
