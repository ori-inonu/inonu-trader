/**
 * `memepump/tokenList` (RAS-2). origin: shape_of_real_probe_2026-10-13 with synthetic values: the key names, the nesting, the string typed numbers and the wrapper (the answer IS the list) are the
 * ones the provider answered on 2026-10-13 for the new launches on Solana; the symbols, addresses and amounts below are made up.
 */
import { describe, expect, test } from "bun:test";
import { MEMEPUMP_ENDPOINTS } from "./memepump";

const route = MEMEPUMP_ENDPOINTS[0]!;
const MINT = "Hhw2vhDnhy6KVPUNFgYM4rCHXzZRkAj2nupVkLqn";

const live = (over: Record<string, unknown> = {}) => ({
  aped: "3", bagsFeeClaimed: false, bondingPercent: "41.5", chainIndex: "501", createdTimestamp: "1791935787000", creatorAddress: "7T69EE4U3rXHowYEovLNw794Ho9P1L8Nz8z2dGbY",
  logoUrl: "https://static.oklink.com/cdn/web3/currency/token/xxx.png",
  market: { buyTxCount1h: "97", marketCapUsd: "6004.27698243587696138", sellTxCount1h: "70", txCount1h: "167", volumeUsd1h: "8901.66273488" },
  migratedBeginTimestamp: "", migratedEndTimestamp: "", name: "SUSAN", protocolId: "139048", quoteTokenAddress: "So11111111111111111111111111111111111111",
  social: { communityTakeover: false, dexScreenerPaid: true, liveOnPumpFun: false, telegram: "https://t.me/susan", website: "", x: "https://x.com/susan" },
  symbol: "$SUS",
  tags: { bundlersPercent: "17.782", devHoldingsPercent: "5.3916", freshWalletsPercent: "1.4717", insidersPercent: "0", snipersPercent: "53.1842", suspectedPhishingWalletPercent: "0", top10HoldingsPercent: "50.1642", totalHolders: "45" },
  tokenAddress: MINT,
  ...over,
});

const path = (params: Record<string, string>): string => {
  const v = route.validate(params);
  if (!v.ok) throw new Error(`refused ${JSON.stringify(params)}`);
  return v.request.path;
};
const refused = (params: Record<string, string>): boolean => !route.validate(params).ok;
const out = (r: ReturnType<typeof route.normalize>): Array<Record<string, any>> => {
  if (!r.ok) throw new Error("not ok");
  return r.data as Array<Record<string, any>>;
};

describe("the request", () => {
  test("a chain and a stage of the life of the launch, a plain read valid for half a minute", () => {
    expect(path({ chainIndex: "501", stage: "NEW" })).toBe("/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=NEW");
    for (const stage of ["NEW", "MIGRATING", "MIGRATED"]) expect(refused({ chainIndex: "501", stage })).toBe(false);
    const v = route.validate({ chainIndex: "501", stage: "NEW" });
    expect(v.ok && v.ttlMs).toBe(30_000);
    expect(route.route).toBe("/onchain/memepump-list");
    expect(route.tier).toBe("premium");
  });

  test("the protocols, the percents, the dollar amounts and the counts are filters, each in its own shape and named as the provider names them", () => {
    const p = path({ chainIndex: "501", stage: "MIGRATING", protocolIdList: "120596,139661,120596", maxDevHoldingsPercent: "10", maxBundlersPercent: "20.5", minBondingPercent: "50", minMarketCapUsd: "5000", maxVolumeUsd: "100000.25", minHolders: "100", maxTokenAge: "60", minBuyTxCount: "5" });
    for (const piece of ["protocolIdList=120596%2C139661", "maxDevHoldingsPercent=10", "maxBundlersPercent=20.5", "minBondingPercent=50", "minMarketCapUsd=5000", "maxVolumeUsd=100000.25", "minHolders=100", "maxTokenAge=60", "minBuyTxCount=5"]) expect(p).toContain(piece);
    expect(p.match(/120596/g)?.length).toBe(1);
  });

  test("anything else is refused before any call: a missing or odd chain or stage, a bad filter, an unknown parameter", () => {
    const base = { chainIndex: "501", stage: "NEW" };
    for (const bad of <Record<string, string>[]>[
      {}, { chainIndex: "501" }, { stage: "NEW" }, { chainIndex: "x", stage: "NEW" }, { chainIndex: "501", stage: "new" }, { chainIndex: "501", stage: "OLD" },
      { ...base, protocolIdList: "a" }, { ...base, protocolIdList: "" }, { ...base, protocolIdList: Array.from({ length: 11 }, (_, i) => String(i + 1)).join(",") },
      { ...base, maxDevHoldingsPercent: "101" }, { ...base, maxDevHoldingsPercent: "-1" }, { ...base, maxDevHoldingsPercent: "1e2" }, { ...base, minMarketCapUsd: "-5" }, { ...base, minMarketCapUsd: "abc" },
      { ...base, minHolders: "1.5" }, { ...base, minHolders: "-3" }, { ...base, extra: "1" }, { ...base, keywordsInclude: "dog" },
    ]) {
      expect(refused(bad)).toBe(true);
    }
  });

  test("the wallet of the user is never a parameter: with it the provider would add the user's own position to the answer", () => {
    expect(refused({ chainIndex: "501", stage: "NEW", walletAddress: "7T69EE4U3rXHowYEovLNw794Ho9P1L8Nz8z2dGbY" })).toBe(true);
  });
});

