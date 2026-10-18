import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deriveLimits, PHASE_IDS } from "../src/policy/envelope.ts";

// Spec: docs/POLITICA-DE-LIMITES.md section 8. Test titles start with the acceptance id (L21..L27).
// Everything here is synthetic: no key, wallet, owner or real configuration. A canary secret in the
// environment must never change the output nor appear in it (L24).

const ROOT = resolve(import.meta.dir, "..");
const CLI = resolve(ROOT, "scripts", "policy-envelope.ts");
const SCRATCH = mkdtempSync(join(tmpdir(), "policy-envelope-"));

process.env.POLICY_ENVELOPE_CANARY = "SYNTHETIC_SECRET_CANARY_VALUE";

type Run = { code: number; stdout: string; stderr: string };

async function run(...args: string[]): Promise<Run> {
  const child = Bun.spawn(["bun", "--no-env-file", "run", CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

/** A settings file inside the scratch directory. Returns its path. */
function fixture(name: string, contents: unknown): string {
  const path = join(SCRATCH, name);
  writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  return path;
}

const PHASE_1_OK = {
  capitalUsd: 100, sigmaDaily: 0.04,
  leverage: 1, maxPlanUsd: 1, maxCapitalFractionPerPlan: 0.01, maxDailyNotionalUsd: 20, maxDailyPlans: 4,
  cooldownMs: 900_000, dailyStopCooldownMs: 86_400_000, weeklyStopCooldownMs: 259_200_000, drawdownManualReactivation: true,
  dailyStopPct: 0.02, weeklyStopPct: 0.05, drawdownStopPct: 0.1,
  killSwitchConfigured: true, dedicatedWallet: true,
};

describe("L21 deriving limits", () => {
  test("L21 prints pure JSON with deriveLimits of the three phases, a pt-BR summary on stderr and exit 0", async () => {
    const first = await run("--capital", "80", "--sigma", "0.04");
    expect(first.code).toBe(0);
    expect(first.stdout).toEndWith("\n");
    // Pure JSON: stdout must parse on its own with no surrounding text.
    const report = JSON.parse(first.stdout) as Record<string, any>;
    expect(report.schema).toBe("policy-envelope-v1");
    expect(report.kind).toBe("derived-limits");
    expect(Object.keys(report.limits)).toEqual([...PHASE_IDS]);
    for (const phase of PHASE_IDS) {
      expect(report.limits[phase]).toEqual(deriveLimits({ capitalUsd: 80, sigmaDaily: 0.04, phase }));
    }
    expect(first.stderr.length).toBeGreaterThan(0);
  });

  test("L21 is deterministic byte for byte across runs", async () => {
    const first = await run("--capital", "100", "--sigma", "0.04");
    const second = await run("--capital", "100", "--sigma", "0.04");
    expect(second.stdout).toBe(first.stdout);
    expect(second.stderr).toBe(first.stderr);
    expect(second.code).toBe(first.code);
  });

  test("L21 --kelly-lower-bound closes the leverage cap of phase 2 and changes nothing in the other phases", async () => {
    const without = JSON.parse((await run("--capital", "100", "--sigma", "0.04")).stdout) as Record<string, any>;
    const with_ = JSON.parse((await run("--capital", "100", "--sigma", "0.04", "--kelly-lower-bound", "8")).stdout) as Record<string, any>;
    expect(with_.limits["fase-2"].leverageCap).toBe(2);
    expect(with_.limits["fase-2"].unknown).toEqual([]);
    expect(without.limits["fase-2"].leverageCap).toBeNull();
    expect(without.limits["fase-2"].unknown).toEqual(["kellyLowerBound"]);
    expect(with_.limits["fase-1"]).toEqual(without.limits["fase-1"]);
    expect(with_.limits["fase-0"]).toEqual(without.limits["fase-0"]);
  });

  test("L21 every output says it is not authorization nor a recommendation", async () => {
    const derived = await run("--capital", "100", "--sigma", "0.04");
    expect(derived.stderr).toContain("nao autorizacao nem recomendacao");
    expect(derived.stdout).not.toMatch(/aprovado|liberado|pronto para operar/i);
  });
});

describe("L22 checking a settings file", () => {
  test("L22 reads only the given file and prints the checkSettings result with grantsPermission false", async () => {
    const path = fixture("phase1.json", PHASE_1_OK);
    const result = await run("--check", path, "--phase", "fase-1");
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.kind).toBe("settings-check");
    expect(report.phase).toBe("fase-1");
    expect(report.phaseSource).toBe("explicit");
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.unknown).toEqual([]);
    expect(report.grantsPermission).toBe(false);
    expect(report.io.filesRead).toEqual(["phase1.json"]);
  });

  test("L22 exits 0 for a complete report even when the configuration is outside the envelope", async () => {
    const path = fixture("outside.json", { ...PHASE_1_OK, leverage: 5, maxPlanUsd: 900 });
    const result = await run("--check", path, "--phase", "fase-1");
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.ok).toBe(false);
    expect(report.violations.map((entry: { id: string }) => entry.id)).toEqual(["maxPlanUsd", "leverage"]);
    expect(result.stdout).not.toMatch(/aprovado|liberado|pronto para operar/i);
    expect(result.stderr).toContain("nao e autorizacao nem recomendacao");
  });

  test("L22 without --phase it uses phase 0 and says so", async () => {
    const path = fixture("default-phase.json", PHASE_1_OK);
    const result = await run("--check", path);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.phase).toBe("fase-0");
    expect(report.phaseSource).toBe("default");
    expect(report.ok).toBe(false);
  });
});

