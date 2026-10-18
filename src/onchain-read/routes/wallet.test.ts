/**
 * Wallet read routes (inonu-desktop-v1 T3.12, WAL-4). origin: shape_of_real_probe_2026-10-12 with synthetic values. The
 * key names, nesting and string typed numbers are the ones the provider answered on 2026-10-12 (kept in
 * .scratch/devportal/probe-results.json); the addresses and amounts below are made up, so no real wallet is in the tree.
 */
import { describe, expect, test } from "bun:test";
import type { Endpoint, Normalized } from "../catalog";
import { WALLET_ENDPOINTS } from "./wallet";

const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const EVM_LOWER = EVM.toLowerCase();
const SOLANA = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const COUNTERPARTY = "0x1111222233334444555566667777888899990000";

function route(id: string): Endpoint {
  const ep = WALLET_ENDPOINTS.find((e) => e.id === id);
  if (ep === undefined) throw new Error(`no route ${id}`);
  return ep;
}

function request(id: string, params: Record<string, string>): { path: string; ttlMs: number } {
  const v = route(id).validate(params);
  if (!v.ok) throw new Error(`${id} refused ${JSON.stringify(params)}`);
  return { path: v.request.path, ttlMs: v.ttlMs };
}

/** The smallest valid request of each route. */
function validParams(id: string): Record<string, string> {
  switch (id) {
    case "wallet-value":
    case "wallet-balances": return { address: EVM, chains: "1" };
    case "wallet-history": return { address: EVM };
    case "wallet-token-pnl": return { address: EVM, chainIndex: "1", token: EVM };
    case "wallet-overview": return { address: EVM, chainIndex: "1", timeFrame: "3" };
    case "wallet-pnl": return { address: EVM, chainIndex: "1" };
    default: throw new Error("unknown route " + id);
  }
}

const refused = (id: string, params: Record<string, string>): boolean => !route(id).validate(params).ok;
const out = (n: Normalized): unknown => {
  if (!n.ok) throw new Error("normalizer refused a valid answer");
  return n.data;
};

describe("the table", () => {
  test("six routes, each a plain GET of a read, with a distinct id and route", () => {
    expect(WALLET_ENDPOINTS.map((e) => e.id)).toEqual(["wallet-value", "wallet-balances", "wallet-history", "wallet-token-pnl", "wallet-overview", "wallet-pnl"]);
    expect(new Set(WALLET_ENDPOINTS.map((e) => e.route)).size).toBe(6);
    for (const e of WALLET_ENDPOINTS) {
      expect(e.route).toBe(`/onchain/${e.id}`);
      const params = validParams(e.id);
      const v = e.validate(params);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.request.method).toBe("GET");
        expect(v.request.body).toBeUndefined();
        expect(v.request.path.startsWith("/api/v6/dex/")).toBe(true);
      }
    }
  });

  test("the tiers follow wallet.md: balances and history free, token PnL basic, overview and recent PnL premium", () => {
    expect(WALLET_ENDPOINTS.map((e) => [e.id, e.tier])).toEqual([
      ["wallet-value", "free"], ["wallet-balances", "free"], ["wallet-history", "free"],
      ["wallet-token-pnl", "basic"], ["wallet-overview", "premium"], ["wallet-pnl", "premium"],
    ]);
  });
});

