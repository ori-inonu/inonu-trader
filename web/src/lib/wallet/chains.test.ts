// T9.2, WAL-2, AC-WAL-1: switching the network of the connected wallet, and adding it when the wallet does not know it. Only the click of a
// person calls this, only for networks the app lists, one request at a time. The only methods it may use are the two that change the network and
// the read that confirms it: it cannot sign and it cannot send. The provider here is ALWAYS a fake; the real extension is checked by hand
// (T1.1). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { EVM_CHAINS } from "../evm-multichain";
import { ALLOWED_METHODS, SWITCHABLE_CHAINS, addChainParams, switchChain } from "./chains";

type Step = { readonly result?: unknown; readonly error?: unknown; readonly never?: true };

/** A provider that answers each method from a script, in order, and records what it was asked. */
function fakeProvider(script: Record<string, Step[]>) {
  const asked: { method: string; params: unknown }[] = [];
  const queues = new Map(Object.entries(script).map(([method, steps]) => [method, [...steps]]));
  return {
    asked,
    provider: {
      request: (args: { method: string; params?: unknown }): Promise<unknown> => {
        asked.push({ method: args.method, params: args.params });
        const step = queues.get(args.method)?.shift();
        if (step === undefined) return Promise.reject({ code: -32601 });
        if (step.never) return new Promise(() => {});
        if (step.error !== undefined) return Promise.reject(step.error);
        return Promise.resolve(step.result ?? null);
      },
    },
  };
}

const methods = (asked: { method: string }[]) => asked.map((a) => a.method);
const BASE = "0x2105";

describe("the networks the app lists", () => {
  test("they are the registry of the EVM balances, Monad and X Layer first, each with a name and its hex id", () => {
    expect(SWITCHABLE_CHAINS.map((c) => c.name)).toEqual(EVM_CHAINS.map((c) => c.name));
    expect(SWITCHABLE_CHAINS.slice(0, 2).map((c) => c.chainIdHex)).toEqual(["0x8f", "0xc4"]);
    expect(SWITCHABLE_CHAINS.length).toBeGreaterThanOrEqual(8);
    for (const chain of SWITCHABLE_CHAINS) expect(chain.chainIdHex).toMatch(/^0x[1-9a-f][0-9a-f]*$/);
  });

  test("the parameters to add a network are the registry's own: https RPC only, an 18 decimal native currency, no field we invented", () => {
    for (const spec of EVM_CHAINS) {
      const params = addChainParams(spec);
      expect(Object.keys(params).sort()).toEqual(["chainId", "chainName", "nativeCurrency", "rpcUrls"]);
      expect(params.chainId).toBe(spec.chainIdHex);
      expect(params.chainName).toBe(spec.name);
      expect(params.nativeCurrency).toEqual({ name: spec.nativeSymbol, symbol: spec.nativeSymbol, decimals: 18 });
      expect(params.rpcUrls).toEqual([spec.rpcUrl]);
      expect(params.rpcUrls.every((url) => url.startsWith("https://"))).toBe(true);
    }
  });
});

describe("switching", () => {
  test("a network the wallet knows: one switch, then one read to confirm it, and nothing else", async () => {
    const { provider, asked } = fakeProvider({ wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: BASE }] });
    expect(await switchChain(provider, BASE)).toEqual({ ok: true, added: false });
    expect(methods(asked)).toEqual(["wallet_switchEthereumChain", "eth_chainId"]);
    expect(asked[0]!.params).toEqual([{ chainId: BASE }]);
  });

  test("the id may come in capitals; the request carries the registry's own", async () => {
    const { provider, asked } = fakeProvider({ wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: BASE }] });
    expect((await switchChain(provider, "0X2105")).ok).toBe(true);
    expect(asked[0]!.params).toEqual([{ chainId: BASE }]);
  });

  test("a network that is not in the list is refused before the wallet is asked anything", async () => {
    const { provider, asked } = fakeProvider({});
    for (const bad of ["0x1234567", "0x", "", "8453", "0xZZ", "base"]) {
      const result = await switchChain(provider, bad);
      expect(result).toMatchObject({ ok: false, error: { kind: "rede_desconhecida" } });
    }
    expect(asked).toEqual([]);
  });

  test("a refusal by the person ends it: no network is added behind their back, and the text says it was refused", async () => {
    const { provider, asked } = fakeProvider({ wallet_switchEthereumChain: [{ error: { code: 4001, message: "User rejected" } }] });
    const result = await switchChain(provider, BASE);
    expect(result).toMatchObject({ ok: false, error: { kind: "recusado", code: 4001 } });
    expect(methods(asked)).toEqual(["wallet_switchEthereumChain"]);
  });

  test("the wallet's answer must say the network is now the one asked for, or the switch is not claimed", async () => {
    const { provider } = fakeProvider({ wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: "0x1" }] });
    expect(await switchChain(provider, BASE)).toMatchObject({ ok: false, error: { kind: "rede_nao_confirmada" } });
    const garbage = fakeProvider({ wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: { chainId: BASE } }] });
    expect(await switchChain(garbage.provider, BASE)).toMatchObject({ ok: false, error: { kind: "rede_nao_confirmada" } });
  });
});

