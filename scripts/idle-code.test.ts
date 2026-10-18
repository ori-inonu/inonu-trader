import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { importsOf, pathLiterals, reachable, resolveRef } from "./idle-code";

const ROOT = resolve(import.meta.dir, "..");
const at = (p: string) => resolve(ROOT, p);

describe("idle-code", () => {
  test("importsOf segue importação estática, import() e require() relativos, e ignora pacotes", () => {
    const text = `import a from "./a"; import { b } from "../b.ts"; import c from "bun:test"; const d = await import("./d"); const e = require("./e"); export * from "./f";`;
    expect(importsOf(text).sort()).toEqual(["../b.ts", "./a", "./d", "./e", "./f"]);
  });

  test("caminho .ts em texto vale como referência: é como o launcher lança o processo do núcleo", () => {
    const text = `const entry = "src/local-host/core-entry.ts"; spawn(["bun", "run", entry]); const rel = "./runner.ts";`;
    expect(pathLiterals(text)).toEqual(["src/local-host/core-entry.ts", "./runner.ts"]);
    expect(importsOf(text).sort()).toEqual(["./runner.ts", "src/local-host/core-entry.ts"]);
  });

  test("resolveRef tenta o arquivo, .ts e index.ts, a partir do arquivo e da raiz", () => {
    const files = new Set([at("src/x/a.ts"), at("src/x/dir/index.ts"), at("src/local-host/core-entry.ts")]);
    const exists = (p: string) => files.has(p);
    expect(resolveRef(at("src/x/main.ts"), "./a", exists)).toBe(at("src/x/a.ts"));
    expect(resolveRef(at("src/x/main.ts"), "./dir", exists)).toBe(at("src/x/dir/index.ts"));
    expect(resolveRef(at("src/x/main.ts"), "src/local-host/core-entry.ts", exists)).toBe(at("src/local-host/core-entry.ts"));
    expect(resolveRef(at("src/x/main.ts"), "./nao-existe", exists)).toBeNull();
  });

  test("reachable segue a cadeia inteira e deixa de fora o que ninguém referencia", () => {
    const graph: Record<string, string> = {
      [at("src/entry.ts")]: `import "./a"; const spawned = "src/spawned.ts";`,
      [at("src/a.ts")]: `import { b } from "./b";`,
      [at("src/b.ts")]: ``,
      [at("src/spawned.ts")]: `import "./c";`,
      [at("src/c.ts")]: ``,
      [at("src/orphan.ts")]: `import "./b";`,
    };
    const live = reachable([at("src/entry.ts")], (f) => graph[f] ?? "", (p) => p in graph);
    expect([...live].sort()).toEqual([at("src/a.ts"), at("src/b.ts"), at("src/c.ts"), at("src/entry.ts"), at("src/spawned.ts")]);
    expect(live.has(at("src/orphan.ts"))).toBe(false);
  });

  test("ciclo de importação não trava a busca", () => {
    const graph: Record<string, string> = { [at("src/a.ts")]: `import "./b";`, [at("src/b.ts")]: `import "./a";` };
    expect(reachable([at("src/a.ts")], (f) => graph[f] ?? "", (p) => p in graph).size).toBe(2);
  });
});
