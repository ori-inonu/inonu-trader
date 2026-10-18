import { describe, expect, test } from "bun:test";
import { classify, isReady, parseManifest } from "./release-delta";

const h = (c: string): string => c.repeat(64);

describe("the delta against a qualified manifest separates what was declared from what nobody declared", () => {
  test("a manifest line in sha256sum format is read with or without the binary star, and blank lines are ignored", () => {
    const m = parseManifest(`${h("a")} *src/a.ts\r\n\r\n${h("b")}  src/b.ts\n`);
    expect([...m.entries()]).toEqual([["src/a.ts", h("a")], ["src/b.ts", h("b")]]);
  });

  test("a changed file that was declared is a declared change, and one that was not is undeclared", () => {
    const manifest = new Map([["src/a.ts", h("a")], ["src/b.ts", h("b")], ["src/c.ts", h("c")]]);
    const actual = new Map<string, string | null>([["src/a.ts", h("1")], ["src/b.ts", h("2")], ["src/c.ts", h("c")]]);
    const d = classify(manifest, actual, ["src/a.ts"], []);
    expect([d.declaredChanges, d.undeclaredChanges, d.same]).toEqual([["src/a.ts"], ["src/b.ts"], ["src/c.ts"]]);
  });

  test("a file the manifest names and the tree lacks is missing, and a declared new file that is absent is reported", () => {
    const d = classify(new Map([["src/a.ts", h("a")]]), new Map<string, string | null>([["src/a.ts", null], ["src/n.ts", null], ["src/m.ts", h("m")]]), [], ["src/n.ts", "src/m.ts"]);
    expect([d.missing, d.newAbsent, d.newPresent]).toEqual([["src/a.ts"], ["src/n.ts"], ["src/m.ts"]]);
  });

  test("the delta is ready only when nothing is missing, nothing is undeclared and every declared new file exists", () => {
    const manifest = new Map([["src/a.ts", h("a")]]);
    const ok = classify(manifest, new Map<string, string | null>([["src/a.ts", h("1")]]), ["src/a.ts"], []);
    const bad = classify(manifest, new Map<string, string | null>([["src/a.ts", h("1")]]), [], []);
    expect([isReady(ok), isReady(bad)]).toEqual([true, false]);
  });
});
