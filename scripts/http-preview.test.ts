import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

test("quiet preview SSE remains connected until its heartbeat arrives", async () => {
  const { startServer } = await import("../src/server");
  const dir = mkdtempSync(join(tmpdir(), "inonu-http-heartbeat-"));
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port;
  reservation.stop(true);
  const origin = "http://localhost:3002";
  const preview = startServer({ model: "none", wallet: null, dryRun: true, market: "preview", startedAt: 1 }, () => [],
    { port: port!, origins: [origin], stateDir: join(dir, "absent-state") });
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 22_000);
  let cancelReader: (() => Promise<void>) | undefined;
  try {
    const events = await fetch(`http://127.0.0.1:${port}/events`, { headers: { Origin: origin }, signal: abort.signal });
    const reader = events.body!.getReader();
    cancelReader = () => reader.cancel();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain("event: snapshot");
    const heartbeat = await reader.read();
    expect(heartbeat.done).toBe(false);
    expect(decoder.decode(heartbeat.value)).toContain("event: ping");
    expect(existsSync(join(dir, "absent-state"))).toBe(false);
  } finally {
    clearTimeout(deadline);
    try { await cancelReader?.(); } finally { abort.abort(); preview!.close(); }
    rmSync(dir, { recursive: true, force: true });
  }
}, 25_000);

test("HTTP preview CLI exposes honest empty state without starting financial producers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-http-preview-"));
  const config = join(dir, "bunfig.toml");
  const guard = join(dir, "offline.ts");
  const state = join(dir, "absent-state");
  writeFileSync(config, "[install]\nauto = false\n");
  // Supplements import audit; this does not certify OS-level network isolation.
  writeFileSync(guard, 'globalThis.fetch = (() => { throw new Error("preview producer network forbidden"); }) as typeof fetch;\n');
  const env: Record<string, string> = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name]!;
  }
  // A read-only preview must not depend on inherited financial configuration.
  Object.assign(env, { MODEL: "jev", PRIVATE_KEY: "invalid-fixture-not-a-key", DRY_RUN: "false",
    OPERATOR_STATE_PATH: join(dir, "legacy-private-state.json"), OPERATOR_READ_TOKEN: "fixture-inherited-token" });
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port;
  reservation.stop(true);
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-addons", "--no-install", `--config=${config}`, "--preload", guard,
    join(ROOT, "scripts/http-preview.ts"), "--port", String(port), "--origin", "http://localhost:3002", "--state-dir", state],
    { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const deadline = setTimeout(() => child.kill(), 8_000);
  const api = `http://127.0.0.1:${port}`;
  try {
    let root: Response | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break;
      try { root = await fetch(api, { headers: { Origin: "http://localhost:3002" }, signal: AbortSignal.timeout(200) }); break; }
      catch { await Bun.sleep(30); }
    }
    expect(root !== undefined).toBe(true);
    expect(root!.status).toBe(200);
    expect(root!.headers.get("access-control-allow-origin")).toBe("http://localhost:3002");
    expect(await root!.json()).toMatchObject({ model: "none", wallet: null, dryRun: true, mode: "read_only", latest: null,
      dataSource: "local-http-preview-no-producer" });
    const history = await fetch(`${api}/history`, { headers: { Origin: "http://localhost:3002" } });
    expect(await history.json()).toEqual([]);
    for (const path of ["/operator", "/system-one", "/jev-read"]) {
      expect((await fetch(`${api}${path}`, { headers: { Origin: "http://localhost:3002" } })).status).toBe(404);
    }
    for (const path of ["/", "/history", "/events", "/operator", "/system-one", "/jev-read"]) {
      const rejected = await fetch(`${api}${path}`, { headers: { Origin: "https://unlisted.invalid" } });
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
      const mutation = await fetch(`${api}${path}`, { method: "POST", headers: { Origin: "http://localhost:3002" } });
      expect(mutation.status).toBe(405);
      const preflight = await fetch(`${api}${path}`, { method: "OPTIONS", headers: { Origin: "http://localhost:3002" } });
      expect([200, 204]).toContain(preflight.status);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3002");
    }
    const abort = new AbortController();
    const events = await fetch(`${api}/events`, { headers: { Origin: "http://localhost:3002" }, signal: abort.signal });
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    const reader = events.body!.getReader();
    try {
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain("event: snapshot");
      const snapshot = JSON.parse(first.split("data: ")[1]!.trim());
      expect(snapshot).toMatchObject({ model: "none", wallet: null, dryRun: true, mode: "read_only", history: [],
        dataSource: "local-http-preview-no-producer" });
    } finally { await reader.cancel(); abort.abort(); }
    expect(existsSync(state)).toBe(false);
  } finally {
    clearTimeout(deadline);
    child.kill();
    await child.exited;
    const diagnostics = { stdout: await stdout, stderr: await stderr };
    if (diagnostics.stderr) console.error(diagnostics.stderr);
    rmSync(dir, { recursive: true, force: true });
  }
}, 12_000);

