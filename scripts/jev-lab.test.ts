import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serializeCapture } from "../src/lab/capture-format.ts";
import { main } from "./jev-lab.ts";
import { MOCK_WARNING, STANDING_DISCLAIMER } from "../src/lab/run.ts";
import { SyntheticSource, syntheticConfig } from "../src/lab/source.ts";
import type { LabReport } from "../src/lab/types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md section 10. Titles start with the acceptance id (LB17, LB23, LB25).
// Everything is synthetic: no key, no wallet, no real configuration. A canary secret in the environment must never
// change the output nor appear in it.

const ROOT = resolve(import.meta.dir, "..");
const CLI = resolve(ROOT, "scripts", "jev-lab.ts");
const SCRATCH = mkdtempSync(join(tmpdir(), "jev-lab-cli-"));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
const freshDir = (): string => join(SCRATCH, `out-${(counter += 1)}`);

const BANNED = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((c) => String.fromCharCode(c)).join("")}]`);

type Run = { code: number; stdout: string; stderr: string };

/** A real child process: exit codes, stdout and stderr exactly as a shell sees them. */
async function spawned(...args: string[]): Promise<Run> {
  const child = Bun.spawn(["bun", "--no-env-file", "run", CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, JEV_LAB_CANARY: "SYNTHETIC_SECRET_CANARY_VALUE", TYPESAFE_AI_API_KEY: "SYNTHETIC_SECRET_CANARY_VALUE" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { code, stdout, stderr };
}

/** The same main(), in this process, with stdout and stderr captured: fast enough for the whole matrix of cases. */
async function run(...args: string[]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => (out.push(String(chunk)), true)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => (err.push(String(chunk)), true)) as typeof process.stderr.write;
  try {
    const code = await main(args);
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
}

const SMALL = ["--synthetic", "--epochs", "40", "--seed", "7"];

describe("LB25 help and usage errors", () => {
  test("LB25 --help prints the usage, says the Jev is the mock, lists the exit codes and exits 0", async () => {
    const result = await spawned("--help");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("run --synthetic --epochs <N> --seed <S>");
    expect(result.stdout).toContain("report --journal");
    expect(result.stdout).toContain("MockJevChooser");
    expect(result.stdout).toContain("Códigos de saída: 0");
    expect(result.stdout).toContain("somente sombra");
    expect(result.stdout).toContain("Nada aqui prova lucro e nada aqui concede permissão");
    expect(result.stdout).not.toMatch(BANNED);
    expect(result.stderr).toBe("");
  });

  const bad: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["no arguments", []],
    ["unknown subcommand", ["go"]],
    ["unknown flag", ["run", ...SMALL, "--out", "x", "--turbo"]],
    ["repeated flag", ["run", ...SMALL, "--seed", "8", "--out", "x"]],
    ["missing value", ["run", "--synthetic", "--epochs", "40", "--seed"]],
    ["value that is a flag", ["run", "--synthetic", "--epochs", "--seed", "7", "--out", "x"]],
    ["missing --out", ["run", ...SMALL]],
    ["missing --epochs", ["run", "--synthetic", "--seed", "7", "--out", "x"]],
    ["missing --seed", ["run", "--synthetic", "--epochs", "40", "--out", "x"]],
    ["neither --synthetic nor --capture", ["run", "--epochs", "40", "--seed", "7", "--out", "x"]],
    ["both --synthetic and --capture", ["run", ...SMALL, "--capture", "f.jsonl", "--out", "x"]],
    ["scientific notation", ["run", "--synthetic", "--epochs", "4e1", "--seed", "7", "--out", "x"]],
    ["decimal comma", ["run", ...SMALL, "--planted-edge", "2,5", "--out", "x"]],
    ["negative seed", ["run", "--synthetic", "--epochs", "40", "--seed", "-1", "--out", "x"]],
    ["seed above 32 bits", ["run", "--synthetic", "--epochs", "40", "--seed", "4294967296", "--out", "x"]],
    ["zero epochs", ["run", "--synthetic", "--epochs", "0", "--seed", "7", "--out", "x"]],
    ["too many epochs", ["run", "--synthetic", "--epochs", "50001", "--seed", "7", "--out", "x"]],
    ["planted edge too big for the volatility", ["run", ...SMALL, "--planted-edge", "9000", "--out", "x"]],
    ["step that is not a multiple of the bar", ["run", ...SMALL, "--step-ms", "1000000", "--out", "x"]],
    ["--epochs with --capture", ["run", "--capture", "f.jsonl", "--epochs", "5", "--out", "x"]],
    ["--planted-edge with --capture", ["run", "--capture", "f.jsonl", "--planted-edge", "5", "--out", "x"]],
    ["a flag of the other subcommand", ["report", "--out", "x"]],
    ["report without --journal", ["report"]],
    ["unexpected argument", ["run", ...SMALL, "--out", "x", "stray"]],
    ["capture file that does not exist", ["run", "--capture", join(SCRATCH, "no-such-file.jsonl"), "--out", "x"]],
    ["report of a path that does not exist", ["report", "--journal", join(SCRATCH, "no-such-journal.jsonl")]],
  ];
  for (const [name, args] of bad) {
    test(`LB25 usage error (${name}) exits 2 with nothing on stdout`, async () => {
      const result = await run(...args);
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr.startsWith("erro de uso:")).toBe(true);
      expect(result.stderr).not.toMatch(BANNED);
      expect(result.stderr).not.toContain("SYNTHETIC_SECRET_CANARY_VALUE");
    });
  }
});

describe("LB25 a synthetic run", () => {
  test("LB25 exit 0, a JSON report on stdout, a Portuguese summary on stderr, the mock announced and the disclaimer last", async () => {
    const out = freshDir();
    const ok = await spawned("run", ...SMALL, "--out", out);
    expect(ok.code).toBe(0);
    const report = JSON.parse(ok.stdout) as LabReport;
    expect(report.schema).toBe("jev-lab-report-v1");
    expect(report.mode).toBe("synthetic");
    expect(report.jev).toEqual({ chooser: "mock", isMock: true, realJevCalled: false, warning: MOCK_WARNING });
    expect(report.run).toMatchObject({ epochs: 40, seed: 7, plantedEdgeBps: 0 });
    expect(report.policies.map((p) => p.id)).toEqual(["hold", "random", "buy-and-hold", "momentum-rule", "carry-rule", "jev"]);
    expect(Object.keys(report).at(-1)).toBe("disclaimer");
    expect(report.disclaimer).toBe(STANDING_DISCLAIMER);
    expect(report.gate.recommendedPhase).toBe("fase-0");
    expect(report.gate.grantsPermission).toBe(false);
    const lines = ok.stderr.trimEnd().split("\n");
    expect(lines[0]).toContain("somente sombra");
    expect(lines[1]).toBe(MOCK_WARNING);
    expect(lines.at(-1)).toBe(STANDING_DISCLAIMER);
    expect(ok.stderr).toContain("Diário:");
    expect(readdirSync(out).sort()).toEqual(["journal.jsonl", "snapshot.json"]);
  });

  test("LB25 the same seed gives the same bytes on stdout and in the journal; another seed does not", async () => {
    const a = freshDir();
    const b = freshDir();
    const c = freshDir();
    const first = await spawned("run", ...SMALL, "--out", a);
    const second = await spawned("run", ...SMALL, "--out", b);
    const other = await run("run", "--synthetic", "--epochs", "40", "--seed", "8", "--out", c);
    expect(second.stdout).toBe(first.stdout);
    expect(readFileSync(join(b, "journal.jsonl"), "utf8")).toBe(readFileSync(join(a, "journal.jsonl"), "utf8"));
    expect(other.stdout).not.toBe(first.stdout);
  });

  test("LB22 running again in the same folder resumes: same report, journal untouched", async () => {
    const out = freshDir();
    const first = await run("run", ...SMALL, "--out", out);
    const bytes = readFileSync(join(out, "journal.jsonl"));
    const again = await run("run", ...SMALL, "--out", out);
    expect(again.code).toBe(0);
    expect(again.stdout).toBe(first.stdout);
    expect(readFileSync(join(out, "journal.jsonl")).equals(bytes)).toBe(true);
    expect(again.stderr).toContain("épocas novas 0, já completas 40");
  });

  test("LB25 the report subcommand rebuilds exactly the report of the run, from a file or from the folder", async () => {
    const out = freshDir();
    const made = await run("run", ...SMALL, "--out", out);
    const fromFile = await run("report", "--journal", join(out, "journal.jsonl"));
    const fromFolder = await run("report", "--journal", out);
    expect(fromFile.code).toBe(0);
    expect(fromFile.stdout).toBe(made.stdout);
    expect(fromFolder.stdout).toBe(made.stdout);
    expect(fromFile.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
    expect(fromFile.stderr).toContain("SUBSTITUTO SIMULADO");
  });

  test("LB19 a planted edge makes the mock act and shows in the report; without it the mock abstains", async () => {
    const plain = JSON.parse((await run("run", "--synthetic", "--epochs", "120", "--seed", "3", "--out", freshDir())).stdout) as LabReport;
    const planted = JSON.parse((await run("run", "--synthetic", "--epochs", "120", "--seed", "3", "--planted-edge", "40", "--out", freshDir())).stdout) as LabReport;
    const jevPlain = plain.policies.find((p) => p.id === "jev");
    const jevPlanted = planted.policies.find((p) => p.id === "jev");
    expect(jevPlain?.trades).toBe(0);
    expect(jevPlanted?.trades).toBeGreaterThan(10);
    expect(planted.run.plantedEdgeBps).toBe(40);
    expect(jevPlanted?.mean?.meanBps as number).toBeGreaterThan(0);
  });

  test("LB26 secrets in the environment change nothing and never appear in any output or file", async () => {
    const out = freshDir();
    const result = await spawned("run", ...SMALL, "--out", out);
    for (const text of [result.stdout, result.stderr, readFileSync(join(out, "journal.jsonl"), "utf8")]) expect(text).not.toContain("SYNTHETIC_SECRET_CANARY_VALUE");
    const withoutCanary = { ...process.env };
    delete withoutCanary.JEV_LAB_CANARY;
    delete withoutCanary.TYPESAFE_AI_API_KEY;
    const clean = Bun.spawn(["bun", "--no-env-file", "run", CLI, "run", ...SMALL, "--out", freshDir()], { cwd: ROOT, env: withoutCanary, stdout: "pipe", stderr: "pipe" });
    expect(await new Response(clean.stdout).text()).toBe(result.stdout);
  });

  test("LB27 no output carries a middle dot, dash or other banned mark", async () => {
    const result = await run("run", ...SMALL, "--out", freshDir());
    expect(result.stdout).not.toMatch(BANNED);
    expect(result.stderr).not.toMatch(BANNED);
  });
});

describe("LB23 a damaged journal stops the run with exit 3 and nothing is overwritten", () => {
  async function made(): Promise<string> {
    const out = freshDir();
    await run("run", ...SMALL, "--out", out);
    return out;
  }

  test("LB23 journal deleted while the snapshot remains: exit 3, empty stdout, no new journal", async () => {
    const out = await made();
    rmSync(join(out, "journal.jsonl"));
    const result = await spawned("run", ...SMALL, "--out", out);
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PARADA de integridade do diário (missing)");
    expect(existsSync(join(out, "journal.jsonl"))).toBe(false);
  });

  test("LB23 a corrupt line stops both run and report and names the line", async () => {
    const out = await made();
    const path = join(out, "journal.jsonl");
    const lines = readFileSync(path, "utf8").split("\n");
    lines[4] = "garbage";
    writeFileSync(path, lines.join("\n"));
    const before = readFileSync(path);
    const again = await run("run", ...SMALL, "--out", out);
    expect(again.code).toBe(3);
    expect(again.stdout).toBe("");
    expect(again.stderr).toContain("linha 5");
    const report = await run("report", "--journal", path);
    expect(report.code).toBe(3);
    expect(report.stderr).toContain("linha 5");
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  test("LB23 another configuration in the same folder stops the run", async () => {
    const out = await made();
    const result = await run("run", "--synthetic", "--epochs", "40", "--seed", "9", "--out", out);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("(mismatch)");
  });

  test("LB23 an incomplete epoch makes the report refuse, and a run in the same folder completes it", async () => {
    const out = await made();
    const path = join(out, "journal.jsonl");
    const lines = readFileSync(path, "utf8").split("\n");
    const dropped = lines.findIndex((line) => line.startsWith('{"type":"outcome"'));
    lines.splice(dropped, 1);
    writeFileSync(path, lines.join("\n"));
    rmSync(join(out, "snapshot.json"));
    const refused = await run("report", "--journal", path);
    expect(refused.code).toBe(3);
    expect(refused.stderr).toContain("incomplete");
    const healed = await run("run", ...SMALL, "--out", out);
    expect(healed.code).toBe(0);
  });
});

describe("LB6 replaying a capture file", () => {
  const config = syntheticConfig({ seed: 21, epochs: 30, stepMs: 6 * 3_600_000, horizonMs: 24 * 3_600_000 });
  const source = new SyntheticSource(config);
  const capturePath = join(SCRATCH, "capture.jsonl");
  writeFileSync(capturePath, serializeCapture(source.records));
  const flags = ["--seed", "21", "--step-ms", "21600000", "--horizon-ms", "86400000", "--bar-ms", "900000"];

  test("LB6 a capture is replayed with the same machinery: replay mode, mock announced, data criterion unknown and never passed", async () => {
    const result = await run("run", "--capture", capturePath, "--out", freshDir(), ...flags);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as LabReport;
    expect(report.mode).toBe("replay");
    expect(report.source).toMatch(/^replay:[0-9a-f]{16}$/);
    expect(report.run.epochs).toBeGreaterThan(5);
    expect(report.jev.isMock).toBe(true);
    expect(report.gate.unknown.map((c) => c.id)).toContain("dados-reais");
    expect(report.gate.passed.map((c) => c.id)).not.toContain("dados-reais");
    expect(report.notes.join(" ")).toContain("não verifica a origem");
    expect(result.stderr).toContain("captura reproduzida");
  });

  test("LB6 a malformed capture is refused with the line number, exit 2", async () => {
    const bad = join(SCRATCH, "bad-capture.jsonl");
    const text = readFileSync(capturePath, "utf8").split("\n");
    text[9] = '{"t":1,"kind":"mark","inst":"lower-case","data":{"price":1}}';
    writeFileSync(bad, text.join("\n"));
    const result = await run("run", "--capture", bad, "--out", freshDir(), ...flags);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("linha 10");
  });

  test("LB6 a capture too short for the horizon is refused, exit 2", async () => {
    const result = await run("run", "--capture", capturePath, "--out", freshDir(), "--seed", "1", "--horizon-ms", String(31 * 86_400_000));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("captura curta demais");
  });

  test("LB6 replaying the same file twice into one folder resumes without duplicating", async () => {
    const out = freshDir();
    const first = await run("run", "--capture", capturePath, "--out", out, ...flags);
    const bytes = readFileSync(join(out, "journal.jsonl"));
    const second = await run("run", "--capture", capturePath, "--out", out, ...flags);
    expect(second.code).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(readFileSync(join(out, "journal.jsonl")).equals(bytes)).toBe(true);
  });
});