describe("the launches", () => {
  const rows = out(route.normalize([live(), live({ symbol: "DOG", tokenAddress: "DogMintAddress1111111111111111111111111111", tags: { totalHolders: "2" } })]));

  test("each launch says what it is, how old, what its market does in the last hour, how far along the curve it is and what its holders look like", () => {
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      chainIndex: "501", protocolId: "139048", address: MINT, symbol: "$SUS", name: "SUSAN", createdMs: 1791935787000, marketCapUsd: 6004.276982435877, volume1hUsd: 8901.66273488,
      txCount1h: 167, buyTx1h: 97, sellTx1h: 70, bondingPct: 41.5, top10: 50.1642, dev: 5.3916, insiders: 0, bundlers: 17.782, snipers: 53.1842, freshWallets: 1.4717, phishing: 0, holders: 45, aped: 3,
    });
  });

  test("a link is a yes or a no and its address is never forwarded; the logo and the creator never leave", () => {
    expect(rows[0]).toMatchObject({ hasX: true, hasTelegram: true, hasWebsite: false, dexScreenerPaid: true, communityTakeover: false, liveOnPumpFun: false });
    const text = JSON.stringify(rows);
    for (const gone of ["https://", "x.com", "t.me", "7T69EE4U", "logoUrl", "creator"]) expect(text).not.toContain(gone);
  });

  test("what the provider did not give is null, never zero", () => {
    expect(rows[1]).toMatchObject({ top10: null, dev: null, bundlers: null, snipers: null, holders: 2 });
    const bare = out(route.normalize([{ chainIndex: "501", tokenAddress: MINT, symbol: "X" }]));
    expect(bare[0]).toMatchObject({ marketCapUsd: null, volume1hUsd: null, buyTx1h: null, bondingPct: null, top10: null, createdMs: null, hasX: null, dexScreenerPaid: null });
  });
});

describe("what the provider may write differently", () => {
  test("the page wraps the list in an object (and calls the address tokenContractAddress): both readings give the same launches", () => {
    const flat = out(route.normalize([live()]));
    const wrapped = out(route.normalize({ cursor: "abc", items: [live({ tokenAddress: undefined, tokenContractAddress: MINT })] }));
    const inArray = out(route.normalize([{ cursor: "", items: [live()] }]));
    expect(wrapped).toEqual(flat);
    expect(inArray).toEqual(flat);
  });

  test("no launches is an empty answer, not an error", () => {
    for (const empty of [null, [], {}, { items: [] }]) expect(out(route.normalize(empty))).toEqual([]);
  });

  test("an answer that is not a list, or an object that holds no list, is a contract error", () => {
    for (const bad of ["x", 7, { items: "no" }, { somethingElse: [] }]) expect(route.normalize(bad).ok).toBe(false);
  });

  test("a launch without a chain, an address or a symbol is dropped and the others stay", () => {
    const rows = out(route.normalize(["x", live({ chainIndex: "sol" }), live({ tokenAddress: "bad address" }), live({ symbol: "" }), live({ symbol: "OK" })]));
    expect(rows.map((r) => r.symbol)).toEqual(["OK"]);
  });

  test("a symbol and a name are cleaned of control characters, bidi marks and the punctuation the desk forbids", () => {
    const rows = out(route.normalize([live({ symbol: "A\u202eB\u00b7C\u2014D\n", name: "x\u2028y" })]));
    expect(rows[0]!.symbol).toBe("AB C-D");
    expect(rows[0]!.name).toBe("xy");
  });

  test("at most thirty launches, as the provider says", () => {
    const many = Array.from({ length: 45 }, (_, i) => live({ symbol: `T${i}` }));
    expect(out(route.normalize(many)).length).toBe(30);
  });
});
