import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// C-A10. Next replaces only literal accesses of the form process.env.NEXT_PUBLIC_NAME in the browser bundle. The object
// process.env itself, a computed key and a destructuring are empty in the browser, so a panel that handed the whole
// object to a library (MultichainPanel did) silently lost every NEXT_PUBLIC_EVM_RPC_* override. This scan reads every
// source of the dashboard and accepts the environment in that one literal form only.

const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXTENSIONS = [".ts", ".tsx"];

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (EXTENSIONS.some((extension) => entry.endsWith(extension)) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}
const name = (path: string) => relative(SRC, path).split(sep).join("/");

/** The environment, in any form but the literal NEXT_PUBLIC access: the bare object, a bracket, a rest or an alias. */
const NOT_LITERAL = /process\s*\.\s*env\b(?!\s*\.\s*NEXT_PUBLIC_[A-Z0-9_]+\b)|process\s*\[|\bglobalThis\s*\.\s*process\b|\bimport\.meta\.env\b/;

describe("C-A10 the browser code reads the environment only as process.env.NEXT_PUBLIC_NAME", () => {
  test("no source of web/src hands on, indexes or aliases the environment", () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(80);
    const offending: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => { if (NOT_LITERAL.test(line)) offending.push(`${name(file)}:${index + 1}`); });
    }
    expect(offending).toEqual([]);
  });

  test("the multichain panel gets its RPC overrides from publicEvmRpcOverrides and never touches the environment itself", () => {
    const panel = readFileSync(join(SRC, "components", "MultichainPanel", "MultichainPanel.tsx"), "utf8");
    expect(panel.includes("process.env")).toBe(false);
    expect(panel).toContain("overrides: publicEvmRpcOverrides()");
  });

  test("the scan itself: it flags the forms that Next does not inline and accepts the literal ones", () => {
    for (const bad of [
      "const x = process.env as Record<string, string>;",
      "readMultichainBalances(a, f, { overrides: process.env })",
      "const { NEXT_PUBLIC_API_URL } = process.env;",
      "process.env[`NEXT_PUBLIC_EVM_RPC_${index}`]",
      "process.env['NEXT_PUBLIC_API_URL']",
      "const env = process . env;",
      "process['env'].NEXT_PUBLIC_API_URL",
      "globalThis.process.env.NEXT_PUBLIC_API_URL",
      "process.env.SECRET_KEY",
      "process.env.NEXT_PUBLIC",
    ]) expect(NOT_LITERAL.test(bad), bad).toBe(true);
    for (const good of [
      'const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";',
      "{ NEXT_PUBLIC_EVM_RPC_196: process.env.NEXT_PUBLIC_EVM_RPC_196 }",
      "rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL",
    ]) expect(NOT_LITERAL.test(good), good).toBe(false);
  });
});
