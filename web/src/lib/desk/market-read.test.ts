// MKT: what the raw market (tape, book, liquidity) means for a person who has to decide: what it COSTS to move a given amount through the book right now, how thick the market is, where the
// big queues wait, and whether the cost the Inonu counted in its plan holds. Measurements only: no word of an order. origin: synthetic_fixture, tests only (hand computable books).
import { describe, expect, test } from "bun:test";
import type { DeskBook, DeskBookLevel } from "./types";
import { bookCost, bpsText, costUsdText, marketRead, REFERENCE_SIZES_USD, usdShort, type MarketRead } from "./market-read";

const lvl = (px: number, sz: number): DeskBookLevel => ({ px, sz, orders: 0 });
const BOOK: DeskBook = {
  instId: "BTC-USDT",
  asks: [lvl(100.1, 5), lvl(100.2, 10), lvl(100.5, 100)],
  bids: [lvl(100.0, 5), lvl(99.9, 10), lvl(99.5, 100)],
  tsMs: 1_000_000, seqId: null, checksumOk: null,
};
const NOW = 1_003_000;
const read = (over: Partial<Parameters<typeof marketRead>[0]> = {}): MarketRead => marketRead({ book: BOOK, quoteMultiplier: 1, nowMs: NOW, stale: false, plan: null, ...over });
/** A reading that has to be a real one: anything else is a failure of the test, with the reason. */
const ok = (over: Partial<Parameters<typeof marketRead>[0]> = {}): Extract<MarketRead, { state: "ok" }> => {
  const r = read(over);
  if (r.state !== "ok") throw new Error(`no reading: ${r.reason}`);
  return r;
};

describe("the cost of moving an amount through the book", () => {
  test("an amount that fits in the first level pays the half spread on each side", () => {
    const c = bookCost(BOOK, 400);
    expect(c.buyBps).toBeCloseTo(4.9975, 3);
    expect(c.sellBps).toBeCloseTo(4.9975, 3);
    expect(c.roundTripBps).toBeCloseTo(9.995, 3);
  });

  test("a bigger amount walks into the next level and the average price moves away from the middle", () => {
    const c = bookCost(BOOK, 1000);
    // 500,50 at 100,10 and the rest at 100,20: average 100,1499
    expect(c.buyBps).toBeCloseTo(((1000 / (5 + 499.5 / 100.2) - 100.05) / 100.05) * 1e4, 6);
    expect(c.sellBps!).toBeGreaterThan(bookCost(BOOK, 400).sellBps!);
    expect(c.roundTripBps).toBeCloseTo(c.buyBps! + c.sellBps!, 9);
  });

  test("an amount the known book does not hold is not guessed: null, never an extrapolation", () => {
    const c = bookCost(BOOK, 1_000_000);
    expect(c).toMatchObject({ buyBps: null, sellBps: null, roundTripBps: null });
    // one side short is still a null round trip
    const oneSide: DeskBook = { ...BOOK, bids: [lvl(100.0, 1)] };
    const d = bookCost(oneSide, 400);
    expect(d.buyBps).not.toBeNull();
    expect(d.sellBps).toBeNull();
    expect(d.roundTripBps).toBeNull();
  });

  test("a crossed or empty book has no cost", () => {
    expect(bookCost({ ...BOOK, bids: [] }, 100).roundTripBps).toBeNull();
    expect(bookCost({ ...BOOK, asks: [lvl(99, 5)], bids: [lvl(100, 5)] }, 100).roundTripBps).toBeNull();
    expect(bookCost(BOOK, 0).roundTripBps).toBeNull();
    expect(bookCost(BOOK, Number.NaN).roundTripBps).toBeNull();
  });
});

