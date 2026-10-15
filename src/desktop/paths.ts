/**
 * Where the installed app keeps what it writes, and where it finds what it serves (T1.5, WIN-5).
 *
 * Inside a `bun build --compile` exe `import.meta.dir` is the virtual `B:\~BUN\root`, so nothing here (or in the code
 * the core composes) may be anchored on it. Writable data goes to `%LOCALAPPDATA%\InonuTrader`; the install folder is
 * read only. Entering the home with `chdir` makes the many cwd-relative defaults (`data/events.jsonl`, `data/...`) land
 * there without touching those modules.
 */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

export const APP_DIR_NAME = "InonuTrader";

export type Env = Readonly<Record<string, string | undefined>>;

export interface HomeLayout {
  readonly home: string;
  readonly data: string;
  readonly logs: string;
  readonly cache: string;
}

export function resolveHome(env: Env = process.env): string {
  const override = env.INONU_HOME;
  if (override !== undefined && override !== "") {
    if (!isAbsolute(override)) throw new Error("INONU_HOME must be an absolute path");
    return resolve(override);
  }
  const base = env.LOCALAPPDATA && env.LOCALAPPDATA !== "" ? env.LOCALAPPDATA : join(homedir(), "AppData", "Local");
  return join(base, APP_DIR_NAME);
}

export function layoutOf(home: string): HomeLayout {
  return { home, data: join(home, "data"), logs: join(home, "logs"), cache: join(home, "cache") };
}

export function prepareHome(layout: HomeLayout): void {
  for (const dir of [layout.home, layout.data, layout.logs, layout.cache]) mkdirSync(dir, { recursive: true });
}

/** True for the parent itself and for any real descendant (a sibling that shares a prefix is not inside). */
export function isInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/** Creates the home and makes it the working directory. Refuses a home that sits inside the install folder. */
export function enterHome(layout: HomeLayout, options: { installDir?: string; chdir?: (dir: string) => void } = {}): void {
  if (options.installDir !== undefined && isInside(layout.home, options.installDir)) {
    throw new Error("the data home must not be inside the install folder (it is read only)");
  }
  prepareHome(layout);
  (options.chdir ?? process.chdir.bind(process))(layout.home);
}

export interface WebDirInput {
  readonly compiled: boolean;
  readonly execPath: string;
  readonly env: Env;
  readonly repoRoot: string;
}

/** The folder with the static export: INONU_WEB_DIR, else `<exe folder>/web` when installed, else the repo's build output. */
export function resolveWebDir(input: WebDirInput): string {
  if (input.env.INONU_WEB_DIR) return resolve(input.env.INONU_WEB_DIR);
  if (input.compiled) return join(dirname(input.execPath), "web");
  return join(input.repoRoot, "web", "out-inonu");
}

/** True inside a compiled exe: the entry module lives on Bun's virtual file system. */
export function isCompiled(): boolean {
  return /^(?:[A-Za-z]:[\\/]~BUN|\/\$bunfs)/.test(import.meta.dir);
}
