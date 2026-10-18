import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

// D-A7. Static isolation of the wallet pilot: src/pilot and its two entry scripts observe, decide in simulation and append
// to a journal. They never import a signer, an executor or the operator's execution path, never name a signing or sending
// call, never reach the network, and read the environment nowhere inside src/pilot. The tests read the code as text
// (comments dropped by the transpiler) and follow the relative imports, so a violation hidden in a helper that a module
// imports is found as well. Spec: docs/gev-wallet-pilot/SPEC.md (M2, P4).

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "..", "..");
const rel = (path: string): string => relative(ROOT, path).replaceAll("\\", "/");

function productionFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...productionFiles(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) found.push(path);
  }
  return found.sort();
}

interface Edge { specifier: string; names: string[] }

/** Names a clause imports; a default or namespace import is reported as <...> so that no allowlist can contain it. */
function importedNames(clause: string): string[] {
  const inner = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
  const names = inner.split(",").map((part) => (part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "").trim()).filter(Boolean);
  const outside = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").replace(/^type\s+/, "").trim();
  return outside ? [...names, `<${outside}>`] : names;
}

/** Every module the file imports or re-exports, including a type position import("...") and a bare side effect import. */
function edgesOf(path: string): Edge[] {
  const text = readFileSync(path, "utf8");
  const found: Edge[] = [];
  for (const match of text.matchAll(/(?:^|[\n;])\s*(?:import|export)\s+([^;]*?)\sfrom\s+["']([^"']+)["']/g)) found.push({ specifier: match[2]!, names: importedNames(match[1]!) });
  for (const match of text.matchAll(/(?:^|[\n;])\s*import\s+["']([^"']+)["']/g)) found.push({ specifier: match[1]!, names: [] });
  for (const match of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push({ specifier: match[1]!, names: [] });
  return found;
}

function resolveRelative(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  throw new Error(`${rel(from)} imports ${specifier}, which does not resolve to a file`);
}

interface Closure { files: string[]; bare: Map<string, Array<{ file: string; names: string[] }>> }

function closureOf(entries: string[]): Closure {
  const seen = new Set(entries);
  const queue = [...entries];
  const bare: Closure["bare"] = new Map();
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const edge of edgesOf(file)) {
      if (edge.specifier.startsWith(".")) {
        const target = resolveRelative(file, edge.specifier);
        if (!seen.has(target)) { seen.add(target); queue.push(target); }
      } else {
        const holders = bare.get(edge.specifier) ?? [];
        holders.push({ file: rel(file), names: edge.names });
        bare.set(edge.specifier, holders);
      }
    }
  }
  return { files: [...seen].map(rel).sort(), bare };
}

const transpiler = new Bun.Transpiler({ loader: "ts" });
const codeCache = new Map<string, string>();
/** Executable code only: comments and types are dropped by the transpiler and whitespace is collapsed. */
function codeOf(path: string): string {
  let code = codeCache.get(path);
  if (code === undefined) { code = transpiler.transformSync(readFileSync(path, "utf8")).replace(/\s+/g, " "); codeCache.set(path, code); }
  return code;
}
const codeOfRel = (file: string): string => codeOf(join(ROOT, file));

