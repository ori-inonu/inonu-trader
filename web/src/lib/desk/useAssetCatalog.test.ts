import { describe, expect, test } from "bun:test";
import type { DeskTicker } from "./types";
import { catalogFromTickers, fallbackCatalogRows } from "./useAssetCatalog";
import { DESK_DEFAULT_WATCHLIST } from "./types";

function ticker(instId: string, last: number, volQuote: number | null, open24h: number | null = last): DeskTicker {
  return {
    instId,
    last,
    open24h,
    high24h: null,
    low24h: null,
    volBase24h: null,
    volQuote24h: volQuote,
    bidPx: null,
    bidSz: null,
    askPx: null,
    askSz: null,
    tsMs: 1,
  };
}

describe("catalogFromTickers", () => {
  test("keeps only USDT quoted spot pairs and USDT perpetuals", () => {
    const spot = [ticker("BTC-USDT", 100, 10), ticker("BTC-USDC", 100, 99), ticker("ETH-USDT", 50, 5), ticker("X-USDT-SWAP", 1, 1)];
    const swap = [ticker("BTC-USDT-SWAP", 100, null), ticker("BTC-USD-SWAP", 1, null), ticker("ETH-USDT-SWAP", 50, null)];
    const catalog = catalogFromTickers(spot, swap);
    expect(catalog.spot.map((r) => r.instId)).toEqual(["BTC-USDT", "ETH-USDT"]);
    expect(catalog.swap.map((r) => r.instId)).toEqual(["BTC-USDT-SWAP", "ETH-USDT-SWAP"]);
  });

  test("sorts by 24h quote volume descending, unknown volume last, instId breaking ties", () => {
    const spot = [
      ticker("LOW-USDT", 1, 10),
      ticker("BIG-USDT", 1, 9_000),
      ticker("NONE-USDT", 1, null),
      ticker("MID-USDT", 1, 500),
      ticker("ANONE-USDT", 1, null),
    ];
    const catalog = catalogFromTickers(spot, []);
    expect(catalog.spot.map((r) => r.instId)).toEqual(["BIG-USDT", "MID-USDT", "LOW-USDT", "ANONE-USDT", "NONE-USDT"]);
  });

  test("the 24h change is computed against the open and stays null without it", () => {
    const catalog = catalogFromTickers([ticker("BTC-USDT", 102, 1, 100), ticker("ETH-USDT", 5, 1, null)], []);
    expect(catalog.spot[0]!.change24hPct).toBeCloseTo(2, 6);
    expect(catalog.spot[1]!.change24hPct).toBeNull();
  });

  test("status reflects whether both calls delivered", () => {
    expect(catalogFromTickers([], []).status).toBe("ready");
    expect(catalogFromTickers(null, []).status).toBe("error");
    expect(catalogFromTickers([], null).status).toBe("error");
  });
});

describe("fallbackCatalogRows", () => {
  test("is the default watchlist with every field unknown, never a zero", () => {
    const rows = fallbackCatalogRows();
    expect(rows.map((r) => r.instId)).toEqual([...DESK_DEFAULT_WATCHLIST]);
    for (const r of rows) {
      expect(r.last).toBeNull();
      expect(r.change24hPct).toBeNull();
      expect(r.volQuote24h).toBeNull();
    }
  });
});
