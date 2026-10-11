import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { runCli } from "../../scripts/onchainos-capture.ts";
import { summarizePt, type CaptureReport } from "./capture.ts";
import { CaptureError } from "./capture-types.ts";
import { ERROR_KINDS, OnchainosError } from "./errors.ts";
import { envelope, makeClock, makeFakeFetch, makeMemoryFs, makeMemoryFsState, CANARY_KEY, CANARY_PASSPHRASE, CANARY_SECRET } from "./fakes.ts";
import { FIXTURES } from "./fixtures.ts";

// Static guarantees of the read-only data layer: nothing in it can reach the environment, the global fetch, a socket, the
// system clock, a signer, a chain library, a trade or calldata path or a disk (except the recorder), and no file carries
// the typography the project forbids. See docs/OKX-ONCHAINOS-DADOS-SPEC.md criteria D23 and D24.

const directory = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const names = readdirSync(directory).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort();
const library = new Map(names.map((name) => [name, readFileSync(join(directory, name), "utf8")] as const));
const cliPath = join(root, "scripts", "onchainos-capture.ts");
const cli = readFileSync(cliPath, "utf8");

function specifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:^|[\n;])\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g)) found.push(match[1] as string);
  for (const match of text.matchAll(/(?:^|[\n;])\s*import\s+["']([^"']+)["']/g)) found.push(match[1] as string);
  return found;
}

const TRADE_AND_FUNDS_PATHS = new RegExp(
  [
    "/dex/aggregator",
    "/pre-transaction/(?:broadcast|simulate|gas-limit)",
    "/post-transaction",
    "/defi/(?:transaction|user)",
    "/defi/product/(?:detail/prepare)",
    "/defi/calculator",
    "/dex/balance",
    "/dex/market/portfolio",
    "/address-tracker",
    "/cross-chain",
    "/api/v5/(?:trade|account|asset|users|finance|copytrading|broker)",
    "/security/(?:token-scan|dapp-scan|transaction-scan|approval-mng|sign-message-check)",
  ].join("|"),
);

