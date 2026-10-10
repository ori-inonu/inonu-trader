import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletPanelView } from "../components/WalletPanel/WalletPanel";
import type { WalletSnapshot } from "./okx-wallet";
import {
  createWalletSession,
  discoverOkxProvider,
  type Eip1193Provider,
  type Eip1193RequestArguments,
} from "./okx-wallet";

class DiscoverySurface extends EventTarget {
  okxwallet: unknown;
}

function provider(): Eip1193Provider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async request({ method }) {
      calls.push(method);
      return [];
    },
    on() {},
    removeListener() {},
  };
}

class RequestProvider implements Eip1193Provider {
  readonly requests: Eip1193RequestArguments[] = [];
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(private readonly respond: (method: string, args: Eip1193RequestArguments) => unknown | Promise<unknown>) {}

  async request(args: Eip1193RequestArguments): Promise<unknown> {
    this.requests.push(args);
    return this.respond(args.method, args);
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(listener);
    this.handlers.set(event, listeners);
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): void {
    this.handlers.get(event)?.delete(listener);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForRequest(wallet: RequestProvider, method: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (wallet.requests.some((request) => request.method === method)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${method} in the test provider.`);
}

async function waitForSnapshot(
  session: ReturnType<typeof createWalletSession>,
  predicate: (snapshot: ReturnType<typeof session.getSnapshot>) => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (predicate(session.getSnapshot())) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for the expected wallet snapshot.");
}
const validAccount = "0x1111111111111111111111111111111111111111";

describe("OKX provider discovery", () => {
  it("uses only the anchored provider reference and never asks for accounts", () => {
    const anchor = provider();
    const impostor = provider();
    const surface = new DiscoverySurface();
    surface.okxwallet = anchor;
    const found: Eip1193Provider[] = [];

    const cleanup = discoverOkxProvider(surface, (wallet) => found.push(wallet));
    surface.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { name: "OKX Wallet", rdns: "com.okx.wallet" },
          provider: impostor,
        },
      }),
    );

    expect(found).toEqual([anchor]);
    expect(anchor.calls).toEqual([]);
    expect(impostor.calls).toEqual([]);
    cleanup();
  });

  it("does not trust a metadata-only EIP-6963 announcement without the anchor", () => {
    const impostor = provider();
    const surface = new DiscoverySurface();
    surface.okxwallet = undefined;
    const found: Eip1193Provider[] = [];

    const cleanup = discoverOkxProvider(surface, (wallet) => found.push(wallet));
    surface.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { name: "OKX Wallet", rdns: "com.okx.wallet" },
          provider: impostor,
        },
      }),
    );

    expect(found).toEqual([]);
    expect(impostor.calls).toEqual([]);
    cleanup();
  });
});

describe("OKX wallet session", () => {
  it("requests accounts only after explicit connect and blocks the wrong network", async () => {
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);

    expect(wallet.requests).toEqual([]);
    await session.connect();

    expect(wallet.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
    ]);
    expect(session.getSnapshot()).toMatchObject({
      status: "wrong-network",
      account: validAccount,
      chainId: "0x1",
      balances: null,
    });
    session.dispose();
  });

  it("reads exact MON and USDC balances at one block using the documented USDC contract", async () => {
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return "0xabc";
      if (method === "eth_getBalance") return "0x3635c9adc5dea004d2";
      if (method === "eth_call") return `0x${"00".repeat(24)}0000000000bc614e`;
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);

    await session.connect();

    expect(session.getSnapshot()).toMatchObject({
      status: "connected",
      account: validAccount,
      chainId: "0x8f",
      balances: {
        mon: "1000.000000000000001234",
        usdc: "12.345678",
        block: "0xabc",
      },
    });
    const nativeRead = wallet.requests.find(({ method }) => method === "eth_getBalance");
    const tokenRead = wallet.requests.find(({ method }) => method === "eth_call");
    const tokenTarget = (tokenRead?.params as [{ to: string }, string] | undefined)?.[0].to;
    expect(tokenTarget).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(tokenTarget).toBe("0x754704Bc059F8C67012fEd69BC8A327a5aafb603");
    expect(nativeRead?.params).toEqual([validAccount, "0xabc"]);
    expect(tokenRead?.params).toEqual([
      {
        to: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
        data: `0x70a08231${validAccount.slice(2).toLowerCase().padStart(64, "0")}`,
      },
      "0xabc",
    ]);
    expect(wallet.requests.filter(({ method }) => method === "eth_call")).toHaveLength(1);
    session.dispose();
  });

  it("blocks malformed RPC values and turns a stalled balance request into unavailable data", async () => {
    for (const [methodToCorrupt, badValue] of [
      ["eth_getBalance", "0x00"],
      ["eth_call", "0x1234"],
    ] as const) {
      const wallet = new RequestProvider((method) => {
        if (method === "eth_requestAccounts") return [validAccount];
        if (method === "eth_chainId") return "0x8f";
        if (method === "eth_blockNumber") return "0xabc";
        if (method === methodToCorrupt) return badValue;
        if (method === "eth_getBalance") return "0x0";
        if (method === "eth_call") return `0x${"00".repeat(32)}`;
        throw new Error(`Unexpected provider method: ${method}`);
      });
      const session = createWalletSession(wallet);

      await session.connect();

      expect(session.getSnapshot().status).toBe("error");
      expect(session.getSnapshot().balances).toBeNull();
      expect(wallet.requests.filter(({ method }) => method === methodToCorrupt)).toHaveLength(1);
      session.dispose();
    }

    const stalled = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return new Promise(() => {});
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const timedSession = createWalletSession(stalled, { timeoutMs: 10 });

    await timedSession.connect();

    expect(timedSession.getSnapshot().status).toBe("error");
    expect(timedSession.getSnapshot().balances).toBeNull();
    expect(stalled.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "eth_blockNumber",
    ]);
    timedSession.dispose();
  });

  it("reports empty, malformed, and rejected account authorization without exposing provider errors", async () => {
    for (const [accounts, expectedStatus] of [
      [[], "disconnected"],
      [["not-an-address"], "error"],
    ] as const) {
      const wallet = new RequestProvider((method) => {
        if (method === "eth_requestAccounts") return accounts;
        throw new Error(`Unexpected provider method: ${method}`);
      });
      const session = createWalletSession(wallet);

      await session.connect();

      expect(session.getSnapshot().status).toBe(expectedStatus);
      expect(wallet.requests.map(({ method }) => method)).toEqual(["eth_requestAccounts"]);
      session.dispose();
    }

    const rejected = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return Promise.reject({
        code: 4001,
        message: "sensitive extension details must not reach the panel",
      });
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const rejectedSession = createWalletSession(rejected);

    await rejectedSession.connect();

    expect(rejectedSession.getSnapshot().status).toBe("error");
    expect(rejectedSession.getSnapshot().error).not.toContain("sensitive extension details");
    expect(rejected.requests.map(({ method }) => method)).toEqual(["eth_requestAccounts"]);
    rejectedSession.dispose();

    const invalidChain = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0x01";
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const invalidChainSession = createWalletSession(invalidChain);

    await invalidChainSession.connect();

    expect(invalidChainSession.getSnapshot()).toMatchObject({
      status: "error",
      chainId: null,
      balances: null,
    });
    expect(invalidChain.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
    ]);
    invalidChainSession.dispose();
  });

  it("switches only on explicit request and rereads the confirmed chain before reading balances", async () => {
    let chainId = "0x1";
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain") {
        chainId = "0x8f";
        return null;
      }
      if (method === "eth_blockNumber") return "0xabc";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return `0x${"00".repeat(32)}`;
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);

    await session.connect();

    expect(session.getSnapshot().status).toBe("wrong-network");
    expect(wallet.requests.some(({ method }) => method === "eth_blockNumber")).toBe(false);
    expect(wallet.requests.some(({ method }) => method === "wallet_switchEthereumChain")).toBe(false);

    await session.switchToMonad();

    expect(wallet.requests.find(({ method }) => method === "wallet_switchEthereumChain")?.params).toEqual([
      { chainId: "0x8f" },
    ]);
    expect(wallet.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "wallet_switchEthereumChain",
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBalance",
      "eth_call",
    ]);
    expect(session.getSnapshot().status).toBe("connected");
    session.dispose();
  });

  it("switches explicitly to X Layer and reads the exact assets after chain confirmation", async () => {
    let chainId = "0x8f";
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain") {
        chainId = "0xc4";
        return null;
      }
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return `0x${"00".repeat(32)}`;
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);
    await session.connect();
    const beforeSwitch = wallet.requests.length;

    await session.switchToXLayer();

    const switchRequests = wallet.requests.slice(beforeSwitch);
    expect(switchRequests[0]).toEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xc4" }],
    });
    expect(switchRequests.map(({ method }) => method)).toEqual([
      "wallet_switchEthereumChain",
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBalance",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
    expect(switchRequests.filter(({ method }) => method === "eth_call").map(({ params }) =>
      (params as [{ to: string }, string])[0].to,
    )).toEqual([
      "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      "0xB6CEceAB302E2E4948951eE7843FC24E92933061",
      "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
      "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
    ]);
    expect(switchRequests.filter(({ method }) => method === "eth_call" || method === "eth_getBalance")
      .every(({ params }) => (params as [unknown, string])[1] === "0x123"),
    ).toBe(true);
    expect(switchRequests.some(({ method }) => method === "wallet_addEthereumChain")).toBe(false);
    expect(switchRequests.some(({ method }) => method === "eth_requestAccounts")).toBe(false);
    expect(session.getSnapshot()).toMatchObject({
      status: "connected",
      chainId: "0xc4",
      balances: {
        network: "xlayer",
        okb: "0",
        usdt: "0",
        usdt0: "0",
        nativeUsdc: "0",
        usdcBridged: "0",
        usdcE: "0",
        block: "0x123",
      },
    });
    session.dispose();
  });

  it("marks the whole X Layer batch unavailable when one token read fails", async () => {
    const rejectedDetails = "private provider response";
    const wallet = new RequestProvider((method, args) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0xc4";
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") {
        const [call] = args.params as [{ to: string }, string];
        if (call.to === "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035") {
          return Promise.reject(new Error(rejectedDetails));
        }
        return `0x${"00".repeat(32)}`;
      }
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);

    await session.connect();

    expect(session.getSnapshot()).toMatchObject({
      status: "error",
      chainId: "0xc4",
      balances: null,
    });
    expect(session.getSnapshot().error).not.toContain(rejectedDetails);
    expect(wallet.requests.filter(({ method }) => method === "eth_call")).toHaveLength(5);
    expect(wallet.requests.some(({ method }) => method === "wallet_addEthereumChain")).toBe(false);
    session.dispose();
  });

  it("rereads chain after the explicit switch emits chainChanged before its request resolves", async () => {
    let chainId = "0x1";
    let wallet!: RequestProvider;
    wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain") {
        chainId = "0x8f";
        wallet.emit("chainChanged", chainId);
        return null;
      }
      if (method === "eth_blockNumber") return "0xabc";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return `0x${"00".repeat(32)}`;
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);

    await session.connect();
    await session.switchToMonad();

    expect(wallet.requests.filter(({ method }) => method === "eth_chainId")).toHaveLength(2);
    expect(session.getSnapshot()).toMatchObject({ chainId: "0x8f", status: "connected" });
    session.dispose();
  });

  it("leaves rejected or unavailable network switches for manual selection", async () => {
    for (const code of [4001, 4902]) {
      const wallet = new RequestProvider((method) => {
        if (method === "eth_requestAccounts") return [validAccount];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") {
          return Promise.reject({ code, message: "private provider details" });
        }
        throw new Error(`Unexpected provider method: ${method}`);
      });
      const session = createWalletSession(wallet);
      await session.connect();
      await session.switchToMonad();

      expect(session.getSnapshot()).toMatchObject({
        status: "wrong-network",
        balances: null,
      });
      expect(session.getSnapshot().error).toContain("manualmente");
      expect(session.getSnapshot().error).not.toContain("private provider details");
      expect(wallet.requests.some(({ method }) => method === "wallet_addEthereumChain")).toBe(false);
      session.dispose();
    }
  });

  it("refreshes using eth_accounts without prompting for new authorization", async () => {
    const wallet = new RequestProvider((method) => {
      if (method === "eth_accounts") return [validAccount];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return "0xabc";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return `0x${"00".repeat(32)}`;
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);

    await session.refresh();

    expect(wallet.requests.map(({ method }) => method)).toEqual([
      "eth_accounts",
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBalance",
      "eth_call",
    ]);
    expect(session.getSnapshot().status).toBe("connected");
    session.dispose();
  });

  it("reconciles a chainChanged event during explicit connection without a second permission prompt", async () => {
    const permission = deferred<unknown>();
    const currentAccount = "0x2222222222222222222222222222222222222222";
    let currentChain = "0xc4";
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return permission.promise;
      if (method === "eth_accounts") return [currentAccount];
      if (method === "eth_chainId") return currentChain;
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return "0x" + "00".repeat(31) + "01";
      throw new Error("Unexpected provider method: " + method);
    });
    const session = createWalletSession(wallet);
    const connecting = session.connect();
    await waitForRequest(wallet, "eth_requestAccounts");

    currentChain = "0xc4";
    wallet.emit("chainChanged", currentChain);
    expect(wallet.requests.map(({ method }) => method)).toEqual(["eth_requestAccounts"]);

    permission.resolve([validAccount]);
    await connecting;

    expect(session.getSnapshot()).toMatchObject({
      status: "connected",
      account: currentAccount,
      chainId: "0xc4",
      balances: { network: "xlayer", usdt: "0.000001", block: "0x123" },
    });
    expect(wallet.requests.filter(({ method }) => method === "eth_requestAccounts")).toHaveLength(1);
    expect(wallet.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_accounts",
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBalance",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
    session.dispose();
  });

  it("reconciles a chainChanged event that invalidates the initial chain read", async () => {
    const initialChain = deferred<unknown>();
    const currentAccount = "0x2222222222222222222222222222222222222222";
    let chainReads = 0;
    let currentChain = "0xc4";
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_accounts") return [currentAccount];
      if (method === "eth_chainId") {
        chainReads++;
        return chainReads === 1 ? initialChain.promise : currentChain;
      }
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return "0x" + "00".repeat(32);
      throw new Error("Unexpected provider method: " + method);
    });
    const session = createWalletSession(wallet);
    const connecting = session.connect();
    await waitForRequest(wallet, "eth_chainId");

    currentChain = "0xc4";
    wallet.emit("chainChanged", currentChain);
    initialChain.resolve("0x8f");
    await connecting;

    expect(session.getSnapshot()).toMatchObject({
      status: "connected",
      account: currentAccount,
      chainId: "0xc4",
      balances: { network: "xlayer", block: "0x123" },
    });
    expect(wallet.requests.filter(({ method }) => method === "eth_requestAccounts")).toHaveLength(1);
    expect(wallet.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "eth_accounts",
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBalance",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
    session.dispose();
  });  it("refreshes after wallet events and prevents delayed balance reads from restoring stale state", async () => {
    const changedAccount = "0x2222222222222222222222222222222222222222";
    for (const event of ["accountsChanged", "chainChanged", "disconnect", "localDisconnect", "dispose"] as const) {
      const staleTokenRead = deferred<unknown>();
      const refreshedTokenRead = deferred<unknown>();
      let tokenCalls = 0;
      let activeAccount = validAccount;
      let activeChain = "0x8f";
      const wallet = new RequestProvider((method) => {
        if (method === "eth_requestAccounts") return [validAccount];
        if (method === "eth_accounts") return [activeAccount];
        if (method === "eth_chainId") return activeChain;
        if (method === "eth_blockNumber") return "0xabc";
        if (method === "eth_getBalance") return "0x0";
        if (method === "eth_call") {
          tokenCalls++;
          return tokenCalls === 1 ? staleTokenRead.promise : refreshedTokenRead.promise;
        }
        throw new Error("Unexpected provider method: " + method);
      });
      const session = createWalletSession(wallet);
      const connecting = session.connect();
      await waitForRequest(wallet, "eth_call");

      if (event === "accountsChanged") {
        activeAccount = changedAccount;
        wallet.emit(event, [changedAccount]);
        await waitForRequest(wallet, "eth_accounts");
        await waitForRequest(wallet, "eth_call");
        refreshedTokenRead.resolve("0x" + "00".repeat(32));
        await waitForSnapshot(
          session,
          (current) => current.account === changedAccount && current.status === "connected" && current.balances !== null,
        );
        const refreshedSnapshot = session.getSnapshot();
        staleTokenRead.resolve("0x" + "00".repeat(31) + "2a");
        await connecting;
        expect(session.getSnapshot()).toEqual(refreshedSnapshot);
        expect(wallet.requests.filter(({ method }) => method === "eth_accounts")).toHaveLength(1);
        expect(wallet.requests.filter(({ method }) => method === "eth_requestAccounts")).toHaveLength(1);
      } else {
        if (event === "chainChanged") {
          activeChain = "0x1";
          wallet.emit(event, "0x1");
        } else if (event === "disconnect") {
          wallet.emit(event, { code: 4900 });
        } else if (event === "dispose") {
          session.dispose();
        } else {
          session.disconnect();
        }
        staleTokenRead.resolve("0x" + "00".repeat(32));
        await connecting;

        expect(session.getSnapshot().balances).toBeNull();
        if (event === "chainChanged") {
          await waitForSnapshot(session, (current) => current.chainId === "0x1" && current.status === "wrong-network");
          expect(session.getSnapshot()).toMatchObject({ chainId: "0x1", status: "wrong-network" });
        } else {
          expect(session.getSnapshot()).toMatchObject({ account: null, status: "disconnected" });
        }
      }
      session.dispose();
    }
  });

  it("coalesces account and network events into a permissionless refresh without prompting", async () => {
    const wallet = new RequestProvider((method) => {
      if (method === "eth_accounts") return [validAccount];
      if (method === "eth_chainId") return "0xc4";
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return "0x" + "00".repeat(32);
      throw new Error("Unexpected provider method: " + method);
    });
    const session = createWalletSession(wallet);

    wallet.emit("accountsChanged", [validAccount]);
    wallet.emit("chainChanged", "0xc4");
    expect(wallet.requests).toEqual([]);
    await waitForSnapshot(
      session,
      (current) => current.status === "connected" && current.chainId === "0xc4" && current.balances !== null,
    );

    expect(wallet.requests.filter(({ method }) => method === "eth_accounts")).toHaveLength(1);
    expect(wallet.requests.some(({ method }) => method === "eth_requestAccounts")).toBe(false);
    expect(session.getSnapshot().balances).toMatchObject({ network: "xlayer" });
    session.dispose();
  });

  it("does not claim Monad when an account event arrives before the network is known", async () => {
    const wallet = new RequestProvider(() => {
      throw new Error("noRPC");
    });
    const session = createWalletSession(wallet);

    wallet.emit("accountsChanged", [validAccount]);

    expect(session.getSnapshot()).toEqual({
      status: "error",
      account: validAccount,
      chainId: null,
      balances: null,
      error: "A rede ainda não foi confirmada. Atualize para consultar a carteira.",
    });
    expect(wallet.requests).toEqual([]);
    session.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wallet.requests).toEqual([]);
  });

  it("keeps local disconnect until explicit reconnect despite provider events", async () => {
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [validAccount];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return "0xabc";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return `0x${"00".repeat(32)}`;
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);
    await session.connect();
    session.disconnect();
    const disconnected = session.getSnapshot();
    const requestsBeforeEvents = wallet.requests.length;

    wallet.emit("accountsChanged", [validAccount]);
    wallet.emit("chainChanged", "0x8f");
    wallet.emit("disconnect", { code: 4900 });
    wallet.emit("chainChanged", "0x1");
    wallet.emit("accountsChanged", ["0x2222222222222222222222222222222222222222"]);
    await session.refresh();

    expect(session.getSnapshot()).toEqual(disconnected);
    expect(wallet.requests).toHaveLength(requestsBeforeEvents);
    await session.connect();
    expect(wallet.requests.filter(({ method }) => method === "eth_requestAccounts")).toHaveLength(2);
    expect(session.getSnapshot()).toMatchObject({ status: "connected", account: validAccount, chainId: "0x8f" });
    wallet.emit("chainChanged", "0x1");
    expect(session.getSnapshot()).toMatchObject({ status: "wrong-network", balances: null });
    session.dispose();
  });

  it("does not let a previous connection overwrite a newer connection or survive disposal", async () => {
    const staleTokenRead = deferred<unknown>();
    let tokenCalls = 0;
    const wallet = new RequestProvider((method) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return tokenCalls === 0 ? "0xabc" : "0xabd";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") {
        tokenCalls++;
        return tokenCalls === 1 ? staleTokenRead.promise : `0x${"00".repeat(32)}`;
      }
      throw new Error(`Unexpected provider method: ${method}`);
    });
    const session = createWalletSession(wallet);
    const firstConnect = session.connect();
    await waitForRequest(wallet, "eth_call");
    await session.connect();
    const latestSnapshot = session.getSnapshot();
    staleTokenRead.resolve(`0x${"00".repeat(31)}2a`);
    await firstConnect;
    expect(session.getSnapshot()).toEqual(latestSnapshot);

    expect(wallet.listenerCount("accountsChanged")).toBe(1);
    expect(wallet.listenerCount("chainChanged")).toBe(1);
    expect(wallet.listenerCount("disconnect")).toBe(1);
    session.dispose();
    expect(wallet.listenerCount("accountsChanged")).toBe(0);
    expect(wallet.listenerCount("chainChanged")).toBe(0);
    expect(wallet.listenerCount("disconnect")).toBe(0);
    wallet.emit("accountsChanged", ["0x2222222222222222222222222222222222222222"]);
    expect(session.getSnapshot()).toMatchObject({ account: null, balances: null, status: "disconnected" });
  });
  it("reads the exact X Layer asset set at one block with distinct fractional balances", async () => {
    const xlayerContracts = [
      ["0x1E4a5963aBFD975d8c9021ce480b42188849D41d", BigInt("1234567")],
      ["0x779Ded0c9e1022225f8E0630b35a9b54bE713736", BigInt("98765432")],
      ["0xB6CEceAB302E2E4948951eE7843FC24E92933061", BigInt("3141592")],
      ["0x74b7F16337b8972027F6196A17a631aC6dE26d22", BigInt("7")],
      ["0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035", BigInt("250000000")],
    ] as const;
    const tokenBalances = new Map(
      xlayerContracts.map(([contract, balance]) => [
        contract.toLowerCase(),
        "0x" + balance.toString(16).padStart(64, "0"),
      ]),
    );
    const okbWei = BigInt("12345678901234567890");
    const wallet = new RequestProvider((method, args) => {
      if (method === "eth_requestAccounts") return [validAccount];
      if (method === "eth_chainId") return "0xc4";
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_getBalance") return "0x" + okbWei.toString(16);
      if (method === "eth_call") {
        const [call] = args.params as [{ to: string }, string];
        return tokenBalances.get(call.to.toLowerCase()) ?? "0x" + "00".repeat(32);
      }
      throw new Error("Unexpected provider method: " + method);
    });
    const session = createWalletSession(wallet);

    await session.connect();

    expect(session.getSnapshot()).toMatchObject({
      status: "connected",
      chainId: "0xc4",
      balances: {
        okb: "12.34567890123456789",
        usdt: "1.234567",
        usdt0: "98.765432",
        nativeUsdc: "3.141592",
        usdcBridged: "0.000007",
        usdcE: "250",
        block: "0x123",
      },
    });
    expect(wallet.requests.map(({ method }) => method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBalance",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
    expect(wallet.requests.slice(4).map(({ params }) => (params as [{ to: string }, string])[0].to)).toEqual(
      xlayerContracts.map(([contract]) => contract),
    );
    expect(wallet.requests.slice(3).every(({ params }) => (params as [unknown, string])[1] === "0x123")).toBe(true);
    session.dispose();
  });
});

describe("WalletPanelView actual render seam", () => {
  const renderPanel = (snapshot: WalletSnapshot) =>
    renderToStaticMarkup(
      createElement(WalletPanelView, {
        available: true,
        ready: true,
        snapshot,
        connect: async () => {},
        refresh: async () => {},
        switchToMonad: async () => {},
        switchToXLayer: async () => {},
        disconnect: () => {},
      }),
    );

  it("renders all distinct X Layer assets and the OKB gas explanation", () => {
    const markup = renderPanel({
      status: "connected",
      account: "0x1111111111111111111111111111111111111111",
      chainId: "0xc4",
      balances: {
        network: "xlayer",
        okb: "12.34567890123456789",
        usdt: "1.234567",
        usdt0: "98.765432",
        nativeUsdc: "3.141592",
        usdcBridged: "0.000007",
        usdcE: "250",
        block: "0x123",
      },
      error: null,
    });

    expect(markup).toContain("X Layer (196)");
    expect(markup).toContain("<dt>USDT</dt>");
    expect(markup).toContain("<dt>USDT0</dt>");
    expect(markup).toContain("<dt>USDC_Bridged</dt>");
    expect(markup).toContain("<dt>USDC.e</dt>");
    expect(markup).toContain("OKB é o ativo nativo usado para taxas");
    expect(markup).toContain("Trocar para Monad");
    expect(markup).not.toContain("Trocar para X Layer");
  });

  it("guides a Monad user to X Layer to read USDT", () => {
    const markup = renderPanel({
      status: "connected",
      account: "0x1111111111111111111111111111111111111111",
      chainId: "0x8f",
      balances: { network: "monad", mon: "1.25", usdc: "2.5", block: "0xabc" },
      error: null,
    });

    expect(markup).toContain("Monad (143)");
    expect(markup).toContain("Para consultar USDT");
    expect(markup).toContain("Trocar para X Layer");
    expect(markup).toContain("<dt>MON</dt>");
    expect(markup).not.toContain("Trocar para Monad");
  });

  it("labels an unsupported chain and exposes both explicit switch choices", () => {
    const markup = renderPanel({
      status: "wrong-network",
      account: "0x1111111111111111111111111111111111111111",
      chainId: "0x1",
      balances: null,
      error: "Troque para Monad ou X Layer para consultar os ativos suportados.",
    });

    expect(markup).toContain("Não suportada (0x1)");
    expect(markup).toContain("Trocar para Monad");
    expect(markup).toContain("Trocar para X Layer");
    expect(markup).toContain("Saldos indisponíveis nesta rede.");
  });

  it("renders failed data as unavailable without inventing balance values", () => {
    const markup = renderPanel({
      status: "error",
      account: "0x1111111111111111111111111111111111111111",
      chainId: "0xc4",
      balances: null,
      error: "Não foi possível ler os dados da carteira.",
    });

    expect(markup).toContain("role=\"alert\"");
    expect(markup).toContain("Saldos indisponíveis. Tente atualizar.");
    expect(markup).not.toContain("<dt>USDT</dt>");
  });
});
