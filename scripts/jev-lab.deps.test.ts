import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeCapture } from "../src/lab/capture-format.ts";
import { FileJournal } from "../src/lab/journal.ts";
import type { ChooserAnswer, ChooserState, LabChooser } from "../src/lab/policies.ts";
import { MOCK_WARNING, STANDING_DISCLAIMER } from "../src/lab/run.ts";
import { SyntheticSource, syntheticConfig } from "../src/lab/source.ts";
import type { LabReport } from "../src/lab/types.ts";
import { leverageAllowanceLines, main, type LabCliDeps } from "./jev-lab.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md section 10 and docs/JEV-LAB-JEV-REAL.md section 2. Titles start with the
// acceptance id (LJ1 to LJ6). Everything is synthetic and offline: the "Jev" here is a plain object in this file.

const SCRATCH = mkdtempSync(join(tmpdir(), "jev-lab-deps-"));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
const freshDir = (): string => join(SCRATCH, `out-${(counter += 1)}`);

const BANNED = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((c) => String.fromCharCode(c)).join("")}]`);

type Run = { code: number; stdout: string; stderr: string };

async function run(args: readonly string[], deps?: LabCliDeps): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => (out.push(String(chunk)), true)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => (err.push(String(chunk)), true)) as typeof process.stderr.write;
  try {
    const code = await main(args, deps);
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
}

/** A stand-in for a real Jev: a plain object that is NOT the mock, counts its consultations and reports usage. */
class StandInJev implements LabChooser {
  readonly name: string;
  readonly isMock = false;
  calls = 0;
  constructor(name = "stand-in-jev") {
    this.name = name;
  }
  choose(state: ChooserState): ChooserAnswer {
    this.calls += 1;
    const keys = ["hold", ...state.candidates.map((candidate) => candidate.key)];
    const pick = state.candidates.find((candidate) => candidate.modality === "spot-momentum");
    const choice = pick?.key ?? "hold";
    return { choice, probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? 1 : 0])), confidence: null, latencyMs: 12, inputTokens: 1000 };
  }
}

const SMALL = ["--synthetic", "--epochs", "40", "--seed", "7"];

describe("LJ1 the default behavior of main does not change", () => {
  test("LJ1 main(argv) and main(argv, {}) give the same bytes, with the mock announced loudly", async () => {
    const a = await run(["run", ...SMALL, "--out", freshDir()]);
    const b = await run(["run", ...SMALL, "--out", freshDir()], {});
    expect(b.code).toBe(0);
    expect(b.stdout).toBe(a.stdout);
    expect(b.stderr.split("\n").filter((line) => !line.startsWith("Diário:")).join("\n")).toBe(a.stderr.split("\n").filter((line) => !line.startsWith("Diário:")).join("\n"));
    const report = JSON.parse(b.stdout) as LabReport;
    expect(report.jev).toEqual({ chooser: "mock", isMock: true, realJevCalled: false, warning: MOCK_WARNING });
    expect(b.stderr.split("\n")[1]).toBe(MOCK_WARNING);
  });
});

describe("LJ2 an injected chooser replaces the mock and the warnings follow chooser.isMock", () => {
  test("LJ2 the manifest names the injected chooser, the report says it is not a mock and the mock warning disappears", async () => {
    const jev = new StandInJev("stand-in-jev");
    const result = await run(["run", ...SMALL, "--out", freshDir()], { chooser: jev });
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as LabReport;
    expect(report.jev).toEqual({ chooser: "stand-in-jev", isMock: false, realJevCalled: true, warning: null });
    expect(report.policies.find((policy) => policy.id === "jev")?.chooser).toEqual({ name: "stand-in-jev", isMock: false });
    expect(result.stderr).not.toContain("SUBSTITUTO SIMULADO");
    expect(result.stderr).not.toContain("MockJevChooser");
    expect(report.notes.join(" ")).not.toContain("MockJevChooser");
    expect(result.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
    expect(jev.calls).toBeGreaterThan(5);
  });

  test("LJ2 --help says which Jev the run uses: the mock by default, the injected one when there is one", async () => {
    const plain = await run(["--help"]);
    expect(plain.stdout).toContain("MockJevChooser");
    const injected = await run(["--help"], { chooser: new StandInJev() });
    expect(injected.code).toBe(0);
    expect(injected.stdout).not.toContain("é sempre o MockJevChooser");
    expect(injected.stdout).toContain("injetado");
    expect(injected.stdout).toContain("somente sombra");
    expect(injected.stdout).toContain("Nada aqui prova lucro e nada aqui concede permissão");
    expect(injected.stdout).not.toMatch(BANNED);
  });

  test("LJ2 a mock injected on purpose still gets the loud warning", async () => {
    const mock: LabChooser = { name: "mock-by-hand", isMock: true, choose: () => ({ choice: "hold", latencyMs: 0 }) };
    const result = await run(["run", ...SMALL, "--out", freshDir()], { chooser: mock });
    expect(result.stderr.split("\n")[1]).toBe(MOCK_WARNING);
    expect((JSON.parse(result.stdout) as LabReport).jev.isMock).toBe(true);
  });
});

describe("LJ3 price and timeout reach the manifest and the cost is recorded per epoch", () => {
  test("LJ3 inferenceUsdPerMTok and timeoutMs are in the manifest and every consulted epoch carries tokens and cost", async () => {
    const out = freshDir();
    const jev = new StandInJev();
    const result = await run(["run", ...SMALL, "--out", out], { chooser: jev, inferenceUsdPerMTok: 2.5, timeoutMs: 7000 });
    expect(result.code).toBe(0);
    const data = FileJournal.read(join(out, "journal.jsonl"));
    expect(data.manifest.inferenceUsdPerMTok).toBe(2.5);
    expect(data.manifest.jevTimeoutMs).toBe(7000);
    const consulted = data.epochs.filter((epoch) => epoch.eligibleIds.length > 0).map((epoch) => epoch.id);
    expect(consulted.length).toBe(jev.calls);
    const mine = data.decisions.filter((decision) => decision.policyId === "jev" && consulted.includes(decision.epochId));
    expect(mine.length).toBe(consulted.length);
    for (const decision of mine) {
      expect(decision.inputTokens).toBe(1000);
      expect(decision.costUsd).toBeCloseTo((1000 / 1_000_000) * 2.5, 12);
    }
    const report = JSON.parse(result.stdout) as LabReport;
    const inference = report.policies.find((policy) => policy.id === "jev")?.inference;
    expect(inference?.costKnown).toBe(true);
    expect(inference?.costUsdTotal).toBeCloseTo(consulted.length * 0.0025, 9);
    expect(inference?.inputTokensTotal).toBe(consulted.length * 1000);
  });

  test("LJ3 without a price the cost stays unknown (null), never zero, and the summary says so", async () => {
    const result = await run(["run", ...SMALL, "--out", freshDir()], { chooser: new StandInJev() });
    const report = JSON.parse(result.stdout) as LabReport;
    const inference = report.policies.find((policy) => policy.id === "jev")?.inference;
    expect(inference?.costKnown).toBe(false);
    expect(inference?.costUsdTotal).toBeNull();
    expect(result.stderr).toContain("Custo de inferência do Jev real (stand-in-jev): desconhecido");
  });

  test("LJ3 with a price the summary prints the cost of the real Jev and how many epochs were consulted", async () => {
    const result = await run(["run", ...SMALL, "--out", freshDir()], { chooser: new StandInJev(), inferenceUsdPerMTok: 2 });
    expect(result.stderr).toMatch(/Custo de inferência do Jev real \(stand-in-jev\): 0,\d{4} USD em \d+ épocas consultadas, tokens de entrada \d+/);
    expect(result.stderr).not.toMatch(BANNED);
  });

  test("LJ3 a different price in the same folder is a different run: the journal stops with a mismatch", async () => {
    const out = freshDir();
    await run(["run", ...SMALL, "--out", out], { chooser: new StandInJev(), inferenceUsdPerMTok: 2 });
    const other = await run(["run", ...SMALL, "--out", out], { chooser: new StandInJev(), inferenceUsdPerMTok: 3 });
    expect(other.code).toBe(3);
    expect(other.stderr).toContain("(mismatch)");
  });
});

describe("LJ4 a caller can stop a run cleanly and resume it later", () => {
  test("LJ4 shouldStop ends the run right after the epoch in which it turns true; the rest stays pending and a later run completes it without consulting twice", async () => {
    const out = freshDir();
    const first = new StandInJev();
    const stopped = await run(["run", ...SMALL, "--out", out], { chooser: first, shouldStop: () => first.calls >= 4 });
    expect(stopped.code).toBe(0);
    const report = JSON.parse(stopped.stdout) as LabReport;
    expect(first.calls).toBe(4);
    expect(report.run.epochs).toBeLessThan(40);
    expect(report.run.pendingEpochs).toBe(40 - report.run.epochs);
    expect(stopped.stderr).toContain("parada pedida pelo chamador");
    expect(stopped.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
    const afterStop = FileJournal.read(join(out, "journal.jsonl"));
    expect(afterStop.epochs.length).toBe(report.run.epochs);

    const second = new StandInJev();
    const finished = await run(["run", ...SMALL, "--out", out], { chooser: second });
    expect(finished.code).toBe(0);
    const done = JSON.parse(finished.stdout) as LabReport;
    expect(done.run.epochs).toBe(40);
    expect(done.run.pendingEpochs).toBe(0);
    const all = FileJournal.read(join(out, "journal.jsonl"));
    const consultedTotal = all.epochs.filter((epoch) => epoch.eligibleIds.length > 0).length;
    expect(first.calls + second.calls).toBe(consultedTotal);
    expect(finished.stderr).toContain("já completas");
  });

  test("LJ4 a shouldStop that is already true before the first epoch still lets one epoch be stored and then stops", async () => {
    const out = freshDir();
    const result = await run(["run", ...SMALL, "--out", out], { chooser: new StandInJev(), shouldStop: () => true });
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as LabReport).run.epochs).toBe(1);
  });
});

describe("LJ5 the leverage that the measured advantage justifies is always stated, as a diagnostic that grants nothing", () => {
  const synthetic = async (): Promise<LabReport> => JSON.parse((await run(["run", ...SMALL, "--out", freshDir()])).stdout) as LabReport;

  async function replayReport(): Promise<LabReport> {
    const config = syntheticConfig({ seed: 21, epochs: 30, stepMs: 6 * 3_600_000, horizonMs: 24 * 3_600_000 });
    const capturePath = join(SCRATCH, "capture-allowance.jsonl");
    writeFileSync(capturePath, serializeCapture(new SyntheticSource(config).records));
    const flags = ["--seed", "21", "--step-ms", "21600000", "--horizon-ms", "86400000", "--bar-ms", "900000"];
    return JSON.parse((await run(["run", "--capture", capturePath, "--out", freshDir(), ...flags], { chooser: new StandInJev(), inferenceUsdPerMTok: 2 })).stdout) as LabReport;
  }

  function withKelly(report: LabReport, bound: number | null, cap: number | null, overrides: Partial<Pick<LabReport, "mode">> & { isMock?: boolean } = {}): LabReport {
    const copy = structuredClone(report);
    const subject = copy.policies.find((policy) => policy.tested && !policy.baseline);
    if (subject === undefined) throw new Error("the report has no Jev policy");
    subject.portfolio = { dailyMean: 0.01, dailySd: 0.02, kellyLowerBound: bound, leverageCapPhase2: cap };
    if (overrides.mode !== undefined) copy.mode = overrides.mode;
    if (overrides.isMock !== undefined) copy.jev.isMock = overrides.isMock;
    return copy;
  }

  test("LJ5 a default run prints the line with 0x, the criteria that are missing and the statement that it grants nothing", async () => {
    const result = await run(["run", ...SMALL, "--out", freshDir()]);
    expect(result.stderr).toContain("Alavancagem que a vantagem medida do Jev justifica: 0x");
    expect(result.stderr).toContain("Critérios que faltam:");
    expect(result.stderr).toContain("dados-reais");
    expect(result.stderr).toContain("fills-reais-conciliados");
    expect(result.stderr).toContain("não concede nada");
    expect(result.stderr).toContain("decisão D11");
    expect(result.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
    expect(result.stderr).not.toMatch(BANNED);
  });

  test("LJ5 the report subcommand prints the same line", async () => {
    const out = freshDir();
    await run(["run", ...SMALL, "--out", out]);
    const again = await run(["report", "--journal", out]);
    expect(again.stderr).toContain("Alavancagem que a vantagem medida do Jev justifica: 0x");
  });

  test("LJ5 no data for the Kelly bound: zero, and it says the data is missing", async () => {
    const lines = leverageAllowanceLines(withKelly(await replayReport(), null, null, { mode: "replay", isMock: false }));
    expect(lines[0]).toBe("Alavancagem que a vantagem medida do Jev justifica: 0x (faltam dados para o limite inferior do Kelly).");
  });

  test("LJ5 a Kelly lower bound that is not positive: zero, and it says so", async () => {
    const lines = leverageAllowanceLines(withKelly(await replayReport(), 0, 0, { mode: "replay", isMock: false }));
    expect(lines[0]).toBe("Alavancagem que a vantagem medida do Jev justifica: 0x (o limite inferior do Kelly não é positivo).");
  });

  test("LJ5 a positive bound from a real chooser on a replay: the phase 2 cap of the envelope is shown, still as a diagnostic", async () => {
    const lines = leverageAllowanceLines(withKelly(await replayReport(), 2, 0.5, { mode: "replay", isMock: false }));
    expect(lines[0]).toBe("Alavancagem que a vantagem medida do Jev justifica: 0,50x (teto da fase 2 pela fórmula do envelope, a partir do limite inferior do Kelly de 2,00).");
    expect(lines.join(" ")).toContain("não concede nada");
    expect(lines.join(" ")).toContain("continua 0x");
  });

  test("LJ5 a positive bound measured with the mock or on synthetic data is shown as zero, with the raw formula in view", async () => {
    const base = await synthetic();
    const mock = leverageAllowanceLines(withKelly(base, 2, 0.5, { mode: "replay", isMock: true }));
    expect(mock[0]).toBe("Alavancagem que a vantagem medida do Jev justifica: 0x (a medida usa o Mock, que só testa a máquina e não justifica alavancagem; a fórmula bruta daria 0,50x).");
    const synthetic2 = leverageAllowanceLines(withKelly(base, 2, 0.5, { mode: "synthetic", isMock: false }));
    expect(synthetic2[0]).toBe("Alavancagem que a vantagem medida do Jev justifica: 0x (a medida usa dados sintéticos, que só testam a máquina e não justificam alavancagem; a fórmula bruta daria 0,50x).");
  });

  test("LJ5 the criteria that are missing come from the gate, failed first and then unknown", async () => {
    const report = await replayReport();
    const lines = leverageAllowanceLines(report);
    const text = lines.join("\n");
    for (const criterion of report.gate.failed) expect(text).toContain(criterion.id);
    for (const criterion of report.gate.unknown) expect(text).toContain(criterion.id);
    expect(text.indexOf("reprovados")).toBeLessThan(text.indexOf("desconhecidos"));
    expect(text).toContain("autorizacao-e-assinante");
  });

  test("LJ5 a report without a Jev policy still yields a line of zero", () => {
    const empty = { mode: "replay", jev: { chooser: "x", isMock: false, realJevCalled: true, warning: null }, policies: [], gate: { failed: [], unknown: [], passed: [] } } as unknown as LabReport;
    expect(leverageAllowanceLines(empty)[0]).toContain("justifica: 0x");
  });
});

describe("LJ6 the file of a stopped or finished run is the same journal the old report reads", () => {
  test("LJ6 the report subcommand of the plain CLI reads a journal made with an injected chooser and shows the cost line", async () => {
    const out = freshDir();
    const made = await run(["run", ...SMALL, "--out", out], { chooser: new StandInJev("jev-latest"), inferenceUsdPerMTok: 2 });
    expect(made.code).toBe(0);
    const again = await run(["report", "--journal", join(out, "journal.jsonl")]);
    expect(again.code).toBe(0);
    expect(again.stdout).toBe(made.stdout);
    expect(again.stderr).toContain("Custo de inferência do Jev real (jev-latest)");
    expect(readFileSync(join(out, "journal.jsonl"), "utf8")).not.toMatch(BANNED);
  });
});
