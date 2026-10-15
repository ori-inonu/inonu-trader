/**
 * Boundary tests for the module: it reads, it never writes to a wallet, it holds no secret, it does not schedule, and it
 * does not import code that can sign or trade. They scan the SOURCE of this directory (tests excluded) so a future change
 * that crosses a line fails here.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { FIXTURE_LABEL } from "./fixtures.ts";

const ROOT = import.meta.dir;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "test-support.ts" ? [path] : [];
  });
}

const FILES = sources(ROOT).map((path) => ({ rel: relative(ROOT, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));
/** The process boundary is the only file allowed to touch the environment, the global fetch, timers and the console. */
const BOUNDARY = "main.ts";

function importsOf(file: { text: string }): string[] {
  return [...file.text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!);
}

/** True when a relative specifier resolves to a file inside this module. */
function isInside(file: { rel: string }, specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(join(ROOT, file.rel)), specifier);
  return !relative(ROOT, target).startsWith("..");
}

/** Comments and string literals are kept: a forbidden word in a message would still be a smell, but comments may explain the rules. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const FORBIDDEN_EVERYWHERE: [string, RegExp][] = [
  ["ethers, viem or a Solana SDK", /from\s+["'](ethers|viem|@solana\/[^"']*|@noble\/[^"']*|bs58)["']/],
  ["signing or sending a transaction", /\b(signTransaction|signMessage|sendTransaction|sendRawTransaction|eth_sendRawTransaction|personal_sign|eth_sign|privateKey|OPERATOR_PRIVATE_KEY|mnemonic|seedPhrase)\b/],
  ["a trade, bridge, approval or transfer path", /\/dex\/aggregator|\/pre-transaction|\/cross-chain|\/defi\/transaction|\/api\/v5\/(?:trade|account|asset|users|finance|copytrading|broker)|\/security\/(?:approval|sign)/],
  ["a node network, process or vm module", /node:(http|https|http2|net|tls|dgram|dns|cluster|worker_threads|child_process|vm)\b/],
  ["a dynamic require or eval", /\brequire\s*\(|\beval\s*\(|new Function\s*\(/],
  ["a scheduler", /\b(setInterval|setImmediate|cron|crontab|CronCreate|ScheduleWakeup|queueMicrotask)\b/],
  ["the rules of another market", /\b(WIN|WDO|BRL|MON|USDC|USDT)\b/],
  ["a WebSocket or event source", /\bWebSocket\b|\bEventSource\b|\bXMLHttpRequest\b/],
  ["an HTTP server", /Bun\.serve|createServer\(/],
  ["a dynamic import", /\bimport\s*\(/],
  ["spawning a process", /\bBun\.(spawn|spawnSync|\$)(?![A-Za-z0-9_])|\bBun\s*\??\.?\s*\[|import\s*\{[^}]*(?:\$|spawn)[^}]*\}\s*from\s*["']bun["']|\{[^}]*\b(?:spawn|spawnSync|serve|listen|connect)\b[^}]*\}\s*=\s*Bun\b/],
  ["indexing the global object", /globalThis\s*\??\.?\s*\[/],
];

const FORBIDDEN_OUTSIDE_BOUNDARY: [string, RegExp][] = [
  ["process.env", /process\.env/],
  ["Bun.env", /Bun\.env/],
  ["import.meta.env", /import\.meta\.env/],
  ["dotenv", /dotenv/i],
  ["the global fetch", /(?<![.\w$])fetch\s*\(/],
  ["globalThis.fetch or Bun.fetch", /globalThis\s*\.\s*fetch|\bBun\.fetch\b/],
  ["a timer", /\bsetTimeout\b/],
  ["the console", /\bconsole\./],
  ["the global clock", /Date\.now\(|new Date\(\)/],
  ["a file API", /node:fs|Bun\.file|Bun\.write|readFileSync|writeFileSync/],
];

describe("the module cannot sign, trade, schedule or hold a secret", () => {
  test("it has the files it should", () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(FILES.some((file) => file.rel === BOUNDARY)).toBe(true);
  });

  for (const [label, pattern] of FORBIDDEN_EVERYWHERE) {
    test(`no file contains ${label}`, () => {
      const hits = FILES.filter((file) => pattern.test(code(file.text))).map((file) => file.rel);
      expect(hits).toEqual([]);
    });
  }

  for (const [label, pattern] of FORBIDDEN_OUTSIDE_BOUNDARY) {
    test(`only the process boundary may touch ${label}`, () => {
      const hits = FILES.filter((file) => file.rel !== BOUNDARY && pattern.test(code(file.text))).map((file) => file.rel);
      expect(hits).toEqual([]);
    });
  }

  test("no file imports a signer, an executor or a trade module", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      for (const specifier of importsOf(file)) {
        if (isInside(file, specifier)) continue;
        if (/operator|okx-wallet\/trade|solana-signer|pilot|\/market\.ts|\/trader\.ts|\/server\.ts/.test(specifier)) hits.push(`${file.rel} -> ${specifier}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("tests are the only files that import the data layer fakes (the canary credentials)", () => {
    expect(FILES.filter((file) => /onchainos\/fakes/.test(file.text)).map((file) => file.rel)).toEqual([]);
  });

  test("imports outside the module are limited to a short allowlist of read-only code", () => {
    const allowed = new Set([
      "../okx-wallet/chains.ts",
      "../onchainos/capture-types.ts",
      "../onchainos/errors.ts",
      "../onchainos/http.ts",
      "../onchainos/capture.ts",
      "../onchainos/paging.ts",
      "../onchainos/read.ts",
      "../onchainos/endpoints.ts",
      "../onchainos/values.ts",
      "node:crypto",
    ]);
    const outside: string[] = [];
    for (const file of FILES) {
      for (const specifier of importsOf(file)) {
        if (isInside(file, specifier)) continue;
        // Specifiers are written from the file's own directory; normalize adapters/ to the same names as the top level.
        const normalized = file.rel.startsWith("adapters/") ? specifier.replace("../../", "../") : specifier;
        if (!allowed.has(normalized)) outside.push(`${file.rel} -> ${specifier}`);
        if (normalized === "../onchainos/capture.ts") expect(file.rel).toBe(BOUNDARY);
      }
    }
    expect(outside).toEqual([]);
  });

  test("no number reaches the money path", () => {
    for (const name of ["decimal.ts", "balances.ts", "evidence.ts"]) {
      const text = code(FILES.find((file) => file.rel === name)!.text);
      // Math.max on integer scales is allowed; any rounding, power or conversion of a money value is not.
      expect(text).not.toMatch(/parseFloat|\.toFixed\(|\bNumber\(|Math\.(pow|round|floor|ceil|trunc|abs|log|exp|sqrt)/);
    }
  });

  test("the endpoint registry holds reads only", () => {
    const text = FILES.find((file) => file.rel === "adapters/okx-endpoints.ts")!.text;
    expect([...text.matchAll(/\{ id: "[^"]+", method: "(GET|POST)"/g)].map((match) => match[1]).sort()).toEqual(["GET", "GET", "GET", "GET", "GET", "GET", "GET", "GET", "POST"]);
  });
});

describe("the scanner itself is sensitive (a rule that matches nothing proves nothing)", () => {
  const SAMPLES: Record<string, string | string[]> = {
    "ethers, viem or a Solana SDK": 'import { Wallet } from "ethers";',
    "signing or sending a transaction": "await wallet.sendTransaction(tx);",
    "a trade, bridge, approval or transfer path": 'const p = "/api/v6/dex/aggregator/swap";',
    "a node network, process or vm module": 'import net from "node:net";',
    "a dynamic require or eval": "const m = require('x');",
    "a scheduler": "setInterval(poll, 1000);",
    "the rules of another market": "const pair = 'MON/USDC';",
    "a WebSocket or event source": "new WebSocket(url);",
    "an HTTP server": "Bun.serve({});",
    "a dynamic import": 'const m = await import("../operator/x.ts");',
    "spawning a process": ['Bun.spawn(["x"]);', "const out = Bun.$`ls`;", 'Bun["spawn"](["x"]);', "Bun?.['spawnSync'](x);", 'import { $ } from "bun";', 'import { spawn } from "bun";', "const { spawn } = Bun;", "const { serve, file } = Bun;"],
    "indexing the global object": ['globalThis["fetch"](url);', 'globalThis?.["fetch"](url);', "globalThis[name](url);"],
  };
  for (const [label, pattern] of FORBIDDEN_EVERYWHERE) {
    test(`${label}: every sample that crosses the line is flagged`, () => {
      const samples = SAMPLES[label];
      expect(samples).toBeDefined();
      for (const sample of Array.isArray(samples) ? samples : [samples!]) expect({ sample, flagged: pattern.test(code(sample)) }).toEqual({ sample, flagged: true });
    });
  }
  test("and harmless code is not flagged", () => {
    const harmless = ['const file = Bun.file("x");', "const { a, b } = obj;", 'import { test } from "bun:test";', "const t = globalThis.name;", "await import.meta.main;"];
    for (const sample of harmless) for (const [, pattern] of FORBIDDEN_EVERYWHERE) expect({ sample, flagged: pattern.test(code(sample)) }).toEqual({ sample, flagged: false });
  });
  const OUTSIDE_SAMPLES: Record<string, string> = {
    "process.env": "const k = process.env.KEY;",
    "Bun.env": "Bun.env.X",
    "import.meta.env": "import.meta.env.X",
    dotenv: 'import "dotenv/config";',
    "the global fetch": "await fetch(url);",
    "globalThis.fetch or Bun.fetch": "globalThis.fetch(url);",
    "a timer": "setTimeout(f, 1);",
    "the console": "console.log(x);",
    "the global clock": "const t = Date.now();",
    "a file API": 'import { readFileSync } from "node:fs";',
  };
  for (const [label, pattern] of FORBIDDEN_OUTSIDE_BOUNDARY) {
    test(`${label}: a sample that crosses the line is flagged`, () => {
      expect(OUTSIDE_SAMPLES[label]).toBeDefined();
      expect(pattern.test(code(OUTSIDE_SAMPLES[label]!))).toBe(true);
    });
  }
});

describe("fixtures are explicitly synthetic", () => {
  const fixtures = FILES.find((file) => file.rel === "fixtures.ts")!.text;

  test("the header says invented, and the label constant exists", () => {
    expect(fixtures).toMatch(/SYNTHETIC fixtures/);
    expect(fixtures).toMatch(/INVENTED/);
    expect(FIXTURE_LABEL).toContain("SINTETICO");
  });

  test("every hex address in the fixtures is a zero padded invented address", () => {
    const addresses = [...fixtures.matchAll(/0x[0-9a-fA-F]{40}/g)].map((match) => match[0]);
    expect(addresses.length).toBeGreaterThan(3);
    for (const address of addresses) expect(address).toMatch(/^0x0{25,}[0-9a-f]+$/);
  });

  test("no module of the library imports the fixtures except the demo (which labels them)", () => {
    const users = FILES.filter((file) => /from\s+["']\.\/fixtures\.ts["']/.test(file.text)).map((file) => file.rel).sort();
    expect(users).toEqual(["cli.ts", "demo.ts", "report.ts"]);
  });
});
