/**
 * Adapter tests over the REAL signed client of src/onchainos with a scripted fake `fetch` and canary credentials.
 * No network, no environment, no files. Every body is SYNTHETIC and follows only the field names of the documentation.
 */

import { describe, expect, test } from "bun:test";
import { CANARY_KEY, CANARY_PASSPHRASE, CANARY_SECRET, envelope, makeStack, type FakeReply } from "../../onchainos/fakes.ts";
import { OnchainosError } from "../../onchainos/errors.ts";
import { FIXTURE_ACCOUNT, FIXTURE_TOKEN_A, FIXTURE_TOKEN_B } from "../fixtures.ts";
import {
  historyPageSize,
  parseBalanceRows,
  parseHistoryPage,
  readAllTokenBalances,
  readLiquidity,
  readPortfolioOverview,
  readPrices,
  readRecentPnl,
  readRisk,
  readSpecificBalances,
  readTokenDecimals,
  readTotalValue,
  readTransactions,
  totalValueRiskParam,
} from "./okx-read.ts";
import { WALLET_ENDPOINTS, walletEndpoint } from "./okx-endpoints.ts";

const balanceBody = (rows: unknown[]) => envelope([{ tokenAssets: rows }]);
const row = (extra: Record<string, unknown> = {}) => ({ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "2.5", rawBalance: "2500000", tokenPrice: "4", isRiskToken: false, ...extra });
const tx = (n: number, extra: Record<string, unknown> = {}) => ({ chainIndex: "1", txHash: `0xfixturehash${String(n).padStart(20, "0")}`, itype: "2", txTime: String(1_759_000_000_000 - n), from: [], to: [{ address: FIXTURE_ACCOUNT, amount: "1" }], tokenContractAddress: FIXTURE_TOKEN_A, amount: "1", symbol: "FIXA", txFee: "", txStatus: "success", ...extra });

describe("endpoint registry", () => {
  test("only reads, all under the v6 API, none with a documented tier", () => {
    for (const entry of WALLET_ENDPOINTS) {
      expect(entry.path.startsWith("/api/v6/")).toBe(true);
      expect(entry.tier).toBe("unknown");
      expect(entry.docUrl.startsWith("https://web3.okx.com/onchainos/dev-docs/")).toBe(true);
      expect(entry.path).not.toMatch(/aggregator|broadcast|simulate|swap|approve|transfer\b|trade|cross-chain/);
    }
    expect(WALLET_ENDPOINTS.filter((entry) => entry.method === "POST").map((entry) => entry.id)).toEqual(["balance.specific"]);
    expect(walletEndpoint("history.byAddress").pageLimit).toBe(100);
  });
});

