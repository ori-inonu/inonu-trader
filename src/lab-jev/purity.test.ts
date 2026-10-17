import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as realScript from "../../scripts/jev-lab-real.ts";
import * as labScript from "../../scripts/jev-lab.ts";
import * as chooser from "./jev-chooser.ts";
import { PROMPTS } from "../generated/prompts";
import * as plan from "./plan-chooser.ts";

// Spec: docs/JEV-LAB-JEV-REAL.md sections 0, 2 and 11. Titles start with the acceptance id (LJ27 to LJ29).
// These tests read the code as text: they prove where the SDK is imported, where the environment is read, what the code
// never does, and that the document, the code and the tests describe the same thing.

const DIR = import.meta.dir;
const ROOT = resolve(DIR, "..", "..");
const LAB_DIR = join(ROOT, "src", "lab");
const SCRIPTS = join(ROOT, "scripts");
const DOC_PATH = join(ROOT, "docs", "JEV-LAB-JEV-REAL.md");
const DOC = readFileSync(DOC_PATH, "utf8").replaceAll("\r\n", "\n");

const rel = (path: string): string => path.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, "").replaceAll("\\", "/");

const LAB_JEV_MODULES = readdirSync(DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort();
const LAB_JEV_TESTS = readdirSync(DIR).filter((name) => name.endsWith(".test.ts")).sort();
const LAB_MODULES = readdirSync(LAB_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort();
const LAB_TESTS = readdirSync(LAB_DIR).filter((name) => name.endsWith(".test.ts")).sort();

const P = {
  chooser: join(DIR, "jev-chooser.ts"),
  plan: join(DIR, "plan-chooser.ts"),
  real: join(SCRIPTS, "jev-lab-real.ts"),
  lab: join(SCRIPTS, "jev-lab.ts"),
  chooserTest: join(DIR, "jev-chooser.test.ts"),
  realTest: join(SCRIPTS, "jev-lab-real.test.ts"),
  labTest: join(SCRIPTS, "jev-lab.test.ts"),
  depsTest: join(SCRIPTS, "jev-lab.deps.test.ts"),
  generatedPrompts: join(ROOT, "src", "generated", "prompts.ts"),
  purityTest: join(DIR, "purity.test.ts"),
};
const LAB_SHADOW_NOTICE = PROMPTS["p-lab-chooser"].shadowNotice;

const LAB_JEV_PATHS = LAB_JEV_MODULES.map((name) => join(DIR, name));
const LAB_PATHS = LAB_MODULES.map((name) => join(LAB_DIR, name));
/** Executable files of the family: the adapter, the planner and the real script. */
const REAL_PATHS = [...LAB_JEV_PATHS, P.real];
/** Every non-test file of the lab family, old and new. */
const FAMILY_PATHS = [...LAB_PATHS, ...LAB_JEV_PATHS, P.lab, P.real];
const TEST_PATHS = [
  ...LAB_TESTS.map((name) => join(LAB_DIR, name)),
  ...LAB_JEV_TESTS.map((name) => join(DIR, name)),
  P.labTest,
  P.depsTest,
  P.realTest,
];

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
  return [...new Set(found)].sort();
}

describe("LJ27 static purity of the real Jev adapter", () => {
  test("LJ27 src/lab-jev is exactly the chooser and the planner", () => {
    expect(LAB_JEV_MODULES).toEqual(["jev-chooser.ts", "plan-chooser.ts"]);
  });

  test("LJ27 the SDK is imported only by jev-chooser.ts (and by its test, which builds an SDK model over a fake fetch), in no file of src/lab and in neither script nor their tests", () => {
    const sdk = (path: string): string[] => specifiers(path).filter((specifier) => specifier === "ai" || specifier.startsWith("@ai-sdk/"));
    const holders: Record<string, string[]> = {};
    for (const path of [...FAMILY_PATHS, ...TEST_PATHS]) {
      const found = sdk(path);
      if (found.length > 0) holders[rel(path)] = found;
    }
    expect(holders).toEqual({
      "src/lab-jev/jev-chooser.ts": ["@ai-sdk/typesafe-ai", "ai"],
      "src/lab-jev/jev-chooser.test.ts": ["@ai-sdk/typesafe-ai"],
    });
  });

  test("LJ27 no module of src/lab, neither CLI script nor any lab test imports src/lab-jev; from outside the folder only the real script and its test do", () => {
    const importers = [...FAMILY_PATHS, ...TEST_PATHS].filter((path) => specifiers(path).some((specifier) => specifier.includes("lab-jev")));
    expect(importers.map(rel).sort()).toEqual(["scripts/jev-lab-real.test.ts", "scripts/jev-lab-real.ts"]);
    for (const path of [...LAB_PATHS, P.lab, P.depsTest, P.labTest]) expect({ path: rel(path), importsAdapter: specifiers(path).some((specifier) => specifier.includes("lab-jev")) }).toEqual({ path: rel(path), importsAdapter: false });
  });

  test("LJ27 only scripts/jev-lab-real.ts reads the environment; no other file of the family does, and no test reads a key from it", () => {
    const reading = ["process.env", "Bun.env", "import.meta.env", "dotenv"];
    const readers = FAMILY_PATHS.filter((path) => reading.some((token) => codeOf(path).includes(token))).map(rel);
    expect(readers).toEqual(["scripts/jev-lab-real.ts"]);
    for (const path of FAMILY_PATHS) for (const pattern of [/process\s*\[\s*["']env["']\s*\]/, /\bBun\s*\[/]) expect({ path: rel(path), pattern: String(pattern), found: pattern.test(codeOf(path)) }).toEqual({ path: rel(path), pattern: String(pattern), found: false });
    for (const path of TEST_PATHS) {
      const text = readFileSync(path, "utf8");
      expect({ path: rel(path), reads: /process\.env\.[A-Z_]*(?:KEY|TYPESAFE|JEV)/.test(text) }).toEqual({ path: rel(path), reads: false });
    }
  });

  test("LJ27 the adapter and the real script never open a connection themselves: the network is the SDK and nothing else", () => {
    const forbidden = [
      "fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "navigator.sendBeacon",
      "Bun.serve", "Bun.connect", "Bun.listen", "Bun.udpSocket", "Bun.spawn", "Bun.$",
      "node:http", "node:https", "node:http2", "node:net", "node:tls", "node:dgram", "node:dns", "node:cluster", "node:worker_threads", "node:child_process", "node:vm",
      "require(", "eval(", "new Function", "globalThis",
      "Date.now", "new Date", "Math.random", "randomUUID", "getRandomValues", "setInterval", "queueMicrotask",
    ];
    for (const path of REAL_PATHS) {
      const code = codeOf(path);
      for (const token of forbidden) expect({ path: rel(path), token, found: code.includes(token) }).toEqual({ path: rel(path), token, found: false });
      expect({ path: rel(path), dynamicImport: /\bimport\s*\(/.test(code) }).toEqual({ path: rel(path), dynamicImport: false });
    }
  });

  test("LJ27 the adapter and the real script write nothing to disk (the journal of the lab does) and read nothing from it", () => {
    const disk = ["node:fs", "node:fs/promises", "writeFileSync", "appendFileSync", "renameSync", "mkdirSync", "rmSync", "readFileSync", "Bun.file", "Bun.write", "createWriteStream", "createReadStream"];
    for (const path of REAL_PATHS) {
      const code = codeOf(path);
      for (const token of disk) expect({ path: rel(path), token, found: code.includes(token) }).toEqual({ path: rel(path), token, found: false });
      expect(specifiers(path).filter((specifier) => specifier.startsWith("node:fs"))).toEqual([]);
    }
  });

  test("LJ27 the only timer of the adapter is the abort of one call, and the clock is read in one place", () => {
    for (const path of REAL_PATHS) {
      const code = codeOf(path);
      expect({ path: rel(path), timer: code.includes("setTimeout") }).toEqual({ path: rel(path), timer: path === P.chooser });
      expect({ path: rel(path), clock: code.includes("performance.now") }).toEqual({ path: rel(path), clock: path === P.chooser });
    }
    expect(codeOf(P.chooser)).toContain("clearTimeout(timer)");
    expect(codeOf(P.chooser)).not.toContain("AbortSignal.timeout");
  });

  test("LJ27 imports: each file only imports what the architecture allows, and nothing executable of the repository", () => {
    expect(specifiers(P.chooser)).toEqual(["../generated/prompts", "../lab/policies.ts", "../lab/types.ts", "@ai-sdk/typesafe-ai", "ai"]);
    expect(specifiers(P.plan)).toEqual(["../lab/policies.ts", "../lab/types.ts", "./jev-chooser.ts"]);
    expect(specifiers(P.real)).toEqual(["../src/lab-jev/jev-chooser.ts", "../src/lab-jev/plan-chooser.ts", "../src/lab/journal.ts", "../src/lab/policies.ts", "../src/lab/run.ts", "./jev-lab.ts"]);
    const forbidden = /^(?:ethers|@kuru-labs\/.*|typescript|\.\.\/(?:\.\.\/src\/)?(?:operator|okx-wallet|okx-market|okx-signals|okx-defi|okx-evidence|okx-derivatives|public-market-capture|system-one|jev-read|onchainos|paper-[a-z-]+)(?:\/.*)?|\.\.\/(?:\.\.\/src\/)?(?:market|trader|config|index|model|server|okx-api|book|chain|trades)(?:\.ts)?)$/;
    for (const path of [...REAL_PATHS, ...TEST_PATHS.filter((test) => /lab-jev|jev-lab/.test(test))]) {
      for (const specifier of specifiers(path)) expect({ path: rel(path), specifier, forbidden: forbidden.test(specifier) }).toEqual({ path: rel(path), specifier, forbidden: false });
    }
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

function bannedBytesIn(path: string): string[] {
  const bytes = readFileSync(path);
  return BANNED_SEQUENCES.filter((sequence) => bytes.indexOf(Buffer.from(sequence)) !== -1).map((sequence) => sequence.map((byte) => byte.toString(16)).join(" "));
}

/** The phrases that name the words of execution only to say that they do not happen. */
const NEGATIONS = [LAB_SHADOW_NOTICE, "nada é executado, assinado ou enviado"];

const EXECUTION_WORDS = new RegExp(
  `\\b(?:execute[sd]?|executing|execution|sign(?:ed|s|ing)?|signature|send(?:s|ing)?|sent|order(?:s|ed)?|swap(?:s|ped)?|trade[sd]?|trading|buy(?:s|ing)?|bought|sell(?:s|ing)?|sold|approve[sd]?|transfer(?:s|red)?|broadcast|submit(?:s|ted)?|wallet|mnemonic|executa(?:r|do|da|m)?|assina(?:r|do|da|tura)?|envia(?:r|do|da)?|ordem|ordens|comprar|vender|negociar|transferir|aprovar|carteira)\\b`,
  "i",
);

describe("LJ28 text hygiene and the words of execution", () => {
  test("LJ28 no middle dot, en dash, em dash, minus sign or bullet in the document, the adapter, the scripts or any test of the family (byte-level scan)", () => {
    const paths = [DOC_PATH, ...REAL_PATHS, P.lab, ...TEST_PATHS.filter((path) => /lab-jev|jev-lab/.test(path))];
    expect(paths.length).toBeGreaterThan(8);
    for (const path of paths) expect({ path: rel(path), banned: bannedBytesIn(path) }).toEqual({ path: rel(path), banned: [] });
  });

  test("LJ28 the scan itself works: it finds each banned sequence in a probe", () => {
    for (const sequence of BANNED_SEQUENCES) {
      const probe = Buffer.concat([Buffer.from("a"), Buffer.from(sequence), Buffer.from("b")]);
      expect(BANNED_SEQUENCES.some((candidate) => probe.indexOf(Buffer.from(candidate)) !== -1)).toBe(true);
    }
    expect(EXECUTION_WORDS.test("please execute the order")).toBe(true);
    expect(EXECUTION_WORDS.test("o Jev envia uma ordem")).toBe(true);
    expect(EXECUTION_WORDS.test("o Jev assina e executa")).toBe(true);
    expect(EXECUTION_WORDS.test("the signal, the design and the assignment are fine; so is a trader")).toBe(false);
    expect(EXECUTION_WORDS.test("épocas consultadas, custo estimado e teto de chamadas")).toBe(false);
  });

  test("LJ28 no word of execution, signature or order is in the code of the adapter or of the real script, except in the sentences that say none of it happens", () => {
    for (const path of REAL_PATHS) {
      let code = codeOf(path);
      for (const phrase of NEGATIONS) code = code.replaceAll(phrase.replace(/\s+/g, " "), " ");
      const hit = EXECUTION_WORDS.exec(code);
      expect({ path: rel(path), word: hit === null ? null : hit[0] }).toEqual({ path: rel(path), word: null });
    }
  });

  test("LJ28 the sentences that are allowed to name those words are really there, once each where they belong", () => {
    expect(codeOf(P.generatedPrompts)).toContain(LAB_SHADOW_NOTICE);
    expect(codeOf(P.real)).toContain("nada é executado, assinado ou enviado");
    expect(LAB_SHADOW_NOTICE).toContain("nothing is executed, signed or sent");
  });

  test("LJ28 the text that the model receives, built for a real shape of state, has no word of execution outside the shadow notice", () => {
    const payload = chooser.buildJevLabPayload({
      horizonHours: 24,
      candidates: [
        { key: "c1", modality: "spot-momentum", side: "long", horizonHours: 24, criteria: { costBps: 10 } },
        { key: "c2", modality: "perp-directional", side: "short", horizonHours: 24, criteria: { costBps: 12 } },
        { key: "c3", modality: "funding-carry", side: "neutral", horizonHours: 24, criteria: { carryNetBps: 3 } },
      ],
    });
    const text = JSON.stringify(payload.questions).replaceAll(LAB_SHADOW_NOTICE, " ");
    expect(EXECUTION_WORDS.exec(text)).toBeNull();
  });

  test("LJ28 no word of approval or promise in the code of the adapter or of the real script", () => {
    const words = ["aprovado", "liberado", "pronto para operar", "garantido", "lucro certo", "go-live", "safe to trade", "autorizado", "retorno garantido"];
    for (const path of REAL_PATHS) {
      const code = codeOf(path).toLowerCase();
      for (const word of words) expect({ path: rel(path), word, found: code.includes(word) }).toEqual({ path: rel(path), word, found: false });
    }
  });
});

// ---------------------------------------------------------------------------
// Traceability
// ---------------------------------------------------------------------------

describe("LJ29 traceability", () => {
  const allTests = [P.depsTest, P.chooserTest, P.realTest, P.purityTest].map((path) => readFileSync(path, "utf8")).join("\n");

  test("LJ29 the document defines LJ1 to LJ29 as rows of the acceptance table", () => {
    for (let n = 1; n <= 29; n += 1) expect({ n, defined: new RegExp(`\\| LJ${n} \\|`).test(DOC) }).toEqual({ n, defined: true });
    expect(DOC).not.toMatch(/\| LJ30 \|/);
  });

  test("LJ29 every acceptance id is exercised by at least one test whose title starts with it", () => {
    for (let n = 1; n <= 29; n += 1) expect({ n, covered: new RegExp(`(?:test|it)\\(\\s*[\`"']LJ${n}[ :]`).test(allTests) }).toEqual({ n, covered: true });
  });

  test("LJ29 every test file that the acceptance table names exists", () => {
    const table = DOC.slice(DOC.indexOf("## 2."), DOC.indexOf("## 3."));
    const named = new Set([...table.matchAll(/[\w.-]+\.test\.ts/g)].map((match) => match[0]));
    expect([...named].sort()).toEqual(["jev-chooser.test.ts", "jev-lab-real.test.ts", "jev-lab.deps.test.ts", "purity.test.ts"]);
    const existing = new Set([...LAB_JEV_TESTS, "jev-lab-real.test.ts", "jev-lab.deps.test.ts"]);
    for (const name of named) expect({ name, exists: existing.has(name) }).toEqual({ name, exists: true });
  });

  test("LJ29 the flags, the variables, the subcommands, the exit codes and the files of the real script are all in the document", () => {
    for (const flag of ["--capture", "--out", "--max-usd", "--max-calls", "--allow-paid-inference", "--timeout-ms", "--usd-per-mtok", "--seed", "--step-ms", "--horizon-ms", "--bar-ms", "--frozen-at-ms"]) expect({ flag, documented: DOC.includes(flag) }).toEqual({ flag, documented: true });
    for (const name of ["TYPESAFE_AI_API_KEY", "JEV_MODEL_ID", "JEV_USD_PER_MTOK", "data/jev.env", "--env-file=data/jev.env", "--no-env-file"]) expect({ name, documented: DOC.includes(name) }).toEqual({ name, documented: true });
    for (const subcommand of ["jev-lab-real.ts plan --capture", "jev-lab-real.ts run --capture"]) expect({ subcommand, documented: DOC.includes(subcommand) }).toEqual({ subcommand, documented: true });
    const codes = DOC.slice(DOC.indexOf("**Códigos de saída.**"));
    expect(codes.startsWith("**Códigos de saída.**")).toBe(true);
    for (const code of ["0:", "2:", "3:"]) expect({ code, documented: codes.slice(0, 900).includes(` ${code} `) }).toEqual({ code, documented: true });
    for (const file of ["src/lab-jev/jev-chooser.ts", "src/lab-jev/plan-chooser.ts", "scripts/jev-lab-real.ts", "scripts/jev-lab.ts"]) expect({ file, documented: DOC.includes(file) }).toEqual({ file, documented: true });
    for (const phrase of ["decisão D11", "Alavancagem que a vantagem medida do Jev justifica", "limite inferior de Kelly", "fase-0"]) expect({ phrase, documented: DOC.includes(phrase) }).toEqual({ phrase, documented: true });
  });

  test("LJ29 every identifier that the module map lists is a real export of that file", () => {
    const exportsOf: Record<string, Record<string, unknown>> = {
      "src/lab-jev/jev-chooser.ts": chooser,
      "src/lab-jev/plan-chooser.ts": plan,
      "scripts/jev-lab-real.ts": realScript,
      "scripts/jev-lab.ts": labScript,
    };
    const section = DOC.slice(DOC.indexOf("## 11."), DOC.indexOf("## 12."));
    const rows = [...section.matchAll(/^\| `((?:src|scripts)\/[\w/.-]+\.ts)` \| (.*) \|$/gm)];
    expect(rows.map((row) => row[1]).sort()).toEqual(Object.keys(exportsOf).sort());
    let checked = 0;
    for (const row of rows) {
      const file = row[1] as string;
      for (const identifier of [...(row[2] as string).matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((match) => match[1] as string)) {
        expect({ file, identifier, exported: identifier in (exportsOf[file] as Record<string, unknown>) }).toEqual({ file, identifier, exported: true });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });

  test("LJ29 the numbers fixed in the code are the numbers written in the document", () => {
    expect(realScript.HARD_MAX_USD).toBe(5);
    expect(realScript.HARD_MAX_CALLS).toBe(2000);
    expect(realScript.DEFAULT_TIMEOUT_MS).toBe(20_000);
    expect(realScript.ABORT_MARGIN_MS).toBe(2_000);
    expect(chooser.JEV_LAB_DEFAULT_MAX_CONSECUTIVE_FAILURES).toBe(3);
    expect(chooser.JEV_LAB_MAX_CANDIDATES).toBe(254);
    expect(chooser.JEV_LAB_PROMPT_OVERHEAD_TOKENS).toBe(500);
    for (const token of ["5 USD", "2000 chamadas", "20000 ms", "2000 ms", "Três falhas seguidas", "254 candidatos", "mais 500", "cinco algarismos significativos", `jev-latest@${chooser.JEV_LAB_PROMPT_VERSION}`]) expect({ token, documented: DOC.includes(token) }).toEqual({ token, documented: true });
    for (const name of chooser.JEV_LAB_CRITERIA) expect({ name, documented: DOC.includes(name) }).toEqual({ name, documented: true });
  });
});
