import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configFile, createConfigStore, DEFAULT_CONFIG, parseConfig } from "./config";

const EVM = "0x1111111111111111111111111111111111111111";
const SOL = "So11111111111111111111111111111111111111112";

const memory = (initial: unknown = null) => {
  let saved: unknown = initial;
  return { saved: () => saved, io: { read: () => saved, write: (v: unknown) => void (saved = v) } };
};

describe("the configuration of the agent", () => {
  test("born with small, safe defaults: the person's own wallet, no address, 10 minutes, 144 consultations", () => {
    const store = createConfigStore(memory().io);
    expect(store.get()).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.managed).toEqual({ kind: "propria", evm: null, solana: null });
    expect(DEFAULT_CONFIG.intervalMin).toBe(10);
    expect(DEFAULT_CONFIG.budget.maxConsultsPerDay).toBe(144);
    expect(DEFAULT_CONFIG.chains).not.toContain("501");
  });

  test("the exact shape only", () => {
    expect(parseConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig({ ...DEFAULT_CONFIG, extra: 1 })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, version: 2 })).toBeNull();
    expect(parseConfig(null)).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, intervalMin: 1 })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, intervalMin: 500 })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, riskPct: 0.5 })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, managed: { kind: "x", evm: null, solana: null } })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, managed: { kind: "propria", evm: "0x123", solana: null } })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, managed: { kind: "propria", evm: null, solana: "not base58 !!" } })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, chains: ["1", "1"] })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, chains: ["abc"] })).toBeNull();
    // a ceiling is null (none) or a positive number somebody chose: there is no hard ceiling over it any more, and a file written before the owner's decision of 2026-10-14 (numbers) still reads
    expect(parseConfig({ ...DEFAULT_CONFIG, caps: { maxBuyUsd: 99999, maxDailyBuyUsd: 99999, maxDailySellUsd: 99999 } })).toMatchObject({ caps: { maxBuyUsd: 99999 } });
    expect(parseConfig({ ...DEFAULT_CONFIG, caps: { maxBuyUsd: 25, maxDailyBuyUsd: 100, maxDailySellUsd: 500 } })).toMatchObject({ caps: { maxBuyUsd: 25, maxDailyBuyUsd: 100, maxDailySellUsd: 500 } });
    expect(parseConfig({ ...DEFAULT_CONFIG, caps: { maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null } })).toMatchObject({ caps: { maxBuyUsd: null } });
    for (const bad of [0, -1, "25", Number.NaN]) expect(parseConfig({ ...DEFAULT_CONFIG, caps: { maxBuyUsd: bad, maxDailyBuyUsd: null, maxDailySellUsd: null } })).toBeNull();
    expect(parseConfig({ ...DEFAULT_CONFIG, caps: { maxBuyUsd: 50, maxDailyBuyUsd: 40, maxDailySellUsd: null } })).toBeNull();
  });

  test("the CLI location and its expected hash are validated", () => {
    const store = createConfigStore(memory().io);
    expect(store.update({ cli: { path: "C:\\agent\\onchainos.exe", sha256: "a".repeat(64) } })).toMatchObject({ ok: true });
    expect(store.update({ cli: { path: "C:/Users/me/.onchainos/onchainos.exe", sha256: null } })).toMatchObject({ ok: true });
    expect(store.update({ cli: { path: "C:\\agent\\onchainos.exe", sha256: "xyz" } })).toEqual({ ok: false, reason: "configuracao_invalida" });
    expect(store.update({ cli: { path: "a|b", sha256: null } })).toEqual({ ok: false, reason: "configuracao_invalida" });
    // a path that is not absolute would be looked up in the working directory or the PATH: refused
    for (const path of ["onchainos.exe", ".\\onchainos.exe", "tools/onchainos.exe", "C:onchainos.exe", "\\\\server\\share\\onchainos.exe", "C:\\agent\\..\\other\\onchainos.exe"]) {
      expect(store.update({ cli: { path, sha256: null } })).toEqual({ ok: false, reason: "configuracao_invalida" });
    }
    expect(store.update({ cli: { path: null, sha256: null } })).toMatchObject({ ok: true });
  });

  test("the owner's policy is required by default, and a file saved before the choice existed reads as required (A: the person's choice to run without the portal's limits is explicit and saved)", () => {
    expect(DEFAULT_CONFIG.ownerPolicy).toBe("exigida");
    const { ownerPolicy: _dropped, ...old } = DEFAULT_CONFIG;
    expect(parseConfig(old)?.ownerPolicy).toBe("exigida");
    expect(parseConfig({ ...DEFAULT_CONFIG, ownerPolicy: "dispensada" })?.ownerPolicy).toBe("dispensada");
    for (const bad of ["opcional", "", true, null, 1]) expect(parseConfig({ ...DEFAULT_CONFIG, ownerPolicy: bad })).toBeNull();
    const m = memory();
    const store = createConfigStore(m.io);
    expect(store.update({ ownerPolicy: "dispensada" })).toMatchObject({ ok: true });
    expect(store.get().ownerPolicy).toBe("dispensada");
    expect((m.saved() as { ownerPolicy: string }).ownerPolicy).toBe("dispensada");
    expect(createConfigStore(m.io).get().ownerPolicy).toBe("dispensada");
  });

  test("a valid change is applied and saved", () => {
    const m = memory();
    const store = createConfigStore(m.io);
    const result = store.update({ managed: { kind: "propria", evm: EVM, solana: SOL }, intervalMin: 15, riskPct: 0.02 });
    expect(result).toMatchObject({ ok: true });
    expect(store.get()).toMatchObject({ managed: { evm: EVM, solana: SOL }, intervalMin: 15, riskPct: 0.02 });
    expect(createConfigStore(m.io).get().intervalMin).toBe(15);
  });

  test("a change that is not valid is refused whole, and nothing is saved", () => {
    const m = memory();
    const store = createConfigStore(m.io);
    expect(store.update({ intervalMin: 1 })).toEqual({ ok: false, reason: "configuracao_invalida" });
    expect(store.update({ nope: 1 } as never)).toEqual({ ok: false, reason: "configuracao_invalida" });
    expect(store.update({ managed: { kind: "propria", evm: "0xabc", solana: null } })).toEqual({ ok: false, reason: "configuracao_invalida" });
    expect(store.get()).toEqual(DEFAULT_CONFIG);
    expect(m.saved()).toBeNull();
  });

  test("a change that cannot be saved is refused, and the old configuration stays", () => {
    const store = createConfigStore({
      read: () => null,
      write: () => {
        throw new Error("disk");
      },
    });
    expect(store.update({ intervalMin: 20 })).toEqual({ ok: false, reason: "nao_gravou" });
    expect(store.get().intervalMin).toBe(10);
  });

  test("a saved file that cannot be trusted is not used: the defaults apply and the fault is reported", () => {
    const store = createConfigStore(memory({ junk: true }).io);
    expect(store.get()).toEqual(DEFAULT_CONFIG);
    expect(store.health()).toEqual({ ok: false, reason: "configuracao_ilegivel" });
  });

  test("the file store round-trips and an unreadable file is reported", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-config-"));
    try {
      const path = join(dir, "sub", "config.json");
      const a = createConfigStore(configFile(path));
      expect(a.update({ refreshMin: 30 })).toMatchObject({ ok: true });
      expect(createConfigStore(configFile(path)).get().refreshMin).toBe(30);
      writeFileSync(path, "{broken");
      expect(createConfigStore(configFile(path)).health().ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the agentic wallet needs an address of its own to be the managed one", () => {
    const store = createConfigStore(memory().io);
    expect(store.update({ managed: { kind: "agentica", evm: null, solana: null } })).toEqual({ ok: false, reason: "configuracao_invalida" });
    expect(store.update({ managed: { kind: "agentica", evm: EVM, solana: null } })).toMatchObject({ ok: true });
  });
});
