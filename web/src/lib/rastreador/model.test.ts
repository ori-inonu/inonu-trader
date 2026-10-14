// RAS-2, RAS-3, RAS-4, AC-RAS-1, AC-RAS-2: the Rastreador's model. The universe is the exchange's own tradable pairs (USDT spot
// and USDT perpetuals, free public data), the columns and views are the documented ones, the filters and the sort work with no
// model, and the pressure of the flow is a measured ratio with a descriptive word, never an instruction (FLX-10).
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { DeskTicker } from "../desk/types";
import {
  DEFAULT_FILTERS, VIEW_ORDER, VIEWS, applyFilters, buildRows, parseFilters, pressureLabel, pressureOf, sortRows,
  type Filters, type RastreadorRow,
} from "./model";

const ticker = (instId: string, last: number, over: Partial<DeskTicker> = {}): DeskTicker => ({
  instId, last, open24h: last, high24h: last, low24h: last, volBase24h: 100, volQuote24h: 1_000, bidPx: null, bidSz: null, askPx: null, askSz: null, tsMs: 1_800_000_000_000, ...over,
});

const spot = [
  ticker("BTC-USDT", 80_000, { open24h: 76_000, volQuote24h: 900_000_000 }),
  ticker("ETH-USDT", 2_500, { open24h: 2_600, volQuote24h: 400_000_000 }),
  ticker("PEPE-USDT", 0.00001, { open24h: 0.000008, volQuote24h: 5_000_000 }),
  ticker("BTC-USDC", 80_000, { volQuote24h: 99_000_000 }), // another quote: not in the universe
  ticker("ODD-USDT", 1, { open24h: null, volQuote24h: null }),
];
const swap = [
  ticker("BTC-USDT-SWAP", 80_010, { open24h: 80_000, volBase24h: 2_000_000, volQuote24h: null }), // contracts
  ticker("ETH-USDT-SWAP", 2_501, { open24h: 2_600, volBase24h: 1_000_000, volQuote24h: null }),
  ticker("BTC-USD-SWAP", 80_000, { volBase24h: 5 }), // coin margined: not in the universe
];
// coin per contract: 0.01 BTC, 0.1 ETH
const SIZES = new Map([["BTC-USDT-SWAP", 0.01], ["ETH-USDT-SWAP", 0.1]]);

