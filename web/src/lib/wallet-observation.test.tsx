import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletPanelView } from "../components/WalletPanel/WalletPanel";
import { createWalletSession, type Eip1193Provider, type Eip1193RequestArguments, type WalletSnapshot } from "./okx-wallet";

const account = "0x2222222222222222222222222222222222222222";
const observedAtMs = 1_800_000_000_123;
const contracts = [
  "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
  "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
  "0xB6CEceAB302E2E4948951eE7843FC24E92933061",
  "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
  "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
];
const tokenHex = ["12D687", "5e30a78", "2fefd8", "7", "ee6b280"];
const rawTokens = tokenHex.map((hex) => "0x" + hex.padStart(64, "0"));

class FixtureProvider implements Eip1193Provider {
  readonly requests: Eip1193RequestArguments[] = [];
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  constructor(readonly respond: (args: Eip1193RequestArguments) => unknown = (args) => {
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return [account];
    if (args.method === "eth_chainId") return "0xc4";
    if (args.method === "eth_blockNumber") return "0x123";
    if (args.method === "eth_getBalance") return "0xAB54A98CEB1F0AD2";
    if (args.method === "eth_call") {
      const params = args.params as readonly [{ to: string }, string];
      return rawTokens[contracts.indexOf(params[0].to)];
    }
    throw new Error("Unexpected request");
  }) {}
  async request(args: Eip1193RequestArguments) {
    this.requests.push(args);
    return this.respond(args);
  }
  on(event: string, listener: (...args: unknown[]) => void) {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(listener);
    this.handlers.set(event, handlers);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]) {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Fixture did not reach its expected public state");
}

function renderPanel(snapshot: WalletSnapshot) {
  return renderToStaticMarkup(createElement(WalletPanelView, {
    available: true, ready: true, snapshot, now: observedAtMs,
    connect: async () => {}, refresh: async () => {},
    switchToMonad: async () => {}, switchToXLayer: async () => {},
    disconnect: () => {},
  }));
}

