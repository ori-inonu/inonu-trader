import { describe, expect, it } from "bun:test";
import { createSolanaSession, discoverOkxSolanaProvider, parseSolanaAccount, readSolanaBalances, SOLANA_TOKENS, type JsonRpcFetch, type OkxSolanaProvider } from "./okx-solana";

const ACCOUNT = "4Nd1mBQtrMJVYVfKf2PJy9NZaZdRMHoKoQfiwnNoQ8fB";

function rpcFixture(lamports: number, usdc: string, usdt: string): JsonRpcFetch {
  return async (body) => {
    const request = JSON.parse(body) as { method: string; params: unknown[] };
    if (request.method === "getBalance") return { jsonrpc: "2.0", id: 1, result: { context: { slot: 312_000_001 }, value: lamports } };
    const mint = (request.params[1] as { mint: string }).mint;
    const amount = mint === SOLANA_TOKENS[0]!.mint ? usdc : usdt;
    return { jsonrpc: "2.0", id: 2, result: { context: { slot: 312_000_001 }, value: [{ account: { data: { parsed: { info: { tokenAmount: { amount, decimals: 6 } } } } } }] } };
  };
}

class FakeProvider implements OkxSolanaProvider {
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  publicKey: { toString(): string } | null = null;
  constructor(private readonly account: string | null, private readonly reject = false) {}
  async connect() {
    if (this.reject) throw Object.assign(new Error("rejected"), { code: 4001 });
    if (!this.account) return;
    this.publicKey = { toString: () => this.account! };
    return { publicKey: this.publicKey };
  }
  on(event: string, listener: (...args: unknown[]) => void) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(listener);
    this.handlers.set(event, set);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]) {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
}

describe("okx solana", () => {
  it("parses base58 accounts from strings and publicKey objects only", () => {
    expect(parseSolanaAccount(ACCOUNT)).toBe(ACCOUNT);
    expect(parseSolanaAccount({ toString: () => ACCOUNT })).toBe(ACCOUNT);
    expect(parseSolanaAccount("0xEd0C6079229E2d407672a117c22b62064f4a4312")).toBeNull();
    expect(parseSolanaAccount({ toString: () => { throw new Error("boom"); } })).toBeNull();
  });

  it("discovers only okxwallet.solana with connect and on", () => {
    expect(discoverOkxSolanaProvider({})).toBeNull();
    expect(discoverOkxSolanaProvider({ okxwallet: { solana: { connect() {} } } })).toBeNull();
    const provider = new FakeProvider(ACCOUNT);
    expect(discoverOkxSolanaProvider({ okxwallet: { solana: provider } })).toBe(provider);
  });

  it("reads SOL and SPL balances with exact units and never invents zero on bad data", async () => {
    const balances = await readSolanaBalances(ACCOUNT, rpcFixture(1_500_000_000, "30000000", "0"));
    expect(balances).toEqual({ sol: "1.5", slot: "312000001", tokens: [
      { symbol: "USDC", mint: SOLANA_TOKENS[0]!.mint, amount: "30" },
      { symbol: "USDT", mint: SOLANA_TOKENS[1]!.mint, amount: "0" },
    ] });
    await expect(readSolanaBalances(ACCOUNT, async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32000 } }))).rejects.toThrow("rpc error");
    await expect(readSolanaBalances("bad", rpcFixture(1, "1", "1"))).rejects.toThrow("invalid account");
  });

  it("connects, reads, invalidates on account change and reports refusals", async () => {
    const provider = new FakeProvider(ACCOUNT);
    const session = createSolanaSession(provider, { rpcFetch: rpcFixture(2_000_000_000, "5000000", "0"), now: () => 1_760_000_000_000 });
    const seen: string[] = [];
    session.subscribe((snapshot) => seen.push(snapshot.status));
    await session.connect();
    expect(session.getSnapshot()).toMatchObject({ status: "connected", account: ACCOUNT, observedAtMs: 1_760_000_000_000 });
    expect(session.getSnapshot().balances?.sol).toBe("2");
    expect(seen).toEqual(["connecting", "connected", "reading", "connected"]);
    provider.emit("accountChanged", null);
    expect(session.getSnapshot().status).toBe("disconnected");
    expect(session.getSnapshot().balances).toBeNull();
    session.dispose();
    expect(provider.handlers.get("accountChanged")?.size ?? 0).toBe(0);

    const refused = createSolanaSession(new FakeProvider(ACCOUNT, true), { rpcFetch: rpcFixture(1, "1", "1") });
    await refused.connect();
    expect(refused.getSnapshot()).toMatchObject({ status: "error", error: "A conexão Solana foi recusada no OKX." });
  });

  it("local disconnect ignores later provider events until a new connect", async () => {
    const provider = new FakeProvider(ACCOUNT);
    const session = createSolanaSession(provider, { rpcFetch: rpcFixture(1, "1", "1") });
    await session.connect();
    session.disconnect();
    provider.emit("accountChanged", { toString: () => ACCOUNT });
    expect(session.getSnapshot().status).toBe("disconnected");
    await session.refresh();
    expect(session.getSnapshot().balances).toBeNull();
  });
});
