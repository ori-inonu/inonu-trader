import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseLocalArtifact, type LocalArtifact } from "./manifest";

/** Fingerprints the already built program and local static desk, without packaging data/.env/vault files. It does not run the program. */
export async function sealLocalArtifact(appDir: string): Promise<LocalArtifact> {
  const paths = ["InonuTrader.exe"];
  const webDir = join(appDir, "web");
  for (const entry of readdirSync(webDir, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("local_artifact_link");
    if (entry.isFile()) paths.push(relative(appDir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  }
  paths.sort();
  const files: { path: string; sha256: string }[] = [];
  for (const path of paths) files.push({ path, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(join(appDir, path)).arrayBuffer()).digest("hex") });
  const artifact = parseLocalArtifact({ version: 1, files });
  if (artifact === null) throw new Error("local_artifact_invalid");
  await Bun.write(join(appDir, "local-artifact.json"), JSON.stringify(artifact, null, 2) + "\n");
  return artifact;
}

if (import.meta.main) {
  const app = Bun.argv[2];
  if (!app) throw new Error("local_app_required");
  const artifact = await sealLocalArtifact(resolve(app));
  console.log(JSON.stringify({ sealed: true, files: artifact.files.length }));
}