describe("balances", () => {
  test("a signed GET carries the documented query and never leaks the credentials", async () => {
    const { http, fake } = makeStack([{ body: balanceBody([row()]) }]);
    const read = await readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1", "8453"], excludeRiskToken: "0" });
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/api/v6/dex/balance/all-token-balances-by-address");
    expect(call.query).toContain(`address=${FIXTURE_ACCOUNT}`);
    expect(call.query).toContain("chains=1%2C8453");
    expect(call.query).toContain("excludeRiskToken=0");
    expect(call.headers["OK-ACCESS-KEY"]).toBe(CANARY_KEY);
    expect(read.value).toHaveLength(1);
    expect(read.value[0]!.locator).toBe("/data/0/tokenAssets/0");
    expect(read.meta.endpoint).toBe("/api/v6/dex/balance/all-token-balances-by-address");
    expect(JSON.stringify(read)).not.toContain(CANARY_SECRET);
    expect(JSON.stringify(read)).not.toContain(CANARY_PASSPHRASE);
  });

  test("the risk filter is omitted when not requested (provider default)", async () => {
    const { http, fake } = makeStack([{ body: balanceBody([]) }]);
    await readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1"] });
    expect(fake.calls[0]!.query).not.toContain("excludeRiskToken");
  });

  test("invalid requests fail before any call", async () => {
    const { http, fake } = makeStack([]);
    await expect(readAllTokenBalances(http, { address: "not-an-address", chains: ["1"] })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: [] })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1", "1"] })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["999999"] })).rejects.toBeInstanceOf(OnchainosError);
    expect(fake.calls).toHaveLength(0);
  });

  test("a malformed answer fails closed; a row missing fields survives as undefined fields", async () => {
    expect(() => parseBalanceRows({})).toThrow(OnchainosError);
    expect(() => parseBalanceRows([{ noTokenAssets: [] }])).toThrow(OnchainosError);
    expect(() => parseBalanceRows([{ tokenAssets: ["text"] }])).toThrow(OnchainosError);
    const rows = parseBalanceRows([{ tokenAssets: [{ chainIndex: "1" }] }]);
    expect(rows[0]!.balance).toBeUndefined();
  });

  test("the total-value call types the risk flag as a Boolean with the same meaning", async () => {
    expect(totalValueRiskParam("0")).toBe(true);
    expect(totalValueRiskParam("1")).toBe(false);
    expect(totalValueRiskParam(undefined)).toBeUndefined();
    const { http, fake } = makeStack([{ body: envelope([{ totalValue: "50.25" }]) }]);
    const read = await readTotalValue(http, { address: FIXTURE_ACCOUNT, chains: ["1"], assetType: "tokens", excludeRiskToken: "0" });
    expect(read.value.valueText).toBe("50.25");
    expect(fake.calls[0]!.path).toBe("/api/v6/dex/balance/total-value-by-address");
    expect(fake.calls[0]!.query).toContain("assetType=1");
    expect(fake.calls[0]!.query).toContain("excludeRiskToken=true");
  });

  test("total value: two groups are ambiguous and fail closed", async () => {
    const { http } = makeStack([{ body: envelope([{ totalValue: "1" }, { totalValue: "2" }]) }]);
    await expect(readTotalValue(http, { address: FIXTURE_ACCOUNT, chains: ["1"], assetType: "all" })).rejects.toBeInstanceOf(OnchainosError);
  });

  test("specific tokens: a POST body with at most 20 named tokens", async () => {
    const { http, fake } = makeStack([{ body: balanceBody([row()]) }]);
    await readSpecificBalances(http, { address: FIXTURE_ACCOUNT, tokens: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }], excludeRiskToken: "1" });
    const call = fake.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/api/v6/dex/balance/token-balances-by-address");
    expect(JSON.parse(call.body!)).toEqual({ address: FIXTURE_ACCOUNT, tokenContractAddresses: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }], excludeRiskToken: "1" });
    const many = Array.from({ length: 21 }, (_, index) => ({ chainIndex: "1", tokenContractAddress: `0x${String(index).padStart(40, "0")}` }));
    await expect(readSpecificBalances(http, { address: FIXTURE_ACCOUNT, tokens: many })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readSpecificBalances(http, { address: FIXTURE_ACCOUNT, tokens: [{ chainIndex: "1", tokenContractAddress: "FixtureMint111111111111111111111111111111" }] })).rejects.toBeInstanceOf(OnchainosError);
  });
});

describe("history pagination", () => {
  const page = (rows: unknown[], cursor: string, key = "transactionList") => envelope([{ cursor, [key]: rows }]);

  test("page size follows the documentation: 20 for one chain, 100 for several", () => {
    expect(historyPageSize(1)).toBe(20);
    expect(historyPageSize(2)).toBe(100);
  });

  test("walks the cursor until it ends and sends the window", async () => {
    const { http, fake } = makeStack([{ body: page([tx(1), tx(2)], "c1") }, { body: page([tx(3)], "c2") }, { body: page([tx(4)], "") }]);
    const read = await readTransactions(http, { address: FIXTURE_ACCOUNT, chains: ["1"], beginMs: 1_750_000_000_000, endMs: 1_759_500_000_000, maxPages: 5 });
    expect(read.rows).toHaveLength(4);
    expect(read.pages).toBe(3);
    expect(read.truncated).toBe(false);
    expect(read.stopReason).toBe("exhausted");
    expect(fake.calls.map((call) => call.query.includes("cursor="))).toEqual([false, true, true]);
    expect(fake.calls[0]!.query).toContain("limit=20");
    expect(fake.calls[0]!.query).toContain("begin=1750000000000");
    expect(read.rows[0]!.locator).toBe("/page/0/transactionList/0");
    expect(read.rows[3]!.locator).toBe("/page/2/transactionList/0");
  });

  test("the page cap stops the walk and says something was left behind", async () => {
    const { http, fake } = makeStack((_call, index) => ({ body: page([tx(index * 2 + 1), tx(index * 2 + 2)], `c${index + 1}`) }));
    const read = await readTransactions(http, { address: FIXTURE_ACCOUNT, chains: ["1"], maxPages: 2 });
    expect(read.pages).toBe(2);
    expect(read.truncated).toBe(true);
    expect(read.stopReason).toBe("max_pages");
    expect(fake.calls).toHaveLength(2);
  });

  test("a repeated cursor and an empty page with a cursor are truncations, not completeness", async () => {
    const repeated = makeStack([{ body: page([tx(1)], "same") }, { body: page([tx(2)], "same") }]);
    const a = await readTransactions(repeated.http, { address: FIXTURE_ACCOUNT, chains: ["1"], maxPages: 5 });
    expect(a.truncated).toBe(true);
    expect(a.stopReason).toBe("repeated_cursor");
    const empty = makeStack([{ body: page([], "next") }]);
    const b = await readTransactions(empty.http, { address: FIXTURE_ACCOUNT, chains: ["1"], maxPages: 5 });
    expect(b.truncated).toBe(true);
    expect(b.stopReason).toBe("no_progress");
  });

  test("the table name and the example name are both read, and both together are refused", async () => {
    expect(parseHistoryPage(envelope([{ cursor: "", transactions: [tx(1)] }]).data, 0).shape).toBe("transactions");
    expect(parseHistoryPage(envelope([{ cursor: "", transactionList: [tx(1)] }]).data, 0).shape).toBe("transactionList");
    expect(() => parseHistoryPage([{ cursor: "", transactionList: [tx(1)], transactions: [tx(2)] }], 0)).toThrow(OnchainosError);
    expect(() => parseHistoryPage([{ cursor: "" }, { cursor: "" }], 0)).toThrow(OnchainosError);
  });

  test("a later page that fails stops the walk with a typed error, not a half answer", async () => {
    const { http } = makeStack([{ body: page([tx(1)], "c1") }, { status: 200, body: envelope({}, "51000", "bad") }]);
    await expect(readTransactions(http, { address: FIXTURE_ACCOUNT, chains: ["1"], maxPages: 5 })).rejects.toMatchObject({ kind: "api", apiCode: "51000" });
  });
});