describe("a network the wallet does not know (4902)", () => {
  test("it is added with the registry's parameters, once, and then confirmed", async () => {
    const { provider, asked } = fakeProvider({
      wallet_switchEthereumChain: [{ error: { code: 4902 } }],
      wallet_addEthereumChain: [{ result: null }],
      eth_chainId: [{ result: BASE }],
    });
    expect(await switchChain(provider, BASE)).toEqual({ ok: true, added: true });
    expect(methods(asked)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId"]);
    const spec = EVM_CHAINS.find((c) => c.chainIdHex === BASE)!;
    expect(asked[1]!.params).toEqual([addChainParams(spec)]);
  });

  test("a wallet that adds the network without switching to it is asked once more to switch, and no more than once", async () => {
    const { provider, asked } = fakeProvider({
      wallet_switchEthereumChain: [{ error: { code: 4902 } }, { result: null }],
      wallet_addEthereumChain: [{ result: null }],
      eth_chainId: [{ result: "0x1" }, { result: BASE }],
    });
    expect(await switchChain(provider, BASE)).toEqual({ ok: true, added: true });
    expect(methods(asked)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);

    const stuck = fakeProvider({
      wallet_switchEthereumChain: [{ error: { code: 4902 } }, { result: null }],
      wallet_addEthereumChain: [{ result: null }],
      eth_chainId: [{ result: "0x1" }, { result: "0x1" }],
    });
    expect(await switchChain(stuck.provider, BASE)).toMatchObject({ ok: false, error: { kind: "rede_nao_confirmada" } });
    expect(methods(stuck.asked).filter((m) => m === "wallet_switchEthereumChain")).toHaveLength(2);
  });

  test("a wallet that answers 4902 to the add itself is not told that it does not know the network: it refused to add it", async () => {
    const { provider, asked } = fakeProvider({ wallet_switchEthereumChain: [{ error: { code: 4902 } }], wallet_addEthereumChain: [{ error: { code: 4902 } }] });
    const result = await switchChain(provider, BASE);
    expect(result).toMatchObject({ ok: false, error: { kind: "rede_desconhecida", code: 4902 } });
    expect((result as { error: { text: string } }).error.text).toContain("nao aceitou adicionar");
    expect(methods(asked)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain"]);
  });

  test("a refusal to add ends it, with the add asked exactly once", async () => {
    const { provider, asked } = fakeProvider({ wallet_switchEthereumChain: [{ error: { code: 4902 } }], wallet_addEthereumChain: [{ error: { code: 4001 } }] });
    expect(await switchChain(provider, BASE)).toMatchObject({ ok: false, error: { kind: "recusado" } });
    expect(methods(asked)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain"]);
  });
});

describe("one request at a time, and never forever", () => {
  test("while one is waiting for the person, another is refused without asking the wallet again, and the way is free afterwards", async () => {
    const first = fakeProvider({ wallet_switchEthereumChain: [{ never: true }] });
    const waiting = switchChain(first.provider, BASE, { timeoutMs: 40 });
    const second = await switchChain(first.provider, "0xa");
    expect(second).toMatchObject({ ok: false, error: { kind: "pedido_pendente" } });
    expect(methods(first.asked)).toEqual(["wallet_switchEthereumChain"]);
    // the first one gives up at its timeout, and the slot is free
    expect(await waiting).toMatchObject({ ok: false, error: { kind: "tempo_esgotado" } });
    const again = fakeProvider({ wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: "0xa" }] });
    expect(await switchChain(again.provider, "0xa")).toEqual({ ok: true, added: false });
  });

  test("the slot belongs to the wallet: two different wallets do not wait for each other", async () => {
    const one = fakeProvider({ wallet_switchEthereumChain: [{ never: true }] });
    const two = fakeProvider({ wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: BASE }] });
    const waiting = switchChain(one.provider, BASE, { timeoutMs: 30 });
    expect(await switchChain(two.provider, BASE)).toEqual({ ok: true, added: false });
    await waiting;
  });

  test("the slot is freed after a refusal too", async () => {
    const { provider } = fakeProvider({ wallet_switchEthereumChain: [{ error: { code: 4001 } }, { result: null }], eth_chainId: [{ result: BASE }] });
    expect((await switchChain(provider, BASE)).ok).toBe(false);
    expect((await switchChain(provider, BASE)).ok).toBe(true);
  });
});

