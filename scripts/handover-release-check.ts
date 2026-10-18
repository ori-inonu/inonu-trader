/**
 * READ-ONLY check that a staged release directory is byte-identical to what was read earlier (P7 of the handover: "revalidate the receipt and
 * the hashes before registering the task", Codex 172). It hashes every file under the release and compares with a baseline in the
 * `sha256sum` format (`<hash> *<relative path>`). It never writes inside the release; --save writes a baseline OUTSIDE it.
 *
 *   bun --no-env-file run scripts/handover-release-check.ts --dir <release dir> --save <baseline.sha256>
 *   bun --no-env-file run scripts/handover-release-check.ts --dir <release dir> --verify <baseline.sha256>
 *
 * Exit 0 only when nothing is missing, extra or changed. The baseline taken by this tool proves "unchanged since I looked"; it is not the
 * Codex receipt (STAGED-RELEASE.json), which stays the authority for "equal to what was qualified".
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type Manifest = ReadonlyMap<string, string>;

export interface Difference {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly changed: readonly string[];
}

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Every regular file under `dir`, hashed, keyed by the relative path with forward slashes. Links are refused, never followed. */
export function hashTree(dir: string, read: (p: string) => Uint8Array = (p) => readFileSync(p)): Map<string, string> {
  const root = resolve(dir);
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`link_refused: ${relative(root, full)}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.set(relative(root, full).split(sep).join("/"), sha(read(full)));
    }
  };
  walk(root);
  return out;
}

export function formatManifest(m: Manifest): string {
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, hash]) => `${hash} *${path}`).join("\n") + "\n";
}

export function parseManifest(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const m = line.match(/^([0-9a-f]{64}) \*(.+)$/);
    if (m === null) throw new Error(`manifest_line_malformed: ${line.slice(0, 40)}`);
    if (out.has(m[2]!)) throw new Error(`manifest_duplicate: ${m[2]}`);
    out.set(m[2]!, m[1]!);
  }
  return out;
}

export function compareManifests(baseline: Manifest, current: Manifest): Difference {
  const missing = [...baseline.keys()].filter((p) => !current.has(p)).sort();
  const extra = [...current.keys()].filter((p) => !baseline.has(p)).sort();
  const changed = [...baseline].filter(([p, h]) => current.has(p) && current.get(p) !== h).map(([p]) => p).sort();
  return { missing, extra, changed };
}

export const identical = (d: Difference): boolean => d.missing.length === 0 && d.extra.length === 0 && d.changed.length === 0;

function argOf(name: string): string | null {
  const i = Bun.argv.indexOf(name);
  return i >= 0 ? (Bun.argv[i + 1] ?? null) : null;
}

async function main(): Promise<number> {
  const dir = argOf("--dir");
  const save = argOf("--save");
  const verify = argOf("--verify");
  if (dir === null || !isAbsolute(dir) || (save === null) === (verify === null)) {
    console.error("usage: --dir <absolute release dir> (--save <baseline> | --verify <baseline>)");
    return 2;
  }
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error("release dir not found");
    return 2;
  }
  const current = hashTree(dir);
  if (save !== null) {
    const rel = relative(resolve(dir), resolve(save));
    if (!isAbsolute(save) || (!rel.startsWith("..") && !isAbsolute(rel))) {
      console.error("--save must be an absolute path OUTSIDE the release dir");
      return 2;
    }
    await Bun.write(save, formatManifest(current));
    console.log(JSON.stringify({ mode: "save", files: current.size }));
    return 0;
  }
  const diff = compareManifests(parseManifest(readFileSync(verify!, "utf8")), current);
  console.log(JSON.stringify({ mode: "verify", ok: identical(diff), files: current.size, ...diff }, null, 2));
  return identical(diff) ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
