import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Static guarantees of the offline evaluator: it cannot reach the network, the environment, the
// clock, a signer or any live-execution module, and money paths contain no binary floating point.

const moduleDirectory = fileURLToPath(new URL("./", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const names = readdirSync(moduleDirectory).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort();
const sources = new Map(names.map((name) => [name, readFileSync(join(moduleDirectory, name), "utf8")] as const));
const cliPath = join(repositoryRoot, "scripts", "okx-derivatives.ts");
const cli = readFileSync(cliPath, "utf8");
const everything = new Map<string, string>([...[...sources].map(([name, text]) => [`src/okx-derivatives/${name}`, text] as const), ["scripts/okx-derivatives.ts", cli]]);

function specifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:^|[\n;])\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g)) found.push(match[1] as string);
  for (const match of text.matchAll(/(?:^|[\n;])\s*import\s+["']([^"']+)["']/g)) found.push(match[1] as string);
  return found;
}

test("OKX-DERIV D16: the module has the expected files and nothing unexpected", () => {
  expect(names).toEqual([
    "adapter.ts", "book.ts", "canonical.ts", "carry.ts", "contract.ts", "decimal.ts", "directional.ts", "fees.ts", "fixture.ts", "freshness.ts",
    "funding.ts", "gate.ts", "legs.ts", "local-file.ts", "margin.ts", "report.ts", "snapshot.ts", "types.ts",
  ]);
});

test("OKX-DERIV D16: every import is a sibling module or one of two Node built-ins, each in exactly one file", () => {
  const builtIns: Record<string, string[]> = { "canonical.ts": ["node:crypto"], "local-file.ts": ["node:fs"] };
  let checked = 0;
  for (const [name, text] of sources) {
    for (const specifier of specifiers(text)) {
      checked += 1;
      const sibling = /^\.\/([a-z-]+\.ts)$/.exec(specifier);
      const allowed = sibling !== null ? names.includes(sibling[1] as string) : (builtIns[name] ?? []).includes(specifier);
      expect(allowed, `${name} imports ${specifier}`).toBe(true);
    }
  }
  expect(checked).toBeGreaterThan(40);
  for (const specifier of specifiers(cli)) {
    const target = /^\.\.\/src\/okx-derivatives\/([a-z-]+\.ts)$/.exec(specifier);
    expect(target !== null && names.includes(target[1] as string), `the CLI imports ${specifier}`).toBe(true);
  }
  expect(specifiers(cli).length).toBeGreaterThanOrEqual(5);
});

test("OKX-DERIV D16: no network client, socket, process spawn, dynamic code, environment or credential access exists in the code", () => {
  const forbidden: Array<[string, RegExp]> = [
    ["fetch call", /\bfetch\s*\(/], ["XMLHttpRequest", /\bXMLHttpRequest\b/], ["WebSocket", /\bWebSocket\b/], ["EventSource", /\bEventSource\b/],
    ["Bun network or spawn", /\bBun\.(serve|connect|listen|udpSocket|spawn|spawnSync|fetch|\$)\b/], ["Node network or process module", /node:(http|https|http2|net|tls|dgram|dns|cluster|worker_threads|child_process|vm)\b/],
    ["require", /\brequire\s*\(/], ["dynamic import", /\bimport\s*\(/], ["eval", /\beval\s*\(/], ["Function constructor", /\bnew Function\b/],
    ["process.env", /process\.env/], ["Bun.env", /Bun\.env/], ["import.meta.env", /import\.meta\.env/], ["dotenv", /dotenv/i],
    ["credential words", /apiKey|api_key|secretKey|secret_key|passphrase|privateKey|private_key|mnemonic|OK-ACCESS|x-simulated-trading/i],
    ["authenticated or trading OKX routes", /\/api\/v5\/(trade|account|asset|users)\b/],
  ];
  for (const [name, text] of everything) {
    for (const [label, pattern] of forbidden) expect(pattern.test(text), `${name}: ${label}`).toBe(false);
  }
});

test("OKX-DERIV D16: the library never reads the clock or randomness; only the CLI chooses the clock", () => {
  const clock = /Date\.now|new Date\b|performance\.now|Math\.random|crypto\.randomUUID|getRandomValues/;
  for (const [name, text] of sources) expect(clock.test(text), name).toBe(false);
  expect(/Date\.now\(\)/.test(cli)).toBe(true);
});

test("OKX-DERIV D1: money and ratio paths use no binary floating point", () => {
  const moneyPaths = ["book.ts", "carry.ts", "contract.ts", "directional.ts", "fees.ts", "freshness.ts", "funding.ts", "gate.ts", "legs.ts", "margin.ts", "report.ts", "snapshot.ts"];
  const floating = /\bparseFloat\b|\bparseInt\b|\btoFixed\b|\btoPrecision\b|\bMath\.|\bNumber\(|\*\*\s*0\.|\bunary\s*\+/;
  for (const name of moneyPaths) expect(floating.test(sources.get(name) ?? ""), name).toBe(false);
  // the only conversions of an exact integer into a JSON number go through safeNumber in decimal.ts
  expect((sources.get("decimal.ts") ?? "").match(/\bNumber\(/g)?.length).toBe(1);
  expect((sources.get("report.ts") ?? "").includes("safeNumber")).toBe(true);
  // decimal literals such as 0.5 or 1.05 do not appear in the code of the money paths
  for (const name of moneyPaths) {
    const withoutStrings = (sources.get(name) ?? "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    expect(/(?<![\w.])\d+\.\d+(?![\w.])/.test(withoutStrings), `${name} has a decimal literal`).toBe(false);
  }
});

test("OKX-DERIV D17: no em dash, en dash or middle dot appears in any file of this delivery", () => {
  const files = [
    ...[...everything.keys()].map((name) => join(repositoryRoot, name)),
    ...names.map((name) => join(moduleDirectory, name.replace(/\.ts$/, ".test.ts"))).filter((path) => {
      try { readFileSync(path); return true; } catch { return false; }
    }),
    join(repositoryRoot, "scripts", "okx-derivatives.test.ts"),
    join(repositoryRoot, "docs", "OKX-DERIVATIVES-SPEC.md"),
    join(repositoryRoot, "docs", "okx-derivatives-v1", "GUIA.md"),
  ];
  expect(files.length).toBeGreaterThan(30);
  // built from char codes so that this file does not contain the characters it forbids
  const typography = new RegExp(`[${String.fromCharCode(0x2014, 0x2013, 0x00b7)}]`);
  for (const path of files) {
    expect(typography.test(readFileSync(path, "utf8")), path).toBe(false);
  }
});
