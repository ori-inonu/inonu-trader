import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { acquireLock, createOperatorLedger, initLedgerFile, ledgerFilePersister } from "../src/operator/ledger";

// Each run starts a child bun process that contends for CPU with the rest of the suite; a child killed by its own
// timeout reports a null or signal exit code. The child budget and the per test budget are generous so load cannot
// fail the test (same budgets as the sibling CLI tests, commit 0f8afc1).
const CHILD_TIMEOUT_MS = 45_000;
setDefaultTimeout(120_000);

const ROOT = resolve(import.meta.dir, "..");
const fixtures: string[] = [];
afterEach(() => { for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "inonu-cli-lock-test-"));
  fixtures.push(dir);
  const paths = { ledger: join(dir, "ledger.json"), lock: join(dir, "LOCK"), state: join(dir, "state.json"), journal: join(dir, "journal.jsonl") };
  const configPath = join(dir, "bunfig.toml");
  const guardPath = join(dir, "offline.ts");
  writeFileSync(configPath, "[install]\nauto = false\n");
  writeFileSync(guardPath, 'globalThis.fetch = (() => { throw new Error("offline CLI test: network forbidden"); }) as typeof fetch;\n');
  const env: Record<string, string> = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  Object.assign(env, {
    MODEL: "mock", DRY_RUN: "true", OPERATOR_EXECUTE: "false",
    OPERATOR_LEDGER_PATH: paths.ledger, OPERATOR_LOCK_PATH: paths.lock,
    OPERATOR_STATE_PATH: paths.state, OPERATOR_JOURNAL_PATH: paths.journal,
    OPERATOR_KILL_SWITCH_PATH: join(dir, "STOP"),
    ...extraEnv,
  });
  async function run(...args: string[]) {
    const child = Bun.spawn([process.execPath, "--no-env-file", "--no-addons", "--no-install", `--config=${configPath}`, "--preload", guardPath, join(ROOT, "scripts/okx-operator.ts"), ...args], {
      cwd: dir, env, stdout: "pipe", stderr: "pipe",
    });
    const timer = setTimeout(() => child.kill(), CHILD_TIMEOUT_MS);
    try {
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      return { stdout, stderr, code };
    } finally { clearTimeout(timer); }
  }
  return { ...paths, run };
}

test("CLI initialization rejects an occupied lock without creating a ledger or changing its owner", async () => {
  const f = fixture();
  const release = acquireLock(f.lock);
  const owner = readFileSync(f.lock);
  try {
    const result = await f.run("--init-ledger");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Operator lock present");
    expect(existsSync(f.ledger)).toBe(false);
    expect(readFileSync(f.lock)).toEqual(owner);
  } finally { release(); }
});

function ledgerWithOpenLeg(path: string) {
  const ledger = createOperatorLedger(initLedgerFile(path), ledgerFilePersister(path));
  ledger.recordExecution({ idempotencyKey: "fixture-execution", sizeUsd: 1, nowMs: 1_790_000_000_000,
    leg: { planId: "fixture-plan", candidateId: "fixture-candidate", pairKey: "196:USDT/OKB", chainIndex: "196", openedAtMs: 1_790_000_000_000, txHash: "0xfixture", intermediateAtomic: "100", status: "leg1_sent", closeTxHash: null, note: null } });
}

test("CLI reconciliation rejects another owner's lock and preserves ledger bytes", async () => {
  const f = fixture();
  ledgerWithOpenLeg(f.ledger);
  const before = readFileSync(f.ledger);
  const release = acquireLock(f.lock);
  const owner = readFileSync(f.lock);
  try {
    const result = await f.run("--reconcile", "fixture-plan", "closed");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Operator lock present");
    expect(readFileSync(f.ledger)).toEqual(before);
    expect(readFileSync(f.lock)).toEqual(owner);
  } finally { release(); }
});

test("successful initialization is one-time and releases ownership", async () => {
  const f = fixture();
  expect((await f.run("--init-ledger")).code).toBe(0);
  expect(existsSync(f.lock)).toBe(false);
  const before = readFileSync(f.ledger);
  expect((await f.run("--init-ledger")).code).toBe(0);
  expect(readFileSync(f.ledger)).toEqual(before);
  expect(existsSync(f.lock)).toBe(false);
});

