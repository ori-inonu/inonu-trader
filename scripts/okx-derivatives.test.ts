import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSyntheticAdapter } from "../src/okx-derivatives/adapter.ts";
import { SYNTHETIC_NOW_MS, syntheticInput } from "../src/okx-derivatives/fixture.ts";
import { buildDerivativesReport } from "../src/okx-derivatives/report.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

// Each run starts a child bun process that contends for CPU with the rest of the suite; generous child and per test budgets.
const CHILD_TIMEOUT_MS = 45_000;
setDefaultTimeout(120_000);

const cli = fileURLToPath(new URL("./okx-derivatives.ts", import.meta.url));
const cwd = fileURLToPath(new URL("../", import.meta.url));
// A minimal environment on purpose: the CLI must not depend on anything inherited from the shell.
const env = {
  SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
  PATH: dirname(process.execPath) + delimiter + (process.env.PATH ?? ""),
};
const folders: string[] = [];
// Em dash, en dash and middle dot are forbidden in rendered text; built from char codes so this file does not contain them.
const TYPOGRAPHY = new RegExp(`[${String.fromCharCode(0x2014, 0x2013, 0x00b7)}]`);

function folder(): string {
  const created = mkdtempSync(join(tmpdir(), "okx-derivatives-cli-test-"));
  folders.push(created);
  return created;
}

afterAll(() => {
  const base = realpathSync(tmpdir()) + sep;
  for (const created of folders) {
    const target = realpathSync(created);
    if (!target.startsWith(base) || !target.split(sep).at(-1)?.startsWith("okx-derivatives-cli-test-")) throw new Error("unexpected temporary path");
    rmSync(target, { recursive: true, force: true });
  }
});

function run(args: string[] = [], extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--no-env-file", "run", cli, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
}

function writeInput(directory: string, mutate: (raw: Json) => void = () => {}, name = "input.json"): string {
  const raw = syntheticInput() as Json;
  mutate(raw);
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(raw));
  return path;
}

function error(args: string[], line: string) {
  const result = run(args);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(`okx-derivatives: ${line}\n`);
}

test("OKX-DERIV D15: the default run is a deterministic synthetic report with every qualification flag closed", () => {
  const result = run();
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.endsWith("\n")).toBe(true);
  const report = JSON.parse(result.stdout) as Json;
  expect(report.schema).toBe("okx_derivatives_report_v1");
  expect(report.source).toBe("synthetic");
  expect(report.mode).toBe("synthetic");
  expect(report.externalAccessObserved).toBe(false);
  expect(report.liveQualified).toBe(false);
  expect(report.financiallyAuthorized).toBe(false);
  expect(report.execution).toBe("not_qualified");
  expect(report.generatedAtMs).toBe(SYNTHETIC_NOW_MS);
  expect(report.model.liquidationModelIsExchangeFormula).toBe(false);
  expect(report.carry.conservative.netQuote).toBe("62.210000");
  expect(report.carry.summary).toEqual({ eligible: [1, 2, 3], ineligible: [5, 10, 20], unavailable: [] });
  expect(report.directional.leverageTable.every((row: Json) => row.verdict.status !== "eligible")).toBe(true);
  expect(run().stdout).toBe(result.stdout);
  // the CLI prints exactly the library report, indented, with a final newline
  expect(result.stdout).toBe(`${JSON.stringify(buildDerivativesReport(createSyntheticAdapter(), SYNTHETIC_NOW_MS), null, 2)}\n`);
});

test("OKX-DERIV D15: the report does not depend on inherited environment variables or secrets", () => {
  const result = run([], { OKX_API_KEY: "CANARY_API_KEY", OKX_SECRET_KEY: "CANARY_SECRET", OKX_API_PASSPHRASE: "CANARY_PASSPHRASE", HTTPS_PROXY: "http://127.0.0.1:9" });
  expect(result.status).toBe(0);
  expect((JSON.parse(result.stdout) as Json).schema).toBe("okx_derivatives_report_v1");
  expect(result.stdout).toBe(run().stdout);
  expect(result.stdout + result.stderr).not.toContain("CANARY");
});

test("OKX-DERIV D15: help is in Portuguese, standalone and opens no files", () => {
  const result = run(["--help"]);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const help = result.stdout.toLowerCase();
  expect(help).toContain("somente leitura");
  expect(help).toContain("--snapshot");
  expect(help).toContain("--now-ms");
  expect(help).toContain("sem rede");
  expect(help).toContain("não é autorização financeira");
  expect(TYPOGRAPHY.test(result.stdout)).toBe(false);
});

