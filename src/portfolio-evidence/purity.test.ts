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
    expect([...text.matchAll(/\{ id: "[^"]+", method: "(GET|POST)"/g)].map((match) => match[1]).sort()).toEqual(["GET", "GET", "GET", "GET", "GET", "POST"]);
  });
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
