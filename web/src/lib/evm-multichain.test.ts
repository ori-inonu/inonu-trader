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
  it("reads native and token balances per chain at one block with exact units", async () => {
    const xlayer = EVM_CHAINS.find((chain) => chain.chainIndex === "196")!;
    const result = await readChainBalances(ACCOUNT, xlayer, rpcFor("0xc4", BigInt(200_000_000_000_000_000), BigInt(75_000_000)));
    expect(result.status).toBe("ok");
    expect(result.block).toBe("1715004");
    expect(result.native).toEqual({ symbol: "OKB", amount: "0.2" });
    expect(result.tokens.map((token) => `${token.symbol}=${token.amount}`)).toEqual(["USDT=75", "USDT0=75", "USDC=75", "USDC_Bridged=75"]);
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
});