describe("L23 usage and input errors", () => {
  const badInvocations: readonly (readonly [string, readonly string[]])[] = [
    ["no arguments", []],
    ["unknown flag", ["--capital", "80", "--sigma", "0.04", "--unknown"]],
    ["repeated flag", ["--capital", "80", "--capital", "90", "--sigma", "0.04"]],
    ["missing value", ["--capital", "80", "--sigma"]],
    ["malformed number", ["--capital", "0,04", "--sigma", "0.04"]],
    ["exponent notation", ["--capital", "4e2", "--sigma", "0.04"]],
    ["invalid combination", ["--capital", "80", "--sigma", "0.04", "--check", "anything.json"]],
    ["invalid phase", ["--check", "anything.json", "--phase", "fase-9"]],
    ["missing file", ["--check", join(SCRATCH, "does-not-exist.json")]],
    ["malformed json", ["--check", fixture("broken.json", "{ not json")]],
    ["json that is not an object", ["--check", fixture("array.json", [1, 2, 3])]],
  ];

  test("L23 every usage or input error exits 2 with nothing on stdout", async () => {
    for (const [name, args] of badInvocations) {
      const result = await run(...args);
      expect({ name, code: result.code }).toEqual({ name, code: 2 });
      expect({ name, stdout: result.stdout }).toEqual({ name, stdout: "" });
      expect(result.stderr.length).toBeGreaterThan(0);
    }
  });

  test("L23 a directory and an oversized file are refused", async () => {
    const directory = join(SCRATCH, "a-directory.json");
    mkdirSync(directory, { recursive: true });
    expect((await run("--check", directory)).code).toBe(2);
    const big = join(SCRATCH, "big.json");
    writeFileSync(big, `{"padding":"${"x".repeat(1024 * 1024 + 16)}"}`);
    expect((await run("--check", big)).code).toBe(2);
    rmSync(directory, { force: true, recursive: true });
    rmSync(big, { force: true });
  });

  test("L23 --help exits 0 and prints usage on stdout", async () => {
    const result = await run("--help");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--capital");
    expect(result.stdout).toContain("--check");
  });
});

describe("L24 isolation", () => {
  test("L24 a secret in the environment neither changes the output nor appears in it", async () => {
    const before = process.env.POLICY_ENVELOPE_CANARY;
    const withSecret = await run("--capital", "100", "--sigma", "0.04");
    process.env.POLICY_ENVELOPE_CANARY = "A_COMPLETELY_DIFFERENT_CANARY";
    const withOtherSecret = await run("--capital", "100", "--sigma", "0.04");
    process.env.POLICY_ENVELOPE_CANARY = before;

    expect(withOtherSecret.stdout).toBe(withSecret.stdout);
    expect(withOtherSecret.stderr).toBe(withSecret.stderr);
    for (const canary of ["SYNTHETIC_SECRET_CANARY_VALUE", "A_COMPLETELY_DIFFERENT_CANARY"]) {
      expect(withSecret.stdout).not.toContain(canary);
      expect(withSecret.stderr).not.toContain(canary);
    }
  });

  test("L24 the report declares no network and no environment use, and never prints text values from the file", async () => {
    const path = fixture("text-values.json", {
      ...PHASE_1_OK,
      apiKey: "SYNTHETIC_FILE_TEXT_CANARY",
      notes: "SYNTHETIC_NOTES_CANARY",
      owner: "SYNTHETIC_OWNER_CANARY",
    });
    const result = await run("--check", path, "--phase", "fase-1");
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.io).toEqual({ network: false, environment: false, filesRead: ["text-values.json"] });
    for (const canary of ["SYNTHETIC_FILE_TEXT_CANARY", "SYNTHETIC_NOTES_CANARY", "SYNTHETIC_OWNER_CANARY"]) {
      expect(result.stdout).not.toContain(canary);
    }
    // The folder of the file is never printed, only its name.
    expect(result.stdout).not.toContain(SCRATCH);
  });

  test("L24 the CLI writes no file of its own", async () => {
    const before = [...new Bun.Glob("**/*").scanSync({ cwd: SCRATCH, onlyFiles: true })].sort();
    await run("--capital", "100", "--sigma", "0.04");
    const after = [...new Bun.Glob("**/*").scanSync({ cwd: SCRATCH, onlyFiles: true })].sort();
    expect(after).toEqual(before);
  });
});