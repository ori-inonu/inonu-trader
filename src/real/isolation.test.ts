import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

// D-A7. Static isolation of the real (paper) pipeline: src/real and the three real:* entry scripts can read, compute and
// persist a paper journal, and nothing else. They never import a signer, an executor or the operator, never name a signing
// or sending call, and read the environment in the two entry points the specification allows. The tests read the code as
// text (comments dropped by the transpiler) and follow the relative imports, so a violation hidden in a helper that a
// module imports is found as well. Spec: docs/real-integration/INSTRUCAO-DO-OBJETIVO.md (G15) and EXECUTION-SPEC.md.

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

/** What may never appear in executable code of the closure. Each entry is a label and a pattern. */
const NEVER: ReadonlyArray<readonly [string, RegExp]> = [
  ["signing a transaction or a message", /\bsign(?:Transaction|AllTransactions|Message|TypedData|AndSend\w*)\b/],
  ["sending or broadcasting a transaction", /\b(?:send(?:Raw)?Transaction|sendAndConfirm\w*|sendCalls|broadcast\w*)\b/i],
  ["a signing or sending JSON-RPC method", /["'`](?:eth_(?:send\w*|sign\w*)|personal_\w+|wallet_(?:send|sign)\w*)["'`]/],
  ["a signer or a key object", /\b(?:Wallet|VoidSigner|Signer|Keypair|HDNode|Mnemonic|fromMnemonic)\b/],
  ["private key material", /PRIVATE_KEY|\bprivateKey\b|\bmnemonic\b|seedPhrase|keystore/i],
  ["node:crypto signing or key objects", /\b(?:createSign|createPrivateKey|createSecretKey|generateKeyPair\w*|subtle)\b/],
  ["the live gates of the trader and the operator", /LIVE_ACK|AUTO_DEPOSIT|OWN_FUNDS_RISK|\bDRY_RUN\b/],
  ["an environment read by bracket or through globalThis", /\bprocess\s*\[|\bBun\s*\[|\bglobalThis\s*\.\s*(?:process|Bun)\b/],
  ["a socket, a server or a process outside the entry scripts", /\bBun\.(?:connect|listen|udpSocket|spawnSync|\$)\b|node:(?:http|https|http2|net|tls|dgram|dns|cluster|worker_threads|child_process|vm)\b/],
  ["a browser network API", /\b(?:WebSocket|XMLHttpRequest|EventSource)\b|sendBeacon/],
  ["dynamic code", /\beval\s*\(|\bnew Function\b|\brequire\s*\(|\bimport\s*\(/],
];

/** Properties that switch execution on: every assignment found must be the literal false. */
const SWITCHES = ["executionEnabled", "signed", "approveTransaction"] as const;
function assignedValues(code: string, name: string): string[] {
  return [...code.matchAll(new RegExp(`\\b${name}\\s*:\\s*([^,}\\s]+)`, "g"))].map((match) => match[1]!);
}

const ENTRY_SCRIPTS = ["scripts/real-console.ts", "scripts/real-doctor.ts", "scripts/real-start.ts"] as const;
const REAL_FILES = productionFiles(HERE);
const ENTRIES = [...REAL_FILES, ...ENTRY_SCRIPTS.map((path) => join(ROOT, path))];
const CLOSURE = closureOf(ENTRIES);
const IN_FOLDER = (file: string) => file.startsWith("src/real/");
const OUTSIDE = CLOSURE.files.filter((file) => !IN_FOLDER(file) && !file.startsWith("scripts/"));

/**
 * The only files outside src/real that the pipeline may reach, with the reason of each group. Anything else (above all
 * anything in src/operator) fails the exact comparison below and has to be argued here first.
 */
const ALLOWED_OUTSIDE = [
  // Read-only OKX data layer, with its own isolation test (src/onchainos/isolation.test.ts, D23 to D27).
  "src/onchainos/defi-read.ts", "src/onchainos/endpoints.ts", "src/onchainos/errors.ts", "src/onchainos/http.ts", "src/onchainos/paging.ts",
  "src/onchainos/public-okx.ts", "src/onchainos/read.ts", "src/onchainos/signals.ts", "src/onchainos/values.ts",
  // Decimal, canonical JSON and snapshot types that public-okx.ts uses to normalize the public market snapshot. Pure.
  "src/okx-derivatives/canonical.ts", "src/okx-derivatives/contract.ts", "src/okx-derivatives/decimal.ts", "src/okx-derivatives/snapshot.ts", "src/okx-derivatives/types.ts",
  // Static table of chain ids and native symbols. Pure.
  "src/okx-wallet/chains.ts",
];

describe("ISO-REAL the real pipeline can read and record, and nothing else", () => {
  test("ISO-REAL-1 the scan covers the whole pipeline and every real:* entry script, and the package scripts name exactly those", () => {
    expect(REAL_FILES.length).toBeGreaterThan(20);
    expect(CLOSURE.files.length).toBeGreaterThan(REAL_FILES.length);
    const scriptsOnDisk = readdirSync(join(ROOT, "scripts")).filter((name) => /^real-.*\.ts$/.test(name) && !name.endsWith(".test.ts")).map((name) => `scripts/${name}`).sort();
    expect(scriptsOnDisk).toEqual([...ENTRY_SCRIPTS]);
    const packageScripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    for (const [name, script] of [["real:console", "scripts/real-console.ts"], ["real:doctor", "scripts/real-doctor.ts"], ["real:start", "scripts/real-start.ts"]] as const) {
      expect(packageScripts[name]).toContain(script);
    }
  });

  test("ISO-REAL-2 the files outside src/real that the pipeline reaches are exactly the read-only data layer; nothing of the operator, an executor, a signer or the legacy trader", () => {
    expect(OUTSIDE).toEqual([...ALLOWED_OUTSIDE].sort());
    const forbidden = /^src\/(?:operator\/|okx-wallet\/(?:solana-signer|trade|defi)\.ts$|(?:market|trader|config|index|server|model|chain|book|trades|okx-api)\.ts$)/;
    expect(CLOSURE.files.filter((file) => forbidden.test(file))).toEqual([]);
    expect(CLOSURE.files.filter((file) => /executor|signer/i.test(file))).toEqual([]);
  });

  test("ISO-REAL-3 bare imports: the model SDK in jev.ts, the node built-ins each file needs, and ethers as a pure encoding library in two files", () => {
    const holders = (specifier: string) => (CLOSURE.bare.get(specifier) ?? []).map((holder) => holder.file).sort();
    expect([...CLOSURE.bare.keys()].sort()).toEqual(["@ai-sdk/typesafe-ai", "ai", "ethers", "node:crypto", "node:fs", "node:path"]);
    // The paper Jev: the one model call of the pipeline goes through the application's SDK and is gated by authorization and a call cap.
    expect(holders("ai")).toEqual(["src/real/jev.ts"]);
    expect(holders("@ai-sdk/typesafe-ai")).toEqual(["src/real/jev.ts"]);
    // The paper journal is the only file the pipeline writes; real-console.ts only resolves paths.
    expect(holders("node:fs")).toEqual(["src/real/journal.ts"]);
    expect(holders("node:path")).toEqual(["scripts/real-console.ts", "src/real/journal.ts"]);
    // Hashes, the HMAC that authenticates an OKX API request (not a wallet signature) and random ids. No key objects, no sign.
    for (const holder of CLOSURE.bare.get("node:crypto") ?? []) expect(holder.names.filter((name) => !["createHash", "createHmac", "randomUUID"].includes(name)), holder.file).toEqual([]);
    expect((CLOSURE.bare.get("node:crypto") ?? []).filter((holder) => holder.names.includes("createHmac")).map((holder) => holder.file)).toEqual(["src/onchainos/http.ts"]);
  });

  test("ISO-REAL-4 EXCEPTION ethers: only { utils } in rpc-read.ts and semantic-proof.ts, only hashing and ABI parsing; no provider, no signer, no contract object", () => {
    // The pipeline proves calldata and reads state offline with the pure utilities of ethers v5. The library also ships signers
    // and providers, so the exception is pinned to the exact import, to the exact members used and to the absence of the rest.
    const holders = CLOSURE.bare.get("ethers") ?? [];
    expect(holders.map((holder) => holder.file).sort()).toEqual(["src/real/rpc-read.ts", "src/real/semantic-proof.ts"]);
    for (const holder of holders) expect(holder.names, holder.file).toEqual(["utils"]);
    const members = new Set<string>();
    for (const file of ["src/real/rpc-read.ts", "src/real/semantic-proof.ts"]) {
      const code = codeOf(join(ROOT, file));
      for (const match of code.matchAll(/\butils\.(\w+)/g)) members.add(match[1]!);
      expect({ file, offendingLibraryPart: /\b(?:providers|Contract|ContractFactory|getDefaultProvider|JsonRpcProvider|Web3Provider|Wallet|Signer)\b/.test(code) }).toEqual({ file, offendingLibraryPart: false });
      // utils is only ever used as utils.member, never aliased, passed on or spread, which would hide the members that are used.
      expect({ file, utilsUsedAsAValue: /\butils\b(?!\.\w)/.test(code.replace('import { utils } from "ethers";', "")) }).toEqual({ file, utilsUsedAsAValue: false });
    }
    expect([...members].sort()).toEqual(["FormatTypes", "Interface", "id", "keccak256"]);
  });

  test("ISO-REAL-5 no executable code names a signing or sending call, a key, a gate of the trader, a socket, a server or dynamic code (entry scripts may serve and spawn)", () => {
    for (const file of CLOSURE.files) {
      const code = codeOf(join(ROOT, file));
      for (const [label, pattern] of NEVER) expect({ file, label, found: pattern.test(code) }, `${file}: ${label}`).toEqual({ file, label, found: false });
    }
    for (const file of CLOSURE.files.filter((name) => !ENTRY_SCRIPTS.includes(name as (typeof ENTRY_SCRIPTS)[number]))) {
      expect({ file, serves: /\bBun\.(?:serve|spawn)\b/.test(codeOf(join(ROOT, file))) }).toEqual({ file, serves: false });
    }
  });

  test("ISO-REAL-6 execution stays off in code: every assignment of executionEnabled, signed and approveTransaction is the literal false", () => {
    let seen = 0;
    for (const file of CLOSURE.files) {
      const code = codeOf(join(ROOT, file));
      for (const name of SWITCHES) for (const value of assignedValues(code, name)) { seen += 1; expect({ file, name, value }).toEqual({ file, name, value: "false" }); }
    }
    expect(seen).toBeGreaterThan(8);
    expect(codeOf(join(ROOT, "src/real/core.ts")).includes("approveTransaction: false")).toBe(true);
  });

  test("ISO-REAL-7 the JSON-RPC methods of the pipeline are the five read-only ones, all in rpc-read.ts", () => {
    const methods = new Map<string, Set<string>>();
    for (const file of CLOSURE.files) {
      // Reason codes such as net_below_minimum or wallet_observation_stale are snake case, so wallet_ counts only in camel case.
      for (const match of codeOf(join(ROOT, file)).matchAll(/["'`]((?:eth|web3|personal|debug|txpool|engine|evm|anvil|hardhat|trace|erigon|admin|miner)_[A-Za-z0-9]+|wallet_[a-z]+[A-Z][A-Za-z0-9]*)["'`]/g)) {
        const name = match[1]!;
        methods.set(name, (methods.get(name) ?? new Set()).add(file));
      }
    }
    expect([...methods.keys()].sort()).toEqual(["eth_call", "eth_chainId", "eth_getBalance", "eth_getBlockByNumber", "eth_getCode"]);
    for (const files of methods.values()) expect([...files]).toEqual(["src/real/rpc-read.ts"]);
  });

  test("ISO-REAL-8 the environment is read in two places only: the default argument of loadRealConfig and the three names of real-console.ts", () => {
    const readers = CLOSURE.files.filter((file) => /\bprocess\.env\b|\bBun\.env\b|import\.meta\.env|dotenv/.test(codeOf(join(ROOT, file))));
    // config.ts: loadRealConfig(env = process.env), called with no argument by real-start.ts and real-doctor.ts.
    // real-console.ts: REAL_UI_PORT, REAL_UI_MODE and REAL_NODE_EXECUTABLE are its own; the whole environment is only handed
    // to the two builders of src/real/console-env.ts, which copy an allowlist and nothing else.
    expect(readers).toEqual(["scripts/real-console.ts", "src/real/config.ts"]);
    const config = codeOf(join(ROOT, "src/real/config.ts"));
    expect(config.match(/\bprocess\.env\b/g)?.length).toBe(1);
    expect(config.includes("function loadRealConfig(env = process.env)")).toBe(true);
    const consoleCode = codeOf(join(ROOT, "scripts/real-console.ts"));
    expect([...new Set([...consoleCode.matchAll(/\bprocess\.env\.(\w+)/g)].map((match) => match[1]))].sort()).toEqual(["REAL_NODE_EXECUTABLE", "REAL_UI_MODE", "REAL_UI_PORT"]);
    expect(consoleCode.match(/\bprocess\.env\b(?!\.)/g)?.length).toBe(2);
    expect(consoleCode.match(/(?:backend|frontend)ChildEnv\(process\.env,/g)?.length).toBe(2);
    for (const script of ["scripts/real-start.ts", "scripts/real-doctor.ts"]) expect({ script, loadsDefaults: codeOf(join(ROOT, script)).includes("loadRealConfig()") }).toEqual({ script, loadsDefaults: true });
  });

  test("ISO-REAL-9 the network is reached in four places only, and no file outside the entry scripts opens a server or a process", () => {
    const callers = CLOSURE.files.filter((file) => /(?<![.\w$])fetch\s*\(|\bglobalThis\.fetch\b|\bBun\.fetch\b/.test(codeOf(join(ROOT, file))));
    // real-start.ts hands its fetch to the OKX Web3 client; public-clock.ts, public-market.ts and rpc-read.ts reach the public
    // OKX Exchange feed and the declared public RPC endpoints, all of them read only.
    expect(callers).toEqual(["scripts/real-start.ts", "src/real/public-clock.ts", "src/real/public-market.ts", "src/real/rpc-read.ts"]);
    expect(CLOSURE.files.filter((file) => /\bBun\.serve\b/.test(codeOf(join(ROOT, file))))).toEqual(["scripts/real-start.ts"]);
    expect(CLOSURE.files.filter((file) => /\bBun\.spawn\b/.test(codeOf(join(ROOT, file))))).toEqual(["scripts/real-console.ts"]);
    expect(/Bun\.serve\(\{ hostname: "127\.0\.0\.1", port: config\.port,/.test(codeOf(join(ROOT, "scripts/real-start.ts")))).toBe(true);
  });

  test("ISO-REAL-10 only the paper journal touches the disk", () => {
    const writers = CLOSURE.files.filter((file) => /\bBun\.(?:file|write)\b|\b(?:writeFile|appendFile|mkdirSync|renameSync|unlinkSync|rmSync|createWriteStream)\w*\b|node:fs/.test(codeOf(join(ROOT, file))));
    expect(writers).toEqual(["src/real/journal.ts"]);
  });
});

describe("ISO-REAL the scan itself", () => {
  test("ISO-REAL-11 every pattern fires on a probe of what it forbids and stays quiet on the neighbours that are allowed", () => {
    const probes: Record<string, string> = {
      "signing a transaction or a message": "await wallet.signTransaction(tx)",
      "sending or broadcasting a transaction": "provider.sendRawTransaction(raw)",
      "a signing or sending JSON-RPC method": "{ method: 'eth_sendRawTransaction' }",
      "a signer or a key object": "new Wallet(key)",
      "private key material": "const privateKey = read()",
      "node:crypto signing or key objects": "createPrivateKey(pem)",
      "the live gates of the trader and the operator": "if (env.LIVE_ACK)",
      "an environment read by bracket or through globalThis": "process['env']",
      "a socket, a server or a process outside the entry scripts": "import net from 'node:net'",
      "a browser network API": "new WebSocket(url)",
      "dynamic code": "await import(path)",
    };
    for (const [label, pattern] of NEVER) {
      expect(pattern.test(probes[label] ?? "<no probe>"), label).toBe(true);
      expect(pattern.test("const design = signal.assignment; const hash = createHash('sha256'); approveTransaction: false"), label).toBe(false);
    }
    expect(assignedValues("{ approveTransaction: false, autoSlippage: false }", "approveTransaction")).toEqual(["false"]);
    expect(assignedValues("{ executionEnabled: true }", "executionEnabled")).toEqual(["true"]);
    expect(assignedValues("{ signed: !1 }", "signed")).toEqual(["!1"]);
  });

  test("ISO-REAL-12 the walker follows imports through helpers, reports bare imports with their names, and finds a violation two files away", () => {
    const directory = mkdtempSync(join(tmpdir(), "real-isolation-probe-"));
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
