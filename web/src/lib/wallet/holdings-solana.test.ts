// T9.1 and T9.4, WAL-1 and WAL-4: the Solana account in the reader of what the connected address holds. The gateway already takes a Solana address (only with
// network 501, never lowercased); the browser reader used to refuse everything that was not 0x. These tests pin the same rule on the browser side, so a request the
// gateway would refuse never leaves and an address is never changed on the way. origin: synthetic_fixture, tests only (the address is made up, no real wallet).
import { describe, expect, test } from "bun:test";
import { checkedParams, checkedResultParams, createHoldingsReader, parseBalances, parseHistory, SOLANA_CHAIN_INDEX } from "./holdings";

const SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const meta = (ageMs = 0) => ({ tier: "free" as const, cachedAtMs: 1, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null } });

function fakeFetch(respond: (url: string) => unknown) {
  const seen: string[] = [];
  const fetch = async (url: string): Promise<Response> => {
    seen.push(url);
    return new Response(JSON.stringify(respond(url)), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { seen, fetch };
}

describe("the Solana request", () => {
  test("the sample address has the shape the tests rely on", () => {
    expect(SOL.length).toBe(44);
    expect(SOLANA_CHAIN_INDEX).toBe("501");
  });

  test("a Solana address goes with network 501 alone and keeps its case", () => {
    expect(checkedParams({ address: SOL, chains: ["501"] })).toEqual({ address: SOL, chains: ["501"] });
    expect(checkedParams({ address: SOL, chains: ["501", "501"] })).toEqual({ address: SOL, chains: ["501"] });
  });

  test("a Solana address with any other network, or with 501 and another, never leaves", () => {
    for (const chains of [["1"], ["196"], ["501", "1"], ["1", "501"], []]) expect(checkedParams({ address: SOL, chains })).toBeNull();
  });

  test("an EVM address never goes with network 501", () => {
    expect(checkedParams({ address: EVM, chains: ["501"] })).toBeNull();
    expect(checkedParams({ address: EVM, chains: ["1", "501"] })).toBeNull();
    expect(checkedParams({ address: EVM, chains: ["1", "196"] })).toEqual({ address: EVM.toLowerCase(), chains: ["1", "196"] });
  });

  test("text that is not an address of either family never leaves", () => {
    const bad = [
      SOL.slice(0, 31), `${SOL}A`, `0${SOL.slice(1)}`, `O${SOL.slice(1)}`, `I${SOL.slice(1)}`, `l${SOL.slice(1)}`, `${SOL}&x=1`, ` ${SOL}`, `${SOL}\n`, "", "0x123",
    ];
    for (const address of bad) expect(checkedParams({ address, chains: ["501"] })).toBeNull();
  });

  test("the reader sends the Solana address exactly as it is, with network 501, and the three routes accept it", async () => {
    const f = fakeFetch(() => ({ ok: true, data: { rows: [], total: 0 }, meta: meta() }));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    await reader.balances({ address: SOL, chains: ["501"] });
    await reader.value({ address: SOL, chains: ["501"] });
    await reader.history({ address: SOL, chains: ["501"] });
    expect(f.seen.length).toBe(3);
    expect(f.seen[0]).toBe(`http://x/onchain/wallet-balances?address=${SOL}&chains=501`);
    expect(f.seen[1]).toBe(`http://x/onchain/wallet-value?address=${SOL}&chains=501&assetType=1`);
    expect(f.seen[2]).toBe(`http://x/onchain/wallet-history?address=${SOL}&chains=501&limit=20`);
  });

  test("a Solana address with an EVM network is refused by the reader as a bad request, with no request made", async () => {
    const f = fakeFetch(() => ({ ok: true, data: { rows: [], total: 0 }, meta: meta() }));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    expect(await reader.balances({ address: SOL, chains: ["1"] })).toEqual({ ok: false, error: "bad_request" });
    expect(await reader.value({ address: EVM, chains: ["501"] })).toEqual({ ok: false, error: "bad_request" });
    expect(f.seen.length).toBe(0);
  });
});

describe("the Solana result routes", () => {
  test("a Solana address goes with network 501 alone, keeps its case, and the window is still one of the five", () => {
    expect(checkedResultParams({ address: SOL, chainIndex: "501", timeFrame: 3 })).toEqual({ address: SOL, chainIndex: "501", timeFrame: 3 });
    for (const chainIndex of ["1", "196", "8453"]) expect(checkedResultParams({ address: SOL, chainIndex, timeFrame: 3 })).toBeNull();
    for (const timeFrame of [0, 6, 1.5, Number.NaN]) expect(checkedResultParams({ address: SOL, chainIndex: "501", timeFrame })).toBeNull();
  });

  test("an EVM address never goes with network 501 here either, and still leaves in lower case on its own networks", () => {
    expect(checkedResultParams({ address: EVM, chainIndex: "501", timeFrame: 3 })).toBeNull();
    expect(checkedResultParams({ address: EVM, chainIndex: "8453", timeFrame: 5 })).toEqual({ address: EVM.toLowerCase(), chainIndex: "8453", timeFrame: 5 });
  });

  test("the reader asks both result routes for the Solana account exactly as it is", async () => {
    const f = fakeFetch(() => ({ ok: true, data: null, meta: meta() }));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    await reader.overview({ address: SOL, chainIndex: "501", timeFrame: 3 });
    await reader.pnl({ address: SOL, chainIndex: "501", timeFrame: 3 });
    expect(f.seen[0]).toBe(`http://x/onchain/wallet-overview?address=${SOL}&chainIndex=501&timeFrame=3`);
    expect(f.seen[1]).toBe(`http://x/onchain/wallet-pnl?address=${SOL}&chainIndex=501&limit=20`);
    expect(await reader.pnl({ address: SOL, chainIndex: "1", timeFrame: 3 })).toEqual({ ok: false, error: "bad_request" });
    expect(f.seen.length).toBe(2);
  });
});

describe("the Solana answers", () => {
  test("balances: the coin of the network has no token address, a token has its mint, and a row of another network is a contract error", () => {
    const rows = [
      { chainIndex: "501", symbol: "SOL", tokenAddress: null, balance: 2.5, priceUsd: 150, valueUsd: 375, flaggedRisk: false },
      { chainIndex: "501", symbol: "USDC", tokenAddress: MINT, balance: 40, priceUsd: 1, valueUsd: 40, flaggedRisk: false },
    ];
    expect(parseBalances({ rows, total: 2 }, ["501"])?.rows.map((r) => r.tokenAddress)).toEqual([null, MINT]);
    expect(parseBalances({ rows: [{ ...rows[0]!, chainIndex: "1" }], total: 1 }, ["501"])).toBeNull();
  });

  test("history: a Solana signature is a valid transaction id and keeps its case", () => {
    const signature = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
    const parsed = parseHistory({
      cursor: null,
      rows: [{ chainIndex: "501", txHash: signature, atMs: 1_700_000_000_000, kind: "token", symbol: "USDC", amount: 1, tokenAddress: MINT, status: "success", feeNative: 0.000005, from: "9WzD...AWWM", to: "Gh9Z...tYvQ", flaggedByProvider: false }],
    }, ["501"]);
    expect(parsed?.rows[0]?.txHash).toBe(signature);
  });
});