describe("wallet read observations", () => {
  it("renders the complete Monad observation including native zero and exact configured token units", async () => {
    const rawUsdc = "0x" + "20000000000001".padStart(64, "0");
    const provider = new FixtureProvider(({ method }) => {
      if (method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return "0xA";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return rawUsdc;
      throw new Error("Unexpected request");
    });
    const session = createWalletSession(provider, { now: () => observedAtMs });
    await session.connect();
    const details = renderPanel(session.getSnapshot()).match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    expect(details).toContain("<summary>Detalhes da leitura</summary>");
    expect(details).not.toMatch(/<details\b[^>]*\bopen(?:\s|=|>)/);
    for (const text of [
      account, "Monad (143)", "0xA", "2027-01-15T08:00:00.123Z",
      "MON", "USDC nativo", "Ativo nativo", "<dd>0x0</dd>", "<dd>0</dd>",
      "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", rawUsdc,
      "9007199254740993", "9007199254.740993", "<dd>18</dd>", "<dd>6</dd>",
      "Informado pelo provedor OKX", "Escala configurada",
    ]) expect(details).toContain(text);
    expect(provider.requests).toHaveLength(5);
    session.dispose();
  });

  it("coalesces supported account and network events into one complete observed read without authorization", async () => {
    let currentAccount = account;
    let currentChain = "0xc4";
    const defaults = new FixtureProvider();
    const provider = new FixtureProvider((args) => {
      if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return [currentAccount];
      if (args.method === "eth_chainId") return currentChain;
      if (args.method === "eth_call" && currentChain === "0x8f") return rawTokens[0];
      return defaults.respond(args);
    });
    const session = createWalletSession(provider, { now: () => observedAtMs });
    await session.connect();
    const baselineRequests = provider.requests.length;
    currentAccount = "0x4444444444444444444444444444444444444444";
    currentChain = "0x8f";
    provider.emit("accountsChanged", [currentAccount]);
    provider.emit("chainChanged", currentChain);
    provider.emit("accountsChanged", [currentAccount]);
    expect(session.getSnapshot().observation).toBeNull();
    expect(session.getSnapshot().balances).toBeNull();
    await waitFor(() => session.getSnapshot().observation?.network === "monad");
    expect(session.getSnapshot().observation).toMatchObject({ account: currentAccount, chainId: "0x8f", network: "monad" });
    expect(provider.requests.slice(baselineRequests).map((request) => request.method)).toEqual([
      "eth_accounts", "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_call",
    ]);
    expect(provider.requests.filter((request) => request.method === "eth_requestAccounts")).toHaveLength(1);
    session.dispose();
  });

  it("invalidates on account, chain and provider lifecycle events without reviving a superseded read", async () => {
    for (const event of ["accountsChanged", "chainChanged", "disconnect", "dispose"] as const) {
      const oldBlock = deferred<string>();
      let holdOldRead = false;
      let oldRequested = false;
      let currentAccount = account;
      let currentChain = "0xc4";
      let currentBlock = "0x123";
      const defaults = new FixtureProvider();
      const provider = new FixtureProvider((args) => {
        if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return [currentAccount];
        if (args.method === "eth_chainId") return currentChain;
        if (args.method === "eth_blockNumber") {
          if (holdOldRead && !oldRequested) { oldRequested = true; return oldBlock.promise; }
          return currentBlock;
        }
        if (args.method === "eth_call" && currentChain === "0x8f") return rawTokens[0];
        return defaults.respond(args);
      });
      const session = createWalletSession(provider, { now: () => observedAtMs });
      await session.connect();
      expect(session.getSnapshot().observation).not.toBeNull();
      holdOldRead = true;
      const refreshing = session.refresh();
      await waitFor(() => oldRequested);
      currentBlock = "0x125";
      if (event === "accountsChanged") {
        currentAccount = "0x3333333333333333333333333333333333333333";
        provider.emit(event, [currentAccount]);
      } else if (event === "chainChanged") {
        currentChain = "0x8f";
        provider.emit(event, currentChain);
      } else if (event === "disconnect") provider.emit(event, { message: "PRIVATE disconnect payload" });
      else session.dispose();
      expect(session.getSnapshot().observation).toBeNull();
      expect(session.getSnapshot().balances).toBeNull();
      if (event === "accountsChanged" || event === "chainChanged") {
        await waitFor(() => session.getSnapshot().observation?.block === "0x125");
        expect(session.getSnapshot().observation).toMatchObject({ account: currentAccount, chainId: currentChain });
      }
      const current = session.getSnapshot().observation;
      oldBlock.resolve("0x124");
      await refreshing;
      expect(session.getSnapshot().observation).toBe(current);
      expect(provider.requests.filter((request) => request.method === "eth_requestAccounts")).toHaveLength(1);
      expect(session.getSnapshot().error ?? "").not.toContain("PRIVATE");
      session.dispose();
    }
  });

  it("keeps the whole batch unavailable after an asset timeout and ignores its late result", async () => {
    const late = deferred<string>();
    const defaults = new FixtureProvider();
    let stalled = false;
    const provider = new FixtureProvider((args) => stalled && args.method === "eth_call" &&
      (args.params as readonly [{ to: string }, string])[0].to === contracts[0]
      ? late.promise : defaults.respond(args));
    const session = createWalletSession(provider, { now: () => observedAtMs, timeoutMs: 30 });
    await session.connect();
    expect(session.getSnapshot().observation).not.toBeNull();
    stalled = true;
    await session.refresh();
    expect(session.getSnapshot()).toMatchObject({ status: "error", balances: null, observation: null, observedAtMs: null });
    late.resolve(rawTokens[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.getSnapshot()).toMatchObject({ status: "error", balances: null, observation: null });
    session.dispose();
  });

  it("clears observations when the completion clock is invalid or throws", async () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 8_640_000_000_000_001, -8_640_000_000_000_001, "throw"] as const) {
      let failing = false;
      const session = createWalletSession(new FixtureProvider(), { now: () => {
        if (!failing) return observedAtMs;
        if (invalid === "throw") throw new Error("PRIVATE clock payload");
        return invalid;
      } });
      await session.connect();
      expect(session.getSnapshot().observation).not.toBeNull();
      failing = true;
      await session.refresh();
      expect(session.getSnapshot()).toMatchObject({ status: "error", balances: null, observation: null, observedAtMs: null });
      expect(session.getSnapshot().error).not.toContain("PRIVATE");
      session.dispose();
    }
  });

  it("drops the entire observed batch for an invalid RPC or a rejected asset and sanitizes errors", async () => {
    const cases: { method: string; contract?: string; result?: unknown; reject?: boolean }[] = [
      { method: "eth_blockNumber", result: "0x00" },
      { method: "eth_getBalance", result: "0x00" },
      { method: "eth_getBalance", result: "0x" + "f".repeat(65) },
      ...contracts.map((contract) => ({ method: "eth_call", contract, result: "0x0" })),
      { method: "eth_call", contract: contracts[2], reject: true },
    ];
    for (const failure of cases) {
      let failing = false;
      const defaults = new FixtureProvider();
      const provider = new FixtureProvider((args) => {
        const matches = args.method === failure.method && (!failure.contract ||
          (args.params as readonly [{ to: string }, string])[0].to === failure.contract);
        if (failing && matches) {
          if (failure.reject) throw new Error("PRIVATE provider payload");
          return failure.result;
        }
        return defaults.respond(args);
      });
      const session = createWalletSession(provider, { now: () => observedAtMs });
      await session.connect();
      expect(session.getSnapshot().observation).not.toBeNull();
      failing = true;
      await session.refresh();
      expect(session.getSnapshot()).toMatchObject({ status: "error", balances: null, observation: null, observedAtMs: null });
      expect(session.getSnapshot().error).not.toBeNull();
      expect(session.getSnapshot().error).not.toContain("PRIVATE");
      session.dispose();
    }
  });

  it("rejects trailing whitespace in raw responses and invalid account or block shapes", async () => {
    const session = createWalletSession(new FixtureProvider(), { now: () => observedAtMs });
    await session.connect();
    const snapshot = session.getSnapshot();
    const observation = snapshot.observation!;
    const assets = observation.assets;
    for (const index of [0, 1]) {
      const changed = assets.map((asset, offset) => offset === index ? { ...asset, rawRpc: asset.rawRpc + "\n" } : asset);
      expect(renderPanel({ ...snapshot, observation: { ...observation, assets: changed } })).not.toContain("<details");
    }
    for (const invalidAccount of ["invalid", account + "\n"]) {
      expect(renderPanel({ ...snapshot, account: invalidAccount, observation: { ...observation, account: invalidAccount } })).not.toContain("<details");
    }
    for (const block of ["0x0123", "0x123\n", "0x" + "f".repeat(17)]) {
      expect(renderPanel({ ...snapshot, balances: { ...snapshot.balances!, block }, observation: { ...observation, block } })).not.toContain("<details");
    }
    session.dispose();
  });

  it("cannot inject an observation into initial or disposed snapshots", async () => {
    const session = createWalletSession(new FixtureProvider(), { now: () => observedAtMs });
    const initial = session.getSnapshot();
    expect(Reflect.set(initial, "observation", { account: "injected" })).toBe(false);
    expect(session.getSnapshot().observation).toBeNull();
    await session.connect();
    const observation = session.getSnapshot().observation;
    session.dispose();
    expect(Reflect.set(session.getSnapshot(), "observation", observation)).toBe(false);
    expect(session.getSnapshot().observation).toBeNull();
  });

  it("hides incomplete or inconsistent assets instead of mixing raw and converted amounts", async () => {
    const session = createWalletSession(new FixtureProvider(), { now: () => observedAtMs });
    await session.connect();
    const snapshot = session.getSnapshot();
    const balances = snapshot.balances;
    if (balances?.network !== "xlayer") throw new Error("Fixture did not complete its X Layer read");
    const observation = snapshot.observation!;
    const assets = observation.assets;
    const variations = [
      [], assets.slice(1), [...assets, assets[0]], [assets[1], assets[0], ...assets.slice(2)],
      [{ ...assets[0], id: "usdt" as const }, ...assets.slice(1)],
      [{ ...assets[0], symbol: "MON" }, ...assets.slice(1)],
      [{ ...assets[0], native: false }, ...assets.slice(1)],
      [{ ...assets[0], contract: contracts[0] }, ...assets.slice(1)],
      [assets[0], { ...assets[1], contract: contracts[1] }, ...assets.slice(2)],
      [assets[0], { ...assets[1], contract: null }, ...assets.slice(2)],
      [{ ...assets[0], decimals: 6 }, ...assets.slice(1)],
      [assets[0], { ...assets[1], decimals: 18 }, ...assets.slice(2)],
      [{ ...assets[0], rawRpc: "0x01" }, ...assets.slice(1)],
      [{ ...assets[0], rawRpc: "0x" + "f".repeat(65) }, ...assets.slice(1)],
      [assets[0], { ...assets[1], rawRpc: "0x12d687" }, ...assets.slice(2)],
      [{ ...assets[0], rawUnits: "12345678901234567891" }, ...assets.slice(1)],
      [{ ...assets[0], rawUnits: "012345678901234567890" }, ...assets.slice(1)],
      [{ ...assets[0], formattedBalance: "12.35" }, ...assets.slice(1)],
    ];
    for (const assets of variations) {
      expect(renderPanel({ ...snapshot, observation: { ...observation, assets } })).not.toContain("<details");
    }
    expect(renderPanel({ ...snapshot, balances: { ...balances, usdt: "1.25" } })).not.toContain("<details");
    // Both representations agreeing on a rounded value still contradict the raw units.
    expect(renderPanel({
      ...snapshot, balances: { ...balances, okb: "12.35" },
      observation: { ...observation, assets: [{ ...assets[0], formattedBalance: "12.35" }, ...assets.slice(1)] },
    })).not.toContain("<details");
    session.dispose();
  });

  it("hides details for legacy snapshots and disconnected or mismatched read identity", async () => {
    const session = createWalletSession(new FixtureProvider(), { now: () => observedAtMs });
    await session.connect();
    const snapshot = session.getSnapshot();
    const observation = snapshot.observation!;
    const { observation: omitted, ...legacy } = snapshot;
    expect(omitted).not.toBeNull();
    const inconsistent: WalletSnapshot[] = [
      legacy, { ...snapshot, observation: null }, { ...snapshot, balances: null },
      ...(["disconnected", "connecting", "reading", "wrong-network", "error"] as const)
        .map((status) => ({ ...snapshot, status })),
      { ...snapshot, error: "Consulta incompleta" },
      { ...snapshot, account: null },
      { ...snapshot, account: "0x3333333333333333333333333333333333333333" },
      { ...snapshot, chainId: "0x8f" },
      { ...snapshot, observation: { ...observation, account: "0x3333333333333333333333333333333333333333" } },
      { ...snapshot, observation: { ...observation, chainId: "0x8f" } },
      { ...snapshot, observation: { ...observation, network: "monad" } },
      { ...snapshot, observation: { ...observation, block: "0x124" } },
      { ...snapshot, observation: { ...observation, observedAtMs: observedAtMs + 1 } },
      { ...snapshot, observedAtMs: undefined }, { ...snapshot, observedAtMs: null },
      { ...snapshot, observedAtMs: Number.NaN, observation: { ...observation, observedAtMs: Number.NaN } },
      { ...snapshot, balances: { network: "monad", block: "0x123", mon: "0", usdc: "0" } },
    ];
    for (const input of inconsistent) expect(renderPanel(input)).not.toContain("<details");
    session.dispose();
  });

  it("renders accessible collapsed X Layer details with provider origin and configured units", async () => {
    const session = createWalletSession(new FixtureProvider(), { now: () => observedAtMs });
    await session.connect();
    const html = renderPanel(session.getSnapshot());
    const details = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    expect(details).toBeDefined();
    expect(details).toContain("<summary>Detalhes da leitura</summary>");
    expect(details).not.toMatch(/<details\b[^>]*\bopen(?:\s|=|>)/);
    for (const text of [
      account, "X Layer (196)", "0x123", "2027-01-15T08:00:00.123Z",
      "Informado pelo provedor OKX", "Escala configurada", "Ativo nativo",
      "Resposta RPC", "Unidades inteiras", "Saldo convertido", "Decimais configurados",
      "OKB", "USDT", "USDT0", "USDC nativo", "USDC_Bridged", "USDC.e",
      "0xAB54A98CEB1F0AD2", "12345678901234567890", "12.34567890123456789",
      ...contracts, ...rawTokens, "1234567", "1.234567", "98765432", "98.765432",
      "3141592", "3.141592", "0.000007", "250000000",
    ]) expect(details).toContain(text);
    expect(details).toContain("<dd>18</dd>");
    expect(details).toContain("<dd>6</dd>");
    session.dispose();
  });

  it("invalidates provenance at read start, disconnect and disposal and discards late responses", async () => {
    const block = deferred<string>();
    let pendingBlock = false;
    const defaultProvider = new FixtureProvider();
    const provider = new FixtureProvider((args) => args.method === "eth_blockNumber" && pendingBlock
      ? block.promise : defaultProvider.respond(args));
    const session = createWalletSession(provider, { now: () => observedAtMs });
    expect(session.getSnapshot().observation).toBeNull();
    await session.connect();
    expect(session.getSnapshot().observation).not.toBeNull();
    pendingBlock = true;
    const refreshing = session.refresh();
    await waitFor(() => session.getSnapshot().status === "reading");
    expect(session.getSnapshot().balances).toBeNull();
    expect(session.getSnapshot().observation).toBeNull();
    session.disconnect();
    block.resolve("0x124");
    await refreshing;
    expect(session.getSnapshot().status).toBe("disconnected");
    expect(session.getSnapshot().observation).toBeNull();
    pendingBlock = false;
    await session.connect();
    expect(session.getSnapshot().observation).not.toBeNull();
    session.dispose();
    expect(session.getSnapshot().balances).toBeNull();
    expect(session.getSnapshot().observation).toBeNull();
  });

  it("protects observations for snapshot and subscription consumers while balances remain compatible", async () => {
    const session = createWalletSession(new FixtureProvider(), { now: () => observedAtMs });
    let subscribed = session.getSnapshot();
    const unsubscribe = session.subscribe((snapshot) => { subscribed = snapshot; });
    await session.connect();
    const snapshot = session.getSnapshot();
    const observation = snapshot.observation!;
    expect(subscribed.observation).toBe(observation);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.assets)).toBe(true);
    expect(observation.assets.every(Object.isFrozen)).toBe(true);
    expect(Reflect.set(observation, "account", "tampered")).toBe(false);
    expect(Reflect.set(observation.assets[0], "rawUnits", "0")).toBe(false);
    expect(Reflect.set(observation.assets, "0", {})).toBe(false);
    expect(Reflect.set(subscribed, "observation", null)).toBe(false);
    expect(session.getSnapshot().observation?.account).toBe(account);
    expect(session.getSnapshot().observation?.assets[0].rawUnits).toBe("12345678901234567890");
    expect(Object.isFrozen(snapshot.balances)).toBe(false);
    unsubscribe();
    session.dispose();
  });

  it("retains Monad native zero and an exact token quantity above the safe integer limit", async () => {
    const rawUsdc = "0x" + "20000000000001".padStart(64, "0");
    const provider = new FixtureProvider(({ method }) => {
      if (method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return "0x8f";
      if (method === "eth_blockNumber") return "0xA";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_call") return rawUsdc;
      throw new Error("Unexpected request");
    });
    const session = createWalletSession(provider, { now: () => observedAtMs });
    await session.connect();
    expect(session.getSnapshot().observation).toEqual({
      schemaVersion: 1, source: "okx-provider-reported", account, chainId: "0x8f",
      network: "monad", block: "0xA", observedAtMs,
      assets: [
        { id: "mon", symbol: "MON", native: true, contract: null, rawRpc: "0x0", rawUnits: "0", decimals: 18, decimalsSource: "configured", formattedBalance: "0" },
        { id: "usdc", symbol: "USDC nativo", native: false, contract: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", rawRpc: rawUsdc, rawUnits: "9007199254740993", decimals: 6, decimalsSource: "configured", formattedBalance: "9007199254.740993" },
      ],
    });
    expect(session.getSnapshot().balances).toEqual({ network: "monad", mon: "0", usdc: "9007199254.740993", block: "0xA" });
    expect(provider.requests.map((request) => request.method)).toEqual(["eth_requestAccounts", "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_call"]);
    session.dispose();
  });

  it("publishes exact X Layer provenance with its complete balances at one block", async () => {
    const provider = new FixtureProvider();
    const session = createWalletSession(provider, { now: () => observedAtMs });
    await session.connect();
    const snapshot = session.getSnapshot();
    expect(snapshot.observation).toEqual({
      schemaVersion: 1, source: "okx-provider-reported", account,
      chainId: "0xc4", network: "xlayer", block: "0x123", observedAtMs,
      assets: [
        { id: "okb", symbol: "OKB", native: true, contract: null, rawRpc: "0xAB54A98CEB1F0AD2", rawUnits: "12345678901234567890", decimals: 18, decimalsSource: "configured", formattedBalance: "12.34567890123456789" },
        { id: "usdt", symbol: "USDT", native: false, contract: contracts[0], rawRpc: rawTokens[0], rawUnits: "1234567", decimals: 6, decimalsSource: "configured", formattedBalance: "1.234567" },
        { id: "usdt0", symbol: "USDT0", native: false, contract: contracts[1], rawRpc: rawTokens[1], rawUnits: "98765432", decimals: 6, decimalsSource: "configured", formattedBalance: "98.765432" },
        { id: "nativeUsdc", symbol: "USDC nativo", native: false, contract: contracts[2], rawRpc: rawTokens[2], rawUnits: "3141592", decimals: 6, decimalsSource: "configured", formattedBalance: "3.141592" },
        { id: "usdcBridged", symbol: "USDC_Bridged", native: false, contract: contracts[3], rawRpc: rawTokens[3], rawUnits: "7", decimals: 6, decimalsSource: "configured", formattedBalance: "0.000007" },
        { id: "usdcE", symbol: "USDC.e", native: false, contract: contracts[4], rawRpc: rawTokens[4], rawUnits: "250000000", decimals: 6, decimalsSource: "configured", formattedBalance: "250" },
      ],
    });
    expect(snapshot.balances).toEqual({ network: "xlayer", block: "0x123", okb: "12.34567890123456789", usdt: "1.234567", usdt0: "98.765432", nativeUsdc: "3.141592", usdcBridged: "0.000007", usdcE: "250" });
    expect(provider.requests.map((request) => request.method)).toEqual(["eth_requestAccounts", "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_call", "eth_call", "eth_call", "eth_call", "eth_call"]);
    session.dispose();
  });
});
