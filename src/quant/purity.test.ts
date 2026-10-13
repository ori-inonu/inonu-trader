import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-support.ts")
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));

/** Imports outside src/quant that are allowed, with the reason: both are pure arithmetic, read only here. */
const ALLOWED_EXTERNAL = new Set(["../policy/envelope", "../system-one/volatility"]);

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("src/quant stays pure (SPEC Q-08)", () => {
  test("there are production modules to scan", () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  test("imports are local or one of the two allowed pure modules", () => {
    for (const { file, text } of sources) {
      const specifiers = [...stripComments(text).matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const specifier of specifiers) {
        const local = specifier.startsWith("./");
        expect({ file, specifier, ok: local || ALLOWED_EXTERNAL.has(specifier) }).toEqual({ file, specifier, ok: true });
      }
    }
  });

  test("no I/O, clock, environment, randomness, network or model identifiers", () => {
    const forbidden: [string, RegExp][] = [
      ["fetch", /\bfetch\s*\(/],
      ["node:", /["']node:/],
      ["process", /\bprocess\./],
      ["Bun", /\bBun\./],
      ["Date.now", /\bDate\.now\b/],
      ["new Date", /\bnew Date\b/],
      ["Math.random", /\bMath\.random\b/],
      ["performance", /\bperformance\./],
      ["console", /\bconsole\./],
      ["setTimeout", /\bsetTimeout\b/],
      ["model sdk", /@ai-sdk|typesafe|experimental_evaluate/i],
      ["signer", /\b(signer|signTransaction|privateKey|ethers|viem)\b/i],
      ["executor", /\b(executeOrder|placeOrder|sendTransaction|operator)\b/],
    ];
    for (const { file, text } of sources) {
      const code = stripComments(text);
      for (const [name, pattern] of forbidden) expect({ file, name, hit: pattern.test(code) }).toEqual({ file, name, hit: false });
    }
  });

  test("rendered strings carry no middle dot, en dash or em dash", () => {
    for (const { file, text } of sources) {
      const code = stripComments(text);
      expect({ file, hit: new RegExp(`[${String.fromCharCode(0xb7, 0x2013, 0x2014)}]`).test(code) }).toEqual({ file, hit: false });
    }
  });
});