test("reconciliation without --realized is refused for a leg with no recorded result and changes nothing (R10 M1)", async () => {
  const f = fixture();
  ledgerWithOpenLeg(f.ledger);
  const before = readFileSync(f.ledger);
  for (const status of ["closed", "failed"]) {
    const result = await f.run("--reconcile", "fixture-plan", status);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--realized");
    expect(readFileSync(f.ledger)).toEqual(before);
    expect(existsSync(f.lock)).toBe(false);
  }
});

test("successful reconciliation changes only the selected leg status, note and result, and releases ownership", async () => {
  const f = fixture();
  ledgerWithOpenLeg(f.ledger);
  const before = JSON.parse(readFileSync(f.ledger, "utf8"));
  const result = await f.run("--reconcile", "fixture-plan", "closed", "--realized", "-0.25");
  expect(result.code).toBe(0);
  const after = JSON.parse(readFileSync(f.ledger, "utf8"));
  expect(after.openLegs[0].status).toBe("closed");
  expect(after.openLegs[0].note).toMatch(/^manual_reconcile_/);
  expect(after.openLegs[0].realizedUsd).toBe(-0.25);
  // Everything else is untouched except the totals that the recorded result feeds.
  after.openLegs[0].status = before.openLegs[0].status;
  after.openLegs[0].note = before.openLegs[0].note;
  delete after.openLegs[0].realizedUsd;
  expect(Object.values(after.dailyRealizedUsd)).toEqual([-0.25]);
  expect(after.cumulativeRealizedUsd).toBe(-0.25);
  after.dailyRealizedUsd = before.dailyRealizedUsd;
  after.cumulativeRealizedUsd = before.cumulativeRealizedUsd;
  expect(after).toEqual(before);
  expect(existsSync(f.lock)).toBe(false);
});

test("corrupt ledger and invalid reconciliation fail closed and release ownership", async () => {
  const f = fixture();
  writeFileSync(f.ledger, "corrupt-ledger");
  const corrupt = await f.run("--init-ledger");
  expect(corrupt.code).toBe(1);
  expect(corrupt.stderr).toContain("Ledger corrompido");
  expect(readFileSync(f.ledger, "utf8")).toBe("corrupt-ledger");
  expect(existsSync(f.lock)).toBe(false);
  rmSync(f.ledger);
  const missing = await f.run("--reconcile", "fixture-plan", "closed");
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("Ledger ausente");
  expect(existsSync(f.ledger)).toBe(false);
  expect(existsSync(f.lock)).toBe(false);
});

test("synthetic state/journal writers reject occupied ownership while help stays usable", async () => {
  const f = fixture();
  const release = acquireLock(f.lock);
  const owner = readFileSync(f.lock);
  try {
    const blocked = await f.run();
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain("Operator lock present");
    expect(existsSync(f.state)).toBe(false);
    expect(existsSync(f.journal)).toBe(false);
    const help = await f.run("--help");
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("--init-ledger");
    expect(readFileSync(f.lock)).toEqual(owner);
  } finally { release(); }
  const result = await f.run();
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("SYNTHETIC");
  expect(existsSync(f.state)).toBe(true);
  expect(readFileSync(f.journal, "utf8").trim().split("\n")).toHaveLength(1);
  expect(existsSync(f.lock)).toBe(false);
  expect(existsSync(f.ledger)).toBe(false);
});

test("source ordering supplements live snapshot ownership and model-error cleanup", () => {
  // No live flags, providers, credentials or signers: this is not live qualification.
  const source = readFileSync(join(ROOT, "scripts/okx-operator.ts"), "utf8");
  const main = source.slice(source.indexOf("async function main()"));
  expect(main.indexOf("acquireLock(operator.lockPath)")).toBeLessThan(main.indexOf("const historyExists"));
  expect(main.indexOf("try {")).toBeLessThan(main.indexOf("openLedger(operator.ledgerPath"));
  expect(main.indexOf("try {")).toBeLessThan(main.indexOf("new JevOperatorModel"));
  expect(main).toContain('process.off("SIGINT", shutdown)');
  expect(main).toContain('process.off("SIGTERM", shutdown)');
});

