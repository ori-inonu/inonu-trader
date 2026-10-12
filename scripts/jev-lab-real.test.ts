import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serializeCapture } from "../src/lab/capture-format.ts";
import { FileJournal } from "../src/lab/journal.ts";
import { STANDING_DISCLAIMER } from "../src/lab/run.ts";
import { SyntheticSource, syntheticConfig } from "../src/lab/source.ts";
import type { LabReport } from "../src/lab/types.ts";
import { JEV_LAB_PROMPT_VERSION, JEV_LAB_QUESTION_ID, type JevEvaluateArgs, type JevEvaluateFn } from "../src/lab-jev/jev-chooser.ts";
import { ABORT_MARGIN_MS, DEFAULT_TIMEOUT_MS, HARD_MAX_CALLS, HARD_MAX_USD, main, type RealDeps } from "./jev-lab-real.ts";

// Spec: docs/JEV-LAB-JEV-REAL.md sections 2 to 4. Titles start with the acceptance id (LJ20 to LJ26).
// No real Jev, no real key, no network. The key in these tests is a canary string that must never be printed, written
// or put in an error. Spawned children only run paths that stop before any call (help, plan, refusals).

const ROOT = resolve(import.meta.dir, "..");
const SCRIPT = resolve(ROOT, "scripts", "jev-lab-real.ts");
const SCRATCH = mkdtempSync(join(tmpdir(), "jev-lab-real-"));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
const freshDir = (): string => join(SCRATCH, `out-${(counter += 1)}`);

