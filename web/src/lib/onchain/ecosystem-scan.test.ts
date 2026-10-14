// The scan behind the opportunity board: two reads per network, one network after the other, a failure on one network never stops the others, and the store keeps what was read.
// origin: synthetic_fixture, tests only. No network.
import { describe, expect, test } from "bun:test";
import type { HotToken, OnchainMeta, OnchainResult, Signal } from "./client";
import { createEcosystemStore, DEFAULT_SCAN_CHAINS, loadChains, parseChains, SCAN_MAX_CHAINS, SCAN_STORAGE_KEY, saveChains, scanChain, targetsOf } from "./ecosystem-scan";

const META = { source: "okx-onchainos", tier: "basic", ageMs: 0, stale: false } as unknown as OnchainMeta;
const ok = <T,>(data: T): OnchainResult<T> => ({ ok: true, data, meta: META });
const fail = (error: string): OnchainResult<never> => ({ ok: false, error: error as never });

const TOKEN = { chainIndex: "501", symbol: "AAA", address: "AAA1" } as unknown as HotToken;
const SIGNAL = { tsMs: 1, chainIndex: "501", walletType: "smart_money", walletCount: 3, amountUsd: 1, priceUsd: 1, soldRatioPct: 0, token: { address: "AAA1", symbol: "AAA", marketCap: null, holders: null, top10HoldPct: null } } as unknown as Signal;

function fakeClient(plan: Record<string, { hot?: OnchainResult<HotToken[]>; signals?: OnchainResult<Signal[]> }> = {}) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      hotTokens: async (p: { chainIndex: string; timeFrame?: number; limit?: number }, intent?: string) => {
        calls.push(`hot:${p.chainIndex}:${p.timeFrame}:${p.limit}:${intent}`);
        return plan[p.chainIndex]?.hot ?? ok([TOKEN]);
      },
      signals: async (p: { chainIndex: string; walletType?: string; limit?: number }, intent?: string) => {
        calls.push(`signals:${p.chainIndex}:${p.walletType}:${p.limit}:${intent}`);
        return plan[p.chainIndex]?.signals ?? ok([SIGNAL]);
      },
    },
  };
}

describe("one network", () => {
  test("reads the hot list and the tracked wallets as a click would, both on the same network", async () => {
    const { client, calls } = fakeClient();
    const scanned = await scanChain(client, { chainIndex: "501", name: "Solana" }, () => 42);
    expect(calls.sort()).toEqual(["hot:501:4:100:user", "signals:501:1,2,3:100:user"]);
    expect(scanned).toMatchObject({ chainIndex: "501", chainName: "Solana", hotError: null, signalsError: null, atMs: 42 });
    expect(scanned.hot).toHaveLength(1);
    expect(scanned.signals).toHaveLength(1);
  });

  test("a read that fails is a note in words and a null list, and the other read still counts", async () => {
    const { client } = fakeClient({ "501": { signals: fail("provider_error") } });
    const scanned = await scanChain(client, { chainIndex: "501", name: "Solana" }, () => 1);
    expect(scanned.hot).toHaveLength(1);
    expect(scanned.signals).toBeNull();
    expect(scanned.signalsError).toBe("OnchainOS indisponivel agora");
  });

  test("a read that throws does not escape", async () => {
    const client = { hotTokens: async () => { throw new Error("boom"); }, signals: async () => ok<Signal[]>([]) };
    const scanned = await scanChain(client as never, { chainIndex: "56", name: "BNB Chain" }, () => 1);
    expect(scanned.hot).toBeNull();
    expect(scanned.hotError).toBe("A leitura nao chegou ao servidor local");
    expect(scanned.signals).toEqual([]);
  });
});

describe("the store", () => {
  test("scans the networks in order, one after the other, and keeps the result with its times", async () => {
    let t = 100;
    const store = createEcosystemStore(() => t++);
    const { client, calls } = fakeClient();
    const seen: string[] = [];
    store.subscribe(() => seen.push(`${store.getState().status}:${store.getState().scans.length}`));
    await store.start(client, targetsOf(["501", "8453"]));
    const done = store.getState();
    expect(done.status).toBe("ready");
    expect(done.scans.map((s) => s.chainIndex)).toEqual(["501", "8453"]);
    expect(done.finishedAtMs).toBeGreaterThan(done.startedAtMs!);
    // the second network is not asked before the first one answered
    expect(calls.findIndex((c) => c.startsWith("hot:8453"))).toBeGreaterThan(calls.findIndex((c) => c.startsWith("signals:501")));
    expect(seen[0]).toBe("scanning:0");
    expect(seen.at(-1)).toBe("ready:2");
  });

  test("a failed network does not stop the others", async () => {
    const store = createEcosystemStore();
    const { client } = fakeClient({ "501": { hot: fail("provider_error"), signals: fail("provider_error") } });
    await store.start(client, targetsOf(["501", "56"]));
    const [first, second] = store.getState().scans;
    expect(first!.hot).toBeNull();
    expect(second!.hot).toHaveLength(1);
  });

  test("a second click while a scan runs reads nothing more", async () => {
    const store = createEcosystemStore();
    const { client, calls } = fakeClient();
    const first = store.start(client, targetsOf(["501"]));
    await store.start(client, targetsOf(["501"]));
    await first;
    expect(calls).toHaveLength(2);
  });

  test("nothing chosen reads nothing", async () => {
    const store = createEcosystemStore();
    const { client, calls } = fakeClient();
    await store.start(client, []);
    expect(calls).toEqual([]);
    expect(store.getState().status).toBe("idle");
  });
});

describe("the chosen networks", () => {
  test("only networks the desk names are kept, once each, at most the cap; anything else is the default", () => {
    expect(parseChains(["501", "501", "999999", 5, "8453"])).toEqual(["501", "8453"]);
    expect(parseChains(["0", "1", "196", "195", "501", "8453", "56", "784"])).toHaveLength(SCAN_MAX_CHAINS);
    expect(parseChains("501")).toEqual(DEFAULT_SCAN_CHAINS);
    expect(parseChains([])).toEqual(DEFAULT_SCAN_CHAINS);
    expect(targetsOf(["501", "nope"])).toEqual([{ chainIndex: "501", name: "Solana" }]);
  });

  test("the choice is remembered, and a broken or blocked storage is the default", () => {
    const box = new Map<string, string>();
    const storage = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
    saveChains(["56", "1"], storage);
    expect(box.get(SCAN_STORAGE_KEY)).toBe('["56","1"]');
    expect(loadChains(storage)).toEqual(["56", "1"]);
    box.set(SCAN_STORAGE_KEY, "not json");
    expect(loadChains(storage)).toEqual(DEFAULT_SCAN_CHAINS);
    expect(loadChains({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_SCAN_CHAINS);
    expect(() => saveChains(["1"], { setItem: () => { throw new Error("full"); } })).not.toThrow();
  });
});
