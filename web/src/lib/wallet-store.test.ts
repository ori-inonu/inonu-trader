import { describe, expect, test } from "bun:test";
import { createWalletStore } from "./wallet-store";
import type { Eip1193Provider, Eip1193RequestArguments, OkxDiscoverySurface } from "./okx-wallet";

const address = "0x2222222222222222222222222222222222222222";

class Provider implements Eip1193Provider {
  requests: string[] = [];
  handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  account = address;
  chain = "0x8f";
  switching: Promise<unknown> | null = null;
  async request({ method }: Eip1193RequestArguments): Promise<unknown> {
    this.requests.push(method);
    if (method === "wallet_switchEthereumChain") return this.switching;
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [this.account];
    if (method === "eth_chainId") return this.chain;
    if (method === "eth_blockNumber") return "0x10";
    if (method === "eth_getBalance") return "0x0";
    if (method === "eth_call") return "0x" + "0".repeat(64);
    throw new Error("Unexpected method at provider boundary");
  }
  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(listener);
    this.handlers.set(event, listeners);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void) { this.handlers.get(event)?.delete(listener); }
  emit(event: string, value?: unknown) { for (const listener of this.handlers.get(event) ?? []) listener(value); }
}

function surface(provider?: Provider): OkxDiscoverySurface {
  return Object.assign(new EventTarget(), { okxwallet: provider });
}

describe("shared OKX browser session", () => {
  test("two panels observe one explicit local connection and the last release removes provider listeners", async () => {
    const provider = new Provider();
    const store = createWalletStore();
    const browser = surface(provider);
    const releaseWallet = store.retain(browser);
    const releasePipeline = store.retain(browser);
    expect(provider.requests).toEqual([]);
    await store.connect();
    for (let attempts = 0; !store.getSnapshot().identityKey && attempts < 20; attempts++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getSnapshot()).toMatchObject({ available: true, ready: true, identityKey: "0b4551e762d94e9a5a3f5b8de18ec9493e702aaf7571d7ea9e42783ebfc230fd", snapshot: { account: address, status: "connected" } });
    releaseWallet();
    expect(store.getSnapshot().snapshot.account).toBe(address);
    expect([...provider.handlers.values()].every((listeners) => listeners.size > 0)).toBe(true);
    releasePipeline();
    expect(store.getSnapshot().snapshot.account).toBeNull();
    expect([...provider.handlers.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(provider.requests).not.toContain("eth_sendTransaction");
  });

  test("a network switch invalidates the shared identity revision before a delayed provider finishes", async () => {
    const provider = new Provider();
    let finish!: (value: unknown) => void;
    provider.switching = new Promise((resolve) => { finish = resolve; });
    const store = createWalletStore();
    const release = store.retain(surface(provider));
    await store.connect();
    const revision = store.getSnapshot().revision;
    const changing = store.switchToXLayer();
    expect(store.getSnapshot().revision).toBeGreaterThan(revision);
    store.disconnect();
    finish(null);
    await changing;
    expect(store.getSnapshot()).toMatchObject({ identityKey: null, snapshot: { account: null, balances: null } });
    release();
  });
});
