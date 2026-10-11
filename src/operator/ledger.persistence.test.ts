import { expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLedger, ledgerFilePersister, readLedgerFile } from "./ledger";

// Filesystem and time are external boundaries exercised through public persistence APIs.
function withFile(run: (path: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "inonu-persistence-"));
  const path = join(directory, "ledger.json");
  try {
    writeFileSync(path, JSON.stringify(emptyLedger()));
    run(path);
  } finally {
    for (const file of readdirSync(directory)) {
      const entry = join(directory, file);
      if (lstatSync(entry).isDirectory()) rmdirSync(entry);
      else unlinkSync(entry);
    }
    rmdirSync(directory);
  }
}

test("public ledger persistence recovers a released Windows rename lock without replacing prior bytes early", () => {
  withFile((path) => {
    const prior = readFileSync(path, "utf8");
    const next = { ...emptyLedger(), executedKeys: ["synthetic-recovery"] };
    const waits: number[] = [];
    const sources: string[] = [];
    ledgerFilePersister(path, {
      platform: "win32",
      rename(source, destination) {
        sources.push(String(source));
        expect(readFileSync(path, "utf8")).toBe(prior);
        expect(JSON.parse(readFileSync(source, "utf8")).executedKeys).toEqual(["synthetic-recovery"]);
        if (sources.length === 1) throw Object.assign(new Error("synthetic retained reader"), { code: "EPERM" });
        renameSync(source, destination);
      },
      wait(ms) { waits.push(ms); },
    })(next);
    expect(waits).toEqual([10]);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toBe(sources[1]);
    expect(readLedgerFile(path)).toEqual({ status: "ready", state: next });
  });
});

for (const code of ["EPERM", "EBUSY", "EACCES"]) {
  test(`persistent Windows ${code} preserves prior bytes and propagates after exactly four attempts`, () => {
    withFile((path) => {
      const prior = readFileSync(path, "utf8");
      const error = Object.assign(new Error(`synthetic ${code}`), { code });
      const waits: number[] = [];
      const sources: string[] = [];
      let observed: unknown;
      try {
        ledgerFilePersister(path, {
          platform: "win32", wait(ms) { waits.push(ms); },
          rename(source) { sources.push(String(source)); throw error; },
        })({ ...emptyLedger(), executedKeys: ["never-published"] });
      } catch (caught) { observed = caught; }
      expect(observed).toBe(error);
      expect(sources).toHaveLength(4);
      expect(new Set(sources).size).toBe(1);
      expect(waits).toEqual([10, 20, 40]);
      expect(readFileSync(path, "utf8")).toBe(prior);
      expect(JSON.parse(readFileSync(sources[0]!, "utf8")).executedKeys).toEqual(["never-published"]);
    });
  });
}

for (const [platform, code] of [["linux", "EPERM"], ["darwin", "EACCES"], ["win32", "EIO"], ["win32", undefined]] as const) {
  test(`${platform} ${code ?? "uncoded"} replacement errors propagate immediately`, () => {
    withFile((path) => {
      const prior = readFileSync(path, "utf8");
      const error = Object.assign(new Error("synthetic nonretryable"), { code });
      let attempts = 0;
      const waits: number[] = [];
      let observed: unknown;
      try {
        ledgerFilePersister(path, { platform, rename() { attempts++; throw error; }, wait(ms) { waits.push(ms); } })(emptyLedger());
      } catch (caught) { observed = caught; }
      expect(observed).toBe(error);
      expect(attempts).toBe(1);
      expect(waits).toEqual([]);
      expect(readFileSync(path, "utf8")).toBe(prior);
    });
  });
}

test("metadata errors propagate before any replacement or temporary file write", () => {
  withFile((path) => {
    const error = Object.assign(new Error("synthetic metadata permission"), { code: "EACCES" });
    const prior = readFileSync(path, "utf8");
    let observed: unknown;
    let attempts = 0;
    try {
      ledgerFilePersister(path, { lstat() { throw error; }, rename() { attempts++; } })(emptyLedger());
    } catch (caught) { observed = caught; }
    expect(observed).toBe(error);
    expect(attempts).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(prior);
    expect(readdirSync(join(path, ".."))).toEqual(["ledger.json"]);
  });
});

test("recognized symbolic links are refused without mutation or retry", () => {
  withFile((path) => {
    const prior = readFileSync(path, "utf8");
    let attempts = 0;
    expect(() => ledgerFilePersister(path, {
      lstat: () => ({ isDirectory: () => false, isSymbolicLink: () => true }),
      rename() { attempts++; },
    })(emptyLedger())).toThrow("Invalid ledger destination");
    expect(attempts).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(prior);
  });
});

test("successful replacement needs no wait and supports a previously absent destination", () => {
  withFile((path) => {
    unlinkSync(path);
    const waits: number[] = [];
    const next = { ...emptyLedger(), executedKeys: ["new-file"] };
    ledgerFilePersister(path, { wait(ms) { waits.push(ms); } })(next);
    expect(waits).toEqual([]);
    expect(readLedgerFile(path)).toEqual({ status: "ready", state: next });
  });
});

test("destination becoming a recognized link during a rename wait blocks the next attempt", () => {
  withFile((path) => {
    const prior = readFileSync(path, "utf8");
    let linked = false;
    let attempts = 0;
    expect(() => ledgerFilePersister(path, {
      platform: "win32",
      lstat: () => ({ isDirectory: () => false, isSymbolicLink: () => linked }),
      wait() { linked = true; },
      rename() { attempts++; throw Object.assign(new Error("synthetic lock"), { code: "EPERM" }); },
    })(emptyLedger())).toThrow("Invalid ledger destination");
    expect(attempts).toBe(1);
    expect(readFileSync(path, "utf8")).toBe(prior);
  });
});

test("public ledger persistence refuses an existing directory without attempting replacement", () => {
  withFile((path) => {
    unlinkSync(path);
    mkdirSync(path);
    const waits: number[] = [];
    let attempts = 0;
    expect(() => ledgerFilePersister(path, {
      platform: "win32", wait(ms) { waits.push(ms); },
      rename(source, destination) { attempts++; renameSync(source, destination); },
    })(emptyLedger())).toThrow();
    expect(attempts).toBe(0);
    expect(waits).toEqual([]);
    expect(lstatSync(path).isDirectory()).toBe(true);
  });
});
