// ASK-7, AC-ASK-4: the answers of the model that the chart draws. An answer is published when it arrives, an ignored one stops
// being drawn, a muted kind is not drawn, and the store lives on this machine for a day. Nothing here sends an order.
import { describe, expect, test } from "bun:test";
import { COMPRAR } from "../veredito/test-fixtures";
import { DECISIONS_KEY, MAX_KEPT, createDecisionStore, forInstrument, type StoredDecision } from "./decision-store";

class Store {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const NOW = 1_800_000_000_000;
const entry = (over: Partial<StoredDecision> = {}): StoredDecision => ({
  action: "buy", candidateId: "spot:BTC-USDT", atMs: NOW - 60_000, instId: "BTC-USDT", modelo: "jev-latest", kind: "spot", status: "nova", ...over,
});

describe("the store", () => {
  test("publishing notifies the listeners once and the list comes back oldest first", () => {
    const store = createDecisionStore(null, () => NOW);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.publish(entry({ atMs: NOW - 120_000 }));
    store.publish(entry({ atMs: NOW - 60_000, action: "sell" }));
    expect(calls).toBe(2);
    expect(store.list().map((d) => d.action)).toEqual(["buy", "sell"]);
  });

  test("the snapshot is the same array until something changes (so a screen can subscribe to it)", () => {
    const store = createDecisionStore(null, () => NOW);
    store.publish(entry());
    const first = store.list();
    expect(store.list()).toBe(first);
    store.publish(entry({ atMs: NOW - 1000 }));
    expect(store.list()).not.toBe(first);
  });

  test("unsubscribing stops the calls", () => {
    const store = createDecisionStore(null, () => NOW);
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    off();
    store.publish(entry());
    expect(calls).toBe(0);
  });

  test("resolve marks one answer accepted or ignored and notifies; an unknown one does nothing", () => {
    const store = createDecisionStore(null, () => NOW);
    store.publish(entry());
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.resolve("BTC-USDT", NOW - 60_000, false);
    expect(store.list()[0]!.status).toBe("ignorada");
    store.resolve("BTC-USDT", NOW - 60_000, true);
    expect(store.list()[0]!.status).toBe("aceita");
    store.resolve("ETH-USDT", NOW - 60_000, true);
    store.resolve("BTC-USDT", 1, true);
    expect(calls).toBe(2);
  });

  test("touch only notifies (a muted kind changed elsewhere)", () => {
    const store = createDecisionStore(null, () => NOW);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const before = store.list();
    store.touch();
    expect(calls).toBe(1);
    expect(store.list()).not.toBe(before);
  });

  test("it keeps at most MAX_KEPT answers and drops the oldest", () => {
    const store = createDecisionStore(null, () => NOW);
    for (let i = 0; i < MAX_KEPT + 7; i += 1) store.publish(entry({ atMs: NOW - 1_000_000 + i }));
    expect(store.list()).toHaveLength(MAX_KEPT);
    expect(store.list()[0]!.atMs).toBe(NOW - 1_000_000 + 7);
  });
});

describe("persistence", () => {
  test("answers survive a reload, and the ones older than a day are not read back", () => {
    const storage = new Store();
    const first = createDecisionStore(storage, () => NOW);
    first.publish(entry());
    first.publish(entry({ atMs: NOW - 90_000_000 }));
    const second = createDecisionStore(storage, () => NOW);
    expect(second.list()).toHaveLength(1);
    expect(storage.data.has(DECISIONS_KEY)).toBe(true);
  });

  test("only the documented fields are stored, and a malformed entry is dropped", () => {
    const storage = new Store();
    storage.data.set(DECISIONS_KEY, JSON.stringify([entry(), { ...entry(), action: "fly" }, { nope: 1 }, "x", { ...entry({ atMs: NOW - 5000 }), extra: "razao do modelo", apiKey: "k" }]));
    const store = createDecisionStore(storage, () => NOW);
    expect(store.list()).toHaveLength(2);
    store.publish(entry({ atMs: NOW - 10 }));
    const raw = storage.data.get(DECISIONS_KEY)!;
    expect(raw).not.toContain("razao do modelo");
    expect(raw).not.toContain("apiKey");
  });

  test("a blocked storage or broken JSON never breaks the screen", () => {
    const broken = new Store();
    broken.data.set(DECISIONS_KEY, "{oops");
    expect(createDecisionStore(broken, () => NOW).list()).toEqual([]);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const store = createDecisionStore(throwing, () => NOW);
    expect(() => store.publish(entry())).not.toThrow();
    expect(store.list()).toHaveLength(1);
  });
});

describe("forInstrument", () => {
  const list = [
    entry({ atMs: NOW - 300_000, action: "sell", candidateId: "perp:BTC-USDT-SWAP", kind: "perp" }),
    entry({ atMs: NOW - 200_000, instId: "ETH-USDT", candidateId: "spot:ETH-USDT" }),
    entry({ atMs: NOW - 100_000, status: "ignorada" }),
    entry({ atMs: NOW - 50_000, action: "hold", candidateId: null, kind: "manter" }),
    entry({ atMs: NOW - 400_000, candidateId: "zona:a1b2c3d4e5f6", kind: "zona" }),
  ];

  test("the newest answer for the instrument is the latest and the rest is the trail, oldest first", () => {
    const view = forInstrument(list, "BTC-USDT", new Set(), NOW);
    expect(view.latest?.action).toBe("hold");
    expect(view.trail.map((d) => d.atMs)).toEqual([NOW - 400_000, NOW - 300_000]);
  });

  test("an ignored answer, another instrument and a muted kind are not drawn; holding is never muted", () => {
    const muted = forInstrument(list, "BTC-USDT", new Set(["perp", "manter"] as const), NOW);
    expect(muted.trail.map((d) => d.candidateId)).toEqual(["zona:a1b2c3d4e5f6"]);
    expect(muted.latest?.action).toBe("hold");
    expect(forInstrument(list, "SOL-USDT", new Set(), NOW)).toEqual({ latest: null, trail: [] });
  });

  test("the result carries only what the chart draws", () => {
    const view = forInstrument(list, "BTC-USDT", new Set(), NOW);
    expect(Object.keys(view.latest!).sort()).toEqual(["action", "atMs", "candidateId", "instId", "modelo"]);
  });

  test("the trail is bounded", () => {
    const many = Array.from({ length: 40 }, (_, i) => entry({ atMs: NOW - 1_000_000 + i * 10 }));
    expect(forInstrument(many, "BTC-USDT", new Set(), NOW).trail.length).toBeLessThanOrEqual(20);
  });
});

describe("the verdict that came with the answer", () => {
  test("it is kept with the answer, comes back from storage and reaches what the chart and the thermometer read", () => {
    const storage = new Store();
    createDecisionStore(storage, () => NOW).publish(entry({ veredito: COMPRAR }));
    const again = createDecisionStore(storage, () => NOW);
    expect(again.list()[0]!.veredito).toEqual(COMPRAR);
    expect(forInstrument(again.list(), "BTC-USDT", new Set(), NOW).latest?.veredito).toEqual(COMPRAR);
  });

  test("an answer without a verdict is stored as before, with none", () => {
    const store = createDecisionStore(null, () => NOW);
    store.publish(entry());
    expect("veredito" in store.list()[0]!).toBe(false);
    expect("veredito" in forInstrument(store.list(), "BTC-USDT", new Set(), NOW).latest!).toBe(false);
  });

  test("a verdict that is not exactly a verdict is dropped and the answer stays: a hand edited store never reaches the screen", () => {
    const storage = new Store();
    const forged = [
      { ...COMPRAR, selo: "ganhar" }, { ...COMPRAR, extra: 1 }, { ...COMPRAR, plano: { ...COMPRAR.plano, alvo: "alto" } }, { ...COMPRAR, motivos: ["x".repeat(500)] }, "texto", 7,
    ];
    storage.setItem(DECISIONS_KEY, JSON.stringify(forged.map((veredito, i) => ({ ...entry({ atMs: NOW - 1000 * (i + 1) }), veredito }))));
    const list = createDecisionStore(storage, () => NOW).list();
    expect(list.length).toBe(forged.length);
    expect(list.every((d) => !("veredito" in d))).toBe(true);
  });

  test("a verdict is not invented by resolving an answer", () => {
    const store = createDecisionStore(null, () => NOW);
    store.publish(entry({ veredito: COMPRAR }));
    store.resolve("BTC-USDT", NOW - 60_000, true);
    expect(store.list()[0]!.status).toBe("aceita");
    expect(store.list()[0]!.veredito).toEqual(COMPRAR);
  });
});