const CANARY = "CANARY-TYPESAFE-KEY-0123456789abcdef";
const BANNED = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((c) => String.fromCharCode(c)).join("")}]`);
const NAME = `jev-latest@${JEV_LAB_PROMPT_VERSION}`;
const GOOD_ENV = { TYPESAFE_AI_API_KEY: CANARY, JEV_MODEL_ID: "jev-latest", JEV_USD_PER_MTOK: "2" } as const;

const config = syntheticConfig({ seed: 21, epochs: 30, stepMs: 6 * 3_600_000, horizonMs: 24 * 3_600_000 });
const CAPTURE = join(SCRATCH, "capture.jsonl");
writeFileSync(CAPTURE, serializeCapture(new SyntheticSource(config).records));
const LAB_FLAGS = ["--seed", "21", "--step-ms", "21600000", "--horizon-ms", "86400000", "--bar-ms", "900000"];

type Run = { code: number; stdout: string; stderr: string };

/** The same main(), in this process, with stdout and stderr captured; `onWrite` sees stderr as it grows. */
async function run(args: readonly string[], deps: RealDeps = {}, onWrite?: (stderrSoFar: string) => void): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => (out.push(String(chunk)), true)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => (err.push(String(chunk)), onWrite?.(err.join("")), true)) as typeof process.stderr.write;
  try {
    const code = await main(args, deps);
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
}

/** A real child process: for the paths that stop before any call. */
async function spawned(args: readonly string[], env: Record<string, string>): Promise<Run> {
  const child = Bun.spawn(["bun", "--no-env-file", "run", SCRIPT, ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { code, stdout, stderr };
}

interface Fake {
  calls: JevEvaluateArgs[];
  evaluate: JevEvaluateFn;
}

/** A fake Jev: selects the first candidate offered with 1000 input tokens, unless the script says otherwise. */
function fakeJev(behavior: (callNumber: number, args: JevEvaluateArgs) => "ok" | "throw" | "invalid" | "no-usage" = () => "ok"): Fake {
  const calls: JevEvaluateArgs[] = [];
  const evaluate: JevEvaluateFn = async (args) => {
    calls.push(args);
    const mode = behavior(calls.length, args);
    if (mode === "throw") throw new Error(`upstream failure with ${CANARY}`, { cause: new Error(CANARY) });
    const ids = (args.state as { candidates: Array<{ id: string }> }).candidates.map((candidate) => candidate.id);
    const keys = ["hold", ...ids];
    const choice = mode === "invalid" ? "c999" : ids[0];
    const probabilities = Object.fromEntries(keys.map((key) => [key, key === ids[0] ? 1 : 0]));
    return { answers: { [JEV_LAB_QUESTION_ID]: { type: "choice", choice, probabilities } }, usage: mode === "no-usage" ? {} : { inputTokens: 1000 } };
  };
  return { calls, evaluate };
}

/** A clock that advances 5 ms per reading, so that two runs of the same window write the same bytes. */
const steady = (): (() => number) => {
  let now = 0;
  return () => (now += 5);
};

const REAL = (out: string, extra: readonly string[] = []): string[] => ["run", "--capture", CAPTURE, ...LAB_FLAGS, "--out", out, "--max-usd", "1", "--max-calls", "200", "--allow-paid-inference", ...extra];

function consultedEpochs(path: string): number {
  const data = FileJournal.read(path);
  return data.epochs.filter((epoch) => epoch.eligibleIds.length > 0).length;
}

describe("LJ20 plan: the estimate needs no key and no network", () => {
  test("LJ20 plan without any environment prints epochs, consultations, tokens and says the price is unknown", async () => {
    const fake = fakeJev();
    const result = await run(["plan", "--capture", CAPTURE, ...LAB_FLAGS], { env: {}, evaluate: fake.evaluate });
    expect(result.code).toBe(0);
    const plan = JSON.parse(result.stdout);
    expect(plan.schema).toBe("jev-lab-real-plan-v1");
    expect(plan.network).toBe(false);
    expect(plan.keyRequired).toBe(false);
    expect(plan.consultations.calls).toBeGreaterThan(5);
    expect(plan.consultations.rejected).toBe(0);
    expect(plan.window.epochs).toBeGreaterThanOrEqual(plan.consultations.calls);
    expect(plan.price).toEqual({ usdPerMTok: null, source: null });
    expect(plan.cost).toEqual({ typicalUsd: null, conservativeUsd: null, maxCallUsd: null });
    expect(plan.hardMaxima).toEqual({ usd: HARD_MAX_USD, calls: HARD_MAX_CALLS });
    expect(Object.keys(plan).at(-1)).toBe("disclaimer");
    expect(plan.disclaimer).toBe(STANDING_DISCLAIMER);
    expect(result.stderr).toContain("Preço desconhecido");
    expect(result.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
    expect(fake.calls.length).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(BANNED);
  });

  test("LJ20 the price can come from --usd-per-mtok or from JEV_USD_PER_MTOK, and the cost follows the tokens", async () => {
    const flag = JSON.parse((await run(["plan", "--capture", CAPTURE, ...LAB_FLAGS, "--usd-per-mtok", "2.5"], { env: {} })).stdout);
    expect(flag.price).toEqual({ usdPerMTok: 2.5, source: "--usd-per-mtok" });
    expect(flag.cost.typicalUsd).toBeCloseTo((flag.consultations.typicalTokens.total / 1_000_000) * 2.5, 9);
    expect(flag.cost.conservativeUsd).toBeCloseTo((flag.consultations.conservativeTokens.total / 1_000_000) * 2.5, 9);
    expect(flag.cost.conservativeUsd).toBeGreaterThan(flag.cost.typicalUsd);
    expect(flag.cost.maxCallUsd).toBeCloseTo((flag.consultations.conservativeTokens.max / 1_000_000) * 2.5, 9);
    const env = JSON.parse((await run(["plan", "--capture", CAPTURE, ...LAB_FLAGS], { env: { JEV_USD_PER_MTOK: "4" } })).stdout);
    expect(env.price).toEqual({ usdPerMTok: 4, source: "JEV_USD_PER_MTOK" });
    expect(env.consultations).toEqual(flag.consultations);
  });

  test("LJ20 the plan never touches the network, even with a key in the environment, and never prints the key", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("the plan must not use the network");
    }) as unknown as typeof fetch;
    const fake = fakeJev();
    try {
      const result = await run(["plan", "--capture", CAPTURE, ...LAB_FLAGS], { env: GOOD_ENV, evaluate: fake.evaluate });
      expect(result.code).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY);
      expect(fake.calls.length).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("LJ20 the plan counts exactly the consultations that a real run makes", async () => {
    const plan = JSON.parse((await run(["plan", "--capture", CAPTURE, ...LAB_FLAGS], { env: {} })).stdout);
    const out = freshDir();
    const fake = fakeJev();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fake.evaluate });
    expect(result.code).toBe(0);
    expect(consultedEpochs(join(out, "journal.jsonl"))).toBe(plan.consultations.calls);
    expect(fake.calls.length).toBe(plan.consultations.calls + 1);
  });

  const bad: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["no capture", ["plan"]],
    ["a capture that does not exist", ["plan", "--capture", join(SCRATCH, "nope.jsonl")]],
    ["--out", ["plan", "--capture", CAPTURE, "--out", "x"]],
    ["--max-usd", ["plan", "--capture", CAPTURE, "--max-usd", "1"]],
    ["--max-calls", ["plan", "--capture", CAPTURE, "--max-calls", "10"]],
    ["--timeout-ms", ["plan", "--capture", CAPTURE, "--timeout-ms", "5000"]],
    ["--allow-paid-inference", ["plan", "--capture", CAPTURE, "--allow-paid-inference"]],
    ["--synthetic", ["plan", "--synthetic", "--epochs", "10", "--seed", "1"]],
    ["a malformed price", ["plan", "--capture", CAPTURE, "--usd-per-mtok", "2,5"]],
    ["a price of zero", ["plan", "--capture", CAPTURE, "--usd-per-mtok", "0"]],
    ["an unknown flag", ["plan", "--capture", CAPTURE, "--turbo"]],
  ];
  for (const [name, args] of bad) {
    test(`LJ20 plan with ${name} is a usage error: exit 2, nothing on stdout`, async () => {
      const result = await run(args, { env: GOOD_ENV });
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/^(erro de uso|recusado):/);
      expect(result.stderr).not.toContain(CANARY);
      expect(result.stderr).not.toMatch(BANNED);
    });
  }

  test("LJ20 a spawned plan works with the key in the real environment of the process and prints nothing secret", async () => {
    const result = await spawned(["plan", "--capture", CAPTURE, ...LAB_FLAGS], { TYPESAFE_AI_API_KEY: CANARY, JEV_USD_PER_MTOK: "2" });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).price.source).toBe("JEV_USD_PER_MTOK");
    expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY);
  });
});

describe("LJ21 run refuses unless everything is explicit, and refuses before any call", () => {
  const base = (out: string): string[] => ["run", "--capture", CAPTURE, ...LAB_FLAGS, "--out", out];

  const refusals: ReadonlyArray<readonly [string, (out: string) => string[], Record<string, string | undefined>]> = [
    ["no --allow-paid-inference", (out) => [...base(out), "--max-usd", "1", "--max-calls", "200"], GOOD_ENV],
    ["no --max-usd", (out) => [...base(out), "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["no --max-calls", (out) => [...base(out), "--max-usd", "1", "--allow-paid-inference"], GOOD_ENV],
    ["neither cap", (out) => [...base(out), "--allow-paid-inference"], GOOD_ENV],
    ["a --max-usd above the hard maximum", (out) => [...base(out), "--max-usd", "5.01", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a --max-calls above the hard maximum", (out) => [...base(out), "--max-usd", "1", "--max-calls", "2001", "--allow-paid-inference"], GOOD_ENV],
    ["a --max-calls of one", (out) => [...base(out), "--max-usd", "1", "--max-calls", "1", "--allow-paid-inference"], GOOD_ENV],
    ["a --max-usd of zero", (out) => [...base(out), "--max-usd", "0", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a --max-usd that does not cover the preflight and one call", (out) => [...base(out), "--max-usd", "0.000001", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a --max-usd in scientific notation", (out) => [...base(out), "--max-usd", "1e0", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a --max-usd with a decimal comma", (out) => [...base(out), "--max-usd", "1,5", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a negative --max-calls", (out) => [...base(out), "--max-usd", "1", "--max-calls", "-5", "--allow-paid-inference"], GOOD_ENV],
    ["no key in the environment", (out) => REAL(out), { JEV_MODEL_ID: "jev-latest", JEV_USD_PER_MTOK: "2" }],
    ["an empty key", (out) => REAL(out), { ...GOOD_ENV, TYPESAFE_AI_API_KEY: "" }],
    ["a key with a line break", (out) => REAL(out), { ...GOOD_ENV, TYPESAFE_AI_API_KEY: `${CANARY}\n` }],
    ["no price in the environment", (out) => REAL(out), { TYPESAFE_AI_API_KEY: CANARY }],
    ["a price that is not a number", (out) => REAL(out), { ...GOOD_ENV, JEV_USD_PER_MTOK: "cheap" }],
    ["a price of zero", (out) => REAL(out), { ...GOOD_ENV, JEV_USD_PER_MTOK: "0" }],
    ["a price in scientific notation", (out) => REAL(out), { ...GOOD_ENV, JEV_USD_PER_MTOK: "2e0" }],
    ["a model id with a space", (out) => REAL(out), { ...GOOD_ENV, JEV_MODEL_ID: "jev latest" }],
    ["a model id that is the key", (out) => REAL(out), { ...GOOD_ENV, JEV_MODEL_ID: CANARY }],
    ["a model id that contains the key", (out) => REAL(out), { ...GOOD_ENV, JEV_MODEL_ID: `x${CANARY}` }],
    ["--synthetic", (out) => ["run", "--synthetic", "--epochs", "10", "--seed", "1", "--out", out, "--max-usd", "1", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["--planted-edge", (out) => REAL(out, ["--planted-edge", "10"]), GOOD_ENV],
    ["--usd-per-mtok", (out) => REAL(out, ["--usd-per-mtok", "2"]), GOOD_ENV],
    ["a repeated cap", (out) => REAL(out, ["--max-usd", "2"]), GOOD_ENV],
    ["a flag without value", (out) => [...base(out), "--max-usd"], GOOD_ENV],
    ["no --out", () => ["run", "--capture", CAPTURE, ...LAB_FLAGS, "--max-usd", "1", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["no --capture", (out) => ["run", "--out", out, "--max-usd", "1", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a capture that does not exist", (out) => ["run", "--capture", join(SCRATCH, "nope.jsonl"), "--out", out, "--max-usd", "1", "--max-calls", "200", "--allow-paid-inference"], GOOD_ENV],
    ["a timeout below one second", (out) => REAL(out, ["--timeout-ms", "10"]), GOOD_ENV],
  ];
  for (const [name, args, env] of refusals) {
    test(`LJ21 ${name}: exit 2, empty stdout, no call, no journal, and the key is never echoed`, async () => {
      const out = freshDir();
      const fake = fakeJev();
      const result = await run(args(out), { env: env as Record<string, string | undefined>, evaluate: fake.evaluate });
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/^(recusado|erro de uso):/);
      expect(result.stderr).not.toContain(CANARY);
      expect(result.stderr).not.toMatch(BANNED);
      expect(fake.calls.length).toBe(0);
      expect(existsSync(out)).toBe(false);
    });
  }

  test("LJ21 with no subcommand or an unknown one the script says so and exits 2", async () => {
    for (const args of [[], ["go"], ["report"]]) {
      const result = await run(args, { env: GOOD_ENV });
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("informe o subcomando: plan ou run");
    }
  });

  test("LJ21 --help states the refusals and the hard maxima, and exits 0", async () => {
    const result = await run(["--help"]);
    expect(result.code).toBe(0);
    for (const piece of ["--allow-paid-inference", "--max-usd", "--max-calls", `${HARD_MAX_USD} USD`, `${HARD_MAX_CALLS}`, "TYPESAFE_AI_API_KEY", "JEV_MODEL_ID", "JEV_USD_PER_MTOK", "somente sombra", "Nada aqui prova lucro e nada aqui concede permissão"]) expect(result.stdout).toContain(piece);
    expect(result.stdout).not.toMatch(BANNED);
    expect(result.stderr).toBe("");
  });

  test("LJ21 the hard maxima are what the documentation says: 5 USD and 2000 calls, and the timeouts have a margin", () => {
    expect(HARD_MAX_USD).toBe(5);
    expect(HARD_MAX_CALLS).toBe(2000);
    expect(DEFAULT_TIMEOUT_MS).toBe(20_000);
    expect(ABORT_MARGIN_MS).toBe(2_000);
  });

  test("LJ21 spawned, a run without the confirmation is refused before anything else and prints nothing secret", async () => {
    const result = await spawned(["run", "--capture", CAPTURE, "--out", freshDir(), "--max-usd", "1", "--max-calls", "200"], { TYPESAFE_AI_API_KEY: CANARY, JEV_USD_PER_MTOK: "2" });
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--allow-paid-inference");
    expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY);
  });
});

describe("LJ22 a run with a fake Jev: estimate first, preflight, the lab pipeline, cost per epoch, total cost", () => {
  test("LJ22 the estimated cost is printed before the first call, the preflight is one extra call, and the report is the lab report of a real Jev", async () => {
    const out = freshDir();
    let stderrAtFirstCall = null as string | null;
    let seenStderr = "";
    const fake = fakeJev(() => "ok");
    const wrapped: JevEvaluateFn = (args) => {
      if (stderrAtFirstCall === null) stderrAtFirstCall = seenStderr;
      return fake.evaluate(args);
    };
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: wrapped }, (soFar) => (seenStderr = soFar));
    expect(result.code).toBe(0);
    expect(stderrAtFirstCall).toContain("Custo estimado:");
    expect(stderrAtFirstCall).toContain("Tetos desta execução: 1,0000 USD e 200 chamadas");
    expect(stderrAtFirstCall).toContain(`Modelo: jev-latest (instrução ${JEV_LAB_PROMPT_VERSION}).`);
    const report = JSON.parse(result.stdout) as LabReport;
    expect(report.mode).toBe("replay");
    expect(report.jev).toEqual({ chooser: NAME, isMock: false, realJevCalled: true, warning: null });
    expect(report.run.pendingEpochs).toBe(0);
    const consulted = consultedEpochs(join(out, "journal.jsonl"));
    expect(fake.calls.length).toBe(consulted + 1);
    for (const call of fake.calls) {
      expect(call.maxRetries).toBe(0);
      expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    }
    expect(result.stderr).not.toContain("SUBSTITUTO SIMULADO");
    expect(result.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
    expect(Object.keys(report).at(-1)).toBe("disclaimer");
  });

  test("LJ22 the journal records tokens and cost per epoch and the manifest records the price, the timeout and the model; the report shows the total", async () => {
    const out = freshDir();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev().evaluate });
    const data = FileJournal.read(join(out, "journal.jsonl"));
    expect(data.manifest.inferenceUsdPerMTok).toBe(2);
    expect(data.manifest.jevTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect((data.manifest.policies as Array<{ id: string; chooser: unknown }>).find((policy) => policy.id === "jev")?.chooser).toEqual({ name: NAME, isMock: false });
    const consultedIds = new Set(data.epochs.filter((epoch) => epoch.eligibleIds.length > 0).map((epoch) => epoch.id));
    const mine = data.decisions.filter((decision) => decision.policyId === "jev" && consultedIds.has(decision.epochId));
    expect(mine.length).toBe(consultedIds.size);
    for (const decision of mine) {
      expect(decision.status).toBe("ok");
      expect(decision.inputTokens).toBe(1000);
      expect(decision.costUsd).toBeCloseTo(0.002, 12);
    }
    const report = JSON.parse(result.stdout) as LabReport;
    const inference = report.policies.find((policy) => policy.id === "jev")?.inference;
    expect(inference?.costKnown).toBe(true);
    expect(inference?.costUsdTotal).toBeCloseTo(consultedIds.size * 0.002, 9);
    expect(result.stderr).toContain(`Custo de inferência do Jev real (${NAME}): 0,`);
    expect(result.stderr).toMatch(/USD em \d+ épocas consultadas, tokens de entrada \d+/);
    expect(result.stderr).toContain("Orçamento do Jev real:");
    expect(result.stderr).toContain("o pré-voo está incluído");
  });

  test("LJ22 the summary states the leverage that the measure justifies and that it grants nothing; stdout is the report the plain CLI rebuilds", async () => {
    const out = freshDir();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev().evaluate });
    expect(result.stderr).toContain("Alavancagem que a vantagem medida do Jev justifica:");
    expect(result.stderr).toContain("não concede nada");
    expect(result.stderr).toContain("decisão D11");
    const { main: labMain } = await import("./jev-lab.ts");
    const chunks: string[] = [];
    const realOut = process.stdout.write;
    const realErr = process.stderr.write;
    process.stdout.write = ((chunk: string | Uint8Array) => (chunks.push(String(chunk)), true)) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      expect(await labMain(["report", "--journal", out])).toBe(0);
    } finally {
      process.stdout.write = realOut;
      process.stderr.write = realErr;
    }
    expect(chunks.join("")).toBe(result.stdout);
  });

  test("LJ22 the key and anything that looks like an echo of the environment are in no output and no file", async () => {
    const out = freshDir();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev().evaluate });
    const files = readdirSync(out).map((name) => readFileSync(join(out, name), "utf8"));
    for (const text of [result.stdout, result.stderr, ...files]) expect(text).not.toContain(CANARY);
    expect(`${result.stdout}${result.stderr}${files.join("")}`).not.toMatch(BANNED);
  });
});

describe("LJ23 the cap stops the run BEFORE a call that would not fit, and the same folder resumes", () => {
  test("LJ23 --max-calls: the run stops after the cap, no refused call is ever recorded, and the rest stays pending", async () => {
    const out = freshDir();
    const fake = fakeJev();
    const result = await run(REAL(out).map((token, index, all) => (all[index - 1] === "--max-calls" ? "6" : token)), { env: GOOD_ENV, evaluate: fake.evaluate });
    expect(result.code).toBe(0);
    expect(fake.calls.length).toBe(6);
    const report = JSON.parse(result.stdout) as LabReport;
    expect(report.run.pendingEpochs).toBeGreaterThan(0);
    expect(result.stderr).toContain("Execução parada pelo teto: o teto de chamadas foi atingido");
    expect(result.stderr).toContain("sem consultar duas vezes");
    const jev = report.policies.find((policy) => policy.id === "jev");
    expect(jev?.statuses).toEqual({ ok: report.run.epochs, "invalid-choice": 0, malformed: 0, timeout: 0, error: 0 });
    expect(result.stderr.trimEnd().split("\n").at(-1)).toBe(STANDING_DISCLAIMER);
  });

  test("LJ23 resuming with larger caps never consults an epoch twice, and the journal is the one a single run would have written", async () => {
    const stopped = freshDir();
    const first = fakeJev();
    await run(REAL(stopped).map((token, index, all) => (all[index - 1] === "--max-calls" ? "6" : token)), { env: GOOD_ENV, evaluate: first.evaluate, now: steady() });
    const second = fakeJev();
    const finished = await run(REAL(stopped), { env: GOOD_ENV, evaluate: second.evaluate, now: steady() });
    expect(finished.code).toBe(0);
    expect((JSON.parse(finished.stdout) as LabReport).run.pendingEpochs).toBe(0);
    const consulted = consultedEpochs(join(stopped, "journal.jsonl"));
    expect(first.calls.length - 1 + second.calls.length - 1).toBe(consulted);

    const whole = freshDir();
    const single = fakeJev();
    const one = await run(REAL(whole), { env: GOOD_ENV, evaluate: single.evaluate, now: steady() });
    expect(readFileSync(join(stopped, "journal.jsonl"), "utf8")).toBe(readFileSync(join(whole, "journal.jsonl"), "utf8"));
    expect(finished.stdout).toBe(one.stdout);
  });

  test("LJ23 --max-usd: the dollars are checked with the estimate before the call, and the spend never passes the cap", async () => {
    const out = freshDir();
    const fake = fakeJev();
    const result = await run(REAL(out).map((token, index, all) => (all[index - 1] === "--max-usd" ? "5" : token)), { env: { ...GOOD_ENV, JEV_USD_PER_MTOK: "1000" }, evaluate: fake.evaluate });
    expect(result.code).toBe(0);
    expect(fake.calls.length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.length).toBeLessThan(10);
    expect(result.stderr).toContain("Execução parada pelo teto: o teto de custo em USD foi atingido");
    expect(fake.calls.length * 1.0).toBeLessThanOrEqual(5);
    const report = JSON.parse(result.stdout) as LabReport;
    expect(report.run.pendingEpochs).toBeGreaterThan(0);
    expect(report.policies.find((policy) => policy.id === "jev")?.statuses.error).toBe(0);
  });

  test("LJ23 caps that do not cover the window are announced before the first call", async () => {
    let atFirstCall = null as string | null;
    let seen = "";
    const fake = fakeJev();
    const wrapped: JevEvaluateFn = (args) => {
      if (atFirstCall === null) atFirstCall = seen;
      return fake.evaluate(args);
    };
    await run(REAL(freshDir()).map((token, index, all) => (all[index - 1] === "--max-calls" ? "6" : token)), { env: GOOD_ENV, evaluate: wrapped }, (soFar) => (seen = soFar));
    expect(atFirstCall).toContain("ATENÇÃO: os tetos não cobrem a janela inteira");
  });
});

describe("LJ24 preflight and a Jev that stops answering", () => {
  test("LJ24 a preflight that fails stops with exit 3 and records nothing; it is one call, with no retry", async () => {
    const out = freshDir();
    const fake = fakeJev(() => "throw");
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fake.evaluate });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PARADA: o pré-voo falhou");
    expect(fake.calls.length).toBe(1);
    expect(existsSync(join(out, "journal.jsonl"))).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY);
  });

  test("LJ24 a preflight answer that is not valid also stops with exit 3 and records nothing", async () => {
    const out = freshDir();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev(() => "invalid").evaluate });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("PARADA: o pré-voo falhou");
    expect(existsSync(join(out, "journal.jsonl"))).toBe(false);
  });

  test("LJ24 after the preflight, three failures in a row stop the run with exit 3; later epochs are not consulted and the folder resumes", async () => {
    const out = freshDir();
    const fake = fakeJev((callNumber) => (callNumber >= 5 && callNumber <= 7 ? "throw" : "ok"));
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fake.evaluate });
    expect(result.code).toBe(3);
    expect(fake.calls.length).toBe(7);
    expect(result.stderr).toContain("PARADA: o Jev parou de responder (falhas consecutivas)");
    const report = JSON.parse(result.stdout) as LabReport;
    expect(report.run.pendingEpochs).toBeGreaterThan(0);
    expect(report.policies.find((policy) => policy.id === "jev")?.statuses.error).toBe(3);
    expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY);
    const healthy = fakeJev();
    const resumed = await run(REAL(out), { env: GOOD_ENV, evaluate: healthy.evaluate });
    expect(resumed.code).toBe(0);
    const done = JSON.parse(resumed.stdout) as LabReport;
    expect(done.run.pendingEpochs).toBe(0);
    expect(done.policies.find((policy) => policy.id === "jev")?.statuses.error).toBe(3);
  });

  test("LJ24 a call without valid usage keeps the cost unknown for the run: null, never zero, and the summary says so", async () => {
    const out = freshDir();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev((callNumber) => (callNumber === 4 ? "no-usage" : "ok")).evaluate });
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as LabReport;
    const inference = report.policies.find((policy) => policy.id === "jev")?.inference;
    expect(inference?.costKnown).toBe(false);
    expect(inference?.costUsdTotal).toBeNull();
    expect(result.stderr).toContain(`Custo de inferência do Jev real (${NAME}): desconhecido`);
    const data = FileJournal.read(join(out, "journal.jsonl"));
    const unknownCosts = data.decisions.filter((decision) => decision.policyId === "jev" && decision.status === "ok" && decision.costUsd === null);
    expect(unknownCosts.length).toBe(1);
    expect(unknownCosts[0]?.inputTokens).toBeNull();
  });

  test("LJ24 another model or price in the same folder is another run: the journal stops with a mismatch and exit 3", async () => {
    const out = freshDir();
    await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev().evaluate });
    const other = await run(REAL(out), { env: { ...GOOD_ENV, JEV_USD_PER_MTOK: "3" }, evaluate: fakeJev().evaluate });
    expect(other.code).toBe(3);
    expect(other.stderr).toContain("(mismatch)");
    expect(other.stdout).toBe("");
  });
});

describe("LJ25 the key never leaves the environment", () => {
  test("LJ25 errors that carry the key in their message and in their cause are in no output, no journal and no snapshot", async () => {
    const out = freshDir();
    const result = await run(REAL(out), { env: GOOD_ENV, evaluate: fakeJev((callNumber) => (callNumber === 1 || callNumber === 3 ? "ok" : callNumber === 5 ? "throw" : "ok")).evaluate });
    expect(result.code).toBe(0);
    const files = readdirSync(out).map((name) => readFileSync(join(out, name), "utf8"));
    for (const text of [result.stdout, result.stderr, ...files]) expect(text).not.toContain(CANARY);
    expect(files.join("")).toContain("o seletor lançou erro");
  });

  test("LJ25 an unexpected error is reported by its name only, exit 3, with nothing else consulted", async () => {
    const hostile = {
      get TYPESAFE_AI_API_KEY(): string {
        throw new TypeError(`broken environment ${CANARY}`);
      },
    } as unknown as Record<string, string | undefined>;
    const fake = fakeJev();
    const result = await run(REAL(freshDir()), { env: hostile, evaluate: fake.evaluate });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("PARADA: erro inesperado (TypeError). Nada mais foi consultado.\n");
    expect(fake.calls.length).toBe(0);
  });

  test("LJ25 spawned with the key in the process environment, help, plan and refusals print nothing secret and stop before any call", async () => {
    const env = { TYPESAFE_AI_API_KEY: CANARY, JEV_USD_PER_MTOK: "2", JEV_MODEL_ID: "jev-latest" };
    const runs = [
      await spawned(["--help"], env),
      await spawned(["plan", "--capture", CAPTURE, ...LAB_FLAGS], env),
      await spawned(["run", "--capture", CAPTURE, "--out", freshDir(), "--max-usd", "9", "--max-calls", "200", "--allow-paid-inference"], env),
      await spawned(["run", "--capture", CAPTURE, "--out", freshDir(), "--max-usd", "1", "--max-calls", "200", "--allow-paid-inference"], { ...env, JEV_MODEL_ID: CANARY }),
    ];
    expect(runs.map((result) => result.code)).toEqual([0, 0, 2, 2]);
    for (const result of runs) expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY);
  });
});

describe("LJ26 the script can be read as plain text: where the environment is read", () => {
  test("LJ26 the three variables are the only ones the script names", () => {
    const text = readFileSync(SCRIPT, "utf8");
    const names = new Set([...text.matchAll(/\benv\.([A-Za-z_]+)\b/g)].map((match) => match[1]));
    expect([...names].sort()).toEqual(["JEV_MODEL_ID", "JEV_USD_PER_MTOK", "TYPESAFE_AI_API_KEY"]);
    expect(text).not.toMatch(/env\s*\[/);
  });
});