describe("addresses and networks", () => {
  test("an EVM address is lowercased in the provider path, so one wallet is one signed request", () => {
    const r = request("wallet-balances", { address: EVM, chains: "1,8453" });
    expect(r.path).toBe(`/api/v6/dex/balance/all-token-balances-by-address?address=${EVM_LOWER}&chains=1%2C8453&excludeRiskToken=1`);
  });

  test("a Solana address keeps its case and only goes with network 501", () => {
    expect(request("wallet-balances", { address: SOLANA, chains: "501" }).path).toContain(`address=${SOLANA}`);
    expect(refused("wallet-balances", { address: SOLANA, chains: "1" })).toBe(true);
    expect(refused("wallet-balances", { address: SOLANA, chains: "501,1" })).toBe(true);
    expect(refused("wallet-balances", { address: EVM, chains: "501" })).toBe(true);
    expect(refused("wallet-balances", { address: EVM, chains: "1,501" })).toBe(true);
  });

  test("a repeated network is asked once; too many, or not a number, is refused", () => {
    expect(request("wallet-balances", { address: EVM, chains: "1,1,56" }).path).toContain("chains=1%2C56");
    const many = Array.from({ length: 21 }, (_, i) => String(i + 1)).join(",");
    expect(refused("wallet-balances", { address: EVM, chains: many })).toBe(true);
    for (const chains of ["", "a", "1,,2", "1;2", "-1", "1.5"]) expect(refused("wallet-balances", { address: EVM, chains })).toBe(true);
  });

  test("anything that is not an address is refused before any call", () => {
    for (const address of ["", "0x123", "0xZZcdEf0123456789aBcDeF0123456789AbCdEf01", `${EVM} `, "0".repeat(41), "hello world", `${EVM}&chains=1`, "../../etc"]) {
      expect(refused("wallet-balances", { address, chains: "1" })).toBe(true);
    }
    expect(refused("wallet-balances", { chains: "1" })).toBe(true);
  });

  test("a parameter that the route does not declare is refused", () => {
    expect(refused("wallet-balances", { address: EVM, chains: "1", excludeRiskToken: "1" })).toBe(true);
    expect(refused("wallet-value", { address: EVM, chains: "1", extra: "x" })).toBe(true);
  });
});