describe("Address Analysis", () => {
  test("overview takes one chain and a time frame", async () => {
    const { http, fake } = makeStack([{ body: envelope({ realizedPnlUsd: "100" }) }]);
    const read = await readPortfolioOverview(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, timeFrame: "4" });
    expect(read.value.realizedPnlUsd).toBe("100");
    expect(fake.calls[0]!.path).toBe("/api/v6/dex/market/portfolio/overview");
    expect(fake.calls[0]!.query).toContain("walletAddress=");
    expect(fake.calls[0]!.query).toContain("timeFrame=4");
  });

  test("recent PnL is paged with at most 100 per call", async () => {
    const list = (n: number) => ({ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", realizedPnlUsd: String(n) });
    const { http, fake } = makeStack([{ body: envelope({ cursor: "n1", pnlList: [list(1)] }) }, { body: envelope({ cursor: "", pnlList: [list(2)] }) }]);
    const read = await readRecentPnl(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, maxPages: 3 });
    expect(read.rows).toHaveLength(2);
    expect(read.stopReason).toBe("exhausted");
    expect(fake.calls[0]!.query).toContain("limit=100");
    await expect(readRecentPnl(makeStack([{ body: envelope({ pnlList: "x" }) }]).http, { chainIndex: "1", address: FIXTURE_ACCOUNT, maxPages: 1 })).rejects.toBeInstanceOf(OnchainosError);
  });
});

