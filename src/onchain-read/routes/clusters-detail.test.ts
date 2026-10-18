/**
 * `cluster/list` (T3.10, F2-OCX-5). origin: documented_example, trimmed from the example of the provider's page (market-token-cluster-list) with made up addresses; the live shape is read once
 * by the probe recorded in evidence/T3.10-T3.11-cluster-list-e-address-tracker.md.
 */
import { describe, expect, test } from "bun:test";
import { CLUSTER_DETAIL_ENDPOINTS } from "./clusters-detail";

const route = CLUSTER_DETAIL_ENDPOINTS[0]!;
const SOL_TOKEN = "H5b4iYiZYycr7fmQ1dMj7hdfLGAEPcDH261K4hugpump";
const WALLET_A = "B6NR5XYLroBdAnKjcF2o1raKqgSdi68yGZm4jtPMmQbQ";
const WALLET_B = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

const documented = {
  clusterList: [
    {
      holdingAmount: "161022025.9", holdingValueUsd: "9340.1", holdingPercent: "0.16103", trendType: null, averageHoldingPeriod: "1762472580", pnlUsd: "0", pnlPercent: "0.0",
      buyVolume: "0", averageBuyPriceUsd: "0.0", sellVolume: "0", averageSellPriceUsd: "0.0", lastActiveTimestamp: "0",
      clusterAddressList: [{ address: WALLET_A, holdingAmount: "1.61022025886108E8", holdingValueUsd: "9340.1", holdingPercent: "0.16103", averageHoldingPeriod: "1762472580", lastActiveTimestamp: "0", addressRank: "1", isContract: true, isExchange: false, isKol: false }],
    },
    {
      holdingAmount: "68259624.6", holdingValueUsd: "3959.4", holdingPercent: "0.06826", trendType: ["buy"], averageHoldingPeriod: "1762581923", pnlUsd: "-9754.781914434808854181240150", pnlPercent: "-0.23747",
      buyVolume: "41078.157302747647241897599595", averageBuyPriceUsd: "1.0000000000", sellVolume: "27574.107143773950192358673755", averageSellPriceUsd: "0.0006", lastActiveTimestamp: "1762590000",
      clusterAddressList: [{ address: WALLET_B, holdingAmount: "68259624.6", holdingValueUsd: "3959.4", holdingPercent: "0.06826", averageHoldingPeriod: "1762581923", lastActiveTimestamp: "1762590000", addressRank: "2", isContract: false, isExchange: false, isKol: true }],
    },
  ],
};

const out = (r: ReturnType<typeof route.normalize>): unknown => {
  if (!r.ok) throw new Error("not ok");
  return r.data;
};