describe("validators of each route", () => {
  test("token valuation and balances both include risky tokens for reconciliation", () => {
    for (const params of [{ address: EVM, chains: "1" }, { address: SOLANA, chains: "501" }]) {
      const total = new URL(request("wallet-value", params).path, "http://provider.invalid");
      const balances = new URL(request("wallet-balances", params).path, "http://provider.invalid");
      expect(total.searchParams.get("assetType")).toBe("1");
      expect(total.searchParams.get("excludeRiskToken")).toBe("false");
      expect(balances.searchParams.get("excludeRiskToken")).toBe("1");
      expect(total.searchParams.get("chains")).toBe(balances.searchParams.get("chains"));
    }
  });

  test("total value: defaults to tokens and still accepts explicit asset types 0 to 2", () => {
    expect(request("wallet-value", { address: EVM, chains: "1" }).path).toBe(`/api/v6/dex/balance/total-value-by-address?address=${EVM_LOWER}&chains=1&assetType=1&excludeRiskToken=false`);
    expect(request("wallet-value", { address: EVM, chains: "1", assetType: "1" }).path).toContain("assetType=1");
    for (const assetType of ["3", "-1", "x", ""]) expect(refused("wallet-value", { address: EVM, chains: "1", assetType })).toBe(true);
  });

  test("history: limit up to 20, a cursor of plain characters, a token only with one network", () => {
    expect(request("wallet-history", { address: EVM }).path).toBe(`/api/v6/dex/post-transaction/transactions-by-address?address=${EVM_LOWER}&limit=20`);
    expect(request("wallet-history", { address: EVM, chains: "1,8453", limit: "5", cursor: "1791822887" }).path).toContain("cursor=1791822887");
    expect(request("wallet-history", { address: EVM, chains: "1", token: EVM }).path).toContain(`tokenContractAddress=${EVM_LOWER}`);
    expect(refused("wallet-history", { address: EVM, token: EVM })).toBe(true);
    expect(refused("wallet-history", { address: EVM, chains: "1,56", token: EVM })).toBe(true);
    for (const limit of ["0", "21", "x", "-3"]) expect(refused("wallet-history", { address: EVM, limit })).toBe(true);
    for (const cursor of ["a b", "x&y=1", "", "a".repeat(129)]) expect(refused("wallet-history", { address: EVM, cursor })).toBe(true);
  });

  test("a token filter of an EVM address is a 0x contract: anything else is refused here, not after the provider refuses it", () => {
    for (const token of ["abc123", "0x12", "0xZZ" + "0".repeat(38), "So11111111111111111111111111111111111111112"]) expect(refused("wallet-history", { address: EVM, chains: "1", token })).toBe(true);
    for (const token of ["abc123", "0x12", "0xZZ" + "0".repeat(38)]) expect(refused("wallet-token-pnl", { address: EVM, chainIndex: "1", token })).toBe(true);
  });

  test("token PnL: one network, one token, the same family rule", () => {
    const r = request("wallet-token-pnl", { address: EVM, chainIndex: "8453", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" });
    expect(r.path).toBe(`/api/v6/dex/market/portfolio/token/latest-pnl?chainIndex=8453&walletAddress=${EVM_LOWER}&tokenContractAddress=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`);
    expect(request("wallet-token-pnl", { address: SOLANA, chainIndex: "501", token: "So11111111111111111111111111111111111111112" }).path).toContain("tokenContractAddress=So11111111111111111111111111111111111111112");
    expect(refused("wallet-token-pnl", { address: SOLANA, chainIndex: "1", token: "abc" })).toBe(true);
    expect(refused("wallet-token-pnl", { address: EVM, chainIndex: "501", token: "abc" })).toBe(true);
    expect(refused("wallet-token-pnl", { address: EVM, chainIndex: "1" })).toBe(true);
    expect(refused("wallet-token-pnl", { address: EVM, chainIndex: "1", token: "a b" })).toBe(true);
  });

  test("overview: the time frame is 1 to 5", () => {
    expect(request("wallet-overview", { address: EVM, chainIndex: "1", timeFrame: "4" }).path).toContain("timeFrame=4");
    for (const timeFrame of ["0", "6", "x", ""]) expect(refused("wallet-overview", { address: EVM, chainIndex: "1", timeFrame })).toBe(true);
    expect(refused("wallet-overview", { address: EVM, chainIndex: "1" })).toBe(true);
  });

  test("recent PnL: limit 1 to 100, optional cursor", () => {
    expect(request("wallet-pnl", { address: EVM, chainIndex: "1" }).path).toBe(`/api/v6/dex/market/portfolio/recent-pnl?chainIndex=1&walletAddress=${EVM_LOWER}`);
    expect(request("wallet-pnl", { address: EVM, chainIndex: "1", limit: "100", cursor: "1791397463000" }).path).toContain("limit=100");
    for (const limit of ["0", "101", "x"]) expect(refused("wallet-pnl", { address: EVM, chainIndex: "1", limit })).toBe(true);
  });

  test("the time to live is longer for slow data than for balances", () => {
    expect(request("wallet-balances", { address: EVM, chains: "1" }).ttlMs).toBeLessThan(request("wallet-history", { address: EVM }).ttlMs);
    expect(request("wallet-overview", { address: EVM, chainIndex: "1", timeFrame: "1" }).ttlMs).toBeGreaterThanOrEqual(300_000);
  });
});

describe("balances", () => {
  const answer = [{
    tokenAssets: [
      { chainIndex: "1", symbol: "USDC", balance: "37.192124", tokenPrice: "1", isRiskToken: false, rawBalance: "37192124", address: EVM, tokenContractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
      { chainIndex: "1", symbol: "Eagle", balance: "10000000", tokenPrice: "0.0000149", isRiskToken: true, rawBalance: "10000000000000000", address: EVM, tokenContractAddress: "0xbfd96f218d6a13d1000000000000000000000000" },
      { chainIndex: "1", symbol: "ETH", balance: "0.5", tokenPrice: "3000", isRiskToken: false, rawBalance: "500000000000000000", address: EVM, tokenContractAddress: "" },
      { chainIndex: "1", symbol: "NOPRICE", balance: "12", tokenPrice: "", isRiskToken: false, rawBalance: "12", address: EVM, tokenContractAddress: "0x0000000000000000000000000000000000000abc" },
    ],
  }];

  test("rows are ordered by value, an unpriced balance goes last and is not zero, the provider's risk flag survives", () => {
    const data = out(route("wallet-balances").normalize(answer)) as { rows: Array<Record<string, unknown>>; total: number };
    expect(data.total).toBe(4);
    expect(data.rows.map((r) => r.symbol)).toEqual(["ETH", "Eagle", "USDC", "NOPRICE"]);
    const eth = data.rows[0]!;
    expect(eth).toMatchObject({ chainIndex: "1", symbol: "ETH", tokenAddress: null, balance: 0.5, priceUsd: 3000, valueUsd: 1500, flaggedRisk: false });
    const last = data.rows[3]!;
    expect(last.priceUsd).toBeNull();
    expect(last.valueUsd).toBeNull();
    expect(data.rows[1]!.flaggedRisk).toBe(true);
  });

  test("only an explicit boolean risk flag is known; absence or invalid flags stay unknown", () => {
    const flags: Array<Record<string, unknown>> = [
      {}, { isRiskToken: null }, { isRiskToken: "true" }, { isRiskToken: "false" },
      { isRiskToken: 0 }, { isRiskToken: 1 }, { isRiskToken: {} }, { isRiskToken: [] },
      { isRisk: true }, { isRiskToken: false }, { isRiskToken: true },
    ];
    const data = out(route("wallet-balances").normalize([{
      tokenAssets: flags.map((flag, i) => ({ chainIndex: "501", symbol: `R${i}`, balance: "1", tokenPrice: "1", ...flag })),
    }])) as { rows: Array<Record<string, unknown>>; total: number };
    expect(data.total).toBe(11);
    expect(data.rows.map((r) => r.flaggedRisk)).toEqual([null, null, null, null, null, null, null, null, null, false, true]);
  });

  test("the address of the person is not sent back", () => {
    expect(JSON.stringify(out(route("wallet-balances").normalize(answer)))).not.toContain(EVM.slice(2, 12));
  });

  test("a row without the fields it cannot do without is dropped, the others stay", () => {
    const data = out(route("wallet-balances").normalize([{
      tokenAssets: [
        { chainIndex: "1", symbol: "OK", balance: "1", tokenPrice: "2" },
        { chainIndex: "1", symbol: "", balance: "1", tokenPrice: "2" },
        { chainIndex: "x", symbol: "BADCHAIN", balance: "1", tokenPrice: "2" },
        { chainIndex: "1", symbol: "BADBAL", balance: "many", tokenPrice: "2" },
        { chainIndex: "1", symbol: "NEG", balance: "-1", tokenPrice: "2" },
        "not a row",
      ],
    }])) as { rows: Array<{ symbol: string }> };
    expect(data.rows.map((r) => r.symbol)).toEqual(["OK"]);
  });

  test("a symbol is cleaned of control characters, bidi marks and the punctuation the desk forbids", () => {
    const data = out(route("wallet-balances").normalize([{ tokenAssets: [{ chainIndex: "1", symbol: "A\u202eB\u00b7C\u2014D\n", balance: "1", tokenPrice: "1" }] }])) as { rows: Array<{ symbol: string }> };
    expect(data.rows[0]!.symbol).toBe("AB C-D");
  });

  test("more than 200 rows keep the 200 largest and say how many there were", () => {
    const assets = Array.from({ length: 230 }, (_, i) => ({ chainIndex: "1", symbol: `T${i}`, balance: "1", tokenPrice: String(i + 1) }));
    const data = out(route("wallet-balances").normalize([{ tokenAssets: assets }])) as { rows: Array<{ symbol: string }>; total: number };
    expect(data.rows.length).toBe(200);
    expect(data.total).toBe(230);
    expect(data.rows[0]!.symbol).toBe("T229");
  });

  test("rows that were offered and none of which can be read are a contract error: a renamed field is not an empty wallet", () => {
    const drifted = [{ tokenAssets: [{ chainIndex: "1", symbol: "ETH", amount: "1", tokenPrice: "3000" }, { chainIndex: "1", symbol: "USDC", amount: "5", tokenPrice: "1" }] }];
    expect(route("wallet-balances").normalize(drifted).ok).toBe(false);
    // one readable row among unreadable ones is still an answer
    expect(out(route("wallet-balances").normalize([{ tokenAssets: [...drifted[0]!.tokenAssets, { chainIndex: "1", symbol: "OK", balance: "1", tokenPrice: "1" }] }]))).toMatchObject({ total: 1 });
  });

  test("no tokens is an empty answer, not an error; a payload that is not a list is a contract error", () => {
    expect(out(route("wallet-balances").normalize([]))).toEqual({ rows: [], total: 0 });
    expect(out(route("wallet-balances").normalize([{ tokenAssets: [] }]))).toEqual({ rows: [], total: 0 });
    expect(route("wallet-balances").normalize({ nope: 1 }).ok).toBe(false);
    expect(route("wallet-balances").normalize(["x"]).ok).toBe(false);
  });
});

describe("total value", () => {
  test("the value is a number; an unreadable one is a contract error, never zero", () => {
    expect(out(route("wallet-value").normalize([{ totalValue: "1234.56" }]))).toEqual({ totalValueUsd: 1234.56 });
    expect(out(route("wallet-value").normalize([{ totalValue: "0" }]))).toEqual({ totalValueUsd: 0 });
    for (const bad of [[{ totalValue: "" }], [{ totalValue: "n/a" }], [{ totalValue: "-5" }], [{}], ["x"]]) expect(route("wallet-value").normalize(bad).ok).toBe(false);
    expect(out(route("wallet-value").normalize([]))).toBeNull();
  });
});

describe("history", () => {
  const answer = [{
    cursor: "1791822887",
    transactions: [
      { chainIndex: "1", txHash: "0xa65c46fca3f72088000000000000000000000000000000000000000000000001", itype: "2", methodId: "0x60806040", nonce: "", txTime: "1791836363000", from: [{ address: COUNTERPARTY, amount: "10000000" }], to: [{ address: EVM, amount: "10000000" }], tokenContractAddress: "0xf061baa8f2224132000000000000000000000000", amount: "10000000", symbol: "SATOSYS", txFee: "", txStatus: "success", hitBlacklist: false },
      { chainIndex: "8453", txHash: "0x668cbdec10000000000000000000000000000000000000000000000000000002", itype: "0", nonce: "4", txTime: "1791835019000", from: [{ address: EVM, amount: "1" }], to: [{ address: COUNTERPARTY, amount: "1" }], tokenContractAddress: "", amount: "0.25", symbol: "ETH", txFee: "0.00002", txStatus: "fail", hitBlacklist: true },
      { chainIndex: "1", txHash: "bad hash with spaces", txTime: "1791835019000" },
      { chainIndex: "1", txHash: "0xabc", txTime: "soon" },
    ],
  }];

  test("rows keep what the person needs to audit a movement, the counterparty is shortened, the flags stay as flags", () => {
    const data = out(route("wallet-history").normalize(answer)) as { cursor: string | null; rows: Array<Record<string, unknown>> };
    expect(data.cursor).toBe("1791822887");
    expect(data.rows.length).toBe(2);
    expect(data.rows[0]).toMatchObject({
      chainIndex: "1", atMs: 1791836363000, kind: "token", symbol: "SATOSYS", amount: 10000000, status: "success", feeNative: null,
      from: "0x11...0000", to: "0xAb...Ef01", flaggedByProvider: false,
    });
    expect(data.rows[1]).toMatchObject({ chainIndex: "8453", kind: "native", status: "fail", feeNative: 0.00002, tokenAddress: null, flaggedByProvider: true });
  });

  test("no full wallet address leaves the route", () => {
    const text = JSON.stringify(out(route("wallet-history").normalize(answer)));
    expect(text).not.toContain(COUNTERPARTY);
    expect(text).not.toContain(EVM);
    expect(text).not.toContain(EVM_LOWER);
  });

  test("an unknown status or kind is null, not guessed", () => {
    const data = out(route("wallet-history").normalize([{ transactions: [{ chainIndex: "1", txHash: "0xaa", txTime: "1", itype: "9", txStatus: "weird" }] }])) as { cursor: string | null; rows: Array<Record<string, unknown>> };
    expect(data.rows[0]).toMatchObject({ kind: null, status: null });
    expect(data.cursor).toBeNull();
  });

  test("a kind that is the name of an object property is not a kind", () => {
    for (const itype of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const data = out(route("wallet-history").normalize([{ transactions: [{ chainIndex: "1", txHash: "0xaa", txTime: "1", itype }] }])) as { rows: Array<Record<string, unknown>> };
      expect(data.rows[0]!.kind).toBeNull();
      expect(JSON.stringify(data)).toContain('"kind":null');
    }
  });

  test("no history is an empty answer; a payload without an object is a contract error", () => {
    expect(out(route("wallet-history").normalize([]))).toEqual({ cursor: null, rows: [] });
    expect(out(route("wallet-history").normalize([{ cursor: "", transactions: [] }]))).toEqual({ cursor: null, rows: [] });
    expect(route("wallet-history").normalize(["x"]).ok).toBe(false);
  });
});

describe("the PnL family", () => {
  test("token PnL carries the numbers when the provider computes them", () => {
    expect(out(route("wallet-token-pnl").normalize({
      isPnlSupported: true, realizedPnlUsd: "10.5", unrealizedPnlUsd: "-3", totalPnlUsd: "7.5", realizedPnlPercent: "4", unrealizedPnlPercent: "-1.5", totalPnlPercent: "2.5",
    }))).toEqual({ supported: true, realizedUsd: 10.5, unrealizedUsd: -3, totalUsd: 7.5, realizedPct: 4, unrealizedPct: -1.5, totalPct: 2.5 });
  });

  test("zeros from a network the provider does not compute are not a result: they are null with supported false", () => {
    expect(out(route("wallet-token-pnl").normalize({
      isPnlSupported: false, realizedPnlPercent: "0", realizedPnlUsd: "0", totalPnlPercent: "0", totalPnlUsd: "0", unrealizedPnlPercent: "0", unrealizedPnlUsd: "0",
    }))).toEqual({ supported: false, realizedUsd: null, unrealizedUsd: null, totalUsd: null, realizedPct: null, unrealizedPct: null, totalPct: null });
  });

  test("token PnL without the support flag, or with a flag that is not a boolean, is a contract error", () => {
    expect(route("wallet-token-pnl").normalize({ totalPnlUsd: "1" }).ok).toBe(false);
    expect(route("wallet-token-pnl").normalize({ isPnlSupported: "true" }).ok).toBe(false);
    expect(out(route("wallet-token-pnl").normalize([]))).toBeNull();
  });

  test("overview keeps the counts next to the rate so a rate over no sales can be read for what it is", () => {
    const data = out(route("wallet-overview").normalize({
      avgBuyValueUsd: "76.13", buyTxCount: "10", buyTxVolume: "761.35", realizedPnlUsd: "0", sellTxCount: "0", sellTxVolume: "0", top3PnlTokenPercent: "0", winRate: "0.00",
    })) as Record<string, unknown>;
    expect(data).toMatchObject({ winRatePct: 0, buyCount: 10, sellCount: 0, buyVolumeUsd: 761.35, sellVolumeUsd: 0, avgBuyValueUsd: 76.13, realizedPnlUsd: 0 });
    expect(out(route("wallet-overview").normalize({ winRate: "" }))).toMatchObject({ winRatePct: null, buyCount: null });
    expect(route("wallet-overview").normalize("x").ok).toBe(false);
  });

  test("recent PnL rows: required symbol and network, everything else null when unreadable, a cursor to continue", () => {
    const data = out(route("wallet-pnl").normalize({
      cursor: "1791397463000",
      pnlList: [
        { chainIndex: "1", tokenSymbol: "GREG", tokenContractAddress: "0x76669a82255ef545000000000000000000000000", tokenBalanceAmount: "14432947.79", tokenBalanceUsd: "59.34", realizedPnlUsd: "0", unrealizedPnlUsd: "-15.97", totalPnlUsd: "-15.97", totalPnlPercent: "-20.99", tokenPositionPercent: "100.0", lastActiveTimestamp: "1791574583000" },
        { chainIndex: "1", tokenSymbol: "BARE", tokenBalanceUsd: "", totalPnlUsd: "n/a" },
        { chainIndex: "1", tokenSymbol: "" },
        { tokenSymbol: "NOCHAIN" },
      ],
    })) as { cursor: string | null; rows: Array<Record<string, unknown>> };
    expect(data.cursor).toBe("1791397463000");
    expect(data.rows.map((r) => r.symbol)).toEqual(["GREG", "BARE"]);
    expect(data.rows[0]).toMatchObject({ balanceUsd: 59.34, totalUsd: -15.97, totalPct: -20.99, positionPct: 100, lastActiveMs: 1791574583000 });
    expect(data.rows[1]).toMatchObject({ tokenAddress: null, balanceUsd: null, totalUsd: null, lastActiveMs: null });
  });

  test("an empty recent PnL is an empty list", () => {
    expect(out(route("wallet-pnl").normalize({ cursor: "", pnlList: [] }))).toEqual({ cursor: null, rows: [] });
    expect(out(route("wallet-pnl").normalize([]))).toEqual({ cursor: null, rows: [] });
  });
});

describe("what no route ever does", () => {
  test("none of the six reaches a path that signs, approves or sends", () => {
    const paths = WALLET_ENDPOINTS.map((e) => {
      const params = validParams(e.id);
      const v = e.validate(params);
      return v.ok ? v.request.path : "";
    });
    for (const path of paths) {
      expect(path).toMatch(/^\/api\/v6\/dex\/(balance|post-transaction|market\/portfolio)\//);
      expect(path).not.toMatch(/swap|approve|broadcast|send|sign|simulate|pre-transaction|gas/i);
    }
  });
});