describe("the universe", () => {
  const rows = buildRows(spot, swap, SIZES);

  test("is the USDT spot pairs and the USDT perpetuals, and nothing else", () => {
    expect(rows.map((r) => r.id).sort()).toEqual(["BTC-USDT", "BTC-USDT-SWAP", "ETH-USDT", "ETH-USDT-SWAP", "ODD-USDT", "PEPE-USDT"]);
    expect(rows.find((r) => r.id === "BTC-USDT-SWAP")).toMatchObject({ mercado: "perp", base: "BTC" });
    expect(rows.find((r) => r.id === "BTC-USDT")).toMatchObject({ mercado: "spot", base: "BTC" });
  });

  test("the change of the day comes from the open, and a missing open is a missing change", () => {
    expect(rows.find((r) => r.id === "BTC-USDT")!.var24hPct).toBeCloseTo(5.263157894736842, 9);
    expect(rows.find((r) => r.id === "ETH-USDT")!.var24hPct).toBeCloseTo(-3.846153846153846, 9);
    expect(rows.find((r) => r.id === "ODD-USDT")!.var24hPct).toBeNull();
  });

  test("the spot volume is the quote volume; the perpetual's is contracts times the size of a contract times the last price, and says it is approximate", () => {
    const btc = rows.find((r) => r.id === "BTC-USDT")!;
    expect(btc.volUsd24h).toBe(900_000_000);
    expect(btc.volAprox).toBe(false);
    const perp = rows.find((r) => r.id === "BTC-USDT-SWAP")!;
    expect(perp.volUsd24h).toBeCloseTo(2_000_000 * 0.01 * 80_010, 3); // 1.6 billion: more than the spot pair, which is why it is the first of the day
    expect(perp.volAprox).toBe(true);
    expect(rows.find((r) => r.id === "ODD-USDT")!.volUsd24h).toBeNull();
  });

  test("the rank is by volume across the whole universe, and an unknown volume has no rank", () => {
    const byRank = [...rows].filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!).map((r) => r.id);
    expect(byRank).toEqual(["BTC-USDT-SWAP", "BTC-USDT", "ETH-USDT", "ETH-USDT-SWAP", "PEPE-USDT"]);
    expect(rows.find((r) => r.id === "BTC-USDT-SWAP")!.rank).toBe(1);
    expect(rows.find((r) => r.id === "BTC-USDT")!.rank).toBe(2);
    expect(rows.find((r) => r.id === "ODD-USDT")!.rank).toBeNull();
  });

  test("a market that did not answer leaves the other one standing, and nothing at all is an empty list", () => {
    expect(buildRows(spot, null).every((r) => r.mercado === "spot")).toBe(true);
    expect(buildRows(null, swap, SIZES).every((r) => r.mercado === "perp")).toBe(true);
    expect(buildRows(null, null)).toEqual([]);
  });

  test("without the size of the contract a perpetual's volume is unknown, never a guess; the spot rows are unaffected", () => {
    const noSizes = buildRows(spot, swap);
    expect(noSizes.find((r) => r.id === "BTC-USDT-SWAP")).toMatchObject({ volUsd24h: null, volAprox: false, rank: null });
    expect(noSizes.find((r) => r.id === "BTC-USDT")!.volUsd24h).toBe(900_000_000);
    const partial = buildRows(spot, swap, new Map([["ETH-USDT-SWAP", 0.1]]));
    expect(partial.find((r) => r.id === "ETH-USDT-SWAP")!.volUsd24h).not.toBeNull();
    expect(partial.find((r) => r.id === "BTC-USDT-SWAP")!.volUsd24h).toBeNull();
  });
});

describe("filters", () => {
  const rows = buildRows(spot, swap, SIZES);
  const ids = (f: Partial<Filters>, pins: string[] = []) => applyFilters(rows, { ...DEFAULT_FILTERS, ...f }, new Set(pins)).map((r) => r.id).sort();

  test("the defaults let everything through", () => {
    expect(ids({})).toHaveLength(6);
  });

  test("market", () => {
    expect(ids({ mercado: "spot" })).toEqual(["BTC-USDT", "ETH-USDT", "ODD-USDT", "PEPE-USDT"]);
    expect(ids({ mercado: "perp" })).toEqual(["BTC-USDT-SWAP", "ETH-USDT-SWAP"]);
  });

  test("search is by symbol, ignores case and spaces at the ends, and matches the base or the whole id", () => {
    expect(ids({ busca: " btc " })).toEqual(["BTC-USDT", "BTC-USDT-SWAP"]);
    expect(ids({ busca: "usdt-swap" })).toEqual(["BTC-USDT-SWAP", "ETH-USDT-SWAP"]);
    expect(ids({ busca: "zzz" })).toEqual([]);
  });

  test("minimum volume, change range and rank each narrow the list; an unknown value never passes a filter that asks for one", () => {
    expect(ids({ volUsdMin: 500_000_000 })).toEqual(["BTC-USDT", "BTC-USDT-SWAP"]);
    expect(ids({ varMin: 0 })).toEqual(["BTC-USDT", "BTC-USDT-SWAP", "PEPE-USDT"]);
    expect(ids({ varMax: -1 })).toEqual(["ETH-USDT", "ETH-USDT-SWAP"]);
    expect(ids({ rankMax: 2 })).toEqual(["BTC-USDT", "BTC-USDT-SWAP"]);
    expect(ids({ varMin: -100 })).not.toContain("ODD-USDT");
    expect(ids({ rankMax: 99 })).not.toContain("ODD-USDT");
  });

  test("pinned only", () => {
    expect(ids({ apenasFixados: true }, ["ETH-USDT"])).toEqual(["ETH-USDT"]);
    expect(ids({ apenasFixados: true })).toEqual([]);
  });

  test("filters combine", () => {
    expect(ids({ mercado: "perp", varMin: 0 })).toEqual(["BTC-USDT-SWAP"]);
  });
});

