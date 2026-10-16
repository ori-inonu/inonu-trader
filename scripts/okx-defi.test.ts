import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFI_DEMO_NOW_MS, syntheticDefiCaptures } from "../src/okx-defi/fixture.ts";

/* Every test here starts a child bun process. Under a loaded machine (parallel verifications,
   builds, agents) a child can take well over the ten seconds it needs when idle, so the child
   timeout and the per test timeout are both raised. No assertion changes. */
const CHILD_TIMEOUT_MS = 45_000;
setDefaultTimeout(60_000);

const cli = fileURLToPath(new URL("./okx-defi.ts", import.meta.url));
const cwd = fileURLToPath(new URL("../", import.meta.url));
const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, PATH: `${process.execPath.replace(/[\\/][^\\/]+$/, "")};C:/Windows/System32` };
const folders: string[] = [];
function folder() {
  const created = mkdtempSync(join(tmpdir(), "okx-defi-test-"));
  folders.push(created);
  return created;
}
afterAll(() => {
 const base = realpathSync(tmpdir()) + sep;
 for (const created of folders) {
  const target = realpathSync(created);
  if (!target.startsWith(base) || !target.split(sep).at(-1)?.startsWith("okx-defi-test-")) throw new Error("unexpected temporary path");
  rmSync(target, { recursive: true, force: true });
 }
});

async function runCommand(command: string[], childCwd = cwd) {
 const child = Bun.spawn(command, { cwd: childCwd, env, stdout: "pipe", stderr: "pipe" });
 let timedOut = false;
 // A real child-process deadline is required so a hung CLI is killed, not just awaited forever.
 const killer = setTimeout(() => { timedOut = true; child.kill(); }, CHILD_TIMEOUT_MS);
 try {
  const [stdout, stderr, status] = await Promise.all([
   new Response(child.stdout).text(),
   new Response(child.stderr).text(),
   child.exited,
  ]);
  return { error: timedOut ? new Error(`child timed out after ${CHILD_TIMEOUT_MS}ms`) : undefined, status, stdout, stderr };
 } finally { clearTimeout(killer); }
}

function run(args: string[] = [], packageRoute = false) {
 return runCommand([process.execPath, "--no-env-file", "run", packageRoute ? "okx:defi" : cli, ...args]);
}

test("D5/D7: real CLI demo is deterministic synthetic JSON without execution qualification", async () => {
 const result = await run();
 expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
 expect(result.stderr).toBe("");
 const report = JSON.parse(result.stdout);
 expect(report.generatedAtMs).toBe(DEFI_DEMO_NOW_MS);
 expect(report.mode).toBe("synthetic");
 expect(report.observations.map((row: { source: string }) => row.source)).toEqual(["search", "search", "detail"]);
 expect(report.association).toEqual({ status: "identity_match_unverified", searchIndex: 0, detailIndex: 2 });
 expect(report.observations[2].advertisedYield.unit).toBe("unknown");
 expect(report.observations[0].fee.value).toBeNull();
 expect(report.execution).toBe("not_qualified");
 expect(result.stdout.endsWith("\n")).toBe(true);
 expect((await run()).stdout).toBe(result.stdout);
});

test("D5: help is Portuguese and standalone without opening files", async () => {
 const result = await run(["--help"]);
    expect(result.status).toBe(0);
 expect(result.stderr).toBe("");
 expect(result.stdout).toContain("capturas locais");
 expect(result.stdout).toContain("--search");
 expect(result.stdout).toContain("--max-age-ms");
});

async function error(args: string[], code: string) {
 const result = await run(args);
 expect(result.error).toBeUndefined();
 expect(result.status).toBe(1);
 expect(result.stdout).toBe("");
 expect(result.stderr).toBe(`okx-defi: ${code}\n`);
}

test("D5: invalid argument forms are rejected before nonexistent file IO", async () => {
 for (const args of [["--live"], ["--help", "--search", "never-read"], ["--search"], ["--search", "never-read"], ["--detail", "never-read", "--max-age-ms", "1"], ["--search", "never-read", "--detail", "never-read", "--max-age-ms", "1", "--search", "again"], ["--search", "--detail", "never-read", "--max-age-ms", "1"], ["--search", "never-read", "--detail", "never-read", "--max-age-ms", "1", "extra"]]) await error(args, "invalid_arguments");
 for (const maxAge of ["0", "+1", "-1", "01", "1.5", "1e3", " 1", "1\n", "3600001", "9".repeat(100)]) await error(["--search", "never-read", "--detail", "never-read", "--max-age-ms", maxAge], "invalid_arguments");
});

