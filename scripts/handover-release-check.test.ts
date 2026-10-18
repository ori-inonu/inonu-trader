import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareManifests, formatManifest, hashTree, identical, parseManifest } from "./handover-release-check";

const roots: string[] = [];
const release = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "release-check-"));
  roots.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
};
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const FILES = { "app/InonuTrader.exe": "exe-bytes", "app/local-artifact.json": "{}", "launcher/src/local-host/main.ts": "// main", "launcher/qualification.bunfig.toml": "# empty\n" };

describe("hashTree", () => {
  test("hashes every regular file under the dir, keyed by a forward-slash relative path", () => {
    const m = hashTree(release(FILES));
    expect([...m.keys()].sort()).toEqual(Object.keys(FILES).sort());
    for (const h of m.values()) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  test("the hash is of the bytes, so the same content gives the same hash in two places", () => {
    expect(hashTree(release(FILES))).toEqual(hashTree(release(FILES)));
  });
});

describe("the manifest format", () => {
  test("a manifest round-trips through the sha256sum format, sorted", () => {
    const m = hashTree(release(FILES));
    const text = formatManifest(m);
    expect(parseManifest(text)).toEqual(m);
    expect(text.split("\n").filter(Boolean).map((l) => l.slice(66))).toEqual(Object.keys(FILES).sort());
  });
  test("a malformed or duplicated line is refused, never skipped", () => {
    expect(() => parseManifest("not a manifest line\n")).toThrow("manifest_line_malformed");
    const h = "a".repeat(64);
    expect(() => parseManifest(`${h} *x\n${h} *x\n`)).toThrow("manifest_duplicate");
  });
});

describe("compareManifests", () => {
  const base = hashTree(release(FILES));
  test("the same release is identical", () => {
    expect(identical(compareManifests(base, hashTree(release(FILES))))).toBe(true);
  });
  test("one byte changed in one file is reported as changed", () => {
    const d = compareManifests(base, hashTree(release({ ...FILES, "app/InonuTrader.exe": "exe-bytez" })));
    expect(d).toEqual({ missing: [], extra: [], changed: ["app/InonuTrader.exe"] });
    expect(identical(d)).toBe(false);
  });
  test("a removed file is missing and an added file is extra", () => {
    const { "launcher/qualification.bunfig.toml": _gone, ...rest } = FILES;
    const d = compareManifests(base, hashTree(release({ ...rest, "launcher/extra.ts": "// new" })));
    expect(d.missing).toEqual(["launcher/qualification.bunfig.toml"]);
    expect(d.extra).toEqual(["launcher/extra.ts"]);
    expect(d.changed).toEqual([]);
    expect(identical(d)).toBe(false);
  });
});