/** What may never appear in executable code of the closure. Each entry is a label and a pattern. */
const NEVER: ReadonlyArray<readonly [string, RegExp]> = [
  ["signing a transaction or a message", /\bsign(?:Transaction|AllTransactions|Message|TypedData|AndSend\w*)\b/],
  ["sending or broadcasting a transaction", /\b(?:send(?:Raw)?Transaction|sendAndConfirm\w*|sendCalls|broadcast\w*)\b/i],
  ["a JSON-RPC method of any kind", /["'`](?:eth|web3|personal|debug|txpool|engine|evm|anvil|hardhat|trace|erigon|admin|miner)_[A-Za-z0-9]+["'`]|["'`]wallet_(?:send|sign|switch|add|request|watch)\w*["'`]/],
  ["a signer or a key object", /\b(?:Wallet|VoidSigner|Signer|Keypair|HDNode|Mnemonic|fromMnemonic)\b/],
  ["private key material", /PRIVATE_KEY|\bprivateKey\b|\bmnemonic\b|seedPhrase|keystore/i],
  ["node:crypto signing or key objects", /\b(?:createSign|createPrivateKey|createSecretKey|generateKeyPair\w*|subtle)\b/],
  ["the live gates of the trader and the operator", /LIVE_ACK|AUTO_DEPOSIT|OWN_FUNDS_RISK|\bDRY_RUN\b/],
  ["an environment read by bracket or through globalThis", /\bprocess\s*\[|\bBun\s*\[|\bglobalThis\s*\.\s*(?:process|Bun)\b/],
  ["a network call", /(?<![.\w$])fetch\s*\(|\bglobalThis\s*\.\s*fetch\b|\bBun\.fetch\b|\bBun\.(?:connect|listen|udpSocket|spawnSync|\$)\b|node:(?:http|https|http2|net|tls|dgram|dns|cluster|worker_threads|child_process|vm)\b/],
  ["a browser network API", /\b(?:WebSocket|XMLHttpRequest|EventSource)\b|sendBeacon/],
  ["dynamic code", /\beval\s*\(|\bnew Function\b|\brequire\s*\(|\bimport\s*\(/],
  ["the model classes of the operator", /\bJevOperatorModel\b|\bMockOperatorModel\b|\btypeSafeAi\b|\bexperimental_evaluate\b/],
];

const ENTRY_SCRIPTS = ["scripts/gev-wallet-pilot-fixture.ts", "scripts/gev-wallet-pilot.ts"] as const;
const PILOT_FILES = productionFiles(HERE);
const ENTRIES = [...PILOT_FILES, ...ENTRY_SCRIPTS.map((path) => join(ROOT, path))];
const CLOSURE = closureOf(ENTRIES);
const OUTSIDE = CLOSURE.files.filter((file) => !file.startsWith("src/pilot/") && !file.startsWith("scripts/"));
const pilotCode = (file: string): boolean => file.startsWith("src/pilot/") || file.startsWith("scripts/");

/**
 * The only files outside src/pilot that the pilot may reach. SPEC M2 asks for "builders, gates, sanitized state and the
 * plan validator that already exist", so these are reused as they are; anything else (the executor, the operator's
 * configuration, its ledger, its cycle, its HTTP surface, the legacy trader) fails the exact comparison below and has to
 * be argued here first. The names each one is imported by are pinned in the next test.
 */
const ALLOWED_OUTSIDE = [
  "src/okx-wallet/chains.ts", // chain table: chainByIndex
  "src/generated/prompts.ts", // prompt text generated from the graph (pure constants, no imports)
  "src/okx-wallet/portfolio.ts", // InventorySnapshot (type) and normalizeInventory (fixture only); the HMAC client of the same file is never imported
  "src/operator/candidates.ts", // round trip candidate builder and the default pairs
  "src/operator/jev-selector.ts", // sanitized state and decision validator; the SDK backed model classes of the same file are never imported
  "src/operator/plan.ts", // hypothetical plan with every gate false for the pilot policy
  "src/operator/risk-gate.ts", // verdicts
  "src/operator/types.ts", // types only
];
const NAMES_IMPORTED_FROM_OUTSIDE: Record<string, string[]> = {
  "src/okx-wallet/chains.ts": ["chainByIndex"],
  "src/okx-wallet/portfolio.ts": ["InventorySnapshot", "normalizeInventory"],
  "src/operator/candidates.ts": ["DEFAULT_PAIRS", "SwapQuoter", "buildRoundTripCandidates"],
  "src/operator/jev-selector.ts": ["OperatorModel", "buildOperatorState", "validateOperatorDecision"],
  "src/operator/plan.ts": ["buildExecutionPlan"],
  "src/operator/risk-gate.ts": ["gateCandidates"],
  "src/operator/types.ts": ["ExecutionPlan", "GateVerdict", "OperatorDecision", "OperatorPolicy", "OpportunityCandidate"],
};

describe("ISO-PILOT the pilot observes and simulates, and nothing else", () => {
  test("ISO-PILOT-1 the scan covers the whole pilot and both entry scripts, and the package scripts name exactly those", () => {
    expect(PILOT_FILES.length).toBeGreaterThanOrEqual(6);
    const scriptsOnDisk = readdirSync(join(ROOT, "scripts")).filter((name) => /^gev-wallet-pilot.*\.ts$/.test(name) && !name.endsWith(".test.ts")).map((name) => `scripts/${name}`).sort();
    expect(scriptsOnDisk).toEqual([...ENTRY_SCRIPTS]);
    const packageScripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(packageScripts.pilot).toContain("scripts/gev-wallet-pilot.ts");
    expect(packageScripts["pilot:fixture"]).toContain("scripts/gev-wallet-pilot-fixture.ts");
  });

  test("ISO-PILOT-2 EXCEPTION operator: the pilot reaches exactly five operator modules and two wallet modules, by exactly the names it needs; never the executor, the configuration, the ledger or the trader", () => {
    expect(OUTSIDE).toEqual([...ALLOWED_OUTSIDE].sort());
    const forbidden = /^src\/(?:operator\/(?!(?:candidates|jev-selector|plan|risk-gate|types)\.ts$)|okx-wallet\/(?:solana-signer|trade|defi)\.ts$|(?:market|trader|config|index|server|model|chain|book|trades|okx-api)\.ts$)/;
    expect(CLOSURE.files.filter((file) => forbidden.test(file))).toEqual([]);
    expect(CLOSURE.files.filter((file) => /executor|signer|ledger|operator\/(?:cycle|config|http)\.ts/i.test(file))).toEqual([]);
    const imported: Record<string, Set<string>> = {};
    for (const path of [...PILOT_FILES, ...ENTRY_SCRIPTS.map((script) => join(ROOT, script))]) {
      for (const edge of edgesOf(path)) {
        if (!edge.specifier.startsWith(".")) continue;
        const target = rel(resolveRelative(path, edge.specifier));
        if (target.startsWith("src/pilot/") || target.startsWith("scripts/")) continue;
        const names = (imported[target] ??= new Set());
        for (const name of edge.names) names.add(name);
      }
    }
    expect(Object.fromEntries(Object.entries(imported).map(([file, names]) => [file, [...names].sort()]))).toEqual(NAMES_IMPORTED_FROM_OUTSIDE);
  });

  test("ISO-PILOT-3 bare imports: the model SDK only inside jev-selector.ts, the node built-ins each file needs, no chain library at all", () => {
    const holders = (specifier: string) => (CLOSURE.bare.get(specifier) ?? []).map((holder) => holder.file).sort();
    expect([...CLOSURE.bare.keys()].sort()).toEqual(["@ai-sdk/typesafe-ai", "ai", "node:crypto", "node:fs/promises", "node:path"]);
    // EXCEPTION: jev-selector.ts imports the SDK for its JevOperatorModel class. The pilot imports only buildOperatorState,
    // validateOperatorDecision and the OperatorModel type from it (pinned above) and ISO-PILOT-4 forbids naming the classes.
    expect(holders("ai")).toEqual(["src/operator/jev-selector.ts"]);
    expect(holders("@ai-sdk/typesafe-ai")).toEqual(["src/operator/jev-selector.ts"]);
    // The journal is the only file the pilot writes, and the entry scripts only resolve its path.
    expect(holders("node:fs/promises")).toEqual(["src/pilot/journal.ts"]);
    expect(holders("node:path")).toEqual(["scripts/gev-wallet-pilot-fixture.ts", "scripts/gev-wallet-pilot.ts", "src/pilot/journal.ts"]);
    // Hashes, the HMAC that authenticates an OKX API request (never imported by the pilot) and random ids. No key objects, no sign.
    for (const holder of CLOSURE.bare.get("node:crypto") ?? []) expect(holder.names.filter((name) => !["createHash", "createHmac", "randomUUID"].includes(name)), holder.file).toEqual([]);
    expect((CLOSURE.bare.get("node:crypto") ?? []).filter((holder) => holder.names.includes("createHmac")).map((holder) => holder.file)).toEqual(["src/okx-wallet/portfolio.ts"]);
  });

  test("ISO-PILOT-4 no executable code names a signing or sending call, a key, a gate of the trader, any JSON-RPC method, a socket or dynamic code (entry scripts may serve); the pilot never names the model classes", () => {
    // The generated prompt module is string data only; its natural-language text is not executable code.
    for (const file of CLOSURE.files.filter((name) => name !== "src/generated/prompts.ts")) {
      const code = codeOfRel(file);
      // jev-selector.ts legitimately holds the model classes; the pilot itself must not name them (the default entry has no
      // model and the fixture brings its own).
      for (const [label, pattern] of NEVER.filter(([name]) => name !== "the model classes of the operator" || pilotCode(file))) expect({ file, label, found: pattern.test(code) }, `${file}: ${label}`).toEqual({ file, label, found: false });
    }
    for (const file of CLOSURE.files.filter((name) => !ENTRY_SCRIPTS.includes(name as (typeof ENTRY_SCRIPTS)[number]))) {
      expect({ file, opensAServerOrProcess: /\bBun\.(?:serve|spawn)\b/.test(codeOfRel(file)) }).toEqual({ file, opensAServerOrProcess: false });
    }
  });

  test("ISO-PILOT-5 simulation is the only mode in code: execution is the literal disabled, mode the literal simulation, the policy has no allowlist", () => {
    let executions = 0;
    let modes = 0;
    for (const file of CLOSURE.files) {
      const code = codeOfRel(file);
      for (const match of code.matchAll(/\bexecution\s*:\s*([^,}\s]+)/g)) { executions += 1; expect({ file, value: match[1] }).toEqual({ file, value: '"disabled"' }); }
      // Only string values: journal.ts passes a numeric file mode (0o600) to appendFile, which is not the pilot mode.
      if (pilotCode(file)) for (const match of code.matchAll(/\bmode\s*:\s*("[^"]*")/g)) { modes += 1; expect({ file, value: match[1] }).toEqual({ file, value: '"simulation"' }); }
      for (const name of ["executionEnabled", "signed", "approveTransaction"]) for (const match of code.matchAll(new RegExp(`\\b${name}\\s*:\\s*([^,}\\s]+)`, "g"))) expect({ file, name, value: match[1] }).toEqual({ file, name, value: "false" });
    }
    expect(executions).toBeGreaterThanOrEqual(2);
    expect(modes).toBeGreaterThanOrEqual(3);
    expect(codeOfRel("src/pilot/policy.ts").includes("routerAllowlist: {}, spenderAllowlist: {}, selectorAllowlist: {}")).toBe(true);
  });

  test("ISO-PILOT-6 nothing inside src/ reads the environment; the entry scripts read it only through resolvePilotPorts and only for the two port variables", () => {
    const readers = CLOSURE.files.filter((file) => /\bprocess\.env\b|\bBun\.env\b|import\.meta\.env|dotenv/.test(codeOfRel(file)));
    expect(readers.filter((file) => file.startsWith("src/"))).toEqual([]);
    // The entry scripts run with --no-env-file (package.json), so the two names below come from the shell, never from a .env.
    for (const script of ENTRY_SCRIPTS) {
      const code = codeOfRel(script);
      expect([...code.matchAll(/\bprocess\.env\.(\w+)/g)].map((match) => match[1]).filter((name) => !["PILOT_PORT", "PILOT_UI_PORT"].includes(name!))).toEqual([]);
      const bare = code.match(/\bprocess\.env\b(?!\.)/g)?.length ?? 0;
      const handed = code.match(/resolvePilotPorts\(process\.env\)/g)?.length ?? 0;
      expect({ script, bare, handed }).toEqual({ script, bare: handed, handed });
    }
    const packageScripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(packageScripts.pilot).toContain("--no-env-file");
    expect(packageScripts["pilot:fixture"]).toContain("--no-env-file");
  });

  test("ISO-PILOT-7 the pilot reaches no network; the only listeners are the two entry scripts, on the loopback address", () => {
    expect(CLOSURE.files.filter((file) => /(?<![.\w$])fetch\s*\(|\bglobalThis\.fetch\b|\bBun\.fetch\b/.test(codeOfRel(file)))).toEqual([]);
    expect(CLOSURE.files.filter((file) => /\bBun\.serve\b/.test(codeOfRel(file)))).toEqual([...ENTRY_SCRIPTS]);
    for (const script of ENTRY_SCRIPTS) expect({ script, loopbackOnly: /Bun\.serve\(\{ hostname: "127\.0\.0\.1",/.test(codeOfRel(script)) }).toEqual({ script, loopbackOnly: true });
    expect(CLOSURE.files.filter((file) => /\bBun\.spawn\b/.test(codeOfRel(file)))).toEqual([]);
  });

  test("ISO-PILOT-8 only the journal touches the disk", () => {
    const writers = CLOSURE.files.filter((file) => /\bBun\.(?:file|write)\b|\b(?:writeFile|appendFile|mkdir|mkdirSync|renameSync|unlinkSync|rmSync|createWriteStream)\w*\b|node:fs/.test(codeOfRel(file)));
    expect(writers).toEqual(["src/pilot/journal.ts"]);
  });
});

describe("ISO-PILOT the scan itself", () => {
  test("ISO-PILOT-9 every pattern fires on a probe of what it forbids and stays quiet on the neighbours that are allowed", () => {
    const probes: Record<string, string> = {
      "signing a transaction or a message": "await wallet.signTransaction(tx)",
      "sending or broadcasting a transaction": "provider.sendRawTransaction(raw)",
      "a JSON-RPC method of any kind": "{ method: 'eth_accounts' }",
      "a signer or a key object": "new Wallet(key)",
      "private key material": "const privateKey = read()",
      "node:crypto signing or key objects": "createPrivateKey(pem)",
      "the live gates of the trader and the operator": "if (env.LIVE_ACK)",
      "an environment read by bracket or through globalThis": "process['env']",
      "a network call": "await fetch(url)",
      "a browser network API": "new WebSocket(url)",
      "dynamic code": "await import(path)",
      "the model classes of the operator": "new JevOperatorModel(id)",
    };
    for (const [label, pattern] of NEVER) {
      expect(pattern.test(probes[label] ?? "<no probe>"), label).toBe(true);
      expect(pattern.test("const design = signal.assignment; const hash = createHash('sha256'); reasons.push('wallet_observation_stale'); deps.fetch(url); approveTransaction: false"), label).toBe(false);
    }
  });

  test("ISO-PILOT-10 the walker follows imports through helpers, reports bare imports with their names, and finds a violation two files away", () => {
    const directory = mkdtempSync(join(tmpdir(), "pilot-isolation-probe-"));
    try {
      mkdirSync(join(directory, "lib"));
      writeFileSync(join(directory, "entry.ts"), 'import { helper } from "./lib/helper";\nexport const value = helper();\n');
      writeFileSync(join(directory, "lib", "helper.ts"), 'import { sign } from "./deep.ts";\nexport function helper() { return sign(); }\n');
      writeFileSync(join(directory, "lib", "deep.ts"), 'import { Wallet } from "ethers";\nimport * as crypto from "node:crypto";\nexport const sign = () => new Wallet("k").signTransaction({});\n');
      const probe = closureOf([join(directory, "entry.ts")]);
      expect(probe.files).toHaveLength(3);
      expect(probe.bare.get("ethers")?.[0]?.names).toEqual(["Wallet"]);
      expect(probe.bare.get("node:crypto")?.[0]?.names).toEqual(["<* as crypto>"]);
      const deep = codeOf(join(directory, "lib", "deep.ts"));
      expect(NEVER.filter(([, pattern]) => pattern.test(deep)).map(([label]) => label)).toEqual(["signing a transaction or a message", "a signer or a key object"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