describe("the reading", () => {
  test("three reference amounts, each with its cost on each side and for the round trip", () => {
    const r = ok();
    expect(r.state).toBe("ok");
    expect(r.rows.map((x) => x.sizeUsd)).toEqual([...REFERENCE_SIZES_USD]);
    expect(r.rows[0]).toMatchObject({ sizeUsd: 100 });
    expect(r.rows[0]!.roundTripBps).toBeCloseTo(9.995, 3);
    // the largest amount is more than the book holds on one of the sides near the middle: it still has an answer when the levels reach it, and null when they do not
    expect(r.rows[2]!.roundTripBps === null || r.rows[2]!.roundTripBps > r.rows[1]!.roundTripBps!).toBe(true);
  });

  test("how thick the market is, in a word, from the round trip of one thousand dollars", () => {
    expect(ok().thickness).toBe("normal");
    const thin = ok({ book: { ...BOOK, asks: [lvl(100.5, 500)], bids: [lvl(99.5, 500)] } });
    expect(thin.thickness).toBe("raso");
    const deep = ok({ book: { ...BOOK, asks: [lvl(100.01, 1000)], bids: [lvl(100.0, 1000)] } });
    expect(deep.thickness).toBe("fluido");
  });

  test("the big queues: the largest wait on each side near the price, only when it stands out from the rest of the levels", () => {
    const r = ok();
    expect(r.walls.map((w) => w.side)).toEqual(["compradores", "vendedores"]);
    const sellers = r.walls.find((w) => w.side === "vendedores")!;
    expect(sellers.px).toBe(100.5);
    expect(sellers.valueUsd).toBeCloseTo(10050, 6);
    expect(sellers.distanceBps).toBeCloseTo(((100.5 - 100.05) / 100.05) * 1e4, 4);
    const even = ok({ book: { ...BOOK, asks: [lvl(100.1, 10), lvl(100.2, 10), lvl(100.3, 10)], bids: [lvl(100.0, 10), lvl(99.9, 10), lvl(99.8, 10)] } });
    expect(even.walls).toEqual([]);
    // a queue farther than one percent from the price is not near
    const far = ok({ book: { ...BOOK, asks: [lvl(100.1, 5), lvl(100.2, 10), lvl(110, 1000)], bids: [lvl(100.0, 5), lvl(99.9, 10), lvl(90, 1000)] } });
    expect(far.walls).toEqual([]);
  });

  test("the plan of the Inonu: its total cost next to what the book alone costs now for the same amount, and which is larger", () => {
    const smaller = ok({ plan: { custoBps: 24, notionalUsd: 400 } });
    expect(smaller.vsPlan).toMatchObject({ assumedBps: 24, sizeUsd: 400, kind: "menor" });
    expect(smaller.vsPlan!.measuredBps).toBeCloseTo(9.995, 3);
    const larger = ok({ plan: { custoBps: 5, notionalUsd: 400 } });
    expect(larger.vsPlan!.kind).toBe("maior");
    const alike = ok({ plan: { custoBps: 10, notionalUsd: 400 } });
    expect(alike.vsPlan!.kind).toBe("parecido");
    // a plan with no size, or a size the book does not hold, has nothing to compare
    expect(ok({ plan: { custoBps: 24, notionalUsd: null } }).vsPlan).toBeNull();
    expect(ok({ plan: { custoBps: 24, notionalUsd: 5_000_000 } }).vsPlan).toBeNull();
    expect(ok().vsPlan).toBeNull();
  });

  test("no book, a swap whose size is in contracts, a stale book and a book of another age are not read, and say why", () => {
    expect(read({ book: null })).toMatchObject({ state: "sem_leitura", reason: "O livro ainda nao chegou." });
    expect(read({ quoteMultiplier: null })).toMatchObject({ state: "sem_leitura", reason: expect.stringContaining("contratos") });
    expect(read({ stale: true })).toMatchObject({ state: "sem_leitura", reason: "A conexao com a exchange esta atrasada: sem leitura atual." });
    expect(read({ nowMs: BOOK.tsMs + 60_000 })).toMatchObject({ state: "sem_leitura", reason: expect.stringContaining("antigo") });
  });
});

describe("the words", () => {
  test("a cost in basis points as a percentage, with a floor so a real cost is never written as zero", () => {
    expect(bpsText(9.995)).toBe("0,10%");
    expect(bpsText(24)).toBe("0,24%");
    expect(bpsText(100)).toBe("1,00%");
    expect(bpsText(0.4)).toBe("menos de 0,01%");
    expect(bpsText(0)).toBe("0,00%");
    expect(bpsText(null)).toBe("-");
  });

  test("a cost in dollars for an amount, and under one cent it is said so", () => {
    expect(costUsdText(1000, 20)).toBe("US$ 2,00");
    expect(costUsdText(10_000, 9.995)).toBe("US$ 10,00");
    expect(costUsdText(100, 0.0125)).toBe("menos de US$ 0,01");
    expect(costUsdText(1000, 0)).toBe("US$ 0,00");
    expect(costUsdText(1000, null)).toBe("-");
  });

  test("an amount of dollars as a short phrase", () => {
    expect(usdShort(100)).toBe("US$ 100");
    expect(usdShort(1000)).toBe("US$ 1.000");
    expect(usdShort(250_000)).toBe("US$ 250 mil");
    expect(usdShort(1_800_000)).toBe("US$ 1,8 milhao");
    expect(usdShort(12_500_000)).toBe("US$ 12,5 milhoes");
  });

  test("every sentence of the reading is plain ASCII, with no order word, no middle dot and no dash", () => {
    const r = ok({ plan: { custoBps: 24, notionalUsd: 400 } });
    const all = [r.note, ...(r.vsPlan === null ? [] : [r.vsPlan.text]), ...r.walls.map((w) => w.text), r.thicknessText].join(" ");
    expect(all).not.toMatch(/[^\x20-\x7e]/);
    expect(all.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|recomend|deve|aconselh)\b/);
  });
});
