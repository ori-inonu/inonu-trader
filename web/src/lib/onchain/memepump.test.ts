// RAS-2: the launches of a chain as cells and marks of care. The code DESCRIBES: a mark is a measurement in words, never a verdict. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { careMarks, CARE_LIMITS, launchGuard, launchRows, launchUsd, type Launch } from "./memepump";

const NOW = 1_800_000_000_000;
const launch = (over: Partial<Launch> = {}): Launch => ({
  chainIndex: "501", protocolId: "120596", address: "MintAddr1111111111111111111111111111111111", symbol: "SUS", name: "Susan", createdMs: NOW - 4 * 60_000, marketCapUsd: 6004.27, volume1hUsd: 8901.66,
  txCount1h: 167, buyTx1h: 97, sellTx1h: 70, bondingPct: 41.5, top10: 12.5, dev: 2, insiders: 0, bundlers: 3, snipers: 8, freshWallets: 1, phishing: 0, holders: 450, hasX: true, hasTelegram: false, hasWebsite: false,
  dexScreenerPaid: false, communityTakeover: false, liveOnPumpFun: false, aped: 3, ...over,
});

describe("the check of a row of the gateway", () => {
  test("a row of the route's own shape passes whole", () => {
    expect(launchGuard(launch() as unknown as Record<string, unknown>)).not.toBeNull();
  });

  test("a row that is not exactly that shape is nothing: a missing chain, address or symbol, a number that is text, a flag that is a number", () => {
    const bad = (over: Record<string, unknown>) => launchGuard({ ...launch(), ...over } as Record<string, unknown>);
    for (const over of [{ chainIndex: "sol" }, { address: "" }, { symbol: "" }, { marketCapUsd: "6004" }, { dev: undefined }, { hasX: 1 }, { holders: Number.NaN }, { name: 5 }]) expect(bad(over)).toBeNull();
  });
});

describe("the marks of care", () => {
  test("a launch with nothing to flag has no mark", () => {
    expect(careMarks(launch())).toEqual([]);
  });

  test("each mark says who or what, with the number, and only at the limit named in this file", () => {
    expect(careMarks(launch({ dev: CARE_LIMITS.dev }))).toEqual(["o dev tem 10% da oferta"]);
    expect(careMarks(launch({ dev: CARE_LIMITS.dev - 0.1 }))).toEqual([]);
    expect(careMarks(launch({ top10: 61.3 }))).toEqual(["as 10 maiores carteiras tem 61,3%"]);
    expect(careMarks(launch({ snipers: 53.2, bundlers: 17.8 }))).toEqual(["snipers com 53,2%"]);
    expect(careMarks(launch({ bundlers: 20 }))).toEqual(["bundlers com 20%"]);
    expect(careMarks(launch({ phishing: 0.5 }))).toEqual(["0,5% das carteiras sao suspeitas de phishing"]);
    expect(careMarks(launch({ holders: 1 }))).toEqual(["so 1 detentor"]);
    expect(careMarks(launch({ holders: 12 }))).toEqual(["so 12 detentores"]);
    expect(careMarks(launch({ hasX: false, hasTelegram: false, hasWebsite: false }))).toEqual(["sem rede social nem site"]);
  });

  test("what the provider did not give is no mark: unknown is not a flaw", () => {
    expect(careMarks(launch({ dev: null, top10: null, snipers: null, bundlers: null, insiders: null, freshWallets: null, phishing: null, holders: null, hasX: null, hasTelegram: null, hasWebsite: null }))).toEqual([]);
    // one link known to be there is enough: only all three known to be absent is a mark
    expect(careMarks(launch({ hasX: false, hasTelegram: null, hasWebsite: false }))).toEqual([]);
  });

  test("the marks come in the order a person weighs them: phishing, then who holds it, then the links", () => {
    const marks = careMarks(launch({ phishing: 1, dev: 30, top10: 70, snipers: 40, holders: 5, hasX: false, hasTelegram: false, hasWebsite: false }));
    expect(marks.map((m) => m.split(" ")[0])).toEqual(["1%", "o", "as", "snipers", "so", "sem"]);
  });

  test("a mark never tells what to do", () => {
    const text = careMarks(launch({ phishing: 1, dev: 30, top10: 70, insiders: 40, bundlers: 40, snipers: 40, freshWallets: 40, holders: 5, hasX: false, hasTelegram: false, hasWebsite: false })).join(" ");
    expect(text).not.toMatch(/[^\x20-\x7e]/);
    expect(text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|evite|fuja|golpe|seguro|perigo|sinal|recomend)\b/);
  });
});

describe("the rows", () => {
  const set = [launch({ symbol: "A", volume1hUsd: 100, buyTx1h: 5, createdMs: NOW - 10 * 60_000 }), launch({ symbol: "B", volume1hUsd: 900, buyTx1h: 1, createdMs: NOW - 60_000 }), launch({ symbol: "C", volume1hUsd: null, buyTx1h: null, createdMs: null, address: "c".repeat(40) })];

  test("sorted as the person chose; one with no value for the order goes last, it is not worth zero", () => {
    expect(launchRows(set, NOW, "volume").rows.map((r) => r.symbol)).toEqual(["B", "A", "C"]);
    expect(launchRows(set, NOW, "compras").rows.map((r) => r.symbol)).toEqual(["A", "B", "C"]);
    expect(launchRows(set, NOW, "novos").rows.map((r) => r.symbol)).toEqual(["B", "A", "C"]);
  });

  test("at most the number asked for, and the total there was", () => {
    const many = Array.from({ length: 30 }, (_, i) => launch({ symbol: `T${i}`, address: `m${i}${"x".repeat(30)}`, volume1hUsd: i }));
    const r = launchRows(many, NOW, "volume", 12);
    expect(r.rows.length).toBe(12);
    expect(r.total).toBe(30);
    expect(r.rows[0]!.symbol).toBe("T29");
    expect(launchRows([], NOW, "volume")).toEqual({ rows: [], total: 0 });
  });

  test("the cells: age, market cap, volume, buys and sells of the hour, the curve and the holders; an unknown one is a dash", () => {
    const [a, , c] = launchRows(set, NOW, "novos").rows.filter((r) => ["A", "B", "C"].includes(r.symbol)).sort((x, y) => x.symbol.localeCompare(y.symbol));
    expect(a).toMatchObject({ symbol: "A", age: "ha 10 min", marketCap: "US$ 6.004", volume: "US$ 100", trades: "5 compras, 70 vendas", curve: "41,5%", holders: "450" });
    expect(c).toMatchObject({ age: "-", volume: "-", trades: "- compras, 70 vendas" });
    expect(launchRows([launch({ buyTx1h: null, sellTx1h: null, bondingPct: null, holders: null, marketCapUsd: null })], NOW, "volume").rows[0]).toMatchObject({ trades: "-", curve: "-", holders: "-", marketCap: "-" });
  });

  test("a launch created in the future of this clock is new, not negative", () => {
    expect(launchRows([launch({ createdMs: NOW + 5_000 })], NOW, "novos").rows[0]!.age).toBe("agora");
  });

  test("an amount of dollars: millions with the word, thousands whole, small ones with two decimals, unknown a dash", () => {
    expect(launchUsd(2_500_000)).toBe("US$ 2,5 mi");
    expect(launchUsd(12_345)).toBe("US$ 12.345");
    expect(launchUsd(12.3456)).toBe("US$ 12,35");
    expect(launchUsd(null)).toBe("-");
  });
});
