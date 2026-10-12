import { describe, expect, it } from "bun:test";
import { EVM_CHAINS, readChainBalances, readMultichainBalances, type EvmRpcFetch } from "./evm-multichain";
import { parseOperatorCycle } from "./operator-feed";

const ACCOUNT = "0xEd0C6079229E2d407672a117c22b62064f4a4312";
const WORD = (value: bigint) => "0x" + value.toString(16).padStart(64, "0");

function rpcFor(chainIdHex: string, native: bigint, token: bigint, fail = false): EvmRpcFetch {
  return async (_url, body) => {
    const batch = JSON.parse(body) as { id: number; method: string }[];
    if (fail) throw new Error("down");
    return batch.map((request) => {
      if (request.method === "eth_chainId") return { id: request.id, result: chainIdHex };
      if (request.method === "eth_blockNumber") return { id: request.id, result: "0x1a2b3c" };
      if (request.method === "eth_getBalance") return { id: request.id, result: "0x" + native.toString(16) };
      return { id: request.id, result: WORD(token) };
    });
  };
}

describe("evm multichain", () => {
  it("covers all five configured X Layer token contracts with separate identities", async () => {
    const xlayer = EVM_CHAINS.find((chain) => chain.chainIndex === "196")!;
    const result = await readChainBalances(ACCOUNT, xlayer, rpcFor("0xc4", BigInt(0), BigInt(78_850_000)));
    expect(result.tokens.map(({ symbol, contract, decimals }) => ({ symbol, contract, decimals }))).toEqual([
      { symbol: "USDT", contract: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", decimals: 6 },
      { symbol: "USDT0", contract: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736", decimals: 6 },
      { symbol: "USDC", contract: "0xB6CEceAB302E2E4948951eE7843FC24E92933061", decimals: 6 },
      { symbol: "USDC_Bridged", contract: "0x74b7F16337b8972027F6196A17a631aC6dE26d22", decimals: 6 },
      { symbol: "USDC.e", contract: "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035", decimals: 6 },
    ]);
    expect(result.tokens.every((token) => token.amount === "78.85")).toBe(true);
  });

  it("rejects malformed quantities and ambiguous RPC rows without partial balances", async () => {
    const xlayer = EVM_CHAINS.find((chain) => chain.chainIndex === "196")!;
    const invalid: { id: number; result?: string; duplicate?: boolean; error?: boolean }[] = [
      { id: 1, result: "0xc4\n" }, { id: 2, result: "0x01" },
      { id: 2, result: "0x" + "f".repeat(65) }, { id: 2, duplicate: true },
      { id: 10, result: "0x0\n" }, { id: 10, result: "0x" + "f".repeat(65) },
      { id: 10, duplicate: true }, { id: 100, duplicate: true },
      { id: 100, result: "0x" + "0".repeat(64) + "\n" },
      { id: 1, error: true }, { id: 2, error: true },
      { id: 10, error: true }, { id: 100, error: true },
    ];
    for (const mutation of invalid) {
      const rpc: EvmRpcFetch = async (url, body) => {
        const rows = await rpcFor("0xc4", BigInt(0), BigInt(0))(url, body) as { id: number; result: string; error?: unknown }[];
        const target = rows.find((row) => row.id === mutation.id);
        if (target) {
          if (mutation.result !== undefined) target.result = mutation.result;
          if (mutation.error) target.error = { code: -1, message: "fixture failure" };
          if (mutation.duplicate) rows.push({ ...target });
        }
        return rows;
      };
      const result = await readChainBalances(ACCOUNT, xlayer, rpc, {}, () => 123);
      expect({ case: mutation, status: result.status, native: result.native, tokens: result.tokens, observedAtMs: result.observedAtMs })
        .toEqual({ case: mutation, status: "error", native: null, tokens: [], observedAtMs: null });
    }
  });

  it("retains exact observed units and provenance without leaking RPC credentials", async () => {
    const xlayer = EVM_CHAINS.find((chain) => chain.chainIndex === "196")!;
    const result = await readChainBalances(ACCOUNT, xlayer, rpcFor("0xc4", BigInt("9007199254740993"), BigInt("9007199254740993")), { NEXT_PUBLIC_EVM_RPC_196: "https://user:password@example.test/private-key?token=secret" }, () => 1_800_000_000_123);
    expect(result).toMatchObject({ account: ACCOUNT, chainIndex: "196", chainIdHex: "0xc4", rawBlock: "0x1a2b3c", block: "1715004", source: "public-rpc-reported", rpcHost: "example.test", observedAtMs: 1_800_000_000_123 });
    expect(result.native).toEqual({ symbol: "OKB", rawRpc: "0x20000000000001", rawUnits: "9007199254740993", decimals: 18, decimalsSource: "configured", amount: "0.009007199254740993" });
    expect(result.tokens[0]).toEqual({ symbol: "USDT", contract: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", rawRpc: "0x" + "20000000000001".padStart(64, "0"), rawUnits: "9007199254740993", decimals: 6, decimalsSource: "configured", amount: "9007199254.740993" });
    expect(JSON.stringify(result)).not.toMatch(/password|private-key|token=secret/);
  });

  it("reads native and token balances per chain at one block with exact units", async () => {
    const xlayer = EVM_CHAINS.find((chain) => chain.chainIndex === "196")!;
    const result = await readChainBalances(ACCOUNT, xlayer, rpcFor("0xc4", BigInt(200_000_000_000_000_000), BigInt(75_000_000)));
    expect(result.status).toBe("ok");
    expect(result.block).toBe("1715004");
    expect({ symbol: result.native?.symbol, amount: result.native?.amount }).toEqual({ symbol: "OKB", amount: "0.2" });
    expect(result.tokens.map((token) => `${token.symbol}=${token.amount}`)).toEqual(["USDT=75", "USDT0=75", "USDC=75", "USDC_Bridged=75", "USDC.e=75"]);
  });

  it("rejects an RPC answering for another chain and never reports zero on failure", async () => {
    const ethereum = EVM_CHAINS.find((chain) => chain.chainIndex === "1")!;
    const wrong = await readChainBalances(ACCOUNT, ethereum, rpcFor("0x38", BigInt(1), BigInt(1)));
    expect(wrong).toMatchObject({ status: "error", native: null, tokens: [], error: "a RPC respondeu por outra rede" });
    const down = await readChainBalances(ACCOUNT, ethereum, rpcFor("0x1", BigInt(1), BigInt(1), true));
    expect(down).toMatchObject({ status: "error", error: "a RPC pública não respondeu" });
    const bad = await readChainBalances("0x12", ethereum, rpcFor("0x1", BigInt(1), BigInt(1)));
    expect(bad.error).toBe("conta inválida");
  });

  it("queries every registered chain in parallel and honors RPC overrides", async () => {
    const urls: string[] = [];
    const rpc: EvmRpcFetch = async (url, body) => { urls.push(url); return rpcFor("0x8f", BigInt(5), BigInt(5))(url, body); };
    const monad = EVM_CHAINS.filter((chain) => chain.chainIndex === "143");
    const snapshot = await readMultichainBalances(ACCOUNT, rpc, { chains: monad, now: () => 7, overrides: { NEXT_PUBLIC_EVM_RPC_143: "https://example.test/rpc" } });
    expect(snapshot.observedAtMs).toBe(7);
    expect(snapshot.chains[0]!.status).toBe("ok");
    expect(urls.every((url) => url === "https://example.test/rpc")).toBe(true);
    expect(EVM_CHAINS.map((chain) => chain.chainIndex)).toEqual(["143", "196", "1", "56", "8453", "42161", "137", "10"]);
  });

  it("parses only well-formed operator cycles", () => {
    expect(parseOperatorCycle({})).toBeNull();
    expect(parseOperatorCycle({ cycleId: "a", inventory: {}, candidates: [], verdicts: [], execution: {} })).not.toBeNull();
  });

  it("retains valid zero and maximum uint256 at one explicit block", async () => {
    const chain = EVM_CHAINS[0]!;
    const requests: { method: string; params?: unknown[] }[] = [];
    const rpc: EvmRpcFetch = async (url, body) => {
      requests.push(...JSON.parse(body));
      return rpcFor("0x8f", BigInt(0), BigInt("0x" + "f".repeat(64)))(url, body);
    };
    const result = await readChainBalances(ACCOUNT, chain, rpc, {}, () => 1000);
    expect(result.status).toBe("ok");
    expect(result.native).toMatchObject({ amount: "0", rawRpc: "0x0", rawUnits: "0" });
    expect(result.tokens[0]).toMatchObject({
      rawUnits: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      amount: "115792089237316195423570985008687907853269984665640564039457584007913129.639935",
    });
    expect(requests.filter((request) => request.method === "eth_getBalance" || request.method === "eth_call").map((request) => request.params?.[1]))
      .toEqual(["0x1a2b3c", "0x1a2b3c"]);
  });

  it("timestamps each chain on completion instead of refreshing it with the snapshot clock", async () => {
    let clock = 1000;
    let releaseSlow!: () => void;
    let firstObserved!: () => void;
    const slow = new Promise<void>((resolve) => { releaseSlow = resolve; });
    const first = new Promise<void>((resolve) => { firstObserved = resolve; });
    const rpc: EvmRpcFetch = async (url, body) => {
      const chainId = url.includes("xlayer") ? "0xc4" : "0x8f";
      if (chainId === "0xc4" && body.includes("eth_getBalance")) await slow;
      return rpcFor(chainId, BigInt(0), BigInt(0))(url, body);
    };
    const pending = readMultichainBalances(ACCOUNT, rpc, { chains: EVM_CHAINS.slice(0, 2), now: () => { firstObserved(); return clock; } });
    await first;
    clock = 90_000;
    releaseSlow();
    const snapshot = await pending;
    expect(snapshot.observedAtMs).toBe(90_000);
    expect(snapshot.chains.map((chain) => chain.observedAtMs)).toEqual([1000, 90_000]);
  });

  it("keeps valid quantities while reporting an unavailable observation clock as unknown", async () => {
    for (const now of [() => NaN, () => Infinity, () => { throw new Error("clock unavailable"); }]) {
      const snapshot = await readMultichainBalances(ACCOUNT, rpcFor("0x8f", BigInt(0), BigInt(0)), { chains: [EVM_CHAINS[0]!], now });
      expect(snapshot.observedAtMs).toBeNull();
      expect(snapshot.chains[0]).toMatchObject({ status: "ok", observedAtMs: null, native: { amount: "0" } });
    }
  });
});
