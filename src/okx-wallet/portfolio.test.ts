import { expect, test } from "bun:test";
import { createOkxPortfolioClient, normalizeInventory, OkxPortfolioError, syntheticInventory, type PortfolioFetch, type PortfolioFetchInit, type RawTokenAsset } from "./portfolio";
import { bookFromAssets } from "../agent/book";
import { isAddressForChain, validateChainList, chainByIndex } from "./chains";

const credentials = { apiKey: "key", secretKey: "secret", passphrase: "pass" };
const timestamp = new Date("2026-10-10T12:00:00.000Z");
const evm = "0xEd0C6079229E2d407672a117c22b62064f4a4312";
const envelope = (data: unknown, code: string | number = "0") => new Response(JSON.stringify({ code, msg: "ok", data }));

function capture(response: Response) {
  const calls: { input: string; init: PortfolioFetchInit }[] = [];
  const fetcher: PortfolioFetch = async (input, init) => { calls.push({ input, init }); return response.clone(); };
  return { fetcher, calls };
}

test("chain registry knows Solana, X Layer and Monad with distinct address families", () => {
  expect(chainByIndex("501")?.kind).toBe("solana");
  expect(chainByIndex("196")?.nativeSymbol).toBe("OKB");
  expect(chainByIndex("143")?.evmChainIdHex).toBe("0x8f");
  expect(isAddressForChain("501", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true);
  expect(isAddressForChain("501", evm)).toBe(false);
  expect(isAddressForChain("196", evm)).toBe(true);
  expect(() => validateChainList([])).toThrow("Invalid chain list");
  expect(() => validateChainList(["196", "196"])).toThrow("Invalid chain list");
  expect(() => validateChainList(["999999"])).toThrow("Invalid chain list");
  expect(validateChainList(["196", "501"])).toEqual(["196", "501"]);
});

test("refuses live requests unless explicitly enabled and never sends without credentials", async () => {
  let calls = 0;
  const fetcher: PortfolioFetch = async () => { calls++; return envelope([]); };
  expect(() => createOkxPortfolioClient({ credentials: { apiKey: "", secretKey: "s", passphrase: "p" }, fetcher })).toThrow("Invalid OKX API credentials");
  const client = createOkxPortfolioClient({ credentials, fetcher, now: () => timestamp });
  await expect(client.allTokenBalances(evm, ["196"])).rejects.toThrow("OKX live requests are disabled");
  expect(calls).toBe(0);
});

test("signs the exact balance request across several chains and validates assets", async () => {
  const assets: RawTokenAsset[] = [
    { chainIndex: "196", tokenContractAddress: "0x1e4a5963abfd975d8c9021ce480b42188849d41d", address: evm, symbol: "USDT", balance: "75", rawBalance: "75000000", tokenPrice: "1", isRiskToken: false },
    { chainIndex: "196", tokenContractAddress: "", address: evm, symbol: "OKB", balance: "0.2", rawBalance: "200000000000000000", tokenPrice: "50", isRiskToken: false },
  ];
  const { fetcher, calls } = capture(envelope([{ tokenAssets: assets }]));
  const client = createOkxPortfolioClient({ credentials, fetcher, now: () => timestamp, allowLiveRequests: true });
  const result = await client.allTokenBalances(evm, ["196", "143"]);
  expect(result).toEqual(assets);
  const call = calls[0]!;
  expect(call.input).toBe(`https://web3.okx.com/api/v6/dex/balance/all-token-balances-by-address?address=${evm}&chains=196%2C143&excludeRiskToken=0`);
  expect(call.init.headers.get("OK-ACCESS-KEY")).toBe("key");
  expect(call.init.headers.get("OK-ACCESS-TIMESTAMP")).toBe("2026-10-10T12:00:00.000Z");
  expect(call.init.headers.get("OK-ACCESS-SIGN")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(call.init.credentials).toBe("omit");
});

test("wallet response identity matches requested chain and address with network-specific casing", async () => {
  const token = (chainIndex: string, address: string, contract = "0x2222222222222222222222222222222222222222"): RawTokenAsset => ({
    chainIndex, tokenContractAddress: contract, address, symbol: "TST", balance: "1", rawBalance: "1", tokenPrice: "2", isRiskToken: false,
  });
  const clientFor = (asset: RawTokenAsset) => createOkxPortfolioClient({
    credentials,
    fetcher: async () => envelope([{ tokenAssets: [asset] }]),
    now: () => timestamp,
    allowLiveRequests: true,
  });

  const walletB = "0x1111111111111111111111111111111111111111";
  expect(isAddressForChain("8453", evm) && isAddressForChain("1", evm)).toBe(true);
  await expect(clientFor(token("1", evm)).allTokenBalances(evm, ["8453"]))
    .rejects.toMatchObject({ kind: "schema" });
  expect(isAddressForChain("8453", walletB)).toBe(true);
  await expect(clientFor(token("8453", walletB)).allTokenBalances(evm, ["8453"]))
    .rejects.toMatchObject({ kind: "schema" });

  const evmCaseResult = await clientFor(token("8453", evm.toLowerCase())).allTokenBalances(evm, ["8453"]);
  const evmCaseBook = bookFromAssets([{ wallet: "agente", assets: evmCaseResult }], 1).book;
  expect(evmCaseBook.agentUsd).toBe(2);

  const solWallet = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const solOtherCase = "ePjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  expect(isAddressForChain("501", solWallet)).toBe(true);
  expect(isAddressForChain("501", solOtherCase)).toBe(true);
  await expect(clientFor(token("501", solOtherCase, "So11111111111111111111111111111111111111112")).allTokenBalances(solWallet, ["501"]))
    .rejects.toMatchObject({ kind: "schema" });

  const emptyAddress = await clientFor(token("8453", "")).allTokenBalances(evm, ["8453"]);
  const emptyAddressBook = bookFromAssets([{ wallet: "agente", assets: emptyAddress }], 1).book;
  expect(emptyAddressBook.agentUsd).toBe(2);
  const mixedClient = createOkxPortfolioClient({
    credentials,
    fetcher: async () => envelope([{ tokenAssets: [token("8453", evm), token("8453", walletB)] }]),
    now: () => timestamp,
    allowLiveRequests: true,
  });
  const mixedBook = async () => bookFromAssets([{ wallet: "agente", assets: await mixedClient.allTokenBalances(evm, ["8453"]) }], 1).book;
  await expect(mixedBook()).rejects.toMatchObject({ kind: "schema" });
});

test("rejects an address that matches no requested chain family", async () => {
  const { fetcher, calls } = capture(envelope([{ tokenAssets: [] }]));
  const client = createOkxPortfolioClient({ credentials, fetcher, now: () => timestamp, allowLiveRequests: true });
  await expect(client.allTokenBalances(evm, ["501"])).rejects.toThrow("Address does not match any requested chain family");
  expect(calls).toHaveLength(0);
});

test("fails explicitly on non-success code, bad schema and http errors", async () => {
  const bad = async (response: Response) => {
    const client = createOkxPortfolioClient({ credentials, fetcher: async () => response, now: () => timestamp, allowLiveRequests: true });
    try { await client.allTokenBalances(evm, ["196"]); throw new Error("expected failure"); } catch (error) { return error as OkxPortfolioError; }
  };
  expect((await bad(envelope([], "50111"))).kind).toBe("api");
  expect((await bad(envelope([{ tokenAssets: [{ chainIndex: "196" }] }]))).kind).toBe("schema");
  expect((await bad(new Response("{}", { status: 500 }))).kind).toBe("http");
  expect((await bad(new Response("not json"))).kind).toBe("schema");
});

test("total value maps asset types and returns the provider string unchanged", async () => {
  const { fetcher, calls } = capture(envelope([{ totalValue: "1172.895057" }]));
  const client = createOkxPortfolioClient({ credentials, fetcher, now: () => timestamp, allowLiveRequests: true });
  expect(await client.totalValue(evm, ["1"], "defi")).toBe("1172.895057");
  expect(calls[0]!.input).toContain("assetType=2");
});

test("normalizes inventory per chain without inventing zeros or summing unknown prices", () => {
  const snapshot = syntheticInventory(1_760_000_000_000);
  expect(snapshot.queriedChains).toEqual(["143", "196", "501"]);
  const solana = snapshot.chains.find((chain) => chain.chainIndex === "501")!;
  const usdc = solana.assets.find((asset) => asset.symbol === "USDC")!;
  expect(usdc.priceUsd).toBeNull();
  expect(usdc.valueUsd).toBeNull();
  expect(solana.valueComplete).toBe(false);
  expect(solana.nativeBalance).toBe(0.05);
  expect(solana.knownValueUsd).toBeCloseTo(7.5, 9);
  expect(snapshot.valueComplete).toBe(false);
  const xlayer = snapshot.chains.find((chain) => chain.chainIndex === "196")!;
  expect(xlayer.knownValueUsd).toBeCloseTo(85, 9);
  expect(snapshot.knownValueUsd).toBeCloseTo(12.5 * 1.8 + 40 + 85 + 7.5, 9);
});

test("ignores assets from chains that were not queried and keeps absent chains absent", () => {
  const snapshot = normalizeInventory({
    address: evm, queriedChains: ["196"], observedAtMs: 1_760_000_000_000, source: "okx_balance_api", riskTokensExcluded: true,
    assets: [{ chainIndex: "1", tokenContractAddress: "", address: evm, symbol: "ETH", balance: "1", rawBalance: "1", tokenPrice: "3000", isRiskToken: false }],
  });
  expect(snapshot.chains).toHaveLength(0);
  expect(snapshot.knownValueUsd).toBe(0);
  expect(() => normalizeInventory({ address: evm, queriedChains: ["196"], observedAtMs: 0, source: "synthetic", riskTokensExcluded: true, assets: [] })).toThrow("Invalid observation time");
});
