// WAL-10: what the person allows (the settings, the kill switch, the routers they trust) and the local log, including what happens when two tabs of one browser share the storage. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { DEFAULT_TRADE_SETTINGS, LIMITS, TRADE_SETTINGS_KEY, createTradeSettingsStore, parseTradeSettings, parseTyped } from "./settings";
import { TRADE_LOG_KEY, createTradeLog, newEntryId, spentLast24hUsd, type TradeLogEntry } from "./log";
import { HASH_A, NOW, ROUTER, SPENDER, memoryStorage, settingsOn } from "./fixtures";

describe("the settings", () => {
  test("a new page starts OFF, with no cap, no trusted router, whatever else is true", () => {
    expect(DEFAULT_TRADE_SETTINGS).toMatchObject({ enabled: false, perOperationUsd: null, dailyUsd: null, killed: false, trustedRouters: {}, trustedSpenders: {} });
    expect(createTradeSettingsStore().get()).toEqual(DEFAULT_TRADE_SETTINGS);
    expect(createTradeSettingsStore({ storage: memoryStorage() }).get()).toEqual(DEFAULT_TRADE_SETTINGS);
  });

  test("what was kept is read back; anything that is not exactly the shape is dropped and the default is off", () => {
    const storage = memoryStorage();
    const store = createTradeSettingsStore({ storage });
    // the trust is not part of what a form saves: it is only ever added by the person confirming an address
    expect(store.set(settingsOn({ trustedRouters: {}, trustedSpenders: {} }))).toBe(true);
    expect(store.trust("8453", ROUTER, SPENDER)).toBe(true);
    expect(createTradeSettingsStore({ storage }).get()).toEqual(settingsOn());
    const bads = [
      { ...settingsOn(), extra: 1 }, { ...settingsOn(), enabled: "true" }, { ...settingsOn(), perOperationUsd: 0 }, { ...settingsOn(), perOperationUsd: LIMITS.maxCapUsd + 1 }, { ...settingsOn(), slippagePct: 6 },
      { ...settingsOn(), slippagePct: 1.234 }, { ...settingsOn(), maxImpactPct: 0 }, { ...settingsOn(), maxTaxPct: -1 }, { ...settingsOn(), trustedRouters: { abc: [ROUTER] } },
      { ...settingsOn(), trustedRouters: { "8453": ["0xNOTANADDRESS"] } }, { ...settingsOn(), trustedRouters: { "8453": [ROUTER.toUpperCase().replace("0X", "0x")] } }, { ...settingsOn(), trustedSpenders: { "8453": [SPENDER, SPENDER] } },
      { ...settingsOn(), trustedRouters: { "8453": new Array(LIMITS.maxTrustedPerChain + 1).fill(0).map((_, i) => `0x${String(i).padStart(40, "1")}`) } },
    ];
    for (const bad of bads) {
      storage.map.set(TRADE_SETTINGS_KEY, JSON.stringify(bad));
      expect(createTradeSettingsStore({ storage }).get()).toEqual(DEFAULT_TRADE_SETTINGS);
    }
    storage.map.set(TRADE_SETTINGS_KEY, "{not json");
    expect(createTradeSettingsStore({ storage }).get()).toEqual(DEFAULT_TRADE_SETTINGS);
    // a payload from before the routers existed is not read as a half shape
    const { trustedRouters: _a, trustedSpenders: _b, ...old } = settingsOn();
    storage.map.set(TRADE_SETTINGS_KEY, JSON.stringify(old));
    expect(createTradeSettingsStore({ storage }).get()).toEqual(DEFAULT_TRADE_SETTINGS);
  });

  test("an invalid change is refused and nothing changes", () => {
    const store = createTradeSettingsStore({ storage: memoryStorage() });
    store.set(settingsOn({ trustedRouters: {}, trustedSpenders: {} }));
    expect(store.set({ ...settingsOn(), slippagePct: 50 })).toBe(false);
    expect(store.get()).toEqual(settingsOn({ trustedRouters: {}, trustedSpenders: {} }));
    expect(parseTradeSettings(null)).toBeNull();
    expect(parseTradeSettings([])).toBeNull();
  });

  test("the kill switch stops at once, is kept, and survives a page that reads the settings again", () => {
    const storage = memoryStorage();
    const store = createTradeSettingsStore({ storage });
    store.set(settingsOn());
    let heard = 0;
    store.subscribe(() => (heard += 1));
    store.kill();
    expect(store.get()).toMatchObject({ enabled: true, killed: true });
    expect(heard).toBe(1);
    expect(createTradeSettingsStore({ storage }).get().killed).toBe(true);
  });

  test("a save never undoes the stop: a page that is out of date, or a form that says killed false, cannot turn it back on; only unkill can", () => {
    const storage = memoryStorage();
    const a = createTradeSettingsStore({ storage });
    const b = createTradeSettingsStore({ storage });
    a.set(settingsOn());
    // tab B has the settings page open with the old values; tab A stops everything
    a.kill();
    expect(b.get().killed).toBe(true);
    expect(b.set(settingsOn({ killed: false }))).toBe(true);
    expect(b.get().killed).toBe(true);
    expect(a.get().killed).toBe(true);
    expect(b.set(settingsOn({ killed: false }), { unkill: true })).toBe(true);
    expect(a.get().killed).toBe(false);
  });

  test("a stop that could not be written still holds on this page, and only an unkill that could be written clears it", () => {
    let writable = false;
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { if (!writable) throw new Error("full"); map.set(k, v); }, removeItem: (k: string) => void map.delete(k) };
    map.set(TRADE_SETTINGS_KEY, JSON.stringify(settingsOn({ trustedRouters: {}, trustedSpenders: {} })));
    const store = createTradeSettingsStore({ storage });
    expect(store.get().killed).toBe(false);
    store.kill();
    // the storage still says "not stopped", and the page says stopped, now and at every later read
    expect(store.get().killed).toBe(true);
    expect(store.get().killed).toBe(true);
    // an unkill that cannot be written does nothing
    expect(store.set(settingsOn({ trustedRouters: {}, trustedSpenders: {} }), { unkill: true })).toBe(false);
    expect(store.get().killed).toBe(true);
    writable = true;
    expect(store.set(settingsOn({ trustedRouters: {}, trustedSpenders: {} }), { unkill: true })).toBe(true);
    expect(store.get().killed).toBe(false);
  });

  test("two tabs of one browser see each other: a stop and a change in one are read by the other at its next read", () => {
    const storage = memoryStorage();
    const a = createTradeSettingsStore({ storage });
    const b = createTradeSettingsStore({ storage });
    a.set(settingsOn());
    expect(b.get().enabled).toBe(true);
    a.set(settingsOn({ enabled: false }));
    expect(b.get().enabled).toBe(false);
    let heard = 0;
    b.subscribe(() => (heard += 1));
    b.changedElsewhere();
    expect(heard).toBe(1);
  });

  test("the routers and approval addresses the person trusts are kept per network, lower case, a few at a time, and a save never overwrites what another tab trusted", () => {
    const storage = memoryStorage();
    const a = createTradeSettingsStore({ storage });
    const b = createTradeSettingsStore({ storage });
    a.set({ ...DEFAULT_TRADE_SETTINGS, enabled: true, perOperationUsd: 10, dailyUsd: 20 });
    expect(a.trust("8453", ROUTER.toUpperCase().replace("0X", "0x"), SPENDER)).toBe(true);
    expect(a.get().trustedRouters).toEqual({ "8453": [ROUTER] });
    expect(a.get().trustedSpenders).toEqual({ "8453": [SPENDER] });
    // trusting the same again changes nothing
    a.trust("8453", ROUTER, SPENDER);
    expect(a.get().trustedRouters["8453"]).toEqual([ROUTER]);
    // tab B saves its form, which knows nothing of the trust: the trust stays
    b.set({ ...DEFAULT_TRADE_SETTINGS, enabled: true, perOperationUsd: 30, dailyUsd: 40 });
    expect(a.get().perOperationUsd).toBe(30);
    expect(a.get().trustedRouters).toEqual({ "8453": [ROUTER] });
    // one network can be taken back, the others stay
    a.trust("1", "0x2222222222222222222222222222222222222222", null);
    a.untrust("8453");
    expect(a.get().trustedRouters).toEqual({ "1": ["0x2222222222222222222222222222222222222222"] });
    expect(a.get().trustedSpenders).toEqual({});
  });

  test("a thing that is not an address, a network that is not a number, or too many addresses are not trusted", () => {
    const store = createTradeSettingsStore({ storage: memoryStorage() });
    expect(store.trust("8453", "0x123", null)).toBe(false);
    expect(store.trust("base", ROUTER, null)).toBe(false);
    expect(store.trust("8453", ROUTER, "nope")).toBe(false);
    for (let i = 0; i < LIMITS.maxTrustedPerChain; i += 1) expect(store.trust("8453", `0x${String(i + 1).padStart(40, "a")}`, null)).toBe(true);
    expect(store.trust("8453", `0x${"b".repeat(40)}`, null)).toBe(false);
    expect(store.get().trustedRouters["8453"]).toHaveLength(LIMITS.maxTrustedPerChain);
  });

  test("a storage that refuses says so: a change or a trust that could not be kept is NOT made, and the stop still holds", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    const store = createTradeSettingsStore({ storage: blocked });
    expect(store.get().enabled).toBe(false);
    expect(store.set(settingsOn())).toBe(false);
    expect(store.get().enabled).toBe(false);
    expect(store.trust("8453", ROUTER, SPENDER)).toBe(false);
    expect(store.get().trustedRouters).toEqual({});
    store.kill();
    expect(store.get().killed).toBe(true);
  });

  test("the router and the approval address are trusted on their own, one without the other", () => {
    const store = createTradeSettingsStore({ storage: memoryStorage() });
    expect(store.trust("8453", ROUTER, null)).toBe(true);
    expect(store.get().trustedRouters).toEqual({ "8453": [ROUTER] });
    expect(store.get().trustedSpenders).toEqual({});
    expect(store.trust("8453", null, SPENDER)).toBe(true);
    expect(store.get().trustedSpenders).toEqual({ "8453": [SPENDER] });
    expect(store.trust("8453", null, null)).toBe(false);
    expect(store.untrust("8453")).toBe(true);
    expect(store.get().trustedRouters).toEqual({});
  });

  test("what is typed is read with a comma or a point, in range, with the decimals allowed, and never clamped", () => {
    expect(parseTyped("1,5", 0, 10)).toBe(1.5);
    expect(parseTyped("200", 0, 1_000_000)).toBe(200);
    expect(parseTyped("0", 0, 10)).toBeNull();
    expect(parseTyped("0", 0, 10, true)).toBe(0);
    expect(parseTyped("11", 0, 10)).toBeNull();
    expect(parseTyped("1,25", 0, 5, false, 2)).toBe(1.25);
    expect(parseTyped("1,125", 0, 5, false, 2)).toBeNull();
    for (const bad of ["", "abc", "-1", "1e3", "1.23456", "1,2,3", " "]) expect(parseTyped(bad, 0, 10)).toBeNull();
  });
});

