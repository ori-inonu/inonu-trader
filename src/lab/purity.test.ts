import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { main } from "../../scripts/jev-lab.ts";
import { documentAnnex } from "../../scripts/test-support/document-annex.ts";
import { CAPTURE_LIMITS, CaptureFormatError, parseCaptureLine } from "./capture-format.ts";
import { JournalError, MemoryJournal, parseJournalText } from "./journal.ts";
import { defaultRoster, describePolicy } from "./policies.ts";
import { MOCK_WARNING, STANDING_DISCLAIMER, buildReport, buildSyntheticSpec, manifestOf, renderSummaryPt, runEpochs } from "./run.ts";
import { LeakError, SyntheticSource, syntheticConfig } from "./source.ts";
import { CRITERION_IDS, STATS_DEFAULTS } from "./stats.ts";
import { COST_TABLE } from "./outcomes.ts";
import { LEVERAGES } from "./types.ts";
import * as candidates from "./candidates.ts";
import * as captureFormat from "./capture-format.ts";
import * as journal from "./journal.ts";
import * as outcomes from "./outcomes.ts";
import * as policies from "./policies.ts";
import * as rng from "./rng.ts";
import * as run from "./run.ts";
import * as source from "./source.ts";
import * as stats from "./stats.ts";

// Spec: src/lab/docs/spec.md annex sections 0, 10 and 14. Titles start with the acceptance id (LB26 to LB28).
// These tests read the code as text: they prove what the lab does NOT do (no environment, network, clock, signer,
// SDK, or disk write outside the journal) and that the documents, the code and the tests describe the same thing.

const LAB_DIR = import.meta.dir;
const ROOT = resolve(LAB_DIR, "..", "..");
const DOC_PATH = join(LAB_DIR, "docs", "spec.md");
const CLI_PATH = join(ROOT, "scripts", "jev-lab.ts");
const CLI_TEST_PATH = join(ROOT, "scripts", "jev-lab.test.ts");

const MODULES = readdirSync(LAB_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort();
const TESTS = readdirSync(LAB_DIR).filter((name) => name.endsWith(".test.ts")).sort();
const MODULE_PATHS = MODULES.map((name) => join(LAB_DIR, name));
const TEST_PATHS = [...TESTS.map((name) => join(LAB_DIR, name)), CLI_TEST_PATH];
const DOC = documentAnnex(readFileSync(DOC_PATH, "utf8"), "## Anexo: JEV-LABORATORIO-DE-DECISAO");

/** Executable code only: comments are dropped by the transpiler and whitespace is collapsed. */
function codeOf(path: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync(path, "utf8")).replace(/\s+/g, " ");
}

/** Every module specifier the file imports or re-exports. */
function specifiers(path: string): string[] {
  const found: string[] = [];
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/(?:^|[\n;])\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g)) found.push(match[1] as string);
  for (const match of text.matchAll(/(?:^|[\n;])\s*import\s+["']([^"']+)["']/g)) found.push(match[1] as string);
  return found;
}