describe("the request", () => {
  test("a chain and a token, read from the provider's path with the token in its own spelling", () => {
    const v = route.validate({ chainIndex: "501", token: SOL_TOKEN });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request).toEqual({ method: "GET", path: `/api/v6/dex/market/token/cluster/list?chainIndex=501&tokenContractAddress=${SOL_TOKEN}` });
      expect(v.ttlMs).toBe(900_000);
    }
    const evm = route.validate({ chainIndex: "1", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" });
    expect(evm.ok && evm.request.path).toContain("tokenContractAddress=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  });

  test("it is a premium read, behind a click", () => {
    expect(route.tier).toBe("premium");
    expect(route.route).toBe("/onchain/cluster-list");
  });

  test("anything else is refused before any call: a missing or odd parameter, an extra one, a token that is not one", () => {
    for (const bad of <Record<string, string>[]>[{}, { chainIndex: "501" }, { token: SOL_TOKEN }, { chainIndex: "x", token: SOL_TOKEN }, { chainIndex: "501", token: "" }, { chainIndex: "501", token: "a b" }, { chainIndex: "501", token: SOL_TOKEN, extra: "1" }, { chainIndex: "501", token: "x".repeat(200) }, { chainIndex: "1", token: "0x12" }]) {
      expect(route.validate(bad).ok).toBe(false);
    }
  });
});

describe("the groups", () => {
  const data = out(route.normalize(documented)) as Array<Record<string, any>>;

  test("each group says what it holds, which way it moves, what it paid and what it made, with the numbers the provider wrote as text", () => {
    expect(data.length).toBe(2);
    expect(data[1]).toMatchObject({
      holdingAmount: 68259624.6, holdingUsd: 3959.4, holdingPct: 0.06826, trend: ["buy"], pnlUsd: -9754.781914434809, pnlPct: -0.23747, buyVolumeUsd: 41078.15730274765,
      avgBuyPriceUsd: 1, sellVolumeUsd: 27574.107143773952, avgSellPriceUsd: 0.0006, lastActiveMs: 1762590000000, addressCount: 1,
    });
  });

  test("the time of the last activity is in seconds at the provider and in milliseconds here; a value that already has thirteen digits is kept", () => {
    const at = (value: string) => ((out(route.normalize({ clusterList: [{ holdingAmount: "1", lastActiveTimestamp: value }] })) as Array<{ lastActiveMs: number | null }>)[0]!.lastActiveMs);
    expect(at("1791912423")).toBe(1791912423000);
    expect(at("1791912423000")).toBe(1791912423000);
    expect(at("0")).toBeNull();
    expect(at("-5")).toBeNull();
    expect(at("soon")).toBeNull();
  });

  test("a null trend is an empty list, and a time the provider writes as zero is not known (not 1970)", () => {
    expect(data[0]!.trend).toEqual([]);
    expect(data[0]!.lastActiveMs).toBeNull();
    expect(data[0]!.members[0].lastActiveMs).toBeNull();
  });

  test("the wallets of the group come shortened, with their flags, and never whole", () => {
    expect(data[0]!.members[0]).toMatchObject({ wallet: "B6NR...mQbQ", holdingUsd: 9340.1, rank: 1, isContract: true, isExchange: false, isKol: false });
    expect(JSON.stringify(data)).not.toContain(WALLET_A);
    expect(JSON.stringify(data)).not.toContain(WALLET_B);
  });

  test("for the server process alone the wallets are whole", () => {
    const internal = route.normalizeInternal!(documented);
    expect(internal.ok).toBe(true);
    const members = (internal.ok ? (internal.data as Array<{ members: Array<Record<string, unknown>> }>) : [])[1]!.members;
    expect(members[0]!.address).toBe(WALLET_B);
  });

  test("the browser gets a few wallets of each group, the engine gets them up to a bound, and a group says how many it has", () => {
    const wallets = Array.from({ length: 12 }, (_, i) => ({ address: `Wallet${i}${"x".repeat(30)}`, holdingValueUsd: "1", holdingPercent: "0.01" }));
    const big = { clusterList: [{ holdingAmount: "1", holdingValueUsd: "1", clusterAddressList: wallets }] };
    const browser = out(route.normalize(big)) as Array<{ members: unknown[]; addressCount: number }>;
    expect(browser[0]!.members.length).toBe(5);
    expect(browser[0]!.addressCount).toBe(12);
    const internal = route.normalizeInternal!(big);
    expect(internal.ok && (internal.data as Array<{ members: unknown[] }>)[0]!.members.length).toBe(12);
  });
});

describe("what the provider may write differently", () => {
  test("the table of the page calls the list clustList and the example calls it clusterList: both are read, and an array around the object too", () => {
    expect((out(route.normalize({ clustList: documented.clusterList })) as unknown[]).length).toBe(2);
    expect((out(route.normalize([documented])) as unknown[]).length).toBe(2);
  });

  test("a token with no groups is an empty answer, not an error", () => {
    for (const empty of [null, [], {}, { clusterList: [] }]) expect(out(route.normalize(empty))).toEqual([]);
  });

  test("an answer that is not the documented shape is a contract error, never an empty token", () => {
    for (const bad of ["x", { clusterList: "no" }, { somethingElse: [] }, ["x"]]) expect(route.normalize(bad).ok).toBe(false);
  });

  test("a group that cannot be read is dropped and the others stay; a number that cannot be read is null, not zero", () => {
    const data = out(route.normalize({ clusterList: ["x", { holdingAmount: "", holdingValueUsd: "" }, { holdingAmount: "5", holdingValueUsd: "null", pnlUsd: "n/a", trendType: ["buy", "x y", 7] }] })) as Array<Record<string, any>>;
    expect(data.length).toBe(1);
    expect(data[0]).toMatchObject({ holdingAmount: 5, holdingUsd: null, pnlUsd: null, trend: ["buy"] });
  });

  test("at most one hundred groups, as the provider says", () => {
    const many = { clusterList: Array.from({ length: 130 }, (_, i) => ({ holdingAmount: String(i + 1), holdingValueUsd: "1" })) };
    expect((out(route.normalize(many)) as unknown[]).length).toBe(100);
  });

  test("the text of a trend is plain letters: a value with anything else is left out", () => {
    const data = out(route.normalize({ clusterList: [{ holdingAmount: "1", trendType: ["buy", "sell\u202e", "a".repeat(40)] }] })) as Array<{ trend: string[] }>;
    expect(data[0]!.trend).toEqual(["buy"]);
  });
});