describe("market evidence", () => {
  test("prices keep decimal text; the currency is undeclared; an unrequested identity is refused", async () => {
    const body = envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time: "1759999990000", price: "4.000000000000000001" }]);
    const { http, fake } = makeStack([{ body }]);
    const read = await readPrices(http, [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B }]);
    expect(fake.calls[0]!.method).toBe("POST");
    expect(read.value.prices[0]).toMatchObject({ priceText: "4.000000000000000001", currency: null, timeMs: 1_759_999_990_000 });
    expect(read.value.prices[0]!.state.kind).toBe("ok");
    expect(read.value.missing).toEqual([`1:contract:${FIXTURE_TOKEN_B}`]);
    const stranger = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: "0x00000000000000000000000000000000000ffff1", price: "1" }]) }]);
    await expect(readPrices(stranger.http, [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }])).rejects.toBeInstanceOf(OnchainosError);
  });

  test("the price endpoint does not take the native coin", async () => {
    const { http, fake } = makeStack([]);
    await expect(readPrices(http, [{ chainIndex: "1", tokenContractAddress: "" }])).rejects.toBeInstanceOf(OnchainosError);
    expect(fake.calls).toHaveLength(0);
  });

  test("a zero or unreadable market price is unverified, not a price", async () => {
    const { http } = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, price: "0" }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, price: "1e3" }]) }]);
    const read = await readPrices(http, [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B }]);
    expect(read.value.prices.map((price) => price.state.code)).toEqual(["price_zero_unverified", "price_unreadable"]);
  });

  test("token decimals are read as integers in range", async () => {
    const { http } = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, decimal: "6" }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, decimal: "99" }]) }]);
    const read = await readTokenDecimals(http, [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B }]);
    expect(read.value.tokenInfo.map((item) => item.decimals)).toEqual([6, null]);
    expect(read.value.tokenInfo[1]!.state.code).toBe("decimals_unreadable");
  });

  test("liquidity is a lower bound of at most five pools, exact", async () => {
    const pools = [{ liquidityUsd: "1000.5" }, { liquidityUsd: "250.25" }];
    const { http } = makeStack([{ body: envelope(pools) }, { body: envelope([]) }, { body: envelope([{ liquidityUsd: "x" }]) }, { body: envelope(Array.from({ length: 6 }, () => ({ liquidityUsd: "1" }))) }]);
    const token = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A };
    const ok = await readLiquidity(http, token);
    expect(ok.value).toMatchObject({ poolsRead: 2, liquidityUsdLowerBoundText: "1250.75", scope: "top_pools_lower_bound" });
    const none = await readLiquidity(http, token);
    expect(none.value.liquidityUsdLowerBoundText).toBeNull();
    expect(none.value.state.code).toBe("no_pools_listed");
    const bad = await readLiquidity(http, token);
    expect(bad.value.state.code).toBe("pool_liquidity_unreadable");
    await expect(readLiquidity(http, token)).rejects.toBeInstanceOf(OnchainosError);
  });

  test("risk level 0 is kept as 0 (undefined), tags are bounded", async () => {
    const { http } = makeStack([{ body: envelope([{ riskControlLevel: "0", tokenTags: ["honeypot", "x y", 5] }]) }, { body: envelope([{ riskControlLevel: "9" }]) }]);
    const token = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A };
    const zero = await readRisk(http, token);
    expect(zero.value.riskControlLevel).toBe(0);
    expect(zero.value.tags).toEqual(["honeypot"]);
    expect(zero.value.state.kind).toBe("ok");
    const wild = await readRisk(http, token);
    expect(wild.value.riskControlLevel).toBeNull();
    expect(wild.value.state.kind).toBe("unverified");
  });
});

describe("access and failures are typed, and never carry a credential", () => {
  const cases: [string, FakeReply, Record<string, unknown>][] = [
    ["unauthorized", { status: 401, body: { code: "50111", msg: "invalid key" } }, { kind: "http", httpStatus: 401 }],
    ["forbidden or region blocked", { status: 403, body: "blocked" }, { kind: "http", httpStatus: 403 }],
    ["legal restriction", { status: 451, body: "" }, { kind: "http", httpStatus: 451 }],
    ["payment required", { status: 402, body: { code: "1", msg: "pay" } }, { kind: "http", httpStatus: 402 }],
    ["api error code", { body: envelope([], "50001", "service busy") }, { kind: "api", apiCode: "50001" }],
    ["not json", { body: "<html>" }, { kind: "schema" }],
    ["network failure", { throws: new Error(`boom ${CANARY_SECRET}`) }, { kind: "network" }],
  ];
  for (const [name, reply, expected] of cases) {
    test(name, async () => {
      const { http } = makeStack([reply, reply, reply]);
      let error: unknown;
      try {
        await readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1"] });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(OnchainosError);
      expect(error).toMatchObject(expected);
      for (const secret of [CANARY_KEY, CANARY_SECRET, CANARY_PASSPHRASE]) expect(String((error as Error).message)).not.toContain(secret);
    });
  }

  test("429 is retried a bounded number of times, then reported as rate limited", async () => {
    const { http, fake } = makeStack(() => ({ status: 429, body: "" }), { maxRetries: 2 });
    await expect(readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1"] })).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fake.calls).toHaveLength(3);
  });

  test("a call that never answers hits the timeout", async () => {
    const { http } = makeStack([{ hang: true }], { timeoutMs: 20, maxRetries: 0 });
    await expect(readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1"] })).rejects.toMatchObject({ kind: "timeout" });
  });

  test("an offline client sends nothing", async () => {
    const { http, fake } = makeStack([], { allowNetwork: false });
    await expect(readAllTokenBalances(http, { address: FIXTURE_ACCOUNT, chains: ["1"] })).rejects.toMatchObject({ kind: "offline" });
    expect(fake.calls).toHaveLength(0);
  });
});
