import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Project rule (CLAUDE.md): no middle dot, em dash or en dash in any rendered text.
 * Components, pages and libraries compose the text that the dashboard renders, so every source file under
 * web/src (except test files, which may carry the characters inside the regexes that forbid them) is scanned
 * byte by byte. The characters are written as escapes here so that this file does not contain them itself.
 */
const FORBIDDEN: ReadonlyArray<{ readonly name: string; readonly char: string }> = [
  { name: "middle dot", char: "·" },
  { name: "en dash", char: "–" },
  { name: "em dash", char: "—" },
];

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXTENSIONS = [".ts", ".tsx", ".css"];

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) found.push(...sources(path));
    else if (EXTENSIONS.some((extension) => entry.endsWith(extension)) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

describe("typography of the rendered text", () => {
  test("no source under web/src contains a middle dot, an en dash or an em dash", () => {
    const files = sources(ROOT);
    expect(files.length).toBeGreaterThan(40);
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const { name, char } of FORBIDDEN) if (line.includes(char)) violations.push(`${relative(ROOT, file).split(sep).join("/")}:${index + 1} ${name}`);
      });
    }
    expect(violations).toEqual([]);
  });

  test("the scan really sees the three characters", () => {
    const sample = ["a", "b", "c"].map((letter, index) => `${letter}${FORBIDDEN[index]!.char}`).join(" ");
    expect(FORBIDDEN.every(({ char }) => sample.includes(char))).toBe(true);
  });
});
