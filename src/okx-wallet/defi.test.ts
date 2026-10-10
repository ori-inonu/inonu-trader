import { expect, test } from "bun:test";
import { okxDefiSource, parseDefiSearch } from "./defi";
import { createOkxTradeClient, TRADE_PATHS, type TradeFetch, type TradeFetchInit } from "./trade";

const credentials = { apiKey: "key", secretKey: "secret", passphrase: "pass" };
const timestamp = new Date("2026-10-10T12:00:00.000Z");

test("parses the OKX DeFi search list with rate as a fraction and unknown fees", () => {
  const products = parseDefiSearch({ total: 2, list: [
    { investmentId: 9502, name: "USDC", platformName: "Aave V3", rate: "0.02140", tvl: "3423591587.48413", chainIndex: "1", productGroup: "SINGLE_EARN", feeRate: null },
    { investmentId: "x", name: "other chain", chainIndex: "56", rate: "0.1" },
    { broken: true },
  ] }, "1", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  expect(products).toHaveLength(1);
  expect(products[0]).toMatchObject({ id: "9502", name: "Aave V3 USDC", chainIndex: "1", tokenContractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", tvlUsd: 3423591587.48413, subscribeFeeUsd: null });
  expect(products[0]!.apyPercent).toBeCloseTo(2.14, 9);
  expect(() => parseDefiSearch({ nope: true }, "1", "0x")).toThrow("Unexpected DeFi search schema");
});

test("DeFi source posts a signed JSON body through the trade client", async () => {
  const calls: { input: string; init: TradeFetchInit }[] = [];
  const fetcher: TradeFetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ code: "0", msg: "ok", data: { total: 1, list: [{ investmentId: "1", name: "USDT", platformName: "Demo", rate: "0.05", tvl: "10", chainIndex: "196" }] } }));
  };
  const client = createOkxTradeClient({ credentials, fetcher, now: () => timestamp, allowLiveRequests: true, minRequestIntervalMs: 0 });
  const source = okxDefiSource(client, () => "USDT");
  const products = await source.products("196", "0x1E4a5963aBFD975d8c9021ce480b42188849D41d");
  expect(products[0]).toMatchObject({ id: "1", name: "Demo USDT", apyPercent: 5 });
  const call = calls[0]!;
  expect(call.input).toBe(`https://web3.okx.com${TRADE_PATHS.defiProductSearch}`);
  expect(call.init.method).toBe("POST");
  expect(call.init.body).toBe(JSON.stringify({ tokenKeywordList: ["USDT"], chainIndex: "196", pageNum: 1, productGroup: "SINGLE_EARN" }));
  expect(call.init.headers.get("Content-Type")).toBe("application/json");
  expect(call.init.headers.get("OK-ACCESS-SIGN")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(await okxDefiSource(client, () => null).products("1", "0x")).toEqual([]);
});
