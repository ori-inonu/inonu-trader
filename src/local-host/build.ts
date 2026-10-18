import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { compileArgs, waitForExport, WEB_EXPORT_ENV } from "../../scripts/build-desktop";
import { absoluteArg } from "./args";
import { sealLocalArtifact } from "./seal";
import { verifyLocalArtifact } from "./manifest";

/** Every package lives in a new directory. Never replace an executable that may be managing a wallet. */
export function requireNewPackage(out: string): void {
  if (existsSync(out)) throw new Error("local_package_already_exists");
}

function run(command: string[], root: string, env: Record<string, string | undefined> = {}): void {
  const result = Bun.spawnSync(command, { cwd: root, env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error("local_build_failed");
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "..", "..");
  const args = Bun.argv.slice(2);
  const out = absoluteArg(args, "--out");
  if (out === null) throw new Error("local_package_output_required");
  requireNewPackage(out);
  const exportName = `out-inonu-local-${new Bun.CryptoHasher("sha256").update(out).digest("hex").slice(0, 12)}`;
  const skipWeb = args.includes("--skip-web");
  const suppliedWeb = absoluteArg(args, "--web");
  if (skipWeb && suppliedWeb === null) throw new Error("local_web_required");
  const web = skipWeb ? suppliedWeb! : join(root, "web", exportName);
  if (!skipWeb) {
    requireNewPackage(web);
    run([process.execPath, "--no-env-file", "run", "--cwd", "web", "build"], root,
      { ...WEB_EXPORT_ENV, INONU_EXPORT_DIR: exportName, NEXT_PUBLIC_INONU_CLOUD: "", NEXT_TELEMETRY_DISABLED: "1" });
  }
  await waitForExport(web);
  if (readdirSync(web, { recursive: true, withFileTypes: true }).some(e => e.isSymbolicLink())) throw new Error("local_web_link");
  const version = (await Bun.file(join(root, "package.json")).json()).version as string;
  const app = join(out, "app");
  // mkdir without recursive also catches another builder claiming this exact output during the web build.
  mkdirSync(out);
  mkdirSync(app);
  const icon = join(root, "web", "src", "app", "favicon.ico");
  run([process.execPath, "--no-env-file", ...compileArgs({ entry: "src/local-host/core-entry.ts", outfile: join(app, "InonuTrader.exe"), version,
    ...(existsSync(icon) ? { icon } : {}) })], root);
  cpSync(web, join(app, "web"), { recursive: true, errorOnExist: true, force: false });
  const artifact = await sealLocalArtifact(app);
  await verifyLocalArtifact(app, artifact);
  await Bun.write(join(out, "build.json"), JSON.stringify({ version, entry: "src/local-host/core-entry.ts", files: artifact.files.length,
    exeSha256: artifact.files.find(f => f.path === "InonuTrader.exe")!.sha256 }, null, 2) + "\n");
  console.log(JSON.stringify({ built: true, entry: "src/local-host/core-entry.ts", files: artifact.files.length }));
}

if (import.meta.main) await main();