test("OKX-DERIV D15: invalid argument forms are rejected before any file is touched", () => {
  const cases: string[][] = [
    ["--live"], ["--help", "--snapshot", "never-read"], ["--help", "never-read"], ["--snapshot"], ["never-read.json"], ["--now-ms", "1"],
    ["--snapshot", "never-read", "--snapshot", "again"], ["--snapshot", "--now-ms", "1"], ["--snapshot", "never-read", "--now-ms"],
    ["--snapshot", "never-read", "--now-ms", "1", "extra"], ["--snapshot", ""], ["--snapshot", "never-read", "--now-ms", ""],
    ["--Snapshot", "never-read"], [" --snapshot", "never-read"], ["--snapshot=never-read"],
  ];
  for (const args of cases) error(args, "invalid_arguments");
  for (const clock of ["-1", "+1", "01", "1.5", "1e3", " 1", "1 ", "abc", "0x10", "12345678901234567"]) {
    error(["--snapshot", "never-read", "--now-ms", clock], "invalid_arguments");
  }
  error(["--snapshot", "never-read", "--now-ms", "8640000000000001"], "invalid_clock");
  error(["--snapshot", "never-read", "--now-ms", "9999999999999999"], "invalid_clock");
});

test("OKX-DERIV D15: a local file with the same shape gives the same report, marked imported, with flags in any order", () => {
  const directory = folder();
  const path = writeInput(directory);
  const baseline = JSON.parse(run().stdout) as Json;
  for (const args of [["--snapshot", path, "--now-ms", String(SYNTHETIC_NOW_MS)], ["--now-ms", String(SYNTHETIC_NOW_MS), "--snapshot", path]]) {
    const result = run(args);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as Json;
    expect(report.mode).toBe("imported");
    expect(report).toEqual({ ...baseline, mode: "imported" });
  }
  const claimed = writeInput(directory, (raw) => { raw.sourceClaim = "operator_claimed"; }, "claimed.json");
  const report = JSON.parse(run(["--snapshot", claimed, "--now-ms", String(SYNTHETIC_NOW_MS)]).stdout) as Json;
  expect(report.source).toBe("operator_claimed");
  expect(report.liveQualified).toBe(false);
  expect(report.financiallyAuthorized).toBe(false);
});

test("OKX-DERIV D15: the CLI only reads the file: it is not rewritten and nothing else is created", () => {
  const directory = folder();
  const path = writeInput(directory);
  const before = readFileSync(path, "utf8");
  const listing = readdirSync(directory);
  const result = run(["--snapshot", path, "--now-ms", String(SYNTHETIC_NOW_MS)]);
  expect(result.status).toBe(0);
  expect((JSON.parse(result.stdout) as Json).mode).toBe("imported");
  expect(readFileSync(path, "utf8")).toBe(before);
  expect(readdirSync(directory)).toEqual(listing);
});

test("OKX-DERIV D11/D15: without --now-ms a file uses the local clock, so fixed old timestamps are reported unavailable", () => {
  const directory = folder();
  const path = writeInput(directory);
  const before = Date.now();
  const result = run(["--snapshot", path]);
  const after = Date.now();
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout) as Json;
  expect(report.generatedAtMs).toBeGreaterThanOrEqual(before);
  expect(report.generatedAtMs).toBeLessThanOrEqual(after);
  // the synthetic stamps are in January 2027: ahead of the clock today, stale afterwards; never usable either way
  expect(report.carry.reasons.length).toBeGreaterThan(0);
  expect(report.carry.reasons.every((reason: string) => reason.startsWith("future:") || reason.startsWith("stale:"))).toBe(true);
  expect(report.carry.summary.unavailable).toEqual([1, 2, 3]);
});