test("D5/D7: real imported capture files accept reordered flags and remain unverified", async () => {
 const directory = folder();
 const captures = syntheticDefiCaptures();
 const search = join(directory, "search.json");
 const detail = join(directory, "detail.json");
 writeFileSync(search, JSON.stringify({ ...captures.search, sourceClaim: "okx_api_claimed", capturedAtMs: Date.now(), secret: "PRIVATE_SENTINEL" }));
 writeFileSync(detail, JSON.stringify({ ...captures.detail, capturedAtMs: null }));
 const before = [readFileSync(search, "utf8"), readFileSync(detail, "utf8")];
 const result = await run(["--max-age-ms", "3600000", "--detail", detail, "--search", search]);
 expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
 expect(result.stderr).toBe("");
 const report = JSON.parse(result.stdout);
 expect(report.mode).toBe("imported");
 expect(report.generatedAtMs).toBeGreaterThan(DEFI_DEMO_NOW_MS - 100000000000);
 expect(report.maxAgeMs).toBe(3600000);
 expect(report.observations[0].provenance.sourceClaim).toBe("okx_api_claimed");
 expect(report.observations[0].provenance.verification).toBe("unverified");
 expect(report.observations[2].provenance.freshness).toBe("unknown");
 expect(result.stdout).not.toContain("PRIVATE_SENTINEL");
 expect([readFileSync(search, "utf8"), readFileSync(detail, "utf8")]).toEqual(before);
});

test("D5: files require strict UTF8 JSON with a one MiB read boundary", async () => {
 const directory = folder();
 const captures = syntheticDefiCaptures();
 const search = join(directory, "search.json");
 const detail = join(directory, "detail.json");
 writeFileSync(detail, JSON.stringify(captures.detail));
 const args = ["--search", search, "--detail", detail, "--max-age-ms", "1"];
 const withInvalidUtf8 = Buffer.concat([Buffer.from('{"private":"'), Buffer.from([0xc3, 0x28]), Buffer.from('","schema":"okx_defi_capture_v1"}')]);
 writeFileSync(search, withInvalidUtf8);
 await error(args, "invalid_utf8");
 writeFileSync(search, "{PRIVATE_SENTINEL");
 await error(args, "invalid_json");
 const valid = JSON.stringify(captures.search);
 writeFileSync(search, valid + " ".repeat(1048576 - Buffer.byteLength(valid)));
 expect((await run(args)).status).toBe(0);
 writeFileSync(search, valid + " ".repeat(1048577 - Buffer.byteLength(valid)));
 await error(args, "invalid_file");
 await error(["--search", directory, "--detail", detail, "--max-age-ms", "1"], "invalid_file");
 await error(["--search", join(directory, "missing_PRIVATE_SENTINEL.json"), "--detail", detail, "--max-age-ms", "1"], "invalid_file");
});

test("D5: paths reject remote schemes UNC devices and alternate streams with finite errors", async () => {
 for (const path of ["https://example.invalid/PRIVATE_SENTINEL", "file:///C:/PRIVATE_SENTINEL", "data:PRIVATE_SENTINEL", "\\\\server\\PRIVATE_SENTINEL", "//server/PRIVATE_SENTINEL", "\\\\?\\C:\\PRIVATE_SENTINEL", "\\\\.\\pipe\\PRIVATE_SENTINEL", "C:relative_PRIVATE_SENTINEL", "capture.json:PRIVATE_SENTINEL", "C:/capture.json:PRIVATE_SENTINEL", "NUL", "NUL.json", "CON", "AUX", "PRN", "COM1", "LPT1", "CONIN$", "CONOUT$", "directory/NUL.txt", "directory/com¹.txt"]) {
  await error(["--search", path, "--detail", "never-read_PRIVATE_SENTINEL", "--max-age-ms", "1"], "invalid_file");
 }
});

test("D5: ordinary relative paths are accepted and captures are never rewritten", async () => {
 const directory = folder();
 const search = join(directory, "search.json");
 const detail = join(directory, "detail.json");
 const captures = syntheticDefiCaptures();
 writeFileSync(search, JSON.stringify(captures.search));
 writeFileSync(detail, JSON.stringify(captures.detail));
 const result = await run(["--search", relative(cwd, search), "--detail", relative(cwd, detail), "--max-age-ms", "1"]);
    expect(result.status).toBe(0);
 expect(result.stderr).toBe("");
 expect(JSON.parse(result.stdout).execution).toBe("not_qualified");
});

