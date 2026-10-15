/**
 * Builds the Windows installer of Inonu Trader (T1.9, WIN-10), one command, reproducible:
 *
 *   bun --no-env-file run scripts/build-desktop.ts [--skip-web] [--skip-installer] [--out dist/desktop]
 *
 * 1. the static desk: `next build` with INONU_EXPORT=1 and an empty API url, so the page talks to its own origin;
 * 2. the exe: `bun build --compile` of src/desktop/main.ts (no console, no .env or bunfig autoload from the data home);
 * 3. `<out>/app` = InonuTrader.exe + web/ + version.txt;
 * 4. the installer: makensis installer/inonu.nsi -> `<out>/InonuTrader-Setup-<version>.exe`;
 * 5. SHA-256 of the exe and the installer in `<out>/SHA256SUMS.txt`.
 *
 * The installer and the exe contain no credential: they are built from source and a static export only.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MAKENSIS_CANDIDATES = ["C:\\Program Files (x86)\\NSIS\\makensis.exe", "C:\\Program Files\\NSIS\\makensis.exe"];

/** The environment of the static desk build: same origin as the core, flagged as the installed app (secrets in the Windows vault). */
export const WEB_EXPORT_ENV = { INONU_EXPORT: "1", NEXT_PUBLIC_API_URL: "", NEXT_PUBLIC_JEV_READ_URL: "", NEXT_PUBLIC_INONU_APP: "1", INONU_EXPORT_DIR: "out-inonu" } as const;

/** `1.2.3` -> `1.2.3.0`: the four part version Windows resources need. */
export function windowsVersion(version: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version must be x.y.z, got "${version}"`);
  return `${version}.0`;
}

export interface CompileOptions {
  readonly entry: string;
  readonly outfile: string;
  readonly version: string;
  readonly icon?: string;
}

export function compileArgs(options: CompileOptions): string[] {
  return [
    "build",
    "--compile",
    "--target=bun-windows-x64",
    "--windows-hide-console",
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    "--windows-title=Inonu Trader",
    "--windows-publisher=Inonu",
    "--windows-description=Inonu Trader",
    `--windows-version=${windowsVersion(options.version)}`,
    ...(options.icon ? [`--windows-icon=${options.icon}`] : []),
    options.entry,
    "--outfile",
    options.outfile,
  ];
}

export interface MakensisOptions {
  readonly script: string;
  readonly version: string;
  readonly appDir: string;
  readonly outfile: string;
  readonly icon?: string;
}

export function makensisArgs(options: MakensisOptions): string[] {
  return ["/V2", `/DVERSION=${options.version}`, `/DAPPDIR=${options.appDir}`, `/DOUTFILE=${options.outfile}`, ...(options.icon ? [`/DICON=${options.icon}`] : []), options.script];
}

/** A cheap fingerprint of a folder: how many files and how many bytes. */
function fingerprint(dir: string): string {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files += 1;
    try {
      bytes += statSync(join(entry.parentPath, entry.name)).size;
    } catch {
      // a file that vanished between the listing and the stat: the next poll sees the new state
    }
  }
  return `${files}:${bytes}`;
}

/**
 * The Next export can still be flushing files when `next build` returns, so the folder is only trusted once index.html exists
 * and the number of files and bytes has not changed for several polls in a row.
 */
export async function waitForExport(dir: string, options: { readonly pollMs?: number; readonly stablePolls?: number; readonly timeoutMs?: number } = {}): Promise<void> {
  const pollMs = options.pollMs ?? 250;
  const stablePolls = options.stablePolls ?? 6;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let last = "";
  let stable = 0;
  while (Date.now() < deadline) {
    if (existsSync(join(dir, "index.html"))) {
      const now = fingerprint(dir);
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= stablePolls) return;
    }
    await Bun.sleep(pollMs);
  }
  throw new Error(`no static export at ${dir} (index.html missing or still changing); run without --skip-web`);
}

function run(label: string, command: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}): void {
  console.log(`\n== ${label}\n$ ${command.join(" ")}`);
  const result = Bun.spawnSync(command, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`${label} failed with exit code ${result.exitCode}`);
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function main() {
  const root = resolve(import.meta.dir, "..");
  const flags = new Set(Bun.argv.slice(2));
  const outArg = Bun.argv.indexOf("--out");
  const out = resolve(root, outArg >= 0 ? Bun.argv[outArg + 1]! : "dist/desktop");
  const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  const app = join(out, "app");
  const icon = join(root, "web", "src", "app", "favicon.ico");
  const setup = join(out, `InonuTrader-Setup-${version}.exe`);

  if (!flags.has("--skip-web")) {
    run("static desk (next export)", ["bun", "--no-env-file", "run", "--cwd", "web", "build"], {
      cwd: root,
      env: { ...WEB_EXPORT_ENV },
    });
  }
  const web = join(root, "web", "out-inonu");
  await waitForExport(web);

  rmSync(app, { recursive: true, force: true });
  mkdirSync(app, { recursive: true });
  run("exe (bun --compile)", ["bun", "--no-env-file", ...compileArgs({ entry: "src/desktop/main.ts", outfile: join(app, "InonuTrader.exe"), version, ...(existsSync(icon) ? { icon } : {}) })], { cwd: root });
  cpSync(web, join(app, "web"), { recursive: true });
  writeFileSync(join(app, "version.txt"), `${version}\n`);

  const sums: string[] = [`${sha256(join(app, "InonuTrader.exe"))}  app/InonuTrader.exe`];
  if (!flags.has("--skip-installer")) {
    const makensis = MAKENSIS_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!makensis) throw new Error("makensis.exe not found (NSIS 3 is required)");
    run("installer (NSIS)", [makensis, ...makensisArgs({ script: join(root, "installer", "inonu.nsi"), version, appDir: app, outfile: setup, ...(existsSync(icon) ? { icon } : {}) })], { cwd: root });
    sums.push(`${sha256(setup)}  ${setup.slice(out.length + 1)}`);
  }
  writeFileSync(join(out, "SHA256SUMS.txt"), sums.join("\n") + "\n");
  console.log(`\nbuilt ${version}\n${sums.join("\n")}`);
}

if (import.meta.main) await main();
