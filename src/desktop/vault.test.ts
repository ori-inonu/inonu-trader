// T2.1 / CFG-1, CFG-3: the four secrets live in the Windows Credential Manager, behind the same synchronous SettingsStore
// the handlers already use. A write is confirmed by the vault before the store says "configured"; a value never appears
// in status, in prefs, in an error or on a command line.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsError } from "../settings/store";
import { VAULT_NAMES, VaultError, createBunVaultReader, createSpawnVaultWriter, createVaultSettingsStore, vaultCli, type VaultReader, type VaultWriter } from "./vault";

let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "inonu-vault-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const SENTINEL = "SENTINEL-4c1e9a7b2d8f3056";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const log: string[] = [];
  const reader: VaultReader = { getAll: async (names) => Object.fromEntries(names.map((n) => [n, data.get(n) ?? null])) };
  const writer: VaultWriter = {
    set(name, value) { log.push(`set ${name}`); data.set(name, value); },
    delete(name) { log.push(`delete ${name}`); data.delete(name); },
  };
  return { data, log, reader, writer };
}

const make = (m: ReturnType<typeof memory>, now = () => 1_000) => createVaultSettingsStore({ dataDir: dir, reader: m.reader, writer: m.writer, now, runtimeKey: () => null });

describe("a vault that does not answer (CFG-1: an explicit failure state)", () => {
  const broken = (): VaultReader => ({ getAll: async () => { throw new VaultError(); } });
  const makeBroken = () => createVaultSettingsStore({ dataDir: dir, reader: broken(), writer: memory().writer, now: () => 1_000, runtimeKey: () => null });

  test("the store says the vault is unavailable instead of pretending the keys are not there, and nothing is reported as configured", async () => {
    const store = await makeBroken();
    const status = store.status();
    expect(status.vault).toBe("indisponivel");
    expect(Object.values(status.secrets).every((s) => !s.configured)).toBe(true);
    expect(store.credentials()).toEqual({ okx: null, typesafeAiApiKey: null });
  });

  test("a vault that answers has no such field, so nothing changes for a healthy install", async () => {
    expect((await make(memory())).status().vault).toBeUndefined();
    expect((await make(memory({ OKX_WEB3_API_KEY: "k-1234567890" }))).status().vault).toBeUndefined();
  });

  test("the reader of the real vault no longer turns a failed read into an absent key", async () => {
    const reader = createBunVaultReader({ get: async () => { throw new Error("locked"); }, set: async () => {}, delete: async () => true });
    await expect(reader.getAll(VAULT_NAMES)).rejects.toBeInstanceOf(VaultError);
    // a key that is simply not there is still null
    const empty = createBunVaultReader({ get: async () => null, set: async () => {}, delete: async () => true });
    expect(await empty.getAll(["OKX_WEB3_API_KEY"])).toEqual({ OKX_WEB3_API_KEY: null });
  });

  test("the failure carries no value and no message of the vault", async () => {
    const reader = createBunVaultReader({ get: async () => { throw new Error("secret=SENTINEL-leak"); }, set: async () => {}, delete: async () => true });
    const error = (await reader.getAll(VAULT_NAMES).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain("SENTINEL");
  });

  test("an ambient Jev key remains available without claiming the unavailable vault answered", async () => {
    const store = await createVaultSettingsStore({ dataDir: dir, reader: broken(), writer: memory().writer,
      runtimeKey: () => ({ value: "process-model-key", origin: "process_environment" }) });
    expect(store.status().vault).toBe("indisponivel");
    expect(store.status().secrets.typesafeAiApiKey).toMatchObject({ configured: true, origin: "process_environment", last4: null });
    expect(store.status().secrets.okxWeb3ApiKey.configured).toBe(false);
    expect(store.credentials().typesafeAiApiKey).toBe("process-model-key");
  });
});

describe("status and credentials", () => {
  test("vault Jev key wins and clearing it exposes only the ambient credential origin", async () => {
    const m = memory({ TYPESAFE_AI_API_KEY: "vault-model-key" });
    const store = await createVaultSettingsStore({ dataDir: dir, reader: m.reader, writer: m.writer,
      runtimeKey: () => ({ value: "ambient-model-key", origin: "windows_user" }) });
    expect(store.status().secrets.typesafeAiApiKey).toMatchObject({ configured: true, origin: "vault", last4: null });
    expect(store.credentials().typesafeAiApiKey).toBe("vault-model-key");
    store.clear("typesafeAiApiKey");
    expect(store.status().secrets.typesafeAiApiKey).toMatchObject({ configured: true, origin: "windows_user", last4: null });
    expect(store.credentials().typesafeAiApiKey).toBe("ambient-model-key");
    expect(m.log).toEqual(["delete TYPESAFE_AI_API_KEY"]);
  });

  test("a clean vault is four unconfigured secrets and an absent OKX state", async () => {
    const store = await make(memory());
    const status = store.status();
    expect(Object.keys(status.secrets).sort()).toEqual(["okxWeb3ApiKey", "okxWeb3ApiPassphrase", "okxWeb3ApiSecret", "typesafeAiApiKey"]);
    expect(Object.values(status.secrets).every((s) => !s.configured && s.last4 === null)).toBe(true);
    expect(status.okx.state).toBe("absent");
    expect(store.credentials()).toEqual({ okx: null, typesafeAiApiKey: null });
  });

  test("values already in the vault are loaded at start; last4 only for the key ids, never for the secret or the passphrase", async () => {
    const store = await make(memory({ OKX_WEB3_API_KEY: "key-0001-abcdef", OKX_WEB3_API_SECRET: "secret-0001-zyxwv", OKX_WEB3_API_PASSPHRASE: "pass-0001-qwerty", TYPESAFE_AI_API_KEY: "model-0001-mnopqr" }));
    const s = store.status();
    expect(s.okx.state).toBe("complete");
    expect(s.secrets.okxWeb3ApiKey).toMatchObject({ configured: true, last4: "cdef" });
    expect(s.secrets.typesafeAiApiKey).toMatchObject({ configured: true, last4: null, origin: "vault" });
    expect(s.secrets.okxWeb3ApiSecret).toMatchObject({ configured: true, last4: null });
    expect(s.secrets.okxWeb3ApiPassphrase).toMatchObject({ configured: true, last4: null });
    expect(store.credentials().okx).toEqual({ apiKey: "key-0001-abcdef", secret: "secret-0001-zyxwv", passphrase: "pass-0001-qwerty" });
    expect(store.credentials().typesafeAiApiKey).toBe("model-0001-mnopqr");
  });

  test("an incomplete OKX credential is saved and marked incomplete, and yields no credential to use", async () => {
    const store = await make(memory({ OKX_WEB3_API_KEY: "key-0001-abcdef", OKX_WEB3_API_SECRET: "secret-0001-zyxwv" }));
    expect(store.status().okx.state).toBe("incomplete");
    expect(store.credentials().okx).toBeNull();
  });
});

describe("writes are confirmed by the vault", () => {
  test("set validates the value, writes through, then reports configured", async () => {
    const m = memory();
    const store = await make(m, () => 5_000);
    store.set("okxWeb3ApiKey", SENTINEL);
    expect(m.log).toEqual(["set OKX_WEB3_API_KEY"]);
    expect(m.data.get("OKX_WEB3_API_KEY")).toBe(SENTINEL);
    expect(store.status().secrets.okxWeb3ApiKey).toMatchObject({ configured: true, updatedAtMs: 5_000 });
  });

  test("an invalid value is refused with the store's own error code and never reaches the vault", async () => {
    const m = memory();
    const store = await make(m);
    for (const [value, code] of [["short", "value_too_short"], ["has'quote-12345", "value_invalid_chars"], [42 as unknown as string, "value_not_string"]] as const) {
      expect(() => store.set("okxWeb3ApiKey", value)).toThrow(SettingsError);
      try { store.set("okxWeb3ApiKey", value); } catch (e) { expect((e as SettingsError).code).toBe(code); }
    }
    expect(m.log).toEqual([]);
    expect(store.status().secrets.okxWeb3ApiKey.configured).toBe(false);
  });

  test("when the vault write fails the store is NOT configured and the error is constant", async () => {
    const m = memory();
    m.writer.set = () => { throw new VaultError("vault unavailable at C:\\secret\\path with value " + SENTINEL); };
    const store = await make(m);
    let caught: unknown;
    try { store.set("okxWeb3ApiKey", SENTINEL); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(SettingsError);
    expect((caught as SettingsError).code).toBe("vault_error");
    expect(String((caught as Error).message)).not.toContain(SENTINEL);
    expect(store.status().secrets.okxWeb3ApiKey.configured).toBe(false);
  });

  test("clear deletes from the vault; a failed delete keeps the secret configured", async () => {
    const m = memory({ OKX_WEB3_API_KEY: "key-0001-abcdef" });
    const store = await make(m);
    store.clear("okxWeb3ApiKey");
    expect(m.log).toEqual(["delete OKX_WEB3_API_KEY"]);
    expect(store.status().secrets.okxWeb3ApiKey.configured).toBe(false);

    const failing = memory({ OKX_WEB3_API_KEY: "key-0001-abcdef" });
    failing.writer.delete = () => { throw new VaultError("nope"); };
    const kept = await make(failing);
    expect(() => kept.clear("okxWeb3ApiKey")).toThrow(SettingsError);
    expect(kept.status().secrets.okxWeb3ApiKey.configured).toBe(true);
  });

  test("only the four known names are ever read or written", async () => {
    expect(VAULT_NAMES).toEqual(["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE", "TYPESAFE_AI_API_KEY"]);
    const requested: string[][] = [];
    const m = memory({ PRIVATE_KEY: "0xdeadbeef", LIVE_ACK: "OWN_FUNDS_RISK" });
    const reader: VaultReader = { getAll: async (names) => { requested.push([...names]); return m.reader.getAll(names); } };
    const store = await createVaultSettingsStore({ dataDir: dir, reader, writer: m.writer, now: () => 1, runtimeKey: () => null });
    expect(requested).toEqual([[...VAULT_NAMES]]);
    expect(JSON.stringify(store.status())).not.toContain("deadbeef");
  });
});

describe("no leak (CFG-3)", () => {
  test("the sentinel appears in no status, no prefs and no error", async () => {
    const m = memory();
    const store = await make(m);
    store.set("okxWeb3ApiSecret", SENTINEL);
    store.set("okxWeb3ApiPassphrase", SENTINEL + "-pass");
    const seen = JSON.stringify([store.status(), store.prefs()]);
    expect(seen).not.toContain("SENTINEL");
  });
});

describe("prefs stay in the data dir", () => {
  test("setPrefs and prefs delegate to the file store under dataDir", async () => {
    const store = await make(memory());
    expect(store.prefs().onchain.capBasic).toBeGreaterThan(0);
    const next = store.setPrefs({ onchain: { capBasic: 1234 } });
    expect(next.onchain.capBasic).toBe(1234);
    expect(store.prefs().onchain.capBasic).toBe(1234);
  });
});

describe("createSpawnVaultWriter", () => {
  test("hands the value to the child on stdin, never on the command line, and treats a non-zero exit as a vault error", () => {
    const calls: { cmd: string[]; stdin: string }[] = [];
    const writer = createSpawnVaultWriter(() => ["C:\\app\\InonuTrader.exe", "--vault"], (cmd, options) => {
      calls.push({ cmd, stdin: String(options.stdin) });
      return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
    });
    writer.set("OKX_WEB3_API_KEY", SENTINEL);
    writer.delete("OKX_WEB3_API_KEY");
    expect(calls[0]).toEqual({ cmd: ["C:\\app\\InonuTrader.exe", "--vault", "set", "OKX_WEB3_API_KEY"], stdin: SENTINEL });
    expect(calls[0]!.cmd.join(" ")).not.toContain(SENTINEL);
    expect(calls[1]).toEqual({ cmd: ["C:\\app\\InonuTrader.exe", "--vault", "delete", "OKX_WEB3_API_KEY"], stdin: "" });

    const failing = createSpawnVaultWriter(() => ["x"], () => ({ exitCode: 1 } as ReturnType<typeof Bun.spawnSync>));
    expect(() => failing.set("OKX_WEB3_API_KEY", SENTINEL)).toThrow(VaultError);
    expect(() => failing.set("PRIVATE_KEY", SENTINEL)).toThrow(VaultError); // not an allowed name: refused before spawning
  });
});

describe("vaultCli (the child the writer spawns)", () => {
  function io(stdin: string) {
    const out: string[] = [];
    const err: string[] = [];
    const store = new Map<string, string>();
    return { out, err, store, deps: { stdin: async () => stdin, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s), backend: { set: async (n: string, v: string) => { store.set(n, v); }, delete: async (n: string) => store.delete(n), get: async (n: string) => store.get(n) ?? null } } };
  }

  test("set reads the value from stdin, stores it and prints nothing that contains it", async () => {
    const c = io(SENTINEL);
    expect(await vaultCli(["set", "OKX_WEB3_API_KEY"], c.deps)).toBe(0);
    expect(c.store.get("OKX_WEB3_API_KEY")).toBe(SENTINEL);
    expect([...c.out, ...c.err].join("")).not.toContain(SENTINEL);
  });

  test("delete, and refusal of unknown commands and of names outside the allowlist", async () => {
    const c = io("");
    c.store.set("OKX_WEB3_API_KEY", "x".repeat(12));
    expect(await vaultCli(["delete", "OKX_WEB3_API_KEY"], c.deps)).toBe(0);
    expect(c.store.has("OKX_WEB3_API_KEY")).toBe(false);
    expect(await vaultCli(["frobnicate", "OKX_WEB3_API_KEY"], c.deps)).toBe(2);
    expect(await vaultCli(["set", "PRIVATE_KEY"], io(SENTINEL).deps)).toBe(2);
    expect(await vaultCli(["set", "OKX_WEB3_API_KEY"], io("").deps)).toBe(2); // an empty value is not stored
  });
});
