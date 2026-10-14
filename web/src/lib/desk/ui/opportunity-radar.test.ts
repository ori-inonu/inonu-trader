import { describe, expect, test } from "bun:test";
import type { AssetCatalogRow } from "../useAssetCatalog";
import { MAX_ROWS_PER_TAB } from "../../mesa/panels-registry";
import { RADAR_LENSES, RADAR_MIN_QUOTE_VOLUME, RADAR_ROWS_MAX, STABLE_BASES, radarEligible, radarRows } from "./opportunity-radar";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const row = (instId: string, last: number | null, change24hPct: number | null, volQuote24h: number | null): AssetCatalogRow => ({ instId, last, change24hPct, volQuote24h });

const CATALOG: readonly AssetCatalogRow[] = [
  row("BTC-USDT", 83_200.5, 0.8, 530_000_000),
  row("ETH-USDT", 2_510.9, -0.3, 210_000_000),
  row("SOL-USDT", 107.8, 4.2, 90_000_000),
  row("DOGE-USDT", 0.1721, 7.9, 40_000_000),
  row("PEPE-USDT", 0.00001234, -6.1, 12_000_000),
  row("TINY-USDT", 0.5, 55, 40_000),
  row("USDC-USDT", 1.0001, 0.01, 800_000_000),
  row("XRP-USDT", 2.31, null, 60_000_000),
  row("ADA-USDT", null, 3, 30_000_000),
  row("LINK-USDT", 14.2, 1.4, null),
];

describe("what the radar admits", () => {
  test("a pair needs a known price, a known change and enough 24h volume to be tradeable, and may not be a pair between stable coins", () => {
    expect(radarEligible(row("SOL-USDT", 107.8, 4.2, 90_000_000))).toBe(true);
    expect(radarEligible(row("TINY-USDT", 0.5, 55, RADAR_MIN_QUOTE_VOLUME - 1))).toBe(false);
    expect(radarEligible(row("TINY-USDT", 0.5, 55, RADAR_MIN_QUOTE_VOLUME))).toBe(true);
    expect(radarEligible(row("USDC-USDT", 1, 0.01, 800_000_000))).toBe(false);
    expect(radarEligible(row("XRP-USDT", 2.31, null, 60_000_000))).toBe(false);
    expect(radarEligible(row("ADA-USDT", null, 3, 30_000_000))).toBe(false);
    expect(radarEligible(row("LINK-USDT", 14.2, 1.4, null))).toBe(false);
    expect(radarEligible(row("BAD-USDT", Number.NaN, 1, 5_000_000))).toBe(false);
    expect(radarEligible(row("BAD-USDT", 0, 1, 5_000_000))).toBe(false);
  });

  test("the stable coins are named, and a normal asset is not among them", () => {
    for (const base of ["USDC", "DAI", "FDUSD", "TUSD", "PYUSD"]) expect(STABLE_BASES.has(base)).toBe(true);
    expect(STABLE_BASES.has("BTC")).toBe(false);
  });
});

describe("the three lenses", () => {
  test("volume: the most traded first, by quote volume", () => {
    const rows = radarRows(CATALOG, "volume");
    expect(rows.map((r) => r.instId)).toEqual(["BTC-USDT", "ETH-USDT", "SOL-USDT", "DOGE-USDT", "PEPE-USDT"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test("altas: only pairs that went up, the biggest rise first, and an illiquid pair that rose 55% is not offered", () => {
    const rows = radarRows(CATALOG, "altas");
    expect(rows.map((r) => r.instId)).toEqual(["DOGE-USDT", "SOL-USDT", "BTC-USDT"]);
    expect(rows.every((r) => r.change.tone === "up")).toBe(true);
    expect(rows.map((r) => r.instId)).not.toContain("TINY-USDT");
  });

  test("quedas: only pairs that went down, the deepest fall first", () => {
    const rows = radarRows(CATALOG, "quedas");
    expect(rows.map((r) => r.instId)).toEqual(["PEPE-USDT", "ETH-USDT"]);
    expect(rows.every((r) => r.change.tone === "down")).toBe(true);
  });

  test("a lens with nothing to show returns no rows, not filler", () => {
    expect(radarRows([row("BTC-USDT", 83_000, 1, 500_000_000)], "quedas")).toEqual([]);
    expect(radarRows([], "volume")).toEqual([]);
  });

  test("the lenses are the three, with a label and a hint that says what is measured", () => {
    expect(RADAR_LENSES.map((l) => l.id)).toEqual(["volume", "altas", "quedas"]);
    for (const lens of RADAR_LENSES) {
      expect(lens.label.length).toBeGreaterThan(0);
      expect(lens.hint).toMatch(/24 h/);
    }
  });
});

describe("a row of the radar", () => {
  test("shows the symbol, the price at its magnitude, the signed change and the volume against the largest on the list", () => {
    const rows = radarRows(CATALOG, "volume");
    const btc = rows[0]!;
    expect(btc.symbol).toBe("BTC");
    expect(btc.price).toBe("83.201");
    expect(btc.change).toEqual({ text: "+0,80%", tone: "up" });
    expect(btc.volume).toBe("530 mi");
    expect(btc.volRatio).toBe(1);
    const eth = rows[1]!;
    expect(eth.volRatio).toBeCloseTo(210 / 530, 6);
    const pepe = rows.find((r) => r.symbol === "PEPE")!;
    expect(pepe.price).toBe("0,00001234");
    expect(pepe.change).toEqual({ text: "-6,10%", tone: "down" });
  });

  test("never prints NaN, undefined, infinity, a middle dot or a dash for a missing value", () => {
    for (const lens of ["volume", "altas", "quedas"] as const) {
      for (const r of radarRows(CATALOG, lens)) {
        for (const text of [r.symbol, r.price, r.change.text, r.volume]) {
          expect(text).not.toMatch(FORBIDDEN);
          expect(text).not.toMatch(/NaN|undefined|Infinity/);
        }
      }
    }
  });
});

describe("how many rows", () => {
  const many = Array.from({ length: 30 }, (_, i) => row(`C${i}-USDT`, 10 + i, 1 + i / 10, 2_000_000 + i * 1_000_000));

  test("no more than the budget of a tab of the dock, whatever the list holds", () => {
    expect(RADAR_ROWS_MAX).toBeLessThanOrEqual(MAX_ROWS_PER_TAB);
    expect(radarRows(many, "volume")).toHaveLength(RADAR_ROWS_MAX);
    expect(radarRows(many, "volume", 3)).toHaveLength(3);
  });

  test("ties break by name, so the same list always reads in the same order", () => {
    const tied = [row("B-USDT", 1, 2, 5_000_000), row("A-USDT", 1, 2, 5_000_000), row("C-USDT", 1, 2, 5_000_000)];
    expect(radarRows(tied, "volume").map((r) => r.instId)).toEqual(["A-USDT", "B-USDT", "C-USDT"]);
    expect(radarRows(tied, "altas").map((r) => r.instId)).toEqual(["A-USDT", "B-USDT", "C-USDT"]);
  });

  test("the input is not changed", () => {
    const copy = [...CATALOG];
    radarRows(CATALOG, "altas");
    expect(CATALOG).toEqual(copy);
  });
});