test("reconciliation with --realized records the signed result that feeds the loss stops; a bad value changes nothing", async () => {
  const f = fixture();
  ledgerWithOpenLeg(f.ledger);
  const before = JSON.parse(readFileSync(f.ledger, "utf8"));
  const bad = await f.run("--reconcile", "fixture-plan", "closed", "--realized", "lots");
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain("--realized exige");
  expect(JSON.parse(readFileSync(f.ledger, "utf8"))).toEqual(before);
  expect(existsSync(f.lock)).toBe(false);
  const result = await f.run("--reconcile", "fixture-plan", "closed", "--realized", "-0.25");
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("resultado -0.2500 USD registrado");
  const after = JSON.parse(readFileSync(f.ledger, "utf8"));
  expect(after.openLegs[0].status).toBe("closed");
  expect(after.openLegs[0].note).toMatch(/^manual_reconcile_.*_realized_-0\.25$/);
  expect(Object.values(after.dailyRealizedUsd)).toEqual([-0.25]);
  expect(after.cumulativeRealizedUsd).toBe(-0.25);
  expect(after.peakRealizedUsd).toBe(0);
  expect(existsSync(f.lock)).toBe(false);
});

test("an implausible --realized (more than twice the plan size limit) is refused and the ledger stays byte for byte (R10 M2)", async () => {
  const f = fixture();
  ledgerWithOpenLeg(f.ledger);
  const before = readFileSync(f.ledger);
  // The micro profile limits a plan to 5 USD, so the largest accepted result is 10 USD in absolute value.
  for (const value of ["42", "-42", "10.01", "-10.01"]) {
    const result = await f.run("--reconcile", "fixture-plan", "closed", "--realized", value);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--realized exige");
    expect(readFileSync(f.ledger)).toEqual(before);
    expect(existsSync(f.lock)).toBe(false);
  }
});

test("the --realized limit follows OPERATOR_MAX_PLAN_USD", async () => {
  const f = fixture({ OPERATOR_MAX_PLAN_USD: "1" });
  ledgerWithOpenLeg(f.ledger);
  const before = readFileSync(f.ledger);
  const refused = await f.run("--reconcile", "fixture-plan", "closed", "--realized", "2.5");
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("--realized exige");
  expect(readFileSync(f.ledger)).toEqual(before);
  const accepted = await f.run("--reconcile", "fixture-plan", "closed", "--realized", "-2");
  expect(accepted.code).toBe(0);
  expect(JSON.parse(readFileSync(f.ledger, "utf8")).cumulativeRealizedUsd).toBe(-2);
});

test("a plan takes one result: the second --realized is refused, but a leg that has one can still be closed without a value (R10 M2)", async () => {
  const f = fixture();
  ledgerWithOpenLeg(f.ledger);
  const first = await f.run("--reconcile", "fixture-plan", "failed", "--realized", "-1.5");
  expect(first.code).toBe(0);
  const afterFirst = readFileSync(f.ledger);
  expect(JSON.parse(afterFirst.toString("utf8")).cumulativeRealizedUsd).toBe(-1.5);

  const second = await f.run("--reconcile", "fixture-plan", "failed", "--realized", "-1.5");
  expect(second.code).toBe(1);
  expect(second.stderr).toContain("já tem resultado");
  expect(readFileSync(f.ledger)).toEqual(afterFirst);
  const third = await f.run("--reconcile", "fixture-plan", "closed", "--realized", "-9");
  expect(third.code).toBe(1);
  expect(readFileSync(f.ledger)).toEqual(afterFirst);
  expect(existsSync(f.lock)).toBe(false);

  const closed = await f.run("--reconcile", "fixture-plan", "closed");
  expect(closed.code).toBe(0);
  const after = JSON.parse(readFileSync(f.ledger, "utf8"));
  expect(after.openLegs[0]).toMatchObject({ status: "closed", realizedUsd: -1.5 });
  expect(Object.values(after.dailyRealizedUsd)).toEqual([-1.5]);
  expect(after.cumulativeRealizedUsd).toBe(-1.5);
  expect(existsSync(f.lock)).toBe(false);
});
