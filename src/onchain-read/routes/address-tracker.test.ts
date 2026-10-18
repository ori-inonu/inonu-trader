/**
 * `address-tracker/trades` (T3.11, A-08). origin: documented_example, the example of the provider's page (market-portfolio-address-tracker-trades) with made up wallets; whether the family is
 * enabled for a key is read once by the probe recorded in evidence/T3.10-T3.11-cluster-list-e-address-tracker.md.
 */
import { describe, expect, test } from "bun:test";
import { ADDRESS_TRACKER_ENDPOINTS } from "./address-tracker";

const route = ADDRESS_TRACKER_ENDPOINTS[0]!;
const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const SOLANA = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

const documented = {
  trades: [
    {
      chainIndex: "56", marketCap: "6781.4431281050000000000000000000", quoteTokenAmount: "0.105214264768396182", quoteTokenSymbol: "BSC", realizedPnlUsd: "-28.212213718646256043110124512",
      tokenContractAddress: "0xcad59e019f06003303e56d4cc38fab0667114444", tokenPrice: "0.000006781443128105", tokenSymbol: "DoraemonToken", tradeTime: "1773736186000", tradeType: "2",
      txHash: "0x1daf1ab1c393ea5bf901f2d8efdd4a67ce1e1e0e7dfd748820e195f2398a8afd", walletAddress: "0xeb1222a0c07d4e62b0235d8b4b3e7e617d259be2",
    },
  ],
};

const path = (params: Record<string, string>): string => {
  const v = route.validate(params);
  if (!v.ok) throw new Error(`refused ${JSON.stringify(params)}`);
  return v.request.path;
};
const refused = (params: Record<string, string>): boolean => !route.validate(params).ok;
const out = (r: ReturnType<typeof route.normalize>): unknown => {
  if (!r.ok) throw new Error("not ok");
  return r.data;
};

describe("the request", () => {
  test("the three kinds of tracking, each a plain read, valid for half a minute", () => {
    expect(path({ trackerType: "1" })).toBe("/api/v6/dex/market/address-tracker/trades?trackerType=1");
    expect(path({ trackerType: "2" })).toBe("/api/v6/dex/market/address-tracker/trades?trackerType=2");
    const v = route.validate({ trackerType: "1" });
    expect(v.ok && v.ttlMs).toBe(30_000);
    expect(route.route).toBe("/onchain/address-tracker-trades");
    expect(route.tier).toBe("premium");
  });

  test("the third kind needs the addresses, up to twenty, each once, an EVM one in lower case and a Solana one as it is", () => {
    expect(path({ trackerType: "3", walletAddress: `${EVM},${SOLANA},${EVM.toUpperCase().replace("0X", "0x")}` })).toBe(`/api/v6/dex/market/address-tracker/trades?trackerType=3&walletAddress=${encodeURIComponent(`${EVM.toLowerCase()},${SOLANA}`)}`);
    expect(refused({ trackerType: "3" })).toBe(true);
    const many = Array.from({ length: 21 }, (_, i) => `0x${i.toString(16).padStart(40, "0")}`).join(",");
    expect(refused({ trackerType: "3", walletAddress: many })).toBe(true);
    expect(refused({ trackerType: "3", walletAddress: many.split(",").slice(0, 20).join(",") })).toBe(false);
    for (const bad of ["0x12", "not an address", `${EVM},`, `${EVM},x`, ""]) expect(refused({ trackerType: "3", walletAddress: bad })).toBe(true);
  });

  test("addresses named for another kind are a mistake, not something to ignore", () => {
    expect(refused({ trackerType: "1", walletAddress: EVM })).toBe(true);
    expect(refused({ trackerType: "2", walletAddress: SOLANA })).toBe(true);
  });

  test("the trade type, the chain (the five the page lists) and the filters, each in its range", () => {
    const p = path({ trackerType: "1", tradeType: "1", chainIndex: "501", minVolume: "100", maxVolume: "5000.5", minHolders: "50", minMarketCap: "1000", maxMarketCap: "1000000", minLiquidity: "500", maxLiquidity: "9999" });
    for (const piece of ["tradeType=1", "chainIndex=501", "minVolume=100", "maxVolume=5000.5", "minHolders=50", "maxLiquidity=9999"]) expect(p).toContain(piece);
    for (const chainIndex of ["501", "1", "56", "8453", "196"]) expect(refused({ trackerType: "1", chainIndex })).toBe(false);
    for (const bad of <Record<string, string>[]>[{ chainIndex: "137" }, { chainIndex: "x" }, { tradeType: "3" }, { tradeType: "-1" }, { tradeType: "x" }, { minVolume: "-5" }, { minVolume: "1e9" }, { minVolume: "abc" }, { minHolders: "" }, { maxLiquidity: "1 2" }]) {
      expect(refused({ trackerType: "1", ...bad })).toBe(true);
    }
  });

  test("a missing or odd kind and any parameter the route does not declare are refused before any call", () => {
    for (const bad of <Record<string, string>[]>[{}, { trackerType: "0" }, { trackerType: "4" }, { trackerType: "x" }, { trackerType: "1", extra: "1" }, { trackerType: "1", cursor: "a" }, { tradeType: "1" }]) expect(refused(bad)).toBe(true);
  });
});