const entry = (over: Partial<TradeLogEntry> = {}): TradeLogEntry => ({ id: "abcdef0123456789", atMs: NOW, chainIndex: "8453", side: "buy", step: "swap", symbol: "AAA", usd: 100, txHash: HASH_A, result: "enviada", briefHash: "abc123", ...over });

describe("the log", () => {
  test("an entry is kept, read back and counted; one that is not exactly the shape is refused", () => {
    const storage = memoryStorage();
    const log = createTradeLog({ storage });
    expect(log.add(entry())).toBe(true);
    expect(createTradeLog({ storage }).list()).toEqual([entry()]);
    expect(log.add({ ...entry(), txHash: "0x12" })).toBe(false);
    expect(log.add({ ...entry(), symbol: "A B" })).toBe(false);
    expect(log.add({ ...entry(), result: "ok" as never })).toBe(false);
    expect(log.add({ ...entry(), usd: -1 })).toBe(false);
    expect(log.add({ ...entry(), id: "x" })).toBe(false);
    expect(log.add({ ...entry(), extra: 1 } as never)).toBe(false);
    expect(log.list()).toHaveLength(1);
  });

  test("it says whether what it keeps survives a reload, and refuses to keep anything when it cannot", () => {
    expect(createTradeLog({ storage: memoryStorage() }).durable).toBe(true);
    const none = createTradeLog();
    expect(none.durable).toBe(false);
    expect(none.add(entry())).toBe(false);
    const full = createTradeLog({ storage: { getItem: () => null, setItem: () => { throw new Error("full"); } } });
    expect(full.add(entry())).toBe(false);
    expect(full.list()).toEqual([]);
  });

  test("a hand edited payload keeps only the entries that are exactly the shape", () => {
    const storage = memoryStorage({ [TRADE_LOG_KEY]: JSON.stringify([entry(), { atMs: "x" }, entry({ txHash: "bad" }), null]) });
    expect(createTradeLog({ storage }).list()).toEqual([entry()]);
    storage.map.set(TRADE_LOG_KEY, "[not json");
    expect(createTradeLog({ storage }).list()).toEqual([]);
  });

  test("an attempt written before the wallet is asked is settled by its id: the hash arrives, or the refusal, or the failure", () => {
    const log = createTradeLog({ storage: memoryStorage() });
    log.add(entry({ txHash: null, result: "pendente" }));
    expect(log.settle("abcdef0123456789", { txHash: HASH_A, result: "enviada" })).toBe(true);
    expect(log.list()[0]).toMatchObject({ txHash: HASH_A, result: "enviada" });
    expect(log.settle("zzzzzzzzzzzz", { result: "recusada" })).toBe(false);
    expect(log.settle("abcdef0123456789", { txHash: "not a hash", result: "enviada" })).toBe(false);
    expect(log.list()[0]).toMatchObject({ txHash: HASH_A, result: "enviada" });
  });

  test("the result moves when the chain speaks, and an unknown hash changes nothing", () => {
    const log = createTradeLog({ storage: memoryStorage() });
    log.add(entry());
    expect(log.resolve(HASH_A, "confirmada")).toBe(true);
    expect(log.list()[0]!.result).toBe("confirmada");
    expect(log.resolve(`0x${"b2".repeat(32)}`, "confirmada")).toBe(false);
  });

  test("two tabs share it: what one writes the other reads at its next read, and neither drops the other's entries", () => {
    const storage = memoryStorage();
    const a = createTradeLog({ storage });
    const b = createTradeLog({ storage });
    a.add(entry({ id: "aaaaaaaaaaaa" }));
    b.add(entry({ id: "bbbbbbbbbbbb", usd: 50 }));
    expect(a.list().map((e) => e.id)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
    expect(spentLast24hUsd(a.list(), NOW)).toBe(150);
    a.settle("bbbbbbbbbbbb", { result: "confirmada" });
    expect(b.list()[1]!.result).toBe("confirmada");
    expect(b.list()).toHaveLength(2);
  });

  test("the last five hundred are kept, which is far more than the orders of any day", () => {
    const kept = Array.from({ length: 530 }, (_, i) => entry({ id: newEntryId(), atMs: NOW + i }));
    const storage = memoryStorage({ [TRADE_LOG_KEY]: JSON.stringify(kept) });
    const log = createTradeLog({ storage });
    expect(log.list()).toHaveLength(500);
    expect(log.list()[0]!.atMs).toBe(NOW + 30);
    log.add(entry({ id: newEntryId(), atMs: NOW + 999 }));
    expect(log.list()).toHaveLength(500);
    expect(log.list()[499]!.atMs).toBe(NOW + 999);
  });

  test("the daily cap counts what was asked of the wallet and not refused, in the last 24 hours, whatever the symbol; an approval is not a swap", () => {
    expect(spentLast24hUsd([entry(), entry({ usd: 50, symbol: "BBB", result: "pendente", txHash: null }), entry({ step: "approve", usd: null })], NOW)).toBe(150);
    expect(spentLast24hUsd([entry({ result: "recusada" }), entry({ result: "falhou" }), entry({ result: "revertida" })], NOW)).toBe(0);
  });

  test("an id is plain characters and not repeated", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newEntryId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{8,40}$/);
  });
});
