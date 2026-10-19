/**
 * Picks the browser profile that carries the OKX Wallet extension and builds the command that opens the desk in an app
 * window of it (ADR-1, WIN-4). The extension is what gives the page `window.okxwallet`, so the window must be the
 * user's own Edge (or Chrome) profile, not an embedded WebView and not a fresh profile.
 *
 * Preference: a browser whose profile has the extension ENABLED (Edge before Chrome); otherwise Edge, then Chrome, with
 * `walletEnabled: false` so the Doctor can say the extension is missing. A folder under `Extensions` is not enough: a
 * disabled extension injects nothing, so the profile's preferences are read too. Nothing here modifies a profile.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { win32 } from "node:path";

export const OKX_WALLET_EXTENSION_ID = "mcohilncbfahbmgdjkbpemcciiolgcge";

export type BrowserKind = "edge" | "chrome";

export interface DetectedBrowser {
  readonly kind: BrowserKind;
  readonly exe: string;
  readonly userData: string;
  readonly profile: string;
  readonly walletEnabled: boolean;
}

export interface FsProbe {
  exists(path: string): boolean;
  list(dir: string): string[];
  read(path: string): string | null;
}

const realFs: FsProbe = {
  exists: (path) => existsSync(path),
  list: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  read: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
};

type Env = Readonly<Record<string, string | undefined>>;

/** True when the preferences list the extension with no disable reason (Chromium) and no `state: 0` (older builds). */
export function extensionEnabled(preferencesText: string | null, id: string): boolean {
  if (preferencesText === null) return false;
  let entry: { disable_reasons?: unknown; state?: unknown } | undefined;
  try {
    entry = (JSON.parse(preferencesText) as { extensions?: { settings?: Record<string, typeof entry> } }).extensions?.settings?.[id];
  } catch {
    return false;
  }
  if (!entry || typeof entry !== "object") return false;
  const reasons = entry.disable_reasons;
  if (Array.isArray(reasons) && reasons.length > 0) return false;
  if (typeof reasons === "number" && reasons > 0) return false;
  return entry.state !== 0;
}

export function profilesOf(userData: string, fs: FsProbe): string[] {
  return fs
    .list(userData)
    .filter((name) => /^(?:Default|Profile \d+)$/.test(name))
    .sort((a, b) => (a === "Default" ? -1 : b === "Default" ? 1 : a.localeCompare(b, "en", { numeric: true })));
}

function walletState(userData: string, profile: string, fs: FsProbe): { present: boolean; enabled: boolean } {
  const present = fs.exists(win32.join(userData, profile, "Extensions", OKX_WALLET_EXTENSION_ID));
  if (!present) return { present, enabled: false };
  const enabled = ["Secure Preferences", "Preferences"].some((file) => extensionEnabled(fs.read(win32.join(userData, profile, file)), OKX_WALLET_EXTENSION_ID));
  return { present, enabled };
}

function installs(env: Env): { kind: BrowserKind; exes: string[]; userData: string }[] {
  const local = env.LOCALAPPDATA ?? "";
  const pf = env.ProgramFiles ?? "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  return [
    { kind: "edge", exes: [win32.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"), win32.join(pf, "Microsoft", "Edge", "Application", "msedge.exe")], userData: win32.join(local, "Microsoft", "Edge", "User Data") },
    { kind: "chrome", exes: [win32.join(pf, "Google", "Chrome", "Application", "chrome.exe"), win32.join(pf86, "Google", "Chrome", "Application", "chrome.exe"), win32.join(local, "Google", "Chrome", "Application", "chrome.exe")], userData: win32.join(local, "Google", "Chrome", "User Data") },
  ];
}

export function pickBrowser(env: Env, fs: FsProbe = realFs): DetectedBrowser | null {
  const found: DetectedBrowser[] = [];
  for (const install of installs(env)) {
    const exe = install.exes.find((candidate) => fs.exists(candidate));
    if (!exe) continue;
    const profiles = profilesOf(install.userData, fs);
    const states = profiles.map((profile) => ({ profile, ...walletState(install.userData, profile, fs) }));
    const best = states.find((s) => s.enabled) ?? states.find((s) => s.present);
    found.push({ kind: install.kind, exe, userData: install.userData, profile: best?.profile ?? "Default", walletEnabled: best?.enabled ?? false });
  }
  return found.find((browser) => browser.walletEnabled) ?? found[0] ?? null;
}

/** An argument list, never a shell string: the origin and the profile name cannot be interpreted by a shell. */
export function buildLaunchCommand(browser: DetectedBrowser, origin: string): string[] {
  return [browser.exe, `--app=${origin.replace(/\/+$/, "")}/`, `--profile-directory=${browser.profile}`];
}

export function openApp(browser: DetectedBrowser, origin: string, spawn: (command: string[]) => { unref(): void } = (command) => Bun.spawn(command, { stdio: ["ignore", "ignore", "ignore"] })): void {
  spawn(buildLaunchCommand(browser, origin)).unref();
}