describe("the trades", () => {
  const rows = out(route.normalize(documented)) as Array<Record<string, any>>;

  test("each trade says what was traded, at what price and market value, which side, when, and what the wallet made", () => {
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      chainIndex: "56", txHash: "0x1daf1ab1c393ea5bf901f2d8efdd4a67ce1e1e0e7dfd748820e195f2398a8afd", tokenSymbol: "DoraemonToken", tokenAddress: "0xcad59e019f06003303e56d4cc38fab0667114444",
      quoteSymbol: "BSC", quoteAmount: 0.10521426476839618, priceUsd: 0.000006781443128105, marketCapUsd: 6781.443128105, realizedPnlUsd: -28.212213718646256, side: "sell", atMs: 1773736186000,
    });
  });

  test("the wallet comes shortened to the browser and never whole", () => {
    expect(rows[0]!.walletShort).toBe("0xeb...9be2");
    expect(rows[0]!.wallet).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain("0xeb1222a0c07d4e62b0235d8b4b3e7e617d259be2");
  });

  test("the server process alone gets the whole wallet, for the engine", () => {
    const internal = route.normalizeInternal!(documented);
    const first = (internal.ok ? (internal.data as Array<Record<string, unknown>>) : [])[0]!;
    expect(first.wallet).toBe("0xeb1222a0c07d4e62b0235d8b4b3e7e617d259be2");
    expect(first.walletShort).toBeUndefined();
  });

  test("a buy and a sell are told apart by the provider's number, and any other value is a trade that cannot be read", () => {
    const base = documented.trades[0]!;
    const data = out(route.normalize({ trades: [{ ...base, tradeType: "1" }, { ...base, tradeType: "2", txHash: "0xb" }, { ...base, tradeType: "9", txHash: "0xc" }, { ...base, tradeType: "", txHash: "0xd" }] })) as Array<{ side: string }>;
    expect(data.map((r) => r.side)).toEqual(["buy", "sell"]);
  });
});

describe("what the provider may write differently", () => {
  const base = documented.trades[0]!;

  test("no trades is an empty answer, not an error, whatever the wrapper", () => {
    for (const empty of [null, [], {}, { trades: [] }]) expect(out(route.normalize(empty))).toEqual([]);
  });

  test("an answer that is not the documented shape is a contract error, never an empty answer", () => {
    for (const bad of ["x", { trades: "no" }, { somethingElse: [] }, ["x"]]) expect(route.normalize(bad).ok).toBe(false);
  });

  test("an array around the object is read too", () => {
    expect((out(route.normalize([documented])) as unknown[]).length).toBe(1);
  });

  test("a trade without what it cannot do without is dropped and the others stay; a secondary number that cannot be read is null, not zero", () => {
    const data = out(route.normalize({
      trades: [
        "x", { ...base, txHash: "bad hash" }, { ...base, chainIndex: "bsc", txHash: "0xe" }, { ...base, tradeTime: "soon", txHash: "0xf" }, { ...base, tradeTime: "0", txHash: "0x10" },
        { ...base, txHash: "0xok", tokenPrice: "null", marketCap: "", realizedPnlUsd: "n/a", quoteTokenAmount: "x" },
      ],
    })) as Array<Record<string, unknown>>;
    expect(data.length).toBe(1);
    expect(data[0]).toMatchObject({ txHash: "0xok", priceUsd: null, marketCapUsd: null, realizedPnlUsd: null, quoteAmount: null });
  });

  test("a symbol is cleaned of control characters, bidi marks and the punctuation the desk forbids", () => {
    const data = out(route.normalize({ trades: [{ ...base, tokenSymbol: "A\u202eB\u00b7C\u2014D\n", quoteTokenSymbol: "  \n  " }] })) as Array<{ tokenSymbol: string; quoteSymbol: string | null }>;
    expect(data[0]!.tokenSymbol).toBe("AB C-D");
    expect(data[0]!.quoteSymbol).toBeNull();
  });

  test("at most one hundred trades", () => {
    const many = { trades: Array.from({ length: 130 }, (_, i) => ({ ...base, txHash: `0x${i.toString(16)}` })) };
    expect((out(route.normalize(many)) as unknown[]).length).toBe(100);
  });
});
