// T1.5 / WIN-5: every writable file of the installed app lives under %LOCALAPPDATA%\InonuTrader, never in the install
// folder and never in the repository; paths anchored on import.meta.dir (virtual B:\~BUN\root inside the exe) are not used.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { APP_DIR_NAME, enterHome, isInside, layoutOf, prepareHome, resolveHome, resolveWebDir } from "./paths";

const temp: string[] = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-paths-"));
  temp.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveHome", () => {
  test("defaults to %LOCALAPPDATA%\\InonuTrader", () => {
    const base = tmp();
    expect(resolveHome({ LOCALAPPDATA: base })).toBe(join(base, APP_DIR_NAME));
    expect(APP_DIR_NAME).toBe("InonuTrader");
  });

  test("falls back to the profile's AppData\\Local when LOCALAPPDATA is not set", () => {
    expect(resolveHome({})).toBe(join(homedir(), "AppData", "Local", APP_DIR_NAME));
  });

  test("INONU_HOME overrides, but only an absolute path", () => {
    const dir = tmp();
    expect(resolveHome({ INONU_HOME: dir, LOCALAPPDATA: "ignored" })).toBe(resolve(dir));
    expect(() => resolveHome({ INONU_HOME: "relative/dir" })).toThrow(/absolute/);
  });
});

describe("layout and preparation", () => {
  test("data, logs and cache live under the home", () => {
    const home = join(tmp(), APP_DIR_NAME);
    const layout = layoutOf(home);
    expect(layout).toEqual({ home, data: join(home, "data"), logs: join(home, "logs"), cache: join(home, "cache") });
  });

  test("prepareHome creates the folders, is idempotent and keeps what is already there", () => {
    const home = join(tmp(), APP_DIR_NAME);
    const layout = layoutOf(home);
    prepareHome(layout);
    writeFileSync(join(layout.data, "keep.txt"), "kept");
    prepareHome(layout);
    expect(readFileSync(join(layout.data, "keep.txt"), "utf8")).toBe("kept");
    expect(readdirSync(home).sort()).toEqual(["cache", "data", "logs"]);
  });

  test("enterHome makes cwd-relative paths such as data/events.jsonl land in the home", () => {
    const home = join(tmp(), APP_DIR_NAME);
    const layout = layoutOf(home);
    const before = process.cwd();
    try {
      enterHome(layout);
      writeFileSync("data/events.jsonl", "x");
      expect(existsSync(join(layout.data, "events.jsonl"))).toBe(true);
      expect(process.cwd()).toBe(layout.home);
    } finally {
      process.chdir(before);
    }
  });

  test("a home inside the install folder is a configuration error", () => {
    const install = tmp();
    expect(() => enterHome(layoutOf(join(install, "data-home")), { installDir: install })).toThrow(/install folder/);
  });
});

describe("isInside", () => {
  test("is true only for real descendants", () => {
    const root = tmp();
    expect(isInside(join(root, "a", "b"), root)).toBe(true);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(`${root}-sibling`, root)).toBe(false);
    expect(isInside(join(root, "..", "x"), root)).toBe(false);
  });
});

describe("resolveWebDir", () => {
  test("the installed exe serves the web folder next to it", () => {
    expect(resolveWebDir({ compiled: true, execPath: join("C:", "Apps", "Inonu", "InonuTrader.exe"), env: {}, repoRoot: "unused" })).toBe(join("C:", "Apps", "Inonu", "web"));
  });

  test("INONU_WEB_DIR wins", () => {
    const dir = tmp();
    expect(resolveWebDir({ compiled: true, execPath: "x", env: { INONU_WEB_DIR: dir }, repoRoot: "y" })).toBe(resolve(dir));
  });

  test("from source it is the export the build wrote in the repo", () => {
    expect(resolveWebDir({ compiled: false, execPath: "bun", env: {}, repoRoot: join("C:", "repo") })).toBe(join("C:", "repo", "web", "out-inonu"));
  });
});
