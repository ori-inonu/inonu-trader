// CFG-6, AC-CFG-3, T2.4: removing the plain text copies of the four secrets from the env files is a SEPARATE, confirmed step, never automatic.
// It edits only the lines of the four names, only when the vault holds the very same value, leaves every other variable of the file
// untouched (the .env also holds the Kuru trader's private key, which is never read), writes a backup that holds only the removed lines,
// and can put them back. The report shows no value. origin: synthetic_fixture, tests only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupPlaintext, restorePlaintext } from "./cleanup";
import type { AsyncVault } from "./vault";

const KEY = "okx-key-AAAA1111BBBB";
const SECRET = "okx-secret-CCCC2222DDDD";
const PASS = "okx-pass-EEEE3333FFFF";
const MODEL = "model-key-GGGG4444HHHH";
const KURU = "0xKURU-PRIVATE-KEY-MUST-NEVER-BE-TOUCHED-0123456789abcdef";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-cleanup-"));
  mkdirSync(join(dir, "data"), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const vaultOf = (values: Record<string, string>): AsyncVault => ({ get: async (name) => values[name] ?? null, set: async () => {}, delete: async () => true });
const FULL_VAULT = { OKX_WEB3_API_KEY: KEY, OKX_WEB3_API_SECRET: SECRET, OKX_WEB3_API_PASSPHRASE: PASS, TYPESAFE_AI_API_KEY: MODEL };

function files() {
  const onchain = join(dir, "data", "onchainos.env");
  const env = join(dir, ".env");
  writeFileSync(onchain, `# the OKX project\nOKX_WEB3_API_KEY=${KEY}\nOKX_WEB3_API_SECRET="${SECRET}"\nOKX_WEB3_API_PASSPHRASE=${PASS}\nOTHER_SETTING=keep-me\n`);
  writeFileSync(env, `PRIVATE_KEY=${KURU}\nLIVE_ACK=yes\nTYPESAFE_AI_API_KEY=${MODEL}\nPORT=3030\n`);
  return { onchain, env, backup: join(dir, "data", "backups", "plaintext.json") };
}

describe("the plan (nothing written)", () => {
  test("lists what would go: the file, the line and the name, never a value; and writes nothing at all", async () => {
    const f = files();
    const before = [readFileSync(f.onchain, "utf8"), readFileSync(f.env, "utf8")];
    const report = await cleanupPlaintext({ files: [f.onchain, f.env], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: false });
    expect(report.entries.map((e) => `${e.name}:${e.outcome}`).sort()).toEqual([
      "OKX_WEB3_API_KEY:would_remove", "OKX_WEB3_API_PASSPHRASE:would_remove", "OKX_WEB3_API_SECRET:would_remove", "TYPESAFE_AI_API_KEY:would_remove",
    ]);
    expect(report.backup).toBeNull();
    expect([readFileSync(f.onchain, "utf8"), readFileSync(f.env, "utf8")]).toEqual(before);
    expect(existsSync(f.backup)).toBe(false);
    const text = JSON.stringify(report);
    for (const value of [KEY, SECRET, PASS, MODEL, KURU]) expect(text).not.toContain(value);
  });
});

describe("applying it", () => {
  test("refuses without the explicit confirmation, and then changes nothing", async () => {
    const f = files();
    const before = readFileSync(f.onchain, "utf8");
    await expect(cleanupPlaintext({ files: [f.onchain], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true })).rejects.toThrow(/confirm/);
    expect(readFileSync(f.onchain, "utf8")).toBe(before);
    expect(existsSync(f.backup)).toBe(false);
  });

  test("removes only the lines of the four names, in every file, and nothing else; the Kuru key and the other settings stay byte for byte", async () => {
    const f = files();
    const report = await cleanupPlaintext({ files: [f.onchain, f.env], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    expect(report.entries.every((e) => e.outcome === "removed")).toBe(true);
    expect(readFileSync(f.onchain, "utf8")).toBe("# the OKX project\nOTHER_SETTING=keep-me\n");
    expect(readFileSync(f.env, "utf8")).toBe(`PRIVATE_KEY=${KURU}\nLIVE_ACK=yes\nPORT=3030\n`);
    expect(report.backup).toBe(f.backup);
  });

  test("the backup holds only the removed lines of the four names, never the Kuru key nor another variable", async () => {
    const f = files();
    await cleanupPlaintext({ files: [f.onchain, f.env], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    const backup = readFileSync(f.backup, "utf8");
    expect(backup).toContain(KEY);
    expect(backup).not.toContain(KURU);
    expect(backup).not.toContain("OTHER_SETTING");
    expect(backup).not.toContain("LIVE_ACK");
    expect(JSON.parse(backup).entries).toHaveLength(4);
  });

  test("a value the vault does not hold, or holds different, is kept in the file: nothing is deleted that exists nowhere else", async () => {
    const f = files();
    const vault = vaultOf({ OKX_WEB3_API_KEY: KEY, OKX_WEB3_API_SECRET: "something-else-entirely-1234" }); // passphrase and model key missing
    const report = await cleanupPlaintext({ files: [f.onchain, f.env], vault, backupFile: f.backup, apply: true, confirm: true });
    const outcome = (name: string) => report.entries.find((e) => e.name === name)!.outcome;
    expect(outcome("OKX_WEB3_API_KEY")).toBe("removed");
    expect(outcome("OKX_WEB3_API_SECRET")).toBe("kept_different");
    expect(outcome("OKX_WEB3_API_PASSPHRASE")).toBe("kept_not_in_vault");
    expect(outcome("TYPESAFE_AI_API_KEY")).toBe("kept_not_in_vault");
    const text = readFileSync(f.onchain, "utf8");
    expect(text).toContain("OKX_WEB3_API_SECRET");
    expect(text).toContain("OKX_WEB3_API_PASSPHRASE");
    expect(text).not.toContain("OKX_WEB3_API_KEY=");
  });

  test("a line that is only a placeholder reference is not a secret and is left alone", async () => {
    const f = files();
    writeFileSync(f.env, "TYPESAFE_AI_API_KEY=${TYPESAFE_AI_API_KEY}\nPORT=1\n");
    const report = await cleanupPlaintext({ files: [f.env], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    expect(report.entries[0]).toMatchObject({ name: "TYPESAFE_AI_API_KEY", outcome: "kept_placeholder" });
    expect(readFileSync(f.env, "utf8")).toBe("TYPESAFE_AI_API_KEY=${TYPESAFE_AI_API_KEY}\nPORT=1\n");
    expect(report.backup).toBeNull(); // nothing removed, so nothing to back up
  });

  test("CRLF files keep their line endings and a missing file is simply not there", async () => {
    const f = files();
    writeFileSync(f.onchain, `OKX_WEB3_API_KEY=${KEY}\r\nOTHER=1\r\n`);
    await cleanupPlaintext({ files: [f.onchain, join(dir, "no-such.env")], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    expect(readFileSync(f.onchain, "utf8")).toBe("OTHER=1\r\n");
  });

  test("a file with mixed line endings keeps every other line exactly as it was, byte for byte", async () => {
    const f = files();
    writeFileSync(f.onchain, `# keep\r\nOKX_WEB3_API_KEY=${KEY}\nOTHER=1\r\nLAST=2\n`);
    await cleanupPlaintext({ files: [f.onchain], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    expect(readFileSync(f.onchain, "utf8")).toBe("# keep\r\nOTHER=1\r\nLAST=2\n");
  });

  test("a secret on the last line, with no line ending after it, leaves the file ending where the previous line ended", async () => {
    const f = files();
    writeFileSync(f.onchain, `A=1\r\nOKX_WEB3_API_KEY=${KEY}`);
    await cleanupPlaintext({ files: [f.onchain], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    expect(readFileSync(f.onchain, "utf8")).toBe("A=1");
  });

  test("a vault that fails to answer keeps everything: an unknown is never a reason to delete", async () => {
    const f = files();
    const broken: AsyncVault = { get: async () => Promise.reject(new Error("locked")), set: async () => {}, delete: async () => true };
    const before = readFileSync(f.onchain, "utf8");
    const report = await cleanupPlaintext({ files: [f.onchain], vault: broken, backupFile: f.backup, apply: true, confirm: true });
    expect(report.entries.every((e) => e.outcome === "kept_not_in_vault")).toBe(true);
    expect(readFileSync(f.onchain, "utf8")).toBe(before);
  });

  test("the backup is written before the file is changed: when the backup cannot be written, nothing is removed", async () => {
    const f = files();
    const blocker = join(dir, "data", "backups-blocker");
    writeFileSync(blocker, "a file where the folder should be");
    const before = readFileSync(f.onchain, "utf8");
    await expect(cleanupPlaintext({ files: [f.onchain], vault: vaultOf(FULL_VAULT), backupFile: join(blocker, "x.json"), apply: true, confirm: true })).rejects.toThrow();
    expect(readFileSync(f.onchain, "utf8")).toBe(before);
  });
});

describe("restoring", () => {
  test("puts the removed lines back where they were, so the files are what they were before", async () => {
    const f = files();
    const before = [readFileSync(f.onchain, "utf8"), readFileSync(f.env, "utf8")];
    const report = await cleanupPlaintext({ files: [f.onchain, f.env], vault: vaultOf(FULL_VAULT), backupFile: f.backup, apply: true, confirm: true });
    const result = restorePlaintext({ backupFile: report.backup! });
    expect(result).toEqual({ restored: 4, skipped: 0 });
    expect([readFileSync(f.onchain, "utf8"), readFileSync(f.env, "utf8")]).toEqual(before);
  });

  test("a name that is already back in the file is not duplicated, and a backup that is not the documented shape restores nothing", () => {
    const f = files();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ v: 9, entries: [] }));
    expect(() => restorePlaintext({ backupFile: bad })).toThrow();
    writeFileSync(bad, JSON.stringify({ v: 1, savedAtMs: 1, entries: [{ file: f.onchain, index: 1, raw: `OKX_WEB3_API_KEY=${KEY}` }] }));
    expect(restorePlaintext({ backupFile: bad })).toEqual({ restored: 0, skipped: 1 });
    expect(readFileSync(f.onchain, "utf8").match(/OKX_WEB3_API_KEY=/g)).toHaveLength(1);
  });

  test("a restore never writes a line of a name other than the four", () => {
    const f = files();
    const bad = join(dir, "evil.json");
    writeFileSync(bad, JSON.stringify({ v: 1, savedAtMs: 1, entries: [{ file: f.onchain, index: 0, raw: `PRIVATE_KEY=${KURU}` }] }));
    expect(restorePlaintext({ backupFile: bad })).toEqual({ restored: 0, skipped: 1 });
    expect(readFileSync(f.onchain, "utf8")).not.toContain("PRIVATE_KEY");
  });
});
