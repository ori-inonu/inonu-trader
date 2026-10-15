// T1.7 / WIN-4: open the desk in an app window of the browser profile that has the OKX Wallet extension enabled.
import { describe, expect, test } from "bun:test";
import { OKX_WALLET_EXTENSION_ID, buildLaunchCommand, extensionEnabled, pickBrowser, profilesOf, type FsProbe } from "./browser";

const ID = OKX_WALLET_EXTENSION_ID;
const ENV = { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local", "ProgramFiles(x86)": "C:\\Program Files (x86)", ProgramFiles: "C:\\Program Files" };
const EDGE_EXE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const EDGE_DATA = "C:\\Users\\u\\AppData\\Local\\Microsoft\\Edge\\User Data";
const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_DATA = "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\User Data";

const enabledPrefs = JSON.stringify({ extensions: { settings: { [ID]: { disable_reasons: [], location: 1 } } } });

/** An in-memory file system: `files` maps a path to its text; directories are implied by the paths. */
function fakeFs(files: Record<string, string>): FsProbe {
  const norm = (p: string) => p.replaceAll("/", "\\").replace(/\\+$/, "");
  const all = Object.keys(files).map(norm);
  return {
    exists: (path) => all.some((f) => f === norm(path) || f.startsWith(norm(path) + "\\")),
    list: (dir) => [...new Set(all.filter((f) => f.startsWith(norm(dir) + "\\")).map((f) => f.slice(norm(dir).length + 1).split("\\")[0]!))],
    read: (path) => files[Object.keys(files).find((f) => norm(f) === norm(path)) ?? ""] ?? null,
  };
}

const wallet = (userData: string, profile: string) => ({
  [`${userData}\\${profile}\\Extensions\\${ID}\\4.18.1_0\\manifest.json`]: "{}",
  [`${userData}\\${profile}\\Secure Preferences`]: enabledPrefs,
});

describe("extensionEnabled", () => {
  test("an entry with no disable reasons is enabled", () => {
    expect(extensionEnabled(enabledPrefs, ID)).toBe(true);
  });

  test("a disabled, absent or unreadable entry is not", () => {
    const withReasons = JSON.stringify({ extensions: { settings: { [ID]: { disable_reasons: [1] } } } });
    const numeric = JSON.stringify({ extensions: { settings: { [ID]: { disable_reasons: 4 } } } });
    const oldState = JSON.stringify({ extensions: { settings: { [ID]: { state: 0 } } } });
    expect(extensionEnabled(withReasons, ID)).toBe(false);
    expect(extensionEnabled(numeric, ID)).toBe(false);
    expect(extensionEnabled(oldState, ID)).toBe(false);
    expect(extensionEnabled(JSON.stringify({ extensions: { settings: {} } }), ID)).toBe(false);
    expect(extensionEnabled("not json", ID)).toBe(false);
    expect(extensionEnabled(null, ID)).toBe(false);
  });
});

describe("profilesOf", () => {
  test("only Default and Profile N count", () => {
    const fs = fakeFs({
      [`${EDGE_DATA}\\Default\\Preferences`]: "{}",
      [`${EDGE_DATA}\\Profile 2\\Preferences`]: "{}",
      [`${EDGE_DATA}\\System Profile\\Preferences`]: "{}",
      [`${EDGE_DATA}\\Guest Profile\\Preferences`]: "{}",
      [`${EDGE_DATA}\\Crashpad\\x`]: "",
    });
    expect(profilesOf(EDGE_DATA, fs).sort()).toEqual(["Default", "Profile 2"]);
  });
});

describe("pickBrowser", () => {
  test("Edge profile that has the wallet enabled", () => {
    const picked = pickBrowser(ENV, fakeFs({ [EDGE_EXE]: "", ...wallet(EDGE_DATA, "Default") }));
    expect(picked).toMatchObject({ kind: "edge", exe: EDGE_EXE, profile: "Default", walletEnabled: true });
  });

  test("the wallet may live in another profile", () => {
    const picked = pickBrowser(ENV, fakeFs({ [EDGE_EXE]: "", [`${EDGE_DATA}\\Default\\Preferences`]: "{}", ...wallet(EDGE_DATA, "Profile 2") }));
    expect(picked).toMatchObject({ kind: "edge", profile: "Profile 2", walletEnabled: true });
  });

  test("a browser WITH the wallet beats Edge without it", () => {
    const picked = pickBrowser(ENV, fakeFs({ [EDGE_EXE]: "", [`${EDGE_DATA}\\Default\\Preferences`]: "{}", [CHROME_EXE]: "", ...wallet(CHROME_DATA, "Default") }));
    expect(picked).toMatchObject({ kind: "chrome", exe: CHROME_EXE, profile: "Default", walletEnabled: true });
  });

  test("Edge is preferred when both have the wallet", () => {
    const picked = pickBrowser(ENV, fakeFs({ [EDGE_EXE]: "", [CHROME_EXE]: "", ...wallet(EDGE_DATA, "Default"), ...wallet(CHROME_DATA, "Default") }));
    expect(picked?.kind).toBe("edge");
  });

  test("a disabled wallet does not count", () => {
    const disabled = JSON.stringify({ extensions: { settings: { [ID]: { disable_reasons: [1] } } } });
    const picked = pickBrowser(ENV, fakeFs({ [EDGE_EXE]: "", [`${EDGE_DATA}\\Default\\Extensions\\${ID}\\1\\manifest.json`]: "{}", [`${EDGE_DATA}\\Default\\Secure Preferences`]: disabled }));
    expect(picked).toMatchObject({ kind: "edge", profile: "Default", walletEnabled: false });
  });

  test("with no wallet anywhere it still opens Edge's Default profile and says the wallet is missing", () => {
    const picked = pickBrowser(ENV, fakeFs({ [EDGE_EXE]: "", [`${EDGE_DATA}\\Default\\Preferences`]: "{}" }));
    expect(picked).toMatchObject({ kind: "edge", profile: "Default", walletEnabled: false });
  });

  test("falls back to the 64 bit Program Files and to a per-user Chrome", () => {
    const edge64 = "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
    expect(pickBrowser(ENV, fakeFs({ [edge64]: "" }))?.exe).toBe(edge64);
    const chromeUser = "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
    expect(pickBrowser(ENV, fakeFs({ [chromeUser]: "", ...wallet(CHROME_DATA, "Default") }))?.exe).toBe(chromeUser);
  });

  test("no supported browser is null", () => {
    expect(pickBrowser(ENV, fakeFs({}))).toBeNull();
  });
});

describe("buildLaunchCommand", () => {
  test("an argument list (never a shell string) with the app window and the profile", () => {
    const command = buildLaunchCommand({ kind: "edge", exe: EDGE_EXE, userData: EDGE_DATA, profile: "Profile 2", walletEnabled: true }, "http://127.0.0.1:47321");
    expect(command).toEqual([EDGE_EXE, "--app=http://127.0.0.1:47321/", "--profile-directory=Profile 2"]);
  });
});
