// DAT-1, AC-DAT-1, T10.1: nothing invented may reach the installed app. The desk of the installed app is the pages the core serves
// (the desk, Rastreador, Configuracoes, Diagnostico) and the core is what `src/desktop/main.ts` imports. This walks the import
// graph of each (relative and `@/` imports; packages are not followed) and fails if a fixture, a synthetic data set or a mock is
// reachable, by file name or by an identifier. The old observation console is not served by the installed app (T1.11), so its
// synthetic report is outside the graph. The scanner is itself tested on a small project built for the purpose, so a pass here
// cannot be a scanner that sees nothing. origin: synthetic_fixture, tests only.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const EXT = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", ".json"];
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const CODE = /\.(ts|tsx|js|jsx)$/;

/** Every module reachable from the entries through relative imports and, when `alias` is given, `@/` imports. */
export function reachable(entries: readonly string[], alias: string | null): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  const resolveImport = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/") && alias !== null) base = join(alias, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null;
    if (existsSync(base) && statSync(base).isFile()) return base;
    for (const extension of EXT) if (existsSync(base + extension) && statSync(base + extension).isFile()) return base + extension;
    return null;
  };
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!CODE.test(file)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = match[1] ?? match[2]!;
      if (/\.(css|svg|png|ico|webp)$/.test(spec)) continue;
      const target = resolveImport(file, spec);
      if (target !== null) stack.push(target);
    }
  }
  return seen;
}

const PATH_LEAK = /(^|\/)(fixtures?|test-fixtures|mocks?|__mocks__)\/|fixture|synthetic|mock|\.test\./i;
const TEXT_LEAKS: readonly RegExp[] = [/\bSYNTHETIC_[A-Z0-9_]+/g, /\bsyntheticReadings\b/g, /synthetic_fixture/g, /MODEL\s*=\s*mock/g];

/** What makes a reachable module a leak: its path, or an identifier in its code. */
export function leaks(files: ReadonlySet<string>, root: string): string[] {
  const found: string[] = [];
  for (const file of files) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    if (PATH_LEAK.test(rel)) found.push(`path: ${rel}`);
    if (!CODE.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const pattern of TEXT_LEAKS) {
      const hit = text.match(pattern);
      if (hit !== null) found.push(`text: ${rel}: ${[...new Set(hit)].join(", ")}`);
    }
  }
  return found;
}

describe("the scanner sees what it should", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const project = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), "inonu-purity-"));
    dirs.push(dir);
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), body);
    }
    return dir;
  };

  test("follows relative and alias imports, re-exports and dynamic imports, and not packages", () => {
    const dir = project({
      "app/page.tsx": `import { a } from "./a"; import b from "@/lib/b"; export * from "./re"; const c = import("./dyn"); import React from "react";`,
      "app/a.ts": "export const a = 1;",
      "lib/b.ts": "export default 2;",
      "app/re.ts": "export const r = 1;",
      "app/dyn.ts": "export const d = 1;",
      "app/unused.ts": "export const u = 1;",
    });
    const graph = reachable([join(dir, "app/page.tsx")], dir);
    const names = [...graph].map((f) => f.slice(dir.length + 1).replace(/\\/g, "/")).sort();
    expect(names).toEqual(["app/a.ts", "app/dyn.ts", "app/page.tsx", "app/re.ts", "lib/b.ts"]);
  });

  test("a fixture reached through two hops is found by its path, a synthetic constant by its name", () => {
    const dir = project({
      "app/page.tsx": `import { x } from "./mid";`,
      "app/mid.ts": `import { y } from "./data/chart-decisions-fixture"; export const x = y;`,
      "app/data/chart-decisions-fixture.ts": "export const y = 1;",
      "app/other.ts": "export const SYNTHETIC_REPORT = 1;",
    });
    const hits = leaks(reachable([join(dir, "app/page.tsx")], dir), dir);
    expect(hits).toEqual(["path: app/data/chart-decisions-fixture.ts"]);
    const withConstant = project({ "app/page.tsx": `import "./other"; export const z = 1;`, "app/other.ts": "export const SYNTHETIC_REPORT = 1;" });
    expect(leaks(reachable([join(withConstant, "app/page.tsx")], withConstant), withConstant)).toEqual(["text: app/other.ts: SYNTHETIC_REPORT"]);
  });

  test("a module that is not reached is not a leak, and a clean graph is clean", () => {
    const dir = project({ "app/page.tsx": `import "./a";`, "app/a.ts": "export const a = 1;", "app/mock-data.ts": "export const m = 1;" });
    expect(leaks(reachable([join(dir, "app/page.tsx")], dir), dir)).toEqual([]);
  });

  test("tests, mocks and synthetic readings are caught by name wherever they sit", () => {
    const dir = project({
      "app/page.tsx": `import "./a.test"; import "./mocks/x"; import "./syntheticReadings";`,
      "app/a.test.ts": "export {};",
      "app/mocks/x.ts": "export {};",
      "app/syntheticReadings.ts": "export {};",
    });
    expect(leaks(reachable([join(dir, "app/page.tsx")], dir), dir).sort()).toEqual(["path: app/a.test.ts", "path: app/mocks/x.ts", "path: app/syntheticReadings.ts", "text: app/page.tsx: syntheticReadings"]);
  });
});

describe("what the installed app can reach", () => {
  const WEB_SRC = resolve(import.meta.dir, "..");
  const CORE_SRC = resolve(import.meta.dir, "../../../src");

  test("the pages the core serves reach no fixture, no synthetic data and no mock (the old console is not served)", () => {
    const entries = ["app/layout.tsx", "app/page.tsx", "app/configuracoes/page.tsx"].map((p) => join(WEB_SRC, p));
    for (const entry of entries) expect(existsSync(entry)).toBe(true);
    const graph = reachable(entries, WEB_SRC);
    expect(graph.size).toBeGreaterThan(30); // a scanner that finds a handful of modules is not looking at the app
    expect(leaks(graph, WEB_SRC)).toEqual([]);
  });

  test("the core reaches none either, so no synthetic reading is ever served as if it were the market", () => {
    const graph = reachable([join(CORE_SRC, "desktop/main.ts")], null);
    expect(graph.size).toBeGreaterThan(40);
    expect(leaks(graph, CORE_SRC)).toEqual([]);
  });

  test("the app is the agent and its keys: no page of the desk, the tracker, the console or the diagnostic is left to serve", () => {
    for (const gone of ["mesa", "rastreador", "console", "doctor", "agente"]) expect(existsSync(join(WEB_SRC, "app", gone, "page.tsx"))).toBe(false);
  });

  test("the core does answer 404 for the console, so that leak is unreachable at run time (T1.11)", () => {
    const core = readFileSync(join(CORE_SRC, "desktop/core.ts"), "utf8");
    expect(core).toMatch(/RETIRED_ROUTES[^\n]*"\/console"/);
  });
});