test("public preview lifecycle closes active SSE and releases the listener without orphaning failed startup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-http-lifecycle-"));
  const runner = join(dir, "lifecycle.ts");
  writeFileSync(join(dir, "bunfig.toml"), "[install]\nauto = false\n");
  writeFileSync(runner, `
import { startServer } from ${JSON.stringify(join(ROOT, "src/server.ts"))};
const origin = "http://localhost:3002";
const occupied = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("owner") });
const port = occupied.port;
const meta = { model: "none", wallet: null, dryRun: true, market: "preview", startedAt: 1 };
const options = { port, origins: [origin], stateDir: ${JSON.stringify(join(dir, "absent-state"))} };
let rejected = false;
try { startServer(meta, () => [], options); } catch { rejected = true; }
if (!rejected) throw new Error("occupied port was not rejected");
const response = await fetch("http://127.0.0.1:" + port);
if (await response.text() !== "owner") throw new Error("failed startup changed existing listener");
occupied.stop(true);
const preview = startServer(meta, () => [], options);
const stream = await fetch("http://127.0.0.1:" + port + "/events", { headers: { Origin: origin } });
const reader = stream.body!.getReader();
await reader.read();
preview.close();
preview.close();
let streamClosed = false;
try { streamClosed = (await reader.read()).done; }
catch (error) {
  // Bun force-close on Windows can terminate an active SSE connection with a reset.
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ECONNRESET") throw error;
  streamClosed = true;
}
const rebound = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() });
rebound.stop(true);
console.log(JSON.stringify({ occupiedRejected: rejected, streamClosed, portReleased: true }));
`);
  const env: Record<string, string> = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name]!;
  }
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", `--config=${join(dir, "bunfig.toml")}`, runner],
    { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; child.kill(); }, 5_000);
  try {
    const exit = await child.exited;
    const output = await stdout;
    const errors = await stderr;
    if (errors) console.error(errors);
    expect(timedOut).toBe(false);
    expect(exit).toBe(0);
    expect(JSON.parse(output)).toEqual({ occupiedRejected: true, streamClosed: true, portReleased: true });
    expect(existsSync(join(dir, "absent-state"))).toBe(false);
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null) child.kill();
    await child.exited;
    rmSync(dir, { recursive: true, force: true });
  }
}, 8_000);

test("preview CLI rejects invalid explicit configuration before attempting to bind", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-http-invalid-"));
  const state = join(dir, "absent-state");
  const config = join(dir, "bunfig.toml");
  writeFileSync(config, "[install]\nauto = false\n");
  const owner = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("original-owner") });
  const base = ["--port", String(owner.port), "--origin", "http://localhost:3002", "--state-dir", state];
  const cases: Array<{ args: string[]; message: string }> = [
    { args: ["--port", "0", ...base.slice(2)], message: "Invalid preview port" },
    { args: ["--port", "65536", ...base.slice(2)], message: "Invalid preview port" },
    { args: ["--port", "1.5", ...base.slice(2)], message: "Unknown or duplicate preview option" },
    { args: ["--port", String(owner.port), "--state-dir", state], message: "Preview origins must be exact HTTP loopback origins" },
    ...["*", "https://localhost:3002", "http://example.com", "http://localhost:3002/"].map(origin => ({
      args: ["--port", String(owner.port), "--origin", origin, "--state-dir", state], message: "Preview origins must be exact HTTP loopback origins" })),
    { args: [...base.slice(0, 4), "--state-dir", "relative-state"], message: "Preview state directory must be absolute" },
    { args: [...base, "--port", String(owner.port)], message: "Unknown or duplicate preview option" },
    { args: [], message: "Preview requires explicit --port, --origin and --state-dir" },
  ];
  const env: Record<string, string> = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name]!;
  }
  try {
    for (const fixture of cases) {
      const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", `--config=${config}`,
        join(ROOT, "scripts/http-preview.ts"), ...fixture.args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      const stdout = new Response(child.stdout).text();
      const stderr = new Response(child.stderr).text();
      let timedOut = false;
      const deadline = setTimeout(() => { timedOut = true; child.kill(); }, 3_000);
      try {
        const exit = await child.exited;
        expect(timedOut).toBe(false);
        expect(exit).toBe(1);
        expect(await stderr).toContain(fixture.message);
        expect(await stdout).toBe("");
        expect(await (await fetch(`http://127.0.0.1:${owner.port}`)).text()).toBe("original-owner");
      } finally {
        clearTimeout(deadline);
        if (child.exitCode === null) child.kill();
        await child.exited;
      }
    }
    expect(existsSync(state)).toBe(false);
    expect(existsSync(join(dir, "relative-state"))).toBe(false);
  } finally { owner.stop(true); rmSync(dir, { recursive: true, force: true }); }
}, 15_000);
