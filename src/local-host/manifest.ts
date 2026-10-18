import { join } from "node:path";

export interface LocalArtifact {
  readonly version: 1;
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
}

const HEX = /^[a-f0-9]{64}$/;
const SAFE = /^(?:InonuTrader\.exe|web\/[A-Za-z0-9_./@%+()\[\]-]+)$/;

export function parseLocalArtifact(raw: unknown): LocalArtifact | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || Object.keys(o).length !== 2 || !Array.isArray(o.files) || o.files.length < 2 || o.files.length > 20_000) return null;
  const files: { path: string; sha256: string }[] = [];
  const seen = new Set<string>();
  for (const entry of o.files) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    if (Object.keys(e).length !== 2 || typeof e.path !== "string" || !SAFE.test(e.path) || e.path.split("/").some((part) => part === ".." || part === "." || part === "") || typeof e.sha256 !== "string" || !HEX.test(e.sha256) || seen.has(e.path.toLowerCase())) return null;
    seen.add(e.path.toLowerCase());
    files.push({ path: e.path, sha256: e.sha256 });
  }
  return seen.has("inonutrader.exe") && seen.has("web/index.html") ? { version: 1, files } : null;
}

/** Before each start, reject drift instead of starting the newest edited source after a crash. This is a local fingerprint, not a publisher signature. */
export async function verifyLocalArtifact(appDir: string, artifact: LocalArtifact, read: (path: string) => Promise<Uint8Array> = async (path) => new Uint8Array(await Bun.file(path).arrayBuffer())): Promise<void> {
  for (const file of artifact.files) {
    const bytes = await read(join(appDir, ...file.path.split("/")));
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (hash !== file.sha256) throw new Error("local_artifact_changed");
  }
}
