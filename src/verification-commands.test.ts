import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

// The child build wrapper contends for CPU with the rest of the suite; generous child and per test budgets.
const CHILD_TIMEOUT_MS = 45_000;
setDefaultTimeout(120_000);

const rootPackage = await Bun.file(new URL("../package.json", import.meta.url)).json();
const webPackage = await Bun.file(new URL("../web/package.json", import.meta.url)).json();

test("default backend verification includes source and maintained script regression tests", () => {
  expect(rootPackage.scripts.test).toBe("bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts");
});

test("default frontend verification discovers every library regression test", () => {
  expect(webPackage.scripts.test).toBe("bun --no-env-file test --parallel=1 --timeout 15000 ./src/lib");
});

test("every frontend test file sits inside the ./src/lib glob that the default frontend verification runs", () => {
  // The glob above is frozen, so a test written beside its component would silently never run in test:all.
  const lib = join(import.meta.dir, "..", "web", "src", "lib");
  const all: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== ".next") walk(path); }
      else if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) all.push(path);
    }
  };
  walk(join(import.meta.dir, "..", "web", "src"));
  expect(all.length).toBeGreaterThan(60);
  expect(all.filter((path) => relative(lib, path).startsWith("..")).map((path) => relative(join(import.meta.dir, ".."), path).replaceAll("\\", "/"))).toEqual([]);
});

test("aggregate verification includes both packages and the canonical production build", () => {
  expect(rootPackage.scripts["test:all"]).toBe("bun --no-env-file run test && bun --no-env-file run --cwd web test");
  expect(rootPackage.scripts["typecheck:all"]).toBe("bun --no-env-file run typecheck && bun --no-env-file run --cwd web typecheck");
  expect(rootPackage.scripts.build).toBe("bun --no-env-file run --cwd web build");
});

test("the root build wrapper really executes the child package instead of printing successful help", () => {
  const directory = mkdtempSync(join(tmpdir(), "inonu-verification-command-"));
  try {
    mkdirSync(join(directory, "web"));
    writeFileSync(join(directory, "web/package.json"), JSON.stringify({ scripts: { build: "bun --no-env-file print.ts" } }));
    writeFileSync(join(directory, "web/print.ts"), "console.log('VERIFIED_CHILD_BUILD');\n");
    const result = spawnSync(process.execPath, rootPackage.scripts.build.split(" ").slice(1), {
      cwd: directory, encoding: "utf8", timeout: CHILD_TIMEOUT_MS,
      env: { SystemRoot: process.env.SystemRoot, PATH: dirname(process.execPath) + delimiter + (process.env.PATH ?? "") },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("VERIFIED_CHILD_BUILD");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("root typechecking includes every maintained script without rewriting the base config", async () => {
  expect(rootPackage.scripts.typecheck).toBe("tsc --noEmit -p tsconfig.verification.json");
  const verification = await Bun.file(new URL("../tsconfig.verification.json", import.meta.url)).json();
  expect(verification.extends).toBe("./tsconfig.json");
  expect(verification.include).toEqual(["src", "scripts"]);
});