test("OKX-DERIV D14/D15: malformed files are rejected strictly with a finite code and no echoed content", () => {
  const directory = folder();
  const path = join(directory, "input.json");
  const args = ["--snapshot", path, "--now-ms", String(SYNTHETIC_NOW_MS)];

  writeFileSync(path, "{PRIVATE_SENTINEL");
  error(args, "invalid_json");
  writeFileSync(path, "");
  error(args, "invalid_json");
  writeFileSync(path, Buffer.concat([Buffer.from('{"private":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]));
  error(args, "invalid_utf8");

  const cases: Array<[(raw: Json) => void, string]> = [
    [(raw) => { raw.schema = "other"; }, "invalid_input schema"],
    [(raw) => { raw.PRIVATE_SENTINEL = 1; }, "invalid_input"],
    [(raw) => { raw.snapshot.PRIVATE_SENTINEL = 1; }, "invalid_snapshot snapshot"],
    [(raw) => { raw.snapshot.perp.ctVal = 0.1; }, "invalid_snapshot snapshot.perp.ctVal"],
    [(raw) => { raw.snapshot.books.perp.bids.reverse(); }, "invalid_snapshot snapshot.books.perp.bids[1]"],
    [(raw) => { delete raw.snapshot.funding; }, "invalid_snapshot snapshot.funding"],
    [(raw) => { raw.evaluation.leverages = [3, 1]; }, "invalid_evaluation evaluation.leverages"],
    [(raw) => { raw.evaluation.policy = { maxLeverage: 0 }; }, "invalid_evaluation evaluation.policy.maxLeverage"],
    [(raw) => { delete raw.evaluation; }, "invalid_evaluation evaluation"],
  ];
  for (const [mutate, line] of cases) {
    const bad = writeInput(directory, mutate, "bad.json");
    error(["--snapshot", bad, "--now-ms", String(SYNTHETIC_NOW_MS)], line);
  }
  writeFileSync(path, JSON.stringify([1, 2, 3]));
  error(args, "invalid_input");
  writeFileSync(path, JSON.stringify("text"));
  error(args, "invalid_input");
});

test("OKX-DERIV D15: files must be regular local files within one MiB", () => {
  const directory = folder();
  const path = join(directory, "input.json");
  const text = JSON.stringify(syntheticInput());
  const args = ["--snapshot", path, "--now-ms", String(SYNTHETIC_NOW_MS)];
  writeFileSync(path, text + " ".repeat(1_048_576 - Buffer.byteLength(text)));
  expect(run(args).status).toBe(0);
  writeFileSync(path, text + " ".repeat(1_048_577 - Buffer.byteLength(text)));
  error(args, "invalid_file");
  mkdirSync(join(directory, "folder"));
  error(["--snapshot", join(directory, "folder")], "invalid_file");
  error(["--snapshot", join(directory, "missing_PRIVATE_SENTINEL.json")], "invalid_file");
  for (const bad of ["https://example.invalid/PRIVATE_SENTINEL", "file:///C:/PRIVATE_SENTINEL", "\\\\server\\share\\PRIVATE_SENTINEL", "//server/share/x", "NUL", "CON", "capture.json:stream", "C:relative"]) {
    error(["--snapshot", bad], "invalid_file");
  }
});

test("OKX-DERIV D16: at run time nothing opens a socket: fetch, WebSocket and the Bun network entry points are trapped and never called", () => {
  // Node modules such as node:net cannot be trapped from here (mock.module does not intercept built-ins in a
  // plain subprocess); they are excluded by the static import allowlist in src/okx-derivatives/isolation.test.ts.
  const script = `
    const traps = [];
    const trap = (name) => (...args) => { traps.push(name); throw new Error("network_trap_" + name); };
    globalThis.fetch = trap("fetch");
    globalThis.WebSocket = function WebSocketTrap() { traps.push("WebSocket"); throw new Error("network_trap_WebSocket"); };
    for (const name of ["connect", "listen", "serve", "udpSocket"]) {
      try { Bun[name] = trap("Bun." + name); } catch { traps.push("could_not_trap_" + name); }
    }
    process.argv = [process.execPath, ${JSON.stringify(cli)}];
    await import(${JSON.stringify(pathToFileURL(cli).href)});
    process.stderr.write("NETWORK_TRAPS:" + traps.length + ":" + traps.join(",") + "\\n");
  `;
  const result = spawnSync(process.execPath, ["--no-env-file", "--eval", script], { cwd, env, encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("NETWORK_TRAPS:0:\n");
  expect((JSON.parse(result.stdout) as Json).schema).toBe("okx_derivatives_report_v1");
});

test("OKX-DERIV D15: when the package script exists it keeps the no-env-file wrapper", () => {
  // The integrator adds this script; once present it must keep the explicit wrapper.
  const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as Json;
  const script = packageJson.scripts["okx:derivatives"];
  if (script !== undefined) expect(script).toBe("bun --no-env-file run scripts/okx-derivatives.ts");
  expect(typeof (script ?? "bun --no-env-file run scripts/okx-derivatives.ts")).toBe("string");
});
