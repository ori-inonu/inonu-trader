import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startReportsServer } from "../src/dashboard/reports-server";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CLI = fileURLToPath(new URL("./reports-server.ts", import.meta.url));
const CONFIG_DIR = mkdtempSync(join(tmpdir(), "inonu-reports-config-"));
const CONFIG = join(CONFIG_DIR, "bunfig.toml");
writeFileSync(CONFIG, "# no preloads\n");
afterAll(() => rmSync(CONFIG_DIR, { recursive: true }));

function runtimeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key]!;
  }
  return env;
}

function spawn(args: string[], cwd = ROOT) {
  return Bun.spawn([process.execPath, "--no-env-file", "--no-install", `--config=${CONFIG}`, ...args], { cwd, env: runtimeEnv(), stdout: "pipe", stderr: "pipe" });
}

async function exited(args: string[], cwd = ROOT) {
  const child = spawn(args, cwd);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 2500);
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(timedOut).toBe(false);
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); child.kill(); }
}

async function startup(child: ReturnType<typeof spawn>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reader = child.stdout.getReader();
  const readLine = async () => {
    let text = "";
    for (; ;) {
      const result = await reader.read();
      if (result.done) throw new Error("CLI exited without startup output");
      text += new TextDecoder().decode(result.value);
      if (text.includes("\n")) return text.split("\n")[0]!;
    }
  };
  try {
    return await Promise.race([readLine(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("CLI startup timeout")), 2500); })]);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

test("CLI help describes read-only operation without starting the bot or requiring credentials", async () => {
  const { code, stdout, stderr } = await exited([CLI, "--help"]);
  expect(code).toBe(0);
  expect(stdout).toContain("--data-dir");
  expect(stdout).toContain("--port");
  expect(stdout).toContain("--origin");
  expect(stdout).toContain("read-only");
  expect(stderr).toBe("");
}, 5000);

test("direct CLI serves an absolute data directory from another cwd with explicit origins replacing defaults", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "inonu-reports-cli-"));
  const dataDir = join(cwd, "stored-reports");
  mkdirSync(join(dataDir, "operator"), { recursive: true });
  writeFileSync(join(dataDir, "operator/latest.json"), JSON.stringify({ source: "synthetic", startedAtMs: 1234 }));
  const child = spawn([CLI, "--data-dir", dataDir, "--port", "0", "--origin", "http://127.0.0.1:3007", "--origin", "https://localhost:3008"], cwd);
  try {
    const line = await startup(child);
    expect(line).toContain("read-only");
    const base = line.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    expect(base).toBeDefined();
    for (const origin of ["http://127.0.0.1:3007", "https://localhost:3008"]) {
      const health = await fetch(`${base}/health`, { headers: { origin } });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ service: "inonu-reports", mode: "read-only", executionEnabled: false, liveFeedEnabled: false });
      expect(health.headers.get("access-control-allow-origin")).toBe(origin);
    }
    expect((await fetch(`${base}/health`, { headers: { origin: "http://localhost:3001" } })).status).toBe(403);
    expect(await (await fetch(`${base}/operator`)).json()).toEqual({ source: "synthetic", startedAtMs: 1234 });
  } finally { child.kill(); await child.exited; rmSync(cwd, { recursive: true }); }
}, 5000);

test("CLI defaults allow the two local dashboard origins and importing the entry never starts it", async () => {
  const child = spawn([CLI, "--port", "0"]);
  try {
    const base = (await startup(child)).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    expect(base).toBeDefined();
    for (const origin of ["http://localhost:3001", "http://127.0.0.1:3001"]) {
      expect((await fetch(`${base}/health`, { headers: { origin } })).status).toBe(200);
    }
    expect((await fetch(`${base}/health`, { headers: { origin: "http://127.0.0.1:3007" } })).status).toBe(403);
  } finally { child.kill(); await child.exited; }
  const imported = await exited(["-e", `await import(${JSON.stringify(new URL("./reports-server.ts", import.meta.url).href)}); console.log("imported without start");`]);
  expect(imported.code).toBe(0);
  expect(imported.stdout.trim()).toBe("imported without start");
  expect(imported.stderr).toBe("");
}, 5000);

const invalidCliCases: Array<[name: string, args: string[], occupiesPort?: boolean]> = [
  ["unknown flag", ["--unknown-SECRET_TEST_MARKER"]],
  ["help with unknown flag", ["--help", "--unknown"]],
  ["missing port value", ["--port"]],
  ["missing data-dir value", ["--data-dir"]],
  ["missing origin value", ["--origin"]],
  ...["-1", "65536", "1.5", "NaN", "0x10", "1e2", ""].map(port => [`invalid port ${port}`, ["--port", port]] as [string, string[]]),
  ["duplicate port", ["--port", "0", "--port", "0"]],
  ["duplicate data-dir", ["--data-dir", "$DATA_DIR", "--data-dir", "$DATA_DIR"]],
  ["relative data-dir", ["--data-dir", "relative/SECRET_TEST_MARKER"]],
  ["HTTPS origin", ["--origin", "https://SECRET_TEST_MARKER.example"]],
  ["origin trailing slash", ["--origin", "http://localhost:3001/"]],
  ["occupied ephemeral port", ["--port", "$OWNED_PORT"], true],
];

test.each(invalidCliCases)("rejects invalid CLI case: %s without leaking arguments", async (_name, caseArgs, occupiesPort = false) => {
  const dataDir = mkdtempSync(join(tmpdir(), "inonu-reports-cli-"));
  const server = occupiesPort
    ? startReportsServer({ dataDir, port: 0, origins: ["http://localhost:3001"] })
    : undefined;
  try {
    const args = caseArgs.map(arg => arg === "$DATA_DIR" ? dataDir : arg === "$OWNED_PORT" ? String(server!.port) : arg);
    const result = await exited([CLI, ...args]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toContain("SECRET_TEST_MARKER");
    expect(result.stdout).toBe("");
  } finally {
    if (server) await server.stop(true);
    rmSync(dataDir, { recursive: true, force: true });
  }
});
