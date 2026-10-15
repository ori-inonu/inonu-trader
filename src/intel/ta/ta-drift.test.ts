import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The web build cannot import from `src/`, so the technical analysis lives twice: `web/src/lib/desk/chart/{indicators,smc}.ts`
 * and `src/intel/ta/`. Both are tested against the same Python vectors; this test also keeps the shared code identical, so a fix
 * made on one side cannot be forgotten on the other. The backend copy may only ADD things after the web file's last line and
 * change the header comment.
 */
const root = join(import.meta.dir, "..", "..", "..");
const body = (file: string): string => {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return text.slice(text.indexOf("*/") + 2);
};

describe("web and backend copies of the chart analysis", () => {
  test("smc.ts has the same code", () => {
    expect(body(join(root, "src", "intel", "ta", "smc.ts"))).toBe(body(join(root, "web", "src", "lib", "desk", "chart", "smc.ts")));
  });
  test("indicators.ts has the web code as its prefix", () => {
    const web = body(join(root, "web", "src", "lib", "desk", "chart", "indicators.ts"));
    expect(body(join(root, "src", "intel", "ta", "indicators.ts")).startsWith(web)).toBe(true);
  });
});
