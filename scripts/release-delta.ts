/**
 * What the working tree changed against a qualified manifest (sha256sum format, `<hash> *<path>`), split into what this session declared and what it did not. READ ONLY: it hashes files the manifest names, plus the
 * new files that are declared, writes nothing, calls no model and no network, and starts nothing. It exists so that the party that qualifies the next release sees the exact delta at once and sees the part nobody
 * declared, instead of finding it by a failed checksum. It qualifies nothing and promotes nothing: the manifest and the release stay with Codex and the owner. Exit 0 only when no file is missing and no change is undeclared.
 *
 *   bun --no-env-file run scripts/release-delta.ts <manifest.sha256> [--declared a.ts,b.ts] [--new c.ts,d.ts]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Delta {
  /** In the manifest and byte-identical. */
  readonly same: readonly string[];
  /** Changed and declared by this session. */
  readonly declaredChanges: readonly string[];
  /** Changed and nobody here declared it: another session's work, or a stale manifest. */
  readonly undeclaredChanges: readonly string[];
  /** Named by the manifest and absent from the tree. */
  readonly missing: readonly string[];
  /** Declared new files (not in the manifest) that exist. */
  readonly newPresent: readonly string[];
  /** Declared new files that do not exist. */
  readonly newAbsent: readonly string[];
}

export const parseManifest = (text: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (m) out.set(m[2]!.trim(), m[1]!);
  }
  return out;
};

/** `actual` maps a path to its hash, or null when the file is absent. */
export const classify = (manifest: ReadonlyMap<string, string>, actual: ReadonlyMap<string, string | null>, declared: readonly string[], declaredNew: readonly string[]): Delta => {
  const same: string[] = [];
  const declaredChanges: string[] = [];
  const undeclaredChanges: string[] = [];
  const missing: string[] = [];
  for (const [path, hash] of manifest) {
    const now = actual.get(path) ?? null;
    if (now === null) missing.push(path);
    else if (now === hash) same.push(path);
    else if (declared.includes(path)) declaredChanges.push(path);
    else undeclaredChanges.push(path);
  }
  const newPresent = declaredNew.filter((p) => (actual.get(p) ?? null) !== null);
  const newAbsent = declaredNew.filter((p) => (actual.get(p) ?? null) === null);
  return { same, declaredChanges, undeclaredChanges, missing, newPresent, newAbsent };
};

export const isReady = (d: Delta): boolean => d.missing.length === 0 && d.undeclaredChanges.length === 0 && d.newAbsent.length === 0;

/** Items 1 and 2 of the single qualification request (note 177J), plus the hot interval candidate (item 3, which has no decision from the owner). */
export const DECLARED_CHANGES: readonly string[] = ["src/agent/cycle.ts", "src/agent/cycle.test.ts", "src/agent/wire.ts", "src/agent/wire.test.ts", "src/agent/autopilot.ts"];
export const DECLARED_NEW: readonly string[] = [
  "src/agent/entry-cost.ts",
  "src/agent/entry-cost.test.ts",
  "src/agent/recording.ts",
  "src/agent/recording.test.ts",
  "src/agent/hot-pace.test.ts",
  "src/agent/shadow/variants.ts",
  "src/agent/shadow/variants.test.ts",
  "src/agent/shadow/outcomes.ts",
  "src/agent/shadow/outcomes.test.ts",
  "src/agent/shadow/sim-portfolio.ts",
  "src/agent/shadow/sim-portfolio.test.ts",
];

const hashFile = (root: string, path: string): string | null => {
  const full = join(root, path);
  return existsSync(full) ? createHash("sha256").update(readFileSync(full)).digest("hex") : null;
};

if (import.meta.main) {
  const [manifestPath, ...rest] = process.argv.slice(2);
  const list = (name: string, fallback: readonly string[]): readonly string[] => {
    const i = rest.indexOf(name);
    return i >= 0 && rest[i + 1] ? rest[i + 1]!.split(",").filter(Boolean) : fallback;
  };
  if (manifestPath === undefined) {
    console.error("uso: release-delta.ts <manifest.sha256> [--declared a,b] [--new c,d]");
    process.exit(2);
  }
  const root = resolve(import.meta.dir, "..");
  const manifest = parseManifest(readFileSync(resolve(manifestPath), "utf8"));
  const declared = list("--declared", DECLARED_CHANGES);
  const declaredNew = list("--new", DECLARED_NEW);
  const actual = new Map<string, string | null>();
  for (const path of [...manifest.keys(), ...declaredNew]) actual.set(path, hashFile(root, path));
  const delta = classify(manifest, actual, declared, declaredNew);
  console.log(JSON.stringify({ manifest: manifestPath, files: manifest.size, ready: isReady(delta), ...delta, same: delta.same.length }, null, 2));
  process.exit(isReady(delta) ? 0 : 1);
}