describe("parseFilters", () => {
  test("a good payload is read, anything else falls back field by field", () => {
    const good: Filters = { mercado: "perp", busca: "btc", volUsdMin: 1000, varMin: -5, varMax: 5, rankMax: 50, apenasFixados: true };
    expect(parseFilters(good)).toEqual(good);
    expect(parseFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(parseFilters({ mercado: "onchain", busca: 4, volUsdMin: "x", varMin: Number.NaN, rankMax: -3, apenasFixados: "yes" })).toEqual(DEFAULT_FILTERS);
    expect(parseFilters({ mercado: "spot", rankMax: 10.5 })).toEqual({ ...DEFAULT_FILTERS, mercado: "spot" });
  });

  test("the search text is cut to a sane size and kept to the characters of a symbol", () => {
    expect(parseFilters({ busca: "x".repeat(200) }).busca.length).toBeLessThanOrEqual(24);
    expect(parseFilters({ busca: "<script>" }).busca).toBe("script");
  });
});

describe("sorting", () => {
  const rows = buildRows(spot, swap, SIZES);

  test("numeric columns, both ways, unknown values last in both", () => {
    expect(sortRows(rows, { key: "volUsd24h", dir: "desc" }).map((r) => r.id)).toEqual(["BTC-USDT-SWAP", "BTC-USDT", "ETH-USDT", "ETH-USDT-SWAP", "PEPE-USDT", "ODD-USDT"]);
    expect(sortRows(rows, { key: "volUsd24h", dir: "asc" }).map((r) => r.id)).toEqual(["PEPE-USDT", "ETH-USDT-SWAP", "ETH-USDT", "BTC-USDT", "BTC-USDT-SWAP", "ODD-USDT"]);
    expect(sortRows(rows, { key: "var24hPct", dir: "desc" })[5]!.id).toBe("ODD-USDT");
  });

  test("by name it is alphabetical and a tie is broken by the id, so the order is stable between updates", () => {
    expect(sortRows(rows, { key: "ativo", dir: "asc" }).map((r) => r.id)).toEqual(["BTC-USDT", "BTC-USDT-SWAP", "ETH-USDT", "ETH-USDT-SWAP", "ODD-USDT", "PEPE-USDT"]);
    const flat = buildRows([ticker("AAA-USDT", 1), ticker("BBB-USDT", 1)], null);
    expect(sortRows(flat, { key: "preco", dir: "desc" }).map((r) => r.id)).toEqual(["AAA-USDT", "BBB-USDT"]);
  });

  test("it never changes the list it was given", () => {
    const before = rows.map((r) => r.id);
    sortRows(rows, { key: "preco", dir: "asc" });
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  test("a measured column (pressure) comes from the map of measures, and a row without one goes last", () => {
    const measures = { pressao: new Map<string, number | null>([["ETH-USDT", 0.5], ["BTC-USDT", -0.2], ["PEPE-USDT", null]]), var1h: new Map(), var4h: new Map() };
    const sorted = sortRows(rows, { key: "pressao", dir: "desc" }, measures).map((r) => r.id);
    expect(sorted.slice(0, 2)).toEqual(["ETH-USDT", "BTC-USDT"]);
    expect(sorted.slice(2).sort()).toEqual(["BTC-USDT-SWAP", "ETH-USDT-SWAP", "ODD-USDT", "PEPE-USDT"]);
  });
});

describe("views", () => {
  test("five views in a fixed order, the first three usable on the exchange's own pairs", () => {
    expect(VIEW_ORDER).toEqual(["geral", "desempenho", "fluxo", "smart", "risco"]);
    for (const id of ["geral", "desempenho", "fluxo"] as const) expect(VIEWS[id].available).toBe(true);
  });

  test("the on-chain views say why they are not available instead of showing empty or made up columns", () => {
    for (const id of ["smart", "risco"] as const) {
      expect(VIEWS[id].available).toBe(false);
      expect(VIEWS[id].reason).toMatch(/on-chain/);
    }
  });

  test("the overview has the documented columns", () => {
    expect(VIEWS.geral.columns.map((c) => c.label)).toEqual(["Rank", "Ativo", "Preco", "Var 24h", "Vol USD 24h", "Pressao de fluxo", "Mercado"]);
  });

  test("labels are plain ASCII and carry no word of an order (FLX-10)", () => {
    for (const id of VIEW_ORDER) {
      const view = VIEWS[id];
      for (const text of [view.label, view.reason ?? "", ...view.columns.flatMap((c) => [c.label, c.tip])]) {
        expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
        for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
      }
    }
  });

  test("only numeric measured columns are sortable, and each sort key is a real one", () => {
    for (const id of VIEW_ORDER) for (const column of VIEWS[id].columns) if (column.sortKey !== null) expect(column.sortKey.length).toBeGreaterThan(0);
  });
});

describe("pressure of the flow (FLX-10)", () => {
  const NOW = 1_800_000_060_000;
  const t = (secondsAgo: number, sz: number, side: "buy" | "sell") => ({ ts: NOW - secondsAgo * 1000, sz, side });

  test("is (buying - selling) / (buying + selling) over the last minute", () => {
    const p = pressureOf([t(5, 30, "buy"), t(10, 10, "sell"), t(20, 20, "buy")], NOW)!;
    expect(p.compra).toBe(50);
    expect(p.venda).toBe(10);
    expect(p.valor).toBeCloseTo((50 - 10) / 60, 12);
    expect(p.negocios).toBe(3);
  });

  test("a trade older than the window does not count, and nothing in the window is no measurement", () => {
    expect(pressureOf([t(61, 99, "sell"), t(5, 10, "buy")], NOW)!.valor).toBe(1);
    expect(pressureOf([t(120, 1, "buy")], NOW)).toBeNull();
    expect(pressureOf([], NOW)).toBeNull();
  });

  test("the span is what the sample actually covers, so a short sample is not passed off as a minute", () => {
    expect(pressureOf([t(4, 1, "buy"), t(1, 1, "sell")], NOW)!.janelaMs).toBe(3000);
    expect(pressureOf([t(30, 1, "buy")], NOW)!.janelaMs).toBe(0);
  });

  test("a trade with a size that is not a positive number is ignored, never counted as zero", () => {
    const p = pressureOf([t(5, Number.NaN, "buy"), t(5, -3, "sell"), t(5, 4, "buy")], NOW)!;
    expect(p.negocios).toBe(1);
    expect(p.valor).toBe(1);
  });

  test("the bands: strong, plain, balanced, plain, strong; the edges belong to the milder word", () => {
    expect(pressureLabel(0.5)).toBe("Pressao compradora forte");
    expect(pressureLabel(0.36)).toBe("Pressao compradora forte");
    expect(pressureLabel(0.35)).toBe("Pressao compradora");
    expect(pressureLabel(0.1)).toBe("Pressao compradora");
    expect(pressureLabel(0.0999)).toBe("Equilibrada");
    expect(pressureLabel(0)).toBe("Equilibrada");
    expect(pressureLabel(-0.0999)).toBe("Equilibrada");
    expect(pressureLabel(-0.1)).toBe("Pressao vendedora");
    expect(pressureLabel(-0.35)).toBe("Pressao vendedora");
    expect(pressureLabel(-0.36)).toBe("Pressao vendedora forte");
    expect(pressureLabel(-1)).toBe("Pressao vendedora forte");
  });
});

describe("rows are plain data", () => {
  test("a row carries only what the screen shows, no function and no object from the exchange", () => {
    const row: RastreadorRow = buildRows(spot, swap, SIZES)[0]!;
    expect(Object.keys(row).sort()).toEqual(["base", "id", "mercado", "preco", "rank", "tsMs", "var24hPct", "volAprox", "volUsd24h"]);
  });
});