describe("LB26 static purity of the lab", () => {
  test("LB26 the lab is exactly these modules and the CLI", () => {
    expect(MODULES).toEqual(["candidates.ts", "capture-format.ts", "journal.ts", "outcomes.ts", "policies.ts", "rng.ts", "run.ts", "source.ts", "stats.ts", "types.ts"]);
  });

  test("LB26 no module and no CLI reads the environment, the network, the clock or system randomness, or runs dynamic code or another process", () => {
    const forbidden = [
      "process.env", "Bun.env", "import.meta.env", "dotenv", "globalThis",
      "fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "navigator.sendBeacon",
      "Bun.serve", "Bun.connect", "Bun.listen", "Bun.udpSocket", "Bun.spawn", "Bun.$",
      "node:http", "node:https", "node:http2", "node:net", "node:tls", "node:dgram", "node:dns", "node:cluster", "node:worker_threads", "node:child_process", "node:vm",
      "require(", "eval(", "new Function",
      "Date.now", "new Date", "Math.random", "performance.now", "randomUUID", "getRandomValues", "setInterval", "queueMicrotask",
    ];
    for (const path of [...MODULE_PATHS, CLI_PATH]) {
      const code = codeOf(path);
      for (const token of forbidden) expect({ path: path.replace(ROOT, ""), token, found: code.includes(token) }).toEqual({ path: path.replace(ROOT, ""), token, found: false });
      for (const pattern of [/\bimport\s*\(/, /process\s*\[\s*["']env["']\s*\]/, /\bBun\s*\[/]) expect({ path: path.replace(ROOT, ""), pattern: String(pattern), found: pattern.test(code) }).toEqual({ path: path.replace(ROOT, ""), pattern: String(pattern), found: false });
    }
  });

  test("LB26 the only timer is the Jev timeout in policies.ts", () => {
    for (const path of [...MODULE_PATHS, CLI_PATH]) {
      const code = codeOf(path);
      const uses = code.includes("setTimeout");
      expect({ path: path.replace(ROOT, ""), uses }).toEqual({ path: path.replace(ROOT, ""), uses: path.endsWith("policies.ts") });
    }
  });

  test("LB26 nothing names a key, a signer, a transaction, a wallet or the TypeSafe SDK in executable code", () => {
    const words = ["Wallet", "signTransaction", "sendTransaction", "signMessage", "privateKey", "PRIVATE_KEY", "mnemonic", "TYPESAFE_AI_API_KEY", "typeSafeAi", "experimental_evaluate", "@ai-sdk", "ethers", "Provider"];
    for (const path of [...MODULE_PATHS, CLI_PATH]) {
      const code = codeOf(path);
      for (const word of words) expect({ path: path.replace(ROOT, ""), word, found: code.includes(word) }).toEqual({ path: path.replace(ROOT, ""), word, found: false });
    }
  });

  test("LB26 disk access: only journal.ts writes, in the documented way; reading belongs to journal.ts and to the CLI", () => {
    const writes = ["writeFileSync", "appendFileSync", "renameSync", "mkdirSync", "unlinkSync", "rmSync", "rmdirSync", "copyFileSync", "truncateSync", "openSync", "createWriteStream", "Bun.write", "writeFile(", "appendFile(", "fs/promises", ".promises"];
    const reads = ["readFileSync", "statSync", "lstatSync", "existsSync", "readdirSync", "Bun.file", "readFile(", "createReadStream"];
    for (const path of [...MODULE_PATHS, CLI_PATH]) {
      const code = codeOf(path);
      const isJournal = path.endsWith("journal.ts");
      const isCli = path === CLI_PATH;
      for (const api of writes) expect({ path: path.replace(ROOT, ""), api, found: code.includes(api) && !isJournal }).toEqual({ path: path.replace(ROOT, ""), api, found: false });
      for (const api of reads) expect({ path: path.replace(ROOT, ""), api, found: code.includes(api) && !isJournal && !isCli }).toEqual({ path: path.replace(ROOT, ""), api, found: false });
    }
    const code = codeOf(join(LAB_DIR, "journal.ts"));
    expect(code).toContain("appendFileSync(this.journalPath");
    expect(code).toContain("renameSync(temporary, path)");
    expect(code).toContain("`${path}.tmp`");
    expect(code).toContain('flag: "wx"');
    // the log is never rewritten: the only write of journal.jsonl in place is the creation of a fresh file
    expect(code.match(/writeFileSync\(/g)?.length).toBe(2);
  });

  test("LB26 imports: each module only imports what the architecture allows, and no file imports the SDK, ethers, the operator, the market, the trader or a wallet", () => {
    const allowed: Record<string, string[]> = {
      "types.ts": [],
      "rng.ts": [],
      "capture-format.ts": [],
      "source.ts": ["./capture-format.ts", "./rng.ts", "./types.ts"],
      "outcomes.ts": ["../okx-derivatives/margin.ts", "./capture-format.ts", "./source.ts", "./types.ts"],
      "candidates.ts": ["./capture-format.ts", "./outcomes.ts", "./source.ts", "./types.ts"],
      "policies.ts": ["./rng.ts", "./types.ts"],
      "stats.ts": ["../policy/envelope.ts", "./policies.ts", "./rng.ts", "./types.ts"],
      "journal.ts": ["node:crypto", "node:fs", "node:path", "./types.ts"],
      "run.ts": ["./candidates.ts", "./journal.ts", "./outcomes.ts", "./policies.ts", "./source.ts", "./stats.ts", "./types.ts"],
    };
    for (const name of MODULES) {
      const actual = [...new Set(specifiers(join(LAB_DIR, name)))].sort();
      expect({ name, imports: actual }).toEqual({ name, imports: [...(allowed[name] as string[])].sort() });
    }
    const cli = [...new Set(specifiers(CLI_PATH))].sort();
    expect(cli).toEqual(["../src/lab/capture-format.ts", "../src/lab/journal.ts", "../src/lab/policies.ts", "../src/lab/run.ts", "../src/lab/source.ts", "../src/lab/types.ts", "node:fs", "node:path"]);
    const forbiddenImport = /^(?:ai|ethers|@ai-sdk\/.*|@kuru-labs\/.*|typescript|\.\.\/(?:operator|okx-wallet|okx-market|okx-signals|okx-defi|okx-evidence|public-market-capture)\/.*|\.\.\/(?:\.\.\/src\/)?(?:market|trader|config|index|model|server|okx-api|book|chain|trades)(?:\.ts)?)$/;
    for (const path of [...MODULE_PATHS, CLI_PATH, ...TEST_PATHS]) {
      for (const specifier of specifiers(path)) expect({ path: path.replace(ROOT, ""), specifier, forbidden: forbiddenImport.test(specifier) }).toEqual({ path: path.replace(ROOT, ""), specifier, forbidden: false });
    }
    // no module imports the CLI or the orchestrator by accident: only run.ts and the CLI sit above the others
    for (const name of MODULES.filter((module) => module !== "run.ts")) expect(specifiers(join(LAB_DIR, name))).not.toContain("./run.ts");
  });

  test("LB26 the modules never import the executable parts of the repository; the okx-derivatives and envelope imports are pure computation modules", () => {
    for (const path of [join(ROOT, "src", "okx-derivatives", "margin.ts"), join(ROOT, "src", "policy", "envelope.ts")]) {
      const code = codeOf(path);
      for (const token of ["process.env", "fetch(", "WebSocket", "Date.now", "Math.random", "writeFileSync"]) expect({ path: path.replace(ROOT, ""), token, found: code.includes(token) }).toEqual({ path: path.replace(ROOT, ""), token, found: false });
    }
  });

  test("LB26 a policy cannot receive the source: the policy input type carries only the epoch id, the instant and the eligible candidates", () => {
    const code = readFileSync(join(LAB_DIR, "policies.ts"), "utf8");
    const block = /export interface PolicyInput \{([^}]*)\}/.exec(code)?.[1] ?? "";
    const fields = [...block.matchAll(/readonly (\w+):/g)].map((match) => match[1]);
    expect(fields).toEqual(["epochId", "t", "eligible"]);
  });
});

// ---------------------------------------------------------------------------
// Text hygiene
// ---------------------------------------------------------------------------

/** Byte sequences of: middle dot, en dash, em dash, minus sign, bullet, bullet operator, dot operator, hyphenation point, katakana middle dot. */
const BANNED_SEQUENCES: readonly (readonly number[])[] = [
  [0xc2, 0xb7], [0xe2, 0x80, 0x93], [0xe2, 0x80, 0x94], [0xe2, 0x88, 0x92], [0xe2, 0x80, 0xa2],
  [0xe2, 0x88, 0x99], [0xe2, 0x8b, 0x85], [0xe2, 0x80, 0xa7], [0xe3, 0x83, 0xbb],
];
const BANNED_CHARACTERS = new RegExp(`[${BANNED_SEQUENCES.map((sequence) => Buffer.from(sequence).toString("utf8")).join("")}]`);

function bannedBytesIn(path: string): string[] {
  const bytes = readFileSync(path);
  return BANNED_SEQUENCES.filter((sequence) => bytes.indexOf(Buffer.from(sequence)) !== -1).map((sequence) => sequence.map((byte) => byte.toString(16)).join(" "));
}

describe("LB27 text hygiene", () => {
  test("LB27 no middle dot, en dash, em dash, minus sign or bullet in the document, the modules, the CLI or any test (byte-level scan)", () => {
    const paths = [DOC_PATH, ...MODULE_PATHS, CLI_PATH, ...TEST_PATHS];
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) expect({ path: path.replace(ROOT, ""), banned: bannedBytesIn(path) }).toEqual({ path: path.replace(ROOT, ""), banned: [] });
  });

  test("LB27 the scan itself works: it finds each banned sequence in a probe", () => {
    for (const sequence of BANNED_SEQUENCES) {
      const probe = Buffer.concat([Buffer.from("a"), Buffer.from(sequence), Buffer.from("b")]);
      expect(BANNED_SEQUENCES.some((candidate) => probe.indexOf(Buffer.from(candidate)) !== -1)).toBe(true);
      expect(BANNED_CHARACTERS.test(probe.toString("utf8"))).toBe(true);
    }
    expect(BANNED_CHARACTERS.test("texto comum com acentos: ação, não, você; hífen-minus - e dois-pontos: ok")).toBe(false);
  });

  test("LB27 every message the lab produces at run time is free of those marks: disclaimer, warning, report, summary, gate, help and error messages", async () => {
    const config = syntheticConfig({ seed: 5, epochs: 16, plantedEdgeBps: 30 });
    const roster = defaultRoster({ seed: 5 });
    const spec = buildSyntheticSpec(config, roster.map(describePolicy), {});
    const store = new MemoryJournal(manifestOf(spec));
    await runEpochs({ source: new SyntheticSource(config), policies: roster, spec, journal: store });
    const report = buildReport(store.data(), { bootstrapResamples: 50 });
    const texts: string[] = [STANDING_DISCLAIMER, MOCK_WARNING, JSON.stringify(report), ...renderSummaryPt(report), report.gate.recommendation];
    for (const criterion of [...report.gate.passed, ...report.gate.failed, ...report.gate.unknown]) texts.push(criterion.description, criterion.requirement, String(criterion.observed));
    // help text of the CLI
    const out: string[] = [];
    const realWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => (out.push(String(chunk)), true)) as typeof process.stdout.write;
    try {
      await main(["--help"]);
    } finally {
      process.stdout.write = realWrite;
    }
    texts.push(out.join(""));
    // error messages
    for (const attempt of [
      () => parseCaptureLine("{not json", 3),
      () => parseCaptureLine('{"t":1,"kind":"mark","inst":"x","data":{"price":1}}', 4),
      () => parseJournalText(""),
      () => parseJournalText("{}\n"),
      () => syntheticConfig({ epochs: 0 }),
    ]) {
      try {
        attempt();
      } catch (error) {
        texts.push((error as Error).message);
      }
    }
    texts.push(new LeakError("x").message, new JournalError("corrupt", "y", 2).message, new CaptureFormatError(1, "t", "z").message);
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) expect({ text: text.slice(0, 80), banned: BANNED_CHARACTERS.test(text) }).toEqual({ text: text.slice(0, 80), banned: false });
  });

  test("LB27 no word of approval or promise in executable code, and the summary never calls criteria approved", () => {
    const words = ["aprovado", "liberado", "pronto para operar", "garantido", "lucro certo", "go-live", "safe to trade", "autorizado", "retorno garantido"];
    for (const path of [...MODULE_PATHS, CLI_PATH]) {
      const code = codeOf(path).toLowerCase();
      for (const word of words) expect({ path: path.replace(ROOT, ""), word, found: code.includes(word) }).toEqual({ path: path.replace(ROOT, ""), word, found: false });
    }
  });
});

// ---------------------------------------------------------------------------
// Traceability: the document, the code and the tests describe the same thing
// ---------------------------------------------------------------------------

describe("LB28 traceability", () => {
  const allTests = TEST_PATHS.map((path) => readFileSync(path, "utf8")).join("\n");

  test("LB28 the document defines LB1 to LB28 as rows of the acceptance table", () => {
    for (let n = 1; n <= 28; n += 1) expect({ n, defined: new RegExp(`\\| LB${n} \\|`).test(DOC) }).toEqual({ n, defined: true });
    expect(DOC).not.toMatch(/\| LB29 \|/);
  });

  test("LB28 every acceptance id is exercised by at least one test whose title starts with it", () => {
    for (let n = 1; n <= 28; n += 1) expect({ n, covered: new RegExp(`(?:test|it)\\(\\s*[\`"']LB${n}[ :]`).test(allTests) }).toEqual({ n, covered: true });
  });

  test("LB28 every test file the acceptance table of the document names as a place of verification exists", () => {
    const table = DOC.slice(DOC.indexOf("## 2."), DOC.indexOf("## 3."));
    const named = new Set([...table.matchAll(/[\w.-]+\.test\.ts/g)].map((match) => match[0]));
    expect(named.size).toBeGreaterThan(8);
    const existing = new Set([...TESTS, "jev-lab.test.ts"]);
    for (const name of named) expect({ name, exists: existing.has(name) }).toEqual({ name, exists: true });
  });

  test("LB28 the criteria of the gate, the CLI flags, the subcommands, the exit codes and the module files are all in the document", () => {
    for (const id of CRITERION_IDS) expect({ id, documented: DOC.includes(`\`${id}\``) }).toEqual({ id, documented: true });
    for (const flag of ["--synthetic", "--capture", "--epochs", "--seed", "--planted-edge", "--out", "--journal", "--step-ms", "--horizon-ms", "--bar-ms", "--frozen-at-ms", "--help"]) expect({ flag, documented: DOC.includes(flag) }).toEqual({ flag, documented: true });
    for (const subcommand of ["run --synthetic", "run --capture", "report --journal"]) expect({ subcommand, documented: DOC.includes(subcommand) }).toEqual({ subcommand, documented: true });
    const codes = DOC.slice(DOC.indexOf("**Códigos de saída.**"));
    expect(codes.startsWith("**Códigos de saída.**")).toBe(true);
    for (const code of ["0:", "2:", "3:"]) expect({ code, documented: codes.slice(0, 600).includes(` ${code} `) }).toEqual({ code, documented: true });
    for (const name of MODULES) expect({ name, documented: DOC.includes(`src/lab/${name}`) }).toEqual({ name, documented: true });
    expect(DOC).toContain("scripts/jev-lab.ts");
  });

  test("LB28 every function or constant the module map of the document lists is a real export of that module", () => {
    const exportsOf: Record<string, Record<string, unknown>> = {
      "types.ts": {},
      "capture-format.ts": captureFormat,
      "rng.ts": rng,
      "source.ts": source,
      "candidates.ts": candidates,
      "outcomes.ts": outcomes,
      "policies.ts": policies,
      "stats.ts": stats,
      "journal.ts": journal,
      "run.ts": run,
    };
    const section = DOC.slice(DOC.indexOf("## 14."), DOC.indexOf("## 15."));
    const rows = [...section.matchAll(/^\| `(src\/lab\/[\w-]+\.ts)` \| (.*) \|$/gm)];
    expect(rows.length).toBe(MODULES.length);
    let checked = 0;
    for (const row of rows) {
      const file = (row[1] as string).replace("src/lab/", "");
      for (const identifier of [...(row[2] as string).matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((match) => match[1] as string)) {
        expect({ file, identifier, exported: identifier in (exportsOf[file] as Record<string, unknown>) }).toEqual({ file, identifier, exported: true });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  test("LB28 the numbers fixed in the code are the numbers written in the document", () => {
    const comma = (value: number): string => String(value).replace(".", ",");
    const tokens: Array<[string, string]> = [
      ["bootstrap resamples", String(STATS_DEFAULTS.bootstrapResamples)],
      ["bootstrap seed", String(STATS_DEFAULTS.bootstrapSeed)],
      ["minimum days", `>= ${STATS_DEFAULTS.minDays}`],
      ["minimum effective samples", `>= ${STATS_DEFAULTS.minEffectiveSamples}`],
      ["completeness", comma(STATS_DEFAULTS.minCompleteness)],
      ["alpha", comma(STATS_DEFAULTS.alpha)],
      ["ruin fraction", comma(STATS_DEFAULTS.ruinFraction)],
      ["minimum trades per modality", `${STATS_DEFAULTS.minTradesForModality} negociações`],
      ["reliability bins", `${STATS_DEFAULTS.reliabilityBins} faixas`],
      ["decision limit", String(STATS_DEFAULTS.maxDecisionMs)],
      ["spot fee", `${COST_TABLE.feeTakerBps.spot} bps por lado`],
      ["perp fee", `${COST_TABLE.feeTakerBps.perp} bps por lado`],
      ["slippage", `${COST_TABLE.slippageBpsPerSide} bp por lado`],
      ["cash yield", `${comma(COST_TABLE.cashYieldAnnual * 100)}%`],
      ["maintenance margin", `${comma(COST_TABLE.maintenanceMarginRate * 100)}%`],
      ["capture lag", `${COST_TABLE.captureLagMs} ms`],
      ["notional", `${COST_TABLE.notionalUsd} USD`],
      ["line bytes", String(CAPTURE_LIMITS.maxLineBytes)],
      ["file characters", String(CAPTURE_LIMITS.maxChars)],
      ["records", String(CAPTURE_LIMITS.maxRecords)],
      ["maximum t", String(CAPTURE_LIMITS.maxT)],
      ["book levels", `${CAPTURE_LIMITS.maxBookLevels} níveis`],
      ["leverages", `{${LEVERAGES.join(", ")}}`],
      ["lag rule", "max(3K, floor(4 * (n/100)^(2/9)))"],
    ];
    for (const [label, token] of tokens) expect({ label, token, documented: DOC.includes(token) }).toEqual({ label, token, documented: true });
    expect(stats.defaultLag(400, 4)).toBe(12);
    expect(policies.DEFAULT_JEV_TIMEOUT_MS).toBe(15_000);
    expect(DOC).toContain("15000 ms");
    expect(candidates.CANDIDATE_DEFAULTS.maxQuoteAgeMs).toBe(120_000);
    expect(DOC).toContain("120000 ms");
  });
});
