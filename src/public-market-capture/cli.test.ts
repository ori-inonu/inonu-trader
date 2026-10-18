import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { fixturePlan, fixtureAccess, fixtureDependencies } from "./capture.test";
import { runCapture } from "./index";

/* Every test here starts a child bun process. Under a loaded machine the child can take well over
   the five seconds it needs when idle, so the child timeout and the per test timeout are raised.
   No assertion changes. */
const CHILD_TIMEOUT_MS = 45_000;
setDefaultTimeout(60_000);
const cli = fileURLToPath(new URL("../../scripts/public-market-capture.ts", import.meta.url));
function execute(args: string[], cwd: string) { const r = spawnSync(process.execPath, ["--no-env-file", cli, ...args], { cwd, encoding: "utf8", timeout: CHILD_TIMEOUT_MS }); return { ...r, report: r.stdout.trim() ? JSON.parse(r.stdout) : null }; }

test("C01 CLI defaults offline with an empty working directory", () => {
  const root = mkdtempSync(join(tmpdir(), "inonu-cli-")), result = execute([], root);
  expect(result.status).toBe(0); expect(result.report).toMatchObject({ outcome: "not_started", stopReason: "offline", strategyQualified: false, executionQualified: false, profitEvidence: false }); expect(readdirSync(root)).toEqual([]);
});

test("C01 CLI explicit capture keeps actual runtime unqualified before directory creation", () => {
  const root = mkdtempSync(join(tmpdir(), "inonu-cli-")), plan = fixturePlan(root), now = Date.now();
  writeFileSync(join(root, "plan.json"), JSON.stringify(plan)); writeFileSync(join(root, "access.json"), JSON.stringify({ ...fixtureAccess, evidence: "factual", issuedAt: now - 1000, expiresAt: now + 60000 }));
  const result = execute(["--capture", "--plan", join(root, "plan.json"), "--access", join(root, "access.json")], root);
  expect(result.status).toBe(2); expect(result.report).toMatchObject({ outcome: "not_started", stopReason: "runtime_capability_unqualified" }); expect(existsSync(join(root, plan.experimentId))).toBe(false);
});

test("C01 C02 CLI refuses unknown flags and oversized local input", () => {
  const root = mkdtempSync(join(tmpdir(), "inonu-cli-"));
  const unknown = execute(["--endpoint", "https://evil.invalid"], root); expect(unknown.status).toBe(2); expect(unknown.report.stopReason).toBe("invalid_cli_arguments");
  writeFileSync(join(root, "huge.json"), " ".repeat(65537));
  const huge = execute(["--capture", "--plan", join(root, "huge.json"), "--access", join(root, "huge.json")], root); expect(huge.status).toBe(2); expect(huge.report.stopReason).toBe("local_input_bounds");
});

test("C09 CLI inspect is read-only and exposes unobserved final timing", async () => {
  const plan = fixturePlan(); await runCapture(plan, fixtureDependencies([])); const directory = join(plan.outputRoot, plan.experimentId), before = readdirSync(directory);
  const result = execute(["--inspect", directory], plan.outputRoot);
  expect(result.status).toBe(0); expect(result.report.outcome).toBe("failed_incomplete"); expect(result.report.manifest.finalTiming.state).toBe("unobserved"); expect(readdirSync(directory)).toEqual(before);
});
