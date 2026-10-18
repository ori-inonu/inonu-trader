// CFG-6, T2.4: the command-line face of the plaintext cleanup, run for real against a folder made for the test and a THROWAWAY vault
// service that holds nothing. Because the vault holds nothing, nothing may be removed, even when the person confirms: a value that
// exists nowhere else is never deleted. origin: synthetic_fixture, tests only. It never touches the real vault service or the real files.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "provision.ts");
const KEY = "okx-key-AAAA1111BBBB";
const KURU = "0xKURU-PRIVATE-KEY-MUST-NEVER-BE-PRINTED-0123456789abcdef";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-cli-cleanup-"));
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(join(dir, "data", "onchainos.env"), `OKX_WEB3_API_KEY=${KEY}\nOTHER=1\n`);
  writeFileSync(join(dir, ".env"), `PRIVATE_KEY=${KURU}\nLIVE_ACK=yes\n`);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]) {
  const service = `inonu-test-${crypto.randomUUID()}`; // an empty vault service, never the app's
  const out = Bun.spawnSync(["bun", "--no-env-file", "run", SCRIPT, ...args], { env: { ...process.env, INONU_VAULT_SERVICE: service }, stdout: "pipe", stderr: "pipe" });
  return { code: out.exitCode, text: out.stdout.toString() + out.stderr.toString() };
}

describe("the cleanup command", () => {
  test("the plan lists names, files and lines, says nothing was written, and never prints a value", () => {
    const r = run(["--cleanup", "--from", dir]);
    expect(r.code).toBe(0);
    expect(r.text).toContain("plan: nothing written");
    expect(r.text).toContain("OKX_WEB3_API_KEY");
    expect(r.text).toContain("kept_not_in_vault");
    for (const value of [KEY, KURU]) expect(r.text).not.toContain(value);
  });

  test("with --yes and an empty vault nothing is removed (the value exists nowhere else), and the files are exactly as they were", () => {
    const before = [readFileSync(join(dir, "data", "onchainos.env"), "utf8"), readFileSync(join(dir, ".env"), "utf8")];
    const r = run(["--cleanup", "--yes", "--from", dir]);
    expect(r.code).toBe(0);
    expect(r.text).not.toContain("backup of the removed lines");
    expect([readFileSync(join(dir, "data", "onchainos.env"), "utf8"), readFileSync(join(dir, ".env"), "utf8")]).toEqual(before);
    expect(r.text).not.toContain(KURU);
  });

  test("restoring a file that is not a backup fails with a message and changes nothing", () => {
    const bad = join(dir, "not-a-backup.json");
    writeFileSync(bad, '{"v":9}');
    const r = run(["--restore", bad]);
    expect(r.code).not.toBe(0);
    expect(readFileSync(join(dir, "data", "onchainos.env"), "utf8")).toContain(KEY);
  });
});
