// QLT-3, ASK-10, VER-6: the files of the Veredito, the glossary and the measurement panel (code and styles) may not animate, blink or
// pulse, may not call the assistant by the name of the model, and may not promise a result. The scan reads the real files; a
// small sample proves it can see what it looks for. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "..", "..");
const ROOTS = ["components/Veredito", "lib/veredito", "lib/glossario"];

function* files(path: string): Generator<string> {
  const full = join(SRC, path);
  for (const name of readdirSync(full)) {
    const child = join(full, name);
    if (statSync(child).isDirectory()) yield* files(join(path, name));
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield child;
  }
}
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

export const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["animation", /(^|[\s;{])animation(-[a-z-]+)?\s*:|@keyframes|\binfinite\b|\.animate\s*\(/],
  ["blink or pulse", /\b(blink|blinking|pulse|pulsing|piscar|pulsar)\b/i],
  ["the model's name as the assistant", /(?<!modelo: )\bJev\b(?!\))/],
  ["a promise", /\b(lucro garantido|ganho garantido|garantido|sem risco|certeza de)\b/i],
];
export const hits = (name: string, text: string): string[] => RULES.filter(([, re]) => re.test(strip(text))).map(([rule]) => `${name}: ${rule}`);

describe("the scanner sees what it should", () => {
  test("catches an animation, a blink, the model as the assistant and a promise; ignores comments", () => {
    expect(hits("a.css", ".x { animation: spin 1s infinite; }")).toContain("a.css: animation");
    expect(hits("a.tsx", "const c = 'pulse';")).toContain("a.tsx: blink or pulse");
    expect(hits("a.tsx", "<p>Jev decidiu</p>")).toContain("a.tsx: the model's name as the assistant");
    expect(hits("a.tsx", "<p>modelo: Jev (jev-latest)</p>")).toEqual([]);
    expect(hits("a.tsx", "<p>lucro garantido</p>")).toContain("a.tsx: a promise");
    expect(hits("a.ts", "// nothing here pulses or blinks\nconst a = 1;")).toEqual([]);
  });
});

describe("the files of the Veredito", () => {
  test("none animates, blinks, names the model as the assistant or promises", () => {
    const found: string[] = [];
    let scanned = 0;
    for (const root of ROOTS) {
      for (const file of files(root)) {
        scanned += 1;
        found.push(...hits(file.replace(SRC, ""), readFileSync(file, "utf8")));
      }
    }
    expect(scanned).toBeGreaterThan(8);
    expect(found).toEqual([]);
  });
});