test("D6/D7: the actual package route preserves both no-env-file wrappers", async () => {
 const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
 expect(packageJson.scripts["okx:defi"]).toBe("bun --no-env-file run scripts/okx-defi.ts");

 // Test dotenv isolation with a synthetic canary, never the user's .env.
 const directory = folder();
 mkdirSync(join(directory, "scripts"));
 writeFileSync(join(directory, ".env"), "INONU_DEFI_DOTENV_CANARY=synthetic\n");
 writeFileSync(join(directory, "scripts", "okx-defi.ts"), `
    if (process.env.INONU_DEFI_DOTENV_CANARY !== undefined) {
      process.stderr.write("dotenv_canary_loaded\\n");
      process.exit(7);
    }
    await import(${JSON.stringify(pathToFileURL(cli).href)});
  `);
 async function canary(inner = true) {
  const script = packageJson.scripts["okx:defi"];
  writeFileSync(join(directory, "package.json"), JSON.stringify({
   scripts: { "okx:defi": inner ? script : script.replace("--no-env-file ", "") },
  }));
  return runCommand([process.execPath, "--no-env-file", "run", "okx:defi"], directory);
 }
 const loaderControl = await runCommand([process.execPath, "run", "scripts/okx-defi.ts"], directory);
 const canaryControl = await canary(false);
 for (const control of [loaderControl, canaryControl]) {
  expect(control.error).toBeUndefined();
  expect(control.status).toBe(7);
  expect(control.stdout).toBe("");
  expect(control.stderr).toContain("dotenv_canary_loaded");
 }
 const isolated = await canary();
 expect(isolated.error).toBeUndefined();
 expect(isolated.status).toBe(0);
 expect(JSON.parse(isolated.stdout).mode).toBe("synthetic");

 const result = await run([], true);
 expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
 expect(result.stderr).toBe("$ bun --no-env-file run scripts/okx-defi.ts\n");
 expect(JSON.parse(result.stdout).mode).toBe("synthetic");
 const help = await run(["--help"], true);
 expect(help.status).toBe(0);
 expect(help.stdout).toContain("capturas locais");
});

test("D5: synthetic filesystem boundary faults exercise same-fd growth and NUL rejection", async () => {
 const directory = folder();
 const search = join(directory, "search.json");
 const detail = join(directory, "detail.json");
 const metadata = join(directory, "boundary.json");
 const captures = syntheticDefiCaptures();
 writeFileSync(detail, JSON.stringify(captures.detail));
 for (const when of ["first_read", "eof"] as const) {
  writeFileSync(search, JSON.stringify(captures.search));
  // Instrument only the filesystem boundary in this disposable subprocess.
  // Actual handles, stats, reads and the induced append remain local real IO.
  const script = `
      import { mock } from "bun:test";
      const fs = await import("node:fs");
      const original = { ...fs };
      const trace = { stats: [], reads: [], opens: [], closes: [], grew: false };
      mock.module("node:fs", () => ({ ...original,
        openSync(...args) { const fd = original.openSync(...args); trace.opens.push(fd); return fd; },
        fstatSync(fd, ...args) { const stat = original.fstatSync(fd, ...args); trace.stats.push({ fd, size: stat.size }); return stat; },
        readSync(fd, ...args) {
          const count = original.readSync(fd, ...args);
          trace.reads.push({ fd, requested: args[2], count });
          if (!trace.grew && (${JSON.stringify(when)} === "first_read" || count === 0)) {
            original.appendFileSync(${JSON.stringify(search)}, " ".repeat(1048577));
            trace.grew = true;
          }
          return count;
        },
        closeSync(fd) { trace.closes.push(fd); return original.closeSync(fd); }
      }));
      process.argv = [process.execPath, ${JSON.stringify(cli)}, "--search", ${JSON.stringify(search)}, "--detail", ${JSON.stringify(detail)}, "--max-age-ms", "1"];
      await import(${JSON.stringify(pathToFileURL(cli).href)});
      original.writeFileSync(${JSON.stringify(metadata)}, JSON.stringify(trace));
    `;
  const result = await runCommand([process.execPath, "--no-env-file", "--eval", script]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("okx-defi: invalid_file\n");
  const trace = JSON.parse(readFileSync(metadata, "utf8"));
  expect(trace.grew).toBe(true);
  expect(trace.opens).toHaveLength(1);
  expect(trace.stats[0].size).toBeLessThan(1048576);
  expect(trace.stats.every((entry: { fd: number }) => entry.fd === trace.opens[0])).toBe(true);
  expect(trace.reads.every((entry: { fd: number; requested: number }) => entry.fd === trace.opens[0] && entry.requested <= 65536)).toBe(true);
  expect(trace.reads.reduce((total: number, entry: { count: number }) => total + entry.count, 0)).toBeLessThanOrEqual(1048577);
  expect(trace.closes).toEqual(trace.opens);
  if (when === "eof") expect(trace.stats.at(-1).size).toBeGreaterThan(1048576);
 }
 // OS argv cannot contain NUL. This synthetic argv seam reaches that validator.
 const nulScript = `process.argv = [process.execPath, ${JSON.stringify(cli)}, "--search", "capture\\0.json", "--detail", "never-read", "--max-age-ms", "1"]; await import(${JSON.stringify(pathToFileURL(cli).href)});`;
 const nulResult = await runCommand([process.execPath, "--no-env-file", "--eval", nulScript]);
 expect(nulResult.status).toBe(1);
 expect(nulResult.stdout).toBe("");
 expect(nulResult.stderr).toBe("okx-defi: invalid_file\n");
});