const FORBIDDEN_IN_LIBRARY: Array<[string, RegExp]> = [
  ["process.env", /process\.env/],
  ["Bun.env", /Bun\.env/],
  ["import.meta.env", /import\.meta\.env/],
  ["dotenv", /dotenv/i],
  ["a call to the global fetch", /(?<![.\w$])fetch\s*\(/],
  ["globalThis.fetch", /globalThis\s*\.\s*fetch/],
  ["Bun.fetch", /\bBun\.fetch\b/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["EventSource", /\bEventSource\b/],
  ["Bun network or process API", /\bBun\.(serve|connect|listen|udpSocket|spawn|spawnSync|\$)\b/],
  ["Node network or process module", /node:(http|https|http2|net|tls|dgram|dns|cluster|worker_threads|child_process|vm)\b/],
  ["require", /\brequire\s*\(/],
  ["dynamic import", /\bimport\s*\(/],
  ["eval", /\beval\s*\(/],
  ["Function constructor", /\bnew Function\b/],
  ["system clock or randomness", /Date\.now|new Date\(\s*\)|performance\.now|Math\.random|randomUUID|getRandomValues/],
  ["chain libraries", /\bethers\b|@ethersproject|\bviem\b/i],
  ["transaction signing", /signTransaction|signMessage|signTypedData|sendTransaction|sendRawTransaction|personal_sign|fromMnemonic/i],
  ["secret material", /privateKey|private_key|mnemonic|seedPhrase|seed phrase|keystore/i],
  ["calldata", /calldata|encodeFunctionData|abi\.encode/i],
  ["trade, funds, wallet or security paths", TRADE_AND_FUNDS_PATHS],
  ["per call payment", /PAYMENT-SIGNATURE|\bx402\b/i],
  ["amounts whose unit is not declared", /toTokenAmount|minReceiveAmount/],
  ["console output", /\bconsole\.(log|error|warn|info|debug|trace)\b/],
  ["claims of profit or net return", /\b(netReturn|netYield|netApy|realizedYield|realizedReturn|expectedReturn|guaranteed)\b/i],
];

const DISK_WRITES = /node:fs|\bBun\.(file|write)\b|writeFile|appendFile|mkdirSync|renameSync|unlinkSync|truncateSync|createWriteStream|writeSync/;
const CREDENTIAL_WORDS = /apiKey|secretKey|passphrase|OK-ACCESS/;

describe("isolation: the library", () => {
  test("D23: the module has the expected files and nothing unexpected", () => {
    expect(names).toEqual([
      "capture-sources.ts",
      "capture-types.ts",
      "capture.ts",
      "defi-read.ts",
      "endpoints.ts",
      "errors.ts",
      "fakes.ts",
      "fixtures.ts",
      "gateway.ts",
      "http.ts",
      "market-price.ts",
      "market-token.ts",
      "paging.ts",
      "public-okx.ts",
      "read.ts",
      "signals.ts",
      "social.ts",
      "values.ts",
    ]);
  });

  test("D23: every import is a sibling, a named lab or derivatives module, or a built-in that only its owner may use", () => {
    const builtIns: Record<string, string[]> = { "http.ts": ["node:crypto"], "capture.ts": ["node:fs", "node:path"] };
    const outside: Record<string, string[]> = {
      "capture-types.ts": ["../lab/capture-format.ts"],
      "capture-sources.ts": ["../lab/capture-format.ts"],
      "capture.ts": ["../lab/capture-format.ts"],
      "public-okx.ts": ["../okx-derivatives/decimal.ts", "../okx-derivatives/snapshot.ts"],
    };
    let checked = 0;
    for (const [name, text] of library) {
      for (const specifier of specifiers(text)) {
        checked += 1;
        const sibling = /^\.\/([a-z-]+\.ts)$/.exec(specifier);
        const allowed = sibling !== null ? names.includes(sibling[1] as string) : (builtIns[name] ?? []).includes(specifier) || (outside[name] ?? []).includes(specifier);
        expect(allowed, `${name} imports ${specifier}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(40);
    for (const specifier of specifiers(cli)) {
      const target = /^\.\.\/src\/onchainos\/([a-z-]+\.ts)$/.exec(specifier);
      const lab = specifier === "../src/lab/capture-format.ts";
      expect(lab || (target !== null && names.includes(target[1] as string)), `the CLI imports ${specifier}`).toBe(true);
    }
  });

  test("D23: no environment, global fetch, socket, system clock, signer, chain library, calldata, trade or payment path exists in any library file", () => {
    for (const [name, text] of library) {
      for (const [label, pattern] of FORBIDDEN_IN_LIBRARY) expect(pattern.test(text), `${name}: ${label}`).toBe(false);
    }
  });

  test("D23: only the recorder can write to disk", () => {
    for (const [name, text] of library) {
      if (name === "capture.ts") continue;
      expect(DISK_WRITES.test(text), `${name} touches the disk`).toBe(false);
    }
    expect(DISK_WRITES.test(library.get("capture.ts") ?? "")).toBe(true);
  });

  test("D23: credentials exist only in the authenticated transport (and in the canaries of the test fakes)", () => {
    for (const [name, text] of library) {
      if (name === "http.ts" || name === "fakes.ts") continue;
      expect(CREDENTIAL_WORDS.test(text), `${name} mentions a credential`).toBe(false);
    }
  });

  test("D23: the transport and the clients take their fetch, clock and waiting by injection", () => {
    const http = library.get("http.ts") ?? "";
    expect(http).toMatch(/readonly fetch: FetchLike/);
    expect(http).toMatch(/readonly now: \(\) => number/);
    expect(http).toMatch(/readonly sleep: \(ms: number\) => Promise<void>/);
    expect(http).toMatch(/fetch: FetchLike;\s+now: \(\) => number;\s+sleep: \(ms: number\) => Promise<void>;/);
    expect(library.get("public-okx.ts") ?? "").toMatch(/fetch: FetchLike;\s+now: \(\) => number;\s+sleep: \(ms: number\) => Promise<void>;/);
  });

  test("D23: the registry only holds read endpoints of the two documented families and every method is GET or POST of a read", () => {
    const registry = library.get("endpoints.ts") ?? "";
    const paths = [...registry.matchAll(/path: "([^"]+)"/g)].map((match) => match[1] as string);
    expect(paths.length).toBe(44);
    for (const path of paths) expect(/^\/api\/(?:v6\/(?:dex|defi)|v5\/(?:public|market))\//.test(path), path).toBe(true);
    expect(TRADE_AND_FUNDS_PATHS.test(paths.join("\n"))).toBe(false);
  });
});

describe("isolation: the CLI", () => {
  const mainAt = cli.indexOf("if (import.meta.main)");
  const beforeMain = cli.slice(0, mainAt);
  const inMain = cli.slice(mainAt);

  test("D23: the real environment, fetch, clock and output are only touched inside the import.meta.main block", () => {
    expect(mainAt).toBeGreaterThan(0);
    for (const [label, pattern] of [
      ["process.env", /process\.env/],
      ["global fetch", /(?<![.\w$])fetch\s*\(/],
      ["Date.now", /Date\.now/],
      ["setTimeout", /\bsetTimeout\b/],
      ["process.stdout", /process\.stdout/],
      ["process.stderr", /process\.stderr/],
      ["Bun.argv", /Bun\.argv/],
    ] as Array<[string, RegExp]>) {
      expect(pattern.test(beforeMain), label).toBe(false);
    }
    expect(/process\.env/.test(inMain)).toBe(true);
  });

  test("D23: the CLI has no direct disk access, signer, chain library, calldata, trade path or console output", () => {
    for (const [label, pattern] of [
      ...FORBIDDEN_IN_LIBRARY.filter(([label]) => !["process.env", "a call to the global fetch", "system clock or randomness", "per call payment"].includes(label)),
      ["disk", DISK_WRITES] as [string, RegExp],
    ]) {
      expect(pattern.test(beforeMain), `CLI: ${label}`).toBe(false);
    }
  });

  test("D23: the environment is never touched unless --credentials-from-env is given, and then only the three documented names", async () => {
    const touched: string[] = [];
    const env = new Proxy({} as Record<string, string | undefined>, {
      get: (_target, property) => {
        touched.push(String(property));
        return property === "OKX_WEB3_API_KEY" ? CANARY_KEY : property === "OKX_WEB3_API_SECRET" ? CANARY_SECRET : property === "OKX_WEB3_API_PASSPHRASE" ? CANARY_PASSPHRASE : undefined;
      },
      ownKeys: () => {
        touched.push("<ownKeys>");
        return [];
      },
      has: (_target, property) => {
        touched.push(`has:${String(property)}`);
        return false;
      },
    });
    const clock = makeClock(1_791_715_200_000);
    const fake = makeFakeFetch(() => ({ body: envelope([]) }), clock);
    const io = { env, stdout: () => undefined, stderr: () => undefined, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(makeMemoryFsState()) };
    await runCli(["--help"], io);
    await runCli(["plan"], io);
    await runCli(["plan", "--source", "onchainos", "--token", "WETH-USDC=1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"], io);
    await runCli(["run", "--source", "public-okx", "--out", "/mem/x", "--max-epochs", "1", "--kinds", "ticker", "--inst", "BTC-USDT-SWAP"], io);
    await runCli(["run", "--source", "public-okx", "--out", "/mem/x", "--max-epochs", "1", "--kinds", "ticker", "--inst", "BTC-USDT-SWAP", "--allow-network"], io);
    expect(touched).toEqual([]);
    await runCli(["run", "--source", "onchainos", "--out", "/mem/y", "--max-epochs", "1", "--allow-network", "--credentials-from-env", "--token", "WETH-USDC=1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"], io);
    expect(new Set(touched)).toEqual(new Set(["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE"]));
  });
});

describe("isolation: typography", () => {
  const FORBIDDEN_BYTES: Array<[string, number[]]> = [
    ["travessão", [0xe2, 0x80, 0x94]],
    ["meia-risca", [0xe2, 0x80, 0x93]],
    ["ponto mediano", [0xc2, 0xb7]],
    ["sinal de menos tipográfico", [0xe2, 0x88, 0x92]],
    ["marcador", [0xe2, 0x80, 0xa2]],
  ];

  function contains(bytes: Uint8Array, sequence: number[]): boolean {
    for (let index = 0; index + sequence.length <= bytes.length; index += 1) {
      if (sequence.every((value, offset) => bytes[index + offset] === value)) return true;
    }
    return false;
  }

  test("D24: no em dash, en dash, middle dot, typographic minus or bullet, at the byte level, in any file of this delivery", () => {
    const files = [
      ...readdirSync(directory).filter((name) => name.endsWith(".ts")).map((name) => join(directory, name)),
      join(root, "scripts", "onchainos-capture.ts"),
      join(root, "scripts", "onchainos-capture.test.ts"),
      join(root, "docs", "OKX-ONCHAINOS-DADOS-SPEC.md"),
    ];
    expect(files.length).toBeGreaterThan(30);
    for (const path of files) {
      const bytes = new Uint8Array(readFileSync(path));
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes), `${path} is not valid UTF-8`).not.toThrow();
      for (const [label, sequence] of FORBIDDEN_BYTES) expect(contains(bytes, sequence), `${path}: ${label}`).toBe(false);
    }
  });

  test("D24: none of the strings built at run time carries them either: fixtures, error messages, the summary", () => {
    const strings: string[] = [JSON.stringify(FIXTURES)];
    for (const kind of ERROR_KINDS) strings.push(new OnchainosError(kind, "falha de teste", { endpoint: "/api/v6/x", httpStatus: 402, apiCode: "1", attempts: 2, rowIndex: 3, providerMessage: "texto" }).message);
    for (const kind of ["malformed_record", "provider", "clock", "state_mismatch", "corrupt", "io", "deadline", "usage", "internal"] as const) strings.push(new CaptureError(kind, "mensagem").message);
    const report: CaptureReport = {
      schema: "onchainos-capture-report-v1",
      status: "stopped",
      source: "public-okx",
      epochMs: 60_000,
      epochsTarget: 3,
      epochsCommitted: 1,
      epochsWrittenThisRun: 1,
      records: { total: 2, byKind: { ticker: 1, candle: 1 } },
      writtenThisRun: { records: 2, byKind: { ticker: 1, candle: 1 } },
      firstT: 1,
      lastT: 2,
      skipped: [{ epochId: "e1", kind: "candle", inst: "A-B", reason: "motivo" }],
      notes: [{ epochId: "e1", note: "nota" }],
      stop: { kind: "clock", message: "relógio", epochId: "e2" },
      files: { data: "a", ledger: "b", manifest: "c" },
      notice: "aviso",
    };
    strings.push(...summarizePt(report), ...summarizePt({ ...report, status: "duration_limit", stop: null }), ...summarizePt({ ...report, status: "completed", stop: null, skipped: [], notes: [] }));
    for (const text of strings) {
      for (const [label, sequence] of FORBIDDEN_BYTES) expect(contains(new TextEncoder().encode(text), sequence), `${label} em "${text.slice(0, 60)}"`).toBe(false);
    }
  });
});