describe("a wallet that misbehaves", () => {
  /** The timers a call leaves behind: every one it sets must be cleared by the time it answers. */
  async function outstandingTimers(work: () => Promise<unknown>): Promise<number> {
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const open = new Set<unknown>();
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const id = realSet(fn, ms);
      open.add(id);
      return id;
    }) as never;
    globalThis.clearTimeout = ((id: never) => {
      open.delete(id);
      realClear(id);
    }) as never;
    try {
      await work();
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
    const left = open.size;
    for (const id of open) realClear(id as never);
    return left;
  }

  test("a request that throws at once, or answers with something that is not a promise, ends cleanly and leaves no timer running", async () => {
    const throwing = { request: (): Promise<unknown> => { throw new Error("sync"); } };
    expect(await outstandingTimers(async () => expect(await switchChain(throwing, BASE)).toMatchObject({ ok: false, error: { kind: "desconhecido" } }))).toBe(0);
    const plain = { request: (): Promise<unknown> => "0x2105" as never };
    expect(await outstandingTimers(async () => expect(await switchChain(plain, BASE)).toEqual({ ok: true, added: false }))).toBe(0);
    // the slot of both is free afterwards
    expect(await switchChain(plain, BASE)).toEqual({ ok: true, added: false });
  });

  test("no wallet at all is a result, not an exception", async () => {
    for (const nothing of [null, undefined, 42, "x", {}]) {
      expect(await switchChain(nothing as never, BASE)).toMatchObject({ ok: false, error: { kind: "desconectado" } });
    }
  });
});

describe("what it can ask the wallet", () => {
  test("only the two that change the network and the one that reads it: it cannot sign and it cannot send", async () => {
    expect([...ALLOWED_METHODS].sort()).toEqual(["eth_chainId", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
    const all: string[] = [];
    const scenarios: Array<Record<string, Step[]>> = [
      { wallet_switchEthereumChain: [{ result: null }], eth_chainId: [{ result: BASE }] },
      { wallet_switchEthereumChain: [{ error: { code: 4902 } }], wallet_addEthereumChain: [{ result: null }], eth_chainId: [{ result: BASE }] },
      { wallet_switchEthereumChain: [{ error: { code: 4902 } }, { error: { code: 4100 } }], wallet_addEthereumChain: [{ result: null }], eth_chainId: [{ result: "0x1" }] },
      { wallet_switchEthereumChain: [{ error: { code: -32002 } }] },
    ];
    for (const script of scenarios) {
      const { provider, asked } = fakeProvider(script);
      await switchChain(provider, BASE);
      all.push(...methods(asked));
    }
    expect(all.length).toBeGreaterThan(6);
    for (const method of all) expect(ALLOWED_METHODS.has(method)).toBe(true);
  });

  test("the message the wallet wrote does not travel in the result", async () => {
    const SENTINEL = "SENTINEL-0xdeadbeef";
    const { provider } = fakeProvider({ wallet_switchEthereumChain: [{ error: { code: -32603, message: SENTINEL, data: SENTINEL } }] });
    const result = await switchChain(provider, BASE);
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
  });
});
